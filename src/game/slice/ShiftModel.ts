/**
 * Deterministic rules for the Night Shift playable slice.
 *
 * The original full-shift game is deliberately independent of this model.
 * All time inputs are milliseconds. The renderer reads beltTravel for both
 * the tread phase and parcel positions: there is no separate parcel velocity.
 */
export type Route = 'A' | 'B' | 'C';
export type ParcelKind = 'envelope' | 'smallbox' | 'standard' | 'bigbox' | 'longbox' | 'mallwood' | 'goji' | 'lobsters' | 'duck' | 'makeup' | 'mesa' | 'panchetters' | 'atv' | 'snakes';
export type WorkerId = 'termite' | 'skanky';
export type PackageState = 'belt' | 'held' | 'floor' | 'delivered' | 'missed';
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

export interface Parcel {
  id: number;
  route: Route;
  kind: ParcelKind;
  label: string;
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
  broken: boolean;
  breakY: number | null;
}

type ParcelIdentity = Pick<Parcel, 'id' | 'route' | 'kind' | 'label' | 'size'>;
type PendingIntake = ParcelIdentity & { brian: boolean };

/** One reserved real parcel on its final receiving-to-belt transfer. */
export interface IntakePreview extends ParcelIdentity {
  progress: number;
  x: number;
  y: number;
}

export interface ShiftEvent {
  type: 'grab' | 'drop' | 'sort' | 'wrong' | 'miss' | 'recover' | 'brake' | 'switch' | 'phase' | 'brian' | 'spill' | 'end';
  message: string;
  x: number;
  y: number;
  route?: Route;
  score?: number;
  packageId?: number;
}

export const SHIFT_LAYOUT = {
  worldTop: -240,
  receivingTop: -240,
  worldBottom: 714,
  beltX: 480,
  beltTop: 146,
  beltBottom: 550,
  grabRadius: 102,
  parcelGap: 68,
  dockA: { x: 360, y: 532 },
  dockB: { x: 600, y: 532 },
  bulkPile: { x: 480, y: 610 },
  bulkLeft: { x: 400, y: 624 },
  bulkRight: { x: 560, y: 624 },
  recoveryPile: { x: 480, y: 690 },
  /** Centered rectangles shared by delivery rules, guidance and painted floor markings. */
  dropAreas: {
    A: { x: 381, y: 532, width: 78, height: 88 },
    B: { x: 579, y: 532, width: 78, height: 88 },
    bulkLeft: { x: 400, y: 624, width: 80, height: 96 },
    bulkRight: { x: 560, y: 624, width: 80, height: 96 },
  },
  workerMinY: -20,
  workerMaxY: 690,
  leftLane: { minX: 330, maxX: 400 },
  rightLane: { minX: 560, maxX: 630 },
} as const;

