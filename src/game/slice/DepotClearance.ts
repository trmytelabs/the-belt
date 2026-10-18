import { SHIFT_LAYOUT, type DepotLayout } from './ShiftModel.ts';

export type FootprintPoint = { x: number; y: number };
export type FootprintCircle = FootprintPoint & { radius: number };
export type FootprintRect = FootprintPoint & { width: number; height: number };
type StandingBounds = { minX: number; maxX: number; minY: number; maxY: number };

/** Physical footprints in model pixels; shadows, text and hands are not solids. */
export const DEPOT_BODY_RADIUS = 12;
export const DEPOT_CARRY_RADIUS = 12;
const GAP = 0;

function supportedBounds(point: FootprintPoint, radius: number, layout: DepotLayout): StandingBounds {
  const { platform, stairs, lowerFloor } = layout;
  const bounds = { minX: -180, maxX: 1140, minY: layout.worldTop + radius, maxY: layout.bulkRearWall.y - layout.bulkRearWall.height / 2 - radius };
  // Coworker approach stairs legitimately cross the long platform edges. Once
  // a pose is on the central deck, yielding cannot push it off the raised edge.
  if (point.x >= platform.left && point.x <= platform.right) {
    return { ...bounds, minX: platform.left + radius, maxX: platform.right - radius };
  }
  const stairSide = point.y >= stairs.minY && point.y <= stairs.maxY
    ? point.x > stairs.left.bottomX && point.x < stairs.left.topX ? 'left'
      : point.x > stairs.right.topX && point.x < stairs.right.bottomX ? 'right' : null : null;
  if (stairSide) {
    const flight = stairs[stairSide];
    return { ...bounds, minX: Math.min(flight.topX, flight.bottomX), maxX: Math.max(flight.topX, flight.bottomX),
      minY: stairs.minY + radius, maxY: stairs.maxY - radius };
  }
  if (point.y >= lowerFloor.top && point.y <= lowerFloor.bottom
    && ((point.x >= lowerFloor.left.minX && point.x <= lowerFloor.left.maxX) || (point.x >= lowerFloor.right.minX && point.x <= lowerFloor.right.maxX))) {
    const floor = point.x < layout.beltX ? lowerFloor.left : lowerFloor.right;
    return { ...bounds, minX: floor.minX + radius, maxX: floor.maxX - radius, minY: lowerFloor.top + radius };
  }
  return bounds;
}

export function overlapsFootprint(point: FootprintPoint, radius: number, rect: FootprintRect): boolean {
  const dx = Math.max(0, Math.abs(point.x - rect.x) - rect.width / 2);
  const dy = Math.max(0, Math.abs(point.y - rect.y) - rect.height / 2);
  return dx * dx + dy * dy < radius * radius - 1e-6;
}

/** The stationary truck bodies and central equipment shared by both depots. */
export function depotSolidFootprints(layout: DepotLayout = SHIFT_LAYOUT, crewRows: readonly number[] = [148, 244, 340, 436], playerTruckDepth = layout.truckDepth): FootprintRect[] {
  return [
    ...crewRows.flatMap(y => [244, 716].map(x => ({ x, y, width: 148, height: layout.truckDepth }))),
    ...Object.values(layout.playerTrucks).map(truck => ({ ...truck, width: 148, height: playerTruckDepth })),
    { x: layout.beltX, y: (layout.beltTop + layout.beltBottom) / 2, width: 104, height: layout.beltBottom - layout.beltTop },
    { ...layout.bulkPile, width: 116, height: 96 }, { ...layout.recoveryPile, width: 118, height: 52 }, layout.bulkRearWall,
    layout.floorStorage.T, layout.floorStorage.S, layout.fishTank,
  ];
}

/**
 * Keep an authored standing pose clear of solid scenery and earlier actors.
 * Find the nearest free boundary point, preserving the requested point whenever
 * it is already clear. Call in a stable actor order, with players reserved first.
 * This also handles a player walking into a stationary coworker's space.
 */
export function clearDepotFootprint(
  intended: FootprintPoint,
  radius: number,
  occupied: readonly FootprintCircle[],
  solids: readonly FootprintRect[],
  layout: DepotLayout = SHIFT_LAYOUT,
): FootprintPoint {
  const bounds = supportedBounds(intended, radius, layout);
  const constrain = (point: FootprintPoint): FootprintPoint => ({
    x: Math.max(bounds.minX, Math.min(bounds.maxX, point.x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, point.y)),
  });
  const queue: FootprintPoint[] = [constrain(intended)];
  const seen = new Set<string>();
  const distance = (point: FootprintPoint) => (point.x - intended.x) ** 2 + (point.y - intended.y) ** 2;
  for (let iteration = 0; queue.length > 0 && iteration < 256; iteration += 1) {
    queue.sort((a, b) => distance(a) - distance(b));
    const point = constrain(queue.shift()!);
    const key = `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const solid = solids.find(rect => overlapsFootprint(point, radius, rect));
    if (solid) {
      const minX = solid.x - solid.width / 2 - radius - GAP;
      const maxX = solid.x + solid.width / 2 + radius + GAP;
      const minY = solid.y - solid.height / 2 - radius - GAP;
      const maxY = solid.y + solid.height / 2 + radius + GAP;
      queue.push({ x: minX, y: point.y }, { x: maxX, y: point.y }, { x: point.x, y: minY }, { x: point.x, y: maxY });
      continue;
    }
    const actor = occupied.find(other => Math.hypot(point.x - other.x, point.y - other.y) < radius + other.radius - 1e-6);
    if (!actor) return point;
    const separation = radius + actor.radius + GAP;
    const angle = Math.atan2(point.y - actor.y, point.x - actor.x);
    for (const offset of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      queue.push({ x: actor.x + Math.cos(angle + offset) * separation, y: actor.y + Math.sin(angle + offset) * separation });
    }
  }
  // A depot floor always has open space, including when synthetic fixtures put
  // every actor at the same point. Expand a deterministic fallback search.
  for (let ring = 1; ring <= 80; ring += 1) {
    for (let index = 0; index < 32; index += 1) {
      const angle = index * Math.PI / 16;
      const point = constrain({ x: intended.x + Math.cos(angle) * ring * 8, y: intended.y + Math.sin(angle) * ring * 8 });
      if (!solids.some(rect => overlapsFootprint(point, radius, rect))
        && !occupied.some(other => Math.hypot(point.x - other.x, point.y - other.y) < radius + other.radius - 1e-6)) return point;
    }
  }
  throw new Error('No clear depot standing position');
}
