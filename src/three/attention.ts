import type { Character } from './characters';

/**
 * Where the crew look (the 3D depot only). A standing or walking character
 * turns its head to the nearest person speaking within earshot, else to a
 * worker passing close by, else looks where it is going. The choice is a pure
 * function here so the model tests can check it; `Actor.animate` and
 * `StageActor.animate` ease the head toward the chosen point with
 * `lookToward`, which also clamps the turn so nobody looks over a shoulder.
 */

/** A point in the world to look at, at the height of the thing looked at (a head, a parcel). */
export interface Gaze { x: number; y: number; z: number }
/** Someone speaking: their head, and when their line ends. */
export interface Speaker extends Gaze { id: string; until: number }

/** How far a voice carries the crew's attention, in metres. */
export const VOICE_RANGE = 9;
/** How close a passing worker must come to be looked at, in metres. */
export const PASSING_RANGE = 2.2;
/**
 * Beyond this angle off the facing (radians, about 63 degrees) a passing worker would need the body to turn,
 * so the head stays put. At 1.75 heads swung to their limit and back whenever someone passed beside.
 */
export const LOOK_CONE = 1.1;
/** A voice draws the eye from wider (about 100 degrees): someone speaking beside you is worth the turn. */
export const VOICE_CONE = 1.75;
/** How far the head turns either way (radians, about 40 degrees). */
export const HEAD_TURN = 0.7;
/** How quickly the head eases toward its target, per second: about a third of a second to get most of the way. */
const HEAD_EASE = 3;
/** Nobody looks at something closer than this: it is under their nose, or themselves. */
const TOO_CLOSE = 0.3;

/**
 * Chooses what a standing character looks at: the nearest person speaking within
 * `voiceRange` (never itself) within `VOICE_CONE`, else the nearest of `others` within `otherRange`
 * and `LOOK_CONE`, else nothing.
 */
export function lookTargetFor(
  self: { id: string; x: number; z: number; facing: number },
  now: number,
  speakers: readonly Speaker[],
  others: readonly Gaze[] = [],
  ranges: { voice?: number; other?: number } = {},
): Gaze | null {
  const nearest = (list: readonly Gaze[], range: number, cone: number): Gaze | null => {
    let best: Gaze | null = null;
    let bestDistance = range;
    for (const gaze of list) {
      const distance = Math.hypot(gaze.x - self.x, gaze.z - self.z);
      if (distance >= bestDistance || distance < TOO_CLOSE || Math.abs(bearingOf(self, gaze)) > cone) continue;
      best = gaze;
      bestDistance = distance;
    }
    return best;
  };
  const voices = speakers.filter((speaker) => speaker.id !== self.id && speaker.until > now);
  return nearest(voices, ranges.voice ?? VOICE_RANGE, VOICE_CONE) ?? nearest(others, ranges.other ?? PASSING_RANGE, LOOK_CONE);
}

/** The target's bearing off the facing (radians, left negative) for a figure that faces +z at yaw 0. */
export function bearingOf(self: { x: number; z: number; facing: number }, gaze: Gaze): number {
  const bearing = Math.atan2(gaze.x - self.x, gaze.z - self.z) - self.facing;
  return Math.atan2(Math.sin(bearing), Math.cos(bearing));
}

/** A world gaze point in the figure's own frame (facing +z, left −x), with its height over the eyes, for `lookToward`. */
export function gazeInFigureFrame(character: Character, gaze: Gaze): { x: number; z: number; y: number } {
  const { root, headHeight } = character;
  const dx = gaze.x - root.position.x;
  const dz = gaze.z - root.position.z;
  const facing = root.rotation.y;
  return {
    x: dx * Math.cos(facing) - dz * Math.sin(facing),
    z: dx * Math.sin(facing) + dz * Math.cos(facing),
    y: gaze.y - (root.position.y + eyeHeight(headHeight)),
  };
}

/** The eyes sit a little below the top of the head. */
export const eyeHeight = (headHeight: number): number => headHeight * 0.92;

/**
 * Eases the head toward `target` in the figure's own frame (facing +z, left −x): yaw
 * clamped to `HEAD_TURN` either way, pitch from the target's height when given, else
 * down at the belt. Reduced motion, or no target, eases the head back to centre.
 */
export function lookToward(character: Character, target: { x: number; z: number; y?: number } | null, dt: number, reducedMotion = false): void {
  let yaw = 0;
  let pitch = 0;
  if (target && !reducedMotion) {
    const distance = Math.hypot(target.x, target.z);
    if (distance > 1e-3) {
      // The figure faces +Z and its left side is -X: a point straight ahead has yaw 0, to its left negative.
      yaw = Math.max(-HEAD_TURN, Math.min(HEAD_TURN, Math.atan2(target.x, target.z)));
      // Work on the belt is looked down at; a point with a height (another head) sets its own pitch, down positive.
      pitch = target.y === undefined ? distance < 2.8 ? 0.2 : 0.08 : Math.max(-0.5, Math.min(0.6, -Math.atan2(target.y, distance)));
    }
  }
  const ease = Math.min(1, dt * HEAD_EASE);
  character.head.rotation.y += (yaw - character.head.rotation.y) * ease;
  character.head.rotation.x += (pitch - character.head.rotation.x) * ease;
}
