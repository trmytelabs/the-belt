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
  /** The steering wheel inside the cabin, turned with the front pair about its own axis. */
  steeringWheel: THREE.Object3D | null;
  /** Rolling radius in world metres. */
  radius: number;
  /** +1 when a positive spin about the pivot's x axis rolls the vehicle toward its nose. */
  forward: 1 | -1;
  wheelbase: number;
  spin: number;
  /** Front-wheel angle in radians, positive to the left. */
  steer: number;
  last: THREE.Vector3 | null;
  lastHeading: number;
}

const WHEEL_ORDER = 'YXZ';
const MAX_STEER = 0.55;
/** Turns of the steering wheel per radian of front-wheel angle. */
const STEERING_RATIO = 2.5;
/** A jump larger than this in one frame is a scene reset, not travel. */
const TELEPORT = 6;

/**
 * Wraps each wheel node in a pivot at the wheel's centre so it can spin and
 * steer in place. Call before the vehicle is merged, and keep the pivots out
 * of the merge (`userData.wheel` is set on them for that).
 */
export function rigWheels(nodes: { node: THREE.Object3D; steered: boolean }[], options: { forward?: 1 | -1; wheelbase?: number } = {}): WheelRig | null {
  const rig: WheelRig = { wheels: [], steered: [], steeringWheel: null, radius: 0.33, forward: options.forward ?? 1, wheelbase: options.wheelbase ?? 2.7, spin: 0, steer: 0, last: null, lastHeading: 0 };
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

const wheelTurn = new THREE.Quaternion();
const WHEEL_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * Gives the rig a steering wheel to turn: the node's resting orientation is
 * kept and the wheel turns about its own local z (a torus's normal).
 */
export function attachSteeringWheel(rig: WheelRig, wheel: THREE.Object3D): void {
  rig.steeringWheel = wheel;
  wheel.userData.rest = wheel.quaternion.clone();
}

/** Spins the wheels by `metres` of travel and eases the front pair toward `steer` radians. */
export function spinWheels(rig: WheelRig, metres: number, steer: number, dt: number): void {
  rig.spin += (metres / rig.radius) * rig.forward;
  const target = THREE.MathUtils.clamp(steer, -MAX_STEER, MAX_STEER);
  rig.steer += (target - rig.steer) * Math.min(1, dt * 8);
  for (const wheel of rig.wheels) wheel.rotation.x = rig.spin;
  for (const wheel of rig.steered) wheel.rotation.y = rig.steer;
  const hands = rig.steeringWheel;
  if (hands) {
    const rest = hands.userData.rest as THREE.Quaternion | undefined;
    // The wheel's normal points at the driver, so a left turn is a positive (counter-clockwise) turn to them.
    hands.quaternion.copy(rest ?? hands.quaternion).multiply(wheelTurn.setFromAxisAngle(WHEEL_AXIS, rig.steer * STEERING_RATIO));
  }
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

/**
 * The vehicle contract: named empties inside a vehicle model that tell the
 * game where its seats, steering wheel, hand and foot targets and suspension
 * pivot are, so a car or truck is driven and sat in by name and any model
 * that carries the names can take the place of the current ones.
 *
 * | Node | Purpose |
 * | --- | --- |
 * | `seat_driver`, `seat_passenger_f`, `seat_rear_l`, `seat_rear_r` | Where a seated figure's hips go; +Z of the node is the way it faces |
 * | `steering_wheel` | Turns with the front wheels; its local z is its axis |
 * | `hand_l_wheel`, `hand_r_wheel` | The driver's wrists on the wheel rim |
 * | `hand_l_rest`, `hand_r_rest` (and `hand_l_rest_<seat>` for the other seats) | Wrists resting on the lap |
 * | `foot_l_driver`, `foot_r_driver` (and `foot_l_<seat>`) | Where each foot stands |
 * | `suspension` | The node the body pitches and rolls about |
 *
 * The Quaternius sedans and the Kenney five-ton carry none of these, so their
 * loaders synthesise them: the sedans from the generated interior, the
 * five-ton from its body. A file that already names them is used as is.
 */
export type SeatName = 'driver' | 'passenger' | 'rearL' | 'rearR';

export const SEAT_NODES: Record<SeatName, string> = { driver: 'seat_driver', passenger: 'seat_passenger_f', rearL: 'seat_rear_l', rearR: 'seat_rear_r' };
/** The suffix each seat's resting hand and foot targets carry; the driver's are unsuffixed, as the contract names them. */
const SEAT_SUFFIX: Record<SeatName, string> = { driver: '', passenger: '_passenger_f', rearL: '_rear_l', rearR: '_rear_r' };

export interface SeatTargets {
  seat: THREE.Object3D;
  /** The driver's wrists on the wheel; everyone's on their lap. */
  hands: { left: THREE.Object3D; right: THREE.Object3D } | null;
  feet: { left: THREE.Object3D; right: THREE.Object3D } | null;
}

export interface VehicleContract {
  seats: Partial<Record<SeatName, SeatTargets>>;
  steeringWheel: THREE.Object3D | null;
  suspension: THREE.Object3D | null;
}

/** Node names each seat's targets use: the driver's hands go on the wheel, the rest on the lap. */
export function seatNodeNames(seat: SeatName): { seat: string; handL: string; handR: string; footL: string; footR: string } {
  const suffix = SEAT_SUFFIX[seat];
  return seat === 'driver'
    ? { seat: SEAT_NODES.driver, handL: 'hand_l_wheel', handR: 'hand_r_wheel', footL: 'foot_l_driver', footR: 'foot_r_driver' }
    : { seat: SEAT_NODES[seat], handL: `hand_l_rest${suffix}`, handR: `hand_r_rest${suffix}`, footL: `foot_l${suffix}`, footR: `foot_r${suffix}` };
}

/** Reads the contract nodes under `root` by name. Seats without a node are left out. */
export function readContract(root: THREE.Object3D): VehicleContract {
  const nodes = new Map<string, THREE.Object3D>();
  root.traverse((object) => { if (object.name && !nodes.has(object.name)) nodes.set(object.name, object); });
  const contract: VehicleContract = { seats: {}, steeringWheel: nodes.get('steering_wheel') ?? null, suspension: nodes.get('suspension') ?? null };
  for (const seat of Object.keys(SEAT_NODES) as SeatName[]) {
    const names = seatNodeNames(seat);
    const node = nodes.get(names.seat);
    if (!node) continue;
    const handL = nodes.get(names.handL), handR = nodes.get(names.handR), footL = nodes.get(names.footL), footR = nodes.get(names.footR);
    contract.seats[seat] = {
      seat: node,
      hands: handL && handR ? { left: handL, right: handR } : null,
      feet: footL && footR ? { left: footL, right: footR } : null,
    };
  }
  return contract;
}

/**
 * The body's pitch and roll on its springs: a critically damped spring on
 * each axis, pulled by acceleration (nose up), braking (nose down) and
 * cornering (leaning out), and kicked by a bump.
 */
export interface Suspension {
  pitch: number;
  roll: number;
  pitchRate: number;
  rollRate: number;
  lastSpeed: number | null;
}

/** Radians of pitch per m/s² and of roll per (rad of steer × m/s), and the most either reaches. */
const PITCH_PER_ACCEL = 0.0065;
const ROLL_PER_CORNER = 0.0035;
const MAX_LEAN = 0.05;
const SPRING = 9;

export function createSuspension(): Suspension {
  return { pitch: 0, roll: 0, pitchRate: 0, rollRate: 0, lastSpeed: null };
}

/**
 * Advances the springs toward what the vehicle is doing and poses `node`
 * (the model's `suspension` pivot, whose nose is +x) with the result. `jolt`
 * is a kick in radians per second from a bump this frame.
 */
export function settleSuspension(state: Suspension, node: THREE.Object3D | null, dt: number, motion: { speed: number; steer: number; jolt?: number }): void {
  if (!(dt > 0)) return;
  const accel = state.lastSpeed === null ? 0 : (motion.speed - state.lastSpeed) / dt;
  state.lastSpeed = motion.speed;
  const pitchTarget = THREE.MathUtils.clamp(accel * PITCH_PER_ACCEL, -MAX_LEAN, MAX_LEAN);
  // A right turn (positive steer) leans the body to the left, its +z side rising.
  const rollTarget = THREE.MathUtils.clamp(-motion.steer * motion.speed * ROLL_PER_CORNER, -MAX_LEAN, MAX_LEAN);
  if (motion.jolt) state.pitchRate -= motion.jolt;
  const step = Math.min(dt, 1 / 30);
  for (let left = dt; left > 1e-6; left -= step) {
    const h = Math.min(step, left);
    state.pitchRate += (-2 * SPRING * state.pitchRate - SPRING * SPRING * (state.pitch - pitchTarget)) * h;
    state.pitch += state.pitchRate * h;
    state.rollRate += (-2 * SPRING * state.rollRate - SPRING * SPRING * (state.roll - rollTarget)) * h;
    state.roll += state.rollRate * h;
  }
  if (node) node.rotation.set(state.roll, node.rotation.y, state.pitch);
}
