import assert from 'node:assert/strict';
import test from 'node:test';
import { ENDLESS_MEDALS, MEDALS, MEDAL_IDS, awardMedals } from '../src/three/medals.ts';

// Medals: thirteen achievements, each earned once, kept with the record.

const facts = (over = {}) => ({
  won: true, grade: 'B', peak: false, goalsMet: 1, goalsTotal: 3, priorityCount: 4, priorityOnTime: 2, bestCombo: 6,
  wrongDrops: 1, damaged: 0, missed: 2, safeDrive: false, openersSeen: 1, nightsPlayed: 1, ...over,
});

test('thirteen medals with distinct ids, each with a title and how it is earned', () => {
  assert.equal(MEDALS.length, 13);
  assert.equal(MEDAL_IDS.size, 13);
  for (const medal of MEDALS) assert.ok(medal.title && medal.detail, medal.id);
});

test('each medal is earned by its own feat and not by an ordinary night', () => {
  const byId = Object.fromEntries(MEDALS.map((medal) => [medal.id, medal]));
  const ordinary = facts();
  assert.deepEqual(MEDALS.filter((medal) => medal.earned(ordinary)).map((medal) => medal.id), ['first-shift']);
  assert.equal(byId['first-shift'].earned(facts({ won: false })), false);
  assert.equal(byId['s-rank'].earned(facts({ grade: 'S' })), true);
  assert.equal(byId['s-rank'].earned(facts({ grade: 'S', won: false })), false);
  assert.equal(byId.peak.earned(facts({ peak: true })), true);
  assert.equal(byId.peak.earned(facts({ peak: true, won: false })), false);
  assert.equal(byId['all-goals'].earned(facts({ goalsMet: 3 })), true);
  assert.equal(byId['all-goals'].earned(facts({ goalsMet: 0, goalsTotal: 0 })), false);
  assert.equal(byId['on-the-dot'].earned(facts({ priorityCount: 3, priorityOnTime: 3 })), true);
  assert.equal(byId['on-the-dot'].earned(facts({ priorityCount: 2, priorityOnTime: 2 })), false, 'at least three');
  assert.equal(byId.twenty.earned(facts({ bestCombo: 20 })), true);
  assert.equal(byId['clean-sheet'].earned(facts({ wrongDrops: 0, missed: 0 })), true);
  assert.equal(byId['clean-sheet'].earned(facts({ wrongDrops: 0, missed: 0, won: false })), false);
  assert.equal(byId['safe-driver'].earned(facts({ safeDrive: true })), true);
  assert.equal(byId['seen-it-all'].earned(facts({ openersSeen: 3 })), true);
  assert.equal(byId.regular.earned(facts({ nightsPlayed: 10 })), true);
});

test('a medal is new only once; held medals stay, unknown ids drop, and the list keeps its order', () => {
  const first = awardMedals([], facts({ grade: 'S' }));
  assert.deepEqual(first.medals, ['first-shift', 's-rank']);
  assert.deepEqual(first.fresh.map((medal) => medal.id), ['first-shift', 's-rank']);
  const again = awardMedals(first.medals, facts({ grade: 'S', bestCombo: 22 }));
  assert.deepEqual(again.fresh.map((medal) => medal.id), ['twenty'], 'only the new one is announced');
  assert.deepEqual(again.medals, ['first-shift', 's-rank', 'twenty']);
  const failed = awardMedals(['regular', 'bogus', 'first-shift'], facts({ won: false }));
  assert.deepEqual(failed.medals, ['first-shift', 'regular']);
  assert.deepEqual(failed.fresh, []);
});

test('the endless shift earns its own two medals, and nights never do', () => {
  const byId = Object.fromEntries(MEDALS.map((medal) => [medal.id, medal]));
  assert.deepEqual([ENDLESS_MEDALS.level, ENDLESS_MEDALS.sorted], [5, 60]);
  const endless = (level, sorted) => facts({ won: false, grade: '', goalsMet: 0, goalsTotal: 0, endlessLevel: level, endlessSorted: sorted });
  assert.equal(byId['long-haul'].earned(endless(4, 10)), false);
  assert.equal(byId['long-haul'].earned(endless(5, 10)), true);
  assert.equal(byId.marathon.earned(endless(9, 59)), false);
  assert.equal(byId.marathon.earned(endless(2, 60)), true);
  assert.equal(byId['long-haul'].earned(facts({ bestCombo: 99 })), false, 'a night carries no endless level');
  assert.deepEqual(awardMedals([], endless(5, 60)).fresh.map((medal) => medal.id), ['long-haul', 'marathon']);
  assert.deepEqual(awardMedals([], endless(1, 3)).fresh, [], 'a short endless shift earns nothing, not even FIRST SHIFT');
});
