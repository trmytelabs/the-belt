import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { ROCKETBOX_CAST, ROCKETBOX_COMMIT } from '../../src/three/rocketboxCast.ts';

const REPOSITORY = `https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/${ROCKETBOX_COMMIT}/Assets/Avatars/`;

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

/** Loads an avatar's FBX with its colour, hair opacity, normal and specular textures. */
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
    return `${base}Textures/${texture}`;
  });
  manager.addHandler(/\.tga$/i, new TGALoader(manager));
  const avatar = await new FBXLoader(manager).loadAsync(`${base}Export/${name}.fbx`);
  await settled;
  return avatar;
}

/** A TGA texture's pixels on a full-size canvas, rows as the loader stored them. */
function fullCanvas(texture) {
  const { data, width, height } = texture.image;
  const full = document.createElement('canvas');
  full.width = width;
  full.height = height;
  full.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height), 0, 0);
  return full;
}

/** A texture made from `canvas`, scaled to at most `size` pixels on its longest edge. */
function scaledTexture(canvas, texture, size, colorSpace, mimeType) {
  const scale = Math.min(1, size / Math.max(canvas.width, canvas.height));
  const scaled = document.createElement('canvas');
  scaled.width = Math.round(canvas.width * scale);
  scaled.height = Math.round(canvas.height * scale);
  const context = scaled.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(canvas, 0, 0, scaled.width, scaled.height);
  const copy = new THREE.CanvasTexture(scaled);
  copy.flipY = texture.flipY;
  copy.colorSpace = colorSpace;
  copy.wrapS = texture.wrapS;
  copy.wrapT = texture.wrapT;
  copy.userData.mimeType = mimeType;
  return copy;
}

/** A canvas copy of a TGA colour texture at most `size` pixels on its longest edge. */
function resized(texture, size, cache) {
  if (!texture?.image?.data) return null;
  let copy = cache.get(texture);
  if (copy) return copy;
  copy = scaledTexture(fullCanvas(texture), texture, size, THREE.SRGBColorSpace, 'image/jpeg');
  cache.set(texture, copy);
  return copy;
}

/**
 * Which way a normal map's green channel points, from its pixels alone. A
 * normal map encodes the slopes of a height field, so in the right convention
 * its slope field has no curl: d(x-slope)/d(row) equals d(row-slope)/d(column).
 * Read the other way round, the two differ. Returns whether green points
 * toward increasing rows (down the stored rows) and how decisive that was
 * (the smaller residual over the larger; near 1 would be undecided).
 */
function greenAlongRows({ data, width, height }) {
  const slope = (x, y, channel) => {
    const i = (y * width + x) * 4;
    const z = Math.max(0.3, data[i + 2] / 127.5 - 1);
    return (data[i + channel] / 127.5 - 1) / z;
  };
  let down = 0;
  let up = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const dxSlopeByRow = slope(x, y + 1, 0) - slope(x, y - 1, 0);
      const dRowSlopeByColumn = slope(x + 1, y, 1) - slope(x - 1, y, 1);
      down += Math.abs(dxSlopeByRow - dRowSlopeByColumn);
      up += Math.abs(dxSlopeByRow + dRowSlopeByColumn);
    }
  }
  return { down: down < up, ratio: Math.min(down, up) / Math.max(down, up, 1e-9) };
}

/**
 * The normal map in glTF's convention: green points up the image as it is
 * stored in the GLB. The exporter flips a `flipY` texture's rows on the way
 * out, which reverses "down the loader's rows", so the test result is read
 * through that flip. 3ds Max maps arrive with green the other way and are
 * inverted. `notes` collects what was found, for the conversion report.
 */
