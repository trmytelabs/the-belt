import { platformWalkPath, type WalkPoint } from './walking.ts';

export type PatrolId = 'john' | 'shan' | 'vic';
interface Patrol { target: number; path: WalkPoint[]; untilSquat: number; squatLeft: number; squatTime: number }
const ROUTES: Record<PatrolId, readonly WalkPoint[]> = {
  john: [{ x: 390, y: 1000 }, { x: 390, y: 80 }, { x: 570, y: 80 },
    { x: 570, y: 1000 }, { x: 570, y: 80 }, { x: 390, y: 80 }],
  shan: [{ x: 595, y: 1000 }, { x: 581, y: 240 }, { x: 607, y: 1000 }, { x: 581, y: 240 }],
  vic: [{ x: 376, y: 1000 }, { x: 392, y: 220 }, { x: 364, y: 1000 }, { x: 392, y: 220 }],
};
const SPEED: Record<PatrolId, number> = { john: 84, shan: 56, vic: 64 };

/** Shift-time patrols: crossings go around the belt head; a paused shift never advances them. */
export class CrewPatrols {
  private readonly walkers = new Map<PatrolId, Patrol>();
  private readonly random: () => number;
  constructor(random: () => number = Math.random) { this.random = random; }
  public reset(): void { this.walkers.clear(); }

  public step(id: PatrolId, from: WalkPoint, delta: number): WalkPoint & { squatting: boolean; squatTime: number } {
    let patrol = this.walkers.get(id);
    if (!patrol) {
      patrol = { target: 0, path: [], untilSquat: 4 + this.random() * 5, squatLeft: 0, squatTime: 0 };
      this.walkers.set(id, patrol);
    }
    const dt = Math.max(0, Math.min(0.1, delta));
    if (id === 'john') {
      if (patrol.squatLeft > 0) {
        patrol.squatTime += Math.min(dt, patrol.squatLeft);
        patrol.squatLeft = Math.max(0, patrol.squatLeft - dt);
        return { ...from, squatting: patrol.squatLeft > 0, squatTime: patrol.squatTime };
      }
      patrol.untilSquat -= dt;
      if (patrol.untilSquat <= 0) {
        patrol.squatLeft = (2 + Math.floor(this.random() * 2)) * 1.2;
        patrol.squatTime = 0; patrol.untilSquat = 6 + this.random() * 7;
        return { ...from, squatting: true, squatTime: 0 };
      }
    }
    const point = { ...from };
    let distance = SPEED[id] * dt;
    while (distance > 0) {
      if (!patrol.path.length) {
        patrol.path = platformWalkPath(point, ROUTES[id][patrol.target]).slice(1);
        patrol.target = (patrol.target + 1) % ROUTES[id].length;
      }
      const next = patrol.path[0], length = Math.hypot(next.x - point.x, next.y - point.y);
      if (length <= distance) { Object.assign(point, next); patrol.path.shift(); distance -= length; }
      else { point.x += (next.x - point.x) * distance / length; point.y += (next.y - point.y) * distance / length; distance = 0; }
    }
    return { ...point, squatting: false, squatTime: 0 };
  }
}
