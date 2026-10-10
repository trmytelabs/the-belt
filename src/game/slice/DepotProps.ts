import Phaser from 'phaser';

const text = (scene: Phaser.Scene, x: number, y: number, copy: string, size: number, color = '#eee2bd') =>
  scene.add.text(x, y, copy, { fontFamily: 'Arial, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color }).setOrigin(0.5);

/** The eight named trucks from GameScene.createAmbientWorkers, drawn to bay scale. */
export function createCrewTruckArt(scene: Phaser.Scene, name: string, purple: boolean, side: 'left' | 'right'): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0);
  const chassis = scene.add.container(0, 0).setScale(side === 'left' ? 1 : -1, 1);
  const g = scene.add.graphics();
  chassis.add(g);
  g.fillStyle(0x0a1a22, 0.55).fillRoundedRect(-35, -10, 72, 27, 5);
  for (const x of [-20, 22]) g.fillStyle(0x122028).fillRoundedRect(x - 5, -15, 10, 30, 3);
  g.fillStyle(0x644e36).fillRoundedRect(-36, -9, 17, 20, 4);
  g.fillStyle(0x8f774f).fillRoundedRect(-35, -10, 14, 19, 3);
  g.fillStyle(0x345560).fillRoundedRect(-32, -7, 7, 12, 2);
  g.fillStyle(purple ? 0x744974 : 0x947b52).fillRoundedRect(-20, -14, 52, 28, 3);
  g.fillStyle(purple ? 0xa47aa0 : 0xbda078).fillRect(-18, -13, 48, 2);
  for (let x = -14; x < 32; x += 7) g.lineStyle(1, 0x172931, 0.25).lineBetween(x, -9, x, 10);
  g.fillStyle(purple ? 0x4a344e : 0x4e4638).fillRoundedRect(-19, -11, 50, 22, 2);
  g.fillStyle(0x80928b).fillRect(31, -11, 3, 22);
  g.fillStyle(0xddb67b).fillRect(30, -12, 3, 3).fillRect(30, 10, 3, 3);
  root.add(chassis);
  const lettering = name.length > 9 ? name.replace(' ', '\n') : name;
  root.add(text(scene, side === 'left' ? 6 : -6, 0, lettering, 8).setAlign('center'));
  return root;
}

/** Original RALPH 5 TON truck, with five visible cargo slots controlled by Life. */
export function createRalphTruckArt(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0);
  const g = scene.add.graphics();
  root.add(g);
  g.fillStyle(0x081a23, 0.55).fillRoundedRect(-60, -20, 123, 49, 6);
  for (const x of [-45, -10, 42]) {
    g.fillStyle(0x15252c).fillCircle(x, 21, 8);
    g.fillStyle(0x6a7676).fillCircle(x, 21, 4);
    g.fillStyle(0x2a3d44).fillCircle(x, 21, 2);
  }
  g.fillStyle(0x656b70).fillRoundedRect(-59, -24, 88, 45, 4);
  g.fillStyle(0x9caba1).fillRect(-56, -23, 82, 2);
  g.fillStyle(0xc6ad62).fillRect(-56, -4, 82, 6);
  g.fillStyle(0x4c545c).fillRoundedRect(-56, -18, 80, 12, 2);
  g.fillStyle(0x7b6244).fillRoundedRect(28, -13, 33, 34, 4);
  g.fillStyle(0xa58a5d).fillRoundedRect(30, -15, 28, 33, 4);
  g.fillStyle(0x74a6ad).fillRoundedRect(36, -11, 19, 13, 2);
  g.fillStyle(0xc8b084).fillCircle(44, -2, 4);
  g.fillStyle(0x415862).fillRect(57, 2, 4, 12);
  g.fillStyle(0xa4b0a4).fillRect(57, 16, 7, 5);
  g.fillStyle(0xdccb93).fillRect(58, 5, 4, 4);
  root.add(text(scene, -16, -12, 'RALPH 5 TON', 8));
  const boxes: Phaser.GameObjects.Graphics[] = [];
  for (const [x, y] of [[-44, 9], [-25, 9], [-6, 9], [-34, 0], [-15, 0]]) {
    const box = scene.add.graphics().setVisible(false);
    box.fillStyle(0x705338).fillRoundedRect(x - 7, y - 4, 15, 12, 1);
    box.fillStyle(0xc2a071).fillRoundedRect(x - 7, y - 6, 15, 10, 1);
    box.fillStyle(0xe1c99c).fillRect(x - 1, y - 6, 3, 10);
    root.add(box);
    boxes.push(box);
  }
  root.setData('loadedBoxes', boxes);
  return root;
}

