import assert from 'node:assert/strict';
import test from 'node:test';
import { CODE_LENGTH, GUEST_KEYS, heldMove, readGuestMessage, readHostMessage, readRoomCode, roomCode, sceneOwner, turnText } from '../src/three/onlineRules.ts';

test('online is the belt: both play on it and its countdown; everything else is the host\'s', () => {
  for (const state of ['playing', 'countdown']) assert.equal(sceneOwner(state), 'both', state);
  for (const state of ['briefing', 'paused', 'ended', 'story', 'mall', 'driving', 'coffee']) assert.equal(sceneOwner(state), 'termite', state);
  assert.match(turnText('both', 'playing'), /player 2/);
  assert.match(turnText('termite', 'briefing'), /BETWEEN SHIFTS/);
  assert.match(turnText('termite', 'ended'), /SHIFT OVER/);
});

test("the joining player's browser can send only the belt's keys, a controller's three buttons and a clamped stick", () => {
  assert.deepEqual(readGuestMessage({ t: 'key', code: 'KeyD', down: true }), { t: 'key', code: 'KeyD', down: true });
  assert.deepEqual(readGuestMessage({ t: 'key', code: 'ShiftRight', down: false }), { t: 'key', code: 'ShiftRight', down: false });
  for (const code of ['KeyQ', 'F5', 'MetaLeft', 'KeyM', 'KeyO', 'KeyP', 'KeyE', 'Tab', 'Digit1', 'Backquote']) assert.equal(readGuestMessage({ t: 'key', code, down: true }), null, code);
  assert.equal(readGuestMessage({ t: 'key', code: 'KeyD', down: 'yes' }), null);
  assert.deepEqual(readGuestMessage({ t: 'move', x: 9, y: -9, throttle: 2, brake: -1 }), { t: 'move', x: 1, y: -1, throttle: 1, brake: 0 });
  assert.deepEqual(readGuestMessage({ t: 'move', x: Number.NaN, y: '1' }), { t: 'move', x: 0, y: 0, throttle: 0, brake: 0 });
  for (const button of ['a', 'b', 'start']) assert.deepEqual(readGuestMessage({ t: 'pad', button }), { t: 'pad', button });
  for (const button of ['x', 'y', 'guide', 'back']) assert.equal(readGuestMessage({ t: 'pad', button }), null, button);
  for (const junk of [null, 'key', 42, [], { t: 'eval', code: 'alert(1)' }, { t: 'turn', owner: 'both', text: 'x' }]) assert.equal(readGuestMessage(junk), null);
  assert.ok(GUEST_KEYS.has('Escape') && !GUEST_KEYS.has('KeyM'), 'they can pause the shift, not mute the host');
  assert.deepEqual(readHostMessage({ t: 'turn', owner: 'both', text: 'THE BELT'.padEnd(300, '!') }).text.length, 120);
  assert.equal(readHostMessage({ t: 'turn', owner: 'skanky', text: 'x' }), null);
  assert.equal(readHostMessage({ t: 'card', title: 'x', options: [] }), null);
  assert.deepEqual(readHostMessage({ t: 'bye' }), { t: 'bye' });
});

test('held keys move the joining player (WASD or arrows); room codes are six clear characters, read forgivingly', () => {
  assert.deepEqual(heldMove(new Set(['KeyD', 'ArrowUp'])), { x: 1, y: -1 });
  assert.deepEqual(heldMove(new Set(['KeyA', 'KeyD'])), { x: 0, y: 0 });
  let seed = 1;
  for (let i = 0; i < 200; i++) {
    const code = roomCode(() => { seed = seed * 16807 % 2147483647; return seed / 2147483647; });
    assert.equal(code.length, CODE_LENGTH);
    assert.doesNotMatch(code, /[01ILO]/);
    assert.equal(readRoomCode(code), code);
  }
  assert.equal(readRoomCode(' k7m-2qx '), 'K7M2QX');
  assert.equal(readRoomCode('K7M2Q'), null);
  assert.equal(readRoomCode('K7M2Q0'), null, 'no zero');
  assert.equal(readRoomCode(null), null);
});
