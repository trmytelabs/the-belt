/**
 * Deterministic rules for the Night Shift playable slice.
 *
 * The original full-shift game is deliberately independent of this model.
 * All time inputs are milliseconds. The renderer reads beltTravel for both
 * the tread phase and parcel positions: there is no separate parcel velocity.
 */
export type Route = 'A' | 'B' | 'C' | 'D' | 'E' | 'T' | 'S';
export type ParcelKind = 'envelope' | 'smallbox' | 'standard' | 'bigbox' | 'longbox' | 'mallwood' | 'goji' | 'lobsters' | 'duck' | 'makeup' | 'mesa' | 'panchetters' | 'atv' | 'snakes';
export type WorkerId = 'termite' | 'skanky';
/** 'thrown' is a parcel in the air; 'damaged' is a terminal, never-credited throw breakage. */
export type PackageState = 'belt' | 'held' | 'floor' | 'delivered' | 'missed' | 'thrown' | 'damaged';
export type ShiftPhase = 'lesson' | 'flow' | 'rush' | 'cleanup' | 'ended';
export type ShiftGrade = 'S' | 'A' | 'B' | 'C' | 'F';

export interface Worker {
  id: WorkerId;
  x: number;
  y: number;
  side: 'left' | 'right';
  heldId: number | null;
  facing: 'left' | 'right' | 'up' | 'down';
  moving: boolean;
}

export interface ThrowFlight {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  elapsedMs: number;
  durationMs: number;
  /** From the platform down to the lower floor: renderers drop the arc to floor level. */
  downward: boolean;
  /** Risk fixed at launch, including the stair-top shortcut. */
  breakChance: number;
  route: Route;
}

export interface Parcel {
  id: number;
  route: Route;
  kind: ParcelKind;
  label: string;
  /** Synthetic depot addresses; the street determines the delivery range. */
  address?: string;
  street?: number;
  size: 'normal' | 'heavy';
  x: number;
  y: number;
  state: PackageState;
  workerId: WorkerId | null;
  /** A belt parcel's y is exactly beltTravel + beltOffset. */
  beltOffset: number;
  /** A recovered parcel cannot incur a second first-miss penalty. */
  recovered: boolean;
  missCounted: boolean;
  /** The makeup lotion's own leak on the belt (cosmetic, never penalized). */
  broken: boolean;
  breakY: number | null;
  /** Set while the parcel is in the air. */
  flight?: ThrowFlight | null;
  /** Position in a lower-floor pile, counted from zero, once delivered there. */
  pileIndex?: number;
  /** True once a throw has landed it in its destination intact. */
  thrownDelivery?: boolean;
}

type ParcelIdentity = Pick<Parcel, 'id' | 'route' | 'kind' | 'label' | 'size' | 'address' | 'street'>;
type PendingIntake = ParcelIdentity & { brian: boolean };

/** One reserved real parcel on its final receiving-to-belt transfer. */
export interface IntakePreview extends ParcelIdentity {
  progress: number;
  x: number;
  y: number;
}

export interface ShiftEvent {
  type: 'grab' | 'drop' | 'sort' | 'wrong' | 'miss' | 'recover' | 'brake' | 'switch' | 'phase' | 'brian' | 'spill' | 'end' | 'throw' | 'damage';
  message: string;
  x: number;
  y: number;
  route?: Route;
  score?: number;
  packageId?: number;
  workerId?: WorkerId;
}

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Model pixels (32 px = 1 m in 3D). The belt, both worker lanes, the bulk pile
 * and every truck's rear door sit on one raised loading platform. Two stair
 * flights at the belt end lead down to the lower floor, where each worker has a
 * separate package drop. Trucks back against the platform's long edges.
 */
export const SHIFT_LAYOUT = {
  worldTop: -240,
  receivingTop: -240,
  worldBottom: 1010,
  beltX: 480,
  beltTop: 146,
  beltBottom: 550,
  grabRadius: 102,
  parcelGap: 68,
  dockA: { x: 360, y: 532 },
  dockB: { x: 600, y: 532 },
  dockD: { x: 360, y: 740 },
  dockE: { x: 600, y: 740 },
  floorT: { x: 380, y: 940 },
  floorS: { x: 580, y: 940 },
  bulkPile: { x: 480, y: 610 },
  bulkLeft: { x: 400, y: 624 },
  bulkRight: { x: 560, y: 624 },
  recoveryPile: { x: 480, y: 690 },
  /** Centered rectangles shared by delivery rules, guidance and painted floor markings. */
  dropAreas: {
    A: { x: 369, y: 532, width: 102, height: 88 },
    B: { x: 591, y: 532, width: 102, height: 88 },
    D: { x: 369, y: 740, width: 102, height: 88 },
    E: { x: 591, y: 740, width: 102, height: 88 },
    T: { x: 380, y: 940, width: 120, height: 84 },
    S: { x: 580, y: 940, width: 120, height: 84 },
    bulkLeft: { x: 400, y: 624, width: 80, height: 96 },
    bulkRight: { x: 560, y: 624, width: 80, height: 96 },
  },
  workerMinY: -20,
  workerMaxY: 992,
  leftLane: { minX: 330, maxX: 400 },
  rightLane: { minX: 560, maxX: 630 },
  /** The raised loading platform: the full central spine, receiving included. */
  platform: { left: 318, right: 642, top: -240, bottom: 784 },
  /** One flight per worker, as wide as that worker's lane. */
  stairs: { top: 784, bottom: 876 },
  /** The lower floor below the platform's far end, split by the belt-end wall. */
  lowerFloor: { top: 876, bottom: 1000, left: { minX: 314, maxX: 470 }, right: { minX: 490, maxX: 646 } },
  /** Truck bodies (148 × 84) parked against the platform edges, rear doors flush with it. */
  playerTrucks: {
    A: { x: 244, y: 532 }, B: { x: 716, y: 532 }, D: { x: 244, y: 740 }, E: { x: 716, y: 740 },
  },
} as const;

/** Every destination's readable identity. Letters and names appear on parcels, floors and signs. */
export interface RouteInfo {
  route: Route;
  name: string;
  owner: WorkerId | 'shared';
  side: 'left' | 'right' | 'both';
  kind: 'truck' | 'bulk' | 'floor';
  /** Short destination text for parcel tags and hints. */
  caption: string;
  color: string;
  streets: readonly [number, number] | null;
}

