import Phaser from 'phaser';

import { fonts, fontSizes } from '../config/typography';
import { Package } from '../entities/Package';
import { RedButton } from '../entities/RedButton';
import { ShanNpc } from '../entities/ShanNpc';
import { VicNpc } from '../entities/VicNpc';
import type { BeltEventState, GameOverData } from '../types/GameTypes';
import { isMobileBrowser } from '../utils/device';
import { randomTimedEventDelayMs } from '../utils/eventTiming';
import { audioSystem } from './AudioSystem';
import { BeltSystem, BELT_CENTER_X, BELT_LEFT, BELT_RIGHT } from './BeltSystem';

type BeltEventSystemConfig = {
  beltSystem: BeltSystem;
  buttons: RedButton[];
  vic: VicNpc;
  shan: ShanNpc;
  getPackages: () => Package[];
  onGameOver: (data: GameOverData) => void;
  canStartEvent?: () => boolean;
  onEventStarted?: () => void;
  onMesaDreamRequested?: () => void;
};

export class BeltEventSystem {
  public currentState: BeltEventState = 'idle';

  public stateTimer = randomTimedEventDelayMs();

  public targetedButton: RedButton | null = null;

  private enabled = false;

  private scene!: Phaser.Scene;

  private beltSystem!: BeltSystem;

  private buttons: RedButton[] = [];

  private vic!: VicNpc;

  private shan!: ShanNpc;

  private getPackages!: () => Package[];

  private onGameOver!: (data: GameOverData) => void;

  private canStartEvent: () => boolean = () => true;

  private onEventStarted: () => void = () => undefined;

  private onMesaDreamRequested: () => void = () => undefined;

  private centerNotification: Phaser.GameObjects.Container | null = null;

  private centerNotificationPanel: Phaser.GameObjects.Graphics | null = null;

  private centerNotificationText: Phaser.GameObjects.Text | null = null;

  private mesaPrompt: Phaser.GameObjects.Container | null = null;

  private mesaPromptBody: Phaser.GameObjects.Text | null = null;

  private mesaPackage: Package | null = null;

  private readonly processedMesaPackageIds = new Set<string>();

  private hasMesaEventPlayed = false;

  private hasVicEventPlayed = false;

  public create(scene: Phaser.Scene, config: BeltEventSystemConfig): void {
    this.scene = scene;
    this.beltSystem = config.beltSystem;
    this.buttons = config.buttons;
    this.vic = config.vic;
    this.shan = config.shan;
    this.getPackages = config.getPackages;
    this.onGameOver = config.onGameOver;
    this.canStartEvent = config.canStartEvent ?? (() => true);
    this.onEventStarted = config.onEventStarted ?? (() => undefined);
    this.onMesaDreamRequested = config.onMesaDreamRequested ?? (() => undefined);

    this.centerNotificationPanel = scene.add.graphics();
    this.centerNotificationText = scene.add.text(0, 0, '', {
      color: '#ffffff',
      fontFamily: fonts.display,
      fontSize: fontSizes.xl,
    });
    this.centerNotificationText.setOrigin(0.5);
    this.centerNotificationText.setLetterSpacing(2);
    this.centerNotification = scene.add.container(480, 200, [
      this.centerNotificationPanel,
      this.centerNotificationText,
    ]);
    this.centerNotification.setDepth(45);
    this.centerNotification.setVisible(false);

    this.createMesaPrompt();
    this.attachChoiceListeners();
  }

  public update(delta: number): void {
    if (!this.enabled) {
      return;
    }

    this.vic.update(delta);
    this.shan.update(delta);

    if (this.updateMesaEncounter(delta)) {
      return;
    }

    if (this.currentState === 'idle' || this.currentState === 'cooldown') {
      if (!this.canStartEvent()) {
        return;
      }

      if (this.tryStartMesaEvent()) {
        return;
      }

      if (this.hasVicEventPlayed) {
        return;
      }

      this.stateTimer = Math.max(0, this.stateTimer - delta);

      if (this.stateTimer <= 0) {
        this.startVicEvent();
      }

      return;
    }

    if (this.currentState === 'vicPathing' || this.currentState === 'vicPressing') {
      if (this.vic.state === 'pressing') {
        this.currentState = 'vicPressing';
      }

      if (this.vic.consumePressSignal()) {
        this.targetedButton?.flashPressed();
        this.beltSystem.stop();
        this.showNotification('BELT STOPPED', '#ff5d5d');

        const shanButton = this.pickRandomButton(this.targetedButton);
        this.targetedButton = shanButton;
        this.targetedButton.flashGlow();
        this.stateTimer = Phaser.Math.Between(1500, 3000);
        this.currentState = 'beltStopped';
      }

      return;
    }

    if (this.currentState === 'beltStopped') {
      this.stateTimer = Math.max(0, this.stateTimer - delta);

      if (this.stateTimer <= 0 && this.targetedButton) {
        this.shan.enter(this.targetedButton.getPosition());
        this.currentState = 'shanEntering';
      }

      return;
    }

    if (this.currentState === 'shanEntering' || this.currentState === 'shanPressing') {
      if (this.shan.state === 'pressing') {
        this.currentState = 'shanPressing';
      }

      if (this.shan.consumePressSignal()) {
        this.targetedButton?.flashPressed();
        this.beltSystem.start();
        this.showNotification('BELT RUNNING', '#61f29b');
        this.targetedButton = null;
        this.currentState = 'cooldown';
        this.stateTimer = randomTimedEventDelayMs();
      }
    }
  }

