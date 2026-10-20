import assert from 'node:assert/strict';
import test from 'node:test';
import { depotSolidFootprints, overlapsFootprint } from '../src/game/slice/DepotClearance.ts';
import { BREAK_SCENES } from '../src/game/slice/StoryScript.ts';
import { breakScene3d } from '../src/three/breakScenes3d.ts';
import { DEPOT_DRESSING } from '../src/three/depotDressing.ts';
import { DEPOT_3D_LAYOUT as L } from '../src/three/layout.ts';
import { WALL_PILE_FULL_BY, WALL_PILE_ROOF, WALL_PILE_ZONES, buildWallPiles } from '../src/three/wallPiles.ts';

// Christmas peak: cartons pile against the depot walls through the 3D shift,
// reach the top of the walls and overflow, without ever entering a space a
// worker, coworker, visitor or truck uses.
const toModel = (box) => ({ x: box.x * 32 + L.beltX, y: box.z * 32 + 340, width: box.w * 32, height: box.d * 32 });
const boxes = buildWallPiles();

test('the wall piles are the same every night and land in time order', () => {
  assert.deepEqual(buildWallPiles(), boxes, 'deterministic');
  assert.ok(boxes.length > 600, `${boxes.length} cartons make a real pile-up`);
  for (let i = 1; i < boxes.length; i += 1) assert.ok(boxes[i].at >= boxes[i - 1].at, 'sorted by landing time');
  assert.ok(boxes.every((box) => box.at >= 0 && box.at <= 1), 'everything lands within the three minutes');
});

test('columns rise unevenly, reach the roof, then overflow at the edges', () => {
  const stacked = boxes.filter((box) => !box.spill);
  const spilled = boxes.filter((box) => box.spill);
  assert.ok(spilled.length > 100, 'plenty of overflow');
  assert.ok(stacked.every((box) => box.y + box.h / 2 <= WALL_PILE_ROOF + 1e-9), 'no carton passes through the roof');
  assert.ok(stacked.every((box) => box.at <= WALL_PILE_FULL_BY), 'every column is full before the end');
  // Group stacked cartons by column (same zone and centre within a few centimetres).
  const columns = new Map();
  for (const box of stacked) {
    columns.set(box.column, [...(columns.get(box.column) ?? []), box]);
  }
  const fullAt = [...columns.values()].map((column) => Math.max(...column.map((box) => box.at)));
  for (const column of columns.values()) {
    const top = Math.max(...column.map((box) => box.y + box.h / 2));
    assert.ok(top > WALL_PILE_ROOF - 0.65, `a column reaches the roof (${top.toFixed(2)} m)`);
  }
  assert.ok(Math.max(...fullAt) - Math.min(...fullAt) > 0.15, 'columns fill at different times');
  const halfway = stacked.filter((box) => box.at <= 0.5).length / stacked.length;
  assert.ok(halfway > 0.25 && halfway < 0.85, `the pile is part-built halfway through (${halfway.toFixed(2)})`);
  const full = new Map([...columns].map(([id, column]) => [id, Math.max(...column.map((box) => box.at))]));
  assert.ok(spilled.every((box) => box.at > full.get(box.column)), 'a column overflows only once it is full');
  assert.ok(spilled.every((box) => box.from && box.from.y >= WALL_PILE_ROOF), 'overflow tumbles off the top');
});

test('piles and overflow stay in the corners, clear of every route, truck and prop', () => {
  const solids = depotSolidFootprints(L, L.crewTruckRows, L.playerTruckDepth);
  const margin = 0.5;
  for (const box of boxes) {
    const zone = WALL_PILE_ZONES.find((candidate) => candidate.name === box.zone);
    const area = box.spill ? zone.spill : zone.pile;
    const reach = Math.max(box.w, box.d) / 2 + 0.25;
    assert.ok(box.x >= Math.min(area.minX, zone.pile.minX) - reach && box.x <= Math.max(area.maxX, zone.pile.maxX) + reach, `${box.zone} carton inside its corner (x ${box.x.toFixed(2)})`);
    assert.ok(Math.abs(box.x) + Math.max(box.w, box.d) / 2 <= 15.2 + margin, 'inside the side walls');
    const model = toModel(box);
    assert.ok(model.y - model.height / 2 >= L.worldTop - 16 && model.y + model.height / 2 <= L.bulkRearWall.y, 'between the receiving and rear walls');
    // Off the platform, its stairs and the lower floor where the workers walk.
    assert.ok(model.x + model.width / 2 < L.platform.left || model.x - model.width / 2 > L.platform.right, 'off the platform');
    for (const floor of [L.lowerFloor.left, L.lowerFloor.right]) {
      const inside = model.y + model.height / 2 > L.lowerFloor.top && model.x + model.width / 2 > floor.minX + L.workerRadius && model.x - model.width / 2 < floor.maxX - L.workerRadius;
      assert.ok(!inside, `${box.zone} carton stays off the walkable lower floor`);
    }
    for (const rect of [...solids, L.floorStorage.T, L.floorStorage.S]) {
      assert.ok(!overlapsFootprint(model, 0, { ...rect, width: rect.width + model.width, height: rect.height + model.height }), `${box.zone} clear of solid scenery`);
    }
    // The first truck row and its drive-out lane stay clear.
    assert.ok(model.y + model.height / 2 < Math.min(...L.crewTruckRows) - L.truckDepth / 2 - L.workerRadius || model.y > 1100, 'clear of the truck rows');
  }
  for (const item of DEPOT_DRESSING) {
    for (const box of boxes) {
      const model = toModel(box);
      const apart = Math.abs(model.x - item.x) >= model.width / 2 + 16 || Math.abs(model.y - item.y) >= model.height / 2 + 16;
      assert.ok(apart, `${box.zone} carton clear of the ${item.id} at ${item.x},${item.y}`);
    }
  }
});

test('the 3D Tim Hortons break is inside; the shared script keeps the lot', () => {
  for (const scene of BREAK_SCENES.timhortons) {
    const inside = breakScene3d(scene);
    assert.equal(inside.beats.length, scene.beats.length);
    inside.beats.forEach((beat, index) => {
      assert.equal(beat.speaker, scene.beats[index].speaker);
      assert.equal(beat.cue, scene.beats[index].cue);
    });
    const text = JSON.stringify(inside.beats.map((beat) => [beat.line, beat.direction]));
    assert.doesNotMatch(text, /\bcar\b|parking lot|back seat|\bhood\b/i, `${scene.id} no longer places the crew in the car`);
  }
  assert.equal(breakScene3d(BREAK_SCENES.timhortons[1]).beats[3].line, "We haven't left the counter.");
  assert.equal(BREAK_SCENES.timhortons[1].beats[3].line, "We haven't left the parking lot.", 'the 2D script is unchanged');
  for (const scene of BREAK_SCENES['7eleven']) assert.equal(breakScene3d(scene), scene, '7-Eleven plays as written');
});
