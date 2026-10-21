import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SEDAN_LAYOUT, createSedanInterior } from '../src/three/vehicleInterior.ts';
import { SEAT_NODES, attachSteeringWheel, createSuspension, readContract, rigWheels, seatNodeNames, settleSuspension, spinWheels } from '../src/three/vehicleRig.ts';
import { limbsOf, poseSeated, seatRootPosition, solveLimb } from '../src/three/seating.ts';
import { BODY } from '../src/three/figure.ts';
import { SEATED_BODY_DROP } from '../src/three/figure.ts';

// The vehicle contract the sedans synthesise from their generated interior,
// and the seated-limb solver that puts a figure's hands and feet on it.

const world = (object) => object.getWorldPosition(new THREE.Vector3());
const inside = (p, cabin = SEDAN_LAYOUT.cabin) => p.x >= cabin.minX && p.x <= cabin.maxX && Math.abs(p.z) <= cabin.halfWidth && p.y >= cabin.minY && p.y <= cabin.maxY;

test('the sedan interior carries every contract node, inside the cabin', () => {
  const interior = createSedanInterior();
  interior.updateMatrixWorld(true);
  const contract = readContract(interior);
  assert.ok(contract.steeringWheel, 'a steering wheel');
  for (const seat of Object.keys(SEAT_NODES)) {
    const targets = contract.seats[seat];
    assert.ok(targets, `seat ${seat}`);
    assert.ok(targets.hands && targets.feet, `${seat} has hand and foot targets`);
    for (const node of [targets.seat, targets.hands.left, targets.hands.right, targets.feet.left, targets.feet.right]) {
      assert.ok(inside(world(node)), `${node.name} inside the cabin: ${JSON.stringify(world(node))}`);
    }
    const names = seatNodeNames(seat);
    assert.equal(targets.seat.name, names.seat);
    // A seat's +z faces the nose.
    assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(targets.seat.quaternion).x > 0.99, `${seat} faces the nose`);
    // Feet stand on the floor, below the hips; the driver's are forward at the pedals.
    for (const foot of [targets.feet.left, targets.feet.right]) {
      const p = world(foot);
      assert.ok(p.y >= SEDAN_LAYOUT.floorY && p.y < SEDAN_LAYOUT.floorY + 0.06, `${foot.name} on the floor`);
      assert.ok(p.x > world(targets.seat).x + 0.3, `${foot.name} ahead of the seat`);
    }
  }
  // The driver's wrists sit on the wheel rim, the left on the door side (+z: the figure's left pivots hang at its −x).
  const wheel = world(contract.steeringWheel), driver = contract.seats.driver;
  for (const [hand, side] of [[driver.hands.left, 1], [driver.hands.right, -1]]) {
    const p = world(hand);
    assert.ok(Math.abs(p.distanceTo(wheel) - SEDAN_LAYOUT.wheel.radius) < 0.005, `${hand.name} on the rim`);
    assert.ok(Math.sign(p.z - wheel.z) === side, `${hand.name} on its side of the wheel`);
    assert.ok(p.y > wheel.y, `${hand.name} above the hub`);
  }
  // The other seats' hands rest on the lap, ahead of and above the hips.
  for (const seat of ['passenger', 'rearL', 'rearR']) {
    const { seat: hips, hands } = contract.seats[seat];
    for (const hand of [hands.left, hands.right]) assert.ok(world(hand).x > world(hips).x + 0.2 && world(hand).y > world(hips).y, `${hand.name} on the lap`);
  }
});

test('the steering wheel turns with the front wheels about its own axis', () => {
  const interior = createSedanInterior();
  const contract = readContract(interior);
  const car = new THREE.Group();
  const nodes = [];
  for (const name of ['front-left-wheel', 'front-right-wheel', 'back-wheels']) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.2, 8), new THREE.MeshStandardMaterial());
    wheel.name = name; wheel.rotation.x = Math.PI / 2; car.add(wheel);
    nodes.push({ node: wheel, steered: /front/.test(name) });
  }
  const rig = rigWheels(nodes);
  attachSteeringWheel(rig, contract.steeringWheel);
  const rest = contract.steeringWheel.quaternion.clone();
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(rest);
  spinWheels(rig, 0, 0.4, 10);
  const turned = contract.steeringWheel.quaternion.clone();
  const angle = rest.angleTo(turned);
  assert.ok(Math.abs(angle - rig.steer * 2.5) < 1e-6, `turned by the steering ratio: ${angle} for ${rig.steer}`);
  assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(turned).distanceTo(normal) < 1e-6, 'the wheel keeps its axis');
  // The rim faces the driver, leaning back toward the dash.
  assert.ok(normal.x < -0.9 && normal.y > 0.3, `the wheel faces the driver: ${JSON.stringify(normal)}`);
});

