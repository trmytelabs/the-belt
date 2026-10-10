/**
 * Deterministic rules for the Night Shift playable slice.
 *
 * The original full-shift game is deliberately independent of this model.
 * All time inputs are milliseconds. The renderer reads beltTravel for both
 * the tread phase and parcel positions: there is no separate parcel velocity.
 */
export type Route = 'A' | 'B' | 'C';
export type WorkerId = 'termite' | 'skanky';
export type PackageState = 'belt' | 'held' | 'floor' | 'delivered' | 'missed';
export type ShiftPhase = 'lesson' | 'flow' | 'rush' | 'cleanup' | 'ended';

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
}

export interface ShiftEvent {
  type: 'grab' | 'drop' | 'sort' | 'wrong' | 'miss' | 'recover' | 'brake' | 'switch' | 'phase' | 'end';
  message: string;
  x: number;
  y: number;
  route?: Route;
  score?: number;
  packageId?: number;
}

export const SHIFT_LAYOUT = {
  beltX: 480,
  beltTop: 146,
  beltBottom: 610,
  grabRadius: 102,
  parcelGap: 68,
  dockA: { x: 260, y: 300 },
  dockB: { x: 700, y: 300 },
  bulkLeft: { x: 260, y: 492 },
  bulkRight: { x: 700, y: 492 },
} as const;

const ROUTE_NAMES: Record<Route, string> = {
  A: 'A · HERES UR SOVICE · left dock',
  B: 'B · PAYTMAN · right dock',
  C: 'C · BULK · either lower dock',
};
const ROUTE_SEQUENCE: readonly Route[] = [
  'A', 'B', 'C', 'A', 'B', 'C',
  'B', 'A', 'C', 'B', 'A', 'B', 'C', 'A', 'C', 'B', 'A', 'C', 'A', 'B', 'C', 'B',
];

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const smoothStep = (value: number): number => value * value * (3 - 2 * value);

export class ShiftModel {
  public readonly workers: Worker[] = [
    { id: 'termite', x: 382, y: 380, side: 'left', heldId: null, facing: 'right', moving: false },
    { id: 'skanky', x: 578, y: 380, side: 'right', heldId: null, facing: 'left', moving: false },
  ];
  public readonly packages: Parcel[] = [];
  public readonly durationMs = 90_000;
  public readonly cleanupMs = 10_000;
  public readonly goal = 12;
  public readonly capacity = 5;
  public activeIndex = 0;
  public elapsedMs = 0;
  public beltTravel = 0;
  public beltSpeed = 50;
  public phase: ShiftPhase = 'lesson';
  public score = 0;
  public sorted = 0;
  public missed = 0;
  public combo = 0;
  public bestCombo = 0;
  public paused = false;
  public brakeRemainingMs = 0;
  public brakeCooldownMs = 0;
  public ended = false;
  public won = false;

  private events: ShiftEvent[] = [];
  private nextId = 1;
  private spawnElapsedMs = 0;
  private nextSpawnIntervalMs = 6_000;
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

