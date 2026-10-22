import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { trackCharacter } from './characterModels';
import { mergeStatic } from './merge';
import { shadowed, standard, textSprite } from './space';

export type HairStyle = 'short' | 'long' | 'curly' | 'bun' | 'bald' | 'mullet' | 'slick';
export type Headwear = 'none' | 'termiteHat' | 'beanie' | 'santaHat';

export interface CharacterSpec {
  name: string;
  skin: number;
  shirt: number;
  pants: number;
  shoes?: number;
  hair: number;
  hairStyle: HairStyle;
  headwear?: Headwear;
  scale?: number;
  barefoot?: boolean;
  glasses?: boolean;
  /** Small model-specific fit adjustments for worn frames. */
  glassesDepth?: number;
  glassesHeight?: number;
  moustache?: boolean;
  beard?: boolean;
  tie?: number;
  /** Keeps the skin as a live material (Shan reddens while ranting). */
  dynamicSkin?: boolean;
  necklace?: boolean;
  overalls?: number;
  vest?: number;
  /** Iris colour; dark brown by default. */
  eyes?: number;
  /** Full-length sleeves; on by default with a tie (a dress shirt). */
  longSleeves?: boolean;
}

/**
 * A procedurally built person at real proportions (about 1.78 m at scale 1),
 * with pivots for walking, carrying and gestures. Shoulders and hips carry
 * the elbows and knees, which carry the hands and feet; props held in a hand
 * go on `rightHand` / `leftHand`.
 */
export interface Character {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  leftHand: THREE.Group;
  rightHand: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftShin: THREE.Group;
  rightShin: THREE.Group;
  /** Face/shirt materials that some gags recolor (Shan reddening). */
  skinMaterial: THREE.MeshStandardMaterial;
  nameTag: THREE.Sprite;
  headHeight: number;
  walkPhase: number;
  /** How far into a walk the stride is, 0 standing to 1 striding: it builds over the first steps and winds down over the last. */
  gait?: number;
  /** A short one-shot motion (a lift, a put-down, a throw) layered over the walk cycle. */
  action?: CharacterAction;
  /**
   * What the character is doing this frame, set by `animateCharacter` and the
   * pose code, so an imported model can play matching animation clips
   * (characterModels.ts). A figure posed by hand and never animated has none,
   * and its model follows the figure's joints.
   */
  motion?: CharacterMotion;
}

export interface CharacterMotion {
  /** The game time of the last `animateCharacter` call; clips advance by its change, so a paused game holds them. */
  time: number;
  moving: boolean;
  carrying: boolean;
  /** The arms follow the figure (a held cup, a raised hand) whatever the clip does. */
  holding: boolean;
  reduced: boolean;
  /** The named pose from crew.ts, `none` when only walking or standing. */
  pose: string;
  seated: boolean;
  /** On a stair flight with the feet planted on its treads, so a model's legs follow the figure. */
  stairs: boolean;
  /** Seated with the hands placed on the seat's targets (the wheel, the lap), so a model's arms follow the figure. */
  hands: boolean;
  /** Saying a line right now, so a model standing still gestures as it talks. */
  speaking?: boolean;
  /**
   * False for the player's own workers: a stretch or a head scratch while the player holds them still
   * reads as the controls misbehaving. The crew fidget as before.
   */
  fidgets?: boolean;
  /** A turn on the spot in progress: when it began, how far it turns (radians, positive to the left) and from which facing. */
  turn: { start: number; angle: number; from: number } | null;
}

export type ActionKind = 'lift' | 'drop' | 'throw';
export interface CharacterAction {
  kind: ActionKind;
  /** Wall-clock start, in the same seconds as `animateCharacter`'s `time`. */
  start: number;
  /** Where a lift picks up from: the waist-high belt, or the floor (a crouch). */
  from?: 'belt' | 'floor';
}

/** How long each one-shot motion plays, in seconds. */
export const ACTION_SECONDS: Record<ActionKind, number> = { lift: 0.42, drop: 0.36, throw: 0.34 };

/** Starts a one-shot motion; a motion already playing is replaced. */
export function triggerAction(character: Character, kind: ActionKind, time: number, from?: 'belt' | 'floor'): void {
  character.action = { kind, start: time, from };
}

import { BODY, TURN_MIN, TURN_SECONDS } from './figure';

export { BODY, TURN_MIN, TURN_SECONDS } from './figure';

/**
 * Every cloth, skin and hair surface shares one roughness band, so the merge
 * (which bakes colour per vertex) draws each rigid body part in one call.
 */
const FINISH = 0.75;
const matte = (color: number): THREE.MeshStandardMaterial => standard(color, FINISH);

const box = (w: number, h: number, d: number, material: THREE.Material, radius = 0.02, segments = 2): THREE.Mesh =>
  new THREE.Mesh(new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, w / 2, h / 2, d / 2)), material);

