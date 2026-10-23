import assert from 'node:assert/strict';
import test from 'node:test';
import { MallModel3D } from '../src/three/MallModel3D.ts';

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

test('the Bentley run: a run of its own, the cart full of it, a refusal, the box from security down the back hallway, then the signature', () => {
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
  // At Bentley: both loads come off together, then the signature is refused and the cart stays.
  Object.assign(mall.skanky, { x: 1230, y: 450 });
  Object.assign(mall.cart, { x: 1230, y: 420, pushed: true, facing: 'up' });
  mall.action();
  assert.equal(bentley.state, 'dropped'); assert.deepEqual(mall.cart.load, []);
  mall.drainEvents(); mall.action();
  assert.deepEqual([mall.bentley, bentley.state, mall.cart.pushed], ['refused', 'dropped', false]);
  assert.equal(mall.drainEvents()[0].type, 'refuse');
  assert.match(mall.objective, /SECURITY has it, through the back doors/);
  mall.action();
  assert.equal(bentley.state, 'dropped', 'no signature without the missing box');
  // On foot: through the staff doors in the south-east corner and down the hallway to the security desk.
  assert.ok(walkTo(mall, 1215, 500)); assert.ok(walkTo(mall, 1215, 640), 'through the staff doors into the hallway');
  assert.ok(walkTo(mall, 1222, 940), 'down the hallway'); assert.ok(walkTo(mall, 1245, 1044), 'to the security desk');
  assert.equal(mall.interaction.action, 'collect'); mall.action();
  assert.deepEqual([mall.handBox, mall.bentley, mall.carrying], [true, 'fetched', null]);
  assert.equal(mall.drainEvents().at(-1).type, 'security');
  // Carried back by hand: the cart cannot be pushed with the box in his arms.
  assert.ok(walkTo(mall, 1222, 940)); assert.ok(walkTo(mall, 1215, 600)); assert.ok(walkTo(mall, 1215, 500)); assert.ok(walkTo(mall, 1246, 452), 'back at BENTLEY');
  assert.equal(mall.interaction.action, 'sign'); mall.action();
  assert.deepEqual([mall.bentley, mall.handBox], ['returned', false]);
  mall.action();
  assert.equal(bentley.state, 'signed'); assert.equal(mall.signatures, 7); assert.equal(mall.allSigned, true);
  assert.match(mall.drainEvents().map((event) => event.message).join(' | '), /BENTLEY signed \(7\/7\)[\s\S]*All seven signed/);
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
