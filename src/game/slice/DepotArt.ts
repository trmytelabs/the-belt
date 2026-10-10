import Phaser from 'phaser';

/** Editable, resolution-independent artwork for the night shift vertical slice. */
export type DepotRoute = 'A' | 'B' | 'C';
export type DepotSide = 'left' | 'right';

export const DEPOT_ROUTE_COLORS: Record<DepotRoute, number> = {
  A: 0x76cbd1,
  B: 0xa6cc9a,
  C: 0xedba6d,
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
  g.fillStyle(0x463d30).fillRect(x - w / 2, y + h / 2 - 5, w, 11);
  for (let i = 0; i < 5; i++) {
    const sy = y - h / 2 + i * (h / 5);
    g.fillStyle(i % 2 === 0 ? 0x8a7757 : 0x78664d).fillRoundedRect(x - w / 2, sy, w, h / 5 - 3, 1);
    line(g, x - w / 2 + 3, sy + 1, x + w / 2 - 3, sy + 1, 0xb69a6d, 1, 0.45);
    for (const sx of [-w / 2 + 6, w / 2 - 6]) {
      g.fillStyle(0x443e35).fillCircle(x + sx, sy + 4, 1);
    }
  }
}

/** Static depot scenery; only belt treads and the mechanical drive animate. */
export class DepotArt {
  public readonly belt: Phaser.GameObjects.TileSprite;
  private readonly scene: Phaser.Scene;
  private readonly dockHighlights: { route: DepotRoute; side: DepotSide; art: Phaser.GameObjects.Graphics }[] = [];
  private readonly drive: Phaser.GameObjects.Container;
  private readonly statusLight: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.drawFloor();
    this.drawTruck('left');
    this.drawTruck('right');
    this.drawBulk('left');
    this.drawBulk('right');
    this.drawDock('A', 'left', 260, 300);
    this.drawDock('B', 'right', 700, 300);
    this.drawDock('C', 'left', 260, 492);
    this.drawDock('C', 'right', 700, 492);

    const bg = scene.add.graphics().setDepth(6);
    bg.fillStyle(0x07141d, 0.7).fillRoundedRect(419, 141, 125, 480, 9);
    bg.fillStyle(0x152932).fillRoundedRect(428, 139, 104, 478, 8);
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
    this.belt = scene.add.tileSprite(480, 378, 80, 464, textureKey).setDepth(7);

    const rails = scene.add.graphics().setDepth(9);
    for (const x of [428, 523]) {
      rails.fillStyle(0x10252e).fillRoundedRect(x - 2, 145, 14, 464, 3);
      rails.fillStyle(0x617574).fillRoundedRect(x, 145, 9, 461, 2);
      rails.fillStyle(0x9ca99a).fillRect(x + 1, 149, 2, 453);
      rails.fillStyle(0x354d54).fillRect(x + 7, 148, 3, 456);
      for (let y = 173; y < 601; y += 48) {
        rails.fillStyle(0x142a32).fillCircle(x + 4, y + 1, 2.5);
        rails.fillStyle(0xa9b6a9).fillCircle(x + 4, y, 1.5);
      }
    }
    // Rollers cover the ends of the moving surface, keeping tread emergence grounded.
    for (const y of [149, 600]) {
      rails.fillStyle(0x0e222c).fillRoundedRect(437, y - 4, 86, 16, 5);
      rails.fillStyle(0x627b7b).fillRoundedRect(439, y - 3, 82, 10, 4);
      rails.fillStyle(0x8c9a91).fillRect(441, y - 2, 78, 2);
      rails.fillStyle(0x394f56).fillRect(441, y + 5, 78, 3);
      for (let x = 447; x <= 515; x += 12) line(rails, x, y - 2, x, y + 6, 0x344b51, 1, 0.7);
    }
    // Intake hood and cast shadow, deliberately restrained rather than emissive.
    rails.fillStyle(0x06141e, 0.4).fillRect(438, 155, 84, 13);
    polygon(rails, [419, 132, 538, 132, 530, 154, 428, 154], 0x324d54);
    rails.fillStyle(0x516b6b).fillRoundedRect(420, 132, 118, 14, 3);
    line(rails, 424, 134, 534, 134, 0x8f9e91, 2);
    label(scene, 479, 139, 'FEED  /  01', 8, '#c0cec0').setDepth(10);
    rails.fillStyle(0x111f27).fillRoundedRect(453, 607, 56, 11, 3);
    for (let x = 456; x < 505; x += 8) line(rails, x, 609, x + 3, 614, 0x977a49, 3);