  public getNextVicTime(): number {
    if (this.hasVicEventPlayed) {
      return 0;
    }

    if (this.currentState === 'idle' || this.currentState === 'cooldown') {
      return Math.ceil(this.stateTimer / 1000);
    }

    return 0;
  }

  public getCurrentState(): BeltEventState {
    return this.currentState;
  }

  public isEventActive(): boolean {
    return (
      this.currentState !== 'idle' &&
      this.currentState !== 'cooldown'
    );
  }

  public resetEventTimer(): void {
    if (this.currentState === 'idle' || this.currentState === 'cooldown') {
      this.stateTimer = randomTimedEventDelayMs();
    }
  }

  public isBlockingPlayerInput(): boolean {
    return (
      this.currentState === 'mesaVicApproaching' ||
      this.currentState === 'mesaChoice' ||
      this.currentState === 'mesaCaught'
    );
  }

  public beginShift(): void {
    this.enabled = true;
    this.currentState = 'idle';
    this.stateTimer = randomTimedEventDelayMs();
    this.targetedButton?.clearGlow();
    this.targetedButton = null;
    this.mesaPackage = null;
    this.processedMesaPackageIds.clear();
    this.hasMesaEventPlayed = false;
    this.hasVicEventPlayed = false;
    this.hideMesaPrompt();
    this.vic.forceHide();
    this.shan.forceHide();
  }

  public stopEvents(): void {
    this.enabled = false;
    this.currentState = 'idle';
    this.targetedButton?.clearGlow();
    this.targetedButton = null;
    this.mesaPackage = null;
    this.hideMesaPrompt();
    this.vic.forceHide();
    this.shan.forceHide();
  }

  private createMesaPrompt(): void {
    const isMobile = isMobileBrowser();
    const background = this.scene.add.graphics();
    background.fillStyle(0x090909, 0.92);
    background.fillRoundedRect(-225, -76, 450, 152, 14);
    background.lineStyle(3, 0xffd36b, 0.85);
    background.strokeRoundedRect(-225, -76, 450, 152, 14);

    const title = this.scene.add.text(0, -48, 'VIC WANTS THE MESA', {
      color: '#ffd36b',
      fontFamily: 'Arial',
      fontSize: '24px',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);

    this.mesaPromptBody = this.scene.add.text(0, -4, '', {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '16px',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 390 },
      lineSpacing: 4,
    });
    this.mesaPromptBody.setOrigin(0.5);

    const controls = this.scene.add.text(0, 34, isMobile ? 'TAP A CHOICE' : 'KEYBOARD: Y / N', {
      color: '#cfc8bd',
      fontFamily: 'Courier New',
      fontSize: isMobile ? '14px' : '12px',
      fontStyle: 'bold',
    });
    controls.setOrigin(0.5);

    const stealButton = this.createMesaChoiceButton(-96, 57, 'STEAL IT', '#61f29b', () =>
      this.chooseStealMesa(),
    );
    const leaveButton = this.createMesaChoiceButton(96, 57, 'LEAVE IT', '#ffd36b', () =>
      this.chooseLeaveMesa(),
    );

    this.mesaPrompt = this.scene.add.container(480, 300, [
      background,
      title,
      this.mesaPromptBody,
      controls,
      stealButton,
      leaveButton,
    ]);
    this.mesaPrompt.setDepth(55);
    this.mesaPrompt.setVisible(false);
  }