const ROUTE_NAMES: Record<Route, string> = {
  A: 'A · HERES UR SOVICE · left dock',
  B: 'B · PAYTMAN · right dock',
  C: 'C · BULK · shared pile at the belt end',
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
const PARCEL_SEQUENCE: readonly { route: Route; kind: ParcelKind }[] = [
  { route: 'A', kind: 'mallwood' },
  { route: 'B', kind: 'goji' },
  { route: 'C', kind: 'lobsters' },
  { route: 'A', kind: 'duck' },
  { route: 'B', kind: 'makeup' },
  { route: 'C', kind: 'mesa' },
  { route: 'B', kind: 'panchetters' },
  { route: 'A', kind: 'envelope' },
  { route: 'C', kind: 'atv' },
  { route: 'B', kind: 'standard' },
  { route: 'A', kind: 'mallwood' },
  { route: 'B', kind: 'goji' },
  { route: 'C', kind: 'lobsters' },
  { route: 'A', kind: 'panchetters' },
  { route: 'C', kind: 'mesa' },
  { route: 'B', kind: 'makeup' },
  { route: 'A', kind: 'duck' },
  { route: 'C', kind: 'atv' },
  { route: 'A', kind: 'bigbox' },
  { route: 'B', kind: 'standard' },
  { route: 'C', kind: 'lobsters' },
  { route: 'B', kind: 'panchetters' },
  { route: 'A', kind: 'smallbox' },
  { route: 'B', kind: 'longbox' },
];
const BRIAN_BULK_SEQUENCE: readonly ParcelKind[] = ['atv', 'lobsters', 'mesa', 'panchetters', 'mallwood'];
const INTAKE_TRANSFER_MS = 900;
const INTAKE_START_Y = 127;
/** Original Player carry weights, mapped to each freight's original form. */
const CARRY_MULTIPLIER: Record<ParcelKind, number> = {
  envelope: 1, smallbox: 0.95, standard: 0.85, bigbox: 0.7, longbox: 0.7,
  mallwood: 0.7, goji: 0.9, lobsters: 0.55, duck: 0.95, makeup: 0.85,
  mesa: 0.4, panchetters: 0.85, atv: 0.4, snakes: 0.85,
};

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const smoothStep = (value: number): number => value * value * (3 - 2 * value);

export class ShiftModel {
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
  public paused = false;
  /** Vic/Shan can stop the machinery while workers and the shift clock continue. */
  public eventStopped = false;
  public brakeRemainingMs = 0;
  public brakeCooldownMs = 0;
  public brianRemaining = 0;
  public ended = false;
  public won = false;

  private events: ShiftEvent[] = [];
  private nextId = 1;
  private spawnElapsedMs = 0;
  private nextSpawnIntervalMs = 6_000;
  private pendingIntake: PendingIntake | null = null;
  private brianSent = false;
  private wrongSortErrors = 0;
  private readonly countedMisses = new Set<number>();

  constructor() {
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

  public get errors(): number {
    return this.missed + this.wrongSortErrors;
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
    const { id, route, kind, label, size } = this.pendingIntake;
    const progress = clamp((this.spawnElapsedMs - this.nextSpawnIntervalMs + INTAKE_TRANSFER_MS) / INTAKE_TRANSFER_MS, 0, 1);
    return {
      id, route, kind, label, size, progress, x: SHIFT_LAYOUT.beltX,
      y: INTAKE_START_Y + (SHIFT_LAYOUT.beltTop + 26 - INTAKE_START_Y) * progress,
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
  public nearestPackage(): Parcel | null {
    const worker = this.activeWorker;
    let nearest: Parcel | null = null;
    let nearestDistance = SHIFT_LAYOUT.grabRadius + 0.0001;
    for (const parcel of this.packages) {
      if (parcel.state !== 'belt' && parcel.state !== 'floor' && parcel.state !== 'missed') continue;
      if (parcel.state === 'floor' && (worker.side === 'left' ? parcel.x > 440 : parcel.x < 520)) continue;
      const separation = distance(worker, parcel);
      if (separation < nearestDistance) {
        nearestDistance = separation;
        nearest = parcel;
      }
    }
    return nearest;
  }

  public action(): void {
    if (!this.canAct()) return;
    const worker = this.activeWorker;
    const held = this.heldPackage;
    if (!held) {
      const parcel = this.nearestPackage();
      if (!parcel) {
        this.emit('wrong', 'Move closer to a parcel, then press SPACE', worker);
        return;
      }
      const recovered = parcel.state === 'missed';
      if (recovered) parcel.recovered = true;
      parcel.state = 'held';
      parcel.workerId = worker.id;
      worker.heldId = parcel.id;
      this.syncHeld(worker, parcel);
      this.emit(recovered ? 'recover' : 'grab', recovered ? 'Recovered · deliver to clear the backlog' : ROUTE_NAMES[parcel.route], worker, parcel);
      return;
    }

    const dock = this.currentDock(worker);
    if (dock) {
      if (dock !== held.route) {
        this.combo = 0;
        if (!held.recovered) this.wrongSortErrors += 1;
        this.emit('wrong', `This parcel needs ${ROUTE_NAMES[held.route]}`, worker, held);
      } else {
        this.deliver(worker, held);
      }
      return;
    }

    if (Math.abs(worker.x - SHIFT_LAYOUT.beltX) <= SHIFT_LAYOUT.grabRadius && worker.y >= SHIFT_LAYOUT.beltTop && worker.y <= SHIFT_LAYOUT.beltBottom) {
      const dropY = clamp(worker.y, SHIFT_LAYOUT.beltTop + 28, SHIFT_LAYOUT.beltBottom - 42);
      if (this.packages.some((parcel) => parcel.id !== held.id && parcel.state === 'belt' && Math.abs(parcel.y - dropY) < SHIFT_LAYOUT.parcelGap)) {
        this.emit('wrong', 'Belt space occupied · move along the belt to place it', worker, held);
        return;
      }
      held.x = SHIFT_LAYOUT.beltX;
      held.y = dropY;
      held.beltOffset = dropY - this.beltTravel;
      held.state = 'belt';
      this.release(worker, held);
      this.emit('drop', 'Back on the belt · TAB to hand off', held, held);
      return;
    }

    const floorX = clamp(worker.x + (worker.side === 'left' ? 23 : -23), worker.side === 'left' ? SHIFT_LAYOUT.leftLane.minX + 6 : 542, worker.side === 'left' ? 418 : SHIFT_LAYOUT.rightLane.maxX - 6);
    const floorY = clamp(worker.y + 12, SHIFT_LAYOUT.workerMinY + 10, SHIFT_LAYOUT.worldBottom - 18);
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

  public drainEvents(): ShiftEvent[] {
    const result = this.events;
    this.events = [];
    return result;
  }

  private canAct(): boolean {
    return !this.paused && !this.ended;
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
      if (parcel.state !== 'belt') continue;
      parcel.y = this.beltTravel + parcel.beltOffset;
      if (movingMs > 0 && parcel.kind === 'makeup' && !parcel.broken && parcel.breakY !== null && parcel.y >= parcel.breakY) {
        parcel.broken = true;
        this.emit('spill', parcel.label, parcel, parcel);
      }
      if (parcel.y >= SHIFT_LAYOUT.beltBottom) this.miss(parcel);
    }

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
        this.nextSpawnIntervalMs = this.brianRemaining > 0 ? 1_900
          : this.phase === 'lesson' ? 6_000 : this.phase === 'flow' ? 4_000 : 3_000;
      }
    } else {
      // A parcel still in receiving is not on the shift's belt or score sheet.
      this.pendingIntake = null;
      const unfinished = this.packages.some((parcel) => parcel.state !== 'delivered');
      if (!unfinished || this.elapsedMs >= this.durationMs + this.cleanupMs) {
        this.finish(this.sorted >= this.goal, this.sorted >= this.goal ? 'Shift complete · freight cleared' : `Shift complete · ${this.sorted}/${this.goal} delivered`);
      }
    }
  }

  private moveWorker(deltaMs: number, move: { x: number; y: number }): void {
    const worker = this.activeWorker;
    const x = Number.isFinite(move.x) ? clamp(move.x, -1, 1) : 0;
    const y = Number.isFinite(move.y) ? clamp(move.y, -1, 1) : 0;
    const magnitude = Math.hypot(x, y);
    worker.moving = magnitude > 0;
    if (!worker.moving) return;
    const held = this.heldPackage;
    const speed = 235 * (held ? CARRY_MULTIPLIER[held.kind] : 1);
    const normalized = Math.max(1, magnitude);
    const previousX = worker.x;
    const previousY = worker.y;
    const lane = worker.side === 'left' ? SHIFT_LAYOUT.leftLane : SHIFT_LAYOUT.rightLane;
    const frontX = worker.side === 'left' ? SHIFT_LAYOUT.dockA.x : SHIFT_LAYOUT.dockB.x;
    const truckTop = SHIFT_LAYOUT.dockA.y - 56;
    const truckBottom = SHIFT_LAYOUT.dockA.y + 56;
    let nextX = clamp(worker.x + x / normalized * speed * deltaMs / 1000, lane.minX, lane.maxX);
    let nextY = clamp(worker.y + y / normalized * speed * deltaMs / 1000, SHIFT_LAYOUT.workerMinY, SHIFT_LAYOUT.workerMaxY);
    // Resolve each axis against the main truck plus the worker's clearance.
    // A vertical approach stops at its edge; the player can then walk inward
    // around the front without being teleported sideways or catching a corner.
    if (previousY > truckTop && previousY < truckBottom) {
      nextX = worker.side === 'left' ? Math.max(frontX, nextX) : Math.min(frontX, nextX);
    }
    const outsideFront = worker.side === 'left' ? nextX < frontX : nextX > frontX;
    if (outsideFront) {
      if (previousY <= truckTop && nextY > truckTop) nextY = truckTop;
      else if (previousY >= truckBottom && nextY < truckBottom) nextY = truckBottom;
    }
    worker.x = nextX;
    worker.y = nextY;
    worker.moving = previousX !== worker.x || previousY !== worker.y;
    worker.facing = Math.abs(x) > Math.abs(y) ? x > 0 ? 'right' : 'left' : y > 0 ? 'down' : 'up';
  }

  private syncHeld(worker: Worker, parcel: Parcel): void {
    parcel.x = worker.x + (worker.side === 'left' ? 18 : -18);
    parcel.y = worker.y - 17;
  }

  private release(worker: Worker, parcel: Parcel): void {
    worker.heldId = null;
    parcel.workerId = null;
  }

  public currentDock(worker: Worker = this.activeWorker): Route | null {
    const lane = worker.side === 'left' ? SHIFT_LAYOUT.leftLane : SHIFT_LAYOUT.rightLane;
    if (worker.x < lane.minX || worker.x > lane.maxX) return null;
    const dock = worker.side === 'left' ? SHIFT_LAYOUT.dropAreas.A : SHIFT_LAYOUT.dropAreas.B;
    // Truck areas exclude their lower edge; the adjoining bulk area owns it.
    if (Math.abs(worker.x - dock.x) <= dock.width / 2 && worker.y >= dock.y - dock.height / 2 && worker.y < dock.y + dock.height / 2) return worker.side === 'left' ? 'A' : 'B';
    const bulk = worker.side === 'left' ? SHIFT_LAYOUT.dropAreas.bulkLeft : SHIFT_LAYOUT.dropAreas.bulkRight;
    if (Math.abs(worker.x - bulk.x) <= bulk.width / 2 && Math.abs(worker.y - bulk.y) <= bulk.height / 2) return 'C';
    return null;
  }

  private deliver(worker: Worker, parcel: Parcel): void {
    const base = parcel.route === 'C' ? 120 : 100;
    const award = parcel.recovered ? base / 2 : base + Math.min(this.combo, 10) * 15;
    parcel.state = 'delivered';
    const destination = parcel.route === 'C' ? SHIFT_LAYOUT.bulkPile : parcel.route === 'A' ? SHIFT_LAYOUT.dockA : SHIFT_LAYOUT.dockB;
    parcel.x = destination.x;
    parcel.y = destination.y;
    this.release(worker, parcel);
    this.score += award;
    this.sorted += 1;
    if (parcel.route === 'C') this.bulkSorted += 1;
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.emit('sort', `${parcel.recovered ? 'RECOVERED' : 'SORTED'} +${award}`, parcel, parcel, award);
  }

  private miss(parcel: Parcel): void {
    parcel.state = 'missed';
    parcel.x = SHIFT_LAYOUT.recoveryPile.x;
    parcel.y = SHIFT_LAYOUT.recoveryPile.y;
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
    const { route, kind } = brianSending
      ? { route: 'C' as const, kind: BRIAN_BULK_SEQUENCE[brianIndex] }
      : PARCEL_SEQUENCE[(this.nextId - 1) % PARCEL_SEQUENCE.length];
    return {
      id: this.nextId, route, kind, label: PARCEL_LABELS[kind],
      size: CARRY_MULTIPLIER[kind] <= 0.7 ? 'heavy' : 'normal', brian: brianSending,
    };
  }

  private spawnPackage(): boolean {
    const spawnY = SHIFT_LAYOUT.beltTop + 26;
    if (this.packages.some((parcel) => parcel.state === 'belt' && Math.abs(parcel.y - spawnY) < SHIFT_LAYOUT.parcelGap)) return false;
    // Once the unloaders show a parcel, its identity must survive a brake or
    // blocked intake. An ordinary reservation delayed past Brian's cue lands
    // first; all five Brian parcels follow without consuming one of his slots.
    const { id, route, kind, label, size, brian } = this.pendingIntake ?? this.nextParcelIdentity(this.elapsedMs);
    this.nextId += 1;
    this.packages.push({
      id, route, kind, label, size,
      x: SHIFT_LAYOUT.beltX, y: spawnY, state: 'belt', workerId: null,
      beltOffset: spawnY - this.beltTravel, recovered: false, missCounted: false,
      broken: false, breakY: kind === 'makeup' ? 220 + id * 73 % 301 : null,
    });
    this.pendingIntake = null;
    if (brian) this.brianRemaining -= 1;
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
    const message = phase === 'flow' ? 'STEADY FLOW · freight every 4 seconds' : phase === 'rush' ? 'LAST PUSH · freight every 3 seconds' : phase === 'cleanup' ? 'INTAKE CLOSED · 10 seconds to clear your freight' : 'Find your rhythm';
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

  private emit(type: ShiftEvent['type'], message: string, point: { x: number; y: number }, parcel?: Parcel, score?: number): void {
    this.events.push({ type, message, x: point.x, y: point.y, route: parcel?.route, packageId: parcel?.id, score });
  }
}

export default ShiftModel;
