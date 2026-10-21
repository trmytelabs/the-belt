/**
 * The night's wind (the 3D depot only): a steady breeze blowing toward −x with
 * slow swells and, every two minutes or so, a gust that lasts a few seconds.
 * A pure function of time, so every snowfall in the game (the depot yards,
 * the lot and the other stages, the road) blows the same way at the same
 * moment, and the model tests can check it.
 */

/** The strongest the wind gets, metres per second. */
export const WIND_MAX = 6;
/** The breeze between gusts never drops below this. */
export const WIND_MIN = 0.2;

export interface Wind {
  /** Metres per second along x (negative: blowing toward −x). */
  x: number;
  /** Metres per second along z, a slow wander either way. */
  z: number;
  /** How far into a gust the moment is, 0 to 1. */
  gust: number;
}

export function windAt(time: number): Wind {
  const swell = Math.sin(time / 7.3) * 1.1 + Math.sin(time / 2.9 + 1.7) * 0.6;
  // A sharp bump about once every two minutes, a few seconds wide at its peak.
  const gust = Math.max(0, Math.sin(time / 19 + 0.4)) ** 9;
  const speed = Math.min(WIND_MAX, Math.max(WIND_MIN, 1.6 + swell + gust * 3.5));
  const z = Math.sin(time / 5.1) * 0.45 + Math.sin(time / 1.7 + 0.9) * 0.15 * (1 + gust);
  return { x: -speed, z, gust };
}
