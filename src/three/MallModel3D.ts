import { MallModel, MALL_LAYOUT, MALL_RULES } from '../game/slice/MallModel.ts';

const inside = (r: { x: number; y: number; w: number; h: number }, p: { x: number; y: number }) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
export type MallAction = 'take' | 'load' | 'grab-cart' | 'park-cart' | 'drop' | 'sign' | 'close' | 'wrong' | 'none';

/** Current 3D interactions; the legacy mall keeps its original inputs and freight. */
export class MallModel3D extends MallModel {
  constructor(random: () => number = Math.random) {
    super(random);
    this.stores.forEach((store, index) => { store.boxes = 6 + index % 3 * 2; });
  }

  public override nearestSlot(): number {
    const run = this.runComplete && !this.allSigned ? this.run + 1 : this.run;
    const available = this.truckBundles.flatMap((id, slot) => id && this.store(id).run === run ? [slot] : []);
    return available.sort((a, b) => Math.abs(this.slotPosition(a).y - this.skanky.y) - Math.abs(this.slotPosition(b).y - this.skanky.y))[0] ?? -1;
  }

  public get interaction(): { action: MallAction; label: string; slot?: number } {
    const nearCart = Math.hypot(this.cart.x - this.skanky.x, this.cart.y - this.skanky.y) <= MALL_RULES.reach + 14;
    if (this.carrying) return { action: nearCart ? 'load' : 'none', label: nearCart ? 'SPACE · LOAD CART' : 'Carry the bundle to the cart' };
    const store = this.stores.find(s => inside(s.zone, this.skanky) || this.cart.pushed && inside(s.zone, this.cart));
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
    return { action: 'none', label: 'Move closer to a parcel, the cart or a delivery door' };
  }

  public override action(): void {
    if (this.paused || this.finished) return;
    const { action } = this.interaction;
    if (action === 'grab-cart' || action === 'park-cart') this.toggleCart();
    else if (action !== 'none') super.action();
  }
}
