import * as THREE from 'three';
import { seatNodeNames, type SeatName } from './vehicleRig.ts';

/**
 * A small generated interior for the imported sedans (the 3D depot only):
 * two front seats with head rests, a rear bench, a dashboard with a glossy
 * top, a steering wheel on the driver's side and door cards. It only has to
 * hold up through the windows from outside, so it is about 600 triangles of
 * dark fabric and plastic. Built in the car's own frame: the nose is +x, the
 * driver sits at +z (where `StoryStage.seat` puts the driver), y is up.
 *
 * The interior also carries the vehicle contract's empties (vehicleRig.ts):
 * where each seated figure's hips go, the driver's wrists on the wheel rim,
 * every seat's resting hands and feet. The figure's seated hips sit
 * `SEDAN_LAYOUT.seatY` above the car's origin, low enough that the tallest
 * crew member's head clears the roof.
 */
export const SEDAN_LAYOUT = {
  /** Hip height of a seated figure, and the cushion top under it. */
  seatY: 0.66,
  cushionTop: 0.6,
  front: { x: -0.2, z: 0.38 },
  rear: { x: -0.98, z: 0.34 },
  /** The steering wheel's hub, its rim radius and its tilt back toward the driver; close enough for bent elbows. */
  wheel: { x: 0.24, y: 0.9, z: 0.38, radius: 0.17, tilt: 0.35 },
  /** The floor pan's top, where feet stand. */
  floorY: 0.44,
  /** The cabin the figures must stay inside: the rear deck to the windscreen base, door to door, floor to roof lining. */
  cabin: { minX: -1.32, maxX: 0.88, halfWidth: 0.76, minY: 0.4, maxY: 1.45 },
} as const;

/** The driver's wrists sit this far above the wheel's horizontal diameter, at about "ten and two". */
const GRIP_ANGLE = 0.45;

