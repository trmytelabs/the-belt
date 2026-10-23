import * as THREE from 'three';

/**
 * Photo-based CC0 surface textures (Poly Haven and ambientCG, see
 * docs/textures.md) for the code-built depot. Each surface has a colour map,
 * an OpenGL normal map and a packed AO/roughness/metalness map, as three.js
 * reads them (R, G, B). Textures are shared: one texture object per map keeps
 * draw-call merging working (merge.ts keys on map identity), so meshes scale
 * their own UVs to world size instead of setting a per-texture repeat.
 */
export type SurfaceName = 'concrete' | 'rubber' | 'steel' | 'paint' | 'cardboard' | 'asphalt' | 'snowpack'
  | 'brick' | 'plaster' | 'siding' | 'wood';

export interface Surface {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  armMap: THREE.Texture;
}

// Asphalt (plowed, with snow in the grain) and packed snow pave the arrival lot and the city; brick and plaster face
// its buildings and the rooms, corrugated siding clads the depot outside, and wood floors and panels the interiors.
const NAMES: SurfaceName[] = ['concrete', 'rubber', 'steel', 'paint', 'cardboard', 'asphalt', 'snowpack', 'brick', 'plaster', 'siding', 'wood'];
const surfaces = new Map<SurfaceName, Surface>();
let loading: Promise<void> | null = null;

/**
 * Load every surface before the depot is built. It never rejects: a missing
 * or slow file leaves the flat colours the depot used before textures.
 */
export function loadSurfaces(timeoutMs = 8000): Promise<void> {
  loading ??= (async () => {
    const loader = new THREE.TextureLoader();
    const base = `${import.meta.env.BASE_URL}textures/`;
    const load = async (file: string, color: boolean): Promise<THREE.Texture> => {
      const texture = await loader.loadAsync(`${base}${file}`);
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      // Shared by every material using it: disposeObject3D leaves it loaded.
      texture.userData.shared = true;
      return texture;
    };
    const all = Promise.all(NAMES.map(async (name) => {
      const [map, normalMap, armMap] = await Promise.all([load(`${name}_color.webp`, true), load(`${name}_normal.webp`, false), load(`${name}_arm.webp`, false)]);
      return [name, { map, normalMap, armMap }] as const;
    }));
    let timer = 0;
    const timeout = new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error('surface textures timed out')), timeoutMs); });
    try {
      for (const [name, surface] of await Promise.race([all, timeout])) surfaces.set(name, surface);
    } catch (error) {
      surfaces.clear();
      console.warn('Depot surface textures unavailable; using flat colours.', error);
    } finally {
      window.clearTimeout(timer);
    }
  })();
  return loading;
}

export const surfacesLoaded = (): boolean => surfaces.size === NAMES.length;

export function getSurface(name: SurfaceName): Surface | undefined {
  return surfaces.get(name);
}

/**
 * Average colour (sRGB) and roughness/metalness (0-1) of each committed map
 * set, measured from public/textures. Dividing by them keeps a textured
 * material's average look equal to the flat material it replaces: the photo
 * adds variation, relief and wear without changing the depot's palette.
 */
export const SURFACE_MEANS: Record<SurfaceName, { color: number; roughness: number; metalness: number }> = {
  concrete: { color: 0x565754, roughness: 0.54, metalness: 0 },
  rubber: { color: 0x2a2c31, roughness: 0.59, metalness: 0 },
  steel: { color: 0x5f6161, roughness: 0.36, metalness: 1 },
  paint: { color: 0xefb33d, roughness: 0.22, metalness: 0.08 },
  cardboard: { color: 0xb98f4d, roughness: 0.64, metalness: 0 },
  asphalt: { color: 0x7c787b, roughness: 0.87, metalness: 0 },
  snowpack: { color: 0x6a6a66, roughness: 0.82, metalness: 0 },
  brick: { color: 0x69534a, roughness: 0.53, metalness: 0 },
  plaster: { color: 0x9e8c78, roughness: 0.62, metalness: 0 },
  siding: { color: 0x585851, roughness: 0.52, metalness: 0.19 },
  wood: { color: 0x7f5f42, roughness: 0.47, metalness: 0 },
};

/** Real-world size in metres of one tile of each building set. */
export const SURFACE_TILE = { brick: 1, plaster: 2, siding: 2, wood: 2 } as const;

/**
 * Surface `name` for vertex-coloured geometry: the photo's grain and relief under the vertex colours, the colour map
 * divided by its average so a vertex colour keeps its brightness; without textures, plain vertex colour.
 */
