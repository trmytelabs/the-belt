import assert from 'node:assert/strict';
import test from 'node:test';
import { PACE_SAMPLES, PACE_STEP_MS, cleanPace, paceAt, samplePace } from '../src/three/pace.ts';
import { RECORD_KEY, emptyRecord, loadRecord, recordNight, saveRecord } from '../src/three/nightRecord.ts';

// Racing your best night: the shift's score every five seconds, kept with the best night.

const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, String(value)); }, data };
};
const night = (over = {}) => ({ won: true, total: 5000, grade: 'A', sorted: 50, opener: 'opener-1', date: '2026-10-21', ...over });

test('the score is noted once per five seconds of shift time, catching up after a long frame, and capped', () => {
  assert.equal(PACE_STEP_MS, 5_000);
  const samples = [];
  samplePace(samples, 0, 0);
  samplePace(samples, 4_900, 120);
  assert.deepEqual(samples, [0], 'nothing new until the next step');
  samplePace(samples, 5_000, 150);
  samplePace(samples, 16_000, 400.6);
  assert.deepEqual(samples, [0, 150, 401, 401], 'a long frame fills the steps it skipped with the score it reached');
  samplePace(samples, 1e9, 9000);
  assert.equal(samples.length, PACE_SAMPLES);
  samplePace(samples, 2_000, -40);
  assert.equal(samples.length, PACE_SAMPLES, 'never past the cap');
});

test('the best pace is read between notes and holds past the last one', () => {
  const best = [0, 100, 300];
  assert.equal(paceAt(best, 0), 0);
  assert.equal(paceAt(best, 2_500), 50);
  assert.equal(paceAt(best, 7_500), 200);
  assert.equal(paceAt(best, 10_000), 300);
  assert.equal(paceAt(best, 60_000), 300);
  assert.equal(paceAt(undefined, 5_000), null);
  assert.equal(paceAt([], 5_000), null);
});

test('a new best night keeps its notes; a lower night leaves them, and odd stored notes are cleaned', () => {
  const first = recordNight(emptyRecord(), night({ pace: [0, 90, 210] })).record;
  assert.deepEqual(first.best.pace, [0, 90, 210]);
  const lower = recordNight(first, night({ total: 4000, pace: [0, 500] })).record;
  assert.deepEqual(lower.best.pace, [0, 90, 210], 'only a new best replaces them');
  const bare = recordNight(emptyRecord(), night()).record;
  assert.equal('pace' in bare.best, false, 'a night with no notes stores none');
  const store = memory();
  saveRecord(store, first);
  assert.deepEqual(loadRecord(store).best.pace, [0, 90, 210]);
  assert.deepEqual(cleanPace([5, -3, 'x', 7.9, Infinity]), [5, 0, 0, 7, 0]);
  assert.equal(cleanPace('nope'), undefined);
  assert.equal(cleanPace([]), undefined);
  assert.equal(cleanPace(Array(99).fill(1)).length, PACE_SAMPLES);
  const odd = loadRecord(memory({ [RECORD_KEY]: JSON.stringify({ played: 1, completed: 1, best: { total: 10, grade: 'B', sorted: 1, date: '', pace: 'x' } }) }));
  assert.equal('pace' in odd.best, false);
});
