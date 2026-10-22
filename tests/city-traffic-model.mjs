import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LOD_DISTANCE, TAIL_BRAKING, TAIL_RUNNING, TRAFFIC_COLOURS, TrafficBatch, bakeVehicleParts } from '../src/three/trafficBatch.ts';
import { WINDOW, createCityWindows, layoutWindows, mulberry } from '../src/three/cityWindows.ts';
import { CITY_BUILDINGS } from '../src/three/drivingCity.ts';

// The road's batched traffic and lit windows, built without a renderer or a download.

/** A stand-in for a Quaternius sedan: one body mesh with the real material names in groups, and three wheel nodes, nose +z. */
function sedanScene(longer = 0) {
  const scene = new THREE.Group();
  const body = new THREE.BoxGeometry(1.6, 1.2, 4.0 + longer, 2, 2, 4).toNonIndexed();
  const names = ['Blue', 'Windows', 'Black', 'Grey', 'Headlights', 'TailLights'];
  const triangles = body.attributes.position.count / 3;
  body.clearGroups();
  // Six material groups across the body's triangles.
  const per = Math.floor(triangles / names.length);
  names.forEach((name, i) => body.addGroup(i * per * 3, (i === names.length - 1 ? triangles - i * per : per) * 3, i));
  const mesh = new THREE.Mesh(body, names.map((name) => { const m = new THREE.MeshStandardMaterial(); m.name = name; return m; }));
  mesh.name = 'NormalCar1_Cube.012';
  mesh.position.y = 0.6;
  scene.add(mesh);
  const wheel = (name, x, z, both) => {
    const one = () => new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8).rotateZ(Math.PI / 2).toNonIndexed();
    const geometry = both ? mergeGeometries([one().translate(-0.7, 0, 0), one().translate(0.7, 0, 0)], false) : one();
    const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    m.name = name; m.position.set(x, 0.3, z); scene.add(m);
  };
  wheel('NormalCar1_FrontLeftWheel', -0.7, 1.3, false);
  wheel('NormalCar1_FrontRightWheel', 0.7, 1.3, false);
  wheel('NormalCar1_BackWheels', 0, -1.3, true);
  return scene;
}

test('a sedan bakes into paint, trim, head and tail lamps, four wheels and a shell, fitted to the full models\' box', () => {
  const parts = bakeVehicleParts(sedanScene());
  assert.ok(parts.paint.attributes.position.count > 0 && parts.trim.attributes.position.count > 0 && parts.lights.attributes.position.count > 0);
  assert.ok(parts.tails.attributes.position.count > 0 && parts.tails.attributes.color, 'the tail lamps bake apart, so they can brighten for braking');
  assert.equal(parts.wheels.length, 4, 'four wheels, the rear pair split from one node');
  assert.ok(parts.trim.attributes.color && parts.lights.attributes.color, 'trim and lights carry vertex colours');
  assert.ok(!parts.paint.attributes.color, 'paint takes the instance colour');
  const all = new THREE.Box3();
  for (const g of [parts.paint, parts.trim, parts.lights]) { g.computeBoundingBox(); all.union(g.boundingBox); }
  const size = all.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 4.2) < 0.3 && size.z < 1.9, `nose along +x at the fitted length: ${size.toArray()}`);
  assert.ok(all.min.y > -0.05, 'stands on the road');
  for (const wheel of parts.wheels) {
    wheel.geometry.computeBoundingBox();
    const c = wheel.geometry.boundingBox.getCenter(new THREE.Vector3());
    assert.ok(c.length() < 1e-6, 'each wheel geometry is centred on its axle');
    assert.ok(Math.abs(wheel.centre.x) > 0.9 && Math.abs(wheel.centre.z) > 0.5, `wheel centre in the car's corners: ${wheel.centre.toArray()}`);
  }
  assert.ok(parts.wheelRadius > 0.2 && parts.wheelRadius < 0.5);
  const shellTriangles = (parts.shell.index ? parts.shell.index.count : parts.shell.attributes.position.count) / 3;
  assert.ok(shellTriangles <= 700, `the shell is small: ${shellTriangles} triangles`);
});

test('a braking car brightens its tail lamps and lets them dim again', () => {
  const batch = new TrafficBatch(4, async () => []);
  batch.build([bakeVehicleParts(sedanScene())]);
  const tails = batch.root.children.find((c) => c.name === 'traffic-batch-tails');
  const camera = new THREE.Object3D();
  const colour = new THREE.Color();
  // The batch keeps colours as 32-bit floats.
  const near = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 1e-5;
  batch.place('car-0', 0, { x: 0, z: 0, heading: 0 }, camera);
  tails.getColorAt(0, colour);
  assert.ok(near(colour, TAIL_RUNNING) && batch.report()[0].braking === false, 'running lamps while it drives');
  batch.place('car-0', 0, { x: 0, z: 0, heading: 0, braking: true }, camera);
  tails.getColorAt(0, colour);
  assert.ok(near(colour, TAIL_BRAKING) && colour.r > 2 * colour.g && batch.report()[0].braking, 'brighter while it brakes');
  batch.place('car-0', 0, { x: 1, z: 0, heading: 0, braking: false }, camera);
  tails.getColorAt(0, colour);
  assert.ok(near(colour, TAIL_RUNNING), 'dim again when it drives on');
});

