import type { PropId } from './propModels';

/** One piece of set dressing: its model, centre in model pixels and turn about the vertical (radians). */
export interface DressingItem {
  id: PropId;
  x: number;
  y: number;
  turn: number;
}

/**
 * Cartons the depot shows as the photographed `cardboard-box` model on GPU
 * renderers: twelve on the bulk pallet, five on Ralph's flatbed and twelve in
 * the receiving trailers (the code-built cartons stay underneath as stand-ins).
 */
export const DEPOT_CARTON_MODELS = 12 + 5 + 12;

/**
 * Set dressing that exists only as Poly Haven models, so software renderers
 * show none of it. Everything stands against the receiving wall in the two
 * front corners beside the raised platform, which no crew route, visitor or
 * truck crosses (tests/prop-models.mjs checks the clearances).
 */
export const DEPOT_DRESSING: readonly DressingItem[] = [
  // West corner: a parts cart, a tool chest and a leaking barrel with its warning sign.
  { id: 'storage-cart', x: 62, y: -220, turn: 0 },
  { id: 'tool-chest', x: 122, y: -230, turn: 0.08 },
  { id: 'barrel', x: 162, y: -228, turn: 0 },
  { id: 'barrel', x: 180, y: -210, turn: Math.PI / 2 },
  { id: 'barrel', x: 198, y: -228, turn: Math.PI },
  { id: 'wet-floor-sign', x: 190, y: -192, turn: 0.4 },
  { id: 'metal-rack', x: 244, y: -228, turn: 0 },
  { id: 'fire-extinguisher', x: 298, y: -232, turn: 0 },
  // East corner: an extinguisher by the stairs, a rack, a parked hand truck, a bin and spare barrels.
  { id: 'fire-extinguisher', x: 662, y: -232, turn: 0 },
  { id: 'metal-rack', x: 712, y: -228, turn: 0 },
  { id: 'hand-truck', x: 760, y: -226, turn: -0.25 },
  { id: 'trash-can', x: 822, y: -229, turn: 0 },
  { id: 'barrel', x: 884, y: -228, turn: Math.PI / 2 },
  { id: 'barrel', x: 902, y: -210, turn: Math.PI },
];
