/** Arcade road rules owned by the 3D night. No warehouse or legacy model state. */
export type DriveDestination = 'mall' | 'ups';
export interface DriveInput { steer: number; throttle: number; brake: number }
export interface RoadPoint { x: number; z: number; tx: number; tz: number; heading: number }
export interface RoadObstacle { id: string; kind: 'car' | 'cone'; distance: number; offset: number; speed: number; hit: boolean }
export type DriveEvent = { type: 'collision'; kind: 'car' | 'cone'; points: number } | { type: 'red-light'; points: number } | { type: 'parked' };
export interface RoadSignal { id: string; distance: number; offset: number; crossed: boolean }

const clamp = (n: number, a: number, b: number): number => Math.max(a, Math.min(b, n));
export const DRIVING = {
  maxSpeed: 13.5, acceleration: 7, braking: 17, coast: 1.9,
  roadHalfWidth: 6, shoulderLimit: 5.1, lane: 2.6,
  collisionPoints: 5, collisionCooldown: 1.5, slowdownSeconds: 0.8,
  parkingApproach: 26, parkingDistance: 4, parkingSpeed: 1.8,
  turnRate: 1.4, turnAssist: 0.35, signalCycle: 18, redSeconds: 5,
} as const;

export const angleDelta = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
// Four rounded street corners: right, left, left, right on the outbound trip.
const vertices = [{ x: 0, z: 0 }, { x: 0, z: -55 }, { x: 50, z: -55 },
  { x: 50, z: -150 }, { x: 0, z: -150 }, { x: 0, z: -200 }];
const samples: { x: number; z: number; distance: number }[] = [];
const pushLine = (a: typeof vertices[number], b: typeof vertices[number]): void => {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 3));
  for (let i = 0; i < steps; i++) samples.push({ x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps, distance: 0 });
};
let previous = vertices[0];
export const ROAD_TURNS: { distance: number; direction: 'left' | 'right' }[] = [];
for (let i = 1; i < vertices.length - 1; i++) {
  const a = vertices[i - 1], b = vertices[i], c = vertices[i + 1], radius = 12;
  const before = Math.hypot(b.x - a.x, b.z - a.z), after = Math.hypot(c.x - b.x, c.z - b.z);
  const entry = { x: b.x + (a.x - b.x) / before * radius, z: b.z + (a.z - b.z) / before * radius };
  const exit = { x: b.x + (c.x - b.x) / after * radius, z: b.z + (c.z - b.z) / after * radius };
  pushLine(previous, entry);
  // Quadratic corners are broad and continuous; the table is measured below.
  const startIndex = samples.length;
  for (let j = 0; j < 65; j++) {
    const t = j / 65, u = 1 - t;
    samples.push({ x: u * u * entry.x + 2 * u * t * b.x + t * t * exit.x,
      z: u * u * entry.z + 2 * u * t * b.z + t * t * exit.z, distance: 0 });
  }
  ROAD_TURNS.push({ distance: startIndex, direction: [1, 4].includes(i) ? 'right' : 'left' });
  previous = exit;
}
pushLine(previous, vertices.at(-1)!);
samples.push({ ...vertices.at(-1)!, distance: 0 });
for (let i = 1; i < samples.length; i++) {
  samples[i].distance = samples[i - 1].distance + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z);
}
export const ROAD_LENGTH = samples.at(-1)!.distance;
for (const turn of ROAD_TURNS) turn.distance = samples[turn.distance].distance;

/** Local +X is the existing truck/car nose; positive offset is the driver's right. */
export function roadPoint(distance: number, offset = 0, destination: DriveDestination = 'mall'): RoadPoint {
  const forward = destination === 'mall' ? 1 : -1;
  const d = clamp(destination === 'mall' ? distance : ROAD_LENGTH - distance, 0, ROAD_LENGTH);
  let i = 1;
  while (i < samples.length - 1 && samples[i].distance < d) i++;
  const a = samples[i - 1], b = samples[i];
  const span = b.distance - a.distance, t = (d - a.distance) / span;
  const tx = (b.x - a.x) / span * forward, tz = (b.z - a.z) / span * forward;
  return { x: a.x + (b.x - a.x) * t - tz * offset, z: a.z + (b.z - a.z) * t + tx * offset,
    tx, tz, heading: Math.atan2(-tz, tx) };
}

