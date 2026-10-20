import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

import * as references from '../src/game/slice/DepotReferences.ts';
import { ShiftModel } from '../src/game/slice/ShiftModel.ts';
import { MESA as MESA_3D } from '../src/three/references.ts';

// The retained original source is the reference, rather than a second manually
// copied list in this test. This checks content provenance, not rendered event
// behavior; the browser suite must separately prove timing and accessibility.
const sourceCache = new Map();
function source(path) {
  if (!sourceCache.has(path)) {
    const filename = new URL(path.startsWith('three/') ? `../src/${path}` : `../src/game/${path}`, import.meta.url);
    sourceCache.set(path, ts.createSourceFile(path, readFileSync(filename, 'utf8'),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
  }
  return sourceCache.get(path);
}

function find(root, predicate) {
  if (predicate(root)) return root;
  return ts.forEachChild(root, node => find(node, predicate));
}

function unwrap(node) {
  while (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
  return node;
}

function variable(path, name) {
  const declaration = find(source(path), node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === name);
  assert.ok(declaration?.initializer, `${path} must retain original variable ${name}`);
  return unwrap(declaration.initializer);
}

function literal(node) {
  assert.ok(ts.isStringLiteralLike(node), `expected authored string, found ${ts.SyntaxKind[node.kind]}`);
  return node.text;
}

function array(path, name) {
  const initializer = variable(path, name);
  assert.ok(ts.isArrayLiteralExpression(initializer), `${name} must remain an authored array`);
  return initializer.elements.map(literal);
}

function allStrings(root) {
  const found = [];
  function visit(node) {
    if (ts.isStringLiteralLike(node)) found.push(node.text);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return found;
}

function normalized(text) { return text.replace(/\s+/g, ' ').trim(); }

for (const [exportName, path, originalName] of [
  ['KYLIE_QUOTES', 'entities/KylieNpc.ts', 'KYLIE_QUOTES'],
  ['SHAN_RANTS', 'entities/ShanNpc.ts', 'RANT_POOL'],
  ['WORKER_SWEARS', 'entities/UnitedWayEvent.ts', 'WORKER_SWEARS'],
  ['COUGH_LINES', 'entities/TruckExhaustEvent.ts', 'COUGH_LINES'],
  ['SHOT_WORDS', 'entities/BenGunmanEvent.ts', 'SHOT_WORDS'],
  ['CLOCK_OUT_LINES', 'scenes/GameScene.ts', 'workerLines'],
]) {
  test(`${exportName} preserves every original variant, intentional spelling and sequence`, () => {
    assert.deepEqual(references[exportName], array(path, originalName));
  });
}

test('Mesa retains legacy dialogue and the 3D offer describes its points-only catch penalty', () => {
  const original = new Set([
    ...allStrings(source('systems/BeltEventSystem.ts')),
    ...allStrings(source('scenes/GameScene.ts')),
  ]);
  assert.deepEqual(Object.keys(references.MESA).sort(),
    ['spotted', 'title', 'offer', 'body', 'leave', 'thought', 'caught', 'caughtDetail'].sort());
  for (const [key, copy] of Object.entries(references.MESA)) {
    if (key === 'body') {
      assert.match(copy, /1 IN 5/);
      assert.match(copy, /the run ends/);
    } else assert.ok(original.has(copy), `Mesa ${key} must retain exact original copy`);
  }
  assert.match(MESA_3D.body, /lose up to 500 points and get back to work/);
  assert.deepEqual({ ...MESA_3D, body: references.MESA.body }, references.MESA);
  // This deliberately checks advertised copy, not original risk behavior. The
  // old mesaCaught state was unreachable; its new implementation needs explicit
  // outcome tests rather than pretending the old source already rolled a risk.
});

test('Ben, the gunman and Paula retain their exact original words and punctuation', () => {
  const actual = new Set(allStrings(source('three/setpieces.ts')).map(normalized));
  for (const name of ['BEN_LINE', 'GUNMAN_LINE', 'PAULA_LINE']) {
    const original = literal(variable('entities/BenGunmanEvent.ts', name));
    assert.ok(actual.has(normalized(original)), `${name} must retain original wording and punctuation`);
  }
});

test('every original named shipping label exists and actually spawns during the new shift', () => {
  const shippingLabels = new Set();
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText() === 'labelText') {
      if (ts.isStringLiteralLike(node.initializer)) shippingLabels.add(normalized(node.initializer.text));
    }
    ts.forEachChild(node, visit);
  }
  visit(source('systems/SpawnSystem.ts'));
  assert.equal(shippingLabels.size, 8, 'retain the complete named original freight baseline');

  const model = new ShiftModel();
  const spawned = new Set();
  for (let elapsed = 0; elapsed <= model.durationMs; elapsed += 100) {
    for (const parcel of model.packages) {
      spawned.add(normalized(parcel.label));
      // Synthetic instant collection isolates the authored spawn schedule from
      // backlog failure. No assertion here claims this is normal playability.
      parcel.state = 'delivered';
    }
    model.update(100);
  }
  for (const name of shippingLabels) assert.ok(spawned.has(name), `${name} must be reachable before the shift ends`);
  assert.ok(!spawned.has('THE SNAKES CELL'), 'Hussan must collect his separate event prop; do not replace it with ordinary freight');
});

test('the playable scene retains all eight original resident identities', () => {
  const originalConfigs = variable('scenes/GameScene.ts', 'ambientConfigs');
  assert.ok(ts.isArrayLiteralExpression(originalConfigs));
  const names = originalConfigs.elements.map(config => {
    assert.ok(ts.isObjectLiteralExpression(config));
    const name = config.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText() === 'name');
    return literal(name.initializer).toUpperCase();
  });
  const residents = variable('three/world.ts', 'RESIDENTS');
  assert.ok(ts.isArrayLiteralExpression(residents));
  const actual = residents.elements.map(entry => {
    assert.ok(ts.isArrayLiteralExpression(entry));
    const spec = entry.elements[3];
    assert.ok(ts.isObjectLiteralExpression(spec));
    const name = spec.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText() === 'name');
    return literal(name.initializer);
  });
  assert.deepEqual(actual.sort(), names.sort());
});
