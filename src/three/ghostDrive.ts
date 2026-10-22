/**
 * Ghost drives (the 3D game only): the fastest drive the player has made to each yard in the five-ton, replayed as a
 * see-through truck on later drives to race. Kept in this device's local storage only; nothing leaves it.
 */

import type { DriveDestination } from './DrivingModel.ts';
import type { RecordStorage } from './nightRecord.ts';

export const GHOST_KEY = 'the-belt:3d-ghosts:v1';
/** Seconds between the poses a ghost keeps; the poses between are interpolated. */
export const GHOST_STEP = 0.2;
/** The longest drive a ghost keeps, in seconds. */
export const GHOST_MAX_SECONDS = 600;
const MAX_POSES = Math.round(GHOST_MAX_SECONDS / GHOST_STEP) + 2;

export interface GhostPose { x: number; z: number; heading: number }
/** A drive: how long it took, and its pose every `GHOST_STEP` seconds from the start (the last one parked). */
export interface GhostDrive { seconds: number; poses: GhostPose[] }
export type GhostStore = Partial<Record<DriveDestination, GhostDrive>>;

const round = (value: number, scale = 100): number => Math.round(value * scale) / scale;
const keep = (pose: GhostPose): GhostPose => ({ x: round(pose.x), z: round(pose.z), heading: round(pose.heading, 1000) });

/** Records a drive as it happens: one pose for each step of its clock passed. */
export class GhostRecorder {
  public readonly poses: GhostPose[] = [];

  public sample(elapsed: number, pose: GhostPose): void {
    while (this.poses.length < MAX_POSES - 1 && (this.poses.length * GHOST_STEP) <= elapsed + 1e-9) this.poses.push(keep(pose));
  }

  /** The finished drive, ending on the parked pose; null for one too long to keep. */
  public finish(seconds: number, pose: GhostPose): GhostDrive | null {
    if (!(seconds > 0) || seconds > GHOST_MAX_SECONDS) return null;
    this.sample(seconds, pose);
    return { seconds: round(seconds), poses: [...this.poses, keep(pose)] };
  }
}

/** Where a ghost is `seconds` into its drive: between its poses, and parked once it is over. */
export function ghostPose(ghost: GhostDrive, seconds: number): GhostPose {
  const { poses } = ghost;
  const at = Math.max(0, seconds) / GHOST_STEP;
  const index = Math.floor(at);
  if (index >= poses.length - 1) return poses[poses.length - 1];
  const a = poses[index], b = poses[index + 1], t = at - index;
  // The heading turns the short way round.
  const turn = Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading));
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: a.heading + turn * t };
}

/** Keeps `drive` as the ghost to `destination` when it is the first or the fastest; says how it compares. */
export function keepFaster(store: GhostStore, destination: DriveDestination, drive: GhostDrive): { store: GhostStore; newBest: boolean; previous: GhostDrive | null } {
  const previous = store[destination] ?? null;
  const newBest = previous === null || drive.seconds < previous.seconds;
  return { store: newBest ? { ...store, [destination]: drive } : store, newBest, previous };
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Reads the saved ghosts; anything missing, unreadable or odd is left out. */
export function loadGhosts(storage: RecordStorage | null): GhostStore {
  try {
    const raw = storage?.getItem(GHOST_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Record<string, { seconds?: unknown; poses?: unknown }>;
    const store: GhostStore = {};
    for (const destination of ['mall', 'ups'] as const) {
      const entry = data?.[destination];
      const flat = Array.isArray(entry?.poses) ? entry.poses : null;
      if (!entry || !finite(entry.seconds) || entry.seconds <= 0 || entry.seconds > GHOST_MAX_SECONDS) continue;
      if (!flat || flat.length < 6 || flat.length % 3 !== 0 || flat.length / 3 > MAX_POSES || !flat.every(finite)) continue;
      const poses: GhostPose[] = [];
      for (let i = 0; i < flat.length; i += 3) poses.push({ x: flat[i], z: flat[i + 1], heading: flat[i + 2] });
      store[destination] = { seconds: entry.seconds, poses };
    }
    return store;
  } catch {
    return {};
  }
}

/** Saves the ghosts, each pose as three numbers in a row to keep them small (a minute's drive is a few kilobytes). */
export function saveGhosts(storage: RecordStorage | null, store: GhostStore): void {
  const data: Record<string, { seconds: number; poses: number[] }> = {};
  for (const [destination, drive] of Object.entries(store)) {
    if (drive) data[destination] = { seconds: drive.seconds, poses: drive.poses.flatMap((pose) => [pose.x, pose.z, pose.heading]) };
  }
  try { storage?.setItem(GHOST_KEY, JSON.stringify(data)); } catch { /* No storage: the drive plays the same without a ghost. */ }
}
