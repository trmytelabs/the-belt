import Phaser from 'phaser';

import { colors } from '../config/colors';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { audioSystem } from '../systems/AudioSystem';

export class MesaDreamScene extends Phaser.Scene {
  constructor() {
    super('MesaDreamScene');
  }

  create(data: { returnScene?: string } = {}): void {
    audioSystem.startMusic('results');
    this.cameras.main.setBackgroundColor(0x171124);
    this.drawBedroom();
    this.createDeskSetup();
    this.createMesaBoogie(676, 500);
    this.createSkankyGuitarRig(456, 460);

    this.cameras.main.fadeIn(260, 255, 246, 210);
    this.time.delayedCall(5000, () => {
      this.cameras.main.fadeOut(420, 18, 12, 8);
      this.time.delayedCall(450, () => {
        audioSystem.startMusic('game');
        if (data.returnScene) {
          this.scene.stop();
          this.scene.resume(data.returnScene);
          this.scene.get(data.returnScene).events.emit('mesa-dream-finished');
        } else {
          this.scene.start('GameScene');
        }
      });
    });
  }

  private drawBedroom(): void {
    const wall = this.add.graphics();
    wall.fillStyle(0x211936, 1);
    wall.fillRect(0, 0, GAME_WIDTH, 456);
    wall.fillStyle(0x15101f, 1);
    wall.fillRect(0, 456, GAME_WIDTH, GAME_HEIGHT - 456);
    wall.fillStyle(0x2d203f, 0.8);
    wall.fillRect(0, 420, GAME_WIDTH, 18);
    wall.fillStyle(0x0f0b16, 0.35);
    wall.fillRect(0, 438, GAME_WIDTH, 8);

    for (let x = -40; x < GAME_WIDTH; x += 96) {
      wall.lineStyle(2, 0x2d2540, 0.5);
      wall.beginPath();
      wall.moveTo(x, 456);
      wall.lineTo(x + 80, GAME_HEIGHT);
      wall.strokePath();
    }

    const bed = this.add.graphics();
    bed.fillStyle(0x1b1220, 1);
    bed.fillRoundedRect(54, 408, 220, 118, 10);
    bed.fillStyle(colors.skankyShirt, 0.92);
    bed.fillRoundedRect(70, 386, 190, 74, 12);
    bed.fillStyle(0xead8c4, 1);
    bed.fillRoundedRect(78, 376, 72, 42, 8);
    bed.lineStyle(3, 0x0b0710, 0.45);
    bed.strokeRoundedRect(70, 386, 190, 74, 12);

    this.addPoster(120, 116, 'BULK\nRULES', colors.destYellow);
    this.addPoster(774, 118, 'PAYTMAN\nSUCKS', colors.destOrange);
    this.addPoster(758, 274, 'NO\nREPEATS', colors.warningRed);

    const windowFrame = this.add.graphics();
    windowFrame.fillStyle(0x0d1026, 1);
    windowFrame.fillRoundedRect(364, 74, 230, 118, 8);
    windowFrame.fillStyle(0x182b55, 1);
    windowFrame.fillRect(374, 84, 98, 98);
    windowFrame.fillRect(486, 84, 98, 98);
    windowFrame.lineStyle(4, 0x36284a, 1);
    windowFrame.strokeRoundedRect(364, 74, 230, 118, 8);

    for (const star of [
      [398, 108],
      [442, 148],
      [520, 118],
      [560, 162],
    ]) {
      this.add.circle(star[0], star[1], 2, 0xfff6c8, 0.9);
    }
  }

  private addPoster(x: number, y: number, label: string, color: number): void {
    const poster = this.add.graphics();
    poster.fillStyle(color, 0.86);
    poster.fillRoundedRect(x - 54, y - 42, 108, 84, 6);
    poster.lineStyle(4, colors.black, 0.28);
    poster.strokeRoundedRect(x - 54, y - 42, 108, 84, 6);
    const text = this.add.text(x, y, label, {
      color: '#fff8df',
      fontFamily: 'Arial',
      fontSize: '15px',
      fontStyle: 'bold',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 3,
    });
    text.setOrigin(0.5);
  }

  private createDeskSetup(): void {
    const desk = this.add.graphics();
    desk.fillStyle(0x5a351c, 1);
    desk.fillRoundedRect(318, 386, 286, 34, 8);
    desk.fillStyle(0x2b190d, 1);
    desk.fillRect(344, 420, 18, 118);
    desk.fillRect(560, 420, 18, 118);
    desk.fillStyle(0x7a4f24, 1);
    desk.fillRoundedRect(340, 360, 96, 28, 6);
    desk.fillRoundedRect(486, 360, 86, 28, 6);

    const monitor = this.add.graphics();
    monitor.fillStyle(0x11141d, 1);
    monitor.fillRoundedRect(395, 238, 178, 118, 10);
    monitor.fillStyle(0x213d6b, 1);
    monitor.fillRoundedRect(407, 250, 154, 88, 6);
    monitor.fillStyle(0x7ad7ff, 0.22);
    monitor.fillRoundedRect(416, 260, 74, 14, 4);
    monitor.fillRoundedRect(416, 284, 126, 10, 4);
    monitor.fillRoundedRect(416, 304, 104, 10, 4);
    monitor.fillStyle(0x0b0d13, 1);
    monitor.fillRect(472, 356, 24, 28);
    monitor.fillRoundedRect(442, 380, 84, 12, 5);

    const screenText = this.add.text(484, 323, 'BUILT\nTHE BELT', {
      color: '#fff2bd',
      fontFamily: 'Arial',
      fontSize: '16px',
      fontStyle: 'bold',
      align: 'center',
    });
    screenText.setOrigin(0.5);

    const keyboard = this.add.graphics();
    keyboard.fillStyle(0x16181f, 1);
    keyboard.fillRoundedRect(392, 398, 122, 18, 5);
    keyboard.lineStyle(1, 0x38404d, 0.8);
    for (let x = 402; x < 504; x += 12) {
      keyboard.strokeRect(x, 404, 7, 5);
    }
  }