    const motor = scene.add.graphics().setDepth(8);
    motor.fillStyle(0x091821, 0.7).fillRoundedRect(532, 545, 31, 50, 5);
    motor.fillStyle(0x476364).fillRoundedRect(532, 540, 24, 43, 4);
    motor.fillStyle(0x6b8380).fillRect(534, 542, 19, 4);
    for (let y = 551; y < 578; y += 5) line(motor, 536, y, 553, y, 0x263e48, 2);
    const driveArt = scene.add.graphics();
    driveArt.fillStyle(0x89988a).fillCircle(0, 0, 7);
    driveArt.fillStyle(0x2c4850).fillCircle(0, 0, 4);
    line(driveArt, -6, 0, 6, 0, 0xb0b6a0, 2);
    this.drive = scene.add.container(541, 585, [driveArt]).setDepth(10);
    this.statusLight = scene.add.circle(541, 549, 2, 0xa6cc9a).setDepth(10);
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

  flashDock(route: DepotRoute, side: DepotSide) {
    const dock = this.dockHighlights.find((d) => d.route === route && d.side === side);
    if (!dock) return;
    const spark = this.scene.add.graphics().setDepth(11);
    const x = side === 'left' ? 260 : 700;
    const y = route === 'C' ? 492 : 300;
    spark.lineStyle(3, DEPOT_ROUTE_COLORS[route], 0.9).strokeRoundedRect(x - 27, y - 33, 54, 66, 6);
    this.scene.tweens.add({ targets: spark, alpha: 0, duration: 450, onComplete: () => spark.destroy() });
  }