function normalTexture(texture, size, cache, notes) {
  if (!texture?.image?.data) return null;
  let copy = cache.get(texture);
  if (copy) return copy;
  const full = fullCanvas(texture);
  const context = full.getContext('2d');
  const image = context.getImageData(0, 0, full.width, full.height);
  const { down, ratio } = greenAlongRows(image);
  const upWhenStored = texture.flipY ? down : !down;
  if (!upWhenStored) {
    for (let i = 1; i < image.data.length; i += 4) image.data[i] = 255 - image.data[i];
    context.putImageData(image, 0, 0);
  }
  notes.push({ map: texture.name || 'normal', inverted: !upWhenStored, confidence: Number((1 - ratio).toFixed(2)) });
  copy = scaledTexture(full, texture, size, THREE.NoColorSpace, 'image/jpeg');
  cache.set(texture, copy);
  return copy;
}

/**
 * A glTF metallic-roughness texture from a 3ds Max specular map: roughness
 * (green) falls where the specular level rises, from 0.94 on the dullest
 * texels to 0.52 on the shiniest (normalised by the map's own 95th
 * percentile, since Rocketbox levels vary per avatar); metalness (blue) is 0.
 */
function roughnessTexture(texture, size, cache) {
  if (!texture?.image?.data) return null;
  let copy = cache.get(texture);
  if (copy) return copy;
  const full = fullCanvas(texture);
  const context = full.getContext('2d');
  const image = context.getImageData(0, 0, full.width, full.height);
  const { data } = image;
  const levels = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) levels[Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])] += 1;
  const pixels = data.length / 4;
  let top = 255;
  for (let level = 255, seen = 0; level > 0; level -= 1) {
    seen += levels[level];
    if (seen >= pixels * 0.05) { top = Math.max(level, 1); break; }
  }
  for (let i = 0; i < data.length; i += 4) {
    const shine = Math.min(1, (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / top);
    data[i] = 255;
    data[i + 1] = Math.round((0.94 - 0.42 * shine) * 255);
    data[i + 2] = 0;
  }
  context.putImageData(image, 0, 0);
  copy = scaledTexture(full, texture, size, THREE.NoColorSpace, 'image/jpeg');
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
  const normals = [];
  const convert = (material) => {
    // Hair, lashes and other cut-outs use RGBA "opacity" textures.
    const cutout = /opacity/i.test(material.name) || /opacity/i.test(material.map?.name ?? '');
    // Cut-outs stay PNG for their alpha, so they are kept to 512 px.
    const map = resized(material.map, cutout ? Math.min(size, 512) : size, cache);
    if (map) map.userData.mimeType = cutout ? 'image/png' : 'image/jpeg';
    // Skin and cloth relief at the colour map's size; the roughness map is low-frequency, so half.
    const normalMap = cutout ? null : normalTexture(material.normalMap, size, cache, normals);
    const roughnessMap = cutout ? null : roughnessTexture(material.specularMap, Math.max(256, size / 2), cache);
    const converted = new THREE.MeshStandardMaterial({
      name: material.name,
      map,
      color: 0xffffff,
      roughness: roughnessMap ? 1 : 0.85,
      metalness: 0,
      alphaTest: cutout ? 0.5 : 0,
      side: cutout ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (normalMap) converted.normalMap = normalMap;
    // One packed texture for both: the exporter writes it as the glTF metallic-roughness map.
    if (roughnessMap) converted.roughnessMap = converted.metalnessMap = roughnessMap;
    return converted;
  };
  for (const mesh of meshes.filter((mesh) => mesh.parent)) {
    // FBX meshes arrive with every triangle's corners stored separately; shared corners halve the file.
    if (!mesh.geometry.index) mesh.geometry = mergeVertices(mesh.geometry);
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  }
  avatar.animations = [];
  return {
    triangles: meshes.filter((mesh) => mesh.parent).reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3, 0),
    normals,
  };
}

async function convertOne(casting) {
  report(casting.file, 'loading');
  const avatar = await loadAvatar(casting.source);
  report(casting.file, 'converting');
  const { triangles, normals } = prepare(avatar, casting.textureSize);
  const glb = await new GLTFExporter().parseAsync(avatar, { binary: true });
  report(casting.file, 'saving');
  const response = await fetch(`/__save?file=${casting.file}`, { method: 'POST', body: glb });
  if (!response.ok) throw new Error(await response.text());
  const summary = { file: casting.file, bytes: glb.byteLength, triangles: Math.round(triangles), normals };
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
