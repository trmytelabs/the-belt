/**
 * The Ralph run (the 3D game's other five-ton run, the owner's, 2026-10-22). After the shift Termite can take the
 * five-ton out with Ralph instead of Skanky's mall run: a paperboy run round the streets by the depot, throwing each
 * business its parcel out of the cab window as the truck goes by, while Ralph talks.
 *
 * Pure rules (the truck itself is the drive's `DrivingModel`): the stops, the parcels' flights, hits and points,
 * the clock and when Ralph says each line. City metres; a heading's forward is (cos h, −sin h) and its right
 * (the passenger's side) (sin h, cos h).
 */

export const RALPH_RUN = {
  durationMs: 120_000,
  /** Parcels aboard: one for each stop and a few spares. */
  parcels: 12,
  /** A parcel within `ring` metres of a stop's mark is delivered; within `bullseye`, dead on. */
  ring: 2.2, bullseye: 0.9,
  hitPoints: 50, bullseyePoints: 25,
  /** Every whole second left when the last stop is served pays this much. */
  secondPoints: 2,
  /**
   * A throw: out of the window across the truck, on top of the truck's own velocity, for `flightMs`. Termite judges
   * the distance across the street to the stop he aims at (between `across` metres); the timing along it is the
   * player's. With no stop in reach it goes out at `throwSpeed`.
   */
  throwSpeed: 9, flightMs: 550, across: { min: 2, max: 14 },
  /** Where the parcel leaves the cab: this far forward of the truck's centre and out to the side. */
  window: { forward: 1.4, side: 1.3 },
  /** A stop further than this from the truck is not aimed at: the parcel goes out of the passenger's window. */
  aimReach: 30,
  /** Ralph's first line, then one every so often. */
  firstLineMs: 3_000, lineEveryMs: 8_000,
} as const;

/** What Ralph tells Termite on the run: the owner's notes about him, in order. */
export const RALPH_LINES: readonly string[] = [
  "I've had three sets of triplets.",
  'All of them with the initials T.N.T.',
  "I'm rich too, you know.",
  'I live in a penthouse.',
  "I'm only doing this job till I can retire.",
  'Got three houses in Florida.',
  'I was in the military.',
  'Shot people escaping the brig.',
];

export interface RalphStop {
  name: string;
  /** The mark on the sidewalk, in city metres. */
  x: number;
  z: number;
  /** The way the street runs past it (the heading a truck passing it has), for the sign to face the road. */
  heading: number;
  delivered: boolean;
  bullseye: boolean;
}

/**
 * The loop: out of the UPS yard south down the x = −60 street, east along z = −100, north up x = 60 and back west
 * along z = 20, with eight businesses on the sidewalks (8.5 m off each street's middle) on either side.
 */
const SOUTH = Math.PI / 2, EAST = 0, NORTH = -Math.PI / 2, WEST = Math.PI;
export const RALPH_STOPS: readonly Omit<RalphStop, 'delivered' | 'bullseye'>[] = [
  { name: 'BARBER', x: -51.5, z: 45, heading: SOUTH },
  { name: 'PIZZA', x: -68.5, z: -8, heading: SOUTH },
  { name: 'PAWN SHOP', x: -51.5, z: -68, heading: SOUTH },
  { name: 'LAUNDROMAT', x: -28, z: -108.5, heading: EAST },
  { name: 'PHARMACY', x: 28, z: -91.5, heading: EAST },
  { name: 'HARDWARE', x: 51.5, z: -66, heading: NORTH },
  { name: 'FLOWERS', x: 68.5, z: -8, heading: NORTH },
  { name: 'BAKERY', x: -22, z: 11.5, heading: WEST },
];

export interface TruckPose { x: number; z: number; heading: number; speed: number }
export interface RalphParcel {
  id: number;
  from: { x: number; z: number };
  to: { x: number; z: number };
  elapsedMs: number;
  landed: boolean;
}
export type RalphRunEvent =
  | { type: 'throw'; parcel: RalphParcel; side: 'left' | 'right' }
  | { type: 'hit'; stop: RalphStop; index: number; points: number; bullseye: boolean }
  | { type: 'miss'; parcel: RalphParcel }
  | { type: 'empty' }
  | { type: 'line'; line: string; index: number }
  | { type: 'done'; delivered: number; points: number; reason: 'all' | 'time' | 'parcels' };

export class RalphRunModel {
  public elapsedMs = 0;
  public done = false;
  public points = 0;
  public parcelsLeft: number = RALPH_RUN.parcels;
  public readonly stops: RalphStop[] = RALPH_STOPS.map((stop) => ({ ...stop, delivered: false, bullseye: false }));
  public readonly flights: RalphParcel[] = [];
  private nextId = 1;
  /** The stop most recently served (−1 before the first), where the loop's next stop is counted from. */
  private lastServed = -1;
  private lines = 0;
  private readonly events: RalphRunEvent[] = [];

  public get delivered(): number { return this.stops.filter((stop) => stop.delivered).length; }
  public get bullseyes(): number { return this.stops.filter((stop) => stop.bullseye).length; }
  public get remainingMs(): number { return Math.max(0, RALPH_RUN.durationMs - this.elapsedMs); }
  public drainEvents(): RalphRunEvent[] { return this.events.splice(0); }

  /** The nearest stop still waiting for its parcel, and how far it is, or null once all are served. */
  public nextStop(truck: { x: number; z: number }): { stop: RalphStop; index: number; distance: number } | null {
    let best: { stop: RalphStop; index: number; distance: number } | null = null;
    this.stops.forEach((stop, index) => {
      if (stop.delivered) return;
      const distance = Math.hypot(stop.x - truck.x, stop.z - truck.z);
      if (!best || distance < best.distance) best = { stop, index, distance };
    });
    return best;
  }