  private drawFloor() {
    const scene = this.scene;
    const g = scene.add.graphics().setDepth(0);
    g.fillStyle(0x14262f).fillRect(0, 128, 960, 494);
    g.fillStyle(0x253c43).fillRoundedRect(15, 139, 930, 478, 8);
    g.fillStyle(0x314950).fillRect(230, 150, 190, 456).fillRect(540, 150, 190, 456);
    g.fillStyle(0x2b444b).fillRect(299, 150, 100, 456).fillRect(561, 150, 100, 456);
    // Offset concrete tiles, tiny deterministic aggregate, and expansion joints.
    for (let y = 155; y < 612; y += 76) {
      const row = Math.floor(y / 76);
      line(g, 20, y, 938, y, 0x0e2933, 2, 0.23);
      line(g, 20, y + 2, 938, y + 2, 0x728886, 1, 0.09);
      for (let x = 32 + (row % 2) * 60; x < 944; x += 120) line(g, x, y, x, Math.min(615, y + 76), 0x122c35, 1, 0.27);
    }
    for (let i = 0; i < 650; i++) {
      const x = 24 + ((i * 277 + 31) % 910);
      const y = 156 + ((i * 163 + 37) % 452);
      g.fillStyle(i % 3 === 0 ? 0x091e28 : 0x829387, 0.075).fillRect(x, y, i % 5 === 0 ? 3 : 1, 1);
    }
    // Bays are recessed into darker loading aprons.
    g.fillStyle(0x142e38).fillRoundedRect(24, 209, 201, 186, 5).fillRoundedRect(735, 209, 201, 186, 5);
    for (const x of [221, 737]) {
      g.fillStyle(0x768b83, 0.25).fillRect(x, 199, 2, 367);
      for (let y = 230; y < 581; y += 20) g.fillStyle(0x7d9288, 0.38).fillRect(x - 3, y, 8, 9);
    }
    for (const x of [306, 654]) {
      line(g, x, 188, x, 577, 0x97aaa0, 1, 0.18);
      for (let y = 221; y < 588; y += 53) line(g, x - 3, y, x + 3, y, 0xacc0ac, 1, 0.3);
    }
    // Painted direction arrows remain low contrast behind the actors.
    for (const x of [355, 605]) {
      for (const y of [208, 552]) {
        polygon(g, [x - 7, y + 3, x - 2, y + 3, x - 2, y - 3, x + 2, y - 3, x + 2, y + 3, x + 7, y + 3, x, y + 10], 0xa6b5a1, 0.16);
      }
    }
    // Warm overhead work lights, kept off the central read/play lane.
    for (const x of [105, 855]) {
      polygon(g, [x - 38, 150, x + 38, 150, x + 104, 350, x - 104, 350], 0xd6b87d, 0.035);
      g.fillStyle(0x091c25).fillRoundedRect(x - 46, 143, 92, 17, 5);
      g.fillStyle(0xc4ba91).fillRoundedRect(x - 39, 146, 78, 5, 2);
      g.fillStyle(0xf1de9f).fillRect(x - 34, 147, 68, 2);
    }
    // Wall edge, girders and a narrow drainage channel anchor the miniature.
    g.fillStyle(0x0c202a).fillRect(0, 130, 960, 7).fillRect(0, 613, 960, 9);
    line(g, 16, 138, 944, 138, 0x5a7376, 1, 0.45);
    for (const x of [17, 218, 742, 943]) {
      g.fillStyle(0x102630).fillRect(x - 5, 139, 11, 37);
      g.fillStyle(0x50686b).fillRect(x - 5, 139, 4, 35);
      g.fillStyle(0x0a202a, 0.4).fillRect(x + 6, 141, 9, 34);
    }
    for (let x = 35; x < 941; x += 12) line(g, x, 615, x + 4, 620, 0x53676b, 1, 0.3);
    label(scene, 128, 180, 'DISPATCH  01', 10, '#8caaa7').setDepth(1);
    label(scene, 832, 180, 'DISPATCH  02', 10, '#8caaa7').setDepth(1);
    label(scene, 351, 591, 'WEST WALK', 8, '#6e8a8b').setDepth(1);
    label(scene, 609, 591, 'EAST WALK', 8, '#6e8a8b').setDepth(1);
  }

  private drawTruck(side: DepotSide) {
    const scene = this.scene;
    const reflected = side === 'right';
    const root = scene.add.container(reflected ? 960 : 0, 0).setDepth(3);
    if (reflected) root.setScale(-1, 1);
    const g = scene.add.graphics();
    root.add(g);
    const route = reflected ? 'B' : 'A';
    const accent = DEPOT_ROUTE_COLORS[route];
    g.fillStyle(0x081820, 0.55).fillRoundedRect(35, 239, 190, 139, 10);
    // Rubber tires are visibly separate from the steel body.
    g.fillStyle(0x0a1820).fillRoundedRect(57, 238, 28, 14, 4).fillRoundedRect(57, 351, 28, 14, 4)
      .fillRoundedRect(167, 238, 25, 14, 4).fillRoundedRect(167, 351, 25, 14, 4);
    g.fillStyle(0x344f59).fillRoundedRect(30, 253, 45, 94, 10);
    g.fillStyle(0x4d6a72).fillRoundedRect(31, 252, 35, 88, 8);
    g.fillStyle(0x203b49).fillRoundedRect(35, 264, 22, 62, 5);
    polygon(g, [36, 265, 45, 265, 38, 312, 36, 312], 0x8eafb0, 0.2);
    g.fillStyle(0xa7baa8).fillRoundedRect(29, 260, 4, 14, 2).fillRoundedRect(29, 327, 4, 9, 2);
    g.fillStyle(0x081c26).fillRect(40, 284, 3, 30);
    g.fillStyle(0x547077).fillRoundedRect(65, 230, 147, 133, 5);
    g.fillStyle(0x80918b).fillRoundedRect(67, 226, 141, 127, 4);
    g.fillStyle(0xa5aca0).fillRect(71, 228, 132, 4);
    g.fillStyle(0x738780).fillRect(70, 239, 133, 100);
    for (let x = 80; x < 206; x += 13) {
      line(g, x, 240, x, 338, 0x435e63, 1, 0.55);
      line(g, x + 2, 240, x + 2, 338, 0xa4b09e, 1, 0.35);
    }
    g.fillStyle(accent, 0.74).fillRect(68, 343, 137, 7);
    g.fillStyle(0x233f48).fillRoundedRect(83, 269, 105, 44, 3);
    g.lineStyle(1, 0x95aaa0, 0.45).strokeRoundedRect(83, 269, 105, 44, 3);
    g.fillStyle(0x253e48).fillRect(204, 233, 11, 119);
    g.fillStyle(0x0d252f).fillRect(213, 241, 13, 102);
    g.fillStyle(0x607671).fillRect(217, 244, 6, 96);
    g.fillStyle(0x122b36).fillRoundedRect(223, 246, 9, 93, 2);
    // Stepped steel transfer plate visually touches the sorting bay.
    polygon(g, [228, 260, 243, 268, 243, 326, 228, 334], 0x546963);
    for (let y = 272; y < 327; y += 8) line(g, 231, y, 240, y, 0x8b9983, 1, 0.55);
    g.fillStyle(0xddab6b).fillRect(207, 238, 5, 6).fillRect(207, 338, 5, 6);
    const lx = reflected ? 824 : 136;
    label(scene, lx, 282, route === 'A' ? 'HERES UR' : 'PAYTMAN', 12, '#e0e5ce').setDepth(4);
    label(scene, lx, 300, route === 'A' ? 'SOVICE' : 'EXPRESS', 10, '#a7bbb1').setDepth(4);
    label(scene, reflected ? 835 : 125, 380, 'TRAILER READY', 8, '#6f9290').setDepth(4);
  }

