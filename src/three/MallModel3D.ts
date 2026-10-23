import { MallModel, MALL_LAYOUT, MALL_RULES, type MallStore } from '../game/slice/MallModel.ts';
import { MALL_STORES } from '../game/slice/StoryScript.ts';

type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };
const inside = (r: Rect, p: Point) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
export type MallAction = 'take' | 'load' | 'grab-cart' | 'park-cart' | 'drop' | 'sign' | 'close' | 'wrong' | 'collect' | 'none';

/**
 * Bentley (the owner's, 2026-10-23): a seventh store, in the old anchor space at the concourse's east end, on a run of
 * its own with the cart full of its freight. Delivered, it will not sign: a box is missing, and the clerk is furious.
 * Skanky tries mall security's lost and found, through the staff doors and down a long service hallway. The guard has
 * the box, and asks questions first; answered right, Skanky carries it back by hand and Bentley signs. Answered wrong,
 * Skanky can ask again, or grab the box and run: Bentley, then the five-ton, with the guard chasing and shooting. One
 * hit and Skanky collapses: medics carry him out to an ambulance, and the night is lost (the owner's, 2026-10-23).
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
 * east wall's), a service hallway running 10 m south from them and then 31 m east, outside the building, and the
 * security office at its end.
 */
export const SECURITY_WING = {
  doors: { x: 1194, y: 514, w: 42, h: 34 },
  /** The hallway's south leg from the doors, and its east leg to the office. */
  hallway: { x: 1182, y: 544, w: 80, h: 320 },
  corridor: { x: 1182, y: 784, w: 1060, h: 80 },
  office: { x: 2236, y: 704, w: 210, h: 200 },
  /** The guard's desk across the office's east side, clear at both ends; where he stands behind it; where Skanky asks. */
  desk: { x: 2366, y: 744, w: 30, h: 110 },
  guardPost: { x: 2421, y: 799 },
  counter: { x: 2310, y: 754, w: 52, h: 90 },
  /** Along the east leg: a pallet of returns, a cleaning cart and stacked empties (cover from the guard's shots). */
  clutter: [{ x: 1520, y: 848, w: 36, h: 16 }, { x: 1800, y: 784, w: 30, h: 14 }, { x: 2040, y: 848, w: 34, h: 16 }],
} as const;
/**
 * The chase, in pixels (32 to a metre) and milliseconds. Skanky runs a little faster than the guard walks him down; the
 * guard closes a long gap faster, so he stays in range. He only shoots with a clear line, after tracking Skanky and
 * then holding his aim: a sidestep once the aim holds is a miss. A hit puts Skanky down; a hand on the shoulder
 * catches him.
 */
export const CHASE = {
  run: 1.08, guardSpeed: 240, guardCatchUp: 290, catchUpGap: 260, headStartMs: 700,
  caughtAt: 24, range: 430, minRange: 60, trackMs: 520, lockMs: 460, firstAimMs: 900, cooldownMs: [1100, 1700] as const,
  hitRadius: 18, trailStep: 20,
} as const;
/**
 * Shot, on one clock from the hit (ms): Skanky collapses; the guard radios for an ambulance; a cut to the medics
 * kneeling by him with a stretcher; they lift him and carry him off; a cut outside to the ambulance at the receiving
 * dock, where they load him in; it pulls away with its lights and siren; game over.
 */
