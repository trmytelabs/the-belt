/**
 * Medals (the 3D game only): ten achievements kept with the night record on
 * this device. Each is earned once, at the results of the night that earns it,
 * and the briefing counts them.
 */

/** What a finished (or failed) night shows, with the record as it stands after it. */
export interface NightFacts {
  won: boolean;
  grade: string;
  peak: boolean;
  goalsMet: number;
  goalsTotal: number;
  priorityCount: number;
  priorityOnTime: number;
  bestCombo: number;
  wrongDrops: number;
  damaged: number;
  missed: number;
  /** The five-ton came home to UPS with no bumps and no red lights all night. */
  safeDrive: boolean;
  openersSeen: number;
  nightsPlayed: number;
}

export interface Medal {
  id: string;
  /** Shown when it is earned and in the medal list. */
  title: string;
  /** How it is earned. */
  detail: string;
  earned(facts: NightFacts): boolean;
}

export const MEDALS: readonly Medal[] = [
  { id: 'first-shift', title: 'FIRST SHIFT', detail: 'Finish a shift', earned: (f) => f.won },
  { id: 's-rank', title: 'S RANK', detail: 'Finish a shift with an S', earned: (f) => f.won && f.grade === 'S' },
  { id: 'peak', title: 'PEAK SURVIVOR', detail: 'Finish a peak night', earned: (f) => f.won && f.peak },
  { id: 'all-goals', title: 'GOAL GETTER', detail: 'Meet all three night goals', earned: (f) => f.goalsTotal > 0 && f.goalsMet === f.goalsTotal },
  { id: 'on-the-dot', title: 'ON THE DOT', detail: 'Make every priority parcel on time, at least three', earned: (f) => f.priorityCount >= 3 && f.priorityOnTime === f.priorityCount },
  { id: 'twenty', title: 'TWENTY STRAIGHT', detail: 'Load 20 in a row', earned: (f) => f.bestCombo >= 20 },
  { id: 'clean-sheet', title: 'CLEAN SHEET', detail: 'Finish with no wrong drops, nothing broken and nothing missed', earned: (f) => f.won && f.wrongDrops === 0 && f.damaged === 0 && f.missed === 0 },
  { id: 'safe-driver', title: 'SAFE DRIVER', detail: 'Bring the five-ton home with no bumps or red lights', earned: (f) => f.safeDrive },
  { id: 'seen-it-all', title: 'SEEN IT ALL', detail: 'See all three openers', earned: (f) => f.openersSeen >= 3 },
  { id: 'regular', title: 'REGULAR', detail: 'Work ten nights', earned: (f) => f.nightsPlayed >= 10 },
];

export const MEDAL_IDS: ReadonlySet<string> = new Set(MEDALS.map((medal) => medal.id));

/** The medals held after a night, in list order, and those this night earned for the first time. */
export function awardMedals(held: readonly string[], facts: NightFacts): { medals: string[]; fresh: Medal[] } {
  const have = new Set(held.filter((id) => MEDAL_IDS.has(id)));
  const fresh = MEDALS.filter((medal) => !have.has(medal.id) && medal.earned(facts));
  for (const medal of fresh) have.add(medal.id);
  return { medals: MEDALS.filter((medal) => have.has(medal.id)).map((medal) => medal.id), fresh };
}
