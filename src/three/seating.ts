import * as THREE from 'three';
import type { Character } from './characters';
import { BODY, SEATED_BODY_DROP } from './figure.ts';

/**
 * Seated figures that hold up through a car's glass (the 3D depot only).
 *
 * A seated character keeps the figure's `sit` pose for its torso, hips and
 * head; its limbs are then placed by two-bone inverse kinematics on the
 * figure's own pivots, so the hands land on the vehicle contract's targets
 * (the wheel rim for the driver, the lap for a passenger) and the feet on
 * the pedals or the floor. An imported model copies those pivots, so it
 * follows without any work on its skeleton, and the software fallback (the
 * figure itself) looks the same.
 */
export interface Limb {
  /** The shoulder or hip pivot, a child of the body. */
  pivot: THREE.Object3D;
  /** The elbow or knee pivot, which bends about its local x. */
  mid: THREE.Object3D;
  /** Upper and lower segment lengths, in the body's metres. */
  upper: number;
  lower: number;
}

const toTarget = new THREE.Vector3();
const elbowDirection = new THREE.Vector3();
const upperDirection = new THREE.Vector3();
const lowerDirection = new THREE.Vector3();
const bendDirection = new THREE.Vector3();
const axisX = new THREE.Vector3();
const axisY = new THREE.Vector3();
const axisZ = new THREE.Vector3();
const basis = new THREE.Matrix4();
const reach = new THREE.Vector3();

/**
 * Aims `limb.pivot` and bends `limb.mid` so the limb's end lands on
 * `target`, given in the pivot's parent's frame, with the elbow or knee
 * pushed toward `pole` (a direction in the same frame). A target out of reach
 * straightens the limb toward it; the metres it falls short are returned.
 */
export function solveLimb(limb: Limb, target: THREE.Vector3, pole: THREE.Vector3): number {
  const { pivot, mid, upper, lower } = limb;
  toTarget.copy(target).sub(pivot.position);
  const wanted = toTarget.length();
  if (wanted < 1e-6) return 0;
  const distance = THREE.MathUtils.clamp(wanted, Math.abs(upper - lower) + 1e-3, upper + lower - 1e-3);
  toTarget.divideScalar(wanted);
  // The elbow lies in the plane of the target line and the pole.
  elbowDirection.copy(pole).addScaledVector(toTarget, -pole.dot(toTarget));
  if (elbowDirection.lengthSq() < 1e-8) elbowDirection.set(toTarget.y, -toTarget.x, 0);
  if (elbowDirection.lengthSq() < 1e-8) elbowDirection.set(0, 0, 1);
  elbowDirection.normalize();
  // Law of cosines: the upper segment's angle away from the target line.
  const cosUpper = THREE.MathUtils.clamp((upper * upper + distance * distance - lower * lower) / (2 * upper * distance), -1, 1);
  const away = Math.acos(cosUpper);
  upperDirection.copy(toTarget).multiplyScalar(Math.cos(away)).addScaledVector(elbowDirection, Math.sin(away));
  // From the elbow to the (reachable) target.
  reach.copy(pivot.position).addScaledVector(toTarget, distance);
  lowerDirection.copy(reach).sub(pivot.position).addScaledVector(upperDirection, -upper).normalize();
  // The pivot's frame: the limb hangs along its local -y; the mid pivot bends about local x,
  // swinging the lower segment from -y toward -z, so -z is the bend direction.
  bendDirection.copy(lowerDirection).addScaledVector(upperDirection, -lowerDirection.dot(upperDirection));
  if (bendDirection.lengthSq() < 1e-8) bendDirection.copy(elbowDirection).negate();
  bendDirection.normalize();
  axisY.copy(upperDirection).negate();
  axisZ.copy(bendDirection).negate();
  axisX.crossVectors(axisY, axisZ).normalize();
  axisZ.crossVectors(axisX, axisY).normalize();
  basis.makeBasis(axisX, axisY, axisZ);
  pivot.quaternion.setFromRotationMatrix(basis);
  mid.rotation.set(Math.atan2(lowerDirection.dot(bendDirection), lowerDirection.dot(upperDirection)), 0, 0);
  return Math.max(0, wanted - (upper + lower));
}

