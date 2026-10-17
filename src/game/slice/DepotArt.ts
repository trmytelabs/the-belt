import Phaser from 'phaser';
import { SHIFT_LAYOUT, type ParcelKind, type Route } from './ShiftModel';
import { createCrewTruckArt, createDepotTruckArt, createPaytmanTankArt } from './DepotProps';

/** Editable, resolution-independent artwork for the night shift vertical slice. */
export type DepotRoute = Route;
export type DepotSide = 'left' | 'right';

export const DEPOT_ROUTE_COLORS: Record<DepotRoute, number> = {
  A: 0x76cbd1,
  B: 0xa6cc9a,
  C: 0xedba6d,
  D: 0x86a8f0,
  E: 0xd6d877,
  T: 0xc6a3ee,
  S: 0xee9cb9,
};

const INK = 0x10222a;
const FONT = 'Arial, sans-serif';

function label(scene: Phaser.Scene, x: number, y: number, value: string, size: number, color = '#abc0bf') {
  return scene.add.text(x, y, value, {
    fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color,
  }).setOrigin(0.5);
}

function polygon(g: Phaser.GameObjects.Graphics, points: number[], color: number, alpha = 1) {
  g.fillStyle(color, alpha);
  g.fillPoints(Array.from({ length: points.length / 2 }, (_, i) => ({ x: points[i * 2], y: points[i * 2 + 1] })), true);
}

function line(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, color: number, width = 1, alpha = 1) {
  g.lineStyle(width, color, alpha).lineBetween(x1, y1, x2, y2);
}

function pallet(g: Phaser.GameObjects.Graphics, x: number, y: number, w = 90, h = 62) {
  g.fillStyle(0x08151d, 0.45).fillRoundedRect(x - w / 2 + 4, y - h / 2 + 9, w, h, 5);
  g.fillStyle(0x463d30).fillRect(x - w / 2, y + h / 2 - 6, w, 6);
  const slats = Math.max(5, Math.ceil(h / 10));
  for (let i = 0; i < slats; i++) {
    const sy = y - h / 2 + i * (h / slats);
    g.fillStyle(i % 2 === 0 ? 0x8a7757 : 0x78664d).fillRoundedRect(x - w / 2, sy, w, h / slats - 3, 1);
    line(g, x - w / 2 + 3, sy + 1, x + w / 2 - 3, sy + 1, 0xb69a6d, 1, 0.45);
    for (const sx of [-w / 2 + 6, w / 2 - 6]) {
      g.fillStyle(0x443e35).fillCircle(x + sx, sy + 4, 1);
    }
  }
}

/** Static depot scenery; only belt treads and the mechanical drive animate. */
export class DepotArt {
  public readonly belt: Phaser.GameObjects.TileSprite;
  public readonly crewTruckPoints: Record<string, { x: number; y: number }> = {};
  public bulkStockCount = 0;
  private readonly scene: Phaser.Scene;
  private readonly dockHighlights: { route: DepotRoute; side: DepotSide; x: number; y: number; width: number; height: number; art: Phaser.GameObjects.Graphics }[] = [];
  private readonly drive: Phaser.GameObjects.Container;
  private readonly statusLight: Phaser.GameObjects.Arc;
  private readonly departureObjects: { object: Phaser.GameObjects.Container | Phaser.GameObjects.Text; x: number; direction: number }[] = [];
  private readonly bulkStock: Phaser.GameObjects.Graphics[] = [];
  private fishTank: ReturnType<typeof createPaytmanTankArt> | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.drawFloor();
    this.drawTruck('left');
    this.drawTruck('right');
    this.drawBulk();
    this.drawDepotPersonality();
    this.drawDock('A', 'left');
    this.drawDock('B', 'right');
    this.drawDock('C', 'left');
    this.drawDock('C', 'right');

    const top = SHIFT_LAYOUT.beltTop;
    const bottom = SHIFT_LAYOUT.beltBottom;
    const length = bottom - top;
    const bg = scene.add.graphics().setDepth(6);
    bg.fillStyle(0x07141d, 0.7).fillRoundedRect(419, top - 5, 125, length + 16, 9);
    bg.fillStyle(0x152932).fillRoundedRect(428, top - 7, 104, length + 14, 8);
    const textureKey = 'night-shift-belt-slats';
    if (!scene.textures.exists(textureKey)) {
      const tex = scene.add.graphics();
      tex.fillStyle(0x182c35).fillRect(0, 0, 80, 48);
      for (const y of [0, 24]) {
        tex.fillStyle(0x2d4148).fillRect(0, y + 2, 80, 20);
        tex.fillStyle(0x364c52).fillRect(0, y + 2, 80, 2);
        tex.fillStyle(0x21353e).fillRect(0, y + 20, 80, 2);
        for (let x = 5; x < 78; x += 8) {
          line(tex, x, y + 6, x, y + 18, 0x627074, 1, 0.13);
        }
        tex.fillStyle(0x0b1c25).fillCircle(5, y + 12, 1.5).fillCircle(75, y + 12, 1.5);
      }
      tex.generateTexture(textureKey, 80, 48);
      tex.destroy();
    }
    this.belt = scene.add.tileSprite(SHIFT_LAYOUT.beltX, top + length / 2, 80, length, textureKey).setDepth(7);

