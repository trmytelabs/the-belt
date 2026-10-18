export interface WalkPoint { x: number; y: number }

/** Cross to the other platform lane around the receiving end of the belt. */
export function platformWalkPath(from: WalkPoint, to: WalkPoint): WalkPoint[] {
  const crossesBelt = (from.x < 448 && to.x > 512) || (from.x > 512 && to.x < 448);
  return crossesBelt ? [from, { x: from.x < 480 ? 400 : 560, y: 128 },
    { x: to.x < 480 ? 400 : 560, y: 128 }, to] : [from, to];
}

export function pathLength(points: readonly WalkPoint[]): number {
  return points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
}

/** Distance-based walking preserves speed through corners and on slow frames. */
export function walkPath(points: readonly WalkPoint[], distance: number): WalkPoint & { heading: number; done: boolean } {
  let remaining = Math.max(0, distance);
  let heading = 0;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1], to = points[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    heading = Math.atan2(to.x - from.x, to.y - from.y);
    if (length > remaining) {
      const progress = remaining / length;
      return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress, heading, done: false };
    }
    remaining -= length;
  }
  return { ...points[points.length - 1], heading, done: true };
}
