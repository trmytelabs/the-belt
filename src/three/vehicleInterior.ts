import * as THREE from 'three';

/**
 * A small generated interior for the imported sedans (the 3D depot only):
 * two front seats with head rests, a rear bench, a dashboard with a glossy
 * top, a steering wheel on the driver's side and door cards. It only has to
 * hold up through the windows from outside, so it is about 600 triangles of
 * dark fabric and plastic. Built in the car's own frame: the nose is +x, the
 * driver sits at +z (where `StoryStage.seat` puts the driver), y is up.
 */
export function createSedanInterior(): THREE.Group {
  const interior = new THREE.Group();
  interior.name = 'vehicle-interior';
  // A touch of emissive stands in for the dome and dash glow, so the cabin is not a black hole through the glass.
  const fabric = new THREE.MeshStandardMaterial({ color: 0x3b3a42, roughness: 0.96, metalness: 0, emissive: 0x16161a, emissiveIntensity: 0.7 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x24242a, roughness: 0.62, metalness: 0.05, emissive: 0x0e0e12, emissiveIntensity: 0.7 });
  const gloss = new THREE.MeshStandardMaterial({ color: 0x1a1b20, roughness: 0.28, metalness: 0.1 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.5, metalness: 0.1 });
  const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    interior.add(mesh);
    return mesh;
  };

  // Everything stays inside the cabin, which on the fitted sedan runs from about
  // x −1.3 (rear deck) to x 0.85 (windscreen base) and ±0.75 at the doors.
  // Floor and transmission tunnel.
  box(2.1, 0.04, 1.4, plastic, -0.25, 0.42, 0);
  box(1.9, 0.14, 0.2, plastic, -0.2, 0.49, 0);

  // Front seats: cushion, raked backrest, head rest.
  for (const z of [0.38, -0.38]) {
    box(0.5, 0.14, 0.46, fabric, -0.22, 0.56, z);
    const back = box(0.12, 0.54, 0.46, fabric, -0.5, 0.88, z);
    back.rotation.z = 0.2;
    box(0.14, 0.14, 0.24, fabric, -0.57, 1.2, z);
  }
  // Rear bench against the rear bulkhead, under the rear window.
  box(0.46, 0.14, 1.2, fabric, -0.98, 0.56, 0);
  const rearBack = box(0.12, 0.5, 1.2, fabric, -1.2, 0.86, 0);
  rearBack.rotation.z = 0.18;
  for (const z of [0.34, -0.34]) box(0.14, 0.12, 0.24, fabric, -1.24, 1.14, z);

  // Dashboard: a low slab with a glossy top, and the instrument hood in front of the driver.
  box(0.36, 0.24, 1.4, plastic, 0.72, 0.8, 0);
  box(0.38, 0.03, 1.42, gloss, 0.72, 0.935, 0);
  box(0.2, 0.08, 0.36, plastic, 0.6, 0.98, 0.38);

  // Steering wheel and column, tilted toward the driver.
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 24), wheelMaterial);
  wheel.position.set(0.4, 0.9, 0.38);
  wheel.rotation.y = Math.PI / 2;
  wheel.rotation.x = 0.35;
  wheel.name = 'steering_wheel';
  interior.add(wheel);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), wheelMaterial);
  hub.position.copy(wheel.position);
  hub.rotation.z = Math.PI / 2;
  hub.rotation.y = 0.35;
  interior.add(hub);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.26, 10), plastic);
  column.position.set(0.52, 0.86, 0.38);
  column.rotation.z = 1.2;
  interior.add(column);

  return interior;
}