// Internal IDs remain stable; players see city district names and street ranges.
export const ROUTE_INFO: Record<Route, RouteInfo> = {
  A: { route: 'A', name: 'MILL WOODS', owner: 'termite', side: 'left', kind: 'truck', caption: "TERMITE'S TRUCK 1", color: '#d9ccab', streets: [10, 49] },
  B: { route: 'B', name: 'BONNIE DOON', owner: 'skanky', side: 'right', kind: 'truck', caption: "SKANKY'S TRUCK 1", color: '#d9ccab', streets: [50, 89] },
  C: { route: 'C', name: 'BULK', owner: 'shared', side: 'both', kind: 'bulk', caption: 'SHARED PILE AT THE BELT END', color: '#d9ccab', streets: null },
  D: { route: 'D', name: 'DOWNTOWN', owner: 'termite', side: 'left', kind: 'truck', caption: "TERMITE'S TRUCK 2", color: '#d9ccab', streets: [90, 109] },
  E: { route: 'E', name: 'WEST END', owner: 'skanky', side: 'right', kind: 'truck', caption: "SKANKY'S TRUCK 2", color: '#d9ccab', streets: [130, 169] },
  T: { route: 'T', name: 'WESTMOUNT', owner: 'termite', side: 'left', kind: 'floor', caption: 'LOWER FLOOR · DOWN THE STAIRS', color: '#d9ccab', streets: [110, 129] },
  S: { route: 'S', name: 'NORTHSIDE', owner: 'skanky', side: 'right', kind: 'floor', caption: 'LOWER FLOOR · DOWN THE STAIRS', color: '#d9ccab', streets: [170, 199] },
};
export const ROUTES: readonly Route[] = ['A', 'D', 'T', 'B', 'E', 'S', 'C'];
export const WORKER_ROUTES: Record<WorkerId, readonly Route[]> = { termite: ['A', 'D', 'T'], skanky: ['B', 'E', 'S'] };

export function streetRange(route: Route): string {
  const range = ROUTE_INFO[route].streets;
  return range ? `${range[0]}–${range[1]} ST` : 'OVERSIZE';
}

export function routeForStreet(street: number): Route | null {
  return ROUTES.find((route) => {
    const range = ROUTE_INFO[route].streets;
    return range && Number.isInteger(street) && street >= range[0] && street <= range[1];
  }) ?? null;
}

export function parcelAddress(parcel: Pick<Parcel, 'id' | 'route' | 'address' | 'street'>): string {
  if (parcel.address) return parcel.address;
  const range = ROUTE_INFO[parcel.route].streets;
  return range ? `${1000 + Math.abs(parcel.id * 137) % 9000} ${parcel.street ?? range[0] + Math.abs(parcel.id * 17) % (range[1] - range[0] + 1)} ST` : 'OVERSIZE · BULK';
}

/**
 * Base points per successful delivery. Truck and floor drops keep the original
 * 100; bulk keeps its original 120. The combo bonus (15 per streak, up to 10) and
 * the half-value recovery rule are unchanged.
 */
export const DELIVERY_POINTS: Record<Route, number> = { A: 100, B: 100, C: 120, D: 100, E: 100, T: 100, S: 100 };

/**
 * Throwing is an optional shortcut. Carrying is unchanged and never breaks freight.
 * All values are tuning knobs: see docs/overnight-shift-expansion.md.
 */
export const THROWING = {
  /** Farthest throw, in model pixels (about 9.4 m). */
  rangePx: 300,
  flightMs: 600,
  /** Heavy freight (bulk crates, the amp, the ATV) must be carried. */
  heavyThrowable: false,
  /** Simple two-level fragility: these break more often when thrown. */
  fragileKinds: ['makeup', 'duck', 'mesa', 'lobsters'] as readonly ParcelKind[],
  breakChance: { ordinary: 0.15, fragile: 0.55 },
  stairBreakChance: 0.3,
  /** Charged exactly once per broken parcel. */
  breakPenalty: 150,
  /** Breakages beyond this many count as errors in the shift grade. */
  gradeForgivenBreaks: 1,
} as const;

/** Three times the regular freight, with room for every parcel on the belt. */
export const FREIGHT_FLOW = { lessonMs: 2_000, flowMs: 4_000 / 3, rushMs: 1_000, brianMs: 1_000 } as const;
export const MESA_CATCH_PENALTY = 500;

