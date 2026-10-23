import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import type { Parcel, ParcelKind } from '../game/slice/ShiftModel';
import { parcelAddress, parcelStreet } from './addresses';
import { mergeStatic } from './merge';
import { physicalBounds } from './collision3d';
import { placeProp } from './propModels';
import { PALETTE, shadowed, standard, textPlane } from './space';
import { boxUVs, cardboardMaterial, surfacesLoaded } from './textures';

const PARCEL_SCALE = 1.3;

/** Plain cartons wear the photographed `cardboard-box` model on GPU renderers (main3d switches this on). */
let parcelModels = false;
export function setParcelModels(enabled: boolean): void { parcelModels = enabled; }

export interface ParcelView {
  root: THREE.Group;
  body: THREE.Group;
  tag: THREE.Sprite;
  highlight: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  /** Animated sub-parts (lobster claws, makeup spill) keyed by role. */
  parts: Record<string, THREE.Object3D>;
  height: number;
  /** Distance from the body origin to its back edge, after parcel scaling. */
  carryDepth: number;
  carrySideDepth: number;
  width: number;
  depth: number;
  kind: ParcelKind;
}

const rounded = (w: number, h: number, d: number, material: THREE.Material, r = 0.03): THREE.Mesh =>
  new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), material);

/** One photo-cardboard tile spans this many metres (docs/textures.md). */
const CARDBOARD_TILE = 0.6;
const tape = standard(0xd9c08a, 0.55);
const crateWood = standard(0xa77a46, 0.85);
const crateDark = standard(0x7a5530, 0.9);

// Cardboard materials are requested per carton, not at import: surface
// textures load after this module does. Identical requests share a material.
// A plain carton (no tint) stands in for the photographed box model, which
// replaces it at the same size once loaded; tinted cartons stay code-built.
function carton(w: number, h: number, d: number, material?: THREE.Material): THREE.Group {
  const plain = material === undefined;
  const group = buildCarton(w, h, d, material ?? cardboardMaterial(PALETTE.cardboard));
  if (!plain || !parcelModels) return group;
  const slot = new THREE.Group();
  slot.add(group);
  void placeProp(slot, 'cardboard-box', { fallback: group, size: { x: w, y: h, z: d } });
  return slot;
}

function buildCarton(w: number, h: number, d: number, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const shell = rounded(w, h, d, material, 0.025);
  if (surfacesLoaded()) boxUVs(shell.geometry, CARDBOARD_TILE);
  shell.position.y = h / 2;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, 0.005, d + 0.004), tape);
  strip.position.y = h + 0.002;
  const flap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.004, 0.012, 0.01), cardboardMaterial(PALETTE.cardboardDark));
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

function addressBadge(parcel: Parcel): THREE.Mesh {
  const badge = textPlane([parcelStreet(parcel)], parcel.kind === 'longbox' ? 0.3 : 0.42, 0.22, { width: 160, height: 72, background: '#e2d6ba', color: '#0e1c22', radius: 6 });
  badge.rotation.x = -Math.PI / 2;
  // Matte and dimmer than white paper: under the belt's lights it bloomed into a blur over its own number.
  const material = badge.material as THREE.MeshStandardMaterial;
  material.roughness = 0.95;
  material.envMapIntensity = 0.25;
  return badge;
}

/**
 * A lobster about 0.36 m long facing +z: a carapace with a short rostrum and stalked eyes, a tail of six segments
 * curling under to a five-blade fan, four pairs of walking legs, long antennae, and two claws on jointed arms (a
 * bigger crusher and a cutter), each a palm with a fixed finger and a moving one. The claws' pivots are `claws`.
 */