export function createSedanInterior(): THREE.Group {
  const interior = new THREE.Group();
  interior.name = 'vehicle-interior';
  const L = SEDAN_LAYOUT;
  // A touch of emissive stands in for the dome and dash glow, so the cabin is not a black hole through the glass.
  const fabric = new THREE.MeshStandardMaterial({ color: 0x3b3a42, roughness: 0.96, metalness: 0, emissive: 0x16161a, emissiveIntensity: 0.7 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x24242a, roughness: 0.62, metalness: 0.05, emissive: 0x0e0e12, emissiveIntensity: 0.7 });
  const gloss = new THREE.MeshStandardMaterial({ color: 0x1a1b20, roughness: 0.28, metalness: 0.1 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.5, metalness: 0.1 });
  const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    interior.add(mesh);
    return mesh;
  };
  const point = (name: string, x: number, y: number, z: number, facing = 0): THREE.Object3D => {
    const node = new THREE.Object3D();
    node.name = name;
    node.position.set(x, y, z);
    node.rotation.y = facing;
    interior.add(node);
    return node;
  };

  // Everything stays inside the cabin, which on the fitted sedan runs from about
  // x −1.3 (rear deck) to x 0.85 (windscreen base) and ±0.75 at the doors.
  // Floor and transmission tunnel.
  box(2.1, 0.04, 1.4, plastic, -0.25, L.floorY - 0.02, 0);
  box(1.9, 0.14, 0.2, plastic, -0.2, L.floorY + 0.05, 0);

  // Front seats: cushion, raked backrest, head rest.
  for (const z of [L.front.z, -L.front.z]) {
    box(0.5, 0.14, 0.46, fabric, L.front.x - 0.02, L.cushionTop - 0.07, z);
    const back = box(0.12, 0.54, 0.46, fabric, -0.5, 0.85, z);
    back.rotation.z = 0.2;
    box(0.14, 0.14, 0.24, fabric, -0.57, 1.17, z);
  }
  // Rear bench against the rear bulkhead, under the rear window.
  box(0.46, 0.14, 1.2, fabric, L.rear.x, L.cushionTop - 0.07, 0);
  const rearBack = box(0.12, 0.5, 1.2, fabric, -1.2, 0.83, 0);
  rearBack.rotation.z = 0.18;
  for (const z of [L.rear.z, -L.rear.z]) box(0.14, 0.12, 0.24, fabric, -1.24, 1.11, z);

  // Dashboard: a low slab with a glossy top, and the instrument hood in front of the driver.
  box(0.36, 0.24, 1.4, plastic, 0.72, 0.8, 0);
  box(0.38, 0.03, 1.42, gloss, 0.72, 0.935, 0);
  box(0.2, 0.08, 0.36, plastic, 0.6, 0.98, L.wheel.z);

  // Steering wheel on its column: the rim faces the driver and leans back toward the dash.
  const normal = new THREE.Vector3(-Math.cos(L.wheel.tilt), Math.sin(L.wheel.tilt), 0);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(L.wheel.radius, 0.022, 8, 24), wheelMaterial);
  wheel.position.set(L.wheel.x, L.wheel.y, L.wheel.z);
  wheel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  wheel.name = 'steering_wheel';
  wheel.userData.keep = true;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), wheelMaterial);
  hub.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  wheel.add(hub);
  for (const spoke of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, L.wheel.radius, 0.02), wheelMaterial);
    arm.position.set(spoke * L.wheel.radius * 0.45, -L.wheel.radius * 0.1, 0);
    arm.rotation.z = spoke * 1.15;
    wheel.add(arm);
  }
  interior.add(wheel);
  const dashFace = new THREE.Vector3(0.54, 0.78, L.wheel.z);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, wheel.position.distanceTo(dashFace), 10), plastic);
  column.position.copy(wheel.position).lerp(dashFace, 0.5);
  column.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dashFace.clone().sub(wheel.position).normalize());
  interior.add(column);

  // The contract: seats face the nose (+x, the node's +z after a quarter turn), the driver's wrists
  // rest on the rim at ten and two, everyone's resting hands on their lap and feet on the floor.
  // "Left" and "right" follow the figure's pivot names: its `leftArm` hangs at its own −x, which a
  // seat facing the nose turns to the car's +z, so the driver's left-hand target is the door-side one.
  const seats: Record<SeatName, { x: number; z: number }> = {
    driver: { x: L.front.x, z: L.front.z }, passenger: { x: L.front.x, z: -L.front.z },
    rearL: { x: L.rear.x, z: -L.rear.z }, rearR: { x: L.rear.x, z: L.rear.z },
  };
  const LEFT = 1, RIGHT = -1;
  const up = new THREE.Vector3(Math.sin(L.wheel.tilt), Math.cos(L.wheel.tilt), 0);
  for (const seat of Object.keys(seats) as SeatName[]) {
    const { x, z } = seats[seat], names = seatNodeNames(seat);
    point(names.seat, x, L.seatY, z, Math.PI / 2);
    if (seat === 'driver') {
      for (const [name, side] of [[names.handL, LEFT], [names.handR, RIGHT]] as const) {
        const grip = new THREE.Vector3(L.wheel.x, L.wheel.y, L.wheel.z)
          .addScaledVector(new THREE.Vector3(0, 0, side), L.wheel.radius * Math.cos(GRIP_ANGLE))
          .addScaledVector(up, L.wheel.radius * Math.sin(GRIP_ANGLE));
        point(name, grip.x, grip.y, grip.z);
      }
      // The pedals: the right foot (toward the tunnel) on the gas, the left resting by the door.
      point(names.footL, 0.54, L.floorY + 0.03, z + LEFT * 0.13);
      point(names.footR, 0.58, L.floorY + 0.04, z + RIGHT * 0.1);
    } else {
      for (const [name, side] of [[names.handL, LEFT], [names.handR, RIGHT]] as const) point(name, x + 0.3, L.seatY + 0.1, z + side * 0.13);
      // Rear feet stay behind the front seat backs.
      const reach = seat === 'passenger' ? 0.44 : 0.36;
      for (const [name, side] of [[names.footL, LEFT], [names.footR, RIGHT]] as const) point(name, x + reach, L.floorY + 0.03, z + side * 0.13);
    }
  }

  return interior;
}
