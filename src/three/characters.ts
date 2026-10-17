import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { mergeStatic } from './merge';
import { shadowed, standard, textSprite } from './space';

export type HairStyle = 'short' | 'long' | 'curly' | 'bun' | 'bald' | 'mullet' | 'slick';
export type Headwear = 'none' | 'termiteHat' | 'beanie';

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
  moustache?: boolean;
  beard?: boolean;
  tie?: number;
  /** Keeps the skin as a live material (Shan reddens while ranting). */
  dynamicSkin?: boolean;
  necklace?: boolean;
  overalls?: number;
  vest?: number;
}

/** A low-poly person with pivots for walking, carrying and gestures. */
export interface Character {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  /** Face/shirt materials that some gags recolor (Shan reddening). */
  skinMaterial: THREE.MeshStandardMaterial;
  nameTag: THREE.Sprite;
  headHeight: number;
  walkPhase: number;
}

const box = (w: number, h: number, d: number, material: THREE.Material, radius = 0.04): THREE.Mesh =>
  new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2)), material);

function limb(material: THREE.Material, length: number, width: number, end: THREE.Material, endSize: THREE.Vector3): THREE.Group {
  const pivot = new THREE.Group();
  const segment = box(width, length, width, material, width * 0.45);
  segment.position.y = -length / 2;
  const tip = box(endSize.x, endSize.y, endSize.z, end, 0.03);
  tip.position.set(0, -length - endSize.y / 2 + 0.02, endSize.z > endSize.x ? endSize.z * 0.18 : 0);
  pivot.add(segment, tip);
  return pivot;
}

export function createCharacter(spec: CharacterSpec): Character {
  const root = new THREE.Group();
  root.name = spec.name;
  const body = new THREE.Group();
  root.add(body);
  const skinMaterial = standard(spec.skin, 0.62);
  const shirt = standard(spec.shirt, 0.82);
  const pants = standard(spec.pants, 0.85);
  const shoes = spec.barefoot ? skinMaterial : standard(spec.shoes ?? 0x23262a, 0.6);
  const hair = standard(spec.hair, 0.9);

  const leftLeg = limb(pants, 0.62, 0.17, shoes, new THREE.Vector3(0.17, 0.09, 0.28));
  const rightLeg = limb(pants, 0.62, 0.17, shoes, new THREE.Vector3(0.17, 0.09, 0.28));
  leftLeg.position.set(-0.11, 0.72, 0);
  rightLeg.position.set(0.11, 0.72, 0);
  body.add(leftLeg, rightLeg);

  const torso = box(0.46, 0.6, 0.27, shirt, 0.09);
  torso.position.y = 1.02;
  body.add(torso);
  if (spec.overalls !== undefined) {
    const bib = box(0.34, 0.34, 0.03, standard(spec.overalls, 0.85), 0.02);
    bib.position.set(0, 0.92, 0.14);
    const strapMaterial = standard(spec.overalls, 0.85);
    for (const side of [-1, 1]) {
      const strap = box(0.06, 0.32, 0.02, strapMaterial, 0.01);
      strap.position.set(side * 0.13, 1.15, 0.14);
      body.add(strap);
    }
    body.add(bib);
  }
  if (spec.vest !== undefined) {
    const vestMaterial = new THREE.MeshStandardMaterial({ color: spec.vest, roughness: 0.6, emissive: spec.vest, emissiveIntensity: 0.12 });
    for (const side of [-1, 1]) {
      const panel = box(0.17, 0.5, 0.29, vestMaterial, 0.05);
      panel.position.set(side * 0.13, 1.03, 0.005);
      body.add(panel);
    }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.3), new THREE.MeshStandardMaterial({ color: 0xdfe6e8, emissive: 0x99a0a2, emissiveIntensity: 0.4 }));
    stripe.position.y = 0.95;
    body.add(stripe);
  }
  if (spec.tie !== undefined) {
    const tie = box(0.08, 0.36, 0.02, standard(spec.tie, 0.5), 0.015);
    tie.position.set(0, 1.08, 0.145);
    body.add(tie);
  }
  if (spec.necklace) {
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 18, Math.PI), standard(0xe8c25a, 0.3, 0.8));
    chain.rotation.set(Math.PI * 0.62, 0, Math.PI);
    chain.position.set(0, 1.27, 0.07);
    body.add(chain);
  }

  const leftArm = limb(shirt, 0.5, 0.14, skinMaterial, new THREE.Vector3(0.13, 0.13, 0.13));
  const rightArm = limb(shirt, 0.5, 0.14, skinMaterial, new THREE.Vector3(0.13, 0.13, 0.13));
  leftArm.position.set(-0.31, 1.28, 0);
  rightArm.position.set(0.31, 1.28, 0);
  body.add(leftArm, rightArm);

  const head = new THREE.Group();
  head.position.y = 1.36;
  body.add(head);
  const neck = box(0.13, 0.08, 0.13, skinMaterial, 0.04);
  neck.position.y = 0.02;
  const skull = box(0.36, 0.38, 0.34, skinMaterial, 0.1);
  skull.position.y = 0.24;
  head.add(neck, skull);
  const eyeMaterial = standard(0x15181b, 0.4);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), eyeMaterial);
    eye.position.set(side * 0.08, 0.27, 0.17);
    head.add(eye);
  }
  const nose = box(0.06, 0.08, 0.06, skinMaterial, 0.02);
  nose.position.set(0, 0.21, 0.19);
  head.add(nose);

  addHair(head, spec, hair);
  if (spec.headwear === 'termiteHat') {
    const hatMaterial = standard(0xe7c04e, 0.55);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hatMaterial);
    crown.position.y = 0.4;
    crown.scale.set(1.02, 0.85, 1.02);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 20), hatMaterial);
    brim.position.set(0, 0.41, 0.04);
    const badge = textSprite(['T'], 0.1, { width: 32, height: 32, color: '#5b4316' });
    badge.position.set(0, 0.5, 0.2);
    head.add(crown, brim, badge);
  } else if (spec.headwear === 'beanie') {
    const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), standard(0x3b5874, 0.95));
    beanie.position.y = 0.38;
    head.add(beanie);
  }
  if (spec.glasses) {
    const frame = standard(0x1a1a1a, 0.3);
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 14), frame);
      lens.position.set(side * 0.08, 0.27, 0.18);
      head.add(lens);
    }
    const bridge = box(0.06, 0.012, 0.012, frame, 0.004);
    bridge.position.set(0, 0.275, 0.185);
    head.add(bridge);
  }
  if (spec.moustache) {
    const stache = box(0.16, 0.04, 0.04, hair, 0.015);
    stache.position.set(0, 0.16, 0.18);
    head.add(stache);
  }
  if (spec.beard) {
    const beard = box(0.32, 0.14, 0.12, hair, 0.05);
    beard.position.set(0, 0.1, 0.13);
    head.add(beard);
  }

  const nameTag = textSprite([spec.name], 0.2, { width: Math.max(80, spec.name.length * 13 + 20), height: 26, background: '#14262dd8', color: '#f0e7cf', radius: 8 });
  nameTag.position.y = 2.05;
  root.add(nameTag);

  if (spec.dynamicSkin) body.traverse((child) => {
    if ((child as THREE.Mesh).material === skinMaterial) child.userData.keepMaterial = true;
  });
  const scale = spec.scale ?? 1;
  root.scale.setScalar(scale);
  shadowed(body, true, false);
  return {
    root, body, head, leftArm, rightArm, leftLeg, rightLeg, skinMaterial, nameTag,
    headHeight: 1.85 * scale, walkPhase: Math.random() * Math.PI * 2,
  };
}

