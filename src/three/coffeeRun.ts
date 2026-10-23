/**
 * The Timmies run (the 3D game's lunch mini-game). On the way back from Tim Hortons, Termite drives and Skanky, in
 * the passenger seat, holds two trays of coffees for thirty seconds. Every turn, brake, swerve and bump throws the
 * coffee about; the player tilts the trays against it, and a cup whose coffee reaches the rim spills.
 *
 * Pure rules (no rendering): the route along the city's streets, the car's motion on it, the coffee's slosh, the
 * spills and the points. The car's frame: forward is the nose, right is the passenger's side.
 */

export const COFFEE_RUN = {
  durationMs: 30_000,
  /** Two trays of four. */
  cups: 8,
  pointsPerCup: 25,
  /** Paid on top when every coffee makes it. */
  allSafeBonus: 100,
  /**
   * The coffee's slosh: a damped spring of natural frequency `omega` (radians a second) and damping ratio `damping`,
   * pushed by the car's acceleration and the trays' tilt. A steady push of `spillPush` m/s² holds it at the rim.
   */
  omega: 3.5, damping: 0.6, spillPush: 4.5,
  /** The push a full tilt of the trays gives (m/s²), and how fast the trays follow the controls (full tilts a second). */
  tiltPush: 5, tiltRate: 4,
  /** A spill lets this much of the slosh go, and the next cup cannot go for this long. */
  spillSettle: 0.45, spillGapMs: 450,
  /** Past this much of the way to the rim the coffee is getting close (the gauge turns yellow), and in danger (red, drips fly). */
  caution: 0.4,
  danger: 0.72,
  /** A warning shows this long before its event. */
  warnMs: 1_200,
  /** How hard the bumps kick the coffee, against their listed strengths. */
  bumpScale: 0.8,
  /**
   * Tilting toward the middle tilts only as far as brings the coffee back there (`assist` of the way back each
   * second, held against the car), however far the key or stick goes. A key is all or nothing, and a full tilt
   * pushes the coffee harder than the car does: pressing toward the middle overshot, swung back, and spilled.
   */
  assist: 0.9,
  /** How much of the coffee's swing that tilt takes out, and inside what share of the way to the rim any tilt only steadies it. */
  settle: 1.5, calm: 0.35,
} as const;

/** How Termite drives: cruising speed, cornering grip, pulling away and braking (m/s, m/s²). */
const DRIVE = { cruise: 12, swerveSpeed: 10.5, cornerGrip: 4.2, accelerate: 2.8, brake: 4, lateBrake: 5.5, redLightMs: 1_800 } as const;
/** The rate the rules run at, whatever the frame rate. */
const STEP = 1 / 120;
/** The route's sampling interval, in metres. */
const DS = 0.25;

export type CoffeeEventKind = 'pothole' | 'swerve' | 'red-light' | 'green' | 'turn-right' | 'speed-bump' | 'turn-left' | 'potholes';
export interface CoffeeHazard { kind: CoffeeEventKind; label: string; hint: string }
export const COFFEE_HAZARDS: Record<CoffeeEventKind, CoffeeHazard> = {
  pothole: { kind: 'pothole', label: 'POTHOLE', hint: 'keep the coffee centred' },
  swerve: { kind: 'swerve', label: 'SWERVE · DOUBLE-PARKED CAR', hint: 'left, then right' },
  'red-light': { kind: 'red-light', label: 'RED LIGHT · TERMITE BRAKES LATE', hint: 'lean back' },
  green: { kind: 'green', label: 'GREEN · PULLING AWAY', hint: 'lean forward' },
  'turn-right': { kind: 'turn-right', label: 'RIGHT TURN', hint: 'lean right' },
  'speed-bump': { kind: 'speed-bump', label: 'SPEED BUMP', hint: 'keep the coffee centred' },
  'turn-left': { kind: 'turn-left', label: 'LEFT TURN', hint: 'lean left' },
  potholes: { kind: 'potholes', label: 'POTHOLES', hint: 'keep the coffee centred' },
};

