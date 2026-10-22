import * as THREE from 'three';
import { animateCharacter, createCharacter, mergeCharacter, type Character } from './characters';
import { COFFEE_ROUTE, CUP_SPOTS, type CoffeeRunEvent, type CoffeeRunModel } from './coffeeRun';
import { applyPose } from './crew';
import type { DrivingView } from './driving';
import { disposeObject3D } from './resources';
import { poseSeated, seatRootPosition, type SeatTargetPoints } from './seating';
import { createCar } from './story';
import { createSedanInterior } from './vehicleInterior';
import { createSuspension, followWheels, readContract, settleSuspension, type SeatName, type VehicleContract, type WheelRig } from './vehicleRig';
import { RESIDENT_SPECS, SKANKY_SPEC, TERMITE_SPEC } from './world';

/**
 * The Timmies run on screen (`coffeeRun.ts` keeps its rules). It borrows the drive's city and Skanky's car with its
 * roof cut away: Termite at the wheel, Skanky in the passenger seat holding two trays of coffees, Brian and Doris in
 * the back, and boxes of donuts all over the car. The camera rides above the car's rear quarter, looking in.
 */

/** Everything of the car above this height (world metres) is cut away, so the camera sees in: the roof and pillars, not the riders. */
const ROOF_CUT = 1.36;
/** The trays' pivot, in the car's frame (its nose +x, the passenger's side +z): in front of Skanky's lap. */
const TRAYS_AT = new THREE.Vector3(0.2, 0.9, 0.38);
/** How far a full tilt turns the trays, in radians. */
const TRAY_TILT = 0.22;
/** The camera, in the car's frame: above the right rear quarter, looking in at Skanky and on up the road. */
const CAMERA_AT = new THREE.Vector3(-1.45, 3.45, 1.75);
const LOOK_AT = new THREE.Vector3(0.3, 0.75, 0.22);
const RIDERS: { spec: typeof SKANKY_SPEC; seat: SeatName }[] = [
  { spec: TERMITE_SPEC, seat: 'driver' },
  { spec: SKANKY_SPEC, seat: 'passenger' },
  { spec: RESIDENT_SPECS.brian, seat: 'rearL' },
  { spec: RESIDENT_SPECS.doris, seat: 'rearR' },
];
/** Donut boxes all over the car (its frame): the dash, the console, the back seat, the riders' laps, the footwell. */
const BOXES: { at: [number, number, number]; turn: number; open: boolean; tilt?: number }[] = [
  { at: [0.7, 0.988, 0.32], turn: 0.15, open: false },
  { at: [0.7, 1.063, 0.3], turn: -0.12, open: false },
  { at: [0.69, 0.988, 0.0], turn: 0.05, open: false },
  { at: [-0.12, 0.6, 0.0], turn: 0, open: false },
  { at: [-0.98, 0.638, 0.0], turn: 0.2, open: true },
  { at: [-0.72, 0.8, -0.34], turn: -0.1, open: true },
  { at: [-0.72, 0.8, 0.34], turn: 0.08, open: false },
  { at: [-0.5, 0.49, -0.32], turn: 0.4, open: false, tilt: 0.12 },
];
const DONUTS = [0xc58c4a, 0x5a3220, 0xe8a0b8, 0xd9b27a, 0x8a5a32, 0xf1d9a8];

const cardboard = new THREE.MeshStandardMaterial({ color: 0xc99b67, roughness: 0.9 });
const band = new THREE.MeshStandardMaterial({ color: 0xa3232a, roughness: 0.75 });
const cupPaper = new THREE.MeshStandardMaterial({ color: 0xf2ece2, roughness: 0.7 });
const lidPlastic = new THREE.MeshStandardMaterial({ color: 0xe6ddcb, roughness: 0.5 });
const coffee = new THREE.MeshStandardMaterial({ color: 0x4a2a14, roughness: 0.25 });
const pulp = new THREE.MeshStandardMaterial({ color: 0x9a8a72, roughness: 0.95 });
const drip = new THREE.MeshBasicMaterial({ color: 0x5b3416 });
const DROP = new THREE.SphereGeometry(0.012, 6, 4);
const asphalt = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 1 });
const bumpPaint = new THREE.MeshStandardMaterial({ color: 0xd8b13a, roughness: 0.7 });

