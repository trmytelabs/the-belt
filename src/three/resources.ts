import * as THREE from 'three';

/** Release an owned scene subtree, including canvas labels, when it leaves play.
 * Sprite geometry belongs to Three.js and is shared across all sprites.
 * Call only for exclusively owned subtrees; pooled effects own their texture.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const renderable = object as THREE.Mesh;
    if (renderable.geometry && !(object as THREE.Sprite).isSprite) geometries.add(renderable.geometry);
    if (renderable.material) {
      for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    }
    if (object instanceof THREE.Light) object.shadow?.dispose();
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  root.removeFromParent();
}
