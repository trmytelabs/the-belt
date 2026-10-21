/**
 * The player's settings for the 3D game: music and effects levels and the
 * camera shake. Kept in the browser's local storage on this device, beside the
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
}

export const DEFAULT_SETTINGS: Readonly<GameSettings> = { music: 1, effects: 1, shake: true };

/** A level from 0 to 1 in steps of 5%; anything unreadable falls back to `fallback`. */
export function level(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(1, Math.max(0, value)) * 20) / 20 : fallback;
}

export function loadSettings(storage: RecordStorage | null): GameSettings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const data = JSON.parse(raw) as Partial<GameSettings>;
    return {
      music: level(data.music, DEFAULT_SETTINGS.music),
      effects: level(data.effects, DEFAULT_SETTINGS.effects),
      shake: typeof data.shake === 'boolean' ? data.shake : DEFAULT_SETTINGS.shake,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Writes the settings; a full or blocked storage keeps them for this visit only. */
export function saveSettings(storage: RecordStorage | null, settings: GameSettings): boolean {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify({ music: level(settings.music, 1), effects: level(settings.effects, 1), shake: settings.shake }));
    return storage !== null;
  } catch {
    return false;
  }
}
