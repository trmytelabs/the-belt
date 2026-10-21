import * as THREE from 'three';
import type { Character } from './characters';
import { BODY } from './figure.ts';

/**
 * Footfalls read off the feet themselves (the 3D depot only), so the sound
 * lands when the visible foot does: an imported model's foot bones when a
 * model is attached and playing its clips, else the figure's ankles. A foot
 * that rises off its recent floor and then stops descending has landed. The
 * remembered floor follows the foot down a step and climbs back slowly, so
 * the stairs count too.
 */

export type Foot = 'left' | 'right';
/** A foot this high over its recent floor (metres, before the figure's scale) is in the air. */
const LIFT = 0.07;
/** Below this much descent between two frames the foot has stopped falling. */
const SETTLE = 0.002;
/** The shortest gap between two footfalls of one person, in seconds. */
export const STEP_GAP = 0.18;
/**
 * How fast the remembered floor drifts back up, metres per second: slow, so a foot
 * rising off it reads as a lift; a landing resets the floor to the foot outright.
 */
const FLOOR_RISE = 0.05;

interface FootState { floor: number; previous: number; up: boolean; descending: boolean }
interface Tracker { feet: [FootState, FootState]; lastStep: number; lastTime: number }
const trackers = new WeakMap<Character, Tracker>();
const point = new THREE.Vector3();
const base = new THREE.Vector3();

/**
 * The height of each foot over the root: the model's foot bones, or the figure's
 * ankles. Over the root, so the root riding up a tread does not lift both feet
 * at once; a planted foot's own tread shows as a step in its remembered floor.
 */
function footHeights(character: Character, feet: readonly [THREE.Object3D, THREE.Object3D] | null): [number, number] {
  const floor = character.root.getWorldPosition(base).y;
  if (feet) return [feet[0].getWorldPosition(point).y - floor, feet[1].getWorldPosition(point).y - floor];
  const ankle = (shin: THREE.Object3D): number => shin.localToWorld(point.set(0, -BODY.shin, 0)).y - floor;
  return [ankle(character.leftShin), ankle(character.rightShin)];
}

/**
 * Reports a foot that landed this frame, or null. Call once per frame with
 * the same world matrices the last draw used; a frame in which neither foot
 * moved is skipped, so a renderer that spaces its draws out never hears a
 * foot land in mid-air.
 */
export function footfall(character: Character, feet: readonly [THREE.Object3D, THREE.Object3D] | null, now: number): Foot | null {
  const heights = footHeights(character, feet);
  const scale = character.root.scale.x || 1;
  let tracker = trackers.get(character);
  if (!tracker) {
    const fresh = (height: number): FootState => ({ floor: height, previous: height, up: false, descending: false });
    tracker = { feet: [fresh(heights[0]), fresh(heights[1])], lastStep: -Infinity, lastTime: now };
    trackers.set(character, tracker);
    return null;
  }
  if (heights[0] === tracker.feet[0].previous && heights[1] === tracker.feet[1].previous) return null;
  const dt = Math.max(0, Math.min(0.1, now - tracker.lastTime));
  tracker.lastTime = now;
  let landed: Foot | null = null;
  heights.forEach((height, index) => {
    const foot = tracker.feet[index];
    foot.floor = Math.min(height, foot.floor + FLOOR_RISE * dt);
    const descending = height < foot.previous - SETTLE;
    if (height > foot.floor + LIFT * scale) foot.up = true;
    else if (foot.up && foot.descending && !descending) {
      foot.up = false;
      foot.floor = height;
      if (now - tracker.lastStep >= STEP_GAP) {
        landed = index === 0 ? 'left' : 'right';
        tracker.lastStep = now;
      }
    }
    foot.descending = descending;
    foot.previous = height;
  });
  return landed;
}
