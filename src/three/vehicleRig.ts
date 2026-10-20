import * as THREE from 'three';

/**
 * Spinning, steering wheels for the imported vehicles (the 3D depot only).
 *
 * The sedans and the five-ton ship their wheels as separate nodes, but their
 * geometry sits in the vehicle's frame, so a wheel cannot turn about its own
 * axle until it is re-origined. `rigWheels` puts a pivot at each wheel's
 * centre and keeps the wheel out of the static merge; `followWheels` then
 * derives rolling and steering from how the vehicle actually moved each
 * frame, so story cars, traffic and the player's vehicle all share one path
 * and no scene needs to know a speed. The procedural fallbacks are untouched.
 */
export interface WheelRig {
  /** Pivots at each wheel's centre; `rotation.x` spins the wheel about its axle. */
  wheels: THREE.Object3D[];
  /** The front pivots, which also yaw with the steering. */
  steered: THREE.Object3D[];
  /** Rolling radius in world metres. */
  radius: number;
  /** +1 when a positive spin about the pivot's x axis rolls the vehicle toward its nose. */
  forward: 1 | -1;
  wheelbase: number;
  spin: number;
  steer: number;
  last: THREE.Vector3 | null;
  lastHeading: number;
}

const WHEEL_ORDER = 'YXZ';
const MAX_STEER = 0.55;
/** A jump larger than this in one frame is a scene reset, not travel. */
const TELEPORT = 6;

/**
 * Wraps each wheel node in a pivot at the wheel's centre so it can spin and
 * steer in place. Call before the vehicle is merged, and keep the pivots out
 * of the merge (`userData.wheel` is set on them for that).
 */
export function rigWheels(nodes: { node: THREE.Object3D; steered: boolean }[], options: { forward?: 1 | -1; wheelbase?: number } = {}): WheelRig | null {
  const rig: WheelRig = { wheels: [], steered: [], radius: 0.33, forward: options.forward ?? 1, wheelbase: options.wheelbase ?? 2.7, spin: 0, steer: 0, last: null, lastHeading: 0 };
  const radii: number[] = [];
  for (const { node, steered } of nodes) {
    const parent = node.parent;
    if (!parent) continue;
    node.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(node);
    if (bounds.isEmpty()) continue;
    const centre = node.worldToLocal(bounds.getCenter(new THREE.Vector3()));
    // The pivot takes the node's place and transform; the node moves under it so its centre is the pivot origin.
    const pivot = new THREE.Group();
    pivot.name = `wheel-pivot:${node.name}`;
    pivot.userData.wheel = true;
    pivot.rotation.order = WHEEL_ORDER;
    pivot.position.copy(node.position).add(centre.clone().multiply(node.scale).applyQuaternion(node.quaternion));
    pivot.quaternion.copy(node.quaternion);
    pivot.scale.copy(node.scale);
    parent.add(pivot);
    pivot.add(node);
    node.position.copy(centre).negate();
    node.quaternion.identity();
    node.scale.setScalar(1);
    rig.wheels.push(pivot);
    if (steered) rig.steered.push(pivot);
    radii.push((bounds.max.y - bounds.min.y) / 2);
  }
  if (!rig.wheels.length) return null;
  rig.radius = Math.max(0.05, radii.reduce((sum, r) => sum + r, 0) / radii.length);
  return rig;
}

/** Spins the wheels by `metres` of travel and eases the front pair toward `steer` radians. */
export function spinWheels(rig: WheelRig, metres: number, steer: number, dt: number): void {
  rig.spin += (metres / rig.radius) * rig.forward;
  const target = THREE.MathUtils.clamp(steer, -MAX_STEER, MAX_STEER);
  rig.steer += (target - rig.steer) * Math.min(1, dt * 8);
  for (const wheel of rig.wheels) wheel.rotation.x = rig.spin;
  for (const wheel of rig.steered) wheel.rotation.y = rig.steer;
}

/**
 * Reads how far `vehicle` moved and turned since the last call, and rolls and
 * steers the wheels to match. The vehicle's nose is its local +x, as every
 * car and truck root in the game is laid out.
 */
export function followWheels(rig: WheelRig, vehicle: THREE.Object3D, dt: number): void {
  const position = vehicle.position;
  const heading = vehicle.rotation.y;
  if (!rig.last) {
    rig.last = position.clone();
    rig.lastHeading = heading;
    return;
  }
  const dx = position.x - rig.last.x, dz = position.z - rig.last.z;
  const distance = Math.hypot(dx, dz);
  let turn = heading - rig.lastHeading;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  rig.last.copy(position);
  rig.lastHeading = heading;
  if (distance > TELEPORT || distance < 1e-4) {
    spinWheels(rig, 0, rig.steer, dt);
    return;
  }
  // Forward when the step points along the nose; reversing rolls the wheels back.
  const along = dx * Math.cos(heading) - dz * Math.sin(heading);
  const sign = along >= 0 ? 1 : -1;
  // Ackermann: the front wheels point where the path bends, tan(steer) = wheelbase × curvature.
  const steer = Math.atan(rig.wheelbase * turn / distance) * sign;
  spinWheels(rig, distance * sign, steer, dt);
}
