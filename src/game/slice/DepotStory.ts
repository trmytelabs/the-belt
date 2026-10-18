import Phaser from 'phaser';

import { createColleagueArt } from './DepotCastArt';
import { createWorkerArt, type DepotWorkerArt } from './DepotArt';
import type { DepotCamera } from './DepotCamera';
import { LOT_LAYOUT, MALL_LAYOUT, MALL_RULES, type KeyReturnModel, type MallModel } from './MallModel';
import type { Cutscene } from './StoryModel';
import { SPEAKER_NAMES, type StoryBeat, type StoryScene } from './StoryScript';

/**
 * The story chapters in the 2D depot, drawn top-down in screen space over the
 * world view: the UPS lot, the break stops, the road, the mall and home.
 * Staging is a function of cue progress, so a skipped scene lands on its
 * final layout. The scrum and the mall assignment are staged on the depot
 * floor itself by DepotLife.
 */
const INK = '#edf0de';
const FONT = 'Arial, sans-serif';
const VIEW = { x: 0, y: 126, w: 960, h: 494 };
const ease = (t: number): number => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number): number => a + (b - a) * Math.max(0, Math.min(1, t));

export function cueProgress(cutscene: Cutscene, cue: string): number {
  const index = cutscene.scene.beats.findIndex((beat) => beat.cue === cue);
  if (index < 0) return 0;
  if (cutscene.done || cutscene.index > index) return 1;
  if (cutscene.index < index) return 0;
  return cutscene.progress;
}

type Actor = { art: Phaser.GameObjects.Container; worker?: DepotWorkerArt };
const mallX = (x: number): number => 130 + x * 0.6;
const mallY = (y: number): number => 133 + y * 0.6;
const lotX = (x: number): number => 120 + x * 0.75;
const lotY = (y: number): number => 150 + y * 0.75;

export class DepotStoryView {
  /** Every spoken story line, as SPEAKER: line, for the checks. */
  public readonly history: string[] = [];
  public readonly subtitles: string[] = [];
  public active: string | null = null;
  private readonly scene: Phaser.Scene;
  private readonly view: DepotCamera;
  private readonly reducedMotion: boolean;
  private stage: Phaser.GameObjects.Container | null = null;
  private props: Record<string, Phaser.GameObjects.GameObject & { x: number; y: number }> = {};
  private actors = new Map<string, Actor>();
  private chrome: Phaser.GameObjects.Container | null = null;
  private subtitleText: Phaser.GameObjects.Text | null = null;
  private directionText: Phaser.GameObjects.Text | null = null;
  private titleText: Phaser.GameObjects.Text | null = null;
  private clockText: Phaser.GameObjects.Text | null = null;
  private hudText: Phaser.GameObjects.Text | null = null;
  private objectiveText: Phaser.GameObjects.Text | null = null;
  private dynamic: Phaser.GameObjects.Graphics | null = null;
  private storeLabels = new Map<string, string>();
  private roadTravel = 0;
  private speechBubble: Phaser.GameObjects.Text | null = null;

  constructor(scene: Phaser.Scene, view: DepotCamera, reducedMotion: boolean) {
    this.scene = scene;
    this.view = view;
    this.reducedMotion = reducedMotion;
  }

  /** Removes everything this view drew. */
  public clear(): void {
    this.stage?.destroy(true);
    this.chrome?.destroy(true);
    this.stage = null;
    this.chrome = null;
    this.props = {};
    this.actors.clear();
    this.storeLabels.clear();
    this.subtitleText = this.directionText = this.titleText = this.clockText = this.hudText = this.objectiveText = null;
    this.dynamic = null;
    this.active = null;
    this.speechBubble = null;
  }

