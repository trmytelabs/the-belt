import * as THREE from 'three';
import { DrivingModel, ROAD_LENGTH, roadPoint, type DriveDestination } from './DrivingModel';
import { createTruck } from './world';
import { createCar } from './story';
import { standard, textPlane } from './space';
import { mergeStatic } from './merge';
import { disposeObject3D } from './resources';

/** One reusable stretch of night road, travelled in opposite directions. */
export class DrivingView {
  public readonly scene = new THREE.Scene();
  public readonly camera = new THREE.PerspectiveCamera(54, 1, 0.1, 180);
  public readonly truck = createTruck('5 TON', 0x5a4632, 0x4a3a2a, 'right');
  private readonly traffic = new Map<string, THREE.Group>();
  private readonly cones = new Map<string, THREE.Group>();
  private readonly tailMaterial = new THREE.MeshStandardMaterial({ color: 0xa52216, emissive: 0xff3422, emissiveIntensity: 0.6 });
  private readonly look = new THREE.Vector3();
  private readonly headlight: THREE.SpotLight;
  private readonly pool: THREE.PointLight;
  private snapped = false;

  constructor(quality: 'high' | 'low') {
    const scene = this.scene;
    scene.background = new THREE.Color(0x101c2b);
    scene.fog = new THREE.Fog(0x101c2b, 65, 145);
    scene.add(new THREE.HemisphereLight(0xb7cee8, 0x55604a, 1.8));
    const moon = new THREE.DirectionalLight(0xc7d9ff, 1.6);
    moon.position.set(-30, 50, -20);
    scene.add(moon);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 420), standard(0x24352f, 1));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.04, -130);
    scene.add(ground);
    this.ribbon(-6.8, 6.8, standard(0x5a5b53, 1), -0.01);
    this.ribbon(-6, 6, standard(0x343e47, 0.95), 0);
    for (const side of [-1, 1]) this.ribbon(side * 5.8 - 0.06, side * 5.8 + 0.06, standard(0xd6d9ce, 0.8), 0.015);
    const yellow = standard(0xe9bd64, 0.8);
    for (let s = 8; s < ROAD_LENGTH - 8; s += 10) this.ribbon(-0.06, 0.06, yellow, 0.02, s, s + 4);

    const metal = standard(0x64757c, 0.55, 0.4);
    const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xffd4a0, emissive: 0xffc17b, emissiveIntensity: 2.4 });
    for (let s = 0; s <= ROAD_LENGTH; s += 24) {
      const side = (Math.floor(s / 24) % 2 ? -1 : 1);
      const p = roadPoint(s, side * 8);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7, 7), metal);
      pole.position.set(p.x, 3.5, p.z);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.6), lampMaterial);
      lamp.position.set(p.x, 7, p.z);
      scene.add(pole, lamp);
      // Small emissive pools keep software graphics readable without many lights.
      const pool = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshBasicMaterial({ color: 0xffce8a, transparent: true, opacity: 0.035, depthWrite: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(p.x - side * 4, 0.025, p.z);
      scene.add(pool);
      const building = new THREE.Mesh(new THREE.BoxGeometry(10, 5 + s % 7, 12), standard(s % 48 ? 0x283d4d : 0x3a4147, 0.95));
      building.position.set(p.x + side * 20, building.geometry.parameters.height / 2, p.z - 4);
      scene.add(building);
      for (let row = 0; row < 2; row++) {
        const window = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 0.65), new THREE.MeshStandardMaterial({ color: 0x87865b, emissive: 0xffd8a1, emissiveIntensity: 0.45 }));
        window.position.set(building.position.x - side * 5.01, 2 + row * 2.1, building.position.z);
        window.rotation.y = -side * Math.PI / 2;
        scene.add(window);
      }
    }
    this.terminal(0, 'UPS', 'DEPOT 07', 0x443b32);
    this.terminal(ROAD_LENGTH, 'MALLWOOD CENTRE', 'LOADING DOCK', 0x4d5354);
    for (const destination of ['mall', 'ups'] as const) {
      this.sign(38, destination, destination === 'mall' ? ['MALLWOOD →', '111 STREET'] : ['UPS DEPOT →', '111 STREET']);
      this.sign(ROAD_LENGTH - 36, destination, ['LOADING BAY', 'SLOW · PARK AHEAD']);
      const p = roadPoint(ROAD_LENGTH - 3, 2.6, destination);
      const bay = new THREE.Mesh(new THREE.PlaneGeometry(6, 11), new THREE.MeshStandardMaterial({ color: 0x829b6d, emissive: 0x496d4f, emissiveIntensity: 0.35, roughness: 0.9 }));
      bay.rotation.x = -Math.PI / 2; bay.rotation.z = p.heading - Math.PI / 2;
      bay.position.set(p.x, 0.03, p.z);
      scene.add(bay);
      const label = textPlane(['P', destination === 'mall' ? 'MALL' : 'UPS'], 3.3, 3, { width: 180, height: 160, background: '#526c51', color: '#f3ebc7' });
      label.rotation.x = -Math.PI / 2; label.rotation.z = p.heading - Math.PI / 2;
      label.position.set(p.x, 0.04, p.z);
      scene.add(label);
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
    scene.add(this.truck);
    this.headlight = new THREE.SpotLight(0xffe2ae, quality === 'high' ? 95 : 65, 40, 0.55, 0.65, 1.3);
    this.headlight.position.set(2.4, 1.5, 0);
    this.headlight.target.position.set(24, 0, 0);
    this.truck.add(this.headlight, this.headlight.target);
    this.pool = new THREE.PointLight(0xffc58b, 35, 24, 1.4);
    scene.add(this.pool);
    const objects = new Set<THREE.Object3D>([this.truck, this.pool]);
    mergeStatic(scene, object => objects.has(object) || (object as THREE.Light).isLight === true);
  }

  private ribbon(left: number, right: number, material: THREE.Material, y: number, start = 0, end = ROAD_LENGTH): void {
    const vertices: number[] = [];
    for (let s = start; s < end; s += 2) {
      const a = roadPoint(s, left), b = roadPoint(s, right), c = roadPoint(Math.min(s + 2, end), left), d = roadPoint(Math.min(s + 2, end), right);
      for (const p of [a, b, c, b, d, c]) vertices.push(p.x, y, p.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private terminal(s: number, name: string, subtitle: string, color: number): void {
    const p = roadPoint(s), end = s > 0 ? -1 : 1;
    const building = new THREE.Mesh(new THREE.BoxGeometry(34, 8, 10), standard(color, 0.9));
    building.position.set(p.x, 4, p.z + end * 17);
    const sign = textPlane([name, subtitle], 17, 3, { width: 720, height: 128, background: '#26333b', color: '#f3d292' });
    sign.position.set(p.x, 5.5, building.position.z - end * 5.01);
    sign.rotation.y = s > 0 ? 0 : Math.PI;
    this.scene.add(building, sign);
    for (const x of [-11, -5, 5, 11]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(4, 3.4, 0.1), standard(0x16242b, 0.8));
      door.position.set(p.x + x, 1.7, sign.position.z);
      this.scene.add(door);
    }
  }

  private sign(s: number, destination: DriveDestination, copy: string[]): void {
    const p = roadPoint(s, 8, destination);
    const sign = textPlane(copy, 5.4, 1.8, { width: 360, height: 120, background: '#234a45', color: '#f1e9c9', border: '#c2caaa' });
    sign.position.set(p.x, 3.7, p.z); sign.rotation.y = p.heading - Math.PI / 2;
    this.scene.add(sign);
  }

  public begin(model: DrivingModel): void {
    // Reuse owned props on both legs and replays, including asynchronously upgraded cars.
    for (const obstacle of model.obstacles) {
      if (obstacle.kind === 'car') {
        if (this.traffic.has(obstacle.id)) continue;
        const car = createCar([0xa74132, 0x7a7a70, 0xc6b58c][this.traffic.size]);
        this.traffic.set(obstacle.id, car); this.scene.add(car);
      } else {
        if (this.cones.has(obstacle.id)) continue;
        const cone = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.09, 0.65), standard(0x1e292e, 1));
        base.position.y = 0.045;
        const orange = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.85, 10), standard(0xf58b38, 0.8)); orange.position.y = 0.5;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.2, 10), standard(0xffefcd, 0.8)); band.position.y = 0.56;
        cone.add(base, orange, band);
        this.cones.set(obstacle.id, cone); this.scene.add(cone);
      }
    }
    this.snapped = false;
    this.update(model, 0);
  }

  public resize(aspect: number): void {
    this.camera.aspect = aspect; this.camera.fov = aspect < 1 ? 68 : 54;
    this.camera.updateProjectionMatrix(); this.snapped = false;
  }

  public update(model: DrivingModel, dt: number): void {
    const p = model.pose;
    this.truck.position.set(p.x, 0, p.z);
    this.truck.rotation.y = p.heading - model.steer * 0.18;
    this.tailMaterial.emissiveIntensity = model.braking || model.canPark ? 3 : 0.6;
    this.pool.position.set(p.x, 7, p.z - 3);
    for (const obstacle of model.obstacles) {
      const object = this.traffic.get(obstacle.id) ?? this.cones.get(obstacle.id)!;
      const at = roadPoint(obstacle.distance, obstacle.offset, model.destination);
      object.visible = obstacle.distance >= 0 && obstacle.distance <= ROAD_LENGTH;
      object.position.set(at.x, obstacle.kind === 'cone' && obstacle.hit ? 0.15 : 0, at.z);
      object.rotation.set(0, at.heading + (obstacle.speed < 0 ? Math.PI : 0), obstacle.kind === 'cone' && obstacle.hit ? Math.PI / 2 : 0);
    }
    const chase = new THREE.Vector3(p.x - p.tx * 13, 8.5, p.z - p.tz * 13);
    const ahead = roadPoint(Math.min(ROAD_LENGTH, model.distance + 12), model.offset * 0.5, model.destination);
    const target = new THREE.Vector3(ahead.x, 1.3, ahead.z);
    const follow = !this.snapped ? 1 : 1 - Math.exp(-dt * 7);
    this.camera.position.lerp(chase, follow); this.look.lerp(target, follow);
    this.camera.lookAt(this.look); this.snapped = true;
  }

  public dispose(): void { disposeObject3D(this.scene); this.traffic.clear(); this.cones.clear(); }
}
