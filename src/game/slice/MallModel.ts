import { MALL_STORES } from './StoryScript.ts';

/**
 * Skanky's mall run: three cart trips, two stores per trip, a delivery and a
 * signature at each store. Deterministic rules in model pixels (32 px = 1 m);
 * the 3D mall chapter draws this layout.
 */
type Rect = { x: number; y: number; w: number; h: number };
type Facing = 'left' | 'right' | 'up' | 'down';

export const MALL_LAYOUT = {
  width: 1280,
  height: 800,
  /** Walkable floor: the loading dock, the service passage and the concourse. */
  walk: [
    { x: 40, y: 300, w: 220, h: 200 },
    { x: 240, y: 350, w: 60, h: 100 },
    { x: 280, y: 280, w: 980, h: 240 },
  ] as readonly Rect[],
  /**
   * Things in the concourse the cart has to go around: a raised planter with
   * bench seats, the railed centre-court atrium over the lower level's
   * bleacher seating, and a bench pod around the mall directory. They stay
   * between the clear north and south rows (y 336-464) and clear of the
   * store doorways, so every store is reachable with the cart.
   */
  obstacles: [
    { x: 545, y: 360, w: 90, h: 80, label: 'PLANTER' },
    { x: 800, y: 350, w: 160, h: 100, label: 'ATRIUM' },
    { x: 1104, y: 356, w: 96, h: 88, label: 'BENCH' },
  ] as readonly (Rect & { label: string })[],
  /** The five-ton's body sits outside the dock doors; its tailgate opens onto the dock. */
  truck: { x: -190, y: 330, w: 220, h: 140 },
  tailgate: { x: 40, y: 320, w: 70, h: 160 },
  start: { x: 150, y: 420 },
  cartStart: { x: 150, y: 370 },
  /** Store doors on the concourse edges: three north, three south. */
  doors: [
    { x: 430, y: 280, side: 'north' }, { x: 730, y: 280, side: 'north' }, { x: 1030, y: 280, side: 'north' },
    { x: 430, y: 520, side: 'south' }, { x: 730, y: 520, side: 'south' }, { x: 1030, y: 520, side: 'south' },
  ] as const,
} as const;

/** Tuning; see docs/overnight-shift-expansion.md. */
export const MALL_RULES = {
  speed: 235,
  cartCapacity: 2,
  storesPerRun: 2,
  runs: 3,
  reach: 46,
  /** The cart must be this close to Skanky to count as brought to the store. */
  cartNearby: 96,
  skankyRadius: 12,
  cartSize: { w: 36, h: 26 },
  cartOffset: 30,
  /** Added to the night total for each signature; the warehouse grade is unchanged. */
  pointsPerSignature: 50,
} as const;

export type StoreState = 'waiting' | 'dropped' | 'signed';
export interface MallStore {
  id: string;
  name: string;
  clerkLine: string;
  door: { x: number; y: number };
  side: 'north' | 'south';
  /** The doorway area where the cart is unloaded and the clerk signs. */
  zone: Rect;
  /** Which cart run (0-2) carries this store's freight. */
  run: number;
  state: StoreState;
  /** Boxes in this store's bundle, shown on the cart and in the truck. */
  boxes: number;
}

export interface MallEvent {
  /** From `refuse` on, the 3D mall's Bentley run (MallModel3D): the refusal, mall security's questions, the chase. */
  type: 'pick' | 'load' | 'cart' | 'drop' | 'sign' | 'wrong' | 'run' | 'done' | 'refuse' | 'security' | 'handover'
    | 'quiz' | 'right' | 'denied' | 'grab' | 'aim' | 'shot' | 'hit' | 'caught' | 'escape' | 'busted' | 'down';
  message: string;
  storeId?: string;
}

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
/** Store counts in words, for the HUD's messages. */
const COUNT_WORDS: Record<number, string> = { 6: 'six', 7: 'seven' };
const insideRect = (rect: Rect, x: number, y: number, margin = 0): boolean =>
  x >= rect.x + margin && x <= rect.x + rect.w - margin && y >= rect.y + margin && y <= rect.y + rect.h - margin;