function lobster(shell: THREE.Material, belly: THREE.Material, dark: THREE.Material): { body: THREE.Group; claws: THREE.Group[] } {
  const body = new THREE.Group();
  const carapace = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.09, 6, 12), shell);
  carapace.rotation.x = Math.PI / 2;
  carapace.scale.set(1, 1, 0.86);
  carapace.position.set(0, 0.04, 0.03);
  const rostrum = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 6), shell);
  rostrum.rotation.x = Math.PI / 2;
  rostrum.position.set(0, 0.05, 0.12);
  body.add(carapace, rostrum);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), dark);
    eye.position.set(side * 0.018, 0.068, 0.1);
    // Long antennae sweeping back over the body, and short antennules forward.
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.004, 0.3, 4), shell);
    antenna.position.set(side * 0.06, 0.07, 0.17);
    antenna.rotation.set(Math.PI / 2 - 0.35, 0, side * -0.9);
    const antennule = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.003, 0.07, 4), shell);
    antennule.position.set(side * 0.012, 0.055, 0.15);
    antennule.rotation.set(Math.PI / 2 - 0.2, 0, side * -0.3);
    body.add(eye, antenna, antennule);
    // Four walking legs a side, bending down to the floor of the crate.
    for (let leg = 0; leg < 4; leg += 1) {
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.075, 5), shell);
      limb.position.set(side * 0.05, 0.02, 0.06 - leg * 0.026);
      limb.rotation.set(0, 0, side * (1.15 + leg * 0.05));
      body.add(limb);
    }
  }
  // The tail: segments shrinking and curling under, then the fan.
  let z = -0.035, y = 0.035;
  for (let i = 0; i < 6; i += 1) {
    const radius = 0.038 - i * 0.003;
    const segment = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), i % 2 ? shell : belly);
    segment.scale.set(1.05, 0.62, 0.72);
    segment.position.set(0, y, z);
    body.add(segment);
    z -= radius * 0.95;
    y -= 0.002 + i * 0.0015;
  }
  for (let blade = -2; blade <= 2; blade += 1) {
    const fan = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), shell);
    fan.scale.set(0.55, 0.12, 1);
    fan.position.set(blade * 0.016, y - 0.004, z - 0.016);
    fan.rotation.y = blade * 0.32;
    body.add(fan);
  }
  // The claws: an arm out and forward to each, the right (crusher) heavier than the left (cutter).
  const claws: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const size = side > 0 ? 1.15 : 0.9;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.07, 6), shell);
    arm.position.set(side * 0.05, 0.035, 0.1);
    arm.rotation.set(Math.PI / 2, 0, side * -0.7);
    body.add(arm);
    const claw = new THREE.Group();
    claw.position.set(side * 0.075, 0.035, 0.13);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.03 * size, 10, 8), shell);
    palm.scale.set(0.8, 0.6, 1.5);
    palm.position.z = 0.04 * size;
    const fixed = new THREE.Mesh(new THREE.ConeGeometry(0.014 * size, 0.07 * size, 6), shell);
    fixed.rotation.x = Math.PI / 2;
    fixed.position.set(side * 0.008, 0, 0.1 * size);
    const finger = new THREE.Mesh(new THREE.ConeGeometry(0.012 * size, 0.065 * size, 6), shell);
    finger.rotation.set(Math.PI / 2, 0, 0);
    finger.position.set(side * -0.012, 0.004, 0.098 * size);
    finger.rotation.y = side * 0.25;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.006 * size, 5, 4), dark);
    tip.position.set(side * 0.008, 0, 0.135 * size);
    claw.add(palm, fixed, finger, tip);
    body.add(claw);
    claws.push(claw);
  }
  return { body, claws };
}