// Names come from the original SpawnSystem and GameScene's Hussan phone gag.
// The preview schedules them deliberately so the game's references cannot be
// lost to rare-item rolls during a single warehouse shift.
const PARCEL_LABELS: Record<ParcelKind, string> = {
  envelope: 'ENVELOPE',
  smallbox: 'SMALL BOX',
  standard: 'PARCEL',
  bigbox: 'BIG BOX',
  longbox: 'LONG BOX',
  mallwood: 'MALLWOOD RD EAST',
  goji: 'GOJI BERRIES',
  lobsters: 'LIVE LOBSTERS',
  duck: 'LE DUCK',
  makeup: 'MAKEUP LOTION',
  mesa: 'MESA BOOGIE',
  panchetters: 'PANCHETTERS',
  atv: 'SMALL ATV',
  snakes: 'THE SNAKES CELL',
};
// The opening six still teach A, B and C. Each worker's second truck (D, E) and
// lower-floor drop (T, S) follow; heavy freight never goes downstairs.
const PARCEL_SEQUENCE: readonly { route: Route; kind: ParcelKind }[] = [
  { route: 'A', kind: 'mallwood' },
  { route: 'B', kind: 'goji' },
  { route: 'C', kind: 'lobsters' },
  { route: 'A', kind: 'duck' },
  { route: 'B', kind: 'makeup' },
  { route: 'C', kind: 'mesa' },
  { route: 'D', kind: 'envelope' },
  { route: 'E', kind: 'standard' },
  { route: 'C', kind: 'atv' },
  { route: 'T', kind: 'smallbox' },
  { route: 'S', kind: 'panchetters' },
  { route: 'A', kind: 'mallwood' },
  { route: 'B', kind: 'goji' },
  { route: 'D', kind: 'panchetters' },
  { route: 'C', kind: 'lobsters' },
  { route: 'E', kind: 'makeup' },
  { route: 'T', kind: 'duck' },
  { route: 'C', kind: 'mesa' },
  { route: 'S', kind: 'standard' },
  { route: 'A', kind: 'envelope' },
  { route: 'B', kind: 'longbox' },
  { route: 'D', kind: 'bigbox' },
  { route: 'C', kind: 'atv' },
  { route: 'E', kind: 'smallbox' },
  { route: 'T', kind: 'goji' },
  { route: 'S', kind: 'makeup' },
  { route: 'A', kind: 'panchetters' },
  { route: 'B', kind: 'standard' },
  { route: 'C', kind: 'lobsters' },
  { route: 'D', kind: 'duck' },
  { route: 'E', kind: 'envelope' },
  { route: 'T', kind: 'standard' },
  { route: 'S', kind: 'smallbox' },
  { route: 'A', kind: 'smallbox' },
  { route: 'B', kind: 'panchetters' },
  { route: 'C', kind: 'mesa' },
];
const BRIAN_BULK_SEQUENCE: readonly ParcelKind[] = ['atv', 'lobsters', 'mesa', 'panchetters', 'mallwood'];
// Two ordinary deliveries between each authored reference parcel.
const EVERYDAY_FREIGHT: readonly { kind: ParcelKind; label: string }[] = [
  { kind: 'envelope', label: 'DOCUMENTS' }, { kind: 'envelope', label: 'PHOTO PRINTS' },
  { kind: 'smallbox', label: 'BOOKS' }, { kind: 'smallbox', label: 'PHONE ACCESSORIES' },
  { kind: 'smallbox', label: 'COFFEE BEANS' }, { kind: 'smallbox', label: 'SPARE PARTS' },
  { kind: 'standard', label: 'SHOES' }, { kind: 'standard', label: 'CLOTHING' },
  { kind: 'standard', label: 'OFFICE SUPPLIES' }, { kind: 'standard', label: 'KITCHENWARE' },
  { kind: 'standard', label: 'TOYS' }, { kind: 'standard', label: 'BED LINENS' },
  { kind: 'bigbox', label: 'SMALL APPLIANCE' }, { kind: 'bigbox', label: 'CAMPING GEAR' },
  { kind: 'longbox', label: 'CURTAIN RODS' }, { kind: 'longbox', label: 'SPORTS EQUIPMENT' },
];
const INTAKE_TRANSFER_MS = 900;
const INTAKE_START_Y = 127;
/** Original Player carry weights, mapped to each freight's original form. */
export const CARRY_MULTIPLIER: Record<ParcelKind, number> = {
  envelope: 1, smallbox: 0.95, standard: 0.85, bigbox: 0.7, longbox: 0.7,
  mallwood: 0.7, goji: 0.9, lobsters: 0.55, duck: 0.95, makeup: 0.85,
  mesa: 0.4, panchetters: 0.85, atv: 0.4, snakes: 0.85,
};

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const smoothStep = (value: number): number => value * value * (3 - 2 * value);
const inside = (rect: Rect, point: { x: number; y: number }): boolean =>
  Math.abs(point.x - rect.x) <= rect.width / 2 && Math.abs(point.y - rect.y) <= rect.height / 2;

/** Height of the walking surface as a fraction of the platform height: 1 on the platform, 0 below. */
export function platformLevelAt(x: number, y: number): number {
  const { platform, stairs, leftLane, rightLane } = SHIFT_LAYOUT;
  if (x >= platform.left && x <= platform.right && y >= platform.top && y <= platform.bottom) return 1;
  const onStairs = (x >= leftLane.minX - 2 && x <= leftLane.maxX + 2) || (x >= rightLane.minX - 2 && x <= rightLane.maxX + 2);
  if (onStairs && y > stairs.top && y < stairs.bottom) return 1 - (y - stairs.top) / (stairs.bottom - stairs.top);
  return 0;
}

/** Where the Nth parcel delivered to a lower-floor drop rests: a 4 × 3 grid, then the next layer. */
export function floorPileSlot(route: 'T' | 'S', index: number): { x: number; y: number; layer: number } {
  const zone = SHIFT_LAYOUT.dropAreas[route];
  const column = index % 4;
  const row = Math.floor(index / 4) % 3;
  const layer = Math.floor(index / 12);
  // The far (lower) band is left clear for the painted letter, which stays readable.
  return { x: zone.x - 42 + column * 28 + (layer % 2) * 6, y: zone.y - 30 + row * 20, layer };
}

export interface ThrowTarget {
  ok: boolean;
  route: Route;
  x: number;
  y: number;
  distance: number;
  breakChance: number;
  reason: string;
}

export interface ShiftOptions {
  /** Breakage rolls. Tests inject a deterministic source; play uses Math.random. */
  random?: () => number;
  /** Independent from breakage, so freight reservations cannot consume a throw roll. */
  freightRandom?: () => number;
  autonomousCoworker?: boolean;
}

/** True from the foot of the stairs down: the same boundary walkBounds() uses. */
export function onLowerFloor(point: { y: number }): boolean {
  return point.y >= SHIFT_LAYOUT.lowerFloor.top;
}

type LayoutNumbers<T> = { readonly [K in keyof T]: T[K] extends number ? number : T[K] extends object ? LayoutNumbers<T[K]> : T[K] };
export type DepotLayout = LayoutNumbers<typeof SHIFT_LAYOUT>;

