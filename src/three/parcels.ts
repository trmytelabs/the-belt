import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import type { Parcel, ParcelKind, Route } from '../game/slice/ShiftModel';
import { mergeStatic } from './merge';
import { physicalBounds } from './collision3d';
import { PALETTE, ROUTE_COLORS, shadowed, standard, textPlane, textSprite } from './space';

const PARCEL_SCALE = 1.3;

export interface ParcelView {
  root: THREE.Group;
  body: THREE.Group;
  tag: THREE.Sprite;
  /** Animated sub-parts (lobster claws, makeup spill) keyed by role. */
  parts: Record<string, THREE.Object3D>;
  height: number;
  width: number;
  depth: number;
  kind: ParcelKind;
}

const rounded = (w: number, h: number, d: number, material: THREE.Material, r = 0.03): THREE.Mesh =>
  new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), material);

const cardboard = standard(PALETTE.cardboard, 0.92);
const cardboardDark = standard(PALETTE.cardboardDark, 0.92);
const tape = standard(0xd9c08a, 0.55);
const crateWood = standard(0xa77a46, 0.85);
const crateDark = standard(0x7a5530, 0.9);

function carton(w: number, h: number, d: number, material = cardboard): THREE.Group {
  const group = new THREE.Group();
  const shell = rounded(w, h, d, material, 0.025);
  shell.position.y = h / 2;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, 0.005, d + 0.004), tape);
  strip.position.y = h + 0.002;
  const flap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.004, 0.012, 0.01), cardboardDark);
  flap.position.set(0, h - 0.005, 0);
  group.add(shell, strip, flap);
  const endTape = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, h * 0.32, 0.005), tape);
  endTape.position.set(0, h * 0.84, d / 2 + 0.003);
  const label = new THREE.Mesh(new THREE.BoxGeometry(w * 0.36, h * 0.23, 0.004), standard(0xe9e0c6, 0.92));
  label.position.set(w * 0.2, h * 0.4, d / 2 + 0.003);
  group.add(endTape, label);
  const ink = standard(0x41372b, 0.92);
  for (let i = 0; i < 6; i += 1) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w * (i % 2 ? 0.012 : 0.024), h * 0.13, 0.004), ink);
    bar.position.set(w * (0.07 + i * 0.045), h * 0.4, d / 2 + 0.006);
    group.add(bar);
  }
  return group;
}

function crate(w: number, h: number, d: number): THREE.Group {
  const group = new THREE.Group();
  const floor = rounded(w, 0.05, d, crateDark, 0.01);
  floor.position.y = 0.025;
  group.add(floor);
  for (let i = 0; i < 3; i += 1) {
    const y = 0.1 + i * (h - 0.12) / 2.4;
    for (const side of [-1, 1]) {
      const slatX = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.03), crateWood);
      slatX.position.set(0, y, side * (d / 2 - 0.015));
      const slatZ = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, d), crateWood);
      slatZ.position.set(side * (w / 2 - 0.015), y, 0);
      group.add(slatX, slatZ);
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), crateDark);
    post.position.set(sx * (w / 2 - 0.025), h / 2, sz * (d / 2 - 0.025));
    group.add(post);
  }
  return group;
}

function routeBadge(route: Route): THREE.Mesh {
  const badge = textPlane([route], 0.2, 0.2, { width: 48, height: 48, background: ROUTE_COLORS[route], color: '#12232a', radius: 10 });
  badge.rotation.x = -Math.PI / 2;
  return badge;
}

