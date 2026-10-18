import {
  ShiftModel, CARRY_MULTIPLIER, WORKER_ROUTES, THROWING,
  type Parcel, type ParcelKind, type Route, type Worker, type ThrowTarget, type ShiftGrade,
} from '../game/slice/ShiftModel.ts';
import { ROUTE_INFO, PARCEL_LABELS, PARCEL_SEQUENCE, EVERYDAY_FREIGHT, parcelAddress, MESA_CATCH_PENALTY } from './addresses.ts';
import { DEPOT_3D_LAYOUT, platformLevelAt, onLowerFloor, floorPileSlot, stairAt, truckInteriorAt, TRUCK_ROUTES, type TruckRoute } from './layout.ts';

export const WRONG_DROP_PENALTY = 10;
export const ARRIVALS_3D = { lessonMs: 4_800, flowMs: 3_200, rushMs: 2_400, brianMs: 2_400 } as const;
export interface TruckLoad { route: TruckRoute; x: number; y: number; height: number; layer: number; column: number; row: number; cells: number; parcelHeight: number; overflow: boolean }
// Conservative dimensions in model pixels for the actual parcel forms at their
// normal render scale. Long boxes lie along the cargo bay, occupying two slots.
const LOAD_HEIGHT: Record<ParcelKind, number> = { envelope: 4, smallbox: 14, standard: 18, bigbox: 26,
  longbox: 14, mallwood: 20, goji: 19, lobsters: 23, duck: 23, makeup: 23, mesa: 31, panchetters: 20, atv: 27, snakes: 15 };
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Current 3D rules. The legacy depots retain the base model's layout and behavior. */
export class ShiftModel3D extends ShiftModel {
  public override readonly layout = DEPOT_3D_LAYOUT;
  protected override get freightFlow() { return ARRIVALS_3D; }
  private placement: { x: number; row: number } | null = null;
  public readonly truckLoads = new Map<number, TruckLoad>();
  public laneObstacles: readonly { x: number; y: number }[] = [];
  protected override surfaceLevelAt = platformLevelAt;
  protected override isLowerFloor = onLowerFloor;
  protected override pileSlot = floorPileSlot;

  /** Recovery already costs base points and a combo; only unfinished freight remains an error. */
  public get unshipped(): number { return Math.max(0, this.packages.length - this.sorted - this.damaged); }
  public get recoveredDeliveries(): number { return this.packages.filter(parcel => parcel.state === 'delivered' && parcel.recovered).length; }
  public get wrongDrops(): number { return this.wrongSortErrors; }
  public get dispatchRate(): number { return this.packages.length ? this.sorted / this.packages.length * 100 : 0; }
  public override get errors(): number { return this.unshipped + this.wrongDrops + this.gradedBreaks; }
  public override get accuracy(): number {
    const total = this.sorted + this.errors;
    return total ? this.sorted / total * 100 : 0;
  }
  public override get grade(): ShiftGrade {
    if (this.ended && !this.won) return 'F';
    if (this.accuracy >= 95) return 'S';
    if (this.accuracy >= 90) return 'A';
    if (this.accuracy >= 80) return 'B';
    if (this.accuracy >= 70) return 'C';
    return 'F';
  }
  public override get gradeQuote(): string { return this.grade === 'S' ? 'OUTSTANDING SHIFT' : super.gradeQuote; }