type FloorEdge = { x1: number; y1: number; x2: number; y2: number };
const onFloor = (x: number, y: number): boolean => MALL_LAYOUT.walk.some(rect => insideRect(rect, x, y));
/** Split at every rectangle corner and keep only exposed union edges. */
const FLOOR_EDGES: readonly FloorEdge[] = MALL_LAYOUT.walk.flatMap(rect => {
  const edges: FloorEdge[] = [];
  for (const vertical of [false, true]) {
    const start = vertical ? rect.y : rect.x;
    const end = start + (vertical ? rect.h : rect.w);
    const splits = [...new Set([start, end, ...MALL_LAYOUT.walk.flatMap(other => vertical ? [other.y, other.y + other.h] : [other.x, other.x + other.w])])]
      .filter(value => value >= start && value <= end).sort((a, b) => a - b);
    for (const fixed of vertical ? [rect.x, rect.x + rect.w] : [rect.y, rect.y + rect.h]) {
      for (let index = 1; index < splits.length; index += 1) {
        const middle = (splits[index - 1] + splits[index]) / 2;
        const x = vertical ? fixed : middle;
        const y = vertical ? middle : fixed;
        const dx = vertical ? 0.01 : 0;
        const dy = vertical ? 0 : 0.01;
        if (onFloor(x - dx, y - dy) === onFloor(x + dx, y + dy)) continue;
        edges.push(vertical ? { x1: fixed, y1: splits[index - 1], x2: fixed, y2: splits[index] }
          : { x1: splits[index - 1], y1: fixed, x2: splits[index], y2: fixed });
      }
    }
  }
  return edges;
});

export class MallModel {
  public readonly skanky = { x: MALL_LAYOUT.start.x as number, y: MALL_LAYOUT.start.y as number, facing: 'up' as Facing, moving: false };
  public readonly cart = { x: MALL_LAYOUT.cartStart.x as number, y: MALL_LAYOUT.cartStart.y as number, facing: 'up' as Facing, pushed: false, load: [] as string[] };
  public readonly stores: MallStore[];
  /** Store bundles still in the truck, in their tailgate slot order. */
  public readonly truckBundles: (string | null)[];
  public carrying: string | null = null;
  public run = 0;
  public delivered = 0;
  public signatures = 0;
  public finished = false;
  public paused = false;
  private events: MallEvent[] = [];