  /**
   * The next stop along the loop still waiting for its parcel: the first after the last one served, round the loop,
   * for the HUD and the brighter mark (a throw aims at the nearest, `nextStop`).
   */
  public routeNext(truck: { x: number; z: number }): { stop: RalphStop; index: number; distance: number } | null {
    for (let k = 1; k <= this.stops.length; k++) {
      const index = (this.lastServed + k) % this.stops.length, stop = this.stops[index];
      if (!stop.delivered) return { stop, index, distance: Math.hypot(stop.x - truck.x, stop.z - truck.z) };
    }
    return null;
  }

  /** Which window a throw goes out of now: toward the nearest waiting stop in reach, else the passenger's (right). */
  public sideFor(truck: TruckPose): 'left' | 'right' {
    const next = this.nextStop(truck);
    if (!next || next.distance > RALPH_RUN.aimReach) return 'right';
    const right = { x: Math.sin(truck.heading), z: Math.cos(truck.heading) };
    return (next.stop.x - truck.x) * right.x + (next.stop.z - truck.z) * right.z >= 0 ? 'right' : 'left';
  }

  /** A parcel out of the window: across the truck at the throw's speed, carried along at the truck's own. */
  public throwParcel(truck: TruckPose): RalphParcel | null {
    if (this.done) return null;
    if (this.parcelsLeft <= 0) { this.events.push({ type: 'empty' }); return null; }
    const side = this.sideFor(truck), sign = side === 'right' ? 1 : -1;
    const forward = { x: Math.cos(truck.heading), z: -Math.sin(truck.heading) };
    const right = { x: Math.sin(truck.heading), z: Math.cos(truck.heading) };
    const { window, throwSpeed, flightMs } = RALPH_RUN;
    const from = { x: truck.x + forward.x * window.forward + right.x * window.side * sign, z: truck.z + forward.z * window.forward + right.z * window.side * sign };
    const seconds = flightMs / 1000;
    // Across the street to the stop aimed at, judged from the window; along the street, it goes where the truck takes it.
    const next = this.nextStop(truck);
    const across = next && next.distance <= RALPH_RUN.aimReach ? Math.abs((next.stop.x - from.x) * right.x + (next.stop.z - from.z) * right.z) : null;
    const reach = across !== null && across >= RALPH_RUN.across.min && across <= RALPH_RUN.across.max ? across : throwSpeed * seconds;
    const to = {
      x: from.x + forward.x * truck.speed * seconds + right.x * reach * sign,
      z: from.z + forward.z * truck.speed * seconds + right.z * reach * sign,
    };
    const parcel: RalphParcel = { id: this.nextId++, from, to, elapsedMs: 0, landed: false };
    this.parcelsLeft -= 1;
    this.flights.push(parcel);
    this.events.push({ type: 'throw', parcel, side });
    return parcel;
  }

  public update(deltaMs: number): void {
    if (this.done || !(deltaMs > 0)) return;
    const step = Math.min(deltaMs, 250);
    this.elapsedMs += step;
    for (const parcel of this.flights) {
      if (parcel.landed) continue;
      parcel.elapsedMs = Math.min(RALPH_RUN.flightMs, parcel.elapsedMs + step);
      if (parcel.elapsedMs >= RALPH_RUN.flightMs) this.land(parcel);
    }
    while (this.lines < RALPH_LINES.length && this.elapsedMs >= RALPH_RUN.firstLineMs + this.lines * RALPH_RUN.lineEveryMs) {
      this.events.push({ type: 'line', line: RALPH_LINES[this.lines], index: this.lines });
      this.lines += 1;
    }
    const flying = this.flights.some((parcel) => !parcel.landed);
    if (this.delivered === this.stops.length) this.finish('all');
    else if (this.elapsedMs >= RALPH_RUN.durationMs) this.finish('time');
    else if (this.parcelsLeft === 0 && !flying) this.finish('parcels');
  }

  /** Where a parcel is `t` (0 to 1) of the way through its flight: along the ground, and its height on the arc. */
  public static flightAt(parcel: RalphParcel, t: number): { x: number; z: number; y: number } {
    return { x: parcel.from.x + (parcel.to.x - parcel.from.x) * t, z: parcel.from.z + (parcel.to.z - parcel.from.z) * t, y: 1.8 * (1 - t) + 1.6 * t * (1 - t) };
  }

  private land(parcel: RalphParcel): void {
    parcel.landed = true;
    let best = -1, bestDistance = Infinity;
    this.stops.forEach((stop, index) => {
      const distance = Math.hypot(stop.x - parcel.to.x, stop.z - parcel.to.z);
      if (!stop.delivered && distance <= RALPH_RUN.ring && distance < bestDistance) { best = index; bestDistance = distance; }
    });
    if (best < 0) { this.events.push({ type: 'miss', parcel }); return; }
    const stop = this.stops[best], bullseye = bestDistance <= RALPH_RUN.bullseye;
    stop.delivered = true;
    stop.bullseye = bullseye;
    this.lastServed = best;
    const points = RALPH_RUN.hitPoints + (bullseye ? RALPH_RUN.bullseyePoints : 0);
    this.points += points;
    this.events.push({ type: 'hit', stop, index: best, points, bullseye });
  }

  private finish(reason: 'all' | 'time' | 'parcels'): void {
    this.done = true;
    if (reason === 'all') this.points += Math.floor(this.remainingMs / 1000) * RALPH_RUN.secondPoints;
    this.events.push({ type: 'done', delivered: this.delivered, points: this.points, reason });
  }
}
