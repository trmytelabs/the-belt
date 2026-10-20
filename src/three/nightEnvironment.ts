import * as THREE from 'three';

/**
 * A small scene for `PMREMGenerator.fromScene`: the snowy night outside the
 * depot, used as the reflection and ambient source for the lot, road, house,
 * dream and driving scenes (the depot keeps its `RoomEnvironment`). Nothing is
 * downloaded: a dark sky dome that lightens toward the horizon, a city glow
 * band, a moon, snow underfoot and a ring of warm sodium lamps, so car paint
 * and glass pick up a cool sky above and warm highlights around them.
 *
 * The 3D depot only; the legacy games never use it.
 */
export function createNightEnvironment(): THREE.Scene {
  const scene = new THREE.Scene();

  // Sky and ground as one sphere seen from inside, coloured per vertex by height.
  const dome = new THREE.SphereGeometry(60, 48, 24);
  const positions = dome.attributes.position;
  const colours = new Float32Array(positions.count * 3);
  const zenith = new THREE.Color(0x070d19);
  const horizon = new THREE.Color(0x27384f);
  const glow = new THREE.Color(0x4a3d2c);
  const snow = new THREE.Color(0x323a46);
  const colour = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const y = positions.getY(i) / 60;
    if (y >= 0) {
      // Dark overhead, bluer toward the horizon, with a thin warm city glow at the skyline.
      colour.copy(zenith).lerp(horizon, Math.pow(1 - y, 2.2));
      const band = Math.max(0, 1 - Math.abs(y - 0.02) / 0.06);
      colour.lerp(glow, band * 0.6);
    } else {
      // Snow underfoot, slightly brighter straight down where the lamps fall.
      colour.copy(snow).multiplyScalar(0.8 + 0.4 * Math.min(1, -y * 2));
    }
    colours[i * 3] = colour.r;
    colours[i * 3 + 1] = colour.g;
    colours[i * 3 + 2] = colour.b;
  }
  dome.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  scene.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  // A moon low in the north-west: the one cool highlight on paint and glass.
  const moon = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.6, 4.4) }));
  moon.position.set(-24, 30, -46);
  scene.add(moon);

  // Sodium lamps around the viewer, at lamp-post height, so reflections carry warm streaks.
  const lampMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(7.5, 4.4, 1.5) });
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + 0.3;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.6), lampMaterial);
    lamp.position.set(Math.cos(angle) * 20, 6.2, Math.sin(angle) * 20);
    lamp.lookAt(0, 6.2, 0);
    scene.add(lamp);
  }
  // Their pools of light on the snow below, so the ground reflection is not uniformly dark.
  const poolMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.42, 0.26) });
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + 0.3;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(5, 24), poolMaterial);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(Math.cos(angle) * 20, -1.8, Math.sin(angle) * 20);
    scene.add(pool);
  }
  return scene;
}

/** Frees the environment scene once the PMREM has been generated from it. */
export function disposeNightEnvironment(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
}