export function vertexSurfaceMaterial(name: SurfaceName, roughness: number): THREE.MeshStandardMaterial {
  const surface = surfaces.get(name);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness });
  if (!surface) return material;
  const mean = new THREE.Color(SURFACE_MEANS[name].color);
  material.color.setRGB(1 / mean.r, 1 / mean.g, 1 / mean.b);
  material.map = surface.map;
  material.normalMap = surface.normalMap;
  material.roughness = roughness / SURFACE_MEANS[name].roughness;
  material.roughnessMap = surface.armMap;
  return material;
}

/** The colour map of surface `name` once loaded, as an image to draw from, or null. */
export function surfaceImage(name: SurfaceName): CanvasImageSource | null {
  return (surfaces.get(name)?.map.image as CanvasImageSource | undefined) ?? null;
}

/** Real-world size of one tile of the outdoor sets: both photos cover 2 m. */
export const PAVING_TILE = 2;

const cache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * A PBR material for surface `name` standing in for the flat material `flat`,
 * which is returned unchanged when textures are unavailable. With textures,
 * the colour map is tinted (and roughness scaled) so the average matches
 * `flat`. `colorMap: false` keeps only the relief, roughness and wear, for
 * paint in its own colour such as truck bodies. Paint's bare-metal scratches
 * stay metallic; other surfaces keep `flat.metalness`. Identical requests
 * return one material, so their meshes still merge.
 */
export function surfaceMaterial(name: SurfaceName, flat: {
  color: THREE.ColorRepresentation;
  roughness: number;
  metalness?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
}, textured: { colorMap?: boolean; normalScale?: number } = {}): THREE.MeshStandardMaterial {
  const surface = surfaces.get(name);
  const colorMap = textured.colorMap ?? true;
  const normalScale = textured.normalScale ?? 1;
  const mean = SURFACE_MEANS[name];
  const color = new THREE.Color(flat.color);
  let roughness = flat.roughness;
  let metalness = flat.metalness ?? 0;
  if (surface) {
    // Working-space (linear) colour ratios may exceed 1: the photo is darker than the flat colour.
    if (colorMap) {
      const average = new THREE.Color(mean.color);
      color.setRGB(color.r / average.r, color.g / average.g, color.b / average.b);
    }
    roughness /= mean.roughness;
    metalness = name === 'paint' ? 1 : mean.metalness ? metalness / mean.metalness : 0;
  }
  const emissive = new THREE.Color(flat.emissive ?? 0x000000);
  const emissiveIntensity = flat.emissiveIntensity ?? 1;
  const key = [name, surface ? 'pbr' : 'flat', ...color.toArray().map((v) => v.toFixed(4)), roughness.toFixed(3), metalness.toFixed(3), colorMap, normalScale, emissive.getHexString(), emissiveIntensity].join('|');
  let material = cache.get(key);
  if (material) return material;
  material = new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });
  if (surface) {
    if (colorMap) material.map = surface.map;
    material.normalMap = surface.normalMap;
    material.normalScale.setScalar(normalScale);
    // The packed map scales these: roughness and metalness become per-texel.
    material.roughnessMap = surface.armMap;
    material.metalnessMap = surface.armMap;
    if (name === 'concrete') material.aoMap = surface.armMap;
  }
  cache.set(key, material);
  return material;
}

/** Photo cardboard for a carton of flat colour `color` (darker or redder cartons stay so). */
export function cardboardMaterial(color: THREE.ColorRepresentation, roughness = 0.92): THREE.MeshStandardMaterial {
  return surfaceMaterial('cardboard', { color, roughness });
}

/** Multiply a geometry's UVs, e.g. to make one texture tile span `tile` metres. */
export function scaleUVs<T extends THREE.BufferGeometry>(geometry: T, u: number, v: number): T {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!uv) return geometry;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
  uv.needsUpdate = true;
  return geometry;
}

/**
 * Box-project UVs from the geometry's own positions, so one texture tile
 * spans `tile` metres on every face whatever the box's size. Each vertex uses
 * the axis its normal faces most, which suits boxes and rounded boxes.
 */
export function boxUVs<T extends THREE.BufferGeometry>(geometry: T, tile: number): T {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal) return geometry;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const ax = Math.abs(normal.getX(i));
    const ay = Math.abs(normal.getY(i));
    const az = Math.abs(normal.getZ(i));
    const x = position.getX(i) / tile;
    const y = position.getY(i) / tile;
    const z = position.getZ(i) / tile;
    const [u, v] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}
