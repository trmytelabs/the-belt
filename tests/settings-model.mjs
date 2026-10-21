import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS, MIN_RESOLUTION, SETTINGS_KEY, level, loadSettings, saveSettings } from '../src/three/settings.ts';

// The player's settings: kept on this device, read back defensively.

const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, String(value)); }, data };
};

test('no storage, an empty one or an unreadable entry gives the defaults', () => {
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(memory()), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(memory({ [SETTINGS_KEY]: '{not json' })), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings({ getItem: () => { throw new Error('blocked'); }, setItem() {} }), DEFAULT_SETTINGS);
  assert.deepEqual(DEFAULT_SETTINGS, { music: 1, effects: 1, shake: true, resolution: 1 });
});

test('levels are kept between 0 and 1 in steps of five percent, and odd fields fall back one by one', () => {
  assert.equal(level(0.42, 1), 0.4);
  assert.equal(level(0.43, 1), 0.45);
  assert.equal(level(-3, 1), 0);
  assert.equal(level(7, 0), 1);
  assert.equal(level('loud', 0.5), 0.5);
  assert.equal(level(Number.NaN, 0.5), 0.5);
  const storage = memory({ [SETTINGS_KEY]: JSON.stringify({ music: 0.3, effects: 'max', shake: 'yes' }) });
  assert.deepEqual(loadSettings(storage), { music: 0.3, effects: 1, shake: true, resolution: 1 });
});

test('saved settings read back the same, and a full storage keeps them for the visit only', () => {
  const storage = memory();
  assert.equal(saveSettings(storage, { music: 0.4, effects: 0.75, shake: false, resolution: 0.7 }), true);
  assert.deepEqual(loadSettings(storage), { music: 0.4, effects: 0.75, shake: false, resolution: 0.7 });
  assert.deepEqual(JSON.parse(storage.data.get(SETTINGS_KEY)), { music: 0.4, effects: 0.75, shake: false, resolution: 0.7 });
  assert.equal(saveSettings({ getItem: () => null, setItem() { throw new Error('quota'); } }, DEFAULT_SETTINGS), false);
  assert.equal(saveSettings(null, DEFAULT_SETTINGS), false);
});

test('the resolution stays between half and full, and settings saved before it existed draw at full', () => {
  assert.equal(MIN_RESOLUTION, 0.5);
  const read = (resolution) => loadSettings(memory({ [SETTINGS_KEY]: JSON.stringify({ music: 1, effects: 1, shake: true, resolution }) })).resolution;
  assert.equal(read(0.62), 0.6);
  assert.equal(read(0.2), 0.5);
  assert.equal(read(3), 1);
  assert.equal(read('low'), 1);
  assert.equal(loadSettings(memory({ [SETTINGS_KEY]: JSON.stringify({ music: 0.5, effects: 1, shake: true }) })).resolution, 1);
  const storage = memory();
  saveSettings(storage, { ...DEFAULT_SETTINGS, resolution: 0.1 });
  assert.equal(JSON.parse(storage.data.get(SETTINGS_KEY)).resolution, 0.5);
});