export interface CoffeeVector { forward: number; right: number }
export type CoffeeRunEvent =
  | { type: 'warn'; hazard: CoffeeHazard }
  | { type: 'bump'; strength: number }
  | { type: 'spill'; cup: number; left: number }
  | { type: 'done'; cups: number; points: number };

/**
 * Where each cup stands, in metres from the middle of Skanky's lap (forward, right): the tray in his left hand by the
 * door, then the one in his right hand over the console.
 */
export const CUP_SPOTS: readonly CoffeeVector[] = [0.18, -0.22].flatMap((tray) =>
  [-0.055, 0.055].flatMap((forward) => [-0.055, 0.055].map((right) => ({ forward, right: tray + right }))));

interface Sample { x: number; z: number; heading: number; curvature: number }
/** Something on the road the view shows: a pothole, the speed bump, the double-parked car (in city metres). */
export interface CoffeeLandmark { kind: 'pothole' | 'speed-bump' | 'parked-car'; x: number; z: number; heading: number }

/**
 * The route: from Tim Hortons by the coffee crossing north on the right-hand lane of the x = 0 street, a red light
 * at the depot crossing, right onto the z = −40 street, left onto the x = −60 street toward the UPS gate.
 */
const ROUTE = [{ x: -3, z: -150 }, { x: -3, z: -43 }, { x: -63, z: -43 }, { x: -63, z: 78 }] as const;
const CORNER_RADIUS = [8, 10] as const;

function buildRoute(): { samples: Sample[]; corners: { start: number; end: number; turn: 'turn-right' | 'turn-left' }[] } {
  const samples: Sample[] = [];
  const corners: { start: number; end: number; turn: 'turn-right' | 'turn-left' }[] = [];
  // A sample every DS metres along the whole route, carried across the joins between pieces.
  let since = DS;
  const walk = (length: number, at: (d: number) => Sample): void => {
    let d = DS - since;
    for (; d < length - 1e-9; d += DS) samples.push(at(d));
    since = length - (d - DS);
  };
  const sample = (x: number, z: number, tx: number, tz: number, curvature: number): Sample => ({ x, z, heading: Math.atan2(-tz, tx), curvature });
  const line = (from: { x: number; z: number }, to: { x: number; z: number }): void => {
    const length = Math.hypot(to.x - from.x, to.z - from.z), tx = (to.x - from.x) / length, tz = (to.z - from.z) / length;
    walk(length, (d) => sample(from.x + tx * d, from.z + tz * d, tx, tz, 0));
  };
  let from: { x: number; z: number } = ROUTE[0];
  for (let i = 1; i < ROUTE.length - 1; i++) {
    const corner = ROUTE[i], next = ROUTE[i + 1], radius = CORNER_RADIUS[i - 1];
    const inLength = Math.hypot(corner.x - from.x, corner.z - from.z);
    const u = { x: (corner.x - from.x) / inLength, z: (corner.z - from.z) / inLength };
    const outLength = Math.hypot(next.x - corner.x, next.z - corner.z);
    const w = { x: (next.x - corner.x) / outLength, z: (next.z - corner.z) / outLength };
    const arcStart = { x: corner.x - u.x * radius, z: corner.z - u.z * radius };
    line(from, arcStart);
    // A quarter turn: the centre sits a radius off the arc's start toward the new direction.
    const centre = { x: arcStart.x + w.x * radius, z: arcStart.z + w.z * radius };
    // The passenger's side is the car's right, (sin h, cos h) for heading h: turning toward it is a right turn.
    const heading = Math.atan2(-u.z, u.x);
    const right = { x: Math.sin(heading), z: Math.cos(heading) };
    const turn = right.x * w.x + right.z * w.z > 0 ? 'turn-right' : 'turn-left';
    const sign = turn === 'turn-right' ? 1 : -1;
    const start = (samples.length - 1) * DS + since;
    const arcLength = Math.PI / 2 * radius;
    walk(arcLength, (d) => {
      const phi = d / radius;
      return sample(centre.x + radius * (-w.x * Math.cos(phi) + u.x * Math.sin(phi)), centre.z + radius * (-w.z * Math.cos(phi) + u.z * Math.sin(phi)),
        w.x * Math.sin(phi) + u.x * Math.cos(phi), w.z * Math.sin(phi) + u.z * Math.cos(phi), sign / radius);
    });
    corners.push({ start, end: start + arcLength, turn });
    from = { x: corner.x + w.x * radius, z: corner.z + w.z * radius };
  }
  line(from, ROUTE[ROUTE.length - 1]);
  return { samples, corners };
}

