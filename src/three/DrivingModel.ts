import { CITY, CITY_BUILDINGS, CITY_SIGNALS, DESTINATIONS, HOME_SPAWN, SPAWNS, TERMINALS, angleDelta, inLoadingYard, nearestRoad, separation, signalColor, trafficPose,
  type CityAxis, type CityPoint, type CityPose, type CitySignal } from './drivingCity.ts';

export type DriveDestination = 'mall' | 'ups';
/** Where a drive begins: the other loading yard, or home for the 3D drive in to work. */
export type DriveOrigin = 'depot' | 'home';
export interface DriveInput { steer: number; throttle: number; brake: number }
export interface RoadObstacle extends CityPoint { id: string; kind: 'car' | 'cone'; heading: number; speed: number; travel: number; route: number; hit: boolean }
export type DriveEvent = { type: 'collision'; kind: 'car' | 'cone' | 'building'; points: number } | { type: 'red-light'; points: number } | { type: 'parked' };
const clamp = (n: number, a: number, b: number): number => Math.max(a, Math.min(b, n));
export const DRIVING = {
  maxSpeed: 18, acceleration: 9, braking: 20, coast: 2, reverseSpeed: 4,
  collisionPoints: 100, collisionCooldown: 1.5, slowdownSeconds: 0.8,
  parkingApproach: 24, parkingDistance: 6, parkingSpeed: 1.8, turnRate: 1.65,
} as const;

interface Box extends CityPoint { heading: number; length: number; width: number }
/** SAT on actual oriented bodies avoids invisible rectangular corner blockers. */
function penetration(a: Box, b: Box): CityPoint | null {
  const axes = [a.heading, a.heading + Math.PI / 2, b.heading, b.heading + Math.PI / 2];
  let smallest = Infinity, push: CityPoint | null = null;
  for (const angle of axes) {
    const x = Math.cos(angle), z = -Math.sin(angle);
    const radius = (box: Box): number => Math.abs(Math.cos(box.heading) * x - Math.sin(box.heading) * z) * box.length / 2
      + Math.abs(Math.sin(box.heading) * x + Math.cos(box.heading) * z) * box.width / 2;
    const signed = (a.x - b.x) * x + (a.z - b.z) * z;
    const overlap = radius(a) + radius(b) - Math.abs(signed) - 0.12;
    if (overlap <= 0) return null;
    if (overlap < smallest) { smallest = overlap; push = { x: x * Math.sign(signed || 1) * (overlap + 0.02), z: z * Math.sign(signed || 1) * (overlap + 0.02) }; }
  }
  return push;
}

/** Free Cartesian driving. Roads are scenery and guidance, never a player rail. */
export class DrivingModel {
  public readonly destination: DriveDestination;
  public readonly origin: DriveOrigin;
  public x: number;
  public z: number;
  public heading: number;
  public distance = 0;
  public speed = 0;
  public steer = 0;
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
  public readonly signals = CITY_SIGNALS;
  private brakeHold = 0;
  private readonly enteredSignals = new Set<string>();
  private readonly hitBuildings = new Set<number>();
  private readonly events: DriveEvent[] = [];

  constructor(destination: DriveDestination, origin: DriveOrigin = 'depot') {
    this.destination = destination;
    this.origin = origin;
    const spawn = origin === 'home' ? HOME_SPAWN : SPAWNS[destination]; this.x = spawn.x; this.z = spawn.z; this.heading = spawn.heading;
    this.obstacles = [
      ...[30, 36, 42, 48, 54, 60].map((x, i): RoadObstacle => ({ id: `cone-${i}`, kind: 'cone', x, z: -45.7,
        heading: 0, speed: 0, travel: 0, route: 0, hit: false })),
      ...Array.from({ length: 28 }, (_, i): RoadObstacle => {
        const route = i % 3, speed = (i % 2 ? -1 : 1) * (7 + i % 3), travel = 42 + i * 47;
        const pose = trafficPose(route, travel, speed < 0);
        return { id: `car-${i}`, kind: 'car', ...pose, speed, travel, route, hit: false };
      }),
    ];
  }

