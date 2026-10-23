import assert from 'node:assert/strict';
import test from 'node:test';
import { AMBULANCE, MallModel3D } from '../src/three/MallModel3D.ts';

test('Space takes and parks the 3D cart; movement pushes it and pause freezes it', () => {
  const mall = new MallModel3D(() => 0.999);
  assert.equal(mall.interaction.action, 'grab-cart'); mall.action();
  assert.equal(mall.cart.pushed, true);
  const before = mall.cart.y; mall.update(100, { x: 0, y: -1 });
  assert.ok(mall.cart.y < before);
  mall.paused = true; const frozen = JSON.stringify(mall.cart); mall.action(); mall.update(100, { x: 1, y: 0 });
  assert.equal(JSON.stringify(mall.cart), frozen);
  mall.paused = false; mall.action(); assert.equal(mall.cart.pushed, false);
});

test('3D truck selection skips empty and later-run slots; each stop has a real multi-box bundle', () => {
  const mall = new MallModel3D(() => 0.999);
  Object.assign(mall.skanky, { x: 75, y: 400 }); Object.assign(mall.cart, { x: 130, y: 400 });
  const loaded = [];
  for (let index = 0; index < 2; index++) {
    const selection = mall.interaction;
    assert.equal(selection.action, 'take');
    const id = mall.truckBundles[selection.slot];
    assert.equal(mall.store(id).run, 0); assert.ok(mall.store(id).boxes >= 6);
    mall.action(); assert.equal(mall.carrying, id); assert.equal(mall.truckBundles[selection.slot], null);
    mall.action(); assert.equal(mall.carrying, null); loaded.push(id);
  }
  assert.deepEqual(mall.cart.load, loaded);
  assert.equal(mall.interaction.action, 'grab-cart'); mall.action(); assert.equal(mall.cart.pushed, true);
});

test('Space delivers the selected stop before parking the cart; the other bundle remains aboard', () => {
  const mall = new MallModel3D(() => 0.999), [first, second] = mall.manifest;
  mall.cart.load.push(first.id, second.id); mall.cart.pushed = true;
  Object.assign(mall.skanky, { x: first.zone.x + 56, y: first.zone.y + 36 });
  Object.assign(mall.cart, { x: mall.skanky.x, y: mall.skanky.y + 30 });
  assert.equal(mall.interaction.action, 'drop'); mall.action();
  assert.equal(first.state, 'dropped'); assert.deepEqual(mall.cart.load, [second.id]);
  assert.equal(mall.interaction.action, 'sign'); mall.action(); assert.equal(first.state, 'signed');
  assert.equal(mall.cart.pushed, true);
});

test('an empty 3D interaction is quiet and the legacy mall keeps its original bundle counts', async () => {
  const { MallModel } = await import('../src/game/slice/MallModel.ts');
  assert.deepEqual(new MallModel().stores.map(s => s.boxes), [2,3,2,3,2,3]);
  const mall = new MallModel3D(); Object.assign(mall.skanky, { x: 680, y: 400 });
  assert.equal(mall.interaction.action, 'none'); mall.action(); assert.deepEqual(mall.drainEvents(), []);
});

/** Walks Skanky toward (x, y) on the controls, as a player holds a direction; true once there. */
const walkTo = (mall, x, y) => {
  for (let i = 0; i < 3000 && Math.hypot(x - mall.skanky.x, y - mall.skanky.y) > 4; i++) {
    const dx = x - mall.skanky.x, dy = y - mall.skanky.y, d = Math.hypot(dx, dy);
    mall.update(16, { x: dx / d, y: dy / d });
  }
  return Math.hypot(x - mall.skanky.x, y - mall.skanky.y) <= 4;
};

/** A mall at the fourth run, Bentley's two loads dropped and the signature refused, Skanky at the door. */
const refusedAtBentley = () => {
  const mall = new MallModel3D(() => 0.999);
  for (const store of mall.stores) if (store.id !== 'bentley') store.state = 'signed';
  Object.assign(mall, { signatures: 6, delivered: 7, run: 3, bentley: 'refused' });
  mall.truckBundles.forEach((_, slot) => { mall.truckBundles[slot] = null; });
  mall.store('bentley').state = 'dropped';
  Object.assign(mall.cart, { x: 1230, y: 420, pushed: false, facing: 'up' });
  Object.assign(mall.skanky, { x: 1246, y: 452 });
  return mall;
};
/** Through the staff doors, down the south leg, along the east leg past the clutter, into the office to the counter. */
const toSecurity = [[1215, 500], [1215, 640], [1222, 824], [2200, 824], [2300, 800], [2330, 799]];
const backFromSecurity = [[2300, 800], [2200, 824], [1222, 824], [1215, 640], [1215, 500], [1246, 452]];
const walkRoute = (mall, route) => route.every(([x, y]) => walkTo(mall, x, y));
/** Wrong answers at the desk until the guard refuses. */
const denied = (mall) => {
  mall.action();
  assert.equal(mall.bentley, 'quiz');
  mall.answer((mall.question.answer + 1) % 3);
  assert.equal(mall.bentley, 'denied');
};

