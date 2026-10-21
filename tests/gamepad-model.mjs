import assert from 'node:assert/strict';
import test from 'node:test';
import { GamepadInput, NAV_THRESHOLD, STICK_DEADZONE, padKey } from '../src/three/gamepad.ts';

// A controller with the browser's standard layout.

const pad = (over = {}) => {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  for (const [index, value] of Object.entries(over.buttons ?? {})) buttons[index] = { pressed: value > 0.5, value };
  return { connected: over.connected ?? true, axes: over.axes ?? [0, 0, 0, 0], buttons };
};

test('no pad, or none connected, reads as idle', () => {
  const input = new GamepadInput();
  for (const pads of [[], [null], [pad({ connected: false, buttons: { 0: 1 } })]]) {
    const frame = input.poll(pads);
    assert.deepEqual(frame, { connected: false, move: { x: 0, y: 0 }, throttle: 0, brake: 0, pressed: [] });
  }
});

test('the stick ignores a resting wobble, reaches full speed at its rim, and the d-pad moves as keys do', () => {
  const input = new GamepadInput();
  assert.deepEqual(input.poll([pad({ axes: [0.15, -0.1] })]).move, { x: 0, y: 0 }, 'inside the dead zone');
  const rim = input.poll([pad({ axes: [1, 0] })]).move;
  assert.equal(rim.x, 1); assert.equal(rim.y, 0);
  const half = input.poll([pad({ axes: [0, 0.6] })]).move;
  assert.ok(Math.abs(half.y - (0.6 - STICK_DEADZONE) / (1 - STICK_DEADZONE)) < 1e-9, `rescaled past the dead zone: ${half.y}`);
  assert.deepEqual(input.poll([pad({ buttons: { 12: 1, 15: 1 } })]).move, { x: 1, y: -1 }, 'd-pad up and right');
  assert.deepEqual(input.poll([pad({ axes: [1, 0], buttons: { 15: 1 } })]).move, { x: 1, y: 0 }, 'never past full');
});

test('the triggers are the pedals and the first connected pad is read', () => {
  const input = new GamepadInput();
  const frame = input.poll([null, pad({ connected: false }), pad({ buttons: { 6: 0.25, 7: 0.8 } })]);
  assert.equal(frame.throttle, 0.8);
  assert.equal(frame.brake, 0.25);
});

test('a button counts once per press, and one already held when the pad appears does not count', () => {
  const input = new GamepadInput();
  assert.deepEqual(input.poll([pad({ buttons: { 0: 1 } })]).pressed, [], 'held as the pad connected');
  assert.deepEqual(input.poll([pad({ buttons: { 0: 1 } })]).pressed, [], 'still held');
  assert.deepEqual(input.poll([pad()]).pressed, []);
  assert.deepEqual(input.poll([pad({ buttons: { 0: 1, 3: 1 } })]).pressed, ['a', 'y']);
  assert.deepEqual(input.poll([pad({ buttons: { 0: 1, 3: 1 } })]).pressed, []);
  assert.deepEqual(input.poll([pad({ buttons: { 9: 1 } })]).pressed, ['start']);
  input.poll([]);
  assert.deepEqual(input.poll([pad({ buttons: { 9: 1 } })]).pressed, [], 'a reconnected pad starts fresh');
});

test('a push of the d-pad or stick presses its direction once, for menus, and presses no key', () => {
  const input = new GamepadInput();
  input.poll([pad()]);
  assert.deepEqual(input.poll([pad({ buttons: { 13: 1 } })]).pressed, ['down']);
  assert.deepEqual(input.poll([pad({ buttons: { 13: 1 } })]).pressed, [], 'held');
  assert.deepEqual(input.poll([pad()]).pressed, []);
  assert.deepEqual(input.poll([pad({ axes: [0, -0.9] })]).pressed, ['up'], 'a stick push');
  assert.deepEqual(input.poll([pad({ axes: [0, -0.95] })]).pressed, [], 'still pushed');
  assert.deepEqual(input.poll([pad({ axes: [0.9, 0] })]).pressed, ['right']);
  assert.deepEqual(input.poll([pad({ axes: [-0.3, 0] })]).pressed, [], 'short of the threshold');
  assert.ok(NAV_THRESHOLD > STICK_DEADZONE);
  for (const state of ['playing', 'briefing', 'paused', 'ended', 'driving', 'mall']) {
    assert.deepEqual(['up', 'down', 'left', 'right'].map((button) => padKey(state, button)), [null, null, null, null], state);
  }
});

test('each screen maps the buttons to its own keys, and Start always pauses', () => {
  assert.deepEqual(['a', 'b', 'x', 'y', 'back', 'lb'].map((button) => padKey('playing', button)), ['Space', 'KeyF', 'KeyE', 'Tab', 'KeyV', null]);
  assert.deepEqual(['a', 'b'].map((button) => padKey('decision', button)), ['KeyG', 'KeyQ']);
  assert.deepEqual(['a', 'b', 'y'].map((button) => padKey('mesa', button)), ['KeyN', 'KeyN', 'KeyY'], 'only Y steals the Mesa');
  assert.deepEqual(['a', 'y', 'x', 'lb', 'rb'].map((button) => padKey('briefing', button)), ['Enter', 'KeyP', 'KeyN', 'BracketLeft', 'BracketRight'],
    'start the night, the peak night or the endless shift, or step through the perks');
  assert.deepEqual(['a', 'b'].map((button) => padKey('story', button)), ['Space', 'Enter']);
  assert.deepEqual(['a', 'back', 'rb'].map((button) => padKey('driving', button)), ['Space', 'KeyV', 'KeyV']);
  assert.deepEqual(['a', 'x'].map((button) => padKey('mall', button)), ['Space', 'KeyE']);
  for (const state of ['paused', 'ended', 'interlude']) assert.equal(padKey(state, 'a'), 'Enter');
  for (const state of ['playing', 'briefing', 'story', 'driving', 'paused', 'mall']) assert.equal(padKey(state, 'start'), 'Escape');
  assert.equal(padKey('dream', 'a'), null);
});

test('rumble goes to the pad in use, clamped, and a pad without it or a failing one is ignored', async () => {
  const input = new GamepadInput();
  input.rumble(1, 100);
  const effects = [];
  const rumbling = { ...pad(), vibrationActuator: { playEffect: (type, params) => { effects.push({ type, ...params }); return Promise.resolve(); } } };
  input.poll([rumbling]);
  input.rumble(2, 200);
  input.rumble(0.5, 80);
  assert.deepEqual(effects, [
    { type: 'dual-rumble', duration: 200, strongMagnitude: 1, weakMagnitude: 1 },
    { type: 'dual-rumble', duration: 80, strongMagnitude: 0.5, weakMagnitude: 0.6 },
  ]);
  input.poll([{ ...pad(), vibrationActuator: { playEffect: () => Promise.reject(new Error('busy')) } }]);
  input.rumble(1, 50);
  input.poll([{ ...pad(), vibrationActuator: { playEffect: () => { throw new Error('gone'); } } }]);
  assert.doesNotThrow(() => input.rumble(1, 50));
  input.poll([pad()]);
  assert.doesNotThrow(() => input.rumble(1, 50), 'no actuator');
  await new Promise((resolve) => setTimeout(resolve, 0));
});