const ball = (r: number, material: THREE.Material, w = 12, h = 9): THREE.Mesh =>
  new THREE.Mesh(new THREE.SphereGeometry(r, w, h), material);

/**
 * A smooth tapered limb hanging down from its pivot, with rounded ends that
 * overlap the next joint, so bent elbows and knees show no seam.
 */
function segment(top: number, bottom: number, length: number, material: THREE.Material): THREE.Mesh {
  const points: THREE.Vector2[] = [];
  const cap = 3;
  for (let i = 0; i <= cap; i += 1) {
    const a = (i / cap) * Math.PI / 2;
    points.push(new THREE.Vector2(Math.sin(a) * bottom, -length - Math.cos(a) * bottom * 0.9));
  }
  for (let i = 0; i <= cap; i += 1) {
    const a = Math.PI / 2 + (i / cap) * Math.PI / 2;
    points.push(new THREE.Vector2(Math.sin(a) * top, -Math.cos(a) * top * 0.9));
  }
  return new THREE.Mesh(new THREE.LatheGeometry(points, 10), material);
}

/** A body of revolution from (radius, height) pairs, flattened front to back. */
function lathe(profile: [number, number][], depth: number, material: THREE.Material, segments = 16, phiStart = 0, phiLength = Math.PI * 2): THREE.Mesh {
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments, phiStart, phiLength);
  geometry.scale(1, 1, depth);
  return new THREE.Mesh(geometry, material);
}

/** The torso's outline (radius at height); the hips are drawn separately in the trouser colour. */
const TORSO: [number, number][] = [
  [0, 0.95], [0.155, 0.95], [0.15, 1.04], [0.158, 1.13], [0.172, 1.23], [0.18, 1.31],
  [0.172, 1.37], [0.14, 1.415], [0.085, 1.445], [0.05, 1.46], [0, 1.465],
];
const TORSO_DEPTH = 0.62;
const PELVIS: [number, number][] = [[0, 0.81], [0.07, 0.815], [0.14, 0.835], [0.165, 0.88], [0.168, 0.92], [0.16, 0.99], [0, 0.99]];

/** The torso's front surface at a height, for things worn on the chest. */
function chestFront(y: number): number {
  for (let i = 1; i < TORSO.length; i += 1) {
    const [r1, y1] = TORSO[i];
    const [r0, y0] = TORSO[i - 1];
    if (y >= y0 && y <= y1) return (r0 + (r1 - r0) * ((y - y0) / Math.max(1e-6, y1 - y0))) * TORSO_DEPTH;
  }
  return 0.1;
}

function darker(hex: number, amount: number): number {
  return new THREE.Color(hex).multiplyScalar(amount).getHex();
}

function buildArm(side: number, sleeve: THREE.Material, skin: THREE.Material, longSleeves: boolean, shirtless: boolean): { arm: THREE.Group; forearm: THREE.Group; hand: THREE.Group } {
  const arm = new THREE.Group();
  arm.position.set(side * BODY.shoulderX, BODY.shoulderY, 0);
  const shoulder = ball(0.058, sleeve);
  shoulder.scale.set(1, 0.92, 0.95);
  shoulder.position.set(-side * 0.008, -0.012, 0);
  arm.add(shoulder);
  if (longSleeves) {
    arm.add(segment(0.058, 0.05, BODY.upperArm, sleeve));
  } else if (shirtless) {
    arm.add(segment(0.052, 0.043, BODY.upperArm, skin));
  } else {
    const cuff = segment(0.057, 0.056, 0.16, sleeve);
    // The bare arm starts inside the sleeve, so none of it shows above the cuff.
    const bare = segment(0.048, 0.043, BODY.upperArm - 0.12, skin);
    bare.position.y = -0.12;
    arm.add(cuff, bare);
  }
  const forearm = new THREE.Group();
  forearm.position.y = -BODY.upperArm;
  arm.add(forearm);
  forearm.add(segment(longSleeves ? 0.05 : 0.044, longSleeves ? 0.042 : 0.034, BODY.forearm, longSleeves ? sleeve : skin));
  if (longSleeves) {
    const wrist = segment(0.036, 0.034, 0.03, skin);
    wrist.position.y = -BODY.forearm + 0.01;
    forearm.add(wrist);
  }
  const hand = new THREE.Group();
  hand.position.y = -BODY.forearm;
  forearm.add(hand);
  const palm = box(0.072, 0.085, 0.034, skin, 0.016, 1);
  palm.position.y = -0.045;
  const fingers = box(0.068, 0.07, 0.028, skin, 0.013, 1);
  fingers.position.set(0, -0.112, 0.006);
  fingers.rotation.x = -0.28;
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.04, 2, 5), skin);
  thumb.position.set(-side * 0.034, -0.05, 0.022);
  thumb.rotation.set(-0.5, 0, side * 0.55);
  hand.add(palm, fingers, thumb);
  return { arm, forearm, hand };
}

