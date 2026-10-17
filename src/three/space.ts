import * as THREE from 'three';

import { ROUTE_INFO, SHIFT_LAYOUT, type Route } from '../game/slice/ShiftModel';

/**
 * ShiftModel works in the 2D depot's pixel space. The 3D world keeps those
 * rules untouched and maps one model pixel to 1/32 of a world unit (metre):
 * model x runs east (+X), model y runs south (+Z), height is +Y.
 */
export const WORLD_SCALE = 1 / 32;
const ORIGIN = { x: SHIFT_LAYOUT.beltX, y: 340 };

export const toWorldX = (x: number): number => (x - ORIGIN.x) * WORLD_SCALE;
export const toWorldZ = (y: number): number => (y - ORIGIN.y) * WORLD_SCALE;
export const toWorld = (point: { x: number; y: number }, height = 0): THREE.Vector3 =>
  new THREE.Vector3(toWorldX(point.x), height, toWorldZ(point.y));
export const setFromModel = (target: THREE.Vector3, point: { x: number; y: number }, height = target.y): THREE.Vector3 =>
  target.set(toWorldX(point.x), height, toWorldZ(point.y));

export const BELT_HEIGHT = 0.78;
export const BELT_WIDTH = 64 * WORLD_SCALE;

/** Every destination's colour; letters and names always accompany it. */
export const ROUTE_COLORS = Object.fromEntries(Object.values(ROUTE_INFO).map((info) => [info.route, info.color])) as Record<Route, string>;

export const PALETTE = {
  floor: 0x3a4a4e,
  floorDark: 0x2b383c,
  wall: 0x1d2a30,
  metal: 0x5d6a70,
  metalDark: 0x2c3438,
  rubber: 0x1b1f22,
  safety: 0xf2c14e,
  lampWarm: 0xffd9a0,
  cardboard: 0xb8875a,
  cardboardDark: 0x8e6440,
} as const;

/** Canvas-backed text, rendered at 2x so close cameras stay crisp. */
export function textTexture(lines: string[], options: {
  width: number; height: number; background?: string; color?: string; font?: string;
  border?: string; radius?: number; padding?: number;
}): THREE.CanvasTexture {
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = options.width * scale;
  canvas.height = options.height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  const radius = options.radius ?? 6;
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.beginPath();
    ctx.roundRect(1, 1, options.width - 2, options.height - 2, radius);
    ctx.fill();
  }
  if (options.border) {
    ctx.strokeStyle = options.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(2, 2, options.width - 4, options.height - 4, radius);
    ctx.stroke();
  }
  const padding = options.padding ?? 6;
  let fontSize = Math.min(options.height / lines.length * 0.72, 64);
  const font = (size: number): string => (options.font ?? '800 SIZEpx "Segoe UI", Arial, sans-serif').replace('SIZE', String(size));
  ctx.font = font(fontSize);
  const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
  if (widest > options.width - padding * 2) fontSize *= (options.width - padding * 2) / widest;
  ctx.font = font(fontSize);
  ctx.fillStyle = options.color ?? '#1d2328';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lineHeight = fontSize * 1.1;
  const top = options.height / 2 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, index) => ctx.fillText(line, options.width / 2, top + index * lineHeight + fontSize * 0.04));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A plane showing text, for nameplates painted onto props. */
export function textPlane(lines: string[], width: number, height: number, options: Parameters<typeof textTexture>[1]): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({ map: textTexture(lines, options), roughness: 0.7, transparent: !options.background });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

/** A camera-facing label (parcel tags, name tags). */
export function textSprite(lines: string[], worldHeight: number, options: Parameters<typeof textTexture>[1]): THREE.Sprite {
  const material = new THREE.SpriteMaterial({ map: textTexture(lines, options), depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(worldHeight * options.width / options.height, worldHeight, 1);
  return sprite;
}

export function softDotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export const standard = (color: THREE.ColorRepresentation, roughness = 0.75, metalness = 0): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Marks every mesh in a group as a shadow caster/receiver. */
export function shadowed<T extends THREE.Object3D>(object: T, cast = true, receive = true): T {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
  return object;
}
