/** 3D receiving dimensions shared by the art, walking and collisions. */
export const RECEIVING_CROSSING_Y = 84;
export const BELT_SOLID_WIDTH = 74.6;
export const RECEIVING_FEEDERS = [
  { from: { x: 372, y: -150 }, to: { x: 480, y: 40 } },
  { from: { x: 588, y: -150 }, to: { x: 480, y: 40 } },
] as const;
type Point = { x: number; y: number };
interface Shape extends Point { width: number; height: number; angle: number }
export const HEAD_DRIVE = { x: 480, y: 128.4, width: 83.2, height: 28.8 };
const shapes: Shape[] = [
  ...RECEIVING_FEEDERS.map(({ from, to }) => ({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2,
    width: 0.92 * 32, height: Math.hypot(to.x - from.x, to.y - from.y), angle: Math.atan2(to.x - from.x, to.y - from.y) })),
  { ...HEAD_DRIVE, angle: 0 },
];
function local(point: Point, shape: Shape): Point {
  const x = point.x - shape.x, y = point.y - shape.y, c = Math.cos(shape.angle), s = Math.sin(shape.angle);
  return { x: x * c - y * s, y: x * s + y * c };
}
function world(point: Point, shape: Shape): Point {
  const c = Math.cos(shape.angle), s = Math.sin(shape.angle);
  return { x: shape.x + point.x * c + point.y * s, y: shape.y - point.x * s + point.y * c };
}
function overlaps(point: Point, radius: number, shape: Shape): boolean {
  const p = local(point, shape);
  return Math.hypot(Math.max(0, Math.abs(p.x) - shape.width / 2), Math.max(0, Math.abs(p.y) - shape.height / 2)) < radius - 1e-6;
}
export function receivingBlocked(point: Point, radius: number): boolean { return shapes.some(shape => overlaps(point, radius, shape)); }
/** Yield to a real rotated edge, avoiding invisible broad bounding-box corners. */
export function clearReceiving(point: Point, radius: number): Point {
  const queue: Point[] = [point], seen = new Set<string>();
  for (let i = 0; queue.length && i < 80; i++) {
    queue.sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y));
    const candidate = queue.shift()!, key = `${candidate.x.toFixed(2)},${candidate.y.toFixed(2)}`;
    if (seen.has(key)) continue; seen.add(key);
    const shape = shapes.find(shape => overlaps(candidate, radius, shape));
    if (!shape) return candidate;
    const p = local(candidate, shape), w = shape.width / 2 + radius + 0.01, h = shape.height / 2 + radius + 0.01;
    queue.push(...[{ x: -w, y: p.y }, { x: w, y: p.y }, { x: p.x, y: -h }, { x: p.x, y: h }].map(p => world(p, shape)));
  }
  // At the shared feeder tip, alternating two rotated edges can revisit the
  // same boundaries. Search the nearest open ring instead of leaving overlap.
  for (let ring = 1; ring <= 128; ring++) for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI / 16;
    const candidate = { x: point.x + Math.cos(angle) * ring * 2, y: point.y + Math.sin(angle) * ring * 2 };
    if (!receivingBlocked(candidate, radius)) return candidate;
  }
  throw new Error('No clear receiving floor');
}