export const AMBULANCE = {
  collapseMs: 1200, sirenMs: 1500, cutInMs: 3000, medicsMs: 3600, liftMs: 5200, carryMs: 6600, cutOutMs: 9500,
  outsideMs: 10100, loadMs: 10600, doorsMs: 11400, departMs: 12400, overMs: 16500,
} as const;
/** Before the box comes back, the guard asks three of these; each answer is shown with two wrong ones. */
const SECURITY_QUESTIONS: readonly { question: string; right: string; wrong: readonly string[] }[] = [
  { question: "WHO'S THE BOX FOR?", right: BENTLEY.name, wrong: [] },
  { question: 'WHO DO YOU DELIVER FOR?', right: 'UPS', wrong: ['CANADA POST', 'PUROLATOR'] },
  { question: 'HOW MANY BOXES WERE ON THE BENTLEY ORDER?', right: String(BENTLEY.bundles * BENTLEY.boxes), wrong: [String(BENTLEY.boxes), '6'] },
  { question: 'WHAT ARE YOU DRIVING TONIGHT?', right: 'THE FIVE-TON', wrong: ['A PACKAGE CAR', 'A TAXI'] },
  { question: 'WHICH DOOR DID YOU COME IN BY?', right: 'RECEIVING · DOCK 3', wrong: ['THE FOOD COURT', 'THE FRONT DOORS'] },
  { question: 'WHAT MALL IS THIS?', right: 'SOUTHGATE MALL', wrong: ['MALLWOOD CENTRE', 'WHITEMUD PLAZA'] },
];
export interface SecurityQuestion { question: string; options: string[]; answer: number }
export interface MallChase {
  guard: Point & { moving: boolean };
  /** Where the guard walks: round his desk, then Skanky's own trail. */
  path: Point[];
  /** The guard's aim: following Skanky until it holds (`locked`), then the shot. */
  aim: (Point & { ms: number; locked: boolean }) | null;
  /** The last shot, from the gun to where it stopped (Skanky, a wall or its range), for the view. */
  shot: { from: Point; to: Point; hit: boolean; ageMs: number } | null;
  cooldownMs: number;
  elapsedMs: number;
  /** The box is with Bentley, signed for: now for the five-ton. */
  delivered: boolean;
}
/** Skanky shot: where he fell, whether he still had the box, where the guard stood, the shot, the clock since (`AMBULANCE`). */
export interface MallDown {
  x: number;
  y: number;
  ms: number;
  box: boolean;
  guard: Point;
  shot: { from: Point; to: Point };
}
/** The 3D mall's floor: the shared layout's, and the way to security. */
const WALK: readonly Rect[] = [...MALL_LAYOUT.walk, SECURITY_WING.doors, SECURITY_WING.hallway, SECURITY_WING.corridor, SECURITY_WING.office];
const OBSTACLES: readonly Rect[] = [...MALL_LAYOUT.obstacles, SECURITY_WING.desk, ...SECURITY_WING.clutter];
const onFloor = (x: number, y: number): boolean => WALK.some(rect => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
/** Open floor: a shot carries over it, and stops at a wall or an obstacle (the planters and the railings are cover). */
const open = (p: Point): boolean => onFloor(p.x, p.y) && !OBSTACLES.some(rect => inside(rect, p));
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
  /**
   * Where the Bentley run stands: not yet asked to sign; refused for the missing box; answering the guard; denied it
   * (ask again, or grab and run); the box in Skanky's hands; handed over.
   */
  public bentley: 'pending' | 'refused' | 'quiz' | 'denied' | 'fetched' | 'returned' = 'pending';
  /** Skanky has the missing box in his hands (it rides no cart). */
  public handBox = false;
  /** The guard's questions, and how far through them Skanky is. */
  public quiz: { questions: SecurityQuestion[]; index: number } | null = null;
  /** Running with the box, the guard behind. */
  public chase: MallChase | null = null;
  /** How the chase ended: into the five-ton and away, caught after Bentley signed, or shot and taken away. */
  public getaway: 'escaped' | 'busted' | 'shot' | null = null;
  /** Shot on the chase: Skanky down, and the ambulance on its way. */
  public down: MallDown | null = null;
  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    super(random);
    this.random = random;
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

  /**
   * The mall practice's START AT BENTLEY: the first three runs done, the six stores delivered and signed, and the fourth
   * under way with Bentley's two loads still in the truck, the cart parked at the tailgate and Skanky beside it.
   */
  public startAtBentley(): void {
    for (const store of this.stores) if (store.id !== BENTLEY.id) store.state = 'signed';
    this.signatures = this.delivered = this.stores.length - 1;
    this.run = BENTLEY.run;
    this.truckBundles.forEach((id, slot) => { if (id !== BENTLEY.id) this.truckBundles[slot] = null; });
    this.carrying = null;
    this.cart.load = [];
    Object.assign(this.cart, { x: 130, y: 400, facing: 'up', pushed: false });
    Object.assign(this.skanky, { x: 75, y: 400, facing: 'left', moving: false });
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

  /** The guard's current question, while Skanky is answering. */
  public get question(): SecurityQuestion | null {
    return this.bentley === 'quiz' && this.quiz ? this.quiz.questions[this.quiz.index] : null;
  }

  /** From the refusal until the box is with Bentley: Skanky sweats (at the desk, and all through the chase). */
  public get sweating(): boolean {
    return this.bentley === 'refused' || this.bentley === 'quiz' || this.bentley === 'denied' || this.chase !== null;
  }

  /** Running with the box: a little faster than walking. */
  protected override get moveSpeed(): number {
    return this.chase ? MALL_RULES.speed * CHASE.run : MALL_RULES.speed;
  }

  public override get objective(): string {
    if (this.down) return 'Skanky is down · the ambulance is on its way';
    if (this.chase) return this.chase.delivered ? 'RUN! · get to the five-ton at the dock · dodge the shots' : 'RUN! · get the box to BENTLEY · dodge the shots';
    const store = this.store(BENTLEY.id);
    if (this.finished || this.run !== BENTLEY.run || this.allSigned || this.runComplete) return super.objective;
    if (store.state === 'waiting') {
      const { truck, cart } = this.bentleyLoads;
      if (truck > 0 || this.carrying) return `Run ${this.run + 1}/${this.runCount} · BENTLEY only · load both BENTLEY loads onto the cart (${cart}/${BENTLEY.bundles})`;
      return `Run ${this.run + 1}/${this.runCount} · push the full cart to BENTLEY`;
    }
    if (this.bentley === 'refused') return 'A BENTLEY box is missing! · try lost and found at mall security, through the staff doors';
    if (this.bentley === 'quiz') return 'Answer the guard to get the box back';
    if (this.bentley === 'denied') return "The guard won't hand it over · ask again, or grab it and run";
    if (this.bentley === 'fetched') return 'Carry the missing box back to BENTLEY';
    return 'Get BENTLEY to sign';
  }

  public get interaction(): { action: MallAction; label: string; slot?: number } {
    const nearCart = Math.hypot(this.cart.x - this.skanky.x, this.cart.y - this.skanky.y) <= MALL_RULES.reach + 14;
    if (this.carrying) return { action: nearCart ? 'load' : 'none', label: nearCart ? 'SPACE · LOAD CART' : 'Carry the bundle to the cart' };
    const store = this.stores.find(s => inside(s.zone, this.skanky) || this.cart.pushed && inside(s.zone, this.cart));
    // At the desk the card carries the choices; the prompt is just the errand.
    if (this.down || this.bentley === 'quiz' || this.bentley === 'denied') return { action: 'none', label: this.objective };
    if (this.chase) {
      if (!this.chase.delivered && store?.id === BENTLEY.id) return { action: 'sign', label: 'SPACE · SHOVE THE BOX AT BENTLEY' };
      return { action: 'none', label: this.objective };
    }
    if (this.handBox) {
      return store?.id === BENTLEY.id ? { action: 'sign', label: 'SPACE · HAND OVER THE MISSING BOX' } : { action: 'none', label: 'Carry the missing box back to BENTLEY' };
    }
    if (inside(SECURITY_WING.counter, this.skanky)) {
      return this.bentley === 'refused' ? { action: 'collect', label: 'SPACE · ASK ABOUT THE MISSING BOX' } : { action: 'none', label: 'MALL SECURITY' };
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
    else if (action === 'collect') this.startQuiz();
    else if (action !== 'none') super.action();
  }

  public override toggleCart(): void {
    if (this.bentley === 'quiz' || this.bentley === 'denied') return;
    if (this.handBox && !this.cart.pushed) {
      this.emit('wrong', 'Hands full · take the box to BENTLEY');
      return;
    }
    super.toggleCart();
  }

  public override update(deltaMs: number, move: { x: number; y: number } = { x: 0, y: 0 }): void {
    if (this.paused || this.finished || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    // Shot: no more moving; the ambulance's clock runs to the end of the night.
    if (this.down) {
      this.down.ms += Math.min(deltaMs, 100);
      if (this.down.ms >= AMBULANCE.overMs) {
        this.finished = true;
        this.getaway = 'shot';
        this.emit('down', 'GAME OVER · Skanky was shot and taken away by ambulance');
      }
      return;
    }
    // At the desk, answering the guard or deciding what to do, Skanky stands still.
    if (this.bentley === 'quiz' || this.bentley === 'denied') {
      this.skanky.moving = false;
      return;
    }
    let remaining = Math.min(deltaMs, 100);
    while (remaining > 0 && !this.finished) {
      const step = Math.min(10, remaining);
      const before = { x: this.skanky.x, y: this.skanky.y };
      super.update(step, move);
      this.slide(before, step, move);
      if (this.chase) this.updateChase(step);
      remaining -= step;
    }
  }

  /**
   * Walking into something (the hallway's clutter, a planter, the desk), Skanky slides round it rather than stopping
   * dead: aside, away from its middle, and on past it. Walls still stop him; pushing the cart, he never slides.
   */
  private slide(before: Point, ms: number, move: { x: number; y: number }): void {
    const s = this.skanky;
    const magnitude = Math.hypot(move.x, move.y);
    if (this.cart.pushed || magnitude === 0 || s.x !== before.x || s.y !== before.y) return;
    const step = this.moveSpeed * ms / 1000;
    const fx = move.x / magnitude, fy = move.y / magnitude;
    const ax = s.x + fx * step, ay = s.y + fy * step;
    const blocking = OBSTACLES.find(rect => Math.hypot(ax - clamp(ax, rect.x, rect.x + rect.w), ay - clamp(ay, rect.y, rect.y + rect.h)) < MALL_RULES.skankyRadius);
    if (!blocking) return;
    // The side away from the obstacle's middle, half on and half aside; failing that, straight aside.
    const side = (blocking.x + blocking.w / 2 - s.x) * -fy + (blocking.y + blocking.h / 2 - s.y) * fx > 0 ? -1 : 1;
    for (const [along, aside] of [[0.6, 0.8], [0, 1]]) {
      const x = s.x + (fx * along - fy * side * aside) * step, y = s.y + (fy * along + fx * side * aside) * step;
      if (this.free(x, y, MALL_RULES.skankyRadius) && !this.overlapsCart(x, y)) {
        Object.assign(s, { x, y, moving: true });
        return;
      }
    }
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
    if (this.chase && this.handBox) {
      // On the run: the box goes over the counter, the clerk signs in a hurry, and Skanky keeps going.
      this.handBox = false;
      this.bentley = 'returned';
      this.chase.delivered = true;
      store.state = 'signed';
      this.signatures += 1;
      this.emit('handover', 'The missing box is back', store.id);
      this.emit('sign', `BENTLEY signed (${this.signatures}/${this.stores.length}) · RUN for the five-ton!`, store.id);
      return;
    }
    if (this.bentley === 'pending') {
      // The cart stays with the boxes; Skanky goes looking for the missing one on foot.
      this.bentley = 'refused';
      this.cart.pushed = false;
      this.emit('refuse', "BENTLEY won't sign · a box is missing!", store.id);
      return;
    }
    if (this.bentley === 'refused') {
      this.emit('wrong', "BENTLEY won't sign until the missing box turns up", store.id);
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

  /** At the security desk: the guard has a box in lost and found, and three questions first. */
  private startQuiz(): void {
    if (this.bentley !== 'refused' && this.bentley !== 'denied') return;
    const others = this.stores.filter(store => store.id !== BENTLEY.id).map(store => store.name);
    const pool = SECURITY_QUESTIONS.map(entry => ({ ...entry, wrong: entry.wrong.length ? [...entry.wrong] : this.pick(others, 2) }));
    const questions = this.pick(pool, 3).map(({ question, right, wrong }) => {
      const options = this.pick([right, ...wrong], wrong.length + 1);
      return { question, options, answer: options.indexOf(right) };
    });
    this.quiz = { questions, index: 0 };
    this.bentley = 'quiz';
    this.skanky.moving = false;
    this.emit('quiz', questions[0].question, BENTLEY.id);
  }

  /** `count` of `items` in a random order. */
  private pick<T>(items: readonly T[], count: number): T[] {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.min(i, Math.floor(this.random() * (i + 1)));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }

  /** 1, 2 or 3 at the desk: every answer right and the box comes back; one wrong and the guard keeps it. */
  public answer(choice: number): void {
    if (this.paused || this.finished || this.bentley !== 'quiz' || !this.quiz) return;
    const asked = this.quiz.questions[this.quiz.index];
    if (choice !== asked.answer) {
      this.quiz = null;
      this.bentley = 'denied';
      this.emit('denied', "Wrong answer · the guard won't hand it over", BENTLEY.id);
      return;
    }
    this.quiz.index += 1;
    const next = this.quiz.questions[this.quiz.index];
    if (next) {
      this.emit('right', 'Right', BENTLEY.id);
      this.emit('quiz', next.question, BENTLEY.id);
      return;
    }
    this.quiz = null;
    this.bentley = 'fetched';
    this.handBox = true;
    this.emit('security', 'Got the missing box · carry it back to BENTLEY', BENTLEY.id);
  }

  /** Denied the box: ask the questions again, or grab it off the desk and run. */
  public decide(choice: 'grab' | 'again'): void {
    if (this.paused || this.finished || this.bentley !== 'denied') return;
    if (choice === 'again') {
      this.startQuiz();
      return;
    }
    const { guardPost, desk } = SECURITY_WING;
    this.bentley = 'fetched';
    this.handBox = true;
    this.chase = {
      guard: { x: guardPost.x, y: guardPost.y, moving: false },
      // Out round the south end of his desk, then after Skanky.
      path: [{ x: guardPost.x, y: desk.y + desk.h + 26 }, { x: desk.x - 26, y: desk.y + desk.h + 26 }],
      aim: null, shot: null, cooldownMs: CHASE.firstAimMs, elapsedMs: 0, delivered: false,
    };
    this.emit('grab', 'Grabbed it! · RUN · get the box to BENTLEY', BENTLEY.id);
  }

  private updateChase(ms: number): void {
    const chase = this.chase!;
    const s = this.skanky, g = chase.guard;
    chase.elapsedMs += ms;
    if (chase.shot && (chase.shot.ageMs += ms) > 450) chase.shot = null;
    const mark = chase.path[chase.path.length - 1] ?? g;
    if (Math.hypot(s.x - mark.x, s.y - mark.y) >= CHASE.trailStep) chase.path.push({ x: s.x, y: s.y });
    if (chase.delivered && inside(MALL_LAYOUT.tailgate, s)) {
      this.endChase('escaped');
      return;
    }
    const gap = Math.hypot(s.x - g.x, s.y - g.y);
    g.moving = false;
    if (chase.aim) {
      const aim = chase.aim;
      aim.ms += ms;
      if (aim.ms < CHASE.trackMs) Object.assign(aim, { x: s.x, y: s.y });
      else aim.locked = true;
      if (aim.ms >= CHASE.trackMs + CHASE.lockMs) this.fire();
    } else if (chase.elapsedMs >= CHASE.headStartMs) {
      chase.cooldownMs -= ms;
      if (chase.cooldownMs <= 0 && gap >= CHASE.minRange && gap <= CHASE.range && this.clearLine(g, s)) {
        chase.aim = { x: s.x, y: s.y, ms: 0, locked: false };
        this.emit('aim', 'He is aiming · SIDESTEP!');
      } else {
        let budget = (gap > CHASE.catchUpGap ? CHASE.guardCatchUp : CHASE.guardSpeed) * ms / 1000;
        while (budget > 0) {
          const target = chase.path[0] ?? s;
          const d = Math.hypot(target.x - g.x, target.y - g.y);
          g.moving = true;
          if (d <= budget) {
            g.x = target.x;
            g.y = target.y;
            budget -= d;
            if (!chase.path.shift()) break;
          } else {
            g.x += (target.x - g.x) / d * budget;
            g.y += (target.y - g.y) / d * budget;
            budget = 0;
          }
        }
      }
    }
    if (this.chase && Math.hypot(s.x - g.x, s.y - g.y) < CHASE.caughtAt) this.catchSkanky();
  }

  /** Every step from one point to the other is open floor. */
  private clearLine(from: Point, to: Point): boolean {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    for (let t = 0; t <= length; t += 8) {
      if (!open({ x: from.x + (to.x - from.x) * t / length, y: from.y + (to.y - from.y) * t / length })) return false;
    }
    return true;
  }

  /** Where the guard's aim (or shot) runs: from him along it to the first wall or obstacle, or the range. */
  public get aimLine(): { from: Point; to: Point; dx: number; dy: number; reach: number; locked: boolean } | null {
    const aim = this.chase?.aim;
    if (!aim) return null;
    const g = this.chase!.guard;
    const length = Math.hypot(aim.x - g.x, aim.y - g.y) || 1;
    const dx = (aim.x - g.x) / length, dy = (aim.y - g.y) / length;
    let reach = 0;
    for (let t = 8; t <= CHASE.range; t += 8) {
      if (!open({ x: g.x + dx * t, y: g.y + dy * t })) break;
      reach = t;
    }
    return { from: { x: g.x, y: g.y }, to: { x: g.x + dx * reach, y: g.y + dy * reach }, dx, dy, reach, locked: aim.locked };
  }

  /** The held aim: Skanky still on its line is hit. */
  private fire(): void {
    const chase = this.chase!;
    const g = chase.guard, s = this.skanky;
    const { dx, dy, reach } = this.aimLine!;
    const along = clamp((s.x - g.x) * dx + (s.y - g.y) * dy, 0, reach);
    const hit = Math.hypot(s.x - (g.x + dx * along), s.y - (g.y + dy * along)) < CHASE.hitRadius;
    chase.shot = { from: { x: g.x, y: g.y }, to: hit ? { x: s.x, y: s.y } : { x: g.x + dx * reach, y: g.y + dy * reach }, hit, ageMs: 0 };
    chase.aim = null;
    chase.cooldownMs = CHASE.cooldownMs[0] + this.random() * (CHASE.cooldownMs[1] - CHASE.cooldownMs[0]);
    if (!hit) {
      this.emit('shot', 'Missed!');
      return;
    }
    // Down: the box falls where he does, and the chase is over.
    this.down = { x: s.x, y: s.y, ms: 0, box: this.handBox, guard: { x: g.x, y: g.y }, shot: { from: chase.shot.from, to: chase.shot.to } };
    this.chase = null;
    this.handBox = false;
    s.moving = false;
    this.emit('hit', 'SHOT! · Skanky is down');
  }

  /**
   * Caught with the box, it goes back on the desk and Skanky back to the counter, to ask again or try again. Caught
   * after Bentley has signed, the guard marches him out to the five-ton: the run is over, without the getaway.
   */
  private catchSkanky(): void {
    if (this.chase?.delivered) {
      this.endChase('busted');
      return;
    }
    const { counter } = SECURITY_WING;
    this.chase = null;
    this.handBox = false;
    this.bentley = 'denied';
    Object.assign(this.skanky, { x: counter.x + 24, y: counter.y + counter.h / 2, facing: 'right', moving: false });
    this.emit('caught', 'CAUGHT · the guard takes the box back', BENTLEY.id);
  }

  private endChase(outcome: 'escaped' | 'busted'): void {
    this.chase = null;
    this.getaway = outcome;
    this.finished = true;
    this.cart.pushed = false;
    if (outcome === 'escaped') this.emit('escape', 'GOT AWAY! · into the five-ton and gone · back to UPS');
    else this.emit('busted', 'BUSTED · mall security marches Skanky out to the five-ton');
  }

  /** The 3D floor runs on through the staff doors to security; the cart cannot follow it out of the concourse. */
  public override free(x: number, y: number, radius: number): boolean {
    if (!onFloor(x, y)) return false;
    if (EDGES.some(edge => Math.hypot(x - clamp(x, edge.x1, edge.x2), y - clamp(y, edge.y1, edge.y2)) < radius)) return false;
    return !OBSTACLES.some(rect => Math.hypot(x - clamp(x, rect.x, rect.x + rect.w), y - clamp(y, rect.y, rect.y + rect.h)) < radius);
  }
}