    const rails = scene.add.graphics().setDepth(9);
    for (const x of [428, 523]) {
      rails.fillStyle(0x10252e).fillRoundedRect(x - 2, top - 1, 14, length, 3);
      rails.fillStyle(0x617574).fillRoundedRect(x, top - 1, 9, length - 3, 2);
      rails.fillStyle(0x9ca99a).fillRect(x + 1, top + 3, 2, length - 11);
      rails.fillStyle(0x354d54).fillRect(x + 7, top + 2, 3, length - 8);
      for (let y = top + 27; y < bottom - 9; y += 48) {
        rails.fillStyle(0x142a32).fillCircle(x + 4, y + 1, 2.5);
        rails.fillStyle(0xa9b6a9).fillCircle(x + 4, y, 1.5);
      }
    }
    // Rollers cover the ends of the moving surface, keeping tread emergence grounded.
    for (const y of [top + 3, bottom - 10]) {
      rails.fillStyle(0x0e222c).fillRoundedRect(437, y - 4, 86, 16, 5);
      rails.fillStyle(0x627b7b).fillRoundedRect(439, y - 3, 82, 10, 4);
      rails.fillStyle(0x8c9a91).fillRect(441, y - 2, 78, 2);
      rails.fillStyle(0x394f56).fillRect(441, y + 5, 78, 3);
      for (let x = 447; x <= 515; x += 12) line(rails, x, y - 2, x, y + 6, 0x344b51, 1, 0.7);
    }
    // Intake hood and cast shadow, deliberately restrained rather than emissive.
    rails.fillStyle(0x06141e, 0.4).fillRect(438, top + 9, 84, 13);
    polygon(rails, [419, top - 14, 538, top - 14, 530, top + 8, 428, top + 8], 0x324d54);
    rails.fillStyle(0x516b6b).fillRoundedRect(420, top - 14, 118, 14, 3);
    line(rails, 424, top - 12, 534, top - 12, 0x8f9e91, 2);
    label(scene, 479, top - 7, 'FEED  /  01', 8, '#c0cec0').setDepth(10);
    rails.fillStyle(0x111f27).fillRoundedRect(453, bottom - 3, 56, 11, 3);
    for (let x = 456; x < 505; x += 8) line(rails, x, bottom - 1, x + 3, bottom + 4, 0x977a49, 3);