function buildBody(parcel: Parcel, parts: Record<string, THREE.Object3D>): { group: THREE.Group; height: number; top: number } {
  const group = new THREE.Group();
  switch (parcel.kind) {
    case 'envelope': {
      const sheet = rounded(0.44, 0.04, 0.32, standard(0xe9dfc4, 0.8), 0.01);
      sheet.position.y = 0.02;
      group.add(sheet);
      return { group, height: 0.05, top: 0.045 };
    }
    case 'smallbox': group.add(carton(0.36, 0.3, 0.32)); return { group, height: 0.3, top: 0.3 };
    case 'standard': group.add(carton(0.5, 0.4, 0.44)); return { group, height: 0.4, top: 0.4 };
    case 'bigbox': group.add(carton(0.7, 0.58, 0.6)); return { group, height: 0.58, top: 0.58 };
    case 'longbox': group.add(carton(0.36, 0.3, 1.0)); return { group, height: 0.3, top: 0.3 };
    case 'panchetters': {
      group.add(carton(0.52, 0.42, 0.46, standard(0xc9a477, 0.9)));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.1, 0.47), standard(0xb2463e, 0.7));
      stripe.position.y = 0.2;
      group.add(stripe);
      return { group, height: 0.42, top: 0.42 };
    }
    case 'mallwood': {
      // Mallwood's own curry-coloured fumes are spawned by the parcel FX.
      group.add(carton(0.56, 0.44, 0.48, standard(0xa9794b, 0.95)));
      const stain = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), standard(0xc98a2a, 0.9));
      stain.position.set(0.1, 0.25, 0.241);
      group.add(stain);
      return { group, height: 0.44, top: 0.44 };
    }
    case 'goji': {
      group.add(crate(0.56, 0.36, 0.44));
      const berry = standard(0xd8342c, 0.45);
      for (let i = 0; i < 16; i += 1) {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), berry);
        ball.position.set(-0.2 + (i % 4) * 0.13, 0.33 + (i % 3) * 0.015, -0.15 + Math.floor(i / 4) * 0.1);
        group.add(ball);
      }
      return { group, height: 0.4, top: 0.38 };
    }
    case 'lobsters': {
      group.add(crate(0.74, 0.4, 0.54));
      const shell = standard(0xd24a32, 0.45);
      for (const offset of [-0.15, 0.17]) {
        const lobster = new THREE.Group();
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.26, 4, 8), shell);
        torso.rotation.x = Math.PI / 2;
        lobster.add(torso);
        for (const side of [-1, 1]) {
          const claw = new THREE.Group();
          const pincer = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), shell);
          pincer.scale.set(1, 0.6, 1.4);
          pincer.position.z = 0.09;
          claw.add(pincer);
          claw.position.set(side * 0.08, 0.02, 0.17);
          claw.rotation.y = side * 0.4;
          lobster.add(claw);
          parts[`claw${offset}${side}`] = claw;
        }
        lobster.position.set(offset, 0.36, 0);
        lobster.rotation.y = offset > 0 ? 2.7 : 0.3;
        group.add(lobster);
      }
      return { group, height: 0.44, top: 0.42 };
    }
    case 'duck': {
      group.add(carton(0.46, 0.38, 0.4));
      const duck = new THREE.Group();
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), standard(0xf3d04a, 0.6));
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 8), standard(0xe8872a, 0.5));
      beak.rotation.x = Math.PI / 2;
      beak.position.z = 0.11;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), standard(0x111111, 0.3));
      eye.position.set(0.05, 0.04, 0.07);
      duck.add(head, beak, eye);
      duck.position.set(0.08, 0.45, 0.05);
      parts.duck = duck;
      group.add(duck);
      return { group, height: 0.5, top: 0.38 };
    }
    case 'makeup': {
      group.add(carton(0.48, 0.36, 0.4, standard(0xe7b9c8, 0.8)));
      const bottle = standard(0xf6e8ee, 0.3);
      for (let i = 0; i < 3; i += 1) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 10), bottle);
        b.position.set(-0.12 + i * 0.12, 0.44, 0);
        group.add(b);
      }
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.2), new THREE.MeshStandardMaterial({ color: 0x4a2a35, transparent: true, opacity: 0.85 }));
      crack.position.set(0.02, 0.18, 0.202);
      crack.visible = false;
      const spill = new THREE.Mesh(new THREE.CircleGeometry(0.42, 22), new THREE.MeshStandardMaterial({ color: 0xf08db3, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.88 }));
      spill.rotation.x = -Math.PI / 2;
      spill.position.y = 0.006;
      spill.scale.set(1.3, 0.9, 1);
      spill.visible = false;
      parts.crack = crack;
      parts.spill = spill;
      group.add(crack, spill);
      return { group, height: 0.5, top: 0.36 };
    }
    case 'mesa': {
      const cabinet = rounded(0.82, 0.62, 0.42, standard(0x1b1b1d, 0.55), 0.04);
      cabinet.position.y = 0.31;
      const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.38), standard(0x4b4334, 0.95));
      grille.position.set(0, 0.25, 0.212);
      const panel = rounded(0.7, 0.1, 0.03, standard(0xc7b278, 0.35, 0.6), 0.01);
      panel.position.set(0, 0.52, 0.205);
      const plate = textPlane(['MESA BOOGIE'], 0.4, 0.07, { width: 160, height: 28, background: '#1b1b1d', color: '#e7d8a8' });
      plate.position.set(0, 0.25, 0.214);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 14, Math.PI), standard(0x111111, 0.4));
      handle.position.set(0, 0.62, 0);
      group.add(cabinet, grille, panel, plate, handle);
      return { group, height: 0.66, top: 0.62 };
    }
    case 'atv': {
      const paint = standard(0xc23a2e, 0.35, 0.3);
      const tyre = standard(0x1a1a1a, 0.9);
      const frame = rounded(0.5, 0.18, 0.86, paint, 0.06);
      frame.position.y = 0.32;
      const seat = rounded(0.26, 0.08, 0.34, standard(0x222222, 0.7), 0.03);
      seat.position.set(0, 0.45, -0.08);
      const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), standard(0x999999, 0.3, 0.8));
      bars.rotation.z = Math.PI / 2;
      bars.position.set(0, 0.55, 0.28);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), bars.material);
      stem.position.set(0, 0.46, 0.28);
      group.add(frame, seat, bars, stem);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 14), tyre);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(sx * 0.3, 0.15, sz * 0.3);
        group.add(wheel);
      }
      return { group, height: 0.6, top: 0.5 };
    }
    case 'snakes': {
      const case_ = rounded(0.7, 0.32, 0.36, standard(0x3f8a47, 0.6), 0.05);
      case_.position.y = 0.16;
      const label = textPlane(['THE SNAKES CELL'], 0.6, 0.1, { width: 220, height: 36, background: '#e9e3c8', color: '#1d3a22' });
      label.position.set(0, 0.17, 0.182);
      parts.label = label;
      group.add(case_, label);
      return { group, height: 0.32, top: 0.32 };
    }
  }
}

