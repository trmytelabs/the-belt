/** Arcade road rules owned by the 3D night. No warehouse or legacy model state. */
export type DriveDestination = 'mall' | 'ups';
export interface DriveInput { steer: number; throttle: number; brake: number }
export interface RoadPoint { x: number; z: number; tx: number; tz: number; heading: number }
export interface RoadObstacle { id: string; kind: 'car' | 'cone'; distance: number; offset: number; speed: number; hit: boolean }
export type DriveEvent = { type: 'collision'; kind: 'car' | 'cone'; points: number } | { type: 'parked' };

const clamp = (n: number, a: number, b: number): number => Math.max(a, Math.min(b, n));
export const DRIVING = {
  maxSpeed: 13.5, acceleration: 7, braking: 17, coast: 1.9,
  roadHalfWidth: 6, shoulderLimit: 5.1, lane: 2.6,
  collisionPoints: 5, collisionCooldown: 1.5, slowdownSeconds: 0.8,
  parkingApproach: 26, parkingDistance: 4, parkingSpeed: 1.8,
} as const;

// An arc-length table gives the same world speed through four broad bends.
const samples = Array.from({ length: 261 }, (_, i) => {
  const u = i / 260;
  return { x: 13 * (1 - Math.cos(u * Math.PI * 4)), z: -260 * u, distance: 0 };
});
for (let i = 1; i < samples.length; i++) {
  samples[i].distance = samples[i - 1].distance + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z);
}
export const ROAD_LENGTH = samples.at(-1)!.distance;

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
  public braking = false;
  public elapsed = 0;
  public paused = false;
  public parked = false;
  public collisions = 0;
  public penalty = 0;
  public slowdown = 0;
  public cooldown = 0;
  public readonly obstacles: RoadObstacle[];
  private readonly events: DriveEvent[] = [];

  constructor(destination: DriveDestination) {
    this.destination = destination;
    this.obstacles = [
      ...[72, 78, 84, 179, 185, 191].map((distance, i): RoadObstacle => ({
        id: `cone-${i}`, kind: 'cone', distance, offset: i < 3 ? 4.7 : -4.7, speed: 0, hit: false,
      })),
      { id: 'car-0', kind: 'car', distance: 112, offset: -2.7, speed: -8, hit: false },
      { id: 'car-1', kind: 'car', distance: 248, offset: -2.7, speed: -9, hit: false },
      { id: 'car-2', kind: 'car', distance: 40, offset: 2.7, speed: 12, hit: false },
    ];
  }

  public get remaining(): number { return Math.max(0, ROAD_LENGTH - this.distance); }
  public get pose(): RoadPoint { return roadPoint(this.distance, this.offset, this.destination); }
  public get canPark(): boolean { return !this.parked && this.remaining <= DRIVING.parkingDistance && this.speed <= DRIVING.parkingSpeed; }
  public get objective(): string {
    if (this.canPark) return 'SPACE to park · cargo safe';
    if (this.remaining < DRIVING.parkingApproach) return 'Loading bay ahead · S / ↓ brake, then SPACE to park';
    if (this.slowdown > 0) return 'Easy does it · cargo safe · keep driving';
    return this.elapsed < 4 ? 'W / ↑ accelerate · A D / ← → steer · S / ↓ brake' : 'Follow the lit road · gentle turn assist';
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
    this.offset += this.steer * Math.min(this.speed * 0.55, 6) * dt;
    if (Math.abs(this.offset) > 4.5) this.offset += (Math.sign(this.offset) * 4.5 - this.offset) * Math.min(1, dt * 3);
    this.offset = clamp(this.offset, -DRIVING.shoulderLimit, DRIVING.shoulderLimit);
    if (this.remaining < 16) this.offset += (DRIVING.lane - this.offset) * Math.min(1, dt * 2.5);
    this.distance = Math.min(ROAD_LENGTH, this.distance + this.speed * dt);
    if (this.remaining < 0.08) { this.distance = ROAD_LENGTH; this.speed = 0; }
    for (const obstacle of this.obstacles) {
      obstacle.distance += obstacle.speed * dt;
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