test('the batch places cars, rolls their wheels and switches detail with distance', () => {
  const batch = new TrafficBatch(6, async () => []);
  batch.build([bakeVehicleParts(sedanScene()), bakeVehicleParts(sedanScene(0.3))]);
  assert.ok(batch.built);
  assert.equal(batch.root.children.length, 4, 'paint, trim, headlamp and tail-lamp batches');
  const camera = new THREE.Object3D();
  camera.position.set(0, 4.5, 9);
  const paint = batch.root.children.find((c) => c.name === 'traffic-batch-paint');
  const trim = batch.root.children.find((c) => c.name === 'traffic-batch-trim');
  // Near car: full detail, wheels visible; far car: shell only.
  batch.place('car-0', 0, { x: 0, z: 0, heading: 0 }, camera);
  batch.place('car-1', 1, { x: 0, z: -200, heading: Math.PI / 2 }, camera);
  const report = batch.report();
  assert.deepEqual(report.map((r) => [r.id, r.far, r.variant]), [['car-0', false, 0], ['car-1', true, 1]]);
  assert.equal(batch.size, 2);
  const colour = new THREE.Color();
  paint.getColorAt(0, colour);
  assert.equal(colour.getHex(), TRAFFIC_COLOURS[0], 'the first car takes the first road colour');
  // Far switches back to near with hysteresis once the car comes within 90 % of the distance.
  batch.place('car-1', 1, { x: 0, z: -LOD_DISTANCE * 0.95, heading: 0 }, camera);
  assert.equal(batch.report()[1].far, true, 'still far just inside the distance');
  batch.place('car-1', 1, { x: 0, z: -LOD_DISTANCE * 0.5, heading: 0 }, camera);
  assert.equal(batch.report()[1].far, false, 'near again');
  // Rolling 1 m forward spins the wheels by a metre over the radius about the car's lateral axis.
  const before = new THREE.Matrix4(); trim.getMatrixAt(1, before);
  batch.place('car-0', 0, { x: 1, z: 0, heading: 0 }, camera);
  const after = new THREE.Matrix4(); trim.getMatrixAt(1, after);
  assert.ok(!before.equals(after), 'the wheel turned');
  const spin = new THREE.Quaternion().setFromRotationMatrix(after);
  const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(spin);
  assert.ok(Math.abs(axis.z - 1) < 1e-6, 'about the lateral axis');
  // A jump across the map is a reset, not travel.
  batch.place('car-0', 0, { x: 150, z: 150, heading: 0 }, camera);
  const jumped = new THREE.Matrix4(); trim.getMatrixAt(1, jumped);
  const q1 = new THREE.Quaternion().setFromRotationMatrix(after), q2 = new THREE.Quaternion().setFromRotationMatrix(jumped);
  assert.ok(q1.angleTo(q2) < 1e-6, 'no spin from a teleport');
  batch.dispose();
  assert.equal(batch.root.parent, null);
});

test('the city windows sit on every building face, lit about half the time, deterministically', () => {
  const a = layoutWindows(CITY_BUILDINGS, 7), b = layoutWindows(CITY_BUILDINGS, 7), c = layoutWindows(CITY_BUILDINGS, 8);
  assert.deepEqual(a, b, 'the same seed lights the same windows');
  assert.notDeepEqual(a, c, 'another seed lights others');
  assert.ok(a.length > 2000 && a.length < 20000, `a city's worth of lit windows: ${a.length}`);
  // Each window stands just outside its building's box, between the first floor and the roof.
  let outside = 0;
  for (const w of a) {
    const building = CITY_BUILDINGS.find((bld) => Math.abs(w.x - bld.x) <= bld.width / 2 + WINDOW.inset + 1e-6 && Math.abs(w.z - bld.z) <= bld.depth / 2 + WINDOW.inset + 1e-6 && w.y < bld.height);
    assert.ok(building, `window at ${[w.x, w.y, w.z]} belongs to a building`);
    const onX = Math.abs(Math.abs(w.x - building.x) - (building.width / 2 + WINDOW.inset)) < 1e-6;
    const onZ = Math.abs(Math.abs(w.z - building.z) - (building.depth / 2 + WINDOW.inset)) < 1e-6;
    if (onX || onZ) outside += 1;
    assert.ok(w.y >= WINDOW.firstFloor - 1e-6 && w.y + WINDOW.height / 2 <= building.height + 1e-6, 'within the facade\'s height');
  }
  assert.equal(outside, a.length, 'every window is on a face');
  const random = mulberry(1);
  const samples = Array.from({ length: 1000 }, random);
  assert.ok(samples.every((v) => v >= 0 && v < 1) && new Set(samples).size > 990);
  const mesh = createCityWindows(CITY_BUILDINGS);
  assert.equal(mesh.count, a.length);
  assert.ok(mesh.boundingSphere && mesh.boundingSphere.radius > 100, 'one mesh spans the city');
  assert.equal(mesh.userData.keep, true, 'stays out of the static merge');
});
