import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { PROP_MODELS } from '../../src/three/propModels.ts';

const API = 'https://api.polyhaven.com';

const rows = document.querySelector('#rows');
const button = document.querySelector('#convert');
const status = new Map();

for (const [id, source] of Object.entries(PROP_MODELS)) {
  const row = document.createElement('tr');
  row.innerHTML = `<td>${id}.glb</td><td>${source.polyHaven}</td><td>waiting</td>`;
  rows.append(row);
  status.set(id, row.lastElementChild);
}

function report(id, text, kind = '') {
  const cell = status.get(id);
  cell.textContent = text;
  cell.className = kind;
}

/** Loads an asset's 1k glTF, mapping its relative files to their download addresses. */
async function loadAsset(asset) {
  const [files, info] = await Promise.all([
    fetch(`${API}/files/${asset}`).then((response) => response.json()),
    fetch(`${API}/info/${asset}`).then((response) => response.json()),
  ]);
  const gltf = files.gltf['1k'].gltf;
  const includes = Object.entries(gltf.include ?? {});
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => includes.find(([path]) => url.endsWith(`/${path}`))?.[1].url ?? url);
  const loaded = await new GLTFLoader(manager).loadAsync(gltf.url);
  return { scene: loaded.scene, info };
}

/**
 * A canvas copy of a texture at most `size` pixels on its longest edge, one
 * per image, stored as JPEG; a cut-out's colour map keeps its alpha as PNG.
 */
function resized(texture, size, cache, mimeType = 'image/jpeg') {
  if (!texture?.image) return null;
  let copy = cache.get(texture.source);
  if (copy) return copy;
  const { width, height } = texture.image;
  const scale = Math.min(1, size / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(texture.image, 0, 0, canvas.width, canvas.height);
  copy = new THREE.CanvasTexture(canvas);
  copy.flipY = texture.flipY;
  copy.colorSpace = texture.colorSpace;
  copy.wrapS = texture.wrapS;
  copy.wrapT = texture.wrapT;
  copy.userData.mimeType = mimeType;
  cache.set(texture.source, copy);
  return copy;
}

/**
 * Plain glTF PBR materials at the target texture size; glass loses its
 * (costly) transmission. A cut-out (chain-link, leaves: glTF alpha mode MASK)
 * keeps its alpha test and a PNG colour map, since JPEG has no alpha.
 */
function convertMaterial(material, source, cache) {
  const size = source.textureSize;
  const glass = material.transmission > 0 || /glass/i.test(material.name);
  // Alpha-masked and alpha-blended sheets (chain-link wire) both become alpha-tested cut-outs.
  const cutout = material.alphaTest > 0 || (material.transparent && material.map !== null && !glass);
  const converted = new THREE.MeshStandardMaterial({
    name: material.name,
    color: material.color,
    map: resized(material.map, size, cache, cutout ? 'image/png' : 'image/jpeg'),
    alphaTest: cutout ? material.alphaTest || 0.5 : 0,
    roughness: material.roughness,
    metalness: material.metalness,
    roughnessMap: resized(material.roughnessMap, size, cache),
    metalnessMap: resized(material.metalnessMap, size, cache),
    aoMap: resized(material.aoMap, size, cache),
    normalMap: source.normalMaps === false ? null : resized(material.normalMap, size, cache),
    emissive: material.emissive,
    emissiveMap: resized(material.emissiveMap, size, cache),
    emissiveIntensity: material.emissiveIntensity,
    transparent: glass,
    opacity: glass ? 0.35 : 1,
    depthWrite: !glass,
    side: cutout ? THREE.DoubleSide : material.side,
  });
  if (converted.normalMap) converted.normalScale.copy(material.normalScale);
  return converted;
}

/**
 * Stores positions as 16-bit and normals as 8-bit integers (KHR_mesh_quantization),
 * moving the offset and a uniform scale into the mesh's transform. About half the size.
 */
function quantize(mesh, done) {
  const geometry = mesh.geometry;
  // A geometry shared by several meshes is quantized once; each mesh still takes the transform.
  let frame = done.get(geometry);
  if (!frame) {
    frame = quantizeGeometry(geometry);
    done.set(geometry, frame);
  }
  mesh.position.add(frame.centre.clone().multiply(mesh.scale).applyQuaternion(mesh.quaternion));
  mesh.scale.multiplyScalar(frame.half);
}

function quantizeGeometry(geometry) {
  for (const name of Object.keys(geometry.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
  }
  geometry.computeBoundingBox();
  const centre = geometry.boundingBox.getCenter(new THREE.Vector3());
  const extent = geometry.boundingBox.getSize(new THREE.Vector3());
  const half = Math.max(extent.x, extent.y, extent.z) / 2 || 1;

  const position = geometry.attributes.position;
  const positions = new Int16Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    positions[i * 3] = Math.round(((position.getX(i) - centre.x) / half) * 32767);
    positions[i * 3 + 1] = Math.round(((position.getY(i) - centre.y) / half) * 32767);
    positions[i * 3 + 2] = Math.round(((position.getZ(i) - centre.z) / half) * 32767);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3, true));

  const normal = geometry.attributes.normal;
  if (normal) {
    const normals = new Int8Array(normal.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < normal.count; i += 1) {
      v.fromBufferAttribute(normal, i).normalize();
      normals[i * 3] = Math.round(v.x * 127);
      normals[i * 3 + 1] = Math.round(v.y * 127);
      normals[i * 3 + 2] = Math.round(v.z * 127);
    }
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3, true));
  }

  const uv = geometry.attributes.uv;
  if (uv && uv.array.every((value) => value >= 0 && value <= 1)) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(Uint16Array.from(uv.array, (value) => Math.round(value * 65535)), 2, true));
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // The node carries the offset and scale (uniform, so normals are unaffected).
  return { centre, half };
}