  private text(x: number, y: number, copy: string, size: number, color = INK, bold = true): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, copy, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color });
  }

  private screen<T extends Phaser.GameObjects.GameObject>(object: T): T {
    return this.view.screen(object);
  }

  /** The bars above and below the vignette: title, clock, subtitles or the chapter HUD, controls. */
  private buildChrome(mode: 'story' | 'chapter', onNext: () => void, onSkip: () => void): void {
    this.chrome?.destroy(true);
    const g = this.scene.add.graphics();
    g.fillStyle(0x10232a).fillRect(0, 0, 960, 126).fillRect(0, 620, 960, 100);
    g.fillStyle(0xedba6d).fillRect(28, 27, 5, 43);
    g.fillStyle(0x27424a).fillRect(0, 125, 960, 2).fillRect(0, 620, 960, 2);
    this.titleText = this.text(46, 24, '', 28);
    this.clockText = this.text(932, 34, '', 18, '#edba6d').setOrigin(1, 0);
    const items: Phaser.GameObjects.GameObject[] = [g, this.titleText, this.clockText];
    if (mode === 'story') {
      this.subtitleText = this.text(480, 640, '', 15, '#f3e6c6').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(760);
      this.directionText = this.text(480, 682, '', 12, '#b9cccc', false).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(760).setFontStyle('italic');
      const next = this.text(28, 96, '[ SPACE ] NEXT', 12, '#c0d2cf').setInteractive({ useHandCursor: true });
      const skip = this.text(170, 96, '[ ENTER ] SKIP SCENE', 12, '#edba6d').setInteractive({ useHandCursor: true });
      next.on('pointerdown', onNext);
      skip.on('pointerdown', onSkip);
      next.setData('story', 'next');
      skip.setData('story', 'skip');
      items.push(this.subtitleText, this.directionText, next, skip);
    } else {
      this.hudText = this.text(28, 636, '', 15, INK);
      this.objectiveText = this.text(28, 664, '', 13, '#edba6d', false).setWordWrapWidth(900);
      items.push(this.hudText, this.objectiveText, this.text(28, 700, '', 10, '#8da7ac', false).setData('keys', true));
    }
    this.chrome = this.screen(this.scene.add.container(0, 0, items).setDepth(95));
  }

  private keysText(copy: string): void {
    const keys = this.chrome?.list.find((item) => item.getData('keys')) as Phaser.GameObjects.Text | undefined;
    keys?.setText(copy);
  }

  public setTitle(title: string, clock = ''): void {
    this.titleText?.setText(title);
    this.clockText?.setText(clock);
  }

  /** A beat's line with its speaker, plus any stage direction and sound caption. */
  public showBeat(beat: StoryBeat): void {
    this.speechBubble?.destroy();
    this.speechBubble = null;
    const speaker = beat.speaker ? SPEAKER_NAMES[beat.speaker] : '';
    this.subtitleText?.setText(beat.line ? `${speaker}:  ${beat.line}` : '');
    const extra = [beat.caption, beat.direction].filter(Boolean).join(' ');
    this.directionText?.setText(extra);
    if (beat.line) this.history.push(`${speaker}: ${beat.line}`);
    if (extra) this.subtitles.push(extra);
    const actor = beat.speaker ? this.actors.get(beat.speaker) : undefined;
    if (actor && beat.line) {
      this.speechBubble = this.screen(this.text(actor.art.x, actor.art.y - 44, beat.line, 11, '#19313a')
        .setOrigin(0.5, 1).setBackgroundColor('#f0dfb3').setPadding(6, 4).setDepth(94).setWordWrapWidth(220).setAlign('center'));
      // Own the bubble with the current scene: skipping destroys it immediately,
      // while pausing keeps the current line visible for its full story beat.
      this.stage?.add(this.speechBubble);
    }
  }

  // ------------------------------------------------------------------ vignettes

  public beginScene(scene: StoryScene, onNext: () => void, onSkip: () => void): void {
    this.clear();
    this.active = scene.id;
    this.buildChrome('story', onNext, onSkip);
    this.setTitle(scene.title, scene.clock ?? '');
    const g = this.scene.add.graphics();
    this.stage = this.scene.add.container(0, 0, [g]).setDepth(90);
    const location = scene.location === 'home' ? 'lot' : scene.location;
    if (location === 'lot') this.drawLot(g, scene.id === 'go-home' ? 0.8 : 0);
    else if (location === 'store') this.drawStore(g);
    else if (location === 'coffee') this.drawCoffee(g);
    else if (location === 'road') this.drawRoad(g, scene.id === 'drive-to-ups');
    else if (location === 'mall') this.drawMall(g);
    this.dynamic = this.scene.add.graphics();
    this.stage.add(this.dynamic);
    this.screen(this.stage);
    this.roadTravel = 0;
  }

  private addActor(id: string, x: number, y: number, scale = 0.8): Actor {
    let actor = this.actors.get(id);
    if (!actor) {
      if (id === 'termite' || id === 'skanky') {
        const worker = createWorkerArt(this.scene, id === 'termite' ? 'left' : 'right');
        const tag = this.text(0, 32, id.toUpperCase(), 10, '#d0d3b9').setOrigin(0.5).setStroke('#142b34', 3);
        worker.container.add(tag);
        actor = { art: worker.container, worker };
      } else {
        const art = createColleagueArt(this.scene, id === 'cashier' || id === 'clerk' ? 'vic' : id);
        art.add(this.text(0, 39, SPEAKER_NAMES[id as keyof typeof SPEAKER_NAMES] ?? id.toUpperCase(), 10, '#d0d3b9').setOrigin(0.5).setStroke('#142b34', 3));
        actor = { art };
      }
      actor.art.setScale(scale);
      this.stage!.add(actor.art);
      this.screen(actor.art);
      this.actors.set(id, actor);
    }
    actor.art.setPosition(x, y).setVisible(true);
    actor.worker?.update(this.reducedMotion ? 0 : this.scene.time.now, false, true, false);
    return actor;
  }

  private car(name: string, color: number): Phaser.GameObjects.Container {
    let car = this.props[name] as Phaser.GameObjects.Container | undefined;
    if (!car) {
      const g = this.scene.add.graphics();
      g.fillStyle(0x071820, 0.5).fillRoundedRect(-36, -16, 76, 36, 8);
      g.fillStyle(color).fillRoundedRect(-38, -18, 76, 36, 8);
      g.fillStyle(0x1b2a32).fillRoundedRect(-10, -14, 26, 28, 5);
      g.fillStyle(0x9cc8dc, 0.5).fillRect(14, -12, 6, 24);
      g.fillStyle(0xfff0c0).fillRect(34, -14, 4, 6).fillRect(34, 8, 4, 6);
      g.fillStyle(0xd02020).fillRect(-38, -14, 3, 6).fillRect(-38, 8, 3, 6);
      car = this.scene.add.container(0, 0, [g]);
      this.stage!.add(car);
      this.screen(car);
      this.props[name] = car;
    }
    return car;
  }

  private drawLot(g: Phaser.GameObjects.Graphics, dawn: number): void {
    g.fillStyle(0x1e2427).fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    g.fillStyle(0x2c3438).fillRect(40, 130, 880, 70);
    for (const x of [140, 260, 380]) g.fillStyle(0x10181c).fillRect(x, 160, 90, 40);
    g.fillStyle(0xd7b267).fillRect(740, 150, 40, 50);
    g.fillStyle(0x8a2a22).fillRect(820, 168, 22, 26);
    g.lineStyle(2, 0xd8d8c8, 0.6);
    for (let x = 120; x <= 860; x += 60) g.lineBetween(x, 236, x, 300);
    g.fillStyle(0x23292c).fillRect(0, 430, 960, 130);
    g.lineStyle(3, 0xe0b23c, 0.8);
    for (let x = 0; x < 960; x += 50) g.lineBetween(x, 500, x + 28, 500);
    g.lineStyle(3, 0x8a949a, 0.9).lineBetween(40, 404, 420, 404).lineBetween(540, 404, 920, 404);
    for (let x = 40; x <= 920; x += 40) if (x < 420 || x > 540) g.fillStyle(0x8a949a).fillCircle(x, 404, 3);
    if (dawn > 0) g.fillStyle(0xd89a70, 0.12 * dawn).fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    const stage = this.stage!;
    stage.add([
      this.text(300, 142, 'UPS · DEPOT 07', 16, '#e8c060'),
      this.text(760, 205, 'DISPATCH', 9, '#d9ccab').setOrigin(0.5, 0),
      this.text(831, 205, 'KEY DROP', 9, '#f2c14e').setOrigin(0.5, 0),
      this.text(240, 410, 'NO ENTRY · STAFF ONLY', 9, '#f3987c'),
    ]);
    const gate = this.scene.add.graphics();
    gate.lineStyle(4, 0xb7c0c4).strokeRect(-60, -6, 120, 12);
    gate.lineStyle(1, 0xb7c0c4, 0.6);
    for (let x = -56; x < 60; x += 8) gate.lineBetween(x, -6, x + 6, 6);
    const lock = this.scene.add.circle(-56, 0, 4, 0xe0b23c);
    const gateBox = this.scene.add.container(480, 404, [gate, lock]);
    stage.add(gateBox);
    this.props.gate = gateBox;
    this.props.lock = lock;
  }

  private drawStore(g: Phaser.GameObjects.Graphics): void {
    for (let y = VIEW.y; y < VIEW.y + VIEW.h; y += 32) {
      for (let x = 0; x < 960; x += 32) g.fillStyle((x + y) / 32 % 2 ? 0xd8d8d0 : 0xb8bcb4).fillRect(x, y, 32, 32);
    }
    g.fillStyle(0xe8e4d8).fillRect(0, 126, 960, 40);
    g.fillStyle(0xe8702a).fillRect(0, 166, 960, 5).fillStyle(0x2e8b57).fillRect(0, 171, 960, 5).fillStyle(0xc8302a).fillRect(0, 176, 960, 5);
    const colors = [0xe03030, 0xf0c030, 0x3070e0, 0x30a050, 0xe07020, 0xa040c0];
    for (const sx of [120, 380, 640]) {
      g.fillStyle(0x9aa0a4).fillRect(sx, 190, 200, 34);
      for (let i = 0; i < 10; i += 1) g.fillStyle(colors[(i + sx) % colors.length]).fillRect(sx + 4 + i * 19, 196, 15, 22);
    }
    g.fillStyle(0x6a4a3a).fillRoundedRect(240, 300, 480, 44, 5);
    g.fillStyle(0x222428).fillRect(560, 304, 34, 20);
    g.fillStyle(0x40ff90, 0.8).fillRect(564, 307, 26, 10);
    for (let i = 0; i < 8; i += 1) g.fillStyle(colors[i % colors.length]).fillRoundedRect(420 + (i % 4) * 22, 306 + Math.floor(i / 4) * 16, 18, 13, 3);
    this.stage!.add(this.text(480, 132, '7-ELEVEN', 22, '#2e8b57').setOrigin(0.5, 0).setBackgroundColor('#ffffff').setPadding(10, 2));
    const bag = this.scene.add.container(380, 318);
    const bagArt = this.scene.add.graphics();
    bagArt.fillStyle(0xb89868).fillRect(-10, -8, 20, 18);
    for (const [x, y, c] of [[-5, -10, 0xc02020], [3, -11, 0x60b030], [8, -7, 0xc02020]] as const) bagArt.fillStyle(c).fillCircle(x, y, 5);
    bag.add(bagArt);
    const bars = this.scene.add.graphics();
    bars.fillStyle(0x5a3018).fillRect(-12, -4, 24, 8).fillRect(-12, -10, 24, 6);
    const barStack = this.scene.add.container(500, 320, [bars]);
    const extra = this.scene.add.graphics();
    extra.fillStyle(0x7a2810).fillRect(-12, -3, 24, 6);
    const extraBar = this.scene.add.container(700, 210, [extra]);
    this.stage!.add([bag, barStack, extraBar]);
    this.props.apples = bag;
    this.props.extraBar = extraBar;
  }

  private drawCoffee(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x262c30).fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    g.fillStyle(0x5a3a2a).fillRect(80, 126, 800, 110);
    g.fillStyle(0xffd8a0).fillRect(120, 200, 720, 30);
    this.stage!.add(this.text(480, 140, 'TIM HORTONS', 26, '#b0221c').setOrigin(0.5, 0).setBackgroundColor('#f4efe6').setPadding(12, 2));
    const car = this.car('car', 0x8f3f34);
    car.setPosition(480, 380).setScale(1.6);
    const tray = this.scene.add.graphics();
    tray.fillStyle(0xa88a60).fillRect(-12, -12, 24, 24);
    for (const [x, y] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) tray.fillStyle(0xb0221c).fillCircle(x, y, 5);
    const box = this.scene.add.graphics();
    this.props.tray = this.scene.add.container(540, 368, [tray]);
    this.props.box = this.scene.add.container(545, 398, [box]);
    this.props.boxArt = box;
    const cup = this.scene.add.graphics();
    cup.fillStyle(0xb0221c).fillCircle(0, 0, 6).fillStyle(0xf4efe6).fillCircle(0, 0, 3);
    this.props.cup = this.scene.add.container(600, 420, [cup]);
    this.stage!.add([this.props.tray as Phaser.GameObjects.Container, this.props.box as Phaser.GameObjects.Container, this.props.cup as Phaser.GameObjects.Container]);
  }

  private drawRoad(g: Phaser.GameObjects.Graphics, dawn: boolean): void {
    g.fillStyle(dawn ? 0x3a4458 : 0x1a2420).fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    g.fillStyle(0x26292b).fillRect(0, 300, 960, 140);
    g.lineStyle(2, 0xd8d8c8, 0.6).lineBetween(0, 304, 960, 304).lineBetween(0, 436, 960, 436);
    const truck = this.scene.add.graphics();
    truck.fillStyle(0x071820, 0.5).fillRoundedRect(-66, -22, 140, 50, 6);
    truck.fillStyle(0x5a4632).fillRoundedRect(-70, -26, 104, 52, 4);
    truck.fillStyle(0x4a3a2a).fillRoundedRect(36, -22, 34, 44, 6);
    truck.fillStyle(0x9cc8dc, 0.6).fillRect(62, -16, 6, 32);
    const label = this.text(-18, 0, '5 TON', 14, '#e8dcc0').setOrigin(0.5);
    this.props.truck = this.scene.add.container(400, 372, [truck, label]);
    this.stage!.add(this.props.truck as Phaser.GameObjects.Container);
  }

  private drawMall(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x101820).fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    for (const rect of MALL_LAYOUT.walk) g.fillStyle(0xd9d1c2).fillRect(mallX(rect.x), mallY(rect.y), rect.w * 0.6, rect.h * 0.6);
    MALL_LAYOUT.doors.forEach((door, index) => {
      const north = door.side === 'north';
      const top = north ? door.y - 200 : door.y;
      g.fillStyle([0x5a4a3a, 0x3a4a5a, 0x5a3a4a][index % 3]).fillRect(mallX(door.x - 148), mallY(top), 296 * 0.6, 200 * 0.6);
      g.lineStyle(2, 0x9cc8dc, 0.8).lineBetween(mallX(door.x - 150), mallY(door.y), mallX(door.x - 56), mallY(door.y))
        .lineBetween(mallX(door.x + 56), mallY(door.y), mallX(door.x + 150), mallY(door.y));
    });
    // The concourse's darker centre runner, as in the 3D mall.
    g.fillStyle(0x9c9284).fillRect(mallX(280), mallY(340), 980 * 0.6, 120 * 0.6);
    for (const rect of MALL_LAYOUT.obstacles) {
      const [x, y, w, h] = [mallX(rect.x), mallY(rect.y), rect.w * 0.6, rect.h * 0.6];
      if (rect.label === 'ATRIUM') {
        // The railed opening over the lower level's bleacher seating.
        g.fillStyle(0x1c2226).fillRect(x, y, w, h);
        for (let step = 0; step < 6; step += 1) g.fillStyle(step % 2 ? 0x8a6440 : 0xa47a50).fillRect(x + 4, y + 4 + step * (h - 8) / 7, w - 8, (h - 8) / 7 - 1);
        g.lineStyle(2, 0xc8d4dc).strokeRect(x, y, w, h);
      } else if (rect.label === 'BENCH') {
        g.fillStyle(0x7a5a3a).fillRoundedRect(x, y, w, h, 4);
        g.fillStyle(0x2c3a44).fillRect(x + w / 2 - 6, y + 4, 12, h - 8);
      } else {
        g.fillStyle(0xb9ab95).fillRoundedRect(x, y, w, h, 4);
        g.fillStyle(0x3a7a3a).fillRoundedRect(x + 4, y + 4, w - 8, h - 8, 4);
      }
    }
    const truck = MALL_LAYOUT.truck;
    g.fillStyle(0x5a4632).fillRect(mallX(truck.x), mallY(truck.y), truck.w * 0.6, truck.h * 0.6);
    g.fillStyle(0x161c1f).fillRect(mallX(truck.x + 30), mallY(truck.y + 14), (truck.w - 40) * 0.6, (truck.h - 28) * 0.6);
    this.stage!.add([
      this.text(mallX(-100), mallY(truck.y) - 14, '5 TON', 11, '#e8dcc0').setOrigin(0.5),
      this.text(mallX(150), mallY(300) + 4, 'LOADING DOCK', 9, '#e8c04a').setOrigin(0.5, 0),
    ]);
  }

  /** Stages a non-depot cutscene from its cue progress. */
  public direct(cutscene: Cutscene, delta: number): void {
    if (!this.stage) return;
    const id = cutscene.scene.id;
    const time = this.reducedMotion ? 0 : this.scene.time.now;
    for (const actor of this.actors.values()) actor.art.setVisible(false);
    if (id.startsWith('opener')) this.directOpener(cutscene, id);
    else if (id.startsWith('7eleven')) this.directStore(cutscene, id);
    else if (id.startsWith('timhortons')) this.directCoffee(cutscene, id);
    else if (id === 'drive-to-mall' || id === 'drive-to-ups') {
      const speed = 220 * Math.min(1, cueProgress(cutscene, 'depart') * 1.5) * (1 - cueProgress(cutscene, 'arrive'));
      this.roadTravel += speed * delta / 1000;
      const g = this.dynamic!;
      g.clear();
      for (let x = -(this.roadTravel % 60); x < 960; x += 60) g.fillStyle(0xe0b23c).fillRect(x, 368, 30, 4);
      for (let x = -(this.roadTravel * 0.6 % 160); x < 960; x += 160) g.fillStyle(0xffb050, 0.8).fillCircle(x, 286, 5).fillCircle(x + 80, 452, 5);
      (this.props.truck as Phaser.GameObjects.Container).y = 372 + (this.reducedMotion ? 0 : Math.sin(time / 90) * 1);
    } else if (id === 'go-home') this.directHome(cutscene);
    else if (id === 'mall-intro') this.addActor('skanky', mallX(150), mallY(420), 0.7);
  }

  private directOpener(cutscene: Cutscene, id: string): void {
    const gate = this.props.gate as Phaser.GameObjects.Container;
    const lock = this.props.lock as unknown as Phaser.GameObjects.Arc;
    if (id === 'opener-2') {
      gate.x = 600;
      lock.setVisible(false);
      [180, 300, 600, 720, 840].forEach((x, index) => this.car(`park-${index}`, [0x4a5560, 0x7a7a70, 0x2e4a5a, 0x5a3030, 0x6a6a7a][index]).setPosition(x, 268).setRotation(-Math.PI / 2));
      const park = ease(cueProgress(cutscene, 'pair-park'));
      const car = this.car('car-skanky', 0x8f3f34);
      if (park < 0.5) car.setPosition(mix(-60, 480, park * 2), mix(500, 470, park * 2)).setRotation(mix(0, -Math.PI / 2, park * 2));
      else car.setPosition(mix(480, 450, park * 2 - 1), mix(470, 272, park * 2 - 1)).setRotation(-Math.PI / 2 + 0.45 * (park * 2 - 1));
      const run = ease(cueProgress(cutscene, 'pair-run'));
      const inside = ease(cueProgress(cutscene, 'walk-in'));
      if (run > 0) {
        this.addActor('skanky', mix(440, 742, run), mix(300, 214, run)).art.setAlpha(1 - inside);
        this.addActor('termite', mix(470, 772, run), mix(300, 222, run)).art.setAlpha(1 - inside);
      }
      if (cueProgress(cutscene, 'vic-at-door') > 0) this.addActor('vic', 800, 212);
      return;
    }
    const open = ease(cueProgress(cutscene, 'gate-open'));
    gate.x = 480 + 120 * open;
    lock.setVisible(open < 0.2);
    const drive = ease(cueProgress(cutscene, 'walk-in'));
    const queue: [string, string, number, number, number][] = id === 'opener-3'
      ? [['car-skanky', 'skanky', 480, 470, 0x8f3f34], ['car-brian', 'brian', 360, 486, 0x6d5534], ['car-fruitloop', 'fruitloop', 600, 486, 0x5fae4e], ['car-doris', 'doris', 240, 492, 0x7d4d9c]]
      : [['car-skanky', 'skanky', 480, 470, 0x8f3f34], ['car-doris', 'doris', 360, 486, 0x7d4d9c], ['car-hussan', 'hussan', 600, 486, 0x3f78a8]];
    queue.forEach(([name, driver, x, y, color], index) => {
      const go = Math.max(0, Math.min(1, drive * 1.6 - index * 0.25));
      const car = this.car(name, color).setPosition(mix(x, 300 + index * 120, go), mix(y, 268, go)).setRotation(-Math.PI / 2);
      this.addActor(driver, car.x, car.y - 4, 0.55);
      if (name === 'car-skanky') this.addActor('termite', car.x + 14, car.y + 6, 0.55);
    });
    const arrive = ease(cueProgress(cutscene, 'shan-arrives'));
    this.car('car-shan', 0xd8d4c8).setPosition(mix(1020, 700, arrive), 520).setRotation(Math.PI).setVisible(arrive > 0);
    const walk = ease(cueProgress(cutscene, 'shan-at-gate'));
    if (walk > 0) this.addActor('shan', mix(700, 470, walk) + mix(0, 40, drive), mix(500, 420, walk) - mix(0, 130, drive));
  }

  private directStore(cutscene: Cutscene, id: string): void {
    this.addActor('cashier', 600, 276);
    this.addActor('doris', 600, 392);
    this.addActor('brian', 670, 400);
    if (id === '7eleven-2') this.addActor('bannerman', 300, 392);
    this.addActor('skanky', 500, 392);
    const leave = ease(cueProgress(cutscene, 'leave'));
    const termite = this.addActor('termite', mix(400, 360, leave), mix(392, id === '7eleven-1' ? 560 : 520, leave));
    const bag = cueProgress(cutscene, 'termite-bag') > 0 || leave > 0;
    const apples = this.props.apples as Phaser.GameObjects.Container;
    apples.setPosition(bag ? termite.art.x + 16 : 380, bag ? termite.art.y - 6 : 318);
    const chocolate = ease(cueProgress(cutscene, 'skanky-chocolate'));
    (this.props.extraBar as Phaser.GameObjects.Container).setPosition(mix(700, 500, chocolate), mix(210, 312, chocolate));
  }

  private directCoffee(cutscene: Cutscene, id: string): void {
    const g = this.dynamic!;
    g.clear();
    const boxArt = this.props.boxArt as Phaser.GameObjects.Graphics;
    boxArt.clear();
    const open = id === 'timhortons-2' || (cueProgress(cutscene, 'donut-box') > 0 && cueProgress(cutscene, 'donut-box') < 0.8);
    boxArt.fillStyle(0xf4efe6).fillRect(-18, -12, 36, 24);
    if (open) {
      for (let i = 0; i < 12; i += 1) {
        if (id === 'timhortons-2' && i === 11) continue;
        boxArt.fillStyle(i === 4 ? 0x7a4a2a : 0xc08040).fillCircle(-13 + (i % 4) * 9, -6 + Math.floor(i / 4) * 6, 3);
      }
      if (id === 'timhortons-1') boxArt.fillStyle(0xf4efe6).fillCircle(-11, 1, 2);
    } else boxArt.lineStyle(1, 0xc8c0b0).strokeRect(-18, -12, 36, 24);
    (this.props.tray as Phaser.GameObjects.Container).setVisible(id === 'timhortons-1');
    if (id === 'timhortons-2') {
      // Everyone is in the car; the box is on Skanky's lap.
      this.addActor('skanky', 500, 360, 0.6);
      this.addActor('termite', 500, 404, 0.6);
      this.addActor('doris', 440, 360, 0.6);
      this.addActor('brian', 440, 404, 0.6);
      (this.props.box as Phaser.GameObjects.Container).setPosition(520, 370);
      if (cueProgress(cutscene, 'back-seat') > 0 && !this.reducedMotion) g.fillStyle(0xc08040).fillCircle(452 + Math.sin(this.scene.time.now / 60) * 4, 392, 2);
      (this.props.cup as Phaser.GameObjects.Container).setVisible(false);
      return;
    }
    (this.props.box as Phaser.GameObjects.Container).setPosition(545, 398);
    this.addActor('termite', 620, 380);
    this.addActor('skanky', 640, 440);
    this.addActor('doris', 600, 316);
    this.addActor('brian', 680, 330);
    if (id === 'timhortons-1') {
      this.addActor('kylie', 470, 450);
      const hands = cueProgress(cutscene, 'three-hands') > 0 && cutscene.index <= 3;
      if (hands) for (const who of ['skanky', 'doris', 'brian']) {
        const art = this.actors.get(who)!.art;
        g.lineStyle(3, 0xd0a684).lineBetween(art.x + 10, art.y - 20, art.x + 14, art.y - 44);
        g.fillStyle(0xd0a684).fillCircle(art.x + 14, art.y - 46, 4);
      }
      (this.props.cup as Phaser.GameObjects.Container).setVisible(false);
    } else {
      const hand = ease(cueProgress(cutscene, 'hand-coffee'));
      const spill = cueProgress(cutscene, 'spill');
      (this.props.cup as Phaser.GameObjects.Container).setVisible(true).setPosition(mix(630, 612, hand), mix(424, 386, hand));
      if (spill > 0) g.fillStyle(0x5a3018, 0.85).fillEllipse(606, 394, 14, 8).fillCircle(598, 402, 3).fillCircle(616, 404, 2);
    }
  }

  private directHome(cutscene: Cutscene): void {
    (this.props.gate as Phaser.GameObjects.Container).x = 600;
    (this.props.lock as unknown as Phaser.GameObjects.Arc).setVisible(false);
    const walk = ease(cueProgress(cutscene, 'car'));
    const leave = ease(cueProgress(cutscene, 'drive-home'));
    const car = this.car('car-skanky', 0x8f3f34);
    if (leave < 0.5) car.setPosition(mix(300, 480, leave * 2), mix(268, 470, leave * 2)).setRotation(Math.PI / 2 - Math.PI / 2 * (1 - leave * 2));
    else car.setPosition(mix(480, -80, leave * 2 - 1), 470).setRotation(Math.PI);
    if (walk < 1) this.addActor('skanky', mix(760, 320, walk), mix(214, 268, walk));
    const g = this.dynamic!;
    g.clear();
    if (cueProgress(cutscene, 'phone') > 0 && leave <= 0) g.fillStyle(0x7fb0ff, 0.6).fillCircle(car.x, car.y - 10, 8);
  }

  // ------------------------------------------------------------------ mall and lot

  public beginMall(onNext: () => void, onSkip: () => void): void {
    this.clear();
    this.active = 'mall';
    this.buildChrome('chapter', onNext, onSkip);
    this.setTitle('MALLWOOD CENTRE · THE MALL RUN', '5:20 AM');
    this.keysText('WASD MOVE · SPACE TAKE / LOAD / DROP / SIGN · E PUSH OR PARK CART · ESC PAUSE');
    const g = this.scene.add.graphics();
    this.stage = this.scene.add.container(0, 0, [g]).setDepth(90);
    this.drawMall(g);
    this.dynamic = this.scene.add.graphics();
    this.stage.add(this.dynamic);
    this.screen(this.stage);
  }

  public updateMall(model: MallModel, hint: string): void {
    if (!this.stage || !this.dynamic) return;
    const g = this.dynamic;
    g.clear();
    // Bundles still in the truck, labelled by store.
    model.truckBundles.forEach((id, slot) => {
      const key = `slot-${slot}`;
      let label = this.props[key] as Phaser.GameObjects.Text | undefined;
      if (!label) {
        label = this.screen(this.text(0, 0, '', 9, '#2b2116').setBackgroundColor('#f1e5c4').setPadding(3, 1).setOrigin(0, 0.5));
        this.stage!.add(label);
        this.props[key] = label;
      }
      const position = model.slotPosition(slot);
      label.setVisible(id !== null).setPosition(mallX(position.x) - 104, mallY(position.y));
      if (id) {
        const store = model.store(id);
        const current = store.run === model.run || (model.runComplete && store.run === model.run + 1);
        label.setText(store.name).setBackgroundColor(current ? '#f2c14e' : '#c8c0b0');
        g.fillStyle(0xa47650).fillRect(mallX(position.x) - 6, mallY(position.y) - 5, 12, 10);
      }
    });
    // Stores: a badge for each state, and the dropped boxes.
    for (const store of model.stores) {
      const text = store.state === 'signed' ? `✓ ${store.name}` : store.state === 'dropped' ? `${store.name} · SIGN` : store.run === model.run && !model.runComplete ? `${store.name} · THIS RUN` : `${store.name} · RUN ${store.run + 1}`;
      let label = this.props[`store-${store.id}`] as Phaser.GameObjects.Text | undefined;
      if (!label) {
        label = this.screen(this.text(mallX(store.door.x), mallY(store.side === 'north' ? store.door.y - 170 : store.door.y + 170), '', 10, '#14232a').setOrigin(0.5).setPadding(4, 2));
        this.stage!.add(label);
        this.props[`store-${store.id}`] = label;
      }
      if (this.storeLabels.get(store.id) !== text) {
        this.storeLabels.set(store.id, text);
        label.setText(text).setBackgroundColor(store.state === 'signed' ? '#8fd18a' : store.state === 'dropped' ? '#f2c14e' : store.run === model.run ? '#f0e0b0' : '#9aa4a8');
      }
      if (store.state !== 'waiting') {
        const north = store.side === 'north';
        g.fillStyle(0xa47650).fillRect(mallX(store.door.x - 40), mallY(north ? store.door.y - 40 : store.door.y + 24), 14, 12);
        g.fillStyle(0x2f7d6b).fillCircle(mallX(store.door.x + 30), mallY(north ? store.door.y - 26 : store.door.y + 26), 7);
      }
    }
    // The cart and its load, and Skanky.
    const horizontal = model.cart.facing === 'left' || model.cart.facing === 'right';
    const w = (horizontal ? MALL_RULES.cartSize.w : MALL_RULES.cartSize.h) * 0.6;
    const h = (horizontal ? MALL_RULES.cartSize.h : MALL_RULES.cartSize.w) * 0.6;
    g.fillStyle(0x3a6a8a).fillRoundedRect(mallX(model.cart.x) - w / 2, mallY(model.cart.y) - h / 2, w, h, 3);
    g.lineStyle(2, model.cart.pushed ? 0xedba6d : 0x8a949a).strokeRoundedRect(mallX(model.cart.x) - w / 2, mallY(model.cart.y) - h / 2, w, h, 3);
    let cartLabel = this.props.cartLabel as Phaser.GameObjects.Text | undefined;
    if (!cartLabel) {
      cartLabel = this.screen(this.text(0, 0, '', 9, '#2b2116').setBackgroundColor('#f1e5c4').setPadding(3, 1).setOrigin(0.5, 1));
      this.stage.add(cartLabel);
      this.props.cartLabel = cartLabel;
    }
    cartLabel.setText(model.cart.load.map((id) => model.store(id).name).join(' + ')).setVisible(model.cart.load.length > 0)
      .setPosition(mallX(model.cart.x), mallY(model.cart.y) - 10);
    const skanky = this.addActor('skanky', mallX(model.skanky.x), mallY(model.skanky.y), 0.62);
    skanky.worker?.update(this.reducedMotion ? 0 : this.scene.time.now, model.skanky.moving, true, model.carrying !== null || model.cart.pushed);
    if (model.carrying) g.fillStyle(0xa47650).fillRect(mallX(model.skanky.x) - 8, mallY(model.skanky.y) - 20, 16, 12);
    this.hudText?.setText(`RUN ${Math.min(3, model.run + 1)} / 3     DELIVERED ${model.delivered} / 6     SIGNED ${model.signatures} / 6     CART ${model.cart.load.length === 0 ? 'EMPTY' : model.cart.load.map((id) => model.store(id).name).join(' + ')}`);
    this.objectiveText?.setText(`${model.objective}${hint ? ` · ${hint}` : ''}`);
  }

  public beginLot(onNext: () => void, onSkip: () => void): void {
    this.clear();
    this.active = 'lot';
    this.buildChrome('chapter', onNext, onSkip);
    this.setTitle('BACK AT UPS · RETURN THE FIVE-TON', '6:22 AM');
    this.keysText('WASD MOVE · SPACE DROP KEYS · ESC PAUSE');
    const g = this.scene.add.graphics();
    this.stage = this.scene.add.container(0, 0, [g]).setDepth(90);
    g.fillStyle(0x23292c).fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    g.fillStyle(0x2c3438).fillRect(lotX(0), lotY(80), 960 * 0.75, 60 * 0.75);
    const walk = LOT_LAYOUT.walk;
    g.lineStyle(1, 0x5a6a70).strokeRect(lotX(walk.x), lotY(walk.y), walk.w * 0.75, walk.h * 0.75);
    const truck = LOT_LAYOUT.truck;
    g.fillStyle(0x5a4632).fillRect(lotX(truck.x), lotY(truck.y), truck.w * 0.75, truck.h * 0.75);
    g.fillStyle(0x4a3a2a).fillRect(lotX(truck.x + truck.w - 40), lotY(truck.y + 10), 40 * 0.75, (truck.h - 20) * 0.75);
    const drop = LOT_LAYOUT.keyDrop;
    g.fillStyle(0xf2c14e, 0.2).fillRect(lotX(drop.x), lotY(drop.y), drop.w * 0.75, drop.h * 0.75);
    g.lineStyle(2, 0xf2c14e).strokeRect(lotX(drop.x), lotY(drop.y), drop.w * 0.75, drop.h * 0.75);
    g.fillStyle(0x8a2a22).fillRect(lotX(drop.x + 40), lotY(drop.y) - 4, 22, 14);
    this.stage.add([
      this.text(lotX(truck.x + truck.w / 2), lotY(truck.y + truck.h / 2), '5 TON', 14, '#e8dcc0').setOrigin(0.5),
      this.text(lotX(drop.x + drop.w / 2), lotY(drop.y + drop.h) + 4, 'KEY DROP', 11, '#f2c14e').setOrigin(0.5, 0),
      this.text(lotX(480), lotY(100), 'UPS · DEPOT 07', 14, '#e8c060').setOrigin(0.5),
    ]);
    this.dynamic = this.scene.add.graphics();
    this.stage.add(this.dynamic);
    this.screen(this.stage);
  }

  public updateLot(model: KeyReturnModel, hint: string): void {
    const skanky = this.addActor('skanky', lotX(model.skanky.x), lotY(model.skanky.y), 0.7);
    skanky.worker?.update(this.reducedMotion ? 0 : this.scene.time.now, model.skanky.moving, true, false);
    this.hudText?.setText(`MALL 6 / 6 SIGNED     FIVE-TON ${model.done ? 'RETURNED' : 'PARKED'}`);
    this.objectiveText?.setText(model.atKeyDrop ? 'Press SPACE to drop the keys' : hint);
  }
}
