import assert from 'node:assert/strict';
import test from 'node:test';
import { OPENER_COUNT, RECORD_KEY, emptyRecord, formatTotal, loadRecord, recordNight, saveRecord } from '../src/three/nightRecord.ts';

// The player's record between nights.

const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, String(value)); }, data };
};
const night = (over = {}) => ({ won: true, total: 5000, grade: 'A', sorted: 50, opener: 'opener-1', date: '2026-10-21', ...over });

test('a first finished night is recorded as the best, with its opener', () => {
  const { record, newBest, previous } = recordNight(emptyRecord(), night());
  assert.equal(newBest, true);
  assert.equal(previous, null);
  assert.deepEqual(record, { played: 1, completed: 1, best: { total: 5000, grade: 'A', sorted: 50, date: '2026-10-21' }, openers: ['opener-1'] });
});

test('only a higher total from a finished shift beats the best; a failed night still counts as played', () => {
  const first = recordNight(emptyRecord(), night()).record;
  const lower = recordNight(first, night({ total: 4000, opener: 'opener-2' }));
  assert.equal(lower.newBest, false);
  assert.equal(lower.record.best.total, 5000);
  assert.deepEqual(lower.record.openers, ['opener-1', 'opener-2']);
  const failed = recordNight(lower.record, night({ won: false, total: 9000, grade: 'F', opener: 'opener-2' }));
  assert.equal(failed.newBest, false, 'a failed shift never sets the best, however many points it had');
  assert.equal(failed.record.played, 3);
  assert.equal(failed.record.completed, 2);
  assert.deepEqual(failed.record.openers, ['opener-1', 'opener-2'], 'an opener is listed once');
  const higher = recordNight(failed.record, night({ total: 6100, grade: 'S', opener: 'opener-3' }));
  assert.equal(higher.newBest, true);
  assert.equal(higher.previous.total, 5000);
  assert.equal(higher.record.best.grade, 'S');
  assert.equal(higher.record.openers.length, OPENER_COUNT);
});

test('the record round-trips through storage and a bad or missing one reads as empty', () => {
  const store = memory();
  const { record } = recordNight(emptyRecord(), night());
  assert.equal(saveRecord(store, record), true);
  assert.deepEqual(loadRecord(store), record);
  assert.deepEqual(loadRecord(memory({ [RECORD_KEY]: '{not json' })), emptyRecord());
  assert.deepEqual(loadRecord(null), emptyRecord());
  assert.equal(saveRecord(null, record), false);
  // Tampered values are cleaned rather than trusted.
  const odd = loadRecord(memory({ [RECORD_KEY]: JSON.stringify({ played: -4, completed: 9, best: { total: 1e3, grade: 'SSS', sorted: 'x' }, openers: ['opener-2', 'opener-2', '<script>', 7] }) }));
  assert.deepEqual(odd, { played: 0, completed: 0, best: { total: 1000, grade: 'SS', sorted: 0, date: '' }, openers: ['opener-2'] });
});

test('a storage that throws keeps the game going without a record', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  assert.deepEqual(loadRecord(broken), emptyRecord());
  assert.equal(saveRecord(broken, emptyRecord()), false);
  assert.equal(formatTotal(5950), '05950');
  assert.equal(formatTotal(-3), '00000');
});
