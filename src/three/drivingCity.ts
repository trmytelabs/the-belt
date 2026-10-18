/** The 3D driving neighbourhood: connected streets, solid blocks and navigation. */
export interface CityPoint { x: number; z: number }
export interface CityPose extends CityPoint { tx: number; tz: number; heading: number }
export type CityAxis = 'ns' | 'ew';
export interface CitySignal extends CityPoint { id: string; phase: number }
export interface CityBuilding extends CityPoint { width: number; depth: number; height: number; variant: number }

export const CITY = {
  streetsX: [-60, 0, 60, 120], streetsZ: [20, -40, -100, -160, -220],
  minX: -105, maxX: 165, minZ: -275, maxZ: 75, roadHalfWidth: 7,
  groundWidth: 420, groundDepth: 600,
} as const;
export const DESTINATIONS = { ups: { x: -2.6, z: 20 }, mall: { x: 122.6, z: -220 } } as const;
export const SPAWNS = { mall: { x: 2.6, z: 20, heading: Math.PI / 2 }, ups: { x: 117.4, z: -220, heading: -Math.PI / 2 } } as const;
export const CITY_SIGNALS: CitySignal[] = [
  { id: 'depot-crossing', x: 0, z: -40, phase: 0 },
  { id: 'market-crossing', x: 60, z: -100, phase: 6 },
  { id: 'coffee-crossing', x: 0, z: -160, phase: 3 },
  { id: 'mall-crossing', x: 120, z: -160, phase: 10 },
];

export const CITY_BUILDINGS: CityBuilding[] = [];
for (let col = 0; col < CITY.streetsX.length - 1; col++) for (let row = 0; row < CITY.streetsZ.length - 1; row++) {
  const x = CITY.streetsX[col], z = CITY.streetsZ[row];
  if (col === 1 && row === 1) {
    CITY_BUILDINGS.push({ x: x + 30, z: z - 30, width: 32, depth: 32, height: 68, variant: 3 });
    continue;
  }
  if (col === 0 && row === 2) {
    for (const dx of [20, 40]) CITY_BUILDINGS.push({ x: x + dx, z: z - 30, width: 16, depth: 32, height: dx === 20 ? 26 : 34, variant: 1 });
    continue;
  }
  for (const dx of [20, 40]) for (const dz of [-20, -40]) {
    const index = col * 16 + row * 4 + (dx === 40 ? 2 : 0) + (dz === -40 ? 1 : 0);
    const variant = [4, 1, 0, 2, 1, 4, 3, 0][index % 8];
    const height = variant === 4 ? 5 + index % 3 : variant === 1 ? 18 + index % 4 * 4
      : variant === 3 ? 40 + index % 3 * 6 : variant === 2 ? 20 + index % 3 * 3 : 8 + index % 4 * 2;
    CITY_BUILDINGS.push({ x: x + dx, z: z + dz,
      width: variant === 4 ? 17 : 15, depth: 16, height, variant });
  }
}
for (const x of [-82, 142]) for (const [index, z] of [-10, -70, -130, -190].entries()) {
  const variant = index === 2 ? 1 : 4;
  CITY_BUILDINGS.push({ x, z, width: 17, depth: 18, height: variant === 1 ? 24 : 5 + index * 2, variant });
}

export const angleDelta = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
export const separation = (a: CityPoint, b: CityPoint): number => Math.hypot(a.x - b.x, a.z - b.z);
export function nearestRoad(p: CityPoint): { point: CityPoint; distance: number; axis: CityAxis } {
  const x = CITY.streetsX.reduce<number>((a, b) => Math.abs(p.x - a) < Math.abs(p.x - b) ? a : b, CITY.streetsX[0]);
  const z = CITY.streetsZ.reduce<number>((a, b) => Math.abs(p.z - a) < Math.abs(p.z - b) ? a : b, CITY.streetsZ[0]);
  return Math.abs(p.x - x) < Math.abs(p.z - z) ? { point: { x, z: p.z }, distance: Math.abs(p.x - x), axis: 'ns' }
    : { point: { x: p.x, z }, distance: Math.abs(p.z - z), axis: 'ew' };
}
export function signalColor(signal: CitySignal, elapsed: number, axis: CityAxis): 'red' | 'amber' | 'green' {
  const phase = (elapsed + signal.phase) % 12;
  if (axis === 'ns') return phase < 3 || phase >= 9 ? 'red' : phase < 8 ? 'green' : 'amber';
  return phase >= 3 && phase < 9 ? 'red' : phase >= 2 && phase < 3 ? 'amber' : 'green';
}