function buildLeg(side: number, trousers: THREE.Material, shoe: THREE.Material, sole: THREE.Material, barefoot: boolean): { leg: THREE.Group; shin: THREE.Group } {
  const leg = new THREE.Group();
  leg.position.set(side * BODY.hipX, BODY.hipY, 0);
  leg.add(segment(0.092, 0.064, BODY.thigh, trousers));
  const shin = new THREE.Group();
  shin.position.y = -BODY.thigh;
  leg.add(shin);
  shin.add(segment(0.062, 0.05, BODY.shin, trousers));
  const ankle = -BODY.shin;
  const footY = -(BODY.hipY - BODY.thigh - BODY.shin) + 0.0;
  if (barefoot) {
    const foot = box(0.085, 0.055, 0.22, shoe, 0.026);
    foot.position.set(0, ankle + footY + 0.028, 0.05);
    shin.add(foot);
  } else {
    const upper = box(0.1, 0.07, 0.26, shoe, 0.03);
    upper.position.set(0, ankle + footY + 0.045, 0.045);
    const toe = ball(0.05, shoe, 10, 7);
    toe.scale.set(1, 0.65, 1.1);
    toe.position.set(0, ankle + footY + 0.035, 0.15);
    const base = box(0.106, 0.022, 0.275, sole, 0.008);
    base.position.set(0, ankle + footY + 0.011, 0.05);
    shin.add(upper, toe, base);
    // The laces and reinforced toe read in close shots; the rigid foot merge
    // folds these small flat pieces into the existing shoe draw call.
    for (let i = 0; i < 3; i += 1) {
      const lace = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.008, 0.009), sole);
      lace.position.set(0, ankle + footY + 0.084, 0.015 + i * 0.022);
      shin.add(lace);
    }
  }
  return { leg, shin };
}

function buildFace(head: THREE.Group, spec: CharacterSpec, skin: THREE.Material, hair: THREE.Material): void {
  const skull = ball(0.1, skin, 16, 12);
  skull.scale.set(0.93, 1.12, 1.03);
  skull.position.y = 0.135;
  const jaw = ball(0.074, skin, 12, 8);
  jaw.scale.set(1, 0.86, 1);
  jaw.position.set(0, 0.07, 0.025);
  head.add(skull, jaw);
  for (const side of [-1, 1]) {
    const ear = ball(0.027, skin, 8, 6);
    ear.scale.set(0.45, 1, 0.72);
    ear.position.set(side * 0.093, 0.125, -0.008);
    head.add(ear);
  }
  const nose = box(0.03, 0.05, 0.036, skin, 0.012, 1);
  nose.position.set(0, 0.112, 0.103);
  nose.rotation.x = -0.22;
  head.add(nose);
  const white = matte(0xf1ede4);
  const iris = matte(spec.eyes ?? 0x3a271a);
  const brow = matte(darker(spec.hair, 0.85));
  for (const side of [-1, 1]) {
    const eye = ball(0.017, white, 8, 6);
    eye.scale.set(1.25, 0.82, 0.55);
    eye.position.set(side * 0.037, 0.142, 0.089);
    const pupil = ball(0.0098, iris, 6, 4);
    pupil.scale.set(1, 1, 0.5);
    pupil.position.set(side * 0.037, 0.141, 0.097);
    const eyebrow = box(0.042, 0.01, 0.014, brow, 0.004, 1);
    eyebrow.position.set(side * 0.039, 0.169, 0.096);
    eyebrow.rotation.z = side * -0.1;
    head.add(eye, pupil, eyebrow);
  }
  const lips = box(0.046, 0.011, 0.012, matte(darker(spec.skin, 0.68)), 0.005, 1);
  lips.position.set(0, 0.073, spec.beard ? 0.104 : 0.094);
  head.add(lips);
  if (spec.beard) {
    const beard = ball(0.082, hair, 14, 10);
    beard.scale.set(1.05, 0.8, 0.86);
    beard.position.set(0, 0.058, 0.03);
    head.add(beard);
    for (const side of [-1, 1]) {
      const sideburn = box(0.016, 0.07, 0.05, hair, 0.007, 1);
      sideburn.position.set(side * 0.088, 0.105, 0.015);
      head.add(sideburn);
    }
  }
  if (spec.moustache || spec.beard) {
    const stache = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.045, 3, 6), hair);
    stache.rotation.z = Math.PI / 2;
    stache.position.set(0, 0.088, spec.beard ? 0.104 : 0.1);
    head.add(stache);
  }
  if (spec.glasses) {
    const glasses = new THREE.Group();
    glasses.name = 'glasses'; glasses.userData.keep = true;
    glasses.position.set(0, (spec.glassesHeight ?? 0.141) - 0.141, (spec.glassesDepth ?? 0.107) - 0.107);
    head.add(glasses);
    const frame = standard(0x1a1a1a, 0.3);
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0042, 6, 16), frame);
      lens.position.set(side * 0.037, 0.141, 0.107);
      const temple = box(0.004, 0.004, 0.1, frame, 0.0015);
      temple.position.set(side * 0.09, 0.145, 0.055);
      glasses.add(lens, temple);
    }
    const bridge = box(0.03, 0.005, 0.005, frame, 0.002);
    bridge.position.set(0, 0.146, 0.11);
    glasses.add(bridge);
    glasses.traverse(child => { child.userData.headAccessory = true; });
  }
}

