import * as THREE from 'three';
import { textTexture } from './space';

/** Surprise freight a parcel can carry (`SURPRISE_3D`). */
export type SurpriseKind = 'mystery' | 'fragile';

const STYLE: Record<SurpriseKind, { text: string; width: number; color: string; background: string }> = {
  mystery: { text: '?  MYSTERY BOX', width: 170, color: '#1d0b3a', background: '#c3a2ff' },
  fragile: { text: 'FRAGILE · CARRY', width: 170, color: '#2c0606', background: '#ff8a7a' },
};
/** The label's height in metres. */
const LABEL_HEIGHT = 0.24;

/** A surprise parcel's label, hung just above its address tag. */
export interface SurpriseMarker {
  root: THREE.Group;
  label: THREE.Sprite;
  kind: SurpriseKind;
}

export function createSurpriseMarker(kind: SurpriseKind): SurpriseMarker {
  const root = new THREE.Group();
  root.name = `surprise-${kind}`;
  root.userData.solid = false;
  const style = STYLE[kind];
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textTexture([style.text], { width: style.width, height: 30, radius: 6, color: style.color, background: style.background }),
    depthTest: false, depthWrite: false, transparent: true,
  }));
  label.name = 'surprise-label';
  label.center.set(0.5, 0);
  label.renderOrder = 9;
  label.scale.set(LABEL_HEIGHT * style.width / 30, LABEL_HEIGHT, 1);
  root.add(label);
  return { root, label, kind };
}

/** How far a marker lifts the grab prompt that would otherwise sit over it. */
export const SURPRISE_PROMPT_LIFT = LABEL_HEIGHT + 0.08;

/**
 * Hangs the label just above the address tag (a sprite anchored at its foot, `tagY` up the parcel's frame and
 * `tagHeight` tall); a mystery box's label bobs. Both face the camera, so the label is stacked in the sprites' own
 * frame, up the screen: lifted along the world's up instead, the play camera's downward look foreshortened the lift
 * and the label sat over the tag's street number.
 */
export function updateSurpriseMarker(marker: SurpriseMarker, tagY: number, tagHeight: number, time: number, reducedMotion: boolean): void {
  const bob = marker.kind === 'mystery' && !reducedMotion ? 0.05 * Math.sin(time * 4) : 0;
  marker.label.position.set(0, tagY, 0);
  marker.label.center.set(0.5, -(tagHeight + 0.05 + bob) / LABEL_HEIGHT);
}