    const motor = scene.add.graphics().setDepth(8);
    motor.fillStyle(0x091821, 0.7).fillRoundedRect(532, bottom - 65, 31, 50, 5);
    motor.fillStyle(0x476364).fillRoundedRect(532, bottom - 70, 24, 43, 4);
    motor.fillStyle(0x6b8380).fillRect(534, bottom - 68, 19, 4);
    for (let y = bottom - 59; y < bottom - 32; y += 5) line(motor, 536, y, 553, y, 0x263e48, 2);
    const driveArt = scene.add.graphics();
    driveArt.fillStyle(0x89988a).fillCircle(0, 0, 7);
    driveArt.fillStyle(0x2c4850).fillCircle(0, 0, 4);
    line(driveArt, -6, 0, 6, 0, 0xb0b6a0, 2);
    this.drive = scene.add.container(541, bottom - 25, [driveArt]).setDepth(10);
    this.statusLight = scene.add.circle(541, bottom - 61, 2, 0xa6cc9a).setDepth(10);
  }

  /** Absolute travel is shared with packages, so tread motion never drifts. */
  updateBelt(travel: number, running: boolean) {
    this.belt.tilePositionY = -travel;
    this.drive.rotation = travel / 16;
    this.statusLight.setFillStyle(running ? 0xa6cc9a : 0xedba6d);
  }

  setDockActive(route: DepotRoute | null) {
    for (const dock of this.dockHighlights) dock.art.setAlpha(dock.route === route ? 1 : 0);
  }

  updateDetails(timeMs: number): void { this.fishTank?.update(timeMs); }

  departTrucks(progress: number): void {
    const distance = Phaser.Math.Clamp(progress, 0, 1) * 1040;
    for (const truck of this.departureObjects) truck.object.setX(truck.x + distance * truck.direction);
  }

  setBulkStock(count: number): void {
    this.bulkStockCount = Math.max(0, Math.floor(count));
    this.bulkStock.forEach((box, index) => box.setVisible(index < this.bulkStockCount));
  }

  flashDock(route: DepotRoute, side: DepotSide) {
    const dock = this.dockHighlights.find((d) => d.route === route && d.side === side);
    if (!dock) return;
    const spark = this.scene.add.graphics().setDepth(route === 'C' ? 2 : 11);
    spark.lineStyle(3, DEPOT_ROUTE_COLORS[route], 0.9).strokeRoundedRect(
      dock.x - dock.width / 2, dock.y - dock.height / 2, dock.width, dock.height, 6);
    this.scene.tweens.add({ targets: spark, alpha: 0, duration: 450, onComplete: () => spark.destroy() });
  }

  private drawFloor() {
    const scene = this.scene;
    const g = scene.add.graphics().setDepth(0);
    const top = SHIFT_LAYOUT.worldTop;
    const bottom = SHIFT_LAYOUT.worldBottom;
    g.fillStyle(0x14262f).fillRect(0, top, 960, bottom - top);
    g.fillStyle(0x253c43).fillRoundedRect(15, top + 9, 930, bottom - top - 12, 8);
    g.fillStyle(0x314950).fillRect(328, top + 14, 90, bottom - top - 24).fillRect(542, top + 14, 90, bottom - top - 24);
    g.fillStyle(0x2b444b).fillRect(349, top + 14, 49, bottom - top - 24).fillRect(562, top + 14, 49, bottom - top - 24);
    // Offset concrete tiles, tiny deterministic aggregate, and expansion joints.
    for (let y = top + 25; y < bottom - 8; y += 76) {
      const row = Math.floor(y / 76);
      line(g, 20, y, 938, y, 0x0e2933, 2, 0.23);
      line(g, 20, y + 2, 938, y + 2, 0x728886, 1, 0.09);
      for (let x = 32 + (row % 2) * 60; x < 944; x += 120) line(g, x, y, x, Math.min(bottom - 5, y + 76), 0x122c35, 1, 0.27);
    }
    for (let i = 0; i < 650; i++) {
      const x = 24 + ((i * 277 + 31) % 910);
      const y = top + 26 + ((i * 163 + 37) % (bottom - top - 38));
      g.fillStyle(i % 3 === 0 ? 0x091e28 : 0x829387, 0.075).fillRect(x, y, i % 5 === 0 ? 3 : 1, 1);
    }
    // The source's four truck rows lead down to the two workers' trucks.
    for (const y of [148, 244, 340, 436]) {
      for (const x of [244, 716]) {
        g.fillStyle(0x172f37).fillRoundedRect(x - 79, y - 45, 158, 90, 4);
        g.lineStyle(1, 0x657e7c, 0.23).strokeRoundedRect(x - 79, y - 45, 158, 90, 4);
      }
    }
    for (const x of [268, 692]) g.fillStyle(0x172f37).fillRoundedRect(x - 79, 487, 158, 90, 4);
    for (const x of [325, 635]) {
      for (let y = 111; y < 480; y += 20) g.fillStyle(0x7d9288, 0.38).fillRect(x - 2, y, 4, 9);
    }
    for (const x of [346, 614]) {
      line(g, x, 110, x, 475, 0x97aaa0, 1, 0.18);
      for (let y = 135; y < 478; y += 53) line(g, x - 3, y, x + 3, y, 0xacc0ac, 1, 0.3);
    }
    // Painted direction arrows remain low contrast behind the actors.
    for (const x of [374, 586]) {
      for (const y of [208, 445]) {
        polygon(g, [x - 7, y + 3, x - 2, y + 3, x - 2, y - 3, x + 2, y - 3, x + 2, y + 3, x + 7, y + 3, x, y + 10], 0xa6b5a1, 0.16);
      }
    }
    // Warm overhead work lights, kept off the central read/play lane.
    for (const x of [105, 855]) {
      polygon(g, [x - 38, top + 20, x + 38, top + 20, x + 104, top + 220, x - 104, top + 220], 0xd6b87d, 0.035);
      g.fillStyle(0x091c25).fillRoundedRect(x - 46, top + 13, 92, 17, 5);
      g.fillStyle(0xc4ba91).fillRoundedRect(x - 39, top + 16, 78, 5, 2);
      g.fillStyle(0xf1de9f).fillRect(x - 34, top + 17, 68, 2);
    }
    // Wall edge, girders and a narrow drainage channel anchor the miniature.
    g.fillStyle(0x0c202a).fillRect(0, top, 960, 7).fillRect(0, bottom - 7, 960, 7);
    line(g, 16, top + 8, 944, top + 8, 0x5a7376, 1, 0.45);
    for (const x of [17, 326, 634, 943]) {
      g.fillStyle(0x102630).fillRect(x - 5, top + 9, 11, 37);
      g.fillStyle(0x50686b).fillRect(x - 5, top + 9, 4, 35);
      g.fillStyle(0x0a202a, 0.4).fillRect(x + 6, top + 11, 9, 34);
    }
    for (let x = 35; x < 941; x += 12) line(g, x, bottom - 5, x + 4, bottom, 0x53676b, 1, 0.3);
    label(scene, 355, bottom - 18, 'WEST WALK', 8, '#6e8a8b').setDepth(1);
    label(scene, 605, bottom - 18, 'EAST WALK', 8, '#6e8a8b').setDepth(1);
  }

  private drawTruck(side: DepotSide) {
    const point = side === 'left' ? { x: 268, y: 532 } : { x: 692, y: 532 };
    const route = side === 'left' ? 'A' : 'B';
    const truck = createDepotTruckArt(this.scene, {
      name: route === 'A' ? 'HERES UR SOVICE' : 'PAYTMAN', side,
      body: route === 'A' ? 0x4f8495 : 0x789369,
      trim: route === 'A' ? 0x8dafae : 0xaac49d, accent: DEPOT_ROUTE_COLORS[route],
    }).setPosition(point.x, point.y).setDepth(3);
    this.departureObjects.push({ object: truck, x: point.x, direction: side === 'left' ? -1 : 1 });
  }

  private drawBulk() {
    const { x, y } = SHIFT_LAYOUT.bulkPile;
    const g = this.scene.add.graphics().setDepth(3);
    const height = 96;
    g.setData('bulkPile', { x, y, width: 116, height });
    g.fillStyle(0x173039).fillRoundedRect(x - 63, y - height / 2 - 3, 126, height + 6, 4);
    g.lineStyle(1, 0xc2a771, 0.55).strokeRoundedRect(x - 63, y - height / 2 - 3, 126, height + 6, 4);
    pallet(g, x, y, 116, height);
    // One common stock pile at the actual end of the belt.
    const crate = (cx: number, cy: number, w: number, h: number) => {
      const g = this.scene.add.graphics().setDepth(3 + cy / 10000);
      g.setData('bulkStockIndex', this.bulkStock.length);
      this.bulkStock.push(g);
      g.fillStyle(0x172a2c, 0.55).fillRect(cx - w / 2 + 4, cy - h / 2 + 9, w, h);
      g.fillStyle(0x726249).fillRect(cx - w / 2, cy - h / 2 + 5, w, h);
      g.fillStyle(0x9b865d).fillRect(cx - w / 2, cy - h / 2, w, h - 4);
      for (let px = cx - w / 2 + 4; px < cx + w / 2; px += 12) line(g, px, cy - h / 2 + 2, px, cy + h / 2 - 6, 0x655c44, 1, 0.5);
      for (const off of [-w / 2 + 4, w / 2 - 9]) {
        g.fillStyle(0xc0a779).fillRect(cx + off, cy - h / 2 + 1, 5, h - 6);
        g.fillStyle(0x4f5f58).fillRect(cx + off, cy - h / 2, 5, 6).fillRect(cx + off, cy + h / 2 - 10, 5, 6);
      }
      line(g, cx - w / 2 + 2, cy - h / 2 + 1, cx + w / 2 - 2, cy - h / 2 + 1, 0xd3b580, 1, 0.7);
    };
    for (const cy of [y + 6, y - 9]) for (const cx of [x, x - 30, x + 30]) crate(cx, cy, 26, 20);
    this.setBulkStock(0);
    label(this.scene, x, y + height / 2 + 10, 'BULK / DISPATCH', 7, '#c5b384').setDepth(4);
    const recovery = SHIFT_LAYOUT.recoveryPile;
    const tray = this.scene.add.graphics().setDepth(3).setData('recoveryPile', { ...recovery });
    tray.fillStyle(0x0a2028).fillRoundedRect(recovery.x - 59, recovery.y - 13, 118, 26, 4);
    tray.lineStyle(2, 0x788784).strokeRoundedRect(recovery.x - 59, recovery.y - 13, 118, 26, 4);
    for (let dx = -51; dx < 54; dx += 13) line(tray, recovery.x + dx, recovery.y - 9, recovery.x + dx, recovery.y + 9, 0x364f56, 1, 0.7);
    label(this.scene, recovery.x, recovery.y + 18, 'MISSED / RECOVER', 7, '#afaaa0').setDepth(4);
  }

  private drawDock(route: DepotRoute, side: DepotSide) {
    const scene = this.scene;
    const color = DEPOT_ROUTE_COLORS[route];
    const bulk = route === 'C';
    const area = bulk ? SHIFT_LAYOUT.dropAreas[side === 'left' ? 'bulkLeft' : 'bulkRight'] : SHIFT_LAYOUT.dropAreas[route];
    const { x, y, width, height } = area;
    const depth = bulk ? 2 : 4;
    // Floor paint uses the model's exact valid rectangle; C remains floor, not a second pallet.
    const g = scene.add.graphics().setDepth(depth).setData('dropArea', { route, side, ...area });
    g.fillStyle(color, 0.055).fillRoundedRect(x - width / 2, y - height / 2, width, height, 5);
    g.lineStyle(2, color, 0.65).strokeRoundedRect(x - width / 2, y - height / 2, width, height, 5);
    const arrow = (side === 'left' ? 1 : -1) * (bulk ? -1 : 1);
    for (const oy of [-height / 2 + 13, height / 2 - 13]) {
      line(g, x - 8 * arrow, y + oy - 4, x - 15 * arrow, y + oy, color, 2, 0.65);
      line(g, x - 15 * arrow, y + oy, x - 8 * arrow, y + oy + 4, color, 2, 0.65);
    }
    label(scene, x, y - 7, route, 26, `#${color.toString(16).padStart(6, '0')}`).setDepth(depth + 0.5);
    label(scene, x, y + 17, bulk ? 'TO BULK' : 'LOAD', 8, '#a9c0b4').setDepth(depth + 0.5);
    const highlight = scene.add.graphics().setDepth(depth).setAlpha(0);
    highlight.fillStyle(color, 0.16).fillRoundedRect(x - width / 2 + 1, y - height / 2 + 1, width - 2, height - 2, 5);
    highlight.lineStyle(2, color, 0.95).strokeRoundedRect(x - width / 2, y - height / 2, width, height, 5);
    this.dockHighlights.push({ route, side, x, y, width, height, art: highlight });
  }

  private drawDepotPersonality() {
    const g = this.scene.add.graphics().setDepth(4);
    // Personal props stay beside their original coworker rows.
    g.fillStyle(0x0b2027, 0.5).fillEllipse(150, 301, 80, 17);
    g.fillStyle(0x604330).fillRoundedRect(115, 285, 70, 12, 4);
    g.fillStyle(0xa78061).fillRoundedRect(116, 281, 66, 12, 5);
    g.fillStyle(0xbed0b4).fillRoundedRect(119, 282, 16, 9, 3);
    g.fillStyle(0x405453).fillRect(122, 296, 4, 11).fillRect(174, 296, 4, 11);
    // Bannerman's original red, blue, yellow and green LEGO construction.
    g.fillStyle(0xad5547).fillRect(135, 486, 16, 10);
    g.fillStyle(0x507fa3).fillRect(149, 478, 16, 14);
    g.fillStyle(0xc9ad58).fillRect(130, 475, 14, 11);
    g.fillStyle(0x6c9758).fillRect(160, 489, 13, 9);
    for (const x of [133, 139]) g.fillStyle(0xe0c371).fillEllipse(x, 475, 3, 2);
    for (const x of [152, 160]) g.fillStyle(0x7fa9b7).fillEllipse(x, 478, 3, 2);
    // Donna's Warcraft husband has colonized a spare packing table.
    g.fillStyle(0x664e39).fillRoundedRect(784, 489, 53, 5, 1);
    g.fillStyle(0x253e49).fillRoundedRect(812, 465, 23, 21, 2);
    g.fillStyle(0x718670).fillRect(815, 468, 17, 12);
    polygon(g, [816, 479, 821, 472, 825, 477, 830, 471, 832, 479], 0x36544b);
    g.fillStyle(0xc9ab71).fillCircle(826, 471, 2);
    g.fillStyle(0x1e3540).fillRect(822, 485, 3, 5);
    g.fillStyle(0x826344).fillCircle(795, 479, 6);
    g.fillStyle(0x53617a).fillRoundedRect(788, 483, 13, 12, 4);
    const trucks: [string, string, number, number, 'left' | 'right'][] = [
      ['hussan', 'HUSSAN', 244, 148, 'left'], ['aj', 'AJ', 244, 244, 'left'],
      ['ben', 'PAULA ABDUL', 244, 340, 'left'], ['bannerman', 'BANNERMAN', 244, 436, 'left'],
      ['fruitloop', 'FRUIT LOOP', 716, 148, 'right'], ['doris', 'DORIS', 716, 244, 'right'],
      ['brian', 'BRIAN', 716, 340, 'right'], ['donna', 'DONNA', 716, 436, 'right'],
    ];
    for (const [id, name, x, y, side] of trucks) {
      const truck = createCrewTruckArt(this.scene, name, id === 'ben', side).setPosition(x, y).setDepth(3);
      this.crewTruckPoints[id] = { x: x + (side === 'left' ? 80 : -80), y };
      this.departureObjects.push({ object: truck, x, direction: side === 'left' ? -1 : 1 });
    }
    this.crewTruckPoints.froodoo = this.crewTruckPoints.fruitloop;
    this.crewTruckPoints.dorothy = this.crewTruckPoints.doris;
    this.fishTank = createPaytmanTankArt(this.scene);
    this.fishTank.container.setPosition(762, 558).setDepth(4);
    this.departureObjects.push({ object: this.fishTank.container, x: 762, direction: 1 });
  }
}