export class ShiftModel {
  public readonly layout: DepotLayout = SHIFT_LAYOUT;
  protected get freightFlow(): { lessonMs: number; flowMs: number; rushMs: number; brianMs: number } { return FREIGHT_FLOW; }
  protected surfaceLevelAt(x: number, y: number): number { return platformLevelAt(x, y); }
  protected isLowerFloor(point: { x: number; y: number }): boolean { return onLowerFloor(point); }
  protected pileSlot(route: 'T' | 'S', index: number): { x: number; y: number; layer: number } { return floorPileSlot(route, index); }
  public readonly workers: Worker[] = [
    { id: 'termite', x: 382, y: 500, side: 'left', heldId: null, facing: 'right', moving: false },
    { id: 'skanky', x: 578, y: 500, side: 'right', heldId: null, facing: 'left', moving: false },
  ];
  public readonly packages: Parcel[] = [];
  public readonly durationMs = 180_000;
  public readonly cleanupMs = 10_000;
  public readonly goal = 24;
  public readonly capacity = 5;
  public activeIndex = 0;
  public elapsedMs = 0;
  public beltTravel = 0;
  public beltSpeed = 50;
  public phase: ShiftPhase = 'lesson';
  public score = 0;
  public sorted = 0;
  public bulkSorted = 0;
  public missed = 0;
  public combo = 0;
  public bestCombo = 0;
  /** Thrown parcels that broke, and the points actually deducted for them. */
  public damaged = 0;
  public breakagePenalty = 0;
  public thrownDeliveries = 0;
  public readonly routeSorted: Record<Route, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, T: 0, S: 0 };
  public paused = false;
  /** Vic/Shan can stop the machinery while workers and the shift clock continue. */
  public eventStopped = false;
  public brakeRemainingMs = 0;
  public brakeCooldownMs = 0;
  public brianRemaining = 0;
  public ended = false;
  public won = false;
  public autonomousCoworker: boolean;

  private events: ShiftEvent[] = [];
  private nextId = 1;
  private spawnElapsedMs = 0;
  private nextSpawnIntervalMs: number = this.freightFlow.lessonMs;
  private ordinaryFreightCount = 0;
  private pendingIntake: PendingIntake | null = null;
  private brianSent = false;
  protected wrongSortErrors = 0;
  private readonly countedMisses = new Set<number>();
  private readonly penalizedBreaks = new Set<number>();
  private readonly floorPiles: Record<'T' | 'S', number> = { T: 0, S: 0 };
  private readonly random: () => number;
  private readonly freightRandom: () => number;

  constructor(options: ShiftOptions = {}) {
    this.random = options.random ?? Math.random;
    this.freightRandom = options.freightRandom ?? Math.random;
    this.autonomousCoworker = options.autonomousCoworker ?? true;
    this.spawnPackage();
  }

  public get activeWorker(): Worker {
    return this.workers[this.activeIndex];
  }

  public get timeLeftMs(): number {
    return Math.max(0, this.durationMs - this.elapsedMs);
  }

  public get cleanupLeftMs(): number {
    return Math.max(0, this.durationMs + this.cleanupMs - this.elapsedMs);
  }

  public get pileup(): number {
    return this.packages.filter((parcel) => parcel.state === 'missed').length;
  }

  /** Breakages that count against the grade; the first accident is forgiven. */
  public get gradedBreaks(): number {
    return Math.max(0, this.damaged - THROWING.gradeForgivenBreaks);
  }

  public get errors(): number {
    return this.missed + this.wrongSortErrors + this.gradedBreaks;
  }

  public get accuracy(): number {
    const total = this.sorted + this.errors;
    return total === 0 ? 100 : Math.round(this.sorted / total * 100);
  }

  public get grade(): ShiftGrade {
    if (this.accuracy >= 95 && this.errors === 0) return 'S';
    if (this.accuracy >= 90) return 'A';
    if (this.accuracy >= 80) return 'B';
    if (this.accuracy >= 70 && this.errors < 10) return 'C';
    return 'F';
  }

  public get gradeQuote(): string {
    const quotes: Record<ShiftGrade, string> = {
      S: 'PERFECT SHIFT', A: 'GOOD WORK', B: 'ACCEPTABLE',
      C: 'SHAN IS WATCHING', F: 'DO NOT COME BACK MONDAY',
    };
    return quotes[this.grade];
  }

  public get heldPackage(): Parcel | null {
    return this.packages.find((parcel) => parcel.id === this.activeWorker.heldId) ?? null;
  }

  public get intakePreview(): IntakePreview | null {
    if (!this.pendingIntake || this.ended || this.elapsedMs >= this.durationMs) return null;
    const { id, route, kind, label, size, address, street } = this.pendingIntake;
    const progress = clamp((this.spawnElapsedMs - this.nextSpawnIntervalMs + INTAKE_TRANSFER_MS) / INTAKE_TRANSFER_MS, 0, 1);
    return {
      id, route, kind, label, size, address, street, progress, x: this.layout.beltX,
      y: INTAKE_START_Y + (this.layout.beltTop + 26 - INTAKE_START_Y) * progress,
    };
  }

  /** Long browser stalls cannot teleport a parcel past the player's reach. */
  public update(deltaMs: number, move: { x: number; y: number } = { x: 0, y: 0 }): void {
    if (this.paused || this.ended || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    let remainingMs = Math.min(deltaMs, 100);
    // Small deterministic steps keep a brake ending and an intake opening
    // consistent at both low and high presentation frame rates.
    while (remainingMs > 0 && !this.ended) {
      const stepMs = Math.min(remainingMs, 10);
      this.advance(stepMs, move);
      remainingMs -= stepMs;
    }
  }

  public switchWorker(): void {
    if (!this.canAct()) return;
    this.activeWorker.moving = false;
    this.activeIndex = this.activeIndex === 0 ? 1 : 0;
    this.emit('switch', `${this.activeWorker.id === 'termite' ? 'TERMITE' : 'SKANKY'} on duty`, this.activeWorker);
  }

  /** A two-second stop; the eight-second cooldown begins at the press. */
  public brake(): void {
    if (!this.canAct()) return;
    if (this.brakeCooldownMs > 0) {
      this.emit('wrong', `Brake ready in ${Math.ceil(this.brakeCooldownMs / 1000)}s`, this.activeWorker);
      return;
    }
    this.brakeRemainingMs = 2_000;
    this.brakeCooldownMs = 8_000;
    this.beltSpeed = 0;
    this.emit('brake', 'Belt held · 2 seconds to catch up', { x: 480, y: 180 });
  }

  /** The selected worker can pick belt parcels, same-side floor parcels, or recover the pile. */
  public nearestPackage(worker: Worker = this.activeWorker): Parcel | null {
    let nearest: Parcel | null = null;
    let nearestDistance = this.layout.grabRadius + 0.0001;
    for (const parcel of this.packages) {
      if (parcel.state !== 'belt' && parcel.state !== 'floor' && parcel.state !== 'missed') continue;
      if (parcel.state === 'floor' && (worker.side === 'left' ? parcel.x > 440 : parcel.x < 520)) continue;
      // The platform's retaining wall separates the lower floor from the belt end.
      if (parcel.state !== 'floor' && this.isLowerFloor(worker)) continue;
      const separation = distance(worker, parcel);
      if (separation < nearestDistance) {
        nearestDistance = separation;
        nearest = parcel;
      }
    }
    return nearest;
  }

  public action(worker: Worker = this.activeWorker): void {
    if (!this.canAct()) return;
    const held = this.packages.find((parcel) => parcel.id === worker.heldId);
    if (!held) {
      const parcel = this.nearestPackage(worker);
      if (!parcel) {
        this.emit('wrong', 'Move closer to a parcel, then press SPACE', worker);
        return;
      }
      this.pickup(worker, parcel);
      return;
    }

    const dock = this.currentDock(worker);
    if (dock) {
      if (dock !== held.route) {
        this.wrongDelivery(held, worker);
      } else {
        this.release(worker, held);
        this.deliver(held);
      }
      return;
    }

    if (Math.abs(worker.x - this.layout.beltX) <= this.layout.grabRadius && worker.y >= this.layout.beltTop && worker.y <= this.layout.beltBottom) {
      const dropY = clamp(worker.y, this.layout.beltTop + 28, this.layout.beltBottom - 42);
      if (this.packages.some((parcel) => parcel.id !== held.id && parcel.state === 'belt' && Math.abs(parcel.y - dropY) < this.layout.parcelGap)) {
        this.emit('wrong', 'Belt space occupied · move along the belt to place it', worker, held);
        return;
      }
      held.x = this.layout.beltX;
      held.y = dropY;
      held.beltOffset = dropY - this.beltTravel;
      held.state = 'belt';
      this.release(worker, held);
      this.emit('drop', 'Back on the belt · TAB to hand off', held, held);
      return;
    }

    const lane = worker.side === 'left' ? this.layout.leftLane : this.layout.rightLane;
    const floorX = clamp(worker.x + (worker.side === 'left' ? 23 : -23), worker.side === 'left' ? lane.minX + 6 : 542, worker.side === 'left' ? 418 : lane.maxX - 6);
    const floorY = clamp(worker.y + 12, this.layout.workerMinY + 10, this.layout.worldBottom - 18);
    if (this.packages.some((parcel) => parcel.id !== held.id && parcel.state === 'floor' && distance(parcel, { x: floorX, y: floorY }) < 54)) {
      this.emit('wrong', 'Floor space occupied · take one step aside', worker, held);
      return;
    }
    held.x = floorX;
    held.y = floorY;
    held.state = 'floor';
    this.release(worker, held);
    this.emit('drop', 'Set down · press SPACE nearby to pick up', held, held);
  }

  /**
   * Throw at the nearest physical drop. The address still has to match;
   * throwing cannot reveal the parcel's correct truck for the player.
   */
  public throwTarget(worker: Worker = this.activeWorker): ThrowTarget | null {
    const held = this.packages.find((parcel) => parcel.id === worker.heldId);
    if (!held) return null;
    const atStairTop = Math.abs(worker.y - this.layout.stairs.top) <= 16;
    const route = atStairTop ? worker.side === 'left' ? 'T' : 'S'
      : [...WORKER_ROUTES[worker.id], 'C' as const].sort((a, b) =>
        distance(worker, this.destinationCenter(a, worker.side)) - distance(worker, this.destinationCenter(b, worker.side)))[0];
    const info = ROUTE_INFO[route];
    const target = this.destinationCenter(route, worker.side);
    const separation = distance(worker, target);
    const fragile = THROWING.fragileKinds.includes(held.kind);
    const stairThrow = info.kind === 'floor' && atStairTop;
    const result: ThrowTarget = {
      ok: false, route, x: target.x, y: target.y, distance: separation,
      breakChance: stairThrow ? THROWING.stairBreakChance : fragile ? THROWING.breakChance.fragile : THROWING.breakChance.ordinary, reason: '',
    };
    if (held.size === 'heavy' && !THROWING.heavyThrowable) {
      result.reason = 'TOO HEAVY TO THROW · carry it';
    } else if (this.currentDock(worker) !== null && !stairThrow) {
      result.reason = 'ALREADY AT THE DROP · press SPACE';
    } else if (this.isLowerFloor(worker) && info.kind !== 'floor') {
      result.reason = "CAN'T THROW UP ONTO THE PLATFORM · carry it";
    } else if (separation > THROWING.rangePx) {
      result.reason = `TOO FAR TO THROW · ${Math.ceil((separation - THROWING.rangePx) / 32)} m closer, or carry it`;
    } else {
      result.ok = true;
      result.reason = `${stairThrow ? 'THROW DOWN STAIRS' : `THROW TO ${info.name}`} · ${streetRange(route)} · ${Math.round(result.breakChance * 100)}% BREAK RISK`;
    }
    return result;
  }

  /** The optional shortcut: risks breaking the parcel instead of walking it there. */
  public throwHeld(): void {
    if (!this.canAct()) return;
    const worker = this.activeWorker;
    const held = this.heldPackage;
    const target = this.throwTarget(worker);
    if (!held || !target) {
      this.emit('wrong', 'Pick up a parcel first, then F throws it', worker);
      return;
    }
    if (!target.ok) {
      this.emit('wrong', target.reason, worker, held);
      return;
    }
    this.release(worker, held);
    held.state = 'thrown';
    held.flight = {
      fromX: held.x, fromY: held.y, toX: target.x, toY: target.y, elapsedMs: 0, durationMs: THROWING.flightMs,
      downward: this.surfaceLevelAt(worker.x, worker.y) > 0.5 && ROUTE_INFO[target.route].kind === 'floor',
      breakChance: target.breakChance, route: target.route,
    };
    this.emit('throw', `THROWN · ${parcelAddress(held)} → ${ROUTE_INFO[target.route].name}`, worker, held);
  }

  /** Getting caught costs points once per accepted Mesa choice; the night continues. */
  public penalizeMesaTheft(): number {
    const penalty = Math.min(this.score, MESA_CATCH_PENALTY);
    this.score -= penalty;
    this.combo = 0;
    return penalty;
  }

  public drainEvents(): ShiftEvent[] {
    const result = this.events;
    this.events = [];
    return result;
  }

  protected canAct(): boolean {
    return !this.paused && !this.ended;
  }

  protected destinationCenter(route: Route, side: 'left' | 'right'): { x: number; y: number } {
    if (route === 'C') return side === 'left' ? this.layout.bulkLeft : this.layout.bulkRight;
    const area = this.layout.dropAreas[route];
    return { x: area.x, y: area.y };
  }

  private advance(deltaMs: number, move: { x: number; y: number }): void {
    const oldElapsed = this.elapsedMs;
    this.elapsedMs += deltaMs;
    this.updatePhase();
    if (!this.brianSent && this.elapsedMs >= 63_000 && this.elapsedMs < this.durationMs) {
      this.brianSent = true;
      this.brianRemaining = BRIAN_BULK_SEQUENCE.length;
      this.emit('brian', 'BRIAN: SENDING 5 DOWN TO BULK!', { x: 480, y: 122 });
    }
    const previousBrakeMs = this.brakeRemainingMs;
    this.brakeRemainingMs = Math.max(0, this.brakeRemainingMs - deltaMs);
    this.brakeCooldownMs = Math.max(0, this.brakeCooldownMs - deltaMs);
    const movingMs = this.eventStopped ? 0 : Math.max(0, deltaMs - previousBrakeMs);
    const startSpeed = this.speedAt(oldElapsed + (deltaMs - movingMs));
    const endSpeed = this.speedAt(this.elapsedMs);
    this.beltSpeed = this.eventStopped || this.brakeRemainingMs > 0 ? 0 : endSpeed;
    this.beltTravel += ((startSpeed + endSpeed) / 2) * movingMs / 1000;

    this.moveWorker(deltaMs, move);
    for (const worker of this.workers) {
      const held = this.packages.find((parcel) => parcel.id === worker.heldId);
      if (held) this.syncHeld(worker, held);
    }
    for (const parcel of this.packages) {
      if (parcel.state === 'thrown') {
        this.advanceFlight(parcel, deltaMs);
        continue;
      }
      if (parcel.state !== 'belt') continue;
      parcel.y = this.beltTravel + parcel.beltOffset;
      if (movingMs > 0 && parcel.kind === 'makeup' && !parcel.broken && parcel.breakY !== null && parcel.y >= parcel.breakY) {
        parcel.broken = true;
        this.emit('spill', parcel.label, parcel, parcel);
      }
      if (parcel.y >= this.layout.beltBottom) this.miss(parcel);
    }

    this.updateCoworker(deltaMs);

    if (this.pileup >= this.capacity) {
      this.finish(false, 'Recovery bay full · rescue parcels before five stack up');
      return;
    }
    if (this.elapsedMs < this.durationMs) {
      this.spawnElapsedMs += movingMs;
      if (movingMs > 0 && !this.pendingIntake && this.spawnElapsedMs >= this.nextSpawnIntervalMs - INTAKE_TRANSFER_MS) {
        const plannedArrival = this.elapsedMs + Math.max(0, this.nextSpawnIntervalMs - this.spawnElapsedMs);
        this.pendingIntake = this.nextParcelIdentity(plannedArrival);
      }
      if (movingMs > 0 && this.spawnElapsedMs >= this.nextSpawnIntervalMs && this.spawnPackage()) {
        this.spawnElapsedMs -= this.nextSpawnIntervalMs;
        // A phase change applies to the next interval, so it cannot produce
        // an unexpected short gap immediately after the previous parcel.
        this.nextSpawnIntervalMs = this.brianRemaining > 0 ? this.freightFlow.brianMs
          : this.phase === 'lesson' ? this.freightFlow.lessonMs : this.phase === 'flow' ? this.freightFlow.flowMs : this.freightFlow.rushMs;
      }
    } else {
      // A parcel still in receiving is not on the shift's belt or score sheet.
      this.pendingIntake = null;
      const unfinished = this.packages.some((parcel) => parcel.state !== 'delivered' && parcel.state !== 'damaged');
      if (!unfinished || this.elapsedMs >= this.durationMs + this.cleanupMs) {
        this.finish(this.sorted >= this.goal, this.sorted >= this.goal ? 'Shift complete · freight cleared' : `Shift complete · ${this.sorted}/${this.goal} delivered`);
      }
    }
  }

  private advanceFlight(parcel: Parcel, deltaMs: number): void {
    const flight = parcel.flight;
    if (!flight) return;
    flight.elapsedMs = Math.min(flight.durationMs, flight.elapsedMs + deltaMs);
    const t = flight.elapsedMs / flight.durationMs;
    parcel.x = flight.fromX + (flight.toX - flight.fromX) * t;
    parcel.y = flight.fromY + (flight.toY - flight.fromY) * t;
    if (t < 1) return;
    parcel.flight = null;
    if (this.random() < flight.breakChance) this.damage(parcel);
    else if (flight.route === parcel.route) {
      parcel.thrownDelivery = true;
      this.thrownDeliveries += 1;
      this.deliver(parcel);
    } else {
      parcel.state = 'floor';
      this.wrongDelivery(parcel, parcel);
    }
  }

  protected wrongDelivery(parcel: Parcel, at: { x: number; y: number }): void {
    this.combo = 0;
    if (!parcel.recovered || parcel.state === 'floor') this.wrongSortErrors += 1;
    this.emit('wrong', `${parcelAddress(parcel)} is outside this drop's range · ${parcel.state === 'floor' ? 'pick it up and check the signs' : 'check the truck signs'}`, at, parcel);
  }

  /** A thrown parcel broke: no delivery credit and exactly one penalty, ever. */
  private damage(parcel: Parcel): void {
    parcel.state = 'damaged';
    parcel.workerId = null;
    if (this.penalizedBreaks.has(parcel.id)) return;
    this.penalizedBreaks.add(parcel.id);
    const penalty = Math.min(this.score, THROWING.breakPenalty);
    this.score -= penalty;
    this.breakagePenalty += penalty;
    this.damaged += 1;
    this.combo = 0;
    this.emit('damage', `BROKEN · ${parcel.label} · -${THROWING.breakPenalty}`, parcel, parcel, -penalty);
  }

  protected moveWorker(deltaMs: number, move: { x: number; y: number }, worker: Worker = this.activeWorker): void {
    const x = Number.isFinite(move.x) ? clamp(move.x, -1, 1) : 0;
    const y = Number.isFinite(move.y) ? clamp(move.y, -1, 1) : 0;
    const magnitude = Math.hypot(x, y);
    worker.moving = magnitude > 0;
    if (!worker.moving) return;
    const held = this.packages.find((parcel) => parcel.id === worker.heldId);
    const speed = 235 * (held ? CARRY_MULTIPLIER[held.kind] : 1);
    const normalized = Math.max(1, magnitude);
    const previousX = worker.x;
    const previousY = worker.y;
    let nextY = clamp(worker.y + y / normalized * speed * deltaMs / 1000, this.layout.workerMinY, this.layout.workerMaxY);
    // The platform's retaining wall: from the lower floor, only the stairs lead up.
    if (!this.walkable(worker.side, worker.x, nextY)) nextY = Math.max(nextY, this.layout.stairs.bottom);
    const bounds = this.walkBounds(worker.side, nextY);
    const nextX = clamp(worker.x + x / normalized * speed * deltaMs / 1000, bounds.minX, bounds.maxX);
    worker.x = nextX;
    worker.y = nextY;
    worker.moving = previousX !== worker.x || previousY !== worker.y;
    worker.facing = Math.abs(x) > Math.abs(y) ? x > 0 ? 'right' : 'left' : y > 0 ? 'down' : 'up';
  }

  /** The lane (platform and its stairs) or, below the stairs, that side of the lower floor. */
  public walkBounds(side: 'left' | 'right', y: number): { minX: number; maxX: number } {
    if (y >= this.layout.stairs.bottom) return this.layout.lowerFloor[side];
    return side === 'left' ? this.layout.leftLane : this.layout.rightLane;
  }

  public walkable(side: 'left' | 'right', x: number, y: number): boolean {
    if (y < this.layout.workerMinY || y > this.layout.workerMaxY) return false;
    const bounds = this.walkBounds(side, y);
    return x >= bounds.minX && x <= bounds.maxX;
  }

  protected syncHeld(worker: Worker, parcel: Parcel): void {
    parcel.x = worker.x + (worker.side === 'left' ? 42 : -42);
    parcel.y = worker.y - 17;
  }

  protected pickup(worker: Worker, parcel: Parcel): void {
    const recovered = parcel.state === 'missed';
    if (recovered) parcel.recovered = true;
    parcel.state = 'held';
    parcel.workerId = worker.id;
    worker.heldId = parcel.id;
    this.syncHeld(worker, parcel);
    this.emit(recovered ? 'recover' : 'grab', `${recovered ? 'Recovered · ' : ''}${parcelAddress(parcel)} · read the truck ranges`, worker, parcel);
  }

  /** The worker you are not controlling sorts their own side and shared bulk. */
  protected updateCoworker(deltaMs: number): void {
    const worker = this.workers[this.activeIndex === 0 ? 1 : 0];
    worker.moving = false;
    if (!this.autonomousCoworker) return;
    const held = this.packages.find((parcel) => parcel.id === worker.heldId);
    let target: { x: number; y: number };
    if (held) {
      const ownSide = ROUTE_INFO[held.route].side === 'both' || ROUTE_INFO[held.route].side === worker.side;
      target = ownSide ? this.destinationCenter(held.route, worker.side)
        : { x: worker.side === 'left' ? 400 : 560, y: 440 };
      if ((ownSide && this.currentDock(worker) === held.route) || (!ownSide && distance(worker, target) < 4)) {
        this.action(worker);
        return;
      }
    } else {
      const parcel = this.packages.filter((item) => {
        if (!['belt', 'floor', 'missed'].includes(item.state)) return false;
        if (ROUTE_INFO[item.route].side !== 'both' && ROUTE_INFO[item.route].side !== worker.side) return false;
        return item.state !== 'floor' || (worker.side === 'left' ? item.x < 440 : item.x > 520);
      }).sort((a, b) => Number(b.state === 'missed') - Number(a.state === 'missed') || b.y - a.y)[0];
      if (!parcel) return;
      if ((!this.isLowerFloor(worker) || parcel.state === 'floor') && distance(worker, parcel) <= this.layout.grabRadius) {
        this.pickup(worker, parcel);
        return;
      }
      target = { x: worker.side === 'left' ? 400 : 560, y: parcel.y };
      if (parcel.state === 'floor' && this.isLowerFloor(parcel)) target.x = parcel.x;
    }
    // From the widened lower floor, line up with the stairs before climbing.
    const lane = worker.side === 'left' ? this.layout.leftLane : this.layout.rightLane;
    if (this.isLowerFloor(worker) && target.y < this.layout.stairs.bottom && (worker.x < lane.minX || worker.x > lane.maxX)) {
      target = { x: clamp(worker.x, lane.minX + 8, lane.maxX - 8), y: this.layout.stairs.bottom + 12 };
    }
    const dx = target.x - worker.x;
    const dy = target.y - worker.y;
    const length = Math.hypot(dx, dy);
    const step = Math.max(length, 235 * deltaMs / 1000);
    this.moveWorker(deltaMs, { x: dx / step, y: dy / step }, worker);
    if (held) this.syncHeld(worker, held);
  }

  protected release(worker: Worker, parcel: Parcel): void {
    worker.heldId = null;
    parcel.workerId = null;
  }

  public currentDock(worker: Worker = this.activeWorker): Route | null {
    // A painted zone never extends a worker's reach beyond the walkable floor.
    if (!this.walkable(worker.side, worker.x, worker.y)) return null;
    const routes = WORKER_ROUTES[worker.id];
    for (const route of routes) {
      const area = this.layout.dropAreas[route as 'A' | 'B' | 'D' | 'E' | 'T' | 'S'];
      // Truck areas exclude their lower edge; the adjoining bulk area owns it.
      if (Math.abs(worker.x - area.x) <= area.width / 2 && worker.y >= area.y - area.height / 2 && worker.y < area.y + area.height / 2) return route;
    }
    const bulk = worker.side === 'left' ? this.layout.dropAreas.bulkLeft : this.layout.dropAreas.bulkRight;
    if (inside(bulk, worker)) return 'C';
    return null;
  }

  protected deliver(parcel: Parcel): void {
    const base = DELIVERY_POINTS[parcel.route];
    const award = parcel.recovered ? base / 2 : base + Math.min(this.combo, 10) * 15;
    parcel.state = 'delivered';
    parcel.workerId = null;
    if (parcel.route === 'T' || parcel.route === 'S') {
      parcel.pileIndex = this.floorPiles[parcel.route];
      this.floorPiles[parcel.route] += 1;
      const slot = this.pileSlot(parcel.route, parcel.pileIndex);
      parcel.x = slot.x;
      parcel.y = slot.y;
    } else {
      const destination = parcel.route === 'C' ? this.layout.bulkPile : parcel.route === 'A' ? this.layout.dockA
        : parcel.route === 'B' ? this.layout.dockB : parcel.route === 'D' ? this.layout.dockD : this.layout.dockE;
      parcel.x = destination.x;
      parcel.y = destination.y;
    }
    this.score += award;
    this.sorted += 1;
    this.routeSorted[parcel.route] += 1;
    if (parcel.route === 'C') this.bulkSorted += 1;
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.emit('sort', `${parcel.recovered ? 'RECOVERED' : parcel.thrownDelivery ? 'THROWN IN' : 'SORTED'} +${award}`, parcel, parcel, award);
  }

  private miss(parcel: Parcel): void {
    parcel.state = 'missed';
    parcel.x = this.layout.recoveryPile.x;
    parcel.y = this.layout.recoveryPile.y;
    if (!this.countedMisses.has(parcel.id)) {
      this.countedMisses.add(parcel.id);
      parcel.missCounted = true;
      this.missed += 1;
    }
    this.combo = 0;
    this.emit('miss', `${this.pileup}/${this.capacity} in recovery · pick up near the belt end`, parcel, parcel);
  }

  private nextParcelIdentity(plannedArrival: number): PendingIntake {
    const brianSending = this.brianRemaining > 0 || (!this.brianSent && plannedArrival >= 63_000);
    const brianIndex = this.brianRemaining > 0 ? BRIAN_BULK_SEQUENCE.length - this.brianRemaining : 0;
    const slot = this.ordinaryFreightCount;
    const everyday = !brianSending && slot % 3 !== 0;
    const regular = everyday ? EVERYDAY_FREIGHT[Math.min(EVERYDAY_FREIGHT.length - 1, Math.floor(this.freightRandom() * EVERYDAY_FREIGHT.length))] : null;
    const regularRoutes: readonly Route[] = regular && CARRY_MULTIPLIER[regular.kind] <= 0.7 ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'D', 'E', 'T', 'S'];
    const { route, kind } = brianSending
      ? { route: 'C' as const, kind: BRIAN_BULK_SEQUENCE[brianIndex] }
      : regular ? { route: regularRoutes[Math.min(regularRoutes.length - 1, Math.floor(this.freightRandom() * regularRoutes.length))], kind: regular.kind }
        : PARCEL_SEQUENCE[Math.floor(slot / 3) % PARCEL_SEQUENCE.length];
    const range = ROUTE_INFO[route].streets;
    const street = range ? range[0] + this.nextId * 17 % (range[1] - range[0] + 1) : undefined;
    return {
      id: this.nextId, route, kind, label: regular?.label ?? PARCEL_LABELS[kind], street,
      address: parcelAddress({ id: this.nextId, route, street }),
      size: CARRY_MULTIPLIER[kind] <= 0.7 ? 'heavy' : 'normal', brian: brianSending,
    };
  }

  private spawnPackage(): boolean {
    const spawnY = this.layout.beltTop + 26;
    if (this.packages.some((parcel) => parcel.state === 'belt' && Math.abs(parcel.y - spawnY) < this.layout.parcelGap)) return false;
    // Once the unloaders show a parcel, its identity must survive a brake or
    // blocked intake. An ordinary reservation delayed past Brian's cue lands
    // first; all five Brian parcels follow without consuming one of his slots.
    const { id, route, kind, label, size, address, street, brian } = this.pendingIntake ?? this.nextParcelIdentity(this.elapsedMs);
    this.nextId += 1;
    this.packages.push({
      id, route, kind, label, size, address, street,
      x: this.layout.beltX, y: spawnY, state: 'belt', workerId: null,
      beltOffset: spawnY - this.beltTravel, recovered: false, missCounted: false,
      broken: false, breakY: kind === 'makeup' ? 220 + id * 73 % 301 : null,
    });
    this.pendingIntake = null;
    if (brian) this.brianRemaining -= 1;
    else this.ordinaryFreightCount += 1;
    return true;
  }

  private speedAt(elapsedMs: number): number {
    if (elapsedMs < 36_000) return 50;
    if (elapsedMs < 42_000) return 50 + 18 * smoothStep((elapsedMs - 36_000) / 6_000);
    if (elapsedMs < 126_000) return 68;
    if (elapsedMs < 132_000) return 68 + 17 * smoothStep((elapsedMs - 126_000) / 6_000);
    return 85;
  }

  private updatePhase(): void {
    const phase: ShiftPhase = this.elapsedMs < 36_000 ? 'lesson' : this.elapsedMs < 126_000 ? 'flow' : this.elapsedMs < this.durationMs ? 'rush' : 'cleanup';
    if (phase === this.phase) return;
    this.phase = phase;
    const message = phase === 'flow' ? 'STEADY FLOW · triple freight · coworker sorting' : phase === 'rush' ? 'LAST PUSH · freight every second' : phase === 'cleanup' ? 'INTAKE CLOSED · 10 seconds to clear your freight' : 'Find your rhythm';
    this.emit('phase', message, { x: 480, y: 122 });
  }

  private finish(won: boolean, message: string): void {
    this.ended = true;
    this.won = won;
    this.phase = 'ended';
    this.beltSpeed = 0;
    this.pendingIntake = null;
    for (const worker of this.workers) worker.moving = false;
    this.emit('end', message, { x: 480, y: 340 });
  }

  protected emit(type: ShiftEvent['type'], message: string, point: { x: number; y: number }, parcel?: Parcel, score?: number): void {
    const workerId = 'id' in point && (point.id === 'termite' || point.id === 'skanky') ? point.id : undefined;
    this.events.push({ type, message, x: point.x, y: point.y, route: parcel?.route, packageId: parcel?.id, score, workerId });
  }
}

export default ShiftModel;
