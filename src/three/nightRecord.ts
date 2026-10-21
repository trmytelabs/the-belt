/**
 * The player's record between nights (the 3D depot only): how many nights
 * they have worked and finished, their best night and which of the three
 * openers they have seen. Kept in the browser's local storage on this device
 * only; nothing leaves it. A storage that is missing, full or blocked (a
 * private window) just means no record: the game plays the same without one.
 */

import { MEDAL_IDS } from './medals.ts';

export const RECORD_KEY = 'the-belt:3d-record:v1';
export const OPENER_COUNT = 3;

export interface BestNight { total: number; grade: string; sorted: number; date: string }
export interface NightRecord {
  /** Nights that reached the results: finished shifts and failed ones alike. */
  played: number;
  /** Shifts completed. */
  completed: number;
  best: BestNight | null;
  /** The opener scenes seen so far, by id. */
  openers: string[];
  /** The medals earned so far, by id (`medals.ts`). */
  medals: string[];
}
export interface NightResult { won: boolean; total: number; grade: string; sorted: number; opener: string; date: string }

/** The subset of the Web Storage API the record needs, so the model tests can hand in a stand-in. */
export interface RecordStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export const emptyRecord = (): NightRecord => ({ played: 0, completed: 0, best: null, openers: [], medals: [] });

const count = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

/** Reads the record, or an empty one when there is none or it cannot be read or trusted. */
export function loadRecord(storage: RecordStorage | null): NightRecord {
  try {
    const raw = storage?.getItem(RECORD_KEY);
    if (!raw) return emptyRecord();
    const data = JSON.parse(raw) as Partial<NightRecord>;
    const best = data.best && typeof data.best === 'object' && Number.isFinite(data.best.total)
      ? { total: count(data.best.total), grade: String(data.best.grade ?? '').slice(0, 2), sorted: count(data.best.sorted), date: String(data.best.date ?? '').slice(0, 10) }
      : null;
    const openers = Array.isArray(data.openers) ? [...new Set(data.openers.filter((id): id is string => typeof id === 'string' && /^opener-\d$/.test(id)))] : [];
    const played = count(data.played);
    const medals = Array.isArray(data.medals) ? [...new Set(data.medals.filter((id): id is string => typeof id === 'string' && MEDAL_IDS.has(id)))] : [];
    return { played, completed: Math.min(count(data.completed), played), best, openers, medals };
  } catch {
    return emptyRecord();
  }
}

/** Writes the record; a full or blocked storage keeps the night unrecorded rather than stopping the game. */
export function saveRecord(storage: RecordStorage | null, record: NightRecord): boolean {
  try {
    storage?.setItem(RECORD_KEY, JSON.stringify(record));
    return storage !== null;
  } catch {
    return false;
  }
}

/**
 * The record after one more night, whether it set a new best, and the best it
 * had to beat. Only a completed shift can set a best night.
 */
export function recordNight(record: NightRecord, night: NightResult): { record: NightRecord; newBest: boolean; previous: BestNight | null } {
  const previous = record.best;
  const newBest = night.won && (previous === null || night.total > previous.total);
  return {
    record: {
      played: record.played + 1,
      completed: record.completed + (night.won ? 1 : 0),
      best: newBest ? { total: night.total, grade: night.grade, sorted: night.sorted, date: night.date } : previous,
      openers: record.openers.includes(night.opener) ? record.openers : [...record.openers, night.opener],
      medals: record.medals,
    },
    newBest,
    previous,
  };
}

/** The browser's local storage, or null where it is unavailable or blocked. */
export function browserStorage(): RecordStorage | null {
  try {
    const storage = window.localStorage;
    const probe = `${RECORD_KEY}:probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/** A night total as the results show it: five digits. */
export const formatTotal = (total: number): string => String(Math.max(0, Math.round(total))).padStart(5, '0');
