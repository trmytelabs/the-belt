import type { Parcel, ParcelKind, Route, WorkerId } from '../game/slice/ShiftModel.ts';

/** 3D-only district addresses and varied freight. Legacy routing stays in its own model. */
export interface RouteInfo {
  route: Route;
  name: string;
  owner: WorkerId | 'shared';
  side: 'left' | 'right' | 'both';
  kind: 'truck' | 'bulk' | 'floor';
  /** Short destination text for parcel tags and hints. */
  caption: string;
  color: string;
  streets: readonly [number, number] | null;
}

// Internal IDs remain stable; players see city district names and street ranges.
export const ROUTE_INFO: Record<Route, RouteInfo> = {
  A: { route: 'A', name: 'MILL WOODS', owner: 'termite', side: 'left', kind: 'truck', caption: "TERMITE'S TRUCK 1", color: '#d9ccab', streets: [10, 49] },
  B: { route: 'B', name: 'BONNIE DOON', owner: 'skanky', side: 'right', kind: 'truck', caption: "SKANKY'S TRUCK 1", color: '#d9ccab', streets: [50, 89] },
  C: { route: 'C', name: 'BULK', owner: 'shared', side: 'both', kind: 'bulk', caption: 'SHARED PILE AT THE BELT END', color: '#d9ccab', streets: null },
  D: { route: 'D', name: 'DOWNTOWN', owner: 'termite', side: 'left', kind: 'truck', caption: "TERMITE'S TRUCK 2", color: '#d9ccab', streets: [90, 109] },
  E: { route: 'E', name: 'WEST END', owner: 'skanky', side: 'right', kind: 'truck', caption: "SKANKY'S TRUCK 2", color: '#d9ccab', streets: [130, 169] },
  T: { route: 'T', name: 'WESTMOUNT', owner: 'termite', side: 'left', kind: 'floor', caption: 'LOWER FLOOR · DOWN THE STAIRS', color: '#d9ccab', streets: [110, 129] },
  S: { route: 'S', name: 'NORTHSIDE', owner: 'skanky', side: 'right', kind: 'floor', caption: 'LOWER FLOOR · DOWN THE STAIRS', color: '#d9ccab', streets: [170, 199] },
};
export const ROUTES: readonly Route[] = ['A', 'D', 'T', 'B', 'E', 'S', 'C'];
export const WORKER_ROUTES: Record<WorkerId, readonly Route[]> = { termite: ['A', 'D', 'T'], skanky: ['B', 'E', 'S'] };

export function streetRange(route: Route): string {
  const range = ROUTE_INFO[route].streets;
  return range ? `${range[0]}–${range[1]} ST` : 'OVERSIZE';
}

export function routeForStreet(street: number): Route | null {
  return ROUTES.find((route) => {
    const range = ROUTE_INFO[route].streets;
    return range && Number.isInteger(street) && street >= range[0] && street <= range[1];
  }) ?? null;
}

export function parcelAddress(parcel: Pick<Parcel, 'id' | 'route' | 'address' | 'street'>): string {
  if (parcel.address) return parcel.address;
  const range = ROUTE_INFO[parcel.route].streets;
  return range ? `${1000 + Math.abs(parcel.id * 137) % 9000} ${parcel.street ?? range[0] + Math.abs(parcel.id * 17) % (range[1] - range[0] + 1)} ST` : 'OVERSIZE · BULK';
}

export const PARCEL_LABELS: Record<ParcelKind, string> = {
  envelope: 'ENVELOPE',
  smallbox: 'SMALL BOX',
  standard: 'PARCEL',
  bigbox: 'BIG BOX',
  longbox: 'LONG BOX',
  mallwood: 'MALLWOOD RD EAST',
  goji: 'GOJI BERRIES',
  lobsters: 'LIVE LOBSTERS',
  duck: 'LE DUCK',
  makeup: 'MAKEUP LOTION',
  mesa: 'MESA BOOGIE',
  panchetters: 'PANCHETTERS',
  atv: 'SMALL ATV',
  snakes: 'THE SNAKES CELL',
};
// The opening six still teach A, B and C. Each worker's second truck (D, E) and
// lower-floor drop (T, S) follow; heavy freight never goes downstairs.
export const PARCEL_SEQUENCE: readonly { route: Route; kind: ParcelKind }[] = [
  { route: 'A', kind: 'mallwood' },
  { route: 'B', kind: 'goji' },
  { route: 'C', kind: 'lobsters' },
  { route: 'A', kind: 'duck' },
  { route: 'B', kind: 'makeup' },
  { route: 'C', kind: 'mesa' },
  { route: 'D', kind: 'envelope' },
  { route: 'E', kind: 'standard' },
  { route: 'C', kind: 'atv' },
  { route: 'T', kind: 'smallbox' },
  { route: 'S', kind: 'panchetters' },
  { route: 'A', kind: 'mallwood' },
  { route: 'B', kind: 'goji' },
  { route: 'D', kind: 'panchetters' },
  { route: 'C', kind: 'lobsters' },
  { route: 'E', kind: 'makeup' },
  { route: 'T', kind: 'duck' },
  { route: 'C', kind: 'mesa' },
  { route: 'S', kind: 'standard' },
  { route: 'A', kind: 'envelope' },
  { route: 'B', kind: 'longbox' },
  { route: 'D', kind: 'bigbox' },
  { route: 'C', kind: 'atv' },
  { route: 'E', kind: 'smallbox' },
  { route: 'T', kind: 'goji' },
  { route: 'S', kind: 'makeup' },
  { route: 'A', kind: 'panchetters' },
  { route: 'B', kind: 'standard' },
  { route: 'C', kind: 'lobsters' },
  { route: 'D', kind: 'duck' },
  { route: 'E', kind: 'envelope' },
  { route: 'T', kind: 'standard' },
  { route: 'S', kind: 'smallbox' },
  { route: 'A', kind: 'smallbox' },
  { route: 'B', kind: 'panchetters' },
  { route: 'C', kind: 'mesa' },
];

export const EVERYDAY_FREIGHT: readonly { kind: ParcelKind; label: string }[] = [
  { kind: 'envelope', label: 'DOCUMENTS' }, { kind: 'envelope', label: 'PHOTO PRINTS' },
  { kind: 'smallbox', label: 'BOOKS' }, { kind: 'smallbox', label: 'PHONE ACCESSORIES' },
  { kind: 'smallbox', label: 'COFFEE BEANS' }, { kind: 'smallbox', label: 'SPARE PARTS' },
  { kind: 'standard', label: 'SHOES' }, { kind: 'standard', label: 'CLOTHING' },
  { kind: 'standard', label: 'OFFICE SUPPLIES' }, { kind: 'standard', label: 'KITCHENWARE' },
  { kind: 'standard', label: 'TOYS' }, { kind: 'standard', label: 'BED LINENS' },
  { kind: 'bigbox', label: 'SMALL APPLIANCE' }, { kind: 'bigbox', label: 'CAMPING GEAR' },
  { kind: 'longbox', label: 'CURTAIN RODS' }, { kind: 'longbox', label: 'SPORTS EQUIPMENT' },
];

export const MESA_CATCH_PENALTY = 500;
