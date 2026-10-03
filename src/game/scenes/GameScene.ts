import Phaser from 'phaser';

import { BenGunmanEvent } from '../entities/BenGunmanEvent';
import { BulkPileZone } from '../entities/BulkPileZone';
import { colors } from '../config/colors';
import { FlavorNpc } from '../entities/FlavorNpc';
import { JohnRushtonEvent } from '../entities/JohnRushtonEvent';
import { KylieNpc } from '../entities/KylieNpc';
import { Package } from '../entities/Package';
import { PileUpZone } from '../entities/PileUpZone';
import { Player, type PlayerControls } from '../entities/Player';
import { RalphTruckEvent } from '../entities/RalphTruckEvent';
import { RedButton } from '../entities/RedButton';
import { ShanNpc } from '../entities/ShanNpc';
import { TruckZone } from '../entities/TruckZone';
import { TruckExhaustEvent, type ExhaustTruckConfig } from '../entities/TruckExhaustEvent';
import { UnitedWayEvent } from '../entities/UnitedWayEvent';
import { VicMassageEvent } from '../entities/VicMassageEvent';
import { VicNpc } from '../entities/VicNpc';
import { BeltEventSystem } from '../systems/BeltEventSystem';
import { audioSystem } from '../systems/AudioSystem';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import {
  BeltSystem,
  BELT_BOTTOM,
  BELT_CENTER_X,
  BELT_LEFT,
  BELT_RIGHT,
  BELT_TOP,
} from '../systems/BeltSystem';
import { InputSystem } from '../systems/InputSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { type ShiftResultsData, ShiftSystem } from '../systems/ShiftSystem';
import { SortingSystem } from '../systems/SortingSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import type { GameOverData } from '../types/GameTypes';
import { Hud } from '../ui/Hud';
import { isMobileBrowser } from '../utils/device';
import { randomTimedEventDelayMs } from '../utils/eventTiming';

const TRUCK_EXHAUST_IDLE_DELAY_MS = 45_000;

type EndShiftTruckGroup = {
  targets: Phaser.GameObjects.GameObject[];
  deltaX: number;
};

export class GameScene extends Phaser.Scene {
  private readonly beltSystem = new BeltSystem();

  private readonly spawnSystem = new SpawnSystem(this.beltSystem);

  private readonly inputSystem = new InputSystem();

  private readonly sortingSystem = new SortingSystem();

  private readonly scoreSystem = new ScoreSystem();

  private readonly beltEventSystem = new BeltEventSystem();

  private readonly shiftSystem = new ShiftSystem();

  private termite!: Player;

  private skanky!: Player;

  private termiteTruck!: TruckZone;

  private skankyTruck!: TruckZone;

  private bulkPileZone!: BulkPileZone;

  private pileUpZone!: PileUpZone;

  private ralphTruckEvent!: RalphTruckEvent;

  private johnRushtonEvent!: JohnRushtonEvent;

  private benGunmanEvent!: BenGunmanEvent;

  private vicMassageEvent!: VicMassageEvent;

  private unitedWayEvent!: UnitedWayEvent;

  private truckExhaustEvent!: TruckExhaustEvent;

  private hud!: Hud;

  private vic!: VicNpc;

  private shan!: ShanNpc;

  private buttons: RedButton[] = [];

  private flavorNpcs: FlavorNpc[] = [];

  private exhaustTruckConfigs: ExhaustTruckConfig[] = [];

  private readonly ambientBeltPackages: Package[] = [];

  private ambientPackageSpawnTimerMs = 2600;

  private kylie!: KylieNpc;

  private hussanNpc!: FlavorNpc;

  private brianNpc!: FlavorNpc;

  private benNpc!: FlavorNpc;

  private ajNpc!: FlavorNpc;

  private snakeCellTimerMs = randomTimedEventDelayMs();

  private snakeCellEventPlayed = false;

  private snakeCellPackage: Phaser.GameObjects.Container | null = null;

  private brianShoutTimerMs = randomTimedEventDelayMs();

  private brianSendDownEventPlayed = false;

  private brianBurstRemaining = 0;

  private brianBurstSpacingMs = 0;

  private brianEventLockMs = 0;

  private johnRushtonTimerMs = randomTimedEventDelayMs();

  private johnRushtonEventPlayed = false;

  private benGunmanTimerMs = randomTimedEventDelayMs();

  private vicMassageTimerMs = randomTimedEventDelayMs();

  private vicMassageEventPlayed = false;

  private unitedWayTimerMs = randomTimedEventDelayMs();

  private unitedWayEventPlayed = false;

  private truckExhaustGameplayMs = 0;

  private ralphTruckEventPlayed = false;

  private isSceneTransitioning = false;

  private endShiftCelebrationStarted = false;

  private readonly endShiftTruckGroups: EndShiftTruckGroup[] = [];

  private movementKeys!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.isSceneTransitioning = false;
    this.input.enabled = true;
    audioSystem.startMusic('game');
    this.scoreSystem.reset();
    this.snakeCellTimerMs = randomTimedEventDelayMs();
    this.snakeCellEventPlayed = false;
    this.snakeCellPackage = null;
    this.ambientBeltPackages.length = 0;
    this.ambientPackageSpawnTimerMs = 2600;
    this.brianShoutTimerMs = randomTimedEventDelayMs();
    this.brianSendDownEventPlayed = false;
    this.brianBurstRemaining = 0;
    this.brianBurstSpacingMs = 0;
    this.brianEventLockMs = 0;
    this.johnRushtonTimerMs = randomTimedEventDelayMs();
    this.johnRushtonEventPlayed = false;
    this.benGunmanTimerMs = randomTimedEventDelayMs();
    this.vicMassageTimerMs = randomTimedEventDelayMs();
    this.vicMassageEventPlayed = false;
    this.unitedWayTimerMs = randomTimedEventDelayMs();
    this.unitedWayEventPlayed = false;
    this.truckExhaustGameplayMs = 0;
    this.ralphTruckEventPlayed = false;
    this.endShiftCelebrationStarted = false;
    this.endShiftTruckGroups.length = 0;
    this.cameras.main.setBackgroundColor(colors.warehouseFloorDark);
    this.drawWarehouse();
    this.beltSystem.create(this);
    this.spawnSystem.create(this);
    this.createZones();
    this.createButtons();
    this.createNpcs();
    this.createAmbientWorkers();
    this.ralphTruckEvent = new RalphTruckEvent(this, this.bulkPileZone);
    this.johnRushtonEvent = new JohnRushtonEvent(this);
    this.benGunmanEvent = new BenGunmanEvent(this, this.benNpc);
    this.vicMassageEvent = new VicMassageEvent(this, this.ajNpc);
    this.unitedWayEvent = new UnitedWayEvent(this, this.flavorNpcs);
    this.truckExhaustEvent = new TruckExhaustEvent(this, this.exhaustTruckConfigs, this.flavorNpcs);
    this.createPlayers();
    this.createInput();
    this.sortingSystem.create(
      this,
      {
        truckZones: [this.termiteTruck, this.skankyTruck],
        bulkPileZone: this.bulkPileZone,
        pileUpZone: this.pileUpZone,
      },
      this.scoreSystem,
    );
    this.hud = new Hud(this, this.inputSystem.getControlsHint());
    this.beltEventSystem.create(this, {
      beltSystem: this.beltSystem,
      buttons: this.buttons,
      vic: this.vic,
      shan: this.shan,
      getPackages: () => this.spawnSystem.getPackages(),
      onGameOver: (data) => this.triggerGameOver(data),
      canStartEvent: () => !this.isAnyTimedEventActive(),
      onEventStarted: () => this.markTimedEventStarted(),
      onMesaDreamRequested: () => this.startMesaDreamTransition(),
    });
    this.shiftSystem.create(this, {
      beltSystem: this.beltSystem,
      spawnSystem: this.spawnSystem,
      beltEventSystem: this.beltEventSystem,
      onShiftComplete: (results) => this.transitionToResults(results),
    });
    this.events.once('shift-ended-horn', () => this.startEndShiftCelebration());

