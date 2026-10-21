/**
 * Racing your best night (the 3D depot only): the shift's score is noted every
 * `PACE_STEP_MS` of shift time, the best night keeps those notes with the
 * record, and a later night's HUD shows how far ahead or behind that pace it
 * is at the same moment of the shift.
 */

/** Shift time between notes of the score. */
export const PACE_STEP_MS = 5_000;
/** The most notes kept: enough for the three-minute shift, its clean-up time and some spare. */
export const PACE_SAMPLES = 48;

/** Notes `score` for every step of shift time that `elapsedMs` has reached and `samples` lacks, up to `PACE_SAMPLES`. */
export function samplePace(samples: number[], elapsedMs: number, score: number): void {
  const step = Math.floor(Math.max(0, elapsedMs) / PACE_STEP_MS);
  while (samples.length <= step && samples.length < PACE_SAMPLES) samples.push(Math.max(0, Math.round(score)));
}

/** The noted score at `elapsedMs`, between its two nearest notes; null without notes. Past the last note it holds. */
export function paceAt(samples: readonly number[] | undefined, elapsedMs: number): number | null {
  if (!samples || samples.length === 0) return null;
  const at = Math.max(0, elapsedMs) / PACE_STEP_MS;
  const before = Math.min(samples.length - 1, Math.floor(at));
  const after = Math.min(samples.length - 1, before + 1);
  return samples[before] + (samples[after] - samples[before]) * Math.min(1, at - before);
}

/** Notes read back from storage: whole, non-negative numbers, at most `PACE_SAMPLES`, or none. */
export function cleanPace(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const samples = value.slice(0, PACE_SAMPLES).map((sample) => typeof sample === 'number' && Number.isFinite(sample) && sample > 0 ? Math.floor(sample) : 0);
  return samples.length ? samples : undefined;
}
