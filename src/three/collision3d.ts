import * as THREE from 'three';

/** Bounds of visible solid meshes, excluding floating labels and painted text.
 * Unlike Box3.setFromObject this follows ancestor visibility and never lets a
 * hidden parcel, name sprite or route sign enlarge a person's physical body.
 * For articulated people this is a conservative axis-aligned inspection box;
 * authored movement uses the shared model's tighter ground footprints.
 */
export function physicalBounds(root: THREE.Object3D, target = new THREE.Box3()): THREE.Box3 {
  target.makeEmpty();
  root.updateWorldMatrix(true, true);
  const piece = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  const visit = (object: THREE.Object3D): void => {
    if (!object.visible || object.userData.solid === false) return;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox;
      if (bounds) {
        const instances = mesh as THREE.InstancedMesh;
        if (instances.isInstancedMesh) {
          for (let i = 0; i < instances.count; i += 1) {
            instances.getMatrixAt(i, matrix);
            matrix.premultiply(mesh.matrixWorld);
            target.union(piece.copy(bounds).applyMatrix4(matrix));
          }
        } else target.union(piece.copy(bounds).applyMatrix4(mesh.matrixWorld));
      }
    }
    object.children.forEach(visit);
  };
  visit(root);
  return target;
}
