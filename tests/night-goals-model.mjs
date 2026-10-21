import assert from 'node:assert/strict';
import test from 'node:test';
import { GOAL_BONUS, GOALS_PER_NIGHT, NIGHT_GOALS, judgeGoals, nightGoals } from '../src/three/nightGoals.ts';
import { ShiftModel3D, BELT_STOPS_3D } from '../src/three/ShiftModel3D.ts';

// Night goals: three a night, rotating with the nights on record, paid at the results.

const shift = (over = {}) => ({ won: true, bestCombo: 0, wrongDrops: 0, priorityOnTime: 0, thrownDeliveries: 0, damaged: 0, missed: 0, bulkSorted: 0, beltStopsRemaining: 3, ...over });

test('each night gets three different goals, mixing kinds, and nine nights see nine different sets', () => {
  const sets = new Set();
  for (let played = 0; played < NIGHT_GOALS.length; played++) {
    const goals = nightGoals(played);
    assert.equal(goals.length, GOALS_PER_NIGHT);
    assert.equal(new Set(goals.map((goal) => goal.id)).size, GOALS_PER_NIGHT, `night ${played} repeats a goal`);
    assert.ok(goals.some((goal) => goal.live) && goals.some((goal) => !goal.live), `night ${played} mixes live and end-of-shift goals`);
    assert.ok(!(goals.some((goal) => goal.id === 'streak') && goals.some((goal) => goal.id === 'long-streak')), `night ${played} pairs the two streaks`);
    sets.add(goals.map((goal) => goal.id).sort().join());
  }
  assert.equal(sets.size, NIGHT_GOALS.length);
  assert.deepEqual(nightGoals(NIGHT_GOALS.length).map((goal) => goal.id), nightGoals(0).map((goal) => goal.id), 'the rotation repeats after nine nights');
  for (const odd of [-2, Number.NaN, Infinity, 0.6]) assert.deepEqual(nightGoals(odd), nightGoals(0), `a record count of ${odd} reads as the first night`);
  assert.deepEqual(nightGoals(0).map((goal) => goal.label), ['Load 8 in a row', 'Finish with no wrong drops', 'Make 3 priority parcels on time']);
});

test('goals about a clean shift need a finished one; goals reached mid-shift do not', () => {
  const byId = Object.fromEntries(NIGHT_GOALS.map((goal) => [goal.id, goal]));
  for (const goal of NIGHT_GOALS.filter((item) => !item.live)) {
    assert.equal(goal.met(shift()), true, `${goal.id} is met by a clean finished shift`);
    assert.equal(goal.met(shift({ won: false })), false, `${goal.id} is not met by failing early`);
  }
  assert.equal(byId.clean.met(shift({ wrongDrops: 1 })), false);
  assert.equal(byId['no-stop'].met(shift({ beltStopsRemaining: 2 })), false);
  assert.equal(byId.unbroken.met(shift({ damaged: 1 })), false);
  assert.equal(byId['few-misses'].met(shift({ missed: 2 })), true);
  assert.equal(byId['few-misses'].met(shift({ missed: 3 })), false);
  for (const [id, over, below] of [['streak', { bestCombo: 8 }, { bestCombo: 7 }], ['long-streak', { bestCombo: 15 }, { bestCombo: 14 }],
    ['priority', { priorityOnTime: 3 }, { priorityOnTime: 2 }], ['thrower', { thrownDeliveries: 3 }, { thrownDeliveries: 2 }], ['bulk', { bulkSorted: 8 }, { bulkSorted: 7 }]]) {
    assert.equal(byId[id].live, true);
    assert.equal(byId[id].met(shift({ won: false, ...over })), true, `${id} counts during the shift`);
    assert.equal(byId[id].met(shift(below)), false, `${id} needs its full count`);
  }
  const { met, bonus } = judgeGoals(nightGoals(0), shift({ bestCombo: 9, wrongDrops: 2 }));
  assert.deepEqual(met.map((goal) => goal.id), ['streak']);
  assert.equal(bonus, GOAL_BONUS);
  assert.equal(judgeGoals(nightGoals(0), shift({ bestCombo: 9, priorityOnTime: 4 })).bonus, 3 * GOAL_BONUS);
});

test('the 3D shift model carries every figure the goals read, and an untouched shift starts with none met', () => {
  const model = new ShiftModel3D();
  for (const key of Object.keys(shift())) assert.equal(typeof model[key], key === 'won' ? 'boolean' : 'number', `the model has ${key}`);
  assert.equal(model.beltStopsRemaining, BELT_STOPS_3D.limit, 'the goals count the same three stops');
  for (const goal of NIGHT_GOALS) assert.equal(goal.met(model), false, `${goal.id} is not met before the shift`);
});

test('the HUD chips count towards live goals, strike out clean-shift goals once broken, and agree with the results', () => {
  const byId = Object.fromEntries(NIGHT_GOALS.map((goal) => [goal.id, goal]));
  assert.deepEqual(byId.streak.chip(shift({ won: false, bestCombo: 5 })), { text: 'STREAK 5/8', state: 'open' });
  assert.deepEqual(byId.streak.chip(shift({ won: false, bestCombo: 11 })), { text: 'STREAK 8/8', state: 'met' });
  assert.deepEqual(byId.bulk.chip(shift({ won: false, bulkSorted: 3 })), { text: 'BULK 3/8', state: 'open' });
  assert.deepEqual(byId.clean.chip(shift({ won: false })), { text: 'NO WRONG DROPS', state: 'open' }, 'still standing mid-shift');
  assert.deepEqual(byId.clean.chip(shift({ won: false, wrongDrops: 1 })), { text: 'NO WRONG DROPS', state: 'lost' }, 'struck out at the first wrong drop');
  assert.deepEqual(byId.clean.chip(shift()), { text: 'NO WRONG DROPS', state: 'met' }, 'met once the shift is finished clean');
  assert.equal(byId['no-stop'].chip(shift({ won: false, beltStopsRemaining: 2 })).state, 'lost');
  const samples = [shift(), shift({ won: false }), shift({ bestCombo: 15, priorityOnTime: 3, thrownDeliveries: 3, bulkSorted: 8 }),
    shift({ wrongDrops: 1, damaged: 1, missed: 3, beltStopsRemaining: 0, bestCombo: 7 })];
  for (const sample of samples) for (const goal of NIGHT_GOALS) {
    assert.equal(goal.chip(sample).state === 'met', goal.met(sample), `${goal.id}'s chip agrees with the results for ${JSON.stringify(sample)}`);
    assert.ok(goal.chip(sample).text.length <= 18, `${goal.id}'s chip stays short: ${goal.chip(sample).text}`);
  }
});