test('the Bentley run: a run of its own, the cart full of it, a refusal, three questions at the security desk down the long hallway, then the signature', () => {
  const mall = new MallModel3D(() => 0.999);
  assert.equal(mall.runCount, 4);
  assert.equal(mall.stores.length, 7);
  // The first three runs signed: back at the truck for the fourth.
  for (const store of mall.stores) if (store.id !== 'bentley') store.state = 'signed';
  Object.assign(mall, { signatures: 6, delivered: 6, run: 2 });
  mall.truckBundles.forEach((id, slot) => { if (id !== 'bentley') mall.truckBundles[slot] = null; });
  const bentley = mall.store('bentley');
  assert.equal(mall.truckBundles.filter((id) => id === 'bentley').length, 2, 'two loads of Bentley freight');
  Object.assign(mall.cart, { x: 130, y: 400, pushed: false });
  for (let i = 0; i < 2; i++) {
    Object.assign(mall.skanky, { x: 75, y: 400 });
    assert.equal(mall.interaction.action, 'take'); mall.action();
    assert.equal(mall.carrying, 'bentley'); mall.action();
  }
  assert.equal(mall.run, 3);
  assert.deepEqual(mall.cart.load, ['bentley', 'bentley'], 'the cart is full of Bentley');
  assert.match(mall.objective, /push the full cart to BENTLEY/);
  // At Bentley: both loads come off together, then the signature is refused (the clerk has no idea where the box is).
  Object.assign(mall.skanky, { x: 1230, y: 450 });
  Object.assign(mall.cart, { x: 1230, y: 420, pushed: true, facing: 'up' });
  mall.action();
  assert.equal(bentley.state, 'dropped'); assert.deepEqual(mall.cart.load, []);
  mall.drainEvents(); mall.action();
  assert.deepEqual([mall.bentley, bentley.state, mall.cart.pushed, mall.sweating], ['refused', 'dropped', false, true]);
  const refusal = mall.drainEvents()[0];
  assert.equal(refusal.type, 'refuse');
  assert.doesNotMatch(refusal.message, /SECURITY/, 'Bentley does not know security has it');
  assert.match(mall.objective, /missing![\s\S]*lost and found at mall security/);
  mall.action();
  assert.equal(bentley.state, 'dropped', 'no signature without the missing box');
  // On foot: through the staff doors, 10 m south and 31 m east down the hallway, to the security desk.
  assert.ok(walkRoute(mall, toSecurity), JSON.stringify(mall.skanky));
  assert.equal(mall.interaction.action, 'collect'); mall.drainEvents(); mall.action();
  // Three questions; Skanky stands still while he answers.
  assert.equal(mall.bentley, 'quiz');
  const at = { ...mall.skanky };
  for (let i = 0; i < 3; i++) {
    assert.equal(mall.quiz.index, i); assert.equal(mall.question.options.length, 3);
    mall.update(200, { x: -1, y: 0 });
    assert.deepEqual({ x: mall.skanky.x, y: mall.skanky.y }, { x: at.x, y: at.y }, 'frozen at the desk');
    mall.answer(mall.question.answer);
  }
  assert.deepEqual([mall.handBox, mall.bentley, mall.carrying, mall.chase, mall.sweating], [true, 'fetched', null, null, false]);
  assert.deepEqual(mall.drainEvents().map((event) => event.type), ['quiz', 'right', 'quiz', 'right', 'quiz', 'security']);
  // Carried back by hand: the cart cannot be pushed with the box in his arms.
  assert.ok(walkRoute(mall, backFromSecurity), 'back at BENTLEY');
  assert.equal(mall.interaction.action, 'sign'); mall.action();
  assert.deepEqual([mall.bentley, mall.handBox], ['returned', false]);
  mall.action();
  assert.equal(bentley.state, 'signed'); assert.equal(mall.signatures, 7); assert.equal(mall.allSigned, true);
  assert.match(mall.drainEvents().map((event) => event.message).join(' | '), /BENTLEY signed \(7\/7\)[\s\S]*All seven signed/);
});

