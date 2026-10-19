import type { ShiftModel3D } from './ShiftModel3D.ts';
import { ROUTE_INFO, parcelStreet, streetRange } from './addresses.ts';

export interface SortingGuide { title: string; detail: string; }

/** A single next step, using the same parcel and loading areas as the rules. */
export function sortingGuide(model: ShiftModel3D, touch: boolean): SortingGuide {
  const action = touch ? 'GRAB / DELIVER' : 'SPACE';
  const held = model.heldPackage;
  const parcel = held ?? model.nearestPackage();
  if (!parcel) return {
    title: '1 · FIND A PACKAGE',
    detail: `Move beside the belt · ${action} grabs the glowing parcel · ${touch ? 'SWITCH' : 'TAB'} changes worker`,
  };
  const info = ROUTE_INFO[parcel.route];
  const title = `${parcelStreet(parcel)} → ${info.name}`;
  if (!held) return { title, detail: `1 · ${action} to grab${parcel.state === 'missed' ? ' from recovery' : ''} · your partner handles the other side` };
  if (model.currentDock() === parcel.route) return { title, detail: `3 · ${action} to ${info.kind === 'truck' ? 'load this truck' : 'deliver here'}` };
  const waypoint = model.navigationTarget(model.deliveryPoint(parcel));
  const dx = waypoint.x - model.activeWorker.x, dy = waypoint.y - model.activeWorker.y;
  const direction = Math.abs(dy) > Math.abs(dx) ? dy > 0 ? '↓ Down' : '↑ Up' : dx > 0 ? '→ Right' : '← Left';
  const destination = info.kind === 'truck' ? `${info.caption} · ${streetRange(parcel.route)} · enter the open rear door`
    : info.kind === 'floor' ? `down the ${model.activeWorker.side} stairs to the floor drop` : 'shared bulk pile at the back';
  return { title, detail: `2 · ${direction} toward ${destination}` };
}