const parcelDecorations = new WeakMap<Phaser.GameObjects.Container, Phaser.GameObjects.Graphics>();
const parcelRecoveredBadges = new WeakMap<Phaser.GameObjects.Container, Phaser.GameObjects.Star>();

/** Origin is the parcel contact center. No idle motion is baked into its art. */
export function createParcelArt(scene: Phaser.Scene, route: DepotRoute, heavy = false, kind: ParcelKind = 'standard'): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const dimensions: Partial<Record<ParcelKind, [number, number]>> = {
    envelope: [37, 20], smallbox: [30, 27], bigbox: [48, 41], longbox: [56, 26],
    mallwood: [52, 29], goji: [34, 36], lobsters: [48, 35], atv: [50, 40], snakes: [58, 23],
  };
  const [w, h] = dimensions[kind] ?? (heavy ? [45, 37] : [34, 30]);
  const l = -w / 2;
  const r = w / 2;
  const t = -h / 2;
  const b = h / 2;
  g.fillStyle(0x04131a, 0.35).fillEllipse(2, b - 1, w + 6, 10);
  polygon(g, [l, t + 5, r, t + 5, r, b, l, b], 0x6c5138);
  polygon(g, [l, t, r - 4, t, r, t + 4, r, b - 6, l + 3, b - 6, l, b - 9], 0xc6a171);
  polygon(g, [r - 5, t + 1, r, t + 4, r, b - 6, r - 5, b - 9], 0xaa8357);
  polygon(g, [l, b - 9, l + 3, b - 6, r, b - 6, r, b - 1, l + 1, b - 1], 0x987044);
  line(g, l + 2, t + 1, r - 5, t + 1, 0xf0cf91, 1, 0.9);
  line(g, l + 1, t + 3, l + 1, b - 10, 0xe3bb80, 1, 0.8);
  g.fillStyle(0xe4cb95, 0.8).fillRect(3, t + 1, 5, h - 8);
  g.fillStyle(0xbaa072).fillRect(3, b - 6, 5, 5);
  line(g, 5, t + 1, 5, b - 8, 0xf8e8b9, 1, 0.5);
  if (heavy && kind !== 'mallwood' && kind !== 'longbox' && kind !== 'bigbox') {
    g.fillStyle(0x4b594f).fillRect(l + 5, t + 1, 3, h - 2).fillRect(r - 8, t + 1, 3, h - 2);
    g.fillStyle(0x819180).fillRect(l + 5, t + 1, 1, h - 8).fillRect(r - 8, t + 1, 1, h - 8);
  }
  // Original freight keeps its own silhouette, rather than becoming anonymous boxes.
  if (kind === 'envelope') {
    g.fillStyle(0xc7ae80).fillRoundedRect(l, t, w, h - 2, 2);
    polygon(g, [l + 1, t + 1, 0, 2, r - 1, t + 1], 0xe1c89b);
    line(g, l + 2, b - 4, -2, 0, 0xa78b61, 1);
    line(g, 2, 0, r - 2, b - 4, 0xa78b61, 1);
  } else if (kind === 'goji') {
    g.fillStyle(0x142820, 0.5).fillEllipse(0, 11, 38, 10);
    g.fillStyle(0x6e7048).fillEllipse(0, 0, 37, 33);
    g.fillStyle(0xb8ad70).fillEllipse(-2, -2, 31, 29);
    polygon(g, [-8, -14, -11, -21, 5, -21, 9, -14, 2, -12], 0xc4b885);
    line(g, -8, -15, 9, -15, 0x567649, 3);
    for (const [x, y] of [[7, -5], [12, 0], [5, 3]]) {
      g.fillStyle(0xad5349).fillEllipse(x, y, 7, 5);
      g.fillStyle(0xe18b63).fillCircle(x - 1, y - 1, 1);
    }
    line(g, 13, 5, 11, 10, 0x7e794e, 1);
  } else if (kind === 'snakes') {
    // The source is a labelled green CELL case; it never depicts a literal snake.
    g.fillStyle(0x2d3a22).fillRoundedRect(l, t, w, h, 5);
    g.lineStyle(2, 0xd6bc64).strokeRoundedRect(l, t, w, h, 5);
  } else if (kind === 'lobsters') {
    g.fillStyle(0x56655a).fillRoundedRect(l - 1, t, w + 2, h, 2);
    g.fillStyle(0x233c39).fillRect(l + 3, t + 4, w - 6, h - 10);
    g.fillStyle(0xbd5547).fillEllipse(8, 0, 9, 22);
    for (const y of [-5, 0, 5]) line(g, 2, y, 15, y + 2, 0xd9805f, 1);
    line(g, 6, -7, 4, -18, 0xde9b6c, 1);
    line(g, 10, -7, 14, -18, 0xde9b6c, 1);
    for (const y of [t, b - 5]) {
      g.fillStyle(0xb59668).fillRect(l - 1, y, w + 2, 5);
      line(g, l + 1, y, r, y, 0xc4b28d, 1);
    }
    for (const x of [l, r - 4]) g.fillStyle(0x887c5b).fillRect(x, t, 4, h);
  } else if (kind === 'mesa') {
    g.fillStyle(0x18252b).fillRoundedRect(l, t, w, h, 3);
    g.fillStyle(0x405050).fillRoundedRect(l + 3, t + 9, w - 6, h - 13, 1);
    for (let y = t + 12; y < b - 3; y += 3) line(g, l + 4, y, r - 4, y, 0xa4a184, 1, 0.35);
    for (let x = l + 6; x < r - 3; x += 4) line(g, x, t + 10, x, b - 4, 0xb4a687, 1, 0.2);
    g.fillStyle(0xaaa088).fillRect(l + 3, t + 3, w - 6, 4);
    for (let x = l + 7; x < r - 4; x += 7) g.fillStyle(0x253b40).fillCircle(x, t + 5, 1.5);
    g.lineStyle(2, 0x8f998c).strokeRoundedRect(-7, t - 4, 14, 5, 2);
    for (const x of [l + 1, r - 4]) g.fillStyle(0xb1a58a).fillRect(x, b - 5, 3, 4);
  } else if (kind === 'atv') {
    // Four chunky tires, red fairing, handlebar and two shipping straps.
    for (const x of [-15, 15]) for (const y of [-10, 6]) {
      g.fillStyle(0x12232b).fillRoundedRect(x - 6, y - 7, 12, 13, 3);
      for (let ty = y - 5; ty < y + 6; ty += 4) line(g, x - 5, ty, x + 5, ty, 0x546361, 1);
    }
    g.fillStyle(0x9b4940).fillRoundedRect(-12, -17, 24, 34, 5);
    g.fillStyle(0xce6d4c).fillRoundedRect(-10, -17, 20, 12, 5);
    g.fillStyle(0x25373b).fillRoundedRect(-5, -4, 10, 15, 3);
    line(g, -12, -8, 12, -8, 0xbac5ae, 2);
    for (const x of [-9, 9]) g.fillStyle(0xdfb773).fillRect(x, t, 2, h);
    g.fillStyle(0xdad7a0).fillRect(-8, -15, 5, 3).fillRect(3, -15, 5, 3);
  } else if (kind === 'duck') {
    // The shipping label really does have a duck on it.
    g.fillStyle(0xe0c169).fillEllipse(9, 4, 13, 9).fillCircle(12, -3, 5);
    polygon(g, [15, -3, 21, -1, 15, 1], 0xcd8449);
    g.fillStyle(0x354440).fillCircle(13, -4, 1);
    line(g, 5, 5, 12, 3, 0xb08d47, 1);
  } else if (kind === 'makeup') {
    g.fillStyle(0x794554).fillRoundedRect(5, -9, 10, 18, 3);
    g.fillStyle(0xd49da8).fillRoundedRect(6, -8, 8, 15, 2);
    g.fillStyle(0xe4c7b0).fillRect(6, -12, 8, 4);
    g.fillStyle(0xab6481).fillRect(7, -1, 6, 4);
  }
  root.add(g);
  const decoration = scene.add.graphics();
  root.add(decoration);
  parcelDecorations.set(root, decoration);
  const badge = scene.add.graphics();
  const badgeTop = t + (kind === 'envelope' ? 1 : 5);
  badge.fillStyle(0x6e5840, 0.4).fillRoundedRect(l + 5, badgeTop + 1, 17, 16, 1);
  badge.fillStyle(DEPOT_ROUTE_COLORS[route]).fillRoundedRect(l + 4, badgeTop, 17, 16, 1);
  for (let x = l + 25; x < r - 3; x += 2) line(g, x, b - 13, x, b - 8, 0x5a5844, 1, 0.8);
  const letter = label(scene, l + 12.5, badgeTop + 8, route, 12, '#19383b');
  if (kind === 'snakes') { badge.destroy(); letter.destroy(); }
  else root.add([badge, letter]);
  if (kind !== 'standard') {
    const stamp: Partial<Record<ParcelKind, string>> = {
      mallwood: 'MALLWOOD\nRD EAST', goji: 'GOJI\nBERRIES', lobsters: 'LIVE\nLOBSTERS', duck: 'LE DUCK',
      makeup: 'MAKEUP\nLOTION', mesa: 'MESA\nBOOGIE', panchetters: 'PANCHETTERS', atv: 'SMALL ATV',
    };
    if (kind === 'snakes') root.add(label(scene, 1, 0, 'THE SNAKES CELL', 6, '#eae2be'));
    else if (stamp[kind]) {
      // The full joke belongs on the freight itself. A tied paper tag keeps it
      // legible without covering the destination badge or the object's shape.
      const copy = label(scene, 0, 0, stamp[kind]!, 9, '#24383b').setAlign('center');
      const tagWidth = copy.width + 9;
      const tagHeight = copy.height + 5;
      const tagY = t - tagHeight / 2 - 5;
      const tag = scene.add.graphics();
      tag.lineStyle(1, 0xcbb27f).lineBetween(0, t + 3, 0, tagY + tagHeight / 2);
      tag.fillStyle(0x0d252d, 0.5).fillRoundedRect(-tagWidth / 2 + 1, tagY - tagHeight / 2 + 2, tagWidth, tagHeight, 2);
      tag.fillStyle(0xead6aa).fillRoundedRect(-tagWidth / 2, tagY - tagHeight / 2, tagWidth, tagHeight, 2);
      tag.lineStyle(1, 0xbca375).strokeRoundedRect(-tagWidth / 2, tagY - tagHeight / 2, tagWidth, tagHeight, 2);
      copy.y = tagY;
      root.add([tag, copy]);
    }
  }
  const recoveredBadge = scene.add.star(r - 4, t + 4, 4, 2, 4, 0xffffff).setStrokeStyle(1, INK, 0.7).setVisible(false);
  root.add(recoveredBadge);
  parcelRecoveredBadges.set(root, recoveredBadge);
  updateParcelArt(root, kind, 0);
  return root;
}

