import assert from 'node:assert/strict';
import test from 'node:test';
import { PERKS, PERKS_PER_NIGHT, perkById, perkOffer } from '../src/three/perks.ts';
import { INSPECTION_3D, PRIORITY_3D, ShiftModel3D } from '../src/three/ShiftModel3D.ts';
import { NIGHT_GOALS } from '../src/three/nightGoals.ts';

// Night perks: three offered a night, one picked, changing that night's rules only.

test('six perks, three different ones offered a night, and six nights see six different offers', () => {
  assert.equal(PERKS.length, 6);
  assert.equal(new Set(PERKS.map((perk) => perk.id)).size, 6);
  const offers = new Set();
  for (let played = 0; played < 6; played++) {
    const offer = perkOffer(played);
    assert.equal(offer.length, PERKS_PER_NIGHT);
    assert.equal(new Set(offer.map((perk) => perk.id)).size, PERKS_PER_NIGHT, `night ${played} repeats a perk`);
    offers.add(offer.map((perk) => perk.id).join());
  }
  assert.equal(offers.size, 6);
  assert.deepEqual(perkOffer(-1), perkOffer(0));
  assert.equal(perkById('quick-feet')?.title, 'QUICK FEET');
  assert.equal(perkById('nope'), null);
  assert.equal(perkById(null), null);
});

const withPerk = (id) => { const model = new ShiftModel3D(); perkById(id).apply(model); return model; };

test('each perk changes its own rule on a real shift and nothing else', () => {
  const plain = new ShiftModel3D();
  assert.deepEqual([plain.beltStopsLimit, plain.beltStopsRemaining, plain.priorityWindowMs, plain.walkPace, plain.rushPace, plain.inspectionPay, plain.capacity],
    [3, 3, PRIORITY_3D.windowMs, 1, 1, INSPECTION_3D.bonus, 7]);
  const stops = withPerk('extra-stop');
  assert.deepEqual([stops.beltStopsLimit, stops.beltStopsRemaining], [4, 4]);
  stops.brake();
  const noStop = NIGHT_GOALS.find((goal) => goal.id === 'no-stop');
  assert.equal(noStop.met({ ...stops, won: true, beltStopsRemaining: stops.beltStopsRemaining, beltStopsLimit: stops.beltStopsLimit }), false, 'one stop used of four is still a stop');
  assert.equal(withPerk('longer-priority').priorityWindowMs, 20_000);
  assert.equal(withPerk('roomy-recovery').capacity, 8);
  assert.equal(withPerk('favourite').inspectionPay, 75);
  // Quick feet: the same push walks further in the same time.
  const walk = (model) => { const start = model.activeWorker.y; for (let i = 0; i < 50; i++) model.update(10, { x: 0, y: 1 }); return model.activeWorker.y - start; };
  const ordinary = walk(new ShiftModel3D({ autonomousCoworker: false })), quick = walk(Object.assign(new ShiftModel3D({ autonomousCoworker: false }), { walkPace: 1.06 }));
  assert.ok(quick > ordinary * 1.04 && quick < ordinary * 1.08, `6% further: ${quick} vs ${ordinary}`);
  // Easy rush: fewer arrivals in the rush.
  const rushArrivals = (model) => { model.capacity = 999; let before = 0; for (let t = 0; t < 180_000; t += 10) { model.update(10); if (model.elapsedMs === 132_000) before = model.packages.length; } return model.packages.length - before; };
  const normalRush = rushArrivals(new ShiftModel3D({ freightRandom: () => 0.3 })), easyRush = rushArrivals(withPerk('easy-rush'));
  assert.ok(easyRush < normalRush, `fewer parcels in the rush: ${easyRush} vs ${normalRush}`);
});