const ROUTE_BUILT = buildRoute();
const ROUTE_LENGTH = (ROUTE_BUILT.samples.length - 1) * DS;
const [RIGHT_TURN, LEFT_TURN] = ROUTE_BUILT.corners;
/** The stop line for the depot crossing's light, a few metres before the right turn. */
const STOP_AT = RIGHT_TURN.start - 0.5;
/** The swerve round the double-parked car: out to the left over `out` metres, past it, and back. */
const SWERVE = { start: 34, out: 20, hold: 5, offset: 2.4 } as const;
const PARKED_AT = SWERVE.start + SWERVE.out + SWERVE.hold / 2;
/** The bumps, by distance along the route, and how hard each kicks the coffee. */
const BUMPS: { at: number; strength: number; kind: CoffeeEventKind }[] = [
  { at: 22, strength: 1.6, kind: 'pothole' },
  { at: RIGHT_TURN.end + 14, strength: 1.8, kind: 'speed-bump' },
  { at: RIGHT_TURN.end + 14.8, strength: 1.4, kind: 'speed-bump' },
  ...[12, 15.5, 19].map((d, i) => ({ at: LEFT_TURN.end + d, strength: 0.9 + (i % 2) * 0.3, kind: 'potholes' as const })),
];
/** Each hazard's warning point along the route (its first bump, the swerve's start, the braking, the corners). */
const HAZARDS: { at: number; kind: CoffeeEventKind }[] = [
  { at: 22, kind: 'pothole' },
  { at: SWERVE.start, kind: 'swerve' },
  { at: STOP_AT - DRIVE.cruise ** 2 / (2 * DRIVE.lateBrake), kind: 'red-light' },
  { at: RIGHT_TURN.start, kind: 'turn-right' },
  { at: RIGHT_TURN.end + 14, kind: 'speed-bump' },
  { at: LEFT_TURN.start, kind: 'turn-left' },
  { at: LEFT_TURN.end + 12, kind: 'potholes' },
];

/** The swerve's offset to the left of the lane at `s`, in metres: out on a half cosine, held past the car, back. */
function swerveOffset(s: number): number {
  const { start, out, hold, offset } = SWERVE;
  const into = s - start;
  if (into <= 0 || into >= 2 * out + hold) return 0;
  if (into < out) return offset * (1 - Math.cos(Math.PI * into / out)) / 2;
  if (into < out + hold) return offset;
  return offset * (1 + Math.cos(Math.PI * (into - out - hold) / out)) / 2;
}

/** The fastest Termite takes each stretch: the cruise, slower round the swerve and the corners, braking in time for them. */
const SPEED_LIMIT: Float64Array = (() => {
  const { samples } = ROUTE_BUILT;
  const limit = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = i * DS, curvature = Math.abs(samples[i].curvature);
    limit[i] = curvature > 0 ? Math.min(DRIVE.cruise, Math.sqrt(DRIVE.cornerGrip / curvature)) : DRIVE.cruise;
    if (swerveOffset(s) > 0) limit[i] = Math.min(limit[i], DRIVE.swerveSpeed);
  }
  for (let i = samples.length - 2; i >= 0; i--) limit[i] = Math.min(limit[i], Math.sqrt(limit[i + 1] ** 2 + 2 * DRIVE.brake * DS));
  return limit;
})();