/** Only small local accents animate: parcel contact coordinates always stay fixed. */
export function updateParcelArt(container: Phaser.GameObjects.Container, kind: ParcelKind, timeMs: number, broken = false, recovered = false): void {
  parcelRecoveredBadges.get(container)?.setVisible(recovered);
  const g = parcelDecorations.get(container);
  if (!g) return;
  g.clear();
  if (kind === 'mallwood') {
    for (let i = 0; i < 3; i++) {
      const phase = (timeMs / 1400 + i * 0.3) % 1;
      const direction = i === 1 ? 1 : -1;
      const x = direction * (28 + phase * 17);
      const y = -13 - phase * 28;
      // Curry fumes curl around the tied label instead of disappearing behind it.
      line(g, x, y, x + direction * 3 + Math.sin(timeMs / 300 + i) * 2, y - 6, i === 1 ? 0xb94a2f : 0xd18a1f, 2, (1 - phase) * 0.7);
    }
    g.fillStyle(0xd18a1f, 0.7).fillCircle(-27, -15, 2);
    g.fillStyle(0xb94a2f, 0.65).fillCircle(27, -15, 2);
  } else if (kind === 'lobsters') {
    for (const direction of [-1, 1]) {
      const x = direction * 25;
      const y = -7 + Math.sin(timeMs / 240 + direction) * 2;
      line(g, direction * 15, -1, x, y + 5, 0xb35b45, 3);
      g.fillStyle(0xda7857).fillEllipse(x, y, 8, 13);
      polygon(g, [x - 1, y - 7, x + 1, y - 1, x + 4, y - 7], 0x344b43);
      line(g, x - 2, y - 3, x - 2, y + 2, 0xf1b680, 1);
    }
  } else if (kind === 'makeup' && broken) {
    g.lineStyle(2, 0x7a4258).beginPath().moveTo(-12, -2).lineTo(-5, -8).lineTo(4, 2).lineTo(13, -5).strokePath();
    g.fillStyle(0xb66d91, 0.8).fillEllipse(13, 14, 17, 5);
    const pulse = (Math.sin(timeMs / 320) + 1) / 2;
    g.fillStyle(0xe4a9bd, 0.8).fillCircle(20, 10 - pulse * 2, 2 + pulse);
    g.lineStyle(1, 0xf2c1cb, 0.7).strokeCircle(16, 12, 2);
  }
}

