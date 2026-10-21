/**
 * Night perks (the 3D game only): once a night is finished, the briefing offers
 * three of six perks and the one picked changes that night's rules only. The
 * offer rotates with the nights on record. Endless shifts take no perk, so
 * their bests stay comparable.
 */

/** The rules a perk can change on a shift that has not started yet (\`ShiftModel3D\` has them all). */
export interface PerkTarget {
  beltStopsLimit: number;
  beltStopsRemaining: number;
  priorityWindowMs: number;
  walkPace: number;
  rushPace: number;
  inspectionPay: number;
  capacity: number;
}

export interface Perk {
  id: string;
  title: string;
  detail: string;
  apply(target: PerkTarget): void;
}

export const PERKS: readonly Perk[] = [
  { id: 'extra-stop', title: 'ONE MORE STOP', detail: 'Four belt stops tonight instead of three', apply: (m) => { m.beltStopsLimit = 4; m.beltStopsRemaining = 4; } },
  { id: 'longer-priority', title: 'PRIORITY GRACE', detail: 'Priority freight gives you 20 seconds instead of 15', apply: (m) => { m.priorityWindowMs = 20_000; } },
  { id: 'roomy-recovery', title: 'ROOMY RECOVERY', detail: 'Recovery holds one more parcel before the shift ends', apply: (m) => { m.capacity += 1; } },
  { id: 'quick-feet', title: 'QUICK FEET', detail: 'Both workers walk 6% faster', apply: (m) => { m.walkPace = 1.06; } },
  { id: 'easy-rush', title: 'EASY RUSH', detail: 'The rush sends freight a tenth less often', apply: (m) => { m.rushPace = 1.1; } },
  { id: 'favourite', title: "SUPERVISOR'S FAVOURITE", detail: 'Watched loads pay 75 instead of 50', apply: (m) => { m.inspectionPay = 75; } },
];

export const PERKS_PER_NIGHT = 3;

/** The three perks offered for the night after \`played\` recorded nights; six nights see six different offers. */
export function perkOffer(played: number): Perk[] {
  const night = Number.isFinite(played) && played > 0 ? Math.floor(played) : 0;
  const start = night % PERKS.length;
  return [0, 1, 3].map((step) => PERKS[(start + step) % PERKS.length]);
}

export const perkById = (id: string | null): Perk | null => PERKS.find((perk) => perk.id === id) ?? null;
