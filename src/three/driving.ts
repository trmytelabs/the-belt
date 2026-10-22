import * as THREE from 'three';
import { DrivingModel, type DriveDestination } from './DrivingModel';
import { createCityFacades } from './cityFacades';
import { CITY, CITY_BUILDINGS, CITY_SIGNALS, DESTINATIONS, TERMINALS, signalColor, streetExtent, type CityAxis, type CityPoint, type CitySignal } from './drivingCity';
import { SKANKY_SPEC, TERMITE_SPEC, createTruck } from './world';
import { createCar } from './story';
import { standard, textPlane } from './space';
import { mergeStatic } from './merge';
import { disposeObject3D } from './resources';
import { createSuspension, followWheels, settleSuspension, type SeatName, type VehicleContract, type WheelRig } from './vehicleRig';
import { animateCharacter, createCharacter, mergeCharacter, type Character } from './characters';
import { applyPose } from './crew';
import { poseSeated, seatRootPosition, type SeatTargetPoints } from './seating';
import { PAVING_TILE, scaleUVs, surfaceMaterial } from './textures';
import { DrivingModels } from './drivingModels';
import { DrivingNavigation } from './drivingNavigation';
import { snowMaterial, Snowfall } from './snow';
import { windAt } from './wind';
import { blocker, pullClear } from './cameraClear';
import { TRUCK_CAB, createTruckCab } from './vehicleInterior';
import { TRAFFIC_VARIANTS, TrafficBatch } from './trafficBatch';
import { createCityWindows } from './cityWindows';

/** A reusable city with real connected intersections and free player movement. */
/** The ghost five-ton: the procedural truck in one see-through pale blue, casting no shadow. */
function createGhostTruck(): THREE.Group {
  const ghost = createTruck('5 TON', 0x5a4632, 0x4a3a2a, 'right');
  const material = new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.3, depthWrite: false });
  ghost.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = material;
    mesh.castShadow = mesh.receiveShadow = false;
  });
  ghost.name = 'ghost-truck';
  ghost.visible = false;
  ghost.userData.keep = true;
  ghost.userData.solid = false;
  return ghost;
}

export class DrivingView {
  public readonly scene = new THREE.Scene();
  public readonly camera = new THREE.PerspectiveCamera(54, 1, 0.1, 180);
  public readonly truck = createTruck('5 TON', 0x5a4632, 0x4a3a2a, 'right');
  /** Skanky's own car, for the drive in to work. */
  public readonly car = createCar(0x8f3f34);
  /** The moon: the road's one shadow caster, kept over the vehicle. */
  private moon!: THREE.DirectionalLight;
  public readonly ready: Promise<void>;
  public buildingCount = 0;
  public readonly navigation: DrivingNavigation;
  private readonly models: DrivingModels;
  /** Padded boxes the chase camera stays out of: the buildings, the lamp posts and the signals. */
  public readonly blockers: THREE.Box3[] = [];
  /** The camera: behind the vehicle, or in the five-ton's cab at the driver's eyes. */
  public view: 'chase' | 'cab' = 'chase';
  private readonly cab: THREE.Group;
  private readonly cabWheel: THREE.Object3D;
  /** The procedural five-ton's own parts, shown until the downloaded model replaces them. */
  private readonly truckBody: THREE.Object3D[];
  private readonly signalProps: { signal: CitySignal; axis: CityAxis; root: THREE.Group; bulbs: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[] }[] = [];
  /**
   * The see-through five-ton of the player's fastest drive to this yard (`ghostDrive.ts`), hidden until a drive has a
   * ghost. Built with the view, so a replay's scene holds the same objects as the first drive (built on its first
   * frame, it added one between a drive's start and its first frame on a fast renderer).
   */
  private readonly ghost = createGhostTruck();
  /** Procedural stand-ins for the traffic, shown until the batched sedans are built. */
  private readonly traffic = new Map<string, THREE.Group>();
  /** The 28 sedans as three batched draws with distance-based detail; null on renderers that keep the stand-ins. */
  private trafficBatch: TrafficBatch | null = null;
  private readonly cones = new Map<string, THREE.Group>();
  private readonly tailMaterial = new THREE.MeshStandardMaterial({ color: 0xa52216, emissive: 0xff3422, emissiveIntensity: 0.6 });
  private readonly goalBeacons = new Map<DriveDestination, THREE.Group>();
  private readonly look = new THREE.Vector3();
  private readonly headlight: THREE.SpotLight;
  private readonly pool: THREE.PointLight;
  private snapped = false;
  private disposed = false;
  /** Christmas snow falling round the vehicle wherever it drives. */
  private readonly snow: Snowfall;
  /** Denser, brighter flakes a few metres ahead of the truck: the snow its headlights catch. */
  private readonly beam: Snowfall;
  private weatherClock = 0;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** A decaying knock to the chase camera after a bump, in metres. */
  private jolting = 0;
  /** The body's springs, and the kick a bump gives them this frame. */
  private readonly springs = createSuspension();
  private bump = 0;
  /** Skanky at the wheel of his own car with Termite beside him on the drive in; the five-ton's cab is solid and carries no one. */
  private readonly occupants: { name: string; character: Character; seat: SeatName }[] = [];
  private readonly seatPoint = new THREE.Vector3();

