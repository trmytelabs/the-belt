import * as THREE from 'three';
import { DrivingModel, type DriveDestination } from './DrivingModel';
import { CITY, CITY_BUILDINGS, CITY_SIGNALS, DESTINATIONS, TERMINALS, signalColor, streetExtent, type CityAxis, type CityPoint, type CitySignal } from './drivingCity';
import { createTruck } from './world';
import { createCar } from './story';
import { standard, textPlane } from './space';
import { mergeStatic } from './merge';
import { disposeObject3D } from './resources';
import { DrivingModels } from './drivingModels';
import { DrivingNavigation } from './drivingNavigation';

/** A reusable city with real connected intersections and free player movement. */
export class DrivingView {
  public readonly scene = new THREE.Scene();
  public readonly camera = new THREE.PerspectiveCamera(54, 1, 0.1, 180);
  public readonly truck = createTruck('5 TON', 0x5a4632, 0x4a3a2a, 'right');
  /** Skanky's own car, for the drive in to work. */
  public readonly car = createCar(0x8f3f34);
  public readonly ready: Promise<void>;
  public buildingCount = 0;
  public readonly navigation: DrivingNavigation;
  private readonly models: DrivingModels;
  private readonly signalProps: { signal: CitySignal; axis: CityAxis; root: THREE.Group; bulbs: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[] }[] = [];
  private readonly traffic = new Map<string, THREE.Group>();
  private readonly cones = new Map<string, THREE.Group>();
  private readonly tailMaterial = new THREE.MeshStandardMaterial({ color: 0xa52216, emissive: 0xff3422, emissiveIntensity: 0.6 });
  private readonly goalBeacons = new Map<DriveDestination, THREE.Group>();
  private readonly look = new THREE.Vector3();
  private readonly headlight: THREE.SpotLight;
  private readonly pool: THREE.PointLight;
  private snapped = false;
  private disposed = false;

