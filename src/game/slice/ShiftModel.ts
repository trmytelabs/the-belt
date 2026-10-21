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
  breakChance?: number;
  route?: Route;
}

export interface Parcel {
  id: number;
  route: Route;
  kind: ParcelKind;
  label: string;
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

export type ParcelIdentity = Pick<Parcel, 'id' | 'route' | 'kind' | 'label' | 'size' | 'address' | 'street'>;
type PendingIntake = ParcelIdentity & { brian: boolean };

/** One reserved real parcel on its final receiving-to-belt transfer. */
export interface IntakePreview extends ParcelIdentity {
  progress: number;
  x: number;
  y: number;
}

export interface ShiftEvent {
  type: 'grab' | 'drop' | 'sort' | 'wrong' | 'miss' | 'recover' | 'brake' | 'switch' | 'phase' | 'brian' | 'spill' | 'end' | 'throw' | 'damage' | 'scanner' | 'priority' | 'inspection';
  message: string;
  x: number;
  y: number;
  route?: Route;
  score?: number;
  packageId?: number;
  workerId?: WorkerId;
  /** Automatic deliveries contribute to dispatch, never the player's points or combo. */
  assisted?: boolean;
}

export interface ScannerRequest { workerId: WorkerId; message: string }

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Model pixels (32 px = 1 m in 3D). The belt, both worker lanes, the bulk pile
 * and every truck's rear door sit on one raised loading platform. Two stair
 * flights descend outward from its left and right sides to separate floor
 * drops. Every playable destination stays in front of the final rear wall.
 */
export const SHIFT_LAYOUT = {
  worldTop: -240,
  receivingTop: -240,
  worldBottom: 880,
  beltX: 480,
  beltTop: 146,
  beltBottom: 550,
  grabRadius: 102,
  parcelGap: 68,
  dockA: { x: 360, y: 532 },
  dockB: { x: 600, y: 532 },
  dockD: { x: 360, y: 628 },
  dockE: { x: 600, y: 628 },
  floorT: { x: 200, y: 830 },
  floorS: { x: 760, y: 830 },
  bulkPile: { x: 480, y: 832 },
  bulkLeft: { x: 400, y: 830 },
  bulkRight: { x: 560, y: 830 },
  recoveryPile: { x: 480, y: 610 },
  bulkRearWall: { x: 480, y: 877, width: 960, height: 6 },
  ralphBay: { x: 244, y: 740, from: -120 },
  fishTank: { x: 716, y: 740, width: 52, height: 36 },
  /** Centered rectangles shared by delivery rules, guidance and painted floor markings. */
  dropAreas: {
    A: { x: 369, y: 532, width: 102, height: 88 },
    B: { x: 591, y: 532, width: 102, height: 88 },
    D: { x: 369, y: 628, width: 102, height: 88 },
    E: { x: 591, y: 628, width: 102, height: 88 },
    T: { x: 200, y: 830, width: 52, height: 88 },
    S: { x: 760, y: 830, width: 52, height: 88 },
    bulkLeft: { x: 400, y: 812, width: 80, height: 40 },
    bulkRight: { x: 560, y: 812, width: 80, height: 40 },
  },
  workerMinY: -20,
  workerMaxY: 846,
  leftLane: { minX: 330, maxX: 400 },
  rightLane: { minX: 560, maxX: 630 },
  /** The raised loading platform: the full central spine, receiving included. */
  platform: { left: 318, right: 642, top: -240, bottom: 880 },
  /** Physical side flights: height falls from topX toward bottomX, never along y. */
  stairs: { minY: 780, maxY: 872, centerY: 830, steps: 7,
    left: { topX: 318, bottomX: 226 }, right: { topX: 642, bottomX: 734 } },
  /** Physical lower-floor bounds, all in front of the rear wall. Body centres inset their radius. */
  lowerFloor: { top: 780, bottom: 874, left: { minX: 90, maxX: 226 }, right: { minX: 734, maxX: 870 } },
  /** Keep the storage band separate from the stairs, landing and delivery approach. */
  floorStorage: {
    T: { x: 134, y: 828, width: 48, height: 88 },
    S: { x: 826, y: 828, width: 48, height: 88 },
  },
  workerRadius: 12,
  /** Largest carried form at any rotation, for storage and rear-wall clearance. */
  carriedClearance: 42,
  parcelRadius: 24,
  truckDepth: 72,
  /** Truck bodies (148 × 72) parked against the platform edges, rear doors flush with it. */
  playerTrucks: {
    A: { x: 244, y: 532 }, B: { x: 716, y: 532 }, D: { x: 244, y: 628 }, E: { x: 716, y: 628 },
  },
} as const;

/** Deck equipment that must stay clear of put-downs and standing coworkers. */
export const DEPOT_EQUIPMENT_FOOTPRINTS: readonly Rect[] = [
  { x: SHIFT_LAYOUT.beltX, y: (SHIFT_LAYOUT.beltTop + SHIFT_LAYOUT.beltBottom) / 2, width: 104, height: SHIFT_LAYOUT.beltBottom - SHIFT_LAYOUT.beltTop },
  { ...SHIFT_LAYOUT.bulkPile, width: 116, height: 96 },
  { ...SHIFT_LAYOUT.recoveryPile, width: 118, height: 52 },
  SHIFT_LAYOUT.bulkRearWall,
];

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
}

