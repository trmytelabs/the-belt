import assert from 'node:assert/strict';
import test from 'node:test';
import { MEDALS } from '../src/three/medals.ts';
import { RANKS, rankNeeds, seniority } from '../src/three/seniority.ts';

// Seniority: six titles climbed with finished nights and medals, worked out from the record.

const record = (completed, medals = 0) => ({ completed, medals: MEDALS.slice(0, medals).map((medal) => medal.id) });

test('six ranks, each asking for at least as much as the one before, the last for every medal', () => {
  assert.deepEqual(RANKS.map((rank) => rank.title), ['NEW HIRE', 'PART-TIMER', 'LOADER', 'SENIOR LOADER', 'PRELOAD LEAD', 'BELT LEGEND']);
  for (let i = 1; i < RANKS.length; i += 1) {
    assert.ok(RANKS[i].nights > RANKS[i - 1].nights && RANKS[i].medals >= RANKS[i - 1].medals, RANKS[i].title);
  }
  assert.equal(RANKS.at(-1).medals, MEDALS.length);
});

test('a fresh record is a new hire; finished nights and medals climb the ranks in order', () => {
  assert.deepEqual(seniority(record(0)), { rank: RANKS[0], level: 0, next: RANKS[1] });
  assert.equal(seniority(record(1)).rank.title, 'PART-TIMER');
  assert.equal(seniority(record(5, 1)).rank.title, 'LOADER');
  assert.equal(seniority(record(6, 2)).rank.title, 'LOADER', 'senior needs three medals as well as six nights');
  assert.equal(seniority(record(6, 3)).rank.title, 'SENIOR LOADER');
  // Medals alone never skip a rank: ten medals and four finished nights is still a loader.
  assert.equal(seniority(record(4, 10)).rank.title, 'LOADER');
  assert.equal(seniority(record(40, 9)).rank.title, 'PRELOAD LEAD');
  const top = seniority(record(15, MEDALS.length));
  assert.equal(top.rank.title, 'BELT LEGEND');
  assert.equal(top.next, null);
});

test('each rank says what it asks for', () => {
  assert.deepEqual(RANKS.slice(1).map(rankNeeds), [
    '1 FINISHED NIGHT', '3 FINISHED NIGHTS', '6 FINISHED NIGHTS AND 3 MEDALS', '10 FINISHED NIGHTS AND 6 MEDALS', '15 FINISHED NIGHTS AND EVERY MEDAL',
  ]);
});
