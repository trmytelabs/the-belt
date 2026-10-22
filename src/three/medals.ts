/**
 * Medals (the 3D game only): thirteen achievements kept with the night record
 * on this device. Each is earned once, at the results of the night (or endless
 * shift) that earns it, and the briefing counts them.
 */

/** The endless shift's two medals: the level to reach, and the freight to dispatch in one run. */
export const ENDLESS_MEDALS = { level: 5, sorted: 60 } as const;

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
  /** Tonight's longest throw that landed clean, in metres (0 for none). */
  longestThrowM?: number;
  /** The five-ton came home to UPS with no bumps and no red lights all night. */
  safeDrive: boolean;
  openersSeen: number;
  nightsPlayed: number;
  /** An endless shift's last level and freight dispatched; absent for a night. */
  endlessLevel?: number;
  endlessSorted?: number;
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
  { id: 'long-haul', title: 'LONG HAUL', detail: `Reach level ${ENDLESS_MEDALS.level} in an endless shift`, earned: (f) => (f.endlessLevel ?? 0) >= ENDLESS_MEDALS.level },
  { id: 'trick-shot', title: 'TRICK SHOT', detail: 'Land a throw of 7.5 m or more', earned: (f) => (f.longestThrowM ?? 0) >= 7.5 },
  { id: 'marathon', title: 'BELT MARATHON', detail: `Dispatch ${ENDLESS_MEDALS.sorted} in one endless shift`, earned: (f) => (f.endlessSorted ?? 0) >= ENDLESS_MEDALS.sorted },
];

export const MEDAL_IDS: ReadonlySet<string> = new Set(MEDALS.map((medal) => medal.id));

/** The medals held after a night, in list order, and those this night earned for the first time. */
export function awardMedals(held: readonly string[], facts: NightFacts): { medals: string[]; fresh: Medal[] } {
  const have = new Set(held.filter((id) => MEDAL_IDS.has(id)));
  const fresh = MEDALS.filter((medal) => !have.has(medal.id) && medal.earned(facts));
  for (const medal of fresh) have.add(medal.id);
  return { medals: MEDALS.filter((medal) => have.has(medal.id)).map((medal) => medal.id), fresh };
}