/** Keeps the listed nodes, converts materials and quantizes geometry. */
function prepare(scene, source) {
  if (source.nodes) {
    for (const child of [...scene.children]) if (!source.nodes.test(child.name)) child.removeFromParent();
  }
  const cache = new Map();
  const materials = new Map();
  const quantized = new Map();
  let triangles = 0;
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const convert = (material) => {
      if (!materials.has(material)) materials.set(material, convertMaterial(material, source, cache));
      return materials.get(material);
    };
    object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
    quantize(object, quantized);
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
  });
  return { triangles };
}

async function convertOne(id, source) {
  report(id, 'loading');
  const { scene, info } = await loadAsset(source.polyHaven);
  report(id, 'converting');
  const { triangles } = prepare(scene, source);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  report(id, 'saving');
  const response = await fetch(`/__save?file=${id}`, { method: 'POST', body: glb });
  if (!response.ok) throw new Error(await response.text());
  const summary = {
    file: `${id}.glb`, source: source.polyHaven, bytes: glb.byteLength, triangles: Math.round(triangles),
    filesHash: info.files_hash, authors: Object.keys(info.authors ?? {}),
  };
  report(id, `saved, ${(glb.byteLength / 1e6).toFixed(2)} MB, ${summary.triangles} triangles`, 'done');
  return summary;
}

/** Converts the listed props (all by default). Exposed for scripted runs. */
async function convertAll(ids) {
  button.disabled = true;
  const results = [];
  for (const [id, source] of Object.entries(PROP_MODELS)) {
    if (ids && !ids.includes(id)) continue;
    try {
      results.push(await convertOne(id, source));
    } catch (error) {
      report(id, `failed: ${error.message}`, 'failed');
      results.push({ file: `${id}.glb`, error: String(error.message ?? error) });
    }
  }
  button.disabled = false;
  window.conversionResults = results;
  return results;
}

window.convertProps = convertAll;
button.addEventListener('click', () => { void convertAll(); });