  constructor(quality: 'high' | 'low') {
    const scene = this.scene;
    this.camera.userData.keep = true; scene.add(this.camera);
    this.navigation = new DrivingNavigation(this.camera);
    this.models = new DrivingModels(scene);
    const loads: Promise<boolean>[] = [];
    scene.background = new THREE.Color(0x101c2b);
    scene.fog = new THREE.Fog(0x101c2b, 75, 160);
    scene.add(new THREE.HemisphereLight(0xb7cee8, 0x55604a, 2.2));
    const moon = new THREE.DirectionalLight(0xc7d9ff, 1.6);
    moon.position.set(-30, 50, -20);
    scene.add(moon);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY.groundWidth, CITY.groundDepth), standard(0x24352f, 1));
    ground.rotation.x = -Math.PI / 2; ground.position.set(30, -0.04, -100); scene.add(ground);
    const asphalt = standard(0x343e47, 0.95), sidewalk = standard(0x737974, 1), stripe = standard(0xe9e5ce, 0.9), yellow = standard(0xe9bd64, 0.9);
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
      const slot = new THREE.Group(); slot.name = 'city-building'; slot.userData.keep = true; slot.position.set(x, 0, z);
      const fallback = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), standard(index % 2 ? 0x47515c : 0x5e605e, 0.9));
      fallback.position.y = height / 2; slot.add(fallback); scene.add(slot);
      loads.push(this.models.place(slot, (['shop', 'apartments', 'offices', 'tower', 'lowShop'] as const)[variant], { x: width, y: height, z: depth }, [fallback]));
      const landmark = ({ 0: 'NIGHT COFFEE', 12: 'CORNER SHOP', 32: 'MARKET HALL', 44: 'CAR WASH' } as Record<number, string>)[index];
      if (landmark) {
        const sign = textPlane([landmark], 10, 1.1, { width: 520, height: 64, background: '#263d40', color: '#f3d292' });
        sign.position.set(0, 3, depth / 2 + 0.025); slot.add(sign);
      }
      if (variant === 1) {
        const sign = textPlane(['APARTMENTS'], Math.min(11, width - 2), 1.2, { width: 512, height: 64, background: '#344950', color: '#e7dbb7' });
        sign.position.set(0, 3.3, depth / 2 + 0.03); slot.add(sign);
      }
    }
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
    loads.push(this.models.place(this.truck, 'truck', { x: 6.2, y: 3.5, z: 2.5 }, [...this.truck.children], Math.PI / 2));
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
    this.headlight = new THREE.SpotLight(0xffe2ae, quality === 'high' ? 95 : 65, 40, 0.55, 0.65, 1.3);
    this.headlight.position.set(3.2, 1.1, 0);
    this.headlight.target.position.set(24, 0, 0);
    this.truck.add(this.headlight, this.headlight.target);
    this.pool = new THREE.PointLight(0xffc58b, 35, 24, 1.4);
    scene.add(this.pool);
    const objects = new Set<THREE.Object3D>([this.truck, this.car, this.pool]);
    mergeStatic(scene, object => objects.has(object) || object.userData.keep === true || (object as THREE.Light).isLight === true);
    this.ready = Promise.all(loads).then(() => {
      if (this.disposed) return;
      for (const slot of scene.children) if (['city-building', 'streetlight', 'traffic-signal'].includes(slot.name)) slot.userData.keep = false;
      mergeStatic(scene, object => objects.has(object) || object.userData.keep === true || (object as THREE.Light).isLight === true);
    });
  }

  private pavement(x: number, z: number, width: number, depth: number, material: THREE.Material, height: number): void {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, height, z); this.scene.add(mesh);
  }

  private terminal(p: CityPoint, name: string, subtitle: string, color: number, end: 1 | -1): void {
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(42, 26), standard(0x454d50, 0.95));
    apron.rotation.x = -Math.PI / 2; apron.position.set(p.x, -0.02, p.z + end * 12);
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

  public begin(model: DrivingModel, vehicle: 'truck' | 'car' = 'truck'): void {
    this.truck.visible = vehicle === 'truck';
    this.car.visible = vehicle === 'car';
    // The beam follows whichever nose is in front of the player.
    this.vehicle.add(this.headlight, this.headlight.target);
    this.headlight.position.set(vehicle === 'car' ? 2.2 : 3.2, vehicle === 'car' ? 0.8 : 1.1, 0);
    // Reuse owned props on both legs and replays, including asynchronously upgraded cars.
    for (const obstacle of model.obstacles) {
      if (obstacle.kind === 'car') {
        if (this.traffic.has(obstacle.id)) continue;
        const car = createCar([0xa74132, 0x7a7a70, 0xc6b58c, 0x467b91, 0x698560, 0xd8d4c8][this.traffic.size % 6]);
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
    for (const obstacle of model.obstacles) {
      const object = this.traffic.get(obstacle.id) ?? this.cones.get(obstacle.id)!;
      object.visible = true; object.position.set(obstacle.x, obstacle.kind === 'cone' && obstacle.hit ? 0.15 : 0, obstacle.z);
      object.rotation.set(0, obstacle.heading, obstacle.kind === 'cone' && obstacle.hit ? Math.PI / 2 : 0);
    }
    const chase = new THREE.Vector3(p.x - p.tx * 15, 9.5, p.z - p.tz * 15);
    const target = new THREE.Vector3(p.x + p.tx * 12, 1.3, p.z + p.tz * 12);
    const follow = !this.snapped ? 1 : 1 - Math.exp(-dt * 5);
    this.camera.position.lerp(chase, follow); this.look.lerp(target, follow);
    this.camera.lookAt(this.look); this.snapped = true;
    this.navigation.update(model, this.camera);
  }

  public dispose(): void { this.disposed = true; this.models.dispose(); disposeObject3D(this.scene); this.traffic.clear(); this.cones.clear(); }
}