test('mall security: every question checks its own answer, a wrong one is refused, and asking again starts over', () => {
  const mall = refusedAtBentley();
  Object.assign(mall.skanky, { x: 2330, y: 799 });
  mall.action();
  const questions = mall.quiz.questions;
  assert.equal(questions.length, 3);
  for (const question of questions) {
    assert.equal(new Set(question.options).size, 3, question.question);
    assert.ok(question.answer >= 0 && question.answer < 3);
  }
  assert.ok(questions.some((question) => /BENTLEY|UPS|20|FIVE-TON|DOCK 3|SOUTHGATE/.test(question.options[question.answer])));
  mall.answer(mall.question.answer);
  mall.answer((mall.question.answer + 2) % 3);
  assert.deepEqual([mall.bentley, mall.quiz, mall.handBox], ['denied', null, false]);
  assert.equal(mall.drainEvents().at(-1).type, 'denied');
  mall.decide('again');
  assert.deepEqual([mall.bentley, mall.quiz.index], ['quiz', 0], 'asked again, from the first question');
  for (let i = 0; i < 3; i++) mall.answer(mall.question.answer);
  assert.deepEqual([mall.bentley, mall.handBox, mall.chase], ['fetched', true, null]);
});

test('grab it and run: Skanky runs faster, the guard follows, and standing still gets him caught with the box going back', () => {
  const mall = refusedAtBentley();
  Object.assign(mall.skanky, { x: 2330, y: 799 });
  denied(mall);
  mall.drainEvents();
  mall.decide('grab');
  assert.deepEqual([mall.bentley, mall.handBox, mall.chase.delivered, mall.sweating], ['fetched', true, false, true]);
  assert.equal(mall.drainEvents()[0].type, 'grab');
  assert.match(mall.objective, /RUN! · get the box to BENTLEY/);
  // Running: 8% faster than his walk.
  const from = mall.skanky.x;
  mall.update(100, { x: -1, y: 0 });
  assert.ok(Math.abs(from - mall.skanky.x - 235 * 1.08 * 0.1) < 0.5, `ran ${from - mall.skanky.x}`);
  // The guard waits a moment (HEY!), then comes round his desk; standing still, he has Skanky by the shoulder.
  const post = { ...mall.chase.guard };
  mall.update(600);
  assert.deepEqual({ x: mall.chase.guard.x, y: mall.chase.guard.y }, { x: post.x, y: post.y }, 'a head start');
  for (let i = 0; i < 600 && mall.chase; i++) mall.update(16);
  assert.equal(mall.chase, null);
  const types = mall.drainEvents().map((event) => event.type);
  assert.ok(types.includes('caught'), types.join());
  assert.deepEqual([mall.bentley, mall.handBox, mall.finished], ['denied', false, false], 'back at the desk to ask again or run again');
});

test('the guard aims, holds it, then fires: standing on the line puts him down, a sidestep once it holds is a miss, walls and corners are cover', () => {
  const chasing = () => {
    const mall = refusedAtBentley();
    Object.assign(mall.skanky, { x: 2330, y: 799 });
    denied(mall);
    mall.decide('grab');
    Object.assign(mall.skanky, { x: 1700, y: 824 });
    Object.assign(mall.chase, { guard: { x: 1450, y: 824, moving: false }, path: [], elapsedMs: 1000, cooldownMs: 0 });
    mall.drainEvents();
    return mall;
  };
  // On the line: one hit and he is down where he stood, the box dropped, the shot kept for the view.
  let mall = chasing();
  mall.update(10);
  assert.ok(mall.chase.aim, 'aiming down the hallway');
  assert.equal(mall.drainEvents()[0].type, 'aim');
  for (let t = 0; t < 1000 && mall.chase; t += 10) mall.update(10);
  assert.equal(mall.chase, null);
  assert.deepEqual([mall.down.x, mall.down.y, mall.down.guard, mall.handBox], [1700, 824, { x: 1450, y: 824 }, false]);
  assert.deepEqual(mall.down.shot.to, { x: 1700, y: 824 });
  assert.ok(mall.drainEvents().some((event) => event.type === 'hit'));
  assert.deepEqual([mall.sweating, mall.interaction.action], [false, 'none']);
  assert.match(mall.objective, /ambulance/);
  // Down, he goes nowhere, whatever is pressed; the medics and the ambulance take their time; then the night is lost.
  const at = { x: mall.skanky.x, y: mall.skanky.y };
  for (let i = 0; i < 2000 && !mall.finished; i++) {
    mall.update(16, { x: 1, y: 0 });
    mall.action();
  }
  assert.deepEqual({ x: mall.skanky.x, y: mall.skanky.y }, at);
  assert.deepEqual([mall.finished, mall.getaway], [true, 'shot']);
  assert.ok(mall.down.ms >= AMBULANCE.overMs);
  assert.equal(mall.drainEvents().at(-1).type, 'down');
  // Sidestepping once the aim holds: a miss.
  mall = chasing();
  mall.update(10);
  while (!mall.chase.aim.locked) mall.update(10);
  for (let t = 0; t < 470; t += 10) mall.update(10, { x: 0, y: 1 });
  assert.equal(mall.down, null, JSON.stringify(mall.skanky));
  assert.ok(mall.chase.shot && !mall.chase.shot.hit);
  assert.ok(mall.drainEvents().some((event) => event.type === 'shot'));
  // Round the corner from the south leg, there is no line to shoot along.
  mall = chasing();
  Object.assign(mall.chase.guard, { x: 1222, y: 700 });
  Object.assign(mall.skanky, { x: 1400, y: 824 });
  mall.update(10);
  assert.equal(mall.chase.aim, null, 'no shot round a corner');
  // Behind the pallet of returns, neither.
  mall = chasing();
  Object.assign(mall.chase.guard, { x: 1470, y: 851 });
  Object.assign(mall.skanky, { x: 1620, y: 851 });
  mall.update(10);
  assert.equal(mall.chase.aim, null, 'the pallet is cover');
  // A hand on the shoulder (before Bentley has the box) catches him: the box back on the desk, Skanky at the counter.
  mall = chasing();
  Object.assign(mall.chase, { guard: { x: 1690, y: 824, moving: false }, cooldownMs: 5000 });
  mall.update(10);
  assert.deepEqual([mall.chase, mall.down, mall.bentley, mall.handBox], [null, null, 'denied', false]);
  assert.equal(mall.drainEvents().at(-1).type, 'caught');
});

