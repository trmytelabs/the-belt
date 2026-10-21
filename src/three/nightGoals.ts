/**
 * Night goals (the 3D depot only): three optional targets each night, shown in
 * the briefing and paid at the results. They rotate with the nights recorded on
 * this device, so the next night asks something different. Goals that can
 * happen mid-shift (a streak) are announced the moment they are reached; goals
 * about a clean shift (nothing broken) are judged only once the shift is done.
 */

/** The shift figures the goals read: the 3D shift model has them all. */
export interface GoalShift {
  won: boolean;
  bestCombo: number;
  wrongDrops: number;
  priorityOnTime: number;
  thrownDeliveries: number;
  damaged: number;
  missed: number;
  bulkSorted: number;
  beltStopsRemaining: number;
}

/** A goal's short form for the HUD: met, still open, or already out of reach tonight. */
export interface GoalChip { text: string; state: 'met' | 'open' | 'lost' }

export interface NightGoal {
  id: string;
  /** Read in the briefing, the toast and the results. */
  label: string;
  /** Reached during the shift (and announced), rather than judged on a completed one. */
  live: boolean;
  met(shift: GoalShift): boolean;
  /** The HUD chip: a count towards a live goal, or whether a clean-shift goal still stands. */
  chip(shift: GoalShift): GoalChip;
}

export const GOAL_BONUS = 150;
export const GOALS_PER_NIGHT = 3;
const BELT_STOPS = 3;

/**
 * The goals, ordered so any three in a row (wrapping) mix the kinds and never
 * pair the two streaks. Live goals only count up, so a goal met during the
 * shift is still met at the results.
 */
/** A goal reached by counting up to `target`. */
const count = (id: string, label: string, short: string, target: number, value: (s: GoalShift) => number): NightGoal => ({
  id, label, live: true,
  met: (s) => value(s) >= target,
  chip: (s) => ({ text: `${short} ${Math.min(value(s), target)}/${target}`, state: value(s) >= target ? 'met' : 'open' }),
});
/** A goal about a clean shift: met by finishing while it still `holds`. */
const clean = (id: string, label: string, short: string, holds: (s: GoalShift) => boolean): NightGoal => ({
  id, label, live: false,
  met: (s) => s.won && holds(s),
  chip: (s) => ({ text: short, state: !holds(s) ? 'lost' : s.won ? 'met' : 'open' }),
});

export const NIGHT_GOALS: readonly NightGoal[] = [
  count('streak', 'Load 8 in a row', 'STREAK', 8, (s) => s.bestCombo),
  clean('clean', 'Finish with no wrong drops', 'NO WRONG DROPS', (s) => s.wrongDrops === 0),
  count('priority', 'Make 3 priority parcels on time', 'PRIORITY', 3, (s) => s.priorityOnTime),
  count('thrower', 'Throw 3 in clean', 'CLEAN THROWS', 3, (s) => s.thrownDeliveries),
  clean('no-stop', 'Finish without stopping the belt', 'NO BELT STOPS', (s) => s.beltStopsRemaining >= BELT_STOPS),
  count('bulk', 'Send 8 to bulk', 'BULK', 8, (s) => s.bulkSorted),
  count('long-streak', 'Load 15 in a row', 'STREAK', 15, (s) => s.bestCombo),
  clean('unbroken', 'Finish with nothing broken', 'NOTHING BROKEN', (s) => s.damaged === 0),
  clean('few-misses', 'Finish with 2 or fewer missed', '2 MISSED AT MOST', (s) => s.missed <= 2),
];

/**
 * The goals for the night after `played` recorded nights: three in a row from
 * a start that steps by four, so nine nights see nine different sets.
 */
export function nightGoals(played: number): NightGoal[] {
  const night = Number.isFinite(played) && played > 0 ? Math.floor(played) : 0;
  const start = night * 4 % NIGHT_GOALS.length;
  return Array.from({ length: GOALS_PER_NIGHT }, (_, k) => NIGHT_GOALS[(start + k) % NIGHT_GOALS.length]);
}

/** The goals met by a finished night and the bonus they pay. */
export function judgeGoals(goals: readonly NightGoal[], shift: GoalShift): { met: NightGoal[]; bonus: number } {
  const met = goals.filter((goal) => goal.met(shift));
  return { met, bonus: met.length * GOAL_BONUS };
}
