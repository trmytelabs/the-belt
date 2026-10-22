import assert from 'node:assert/strict';
import test from 'node:test';
import { DAILY_KEY, dailyDate, dailyNight, dailySeed, emptyDaily, loadDaily, previousDay, recordDaily, saveDaily, seededRandom } from '../src/three/daily.ts';
import { PERKS } from '../src/three/perks.ts';
import { ShiftModel3D } from '../src/three/ShiftModel3D.ts';

// The daily challenge: one seeded night a day, its best and the days in a row, kept on this device.

const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, String(value)); }, data };
};
/** The freight a night brings in its first minute (and a half), as the player sees it. */
const freight = (night, ms = 90_000) => {
  const m = new ShiftModel3D({ freightRandom: night.random.freight, random: night.random.throws, prizeRandom: night.random.prizes });
  m.capacity = 999;
  for (let t = 0; t < ms; t += 10) m.update(10);
  return m.packages.map(({ id, route, kind, label, address }) => `${id} ${route} ${kind} ${label} ${address}`);
};

test('dates are this device\'s calendar days, and the day before crosses months, years and leap days', () => {
  assert.equal(dailyDate(new Date(2026, 9, 22, 23, 59)), '2026-10-22');
  assert.equal(dailyDate(new Date(2026, 0, 5, 0, 1)), '2026-01-05');
  assert.equal(previousDay('2026-10-22'), '2026-10-21');
  assert.equal(previousDay('2026-03-01'), '2026-02-28');
  assert.equal(previousDay('2028-03-01'), '2028-02-29');
  assert.equal(previousDay('2027-01-01'), '2026-12-31');
});

test('a date always gives the same seed, rule, goals and random numbers, and nearby days differ', () => {
  assert.equal(dailySeed('2026-10-22'), dailySeed('2026-10-22'));
  const seeds = new Set(Array.from({ length: 30 }, (_, i) => dailySeed(dailyDate(new Date(2026, 9, 1 + i)))));
  assert.equal(seeds.size, 30, 'a month of different seeds');
  const a = seededRandom(42), b = seededRandom(42);
  const numbers = Array.from({ length: 200 }, () => a());
  assert.deepEqual(numbers, Array.from({ length: 200 }, () => b()));
  assert.ok(numbers.every((n) => n >= 0 && n < 1) && new Set(numbers).size === 200);
  const today = dailyNight('2026-10-22'), again = dailyNight('2026-10-22');
  assert.equal(today.perk.id, again.perk.id);
  assert.deepEqual(today.goals.map((goal) => goal.id), again.goals.map((goal) => goal.id));
  assert.equal(new Set(today.goals.map((goal) => goal.id)).size, 3, 'three different goals');
  // Two weeks see most of the rules.
  const rules = new Set(Array.from({ length: 14 }, (_, i) => dailyNight(dailyDate(new Date(2026, 9, 1 + i))).perk.id));
  assert.ok(rules.size >= 4 && [...rules].every((id) => PERKS.some((perk) => perk.id === id)), `rules: ${[...rules]}`);
});

test('every player gets the same freight on a day, whatever else they do, and another day brings other freight', () => {
  const first = freight(dailyNight('2026-10-22'));
  assert.ok(first.length >= 15);
  assert.deepEqual(freight(dailyNight('2026-10-22')), first, 'the same night on another device');
  // Throws and prizes draw from their own streams: using them never shifts the freight.
  const busy = dailyNight('2026-10-22');
  for (let i = 0; i < 50; i++) { busy.random.throws(); busy.random.prizes(); }
  assert.deepEqual(freight(busy), first);
  const other = freight(dailyNight('2026-10-23'));
  assert.notDeepEqual(other.slice(0, 12), first.slice(0, 12));
});

test('today\'s tries keep the best total, and the first try each day extends the run of days', () => {
  const storage = memory();
  assert.deepEqual(loadDaily(storage, '2026-10-21'), emptyDaily('2026-10-21'));
  let { record, newBest } = recordDaily(loadDaily(storage, '2026-10-21'), 4200, 'B');
  assert.equal(newBest, true);
  assert.deepEqual(record, { date: '2026-10-21', tries: 1, best: 4200, grade: 'B', streak: 1 });
  saveDaily(storage, record);
  ({ record, newBest } = recordDaily(loadDaily(storage, '2026-10-21'), 3900, 'C'));
  assert.equal(newBest, false);
  assert.deepEqual(record, { date: '2026-10-21', tries: 2, best: 4200, grade: 'B', streak: 1 }, 'a lower try keeps the best and the run');
  saveDaily(storage, record);
  // The next day: the run carries on from yesterday and today's first try extends it.
  const next = loadDaily(storage, '2026-10-22');
  assert.deepEqual(next, { date: '2026-10-22', tries: 0, best: null, grade: '', streak: 1 });
  ({ record } = recordDaily(next, 3000, 'C'));
  assert.deepEqual([record.tries, record.best, record.streak], [1, 3000, 2]);
  saveDaily(storage, record);
  ({ record, newBest } = recordDaily(loadDaily(storage, '2026-10-22'), 5100, 'A'));
  assert.deepEqual([newBest, record.tries, record.best, record.grade, record.streak], [true, 2, 5100, 'A', 2]);
  saveDaily(storage, record);
  // A missed day ends the run.
  assert.equal(loadDaily(storage, '2026-10-24').streak, 0);
  assert.equal(recordDaily(loadDaily(storage, '2026-10-24'), 100, 'F').record.streak, 1);
});

test('a missing, unreadable or odd daily record reads as a fresh day, and a blocked storage plays on', () => {
  assert.deepEqual(loadDaily(null, '2026-10-22'), emptyDaily('2026-10-22'));
  assert.deepEqual(loadDaily(memory({ [DAILY_KEY]: '{oops' }), '2026-10-22'), emptyDaily('2026-10-22'));
  const odd = memory({ [DAILY_KEY]: JSON.stringify({ date: '2026-10-22', tries: -2, best: 'lots', grade: 'SSSS', streak: 'x' }) });
  assert.deepEqual(loadDaily(odd, '2026-10-22'), { date: '2026-10-22', tries: 0, best: null, grade: 'SS', streak: 0 });
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(loadDaily(blocked, '2026-10-22'), emptyDaily('2026-10-22'));
  assert.doesNotThrow(() => saveDaily(blocked, emptyDaily('2026-10-22')));
});
