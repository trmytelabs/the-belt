import Phaser from 'phaser';

import { Package } from '../entities/Package';
import { Player } from '../entities/Player';
import type { PlayerControls } from '../entities/Player';
import { isMobileBrowser } from '../utils/device';
import { audioSystem } from './AudioSystem';

export class InputSystem {
  private termite!: Player;

  private skanky!: Player;

  private activePlayer!: Player;

  private getPackages!: () => Package[];

  private tryDigOutActivePlayer!: (player: Player) => boolean;

  private canProcessActions: () => boolean = () => true;

  private keyboardScene: Phaser.Scene | null = null;

  private keyboardPlugin: Phaser.Input.Keyboard.KeyboardPlugin | null = null;

  private tabKeyHandler: ((event: KeyboardEvent) => void) | null = null;

  private spaceKeyHandler: ((event: KeyboardEvent) => void) | null = null;

  private keyboardShutdownHandler: (() => void) | null = null;

  private pointerScene: Phaser.Scene | null = null;

  private pointerHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;

  private pointerShutdownHandler: (() => void) | null = null;

  private readonly mobileMovementState: PlayerControls = {
    left: false,
    right: false,
    up: false,
    down: false,
  };

  private mobileControlScheme = false;

  private mobileStickPointerId: number | null = null;

  private mobileStickCenter = new Phaser.Math.Vector2(0, 0);

  private mobileControlLayer: HTMLDivElement | null = null;

  private mobileStickKnob: HTMLDivElement | null = null;

  public create(
    scene: Phaser.Scene,
    termite: Player,
    skanky: Player,
    getPackages: () => Package[],
    tryDigOutActivePlayer: (player: Player) => boolean,
    canProcessActions: () => boolean = () => true,
  ): void {
    this.termite = termite;
    this.skanky = skanky;
    this.activePlayer = termite;
    this.getPackages = getPackages;
    this.tryDigOutActivePlayer = tryDigOutActivePlayer;
    this.canProcessActions = canProcessActions;

    this.termite.setActive(true);
    this.skanky.setActive(false);

    this.attachTabListener(scene);
    this.attachMouseListeners(scene);

    if (isMobileBrowser()) {
      this.mobileControlScheme = true;
      this.createMobileControls(scene);
    }
  }

  public getActivePlayer(): Player {
    return this.activePlayer;
  }

  public getMobileMovementState(): PlayerControls {
    return this.mobileMovementState;
  }

  public isUsingMobileControlScheme(): boolean {
    return this.mobileControlScheme;
  }

  public getControlsHint(): string {
    return this.mobileControlScheme
      ? 'TOUCH STICK MOVE | SWITCH | GRAB/DROP'
      : 'TAB/R-CLICK SWITCH | SPACE/L-CLICK GRAB/DROP';
  }

  private attachTabListener(scene: Phaser.Scene): void {
    this.detachKeyboardListeners();

    const keyboard = scene.input.keyboard;

    if (!keyboard) {
      return;
    }

    this.keyboardScene = scene;
    this.keyboardPlugin = keyboard;

    this.tabKeyHandler = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      if (!this.canProcessActions()) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      this.trySwapActivePlayer();
    };

    this.spaceKeyHandler = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      if (!this.canProcessActions()) {
        event.preventDefault();
        return;
      }

      event.preventDefault();