function buildHair(head: THREE.Group, spec: CharacterSpec, hair: THREE.Material): void {
  if (spec.hairStyle === 'bald') {
    // A fringe of short hair around the back and sides.
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.103, 16, 8, Math.PI * 0.62, Math.PI * 1.76, Math.PI * 0.42, Math.PI * 0.2), hair);
    fringe.scale.set(0.95, 1.12, 1.05);
    fringe.position.y = 0.135;
    head.add(fringe);
    return;
  }
  const full = spec.hairStyle === 'curly' ? 0.112 : 0.106;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(full, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), hair);
  cap.scale.set(0.96, 1.1, 1.07);
  cap.position.set(0, 0.14, -0.006);
  cap.rotation.x = -0.32;
  head.add(cap);
  if (spec.hairStyle === 'long' || spec.hairStyle === 'mullet') {
    const long = spec.hairStyle === 'long';
    const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, long ? 0.24 : 0.08, 4, 10), hair);
    back.scale.set(1.3, 1, 0.55);
    back.position.set(0, long ? 0.0 : 0.06, -0.075);
    back.rotation.x = 0.12;
    head.add(back);
    if (long) {
      for (const side of [-1, 1]) {
        const lock = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.2, 3, 8), hair);
        lock.position.set(side * 0.09, 0.03, 0.0);
        lock.rotation.z = side * 0.08;
        head.add(lock);
      }
    }
  } else if (spec.hairStyle === 'curly') {
    for (let i = 0; i < 12; i += 1) {
      const angle = i / 12 * Math.PI * 2;
      const curl = ball(0.04, hair, 8, 6);
      curl.position.set(Math.cos(angle) * 0.088, 0.2 + Math.sin(i * 1.9) * 0.02, Math.sin(angle) * 0.085 - 0.02);
      head.add(curl);
    }
    const crown = ball(0.07, hair, 10, 8);
    crown.position.set(0, 0.235, -0.02);
    head.add(crown);
  } else if (spec.hairStyle === 'bun') {
    const bun = ball(0.046, hair, 10, 8);
    bun.position.set(0, 0.23, -0.09);
    head.add(bun);
  } else if (spec.hairStyle === 'slick') {
    // Swept up and back from the forehead.
    const quiff = ball(0.06, hair, 12, 8);
    quiff.scale.set(1.45, 0.62, 1.25);
    quiff.position.set(0, 0.222, 0.03);
    quiff.rotation.x = -0.3;
    head.add(quiff);
  }
}

function buildHeadwear(head: THREE.Group, spec: CharacterSpec): void {
  if (spec.headwear === 'termiteHat') {
    const hat = matte(0xe7c04e);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.118, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat);
    crown.scale.set(1.02, 0.92, 1.06);
    crown.position.y = 0.2;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.205, 0.014, 22), hat);
    brim.position.set(0, 0.205, 0.015);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.121, 0.122, 0.024, 18), matte(0x8c6a24));
    band.position.y = 0.222;
    const badge = textSprite(['T'], 0.06, { width: 32, height: 32, color: '#5b4316' });
    badge.position.set(0, 0.275, 0.12);
    head.add(crown, brim, band, badge);
  } else if (spec.headwear === 'santaHat') {
    // A Christmas hat: red felt flopping to one side, a white fur cuff and pompom.
    const felt = matte(0xc4202a);
    const fur = matte(0xf4f1ea);
    const hat = new THREE.Group();
    hat.position.set(0, 0.17, -0.01);
    hat.rotation.x = -0.18;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.128, 0.16, 18), felt);
    crown.position.y = 0.08;
    const tip = new THREE.Group();
    tip.position.y = 0.155;
    tip.rotation.set(-0.5, 0, 0.95);
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 14), felt);
    point.position.y = 0.09;
    const pompom = ball(0.038, fur, 10, 8);
    pompom.position.y = 0.2;
    tip.add(point, pompom);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.124, 0.03, 8, 22), fur);
    cuff.rotation.x = Math.PI / 2;
    cuff.scale.set(1, 1.06, 1);
    cuff.position.y = 0.012;
    hat.add(crown, tip, cuff);
    // An accessory, like glasses: it stays on when an imported model replaces the figure.
    hat.traverse(child => { child.userData.headAccessory = true; });
    head.add(hat);
  } else if (spec.headwear === 'beanie') {
    const wool = matte(0x3b5874);
    const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.113, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2), wool);
    beanie.scale.set(1, 1.05, 1.06);
    beanie.position.y = 0.16;
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.106, 0.018, 6, 18), wool);
    cuff.rotation.x = Math.PI / 2;
    cuff.scale.set(1, 1.06, 1);
    cuff.position.y = 0.165;
    head.add(beanie, cuff);
  }
}