  constructor(random: () => number = Math.random) {
    // Any shuffle is valid: every door is reachable and every store gets one bundle.
    const order = MALL_STORES.map((_, index) => index);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.min(i, Math.floor(random() * (i + 1)));
      [order[i], order[j]] = [order[j], order[i]];
    }
    this.stores = MALL_STORES.map((store, index) => {
      const door = MALL_LAYOUT.doors[index];
      const zone = door.side === 'north'
        ? { x: door.x - 56, y: door.y, w: 112, h: 72 }
        : { x: door.x - 56, y: door.y - 72, w: 112, h: 72 };
      return {
        id: store.id, name: store.name, clerkLine: store.clerkLine, door: { x: door.x, y: door.y }, side: door.side, zone,
        run: Math.floor(order.indexOf(index) / MALL_RULES.storesPerRun), state: 'waiting' as StoreState, boxes: 2 + (index % 2),
      };
    });
    // Bundles sit in the truck in store order, not run order: read the labels.
    this.truckBundles = this.stores.map((store) => store.id);
  }

  public get manifest(): MallStore[] {
    return this.stores.filter((store) => store.run === this.run);
  }

  public get runComplete(): boolean {
    return this.manifest.every((store) => store.state === 'signed');
  }

  public get allSigned(): boolean {
    return this.stores.every((store) => store.state === 'signed');
  }

  public store(id: string): MallStore {
    return this.stores.find((store) => store.id === id)!;
  }

  /** Skanky's walking speed in pixels a second; a subclass may change it (running, stumbling). */
  protected get moveSpeed(): number {
    return MALL_RULES.speed;
  }

  /** How many cart runs the mall takes: three, unless a subclass adds one. */
  public get runCount(): number {
    return MALL_RULES.runs;
  }

  /** "six" for six stores, and so on, for the messages. */
  protected get storeWord(): string {
    return COUNT_WORDS[this.stores.length] ?? String(this.stores.length);
  }

  /** The current instruction, for the HUD. */
  public get objective(): string {
    if (this.finished) return 'Done. Back to UPS.';
    if (this.allSigned) return this.cartNearTruck ? 'Press SPACE at the tailgate to close up' : `All ${this.storeWord} signed · bring the cart back to the truck`;
    const manifest = this.manifest.map((store) => store.name).join(' + ');
    if (this.runComplete) return `Run ${this.run + 1} done · back to the truck for run ${this.run + 2}`;
    const waiting = this.manifest.filter((store) => store.state !== 'signed' && !this.cart.load.includes(store.id) && store.state === 'waiting');
    if (waiting.length > 0) return `Run ${this.run + 1}/${this.runCount} · load ${manifest} from the truck onto the cart`;
    const dropped = this.manifest.find((store) => store.state === 'dropped');
    if (dropped) return `Get ${dropped.name} to sign`;
    return `Run ${this.run + 1}/${this.runCount} · push the cart to ${manifest}`;
  }

  public get cartNearTruck(): boolean {
    return insideRect({ x: 20, y: 300, w: 200, h: 200 }, this.cart.x, this.cart.y);
  }

  public update(deltaMs: number, move: { x: number; y: number } = { x: 0, y: 0 }): void {
    if (this.paused || this.finished || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    let remaining = Math.min(deltaMs, 100);
    while (remaining > 0) {
      const step = Math.min(10, remaining);
      this.move(step, move);
      remaining -= step;
    }
  }

  /** E: take hold of the cart's handle, or let go of it. */
  public toggleCart(): void {
    if (this.paused || this.finished) return;
    if (this.cart.pushed) {
      this.cart.pushed = false;
      this.emit('cart', 'Cart parked');
      return;
    }
    if (this.carrying) {
      this.emit('wrong', 'Hands full · load the bundle onto the cart first');
      return;
    }
    if (Math.hypot(this.cart.x - this.skanky.x, this.cart.y - this.skanky.y) > MALL_RULES.reach + 14) {
      this.emit('wrong', 'Walk up to the cart, then press E');
      return;
    }
    const facing = this.directionTo(this.cart.x - this.skanky.x, this.cart.y - this.skanky.y);
    const placed = this.cartPosition(facing);
    if (!this.cartFits(placed.x, placed.y, facing)) {
      this.emit('wrong', 'No room to push from here · step around the cart');
      return;
    }
    this.skanky.facing = facing;
    Object.assign(this.cart, placed, { facing, pushed: true });
    this.emit('cart', 'Pushing the cart');
  }

  /** SPACE: take a bundle from the truck, load it, unload it at a store, get a signature, or close up. */
  public action(): void {
    if (this.paused || this.finished) return;
    const atTruck = insideRect(MALL_LAYOUT.tailgate, this.skanky.x, this.skanky.y);
    if (this.carrying) {
      const nearCart = Math.hypot(this.cart.x - this.skanky.x, this.cart.y - this.skanky.y) <= MALL_RULES.reach + 18;
      if (!nearCart) {
        this.emit('wrong', 'Carry the bundle to the cart, then press SPACE');
        return;
      }
      this.cart.load.push(this.carrying);
      const store = this.store(this.carrying);
      this.carrying = null;
      this.emit('load', `${store.name} loaded (${this.cart.load.length}/${MALL_RULES.cartCapacity})`, store.id);
      return;
    }

    const store = this.stores.find((candidate) => insideRect(candidate.zone, this.skanky.x, this.skanky.y)
      || (this.cart.pushed && insideRect(candidate.zone, this.cart.x, this.cart.y)));
    if (store) {
      this.atStore(store);
      return;
    }

    if (atTruck) {
      if (this.allSigned) {
        if (!this.cartNearTruck) {
          this.emit('wrong', 'Bring the cart back to the truck first');
          return;
        }
        this.finished = true;
        this.cart.pushed = false;
        this.emit('done', 'Cart stowed. Back to UPS.');
        return;
      }
      this.pickBundle();
      return;
    }
    this.emit('wrong', this.cart.pushed ? 'Push the cart into a store doorway, then SPACE' : 'Nothing to do here · E grabs the cart');
  }

  public drainEvents(): MallEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  /** The tailgate slot nearest Skanky, for highlighting. */
  public nearestSlot(): number {
    const slots = this.truckBundles.length;
    const index = Math.round((this.skanky.y - 350) / 20);
    return clamp(index, 0, slots - 1);
  }

  public slotPosition(index: number): { x: number; y: number } {
    return { x: 22, y: 350 + index * 20 };
  }

  private pickBundle(): void {
    if (this.runComplete) {
      // A finished run is only replaced here, back at the truck.
      this.run += 1;
      this.emit('run', `Run ${this.run + 1}/${this.runCount} · ${this.manifest.map((item) => item.name).join(' + ')}`);
    }
    const slot = this.nearestSlot();
    const id = this.truckBundles[slot];
    if (!id) {
      this.emit('wrong', 'That slot is empty · walk along the tailgate');
      return;
    }
    const store = this.store(id);
    if (store.run !== this.run) {
      this.emit('wrong', `${store.name} goes out on run ${store.run + 1} · find ${this.manifest.map((item) => item.name).join(' or ')}`, id);
      return;
    }
    if (this.cart.load.length >= MALL_RULES.cartCapacity) {
      this.emit('wrong', 'The cart is full · two stores per trip');
      return;
    }
    this.truckBundles[slot] = null;
    this.carrying = id;
    // Both hands go on the bundle, so the cart is parked where it stands.
    this.cart.pushed = false;
    this.emit('pick', `Took ${store.name} (${store.boxes} boxes) · load it on the cart`, id);
  }

  protected atStore(store: MallStore): void {
    if (store.state === 'signed') {
      this.emit('wrong', `${store.name} already signed`, store.id);
      return;
    }
    if (store.state === 'dropped') {
      store.state = 'signed';
      this.signatures += 1;
      this.emit('sign', `${store.name} signed (${this.signatures}/${this.stores.length})`, store.id);
      if (this.runComplete) {
        this.emit('run', this.allSigned ? `All ${this.storeWord} signed · cart back to the truck` : `Run ${this.run + 1} done · back to the truck for the next load`);
      }
      return;
    }
    const near = Math.hypot(this.cart.x - this.skanky.x, this.cart.y - this.skanky.y) <= MALL_RULES.cartNearby;
    if (!near) {
      this.emit('wrong', `Bring the cart · ${store.name}'s freight is on it`, store.id);
      return;
    }
    const index = this.cart.load.indexOf(store.id);
    if (index < 0) {
      this.emit('wrong', `Nothing on the cart for ${store.name}`, store.id);
      return;
    }
    this.cart.load.splice(index, 1);
    store.state = 'dropped';
    this.delivered += 1;
    this.emit('drop', `${store.boxes} boxes dropped at ${store.name} · SPACE for the signature`, store.id);
  }

  private move(deltaMs: number, move: { x: number; y: number }): void {
    const x = Number.isFinite(move.x) ? clamp(move.x, -1, 1) : 0;
    const y = Number.isFinite(move.y) ? clamp(move.y, -1, 1) : 0;
    const magnitude = Math.hypot(x, y);
    const s = this.skanky;
    s.moving = false;
    if (magnitude === 0) return;
    const normalized = Math.max(1, magnitude);
    const step = this.moveSpeed * deltaMs / 1000 / normalized;
    const facing: Facing = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
    const tryMove = (nx: number, ny: number): boolean => {
      if (!this.free(nx, ny, MALL_RULES.skankyRadius)) return false;
      if (this.cart.pushed) {
        const cartFacing = this.cart.facing === facing || this.cartFits(...this.cartAt(nx, ny, facing), facing) ? facing : this.cart.facing;
        const [cx, cy] = this.cartAt(nx, ny, cartFacing);
        if (!this.cartFits(cx, cy, cartFacing)) return false;
        this.cart.x = cx;
        this.cart.y = cy;
        this.cart.facing = cartFacing;
      } else if (this.overlapsCart(nx, ny)) {
        return false;
      }
      s.x = nx;
      s.y = ny;
      return true;
    };
    const before = { x: s.x, y: s.y };
    if (!tryMove(s.x + x * step, s.y + y * step)) {
      if (x !== 0) tryMove(s.x + x * step, s.y);
      if (y !== 0) tryMove(s.x, s.y + y * step);
    }
    s.facing = this.cart.pushed ? this.cart.facing : facing;
    s.moving = before.x !== s.x || before.y !== s.y;
  }

  private cartAt(x: number, y: number, facing: Facing): [number, number] {
    const offset = MALL_RULES.cartOffset;
    return [x + (facing === 'right' ? offset : facing === 'left' ? -offset : 0), y + (facing === 'down' ? offset : facing === 'up' ? -offset : 0)];
  }

  private cartPosition(facing: Facing): { x: number; y: number } {
    const [x, y] = this.cartAt(this.skanky.x, this.skanky.y, facing);
    return { x, y };
  }

  private directionTo(dx: number, dy: number): Facing {
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }

  private cartFits(x: number, y: number, facing: Facing): boolean {
    const horizontal = facing === 'left' || facing === 'right';
    const w = (horizontal ? MALL_RULES.cartSize.w : MALL_RULES.cartSize.h) / 2;
    const h = (horizontal ? MALL_RULES.cartSize.h : MALL_RULES.cartSize.w) / 2;
    if (!onFloor(x, y)) return false;
    // A body may touch a boundary but no exposed floor edge may cross its
    // interior; checking only corners misses concave doorway corners.
    const crossesFloorEdge = FLOOR_EDGES.some(edge => edge.x1 === edge.x2
      ? edge.x1 > x - w && edge.x1 < x + w && edge.y2 > y - h && edge.y1 < y + h
      : edge.y1 > y - h && edge.y1 < y + h && edge.x2 > x - w && edge.x1 < x + w);
    return !crossesFloorEdge && !MALL_LAYOUT.obstacles.some(rect =>
      x + w > rect.x && x - w < rect.x + rect.w && y + h > rect.y && y - h < rect.y + rect.h);
  }

  protected overlapsCart(x: number, y: number): boolean {
    const horizontal = this.cart.facing === 'left' || this.cart.facing === 'right';
    const w = (horizontal ? MALL_RULES.cartSize.w : MALL_RULES.cartSize.h) / 2 + MALL_RULES.skankyRadius;
    const h = (horizontal ? MALL_RULES.cartSize.h : MALL_RULES.cartSize.w) / 2 + MALL_RULES.skankyRadius;
    return Math.abs(x - this.cart.x) < w && Math.abs(y - this.cart.y) < h;
  }

  /** Exact circle clearance against floor edges and obstacle corners. */
  public free(x: number, y: number, radius: number): boolean {
    if (!onFloor(x, y)) return false;
    if (FLOOR_EDGES.some(edge => Math.hypot(x - clamp(x, edge.x1, edge.x2), y - clamp(y, edge.y1, edge.y2)) < radius)) return false;
    return !MALL_LAYOUT.obstacles.some(rect =>
      Math.hypot(x - clamp(x, rect.x, rect.x + rect.w), y - clamp(y, rect.y, rect.y + rect.h)) < radius);
  }

  protected emit(type: MallEvent['type'], message: string, storeId?: string): void {
    this.events.push({ type, message, storeId });
  }
}

