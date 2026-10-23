import { MallModel, MALL_LAYOUT, MALL_RULES, type MallStore } from '../game/slice/MallModel.ts';
import { MALL_STORES } from '../game/slice/StoryScript.ts';

type Rect = { x: number; y: number; w: number; h: number };
const inside = (r: Rect, p: { x: number; y: number }) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
export type MallAction = 'take' | 'load' | 'grab-cart' | 'park-cart' | 'drop' | 'sign' | 'close' | 'wrong' | 'collect' | 'none';

/**
 * Bentley (the owner's, 2026-10-23): a seventh store, in the old anchor space at the concourse's east end, on a run of
 * its own with the cart full of its freight. Delivered, it will not sign: a box is missing. Mall security has it, through
 * the staff doors in the south-east corner and down a long service hallway; Skanky carries it back by hand, and then
 * Bentley signs.
 */
export const BENTLEY = {
  id: 'bentley', name: 'BENTLEY', door: { x: 1260, y: 400 }, run: 3, bundles: 2, boxes: 10,
  /** In front of the portal, in the gap between the bench and the east wall: reached from either row with the cart. */
  zone: { x: 1188, y: 344, w: 72, h: 112 },
} as const;
/** The 3D mall's stops (the six stores and Bentley) and the bundles they arrive in (Bentley's two). */
export const MALL_3D_STOPS = MALL_STORES.length + 1;
export const MALL_3D_BUNDLES = MALL_STORES.length + BENTLEY.bundles;
/**
 * The back of the mall: the staff doors in the concourse's south-east corner (between the last store's column and the
 * east wall's), the service hallway running south from them for 13 m, and the security office at its end.
 */
export const SECURITY_WING = {
  doors: { x: 1194, y: 514, w: 42, h: 34 },
  hallway: { x: 1182, y: 544, w: 80, h: 424 },
  office: { x: 1120, y: 964, w: 200, h: 146 },
  /** The guard's desk on the office's east side, and where Skanky stands at it. */
  desk: { x: 1270, y: 1004, w: 28, h: 80 },
  counter: { x: 1222, y: 994, w: 46, h: 100 },
} as const;
/** The 3D mall's floor: the shared layout's, and the way to security. */
const WALK: readonly Rect[] = [...MALL_LAYOUT.walk, SECURITY_WING.doors, SECURITY_WING.hallway, SECURITY_WING.office];
const OBSTACLES: readonly Rect[] = [...MALL_LAYOUT.obstacles, SECURITY_WING.desk];
const onFloor = (x: number, y: number): boolean => WALK.some(rect => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
/** The exposed edges of the floor's union (as the shared model finds its own), split at every rectangle corner. */
const EDGES = WALK.flatMap(rect => {
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const vertical of [false, true]) {
    const start = vertical ? rect.y : rect.x, end = start + (vertical ? rect.h : rect.w);
    const splits = [...new Set([start, end, ...WALK.flatMap(other => vertical ? [other.y, other.y + other.h] : [other.x, other.x + other.w])])]
      .filter(value => value >= start && value <= end).sort((a, b) => a - b);
    for (const fixed of vertical ? [rect.x, rect.x + rect.w] : [rect.y, rect.y + rect.h]) {
      for (let index = 1; index < splits.length; index += 1) {
        const middle = (splits[index - 1] + splits[index]) / 2;
        const x = vertical ? fixed : middle, y = vertical ? middle : fixed;
        const dx = vertical ? 0.01 : 0, dy = vertical ? 0 : 0.01;
        if (onFloor(x - dx, y - dy) === onFloor(x + dx, y + dy)) continue;
        edges.push(vertical ? { x1: fixed, y1: splits[index - 1], x2: fixed, y2: splits[index] }
          : { x1: splits[index - 1], y1: fixed, x2: splits[index], y2: fixed });
      }
    }
  }
  return edges;
});

/** Current 3D interactions; the legacy mall keeps its original inputs and freight. */
export class MallModel3D extends MallModel {
  /** Where the Bentley run stands: not yet asked to sign, refused for the missing box, the box fetched, handed over. */
  public bentley: 'pending' | 'refused' | 'fetched' | 'returned' = 'pending';
  /** Skanky has the missing box in his hands (it rides no cart). */
  public handBox = false;