function buildClothing(body: THREE.Group, spec: CharacterSpec, shirt: THREE.Material): void {
  const shirtless = spec.shirt === spec.skin;
  if (!shirtless) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.014, 6, 16), shirt);
    collar.rotation.x = Math.PI / 2 - 0.25;
    collar.scale.set(1, 0.8, 1);
    collar.position.set(0, 1.445, 0.006);
    body.add(collar);
    const seam = matte(darker(spec.overalls ?? spec.shirt, 0.74));
    const pocket = box(0.085, 0.075, 0.008, seam, 0.003, 1);
    const pocketY = spec.overalls !== undefined ? 1.12 : 1.3;
    pocket.position.set(spec.overalls !== undefined ? 0 : -0.075, pocketY, chestFront(pocketY) + (spec.overalls !== undefined ? 0.02 : 0.005));
    body.add(pocket);
    const hem = lathe([[0.161, 0.972], [0.157, 0.988]], TORSO_DEPTH + 0.02, seam, 12);
    body.add(hem);
  }
  if (spec.overalls !== undefined) {
    const denim = matte(spec.overalls);
    const bib = box(0.22, 0.22, 0.02, denim, 0.012);
    bib.position.set(0, 1.11, chestFront(1.11) + 0.004);
    body.add(bib);
    for (const side of [-1, 1]) {
      const strap = box(0.034, 0.2, 0.014, denim, 0.005);
      strap.position.set(side * 0.082, 1.29, chestFront(1.29) - 0.004);
      strap.rotation.x = -0.32;
      const button = ball(0.011, standard(0xc9a75a, 0.35, 0.6), 6, 5);
      button.position.set(side * 0.082, 1.215, chestFront(1.215) + 0.016);
      body.add(strap, button);
    }
  }
  if (spec.vest !== undefined) {
    const vest = new THREE.MeshStandardMaterial({ color: spec.vest, roughness: 0.6, emissive: spec.vest, emissiveIntensity: 0.12, side: THREE.DoubleSide });
    const shell = lathe(TORSO.slice(1, 7).map(([r, y]) => [r + 0.012, y]), TORSO_DEPTH + 0.03, vest, 16, 0.42, Math.PI * 2 - 0.84);
    body.add(shell);
    const reflective = new THREE.MeshStandardMaterial({ color: 0xdfe6e8, emissive: 0x99a0a2, emissiveIntensity: 0.4, side: THREE.DoubleSide });
    const stripe = lathe([[0.166, 1.08], [0.171, 1.12]], TORSO_DEPTH + 0.04, reflective, 16, 0.42, Math.PI * 2 - 0.84);
    body.add(stripe);
  }
  if (spec.tie !== undefined) {
    const silk = matte(spec.tie);
    const knot = box(0.034, 0.03, 0.02, silk, 0.008);
    knot.position.set(0, 1.42, chestFront(1.42) + 0.022);
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.034, 0.3, 4, 1), silk);
    blade.rotation.y = Math.PI / 4;
    blade.scale.set(1, 1, 0.3);
    blade.position.set(0, 1.25, chestFront(1.25) + 0.008);
    blade.rotation.x = -0.12;
    body.add(knot, blade);
  }
  if (spec.necklace) {
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.005, 5, 20), standard(0xe8c25a, 0.3, 0.8));
    chain.rotation.x = Math.PI / 2 - 0.55;
    chain.position.set(0, 1.425, 0.022);
    body.add(chain);
  }
}

