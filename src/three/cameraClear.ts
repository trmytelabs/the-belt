import * as THREE from 'three';

/**
 * Keeps a chase camera out of the scenery (the 3D depot's drives). The camera
 * follows the vehicle on a lag, so a hard turn at a corner used to sweep it
 * into a building, and a pass along the kerb through a lamp post: a frame or
 * more of the inside of a mesh, which reads as the screen flashing black.
 * `pullClear` slides the camera along its line of sight toward the vehicle
 * until that line meets none of the blockers, axis-aligned boxes padded by
 * the caller.
 */

const direction = new THREE.Vector3();
const point = new THREE.Vector3();
const arc = new THREE.Vector3();
/** How far up the crane goes when hemmed in: about 45 degrees, so the view still takes in the road and lights ahead. */
const CRANE_TOP = 0.8;
const CRANE_STEPS = 8;

/**
 * Pulls `camera` toward `anchor` (a point on the vehicle) until the segment
 * between them stays `margin` clear of every box, but no nearer the anchor
 * than `minDistance`; returns true when it moved. A camera already inside a
 * box comes out to that box's near side. Hemmed in (a building hard by the
 * vehicle in a tight turn, so even `minDistance` is inside it), the camera
 * rises over the vehicle at that distance instead, or swings round it to the
 * open side; if neither is clear it holds `minDistance`, stepping aside out of
 * a thin blocker such as a lamp post, and inside a box's padding at worst. It
 * never drops nearer: on the roof, the truck fills the view and the frame
 * reads as black.
 */
export function pullClear(anchor: THREE.Vector3, camera: THREE.Vector3, boxes: readonly THREE.Box3[], margin = 0.4, minDistance = 0.5): boolean {
  direction.subVectors(camera, anchor);
  const length = direction.length();
  if (length < 1e-6) return false;
  direction.divideScalar(length);
  let nearest = Infinity;
  for (const box of boxes) {
    const hit = entry(anchor, direction, length, box);
    if (hit !== null && hit < nearest) nearest = hit;
  }
  if (nearest === Infinity) return false;
  const clear = Math.max(0, nearest - margin);
  const distance = Math.max(minDistance, clear);
  if (distance > clear && boxes.some((box) => box.containsPoint(point.copy(anchor).addScaledVector(direction, distance)))) {
    // Held at minDistance the camera would be inside the box: crane up over the vehicle, or swing round it to the open
    // side (scraping along a wall, or a lamp post just behind in a hard turn, too tall to crane over: either held the
    // camera inside), or failing both hold the minimum, stepping across the line of sight out of a thin blocker there.
    if (craneUp(anchor, boxes, margin, minDistance, camera) || swingRound(anchor, boxes, margin, minDistance, camera)) return true;
    const held = distance < length;
    if (held) camera.copy(point.copy(anchor).addScaledVector(direction, distance));
    return sidestep(anchor, camera, boxes, minDistance) || held;
  }
  if (distance >= length) return false;
  camera.copy(point.copy(anchor).addScaledVector(direction, distance));
  return true;
}

/**
 * Puts `camera` at the first point, `distance` from `anchor`, on an arc from
 * the current line of sight (`direction`) up to nearly overhead whose line
 * to the anchor stays `margin` clear of every box; false when none does.
 */
function craneUp(anchor: THREE.Vector3, boxes: readonly THREE.Box3[], margin: number, distance: number, camera: THREE.Vector3): boolean {
  const flat = Math.hypot(direction.x, direction.z);
  const from = Math.atan2(direction.y, flat);
  if (flat < 1e-6 || from >= CRANE_TOP) return false;
  for (let step = 1; step <= CRANE_STEPS; step += 1) {
    const angle = from + (CRANE_TOP - from) * step / CRANE_STEPS;
    arc.set(direction.x / flat * Math.cos(angle), Math.sin(angle), direction.z / flat * Math.cos(angle));
    if (boxes.some((box) => entry(anchor, arc, distance + margin, box) !== null)) continue;
    camera.copy(anchor).addScaledVector(arc, distance);
    return true;
  }
  return false;
}

