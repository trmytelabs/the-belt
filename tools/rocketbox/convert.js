import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { ROCKETBOX_CAST, ROCKETBOX_COMMIT } from '../../src/three/rocketboxCast.ts';

const REPOSITORY = `https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/${ROCKETBOX_COMMIT}/Assets/Avatars/`;

// Normal and specular maps are left out: at the game's camera distance they
// add download size without visible detail. A 1×1 TGA stands in for them.
const BLANK_TGA = URL.createObjectURL(new Blob([new Uint8Array([0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 32, 8, 128, 128, 255, 255])]));

const rows = document.querySelector('#rows');
const button = document.querySelector('#convert');
const status = new Map();

for (const casting of ROCKETBOX_CAST) {
  const row = document.createElement('tr');
  row.innerHTML = `<td>${casting.file}</td><td>${casting.source}</td><td>waiting</td>`;
  rows.append(row);
  status.set(casting.file, row.lastElementChild);
}

function report(file, text, kind = '') {
  const cell = status.get(file);
  cell.textContent = text;
  cell.className = kind;
}

/** Loads an avatar's FBX with its colour (and hair opacity) textures. */
async function loadAvatar(source) {
  const base = `${REPOSITORY}${source}/`;
  const name = source.split('/').pop();
  const manager = new THREE.LoadingManager();
  const settled = new Promise((resolve, reject) => {
    manager.onLoad = resolve;
    manager.onError = (url) => reject(new Error(`could not load ${url}`));
  });
  manager.setURLModifier((url) => {
    if (!/\.tga$/i.test(url)) return url;
    const texture = url.split(/[\\/]/).pop().toLowerCase();
    return /_(normal|specular)\.tga$/.test(texture) ? BLANK_TGA : `${base}Textures/${texture}`;
  });
  manager.addHandler(/\.tga$/i, new TGALoader(manager));
  const avatar = await new FBXLoader(manager).loadAsync(`${base}Export/${name}.fbx`);
  await settled;
  return avatar;
}

/** A canvas copy of a TGA texture at most `size` pixels on its longest edge. */
function resized(texture, size, cache) {
  if (!texture?.image?.data) return null;
  let copy = cache.get(texture);
  if (copy) return copy;
  const { data, width, height } = texture.image;
  const full = document.createElement('canvas');
  full.width = width;
  full.height = height;
  full.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height), 0, 0);
  const scale = Math.min(1, size / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(full, 0, 0, canvas.width, canvas.height);
  copy = new THREE.CanvasTexture(canvas);
  copy.flipY = texture.flipY;
  copy.colorSpace = THREE.SRGBColorSpace;
  copy.wrapS = texture.wrapS;
  copy.wrapT = texture.wrapT;
  cache.set(texture, copy);
  return copy;
}

/** Keeps the highest level of detail and swaps 3ds Max materials for glTF ones. */
function prepare(avatar, size) {
  const meshes = [];
  avatar.traverse((object) => { if (object.isMesh) meshes.push(object); });
  const detailed = meshes.filter((mesh) => /hipoly/i.test(mesh.name));
  if (detailed.length) for (const mesh of meshes) if (!detailed.includes(mesh)) mesh.removeFromParent();
  const cache = new Map();
  const convert = (material) => {
    // Hair, lashes and other cut-outs use RGBA "opacity" textures.
    const cutout = /opacity/i.test(material.name) || /opacity/i.test(material.map?.name ?? '');
    // Cut-outs stay PNG for their alpha, so they are kept to 512 px.
    const map = resized(material.map, cutout ? Math.min(size, 512) : size, cache);
    if (map) map.userData.mimeType = cutout ? 'image/png' : 'image/jpeg';
    return new THREE.MeshStandardMaterial({
      name: material.name,
      map,
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0,
      alphaTest: cutout ? 0.5 : 0,
      side: cutout ? THREE.DoubleSide : THREE.FrontSide,
    });
  };
  for (const mesh of meshes.filter((mesh) => mesh.parent)) {
    // FBX meshes arrive with every triangle's corners stored separately; shared corners halve the file.
    if (!mesh.geometry.index) mesh.geometry = mergeVertices(mesh.geometry);
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  }
  avatar.animations = [];
  return { triangles: meshes.filter((mesh) => mesh.parent).reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3, 0) };
}

async function convertOne(casting) {
  report(casting.file, 'loading');
  const avatar = await loadAvatar(casting.source);
  report(casting.file, 'converting');
  const { triangles } = prepare(avatar, casting.textureSize);
  const glb = await new GLTFExporter().parseAsync(avatar, { binary: true });
  report(casting.file, 'saving');
  const response = await fetch(`/__save?file=${casting.file}`, { method: 'POST', body: glb });
  if (!response.ok) throw new Error(await response.text());
  const summary = { file: casting.file, bytes: glb.byteLength, triangles: Math.round(triangles) };
  report(casting.file, `saved, ${(glb.byteLength / 1e6).toFixed(2)} MB, ${summary.triangles} triangles`, 'done');
  return summary;
}

/** Converts the listed files (all by default). Exposed for scripted runs. */
async function convertAll(files) {
  button.disabled = true;
  const results = [];
  for (const casting of ROCKETBOX_CAST) {
    if (files && !files.includes(casting.file)) continue;
    try {
      results.push(await convertOne(casting));
    } catch (error) {
      report(casting.file, `failed: ${error.message}`, 'failed');
      results.push({ file: casting.file, error: String(error.message ?? error) });
    }
  }
  button.disabled = false;
  window.conversionResults = results;
  return results;
}

window.convertRocketbox = convertAll;
button.addEventListener('click', () => { void convertAll(); });