  private drawBulk(side: DepotSide) {
    const x = side === 'left' ? 129 : 831;
    const g = this.scene.add.graphics().setDepth(3);
    g.fillStyle(0x173039).fillRoundedRect(x - 84, 433, 164, 121, 5);
    g.lineStyle(1, 0x62746d, 0.5).strokeRoundedRect(x - 84, 433, 164, 121, 5);
    pallet(g, x + (side === 'left' ? 18 : -18), 503, 105, 61);
    // A restrained three-crate stack: timber frames, nails, metal corner caps.
    const crate = (cx: number, cy: number, w: number, h: number) => {
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
    crate(x + 30, 496, 49, 40);
    crate(x - 17, 495, 39, 43);
    crate(x + 5, 474, 38, 35);
    // Upright hand truck adds a recognizable silhouette without crowding walks.
    const hx = side === 'left' ? x - 62 : x + 62;
    g.lineStyle(5, 0x172731).strokeRoundedRect(hx - 8, 449, 18, 70, 6);
    g.lineStyle(3, 0xb79554).strokeRoundedRect(hx - 8, 445, 16, 65, 6);
    line(g, hx - 6, 493, hx + 6, 493, 0xb79554, 3);
    g.fillStyle(0x081d27).fillCircle(hx - 10, 514, 6).fillCircle(hx + 10, 514, 6);
    g.fillStyle(0x6c7b6b).fillRect(hx - 9, 506, 20, 5);
    label(this.scene, x, 423, 'OVERSIZE / HOLD', 9, '#b7ab86').setDepth(4);
    label(this.scene, x, 570, 'KEEP ACCESS CLEAR', 8, '#6d8888').setDepth(4);
  }

  private drawDock(route: DepotRoute, side: DepotSide, x: number, y: number) {
    const scene = this.scene;
    const color = DEPOT_ROUTE_COLORS[route];
    const g = scene.add.graphics().setDepth(4);
    g.fillStyle(0x152f37, 0.55).fillRoundedRect(x - 27, y - 35, 54, 70, 5);
    g.lineStyle(2, color, 0.52).strokeRoundedRect(x - 27, y - 35, 54, 70, 5);
    const arrow = side === 'left' ? -1 : 1;
    for (const oy of [-25, 24]) {
      line(g, x - 8 * arrow, y + oy - 4, x - 13 * arrow, y + oy, color, 2, 0.55);
      line(g, x - 13 * arrow, y + oy, x - 8 * arrow, y + oy + 4, color, 2, 0.55);
    }
    g.fillStyle(0x18313a).fillRoundedRect(x - 15, y - 16, 30, 32, 4);
    label(scene, x, y - 1, route, 24, `#${color.toString(16).padStart(6, '0')}`).setDepth(5);
    label(scene, x, y + 48, route === 'C' ? 'BULK' : 'LOAD', 8, '#8baba5').setDepth(5);
    const highlight = scene.add.graphics().setDepth(4).setAlpha(0);
    highlight.fillStyle(color, 0.16).fillRoundedRect(x - 26, y - 34, 52, 68, 5);
    highlight.lineStyle(2, color, 0.95).strokeRoundedRect(x - 27, y - 35, 54, 70, 5);
    this.dockHighlights.push({ route, side, art: highlight });
  }
}

/** Origin is the parcel contact center. No idle motion is baked into its art. */
export function createParcelArt(scene: Phaser.Scene, route: DepotRoute, heavy = false): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const w = heavy ? 45 : 34;
  const h = heavy ? 37 : 30;
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
  if (heavy) {
    g.fillStyle(0x4b594f).fillRect(l + 5, t + 1, 3, h - 2).fillRect(r - 8, t + 1, 3, h - 2);
    g.fillStyle(0x819180).fillRect(l + 5, t + 1, 1, h - 8).fillRect(r - 8, t + 1, 1, h - 8);
  }
  g.fillStyle(0x6e5840, 0.4).fillRoundedRect(l + 5, t + 6, 17, 16, 1);
  g.fillStyle(DEPOT_ROUTE_COLORS[route]).fillRoundedRect(l + 4, t + 5, 17, 16, 1);
  for (let x = l + 25; x < r - 3; x += 2) line(g, x, b - 13, x, b - 8, 0x5a5844, 1, 0.8);
  const letter = label(scene, l + 12.5, t + 13, route, 12, '#19383b');
  root.add([g, letter]);
  return root;
}