  protected override freightIdentity(id: number, slot: number, brianKind: ParcelKind | null) {
    const everyday = brianKind === null && slot % 3 !== 0;
    const regular = everyday ? EVERYDAY_FREIGHT[Math.min(EVERYDAY_FREIGHT.length - 1, Math.floor(this.freightRandom() * EVERYDAY_FREIGHT.length))] : null;
    const routes: readonly Route[] = regular && CARRY_MULTIPLIER[regular.kind] <= 0.7 ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'D', 'E', 'T', 'S'];
    const { route, kind } = brianKind ? { route: 'C' as const, kind: brianKind }
      : regular ? { route: routes[Math.min(routes.length - 1, Math.floor(this.freightRandom() * routes.length))], kind: regular.kind }
        : PARCEL_SEQUENCE[Math.floor(slot / 3) % PARCEL_SEQUENCE.length];
    const range = ROUTE_INFO[route].streets;
    const street = range ? range[0] + id * 17 % (range[1] - range[0] + 1) : undefined;
    return { id, route, kind, label: regular?.label ?? PARCEL_LABELS[kind], street, address: parcelAddress({ id, route, street }), size: CARRY_MULTIPLIER[kind] <= 0.7 ? 'heavy' as const : 'normal' as const };
  }

  public penalizeMesaTheft(): number {
    const penalty = Math.min(this.score, MESA_CATCH_PENALTY);
    this.score -= penalty; this.combo = 0; return penalty;
  }

  protected override syncHeld(worker: Worker, parcel: Parcel): void {
    parcel.x = worker.x + (worker.side === 'left' ? 42 : -42);
    parcel.y = worker.y - 17;
  }

  protected override pickup(worker: Worker, parcel: Parcel): void {
    const recovered = parcel.state === 'missed';
    if (recovered) parcel.recovered = true;
    parcel.state = 'held'; parcel.workerId = worker.id; worker.heldId = parcel.id;
    this.syncHeld(worker, parcel);
    this.emit(recovered ? 'recover' : 'grab', `${recovered ? 'Recovered · ' : ''}${parcelAddress(parcel)} · read the floor ranges`, worker, parcel);
  }

  protected override canPickup(worker: Worker, parcel: Parcel): boolean {
    if (!['belt', 'floor', 'missed'].includes(parcel.state)) return false;
    if (parcel.route === 'C' && worker !== this.activeWorker) return false;
    if (parcel.route !== 'C' && ROUTE_INFO[parcel.route].side !== worker.side) return false;
    if (stairAt(worker.x, worker.y) || !this.clearForCarry(worker.x, worker.y, worker.side)) return false;
    if (parcel.state === 'floor') {
      if (worker.side === 'left' ? parcel.x > 440 : parcel.x < 520) return false;
      if (onLowerFloor(worker) !== onLowerFloor(parcel)) return false;
    } else if (onLowerFloor(worker)) return false;
    return distance(worker, parcel) <= this.layout.grabRadius;
  }

  public override nearestPackage(worker: Worker = this.activeWorker): Parcel | null {
    return this.packages.filter(parcel => this.canPickup(worker, parcel))
      .sort((a, b) => distance(worker, a) - distance(worker, b))[0] ?? null;
  }

  public override action(worker: Worker = this.activeWorker): void {
    if (!this.canAct()) return;
    if (this.pendingScannerWorker === worker.id) { if (worker === this.activeWorker) super.action(worker); return; }
    const held = this.packages.find(parcel => parcel.id === worker.heldId);
    if (held?.route === 'C' && worker !== this.activeWorker) return;
    const atBelt = Math.abs(worker.x - this.layout.beltX) <= this.layout.grabRadius
      && worker.y >= this.layout.beltTop && worker.y <= this.layout.beltBottom;
    if (!held || this.currentDock(worker) || atBelt) {
      const truck = truckInteriorAt(worker);
      this.placement = truck ? { x: worker.x, row: worker.facing === 'down' ? 1 : worker.facing === 'up' ? 0
        : worker.y > this.layout.playerTrucks[truck].y ? 1 : 0 } : null;
      super.action(worker); this.placement = null; return;
    }
    if (TRUCK_ROUTES.some(route => ROUTE_INFO[route].side === worker.side && Math.abs(worker.y - this.layout.playerTrucks[route].y) <= 30)) {
      this.emit('wrong', 'Carry it through the rear door · load it inside the truck', worker, held);
      return;
    }
    if (stairAt(worker.x, worker.y)) {
      this.emit('wrong', 'Keep the stairs clear · carry it to a landing', worker, held);
      return;
    }
    const ground = onLowerFloor(worker);
    const bounds = ground ? this.layout.lowerFloor[worker.side] : worker.side === 'left' ? this.layout.leftLane : this.layout.rightLane;
    const x = clamp(worker.x + (worker.side === 'left' ? 30 : -30), bounds.minX + 24, bounds.maxX - 24);
    const y = clamp(worker.y, ground ? this.layout.lowerFloor.top + 24 : this.layout.workerMinY,
      ground ? this.layout.lowerFloor.bottom - 24 : this.layout.workerMaxY - 24);
    if (this.packages.some(parcel => parcel !== held && parcel.state === 'floor' && distance(parcel, { x, y }) < 54)) {
      this.emit('wrong', 'Floor space occupied · take one step aside', worker, held);
      return;
    }
    Object.assign(held, { x, y, state: 'floor' });
    this.release(worker, held);
    this.emit('drop', 'Set down · press SPACE nearby to pick up', held, held);
  }

  protected override wrongDelivery(parcel: Parcel, at: { x: number; y: number }): void {
    const penalty = Math.min(this.score, WRONG_DROP_PENALTY);
    this.score -= penalty;
    this.combo = 0;
    this.wrongSortErrors += 1;
    this.emit('wrong', `WRONG DROP · −${penalty} · check the street range`, at, parcel, -penalty);
  }

  public override throwTarget(worker: Worker = this.activeWorker): ThrowTarget | null {
    const held = this.packages.find(parcel => parcel.id === worker.heldId);
    if (!held) return null;
    const stairs = this.layout.stairs;
    const atStairTop = !onLowerFloor(worker) && Math.abs(worker.x - stairs[worker.side].topX) <= 28
      && Math.abs(worker.y - stairs.centerY) <= 8;
    const route = atStairTop ? worker.side === 'left' ? 'T' : 'S'
      : [...WORKER_ROUTES[worker.id], 'C' as const].sort((a, b) =>
        distance(worker, this.destinationCenter(a, worker.side)) - distance(worker, this.destinationCenter(b, worker.side)))[0];
    const target = this.destinationCenter(route, worker.side);
    const separation = distance(worker, target);
    const stairThrow = atStairTop && ROUTE_INFO[route].kind === 'floor';
    const result: ThrowTarget = { ok: false, route, ...target, distance: separation,
      breakChance: stairThrow ? THROWING.stairBreakChance : THROWING.fragileKinds.includes(held.kind)
        ? THROWING.breakChance.fragile : THROWING.breakChance.ordinary, reason: '' };
    if (held.size === 'heavy') result.reason = 'TOO HEAVY TO THROW · carry it';
    else if (ROUTE_INFO[route].kind === 'truck') result.reason = 'TRUCK LOAD · carry it inside and press SPACE';
    else if (this.currentDock(worker) && !stairThrow) result.reason = 'AT A DROP · SPACE attempts delivery';
    else if (onLowerFloor(worker) && ROUTE_INFO[route].kind !== 'floor') result.reason = "CAN'T THROW UP ONTO THE PLATFORM · carry it";
    else if (separation > THROWING.rangePx) result.reason = 'TOO FAR TO THROW · move closer';
    else {
      result.ok = true;
      result.reason = `${stairThrow ? 'THROW DOWN STAIRS' : 'THROW'} · ${Math.round(result.breakChance * 100)}% BREAK RISK`;
    }
    return result;
  }

  protected override moveWorker(deltaMs: number, move: { x: number; y: number }, worker: Worker = this.activeWorker): void {
    const requestedX = Number.isFinite(move.x) ? clamp(move.x, -1, 1) : 0;
    let x = requestedX;
    const requestedY = Number.isFinite(move.y) ? clamp(move.y, -1, 1) : 0;
    let y = requestedY;
    const requestedSpeed = Math.min(1, Math.hypot(x, y));
    // A shallow funnel at each rear door guides a walking approach into the
    // shelf aisle. It uses normal movement speed, including with a heavy box.
    const entering = worker.side === 'left' ? x < 0 && worker.x >= 306 && worker.x <= 380
      : x > 0 && worker.x >= 580 && worker.x <= 654;
    const doorway = entering ? TRUCK_ROUTES.find(route => ROUTE_INFO[route].side === worker.side
      && Math.abs(worker.y - this.layout.playerTrucks[route].y) <= 52) : undefined;
    if (doorway) y = clamp((this.layout.playerTrucks[doorway].y - worker.y) / 16, -1, 1);
    const { stairs } = this.layout;
    const flight = stairs[worker.side];
    const stairCenter = (stairs.minY + stairs.maxY) / 2;
    const onDeck = worker.side === 'left' ? worker.x >= flight.topX : worker.x <= flight.topX;
    const approachingStairs = onDeck && requestedY > 0 && worker.y >= stairs.minY - 85
      && worker.y < stairs.minY + this.layout.carriedClearance;
    if (approachingStairs) {
      x = clamp(((worker.side === 'left' ? 382 : 578) - worker.x) / 18, -1, 1);
      y = requestedY;
    }
    const crossingStairs = !approachingStairs && requestedX !== 0 && worker.x >= Math.min(flight.topX, flight.bottomX) - 80
      && worker.x <= Math.max(flight.topX, flight.bottomX) + 80
      && Math.abs(worker.y - stairCenter) <= 78;
    if (crossingStairs) y = clamp((stairCenter - worker.y) / 12, -1, 1);
    const magnitude = Math.hypot(x, y);
    worker.moving = false;
    if (!magnitude) return;
    const held = this.packages.find(parcel => parcel.id === worker.heldId);
    const squeezed = worker === this.activeWorker && this.laneObstacles.some(point => {
      const dx = point.x - worker.x, dy = point.y - worker.y;
      return Math.hypot(dx, dy) < 32 && dx * x + dy * y > 0 && Math.abs(dx * y - dy * x) / magnitude < 22;
    });
    const speed = 235 * (held ? CARRY_MULTIPLIER[held.kind] : 1) * deltaMs / 1000 * requestedSpeed / magnitude * (squeezed ? 0.55 : 1);
    const previousX = worker.x, previousY = worker.y;
    const maxY = held ? this.layout.stairs.maxY - this.layout.carriedClearance : this.layout.workerMaxY;
    let nextY = clamp(worker.y + y * speed, this.layout.workerMinY, maxY);
    const bounds = this.walkBounds(worker.side, worker.y);
    let nextX = clamp(worker.x + x * speed, bounds.minX, bounds.maxX);
    if (!this.walkable(worker.side, nextX, worker.y)) nextX = previousX;
    if (!this.walkable(worker.side, nextX, nextY)) nextY = previousY;
    worker.x = nextX; worker.y = nextY;
    worker.moving = nextX !== previousX || nextY !== previousY;
    worker.facing = doorway || crossingStairs || Math.abs(x) > Math.abs(y) ? x > 0 ? 'right' : 'left' : y > 0 ? 'down' : 'up';
  }

  public override walkBounds(side: 'left' | 'right', y: number): { minX: number; maxX: number } {
    const lane = side === 'left' ? this.layout.leftLane : this.layout.rightLane;
    if (TRUCK_ROUTES.some(route => ROUTE_INFO[route].side === side && Math.abs(y - this.layout.playerTrucks[route].y) <= 32)) {
      return side === 'left' ? { minX: 224, maxX: lane.maxX } : { minX: lane.minX, maxX: 736 };
    }
    const floor = this.layout.lowerFloor, radius = this.layout.workerRadius;
    if (y < floor.top + radius || y > floor.bottom - radius) return lane;
    return side === 'left' ? { minX: floor.left.minX + radius, maxX: lane.maxX }
      : { minX: lane.minX, maxX: floor.right.maxX - radius };
  }

  public override walkable(side: 'left' | 'right', x: number, y: number): boolean {
    if (y < this.layout.workerMinY || y > this.layout.workerMaxY) return false;
    if (this.workers.find(worker => worker.side === side)?.heldId != null && !this.clearForCarry(x, y, side)) return false;
    const { stairs, lowerFloor, workerRadius: radius } = this.layout;
    const lane = side === 'left' ? this.layout.leftLane : this.layout.rightLane;
    const floor = lowerFloor[side];
    const truck = TRUCK_ROUTES.some(route => ROUTE_INFO[route].side === side
      && Math.abs(y - this.layout.playerTrucks[route].y) <= 32
      && (side === 'left' ? x >= 224 && x <= lane.minX : x >= lane.maxX && x <= 736));
    if (truck && (side === 'left' ? x < 306 : x > 654)
      && Math.abs(y - this.layout.playerTrucks[truckInteriorAt({ x, y })!].y)
        > (this.workers.find(worker => worker.side === side)?.heldId == null ? 10 : 3)) return false;
    const deck = x >= lane.minX && x <= lane.maxX;
    const ground = x >= floor.minX + radius && x <= floor.maxX - radius && y >= lowerFloor.top + radius && y <= lowerFloor.bottom - radius;
    const flight = y >= stairs.minY + radius && y <= stairs.maxY - radius
      && (side === 'left' ? x >= floor.maxX - radius && x <= lane.minX : x >= lane.maxX && x <= floor.minX + radius);
    if (!deck && !ground && !flight && !truck) return false;
    const storage = this.layout.floorStorage[side === 'left' ? 'T' : 'S'];
    return distance({ x, y }, { x: clamp(x, storage.x - storage.width / 2, storage.x + storage.width / 2),
      y: clamp(y, storage.y - storage.height / 2, storage.y + storage.height / 2) }) >= radius;
  }

  protected override clearForCarry(x: number, y: number, side: 'left' | 'right'): boolean {
    const { stairs, carriedClearance: radius } = this.layout;
    if (y + radius > stairs.maxY) return false;
    const flight = stairs[side];
    const railX = clamp(x, Math.min(flight.topX, flight.bottomX), Math.max(flight.topX, flight.bottomX));
    if ([stairs.minY - 2, stairs.maxY + 0.5].some(railY => Math.hypot(x - railX, y - railY) < radius)) return false;
    const storage = this.layout.floorStorage[side === 'left' ? 'T' : 'S'];
    return distance({ x, y }, { x: clamp(x, storage.x - storage.width / 2, storage.x + storage.width / 2),
      y: clamp(y, storage.y - storage.height / 2, storage.y + storage.height / 2) }) >= radius;
  }

  public navigationTarget(target: { x: number; y: number }, worker: Worker = this.activeWorker): { x: number; y: number } {
    const inside = truckInteriorAt(worker);
    const targetTruck = truckInteriorAt(target);
    const laneX = worker.side === 'left' ? this.layout.leftLane.maxX : this.layout.rightLane.minX;
    if (inside && inside !== targetTruck) return { x: laneX, y: this.layout.playerTrucks[inside].y };
    if (inside && inside === targetTruck) return target;
    if (targetTruck && !inside && Math.abs(worker.y - this.layout.playerTrucks[targetTruck].y) > 12) {
      return { x: laneX, y: this.layout.playerTrucks[targetTruck].y };
    }
    const { stairs } = this.layout;
    const flight = stairs[worker.side];
    const onDeck = worker.side === 'left' ? worker.x >= flight.topX : worker.x <= flight.topX;
    const radius = worker.heldId === null ? this.layout.workerRadius : this.layout.carriedClearance;
    const aligned = worker.y >= stairs.minY + radius && worker.y <= stairs.maxY - radius;
    if (onLowerFloor(target) && onDeck) return aligned ? target : { x: laneX, y: stairs.centerY };
    if (!onLowerFloor(target) && !onDeck) return onLowerFloor(worker) && !aligned
      ? { x: worker.x, y: stairs.centerY } : { x: laneX, y: stairs.centerY };
    return target;
  }

  protected override updateCoworker(deltaMs: number): void {
    const worker = this.workers[1 - this.activeIndex];
    worker.moving = false;
    if (!this.autonomousCoworker || !this.crewAssist) return;
    this.updateScannerRequest();
    if (this.pendingScannerWorker === worker.id) return;
    const held = this.packages.find(parcel => parcel.id === worker.heldId);
    // Bulk picked up by the player stays in their hands if they switch away.
    if (held?.route === 'C') return;
    let target: { x: number; y: number };
    if (held) {
      const ownSide = ROUTE_INFO[held.route].side === worker.side;
      target = ownSide ? this.destinationCenter(held.route, worker.side) : { x: worker.side === 'left' ? 400 : 560, y: 440 };
      if ((ownSide && this.currentDock(worker) === held.route) || (!ownSide && distance(worker, target) < 4)) {
        if (!ownSide && this.packages.some(parcel => parcel.state === 'belt' && Math.abs(parcel.y - worker.y) < this.layout.parcelGap)) return;
        if (ownSide) {
          const truck = truckInteriorAt(worker);
          this.placement = truck ? { x: worker.x, row: worker.facing === 'down' ? 1 : 0 } : null;
          this.release(worker, held); this.deliver(held, true); this.placement = null; return;
        }
        this.action(worker); return;
      }
    } else {
      const parcel = this.packages.filter(item => ['belt', 'floor', 'missed'].includes(item.state)
        && item.route !== 'C' && ROUTE_INFO[item.route].side === worker.side
        && (item.state !== 'floor' || (worker.side === 'left' ? item.x < 440 : item.x > 520)))
        .sort((a, b) => Number(b.state === 'missed') - Number(a.state === 'missed') || b.y - a.y)[0];
      if (!parcel) return;
      if (this.canPickup(worker, parcel)) { this.pickup(worker, parcel); return; }
      target = parcel.state === 'floor' && onLowerFloor(parcel) ? parcel
        : { x: worker.side === 'left' ? 400 : 560, y: parcel.y };
    }
    target = this.navigationTarget(target, worker);
    const dx = target.x - worker.x, dy = target.y - worker.y;
    const divisor = Math.max(Math.hypot(dx, dy), 235 * deltaMs / 1000);
    this.moveWorker(deltaMs, { x: dx / divisor, y: dy / divisor }, worker);
    if (held) this.syncHeld(worker, held);
  }

  public override currentDock(worker: Worker = this.activeWorker): Route | null {
    if (!this.walkable(worker.side, worker.x, worker.y)) return null;
    for (const route of WORKER_ROUTES[worker.id]) {
      if ((route === 'T' || route === 'S') !== onLowerFloor(worker)) continue;
      const area = this.layout.dropAreas[route as 'A' | 'B' | 'D' | 'E' | 'T' | 'S'];
      if (Math.abs(worker.x - area.x) <= area.width / 2 && Math.abs(worker.y - area.y) < area.height / 2) return route;
    }
    const bulk = worker.side === 'left' ? this.layout.dropAreas.bulkLeft : this.layout.dropAreas.bulkRight;
    return Math.abs(worker.x - bulk.x) <= bulk.width / 2 && Math.abs(worker.y - bulk.y) <= bulk.height / 2 ? 'C' : null;
  }

  protected override deliver(parcel: Parcel, assisted = false): void {
    super.deliver(parcel, assisted);
    if (!TRUCK_ROUTES.includes(parcel.route as TruckRoute)) return;
    const route = parcel.route as TruckRoute;
    const existing = [...this.truckLoads.values()].filter(load => load.route === route);
    const cells = parcel.kind === 'longbox' || parcel.kind === 'atv' ? 2 : 1;
    const preferredX = this.placement?.x ?? this.layout.dockA.x;
    const preferredRow = this.placement?.row ?? 0;
    const options: { layer: number; column: number; row: number; x: number }[] = [];
    for (let layer = 0; layer < 3; layer++) for (let row = 0; row < 2; row++) for (let column = 0; column <= 3 - cells; column++) {
      if (existing.some(load => !load.overflow && load.layer === layer && load.row === row && column < load.column + load.cells && column + cells > load.column)) continue;
      const x = route === 'A' || route === 'D' ? 228 + column * 32 + (cells - 1) * 16 : 732 - column * 32 - (cells - 1) * 16;
      options.push({ layer, row, column, x });
    }
    options.sort((a, b) => Number(a.row !== preferredRow) - Number(b.row !== preferredRow)
      || Math.abs(a.x - preferredX) - Math.abs(b.x - preferredX) || a.layer - b.layer);
    const slot = options[0];
    const overflowIndex = existing.filter(load => load.overflow).length;
    const overflow = !slot;
    const layer = slot?.layer ?? Math.floor(overflowIndex / 2);
    const column = slot?.column ?? 3;
    const row = slot?.row ?? overflowIndex % 2;
    // Once the shelves fill, real parcels build up through the open rear door.
    const x = slot?.x ?? (route === 'A' || route === 'D' ? 320 : 640);
    const y = this.layout.playerTrucks[route].y + (row ? 28 : -28);
    const height = layer * 28;
    this.truckLoads.set(parcel.id, { route, x, y, height, layer, column, row, cells, overflow, parcelHeight: LOAD_HEIGHT[parcel.kind] });
    parcel.x = x; parcel.y = y;
  }
}