test('the suspension pitches under acceleration and rolls out of a bend, then settles', () => {
  const springs = createSuspension();
  const node = new THREE.Object3D();
  // Accelerating from rest: the nose rises.
  settleSuspension(springs, node, 1 / 60, { speed: 0, steer: 0 });
  for (let i = 0; i < 20; i++) settleSuspension(springs, node, 1 / 60, { speed: 2 + i * 0.15, steer: 0 });
  assert.ok(node.rotation.z > 0.01 && node.rotation.z <= 0.05, `nose up under power: ${node.rotation.z}`);
  // Hard braking: the nose dips.
  for (let i = 0; i < 20; i++) settleSuspension(springs, node, 1 / 60, { speed: Math.max(0, 5 - i * 0.33), steer: 0 });
  assert.ok(node.rotation.z < -0.01, `nose down under braking: ${node.rotation.z}`);
  // A steady right turn leans the body left (its +z side rising) and holds the lean.
  for (let i = 0; i < 90; i++) settleSuspension(springs, node, 1 / 60, { speed: 14, steer: 0.8 });
  assert.ok(node.rotation.x < -0.02 && node.rotation.x >= -0.05, `leans out of a right turn: ${node.rotation.x}`);
  assert.ok(Math.abs(node.rotation.z) < 0.005, 'no pitch at a steady speed');
  // Straight and steady: everything settles back within a second.
  for (let i = 0; i < 90; i++) settleSuspension(springs, node, 1 / 60, { speed: 14, steer: 0 });
  assert.ok(Math.abs(node.rotation.x) < 0.002 && Math.abs(node.rotation.z) < 0.002, 'settled');
  // A bump kicks the pitch and dies away.
  settleSuspension(springs, node, 1 / 60, { speed: 14, steer: 0, jolt: 1.6 });
  const kicked = Math.abs(node.rotation.z);
  assert.ok(kicked > 0.01, 'a bump moves the body');
  for (let i = 0; i < 120; i++) settleSuspension(springs, node, 1 / 60, { speed: 14, steer: 0 });
  assert.ok(Math.abs(node.rotation.z) < 0.002, 'the bump dies away');
});

/** A limb laid out like the figure's: the pivot under a body, the mid joint and the end point hanging straight down. */
function limb(x, y, upper, lower) {
  const body = new THREE.Group();
  const pivot = new THREE.Group(); pivot.position.set(x, y, 0); body.add(pivot);
  const mid = new THREE.Group(); mid.position.y = -upper; pivot.add(mid);
  const end = new THREE.Object3D(); end.position.y = -lower; mid.add(end);
  return { body, pivot, mid, end, chain: { pivot, mid, upper, lower } };
}

test('solveLimb lands the end on reachable targets and straightens toward the rest', () => {
  const arm = limb(0.205, 1.385, BODY.upperArm, BODY.forearm);
  const pole = new THREE.Vector3(0.3, -1, -0.3);
  let max = 0;
  for (const target of [[0.3, 1.0, 0.3], [0.5, 1.2, 0.2], [0.1, 0.95, 0.1], [0.25, 1.5, 0.35], [-0.1, 1.2, 0.4], [0.6, 1.35, -0.1]]) {
    const wanted = new THREE.Vector3(...target);
    const short = solveLimb(arm.chain, wanted, pole);
    arm.body.updateMatrixWorld(true);
    const reached = arm.end.getWorldPosition(new THREE.Vector3());
    assert.equal(short, 0, `reachable ${target}`);
    max = Math.max(max, reached.distanceTo(wanted));
    assert.ok(reached.distanceTo(wanted) < 1e-6, `end on target ${target}: ${reached.toArray()}`);
    // The elbow lies on the pole's side of the shoulder-to-target line.
    const elbow = arm.mid.getWorldPosition(new THREE.Vector3()), shoulder = arm.pivot.getWorldPosition(new THREE.Vector3());
    const line = wanted.clone().sub(shoulder).normalize();
    const off = elbow.clone().sub(shoulder); off.addScaledVector(line, -off.dot(line));
    if (off.length() > 1e-4) assert.ok(off.dot(pole) > 0, `elbow toward the pole for ${target}`);
  }
  // Out of reach: the limb points straight at the target and reports the shortfall.
  const far = new THREE.Vector3(1.2, 1.385, 0.5);
  const short = solveLimb(arm.chain, far, pole);
  arm.body.updateMatrixWorld(true);
  const shoulder = arm.pivot.getWorldPosition(new THREE.Vector3()), end = arm.end.getWorldPosition(new THREE.Vector3());
  const length = BODY.upperArm + BODY.forearm;
  assert.ok(Math.abs(short - (far.distanceTo(shoulder) - length)) < 1e-6, 'shortfall reported');
  assert.ok(end.distanceTo(shoulder) > length - 0.003, 'the limb is straight');
  assert.ok(end.clone().sub(shoulder).normalize().dot(far.clone().sub(shoulder).normalize()) > 0.9999, 'and points at the target');
});