// D, E, T and S are new. Their names are provisional and can be renamed here.
export const ROUTE_INFO: Record<Route, RouteInfo> = {
  A: { route: 'A', name: 'HERES UR SOVICE', owner: 'termite', side: 'left', kind: 'truck', caption: "TERMITE'S TRUCK 1", color: '#62c8d6' },
  B: { route: 'B', name: 'PAYTMAN', owner: 'skanky', side: 'right', kind: 'truck', caption: "SKANKY'S TRUCK 1", color: '#8fd18a' },
  C: { route: 'C', name: 'BULK', owner: 'shared', side: 'both', kind: 'bulk', caption: 'SHARED PILE AT THE BELT END', color: '#f0a64a' },
  D: { route: 'D', name: 'DOWNTOWN', owner: 'termite', side: 'left', kind: 'truck', caption: "TERMITE'S TRUCK 2", color: '#7fa4f2' },
  E: { route: 'E', name: 'EASTSIDE', owner: 'skanky', side: 'right', kind: 'truck', caption: "SKANKY'S TRUCK 2", color: '#d9dc6a' },
  T: { route: 'T', name: 'TERMITE FLOOR DROP', owner: 'termite', side: 'left', kind: 'floor', caption: 'LOWER FLOOR · DOWN THE STAIRS', color: '#c9a2f2' },
  S: { route: 'S', name: 'SKANKY FLOOR DROP', owner: 'skanky', side: 'right', kind: 'floor', caption: 'LOWER FLOOR · DOWN THE STAIRS', color: '#f29ab8' },
};
export const ROUTES: readonly Route[] = ['A', 'D', 'T', 'B', 'E', 'S', 'C'];
export const WORKER_ROUTES: Record<WorkerId, readonly Route[]> = { termite: ['A', 'D', 'T'], skanky: ['B', 'E', 'S'] };

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

const ROUTE_NAMES: Record<Route, string> = {
  A: 'A · HERES UR SOVICE · left dock',
  B: 'B · PAYTMAN · right dock',
  C: 'C · BULK · shared pile at the belt end',
  D: "D · DOWNTOWN · Termite's second truck",
  E: "E · EASTSIDE · Skanky's second truck",
  T: 'T · TERMITE FLOOR DROP · down the stairs',
  S: 'S · SKANKY FLOOR DROP · down the stairs',
};
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
  const { platform, stairs } = SHIFT_LAYOUT;
  if (x >= platform.left && x <= platform.right && y >= platform.top && y <= platform.bottom) return 1;
  const side = stairAt(x, y);
  if (side) {
    const flight = stairs[side];
    const tread = Math.floor(Math.abs(x - flight.topX) / Math.abs(flight.bottomX - flight.topX) * stairs.steps) + 1;
    return 1 - tread / stairs.steps;
  }
  return 0;
}

