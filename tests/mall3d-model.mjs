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
