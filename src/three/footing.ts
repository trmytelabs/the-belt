import * as THREE from 'three';
import type { Character } from './characters';
import { BODY } from './figure.ts';
import { limbsOf, solveLimb } from './seating.ts';

/**
 * Feet on the stairs (the 3D depot only). On a flat floor the figure's walk
 * cycle swings its legs and the feet land where they land. On a stair flight
 * the root rides the tread under the hips while each foot would hang in the
 * air over the tread below or push through the tread above; `plantFeet`
 * puts each ankle on the surface under it instead, bending the uphill knee
 * and reaching the downhill foot, with the swinging foot keeping its lift.
 * The same two-bone solver that seats a driver does it, on the figure's own
 * pivots, so an imported model (whose legs follow the figure on a flight)
 * and the software fallback look alike.
 */
/** The ankle's height over the sole when the foot stands flat. */
const ANKLE = 0.05;
/** A foot this far above its tread (over the ankle's own height) is mid-swing and keeps its lift; a planted leg angled by a stride lifts its ankle less. */
const SWING = 0.1;
/** Treads under the two feet within this of each other are one floor; the walk cycle handles it. */
const FLAT = 0.02;
const KNEE_POLE = new THREE.Vector3(0, 0.35, 1);
const ankleOffset = new THREE.Vector3();
const ankleWorld = new THREE.Vector3();
const hipWorld = new THREE.Vector3();
const local = new THREE.Vector3();

/**
 * Plants the feet when the floor under them differs from the floor under the
 * hips; `surfaceAt(x, z)` gives the floor height in world metres under a
 * world point. Returns true when the feet were planted (the figure's motion
 * record notes it, so a model's legs follow the figure).
 */
export function plantFeet(character: Character, surfaceAt: (x: number, z: number) => number): boolean {
  const { root, body } = character;
  root.updateWorldMatrix(true, true);
  const base = root.position.y;
  const limbs = limbsOf(character);
  const legs = [
    { limb: limbs.leftLeg, shin: character.leftShin },
    { limb: limbs.rightLeg, shin: character.rightShin },
  ];
  const grounds = legs.map(({ shin }) => {
    shin.localToWorld(ankleOffset.set(0, -BODY.shin, 0));
    return { ankle: ankleOffset.clone(), ground: surfaceAt(ankleOffset.x, ankleOffset.z) };
  });
  if (grounds.every(({ ground }) => Math.abs(ground - base) < FLAT)) return false;
  const scale = root.scale.x;
  const reach = (BODY.thigh + BODY.shin - 0.002) * scale;
  legs.forEach(({ limb }, i) => {
    const { ankle, ground } = grounds[i];
    // The ankle keeps its x and z; its height is the tread's, or its own lift while mid-swing.
    const lift = ankle.y - base;
    let y = ground + (lift > (ANKLE + SWING) * scale ? lift : ANKLE * scale);
    // No further down than the leg reaches straight at that spread, so a foot over a deep step hovers rather than slides.
    limb.pivot.getWorldPosition(hipWorld);
    const spread = Math.hypot(ankle.x - hipWorld.x, ankle.z - hipWorld.z);
    y = Math.max(y, hipWorld.y - Math.sqrt(Math.max(0, reach * reach - spread * spread)));
    ankleWorld.set(ankle.x, y, ankle.z);
    body.worldToLocal(local.copy(ankleWorld));
    solveLimb(limb, local, KNEE_POLE);
  });
  if (character.motion) character.motion.stairs = true;
  return true;
}