export function createCharacter(spec: CharacterSpec): Character {
  const root = new THREE.Group();
  root.name = spec.name;
  const body = new THREE.Group();
  root.add(body);
  const skinMaterial = matte(spec.skin);
  const shirt = matte(spec.shirt);
  const pants = matte(spec.pants);
  const shoes = spec.barefoot ? skinMaterial : matte(spec.shoes ?? 0x23262a);
  const sole = matte(0x141517);
  const hair = matte(spec.hair);
  const longSleeves = spec.longSleeves ?? spec.tie !== undefined;

  const left = buildLeg(-1, pants, shoes, sole, spec.barefoot === true);
  const right = buildLeg(1, pants, shoes, sole, spec.barefoot === true);
  body.add(left.leg, right.leg);
  body.add(lathe(PELVIS, 0.6, pants, 14));
  const belt = lathe([[0.158, 0.955], [0.16, 0.99]], 0.62, matte(0x1d1f22), 14);
  body.add(belt);
  body.add(lathe(TORSO, TORSO_DEPTH, shirt, 16));
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.056, 0.1, 10), skinMaterial);
  neck.position.set(0, 1.49, -0.004);
  body.add(neck);
  buildClothing(body, spec, shirt);

  const shirtless = spec.shirt === spec.skin;
  const leftArmParts = buildArm(-1, shirt, skinMaterial, longSleeves, shirtless);
  const rightArmParts = buildArm(1, shirt, skinMaterial, longSleeves, shirtless);
  body.add(leftArmParts.arm, rightArmParts.arm);

  const head = new THREE.Group();
  head.position.y = BODY.neckY;
  body.add(head);
  buildFace(head, spec, skinMaterial, hair);
  buildHair(head, spec, hair);
  buildHeadwear(head, spec);

  const nameTag = textSprite([spec.name], 0.2, { width: Math.max(80, spec.name.length * 13 + 20), height: 26, background: '#14262dd8', color: '#f0e7cf', radius: 8 });
  nameTag.position.y = 2.05;
  root.add(nameTag);

  if (spec.dynamicSkin) body.traverse((child) => {
    if ((child as THREE.Mesh).material === skinMaterial) child.userData.keepMaterial = true;
  });
  const scale = spec.scale ?? 1;
  root.scale.setScalar(scale);
  shadowed(body, true, false);
  // Marks the figure itself, which an imported model hides; props added later stay visible.
  body.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) child.userData.figure = child.userData.headAccessory !== true;
  });
  // A relaxed stance: elbows slightly bent.
  leftArmParts.forearm.rotation.x = rightArmParts.forearm.rotation.x = -0.12;
  const character: Character = {
    root, body, head,
    leftArm: leftArmParts.arm, rightArm: rightArmParts.arm,
    leftForearm: leftArmParts.forearm, rightForearm: rightArmParts.forearm,
    leftHand: leftArmParts.hand, rightHand: rightArmParts.hand,
    leftLeg: left.leg, rightLeg: right.leg, leftShin: left.shin, rightShin: right.shin,
    skinMaterial, nameTag,
    headHeight: 1.85 * scale, walkPhase: Math.random() * Math.PI * 2,
  };
  trackCharacter(character, spec);
  return character;
}

/** Merges each rigid part once props are attached; every joint stays animatable. */
export function mergeCharacter(character: Character): void {
  const pivots = new Set<THREE.Object3D>([
    character.head, character.leftArm, character.rightArm, character.leftForearm, character.rightForearm,
    character.leftLeg, character.rightLeg, character.leftShin, character.rightShin,
  ]);
  const keep = (object: THREE.Object3D): boolean => pivots.has(object) || object.userData.keep === true;
  // Props and the figure merge separately, so an imported model can hide the figure alone.
  const figure = (object: THREE.Object3D): boolean => object.userData.figure === true;
  const props = (object: THREE.Object3D): boolean => object.userData.mergedProps === true;
  for (const part of [character.body, ...pivots]) {
    mergeTagged(part, (object) => keep(object) || figure(object), 'mergedProps');
    mergeTagged(part, (object) => keep(object) || props(object), 'figure');
  }
}

function mergeTagged(root: THREE.Object3D, keep: (object: THREE.Object3D) => boolean, tag: string): void {
  const before = new Set(root.children);
  mergeStatic(root, keep);
  for (const child of root.children) if (!before.has(child)) child.userData[tag] = true;
}

/** Sets both elbows (negative bends the forearm forward and up). */
export function bendElbows(character: Character, left: number, right = left): void {
  character.leftForearm.rotation.set(left, 0, 0);
  character.rightForearm.rotation.set(right, 0, 0);
}

/** Sets both knees (positive bends the shin back). */
export function bendKnees(character: Character, left: number, right = left): void {
  character.leftShin.rotation.x = left;
  character.rightShin.rotation.x = right;
}

/**
 * Walk cycle plus carrying/idle arm poses. Call every frame.
 *
 * `load` (0..1) is how heavy the carried freight is: a heavy box pulls the
 * carrier back onto their heels and lowers the arms. A one-shot `action` set
 * with `triggerAction` (a lift from the belt, a put-down, a throw) is blended
 * in as a brief dip of the knees, hips and arms, then fades out by itself.
 * The torso leans into a walk and sways with each step; the motion offsets are
 * folded into the easing targets, so nothing accumulates frame to frame.
 */