/** The last bit of gameplay: walk the five-ton's keys to the key drop at UPS. */
export const LOT_LAYOUT = {
  width: 960,
  height: 600,
  walk: { x: 60, y: 140, w: 840, h: 380 },
  truck: { x: 220, y: 300, w: 220, h: 120 },
  keyDrop: { x: 780, y: 140, w: 110, h: 80 },
  start: { x: 470, y: 360 },
} as const;

export class KeyReturnModel {
  public readonly skanky = { x: LOT_LAYOUT.start.x as number, y: LOT_LAYOUT.start.y as number, facing: 'right' as Facing, moving: false };
  public done = false;
  public paused = false;
  private events: MallEvent[] = [];

  public get atKeyDrop(): boolean {
    return insideRect(LOT_LAYOUT.keyDrop, this.skanky.x, this.skanky.y);
  }

  public update(deltaMs: number, move: { x: number; y: number } = { x: 0, y: 0 }): void {
    if (this.paused || this.done || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    const x = Number.isFinite(move.x) ? clamp(move.x, -1, 1) : 0;
    const y = Number.isFinite(move.y) ? clamp(move.y, -1, 1) : 0;
    const magnitude = Math.hypot(x, y);
    this.skanky.moving = false;
    if (magnitude === 0) return;
    const step = MALL_RULES.speed * Math.min(deltaMs, 100) / 1000 / Math.max(1, magnitude);
    const walk = LOT_LAYOUT.walk;
    const truck = LOT_LAYOUT.truck;
    const ok = (nx: number, ny: number): boolean => insideRect(walk, nx, ny, MALL_RULES.skankyRadius)
      && !insideRect(truck, nx, ny, -MALL_RULES.skankyRadius);
    const before = { ...this.skanky };
    const nx = this.skanky.x + x * step;
    const ny = this.skanky.y + y * step;
    if (ok(nx, ny)) Object.assign(this.skanky, { x: nx, y: ny });
    else if (ok(nx, this.skanky.y)) this.skanky.x = nx;
    else if (ok(this.skanky.x, ny)) this.skanky.y = ny;
    this.skanky.facing = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
    this.skanky.moving = before.x !== this.skanky.x || before.y !== this.skanky.y;
  }

  public action(): void {
    if (this.paused || this.done) return;
    if (!this.atKeyDrop) {
      this.events.push({ type: 'wrong', message: 'The KEY DROP is by the dispatch door' });
      return;
    }
    this.done = true;
    this.events.push({ type: 'done', message: 'Keys in the drop · five-ton returned' });
  }

  public drainEvents(): MallEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
}
