import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { WIND_MAX, WIND_MIN, windAt } from '../src/three/wind.ts';
import { Snowfall } from '../src/three/snow.ts';

// The night's wind, and the snow it carries.

test('the wind always blows toward -x, within its limits, and gusts now and then', () => {
  let strongest = 0, weakest = Infinity, gusts = 0, inGust = false;
  for (let t = 0; t < 600; t += 0.1) {
    const wind = windAt(t);
    assert.ok(wind.x < 0 && -wind.x >= WIND_MIN - 1e-9 && -wind.x <= WIND_MAX + 1e-9, `within limits at ${t}: ${wind.x}`);
    assert.ok(Math.abs(wind.z) < 1, 'the crosswind stays a wander');
    strongest = Math.max(strongest, -wind.x); weakest = Math.min(weakest, -wind.x);
    if (wind.gust > 0.5 && !inGust) { gusts += 1; inGust = true; } else if (wind.gust <= 0.5) inGust = false;
  }
  assert.ok(strongest > 4 && weakest < 1.2, `a calm and a gale both happen in ten minutes: ${weakest.toFixed(2)} to ${strongest.toFixed(2)}`);
  assert.ok(gusts >= 4 && gusts <= 6, `about one gust every two minutes: ${gusts}`);
});

test('the wind changes smoothly, frame to frame', () => {
  let previous = windAt(0);
  for (let t = 1 / 60; t < 300; t += 1 / 60) {
    const wind = windAt(t);
    assert.ok(Math.abs(wind.x - previous.x) < 0.08 && Math.abs(wind.z - previous.z) < 0.03, `no jump at ${t.toFixed(2)}`);
    previous = wind;
  }
});

test('snowfall is carried along both axes by the wind, and can be coloured for the headlights', () => {
  // The flake texture is drawn on a canvas; under Node a stub canvas stands in for the browser's.
  const context = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: null };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
  try {
    const box = new THREE.Box3(new THREE.Vector3(-50, 0, -50), new THREE.Vector3(50, 40, 50));
    const flakes = new Snowfall(box, { count: 200, size: 0.1 });
    const before = Float32Array.from(flakes.points.geometry.getAttribute('position').array);
    flakes.update(0.5, false, -4, 2);
    const after = flakes.points.geometry.getAttribute('position').array;
    let dx = 0, dz = 0, wrapped = 0;
    for (let i = 0; i < 200; i++) {
      const x = after[i * 3] - before[i * 3], z = after[i * 3 + 2] - before[i * 3 + 2];
      if (Math.abs(x) > 50 || Math.abs(z) > 50) { wrapped += 1; continue; }
      dx += x; dz += z;
    }
    const kept = 200 - wrapped;
    assert.ok(dx / kept < -1.6 && dx / kept > -2.4, `half a second of 4 m/s carries the flakes about 2 m along -x: ${(dx / kept).toFixed(2)}`);
    assert.ok(dz / kept > 0.8 && dz / kept < 1.2, `and 2 m/s about 1 m along +z: ${(dz / kept).toFixed(2)}`);
    const beam = new Snowfall(box, { count: 10, size: 0.1, color: 0xfff6e0, opacity: 1 });
    const material = beam.points.material;
    assert.equal(material.color.getHex(), 0xfff6e0);
    assert.equal(material.opacity, 1);
    assert.equal(flakes.points.material.opacity, 0.9, 'the default flakes are unchanged');
  } finally { delete globalThis.document; }
});