export function animateCharacter(character: Character, dt: number, state: {
  moving: boolean; carrying?: boolean; speed?: number; reducedMotion?: boolean; time: number; load?: number;
}): void {
  const { moving, carrying = false, speed = 1 } = state;
  const load = Math.max(0, Math.min(1, state.load ?? 0));
  const walking = moving && !state.reducedMotion;
  // For an imported model's clips; the pose code sets `pose`, `seated` and `holding` after this.
  const motion = (character.motion ??= { time: state.time, moving: false, carrying: false, holding: false, reduced: false, pose: 'none', seated: false, stairs: false, hands: false, turn: null });
  motion.time = state.time;
  motion.moving = moving;
  motion.carrying = carrying;
  motion.holding = false;
  motion.reduced = state.reducedMotion === true;
  motion.pose = 'none';
  motion.seated = false;
  motion.stairs = false;
  motion.hands = false;
  motion.speaking = false;
  // Into a walk over its first steps and out of it over the last, rather than at full stride in a frame;
  // the step under way when the feet stop is finished as the stride winds down.
  const gait = state.reducedMotion ? 0 : walking ? Math.min(1, (character.gait ?? 0) + dt / GAIT_START_SECONDS) : Math.max(0, (character.gait ?? 0) - dt / GAIT_STOP_SECONDS);
  character.gait = gait;
  if (gait > 0) character.walkPhase += dt * 9 * speed;
  const phase = character.walkPhase;
  const swing = Math.sin(phase) * gait;
  const ease = (current: number, target: number): number => current + (target - current) * Math.min(1, dt * 14);
  // The one-shot motion's envelope: 0 outside it, rising and falling inside.
  const action = character.action;
  let dip = 0;
  let fling = 0;
  if (action) {
    const t = (state.time - action.start) / ACTION_SECONDS[action.kind];
    if (t >= 1 || t < 0) character.action = undefined;
    else if (!state.reducedMotion) {
      const pulse = Math.sin(t * Math.PI);
      if (action.kind === 'throw') fling = pulse;
      else dip = action.kind === 'lift' ? pulse : pulse * 0.7;
    }
  }
  // Hips swing; each knee folds while its leg passes forward and straightens to land.
  // A lift or put-down folds both legs together.
  character.leftLeg.rotation.x = ease(character.leftLeg.rotation.x, swing * 0.5 - 0.45 * dip);
  character.rightLeg.rotation.x = ease(character.rightLeg.rotation.x, -swing * 0.5 - 0.45 * dip);
  character.leftLeg.rotation.z = ease(character.leftLeg.rotation.z, 0);
  character.rightLeg.rotation.z = ease(character.rightLeg.rotation.z, 0);
  const leftKnee = 0.03 + gait * (0.05 + Math.max(0, -Math.cos(phase)) * 0.85) + 0.75 * dip;
  const rightKnee = 0.03 + gait * (0.05 + Math.max(0, Math.cos(phase)) * 0.85) + 0.75 * dip;
  character.leftShin.rotation.x = ease(character.leftShin.rotation.x, leftKnee);
  character.rightShin.rotation.x = ease(character.rightShin.rotation.x, rightKnee);
  // Carrying holds the parcel at the waist with bent elbows; otherwise the arms swing.
  // A heavy load hangs lower; a throw swings both arms forward and up; a lift reaches down.
  const carryAngle = -0.3 + 0.12 * load;
  const reach = -0.22 * dip - 1.3 * fling;
  character.leftArm.rotation.x = ease(character.leftArm.rotation.x, (carrying ? carryAngle : -swing * 0.24) + reach);
  character.rightArm.rotation.x = ease(character.rightArm.rotation.x, (carrying ? carryAngle : swing * 0.24) + reach);
  character.leftArm.rotation.y = ease(character.leftArm.rotation.y, 0);
  character.rightArm.rotation.y = ease(character.rightArm.rotation.y, 0);
  character.leftArm.rotation.z = ease(character.leftArm.rotation.z, carrying ? -0.12 : -0.1);
  character.rightArm.rotation.z = ease(character.rightArm.rotation.z, carrying ? 0.12 : 0.1);
  const elbowLeft = (carrying ? -1.25 + 0.2 * load : -0.12 - 0.08 * gait - Math.max(0, swing) * 0.12) * (1 - fling * 0.6);
  const elbowRight = (carrying ? -1.25 + 0.2 * load : -0.12 - 0.08 * gait - Math.max(0, -swing) * 0.12) * (1 - fling * 0.6);
  character.leftForearm.rotation.x = ease(character.leftForearm.rotation.x, elbowLeft);
  character.rightForearm.rotation.x = ease(character.rightForearm.rotation.x, elbowRight);
  character.leftForearm.rotation.y = ease(character.leftForearm.rotation.y, 0);
  character.rightForearm.rotation.y = ease(character.rightForearm.rotation.y, 0);
  character.leftForearm.rotation.z = ease(character.leftForearm.rotation.z, 0);
  character.rightForearm.rotation.z = ease(character.rightForearm.rotation.z, 0);
  // A light rise and fall each step, slow breathing at rest, and a crouch for a lift.
  const bob = gait * Math.abs(Math.cos(phase)) * 0.025 + (1 - gait) * Math.sin(state.time * 1.8) * 0.005;
  character.body.position.y = bob - 0.13 * dip;
  // The torso leans into a walk, back under a heavy load and forward over a lift,
  // and sways a little from side to side with the steps.
  const lean = 0.055 * gait - 0.07 * load * (carrying ? 1 : 0) + 0.1 * dip + 0.12 * fling;
  character.body.rotation.x = ease(character.body.rotation.x, lean);
  character.body.rotation.z = ease(character.body.rotation.z, Math.sin(phase) * 0.022 * gait);
}

