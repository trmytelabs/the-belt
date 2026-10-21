import * as THREE from 'three';
import { textTexture } from './space';

const SEGMENTS = 48;
const GOLD = 0xffc23a;
const URGENT = 0xff5a36;
/** Under this much time left, the ring turns red and pulses. */
export const PRIORITY_URGENT_MS = 5_000;

/** A priority parcel's countdown: a gold ring around its base that empties as time runs out, and a label above its tag. */
export interface PriorityMarker {
  root: THREE.Group;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  label: THREE.Sprite;
  /** The whole seconds the label shows now. */
  seconds: number;
}

/** `footprint` is the parcel's own scale for its rings (the larger of its width and depth, at least 0.85). */
export function createPriorityMarker(footprint: number): PriorityMarker {
  const root = new THREE.Group();
  root.name = 'priority-marker';
  root.userData.solid = false;
  // Drawn segment by segment from its start, so the lit arc shrinks back toward the start as time runs out.
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.84, SEGMENTS, 1, Math.PI / 2, Math.PI * 2), new THREE.MeshBasicMaterial({
    color: GOLD, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  }));
  ring.name = 'priority-ring';
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.scale.setScalar(Math.max(0.85, footprint));
  ring.renderOrder = 8;
  ring.userData.baseScale = ring.scale.x;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true }));
  label.name = 'priority-label';
  label.center.set(0.5, 0);
  label.renderOrder = 9;
  root.add(ring, label);
  return { root, ring, label, seconds: -1 };
}

/** The share of the ring still lit for `remainingMs` of a `windowMs` window, in whole segments. */
export function priorityRingSegments(remainingMs: number, windowMs: number): number {
  return Math.max(0, Math.min(SEGMENTS, Math.ceil(remainingMs / windowMs * SEGMENTS)));
}

/**
 * Show `remainingMs` of the window: the ring's lit arc, the label's seconds, and the
 * urgent colour and pulse in the last five seconds. `labelY` is where the label sits
 * (just above the parcel's own tag); `carried` hides the ring, which would float at the hands.
 */
export function updatePriorityMarker(marker: PriorityMarker, remainingMs: number, windowMs: number, time: number,
  options: { labelY: number; carried: boolean; reducedMotion: boolean }): void {
  const urgent = remainingMs < PRIORITY_URGENT_MS;
  marker.ring.visible = !options.carried;
  marker.ring.geometry.setDrawRange(0, priorityRingSegments(remainingMs, windowMs) * 6);
  marker.ring.material.color.setHex(urgent ? URGENT : GOLD);
  const pulse = urgent && !options.reducedMotion ? 1 + 0.08 * Math.sin(time * 12) : 1;
  marker.ring.scale.setScalar(marker.ring.userData.baseScale * pulse);
  marker.label.position.y = options.labelY;
  const seconds = Math.ceil(remainingMs / 1000);
  if (seconds === marker.seconds) return;
  marker.seconds = seconds;
  const previous = marker.label.material.map;
  marker.label.material.map = textTexture([`PRIORITY ${seconds}s`], {
    width: 150, height: 30, radius: 6, color: '#241500', background: urgent ? '#ff7a4f' : '#ffc23a',
  });
  marker.label.material.needsUpdate = true;
  previous?.dispose();
  marker.label.scale.set(0.24 * 150 / 30, 0.24, 1);
}