export interface DepotWorkerArt {
  container: Phaser.GameObjects.Container;
  update(timeMs: number, moving: boolean, active: boolean, holding: boolean): void;
}

/** Illustrated workers with independently articulated arms and boots. */
export function createWorkerArt(scene: Phaser.Scene, side: DepotSide): DepotWorkerArt {
  const root = scene.add.container(0, 0);
  const accent = side === 'left' ? 0x9dcdbb : 0xe0b477;
  const shadow = scene.add.ellipse(0, 24, 36, 13, 0x06141e, 0.48);
  const ring = scene.add.ellipse(0, 24, 43, 18).setStrokeStyle(2, 0xdbedc7, 0.75);
  root.add([shadow, ring]);

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

  const body = scene.add.graphics();
  body.fillStyle(0x101f29).fillRoundedRect(-15, -19, 30, 35, 8);
  body.fillStyle(0x3e6771).fillRoundedRect(-13, -18, 26, 30, 7);
  polygon(body, [-12, -12, -7, -16, -5, 11, -12, 10], 0x254854);
  polygon(body, [11, -13, 13, -9, 13, 8, 7, 12, 7, -15], 0x28434f);
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
    art.fillStyle(0x4b7680).fillRoundedRect(-3, -3, 7, 16, 3);
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
  head.fillStyle(0x112e38).fillRoundedRect(-10, -33, 20, 12, 5);
  head.fillStyle(accent).fillRoundedRect(-10, -34, 20, 9, 5);
  head.fillStyle(side === 'left' ? 0x60978f : 0xae824e).fillRoundedRect(-10, -27, 22, 5, 2);
  line(head, -6, -33, 6, -33, 0xf1e5bd, 1, 0.6);
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
      body.y = moving ? -Math.abs(stride) * 0.7 : 0;
      head.y = body.y;
      shadow.scaleX = moving ? 1 - Math.abs(stride) * 0.025 : 1;
    },
  };
}