export interface DepotWorkerArt {
  container: Phaser.GameObjects.Container;
  update(timeMs: number, moving: boolean, active: boolean, holding: boolean): void;
}

/** Illustrated workers with independently articulated arms and boots. */
export function createWorkerArt(scene: Phaser.Scene, side: DepotSide): DepotWorkerArt {
  const root = scene.add.container(0, 0);
  const accent = side === 'left' ? 0xd6bf69 : 0xdfb892;
  const shadow = scene.add.ellipse(0, 24, 36, 13, 0x06141e, 0.48);
  const ring = scene.add.ellipse(0, 24, 43, 18).setStrokeStyle(2, 0xdbedc7, 0.75);
  root.add([shadow, ring]);
  const sleepy = label(scene, 0, -48, 'zZz', 10, '#e5e9d6');
  root.add(sleepy);

  const legs: Phaser.GameObjects.Graphics[] = [];
  for (const x of [-7, 7]) {
    const leg = scene.add.graphics().setPosition(x, 10);
    leg.fillStyle(INK).fillRoundedRect(-5, -2, 10, 17, 3);
    leg.fillStyle(0x314653).fillRoundedRect(-4, -2, 8, 11, 2);
    leg.fillStyle(0x101f29).fillRoundedRect(-5, 7, 11, 11, 3);
    leg.fillStyle(0x64736c).fillRoundedRect(-4, 8, 9, 3, 2);
    legs.push(leg);
    root.add(leg);
  }

  if (side === 'right') {
    const hairBack = scene.add.graphics();
    hairBack.fillStyle(0x402f25).fillRoundedRect(-13, -34, 27, 38, 10);
    hairBack.fillStyle(0x654331).fillRoundedRect(-12, -31, 8, 35, 4).fillRoundedRect(7, -30, 7, 34, 4);
    root.add(hairBack);
  }
  const body = scene.add.graphics();
  body.fillStyle(0x101f29).fillRoundedRect(-15, -19, 30, 35, 8);
  body.fillStyle(side === 'left' ? 0x447ca5 : 0xa75a42).fillRoundedRect(-13, -18, 26, 30, 7);
  polygon(body, [-12, -12, -7, -16, -5, 11, -12, 10], side === 'left' ? 0x315a81 : 0x723f35);
  polygon(body, [11, -13, 13, -9, 13, 8, 7, 12, 7, -15], side === 'left' ? 0x284b70 : 0x834733);
  body.fillStyle(accent).fillRect(-9, -13, 4, 20).fillRect(5, -13, 4, 20);
  body.fillStyle(0xd6dbc0).fillRect(-11, 2, 22, 3);
  body.fillStyle(0x4c746f).fillRoundedRect(-3, -8, 6, 8, 1);
  body.fillStyle(0x1b3440).fillRoundedRect(-12, 9, 24, 6, 2);
  body.fillStyle(0xa7b1a0).fillRect(-2, 10, 4, 3);
  root.add(body);

  const arms: Phaser.GameObjects.Container[] = [];
  for (const direction of [-1, 1]) {
    const arm = scene.add.container(direction * 13, -11);
    const art = scene.add.graphics();
    art.fillStyle(0x152e3a).fillRoundedRect(-4, -2, 9, 20, 4);
    art.fillStyle(side === 'left' ? 0x477da2 : 0xb56b50).fillRoundedRect(-3, -3, 7, 16, 3);
    art.fillStyle(accent).fillRect(-3, 7, 7, 3);
    art.fillStyle(0x172b34).fillRoundedRect(-4, 13, 10, 10, 4);
    art.fillStyle(0xc4b697).fillRoundedRect(-3, 12, 8, 8, 3);
    art.fillStyle(0x8c9480).fillRect(-2, 17, 6, 2);
    arm.add(art);
    root.add(arm);
    arms.push(arm);
  }

  const head = scene.add.graphics();
  head.fillStyle(0x142a33).fillCircle(0, -23, 12);
  head.fillStyle(side === 'left' ? 0xc69875 : 0xb17b56).fillRoundedRect(-9, -30, 18, 19, 7);
  head.fillStyle(0xe3b58b).fillRoundedRect(-5, -28, 11, 11, 5);
  head.fillStyle(0x7a5d48).fillRoundedRect(-8, -21, 16, 8, 4);
  head.fillStyle(0xc99d76).fillRoundedRect(-6, -22, 12, 6, 4);
  if (side === 'left') {
    head.fillStyle(0x5c5534).fillRoundedRect(-11, -33, 22, 12, 4);
    head.fillStyle(accent).fillRoundedRect(-9, -37, 18, 12, 3);
    head.fillStyle(0xb99d4e).fillRoundedRect(-14, -27, 29, 4, 2);
    line(head, -6, -35, 6, -35, 0xf1e5bd, 1, 0.7);
  } else {
    head.fillStyle(0x6a4932).fillRoundedRect(-11, -35, 22, 12, 7);
    polygon(head, [-10, -28, -4, -31, -7, -19, -7, -6, -12, -4, -13, -22], 0x755038);
    polygon(head, [4, -32, 11, -28, 12, 2, 7, 0, 7, -22], 0x5c3d2c);
    line(head, -9, -25, -10, -7, 0xa17749, 1, 0.65);
    line(head, 8, -24, 10, -3, 0x9b7146, 1, 0.55);
  }
  head.fillStyle(0x1b3842).fillRect(-7, -23, 5, 2).fillRect(3, -23, 5, 2);
  root.add(head);
  return {
    container: root,
    update(timeMs, moving, active, holding) {
      const stride = moving ? Math.sin(timeMs / 80) : 0;
      legs[0].y = 10 + stride * 3;
      legs[1].y = 10 - stride * 3;
      // Both forearms support the parcel's underside on the belt-facing side.
      // This matches the model's +/-18, -17 carry offset instead of clasping air.
      const carryAngle = side === 'left' ? -0.9 : 0.9;
      arms[0].rotation = holding ? carryAngle : stride * 0.17;
      arms[1].rotation = holding ? carryAngle : -stride * 0.17;
      arms[0].y = holding ? -8 : -11;
      arms[1].y = holding ? -8 : -11;
      ring.setVisible(active);
      sleepy.setVisible(!active);
      root.setAlpha(active ? 1 : 0.6);
      body.y = moving ? -Math.abs(stride) * 0.7 : 0;
      head.y = body.y;
      shadow.scaleX = moving ? 1 - Math.abs(stride) * 0.025 : 1;
    },
  };
}