export function setRalphTruckLoad(truck: Phaser.GameObjects.Container, count: number): void {
  const boxes = truck.getData('loadedBoxes') as Phaser.GameObjects.Graphics[] | undefined;
  boxes?.forEach((box, index) => box.setVisible(index < count));
}

/** Brown-capped drivers holding the original yellow ignition keys. */
export function createDriverArt(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0);
  const g = scene.add.graphics();
  root.add(g);
  g.fillStyle(0x071b23, 0.45).fillEllipse(0, 17, 22, 7);
  g.fillStyle(0x263a42).fillRoundedRect(-7, 7, 6, 13, 2).fillRoundedRect(2, 7, 6, 13, 2);
  g.fillStyle(0x8c704d).fillRoundedRect(-10, -10, 20, 22, 5);
  g.fillStyle(0xa58960).fillRoundedRect(-13, -7, 5, 17, 2).fillRoundedRect(8, -7, 5, 17, 2);
  g.fillStyle(0xc49b76).fillRoundedRect(-7, -23, 14, 16, 5).fillRoundedRect(10, 3, 6, 5, 2);
  g.fillStyle(0x584731).fillRoundedRect(-9, -26, 18, 7, 3).fillRoundedRect(-10, -20, 22, 3, 1);
  g.fillStyle(0x20363c).fillCircle(-3, -15, 1).fillCircle(3, -15, 1);
  g.lineStyle(2, 0xd7bc67).strokeCircle(17, 3, 3).lineBetween(19, 5, 24, 9).lineBetween(22, 8, 21, 10);
  return root;
}

export function createPaytmanTankArt(scene: Phaser.Scene): { container: Phaser.GameObjects.Container; update(timeMs: number): void } {
  const root = scene.add.container(0, 0);
  const g = scene.add.graphics();
  g.fillStyle(0x0b2532, 0.7).fillEllipse(1, 15, 47, 10);
  g.fillStyle(0x234653).fillRoundedRect(-24, -18, 48, 35, 4);
  g.fillStyle(0x408aa0, 0.65).fillRoundedRect(-21, -15, 42, 26, 2);
  g.fillStyle(0x93b8bd, 0.75).fillRect(-21, -14, 42, 2);
  g.fillStyle(0x809066).fillRect(-20, 8, 39, 4);
  g.fillStyle(0x5b8457).fillRoundedRect(-15, -1, 4, 11, 2).fillRoundedRect(12, -4, 4, 15, 2);
  root.add(g);
  const fish: Phaser.GameObjects.Container[] = [];
  for (const color of [0xe0c768, 0xcc715c]) {
    const body = scene.add.graphics();
    body.fillStyle(color).fillEllipse(0, 0, 10, 6).fillTriangle(-4, 0, -9, -4, -9, 4);
    body.fillStyle(0x233e46).fillCircle(3, -1, 1);
    const animal = scene.add.container(0, 0, [body]);
    fish.push(animal);
    root.add(animal);
  }
  const glass = scene.add.graphics();
  glass.lineStyle(2, 0x99c0c9).strokeRoundedRect(-23, -17, 46, 32, 3);
  glass.lineStyle(2, 0xc8d9d3, 0.3).lineBetween(-17, -10, -12, -15).lineBetween(-17, -3, -6, -14);
  glass.fillStyle(0x263d45).fillRoundedRect(-26, 14, 52, 4, 1);
  root.add(glass);
  return {
    container: root,
    update(timeMs) {
      fish.forEach((animal, index) => {
        const phase = timeMs / 1600 + index * 2.7;
        animal.setPosition(Math.sin(phase) * 10, -4 + index * 5 + Math.sin(phase * 1.3) * 2);
        animal.scaleX = Math.cos(phase) >= 0 ? 1 : -1;
      });
    },
  };
}
