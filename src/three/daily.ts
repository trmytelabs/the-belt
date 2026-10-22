/**
 * The daily challenge (the 3D game only): one night a day, the same on every device. The date seeds the freight
 * (its mix, addresses and surprises), the throws' luck, the mystery boxes' prizes, the story's choices, the night's
 * goals and its rule (one of the perks). It plays like JUST PLAY, without the story scenes. Today's best and the run
 * of days played in a row are kept in this device's local storage only; nothing leaves it.
 */

import { nightGoals, type NightGoal } from './nightGoals.ts';
import { PERKS, type Perk } from './perks.ts';
import type { RecordStorage } from './nightRecord.ts';

export const DAILY_KEY = 'the-belt:3d-daily:v1';

const pad = (value: number): string => String(value).padStart(2, '0');
/** A date on this device's calendar, as YYYY-MM-DD. */
export const dailyDate = (now: Date = new Date()): string => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The day before a YYYY-MM-DD date. */
export function previousDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return dailyDate(new Date(year, month - 1, day - 1));
}

/** A 32-bit seed from a date (FNV-1a). */
export function dailySeed(date: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < date.length; i++) hash = Math.imul(hash ^ date.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

/** A small seeded generator (mulberry32): the same seed gives the same numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DailyNight {
  date: string;
  seed: number;
  /** The day's rule. */
  perk: Perk;
  goals: NightGoal[];
  /** Separate streams, so the freight never depends on how many throws were made or boxes opened. */
  random: { freight: () => number; throws: () => number; prizes: () => number; story: () => number };
}

/** The daily challenge for a date: its rule, its goals and its random streams. */
export function dailyNight(date: string): DailyNight {
  const seed = dailySeed(date);
  return {
    date, seed,
    perk: PERKS[seed % PERKS.length],
    goals: nightGoals(Math.floor(seed / PERKS.length)),
    random: {
      freight: seededRandom(seed),
      throws: seededRandom(seed ^ 0x9e3779b9),
      prizes: seededRandom(seed ^ 0x85ebca6b),
      story: seededRandom(seed ^ 0xc2b2ae35),
    },
  };
}

/** Today's tries and best, and the days played in a row up to and including the last day played. */
export interface DailyRecord { date: string; tries: number; best: number | null; grade: string; streak: number }

export const emptyDaily = (date: string): DailyRecord => ({ date, tries: 0, best: null, grade: '', streak: 0 });
const count = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

/** The record for `today`: today's own, or a fresh one whose run of days carries on only from yesterday. */
export function loadDaily(storage: RecordStorage | null, today: string): DailyRecord {
  try {
    const raw = storage?.getItem(DAILY_KEY);
    if (!raw) return emptyDaily(today);
    const data = JSON.parse(raw) as Partial<DailyRecord>;
    const date = typeof data.date === 'string' && DATE.test(data.date) ? data.date : '';
    const tries = count(data.tries), streak = count(data.streak);
    if (date === today) {
      return { date, tries, best: tries > 0 && typeof data.best === 'number' ? count(data.best) : null, grade: String(data.grade ?? '').slice(0, 2), streak };
    }
    return { ...emptyDaily(today), streak: date === previousDay(today) && tries > 0 ? streak : 0 };
  } catch {
    return emptyDaily(today);
  }
}

/** A daily night that reached its results: one more try, a new best when higher, and the first try today extends the run. */
export function recordDaily(record: DailyRecord, total: number, grade: string): { record: DailyRecord; newBest: boolean } {
  const newBest = record.best === null || total > record.best;
  return {
    record: {
      date: record.date, tries: record.tries + 1,
      best: newBest ? total : record.best, grade: newBest ? grade : record.grade,
      streak: record.tries === 0 ? record.streak + 1 : record.streak,
    },
    newBest,
  };
}

export function saveDaily(storage: RecordStorage | null, record: DailyRecord): void {
  try { storage?.setItem(DAILY_KEY, JSON.stringify(record)); } catch { /* No storage: the challenge plays the same without one. */ }
}