const nodes: CityPoint[] = CITY.streetsX.flatMap(x => CITY.streetsZ.map(z => ({ x, z })));
const adjacent = (a: CityPoint, b: CityPoint): boolean => a !== b && (a.x === b.x && Math.abs(a.z - b.z) === 60 || a.z === b.z && Math.abs(a.x - b.x) === 60);
/** A shortest street route from any road or shoulder; branching never locks the truck. */
export function cityRoute(from: CityPoint, goal: CityPoint, heading = 0): CityPoint[] {
  const target = nodes.reduce((a, b) => separation(a, goal) < separation(b, goal) ? a : b);
  const costs = new Map<CityPoint, number>([[target, 0]]), next = new Map<CityPoint, CityPoint>();
  const pending = new Set(nodes);
  while (pending.size) {
    const node = [...pending].sort((a, b) => (costs.get(a) ?? Infinity) - (costs.get(b) ?? Infinity))[0];
    pending.delete(node);
    for (const neighbour of pending) if (adjacent(node, neighbour)) {
      const cost = costs.get(node)! + separation(node, neighbour);
      if (cost >= (costs.get(neighbour) ?? Infinity)) continue;
      costs.set(neighbour, cost); next.set(neighbour, node);
    }
  }
  let road = nearestRoad(from);
  // At a junction, prefer the street the truck faces rather than the nearest
  // crossing stripe. This prevents the arrow flipping sideways on entry.
  const axis: CityAxis = Math.abs(Math.cos(heading)) < Math.abs(Math.sin(heading)) ? 'ns' : 'ew';
  const aligned = axis === 'ns' ? CITY.streetsX.reduce<number>((a, b) => Math.abs(from.x - a) < Math.abs(from.x - b) ? a : b, CITY.streetsX[0])
    : CITY.streetsZ.reduce<number>((a, b) => Math.abs(from.z - a) < Math.abs(from.z - b) ? a : b, CITY.streetsZ[0]);
  const distance = Math.abs((axis === 'ns' ? from.x : from.z) - aligned);
  if (distance < 9) road = { axis, distance, point: axis === 'ns' ? { x: aligned, z: from.z } : { x: from.x, z: aligned } };
  const projection = road.point;
  const options = nodes.filter(node => road.axis === 'ns' ? node.x === projection.x : node.z === projection.z);
  const score = (node: CityPoint): number => {
    const distance = separation(projection, node);
    const toward = distance > 4 ? node : next.get(node) ?? goal;
    const turn = Math.abs(angleDelta(Math.atan2(-(toward.z - from.z), toward.x - from.x) - heading));
    return distance + (costs.get(node) ?? Infinity) + turn * 7;
  };
  let node = options.sort((a, b) => score(a) - score(b))[0];
  const points: CityPoint[] = [{ x: from.x, z: from.z }];
  if (road.distance > 9) points.push(projection);
  if (separation(from, node) > 2) points.push(node);
  for (let guard = 0; node !== target && guard < nodes.length; guard++) {
    node = next.get(node)!; points.push(node);
  }
  points.push(goal);
  // Remove straight intermediate junctions so the arrow points to the next turn.
  return points.filter((point, i) => {
    if (!i || i === points.length - 1) return true;
    const a = points[i - 1], b = points[i + 1];
    const ax = point.x - a.x, az = point.z - a.z, bx = b.x - point.x, bz = b.z - point.z;
    return Math.abs(ax * bz - az * bx) > 0.01 || ax * bx + az * bz < 0;
  });
}

/** Rounded waypoints used by traffic and synthetic test drivers, never to move the player. */
export function roundedRoute(points: readonly CityPoint[], radius = 10): CityPoint[] {
  const out: CityPoint[] = [points[0]];
  const line = (end: CityPoint): void => {
    const start = out.at(-1)!, length = separation(start, end), steps = Math.max(1, Math.ceil(length));
    for (let i = 1; i <= steps; i++) out.push({ x: start.x + (end.x - start.x) * i / steps, z: start.z + (end.z - start.z) * i / steps });
  };
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1], before = separation(a, b), after = separation(b, c);
    if (before < 1 || after < 1) continue;
    const r = Math.min(radius, before / 3, after / 3);
    const entry = { x: b.x + (a.x - b.x) / before * r, z: b.z + (a.z - b.z) / before * r };
    const exit = { x: b.x + (c.x - b.x) / after * r, z: b.z + (c.z - b.z) / after * r };
    line(entry);
    for (let j = 1; j <= 24; j++) {
      const t = j / 24, u = 1 - t;
      out.push({ x: u * u * entry.x + 2 * t * u * b.x + t * t * exit.x, z: u * u * entry.z + 2 * t * u * b.z + t * t * exit.z });
    }
  }
  line(points.at(-1)!); return out;
}

export const TRAFFIC_ROUTES: readonly CityPoint[][] = [
  [{ x: -60, z: 20 }, { x: -60, z: -220 }, { x: 120, z: -220 }, { x: 120, z: 20 }],
  [{ x: 0, z: 20 }, { x: 0, z: -160 }, { x: 60, z: -160 }, { x: 60, z: 20 }],
  [{ x: -60, z: -40 }, { x: 120, z: -40 }, { x: 120, z: -100 }, { x: -60, z: -100 }],
];
export function trafficPose(route: number, travel: number, reverse = false): CityPose {
  const points = TRAFFIC_ROUTES[route], lengths = points.map((p, i) => separation(p, points[(i + 1) % points.length]));
  const total = lengths.reduce((a, b) => a + b, 0), sign = reverse ? -1 : 1;
  let distance = (travel % total + total) % total, index = 0;
  while (distance > lengths[index] && index < points.length - 1) distance -= lengths[index++];
  const a = points[index], b = points[(index + 1) % points.length], t = distance / lengths[index];
  const tx = (b.x - a.x) / lengths[index] * sign, tz = (b.z - a.z) / lengths[index] * sign;
  return { x: a.x + (b.x - a.x) * t - tz * 2.7, z: a.z + (b.z - a.z) * t + tx * 2.7, tx, tz, heading: Math.atan2(-tz, tx) };
}