  private createMesaBoogie(x: number, y: number): void {
    const amp = this.add.container(x, y);
    const body = this.add.rectangle(0, 0, 126, 96, 0x15110d, 1);
    body.setStrokeStyle(4, 0x80603a, 1);
    const grill = this.add.rectangle(0, 14, 104, 48, 0xb99a68, 1);
    grill.setStrokeStyle(2, 0x2c1b10, 0.8);
    const panel = this.add.rectangle(0, -34, 108, 20, 0x302116, 1);
    const handle = this.add.rectangle(0, -56, 56, 8, 0x0d0b08, 1);
    const label = this.add.text(0, -34, 'MESA BOOGIE', {
      color: '#fff4c7',
      fontFamily: 'Arial',
      fontSize: '11px',
      fontStyle: 'bold',
    });
    label.setOrigin(0.5);

    const knobs: Phaser.GameObjects.Arc[] = [];
    for (let index = 0; index < 5; index += 1) {
      knobs.push(this.add.circle(-42 + index * 21, -18, 4, 0xe8d59d, 1));
    }

    amp.add([body, grill, panel, handle, label, ...knobs]);
    amp.setDepth(8);
    this.tweens.add({
      targets: amp,
      scaleX: 1.03,
      scaleY: 0.98,
      duration: 220,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  private createSkankyGuitarRig(x: number, y: number): void {
    const chair = this.add.graphics();
    chair.fillStyle(0x2b2835, 1);
    chair.fillRoundedRect(x - 42, y - 26, 84, 84, 14);
    chair.fillStyle(0x1b1824, 1);
    chair.fillRect(x - 34, y + 44, 12, 78);
    chair.fillRect(x + 22, y + 44, 12, 78);

    const body = this.add.rectangle(x, y + 4, 44, 60, colors.skankyShirt, 1);
    body.setStrokeStyle(2, colors.black, 0.35);
    const head = this.add.rectangle(x, y - 46, 30, 28, colors.skinTone, 1);
    head.setStrokeStyle(2, colors.black, 0.28);
    const hairBack = this.add.rectangle(x, y - 28, 44, 58, colors.skankyHair, 1);
    hairBack.setDepth(7);
    const hairTop = this.add.rectangle(x, y - 66, 40, 16, colors.skankyHair, 1);
    const eyeA = this.add.rectangle(x - 7, y - 50, 3, 3, colors.black, 1);
    const eyeB = this.add.rectangle(x + 7, y - 50, 3, 3, colors.black, 1);
    const grin = this.add.rectangle(x, y - 38, 14, 3, 0x522118, 1);
    const leftLeg = this.add.rectangle(x - 14, y + 60, 12, 48, colors.beltRail, 1);
    const rightLeg = this.add.rectangle(x + 18, y + 60, 12, 48, colors.beltRail, 1);

    const guitarBody = this.add.ellipse(x - 2, y + 18, 86, 58, 0xb34f2c, 1);
    guitarBody.setStrokeStyle(4, 0x3a1b12, 1);
    const guitarHole = this.add.circle(x - 2, y + 18, 13, 0x180e0b, 1);
    const neck = this.add.rectangle(x + 72, y - 2, 116, 12, 0x7a4f24, 1);
    neck.setRotation(Phaser.Math.DegToRad(-13));
    const headstock = this.add.rectangle(x + 134, y - 16, 30, 24, 0x5a351c, 1);
    headstock.setRotation(Phaser.Math.DegToRad(-13));

    const strings = this.add.graphics();
    strings.lineStyle(1, 0xf2dfb8, 0.85);
    for (let offset = -5; offset <= 5; offset += 2) {
      strings.beginPath();
      strings.moveTo(x - 34, y + 18 + offset);
      strings.lineTo(x + 122, y - 11 + offset);
      strings.strokePath();
    }

    const leftArm = this.add.rectangle(x - 38, y + 6, 12, 58, colors.skinTone, 1);
    leftArm.setRotation(Phaser.Math.DegToRad(34));
    const strumArm = this.add.rectangle(x + 26, y + 2, 12, 56, colors.skinTone, 1);
    strumArm.setOrigin(0.5, 0.08);
    strumArm.setRotation(Phaser.Math.DegToRad(-42));

    for (const part of [
      hairBack,
      leftLeg,
      rightLeg,
      body,
      guitarBody,
      guitarHole,
      neck,
      headstock,
      leftArm,
      strumArm,
      head,
      hairTop,
      eyeA,
      eyeB,
      grin,
    ]) {
      part.setDepth(10);
    }
    strings.setDepth(11);

    this.tweens.add({
      targets: strumArm,
      rotation: Phaser.Math.DegToRad(-12),
      duration: 95,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    this.tweens.add({
      targets: strings,
      alpha: 0.35,
      duration: 90,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    this.tweens.add({
      targets: [head, hairTop],
      y: '-=4',
      duration: 260,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }
}
