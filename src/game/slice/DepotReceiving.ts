import Phaser from 'phaser';
import { createParcelArt, updateParcelArt } from './DepotArt';
import { SHIFT_LAYOUT, parcelAddress, type ParcelKind, type ShiftModel } from './ShiftModel';

/** Editable receiving-dock miniatures. No downloaded textures or baked animation. */
export class DepotReceiving {
  public previewArt: Phaser.GameObjects.Container | null = null;
  public previewId: number | null = null;
  public readonly dockhand: Phaser.GameObjects.Container;
  public handContact = { x: 480, y: 127 };
  public readonly semiTrucks: Phaser.GameObjects.Container[] = [];
  public readonly unloaders: Phaser.GameObjects.Container[] = [];
  public readonly stagingCrates: Phaser.GameObjects.Container[] = [];
  public readonly feed: Phaser.GameObjects.Graphics;
  public machineryPhase = 0;
  private readonly scene: Phaser.Scene;
  private readonly model: ShiftModel;
  private readonly pushingArm: Phaser.GameObjects.Graphics;
  private readonly stink: Phaser.GameObjects.Graphics;
  private readonly rollers: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, model: ShiftModel) {
    this.scene = scene;
    this.model = model;
    const floor = scene.add.graphics().setDepth(1);
    floor.fillStyle(0x263b43).fillRect(72, SHIFT_LAYOUT.receivingTop, 816, 330);
    floor.fillStyle(0x1c3039).fillRect(72, -240, 816, 40);
    for (let x = 100; x <= 870; x += 96) {
      floor.lineStyle(1, 0x536265, 0.3).lineBetween(x, -198, x, 90);
    }
    for (let y = -180; y <= 80; y += 64) {
      floor.lineStyle(1, 0x536265, 0.3).lineBetween(76, y, 884, y);
    }
    floor.fillStyle(0x111f27).fillRect(72, -199, 816, 9);
    for (const x of [100, 860]) {
      floor.fillStyle(0x47605f).fillRoundedRect(x - 8, -185, 16, 255, 4);
      floor.fillStyle(0xbda36c).fillRect(x - 8, 28, 16, 28);
      for (let y = 30; y < 56; y += 10) floor.lineStyle(4, 0x24383e).lineBetween(x - 8, y, x + 8, y + 8);
    }
    this.label(480, -216, 'RECEIVING  /  NIGHT FREIGHT', 16, '#d0c9a5');
    this.label(480, -190, 'SEMI BAY 01    •    SEMI BAY 02', 10, '#9aafac');
    this.semiTrucks.push(this.createSemi(250, -130, false), this.createSemi(710, -130, true));

    this.feed = scene.add.graphics().setDepth(6);
    // Dock plates descend into twin roller runs and merge before the real belt.
    for (const direction of [-1, 1]) {
      const rearX = 480 + direction * 110;
      this.feed.fillStyle(0x142831).fillRoundedRect(rearX - 26, -103, 52, 105, 5);
      this.feed.fillStyle(0x536c70).fillRect(rearX - 22, -103, 44, 19);
      this.feed.lineStyle(45, 0x142831).lineBetween(rearX, -3, 480, 70);
      this.feed.lineStyle(32, 0x445d62).lineBetween(rearX, -3, 480, 70);
      for (let y = -78; y <= -9; y += 10) {
        this.feed.fillStyle(0x81918b).fillRoundedRect(rearX - 19, y, 38, 5, 2);
        this.feed.fillStyle(0x243b45).fillRect(rearX - 17, y + 4, 34, 2);
      }
      for (let step = 0; step <= 9; step++) {
        const p = step / 9;
        const x = Phaser.Math.Linear(rearX, 480, p);
        const y = Phaser.Math.Linear(-3, 70, p);
        this.feed.lineStyle(4, 0x8c9a91).lineBetween(x - 10, y - direction * 13, x + 10, y + direction * 13);
      }
    }
    this.feed.fillStyle(0x102630).fillRoundedRect(428, 47, 104, 100, 6);
    this.feed.fillStyle(0x3c565c).fillRect(440, 50, 80, 96);
    for (let y = 51; y < 143; y += 11) {
      this.feed.fillStyle(0x84938c).fillRoundedRect(441, y, 78, 5, 2);
      this.feed.fillStyle(0x203b45).fillRect(443, y + 4, 74, 3);
    }
    for (const x of [428, 523]) {
      this.feed.fillStyle(0x748983).fillRect(x, 50, 9, 79);
      this.feed.fillStyle(0xa4afa1).fillRect(x + 1, 50, 2, 79);
    }
    this.rollers = scene.add.graphics().setDepth(7);
    this.label(604, 86, '↑ RECEIVING', 10, '#b9c6b5');

    // Anonymous crates are upstream staging stock. Only intakePreview becomes
    // playable cargo; its reserved identity carries continuously onto the belt.
    for (let i = 0; i < 2; i++) {
      const unloader = this.createWorker(false, i === 0 ? 0x798da0 : 0x9b8765);
      this.unloaders.push(unloader);
      this.stagingCrates.push(this.createCrate());
    }
    this.dockhand = this.createWorker(true, 0x7d7960);
    this.dockhand.setData('role', 'receiving dockhand').setData('homeless', true);
    this.pushingArm = scene.add.graphics();
    this.stink = scene.add.graphics();
    this.dockhand.add([this.pushingArm, this.stink]);
    this.dockhand.setData('smell', { width: 72, height: 95 });
    const belongings = scene.add.graphics().setDepth(4);
    belongings.fillStyle(0x0b1c25, 0.5).fillEllipse(395, 70, 49, 13);
    belongings.fillStyle(0x695c44).fillRoundedRect(376, 49, 24, 26, 7);
    belongings.lineStyle(3, 0x2f4144).strokeRoundedRect(380, 43, 15, 13, 4);
    belongings.fillStyle(0x8c8570).fillRoundedRect(400, 59, 25, 13, 5);
    belongings.lineStyle(2, 0x5f6254).strokeEllipse(403, 65, 7, 11).lineBetween(416, 59, 416, 72);
    this.update();
  }

  /** Every cycle derives from physical belt travel, including brake/event freezes. */
  update(): void {
    this.machineryPhase = this.model.beltTravel;
    const travel = this.machineryPhase;
    this.rollers.clear().lineStyle(1, 0xc1c7ad, 0.65);
    for (let y = 53; y < 127; y += 11) {
      const angle = travel / 6;
      this.rollers.lineBetween(447, y + 2 + Math.sin(angle), 513, y + 2 + Math.sin(angle));
    }
    this.unloaders.forEach((worker, index) => {
      const direction = index === 0 ? -1 : 1;
      const cycle = ((travel / 185 + index * 0.5) % 1);
      const carrying = cycle < 0.58;
      const p = carrying ? cycle / 0.58 : 1 - (cycle - 0.58) / 0.42;
      // Hands cradle the load throughout the walk from the open trailer.
      worker.setPosition(Phaser.Math.Linear(480 + direction * 139, 480 + direction * 51, p), Phaser.Math.Linear(-78, 35, p));
      worker.setDepth(20 + (worker.y + 100) / 1000);
      worker.setRotation(Math.sin(travel / 11 + index) * 0.025);
      const crate = this.stagingCrates[index];
      if (carrying) crate.setPosition(worker.x - direction * 10, worker.y + 3).setDepth(worker.depth + 0.01);
      else {
        // After the hands release it, the same staging crate rolls into the
        // upstream queue while its unloader walks back for another load.
        const transfer = Math.min(1, (cycle - 0.58) / 0.27);
        crate.setPosition(Phaser.Math.Linear(480 + direction * 41, 480, transfer), Phaser.Math.Linear(38, 90, transfer)).setDepth(22);
      }
      crate.setVisible(cycle < 0.85);
    });

    const preview = this.model.intakePreview;
    if (preview?.id !== this.previewId) {
      this.previewArt?.destroy();
      this.previewArt = preview ? createParcelArt(this.scene, preview.route, preview.size === 'heavy', preview.kind, parcelAddress(preview), preview.label).setDepth(50) : null;
      this.previewId = preview?.id ?? null;
    }
    const y = preview?.y ?? 127;
    const leftEdge = (preview?.x ?? 480) - this.parcelHalfWidth(preview?.kind ?? 'standard', preview?.size === 'heavy');
    this.handContact = { x: leftEdge, y };
    this.dockhand.setPosition(430, y + 12).setDepth(49);
    this.pushingArm.clear();
    this.pushingArm.lineStyle(8, 0x6e7057).lineBetween(9, -20, 20, -10);
    this.pushingArm.lineStyle(6, 0xb79873).lineBetween(20, -10, leftEdge - 430, -12);
    this.pushingArm.fillStyle(0xb79873).fillCircle(leftEdge - 430, -12, 3.5);
    this.dockhand.setData('pushingParcelId', preview?.id ?? null);
    if (preview && this.previewArt) {
      this.previewArt.setPosition(preview.x, preview.y).setData('intakeId', preview.id);
      updateParcelArt(this.previewArt, preview.kind, travel * 15);
    }
    this.drawStink(travel);
  }

  private parcelHalfWidth(kind: ParcelKind, heavy: boolean): number {
    const widths: Partial<Record<ParcelKind, number>> = { envelope: 37, smallbox: 30, bigbox: 48, longbox: 56, mallwood: 52, goji: 34, lobsters: 48, atv: 50, snakes: 58 };
    return (widths[kind] ?? (heavy ? 45 : 34)) / 2;
  }

  private drawStink(travel: number): void {
    const g = this.stink.clear();
    for (let i = 0; i < 4; i++) {
      const x = -23 + i * 13;
      const height = 60 + i * 8;
      g.fillStyle(0x94a865, 0.09).fillEllipse(x, -40 - height / 2, 25, height);
      g.lineStyle(2.4, 0xa3b566, 0.65).beginPath().moveTo(x, -27);
      for (let j = 1; j <= 16; j++) g.lineTo(x + Math.sin(j / 3 + travel / 22 + i) * 7, -27 - j * height / 16);
      g.strokePath();
    }
    for (let i = 0; i < 5; i++) {
      const x = Math.sin(travel / 9 + i * 2) * 34;
      const y = -26 - i * 11 + Math.cos(travel / 13 + i) * 4;
      g.fillStyle(0xb7c5ad, 0.7).fillEllipse(x - 2, y, 3, 2).fillEllipse(x + 2, y, 3, 2);
      g.fillStyle(0x283a2a).fillCircle(x, y + 1, 1.5);
    }
  }

  private label(x: number, y: number, text: string, size: number, color: string): void {
    this.scene.add.text(x, y, text, { fontFamily: 'Arial, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color }).setOrigin(0.5).setDepth(5);
  }

  private createCrate(): Phaser.GameObjects.Container {
    const g = this.scene.add.graphics();
    g.fillStyle(0x604b36).fillRoundedRect(-15, -12, 30, 25, 2);
    g.fillStyle(0xc39f6b).fillRoundedRect(-15, -15, 29, 24, 2);
    g.fillStyle(0xe5c99a).fillRect(-3, -15, 5, 24);
    g.fillStyle(0xd8d1ad).fillRect(4, -10, 8, 7);
    g.lineStyle(1, 0xf2d7a2).lineBetween(-14, -14, 13, -14);
    return this.scene.add.container(0, 0, [g]);
  }

  private createWorker(ragged: boolean, shirt: number): Phaser.GameObjects.Container {
    const g = this.scene.add.graphics();
    g.fillStyle(0x0b1b23, 0.45).fillEllipse(0, 23, 35, 10);
    for (const x of [-6, 6]) {
      g.fillStyle(0x38474a).fillRoundedRect(x - 4, 6, 8, 17, 2);
      g.fillStyle(0x15252b).fillRoundedRect(x - 5, 20, 11, 7, 2);
    }
    g.fillStyle(shirt).fillRoundedRect(-13, -19, 26, 32, 5);
    if (!ragged) {
      g.fillStyle(0xcfb06c).fillRect(-9, -17, 4, 28).fillRect(5, -17, 4, 28);
      g.fillStyle(0xd3d5ad).fillRect(-12, 1, 24, 3);
    } else {
      g.fillStyle(0x4a5749).fillRect(-10, -5, 8, 9).fillRect(5, -14, 6, 8);
      g.lineStyle(1, 0xb6ab7b, 0.6).strokeRect(-10, -5, 8, 9);
      g.fillStyle(0x263934).fillTriangle(-12, 9, -7, 9, -10, 16).fillTriangle(5, 9, 11, 9, 8, 16);
    }
    g.fillStyle(0xb79873).fillRoundedRect(-9, -32, 18, 21, 6);
    g.fillStyle(0x333c37).fillCircle(-3, -23, 1).fillCircle(4, -23, 1);
    if (ragged) {
      g.fillStyle(0x4f4938).fillRoundedRect(-10, -21, 20, 13, 5);
      g.fillStyle(0x2e4848).fillRoundedRect(-11, -37, 22, 12, 5);
      g.fillStyle(0x51625a).fillRect(-12, -29, 24, 5);
      g.fillStyle(0x8e8863).fillCircle(-4, -16, 2).fillCircle(7, -13, 1.6);
      g.lineStyle(1, 0xa69b74).lineBetween(-8, -18, -5, -10).lineBetween(5, -17, 3, -8);
    } else {
      g.fillStyle(0xc9ac66).fillRoundedRect(-12, -36, 24, 10, 4).fillRect(-13, -28, 26, 4);
      g.fillStyle(shirt).fillRoundedRect(-17, -15, 7, 19, 3).fillRoundedRect(10, -15, 7, 19, 3);
      g.fillStyle(0xb79873).fillCircle(-13, 3, 4).fillCircle(13, 3, 4);
    }
    return this.scene.add.container(0, 0, [g]);
  }

  private createSemi(x: number, y: number, mirrored: boolean): Phaser.GameObjects.Container {
    const g = this.scene.add.graphics();
    // Long box trailer, separated fifth wheel, sleeper cab and paired axles.
    g.fillStyle(0x091a22, 0.6).fillRoundedRect(-127, -41, 258, 87, 8);
    for (const axleX of [-93, -68, 65, 86]) {
      g.fillStyle(0x10232c).fillRoundedRect(axleX - 10, -46, 20, 15, 3).fillRoundedRect(axleX - 10, 31, 20, 15, 3);
      g.fillStyle(0x758481).fillCircle(axleX, -39, 4).fillCircle(axleX, 39, 4);
    }
    g.fillStyle(0x324c55).fillRoundedRect(-63, -32, 28, 64, 5);
    g.fillStyle(0x376373).fillRoundedRect(-124, -34, 66, 68, 8);
    g.fillStyle(0x58838a).fillRoundedRect(-124, -33, 35, 66, 6);
    g.fillStyle(0x122e39).fillRoundedRect(-114, -24, 15, 48, 3);
    g.fillStyle(0x91b4ae, 0.45).fillRect(-112, -21, 3, 40);
    g.fillStyle(0x79918b).fillRect(-128, -25, 6, 50);
    g.fillStyle(0xe5c99a).fillRect(-126, -29, 3, 5).fillRect(-126, 24, 3, 5);
    g.fillStyle(0x78877f).fillRoundedRect(-35, -38, 150, 76, 4);
    g.fillStyle(0xc1c5aa).fillRoundedRect(-35, -38, 150, 65, 3);
    g.fillStyle(0xa6b1a1).fillRect(-34, 23, 148, 7);
    for (let px = -26; px < 105; px += 9) g.lineStyle(1, 0x788d82, 0.5).lineBetween(px, -34, px, 24);
    g.fillStyle(0x57726c).fillRect(-31, -5, 140, 11);
    g.fillStyle(0x1d3035).fillRect(107, -32, 13, 62);
    g.fillStyle(0x857454).fillRect(108, -23, 11, 12).fillRect(108, 1, 11, 18);
    // Rear doors swing outwards; the dark opening and load remain visible.
    g.fillStyle(0xacb6a2).fillPoints([{ x: 112, y: -37 }, { x: 129, y: -49 }, { x: 130, y: -20 }, { x: 117, y: -8 }], true);
    g.fillStyle(0x87988e).fillPoints([{ x: 115, y: 9 }, { x: 132, y: 23 }, { x: 130, y: 48 }, { x: 112, y: 37 }], true);
    const root = this.scene.add.container(x, y, [g]).setDepth(5);
    root.setScale(mirrored ? -1 : 1, 1).setData('incomingSemi', true);
    return root;
  }
}