/** The figure's pivots as `createCharacter` lays them out, without its meshes (node has no canvas for the name tag). */
function figure() {
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  root.add(body); body.add(head); head.position.y = BODY.neckY;
  const side = (sign) => {
    const arm = new THREE.Group(); arm.position.set(sign * BODY.shoulderX, BODY.shoulderY, 0); body.add(arm);
    const forearm = new THREE.Group(); forearm.position.y = -BODY.upperArm; arm.add(forearm);
    const hand = new THREE.Group(); hand.position.y = -BODY.forearm; forearm.add(hand);
    const leg = new THREE.Group(); leg.position.set(sign * BODY.hipX, BODY.hipY, 0); body.add(leg);
    const shin = new THREE.Group(); shin.position.y = -BODY.thigh; leg.add(shin);
    const ankle = new THREE.Object3D(); ankle.position.y = -BODY.shin; shin.add(ankle);
    return { arm, forearm, hand, leg, shin, ankle };
  };
  const l = side(-1), r = side(1);
  return { root, body, head, leftArm: l.arm, rightArm: r.arm, leftForearm: l.forearm, rightForearm: r.forearm, leftHand: l.hand, rightHand: r.hand,
    leftLeg: l.leg, rightLeg: r.leg, leftShin: l.shin, rightShin: r.shin, ankles: { left: l.ankle, right: r.ankle } };
}

test('a figure in the driver\'s seat reaches the wheel and the pedals and stays inside the cabin', () => {
  const car = new THREE.Group();
  car.rotation.y = 0.7;
  car.position.set(3, 0, -2);
  const interior = createSedanInterior();
  car.add(interior);
  car.updateMatrixWorld(true);
  const contract = readContract(interior);
  // Every seat at full size, and the driver's seat for the smallest crew member (Fruit Loop, 0.78) and a tall one.
  for (const [seat, scale] of [['driver', 1], ['passenger', 1], ['rearL', 1], ['rearR', 1], ['driver', 0.78], ['passenger', 0.78], ['driver', 1.06]]) {
    const targets = contract.seats[seat];
    const person = figure();
    person.root.scale.setScalar(scale);
    person.root.position.copy(seatRootPosition(targets.seat, scale));
    person.root.rotation.y = car.rotation.y + Math.PI / 2;
    person.body.position.y = -SEATED_BODY_DROP;
    person.leftLeg.rotation.x = person.rightLeg.rotation.x = -1.5;
    person.leftShin.rotation.x = person.rightShin.rotation.x = 1.5;
    const points = {
      hands: { left: world(targets.hands.left), right: world(targets.hands.right) },
      feet: { left: world(targets.feet.left), right: world(targets.feet.right) },
    };
    const short = poseSeated(person, points);
    const label = `${seat} at scale ${scale}`;
    assert.ok(short < 0.01, `${label}: every target within reach (short by ${short.toFixed(3)} m)`);
    person.root.updateMatrixWorld(true);
    assert.ok(world(person.leftHand).distanceTo(points.hands.left) < 0.01 && world(person.rightHand).distanceTo(points.hands.right) < 0.01, `${label}: wrists on their targets`);
    assert.ok(world(person.ankles.left).distanceTo(points.feet.left) < 0.01 && world(person.ankles.right).distanceTo(points.feet.right) < 0.01, `${label}: ankles on their targets`);
    // Every joint, the head's top and the knees stay inside the cabin, in the car's own frame.
    const local = (p) => car.worldToLocal(p.clone());
    const joints = [world(person.head).add(new THREE.Vector3(0, 0.14 * scale, 0)), world(person.leftHand), world(person.rightHand), world(person.leftShin), world(person.rightShin),
      world(person.ankles.left), world(person.ankles.right), world(person.leftLeg), world(person.rightLeg), world(person.leftForearm), world(person.rightForearm)];
    for (const joint of joints) assert.ok(inside(local(joint)), `${label}: inside the cabin ${JSON.stringify(local(joint))}`);
    // Knees stay below the dash line and above the floor; hips at seat height.
    for (const knee of [world(person.leftShin), world(person.rightShin)]) assert.ok(local(knee).y > SEDAN_LAYOUT.floorY + 0.1 && local(knee).y < 1.0, `${label}: knee height ${local(knee).y}`);
    assert.ok(Math.abs(local(world(person.leftLeg)).y - SEDAN_LAYOUT.seatY) < 0.03, `${label}: hips at seat height (${local(world(person.leftLeg)).y.toFixed(3)})`);
  }
  // The limbs come straight from the figure's pivots, so an imported model copying them follows.
  assert.deepEqual(Object.keys(limbsOf(figure())), ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']);
});
