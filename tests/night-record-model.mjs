import assert from 'node:assert/strict';
import test from 'node:test';
import { OPENER_COUNT, RECENT_NIGHTS, RECORD_KEY, emptyRecord, formatTotal, loadRecord, recordEndless, recordNight, saveRecord } from '../src/three/nightRecord.ts';

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
  assert.deepEqual(record, { played: 1, completed: 1, best: { total: 5000, grade: 'A', sorted: 50, date: '2026-10-21' }, openers: ['opener-1'], medals: [], endless: null,
    recent: [{ night: 1, won: true, total: 5000, grade: 'A', sorted: 50, peak: false, date: '2026-10-21' }] });
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
  const odd = loadRecord(memory({ [RECORD_KEY]: JSON.stringify({ played: -4, completed: 9, best: { total: 1e3, grade: 'SSS', sorted: 'x' }, openers: ['opener-2', 'opener-2', '<script>', 7], medals: ['s-rank', 's-rank', 'bogus', 3], endless: { sorted: 3.7, seconds: -2, score: 'x' } }) }));
  assert.deepEqual(odd, { played: 0, completed: 0, best: { total: 1000, grade: 'SS', sorted: 0, date: '' }, openers: ['opener-2'], medals: ['s-rank'], endless: { sorted: 3, seconds: 0, score: 0, date: '' }, recent: [] });
});

test('a storage that throws keeps the game going without a record', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  assert.deepEqual(loadRecord(broken), emptyRecord());
  assert.equal(saveRecord(broken, emptyRecord()), false);
  assert.equal(formatTotal(5950), '05950');
  assert.equal(formatTotal(-3), '00000');
});

test('a night carries the medals already earned, which only the medal step adds to', () => {
  const held = { ...emptyRecord(), medals: ['first-shift'] };
  assert.deepEqual(recordNight(held, night()).record.medals, ['first-shift']);
});

test('an endless shift keeps its own best, ranked by freight dispatched and then time, and leaves the nights alone', () => {
  const run = (sorted, seconds) => ({ sorted, seconds, score: sorted * 100, date: '2026-10-21' });
  const first = recordEndless(emptyRecord(), run(40, 300));
  assert.equal(first.newBest, true); assert.equal(first.previous, null);
  assert.deepEqual(first.record, { ...emptyRecord(), endless: run(40, 300) }, 'played, best night and medals untouched');
  assert.equal(recordEndless(first.record, run(39, 900)).newBest, false, 'fewer dispatched never beats it');
  assert.equal(recordEndless(first.record, run(40, 299)).newBest, false);
  const longer = recordEndless(first.record, run(40, 301));
  assert.equal(longer.newBest, true, 'as many, for longer');
  assert.deepEqual(longer.previous, run(40, 300));
  const store = memory();
  saveRecord(store, longer.record);
  assert.deepEqual(loadRecord(store).endless, run(40, 301));
  assert.deepEqual(recordNight(longer.record, night()).record.endless, run(40, 301), 'a night carries the endless best');
});

test('the recent list keeps the last eight nights, finished or failed, newest first', () => {
  let record = emptyRecord();
  for (let i = 1; i <= 10; i += 1) record = recordNight(record, night({ total: i * 100, won: i !== 9, grade: i === 9 ? 'F' : 'B', peak: i === 10 })).record;
  assert.equal(RECENT_NIGHTS, 8);
  assert.deepEqual(record.recent.map((entry) => entry.night), [10, 9, 8, 7, 6, 5, 4, 3]);
  assert.deepEqual(record.recent[0], { night: 10, won: true, total: 1000, grade: 'B', sorted: 50, peak: true, date: '2026-10-21' });
  assert.deepEqual([record.recent[1].won, record.recent[1].grade], [false, 'F'], 'a failed night is listed too');
  const store = memory();
  saveRecord(store, record);
  assert.deepEqual(loadRecord(store).recent, record.recent);
  // A record from before the list existed reads with an empty one; tampered entries are cleaned and capped.
  assert.deepEqual(loadRecord(memory({ [RECORD_KEY]: JSON.stringify({ played: 3, completed: 2 }) })).recent, []);
  const tampered = loadRecord(memory({ [RECORD_KEY]: JSON.stringify({ played: 1, recent: [null, 'x', { night: -1, won: 'yes', total: 12.9, grade: '<b>', peak: 1 }, ...Array(12).fill({ night: 2 })] }) }));
  assert.equal(tampered.recent.length, RECENT_NIGHTS);
  assert.deepEqual(tampered.recent[0], { night: 0, won: false, total: 12, grade: '<b', sorted: 0, peak: false, date: '' });
  assert.deepEqual(recordEndless(record, { sorted: 1, seconds: 1, score: 1, date: '' }).record.recent, record.recent, 'an endless shift is not a night');
});
