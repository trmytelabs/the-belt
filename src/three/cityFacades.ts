import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityBuilding } from './drivingCity';
import { WINDOW, mulberry } from './cityWindows';

/**
 * The city's buildings for the drives (the 3D depot only), as two merged meshes:
 * the walls (each block tinted, with a darker roof and a parapet round its top)
 * and the window panels, one tiled window cell per window on the same grid the
 * lit windows use (`cityWindows.ts`), so every lit window sits in a frame of
 * glass on the facade. The Kenney building models these replace were stretched
 * to each block's size, so their windows grew with the building; here a tall
 * block gets more floors, not taller windows.
 */

/** Wall tints: brick, sand, concrete, blue-grey, cream, dark brick. */
export const FACADE_TINTS = [0x9a5544, 0xc8b89a, 0x8e9291, 0x6e7d8a, 0xd9cfb8, 0x6e3f35];
const ROOF = new THREE.Color(0x3c3f42);
const PARAPET = { height: 0.7, thickness: 0.35 } as const;
/** Window panels stand this far proud of the wall; the lit windows sit at `WINDOW.inset`, further out. */
const PANEL_OUT = 0.02;

/** The facade's window cell, drawn once: wall round a framed, dark pane with a sill. Wall areas are light, for the tint. */
function windowCell(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 208; canvas.height = 256;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#e9e6e0';
  g.fillRect(0, 0, 208, 256);
  // Faint courses in the wall, so it is not a flat colour.
  g.fillStyle = 'rgba(0,0,0,0.05)';
  for (let y = 6; y < 256; y += 16) g.fillRect(0, y, 208, 2);
  // The pane: the lit window covers exactly this (WINDOW.width by WINDOW.height of a 2.6 by 3.2 m cell).
  const w = 208 * WINDOW.width / WINDOW.spacing, h = 256 * WINDOW.height / WINDOW.floor;
  const x = (208 - w) / 2, y = (256 - h) / 2;
  g.fillStyle = '#3a3f44';
  g.fillRect(x - 7, y - 7, w + 14, h + 14);
  const glass = g.createLinearGradient(x, y, x + w, y + h);
  glass.addColorStop(0, '#2c3d52'); glass.addColorStop(0.55, '#16202c'); glass.addColorStop(1, '#0f161f');
  g.fillStyle = glass;
  g.fillRect(x, y, w, h);
  // A mullion and a transom.
  g.fillStyle = '#3a3f44';
  g.fillRect(x + w / 2 - 2, y, 4, h);
  g.fillRect(x, y + h * 0.3, w, 3);
  // The sill.
  g.fillStyle = '#cfcac0';
  g.fillRect(x - 10, y + h + 7, w + 20, 7);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

const tinted = (geometry: THREE.BufferGeometry, colour: THREE.Color): THREE.BufferGeometry => {
  const count = geometry.attributes.position.count, colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) colour.toArray(colours, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geometry;
};

/** The number of window columns on a face of this length and of floors on a block this tall, as `layoutWindows` counts them. */
export function windowGrid(length: number, height: number): { columns: number; floors: number } {
  return {
    columns: Math.max(0, Math.floor((length - 2) / WINDOW.spacing)),
    floors: Math.max(0, Math.floor((height - WINDOW.firstFloor - WINDOW.height / 2) / WINDOW.floor) + 1),
  };
}

export function createCityFacades(buildings: CityBuilding[], seed = 11): THREE.Group {
  const random = mulberry(seed);
  const walls: THREE.BufferGeometry[] = [], panels: THREE.BufferGeometry[] = [];
  for (const building of buildings) {
    const { x, z, width, depth, height } = building;
    const tint = new THREE.Color(FACADE_TINTS[Math.floor(random() * FACADE_TINTS.length)]);
    // The block, its top face in the roof's colour.
    const block = tinted(new THREE.BoxGeometry(width, height, depth), tint);
    const colours = block.attributes.color as THREE.BufferAttribute, normals = block.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < colours.count; i += 1) if (normals.getY(i) > 0.5) colours.setXYZ(i, ROOF.r, ROOF.g, ROOF.b);
    block.translate(x, height / 2, z);
    walls.push(block);
    // The parapet round the roof's edge.
    const rim = tint.clone().multiplyScalar(0.82);
    for (const [w, d, ox, oz] of [[width, PARAPET.thickness, 0, depth / 2], [width, PARAPET.thickness, 0, -depth / 2],
      [PARAPET.thickness, depth, width / 2, 0], [PARAPET.thickness, depth, -width / 2, 0]] as const) {
      walls.push(tinted(new THREE.BoxGeometry(w, PARAPET.height, d), rim).translate(x + ox, height + PARAPET.height / 2, z + oz));
    }
    // A window panel on each face, one cell per window, centred as layoutWindows centres them.
    for (const face of [
      { length: depth, rotationY: Math.PI / 2, out: new THREE.Vector3(width / 2 + PANEL_OUT, 0, 0) },
      { length: depth, rotationY: -Math.PI / 2, out: new THREE.Vector3(-width / 2 - PANEL_OUT, 0, 0) },
      { length: width, rotationY: 0, out: new THREE.Vector3(0, 0, depth / 2 + PANEL_OUT) },
      { length: width, rotationY: Math.PI, out: new THREE.Vector3(0, 0, -depth / 2 - PANEL_OUT) },
    ]) {
      const { columns, floors } = windowGrid(face.length, height);
      if (!columns || !floors) continue;
      const panel = tinted(new THREE.PlaneGeometry(columns * WINDOW.spacing, floors * WINDOW.floor), tint);
      const uv = panel.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * columns, uv.getY(i) * floors);
      panel.rotateY(face.rotationY);
      // The first row's panes are centred WINDOW.firstFloor up; each cell is a floor tall.
      panel.translate(x + face.out.x, WINDOW.firstFloor - WINDOW.floor / 2 + floors * WINDOW.floor / 2, z + face.out.z);
      panels.push(panel);
    }
  }
  const group = new THREE.Group();
  group.name = 'city-facades';
  group.userData.keep = true;
  const wallMesh = new THREE.Mesh(mergeGeometries(walls), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  wallMesh.name = 'city-walls';
  const panelMesh = new THREE.Mesh(mergeGeometries(panels), new THREE.MeshStandardMaterial({ vertexColors: true, map: windowCell(), roughness: 0.75 }));
  panelMesh.name = 'city-window-panels';
  for (const mesh of [wallMesh, panelMesh]) { mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); }
  for (const geometry of [...walls, ...panels]) geometry.dispose();
  return group;
}