function donutBox(open: boolean): THREE.Group {
  const box = new THREE.Group();
  box.name = 'donut-box';
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.075, 0.25), cardboard);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.274, 0.02, 0.254), band);
  box.add(base, stripe);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.006, 0.25), cardboard);
  if (open) {
    // Hinged at the back edge and thrown open, the donuts in two rows of three.
    lid.geometry.translate(0.135, 0, 0);
    lid.position.set(-0.135, 0.04, 0);
    lid.rotation.z = 1.9;
    DONUTS.forEach((color, i) => {
      const donut = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.014, 6, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
      donut.rotation.x = Math.PI / 2;
      donut.position.set(-0.08 + (i % 3) * 0.08, 0.045, i < 3 ? -0.055 : 0.055);
      box.add(donut);
    });
  } else lid.position.y = 0.04;
  box.add(lid);
  return box;
}

interface Cup { root: THREE.Group; lid: THREE.Mesh; spilled: boolean; lidVelocity: THREE.Vector3 | null }

export class CoffeeRunScene {
  /** The riders, made once and kept: their figures (and imported models) are reused on every run. */
  private readonly riders: { character: Character; seat: SeatName }[] = [];
  /** Everything riding in the car (trays and boxes), under its sprung body. */
  private readonly props = new THREE.Group();
  /** What stands on the route: the potholes, the speed bump, the double-parked car. */
  private readonly road = new THREE.Group();
  private readonly trays = new THREE.Group();
  private readonly cups: Cup[] = [];
  private readonly handles: { left: THREE.Object3D; right: THREE.Object3D };
  private readonly drops: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[] = [];
  /** A contract from the generated interior for the car's procedural stand-in, until the imported sedan (with its own) loads. */
  private readonly fallback: THREE.Group;
  private readonly fallbackContract: VehicleContract;
  private readonly springs = createSuspension();
  private readonly cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), ROOF_CUT);
  private readonly clipped = new Set<THREE.Material>();
  private clippedFor: unknown = null;
  private dripMs = 0;
  private jolt = 0;
  private readonly point = new THREE.Vector3();

  private readonly view: DrivingView;

  constructor(view: DrivingView) {
    this.view = view;
    for (const { spec, seat } of RIDERS) {
      const character = createCharacter(spec);
      mergeCharacter(character);
      character.root.userData.keep = true;
      character.root.visible = false;
      character.nameTag.visible = false;
      view.scene.add(character.root);
      this.riders.push({ character, seat });
    }
    this.props.name = 'coffee-run-props';
    this.trays.name = 'coffee-trays';
    this.trays.position.copy(TRAYS_AT);
    for (const right of [CUP_SPOTS[0].right + 0.055, CUP_SPOTS[4].right + 0.055]) {
      const carrier = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.02, 0.21), pulp);
      carrier.position.set(0, -0.01, right);
      this.trays.add(carrier);
    }
    for (const spot of CUP_SPOTS) {
      const root = new THREE.Group();
      root.name = 'coffee-cup';
      root.position.set(spot.forward, 0.06, spot.right);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.12, 14), cupPaper);
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0375, 0.0345, 0.03, 14), band);
      stripe.position.y = 0.005;
      const surface = new THREE.Mesh(new THREE.CircleGeometry(0.036, 14), coffee);
      surface.rotation.x = -Math.PI / 2;
      surface.position.y = 0.052;
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.014, 14), lidPlastic);
      lid.position.y = 0.066;
      root.add(body, stripe, surface, lid);
      this.trays.add(root);
      this.cups.push({ root, lid, spilled: false, lidVelocity: null });
    }
    // Skanky's hands hold each tray by its outer edge: the left (the figure's own, the door side) and the right.
    const left = new THREE.Object3D(), right = new THREE.Object3D();
    left.position.set(-0.02, -0.03, CUP_SPOTS[0].right + 0.055 + 0.115);
    right.position.set(-0.02, -0.03, CUP_SPOTS[4].right + 0.055 - 0.115);
    this.trays.add(left, right);
    this.handles = { left, right };
    this.props.add(this.trays);
    for (const { at, turn, open, tilt } of BOXES) {
      const box = donutBox(open);
      box.position.set(...at);
      box.rotation.set(tilt ?? 0, turn, 0);
      this.props.add(box);
    }
    this.fallback = createSedanInterior();
    this.fallback.name = 'coffee-run-seats';
    this.fallback.traverse((object) => { if ((object as THREE.Mesh).isMesh) object.visible = false; });
    this.fallbackContract = readContract(this.fallback);
    this.road.name = 'coffee-run-road';
    for (const landmark of COFFEE_ROUTE.landmarks) {
      let mark: THREE.Object3D;
      if (landmark.kind === 'parked-car') {
        mark = createCar(0x467b91);
      } else if (landmark.kind === 'speed-bump') {
        mark = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 6.4), bumpPaint);
        mark.position.y = 0.04;
      } else {
        mark = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14), asphalt);
        mark.rotation.x = -Math.PI / 2;
        mark.position.y = 0.012;
      }
      const holder = new THREE.Group();
      holder.position.set(landmark.x, 0, landmark.z);
      holder.rotation.y = landmark.heading;
      holder.add(mark);
      this.road.add(holder);
    }
  }

  private get car(): THREE.Group { return this.view.car; }
  private get contract(): VehicleContract { return (this.car.userData.contract as VehicleContract | undefined) ?? this.fallbackContract; }

  public begin(): void {
    this.view.setRide(true);
    this.car.add(this.fallback);
    this.view.scene.add(this.road);
    for (const { character } of this.riders) character.root.visible = true;
    for (const cup of this.cups) {
      cup.spilled = false; cup.lidVelocity = null;
      cup.root.rotation.set(0, 0, 0);
      cup.lid.position.set(0, 0.066, 0); cup.lid.rotation.set(0, 0, 0); cup.lid.visible = true;
    }
    this.clearDrops();
    this.springs.lastSpeed = null;
    this.clippedFor = null;
  }

  public end(): void {
    this.props.removeFromParent();
    this.fallback.removeFromParent();
    this.road.removeFromParent();
    for (const { character } of this.riders) character.root.visible = false;
    for (const material of this.clipped) { material.clippingPlanes = null; material.needsUpdate = true; }
    this.clipped.clear();
    this.clearDrops();
    this.view.setRide(false);
  }

  /** The riders, for checks: who sits where, and Skanky's wrists against the trays. */
  public report(): { seats: Record<string, SeatName>; handGap: number; boxes: number; cups: number } {
    const seats: Record<string, SeatName> = {};
    this.riders.forEach(({ seat }, index) => { seats[RIDERS[index].spec.name] = seat; });
    const skanky = this.riders[1].character;
    const gap = Math.max(
      skanky.leftHand.getWorldPosition(new THREE.Vector3()).distanceTo(this.handles.left.getWorldPosition(new THREE.Vector3())),
      skanky.rightHand.getWorldPosition(new THREE.Vector3()).distanceTo(this.handles.right.getWorldPosition(new THREE.Vector3())));
    let boxes = 0;
    this.props.traverse((object) => { if (object.name === 'donut-box') boxes += 1; });
    return { seats, handGap: gap, boxes, cups: this.cups.filter((cup) => !cup.spilled).length };
  }

  public update(model: CoffeeRunModel, events: readonly CoffeeRunEvent[], dt: number, reducedMotion: boolean): void {
    const car = this.car;
    car.visible = true;
    car.position.set(model.x, 0, model.z);
    car.rotation.y = model.heading;
    if (car.userData.wheels) followWheels(car.userData.wheels as WheelRig, car, dt);
    // The props ride on the sprung body once the imported sedan has one; its materials are cut once it has loaded.
    const body = (car.userData.contract as VehicleContract | undefined)?.suspension ?? car;
    // (The sedan hides the car's older children as it arrives, the props among them when they came first.)
    if (this.props.parent !== body || !this.props.visible) { body.add(this.props); this.props.visible = true; }
    if (this.clippedFor !== car.userData.contract) this.cutRoof();
    for (const event of events) {
      if (event.type === 'bump') this.jolt += event.strength * 0.25;
      else if (event.type === 'spill') this.spill(event.cup, model);
    }
    // The body leans on its springs: the model's own turn (its acceleration over speed squared) stands in for the steer.
    const steer = model.speed > 1 ? Math.atan(2.7 * model.acceleration.right / (model.speed * model.speed)) : 0;
    settleSuspension(this.springs, body === car ? null : body, dt, { speed: model.speed, steer, jolt: reducedMotion ? 0 : this.jolt });
    this.jolt = 0;
    // The trays follow the controls; a cup at risk rattles in its carrier.
    this.trays.rotation.set(TRAY_TILT * model.tilt.right, 0, -TRAY_TILT * model.tilt.forward);
    const rattle = model.danger && !reducedMotion;
    this.cups.forEach((cup, index) => {
      if (cup.spilled) {
        if (cup.lidVelocity && cup.lid.visible) {
          cup.lidVelocity.y -= 9.8 * dt;
          cup.lid.position.addScaledVector(cup.lidVelocity, dt);
          cup.lid.rotation.x += dt * 9;
          if (cup.lid.position.y < -0.5) cup.lid.visible = false;
        }
        return;
      }
      cup.root.rotation.set(rattle ? Math.sin(model.elapsedMs / 23 + index) * 0.08 : 0, 0, rattle ? Math.cos(model.elapsedMs / 29 + index) * 0.08 : 0);
    });
    // At the rim, coffee drips from a cup on that side.
    this.dripMs -= dt * 1000;
    if (model.danger && this.dripMs <= 0) {
      this.dripMs = 120;
      const cup = this.cups.find((item, index) => !item.spilled && CUP_SPOTS[index].forward * model.slosh.forward + CUP_SPOTS[index].right * model.slosh.right > 0);
      if (cup) this.splash(cup, model, 1, 0.6);
    }
    this.updateDrops(dt);
    this.seatRiders(model, dt, reducedMotion);
    // The camera rides with the car: the trays stay steady in view while the street goes by.
    car.updateMatrixWorld(true);
    this.view.camera.position.copy(car.localToWorld(this.point.copy(CAMERA_AT)));
    this.view.camera.lookAt(car.localToWorld(this.point.copy(LOOK_AT)));
    this.view.followScenery(model, model.elapsedMs / 1000, dt, { [COFFEE_ROUTE.signal]: model.released ? 'green' : 'red' });
  }

  /** Cuts the roof and pillars off the car's own materials (never the riders' or the props'). */
  private cutRoof(): void {
    this.clippedFor = this.car.userData.contract;
    this.car.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (let parent: THREE.Object3D | null = mesh; parent; parent = parent.parent) if (parent === this.props || parent === this.fallback) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (this.clipped.has(material)) continue;
        material.clippingPlanes = [this.cut];
        material.needsUpdate = true;
        this.clipped.add(material);
      }
    });
  }

  private seatRiders(model: CoffeeRunModel, dt: number, reducedMotion: boolean): void {
    const contract = this.contract;
    this.car.updateWorldMatrix(true, true);
    for (const { character, seat } of this.riders) {
      const targets = contract.seats[seat];
      character.root.visible = targets !== undefined;
      if (!targets) continue;
      character.root.position.copy(seatRootPosition(targets.seat, character.root.scale.x, this.point));
      character.root.rotation.y = this.car.rotation.y + Math.PI / 2;
      animateCharacter(character, dt, { moving: false, time: model.elapsedMs / 1000, reducedMotion });
      if (character.motion) { character.motion.pose = 'sit'; character.motion.seated = true; }
      character.body.rotation.set(0, 0, 0);
      character.head.rotation.set(0, 0, 0);
      applyPose(character, 'sit', model.elapsedMs / 1000, reducedMotion);
      const points: SeatTargetPoints = {};
      if (seat === 'passenger') {
        // Skanky's hands on the trays' outer edges, his eyes on the coffee.
        points.hands = { left: this.handles.left.getWorldPosition(new THREE.Vector3()), right: this.handles.right.getWorldPosition(new THREE.Vector3()) };
        // The imported model keeps arms the seat placed only when told to, as the driver's on the wheel.
        if (character.motion) character.motion.hands = true;
        character.head.rotation.x = 0.42;
      } else if (targets.hands) {
        points.hands = { left: targets.hands.left.getWorldPosition(new THREE.Vector3()), right: targets.hands.right.getWorldPosition(new THREE.Vector3()) };
        if (character.motion && seat === 'driver') character.motion.hands = true;
      }
      if (targets.feet) points.feet = { left: targets.feet.left.getWorldPosition(new THREE.Vector3()), right: targets.feet.right.getWorldPosition(new THREE.Vector3()) };
      poseSeated(character, points);
    }
  }

  /** A cup goes over: it tips the way the coffee went, its lid pops off and the coffee splashes out. */
  private spill(index: number, model: CoffeeRunModel): void {
    const cup = this.cups[index];
    if (!cup || cup.spilled) return;
    cup.spilled = true;
    const level = Math.max(1e-6, Math.hypot(model.slosh.forward, model.slosh.right));
    const forward = model.slosh.forward / level, right = model.slosh.right / level;
    cup.root.rotation.set(1.1 * right, 0, -1.1 * forward);
    cup.lidVelocity = new THREE.Vector3(forward * 0.9, 1.6, right * 0.9);
    this.splash(cup, model, 18, 1);
  }

  private splash(cup: Cup, model: CoffeeRunModel, count: number, speed: number): void {
    const level = Math.max(1e-6, Math.hypot(model.slosh.forward, model.slosh.right));
    const forward = model.slosh.forward / level, right = model.slosh.right / level;
    cup.root.updateWorldMatrix(true, false);
    const start = this.props.worldToLocal(cup.root.localToWorld(new THREE.Vector3(0, 0.07, 0)));
    for (let i = 0; i < count; i++) {
      const mesh = this.drops.length < 160 ? new THREE.Mesh(DROP, drip) : null;
      if (!mesh) return;
      mesh.position.copy(start);
      this.props.add(mesh);
      const spread = 0.6 + Math.random() * 0.8;
      this.drops.push({ mesh, life: 0.6 + Math.random() * 0.4,
        velocity: new THREE.Vector3((forward + (Math.random() - 0.5) * 0.8) * spread * speed, (0.6 + Math.random() * 1.1) * speed, (right + (Math.random() - 0.5) * 0.8) * spread * speed) });
    }
  }

  private updateDrops(dt: number): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.life -= dt;
      drop.velocity.y -= 9.8 * dt;
      drop.mesh.position.addScaledVector(drop.velocity, dt);
      // Landed on the floor, a seat or a lap: it stops there and fades out with its life.
      if (drop.mesh.position.y < 0.47) { drop.mesh.position.y = 0.47; drop.velocity.set(0, 0, 0); }
      if (drop.life > 0) continue;
      drop.mesh.removeFromParent();
      this.drops.splice(i, 1);
    }
  }

  private clearDrops(): void {
    for (const drop of this.drops) drop.mesh.removeFromParent();
    this.drops.length = 0;
  }

  public dispose(): void {
    this.end();
    disposeObject3D(this.road);
    disposeObject3D(this.props);
  }
}