  constructor(random: () => number = Math.random) {
    super(random);
    this.stores.forEach((store, index) => { store.boxes = 6 + index % 3 * 2; });
    const { door } = BENTLEY;
    this.stores.push({
      id: BENTLEY.id, name: BENTLEY.name, clerkLine: 'Finally. Signed.', door: { ...door }, side: 'north',
      zone: { ...BENTLEY.zone }, run: BENTLEY.run, state: 'waiting', boxes: BENTLEY.boxes,
    });
    for (let i = 0; i < BENTLEY.bundles; i += 1) this.truckBundles.push(BENTLEY.id);
  }

  public override get runCount(): number {
    return BENTLEY.run + 1;
  }

  /** Eight bundles at the tailgate: closer together than the shared model's six, so all stay within reach. */
  public override slotPosition(index: number): { x: number; y: number } {
    return { x: 22, y: 351 + index * 14 };
  }

  public override nearestSlot(): number {
    const run = this.runComplete && !this.allSigned ? this.run + 1 : this.run;
    const available = this.truckBundles.flatMap((id, slot) => id && this.store(id).run === run ? [slot] : []);
    return available.sort((a, b) => Math.abs(this.slotPosition(a).y - this.skanky.y) - Math.abs(this.slotPosition(b).y - this.skanky.y))[0] ?? -1;
  }

  /** Bentley's loads still in the truck, and on the cart. */
  private get bentleyLoads(): { truck: number; cart: number } {
    return { truck: this.truckBundles.filter(id => id === BENTLEY.id).length, cart: this.cart.load.filter(id => id === BENTLEY.id).length };
  }

  public override get objective(): string {
    const store = this.store(BENTLEY.id);
    if (this.finished || this.run !== BENTLEY.run || this.allSigned || this.runComplete) return super.objective;
    if (store.state === 'waiting') {
      const { truck, cart } = this.bentleyLoads;
      if (truck > 0 || this.carrying) return `Run ${this.run + 1}/${this.runCount} · BENTLEY only · load both BENTLEY loads onto the cart (${cart}/${BENTLEY.bundles})`;
      return `Run ${this.run + 1}/${this.runCount} · push the full cart to BENTLEY`;
    }
    if (this.bentley === 'refused') return "BENTLEY won't sign: a box is missing · SECURITY has it, through the back doors";
    if (this.bentley === 'fetched') return 'Carry the missing box back to BENTLEY';
    return 'Get BENTLEY to sign';
  }

  public get interaction(): { action: MallAction; label: string; slot?: number } {
    const nearCart = Math.hypot(this.cart.x - this.skanky.x, this.cart.y - this.skanky.y) <= MALL_RULES.reach + 14;
    if (this.carrying) return { action: nearCart ? 'load' : 'none', label: nearCart ? 'SPACE · LOAD CART' : 'Carry the bundle to the cart' };
    const store = this.stores.find(s => inside(s.zone, this.skanky) || this.cart.pushed && inside(s.zone, this.cart));
    if (this.handBox) {
      return store?.id === BENTLEY.id ? { action: 'sign', label: 'SPACE · HAND OVER THE MISSING BOX' } : { action: 'none', label: 'Carry the missing box back to BENTLEY' };
    }
    if (inside(SECURITY_WING.counter, this.skanky)) {
      return this.bentley === 'refused' ? { action: 'collect', label: 'SPACE · ASK SECURITY FOR THE BENTLEY BOX' } : { action: 'none', label: 'MALL SECURITY' };
    }
    if (store?.id === BENTLEY.id && store.state === 'dropped' && this.bentley === 'refused') {
      return { action: 'wrong', label: this.objective };
    }
    if (store?.state === 'dropped') return { action: 'sign', label: `SPACE · SIGN ${store.name}` };
    if (store?.state === 'waiting') return { action: this.cart.load.includes(store.id) ? 'drop' : 'wrong', label: `SPACE · DELIVER ${store.name}` };
    if (inside(MALL_LAYOUT.tailgate, this.skanky)) {
      if (this.allSigned) return { action: 'close', label: 'SPACE · STOW CART & CLOSE UP' };
      const slot = this.nearestSlot();
      if (slot >= 0 && this.cart.load.length < MALL_RULES.cartCapacity) {
        const delivery = this.store(this.truckBundles[slot]!);
        return { action: 'take', slot, label: `SPACE · TAKE ${delivery.name} · ${delivery.boxes} BOXES` };
      }
    }
    if (this.cart.pushed) return { action: 'park-cart', label: 'SPACE · PARK CART' };
    if (nearCart) return { action: 'grab-cart', label: 'SPACE · GRAB CART' };
    // On the way to security, the prompt is the errand itself.
    if (this.bentley === 'refused') return { action: 'none', label: this.objective };
    return { action: 'none', label: 'Move closer to a parcel, the cart or a delivery door' };
  }