const sampleAt = (s: number): Sample => {
  const { samples } = ROUTE_BUILT;
  const at = Math.max(0, Math.min(samples.length - 1, s / DS)), i = Math.min(samples.length - 2, Math.floor(at)), t = at - i;
  const a = samples[i], b = samples[i + 1];
  const turn = Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading));
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: a.heading + turn * t, curvature: t < 0.5 ? a.curvature : b.curvature };
};
/** The limit at `s`, between the samples: stepping from one to the next braked in jerks rather than steadily. */
const limitAt = (s: number): number => {
  const at = Math.max(0, Math.min(SPEED_LIMIT.length - 1, s / DS)), i = Math.min(SPEED_LIMIT.length - 2, Math.floor(at));
  return SPEED_LIMIT[i] + (SPEED_LIMIT[i + 1] - SPEED_LIMIT[i]) * (at - i);
};

/** The route's points every metre or so (for checks), its length, and what stands on it. */
export const COFFEE_ROUTE = {
  length: ROUTE_LENGTH,
  points: ROUTE_BUILT.samples.filter((_, i) => i % 4 === 0).map(({ x, z }) => ({ x, z })),
  landmarks: [
    ...BUMPS.filter((bump, i, all) => all.findIndex((other) => Math.abs(other.at - bump.at) < 2) === i || bump.kind === 'potholes')
      .map((bump): CoffeeLandmark => {
        const p = sampleAt(bump.at);
        return { kind: bump.kind === 'speed-bump' ? 'speed-bump' : 'pothole', x: p.x, z: p.z, heading: p.heading };
      }),
    (() => { const p = sampleAt(PARKED_AT); return { kind: 'parked-car', x: p.x, z: p.z, heading: p.heading } as CoffeeLandmark; })(),
  ],
  /** The depot crossing's light, red until Termite has waited at it. */
  signal: 'depot-crossing',
} as const;