export class DrivingModel {
  public readonly destination: DriveDestination;
  public distance = 0;
  public offset = DRIVING.lane as number;
  public speed = 0;
  public steer = 0;
  /** Positive yaw points to the driver's right relative to the road. */
  public headingError = 0;
  public braking = false;
  public elapsed = 0;
  public paused = false;
  public parked = false;
  public collisions = 0;
  public penalty = 0;
  public redLights = 0;
  public slowdown = 0;
  public cooldown = 0;
  public readonly obstacles: RoadObstacle[];
  public readonly signals: RoadSignal[];
  private readonly events: DriveEvent[] = [];

  constructor(destination: DriveDestination) {
    this.destination = destination;
    this.obstacles = [
      ...[106, 112, 118, 173, 179, 185].map((distance, i): RoadObstacle => ({
        id: `cone-${i}`, kind: 'cone', distance, offset: i < 3 ? 5.4 : -5.4, speed: 0, hit: false,
      })),
      ...[62, 113, 165, 218, 275, 330].map((distance, i): RoadObstacle => ({
        id: `car-${i}`, kind: 'car', distance, offset: -2.7, speed: -7 - i % 3, hit: false,
      })),
      { id: 'car-6', kind: 'car', distance: 46, offset: 2.7, speed: 12.8, hit: false },
      { id: 'car-7', kind: 'car', distance: 96, offset: 2.7, speed: 12.8, hit: false },
      { id: 'car-8', kind: 'car', distance: 164, offset: 7.8, speed: 0, hit: false },
      { id: 'car-9', kind: 'car', distance: 126, offset: -8, speed: 0, hit: false },
    ];
    const turns = this.routeTurns;
    this.signals = [{ id: 'signal-0', distance: turns[0].distance - 9, offset: 0, crossed: false },
      { id: 'signal-1', distance: turns.at(-1)!.distance - 9, offset: 9, crossed: false }];
  }

  public get remaining(): number { return Math.max(0, ROAD_LENGTH - this.distance); }
  public get pose(): RoadPoint { return roadPoint(this.distance, this.offset, this.destination); }
  public get canPark(): boolean { return !this.parked && this.remaining <= DRIVING.parkingDistance && this.speed <= DRIVING.parkingSpeed; }
  public signalColor(signal: RoadSignal): 'red' | 'amber' | 'green' {
    const phase = (this.elapsed + signal.offset) % DRIVING.signalCycle;
    return phase < DRIVING.redSeconds ? 'red' : phase > DRIVING.signalCycle - 1.2 ? 'amber' : 'green';
  }
  public get nextSignal(): RoadSignal | undefined { return this.signals.find(signal => !signal.crossed && signal.distance >= this.distance - 2); }
  private get routeTurns(): typeof ROAD_TURNS {
    return this.destination === 'mall' ? ROAD_TURNS : [...ROAD_TURNS].reverse().map(turn => ({
      distance: ROAD_LENGTH - turn.distance - 19.5, direction: turn.direction === 'left' ? 'right' as const : 'left' as const,
    }));
  }
  public get nextTurn(): { distance: number; direction: 'left' | 'right' } | undefined {
    return this.routeTurns.find(turn => turn.distance + 19.5 > this.distance);
  }
  public get objective(): string {
    if (this.canPark) return 'SPACE to park · cargo safe';
    if (this.remaining < DRIVING.parkingApproach) return 'Loading bay ahead · S / ↓ brake, then SPACE to park';
    if (this.slowdown > 0) return 'Easy does it · cargo safe · keep driving';
    const signal = this.nextSignal;
    if (signal && signal.distance - this.distance < 27 && this.signalColor(signal) !== 'green') return `${this.signalColor(signal).toUpperCase()} LIGHT · S / ↓ brake before the line`;
    const turn = this.nextTurn;
    if (turn && turn.distance - this.distance < 28) return `${turn.direction === 'left' ? '← LEFT' : 'RIGHT →'} at the corner · A / D to steer`;
    return this.elapsed < 3 ? 'W / ↑ gas · A D / ← → steer · S / ↓ brake' : 'Stay in the right lane · follow the turn signs';
  }

  public park(): boolean {
    if (this.paused || !this.canPark) return false;
    this.parked = true;
    this.speed = 0;
    this.events.push({ type: 'parked' });
    return true;
  }