/** The open stair run, excluding its flat deck and ground endpoints. */
export function stairAt(x: number, y: number): 'left' | 'right' | null {
  const stairs = SHIFT_LAYOUT.stairs;
  if (y < stairs.minY || y > stairs.maxY) return null;
  if (x > stairs.left.bottomX && x < stairs.left.topX) return 'left';
  if (x > stairs.right.topX && x < stairs.right.bottomX) return 'right';
  return null;
}

/** Outer storage band: a 2 × 4 grid, leaving the route's central walking aisle clear. */
export function floorPileSlot(route: 'T' | 'S', index: number): { x: number; y: number; layer: number } {
  const storage = SHIFT_LAYOUT.floorStorage[route];
  const column = index % 2;
  const row = Math.floor(index / 2) % 4;
  const layer = Math.floor(index / 8);
  return { x: storage.x - 12 + column * 24, y: storage.y - 33 + row * 22, layer };
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
  /** Disable only for isolated rules fixtures. The unattended worker assists in normal play. */
  crewAssist?: boolean;
  autonomousCoworker?: boolean;
  freightRandom?: () => number;
}

/** Ground beyond either side flight, not the central deck at the same y. */
export function onLowerFloor(point: { x: number; y: number }): boolean {
  const floor = SHIFT_LAYOUT.lowerFloor;
  return point.y >= floor.top && point.y <= floor.bottom
    && ((point.x >= floor.left.minX && point.x <= floor.left.maxX)
      || (point.x >= floor.right.minX && point.x <= floor.right.maxX));
}

type LayoutNumbers<T> = { readonly [K in keyof T]: T[K] extends number ? number : T[K] extends object ? LayoutNumbers<T[K]> : T[K] };
export type DepotLayout = LayoutNumbers<typeof SHIFT_LAYOUT>;

export class ShiftModel {
  public readonly layout: DepotLayout = SHIFT_LAYOUT;
  protected get freightFlow() { return { lessonMs: 6000, flowMs: 2800, rushMs: 2200, brianMs: 1900 }; }
  protected surfaceLevelAt = platformLevelAt;
  protected isLowerFloor = onLowerFloor;
  protected pileSlot = floorPileSlot;
  protected stairSideAt = stairAt;
  public autonomousCoworker: boolean;
  protected readonly freightRandom: () => number;
  private ordinaryFreightCount = 0;
  public readonly workers: Worker[] = [
    { id: 'termite', x: 382, y: 500, side: 'left', heldId: null, facing: 'right', moving: false },
    { id: 'skanky', x: 578, y: 500, side: 'right', heldId: null, facing: 'left', moving: false },
  ];
  public readonly packages: Parcel[] = [];
  public readonly durationMs: number = 180_000;
  public readonly cleanupMs: number = 10_000;
  public readonly goal = 42;
  public readonly capacity: number = 5;
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
  /** The inactive worker carries their own routes once the opening lesson is complete. */
  public crewAssist: boolean;
  private assistedDeliveries = 0;
  private scannerFaultIndex = 0;
  private scannerWorker: WorkerId | null = null;
  private scannerResetCount = 0;

  private events: ShiftEvent[] = [];
  private nextId = 1;
  private spawnElapsedMs = 0;
  private nextSpawnIntervalMs = this.freightFlow.lessonMs;
  private pendingIntake: PendingIntake | null = null;
  private brianSent = false;
  protected wrongSortErrors = 0;
  private readonly countedMisses = new Set<number>();
  private readonly penalizedBreaks = new Set<number>();
  private readonly floorPiles: Record<'T' | 'S', number> = { T: 0, S: 0 };
  private readonly random: () => number;

  constructor(options: ShiftOptions = {}) {
    this.random = options.random ?? Math.random;
    this.freightRandom = options.freightRandom ?? Math.random;
    this.autonomousCoworker = options.autonomousCoworker ?? true;
    this.crewAssist = options.crewAssist ?? true;
    this.spawnPackage();
  }

  public get activeWorker(): Worker {
    return this.workers[this.activeIndex];
  }

  public get assistanceActive(): boolean {
    return this.crewAssist && this.elapsedMs >= 36_000 && !this.paused && !this.ended;
  }

  public get assistedSorted(): number {
    return this.assistedDeliveries;
  }

  public get playerSorted(): number { return this.sorted - this.assistedDeliveries; }

  public get pendingScannerWorker(): WorkerId | null { return this.scannerWorker; }