test('on the run: the box to Bentley signs it at once, then into the five-ton is a getaway; caught after signing, he is marched out', () => {
  const running = () => {
    const mall = refusedAtBentley();
    Object.assign(mall.skanky, { x: 2330, y: 799 });
    denied(mall);
    mall.decide('grab');
    Object.assign(mall.chase.guard, { x: 2400, y: 760 });
    Object.assign(mall.skanky, { x: 1246, y: 452 });
    mall.drainEvents();
    return mall;
  };
  let mall = running();
  assert.equal(mall.interaction.label, 'SPACE · SHOVE THE BOX AT BENTLEY');
  mall.action();
  assert.deepEqual([mall.store('bentley').state, mall.signatures, mall.allSigned, mall.chase.delivered, mall.handBox], ['signed', 7, true, true, false]);
  assert.deepEqual(mall.drainEvents().map((event) => event.type), ['handover', 'sign']);
  assert.match(mall.objective, /five-ton/);
  // The getaway: into the tailgate, the cart left behind.
  Object.assign(mall.skanky, { x: 130, y: 400 });
  Object.assign(mall.chase, { elapsedMs: 0 });
  for (let i = 0; i < 40 && !mall.finished; i++) mall.update(16, { x: -1, y: 0 });
  assert.deepEqual([mall.finished, mall.getaway, mall.chase], [true, 'escaped', null]);
  assert.equal(mall.drainEvents().at(-1).type, 'escape');
  // Caught once Bentley has signed: busted, and the run is over.
  mall = running();
  mall.action();
  Object.assign(mall.chase.guard, { x: mall.skanky.x + 10, y: mall.skanky.y });
  mall.update(16);
  assert.deepEqual([mall.finished, mall.getaway, mall.signatures], [true, 'busted', 7]);
  assert.equal(mall.drainEvents().at(-1).type, 'busted');
});

test('holding one direction down the hallway, Skanky slides round its clutter rather than stopping dead', () => {
  const mall = new MallModel3D(() => 0.999);
  // High along the north wall, into the cleaning cart; low along the south wall, into the pallet of returns.
  Object.assign(mall.skanky, { x: 1700, y: 800 });
  for (let i = 0; i < 120; i++) mall.update(16, { x: 1, y: 0 });
  assert.ok(mall.skanky.x > 1880, JSON.stringify(mall.skanky));
  Object.assign(mall.skanky, { x: 1450, y: 846 });
  for (let i = 0; i < 120; i++) mall.update(16, { x: 1, y: 0 });
  assert.ok(mall.skanky.x > 1600, JSON.stringify(mall.skanky));
});

test('the cart cannot follow Skanky out of the concourse through the back doors', () => {
  const mall = new MallModel3D(() => 0.999);
  // Pushed south toward the staff doors, it stops at the concourse's edge and Skanky stays behind it.
  Object.assign(mall.skanky, { x: 1215, y: 470 });
  Object.assign(mall.cart, { x: 1215, y: 500, pushed: true, facing: 'down' });
  for (let i = 0; i < 120; i++) mall.update(16, { x: 0, y: 1 });
  assert.ok(mall.cart.y <= 520 - 18 + 0.01 && mall.skanky.y < 520, JSON.stringify({ skanky: mall.skanky, cart: mall.cart }));
  // Let go of it (and wheel it aside), and Skanky walks on through the doors alone.
  mall.toggleCart();
  Object.assign(mall.cart, { x: 700, y: 470 });
  assert.ok(walkTo(mall, 1215, 480) && walkTo(mall, 1215, 700), 'on foot he goes through');
});