export { lookToward } from './attention';


/**
 * Turns the root toward `target` (radians about y). A small change twists
 * quickly, as before; a large one while standing still becomes a turn on the
 * spot over `TURN_SECONDS`, noted on the motion record so an imported model
 * steps round on a turn clip while the root comes round at the same pace.
 */
export function faceToward(character: Character, target: number, dt: number, moving: boolean, now: number): void {
  const { root } = character;
  const motion = character.motion;
  const turn = motion?.turn ?? null;
  // Setting off part way through a turn on the spot: the feet are walking now, so the quick twist takes over.
  if (turn && moving && motion) motion.turn = null;
  else if (turn) {
    const progress = Math.min(1, (now - turn.start) / TURN_SECONDS);
    // Ease in and out, the way a step round does.
    const eased = progress * progress * (3 - 2 * progress);
    root.rotation.y = turn.from + turn.angle * eased;
    if (progress >= 1 && motion) motion.turn = null;
    // A new target part way through: finish this turn first; the next frame picks the rest up.
    return;
  }
  let delta = target - root.rotation.y;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  if (motion && !moving && !motion.reduced && Math.abs(delta) > TURN_MIN) {
    motion.turn = { start: now, angle: delta, from: root.rotation.y };
    return;
  }
  root.rotation.y += delta * Math.min(1, dt * 10);
}

/** Seconds a hand-built pose takes to settle in after a change. */
export const POSE_BLEND_SECONDS = 0.22;
/** Seconds to sit down or stand up from a seat: the hips and legs ease between standing and seated. */
export const SEAT_BLEND_SECONDS = 0.45;
/** Seconds a stride takes to build from standing, and to wind down to a stop. */
export const GAIT_START_SECONDS = 0.3;
export const GAIT_STOP_SECONDS = 0.35;

interface PoseSnapshot { start: number; seconds: number; body: boolean; pivots: { pivot: THREE.Object3D; quaternion: THREE.Quaternion }[]; bodyY: number }
const snapshots = new WeakMap<THREE.Object3D, PoseSnapshot>();
const blendTarget = new THREE.Quaternion();
const POSE_PIVOTS: (keyof Character)[] = ['head', 'leftArm', 'rightArm', 'leftForearm', 'rightForearm', 'leftHand', 'rightHand', 'leftLeg', 'rightLeg', 'leftShin', 'rightShin'];

/**
 * Remembers the figure's joints as they are, the moment a pose changes, so
 * the new pose can be blended in from them instead of snapping. `seconds` sets
 * how long the blend takes; `body: false` lets the hips take their new height
 * at once (sitting down inside a car, where rising hips would put the head
 * through the roof).
 */
export function snapshotPose(character: Character, time: number, options: { seconds?: number; body?: boolean } = {}): void {
  snapshots.set(character.root, {
    start: time,
    seconds: options.seconds ?? POSE_BLEND_SECONDS,
    body: options.body ?? true,
    pivots: POSE_PIVOTS.map((key) => { const pivot = character[key] as THREE.Object3D; return { pivot, quaternion: pivot.quaternion.clone() }; }),
    bodyY: character.body.position.y,
  });
}

/** Blends the joints from the last snapshot toward the pose just applied, over the snapshot's seconds. */
export function blendPose(character: Character, time: number): void {
  const snapshot = snapshots.get(character.root);
  if (!snapshot) return;
  const w = (time - snapshot.start) / snapshot.seconds;
  if (w >= 1 || w < 0) { snapshots.delete(character.root); return; }
  const eased = w * w * (3 - 2 * w);
  // The pose just applied is the target: copy it out first, since slerping into the pivot's own quaternion would overwrite it.
  for (const { pivot, quaternion } of snapshot.pivots) pivot.quaternion.slerpQuaternions(quaternion, blendTarget.copy(pivot.quaternion), eased);
  if (snapshot.body) character.body.position.y = snapshot.bodyY + (character.body.position.y - snapshot.bodyY) * eased;
}