/** The seated hips' height above the figure's root, at scale 1. */
const SEATED_HIP = BODY.hipY - SEATED_BODY_DROP;
/** How far a smaller figure's seat slides toward the wheel and pedals per unit of scale under 1, in metres. */
const SEAT_SLIDE = 0.8;
const seatQuaternion = new THREE.Quaternion();
const seatForward = new THREE.Vector3();

/**
 * Where a figure's root goes to sit on `seat` (a contract seat node, whose
 * +z faces the way the figure faces): its hips on the node, which a smaller
 * figure reaches by sliding forward, as a real seat would. `scale` is the
 * figure's root scale. Writes `out` in world metres.
 */
export function seatRootPosition(seat: THREE.Object3D, scale: number, out = new THREE.Vector3()): THREE.Vector3 {
  seat.getWorldPosition(out);
  out.y -= SEATED_HIP * scale;
  seat.getWorldQuaternion(seatQuaternion);
  seatForward.set(0, 0, 1).applyQuaternion(seatQuaternion);
  seatForward.y = 0;
  if (seatForward.lengthSq() > 1e-8) out.addScaledVector(seatForward.normalize(), Math.max(0, 1 - scale) * SEAT_SLIDE);
  return out;
}

export interface SeatTargetPoints {
  /** Where each wrist goes, in world metres; the hands keep their pose without them. */
  hands?: { left: THREE.Vector3; right: THREE.Vector3 };
  /** Where each ankle goes, in world metres. */
  feet?: { left: THREE.Vector3; right: THREE.Vector3 };
}

const local = new THREE.Vector3();
const ARM_POLE_LEFT = new THREE.Vector3(-0.35, -1, -0.25);
const ARM_POLE_RIGHT = new THREE.Vector3(0.35, -1, -0.25);
const LEG_POLE = new THREE.Vector3(0, 0.35, 1);

/**
 * The figure's limbs as IK chains. An imported model moves the figure's hand
 * pivots onto its own wrists each frame (characterModels.ts), so the
 * forearm's length is read from where the hand pivot sits: the model's wrist
 * lands on the target, not the figure's.
 */
export function limbsOf(character: Character): { leftArm: Limb; rightArm: Limb; leftLeg: Limb; rightLeg: Limb } {
  const wrist = (hand: THREE.Object3D): number => Math.max(0.15, hand.position.length() || BODY.forearm);
  return {
    leftArm: { pivot: character.leftArm, mid: character.leftForearm, upper: BODY.upperArm, lower: wrist(character.leftHand) },
    rightArm: { pivot: character.rightArm, mid: character.rightForearm, upper: BODY.upperArm, lower: wrist(character.rightHand) },
    leftLeg: { pivot: character.leftLeg, mid: character.leftShin, upper: BODY.thigh, lower: BODY.shin },
    rightLeg: { pivot: character.rightLeg, mid: character.rightShin, upper: BODY.thigh, lower: BODY.shin },
  };
}

/**
 * Places a seated figure's limbs on its seat's targets. Call after the pose
 * code has set the seat (hips lowered, torso upright) and before the model
 * copies the pivots. Returns the largest shortfall, in metres, of any limb.
 */
export function poseSeated(character: Character, targets: SeatTargetPoints): number {
  const { body } = character;
  character.root.updateWorldMatrix(true, false);
  body.updateWorldMatrix(false, false);
  const limbs = limbsOf(character);
  let short = 0;
  const place = (limb: Limb, world: THREE.Vector3, pole: THREE.Vector3): void => {
    body.worldToLocal(local.copy(world));
    short = Math.max(short, solveLimb(limb, local, pole));
  };
  if (targets.hands) {
    place(limbs.leftArm, targets.hands.left, ARM_POLE_LEFT);
    place(limbs.rightArm, targets.hands.right, ARM_POLE_RIGHT);
    character.leftHand.rotation.set(0, 0, 0);
    character.rightHand.rotation.set(0, 0, 0);
  }
  if (targets.feet) {
    place(limbs.leftLeg, targets.feet.left, LEG_POLE);
    place(limbs.rightLeg, targets.feet.right, LEG_POLE);
  }
  return short;
}