  private createMesaChoiceButton(
    x: number,
    y: number,
    label: string,
    color: string,
    onChoose: () => void,
  ): Phaser.GameObjects.Container {
    const width = 150;
    const height = 34;
    const accentColor = Phaser.Display.Color.HexStringToColor(color).color;
    const buttonBg = this.scene.add.graphics();
    buttonBg.fillStyle(0x141014, 0.96);
    buttonBg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
    buttonBg.lineStyle(2, accentColor, 0.76);
    buttonBg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);

    const buttonText = this.scene.add.text(0, 0, label, {
      color,
      fontFamily: 'Arial',
      fontSize: '15px',
      fontStyle: 'bold',
    });
    buttonText.setOrigin(0.5);

    const button = this.scene.add.container(x, y, [buttonBg, buttonText]);
    button.setSize(width, height);
    button.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.preventDefault();
      onChoose();
    });
    button.on('pointerover', () => button.setScale(1.03));
    button.on('pointerout', () => button.setScale(1));

    return button;
  }

  private attachChoiceListeners(): void {
    const keyboard = this.scene.input.keyboard;

    keyboard?.on('keydown-Y', this.handleStealChoice, this);
    keyboard?.on('keydown-N', this.handleLeaveChoice, this);

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard?.off('keydown-Y', this.handleStealChoice, this);
      keyboard?.off('keydown-N', this.handleLeaveChoice, this);
    });
  }

  private updateMesaEncounter(delta: number): boolean {
    if (this.currentState === 'mesaVicApproaching') {
      if (!this.isMesaPackageAvailable()) {
        this.cancelMesaEncounter();
        return true;
      }

      if (this.vic.state === 'offering') {
        this.showMesaPrompt();
        this.currentState = 'mesaChoice';
      }

      return true;
    }

    if (this.currentState === 'mesaChoice') {
      if (!this.isMesaPackageAvailable()) {
        this.cancelMesaEncounter();
      }

      return true;
    }

    if (this.currentState === 'mesaCaught') {
      this.stateTimer = Math.max(0, this.stateTimer - delta);

      if (this.stateTimer <= 0) {
        this.onGameOver({
          title: 'BUSTED BY SHAN O MAC',
          subtitle: 'Shan caught you and Vic trying to load the Mesa into the SUV.',
          detail: 'GAME OVER',
        });
      }

      return true;
    }

    return false;
  }

  private tryStartMesaEvent(): boolean {
    if (this.hasMesaEventPlayed) {
      return false;
    }

    const mesaPackage = this.getPackages().find(
      (item) =>
        item.size === 'mesa_boogie' &&
        !item.isSorted &&
        !item.isHeld &&
        !this.processedMesaPackageIds.has(item.id),
    );

    if (!mesaPackage) {
      return false;
    }

    this.processedMesaPackageIds.add(mesaPackage.id);
    this.hasMesaEventPlayed = true;
    this.mesaPackage = mesaPackage;
    this.beltSystem.stop();
    audioSystem.play('warning');
    this.showNotification('VIC SPOTTED THE MESA', '#ffd36b');

    const offerTarget = this.getMesaTargetPosition();
    this.vic.offer(offerTarget, "STEAL IT?\nI'LL TOSS IT IN\nTHE SUV.");
    this.currentState = 'mesaVicApproaching';
    this.onEventStarted();

    return true;
  }

  private handleStealChoice(event: KeyboardEvent): void {
    if (event.repeat || this.currentState !== 'mesaChoice') {
      return;
    }

    event.preventDefault();
    this.chooseStealMesa();
  }

  private chooseStealMesa(): void {
    if (this.currentState !== 'mesaChoice') {
      return;
    }

    this.hideMesaPrompt();

    if (!this.isMesaPackageAvailable()) {
      this.cancelMesaEncounter();
      return;
    }

    this.stealMesaPackage();
    this.vic.dismissOffer();
    this.beltSystem.stop();
    this.currentState = 'cooldown';
    this.stateTimer = randomTimedEventDelayMs();
    this.mesaPackage = null;
    this.onMesaDreamRequested();
  }

  private handleLeaveChoice(event: KeyboardEvent): void {
    if (event.repeat || this.currentState !== 'mesaChoice') {
      return;
    }

    event.preventDefault();
    this.chooseLeaveMesa();
  }

  private chooseLeaveMesa(): void {
    if (this.currentState !== 'mesaChoice') {
      return;
    }

    this.hideMesaPrompt();
    this.vic.dismissOffer();
    this.beltSystem.start();
    this.showNotification('MESA STAYS ON THE BELT', '#61f29b');
    this.currentState = 'cooldown';
    this.stateTimer = randomTimedEventDelayMs();
    this.mesaPackage = null;
  }

  private stealMesaPackage(): void {
    if (!this.mesaPackage) {
      return;
    }

    this.mesaPackage.isHeld = false;
    this.mesaPackage.holderId = null;
    this.mesaPackage.isSorted = true;
    this.mesaPackage.setVisible(false);
  }

  private cancelMesaEncounter(): void {
    this.hideMesaPrompt();
    this.vic.forceHide();
    this.mesaPackage = null;
    this.beltSystem.start();
    this.currentState = 'cooldown';
    this.stateTimer = randomTimedEventDelayMs();
  }

  private isMesaPackageAvailable(): boolean {
    return Boolean(
      this.mesaPackage &&
        this.mesaPackage.active &&
        !this.mesaPackage.isSorted &&
        !this.mesaPackage.isHeld,
    );
  }

  private getMesaTargetPosition(): Phaser.Math.Vector2 {
    if (!this.mesaPackage) {
      return new Phaser.Math.Vector2(BELT_LEFT - 20, 300);
    }

    const safeX =
      this.mesaPackage.x <= BELT_CENTER_X
        ? BELT_LEFT - 20
        : BELT_RIGHT + 20;

    return new Phaser.Math.Vector2(safeX, this.mesaPackage.y);
  }

  private showMesaPrompt(): void {
    if (!this.mesaPrompt || !this.mesaPromptBody) {
      return;
    }

    this.mesaPromptBody.setText(
      "Vic says he'll throw it in the back of his SUV.\n1 IN 5 SHAN O MAC CATCHES YOU BOTH.\nIf he does, the run ends.",
    );
    this.mesaPrompt.setAlpha(0);
    this.mesaPrompt.setVisible(true);
    this.scene.tweens.killTweensOf(this.mesaPrompt);
    this.scene.tweens.add({
      targets: this.mesaPrompt,
      alpha: 1,
      duration: 120,
      ease: 'Quad.Out',
    });
  }

  private hideMesaPrompt(): void {
    if (!this.mesaPrompt) {
      return;
    }

    this.scene.tweens.killTweensOf(this.mesaPrompt);
    this.mesaPrompt.setVisible(false);
  }

  private startVicEvent(): void {
    if (this.hasVicEventPlayed) {
      return;
    }

    this.hasVicEventPlayed = true;
    this.targetedButton = this.pickRandomButton();
    audioSystem.play('event-alert');
    this.targetedButton.flashGlow();
    this.vic.enter(this.targetedButton.getPosition());
    this.currentState = 'vicPathing';
    this.onEventStarted();
  }

  private pickRandomButton(exclude: RedButton | null = null): RedButton {
    const pool = exclude
      ? this.buttons.filter((button) => button !== exclude)
      : this.buttons;
    return Phaser.Utils.Array.GetRandom(pool);
  }

  private showNotification(text: string, color: string): void {
    if (!this.centerNotification || !this.centerNotificationPanel || !this.centerNotificationText) {
      return;
    }

    this.centerNotificationText.setText(text);
    this.centerNotificationText.setColor('#ffffff');

    const padX = 28;
    const padY = 14;
    const textBounds = this.centerNotificationText.getBounds();
    const w = Math.max(220, textBounds.width + padX * 2);
    const h = textBounds.height + padY * 2 + 6;
    const accentColor = Phaser.Display.Color.HexStringToColor(color).color;

    const panel = this.centerNotificationPanel;
    panel.clear();
    panel.fillStyle(0x000000, 0.55);
    panel.fillRoundedRect(-w / 2 + 4, -h / 2 + 6, w, h, 12);
    panel.fillStyle(0x141014, 0.92);
    panel.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    panel.lineStyle(1, accentColor, 0.5);
    panel.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    panel.fillStyle(accentColor, 0.95);
    panel.fillRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, 4, 2);

    this.centerNotification.setAlpha(0);
    this.centerNotification.setScale(0.92);
    this.centerNotification.setY(190);
    this.centerNotification.setVisible(true);

    const tweens = this.centerNotification.scene.tweens;
    tweens.killTweensOf(this.centerNotification);
    tweens.add({
      targets: this.centerNotification,
      alpha: { from: 0, to: 1 },
      scale: { from: 0.92, to: 1 },
      duration: 180,
      ease: 'Cubic.easeOut',
    });
    tweens.add({
      targets: this.centerNotification,
      alpha: 0,
      y: 175,
      delay: 1100,
      duration: 520,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.centerNotification?.setVisible(false);
      },
    });
  }
}
