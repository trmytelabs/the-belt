export const DEPOT_3D_LAYOUT = {
  worldTop: -240,
  receivingTop: -240,
  worldBottom: 880,
  beltX: 480,
  beltTop: 146,
  beltBottom: 550,
  grabRadius: 102,
  parcelGap: 68,
  dockA: { x: 294, y: 532 },
  dockB: { x: 666, y: 532 },
  dockD: { x: 294, y: 628 },
  dockE: { x: 666, y: 628 },
  floorT: { x: 200, y: 830 },
  floorS: { x: 760, y: 830 },
  bulkPile: { x: 480, y: 832 },
  bulkLeft: { x: 400, y: 830 },
  bulkRight: { x: 560, y: 830 },
  recoveryPile: { x: 480, y: 610 },
  bulkRearWall: { x: 480, y: 877, width: 960, height: 6 },
  ralphBay: { x: 244, y: 740, from: -120 },
  fishTank: { x: 716, y: 740, width: 52, height: 36 },
  /** Delivery interaction areas; floor numbers are clues without safe-zone outlines. */
  dropAreas: {
    A: { x: 264, y: 532, width: 80, height: 36 },
    B: { x: 696, y: 532, width: 80, height: 36 },
    D: { x: 264, y: 628, width: 80, height: 36 },
    E: { x: 696, y: 628, width: 80, height: 36 },
    T: { x: 200, y: 830, width: 52, height: 88 },
    S: { x: 760, y: 830, width: 52, height: 88 },
    bulkLeft: { x: 400, y: 812, width: 80, height: 40 },
    bulkRight: { x: 560, y: 812, width: 80, height: 40 },
  },
  workerMinY: -20,
  workerMaxY: 846,
  leftLane: { minX: 330, maxX: 400 },
  rightLane: { minX: 560, maxX: 630 },
  /** The raised loading platform: the full central spine, receiving included. */
  platform: { left: 318, right: 642, top: -240, bottom: 880 },
  /** Physical side flights: height falls from topX toward bottomX, never along y. */
  stairs: { top: 780, bottom: 872, minY: 780, maxY: 872, centerY: 830, steps: 7,
    left: { topX: 318, bottomX: 226 }, right: { topX: 642, bottomX: 734 } },
  /** Physical lower-floor bounds, all in front of the rear wall. Body centres inset their radius. */
  lowerFloor: { top: 780, bottom: 874, left: { minX: 90, maxX: 226 }, right: { minX: 734, maxX: 870 } },
  /** Keep the storage band separate from the stairs, landing and delivery approach. */
  floorStorage: {
    T: { x: 134, y: 828, width: 48, height: 88 },
    S: { x: 826, y: 828, width: 48, height: 88 },
  },
  workerRadius: 12,
  /** Largest carried form at any rotation, for storage and rear-wall clearance. */
  carriedClearance: 42,
  parcelRadius: 24,
  truckDepth: 72,
  playerTruckDepth: 92,
  /** Player cargo bays include two shelf banks and a clear centre aisle. */
  playerTrucks: {
    A: { x: 244, y: 532 }, B: { x: 716, y: 532 }, D: { x: 244, y: 628 }, E: { x: 716, y: 628 },
  },
} as const;

/** Height of the walking surface as a fraction of the platform height: 1 on the platform, 0 below. */
export function platformLevelAt(x: number, y: number): number {
  const { platform, stairs } = DEPOT_3D_LAYOUT;
  if (x >= platform.left && x <= platform.right && y >= platform.top && y <= platform.bottom) return 1;
  if (truckInteriorAt({ x, y })) return 1;
  const side = stairAt(x, y);
  if (side) {
    const flight = stairs[side];
    const tread = Math.floor(Math.abs(x - flight.topX) / Math.abs(flight.bottomX - flight.topX) * stairs.steps) + 1;
    return 1 - tread / stairs.steps;
  }
  return 0;
}

export type TruckRoute = 'A' | 'B' | 'D' | 'E';
export const TRUCK_ROUTES: readonly TruckRoute[] = ['A', 'B', 'D', 'E'];

/** Physical cargo floors, with a clear loading aisle at each open rear door. */
export function truckInteriorAt(point: { x: number; y: number }): TruckRoute | null {
  return TRUCK_ROUTES.find(route => {
    const truck = DEPOT_3D_LAYOUT.playerTrucks[route];
    return Math.abs(point.y - truck.y) <= DEPOT_3D_LAYOUT.playerTruckDepth / 2 - 3
      && (truck.x < 480 ? point.x >= 212 && point.x < 318 : point.x > 642 && point.x <= 748);
  }) ?? null;
}

/** The open stair run, excluding its flat deck and ground endpoints. */
export function stairAt(x: number, y: number): 'left' | 'right' | null {
  const stairs = DEPOT_3D_LAYOUT.stairs;
  if (y < stairs.minY || y > stairs.maxY) return null;
  if (x > stairs.left.bottomX && x < stairs.left.topX) return 'left';
  if (x > stairs.right.topX && x < stairs.right.bottomX) return 'right';
  return null;
}

/** Outer storage band: a 2 × 4 grid, leaving the route's central walking aisle clear. */
export function floorPileSlot(route: 'T' | 'S', index: number): { x: number; y: number; layer: number } {
  const storage = DEPOT_3D_LAYOUT.floorStorage[route];
  const column = index % 2;
  const row = Math.floor(index / 2) % 4;
  const layer = Math.floor(index / 8);
  return { x: storage.x - 12 + column * 24, y: storage.y - 33 + row * 22, layer };
}

/** Ground beyond either side flight, not the central deck at the same y. */
export function onLowerFloor(point: { x: number; y: number }): boolean {
  const floor = DEPOT_3D_LAYOUT.lowerFloor;
  return point.y >= floor.top && point.y <= floor.bottom
    && ((point.x >= floor.left.minX && point.x <= floor.left.maxX)
      || (point.x >= floor.right.minX && point.x <= floor.right.maxX));
}
