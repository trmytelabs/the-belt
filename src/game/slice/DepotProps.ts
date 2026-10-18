import Phaser from 'phaser';
import { SHIFT_LAYOUT } from './ShiftModel';

const text = (scene: Phaser.Scene, x: number, y: number, copy: string, size: number, color = '#eee2bd') =>
  scene.add.text(x, y, copy, { fontFamily: 'Arial, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color }).setOrigin(0.5);

type TruckStyle = { name: string; side: 'left' | 'right'; body?: number; trim?: number; accent?: number; loaded?: boolean; route?: string };

/** One truck footprint, shared by both workers, all eight colleagues and Ralph. */
export function createDepotTruckArt(scene: Phaser.Scene, style: TruckStyle): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0).setSize(148, SHIFT_LAYOUT.truckDepth);
  root.setData('truckFootprint', { width: 148, height: SHIFT_LAYOUT.truckDepth }).setData('truckLabel', style.name);
  const direction = style.side === 'left' ? 1 : -1;
  const chassis = scene.add.container(0, 0).setScale(direction, SHIFT_LAYOUT.truckDepth / 84);
  const g = scene.add.graphics();
  chassis.add(g);
  root.add(chassis);
  const body = style.body ?? 0x947b52;
  const trim = style.trim ?? 0xbda078;
  g.fillStyle(0x071820, 0.55).fillRoundedRect(-72, -31, 146, 73, 7);
  for (const x of [-51, 40]) {
    for (const y of [-32, 32]) {
      g.fillStyle(0x0a1921).fillRoundedRect(x - 8, y - 9, 16, 18, 4);
      g.fillStyle(0x4e6467).fillRoundedRect(x - 5, y - 6, 10, 12, 3);
      g.fillStyle(0x233b44).fillRect(x - 2, y - 5, 4, 10);
    }
  }
  // The outward cab and inward loading door keep the original floorplan readable.
  g.fillStyle(0x654f37).fillRoundedRect(-73, -25, 39, 53, 7);
  g.fillStyle(0xa0875d).fillRoundedRect(-71, -26, 34, 49, 6);
  g.fillStyle(0x345763).fillRoundedRect(-66, -18, 21, 29, 4);
  g.fillStyle(0x9ebdb5, 0.38).fillTriangle(-64, -16, -54, -16, -64, 6);
  g.fillStyle(0x405863).fillRect(-44, -16, 4, 29);
  g.fillStyle(0xa1b2a5).fillRoundedRect(-74, -14, 4, 28, 1);
  g.fillStyle(0xdfc28a).fillRect(-71, -22, 4, 5).fillRect(-71, 17, 4, 5);
  g.fillStyle(0x273f48).fillRoundedRect(-38, -35, 102, 70, 5);
  g.fillStyle(body).fillRoundedRect(-36, -35, 99, 66, 4);
  g.fillStyle(trim).fillRect(-32, -33, 91, 3);
  for (let x = -29; x < 60; x += 11) {
    g.lineStyle(1, 0x203b42, 0.42).lineBetween(x, -26, x, 25);
    g.lineStyle(1, trim, 0.55).lineBetween(x + 2, -26, x + 2, 25);
  }
  g.fillStyle(style.accent ?? 0xa2946f, 0.9).fillRect(-35, 24, 97, 5);
  g.fillStyle(0x283e45).fillRoundedRect(-27, style.loaded ? -25 : -16, 80, style.loaded ? 18 : 31, 3);
  g.lineStyle(1, trim, 0.5).strokeRoundedRect(-27, style.loaded ? -25 : -16, 80, style.loaded ? 18 : 31, 3);
  g.fillStyle(0x263d45).fillRect(63, -31, 8, 62);
  g.fillStyle(0x87958a).fillRect(66, -28, 5, 56);
  g.fillStyle(0x344d54).fillRect(70, -25, 4, 50);
  for (const y of [-22, 20]) {
    g.fillStyle(0xdab878).fillRect(62, y, 4, 4);
    g.fillStyle(0xb3b9a6).fillRect(65, y + 1, 6, 2);
  }
  const lettering = style.name === 'HERES UR SOVICE' ? 'HERES UR\nSOVICE'
    : style.name === 'PAULA ABDUL' ? 'PAULA ABDUL' : style.name;
  root.add(text(scene, direction * 13, style.loaded ? -16 : -1, lettering, style.name.length > 10 ? 10 : 11).setAlign('center'));
  if (style.route) {
    // The route letter sits by the rear door, matching the floor zone and the parcels.
    const badge = scene.add.graphics();
    badge.fillStyle(style.accent ?? 0xa2946f).fillRoundedRect(direction * 52 - 10, -30, 20, 20, 3);
    root.add([badge, text(scene, direction * 52, -20, style.route, 13, '#14232a')]);
  }
  return root;
}

export function createCrewTruckArt(scene: Phaser.Scene, name: string, purple: boolean, side: 'left' | 'right'): Phaser.GameObjects.Container {
  return createDepotTruckArt(scene, { name, side, body: purple ? 0x744974 : 0x947b52, trim: purple ? 0xa47aa0 : 0xbda078 });
}

/** The same truck footprint, with five visible cargo slots controlled by Life. */
export function createRalphTruckArt(scene: Phaser.Scene, side: 'left' | 'right' = 'right'): Phaser.GameObjects.Container {
  const root = createDepotTruckArt(scene, { name: 'RALPH 5 TON', side, body: 0x69777b, trim: 0xa2b0a7, accent: 0xc6ad62, loaded: true });
  const boxes: Phaser.GameObjects.Graphics[] = [];
  // The bed is opposite the cab, so the slots mirror with the truck.
  const mirror = side === 'left' ? -1 : 1;
  for (const [baseX, y] of [[-39, 16], [-17, 16], [5, 16], [-28, 4], [-6, 4]]) {
    const x = baseX * mirror;
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
