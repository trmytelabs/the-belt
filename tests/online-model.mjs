import assert from 'node:assert/strict';
import test from 'node:test';
import { CODE_LENGTH, GUEST_KEYS, heldMove, readGuestMessage, readHostMessage, readRoomCode, roomCode, sceneOwner, turnText } from '../src/three/onlineRules.ts';

test('online, Termite and Skanky share the belt and the story; Skanky has his own runs and drives; Termite the Ralph run and the menus', () => {
  for (const state of ['playing', 'countdown', 'story']) assert.equal(sceneOwner(state, false), 'both', state);
  for (const state of ['mall', 'lot', 'coffee']) assert.equal(sceneOwner(state, false), 'skanky', state);
  assert.equal(sceneOwner('driving', false), 'skanky', "Skanky's five-ton and car drives");
  assert.equal(sceneOwner('driving', true), 'termite', "the Ralph run's drive back is Termite's");
  for (const state of ['paper', 'briefing', 'run-choice', 'decision', 'mesa', 'paused', 'ended', 'coffee-done']) assert.equal(sceneOwner(state, false), 'termite', state);
  assert.match(turnText('skanky', 'mall'), /YOUR TURN/);
  assert.match(turnText('skanky', 'driving'), /YOUR DRIVE/);
  assert.match(turnText('both', 'playing'), /player 2/);
  assert.match(turnText('termite', 'paper'), /TERMITE'S TURN/);
});

test("the joining player's browser can send only the game's keys, a controller's buttons and a clamped stick", () => {
  assert.deepEqual(readGuestMessage({ t: 'key', code: 'KeyD', down: true }), { t: 'key', code: 'KeyD', down: true });
  assert.deepEqual(readGuestMessage({ t: 'key', code: 'Digit2', down: false }), { t: 'key', code: 'Digit2', down: false });
  for (const code of ['KeyQ', 'F5', 'MetaLeft', 'KeyM', 'KeyO', 'KeyP', 'Backquote']) assert.equal(readGuestMessage({ t: 'key', code, down: true }), null, code);
  assert.equal(readGuestMessage({ t: 'key', code: 'KeyD', down: 'yes' }), null);
  assert.deepEqual(readGuestMessage({ t: 'move', x: 9, y: -9, throttle: 2, brake: -1 }), { t: 'move', x: 1, y: -1, throttle: 1, brake: 0 });
  assert.deepEqual(readGuestMessage({ t: 'move', x: Number.NaN, y: '1' }), { t: 'move', x: 0, y: 0, throttle: 0, brake: 0 });
  assert.deepEqual(readGuestMessage({ t: 'pad', button: 'a' }), { t: 'pad', button: 'a' });
  assert.equal(readGuestMessage({ t: 'pad', button: 'guide' }), null);
  for (const junk of [null, 'key', 42, [], { t: 'eval', code: 'alert(1)' }, { t: 'turn', owner: 'skanky', text: 'x' }]) assert.equal(readGuestMessage(junk), null);
  assert.ok(GUEST_KEYS.has('Escape') && !GUEST_KEYS.has('KeyM'), 'they can pause the night, not mute the host');
  assert.deepEqual(readHostMessage({ t: 'turn', owner: 'skanky', text: 'YOUR TURN'.padEnd(300, '!') }).text.length, 120);
  assert.equal(readHostMessage({ t: 'turn', owner: 'ralph', text: 'x' }), null);
  assert.deepEqual(readHostMessage({ t: 'bye' }), { t: 'bye' });
  assert.deepEqual(readHostMessage({ t: 'card', title: 'WHAT MALL IS THIS?', options: ['A', 'B', 'C'] }), { t: 'card', title: 'WHAT MALL IS THIS?', options: ['A', 'B', 'C'] });
  assert.equal(readHostMessage({ t: 'card', title: 'x', options: ['1', '2', '3', '4'] }), null);
  assert.equal(readHostMessage({ t: 'card', title: 'x', options: [7] }), null);
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