    this.pileUpZone.setOverflowHandler(() => {
      this.triggerGameOver();
    });
  }

  update(_time: number, delta: number): void {
    if (this.isSceneTransitioning) {
      return;
    }

    for (const flavorNpc of this.flavorNpcs) {
      flavorNpc.update(delta);
    }

    this.ralphTruckEvent.update(delta);
    this.johnRushtonEvent.update(delta);
    this.benGunmanEvent.update(delta);
    this.vicMassageEvent.update(delta);
    this.unitedWayEvent.update(delta);
    this.truckExhaustEvent.update(delta);
    this.kylie.update(delta);

    this.shiftSystem.update(
      delta,
      this.scoreSystem.getState(),
      this.spawnSystem.getPackages().length,
      this.getPlayersHoldingCount(),
    );

    this.updateSnakeCellEvent(delta);
    this.updateBrianSendDownEvent(delta);
    this.updateJohnRushtonEvent(delta);
    this.updateBenGunmanEvent(delta);
    this.updateVicMassageEvent(delta);
    this.updateUnitedWayEvent(delta);
    this.updateTruckExhaustEvent(delta);

    if (this.isSceneTransitioning) {
      return;
    }

    this.beltEventSystem.update(delta);
    this.beltSystem.update(delta);
    this.spawnSystem.update(delta);
    this.updateAmbientBeltPackages(delta);
    this.handleAmbientNpcPickups();

    const playerInputBlocked = this.endShiftCelebrationStarted || this.beltEventSystem.isBlockingPlayerInput();
    const controls = this.shiftSystem.isGameplayActive() && !playerInputBlocked
      ? this.getMovementState()
      : this.getIdleMovementState();

    this.termite.update(delta, controls);
    this.skanky.update(delta, controls);
    this.termite.syncHeldPackagePosition();
    this.skanky.syncHeldPackagePosition();

    if (!playerInputBlocked) {
      this.termite.tryAutoDrop((item, player) => this.sortingSystem.checkDrop(item, player));
      this.skanky.tryAutoDrop((item, player) => this.sortingSystem.checkDrop(item, player));
    }

    for (const item of this.spawnSystem.getPackages()) {
      item.update(delta);

      if (item.y > BELT_BOTTOM && !item.isHeld && !item.isSorted) {
        this.sortingSystem.handleBeltEnd(item);
      }
    }

    if (
      this.shiftSystem.isGameplayActive() &&
      !this.ralphTruckEventPlayed &&
      !this.isAnyTimedEventActive() &&
      !this.ralphTruckEvent.isActive() &&
      this.bulkPileZone.getCount() >= 5
    ) {
      if (this.ralphTruckEvent.start()) {
        this.ralphTruckEventPlayed = true;
        this.markTimedEventStarted();
      }
    }

    this.hud.updateHud(
      this.scoreSystem.getState(),
      this.inputSystem.getActivePlayer().id,
      this.shiftSystem.getRemainingMs(),
      this.beltEventSystem.getNextVicTime(),
      this.beltSystem.isRunning(),
    );
  }

  private isAnyTimedEventActive(): boolean {
    return (
      this.beltEventSystem.isEventActive() ||
      this.ralphTruckEvent.isActive() ||
      this.johnRushtonEvent.isActive() ||
      this.benGunmanEvent.isActive() ||
      this.vicMassageEvent.isActive() ||
      this.unitedWayEvent.isActive() ||
      this.truckExhaustEvent.isActive() ||
      this.brianEventLockMs > 0 ||
      this.brianBurstRemaining > 0 ||
      this.isSnakeCellEventActive() ||
      this.endShiftCelebrationStarted
    );
  }

  private isSnakeCellEventActive(): boolean {
    return (
      this.snakeCellPackage !== null ||
      this.hussanNpc.state === 'specialApproaching' ||
      this.hussanNpc.state === 'specialDancing' ||
      this.hussanNpc.state === 'specialReset'
    );
  }

  private markTimedEventStarted(): void {
    this.resetTimedEventTimers();
  }

  private resetTimedEventTimers(): void {
    this.snakeCellTimerMs = randomTimedEventDelayMs();
    this.brianShoutTimerMs = randomTimedEventDelayMs();
    this.johnRushtonTimerMs = randomTimedEventDelayMs();
    this.benGunmanTimerMs = randomTimedEventDelayMs();
    this.vicMassageTimerMs = randomTimedEventDelayMs();
    this.unitedWayTimerMs = randomTimedEventDelayMs();
    this.beltEventSystem.resetEventTimer();

  }

  private createPlayers(): void {
    this.termite = new Player(this, 100, 560, {
      id: 'termite',
      sideConstraint: 'left',
    });

    this.skanky = new Player(this, 860, 560, {
      id: 'skanky',
      sideConstraint: 'right',
    });
  }

  private createZones(): void {
    this.termiteTruck = new TruckZone(this, {
      id: 'termite-truck',
      label: 'HERES UR SOVICE',
      acceptedDestination: 'HERES_UR_SOVICE',
      side: 'left',
      x: 268,
      y: 532,
    });

    this.skankyTruck = new TruckZone(this, {
      id: 'skanky-truck',
      label: 'PAYTMAN',
      acceptedDestination: 'PAYTMAN',
      side: 'right',
      x: 692,
      y: 532,
    });
    this.exhaustTruckConfigs = [
      { id: 'termite-truck', x: 268, y: 532, side: 'left' },
      { id: 'skanky-truck', x: 692, y: 532, side: 'right' },
    ];
    const paytmanFishTank = this.createPaytmanFishTank(762, 558);
    this.endShiftTruckGroups.push(
      { targets: [this.termiteTruck], deltaX: -430 },
      { targets: [this.skankyTruck, paytmanFishTank], deltaX: 430 },
    );

    this.bulkPileZone = new BulkPileZone(this, {
      x: 480,
      y: 580,
    });

    this.pileUpZone = new PileUpZone(this, {
      x: 480,
      y: 612,
    });
  }

  private createButtons(): void {
    const positions = isMobileBrowser() ? [180, 360] : [180, 360, 540];
    const leftButtonX = BELT_LEFT - 20;
    const rightButtonX = BELT_RIGHT + 20;

    this.buttons = [
      ...positions.map(
        (y, index) =>
          new RedButton(this, {
            id: `left-button-${index}`,
            x: leftButtonX,
            y,
          }),
      ),
      ...positions.map(
        (y, index) =>
          new RedButton(this, {
            id: `right-button-${index}`,
            x: rightButtonX,
            y,
          }),
      ),
    ];
  }

  private createNpcs(): void {
    this.vic = new VicNpc(this);
    this.shan = new ShanNpc(this);
  }

  private createAmbientWorkers(): void {
    const ambientConfigs = [
      {
        id: 'hussan' as const,
        name: 'Hussan',
        label: 'HUSSAN',
        side: 'left' as const,
        truckX: 244,
        truckY: 148,
        truckColor: colors.upsBrownMid,
        homePos: new Phaser.Math.Vector2(150, 198),
        sidePilePos: new Phaser.Math.Vector2(BELT_LEFT - 20, 158),
        truckPos: new Phaser.Math.Vector2(288, 158),
      },
      {
        id: 'aj' as const,
        name: 'AJ',
        label: 'AJ',
        side: 'left' as const,
        truckX: 244,
        truckY: 244,
        truckColor: colors.upsBrownMid,
        homePos: new Phaser.Math.Vector2(150, 294),
        sidePilePos: new Phaser.Math.Vector2(BELT_LEFT - 20, 254),
        truckPos: new Phaser.Math.Vector2(288, 254),
      },
      {
        id: 'ben' as const,
        name: 'Ben',
        label: 'PAULA ABDUL',
        side: 'left' as const,
        truckX: 244,
        truckY: 340,
        truckColor: colors.destPurple,
        homePos: new Phaser.Math.Vector2(150, 390),
        sidePilePos: new Phaser.Math.Vector2(BELT_LEFT - 20, 350),
        truckPos: new Phaser.Math.Vector2(288, 350),
      },
      {
        id: 'bannerman' as const,
        name: 'Bannerman',
        label: 'BANNERMAN',
        side: 'left' as const,
        truckX: 244,
        truckY: 436,
        truckColor: colors.upsBrownMid,
        homePos: new Phaser.Math.Vector2(150, 486),
        sidePilePos: new Phaser.Math.Vector2(BELT_LEFT - 20, 446),
        truckPos: new Phaser.Math.Vector2(288, 446),
      },
      {
        id: 'froodoo' as const,
        name: 'Fruit Loop',
        label: 'FRUIT LOOP',
        side: 'right' as const,
        truckX: 716,
        truckY: 148,
        truckColor: colors.upsBrownMid,
        homePos: new Phaser.Math.Vector2(810, 198),
        sidePilePos: new Phaser.Math.Vector2(BELT_RIGHT + 20, 158),
        truckPos: new Phaser.Math.Vector2(672, 158),
      },
      {
        id: 'dorothy' as const,
        name: 'Doris',
        label: 'DORIS',
        side: 'right' as const,
        truckX: 716,
        truckY: 244,
        truckColor: colors.upsBrownMid,
        homePos: new Phaser.Math.Vector2(810, 294),
        sidePilePos: new Phaser.Math.Vector2(BELT_RIGHT + 20, 254),
        truckPos: new Phaser.Math.Vector2(672, 254),
      },
      {
        id: 'brian' as const,
        name: 'Brian',
        label: 'BRIAN',
        side: 'right' as const,
        truckX: 716,
        truckY: 340,
        truckColor: colors.upsBrownMid,
        homePos: new Phaser.Math.Vector2(810, 390),
        sidePilePos: new Phaser.Math.Vector2(BELT_RIGHT + 20, 350),
        truckPos: new Phaser.Math.Vector2(672, 350),
      },
      {
        id: 'donna' as const,
        name: 'Donna',
        label: 'DONNA',
        side: 'right' as const,
        truckX: 716,
        truckY: 436,
        truckColor: colors.upsBrownMid,
        homePos: new Phaser.Math.Vector2(810, 486),
        sidePilePos: new Phaser.Math.Vector2(BELT_RIGHT + 20, 446),
        truckPos: new Phaser.Math.Vector2(672, 446),
      },
    ];

    this.flavorNpcs = [];

    for (const config of ambientConfigs) {
      this.exhaustTruckConfigs.push({
        id: `${config.id}-truck`,
        x: config.truckX,
        y: config.truckY,
        side: config.side,
      });

      this.createDecorativeTruck(
        config.truckX,
        config.truckY,
        config.side,
        config.label,
        config.truckColor,
      );

      this.flavorNpcs.push(
        new FlavorNpc(this, {
          id: config.id,
          name: config.name,
          homePos: config.homePos,
          truckPos: config.truckPos,
          sidePilePos: config.sidePilePos,
        }),
      );

      if (config.id === 'hussan') {
        this.hussanNpc = this.flavorNpcs[this.flavorNpcs.length - 1];
      }

      if (config.id === 'aj') {
        this.ajNpc = this.flavorNpcs[this.flavorNpcs.length - 1];
      }

      if (config.id === 'ben') {
        this.benNpc = this.flavorNpcs[this.flavorNpcs.length - 1];
      }

      if (config.id === 'brian') {
        this.brianNpc = this.flavorNpcs[this.flavorNpcs.length - 1];
      }
    }

    this.kylie = new KylieNpc(this);
  }

  private createInput(): void {
    const keyboard = this.input.keyboard;

    if (!keyboard) {
      throw new Error('Keyboard input is required for GameScene.');
    }

    this.movementKeys = keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      s: Phaser.Input.Keyboard.KeyCodes.S,
    }) as GameScene['movementKeys'];

    const toggleMute = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      audioSystem.toggleMuted();
      audioSystem.play('button');
    };
    keyboard.on('keydown-M', toggleMute);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown-M', toggleMute);
    });

    this.inputSystem.create(this, this.termite, this.skanky, () =>
      this.spawnSystem.getPackages(),
      (player) => this.tryDigOutForPlayer(player),
      () => !this.endShiftCelebrationStarted && !this.beltEventSystem.isBlockingPlayerInput(),
    );
  }

  private tryDigOutForPlayer(player: Player): boolean {
    const recoveredPackage = player.tryDigOut(this.pileUpZone, (record) =>
      this.spawnSystem.createRecoveredPackage(player.x, player.y, record),
    );

    return Boolean(recoveredPackage);
  }

  private transitionToResults(results: ShiftResultsData): void {
    if (this.isSceneTransitioning) {
      return;
    }

    this.isSceneTransitioning = true;
    this.beltSystem.stop();
    this.spawnSystem.setSpawningEnabled(false);
    this.beltEventSystem.stopEvents();
    this.ralphTruckEvent.forceHide();
    this.johnRushtonEvent.forceHide();
    this.benGunmanEvent.forceHide();
    this.vicMassageEvent.forceHide();
    this.unitedWayEvent.forceHide();
    this.truckExhaustEvent.forceHide();
    for (const item of this.ambientBeltPackages) {
      item.destroy(true);
    }
    this.ambientBeltPackages.length = 0;
    this.snakeCellPackage?.destroy(true);
    this.snakeCellPackage = null;
    this.input.enabled = false;
    this.cameras.main.flash(260, 255, 248, 196);
    this.cameras.main.fadeOut(680, 18, 12, 8);

    this.time.delayedCall(760, () => {
      this.scene.start('ResultsScene', results);
    });
  }

  private startEndShiftCelebration(): void {
    if (this.endShiftCelebrationStarted || this.isSceneTransitioning) {
      return;
    }

    this.endShiftCelebrationStarted = true;
    this.beltSystem.stop();
    this.beltEventSystem.stopEvents();
    this.ralphTruckEvent.forceHide();
    this.johnRushtonEvent.forceHide();
    this.benGunmanEvent.forceHide();
    this.vicMassageEvent.forceHide();
    this.unitedWayEvent.forceHide();
    this.truckExhaustEvent.forceHide();
    this.snakeCellPackage?.destroy(true);
    this.snakeCellPackage = null;

    this.cameras.main.flash(220, 255, 248, 196);
    audioSystem.play('results');
    this.celebrateWorkers();
    this.animateTruckDepartures();
  }

  private celebrateWorkers(): void {
    const playerLines = ['SHIFT DONE!', 'CLOCKED OUT!'];
    this.termite.announce(playerLines[0], 4200);
    this.skanky.announce(playerLines[1], 4200);

    const banner = this.add.text(GAME_WIDTH / 2, 102, 'SHIFT COMPLETE', {
      color: '#fff2bd',
      fontFamily: 'Arial',
      fontSize: '34px',
      fontStyle: 'bold',
      stroke: '#281806',
      strokeThickness: 5,
    });
    banner.setOrigin(0.5);
    banner.setDepth(80);
    banner.setAlpha(0);
    this.tweens.add({
      targets: banner,
      y: 88,
      alpha: { from: 0, to: 1 },
      scaleX: { from: 0.88, to: 1 },
      scaleY: { from: 0.88, to: 1 },
      duration: 340,
      ease: 'Back.Out',
    });
    this.tweens.add({
      targets: banner,
      alpha: 0,
      y: 70,
      duration: 700,
      delay: 3600,
      ease: 'Sine.In',
      onComplete: () => banner.destroy(),
    });

    this.tweens.add({
      targets: [this.termite, this.skanky],
      scaleX: { from: 1, to: 1.12 },
      scaleY: { from: 1, to: 0.88 },
      angle: { from: -5, to: 5 },
      duration: 125,
      yoyo: true,
      repeat: 14,
      ease: 'Sine.InOut',
      onComplete: () => {
        this.termite.setScale(1);
        this.termite.setAngle(0);
        this.skanky.setScale(1);
        this.skanky.setAngle(0);
      },
    });

    const workerLines = [
      'WE MADE IT!',
      'GO HOME!',
      'CLOCK OUT!',
      'SHIFT DONE!',
      'TRUCKS OUT!',
      "BELT'S DEAD!",
      'WE SURVIVED!',
      'LAST TRUCK OUT!',
    ];

    for (const worker of this.flavorNpcs) {
      if (!worker.visible || worker.state === 'dead') {
        continue;
      }

      worker.announce(Phaser.Utils.Array.GetRandom(workerLines), 3800);
      this.tweens.add({
        targets: worker,
        scaleX: { from: worker.scaleX, to: worker.scaleX * 1.1 },
        scaleY: { from: worker.scaleY, to: worker.scaleY * 0.9 },
        angle: { from: -4, to: 4 },
        duration: 145,
        yoyo: true,
        repeat: 10,
        delay: Phaser.Math.Between(0, 420),
        ease: 'Sine.InOut',
        onComplete: () => {
          worker.setAngle(0);
        },
      });
    }
  }

  private animateTruckDepartures(): void {
    this.endShiftTruckGroups.forEach((group, index) => {
      this.tweens.killTweensOf(group.targets);
      this.tweens.add({
        targets: group.targets,
        x: `+=${group.deltaX}`,
        alpha: 0,
        duration: 3300,
        delay: 650 + index * 120,
        ease: 'Cubic.InOut',
      });
    });
  }

  private startMesaDreamTransition(): void {
    if (this.isSceneTransitioning) {
      return;
    }

    this.isSceneTransitioning = true;
    this.beltSystem.stop();
    this.spawnSystem.setSpawningEnabled(false);
    this.beltEventSystem.stopEvents();
    this.ralphTruckEvent.forceHide();
    this.johnRushtonEvent.forceHide();
    this.benGunmanEvent.forceHide();
    this.vicMassageEvent.forceHide();
    this.unitedWayEvent.forceHide();
    this.truckExhaustEvent.forceHide();
    this.snakeCellPackage?.destroy(true);
    this.snakeCellPackage = null;
    this.input.enabled = false;
    audioSystem.play('switch');

    const bubble = this.add.container(this.skanky.x, this.skanky.y - 82);
    bubble.setDepth(120);
    bubble.setScale(0.18);

    const cloud = this.add.graphics();
    cloud.fillStyle(0xfff6df, 0.96);
    cloud.lineStyle(4, colors.white, 0.95);
    cloud.fillEllipse(0, 0, 180, 118);
    cloud.strokeEllipse(0, 0, 180, 118);
    cloud.fillCircle(-72, 12, 34);
    cloud.strokeCircle(-72, 12, 34);
    cloud.fillCircle(-40, -38, 42);
    cloud.strokeCircle(-40, -38, 42);
    cloud.fillCircle(18, -48, 46);
    cloud.strokeCircle(18, -48, 46);
    cloud.fillCircle(68, -14, 38);
    cloud.strokeCircle(68, -14, 38);
    cloud.fillCircle(60, 34, 32);
    cloud.strokeCircle(60, 34, 32);

    const thoughtA = this.add.circle(-38, 66, 11, 0xfff6df, 0.94);
    thoughtA.setStrokeStyle(3, colors.white, 0.9);
    const thoughtB = this.add.circle(-20, 88, 6, 0xfff6df, 0.9);
    thoughtB.setStrokeStyle(2, colors.white, 0.82);
    const label = this.add.text(0, -4, 'MESA\nAT HOME', {
      color: '#3a2410',
      fontFamily: 'Arial',
      fontSize: '18px',
      fontStyle: 'bold',
      align: 'center',
    });
    label.setOrigin(0.5);

    bubble.add([cloud, thoughtA, thoughtB, label]);

    this.cameras.main.flash(160, 255, 246, 210);
    this.tweens.add({
      targets: bubble,
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
      scaleX: 12,
      scaleY: 12,
      duration: 950,
      ease: 'Cubic.InOut',
      onComplete: () => {
        this.scene.start('MesaDreamScene');
      },
    });
  }

  private updateSnakeCellEvent(delta: number): void {
    if (!this.shiftSystem.isGameplayActive()) {
      return;
    }

    if (this.snakeCellPackage) {
      if (this.beltSystem.isRunning()) {
        this.snakeCellPackage.y += this.beltSystem.beltSpeed * (delta / 1000);
      }

      if (this.snakeCellPackage.y >= 184) {
        this.hussanNpc.triggerSnakeCellDance(new Phaser.Math.Vector2(BELT_LEFT - 20, 184));
        this.snakeCellPackage.destroy(true);
        this.snakeCellPackage = null;
      }

      return;
    }

    if (this.isAnyTimedEventActive()) {
      return;
    }

    if (this.snakeCellEventPlayed) {
      return;
    }

    this.snakeCellTimerMs -= delta;

    if (this.snakeCellTimerMs <= 0) {
      this.spawnSnakeCellPackage();
      this.snakeCellEventPlayed = true;
      this.markTimedEventStarted();
    }
  }

  private spawnSnakeCellPackage(): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x2d3a22, 1);
    graphics.fillRoundedRect(-34, -12, 68, 24, 6);
    graphics.lineStyle(2, colors.termiteHat, 0.9);
    graphics.strokeRoundedRect(-34, -12, 68, 24, 6);
    graphics.fillStyle(colors.destPurple, 0.2);
    graphics.fillRoundedRect(-38, -16, 76, 32, 8);

    const label = this.add.text(0, 0, 'THE SNAKES CELL', {
      color: '#fff8c4',
      fontFamily: 'Arial',
      fontSize: isMobileBrowser() ? '11px' : '9px',
      fontStyle: 'bold',
    });
    label.setOrigin(0.5);

    this.snakeCellPackage = this.add.container(BELT_CENTER_X - 18, BELT_TOP + 12, [graphics, label]);
    this.snakeCellPackage.setDepth(17);
  }

  private updateBrianSendDownEvent(delta: number): void {
    if (!this.shiftSystem.isGameplayActive()) {
      return;
    }

    this.brianEventLockMs = Math.max(0, this.brianEventLockMs - delta);

    if (
      !this.brianSendDownEventPlayed &&
      this.brianBurstRemaining <= 0 &&
      !this.isAnyTimedEventActive()
    ) {
      this.brianShoutTimerMs -= delta;

      if (this.brianShoutTimerMs <= 0) {
        this.brianNpc.announce('SENDING 5 DOWN', 2400);
        Phaser.Utils.Array.GetRandom([this.termite, this.skanky]).announce(
          'YOU ARE SERIOUSLY\nSENDING 5 DOWN\nTO BULK?',
          3000,
        );
        this.brianBurstRemaining = 5;
        this.brianBurstSpacingMs = 0;
        this.brianEventLockMs = 3200;
        this.brianSendDownEventPlayed = true;
        this.markTimedEventStarted();
      }
    }

    if (this.brianBurstRemaining <= 0 || !this.beltSystem.isRunning()) {
      return;
    }

    this.brianBurstSpacingMs -= delta;

    while (this.brianBurstRemaining > 0 && this.brianBurstSpacingMs <= 0) {
      this.spawnAmbientBeltPackage();
      this.brianBurstRemaining -= 1;
      this.brianBurstSpacingMs += 170;
    }
  }

  private updateJohnRushtonEvent(delta: number): void {
    if (!this.shiftSystem.isGameplayActive() || this.johnRushtonEventPlayed) {
      return;
    }

    if (this.johnRushtonEvent.isActive()) {
      return;
    }

    if (this.isAnyTimedEventActive()) {
      return;
    }

    this.johnRushtonTimerMs -= delta;

    if (this.johnRushtonTimerMs <= 0) {
      if (this.johnRushtonEvent.start()) {
        this.johnRushtonEventPlayed = true;
        this.markTimedEventStarted();
      }
    }
  }

  private updateBenGunmanEvent(delta: number): void {
    if (
      !this.shiftSystem.isGameplayActive() ||
      this.benGunmanEvent.isActive() ||
      this.benGunmanEvent.hasPlayed()
    ) {
      return;
    }

    if (this.isAnyTimedEventActive()) {
      return;
    }

    this.benGunmanTimerMs -= delta;

    if (this.benGunmanTimerMs <= 0) {
      if (this.benGunmanEvent.start()) {
        this.markTimedEventStarted();
      }
    }
  }

  private updateVicMassageEvent(delta: number): void {
    if (
      !this.shiftSystem.isGameplayActive() ||
      this.vicMassageEvent.isActive() ||
      this.vicMassageEventPlayed ||
      this.isAnyTimedEventActive() ||
      !['idle', 'cooldown'].includes(this.beltEventSystem.getCurrentState())
    ) {
      return;
    }

    this.vicMassageTimerMs -= delta;

    if (this.vicMassageTimerMs <= 0) {
      if (this.vicMassageEvent.start()) {
        this.vicMassageEventPlayed = true;
        this.markTimedEventStarted();
      }
    }
  }

  private updateUnitedWayEvent(delta: number): void {
    if (
      !this.shiftSystem.isGameplayActive() ||
      this.unitedWayEvent.isActive() ||
      this.unitedWayEventPlayed ||
      this.isAnyTimedEventActive() ||
      !['idle', 'cooldown'].includes(this.beltEventSystem.getCurrentState())
    ) {
      return;
    }

    this.unitedWayTimerMs -= delta;

    if (this.unitedWayTimerMs <= 0) {
      if (this.unitedWayEvent.start()) {
        this.unitedWayEventPlayed = true;
        this.markTimedEventStarted();
      }
    }
  }

  private updateTruckExhaustEvent(delta: number): void {
    if (!this.shiftSystem.isGameplayActive() || this.truckExhaustEvent.hasStarted()) {
      return;
    }

    if (this.isAnyTimedEventActive()) {
      return;
    }

    this.truckExhaustGameplayMs += delta;

    if (this.truckExhaustGameplayMs >= TRUCK_EXHAUST_IDLE_DELAY_MS) {
      this.truckExhaustEvent.start();
      this.markTimedEventStarted();
    }
  }

  private updateAmbientBeltPackages(delta: number): void {
    for (let index = this.ambientBeltPackages.length - 1; index >= 0; index -= 1) {
      const item = this.ambientBeltPackages[index];
      item.speed = this.beltSystem.beltSpeed;
      item.update(delta);

      if (item.y > BELT_BOTTOM + 20 || item.isSorted) {
        item.destroy(true);
        this.ambientBeltPackages.splice(index, 1);
      }
    }

    if (!this.shiftSystem.isGameplayActive() || !this.beltSystem.isRunning()) {
      return;
    }

    this.ambientPackageSpawnTimerMs -= delta;

    while (this.ambientPackageSpawnTimerMs <= 0) {
      this.spawnAmbientBeltPackage();
      this.ambientPackageSpawnTimerMs += 2600;
    }
  }

  private spawnAmbientBeltPackage(): void {
    const item = new Package(
      this,
      Phaser.Utils.Array.GetRandom([444, 480, 516]),
      BELT_TOP + 10,
      {
        id: `ambient-${this.time.now}-${this.ambientBeltPackages.length}`,
        destination: 'BULK',
        size: Phaser.Utils.Array.GetRandom(['small_box', 'medium_box', 'large_box'] as const),
        speed: this.beltSystem.beltSpeed,
        isBeltRunning: () => this.beltSystem.isRunning(),
        labelText: '',
        playerPickable: false,
        showSticker: false,
        showGlow: false,
      },
    );
    item.setDepth(11);
    this.ambientBeltPackages.push(item);
  }

  private handleAmbientNpcPickups(): void {
    for (const npc of this.flavorNpcs) {
      if (npc.state !== 'pickingUp') {
        continue;
      }

      const candidate = this.findClosestAmbientPackage(npc.x, npc.y);

      if (!candidate) {
        continue;
      }

      candidate.isSorted = true;
      candidate.destroy(true);
      const index = this.ambientBeltPackages.indexOf(candidate);
      if (index >= 0) {
        this.ambientBeltPackages.splice(index, 1);
      }
      npc.receiveAmbientPackage();
    }
  }

  private findClosestAmbientPackage(x: number, y: number): Package | null {
    let nearest: Package | null = null;
    let nearestDistance = 82;

    for (const item of this.ambientBeltPackages) {
      const distance = Phaser.Math.Distance.Between(x, y, item.x, item.y);
      if (distance <= nearestDistance) {
        nearest = item;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  private triggerGameOver(data?: GameOverData): void {
    if (this.isSceneTransitioning) {
      return;
    }

    this.isSceneTransitioning = true;
    audioSystem.play('game-over');
    audioSystem.startMusic('danger');
    this.beltSystem.stop();
    this.spawnSystem.setSpawningEnabled(false);
    this.beltEventSystem.stopEvents();
    this.ralphTruckEvent.forceHide();
    this.johnRushtonEvent.forceHide();
    this.benGunmanEvent.forceHide();
    this.vicMassageEvent.forceHide();
    this.unitedWayEvent.forceHide();
    this.truckExhaustEvent.forceHide();
    for (const item of this.ambientBeltPackages) {
      item.destroy(true);
    }
    this.ambientBeltPackages.length = 0;
    this.snakeCellPackage?.destroy(true);
    this.snakeCellPackage = null;
    this.input.enabled = false;
    this.cameras.main.flash(250, 255, 40, 40);
    this.cameras.main.fadeOut(500, 40, 0, 0);

    this.time.delayedCall(700, () => {
      this.scene.start('GameOverScene', data);
    });
  }

  private createDecorativeTruck(
    x: number,
    y: number,
    side: 'left' | 'right',
    label: string,
    color: number,
  ): void {
    const graphics = this.add.graphics();
    const cargoX = side === 'left' ? 10 : -10;
    const cabX = side === 'left' ? -28 : 28;
    graphics.fillStyle(colors.black, 0.18);
    graphics.fillRect(x - 54, y + 26, 108, 6);
    graphics.fillStyle(color, 0.92);
    graphics.fillRoundedRect(x + cargoX - 40, y - 22, 80, 44, 6);
    graphics.fillStyle(colors.upsBrownDark, 0.95);
    graphics.fillRoundedRect(x + cabX - 14, y - 12, 26, 26, 5);
    const wheelA = this.add.circle(x - 20, y + 24, 7, colors.black, 1);
    const wheelB = this.add.circle(x + 20, y + 24, 7, colors.black, 1);
    wheelA.setDepth(7);
    wheelB.setDepth(7);
    const text = this.add.text(x, y, label, {
      color: '#ffffff',
      fontFamily: 'Arial',
      fontSize: isMobileBrowser() ? '13px' : '10px',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: isMobileBrowser() ? 4 : 0,
    });
    text.setOrigin(0.5);
    text.setDepth(7);
    graphics.setDepth(6);
    this.endShiftTruckGroups.push({
      targets: [graphics, wheelA, wheelB, text],
      deltaX: side === 'left' ? -380 : 380,
    });
  }

  private createPaytmanFishTank(x: number, y: number): Phaser.GameObjects.Graphics {
    const tank = this.add.graphics();
    tank.fillStyle(0x243849, 0.92);
    tank.fillRoundedRect(x - 26, y - 22, 52, 34, 6);
    tank.lineStyle(3, 0x95c8e8, 0.85);
    tank.strokeRoundedRect(x - 26, y - 22, 52, 34, 6);
    tank.fillStyle(0x4ca8d8, 0.35);
    tank.fillRoundedRect(x - 22, y - 18, 44, 24, 4);
    tank.fillStyle(0x7a8a4a, 1);
    tank.fillRect(x - 18, y + 4, 8, 6);
    tank.fillRect(x + 8, y + 2, 10, 8);
    tank.fillStyle(colors.destYellow, 1);
    tank.fillEllipse(x - 4, y - 4, 12, 7);
    tank.fillStyle(colors.warningRed, 1);
    tank.fillTriangle(x + 10, y - 2, x + 18, y - 6, x + 18, y + 2);
    tank.fillStyle(colors.fluorescent, 0.4);
    tank.fillCircle(x - 12, y - 10, 2);
    tank.fillCircle(x + 4, y - 12, 1.5);
    tank.setDepth(8);
    return tank;
  }

  private getMovementState(): PlayerControls {
    const mobileControls = this.inputSystem.getMobileMovementState();

    return {
      left: this.movementKeys.left.isDown || this.movementKeys.a.isDown || mobileControls.left,
      right: this.movementKeys.right.isDown || this.movementKeys.d.isDown || mobileControls.right,
      up: this.movementKeys.up.isDown || this.movementKeys.w.isDown || mobileControls.up,
      down: this.movementKeys.down.isDown || this.movementKeys.s.isDown || mobileControls.down,
    };
  }

  private getIdleMovementState(): PlayerControls {
    return {
      left: false,
      right: false,
      up: false,
      down: false,
    };
  }

  private getPlayersHoldingCount(): number {
    return Number(Boolean(this.termite.heldPackage)) + Number(Boolean(this.skanky.heldPackage));
  }

  private drawWarehouse(): void {
    const background = this.add.graphics();
    background.fillStyle(colors.warehouseFloorDark, 1);
    background.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    background.fillStyle(colors.warehouseFloor, 0.9);
    background.fillRect(0, BELT_TOP, BELT_LEFT, BELT_BOTTOM - BELT_TOP);
    background.fillRect(BELT_RIGHT, BELT_TOP, GAME_WIDTH - BELT_RIGHT, BELT_BOTTOM - BELT_TOP);
    background.fillStyle(colors.ceiling, 1);
    background.fillRect(0, 0, GAME_WIDTH, BELT_TOP);
    background.fillStyle(colors.black, 0.5);
    background.fillRect(0, BELT_BOTTOM, GAME_WIDTH, GAME_HEIGHT - BELT_BOTTOM);
    background.fillStyle(colors.black, 0.18);
    background.fillRect(0, BELT_TOP, GAME_WIDTH, 8);
    background.fillRect(0, BELT_BOTTOM - 8, GAME_WIDTH, 8);

    const floorPattern = this.add.graphics();
    floorPattern.lineStyle(1, colors.black, 0.14);
    for (let x = 0; x <= GAME_WIDTH; x += 48) {
      floorPattern.beginPath();
      floorPattern.moveTo(x, BELT_TOP);
      floorPattern.lineTo(x, BELT_BOTTOM);
      floorPattern.strokePath();
    }
    for (let y = BELT_TOP; y <= BELT_BOTTOM; y += 36) {
      floorPattern.beginPath();
      floorPattern.moveTo(0, y);
      floorPattern.lineTo(GAME_WIDTH, y);
      floorPattern.strokePath();
    }
    floorPattern.fillStyle(colors.white, 0.03);
    for (let y = BELT_TOP + 18; y < BELT_BOTTOM; y += 72) {
      floorPattern.fillRect(24, y, BELT_LEFT - 48, 4);
      floorPattern.fillRect(BELT_RIGHT + 24, y + 16, GAME_WIDTH - BELT_RIGHT - 48, 4);
    }

    const wallPanels = this.add.graphics();
    wallPanels.fillStyle(colors.warehouseFloorDark, 0.5);
    wallPanels.fillRect(20, 110, BELT_LEFT - 40, 520);
    wallPanels.fillRect(BELT_RIGHT + 20, 110, GAME_WIDTH - BELT_RIGHT - 40, 520);
    wallPanels.lineStyle(2, colors.beltRail, 0.2);
    wallPanels.strokeRect(20, 110, BELT_LEFT - 40, 520);
    wallPanels.strokeRect(BELT_RIGHT + 20, 110, GAME_WIDTH - BELT_RIGHT - 40, 520);

    const lights = this.add.graphics();
    const lightWidth = 84;
    const lightPositions: number[] = [];
    for (let x = 84; x <= GAME_WIDTH - 84; x += 180) {
      lightPositions.push(x);
      lights.fillStyle(colors.fluorescent, 0.95);
      lights.fillRect(x - lightWidth / 2, 18, lightWidth, 8);
      lights.fillStyle(colors.white, 0.14);
      lights.fillRect(x - lightWidth / 2 + 4, 16, lightWidth - 8, 2);
      lights.fillStyle(colors.fluorescent, 0.15);
      lights.fillRect(x - lightWidth / 2 - 8, 26, lightWidth + 16, 10);
    }

    this.drawLightHalos(lightPositions, lightWidth);
    this.drawFloorGradient();
    this.drawWarehouseDetails();
    this.scheduleFluorescentFlicker(lights, lightPositions, lightWidth);
    this.spawnDustMotes();
    this.drawVignette();
  }

  private drawWarehouseDetails(): void {
    this.drawLoadingBayRow(96, 'LEFT SORT');
    this.drawLoadingBayRow(768, 'RIGHT SORT');
    this.drawSafetyMarkings();
    this.drawFloorScuffs();
    this.drawForegroundShadows();
  }

  private drawLoadingBayRow(x: number, label: string): void {
    const bay = this.add.graphics();
    bay.setDepth(1);
    bay.fillStyle(0x151412, 0.72);
    bay.fillRoundedRect(x, 84, 112, 44, 6);
    bay.fillStyle(0x24211e, 1);
    bay.fillRoundedRect(x + 6, 90, 100, 32, 5);
    bay.lineStyle(2, colors.beltRail, 0.3);
    bay.strokeRoundedRect(x + 6, 90, 100, 32, 5);
    bay.lineStyle(1, colors.white, 0.08);
    for (let y = 96; y <= 116; y += 6) {
      bay.beginPath();
      bay.moveTo(x + 12, y);
      bay.lineTo(x + 100, y);
      bay.strokePath();
    }

    const sign = this.add.text(x + 56, 73, label, {
      color: '#fff8c4',
      fontFamily: 'Arial',
      fontSize: isMobileBrowser() ? '13px' : '11px',
      fontStyle: 'bold',
    });
    sign.setOrigin(0.5);
    sign.setLetterSpacing(1);
    sign.setDepth(2);
  }

  private drawSafetyMarkings(): void {
    const markings = this.add.graphics();
    markings.setDepth(2);

    for (const x of [BELT_LEFT - 20, BELT_RIGHT + 20]) {
      markings.lineStyle(3, colors.destYellow, 0.58);
      markings.beginPath();
      markings.moveTo(x, BELT_TOP + 28);
      markings.lineTo(x, BELT_BOTTOM - 40);
      markings.strokePath();

      markings.fillStyle(colors.black, 0.34);
      for (let y = BELT_TOP + 32; y < BELT_BOTTOM - 48; y += 30) {
        markings.fillTriangle(x - 7, y, x + 7, y + 10, x - 7, y + 20);
      }
    }

    markings.lineStyle(2, colors.white, 0.09);
    for (let y = 154; y <= 532; y += 96) {
      markings.beginPath();
      markings.moveTo(52, y);
      markings.lineTo(BELT_LEFT - 42, y - 18);
      markings.strokePath();
      markings.beginPath();
      markings.moveTo(BELT_RIGHT + 42, y - 18);
      markings.lineTo(GAME_WIDTH - 52, y);
      markings.strokePath();
    }
  }

  private drawFloorScuffs(): void {
    const scuffs = this.add.graphics();
    scuffs.setDepth(2.5);

    for (let index = 0; index < 54; index += 1) {
      const side = index % 2 === 0 ? 'left' : 'right';
      const x =
        side === 'left'
          ? Phaser.Math.Between(38, BELT_LEFT - 56)
          : Phaser.Math.Between(BELT_RIGHT + 56, GAME_WIDTH - 38);
      const y = Phaser.Math.Between(BELT_TOP + 46, BELT_BOTTOM - 72);
      const width = Phaser.Math.Between(12, 46);
      const alpha = Phaser.Math.FloatBetween(0.04, 0.12);
      scuffs.lineStyle(1, colors.black, alpha);
      scuffs.beginPath();
      scuffs.moveTo(x, y);
      scuffs.lineTo(x + width, y + Phaser.Math.Between(-4, 4));
      scuffs.strokePath();
    }
  }

  private drawForegroundShadows(): void {
    const shadows = this.add.graphics();
    shadows.setDepth(4);
    shadows.fillStyle(colors.black, 0.15);
    shadows.fillEllipse(248, 584, 164, 36);
    shadows.fillEllipse(712, 584, 164, 36);
    shadows.fillStyle(colors.black, 0.1);
    shadows.fillEllipse(480, 638, 138, 34);
  }

  private drawLightHalos(positions: number[], lightWidth: number): void {
    const halos = this.add.graphics();
    halos.setDepth(0.5);
    for (const x of positions) {
      for (let radius = 90; radius > 0; radius -= 18) {
        const alpha = 0.04 * (90 / Math.max(radius, 1));
        halos.fillStyle(colors.fluorescent, Math.min(0.16, alpha));
        halos.fillEllipse(x, 30, lightWidth + radius * 1.4, 32 + radius * 0.5);
      }
    }
  }

  private drawFloorGradient(): void {
    const gradient = this.add.graphics();
    gradient.setDepth(0.4);
    const gradientHeight = BELT_BOTTOM - BELT_TOP;
    const steps = 24;
    for (let i = 0; i < steps; i += 1) {
      const t = i / (steps - 1);
      const alpha = t * 0.32;
      gradient.fillStyle(colors.black, alpha * 0.6);
      const y = BELT_TOP + (gradientHeight * i) / steps;
      const stepH = gradientHeight / steps + 1;
      gradient.fillRect(0, y, BELT_LEFT, stepH);
      gradient.fillRect(BELT_RIGHT, y, GAME_WIDTH - BELT_RIGHT, stepH);
    }
  }

  private scheduleFluorescentFlicker(
    lights: Phaser.GameObjects.Graphics,
    positions: number[],
    lightWidth: number,
  ): void {
    const flicker = () => {
      this.tweens.add({
        targets: lights,
        alpha: { from: 1, to: Phaser.Math.FloatBetween(0.55, 0.78) },
        duration: Phaser.Math.Between(60, 120),
        yoyo: true,
        repeat: Phaser.Math.Between(0, 2),
        onComplete: () => {
          lights.setAlpha(1);
        },
      });
      this.time.delayedCall(Phaser.Math.Between(4500, 11000), flicker);
    };
    this.time.delayedCall(Phaser.Math.Between(2000, 6000), flicker);
    void positions;
    void lightWidth;
  }

  private spawnDustMotes(): void {
    const textureKey = 'dust-mote-tex';
    if (!this.textures.exists(textureKey)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(4, 4, 3);
      g.generateTexture(textureKey, 8, 8);
      g.destroy();
    }
    const motes = this.add.particles(0, 0, textureKey, {
      x: { min: 0, max: GAME_WIDTH },
      y: { min: BELT_TOP + 40, max: BELT_BOTTOM - 40 },
      lifespan: { min: 8000, max: 14000 },
      speedX: { min: -8, max: 8 },
      speedY: { min: -4, max: 4 },
      scale: { start: 0.45, end: 0.05 },
      alpha: { start: 0.18, end: 0 },
      tint: [0xfff8c4, 0xffffff, 0xc8b890],
      frequency: 320,
      quantity: 1,
      blendMode: Phaser.BlendModes.ADD,
    });
    motes.setDepth(8);
  }

  private drawVignette(): void {
    const vignette = this.add.graphics();
    vignette.setDepth(80);
    const layers = 14;
    for (let i = 0; i < layers; i += 1) {
      const t = i / (layers - 1);
      const alpha = Math.pow(t, 1.6) * 0.45;
      vignette.fillStyle(colors.black, alpha * 0.18);
      const inset = (layers - 1 - i) * 6;
      vignette.fillRect(0, 0, GAME_WIDTH, inset);
      vignette.fillRect(0, GAME_HEIGHT - inset, GAME_WIDTH, inset);
      vignette.fillRect(0, 0, inset, GAME_HEIGHT);
      vignette.fillRect(GAME_WIDTH - inset, 0, inset, GAME_HEIGHT);
    }
  }
}