  public get goal(): CityPoint { return DESTINATIONS[this.destination]; }
  public get remaining(): number { return separation(this, this.goal); }
  public get pose(): CityPose { return { x: this.x, z: this.z, heading: this.heading, tx: Math.cos(this.heading), tz: -Math.sin(this.heading) }; }
  public get offRoad(): boolean { return !inLoadingYard(this) && nearestRoad(this).distance > CITY.roadHalfWidth + 3; }
  public get canPark(): boolean { return !this.parked && inLoadingYard(this, this.destination) && this.remaining <= DRIVING.parkingDistance && Math.abs(this.speed) <= DRIVING.parkingSpeed; }
  private get axis(): CityAxis { return Math.abs(Math.cos(this.heading)) < Math.abs(Math.sin(this.heading)) ? 'ns' : 'ew'; }
  public signalColor(signal: CitySignal, axis = this.axis): 'red' | 'amber' | 'green' { return signalColor(signal, this.elapsed, axis); }
  public signalDistance(signal: CitySignal): number {
    const p = this.pose; return (signal.x - this.x) * p.tx + (signal.z - this.z) * p.tz - 11;
  }
  public get nextSignal(): CitySignal | undefined {
    const p = this.pose;
    return this.signals.filter(signal => {
      const dx = signal.x - this.x, dz = signal.z - this.z, along = dx * p.tx + dz * p.tz;
      return along > 10 && along < 50 && Math.abs(dx * -p.tz + dz * p.tx) < 6;
    }).sort((a, b) => this.signalDistance(a) - this.signalDistance(b))[0];
  }
  public get navigation(): { angle: number; target: CityPoint; instruction: string } {
    const target = this.goal;
    const angle = angleDelta(this.heading - Math.atan2(-(target.z - this.z), target.x - this.x));
    const instruction = this.canPark ? 'PARK IN THE LIT BAY' : Math.abs(angle) > 2.3 ? 'DESTINATION BEHIND YOU' : angle < -0.35 ? 'DESTINATION TO YOUR LEFT' : angle > 0.35 ? 'DESTINATION TO YOUR RIGHT' : 'DESTINATION AHEAD';
    return { angle, target, instruction };
  }
  public get objective(): string {
    if (this.canPark) return 'SPACE to park · cargo safe';
    if (this.remaining < DRIVING.parkingApproach) return 'Loading bay nearby · S / ↓ brake, then SPACE to park';
    if (this.slowdown > 0) return 'Easy does it · cargo safe · keep driving';
    const signal = this.nextSignal;
    if (signal && this.signalDistance(signal) < 22 && this.signalColor(signal) !== 'green') return `${this.signalColor(signal).toUpperCase()} LIGHT · S / ↓ brake before the line`;
    return this.speed < -0.1 ? 'REVERSING · W / ↑ to drive forward' : this.offRoad ? 'Soft verge · steer back onto a street' : 'Green arrow points to the destination · choose your streets';
  }
  public park(): boolean {
    if (this.paused || !this.canPark) return false;
    this.parked = true; this.speed = 0; this.events.push({ type: 'parked' }); return true;
  }
  public update(seconds: number, input: DriveInput): void {
    if (this.paused || this.parked || !Number.isFinite(seconds)) return;
    let left = clamp(seconds, 0, 0.25);
    while (left > 1e-6) { const dt = Math.min(left, 1 / 60); left -= dt; this.step(dt, input); }
  }
  private bump(kind: 'car' | 'cone' | 'building'): void {
    if (this.cooldown > 0 || Math.abs(this.speed) < 0.5) return;
    this.collisions++; this.penalty += DRIVING.collisionPoints; this.speed *= 0.4;
    this.slowdown = DRIVING.slowdownSeconds; this.cooldown = DRIVING.collisionCooldown;
    this.events.push({ type: 'collision', kind, points: DRIVING.collisionPoints });
  }
  private step(dt: number, input: DriveInput): void {
    this.elapsed += dt; this.cooldown = Math.max(0, this.cooldown - dt); this.slowdown = Math.max(0, this.slowdown - dt);
    const throttle = clamp(input.throttle, 0, 1), brake = clamp(input.brake, 0, 1);
    this.braking = brake > 0.1 && this.speed > 0.4;
    if (brake > 0.5 && throttle < 0.1) {
      if (this.speed > 0) this.speed = Math.max(0, this.speed - DRIVING.braking * dt);
      if (this.speed <= 0) { this.brakeHold += dt; if (this.brakeHold > 0.45) this.speed = Math.max(-DRIVING.reverseSpeed, this.speed - 5 * dt); }
    } else {
      this.brakeHold = 0;
      if (this.speed < 0) this.speed = Math.min(0, this.speed + (throttle ? 18 : 3) * dt);
      else this.speed = Math.max(0, this.speed + (throttle * DRIVING.acceleration - brake * DRIVING.braking - (throttle ? 0 : DRIVING.coast)) * dt);
    }
    const cap = this.slowdown > 0 ? 5.5 : this.offRoad ? 7.5 : DRIVING.maxSpeed;
    this.speed = clamp(this.speed, -DRIVING.reverseSpeed, cap);
    if (this.speed > 0 && this.remaining < DRIVING.parkingApproach) this.speed = Math.min(this.speed, Math.max(0.7, (this.remaining - 1.5) * 0.85));
    this.steer += (clamp(input.steer, -1, 1) - this.steer) * Math.min(1, dt * 9);
    this.heading = angleDelta(this.heading - this.steer * DRIVING.turnRate * clamp(this.speed / 7, -1, 1) * dt);
    const p = this.pose, before = { x: this.x, z: this.z };
    this.x += p.tx * this.speed * dt; this.z += p.tz * this.speed * dt;
    if (this.x < CITY.minX + 3 || this.x > CITY.maxX - 3) { this.x = clamp(this.x, CITY.minX + 3, CITY.maxX - 3); this.heading = angleDelta(Math.PI - this.heading); this.speed *= 0.6; }
    if (this.z < CITY.minZ + 3 || this.z > CITY.maxZ - 3) { this.z = clamp(this.z, CITY.minZ + 3, CITY.maxZ - 3); this.heading = -this.heading; this.speed *= 0.6; }
    const solids = [...CITY_BUILDINGS, { x: TERMINALS.ups.x, z: TERMINALS.ups.z + 29, width: 34, depth: 10 },
      { x: TERMINALS.mall.x, z: TERMINALS.mall.z - 29, width: 34, depth: 10 }];
    for (const [index, building] of solids.entries()) {
      const push = penetration({ ...this, length: 6, width: 2.4 }, { ...building, heading: 0, length: building.width, width: building.depth });
      if (!push) continue;
      if (!this.hitBuildings.has(index)) { this.bump('building'); this.hitBuildings.add(index); }
      this.x += push.x; this.z += push.z;
    }
    this.distance += separation(before, this);
    for (const signal of this.signals) {
      const inside = Math.abs(this.x - signal.x) < 7 && Math.abs(this.z - signal.z) < 7;
      if (inside && !this.enteredSignals.has(signal.id)) {
        this.enteredSignals.add(signal.id);
        if (this.speed > 0.5 && this.signalColor(signal) === 'red') {
          this.redLights++; this.penalty += DRIVING.collisionPoints; this.events.push({ type: 'red-light', points: DRIVING.collisionPoints });
        }
      } else if (separation(this, signal) > 24) this.enteredSignals.delete(signal.id);
    }
    for (const obstacle of this.obstacles) {
      if (obstacle.kind === 'car') {
        const old = trafficPose(obstacle.route, obstacle.travel, obstacle.speed < 0);
        let move = Math.abs(obstacle.speed) * dt;
        for (const signal of this.signals) {
          if (signalColor(signal, this.elapsed, Math.abs(old.tx) < Math.abs(old.tz) ? 'ns' : 'ew') === 'green') continue;
          const dx = signal.x - old.x, dz = signal.z - old.z, along = dx * old.tx + dz * old.tz;
          if (Math.abs(dx * -old.tz + dz * old.tx) < 6 && along >= 11 && along - move < 11) move = Math.max(0, along - 11);
        }
        for (const other of this.obstacles) {
          if (other === obstacle || other.kind !== 'car') continue;
          const alignment = old.tx * Math.cos(other.heading) - old.tz * Math.sin(other.heading);
          const dx = other.x - old.x, dz = other.z - old.z, ahead = dx * old.tx + dz * old.tz;
          if (alignment > 0.7 && ahead > 0 && ahead < 9 && Math.abs(dx * -old.tz + dz * old.tx) < 2.2) move = Math.min(move, Math.max(0, ahead - 7));
        }
        obstacle.travel += Math.sign(obstacle.speed) * move;
        Object.assign(obstacle, trafficPose(obstacle.route, obstacle.travel, obstacle.speed < 0));
      }
      if (obstacle.hit || this.cooldown > 0 || Math.abs(this.speed) < 0.5) continue;
      const contact = penetration({ ...this, length: 6, width: 2.4 }, { ...obstacle, length: obstacle.kind === 'car' ? 4.2 : 0.5, width: obstacle.kind === 'car' ? 1.8 : 0.5 });
      if (contact) { obstacle.hit = true; this.bump(obstacle.kind); }
    }
  }
  public drainEvents(): DriveEvent[] { return this.events.splice(0); }
}