/** How far round the vehicle a hemmed-in camera may swing each way (a quarter turn, so it stays behind), and in how many steps. */
const SWING_TOP = Math.PI / 2;
const SWING_STEPS = 6;

/**
 * Puts `camera` at `distance` from `anchor` on its line of sight swung round the vehicle, a step each way at a time up
 * to `SWING_TOP`, at the first place whose line to the anchor stays `margin` clear of every box; false when none does.
 */
function swingRound(anchor: THREE.Vector3, boxes: readonly THREE.Box3[], margin: number, distance: number, camera: THREE.Vector3): boolean {
  if (Math.hypot(direction.x, direction.z) < 1e-6) return false;
  for (let step = 1; step <= SWING_STEPS; step += 1) {
    for (const sign of [1, -1]) {
      const angle = sign * SWING_TOP * step / SWING_STEPS, c = Math.cos(angle), s = Math.sin(angle);
      arc.set(direction.x * c - direction.z * s, direction.y, direction.x * s + direction.z * c);
      if (boxes.some((box) => entry(anchor, arc, distance + margin, box) !== null)) continue;
      camera.copy(anchor).addScaledVector(arc, distance);
      return true;
    }
  }
  return false;
}

/** The farthest a held camera steps aside: enough to leave a padded lamp post or signal, never to cross a building. */
const SIDESTEP = 1.5;

/**
 * Moves a held `camera` out of the box it sits in through a side face, across its line of sight to `anchor` (never
 * behind the blocker, which would then stand between the camera and the vehicle), no nearer the anchor than
 * `minDistance` and at most `SIDESTEP`; true when it moved.
 */
function sidestep(anchor: THREE.Vector3, camera: THREE.Vector3, boxes: readonly THREE.Box3[], minDistance: number): boolean {
  const flat = Math.hypot(direction.x, direction.z);
  let moved = false;
  for (let pass = 0; pass < 3; pass += 1) {
    const box = boxes.find((item) => item.containsPoint(camera));
    if (!box) return moved;
    let best: { axis: 'x' | 'z'; to: number; by: number } | null = null;
    for (const [axis, to] of [['x', box.min.x - 0.01], ['x', box.max.x + 0.01], ['z', box.min.z - 0.01], ['z', box.max.z + 0.01]] as const) {
      const by = Math.abs(to - camera[axis]);
      // Across the line of sight: the step makes more than 45 degrees with it, seen from above.
      const along = flat < 1e-6 ? 0 : Math.abs(direction[axis]) / flat;
      if (by > SIDESTEP || along > Math.SQRT1_2 + 1e-9 || (best && by >= best.by)) continue;
      point.copy(camera)[axis] = to;
      if (point.distanceTo(anchor) < minDistance - 1e-9) continue;
      best = { axis, to, by };
    }
    if (!best) return moved;
    camera[best.axis] = best.to;
    moved = true;
  }
  return moved;
}

/** Where a ray from `origin` along `direction` first enters `box` within `length`, or null; an origin inside the box enters at 0. */
function entry(origin: THREE.Vector3, direction: THREE.Vector3, length: number, box: THREE.Box3): number | null {
  let near = 0;
  let far = length;
  for (const axis of ['x', 'y', 'z'] as const) {
    const d = direction[axis];
    const o = origin[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < box.min[axis] || o > box.max[axis]) return null;
      continue;
    }
    let t0 = (box.min[axis] - o) / d;
    let t1 = (box.max[axis] - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    if (near > far) return null;
  }
  return near;
}

/** A padded box around an axis-aligned footprint centred at (x, z) on the ground. */
export function blocker(x: number, z: number, width: number, depth: number, height: number, pad: number): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(x - width / 2 - pad, -1, z - depth / 2 - pad),
    new THREE.Vector3(x + width / 2 + pad, height + pad, z + depth / 2 + pad),
  );
}
