import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Draw-call reduction. Meshes that never move relative to `root` are merged
 * into one mesh per compatible material, with per-object colour baked into
 * vertex colours. Software renderers and phones pay per draw call, so the
 * warehouse, truck bodies, character limbs and parcel bodies are merged once
 * after they are built. Anything animated independently is passed in `keep`
 * (its whole subtree is left alone), as is any mesh flagged
 * `userData.keepMaterial` (for example Shan's skin, which reddens).
 */
export function mergeStatic(root: THREE.Object3D, keep: (object: THREE.Object3D) => boolean = () => false): void {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[]; sources: THREE.Mesh[]; cast: boolean; receive: boolean; solid: boolean }>();
  const merged: THREE.Mesh[] = [];

  const visit = (object: THREE.Object3D): void => {
    for (const child of [...object.children]) {
      if (keep(child) || !child.visible) continue;
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && !(mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh && !Array.isArray(mesh.material) && mesh.children.length === 0) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (!material.isMeshStandardMaterial || (material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial || mesh.userData.keepMaterial) {
          visit(child);
          continue;
        }
        const key = materialKey(material, mesh);
        let group = groups.get(key);
        if (!group) {
          const shared = material.clone();
          shared.roughness = Math.round(material.roughness * 4) / 4;
          shared.metalness = Math.round(material.metalness * 4) / 4;
          if (!material.map) {
            shared.color.set(0xffffff);
            shared.vertexColors = true;
          }
          group = { material: shared, geometries: [], sources: [], cast: mesh.castShadow, receive: mesh.receiveShadow, solid: mesh.userData.solid !== false };
          groups.set(key, group);
        }
        group.geometries.push(bake(mesh, inverse, material.map ? null : material.color));
        group.sources.push(mesh);
        continue;
      }
      visit(child);
    }
  };
  visit(root);

  for (const group of groups.values()) {
    const geometry = group.geometries.length === 1 ? group.geometries[0] : mergeGeometries(group.geometries, false);
    if (!geometry) {
      // Keep the original meshes if a future material/attribute combination
      // cannot merge. Removing them before success silently erased geometry.
      group.geometries.forEach((part) => part.dispose());
      group.material.dispose();
      continue;
    }
    if (group.geometries.length > 1) group.geometries.forEach((part) => part.dispose());
    group.sources.forEach((source) => source.removeFromParent());
    const mesh = new THREE.Mesh(geometry, group.material);
    mesh.castShadow = group.cast;
    mesh.receiveShadow = group.receive;
    mesh.name = 'merged';
    mesh.userData.solid = group.solid;
    merged.push(mesh);
  }
  for (const mesh of merged) root.add(mesh);
}

function materialKey(material: THREE.MeshStandardMaterial, mesh: THREE.Mesh): string {
  return [
    material.map?.uuid ?? '', material.emissiveMap?.uuid ?? '',
    // Photo surfaces (textures.ts) also carry relief and packed AO/roughness/
    // metalness maps; tinted paint has these without a colour map.
    material.normalMap?.uuid ?? '', material.normalScale.x.toFixed(2),
    material.roughnessMap?.uuid ?? '', material.metalnessMap?.uuid ?? '', material.aoMap?.uuid ?? '',
    // Close roughness/metalness values share a draw call; the difference is not visible.
    Math.round(material.roughness * 4) / 4, Math.round(material.metalness * 4) / 4,
    material.emissive.getHexString(), material.emissiveIntensity.toFixed(2),
    material.transparent, material.opacity.toFixed(2), material.side, material.depthWrite,
    material.map ? material.color.getHexString() : '',
    mesh.castShadow, mesh.receiveShadow, mesh.userData.solid !== false,
  ].join('|');
}

/** A world-to-root baked, non-indexed copy with position/normal/uv/color. */
function bake(mesh: THREE.Mesh, inverse: THREE.Matrix4, color: THREE.Color | null): THREE.BufferGeometry {
  let geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  // Trucks and character parts can be merged a second time with their parent.
  // Preserve already-baked vertex colours instead of replacing them with white.
  const priorColors = (mesh.material as THREE.MeshStandardMaterial).vertexColors ? geometry.getAttribute('color') : null;
  for (const name of Object.keys(geometry.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
  }
  geometry.morphAttributes = {};
  const count = geometry.attributes.position.count;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  const colors = new Float32Array(count * 3);
  const c = color ?? new THREE.Color(0xffffff);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = c.r * (priorColors?.getX(i) ?? 1);
    colors[i * 3 + 1] = c.g * (priorColors?.getY(i) ?? 1);
    colors[i * 3 + 2] = c.b * (priorColors?.getZ(i) ?? 1);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
  geometry.clearGroups();
  geometry = geometry.index ? geometry.toNonIndexed() : geometry;
  return geometry;
}