export function createParcelView(parcel: Parcel): ParcelView {
  const root = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  const { group, height, top } = buildBody(parcel, parts);
  shadowed(group);
  if (parts.spill) parts.spill.castShadow = false;
  const badge = routeBadge(parcel.route);
  badge.position.set(parcel.kind === 'longbox' ? 0 : -0.08, top + 0.012, parcel.kind === 'longbox' ? 0.3 : 0.06);
  if (parcel.kind === 'mesa' || parcel.kind === 'atv') badge.position.set(0.24, top + 0.012, -0.1);
  group.add(badge);
  const animated = new Set(Object.values(parts));
  mergeStatic(group, (object) => animated.has(object));
  // Freight reads at the 2D depot's scale relative to the workers.
  group.scale.setScalar(PARCEL_SCALE);
  root.add(group);
  const size = physicalBounds(group).getSize(new THREE.Vector3());
  // Every named freight shows its full authored name, as in the 2D depot.
  const lines = parcel.label.length > 11 && parcel.label.includes(' ') ? splitLabel(parcel.label) : [parcel.label];
  const tag = textSprite(lines, lines.length > 1 ? 0.36 : 0.22, {
    width: Math.max(90, Math.max(...lines.map((line) => line.length)) * 12 + 20),
    height: lines.length > 1 ? 52 : 30, background: '#f1e5c4', border: '#9e8452', color: '#2b2116', radius: 5,
  });
  tag.position.y = Math.max(height * PARCEL_SCALE, size.y) + 0.38;
  tag.center.set(0.5, 0);
  root.add(tag);
  return { root, body: group, tag, parts, height: size.y, width: size.x, depth: size.z, kind: parcel.kind };
}

/** Carry the long edge across the hands and keep the back face ahead of the
 * worker's chest. The previous fixed offset put long cartons through torsos.
 */
export function setParcelCarried(view: ParcelView, carried: boolean): number {
  const sideways = carried && view.depth > view.width;
  view.body.rotation.y = sideways ? Math.PI / 2 : 0;
  return Math.max(0.42, (sideways ? view.width : view.depth) / 2 + 0.2);
}

/** After rotation/scaling, place the actual visible bottom on a surface.
 * Parcel roots are scene children, so this offset is in world-height units.
 */
export function alignParcelToSurface(view: ParcelView, surfaceHeight: number): void {
  const bounds = physicalBounds(view.body);
  if (!bounds.isEmpty()) view.root.position.y += surfaceHeight - bounds.min.y;
}

function splitLabel(label: string): string[] {
  const words = label.split(' ');
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
}