function addHair(head: THREE.Group, spec: CharacterSpec, hair: THREE.Material): void {
  if (spec.hairStyle === 'bald') return;
  const cap = box(0.38, 0.12, 0.36, hair, 0.06);
  cap.position.y = 0.43;
  head.add(cap);
  if (spec.hairStyle === 'long' || spec.hairStyle === 'mullet') {
    const length = spec.hairStyle === 'long' ? 0.62 : 0.34;
    const back = box(0.4, length, 0.12, hair, 0.05);
    back.position.set(0, 0.45 - length / 2, -0.16);
    head.add(back);
    if (spec.hairStyle === 'long') {
      for (const side of [-1, 1]) {
        const strand = box(0.08, 0.5, 0.26, hair, 0.035);
        strand.position.set(side * 0.2, 0.2, -0.02);
        head.add(strand);
      }
    }
  } else if (spec.hairStyle === 'curly') {
    for (let i = 0; i < 9; i += 1) {
      const curl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), hair);
      const angle = i / 9 * Math.PI * 2;
      curl.position.set(Math.cos(angle) * 0.17, 0.42 + Math.sin(i * 1.7) * 0.03, Math.sin(angle) * 0.16 - 0.02);
      head.add(curl);
    }
    for (const side of [-1, 1]) {
      const side_ = box(0.07, 0.34, 0.28, hair, 0.03);
      side_.position.set(side * 0.2, 0.26, -0.03);
      head.add(side_);
    }
  } else if (spec.hairStyle === 'bun') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), hair);
    bun.position.set(0, 0.5, -0.14);
    head.add(bun);
  } else if (spec.hairStyle === 'slick') {
    const quiff = box(0.3, 0.08, 0.14, hair, 0.04);
    quiff.position.set(0, 0.49, 0.1);
    head.add(quiff);
  }
}

/** Merges each rigid part once props are attached; pivots stay animatable. */
export function mergeCharacter(character: Character): void {
  const pivots = new Set<THREE.Object3D>([character.head, character.leftArm, character.rightArm, character.leftLeg, character.rightLeg]);
  const keep = (object: THREE.Object3D): boolean => pivots.has(object) || object.userData.keep === true;
  mergeStatic(character.body, keep);
  for (const pivot of pivots) mergeStatic(pivot, (object) => object.userData.keep === true);
}

/** Walk cycle plus carrying/idle arm poses. Call every frame. */
export function animateCharacter(character: Character, dt: number, state: {
  moving: boolean; carrying?: boolean; speed?: number; reducedMotion?: boolean; time: number;
}): void {
  const { moving, carrying = false, speed = 1 } = state;
  if (moving && !state.reducedMotion) character.walkPhase += dt * 9 * speed;
  const swing = moving && !state.reducedMotion ? Math.sin(character.walkPhase) : 0;
  const ease = (current: number, target: number): number => current + (target - current) * Math.min(1, dt * 14);
  character.leftLeg.rotation.x = ease(character.leftLeg.rotation.x, swing * 0.6);
  character.rightLeg.rotation.x = ease(character.rightLeg.rotation.x, -swing * 0.6);
  const carryAngle = -1.25;
  character.leftArm.rotation.x = ease(character.leftArm.rotation.x, carrying ? carryAngle : -swing * 0.5);
  character.rightArm.rotation.x = ease(character.rightArm.rotation.x, carrying ? carryAngle : swing * 0.5);
  character.leftArm.rotation.z = ease(character.leftArm.rotation.z, carrying ? -0.18 : 0.06);
  character.rightArm.rotation.z = ease(character.rightArm.rotation.z, carrying ? 0.18 : -0.06);
  const bob = moving && !state.reducedMotion ? Math.abs(Math.sin(character.walkPhase)) * 0.05 : Math.sin(state.time * 1.8) * 0.008;
  character.body.position.y = bob;
}
