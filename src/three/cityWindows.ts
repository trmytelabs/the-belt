import * as THREE from 'three';
import type { CityBuilding } from './drivingCity';

/**
 * Lit windows on the city's buildings at night (the 3D depot only): one
 * instanced mesh of unlit quads laid out on every building's four faces,
 * about half of them lit in warm, cool or dim light, so the Kenney facades
 * (a single palette texture with no lit windows of their own) read as
 * occupied blocks under the bloom instead of dark slabs.
 */
export const WINDOW = { width: 1.2, height: 1.5, floor: 3.2, firstFloor: 1.9, spacing: 2.6, inset: 0.06, lit: 0.45 } as const;
const COLOURS: [number, number][] = [[0xffd9a0, 0.7], [0xcfe3ff, 0.9], [0x9a7a50, 1]];

/** A small deterministic generator, so the same windows light every night and in every check. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface WindowPlacement { x: number; y: number; z: number; rotationY: number; colour: number }

/** Every lit window's place and colour for `buildings`. */
export function layoutWindows(buildings: CityBuilding[], seed = 7): WindowPlacement[] {
  const random = mulberry(seed);
  const out: WindowPlacement[] = [];
  for (const building of buildings) {
    const floors = Math.max(0, Math.floor((building.height - WINDOW.firstFloor - WINDOW.height / 2) / WINDOW.floor) + 1);
    // Each face: its outward normal's axis and sign, the face's half-length along the other axis.
    const faces: { axis: 'x' | 'z'; sign: 1 | -1; length: number; rotationY: number }[] = [
      { axis: 'x', sign: 1, length: building.depth, rotationY: Math.PI / 2 },
      { axis: 'x', sign: -1, length: building.depth, rotationY: -Math.PI / 2 },
      { axis: 'z', sign: 1, length: building.width, rotationY: 0 },
      { axis: 'z', sign: -1, length: building.width, rotationY: Math.PI },
    ];
    for (const face of faces) {
      const count = Math.max(0, Math.floor((face.length - 2) / WINDOW.spacing));
      const span = (count - 1) * WINDOW.spacing;
      for (let floor = 0; floor < floors; floor += 1) {
        const y = WINDOW.firstFloor + floor * WINDOW.floor;
        for (let i = 0; i < count; i += 1) {
          const along = -span / 2 + i * WINDOW.spacing;
          const roll = random();
          if (roll > WINDOW.lit) continue;
          const shade = random();
          const colour = COLOURS.find(([, upTo]) => shade <= upTo)![0];
          const out1 = face.sign * ((face.axis === 'x' ? building.width : building.depth) / 2 + WINDOW.inset);
          out.push(face.axis === 'x'
            ? { x: building.x + out1, y, z: building.z + along, rotationY: face.rotationY, colour }
            : { x: building.x + along, y, z: building.z + out1, rotationY: face.rotationY, colour });
        }
      }
    }
  }
  return out;
}

/** The windows as one draw call. */
export function createCityWindows(buildings: CityBuilding[], seed = 7): THREE.InstancedMesh {
  const placements = layoutWindows(buildings, seed);
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(WINDOW.width, WINDOW.height), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, placements.length));
  mesh.name = 'city-windows';
  mesh.userData.keep = true;
  const matrix = new THREE.Matrix4(), colour = new THREE.Color();
  placements.forEach((window, i) => {
    matrix.makeRotationY(window.rotationY).setPosition(window.x, window.y, window.z);
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, colour.setHex(window.colour));
  });
  mesh.count = placements.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}