/** A small seeded generator for the bumps' kicks, so a run is the same each time it is given the same input. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class CoffeeRunModel {
  /** Time into the run, in milliseconds. */
  public elapsedMs = 0;
  public done = false;
  /** Distance along the route, the car's speed (m/s), its heading and position in city metres. */
  public distance = 0;
  public speed = 0;
  public x: number = ROUTE[0].x;
  public z: number = ROUTE[0].z;
  public heading: number = ROUTE_BUILT.samples[0].heading;
  /** The car's acceleration in its own frame (m/s²): forward along the nose, right toward the passenger's side. */
  public readonly acceleration: CoffeeVector = { forward: 0, right: 0 };
  /** The trays' tilt, −1 to 1 each way: forward lowers the front edge, right lowers the passenger's-side edge. */
  public readonly tilt: CoffeeVector = { forward: 0, right: 0 };
  /** Where the coffee has sloshed to, as a share of the way to the rim (1 spills), and how fast. */
  public readonly slosh: CoffeeVector = { forward: 0, right: 0 };
  private readonly sloshRate: CoffeeVector = { forward: 0, right: 0 };
  /** Which cups still hold their coffee, by `CUP_SPOTS` index. */
  public readonly cups: boolean[] = Array.from({ length: COFFEE_RUN.cups }, () => true);
  /** Whether the light has let Termite go, and how long is left of the wait. */
  public released = false;
  private waitMs: number = DRIVE.redLightMs;
  private spillGapMs = 0;
  private warned = 0;
  private bumped = 0;
  private stepMs = 0;
  private readonly kick: () => number;
  private readonly events: CoffeeRunEvent[] = [];

  constructor(options: { seed?: number } = {}) {
    this.kick = seeded(options.seed ?? 7);
  }

  public get cupsLeft(): number { return this.cups.filter(Boolean).length; }
  public get points(): number { return this.cupsLeft * COFFEE_RUN.pointsPerCup + (this.cupsLeft === COFFEE_RUN.cups ? COFFEE_RUN.allSafeBonus : 0); }
  public get remainingMs(): number { return Math.max(0, COFFEE_RUN.durationMs - this.elapsedMs); }
  /** How close the coffee is to the rim, 0 to 1. */
  public get level(): number { return Math.min(1, Math.hypot(this.slosh.forward, this.slosh.right)); }
  public get danger(): boolean { return this.level >= COFFEE_RUN.danger; }
  /** Waiting at the red light. */
  public get waiting(): boolean { return !this.released && this.distance >= STOP_AT - 0.3 && this.speed < 0.2; }
  /** The next hazard within its warning time, or null. */
  public get upcoming(): (CoffeeHazard & { inMs: number }) | null {
    const hazard = HAZARDS[this.warned - 1];
    if (!hazard) return null;
    const inMs = Math.max(0, (hazard.at - this.distance) / Math.max(this.speed, 2) * 1000);
    return inMs <= COFFEE_RUN.warnMs + 200 && hazard.at >= this.distance - 1 ? { ...COFFEE_HAZARDS[hazard.kind], inMs } : null;
  }

  public drainEvents(): CoffeeRunEvent[] { return this.events.splice(0); }

  /** Advances the run by `deltaMs` with the controls held (`move`: x right, y back, each −1 to 1, as the game reads them). */
  public update(deltaMs: number, move: { x: number; y: number } = { x: 0, y: 0 }): void {
    if (this.done || !(deltaMs > 0)) return;
    const target = {
      forward: Math.max(-1, Math.min(1, Number.isFinite(move.y) ? -move.y : 0)),
      right: Math.max(-1, Math.min(1, Number.isFinite(move.x) ? move.x : 0)),
    };
    this.stepMs += Math.min(deltaMs, 250);
    while (this.stepMs >= STEP * 1000 && !this.done) {
      this.stepMs -= STEP * 1000;
      this.step(target);
    }
  }

  private step(target: CoffeeVector): void {
    const h = STEP;
    this.elapsedMs += h * 1000;
    // The trays follow the controls at a hand's pace; toward the middle, no further than brings the coffee back.
    const { spillPush: rim, tiltPush: lean, assist } = COFFEE_RUN;
    for (const axis of ['forward', 'right'] as const) {
      const input = target[axis];
      // The tilt that holds the coffee against the car and settles it back to the middle without swinging past.
      const back = (this.acceleration[axis] - rim * (assist * this.slosh[axis] + COFFEE_RUN.settle * this.sloshRate[axis] / COFFEE_RUN.omega)) / lean;
      const toward = Math.sign(input) === -Math.sign(this.slosh[axis]) || Math.abs(this.slosh[axis]) < COFFEE_RUN.calm;
      const want = assist > 0 && input !== 0 && toward ? Math.max(-Math.abs(input), Math.min(Math.abs(input), back)) : input;
      const change = want - this.tilt[axis];
      this.tilt[axis] += Math.max(-COFFEE_RUN.tiltRate * h, Math.min(COFFEE_RUN.tiltRate * h, change));
    }
    this.drive(h);
    // The coffee: pushed by the car's acceleration (inertia: braking throws it forward, a right turn to the left) and
    // by gravity along the tilted trays; a damped spring holds it toward the middle.
    const { omega, damping, spillPush, tiltPush } = COFFEE_RUN;
    const gain = omega * omega / spillPush;
    for (const axis of ['forward', 'right'] as const) {
      const push = -this.acceleration[axis] + tiltPush * this.tilt[axis];
      this.sloshRate[axis] += (gain * push - omega * omega * this.slosh[axis] - 2 * damping * omega * this.sloshRate[axis]) * h;
      this.slosh[axis] += this.sloshRate[axis] * h;
    }
    this.spill(h);
    if (this.elapsedMs >= COFFEE_RUN.durationMs - 1e-6) {
      this.done = true;
      this.events.push({ type: 'done', cups: this.cupsLeft, points: this.points });
    }
  }

  /** Termite at the wheel: up to the stretch's limit, braking late for the light, waiting for the green. */
  private drive(h: number): void {
    let limit = limitAt(this.distance);
    if (!this.released) limit = Math.min(limit, Math.sqrt(2 * DRIVE.lateBrake * Math.max(0, STOP_AT - this.distance)));
    const before = this.speed;
    this.speed = this.speed < limit ? Math.min(limit, this.speed + DRIVE.accelerate * h) : limit;
    if (!this.released && STOP_AT - this.distance < 0.3 && this.speed < 0.02) {
      this.speed = 0;
      this.waitMs -= h * 1000;
      if (this.waitMs <= 0) {
        this.released = true;
        this.events.push({ type: 'warn', hazard: COFFEE_HAZARDS.green });
      }
    }
    this.distance = Math.min(ROUTE_LENGTH, this.distance + this.speed * h);
    const at = sampleAt(this.distance);
    // The swerve: an offset to the left of the lane (the left is the car's −right), its slope turning the nose.
    const offset = swerveOffset(this.distance), slope = (swerveOffset(this.distance + 0.05) - swerveOffset(this.distance - 0.05)) / 0.1;
    const right = { x: Math.sin(at.heading), z: Math.cos(at.heading) };
    this.x = at.x - right.x * offset;
    this.z = at.z - right.z * offset;
    // Facing slightly left of the lane while the offset grows (heading increases to the left).
    this.heading = at.heading + Math.atan(slope);
    // The acceleration, from the change of speed and the bend of the path: a corner's, less the swerve's (its offset
    // curving left). Differencing the interpolated positions instead spiked wherever the path bent between samples.
    const e = 0.05, bend = (swerveOffset(this.distance + e) - 2 * offset + swerveOffset(this.distance - e)) / (e * e);
    this.acceleration.forward = (this.speed - before) / h;
    this.acceleration.right = this.speed * this.speed * (at.curvature - bend);
    // Warnings ahead of each hazard, and the bumps' kicks as they pass under the wheels.
    for (let next = HAZARDS[this.warned]; next; next = HAZARDS[this.warned]) {
      const seconds = (next.at - this.distance) / Math.max(this.speed, 2);
      // Anything past the light waits for the green.
      if (seconds * 1000 > COFFEE_RUN.warnMs || (!this.released && next.at > STOP_AT)) break;
      this.warned += 1;
      this.events.push({ type: 'warn', hazard: COFFEE_HAZARDS[next.kind] });
    }
    for (let bump = BUMPS[this.bumped]; bump && this.distance >= bump.at; bump = BUMPS[this.bumped]) {
      this.bumped += 1;
      const angle = this.kick() * Math.PI * 2;
      this.sloshRate.forward += Math.cos(angle) * bump.strength * COFFEE_RUN.bumpScale;
      this.sloshRate.right += Math.sin(angle) * bump.strength * COFFEE_RUN.bumpScale;
      this.events.push({ type: 'bump', strength: bump.strength });
    }
  }

  /** The coffee at the rim: the cup on that side spills, and the slosh settles a little. */
  private spill(h: number): void {
    this.spillGapMs = Math.max(0, this.spillGapMs - h * 1000);
    const level = Math.hypot(this.slosh.forward, this.slosh.right);
    if (level < 1 || this.spillGapMs > 0 || this.cupsLeft === 0) return;
    // The cup furthest toward where the coffee has gone.
    let best = -1, bestScore = -Infinity;
    CUP_SPOTS.forEach((spot, index) => {
      const score = (spot.forward * this.slosh.forward + spot.right * this.slosh.right) / level;
      if (this.cups[index] && score > bestScore + 1e-9) { bestScore = score; best = index; }
    });
    if (best < 0) return;
    this.cups[best] = false;
    this.spillGapMs = COFFEE_RUN.spillGapMs;
    for (const axis of ['forward', 'right'] as const) {
      this.slosh[axis] *= COFFEE_RUN.spillSettle;
      this.sloshRate[axis] *= 0.5;
    }
    this.events.push({ type: 'spill', cup: best, left: this.cupsLeft });
  }
}
