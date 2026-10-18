import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { PROP_MODELS, PROP_MODEL_URL } from '../../src/three/propModels.ts';

// Every converted prop in a row at its real size, with its bounds reported for checks.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14262d);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 6, 5);
scene.add(sun, new THREE.GridHelper(20, 20, 0x3c5a64, 0x24404a));
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
camera.position.set(0, 2.2, 7);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.5, 0);

const resize = () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
};
window.addEventListener('resize', resize);
resize();

const loader = new GLTFLoader();
const bounds = {};
let x = 0;
const ids = Object.keys(PROP_MODELS);
const loaded = await Promise.all(ids.map((id) => loader.loadAsync(PROP_MODEL_URL(id)).then((gltf) => gltf.scene, () => null)));
const total = loaded.reduce((sum, model) => sum + (model ? new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x + 0.3 : 0), 0);
x = -total / 2;
ids.forEach((id, index) => {
  const model = loaded[index];
  if (!model) {
    bounds[id] = null;
    return;
  }
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.position.x = x - box.min.x;
  x += size.x + 0.3;
  scene.add(model);
  bounds[id] = { size: size.toArray().map((value) => Number(value.toFixed(3))), minY: Number(box.min.y.toFixed(3)) };
});
window.propBounds = bounds;

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