/** A woven speaker-grille cloth, drawn once. */
let grilleCloth: THREE.CanvasTexture | null = null;
function grilleTexture(): THREE.CanvasTexture {
  if (grilleCloth) return grilleCloth;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#26231e';
  g.fillRect(0, 0, 64, 64);
  // A basket weave of lighter threads.
  for (let y = 0; y < 64; y += 4) for (let x = 0; x < 64; x += 4) {
    g.fillStyle = (x + y) % 8 ? '#3d382f' : '#4a4438';
    g.fillRect(x, y, (x + y) % 8 ? 3 : 2, (x + y) % 8 ? 2 : 3);
  }
  grilleCloth = new THREE.CanvasTexture(canvas);
  grilleCloth.colorSpace = THREE.SRGBColorSpace;
  grilleCloth.wrapS = grilleCloth.wrapT = THREE.RepeatWrapping;
  grilleCloth.repeat.set(5, 3);
  return grilleCloth;
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
      group.add(carton(0.52, 0.42, 0.46, cardboardMaterial(0xc9a477, 0.9)));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.1, 0.47), standard(0xb2463e, 0.7));
      stripe.position.y = 0.2;
      group.add(stripe);
      return { group, height: 0.42, top: 0.42 };
    }
    case 'mallwood': {
      // Mallwood's own curry-coloured fumes are spawned by the parcel FX.
      group.add(carton(0.56, 0.44, 0.48, cardboardMaterial(0xa9794b, 0.95)));
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
      // Live lobsters on crushed ice with a little seaweed: dark red-brown shells, orange undersides, black tips.
      const ice = standard(0xdcecf2, 0.25);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.03, 0.46), ice);
      bed.position.y = 0.33;
      group.add(bed);
      let seed = 3;
      const next = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 14; i += 1) {
        const chunk = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.035), ice);
        chunk.position.set(-0.3 + next() * 0.6, 0.35, -0.2 + next() * 0.4);
        chunk.rotation.set(next() * 2, next() * 2, next() * 2);
        group.add(chunk);
      }
      const weed = standard(0x2f4a24, 0.8);
      for (let i = 0; i < 5; i += 1) {
        const strand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.006, 0.22), weed);
        strand.position.set(-0.28 + i * 0.14, 0.352, -0.12 + (i % 2) * 0.22);
        strand.rotation.y = next() * 3;
        group.add(strand);
      }
      const shell = standard(0x8a2f1f, 0.42), belly = standard(0xc8683a, 0.5), dark = standard(0x1e1310, 0.35);
      for (const [offset, z, turn] of [[-0.17, 0.06, 0.25], [0.15, -0.07, 2.8], [0.02, 0.13, -1.4]] as const) {
        const { body, claws } = lobster(shell, belly, dark);
        claws.forEach((claw, index) => { parts[`claw${offset}${index ? 1 : -1}`] = claw; });
        body.position.set(offset, 0.345, z);
        body.rotation.y = turn;
        group.add(body);
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
      // A Mesa/Boogie combo: black tolex, chrome corners, woven grille cloth with the logo, a control strip of
      // chrome knobs and a red jewel light, a strap handle and rubber feet.
      const tolex = standard(0x161618, 0.82);
      const chrome = standard(0xd9dde0, 0.18, 0.95);
      const cabinet = rounded(0.82, 0.62, 0.42, tolex, 0.035);
      cabinet.position.y = 0.31;
      const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.4), new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.95 }));
      grille.position.set(0, 0.25, 0.212);
      const piping = standard(0xd8cfa8, 0.5);
      for (const [w, h, x, y] of [[0.73, 0.008, 0, 0.452], [0.73, 0.008, 0, 0.048], [0.008, 0.41, -0.365, 0.25], [0.008, 0.41, 0.365, 0.25]] as const) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.006), piping);
        edge.position.set(x, y, 0.213);
        group.add(edge);
      }
      const plate = textPlane(['MESA/BOOGIE'], 0.3, 0.06, { width: 160, height: 32, background: '#161618', color: '#e9d9a0' });
      plate.position.set(0.18, 0.39, 0.216);
      // The control strip along the top of the front.
      const panel = rounded(0.74, 0.085, 0.02, standard(0x0d0d0f, 0.4), 0.008);
      panel.position.set(0, 0.53, 0.212);
      group.add(cabinet, grille, plate, panel);
      for (let i = 0; i < 9; i += 1) {
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.022, 12), chrome);
        knob.rotation.x = Math.PI / 2;
        knob.position.set(-0.3 + i * 0.065, 0.53, 0.228);
        group.add(knob);
      }
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff1a0a, emissiveIntensity: 2.2, roughness: 0.2 }));
      jewel.position.set(0.33, 0.53, 0.224);
      group.add(jewel);
      // Chrome corner caps on all eight corners.
      for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
        const corner = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), chrome);
        corner.scale.set(1, 1, 1);
        corner.position.set(sx * 0.4, 0.01 + sy * 0.6, sz * 0.2);
        group.add(corner);
      }
      // A leather strap handle on the top.
      const strap = rounded(0.24, 0.025, 0.05, standard(0x111111, 0.55), 0.012);
      strap.position.set(0, 0.64, 0);
      const ends = standard(0x8a8f92, 0.3, 0.8);
      for (const sx of [-1, 1]) {
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.06), ends);
        bracket.position.set(sx * 0.13, 0.625, 0);
        group.add(bracket);
      }
      group.add(strap);
      return { group, height: 0.66, top: 0.62 };
    }
    case 'atv': {
      // A small quad: red plastics with fenders over knobby tyres, a tank and seat, chrome racks front and back,
      // handlebars with grips, and twin headlights.
      const paint = standard(0xc23a2e, 0.32, 0.25);
      const black = standard(0x1c1c1e, 0.7);
      const tyre = standard(0x161616, 0.92);
      const steelTube = standard(0xa9b0b4, 0.3, 0.8);
      const chassis = rounded(0.3, 0.1, 0.78, black, 0.03);
      chassis.position.y = 0.2;
      const body = rounded(0.42, 0.12, 0.5, paint, 0.05);
      body.position.set(0, 0.33, 0.02);
      const tank = rounded(0.22, 0.1, 0.18, paint, 0.04);
      tank.position.set(0, 0.42, 0.14);
      const seat = rounded(0.22, 0.07, 0.32, black, 0.03);
      seat.position.set(0, 0.42, -0.12);
      group.add(chassis, body, tank, seat);
      for (const sz of [-1, 1]) {
        // A fender arching over each axle, and a rack of tubes above it.
        const fender = rounded(0.6, 0.05, 0.26, paint, 0.025);
        fender.position.set(0, 0.34, sz * 0.31);
        group.add(fender);
        for (const x of [-0.18, 0, 0.18]) {
          const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6), steelTube);
          rail.rotation.x = Math.PI / 2;
          rail.position.set(x, 0.39, sz * 0.33);
          group.add(rail);
        }
        const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.38, 6), steelTube);
        crossbar.rotation.z = Math.PI / 2;
        crossbar.position.set(0, 0.39, sz * 0.43);
        group.add(crossbar);
      }
      // Handlebars on a stem, with grips.
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 6), steelTube);
      stem.position.set(0, 0.5, 0.2);
      const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.44, 6), steelTube);
      bars.rotation.z = Math.PI / 2;
      bars.position.set(0, 0.58, 0.2);
      group.add(stem, bars);
      for (const sx of [-1, 1]) {
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.08, 8), black);
        grip.rotation.z = Math.PI / 2;
        grip.position.set(sx * 0.2, 0.58, 0.2);
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xfff0c0, emissiveIntensity: 0.8 }));
        lamp.position.set(sx * 0.1, 0.34, 0.272);
        group.add(grip, lamp);
      }
      // Knobby tyres: a tyre with blocks of tread round it, on a red-and-grey hub.
      const hub = standard(0x8f969a, 0.35, 0.6);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const wheel = new THREE.Group();
        wheel.position.set(sx * 0.27, 0.15, sz * 0.31);
        wheel.rotation.z = Math.PI / 2;
        const rubber = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.13, 16), tyre);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.135, 10), hub);
        wheel.add(rubber, rim);
        for (let k = 0; k < 12; k += 1) {
          const knob = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.022), tyre);
          const a = (k / 12) * Math.PI * 2;
          knob.position.set(Math.cos(a) * 0.142, 0, Math.sin(a) * 0.142);
          knob.rotation.y = -a;
          wheel.add(knob);
        }
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
  const badge = addressBadge(parcel);
  badge.position.set(parcel.kind === 'longbox' ? 0 : -0.08, top + 0.012, parcel.kind === 'longbox' ? 0.3 : 0.06);
  if (parcel.kind === 'mesa' || parcel.kind === 'atv') badge.position.set(0.08, top + 0.012, -0.1);
  group.add(badge);
  const animated = new Set(Object.values(parts));
  // A model slot and its stand-in stay separate: one appears and the other hides later.
  mergeStatic(group, (object) => animated.has(object) || object.userData.keep === true);
  // Freight reads at the shared model's scale relative to the workers.
  group.scale.setScalar(PARCEL_SCALE);
  // Include visible labels and asymmetric parts in both carry orientations.
  // Hidden damage effects must not enlarge a parcel while it is in the hands.
  const carryBounds = new THREE.Box3();
  group.updateMatrixWorld(true);
  group.traverseVisible(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.computeBoundingBox();
    if (object.geometry.boundingBox) carryBounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  const carryDepth = Math.max(0, -carryBounds.min.z), carrySideDepth = Math.max(0, carryBounds.max.x);
  root.add(group);
  const size = physicalBounds(group).getSize(new THREE.Vector3());
  // Every named freight shows its full authored name.
  const tag = parcelTag(parcel);
  tag.position.y = Math.max(height * PARCEL_SCALE, size.y) + 0.38;
  // Where the tag rests on the freight; the renderer lifts it while the parcel is carried.
  tag.userData.baseY = tag.position.y;
  tag.center.set(0.5, 0);
  root.add(tag);
  const highlight = new THREE.Mesh(new THREE.RingGeometry(0.53, 0.64, 36), new THREE.MeshBasicMaterial({
    color: 0x87f5ff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  }));
  highlight.name = 'player-parcel-highlight'; highlight.userData.solid = false;
  highlight.rotation.x = -Math.PI / 2; highlight.position.y = 0.025;
  highlight.scale.setScalar(Math.max(0.85, size.x, size.z));
  highlight.renderOrder = 7; highlight.visible = false; root.add(highlight);
  return { root, body: group, tag, highlight, parts, height: size.y, carryDepth, carrySideDepth, width: size.x, depth: size.z, kind: parcel.kind };
}

