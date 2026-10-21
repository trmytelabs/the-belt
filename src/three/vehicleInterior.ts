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
  /**
   * The steering wheel's hub, its rim radius and its tilt back toward the driver; close enough for bent elbows.
   * Left-hand drive: the city's traffic keeps to the right, so the driver sits on the car's left, its −z
   * (the nose is +x).
   */
  wheel: { x: 0.24, y: 0.9, z: -0.38, radius: 0.17, tilt: 0.35 },
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
  // seat facing the nose turns to the car's +z. The driver sits on the car's left (−z, left-hand
  // drive), so that target is the one toward the centre console, and the foot on that side is on the gas.
  const seats: Record<SeatName, { x: number; z: number }> = {
    driver: { x: L.front.x, z: -L.front.z }, passenger: { x: L.front.x, z: L.front.z },
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

/**
 * The five-ton's cab, seen from the driver's seat (the 3D drives' cab view).
 * The downloaded truck's cab is a closed shell with opaque, painted windows, so
 * the view hides the truck's body and shows this instead: the green hood with
 * its wipers, a dashboard with lit gauges, a broad steering wheel that turns
 * with the front wheels, the windscreen pillars, the roof header and lining,
 * the doors and floor, the passenger's seat and a mirror.
 * Coordinates are the truck slot's: the nose is +x, the cab runs from about
 * x 1.9 to the windscreen at x 2.55, the hood top is at about y 1.25 and the
 * cab roof at 1.7. Left-hand drive, like the cars: the driver sits at −z.
 */
export const TRUCK_CAB = {
  /** Where the driver's eyes are, and how far ahead and below them the view settles. */
  eye: { x: 1.68, y: 1.52, z: -0.45 },
  ahead: { x: 12, y: 0.45 },
  dashTop: 1.22,
  wheel: { x: 2.0, y: 1.12, z: -0.45, radius: 0.21, tilt: 0.75 },
  roofY: 1.7,
  halfWidth: 1.0,
  windscreenX: 2.55,
} as const;

export function createTruckCab(): { cab: THREE.Group; wheel: THREE.Object3D } {
  const cab = new THREE.Group();
  cab.name = 'truck-cab';
  cab.userData.keep = true;
  const C = TRUCK_CAB;
  const plastic = new THREE.MeshStandardMaterial({ color: 0x26272c, roughness: 0.7, metalness: 0.05, emissive: 0x0d0d10, emissiveIntensity: 0.8 });
  const gloss = new THREE.MeshStandardMaterial({ color: 0x1b1c21, roughness: 0.3, metalness: 0.1 });
  const lining = new THREE.MeshStandardMaterial({ color: 0x4a4a4f, roughness: 0.95, emissive: 0x111114, emissiveIntensity: 0.8 });
  const glow = (color: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const paint = new THREE.MeshStandardMaterial({ color: 0x1d7046, roughness: 0.45, metalness: 0.2 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x3a3b40, roughness: 0.95, emissive: 0x111114, emissiveIntensity: 0.7 });
  const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, rotationZ = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rotationZ;
    cab.add(mesh);
    return mesh;
  };
  // Dashboard: a deep slab under the windscreen with a glossy top, and the instrument hood before the driver.
  box(0.32, 0.22, 2 * C.halfWidth, plastic, 2.39, C.dashTop - 0.11, 0);
  box(0.34, 0.02, 2 * C.halfWidth, gloss, 2.39, C.dashTop + 0.005, 0);
  box(0.16, 0.09, 0.42, plastic, 2.3, C.dashTop + 0.04, C.wheel.z);
  // Two gauges set in the binnacle's face: the speedometer and the tachometer, dimly lit, in dark bezels.
  for (const [dz, color] of [[-0.075, 0xffd9a0], [0.075, 0xa8e0ff]] as const) {
    const at = new THREE.Vector3(2.217, C.dashTop + 0.045, C.wheel.z + dz);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.034, 24), glow(color));
    (dial.material as THREE.MeshBasicMaterial).color.multiplyScalar(0.3);
    dial.position.copy(at);
    dial.rotation.y = -Math.PI / 2;
    cab.add(dial);
    const bezel = new THREE.Mesh(new THREE.RingGeometry(0.034, 0.041, 24), gloss);
    bezel.position.copy(at).x -= 0.001;
    bezel.rotation.y = -Math.PI / 2;
    cab.add(bezel);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.028, 0.004), glow(0xff5a3c));
    needle.position.copy(at).add(new THREE.Vector3(-0.002, 0.008, 0));
    needle.rotation.x = 0.7;
    cab.add(needle);
  }
  // The steering wheel: a broad, flat-raked rim on its column, turned by the caller about its own axis.
  const normal = new THREE.Vector3(-Math.cos(C.wheel.tilt), Math.sin(C.wheel.tilt), 0);
  const mount = new THREE.Group();
  mount.position.set(C.wheel.x, C.wheel.y, C.wheel.z);
  mount.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  const wheel = new THREE.Group();
  wheel.name = 'cab-steering-wheel';
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(C.wheel.radius, 0.024, 8, 28), gloss));
  for (const angle of [Math.PI / 2, Math.PI * 7 / 6, -Math.PI / 6]) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, C.wheel.radius, 0.018), plastic);
    spoke.position.set(Math.cos(angle) * C.wheel.radius / 2, Math.sin(angle) * C.wheel.radius / 2, 0);
    spoke.rotation.z = angle - Math.PI / 2;
    wheel.add(spoke);
  }
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 14).rotateX(Math.PI / 2), plastic));
  mount.add(wheel);
  cab.add(mount);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.32, 10), plastic);
  column.position.copy(mount.position).addScaledVector(normal, -0.16);
  column.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  cab.add(column);
  // The hood ahead of the windscreen in the truck's green, its front edge rounded off, and the wipers parked at its base.
  box(0.52, 0.42, 2 * C.halfWidth - 0.04, paint, C.windscreenX + 0.26, C.dashTop - 0.25, 0);
  box(0.1, 0.36, 2 * C.halfWidth - 0.04, paint, C.windscreenX + 0.55, C.dashTop - 0.3, 0, 0.35);
  for (const z of [-0.45, 0.25]) box(0.02, 0.02, 0.55, plastic, C.windscreenX + 0.04, C.dashTop - 0.02, z, 0).rotation.y = 0.12;
  // The doors below the sills, the floor, and the passenger's seat across the cab.
  for (const side of [-1, 1]) box(0.72, 0.52, 0.04, plastic, 2.2, C.dashTop - 0.27, side * (C.halfWidth + 0.03));
  box(0.8, 0.03, 2 * C.halfWidth, plastic, 2.15, C.dashTop - 0.52, 0);
  box(0.45, 0.12, 0.5, fabric, 1.98, C.dashTop - 0.24, -C.wheel.z);
  box(0.1, 0.55, 0.5, fabric, 1.72, C.dashTop + 0.05, -C.wheel.z, 0.12);
  // Windscreen pillars leaning back to the roof header, the header, the roof lining and the door sills.
  for (const side of [-1, 1]) {
    box(0.07, 0.52, 0.07, plastic, C.windscreenX - 0.12, (C.dashTop + C.roofY) / 2, side * (C.halfWidth - 0.02), 0.5);
    box(0.7, 0.05, 0.06, plastic, 2.2, C.dashTop + 0.02, side * (C.halfWidth + 0.02));
    box(0.07, C.roofY - C.dashTop, 0.07, plastic, 1.88, (C.dashTop + C.roofY) / 2, side * (C.halfWidth + 0.02));
  }
  box(0.14, 0.07, 2 * C.halfWidth, plastic, C.windscreenX - 0.24, C.roofY - 0.01, 0);
  box(0.5, 0.03, 2 * C.halfWidth, lining, 2.06, C.roofY + 0.01, 0);
  // The rear-view mirror on the header, a strip of cool night in it.
  box(0.03, 0.07, 0.24, gloss, 2.27, C.roofY - 0.1, 0.05);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.055), glow(0x2c3e52));
  glass.position.set(2.253, C.roofY - 0.1, 0.05);
  glass.rotation.y = -Math.PI / 2;
  cab.add(glass);
  cab.traverse((object) => { if ((object as THREE.Mesh).isMesh) { object.castShadow = false; object.receiveShadow = false; } });
  return { cab, wheel };
}