  public update(seconds: number, input: DriveInput): void {
    if (this.paused || this.parked || !Number.isFinite(seconds)) return;
    // Substeps prevent missed collisions after a slow draw or a long frame.
    let left = clamp(seconds, 0, 0.25);
    while (left > 1e-6) {
      const dt = Math.min(left, 1 / 60);
      left -= dt;
      this.step(dt, input);
    }
  }

  private step(dt: number, input: DriveInput): void {
    this.elapsed += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.slowdown = Math.max(0, this.slowdown - dt);
    const throttle = clamp(input.throttle, 0, 1), brake = clamp(input.brake, 0, 1);
    this.braking = brake > 0.1 && this.speed > 0.4;
    this.speed = clamp(this.speed + (throttle * DRIVING.acceleration - brake * DRIVING.braking - (throttle ? 0 : DRIVING.coast)) * dt,
      0, this.slowdown > 0 ? 5.5 : DRIVING.maxSpeed);
    // A soft approach cap and wide bay let even a held accelerator reach parking.
    if (this.remaining < DRIVING.parkingApproach) this.speed = Math.min(this.speed, Math.sqrt(this.remaining * 8));
    const targetSteer = clamp(input.steer, -1, 1);
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 9);
    const oldHeading = this.pose.heading;
    const oldDistance = this.distance;
    this.headingError += this.steer * DRIVING.turnRate * Math.min(this.speed / 7, 1) * dt;
    this.headingError *= Math.exp(-dt * 0.7);
    this.headingError = clamp(this.headingError, -1.05, 1.05);
    this.offset += this.speed * Math.sin(this.headingError) * dt;
    this.distance = Math.min(ROAD_LENGTH, this.distance + this.speed * Math.max(0.55, Math.cos(this.headingError)) * dt);
    this.headingError += angleDelta(this.pose.heading - oldHeading) * (1 - DRIVING.turnAssist);
    if (Math.abs(this.offset) > 4.5) {
      // A shoulder nudges the nose inwards. No solid edges, wedging or reversing.
      this.headingError += (-Math.sign(this.offset) * 0.18 - this.headingError) * Math.min(1, dt * 5);
      this.speed = Math.min(this.speed, 10);
    }
    this.offset = clamp(this.offset, -DRIVING.shoulderLimit, DRIVING.shoulderLimit);
    if (this.remaining < 16) {
      this.offset += (DRIVING.lane - this.offset) * Math.min(1, dt * 2.5);
      this.headingError *= Math.exp(-dt * 4);
    }
    if (this.remaining < 0.08) { this.distance = ROAD_LENGTH; this.speed = 0; }
    for (const signal of this.signals) {
      if (signal.crossed || this.distance < signal.distance) continue;
      signal.crossed = true;
      if (oldDistance < signal.distance && this.signalColor(signal) === 'red') {
        this.redLights++; this.penalty += DRIVING.collisionPoints;
        this.events.push({ type: 'red-light', points: DRIVING.collisionPoints });
      }
    }
    for (const obstacle of this.obstacles) {
      let next = obstacle.distance + obstacle.speed * dt;
      if (obstacle.kind === 'car') for (const signal of this.signals) {
        if (this.signalColor(signal) === 'green') continue;
        const line = signal.distance + (obstacle.speed < 0 ? 8 : -3);
        if (obstacle.speed < 0 && obstacle.distance >= line) next = Math.max(line, next);
        if (obstacle.speed > 0 && obstacle.distance <= line) next = Math.min(line, next);
      }
      obstacle.distance = next;
      const reach = obstacle.kind === 'car' ? 3.8 : 2.5;
      const width = obstacle.kind === 'car' ? 1.9 : 1.3;
      if (obstacle.hit || this.cooldown > 0 || this.speed < 0.5 || Math.abs(this.distance - obstacle.distance) > reach || Math.abs(this.offset - obstacle.offset) > width) continue;
      obstacle.hit = true;
      this.collisions++;
      this.penalty += DRIVING.collisionPoints;
      this.speed *= 0.45;
      this.slowdown = DRIVING.slowdownSeconds;
      this.cooldown = DRIVING.collisionCooldown;
      this.events.push({ type: 'collision', kind: obstacle.kind, points: DRIVING.collisionPoints });
    }
  }

  public drainEvents(): DriveEvent[] { return this.events.splice(0); }
}