/** Carry the long edge across the hands and keep the back face ahead of the
 * worker's chest. The previous fixed offset put long cartons through torsos.
 */
export function setParcelCarried(view: ParcelView, carried: boolean, clearance = 0.32): number {
  const sideways = carried && view.depth > view.width;
  view.body.rotation.y = sideways ? Math.PI / 2 : 0;
  return Math.max(0.42, (sideways ? view.carrySideDepth : view.carryDepth) + clearance);
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

function parcelTag(parcel: Parcel): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 560; canvas.height = 280;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);
  ctx.fillStyle = '#fff4d8'; ctx.beginPath(); ctx.roundRect(1, 1, 278, 138, 8); ctx.fill();
  ctx.strokeStyle = '#9e8452'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#12232a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 58px "Segoe UI", Arial, sans-serif';
  ctx.fillText(parcelStreet(parcel), 140, 36, 260);
  ctx.font = '700 21px "Segoe UI", Arial, sans-serif';
  ctx.fillText(parcelAddress(parcel), 140, 79, 260);
  ctx.font = '700 17px "Segoe UI", Arial, sans-serif';
  splitLabel(parcel.label).forEach((line, index) => ctx.fillText(line, 140, 105 + index * 20, 260));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  tag.scale.set(1.88, 0.94, 1);
  tag.name = 'parcel-address-tag';
  tag.userData.street = parcelStreet(parcel);
  return tag;
}
