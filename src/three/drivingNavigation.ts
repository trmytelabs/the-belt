import * as THREE from 'three';
import type { DrivingModel } from './DrivingModel';

/** A floating horizontal compass: rotate in 3D toward the actual destination. */
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
    geometry.rotateX(-Math.PI / 2);
    // A HUD element, so unlit: with the lower chase camera the arrow sat within
    // reach of the yard lamps and the environment map, and bloomed. Flat faces
    // keep the arrow's two tones; the outline below keeps its edges readable.
    const face = new THREE.MeshBasicMaterial({ color: 0x7fd93c, depthTest: false, depthWrite: false, toneMapped: false });
    const edge = new THREE.MeshBasicMaterial({ color: 0x2b7a18, depthTest: false, depthWrite: false, toneMapped: false });
    this.pointer = new THREE.Mesh(geometry, [face, edge]);
    this.pointer.name = 'solid-navigation-arrow'; this.pointer.renderOrder = 1000;
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 35),
      new THREE.LineBasicMaterial({ color: 0x123e08, depthTest: false, depthWrite: false }));
    outline.renderOrder = 1001; this.pointer.add(outline);
    const tilt = new THREE.Group(); tilt.rotation.x = 0.78; tilt.add(this.pointer);
    this.root.name = 'driving-navigation'; this.root.userData.keep = true; this.root.add(tilt);
    camera.add(this.root);
  }

  public resize(camera: THREE.PerspectiveCamera, height: number): void {
    const halfHeight = 12 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const units = halfHeight * 2 / height, portrait = camera.aspect < 1, compact = height <= 520;
    const px = compact ? 64 : portrait ? 90 : 112;
    this.root.scale.setScalar(px * units / 2.75);
    this.root.position.set(portrait ? (camera.aspect * height / 2 - 92) * units : 0,
      halfHeight - (compact ? 30 : portrait ? 198 : 62) * units, -12);
  }

  /** Points at `target`: the drive's bay, or (the Ralph run) its next stop. */
  public update(model: DrivingModel, camera: THREE.PerspectiveCamera, target: { x: number; z: number } = model.goal): void {
    camera.getWorldDirection(this.forward);
    const cameraHeading = Math.atan2(-this.forward.z, this.forward.x);
    const targetHeading = Math.atan2(-(target.z - model.z), target.x - model.x);
    const relative = Math.atan2(Math.sin(cameraHeading - targetHeading), Math.cos(cameraHeading - targetHeading));
    // Use the camera's actual bearing: it trails the truck during a turn.
    this.pointer.rotation.set(0, -relative, 0);
    this.root.visible = !model.parked;
    this.root.userData.target = { ...target };
    this.root.userData.bearing = relative;
  }
}