  public get scannerResets(): number { return this.scannerResetCount; }

  public get scannerRequest(): ScannerRequest | null {
    const workerId = this.scannerWorker;
    if (!workerId) return null;
    return { workerId, message: `${workerId.toUpperCase()}'S SCANNER STOPPED · ${this.activeWorker.id === workerId ? 'SPACE TO RESET' : 'TAB THEN SPACE TO RESET'}` };
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
    const total = this.playerSorted + this.errors;
    return total === 0 ? 100 : Math.round(this.playerSorted / total * 100);
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

  /** Moving-belt time until the next intake, for the 3D crew's visual freight. */
  public get nextArrivalInMs(): number { return Math.max(0, this.nextSpawnIntervalMs - this.spawnElapsedMs); }

  public get intakePreview(): IntakePreview | null {
    if (!this.pendingIntake || this.ended || this.elapsedMs >= this.durationMs) return null;
    const { id, route, kind, label, size, address, street } = this.pendingIntake;
    const progress = clamp((this.spawnElapsedMs - this.nextSpawnIntervalMs + INTAKE_TRANSFER_MS) / INTAKE_TRANSFER_MS, 0, 1);
    return {
      id, route, kind, label, size,
      ...(address === undefined ? {} : { address }), ...(street === undefined ? {} : { street }),
      progress, x: this.layout.beltX,
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
      if (!this.canPickup(worker, parcel)) continue;
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
    if (this.scannerWorker === worker.id) {
      this.scannerWorker = null;
      this.scannerResetCount += 1;
      this.emit('scanner', `${worker.id.toUpperCase()}'S SCANNER RESET · BACK TO WORK`, worker);
      return;
    }
    const held = this.packages.find(parcel => parcel.id === worker.heldId);
    if (!held) {
      const parcel = this.nearestPackage(worker);
      if (!parcel) {
        this.emit('wrong', this.clearForCarry(worker.x, worker.y, worker.side)
          ? 'Move closer to a parcel, then press SPACE' : 'Step clear of the pile, wall or stair rails before picking up', worker);
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

    if (this.stairSideAt(worker.x, worker.y)) {
      this.emit('wrong', 'Keep the stairs clear · carry it to the landing', worker, held);
      return;
    }
    const lane = worker.side === 'left' ? this.layout.leftLane : this.layout.rightLane;
    const radius = this.layout.parcelRadius;
    const lower = this.layout.lowerFloor[worker.side];
    const floorX = this.isLowerFloor(worker)
      ? clamp(worker.x + (worker.side === 'left' ? 23 : -23), lower.minX + radius, lower.maxX - radius)
      : clamp(worker.x + (worker.side === 'left' ? 23 : -23), worker.side === 'left' ? lane.minX + 6 : 542, worker.side === 'left' ? 418 : lane.maxX - 6);
    const floorY = this.isLowerFloor(worker)
      ? clamp(worker.y + 40, this.layout.lowerFloor.top + radius, this.layout.lowerFloor.bottom - radius)
      : clamp(worker.y + 40, this.layout.workerMinY + radius, this.layout.bulkRearWall.y - this.layout.bulkRearWall.height / 2 - radius);
    if (DEPOT_EQUIPMENT_FOOTPRINTS.some((rect) => {
      const nearestX = clamp(floorX, rect.x - rect.width / 2, rect.x + rect.width / 2);
      const nearestY = clamp(floorY, rect.y - rect.height / 2, rect.y + rect.height / 2);
      return Math.hypot(floorX - nearestX, floorY - nearestY) < radius;
    })) {
      this.emit('wrong', 'Keep the belt and trays clear · step aside to set it down', worker, held);
      return;
    }
    const storage = this.layout.floorStorage[worker.side === 'left' ? 'T' : 'S'];
    const storageX = clamp(floorX, storage.x - storage.width / 2, storage.x + storage.width / 2);
    const storageY = clamp(floorY, storage.y - storage.height / 2, storage.y + storage.height / 2);
    if (Math.hypot(floorX - storageX, floorY - storageY) < radius) {
      this.emit('wrong', 'Keep the storage pile clear · deliver inside the painted route', worker, held);
      return;
    }
    if (distance(worker, { x: floorX, y: floorY }) < this.layout.workerRadius + radius) {
      this.emit('wrong', 'Leave room for the parcel · step clear of the edge', worker, held);
      return;
    }
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
   * Where the active worker's held parcel would go if thrown: always its own
   * correct destination, so the choice is carry-or-throw rather than aim.
   */
  public throwTarget(worker: Worker = this.activeWorker): ThrowTarget | null {
    const held = this.packages.find((parcel) => parcel.id === worker.heldId);
    if (!held) return null;
    const route = held.route;
    const info = ROUTE_INFO[route];
    const target = this.destinationCenter(route, worker.side);
    const separation = distance(worker, target);
    const fragile = THROWING.fragileKinds.includes(held.kind);
    const result: ThrowTarget = {
      ok: false, route, x: target.x, y: target.y, distance: separation,
      breakChance: fragile ? THROWING.breakChance.fragile : THROWING.breakChance.ordinary, reason: '',
    };
    if (info.side !== 'both' && info.side !== worker.side) {
      result.reason = `ROUTE ${route} is ${info.owner === 'termite' ? "TERMITE'S" : "SKANKY'S"} · put it on the belt and TAB`;
    } else if (held.size === 'heavy' && !THROWING.heavyThrowable) {
      result.reason = 'TOO HEAVY TO THROW · carry it';
    } else if (this.currentDock(worker) === route) {
      result.reason = 'ALREADY AT THE DROP · press SPACE';
    } else if (this.isLowerFloor(worker) && info.kind !== 'floor') {
      result.reason = "CAN'T THROW UP ONTO THE PLATFORM · carry it";
    } else if (separation > THROWING.rangePx) {
      result.reason = `TOO FAR TO THROW · ${Math.ceil((separation - THROWING.rangePx) / 32)} m closer, or carry it`;
    } else {
      result.ok = true;
      result.reason = `THROW TO ${route} · ${Math.round(result.breakChance * 100)}% BREAK RISK`;
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
    this.emit('throw', `THROWN · ${held.label} → ${held.route}`, worker, held);
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
    this.updateCoworker(deltaMs);
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

    if (this.pileup >= this.capacity) {
      this.finish(false, `Recovery bay full · rescue parcels before ${this.capacity === 5 ? 'five' : this.capacity} stack up`);
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
    const fragile = THROWING.fragileKinds.includes(parcel.kind);
    const chance = flight.breakChance ?? (fragile ? THROWING.breakChance.fragile : THROWING.breakChance.ordinary);
    if (this.random() < chance) this.damage(parcel);
    else if ((flight.route ?? parcel.route) === parcel.route) {
      parcel.thrownDelivery = true;
      this.thrownDeliveries += 1;
      this.deliver(parcel);
    } else { parcel.state = 'floor'; this.wrongDelivery(parcel, parcel); }
  }

  protected wrongDelivery(parcel: Parcel, at: { x: number; y: number }): void {
    this.combo = 0;
    if (!parcel.recovered) this.wrongSortErrors += 1;
    this.emit('wrong', `This parcel needs ${ROUTE_NAMES[parcel.route]}`, at, parcel);
  }

  protected updateCoworker(deltaMs: number): void { this.updateScannerRequest(); this.assistWorker(deltaMs); }

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
    const maxY = held ? this.layout.stairs.maxY - this.layout.carriedClearance : this.layout.workerMaxY;
    let nextY = clamp(worker.y + y / normalized * speed * deltaMs / 1000, this.layout.workerMinY, maxY);
    const bounds = this.walkBounds(worker.side, worker.y);
    let nextX = clamp(worker.x + x / normalized * speed * deltaMs / 1000, bounds.minX, bounds.maxX);
    // Resolve each axis so a diagonal input slides along solid storage instead of tunnelling through it.
    if (!this.walkable(worker.side, nextX, worker.y)) nextX = previousX;
    if (!this.walkable(worker.side, nextX, nextY)) nextY = previousY;
    worker.x = nextX;
    worker.y = nextY;
    worker.moving = previousX !== worker.x || previousY !== worker.y;
    worker.facing = Math.abs(x) > Math.abs(y) ? x > 0 ? 'right' : 'left' : y > 0 ? 'down' : 'up';
  }

  /** Horizontal envelope; walkable() also rejects the gaps beside each flight. */
  public walkBounds(side: 'left' | 'right', y: number): { minX: number; maxX: number } {
    const lane = side === 'left' ? this.layout.leftLane : this.layout.rightLane;
    const floor = this.layout.lowerFloor;
    if (y < floor.top + this.layout.workerRadius || y > floor.bottom - this.layout.workerRadius) return lane;
    return side === 'left' ? { minX: floor.left.minX + this.layout.workerRadius, maxX: lane.maxX }
      : { minX: lane.minX, maxX: floor.right.maxX - this.layout.workerRadius };
  }

  public walkable(side: 'left' | 'right', x: number, y: number): boolean {
    if (y < this.layout.workerMinY || y > this.layout.workerMaxY) return false;
    if (this.workers.find(worker => worker.side === side)?.heldId !== null && !this.clearForCarry(x, y, side)) return false;
    const { stairs, lowerFloor, workerRadius: radius } = this.layout;
    const lane = side === 'left' ? this.layout.leftLane : this.layout.rightLane;
    const floor = lowerFloor[side];
    const deck = x >= lane.minX && x <= lane.maxX;
    const ground = x >= floor.minX + radius && x <= floor.maxX - radius
      && y >= lowerFloor.top + radius && y <= lowerFloor.bottom - radius;
    const flight = y >= stairs.minY + radius && y <= stairs.maxY - radius
      && (side === 'left' ? x >= floor.maxX - radius && x <= lane.minX : x >= lane.maxX && x <= floor.minX + radius);
    if (!deck && !ground && !flight) return false;
    const storage = this.layout.floorStorage[side === 'left' ? 'T' : 'S'];
    const nearestX = clamp(x, storage.x - storage.width / 2, storage.x + storage.width / 2);
    const nearestY = clamp(y, storage.y - storage.height / 2, storage.y + storage.height / 2);
    if (Math.hypot(x - nearestX, y - nearestY) < this.layout.workerRadius) return false;
    return !this.packages.some((parcel) => parcel.state === 'floor' && this.isLowerFloor(parcel) === this.isLowerFloor({ x, y })
      && Math.hypot(x - parcel.x, y - parcel.y) < this.layout.workerRadius + this.layout.parcelRadius);
  }

  protected clearForCarry(x: number, y: number, side: 'left' | 'right'): boolean {
    const radius = this.layout.carriedClearance;
    if (y + radius > this.layout.stairs.maxY) return false;
    const { stairs } = this.layout;
    const flight = stairs[side];
    const railX = clamp(x, Math.min(flight.topX, flight.bottomX), Math.max(flight.topX, flight.bottomX));
    // Include each rail's endpoints: cargo can rotate before entering a flight
    // as well as while descending it. The same check guards pickup poses.
    if ([stairs.minY - 2, stairs.maxY + 0.5].some(railY => Math.hypot(x - railX, y - railY) < radius)) return false;
    if (this.stairSideAt(x, y) === side && (y < stairs.minY + radius || y > stairs.maxY - radius)) return false;
    const storage = this.layout.floorStorage[side === 'left' ? 'T' : 'S'];
    const nearestX = clamp(x, storage.x - storage.width / 2, storage.x + storage.width / 2);
    const nearestY = clamp(y, storage.y - storage.height / 2, storage.y + storage.height / 2);
    return Math.hypot(x - nearestX, y - nearestY) >= radius;
  }

  /** A walking waypoint through the side stair opening, with no position changes or speed boost. */
  public navigationTarget(target: { x: number; y: number }, worker: Worker = this.activeWorker): { x: number; y: number } {
    const { stairs } = this.layout;
    const flight = stairs[worker.side];
    const laneX = worker.side === 'left' ? this.layout.leftLane.maxX : this.layout.rightLane.minX;
    const onDeck = worker.side === 'left' ? worker.x >= flight.topX : worker.x <= flight.topX;
    const radius = worker.heldId === null ? this.layout.workerRadius : this.layout.carriedClearance;
    const aligned = worker.y >= stairs.minY + radius && worker.y <= stairs.maxY - radius;
    if (this.isLowerFloor(target) && onDeck) {
      return aligned ? target : { x: laneX, y: stairs.centerY };
    }
    if (!this.isLowerFloor(target) && !onDeck) {
      if (this.isLowerFloor(worker) && !aligned) return { x: worker.x, y: stairs.centerY };
      return { x: laneX, y: stairs.centerY };
    }
    return target;
  }

  protected syncHeld(worker: Worker, parcel: Parcel): void {
    parcel.x = worker.x + (worker.side === 'left' ? 18 : -18);
    parcel.y = worker.y - 17;
  }

  protected pickup(worker: Worker, parcel: Parcel): void {
    const recovered = parcel.state === 'missed';
    if (recovered) parcel.recovered = true;
    parcel.state = 'held';
    parcel.workerId = worker.id;
    worker.heldId = parcel.id;
    this.syncHeld(worker, parcel);
    this.emit(recovered ? 'recover' : 'grab', recovered ? 'Recovered · deliver to clear the backlog' : ROUTE_NAMES[parcel.route], worker, parcel);
  }

  /** Reach is measured on one flat surface, never through the deck edge or stair stringers. */
  protected canPickup(worker: Worker, parcel: Parcel): boolean {
    if (parcel.state !== 'belt' && parcel.state !== 'floor' && parcel.state !== 'missed') return false;
    if (!this.clearForCarry(worker.x, worker.y, worker.side)) return false;
    if (this.stairSideAt(worker.x, worker.y)) return false;
    if (parcel.state === 'floor') {
      if (worker.side === 'left' ? parcel.x > 440 : parcel.x < 520) return false;
      if (this.isLowerFloor(worker) !== this.isLowerFloor(parcel)) return false;
    } else if (this.isLowerFloor(worker)) return false;
    return distance(worker, parcel) <= this.layout.grabRadius;
  }

  /** Same walking, carrying, stairs and delivery rules as the player; never throws or handles bulk. */
  private assistWorker(deltaMs: number): void {
    const worker = this.workers[this.activeIndex === 0 ? 1 : 0];
    worker.moving = false;
    if (!this.assistanceActive || this.scannerWorker === worker.id) return;
    const held = this.packages.find((parcel) => parcel.id === worker.heldId);
    const owned = WORKER_ROUTES[worker.id];
    // Taking control of a worker is immediate; leaving them with another route never hides a handoff.
    if (held && !owned.includes(held.route)) return;
    const parcel = held ?? this.packages.filter((item) => owned.includes(item.route)
      && (item.state === 'belt' || item.state === 'missed'
        || (item.state === 'floor' && (worker.side === 'left' ? item.x <= 440 : item.x >= 520))))
      .sort((a, b) => (a.state === 'missed' ? -1 : 0) - (b.state === 'missed' ? -1 : 0) || b.y - a.y)[0];
    const laneX = worker.side === 'left' ? this.layout.leftLane.maxX : this.layout.rightLane.minX;
    const destination = parcel ? held ? this.destinationCenter(held.route, worker.side)
      : this.isLowerFloor(parcel) ? parcel : { x: laneX, y: parcel.y } : { x: laneX, y: 500 };
    if (held && this.currentDock(worker) === held.route) {
      this.release(worker, held);
      this.deliver(held, true);
      return;
    }
    if (!held && parcel && this.canPickup(worker, parcel)) {
      this.pickup(worker, parcel);
      return;
    }
    const target = this.navigationTarget(destination, worker);
    const dx = target.x - worker.x;
    const dy = target.y - worker.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-8) return;
    // Shorten the last ordinary input step instead of oscillating across a narrow stair waypoint.
    const step = 235 * (held ? CARRY_MULTIPLIER[held.kind] : 1) * deltaMs / 1000;
    const divisor = Math.max(length, step);
    this.moveWorker(deltaMs, { x: dx / divisor, y: dy / divisor }, worker);
  }

  /** Two brief handovers after real assisted work, never from a clock-only fixture. */
  protected updateScannerRequest(): void {
    if (!this.assistanceActive || this.scannerWorker || this.elapsedMs >= this.durationMs || this.scannerFaultIndex >= 2) return;
    const at = this.scannerFaultIndex === 0 ? 70_000 : 135_000;
    const deliveries = this.scannerFaultIndex === 0 ? 4 : 10;
    if (this.elapsedMs < at || this.assistedDeliveries < deliveries) return;
    const worker = this.workers[this.activeIndex === 0 ? 1 : 0];
    this.scannerWorker = worker.id;
    this.scannerFaultIndex += 1;
    this.emit('scanner', this.scannerRequest!.message, worker);
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
      if ((route === 'T' || route === 'S') !== this.isLowerFloor(worker)) continue;
      const area = this.layout.dropAreas[route as 'A' | 'B' | 'D' | 'E' | 'T' | 'S'];
      // Truck areas exclude their lower edge; each painted route has one owner.
      if (Math.abs(worker.x - area.x) <= area.width / 2 && worker.y >= area.y - area.height / 2 && worker.y < area.y + area.height / 2) return route;
    }
    const bulk = worker.side === 'left' ? this.layout.dropAreas.bulkLeft : this.layout.dropAreas.bulkRight;
    if (inside(bulk, worker)) return 'C';
    return null;
  }

  protected deliver(parcel: Parcel, assisted = false): void {
    const base = DELIVERY_POINTS[parcel.route];
    const award = assisted ? 0 : parcel.recovered ? base / 2 : base + Math.min(this.combo, 10) * 15;
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
    if (assisted) this.assistedDeliveries += 1;
    else {
      this.combo += 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
    }
    this.emit('sort', assisted ? 'PARTNER SORTED · NO POINTS' : `${parcel.recovered ? 'RECOVERED' : parcel.thrownDelivery ? 'THROWN IN' : 'SORTED'} +${award}`, parcel, parcel, award, assisted);
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

  protected freightIdentity(id: number, _ordinaryIndex: number, brianKind: ParcelKind | null): ParcelIdentity {
    const { route, kind } = brianKind ? { route: 'C' as const, kind: brianKind } : PARCEL_SEQUENCE[(id - 1) % PARCEL_SEQUENCE.length];
    return { id, route, kind, label: PARCEL_LABELS[kind], size: CARRY_MULTIPLIER[kind] <= 0.7 ? 'heavy' : 'normal' };
  }

  private nextParcelIdentity(plannedArrival: number): PendingIntake {
    const brianSending = this.brianRemaining > 0 || (!this.brianSent && plannedArrival >= 63_000);
    const brianIndex = this.brianRemaining > 0 ? BRIAN_BULK_SEQUENCE.length - this.brianRemaining : 0;
    return { ...this.freightIdentity(this.nextId, this.ordinaryFreightCount, brianSending ? BRIAN_BULK_SEQUENCE[brianIndex] : null), brian: brianSending };
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
      id, route, kind, label, size,
      ...(address === undefined ? {} : { address }), ...(street === undefined ? {} : { street }),
      x: this.layout.beltX, y: spawnY, state: 'belt', workerId: null,
      beltOffset: spawnY - this.beltTravel, recovered: false, missCounted: false,
      broken: false, breakY: kind === 'makeup' ? 220 + id * 73 % 301 : null,
    });
    this.pendingIntake = null;
    if (brian) this.brianRemaining -= 1;
    else this.ordinaryFreightCount += 1;
    return true;
  }

  protected speedAt(elapsedMs: number): number {
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
    const message = phase === 'flow' ? `TEAM FLOW · freight every ${this.freightFlow.flowMs / 1000}s · your partner sorts their own routes` : phase === 'rush' ? `LAST PUSH · freight every ${this.freightFlow.rushMs / 1000} seconds` : phase === 'cleanup' ? `INTAKE CLOSED · ${this.cleanupMs / 1000} seconds to clear your freight` : 'Find your rhythm';
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

  protected emit(type: ShiftEvent['type'], message: string, point: { x: number; y: number }, parcel?: Parcel, score?: number, assisted?: boolean): void {
    const workerId = 'id' in point && (point.id === 'termite' || point.id === 'skanky') ? point.id : undefined;
    this.events.push({ type, message, x: point.x, y: point.y, route: parcel?.route, packageId: parcel?.id, score, workerId, assisted });
  }
}

export default ShiftModel;