  public get heldPackage(): Parcel | null {
    return this.packages.find((parcel) => parcel.id === this.activeWorker.heldId) ?? null;
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
        this.emit('wrong', `This parcel needs ${ROUTE_NAMES[held.route]}`, worker, held);
      } else {
        this.deliver(worker, held);
      }
      return;
    }

    if (Math.abs(worker.x - SHIFT_LAYOUT.beltX) <= SHIFT_LAYOUT.grabRadius) {
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

    const floorX = clamp(worker.x + (worker.side === 'left' ? 23 : -23), worker.side === 'left' ? 246 : 542, worker.side === 'left' ? 418 : 714);
    const floorY = clamp(worker.y + 12, 190, 584);
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
    const previousBrakeMs = this.brakeRemainingMs;
    this.brakeRemainingMs = Math.max(0, this.brakeRemainingMs - deltaMs);
    this.brakeCooldownMs = Math.max(0, this.brakeCooldownMs - deltaMs);
    const movingMs = Math.max(0, deltaMs - previousBrakeMs);
    const startSpeed = this.speedAt(oldElapsed + (deltaMs - movingMs));
    const endSpeed = this.speedAt(this.elapsedMs);
    this.beltSpeed = this.brakeRemainingMs > 0 ? 0 : endSpeed;
    this.beltTravel += ((startSpeed + endSpeed) / 2) * movingMs / 1000;

    this.moveWorker(deltaMs, move);
    for (const worker of this.workers) {
      const held = this.packages.find((parcel) => parcel.id === worker.heldId);
      if (held) this.syncHeld(worker, held);
    }
    for (const parcel of this.packages) {
      if (parcel.state !== 'belt') continue;
      parcel.y = this.beltTravel + parcel.beltOffset;
      if (parcel.y >= SHIFT_LAYOUT.beltBottom) this.miss(parcel);
    }

    if (this.pileup >= this.capacity) {
      this.finish(false, 'Recovery bay full · rescue parcels before five stack up');
      return;
    }
    if (this.elapsedMs < this.durationMs) {
      this.spawnElapsedMs += movingMs;
      if (this.spawnElapsedMs >= this.nextSpawnIntervalMs && this.spawnPackage()) {
        this.spawnElapsedMs -= this.nextSpawnIntervalMs;
        // A phase change applies to the next interval, so it cannot produce
        // an unexpected short gap immediately after the previous parcel.
        this.nextSpawnIntervalMs = this.phase === 'lesson' ? 6_000 : this.phase === 'flow' ? 4_000 : 3_000;
      }
    } else {
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
    const speed = held ? held.size === 'heavy' ? 170 : 195 : 235;
    const normalized = Math.max(1, magnitude);
    const previousX = worker.x;
    const previousY = worker.y;
    worker.x = clamp(worker.x + x / normalized * speed * deltaMs / 1000, worker.side === 'left' ? 240 : 560, worker.side === 'left' ? 400 : 720);
    worker.y = clamp(worker.y + y / normalized * speed * deltaMs / 1000, 180, 580);
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

  private currentDock(worker: Worker): Route | null {
    if (worker.side === 'left' ? worker.x > 312 : worker.x < 648) return null;
    if (Math.abs(worker.y - 300) <= 56) return worker.side === 'left' ? 'A' : 'B';
    if (Math.abs(worker.y - 492) <= 56) return 'C';
    return null;
  }

  private deliver(worker: Worker, parcel: Parcel): void {
    const base = parcel.route === 'C' ? 120 : 100;
    const award = parcel.recovered ? base / 2 : base + Math.min(this.combo, 10) * 15;
    parcel.state = 'delivered';
    parcel.x = worker.side === 'left' ? 260 : 700;
    parcel.y = parcel.route === 'C' ? 492 : 300;
    this.release(worker, parcel);
    this.score += award;
    this.sorted += 1;
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.emit('sort', `${parcel.recovered ? 'RECOVERED' : 'SORTED'} +${award}`, parcel, parcel, award);
  }

  private miss(parcel: Parcel): void {
    parcel.state = 'missed';
    parcel.x = SHIFT_LAYOUT.beltX;
    parcel.y = SHIFT_LAYOUT.beltBottom;
    if (!this.countedMisses.has(parcel.id)) {
      this.countedMisses.add(parcel.id);
      parcel.missCounted = true;
      this.missed += 1;
    }
    this.combo = 0;
    this.emit('miss', `${this.pileup}/${this.capacity} in recovery · pick up near the belt end`, parcel, parcel);
  }

  private spawnPackage(): boolean {
    const spawnY = SHIFT_LAYOUT.beltTop + 26;
    if (this.packages.some((parcel) => parcel.state === 'belt' && Math.abs(parcel.y - spawnY) < SHIFT_LAYOUT.parcelGap)) return false;
    const route = ROUTE_SEQUENCE[(this.nextId - 1) % ROUTE_SEQUENCE.length];
    this.packages.push({
      id: this.nextId++, route, size: route === 'C' ? 'heavy' : 'normal',
      x: SHIFT_LAYOUT.beltX, y: spawnY, state: 'belt', workerId: null,
      beltOffset: spawnY - this.beltTravel, recovered: false, missCounted: false,
    });
    return true;
  }

  private speedAt(elapsedMs: number): number {
    if (elapsedMs < 36_000) return 50;
    if (elapsedMs < 42_000) return 50 + 18 * smoothStep((elapsedMs - 36_000) / 6_000);
    if (elapsedMs < 63_000) return 68;
    if (elapsedMs < 69_000) return 68 + 17 * smoothStep((elapsedMs - 63_000) / 6_000);
    return 85;
  }

  private updatePhase(): void {
    const phase: ShiftPhase = this.elapsedMs < 36_000 ? 'lesson' : this.elapsedMs < 63_000 ? 'flow' : this.elapsedMs < this.durationMs ? 'rush' : 'cleanup';
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
    for (const worker of this.workers) worker.moving = false;
    this.emit('end', message, { x: 480, y: 340 });
  }

  private emit(type: ShiftEvent['type'], message: string, point: { x: number; y: number }, parcel?: Parcel, score?: number): void {
    this.events.push({ type, message, x: point.x, y: point.y, route: parcel?.route, packageId: parcel?.id, score });
  }
}

export default ShiftModel;