      this.tryUseActivePlayer();
    };

    keyboard.on('keydown-TAB', this.tabKeyHandler);
    keyboard.on('keydown-SPACE', this.spaceKeyHandler);

    this.keyboardShutdownHandler = () => this.detachKeyboardListeners();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.keyboardShutdownHandler);
  }

  private detachKeyboardListeners(): void {
    if (this.keyboardPlugin && this.tabKeyHandler) {
      this.keyboardPlugin.off('keydown-TAB', this.tabKeyHandler);
    }

    if (this.keyboardPlugin && this.spaceKeyHandler) {
      this.keyboardPlugin.off('keydown-SPACE', this.spaceKeyHandler);
    }

    if (this.keyboardScene && this.keyboardShutdownHandler) {
      this.keyboardScene.events.off(
        Phaser.Scenes.Events.SHUTDOWN,
        this.keyboardShutdownHandler,
      );
    }

    this.keyboardScene = null;
    this.keyboardPlugin = null;
    this.tabKeyHandler = null;
    this.spaceKeyHandler = null;
    this.keyboardShutdownHandler = null;
  }

  private attachMouseListeners(scene: Phaser.Scene): void {
    this.detachMouseListeners();

    if (isMobileBrowser()) {
      return;
    }

    scene.input.mouse?.disableContextMenu();

    this.pointerScene = scene;
    this.pointerHandler = (pointer: Phaser.Input.Pointer) => {
      pointer.event.preventDefault();

      if (pointer.button === 2) {
        this.trySwapActivePlayer();
        return;
      }

      if (pointer.button === 0) {
        this.tryUseActivePlayer();
      }
    };

    scene.input.on('pointerdown', this.pointerHandler);
    this.pointerShutdownHandler = () => this.detachMouseListeners();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.pointerShutdownHandler);
  }

  private detachMouseListeners(): void {
    if (this.pointerScene && this.pointerHandler) {
      this.pointerScene.input.off('pointerdown', this.pointerHandler);
    }

    if (this.pointerScene && this.pointerShutdownHandler) {
      this.pointerScene.events.off(
        Phaser.Scenes.Events.SHUTDOWN,
        this.pointerShutdownHandler,
      );
    }

    this.pointerScene = null;
    this.pointerHandler = null;
    this.pointerShutdownHandler = null;
  }

  private createMobileControls(scene: Phaser.Scene): void {
    this.destroyMobileControls();

    const app = document.querySelector<HTMLDivElement>('#app');
    const layer = document.createElement('div');
    layer.className = 'mobile-control-layer';

    const stick = document.createElement('div');
    stick.className = 'mobile-stick';
    const stickKnob = document.createElement('div');
    stickKnob.className = 'mobile-stick-knob';
    stick.append(stickKnob);

    const actionRail = document.createElement('div');
    actionRail.className = 'mobile-action-rail';
    const switchButton = this.createMobileActionButton('SWITCH', () => this.trySwapActivePlayer());
    const grabButton = this.createMobileActionButton('GRAB', () => this.tryUseActivePlayer());
    actionRail.append(switchButton, grabButton);

    layer.append(stick, actionRail);
    (app ?? document.body).append(layer);

    this.mobileControlLayer = layer;
    this.mobileStickKnob = stickKnob;

    const updateStickCenter = () => {
      const rect = stick.getBoundingClientRect();
      this.mobileStickCenter = new Phaser.Math.Vector2(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
    };

    stick.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      updateStickCenter();
      this.mobileStickPointerId = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      this.updateMobileStick(event);
    });

    stick.addEventListener('pointermove', (event) => {
      if (this.mobileStickPointerId === event.pointerId) {
        event.preventDefault();
        this.updateMobileStick(event);
      }
    });

    stick.addEventListener('pointerup', (event) => {
      if (this.mobileStickPointerId === event.pointerId) {
        event.preventDefault();
        this.releaseMobileStick();
      }
    });

    stick.addEventListener('pointercancel', (event) => {
      if (this.mobileStickPointerId === event.pointerId) {
        this.releaseMobileStick();
      }
    });

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroyMobileControls();
    });
  }

  private createMobileActionButton(
    label: string,
    action: () => void,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'mobile-action-button';
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      action();
      button.classList.add('is-pressed');
      window.setTimeout(() => button.classList.remove('is-pressed'), 90);
    });

    return button;
  }

  private updateMobileStick(pointer: Pick<PointerEvent, 'clientX' | 'clientY'>): void {
    const deltaX = pointer.clientX - this.mobileStickCenter.x;
    const deltaY = pointer.clientY - this.mobileStickCenter.y;
    const distance = Math.min(54, Math.hypot(deltaX, deltaY));
    const angle = Math.atan2(deltaY, deltaX);
    const knobX = Math.cos(angle) * distance;
    const knobY = Math.sin(angle) * distance;
    const deadZone = 16;

    this.mobileMovementState.left = deltaX < -deadZone;
    this.mobileMovementState.right = deltaX > deadZone;
    this.mobileMovementState.up = deltaY < -deadZone;
    this.mobileMovementState.down = deltaY > deadZone;
    if (this.mobileStickKnob) {
      this.mobileStickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
    }
  }

  private releaseMobileStick(): void {
    this.mobileStickPointerId = null;
    this.mobileMovementState.left = false;
    this.mobileMovementState.right = false;
    this.mobileMovementState.up = false;
    this.mobileMovementState.down = false;
    if (this.mobileStickKnob) {
      this.mobileStickKnob.style.transform = 'translate(-50%, -50%)';
    }
  }

  private destroyMobileControls(): void {
    this.releaseMobileStick();
    this.mobileControlLayer?.remove();
    this.mobileControlLayer = null;
    this.mobileStickKnob = null;
  }

  private trySwapActivePlayer(): void {
    if (!this.canProcessActions()) {
      return;
    }

    this.swapActivePlayer();
  }

  private tryUseActivePlayer(): void {
    if (!this.canProcessActions()) {
      return;
    }

    if (this.activePlayer.heldPackage) {
      this.activePlayer.drop();
      audioSystem.play('drop');
      return;
    }

    if (this.tryDigOutActivePlayer(this.activePlayer)) {
      audioSystem.play('dig');
      return;
    }

    if (this.activePlayer.tryGrab(this.getPackages())) {
      audioSystem.play('grab');
      return;
    }

    audioSystem.play('button');
  }

  private swapActivePlayer(): void {
    const previousPlayer = this.activePlayer;
    const nextPlayer = previousPlayer === this.termite ? this.skanky : this.termite;

    previousPlayer.setActive(false);
    nextPlayer.setActive(true);
    this.activePlayer = nextPlayer;
    audioSystem.play('switch');
  }
}
