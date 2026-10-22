/**
 * The player's settings for the 3D game: music and effects levels, the
 * camera shake and the drawing resolution. Kept in the browser's local storage on this device, beside the
 * night record; a storage that is missing or blocked just means the defaults.
 */
import type { RecordStorage } from './nightRecord.ts';

export const SETTINGS_KEY = 'the-belt:3d-settings:v1';

export interface GameSettings {
  /** Music level, 0 to 1. */
  music: number;
  /** Sound effects level, 0 to 1. */
  effects: number;
  /** Shake the camera when freight breaks (reduced motion turns it off regardless). */
  shake: boolean;
  /** The share of the renderer's usual pixel ratio to draw at, 0.5 to 1: lower is smoother on a slow or very sharp screen. */
  resolution: number;
  /** Two players on one keyboard (or two controllers): the second plays Skanky. */
  twoPlayers: boolean;
}

export const DEFAULT_SETTINGS: Readonly<GameSettings> = { music: 1, effects: 1, shake: true, resolution: 1, twoPlayers: false };
export const MIN_RESOLUTION = 0.5;

/** A level from 0 to 1 in steps of 5%; anything unreadable falls back to `fallback`. */
export function level(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(1, Math.max(0, value)) * 20) / 20 : fallback;
}

/** A resolution between `MIN_RESOLUTION` and 1 in steps of 5%. */
const resolution = (value: unknown): number => Math.max(MIN_RESOLUTION, level(value, DEFAULT_SETTINGS.resolution));

export function loadSettings(storage: RecordStorage | null): GameSettings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const data = JSON.parse(raw) as Partial<GameSettings>;
    return {
      music: level(data.music, DEFAULT_SETTINGS.music),
      effects: level(data.effects, DEFAULT_SETTINGS.effects),
      shake: typeof data.shake === 'boolean' ? data.shake : DEFAULT_SETTINGS.shake,
      resolution: resolution(data.resolution),
      twoPlayers: typeof data.twoPlayers === 'boolean' ? data.twoPlayers : DEFAULT_SETTINGS.twoPlayers,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Writes the settings; a full or blocked storage keeps them for this visit only. */
export function saveSettings(storage: RecordStorage | null, settings: GameSettings): boolean {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify({ music: level(settings.music, 1), effects: level(settings.effects, 1), shake: settings.shake, resolution: resolution(settings.resolution), twoPlayers: settings.twoPlayers === true }));
    return storage !== null;
  } catch {
    return false;
  }
}
