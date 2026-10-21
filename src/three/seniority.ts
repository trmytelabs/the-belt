/**
 * Seniority in the 3D depot: a title earned from the record's finished nights
 * and medals, named on the briefing and announced on the results when it
 * rises. It is worked out from the record each time, so nothing more is stored.
 */

import { MEDALS } from './medals.ts';
import type { NightRecord } from './nightRecord.ts';

/** A title and what it takes: this many finished nights and medals. */
export interface Rank { title: string; nights: number; medals: number }

export const RANKS: readonly Rank[] = [
  { title: 'NEW HIRE', nights: 0, medals: 0 },
  { title: 'PART-TIMER', nights: 1, medals: 0 },
  { title: 'LOADER', nights: 3, medals: 0 },
  { title: 'SENIOR LOADER', nights: 6, medals: 3 },
  { title: 'PRELOAD LEAD', nights: 10, medals: 6 },
  { title: 'BELT LEGEND', nights: 15, medals: MEDALS.length },
];

export interface Seniority { rank: Rank; level: number; next: Rank | null }

/** The highest rank the record has reached (ranks are climbed in order), and the next one, or null at the top. */
export function seniority(record: Pick<NightRecord, 'completed' | 'medals'>): Seniority {
  let level = 0;
  while (level + 1 < RANKS.length && record.completed >= RANKS[level + 1].nights && record.medals.length >= RANKS[level + 1].medals) level += 1;
  return { rank: RANKS[level], level, next: RANKS[level + 1] ?? null };
}

/** What a rank asks for, in capitals: "6 FINISHED NIGHTS AND 3 MEDALS". */
export function rankNeeds(rank: Rank): string {
  const nights = `${rank.nights} FINISHED ${rank.nights === 1 ? 'NIGHT' : 'NIGHTS'}`;
  if (rank.medals === 0) return nights;
  return `${nights} AND ${rank.medals >= MEDALS.length ? 'EVERY MEDAL' : `${rank.medals} ${rank.medals === 1 ? 'MEDAL' : 'MEDALS'}`}`;
}
