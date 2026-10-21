import assert from 'node:assert/strict';
import test from 'node:test';
import { MEDALS, MEDAL_IDS, awardMedals } from '../src/three/medals.ts';

// Medals: ten achievements, each earned once, kept with the record.

const facts = (over = {}) => ({
  won: true, grade: 'B', peak: false, goalsMet: 1, goalsTotal: 3, priorityCount: 4, priorityOnTime: 2, bestCombo: 6,
  wrongDrops: 1, damaged: 0, missed: 2, safeDrive: false, openersSeen: 1, nightsPlayed: 1, ...over,
});

test('ten medals with distinct ids, each with a title and how it is earned', () => {
  assert.equal(MEDALS.length, 10);
  assert.equal(MEDAL_IDS.size, 10);
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