  public override action(): void {
    if (this.paused || this.finished) return;
    const { action } = this.interaction;
    if (action === 'grab-cart' || action === 'park-cart') this.toggleCart();
    else if (action === 'collect') this.collect();
    else if (action !== 'none') super.action();
  }

  public override toggleCart(): void {
    if (this.handBox && !this.cart.pushed) {
      this.emit('wrong', 'Hands full · take the box to BENTLEY');
      return;
    }
    super.toggleCart();
  }

  /** Bentley's door: both loads come off together; asked to sign, it refuses until the missing box is back. */
  protected override atStore(store: MallStore): void {
    if (store.id !== BENTLEY.id) { super.atStore(store); return; }
    if (store.state === 'waiting') {
      const { truck, cart } = this.bentleyLoads;
      if (cart < BENTLEY.bundles) {
        this.emit('wrong', truck > 0 ? 'Both BENTLEY loads go on the cart first' : "Bring the cart · BENTLEY's freight is on it", store.id);
        return;
      }
      if (Math.hypot(this.cart.x - this.skanky.x, this.cart.y - this.skanky.y) > MALL_RULES.cartNearby) {
        this.emit('wrong', "Bring the cart · BENTLEY's freight is on it", store.id);
        return;
      }
      this.cart.load = this.cart.load.filter(id => id !== BENTLEY.id);
      store.state = 'dropped';
      this.delivered += 1;
      this.emit('drop', `${BENTLEY.bundles * store.boxes} boxes dropped at BENTLEY · SPACE for the signature`, store.id);
      return;
    }
    if (store.state === 'signed') { super.atStore(store); return; }
    if (this.bentley === 'pending') {
      // The cart stays with the boxes; Skanky goes for the missing one on foot.
      this.bentley = 'refused';
      this.cart.pushed = false;
      this.emit('refuse', "BENTLEY won't sign · a box is missing · SECURITY has it, through the back doors", store.id);
      return;
    }
    if (this.bentley === 'refused') {
      this.emit('wrong', "BENTLEY won't sign without the missing box · SECURITY is through the back doors", store.id);
      return;
    }
    if (this.bentley === 'fetched') {
      this.handBox = false;
      this.bentley = 'returned';
      this.emit('handover', 'The missing box is back · SPACE for the signature', store.id);
      return;
    }
    super.atStore(store);
  }

  /** At the security desk: the guard has Bentley's box, and Skanky takes it in his hands. */
  private collect(): void {
    if (this.bentley !== 'refused') return;
    this.bentley = 'fetched';
    this.handBox = true;
    this.emit('security', 'Got the missing box · carry it back to BENTLEY', BENTLEY.id);
  }

  /** The 3D floor runs on through the staff doors to security; the cart cannot follow it out of the concourse. */
  public override free(x: number, y: number, radius: number): boolean {
    if (!onFloor(x, y)) return false;
    if (EDGES.some(edge => Math.hypot(x - clamp(x, edge.x1, edge.x2), y - clamp(y, edge.y1, edge.y2)) < radius)) return false;
    return !OBSTACLES.some(rect => Math.hypot(x - clamp(x, rect.x, rect.x + rect.w), y - clamp(y, rect.y, rect.y + rect.h)) < radius);
  }
}
