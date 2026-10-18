import * as THREE from 'three';
import type { DrivingModel } from './DrivingModel';

/** A bevelled, solid arrow in the chase camera's upper field of view. */
export class DrivingNavigation {
  public readonly root = new THREE.Group();
  public readonly pointer: THREE.Mesh<THREE.ExtrudeGeometry>;
  private readonly forward = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.34, -1.2); shape.lineTo(0.34, -1.2);
    shape.lineTo(0.34, 0.1); shape.lineTo(1.05, 0.1);
    shape.lineTo(0, 1.35); shape.lineTo(-1.05, 0.1);
    shape.lineTo(-0.34, 0.1); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.65, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.09, bevelSegments: 2, steps: 1,
    });
    geometry.translate(0, 0, -0.325);
    const face = new THREE.MeshStandardMaterial({ color: 0xffe17a, emissive: 0xffbd27, emissiveIntensity: 0.55,
      roughness: 0.4, metalness: 0.25, depthTest: false, depthWrite: false, toneMapped: false });
    const edge = new THREE.MeshStandardMaterial({ color: 0xa86b14, roughness: 0.45, depthTest: false, depthWrite: false });
    this.pointer = new THREE.Mesh(geometry, [face, edge]);
    this.pointer.name = 'solid-navigation-arrow'; this.pointer.renderOrder = 1000;
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 35),
      new THREE.LineBasicMaterial({ color: 0x785019, depthTest: false, depthWrite: false }));
    outline.renderOrder = 1001; this.pointer.add(outline);
    const tilt = new THREE.Group(); tilt.rotation.set(0.72, -0.18, 0); tilt.add(this.pointer);
    this.root.name = 'driving-navigation'; this.root.userData.keep = true; this.root.add(tilt);
    camera.add(this.root);
  }

  public resize(camera: THREE.PerspectiveCamera, height: number): void {
    const halfHeight = 12 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const units = halfHeight * 2 / height, portrait = camera.aspect < 1, compact = height <= 520;
    const px = compact ? 45 : portrait ? 67 : 76;
    this.root.scale.setScalar(px * units / 2.75);
    this.root.position.set(portrait ? (camera.aspect * height / 2 - 92) * units : 0,
      halfHeight - (compact ? 30 : portrait ? 198 : 52) * units, -12);
  }

  public update(model: DrivingModel, camera: THREE.PerspectiveCamera): void {
    const target = model.navigation.target;
    camera.getWorldDirection(this.forward);
    const cameraHeading = Math.atan2(-this.forward.z, this.forward.x);
    const targetHeading = Math.atan2(-(target.z - model.z), target.x - model.x);
    const relative = Math.atan2(Math.sin(cameraHeading - targetHeading), Math.cos(cameraHeading - targetHeading));
    // Use the camera's actual bearing: it trails the truck during a turn.
    this.pointer.rotation.z = -relative;
    this.root.visible = !model.parked;
    this.root.userData.target = { ...target };
    this.root.userData.bearing = relative;
  }
}