  /** Rattles the chase camera and the suspension: a cone is a tap, a car or a building a thump. */
  public jolt(amount: number): void {
    this.jolting = Math.max(this.jolting, amount);
    this.bump = Math.max(this.bump, amount);
  }

  constructor(quality: 'high' | 'low') {
    const scene = this.scene;
    this.camera.userData.keep = true; scene.add(this.camera);
    this.navigation = new DrivingNavigation(this.camera);
    this.models = new DrivingModels(scene);
    const loads: Promise<boolean>[] = [];
    scene.background = new THREE.Color(0x101c2b);
    scene.fog = new THREE.Fog(0x101c2b, 75, 160);
    scene.add(new THREE.HemisphereLight(0xb7cee8, 0x55604a, 1.9));
    // The moon casts the only shadows on the road; its shadow camera rides along
    // with the vehicle in `update`, so the 60 m around the player stay shadowed.
    const moon = new THREE.DirectionalLight(0xc7d9ff, 1.5);
    moon.position.set(-30, 50, -20);
    moon.castShadow = quality === 'high';
    moon.shadow.mapSize.setScalar(2048);
    moon.shadow.camera.left = -36; moon.shadow.camera.right = 36; moon.shadow.camera.top = 36; moon.shadow.camera.bottom = -36;
    moon.shadow.camera.near = 1; moon.shadow.camera.far = 140;
    moon.shadow.normalBias = 0.05; moon.shadow.radius = 2;
    moon.target.userData.keep = true;
    scene.add(moon, moon.target);
    this.moon = moon;
    // A snowy Christmas night: lawns and lots under snow, packed snow on the sidewalks, plowed roads.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY.groundWidth, CITY.groundDepth), snowMaterial(CITY.groundWidth, CITY.groundDepth, 8));
    ground.rotation.x = -Math.PI / 2; ground.position.set(30, -0.04, -100); ground.receiveShadow = true; scene.add(ground);
    // Photo asphalt and packed snow (CC0), tinted to the street's old flat colours; markings stay flat paint.
    // The plowed road is wet: low roughness lets the night sky, the lamps and the headlights reflect in it.
    const asphalt = surfaceMaterial('asphalt', { color: 0x2f3841, roughness: 0.38 });
    const sidewalk = surfaceMaterial('snowpack', { color: 0xc6ced6, roughness: 0.95 });
    const stripe = standard(0xe9e5ce, 0.9), yellow = standard(0xe9bd64, 0.9);
    for (const x of CITY.streetsX) {
      const extent = streetExtent(x), centre = (extent.minZ + extent.maxZ) / 2, length = extent.maxZ - extent.minZ;
      this.pavement(x, centre, 18, length, sidewalk, -0.01);
      this.pavement(x, centre, 14, length, asphalt, 0.005);
      for (let z = extent.minZ + 3; z < extent.maxZ; z += 8) {
        if (CITY.streetsZ.some(crossing => Math.abs(z - crossing) < 11)) continue;
        this.pavement(x, z, 0.12, 3.5, yellow, 0.025);
        for (const side of [-1, 1]) this.pavement(x + side * 6.7, z, 0.1, 7.8, stripe, 0.025);
      }
    }
    for (const z of CITY.streetsZ) {
      this.pavement(30, z, CITY.maxX - CITY.minX, 18, sidewalk, -0.01);
      this.pavement(30, z, CITY.maxX - CITY.minX, 14, asphalt, 0.008);
      for (let x = CITY.minX + 3; x < CITY.maxX; x += 8) {
        if (CITY.streetsX.some(crossing => Math.abs(x - crossing) < 11)) continue;
        this.pavement(x, z, 3.5, 0.12, yellow, 0.028);
        for (const side of [-1, 1]) this.pavement(x, z + side * 6.7, 7.8, 0.1, stripe, 0.028);
      }
    }
    const metal = standard(0x64757c, 0.55, 0.4);
    const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xffd4a0, emissive: 0xffc17b, emissiveIntensity: 2.4 });
    const lamp = (x: number, z: number, heading: number): void => {
      const slot = new THREE.Group(); slot.name = 'streetlight'; slot.userData.keep = true;
      slot.position.set(x, 0, z); slot.rotation.y = heading;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7, 7), metal); pole.position.y = 3.5; slot.add(pole); scene.add(slot);
      loads.push(this.models.place(slot, 'lamp', { y: 7.5 }, [pole]));
      // The post and the reach of its curved arm, for the camera.
      this.blockers.push(blocker(x - Math.sin(heading) * 0.5, z - Math.cos(heading) * 0.5, 0.4, 0.4, 8, 0.9));
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.45), lampMaterial); lens.position.set(0, 7.32, -1.03); slot.add(lens);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(7, 18), new THREE.MeshBasicMaterial({ color: 0xffce8a, transparent: true, opacity: 0.035, depthWrite: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(x - Math.sin(heading) * 3, 0.03, z - Math.cos(heading) * 3); scene.add(pool);
    };
    for (const x of CITY.streetsX) for (let z = -295; z < 105; z += 30) {
      if (CITY.streetsZ.some(row => Math.abs(z - row) < 12)) continue;
      const side = Math.floor(z / 30) % 2 ? -1 : 1;
      lamp(x + side * 8.5, z, side * Math.PI / 2);
    }
    for (const z of CITY.streetsZ) for (let x = -135; x < 205; x += 30) {
      if (CITY.streetsX.some(col => Math.abs(x - col) < 12)) continue;
      const side = Math.floor(x / 30) % 2 ? -1 : 1;
      lamp(x, z + side * 8.5, side > 0 ? 0 : Math.PI);
    }
    for (const building of CITY_BUILDINGS) {
      const { x, z, width, depth, height, variant } = building, index = this.buildingCount++;
      this.blockers.push(blocker(x, z, width, depth, height, 0.7));
      // The block itself is drawn by the merged facades below; its slot holds its signs.
      const slot = new THREE.Group(); slot.name = 'city-building'; slot.userData.keep = true; slot.userData.modelReady = true; slot.position.set(x, 0, z);
      scene.add(slot);
      const landmark = ({ 0: 'NIGHT COFFEE', 12: 'CORNER SHOP', 32: 'MARKET HALL', 44: 'CAR WASH' } as Record<number, string>)[index];
      if (landmark) {
        const sign = textPlane([landmark], 10, 1.1, { width: 520, height: 64, background: '#263d40', color: '#f3d292' });
        sign.position.set(0, 3, depth / 2 + 0.09); slot.add(sign);
      }
      if (variant === 1) {
        const sign = textPlane(['APARTMENTS'], Math.min(11, width - 2), 1.2, { width: 512, height: 64, background: '#344950', color: '#e7dbb7' });
        sign.position.set(0, 3.3, depth / 2 + 0.09); slot.add(sign);
      }
    }
    // Every block as two merged meshes (tinted walls and window panels on one grid), and the lit windows on that
    // same grid, one draw call: the Kenney models before these were stretched to each block, windows and all.
    scene.add(createCityFacades(CITY_BUILDINGS));
    scene.add(createCityWindows(CITY_BUILDINGS));
    this.terminal(TERMINALS.ups, 'UPS', 'DEPOT 07', 0x443b32, 1);
    this.terminal(TERMINALS.mall, 'SOUTHGATE MALL', 'LOADING DOCK', 0x4d5354, -1);
    for (const destination of ['mall', 'ups'] as const) {
      const p = DESTINATIONS[destination];
      this.pavement(p.x, p.z, 7, 12, new THREE.MeshStandardMaterial({ color: 0x829b6d, emissive: 0x496d4f, emissiveIntensity: 0.35 }), 0.035);
      const label = textPlane(['P', 'LOADING BAY'], 3.3, 3, { width: 256, height: 160, background: '#526c51', color: '#f3ebc7' });
      label.rotation.x = -Math.PI / 2; label.position.set(p.x, 0.045, p.z); scene.add(label);
      const beacon = new THREE.Group(); beacon.userData.keep = true; beacon.position.set(p.x, 0, p.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(5.5, 5.9, 40), new THREE.MeshBasicMaterial({ color: 0xffd77b, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.055; beacon.add(ring);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffdc82, transparent: true, opacity: 0.18, depthWrite: false }));
      glow.position.y = 5; beacon.add(glow); scene.add(beacon); this.goalBeacons.set(destination, beacon);
    }
    for (const signal of CITY_SIGNALS) for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const axis: CityAxis = Math.abs(Math.cos(heading)) < 0.5 ? 'ns' : 'ew', tx = Math.cos(heading), tz = -Math.sin(heading);
      const root = new THREE.Group(); root.name = 'traffic-signal'; root.userData.keep = true;
      root.position.set(signal.x - tx * 7 - tz * 8.4, 0, signal.z - tz * 7 + tx * 8.4); root.rotation.y = heading - Math.PI / 2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 8), metal); pole.position.y = 2.3; root.add(pole);
      loads.push(this.models.place(root, 'signal', { y: 5.2 }, [pole]));
      this.blockers.push(blocker(root.position.x, root.position.z, 1.2, 1.2, 5.6, 0.6));
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.8, 0.42), standard(0x172329, 0.8)); housing.position.set(-0.34, 4.45, 0.22); root.add(housing);
      const bulbs = [0xff3326, 0xffbd36, 0x55f295].map((color, n) => {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.05 }));
        bulb.userData.keep = true; bulb.position.set(-0.34, 4.98 - n * 0.53, 0.46); root.add(bulb); return bulb;
      });
      const line = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 0.4), stripe); line.rotation.x = -Math.PI / 2; line.position.set(-5.8, 0.045, 4); root.add(line);
      this.signalProps.push({ signal, axis, root, bulbs }); scene.add(root);
    }

    // Close the existing five-ton's rear door for road travel; mall cargo remains model-owned.
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.2, 2.7), standard(0x665542, 0.7));
    shutter.position.set(-2.32, 2.23, 0); this.truck.add(shutter);
    this.truck.traverse(object => {
      if (object.name === 'truck-headlight') (object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.emissiveIntensity = 3;
    });
    for (const z of [-0.9, 0.9]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.28), this.tailMaterial);
      tail.position.set(-2.38, 0.8, z); this.truck.add(tail);
    }
    this.truckBody = [...this.truck.children];
    loads.push(this.models.place(this.truck, 'truck', { x: 6.2, y: 3.5, z: 2.5 }, [...this.truck.children], Math.PI / 2));
    // The cab as the driver sees it, shown only in the cab view (added after the model's fallbacks are listed).
    const { cab, wheel } = createTruckCab();
    cab.visible = false;
    this.truck.add(cab);
    this.cab = cab; this.cabWheel = wheel;
    // These lights and labels stay on the truck after its original body is upgraded.
    for (const z of [-0.8, 0.8]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.3), this.tailMaterial);
      tail.position.set(-3.12, 0.75, z); this.truck.add(tail);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.4), lampMaterial);
      head.position.set(3.12, 0.85, z); this.truck.add(head);
    }
    for (const z of [-1.26, 1.26]) {
      const badge = textPlane(['UPS', '5 TON'], 1.8, 0.9, { width: 256, height: 128, background: '#493726', color: '#f1cb79' });
      badge.position.set(-0.5, 2.5, z); badge.rotation.y = z < 0 ? Math.PI : 0; this.truck.add(badge);
    }
    const rearBadge = textPlane(['UPS · 5 TON'], 1.5, 0.45, { width: 320, height: 96, background: '#493726', color: '#f1cb79' });
    rearBadge.position.set(-3.13, 1.95, 0); rearBadge.rotation.y = -Math.PI / 2; this.truck.add(rearBadge);
    scene.add(this.truck);
    this.car.userData.keep = true; this.car.visible = false; scene.add(this.car);
    scene.add(this.ghost);
    for (const [spec, seat] of [[SKANKY_SPEC, 'driver'], [TERMITE_SPEC, 'passenger']] as const) {
      const character = createCharacter(spec);
      mergeCharacter(character);
      character.root.userData.keep = true;
      character.root.visible = false;
      character.nameTag.visible = false;
      scene.add(character.root);
      this.occupants.push({ name: spec.name, character, seat });
    }
    this.headlight = new THREE.SpotLight(0xffe2ae, quality === 'high' ? 95 : 65, 40, 0.55, 0.65, 1.3);
    this.headlight.position.set(3.2, 1.1, 0);
    this.headlight.target.position.set(24, 0, 0);
    this.truck.add(this.headlight, this.headlight.target);
    this.pool = new THREE.PointLight(0xffc58b, 35, 24, 1.4);
    scene.add(this.pool);
    this.snow = new Snowfall(new THREE.Box3(new THREE.Vector3(-35, 0, -35), new THREE.Vector3(35, 16, 35)), { count: quality === 'high' ? 5000 : 1400, size: 0.14, fall: 1.1 });
    scene.add(this.snow.points);
    this.beam = new Snowfall(new THREE.Box3(new THREE.Vector3(-6, 0, -6), new THREE.Vector3(6, 4.5, 6)), { count: quality === 'high' ? 600 : 180, size: 0.11, fall: 1.3, color: 0xfff6e0, opacity: 1 });
    this.beam.points.name = 'snowfall-beam';
    scene.add(this.beam.points);
    const objects = new Set<THREE.Object3D>([this.truck, this.car, this.pool, this.snow.points, this.beam.points]);
    mergeStatic(scene, object => objects.has(object) || object.userData.keep === true || (object as THREE.Light).isLight === true);
    this.ready = Promise.all(loads).then(() => {
      if (this.disposed) return;
      for (const slot of scene.children) if (['city-building', 'streetlight', 'traffic-signal'].includes(slot.name)) slot.userData.keep = false;
      mergeStatic(scene, object => objects.has(object) || object.userData.keep === true || (object as THREE.Light).isLight === true);
    });
    // GPU renderers draw the traffic as batched sedans; software renderers keep the procedural cars and download nothing for them.
    if (quality === 'high') void this.enableTrafficBatch();
  }

  private pavement(x: number, z: number, width: number, depth: number, material: THREE.Material, height: number): void {
    const geometry = new THREE.PlaneGeometry(width, depth);
    // Photo-textured paving tiles at its real size; flat paint keeps its single-colour UVs.
    if ((material as THREE.MeshStandardMaterial).map) scaleUVs(geometry, width / PAVING_TILE, depth / PAVING_TILE);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, height, z); mesh.receiveShadow = true; this.scene.add(mesh);
  }

  private terminal(p: CityPoint, name: string, subtitle: string, color: number, end: 1 | -1): void {
    const apronGeometry = new THREE.PlaneGeometry(42, 26);
    const apronMaterial = surfaceMaterial('asphalt', { color: 0x3d4549, roughness: 0.5 });
    if (apronMaterial.map) scaleUVs(apronGeometry, 42 / PAVING_TILE, 26 / PAVING_TILE);
    const apron = new THREE.Mesh(apronGeometry, apronMaterial);
    apron.rotation.x = -Math.PI / 2; apron.position.set(p.x, -0.02, p.z + end * 12); apron.receiveShadow = true;
    this.scene.add(apron);
    const paint = standard(0xe5c88a, 0.9);
    for (const side of [-1, 1]) {
      this.pavement(p.x + side * 20.5, p.z + end * 14, 0.15, 21, paint, 0.035);
      const entrySign = textPlane(['LOADING ONLY', 'PULL INTO YARD'], 5, 1.2, { width: 384, height: 96, background: '#344938', color: '#f4e8c1' });
      entrySign.position.set(p.x + side * 16.5, 2.5, p.z + end * 8);
      entrySign.rotation.y = end > 0 ? Math.PI : 0; this.scene.add(entrySign);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.5, 7), standard(0x60716d, 0.7));
      post.position.set(entrySign.position.x, 1.25, entrySign.position.z); this.scene.add(post);
    }
    this.pavement(p.x, p.z + end * 24, 41, 0.15, paint, 0.035);
    const building = new THREE.Mesh(new THREE.BoxGeometry(34, 8, 10), standard(color, 0.9));
    building.position.set(p.x, 4, p.z + end * 29);
    const sign = textPlane([name, subtitle], 17, 2, { width: 720, height: 128, background: '#26333b', color: '#f3d292' });
    sign.position.set(p.x, 7, building.position.z - end * 5.01);
    sign.rotation.y = end < 0 ? 0 : Math.PI;
    this.scene.add(building, sign);
    const dockLight = new THREE.PointLight(0xffd9a3, 65, 35, 1.5);
    dockLight.position.set(p.x, 7, p.z + end * 20); this.scene.add(dockLight);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 3), standard(0x566369, 0.8));
    canopy.position.set(p.x, 6, p.z + end * 23); this.scene.add(canopy);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(15, 0.08, 0.15), new THREE.MeshStandardMaterial({
      color: 0xffe0a5, emissive: 0xffd79a, emissiveIntensity: 2.4 }));
    strip.position.set(p.x, 5.85, p.z + end * 21.6); this.scene.add(strip);
    for (const x of [-11, 0, 11]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(x === 0 ? 6 : 4, x === 0 ? 4.6 : 3.4, 0.1), standard(0x16242b, 0.8));
      door.position.set(p.x + x, x === 0 ? 2.3 : 1.7, sign.position.z);
      this.scene.add(door);
    }
  }

  /** The vehicle the player drives: the five-ton by default, or Skanky's car. */
  public get vehicle(): THREE.Group { return this.car.visible ? this.car : this.truck; }

  /**
   * Shows the ghost five-ton at `pose`, or hides it (null). It is only a picture: no collisions, no shadow, and the
   * chase camera never avoids it.
   */
  public setGhost(pose: { x: number; z: number; heading: number } | null): void {
    this.ghost.visible = pose !== null;
    if (!pose) return;
    this.ghost.position.set(pose.x, 0, pose.z);
    this.ghost.rotation.y = pose.heading;
  }

  /** Switches between the chase camera and the cab; the cab view is the five-ton's, so Skanky's car keeps the chase camera. */
  public toggleView(): 'chase' | 'cab' {
    this.view = this.view === 'chase' && this.vehicle === this.truck ? 'cab' : 'chase';
    // Back behind the vehicle at once rather than swooping out of the cab.
    this.snapped = false;
    return this.view;
  }

  /** Who is riding where, for checks. */
  public occupantReport(): { name: string; seat: SeatName; character: Character }[] {
    return this.occupants.map(({ name, seat, character }) => ({ name, seat, character }));
  }

  /**
   * Draws the traffic as batched sedans (GPU renderers do this from the
   * start; checks can turn it on elsewhere). Resolves true once the sedans
   * have downloaded and the batches replace the stand-ins.
   */
  public enableTrafficBatch(): Promise<boolean> {
    if (!this.trafficBatch) {
      const batch = new TrafficBatch(28, async () => {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        return Promise.all(TRAFFIC_VARIANTS.map((variant) => loader.loadAsync(`/models/vehicles/${variant}.glb`).then((gltf) => gltf.scene)));
      });
      this.trafficBatch = batch;
      this.scene.add(batch.root);
    }
    return this.trafficBatch.ready;
  }

  /** Which detail each batched car draws, or an empty list while the stand-ins show. */
  public trafficReport(): { id: string; far: boolean; variant: number }[] {
    return this.trafficBatch?.built ? this.trafficBatch.report() : [];
  }

  public begin(model: DrivingModel, vehicle: 'truck' | 'car' = 'truck'): void {
    this.truck.visible = vehicle === 'truck';
    this.car.visible = vehicle === 'car';
    // The beam follows whichever nose is in front of the player.
    this.vehicle.add(this.headlight, this.headlight.target);
    this.headlight.position.set(vehicle === 'car' ? 2.2 : 3.2, vehicle === 'car' ? 0.8 : 1.1, 0);
    // Reuse owned props on both legs and replays. The traffic's stand-ins stay procedural: the
    // batched sedans replace them once built.
    for (const obstacle of model.obstacles) {
      if (obstacle.kind === 'car') {
        if (this.traffic.has(obstacle.id)) continue;
        const car = createCar([0xa74132, 0x7a7a70, 0xc6b58c, 0x467b91, 0x698560, 0xd8d4c8][this.traffic.size % 6], false);
        car.userData.keep = true;
        this.traffic.set(obstacle.id, car); this.scene.add(car);
      } else {
        if (this.cones.has(obstacle.id)) continue;
        const cone = new THREE.Group();
        cone.userData.keep = true;
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.09, 0.65), standard(0x1e292e, 1));
        base.position.y = 0.045;
        const orange = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.85, 10), standard(0xf58b38, 0.8)); orange.position.y = 0.5;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.2, 10), standard(0xffefcd, 0.8)); band.position.y = 0.56;
        cone.add(base, orange, band);
        this.cones.set(obstacle.id, cone); this.scene.add(cone);
      }
    }
    for (const [destination, beacon] of this.goalBeacons) beacon.visible = destination === model.destination;
    this.snapped = false;
    this.update(model, 0);
  }

  public resize(aspect: number, height = window.innerHeight): void {
    this.camera.aspect = aspect; this.camera.fov = aspect < 1 ? 68 : 54;
    this.camera.updateProjectionMatrix(); this.snapped = false;
    this.navigation.resize(this.camera, height);
  }

  public update(model: DrivingModel, dt: number): void {
    const p = model.pose;
    this.vehicle.position.set(p.x, 0, p.z); this.vehicle.rotation.y = p.heading;
    this.tailMaterial.emissiveIntensity = model.braking || model.canPark ? 3 : 0.6;
    this.pool.position.set(p.x, 7, p.z);
    for (const { signal, axis, bulbs } of this.signalProps) {
      const color = signalColor(signal, model.elapsed, axis);
      bulbs.forEach((bulb, i) => { bulb.material.emissiveIntensity = i === ['red', 'amber', 'green'].indexOf(color) ? 4 : 0.04; });
    }
    const batched = this.trafficBatch?.built ? this.trafficBatch : null;
    let carIndex = 0;
    for (const obstacle of model.obstacles) {
      const object = this.traffic.get(obstacle.id) ?? this.cones.get(obstacle.id)!;
      if (obstacle.kind === 'car' && batched) {
        // The batch draws this car; its stand-in stays hidden.
        object.visible = false;
        batched.place(obstacle.id, carIndex++, obstacle, this.camera);
        continue;
      }
      object.visible = true; object.position.set(obstacle.x, obstacle.kind === 'cone' && obstacle.hit ? 0.15 : 0, obstacle.z);
      const tail = object.userData.tail as THREE.MeshStandardMaterial | undefined;
      if (tail) tail.emissiveIntensity = obstacle.braking ? 3.6 : 1.2;
      object.rotation.set(0, obstacle.heading, obstacle.kind === 'cone' && obstacle.hit ? Math.PI / 2 : 0);
      if (object.userData.wheels) followWheels(object.userData.wheels as WheelRig, object, dt);
    }
    if (this.vehicle.userData.wheels) followWheels(this.vehicle.userData.wheels as WheelRig, this.vehicle, dt);
    // The body settles on its springs: nose up under power, down under braking, leaning out of a bend; a bump kicks it.
    settleSuspension(this.springs, (this.vehicle.userData.suspension as THREE.Object3D | undefined) ?? null, model.paused ? 0 : dt, { speed: model.speed, steer: model.steer, jolt: this.bump * 4 });
    this.bump = 0;
    this.seatOccupants(model, model.paused ? 0 : dt);
    // The moon's shadow camera follows the vehicle on a 2 m grid, so the shadows do not swim.
    const anchorX = Math.round(p.x / 2) * 2, anchorZ = Math.round(p.z / 2) * 2;
    this.moon.position.set(anchorX - 30, 50, anchorZ - 20);
    this.moon.target.position.set(anchorX, 0, anchorZ);
    this.moon.target.updateMatrixWorld();
    const inCab = this.view === 'cab' && this.vehicle === this.truck;
    this.cab.visible = inCab;
    // From inside, the body's opaque cab would fill the view: hide it (the downloaded model, or the procedural
    // parts until it lands) and keep the truck's lights.
    const body = this.truck.getObjectByName('driving-model-truck');
    if (body) body.visible = !inCab;
    if (!this.truck.userData.modelReady) for (const part of this.truckBody) part.visible = !inCab;
    if (inCab) {
      // At the driver's eyes, pitching and rolling with the body on its springs; the wheel turns with the front wheels.
      const springs = this.truck.userData.suspension as THREE.Object3D | undefined;
      this.cab.rotation.set(springs?.rotation.x ?? 0, 0, springs?.rotation.z ?? 0);
      this.cabWheel.rotation.z = -model.steer * 2.5;
      this.cab.updateWorldMatrix(true, false);
      this.camera.position.copy(this.cab.localToWorld(new THREE.Vector3(TRUCK_CAB.eye.x, TRUCK_CAB.eye.y, TRUCK_CAB.eye.z)));
      this.look.copy(this.cab.localToWorld(new THREE.Vector3(TRUCK_CAB.ahead.x, TRUCK_CAB.ahead.y, TRUCK_CAB.eye.z)));
      this.camera.lookAt(this.look);
      this.snapped = false;
    } else {
      // A lower, closer chase camera: the vehicle filled a small patch at the bottom of the old frame.
      const chase = new THREE.Vector3(p.x - p.tx * 9, 4.5, p.z - p.tz * 9);
      const target = new THREE.Vector3(p.x + p.tx * 10, 1.2, p.z + p.tz * 10);
      const follow = !this.snapped ? 1 : 1 - Math.exp(-dt * 5);
      this.camera.position.lerp(chase, follow); this.look.lerp(target, follow);
      // Never inside the scenery: a corner cut used to put the camera in a building, and a kerb-side pass through a lamp post.
      // The line runs from the roof, so a pulled-in camera still looks over the truck at the road, and stops 3.5 m out.
      pullClear(new THREE.Vector3(p.x, 3.6, p.z), this.camera.position, this.blockers, 0.4, 3.5);
      this.camera.lookAt(this.look); this.snapped = true;
    }
    this.jolting = model.paused ? this.jolting : this.jolting * Math.exp(-dt * 6);
    if (this.jolting > 0.005 && !this.reducedMotion && !model.paused) {
      this.camera.position.x += (Math.random() - 0.5) * this.jolting;
      this.camera.position.y += (Math.random() - 0.5) * this.jolting * 0.6;
    } else if (this.jolting <= 0.005) this.jolting = 0;
    this.snow.follow(this.vehicle.position);
    this.beam.follow(new THREE.Vector3(p.x + p.tx * 7, 0, p.z + p.tz * 7));
    if (!model.paused) this.weatherClock += dt;
    const wind = windAt(this.weatherClock);
    this.snow.update(model.paused ? 0 : dt, this.reducedMotion, wind.x, wind.z);
    this.beam.update(model.paused ? 0 : dt, this.reducedMotion, wind.x, wind.z);
    this.navigation.update(model, this.camera);
  }

  /**
   * Sits the occupants in the car from its contract (vehicleRig.ts): hips on
   * the seats, the driver's hands on the wheel, everyone's feet on the floor.
   * Until the car's model and contract have loaded, and in the five-ton, they
   * stay hidden.
   */
  private seatOccupants(model: DrivingModel, dt: number): void {
    const vehicle = this.vehicle;
    const contract = this.car.visible ? vehicle.userData.contract as VehicleContract | undefined : undefined;
    let placed = false;
    for (const { character, seat } of this.occupants) {
      const targets = contract?.seats[seat];
      character.root.visible = targets !== undefined;
      if (!targets) continue;
      if (!placed) { vehicle.updateWorldMatrix(true, true); placed = true; }
      character.root.position.copy(seatRootPosition(targets.seat, character.root.scale.x, this.seatPoint));
      character.root.rotation.y = vehicle.rotation.y + Math.PI / 2;
      animateCharacter(character, dt, { moving: false, time: model.elapsed, reducedMotion: this.reducedMotion });
      if (character.motion) { character.motion.pose = 'sit'; character.motion.seated = true; }
      character.body.rotation.set(0, 0, 0);
      character.head.rotation.set(0, 0, 0);
      applyPose(character, 'sit', model.elapsed, this.reducedMotion);
      const points: SeatTargetPoints = {};
      if (targets.hands) {
        points.hands = { left: targets.hands.left.getWorldPosition(new THREE.Vector3()), right: targets.hands.right.getWorldPosition(new THREE.Vector3()) };
        if (character.motion && seat === 'driver') character.motion.hands = true;
      }
      if (targets.feet) points.feet = { left: targets.feet.left.getWorldPosition(new THREE.Vector3()), right: targets.feet.right.getWorldPosition(new THREE.Vector3()) };
      poseSeated(character, points);
    }
  }

  public dispose(): void { this.disposed = true; this.models.dispose(); this.trafficBatch?.dispose(); disposeObject3D(this.scene); this.traffic.clear(); this.cones.clear(); }
}
