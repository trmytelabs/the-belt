import assert from 'node:assert/strict';
import test from 'node:test';
import { clearDepotFootprint, depotSolidFootprints, overlapsFootprint, DEPOT_BODY_RADIUS, DEPOT_CARRY_RADIUS } from '../src/game/slice/DepotClearance.ts';
import { SHIFT_LAYOUT, platformLevelAt, stairAt, onLowerFloor } from '../src/game/slice/ShiftModel.ts';
import { MallModel, MALL_LAYOUT, MALL_RULES, KeyReturnModel, LOT_LAYOUT } from '../src/game/slice/MallModel.ts';

const solids = depotSolidFootprints();
const assertClear = (point, radius, occupied = []) => {
  assert.ok(solids.every(rect => !overlapsFootprint(point, radius, rect)), `scenery collision at ${JSON.stringify(point)}`);
  assert.ok(occupied.every(actor => Math.hypot(point.x - actor.x, point.y - actor.y) >= radius + actor.radius - 1e-5), 'actors overlap');
};

test('crew and carried freight fit between truck rows without shifting a clear pose', () => {
  for (const x of [200, 244, 300, 660, 716, 760]) {
    for (const y of [196, 292, 388, 484]) {
      const point = { x, y };
      assertClear(point, DEPOT_CARRY_RADIUS);
      assert.deepEqual(clearDepotFootprint(point, DEPOT_CARRY_RADIUS, [], solids), point);
    }
  }
});

test('Ralph and the fish tank keep separate bays after the second player trucks', () => {
  const ralph = { ...SHIFT_LAYOUT.ralphBay, width: 148, height: SHIFT_LAYOUT.truckDepth };
  for (const prop of [ralph, SHIFT_LAYOUT.fishTank]) {
    for (const truck of Object.values(SHIFT_LAYOUT.playerTrucks)) {
      const separated = Math.abs(prop.x - truck.x) >= (prop.width + 148) / 2
        || Math.abs(prop.y - truck.y) >= (prop.height + SHIFT_LAYOUT.truckDepth) / 2;
      assert.ok(separated, 'moving D/E must not occupy an existing prop bay');
    }
  }
});

test('crew yields around both active workers and stationary scenery', () => {
  const workers = [{ x: 330, y: 532, radius: 12 }, { x: 630, y: 532, radius: 12 }];
  for (const point of [{ x: 324, y: 532 }, { x: 636, y: 532 }, { x: 480, y: 300 }, SHIFT_LAYOUT.bulkPile, SHIFT_LAYOUT.recoveryPile]) {
    assertClear(clearDepotFootprint(point, DEPOT_BODY_RADIUS, workers, solids), DEPOT_BODY_RADIUS, workers);
  }
});

test('dense synthetic cast placements remain pairwise clear without leaving the platform', () => {
  const actors = [{ x: 365, y: 396, radius: 12 }];
  for (let index = 0; index < 18; index += 1) {
    const point = clearDepotFootprint({ x: 365, y: 396 }, DEPOT_BODY_RADIUS, actors, solids);
    assertClear(point, DEPOT_BODY_RADIUS, actors);
    assert.ok(point.x >= SHIFT_LAYOUT.platform.left + DEPOT_BODY_RADIUS);
    assert.ok(point.x <= SHIFT_LAYOUT.platform.right - DEPOT_BODY_RADIUS);
    actors.push({ ...point, radius: DEPOT_BODY_RADIUS });
  }
});

test('yielding on stairs and lower floor retains the intended supported side', () => {
  for (const side of ['left', 'right']) {
    const stairs = SHIFT_LAYOUT.stairs[side];
    const floor = side === 'left' ? SHIFT_LAYOUT.floorT : SHIFT_LAYOUT.floorS;
    for (const intended of [{ x: (stairs.topX + stairs.bottomX) / 2, y: SHIFT_LAYOUT.stairs.centerY }, floor]) {
      const actor = { ...intended, radius: 12 };
      const point = clearDepotFootprint(intended, 12, [actor], solids);
      assertClear(point, 12, [actor]);
      assert.equal(point.x < 480, side === 'left');
      assert.equal(Boolean(stairAt(point.x, point.y)), Boolean(stairAt(intended.x, intended.y)));
      assert.equal(onLowerFloor(point), onLowerFloor(intended));
      assert.ok(point.y + 12 <= SHIFT_LAYOUT.lowerFloor.bottom);
    }
  }
});

test('crew yielding at the deck end stays above a supported surface', () => {
  for (const x of [365, 480, 595]) {
    const intended = { x, y: SHIFT_LAYOUT.platform.bottom - 14 };
    const occupied = [{ x, y: intended.y - 1, radius: DEPOT_BODY_RADIUS }];
    const point = clearDepotFootprint(intended, DEPOT_BODY_RADIUS, occupied, solids);
    assertClear(point, DEPOT_BODY_RADIUS, occupied);
    assert.equal(platformLevelAt(point.x, point.y), 1, 'yielding cannot drop a deck actor into the central stair gap');
    assert.ok(point.y <= SHIFT_LAYOUT.platform.bottom - DEPOT_BODY_RADIUS, 'the body remains supported at the deck edge');
  }
});

test('mall circle collision catches obstacle corners between the old sampled directions', () => {
  const model = new MallModel(() => 0.5);
  assert.equal(model.free(539, 350, MALL_RULES.skankyRadius), false);
  assert.equal(model.free(536, 350, MALL_RULES.skankyRadius), true);
  for (const obstacle of MALL_LAYOUT.obstacles) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 60) {
      const x = obstacle.x + Math.cos(angle) * 11.9;
      const y = obstacle.y + Math.sin(angle) * 11.9;
      assert.equal(model.free(x, y, 12), false, 'body overlaps obstacle corner');
    }
  }
});

test('mall walk boundaries use exact radius and shared internal seams stay passable', () => {
  const model = new MallModel(() => 0.5);
  assert.equal(model.free(52, 400, 12), true);
  assert.equal(model.free(51.9, 400, 12), false);
  assert.equal(model.free(250, 400, 12), true);
  assert.equal(model.free(290, 400, 12), true);
  assert.equal(model.free(1030, 292, 12), true);
  assert.equal(model.free(1030, 291.9, 12), false);
});

test('key return keeps the complete worker body inside the lot wall', () => {
  const model = new KeyReturnModel();
  Object.assign(model.skanky, { x: 100, y: 160 });
  for (let index = 0; index < 200; index += 1) model.update(10, { x: 0, y: -1 });
  assert.ok(model.skanky.y >= LOT_LAYOUT.walk.y + MALL_RULES.skankyRadius);
});
