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

/**
 * Pulls `camera` toward `anchor` (a point on the vehicle) until the segment
 * between them stays `margin` clear of every box, but no nearer the anchor
 * than `minDistance` unless that would still leave it inside a box (a
 * building hard by the vehicle in a tight turn); returns true when it moved.
 * A camera already inside a box comes out to that box's near side.
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
  let distance = Math.max(minDistance, clear);
  // Held at minDistance the camera can still be inside the box it was pulled from; then it comes as near as it has to.
  if (distance > clear && boxes.some((box) => box.containsPoint(point.copy(anchor).addScaledVector(direction, distance)))) distance = clear;
  if (distance >= length) return false;
  camera.copy(point.copy(anchor).addScaledVector(direction, distance));
  return true;
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
