import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { MESA } from '../game/slice/DepotReferences';
import { clearDepotFootprint, DEPOT_BODY_RADIUS, DEPOT_CARRY_RADIUS, depotSolidFootprints, type FootprintCircle } from '../game/slice/DepotClearance';
import { KeyReturnModel, MallModel, MALL_RULES, type MallEvent } from '../game/slice/MallModel';
import {
  ROUTE_INFO, SHIFT_LAYOUT, ShiftModel, THROWING, floorPileSlot, type Parcel, type Route, type ShiftEvent, type WorkerId,
} from '../game/slice/ShiftModel';
import { Cutscene, StoryRun, type StoryChoices } from '../game/slice/StoryModel';
import {
  DRIVE_TO_MALL, DRIVE_TO_UPS, GO_HOME, KEY_RETURN_LINES, MALL_ASSIGNMENT, MALL_INTRO, SCRUM, SPEAKER_NAMES,
  type StoryActor, type StoryBeat, type StoryScene,
} from '../game/slice/StoryScript';
import { audioSystem, type SoundEffect } from '../game/systems/AudioSystem';
import { syncCharacterModels, useCharacterModels, type CharacterModelEntry } from './characterModels';
import { animateCharacter, createCharacter, mergeCharacter, type Character } from './characters';
import { CrewLife } from './crew';
import { MesaDream } from './dream';
import { MesaEncounter } from './mesa';
import { BEN_CAST, BEN_END, BEN_START, SetPieces } from './setpieces';
import { StoryStage, directDepot } from './story';
import { TouchControls } from './touch';
import { Overlay } from './overlay';
import { alignParcelToSurface, createParcelView, setParcelCarried, type ParcelView } from './parcels';
import { disposeObject3D } from './resources';
import {
  BELT_HEIGHT, PLATFORM_HEIGHT, ROUTE_COLORS, actorSurfaceAt, setFromModel, surfaceAt, textSprite, toWorld, toWorldX, toWorldZ,
} from './space';
import { DepotWorld, SKANKY_SPEC, TERMITE_SPEC } from './world';

type AppState = 'briefing' | 'story' | 'countdown' | 'playing' | 'interlude' | 'mesa' | 'dream' | 'paused' | 'celebrating' | 'mall' | 'lot' | 'ended';
type Resumable = 'playing' | 'interlude' | 'story' | 'mall' | 'lot';

const PHASE_LABELS: Record<string, string> = {
  lesson: '01  /  FIND YOUR RHYTHM', flow: '02  /  KEEP IT MOVING', rush: '03  /  LAST DISPATCH',
  cleanup: '04  /  CLEAR THE LINE', ended: 'SHIFT COMPLETE',
};
const EVENT_SOUNDS: Partial<Record<ShiftEvent['type'], SoundEffect>> = {
  grab: 'grab', drop: 'drop', sort: 'correct', wrong: 'wrong', miss: 'pile-up',
  recover: 'dig', brake: 'belt-stop', switch: 'switch', phase: 'event-alert', end: 'shift-end',
  brian: 'event-alert', spill: 'drop', throw: 'throw', damage: 'smash', scanner: 'event-alert',
};
const BEAT_SOUNDS: Record<NonNullable<StoryBeat['sound']>, SoundEffect> = {
  engine: 'engine', cough: 'cough', horn: 'horn', gate: 'gate', door: 'button', spill: 'splash', register: 'register', truck: 'truck', sign: 'sign',
};
const FACING_ANGLE = { right: Math.PI / 2, left: -Math.PI / 2, down: 0, up: Math.PI } as const;
const NEW_ROUTES: readonly Route[] = ['D', 'E', 'T', 'S'];
/** How long a broken parcel stays visible where it landed, in seconds. */
const DAMAGE_VISIBLE_S = 8;

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    // Release the probe at once; browsers cap live WebGL contexts.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

function showWebglFallback(host: HTMLElement): void {
  host.innerHTML = `<div class="b3d-fallback" style="position:fixed;inset:0;display:grid;place-items:center;background:#0b171c;color:#edf0de;font:16px 'Segoe UI',Arial,sans-serif;text-align:center;padding:24px">
    <div><h1 style="font-size:28px;margin:0 0 12px">THE BELT</h1>
    <p>The 3D night shift needs WebGL, which this browser has turned off.</p>
    <p><a style="color:#edb765" href="${window.location.pathname}?mode=2d">Play the 2D night shift instead</a></p></div></div>`;
}

const escapeHtml = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export class Belt3d {
  public model = new ShiftModel();
  public state: AppState = 'briefing';
  public story = new StoryRun();
  /** The cutscene on screen, if any. */
  public cutscene: Cutscene | null = null;
  public mall: MallModel | null = null;
  public lot: KeyReturnModel | null = null;
  public readonly overlay: Overlay;
  public readonly world: DepotWorld;
  public readonly stage: StoryStage;
  public readonly quality: 'high' | 'low';
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer | null;
  private readonly renderPass: RenderPass | null;
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 140);
  private readonly cameraTarget = new THREE.Vector3();
  private readonly workers: Record<WorkerId, Character>;
  public readonly crew: CrewLife;
  public readonly setPieces: SetPieces;
  public readonly mesa: MesaEncounter;
  public readonly dream: MesaDream;
  public readonly touch: TouchControls;
  /** Ben's story clock, independent of the frozen shift. */
  public benClock = BEN_START;
  private benStarted = false;
  private pausedFrom: Resumable = 'playing';
  private forcedStory: Partial<StoryChoices> = {};
  private depotShot: { position: THREE.Vector3; look: THREE.Vector3 } | null = null;
  private readonly stolen = new Set<number>();
  private readonly parcels = new Map<number, ParcelView>();
  private readonly departing: { view: ParcelView; from: THREE.Vector3; to: THREE.Vector3; t: number; route: Route }[] = [];
  /** Broken parcels stay in view where they landed for a while. */
  private readonly broken = new Map<number, number>();
  private readonly throwers = new Map<number, WorkerId>();
  private readonly seenRoutes = new Set<Route>();
  private readonly activeRing: THREE.Mesh;
  private readonly sleepTag: THREE.Sprite;
  private readonly marker: THREE.Mesh;
  private readonly throwArc: THREE.Line;
  private readonly throwRing: THREE.Mesh;
  private readonly keys = new Set<string>();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private overview = false;
  private hint = 'Approach the belt · match letter to dock';
  private chapterHint = '';
  private countdownMs = 0;
  private time = 0;
  private lastFrame = performance.now();
  private lastRender = 0;
  private renderCost = 0;
  private banter = new Set<string>();
  private bulkVisible = 0;
  private readonly pileVisible: Record<'T' | 'S', number> = { T: 0, S: 0 };
  private readonly truckVisible: Record<'A' | 'B' | 'D' | 'E', number> = { A: 0, B: 0, D: 0, E: 0 };
  private fumeTimer = 0;
  private mallBonus = 0;

  private readonly host: HTMLElement;
  private readonly inputAbort = new AbortController();
  private readonly environment: THREE.WebGLRenderTarget;
  private tickTimer: number | undefined;
  private disposed = false;
  private readonly depotSolids = depotSolidFootprints();

  constructor(host: HTMLElement) {
    this.host = host;
    this.overlay = new Overlay(host);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const gl = this.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
    this.quality = /swiftshader|llvmpipe|software|basic render/i.test(rendererName) ? 'low' : 'high';
    this.renderer.setPixelRatio(this.quality === 'high' ? Math.min(window.devicePixelRatio, 2) : 0.6);
    // Software renderers keep the lighter procedural people and download no models.
    if (this.quality === 'low') void useCharacterModels([]);
    this.renderer.shadowMap.enabled = this.quality === 'high';
    this.renderer.shadowMap.type = this.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.overlay.root.prepend(this.renderer.domElement);

    this.world = new DepotWorld(this.quality);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.world.scene.environment = this.environment.texture;
    room.dispose();
    pmrem.dispose();
    this.world.scene.environmentIntensity = 0.18;
    this.stage = new StoryStage(this.quality);

    if (this.quality === 'high') {
      const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
      this.composer = new EffectComposer(this.renderer, target);
      this.renderPass = new RenderPass(this.world.scene, this.camera);
      this.composer.addPass(this.renderPass);
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.96));
      this.composer.addPass(new OutputPass());
    } else {
      this.composer = null;
      this.renderPass = null;
    }

    this.workers = { termite: createCharacter(TERMITE_SPEC), skanky: createCharacter(SKANKY_SPEC) };
    for (const worker of Object.values(this.workers)) {
      mergeCharacter(worker);
      this.world.scene.add(worker.root);
    }
    this.crew = new CrewLife(this.world, (id, copy, ms) => this.say(id, copy, ms));
    this.crew.caption = (text) => this.overlay.showToast(text, 2600);
    this.setPieces = new SetPieces(this.world, this.crew, (id, copy, ms) => this.say(id, copy, ms));
    this.mesa = new MesaEncounter(this.overlay, this.crew, {
      say: (id, copy, ms) => this.say(id, copy, ms),
      thought: () => this.overlay.say('skanky-thought', 'SKANKY', MESA.thought, 850, this.speakerAnchor('skanky'), true),
      dream: () => this.beginDream(),
      caught: () => this.showMesaCaught(),
      resume: () => {
        this.state = 'playing';
        this.model.paused = false;
        this.keys.clear();
      },
    });
    this.mesa.stolen = (parcel) => {
      for (const worker of this.model.workers) if (worker.heldId === parcel.id) worker.heldId = null;
      parcel.state = 'delivered';
      parcel.workerId = null;
      this.stolen.add(parcel.id);
    };
    this.dream = new MesaDream(this.overlay.root);
    this.touch = new TouchControls(this.overlay.root, {
      action: () => this.act(),
      switchWorker: () => { if (this.state === 'playing') this.model.switchWorker(); },
      brake: () => {
        if (this.state === 'playing') this.model.brake();
        else if (this.state === 'mall') this.mall?.toggleCart();
      },
      throwParcel: () => { if (this.state === 'playing') this.model.throwHeld(); },
      overview: () => { this.overview = !this.overview; },
      pause: () => { if (this.canPause()) this.pause(); },
    });
    this.overlay.onStoryButton((action) => {
      if (this.state !== 'story' || !this.cutscene) return;
      if (action === 'pause') { if (this.canPause()) this.pause(); return; }
      if (action === 'next') this.cutscene.userNext();
      else this.cutscene.skip();
    });

    this.activeRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), new THREE.MeshBasicMaterial({ color: 0xf3e6c6, transparent: true, opacity: 0.85 }));
    this.activeRing.rotation.x = -Math.PI / 2;
    this.world.scene.add(this.activeRing);
    this.sleepTag = textSprite(['zZz'], 0.3, { width: 60, height: 30, color: '#d8e2d0' });
    this.world.scene.add(this.sleepTag);
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshStandardMaterial({ color: 0xf3e6c6, emissive: 0xf3e6c6, emissiveIntensity: 0.8 }));
    this.marker.rotation.x = Math.PI;
    this.world.scene.add(this.marker);
    // The throw preview: a dashed arc to the parcel's own destination and a ring where it lands.
    this.throwArc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 24 }, () => new THREE.Vector3())),
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.9 }));
    this.throwArc.frustumCulled = false;
    this.throwArc.visible = false;
    this.throwRing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    this.throwRing.rotation.x = -Math.PI / 2;
    this.throwRing.visible = false;
    this.world.scene.add(this.throwArc, this.throwRing);

    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize(), { signal: this.inputAbort.signal });
    this.snapCamera();
    this.showBriefing();
    if (this.quality === 'high') {
      this.renderer.setAnimationLoop(() => {
        this.tick();
        this.draw();
      });
    } else {
      // Software renderers deliver animation frames slowly. The shift runs on
      // its own fixed timer so game time, input and speech stay in real time;
      // animation frames only draw.
      this.tickTimer = window.setInterval(() => this.tick(), 16);
      this.renderer.setAnimationLoop(() => this.draw());
    }
  }

  /** Stop simulation and release GPU/input resources before a hot reload or unmount. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.inputAbort.abort();
    window.clearInterval(this.tickTimer);
    this.renderer.setAnimationLoop(null);
    audioSystem.stopMusic();
    this.keys.clear();
    this.touch.dispose();
    this.world.puffs.dispose();
    this.stage.dispose();
    disposeObject3D(this.dream.scene);
    disposeObject3D(this.world.scene);
    this.environment.dispose();
    for (const pass of this.composer?.passes ?? []) pass.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.overlay.dispose();
  }

  /** Swaps the imported character model list. For checks and rehearsal. */
  public useCharacterModels(list: CharacterModelEntry[]): Promise<void> {
    return useCharacterModels(list);
  }

  /** Fixes the next run's random choices (opener, break place, variant, time). For checks and rehearsal. */
  public forceStory(choices: Partial<StoryChoices>): void {
    this.forcedStory = { ...choices };
    if (this.state === 'briefing') this.story = new StoryRun(Math.random, this.forcedStory);
  }

  private resize(): void {
    const width = this.host.clientWidth || window.innerWidth;
    const height = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
    this.camera.aspect = width / height;
    // Narrow portrait screens need a wider lens to keep both lanes in view.
    this.camera.fov = width < height ? 58 : 38;
    this.camera.updateProjectionMatrix();
    this.stage.resize(width / height);
    this.dream?.resize(width / height);
  }

  private canPause(): boolean {
    return this.state === 'playing' || this.state === 'interlude' || this.state === 'story' || this.state === 'mall' || this.state === 'lot';
  }

  /** The primary action: grab/deliver on the belt, next line in a story, interact in the mall or lot. */
  private act(): void {
    if (this.state === 'playing') this.model.action();
    else if (this.state === 'story') this.cutscene?.userNext();
    else if (this.state === 'mall') this.mall?.action();
    else if (this.state === 'lot') this.lot?.action();
  }

  private bindInput(): void {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Tab') event.preventDefault();
      if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
      this.keys.add(event.code);
      if (event.repeat) return;
      void audioSystem.unlock();
      if (this.state === 'mesa' && this.mesa.key(event.code)) {
        event.preventDefault();
        return;
      }
      if (event.code === 'Enter') {
        if (this.state === 'briefing') this.startNight();
        else if (this.state === 'story') this.cutscene?.skip();
        else if (this.state === 'ended') this.restart();
        else if (this.state === 'paused') this.resume();
      } else if (event.code === 'KeyM') {
        audioSystem.toggleMuted();
      } else if (event.code === 'Escape') {
        if (this.canPause()) this.pause();
        else if (this.state === 'paused') this.resume();
      } else if (this.state === 'story') {
        if (event.code === 'Space') this.cutscene?.userNext();
      } else if (this.state === 'mall') {
        if (event.code === 'Space') this.mall?.action();
        else if (event.code === 'KeyE') this.mall?.toggleCart();
      } else if (this.state === 'lot') {
        if (event.code === 'Space') this.lot?.action();
      } else if (event.code === 'KeyV') {
        this.overview = !this.overview;
      } else if (this.state === 'playing') {
        if (event.code === 'Space') this.model.action();
        else if (event.code === 'Tab') this.model.switchWorker();
        else if (event.code === 'KeyE') this.model.brake();
        else if (event.code === 'KeyF') this.model.throwHeld();
      }
    }, { signal: this.inputAbort.signal });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code), { signal: this.inputAbort.signal });
    window.addEventListener('blur', () => { this.keys.clear(); this.touch.reset(); if (this.canPause()) this.pause(); }, { signal: this.inputAbort.signal });
    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointerdown', (event) => {
      void audioSystem.unlock();
      // On touch screens the on-screen buttons act; a tap on the scene does not.
      if (event.pointerType === 'touch') return;
      if (this.state === 'story' && event.button === 0) { this.cutscene?.userNext(); return; }
      if (this.state === 'mall' && event.button === 0) { this.mall?.action(); return; }
      if (this.state === 'lot' && event.button === 0) { this.lot?.action(); return; }
      if (this.state !== 'playing') return;
      if (event.button === 0) this.model.action();
      else if (event.button === 2) this.model.switchWorker();
    });
  }

  private routeLegend(): string {
    const chip = (route: Route): string => `<i style="background:${ROUTE_INFO[route].color}">${route}</i>`;
    return `TERMITE ${chip('A')}${chip('D')}${chip('T')} · SKANKY ${chip('B')}${chip('E')}${chip('S')} · BOTH ${chip('C')}`;
  }

  private showBriefing(): void {
    this.overlay.setMode('shift');
    this.overlay.showPanel(`
      <div class="kicker">TERMITE &amp; SKANKY  /  ONE MORE OVERNIGHT</div>
      <h1>ANOTHER NIGHT ON THE BELT.</h1>
      <p><b>Get in, survive the scrum, dispatch ${this.model.goal} parcels, then Skanky still has a mall run.</b></p>
      <p>TERMITE loads A and D, then takes the left stairs down to T. SKANKY loads B and E, with S down the right stairs. Shared C bulk stands against the final back wall.</p>
      <p>After the warm-up, your partner sorts their own routes perfectly. Their deliveries count toward dispatch, but earn no points or combo. Your deliveries earn the score.</p>
      <p>Occasionally their scanner needs a reset. Switch to the worker named on screen, then ${this.touch.enabled ? 'tap RESET SCANNER' : 'press SPACE'} to get them sorting again. Carried freight stays safe.</p>
      ${this.touch.enabled ? `
      <p>The stick moves. SWITCH changes worker. GRAB / DELIVER picks up and delivers. THROW risks it to save the walk.</p>
      <p>BRAKE holds the belt. VIEW shows the whole warehouse. In story scenes, NEXT or SKIP.</p>` : `
      <p>WASD / arrows move. TAB or right-click switches. SPACE or click grabs and delivers.</p>
      <p>F throws a held parcel to its drop: faster, but it can break. E brakes. V overview.</p>
      <p>Story scenes: SPACE next line, ENTER skips the scene, ESC pauses.</p>`}
      <button type="button">START THE NIGHT  ↵</button>
      <a href="${window.location.pathname}?mode=2d">PLAY THE 2D DEPOT</a>
      <a href="${window.location.pathname}?mode=classic">PLAY THE ORIGINAL FULL SHIFT</a>`, () => this.startNight());
  }

  // ---------------------------------------------------------------- story flow

  private startNight(): void {
    if (this.state !== 'briefing') return;
    void audioSystem.unlock();
    audioSystem.play('ui-start');
    this.overlay.clearCenter();
    this.story.go('arrival');
    this.playScene(this.story.opener);
  }

  private playScene(scene: StoryScene): void {
    this.state = 'story';
    this.cutscene = new Cutscene(scene);
    this.keys.clear();
    this.touch.reset();
    this.overlay.clearSpeech();
    this.overlay.setMode('story');
    const kicker = scene.location === 'depot' ? 'THE DEPOT' : scene.location === 'road' ? 'ON THE ROAD' : scene.location === 'mall' ? 'THE MALL RUN' : scene.location === 'home' ? 'FINALLY' : 'THE NIGHT SHIFT';
    this.overlay.storyTitle(scene.title, kicker, scene.clock ?? '');
    if (scene.location === 'depot') {
      this.stage.end();
      this.depotShot = null;
    } else {
      this.stage.beginScene(scene);
    }
  }

  /** What follows each scene; a skipped scene takes the same path. */
  private finishScene(): void {
    const scene = this.cutscene?.scene;
    this.cutscene = null;
    this.overlay.clearSpeech();
    if (!scene) return;
    if (scene.id.startsWith('opener')) {
      this.story.go('scrum');
      this.playScene(SCRUM);
    } else if (scene.id === 'scrum') {
      this.story.go('countdown');
      this.startCountdown();
    } else if (this.story.chapter === 'break') {
      this.endBreak();
    } else if (scene.id === 'mall-assignment') {
      this.story.go('to-mall');
      this.playScene(DRIVE_TO_MALL);
    } else if (scene.id === 'drive-to-mall') {
      this.story.go('mall');
      this.playScene(MALL_INTRO);
    } else if (scene.id === 'mall-intro') {
      this.beginMall();
    } else if (scene.id === 'drive-to-ups') {
      this.story.go('return');
      this.beginLot();
    } else if (scene.id === 'go-home') {
      this.showResults();
    }
  }

  private startCountdown(): void {
    this.stage.end();
    this.overlay.setMode('shift');
    audioSystem.play('countdown');
    this.state = 'countdown';
    this.countdownMs = 0;
    this.overlay.showCount('3');
    this.syncWorkers(0);
    this.snapCamera();
  }

  /** The random mid-shift break: the shift, belt and every parcel freeze until the crew is back. */
  private beginBreak(): void {
    this.story.takeBreak(this.model.elapsedMs);
    this.story.go('break');
    this.model.paused = true;
    audioSystem.stopMusic();
    this.playScene(this.story.breakScene);
  }

  private endBreak(): void {
    this.story.go('shift');
    this.stage.end();
    this.overlay.setMode('shift');
    this.state = 'playing';
    this.model.paused = false;
    this.keys.clear();
    this.touch.reset();
    this.overlay.showToast('BACK TO THE BELT · same shift, same freight', 2200);
    audioSystem.startMusic('game');
    this.snapCamera();
  }

  private beginMall(): void {
    this.mall = new MallModel();
    this.stage.resetMall();
    this.stage.beginMall();
    this.state = 'mall';
    this.overlay.setMode('chapter');
    this.overlay.storyTitle('MALLWOOD CENTRE', 'SKANKY · THE MALL RUN', '5:20 AM');
    this.chapterHint = 'Take a store bundle from the truck';
    audioSystem.startMusic('game');
  }

  private beginLot(): void {
    this.lot = new KeyReturnModel();
    this.stage.beginLot();
    this.state = 'lot';
    this.overlay.setMode('chapter');
    this.overlay.storyTitle('BACK AT UPS', 'RETURN THE FIVE-TON', '6:22 AM');
    this.chapterHint = KEY_RETURN_LINES.prompt;
  }

  private pause(): void {
    this.pausedFrom = this.state as Resumable;
    this.state = 'paused';
    this.model.paused = true;
    if (this.mall) this.mall.paused = true;
    if (this.lot) this.lot.paused = true;
    this.keys.clear();
    audioSystem.stopMusic();
    const kicker = this.pausedFrom === 'interlude' || this.pausedFrom === 'story' ? 'STORY PAUSED' : this.pausedFrom === 'playing' ? 'SHIFT PAUSED' : 'PAUSED';
    this.overlay.showPanel(`<div class="kicker">${kicker}</div><h1>BELT ON HOLD.</h1><p>Your freight stays exactly where it is.</p><button type="button">RESUME  ↵</button>`, () => this.resume());
  }

  private resume(): void {
    this.state = this.pausedFrom;
    // The shift stays frozen through a story; only active sorting runs its clock.
    this.model.paused = this.state !== 'playing';
    if (this.mall) this.mall.paused = false;
    if (this.lot) this.lot.paused = false;
    this.overlay.clearCenter();
    if (this.state === 'playing' || this.state === 'mall') audioSystem.startMusic('game');
  }

  /** Ben's robbery freezes the shift, belt, freight and crew until Paula leaves. */
  private beginInterlude(): void {
    this.benStarted = true;
    this.state = 'interlude';
    this.model.paused = true;
    this.benClock = BEN_START;
    this.keys.clear();
    this.overlay.hold = (key) => BEN_CAST.has(key);
    this.overlay.showToast("BEN'S BIG MOMENT · belt held, your freight is safe", 3000);
    audioSystem.stopMusic();
  }

  private endInterlude(): void {
    this.state = 'playing';
    this.model.paused = false;
    this.overlay.dropSpeech((key) => BEN_CAST.has(key));
    this.overlay.hold = null;
    this.overlay.showToast('BACK TO THE BELT', 1800);
    audioSystem.startMusic('game');
  }

  private beginDream(): void {
    this.state = 'dream';
    this.overlay.root.classList.add('dreaming');
    this.dream.start();
    audioSystem.startMusic('results');
  }

  private showMesaCaught(): void {
    this.state = 'ended';
    this.model.paused = true;
    this.story.go('results');
    audioSystem.play('wrong');
    this.overlay.showPanel(`
      <div class="kicker">SHIFT TERMINATED</div>
      <h1 class="caught">${MESA.caught}</h1>
      <p>${MESA.caughtDetail}</p>
      <p><b>GAME OVER</b></p>
      <p>Vic offered a one-in-five risk. This time Shan caught you both.</p>
      <button type="button">ANOTHER SHIFT  ↵</button>`, () => this.restart());
  }

  /** A replay starts clean: no leftover scenes, parcels, timers, speech or input. */
  private restart(): void {
    for (const view of this.parcels.values()) disposeObject3D(view.root);
    for (const item of this.departing) disposeObject3D(item.view.root);
    this.parcels.clear();
    this.departing.length = 0;
    this.broken.clear();
    this.throwers.clear();
    this.seenRoutes.clear();
    this.bulkVisible = 0;
    this.pileVisible.T = this.pileVisible.S = 0;
    for (const route of ['A', 'B', 'D', 'E'] as const) { this.truckVisible[route] = 0; this.world.setTruckLoad(route, 0); }
    this.world.setFloorPile('T', 0);
    this.world.setFloorPile('S', 0);
    this.stolen.clear();
    this.benStarted = false;
    this.benClock = BEN_START;
    this.overlay.hold = null;
    this.setPieces.reset();
    this.mesa.reset();
    this.dream.stop();
    this.overlay.root.classList.remove('dreaming');
    this.model = new ShiftModel();
    this.story = new StoryRun(Math.random, this.forcedStory);
    this.cutscene = null;
    this.mall = null;
    this.lot = null;
    this.mallBonus = 0;
    this.stage.reset();
    this.stage.resetMall();
    this.depotShot = null;
    this.banter.clear();
    this.crew.reset();
    this.overlay.clearSpeech();
    this.keys.clear();
    this.touch.reset();
    this.hint = 'Approach the belt · match letter to dock';
    this.state = 'briefing';
    this.snapCamera();
    this.showBriefing();
  }

  private movement(): { x: number; y: number } {
    const keyX = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const keyY = (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0);
    return {
      x: Math.max(-1, Math.min(1, keyX + this.touch.move.x)),
      y: Math.max(-1, Math.min(1, keyY + this.touch.move.y)),
    };
  }

  private tick(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;
    const m = this.model;

    if (this.state === 'story' && this.cutscene) {
      const cutscene = this.cutscene;
      cutscene.update(dt * 1000);
      const beat = cutscene.takeEntered();
      if (beat) this.enterBeat(beat);
      if (cutscene.scene.location === 'depot') {
        this.depotShot = directDepot({ crew: this.crew, workers: this.workers }, cutscene, dt, this.time, this.reducedMotion);
      } else {
        this.stage.direct(cutscene, dt, this.time);
      }
      if (cutscene.done) this.finishScene();
    }
    if (this.state === 'countdown') {
      const before = this.countdownMs;
      this.countdownMs += dt * 1000;
      ['2', '1', 'SORT!'].forEach((copy, index) => {
        const at = (index + 1) * 1000;
        if (before < at && this.countdownMs >= at) {
          this.overlay.showCount(copy);
          audioSystem.play(copy === 'SORT!' ? 'countdown-go' : 'countdown');
        }
      });
      if (this.countdownMs >= 3350) {
        this.overlay.clearCenter();
        this.state = 'playing';
        this.story.go('shift');
        this.overlay.showToast(`You are ${m.activeWorker.id.toUpperCase()} · TAB switches · watch the route letter`, 3200);
        audioSystem.startMusic('game');
      }
    }
    if (this.state === 'playing') {
      if (!this.benStarted && m.elapsedMs >= BEN_START && !m.ended) this.beginInterlude();
      else if (this.mesa.check(m)) this.state = 'mesa';
      else if (this.story.breakDue(m.elapsedMs) && !m.ended) this.beginBreak();
    }
    if (this.state === 'playing') {
      m.update(dt * 1000, this.movement());
      for (const event of m.drainEvents()) this.handleEvent(event);
      this.updateBanter();
      this.crew.update(dt, m, this.time);
      this.setPieces.update(dt, m, this.time);
      if (m.ended && m.won) {
        this.state = 'celebrating';
        this.story.go('clockout');
        audioSystem.play('truck');
        this.overlay.showToast('SHIFT COMPLETE', 13000);
        this.crew.beginCelebration(this.time);
      } else if (m.ended) {
        this.showResults();
      }
    } else if (this.state === 'celebrating') {
      if (this.crew.updateCelebration(dt, this.time)) {
        // The warehouse is done; Skanky's night is not.
        this.story.go('assignment');
        this.playScene(MALL_ASSIGNMENT);
      }
    } else if (this.state === 'interlude') {
      this.benClock = Math.min(BEN_END, this.benClock + Math.min(dt * 1000, 100));
      this.setPieces.updateBen(this.benClock, dt, this.time);
      if (this.benClock >= BEN_END) this.endInterlude();
    } else if (this.state === 'dream') {
      if (this.dream.update(dt, this.reducedMotion)) {
        this.dream.stop();
        this.overlay.root.classList.remove('dreaming');
        audioSystem.startMusic('game');
        this.mesa.dreamFinished();
      }
    } else if (this.state === 'mall' && this.mall) {
      this.mall.update(dt * 1000, this.movement());
      for (const event of this.mall.drainEvents()) this.handleMallEvent(event);
      if (this.mall.finished) {
        this.mallBonus = this.mall.signatures * MALL_RULES.pointsPerSignature;
        this.story.go('to-ups');
        this.playScene(DRIVE_TO_UPS);
      }
    } else if (this.state === 'lot' && this.lot) {
      this.lot.update(dt * 1000, this.movement());
      for (const event of this.lot.drainEvents()) {
        audioSystem.play(event.type === 'done' ? 'correct' : 'wrong');
        this.chapterHint = event.message;
      }
      if (this.lot.done) {
        this.story.go('home');
        this.playScene(GO_HOME);
      }
    }
    if (this.state === 'mall' && this.mall) this.stage.updateMall(this.mall, dt, this.time);
    if (this.state === 'lot' && this.lot) this.stage.updateLot(this.lot, dt, this.time);
    this.mesa.update(dt * 1000, this.time);

    const running = this.state === 'playing' || this.state === 'celebrating' || this.state === 'ended';
    if (this.state === 'playing') this.crew.updateReceiving(m, dt, this.time);
    this.world.update(running ? dt : 0, this.time, m.beltTravel, this.reducedMotion);
    const depotStory = this.state === 'story' && this.cutscene?.scene.location === 'depot';
    if (!depotStory) this.syncWorkers(running ? dt : 0);
    if (this.state === 'playing' || this.state === 'countdown' || this.state === 'briefing') this.clearCrewFootprints();
    this.syncParcels(running ? dt : 0);
    this.updateThrowPreview();
    this.updateCamera(dt);
    this.updateHud();
    const size = this.renderer.getSize(new THREE.Vector2());
    const speechClock = running || this.state === 'interlude' || this.state === 'mesa' || this.state === 'dream' || this.state === 'story' || this.state === 'mall' || this.state === 'lot';
    const camera = this.activeCamera();
    // Bubbles project with the camera as it is now, whether or not a draw follows.
    camera.updateMatrixWorld();
    this.overlay.update(dt * 1000, speechClock, camera, size.x, size.y);
  }

  private updateHud(): void {
    const m = this.model;
    const held = m.heldPackage;
    const scannerWorker = this.state === 'playing' ? m.pendingScannerWorker : null;
    const scannerSelected = scannerWorker !== null && scannerWorker === m.activeWorker.id;
    const scanner = scannerWorker ? `${scannerWorker.toUpperCase()} NEEDS A SCANNER RESET · ${scannerSelected
      ? this.touch.enabled ? 'TAP RESET SCANNER' : 'SPACE TO RESET'
      : this.touch.enabled ? 'SWITCH, THEN RESET SCANNER' : 'TAB TO SWITCH, THEN SPACE'}` : '';
    const target = this.state === 'playing' && held ? m.throwTarget() : null;
    const throwHint = target ? (target.ok ? ` · [F] ${target.reason}` : ` · ${target.reason}`) : '';
    this.overlay.updateHud({
      sorted: m.sorted, goal: m.goal, score: m.score, timeLeftMs: m.timeLeftMs, backlog: m.pileup, capacity: m.capacity,
      phase: this.state === 'interlude' ? 'BEN  /  DODGE TRAINING' : PHASE_LABELS[m.phase] ?? '', combo: m.combo, worker: m.activeWorker.id,
      hint: this.state === 'interlude' ? 'Belt held · your freight is safe' : this.state === 'mesa' ? 'Y steals the Mesa · N leaves it'
        : scannerSelected ? `${this.touch.enabled ? 'RESET SCANNER' : 'SPACE resets scanner'} · carried freight stays in hand`
        : held ? `${held.label} → ${held.route} · ${ROUTE_INFO[held.route].name}${throwHint}` : this.hint,
      overview: this.overview, routes: this.routeLegend(), scanner,
      brake: m.brakeRemainingMs > 0 ? '■ BELT HELD' : m.brakeCooldownMs > 0 ? `[E] RECHARGE ${Math.ceil(m.brakeCooldownMs / 1000)}s` : '[E] BRAKE READY',
    });
    if (this.state === 'mall' && this.mall) {
      const mall = this.mall;
      this.overlay.chapterHud([
        ['RUN', `${Math.min(3, mall.run + 1)} / 3`], ['DELIVERED', `${mall.delivered} / 6`], ['SIGNED', `${mall.signatures} / 6`],
        ['CART', mall.cart.load.length === 0 ? 'EMPTY' : mall.cart.load.map((id) => mall.store(id).name).join(' + ')],
      ], `${mall.objective}${this.chapterHint ? ` · ${this.chapterHint}` : ''}`, 'WASD MOVE · SPACE TAKE / LOAD / DROP / SIGN · E PUSH OR PARK CART · ESC PAUSE');
    } else if (this.state === 'lot' && this.lot) {
      this.overlay.chapterHud([['MALL', '6 / 6 SIGNED'], ['FIVE-TON', this.lot.done ? 'RETURNED' : 'PARKED']],
        this.lot.atKeyDrop ? 'Press SPACE to drop the keys' : this.chapterHint, 'WASD MOVE · SPACE DROP KEYS · ESC PAUSE');
    }
    const chapter = this.state === 'mall' || this.state === 'lot';
    this.touch.setLive(this.state === 'playing' || this.state === 'interlude' || chapter,
      chapter ? (this.state === 'mall' ? (this.mall?.cart.pushed ? 'PARK' : 'CART') : '—')
        : m.brakeRemainingMs > 0 ? 'HELD' : m.brakeCooldownMs > 0 ? `${Math.ceil(m.brakeCooldownMs / 1000)}s` : 'BRAKE',
      chapter ? this.state === 'mall' : this.state === 'playing' && m.brakeCooldownMs <= 0, chapter, scannerSelected);
  }

  private activeCamera(): THREE.PerspectiveCamera {
    return this.usesStage() ? this.stage.camera : this.camera;
  }

  private usesStage(): boolean {
    const state = this.state === 'paused' ? this.pausedFrom : this.state;
    if (state === 'mall' || state === 'lot') return true;
    return state === 'story' && this.stage.active !== null;
  }

  private draw(): void {
    const now = performance.now();
    // A software renderer can take longer than a frame to draw; space its draws out.
    if (this.quality === 'low' && now - this.lastRender < Math.max(100, this.renderCost * 2)) return;
    this.lastRender = now;
    const stageScene = this.usesStage() ? this.stage.scene : null;
    const scene = stageScene ?? this.world.scene;
    const camera = stageScene ? this.stage.camera : this.camera;
    syncCharacterModels(this.state === 'dream' ? this.dream.scene : scene);
    if (this.state === 'dream') this.renderer.render(this.dream.scene, this.dream.camera);
    else if (this.composer && this.renderPass) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      this.composer.render();
    } else this.renderer.render(scene, camera);
    this.renderCost = performance.now() - now;
  }

  /** A story beat starts: its sound, its subtitles, and a bubble over the speaker. */
  private enterBeat(beat: StoryBeat): void {
    if (beat.sound) audioSystem.play(BEAT_SOUNDS[beat.sound]);
    const speaker = beat.speaker ? SPEAKER_NAMES[beat.speaker] : undefined;
    this.overlay.subtitle({ speaker, line: beat.line, direction: beat.direction, caption: beat.caption });
    if (beat.line && beat.speaker) {
      const anchor = this.storyAnchor(beat.speaker);
      this.overlay.say(`story-${beat.speaker}`, speaker!, beat.line, Math.max(1600, beat.ms), anchor);
      audioSystem.play('npc-talk');
    }
  }

  private storyAnchor(id: StoryActor): () => THREE.Vector3 {
    return () => {
      if (this.cutscene?.scene.location === 'depot' || !this.stage.active) return this.speakerAnchor(id)();
      return this.stage.anchor(id) ?? new THREE.Vector3(0, 2, 0);
    };
  }

  private handleEvent(event: ShiftEvent): void {
    const sound = event.assisted ? undefined : EVENT_SOUNDS[event.type];
    if (sound) audioSystem.play(sound);
    if (event.type === 'sort' && event.score) {
      this.overlay.pop(`+${event.score}`, ROUTE_COLORS[event.route ?? 'A'], toWorld(event, surfaceAt(event.x, event.y) + 1.8));
    }
    if (event.type === 'throw' && event.packageId !== undefined && event.workerId) this.throwers.set(event.packageId, event.workerId);
    if (event.type === 'damage') {
      const parcel = this.model.packages.find((item) => item.id === event.packageId);
      const lost = Math.abs(event.score ?? 0);
      this.overlay.pop(`BROKEN −${lost}`, '#f3987c', toWorld(event, surfaceAt(event.x, event.y) + 2.0));
      this.overlay.showToast(`${parcel?.label ?? 'PARCEL'} BROKE · no credit · −${lost} points`, 2800);
      const thrower = this.model.workers.find((worker) => worker.id === (event.packageId !== undefined ? this.throwers.get(event.packageId) : undefined)) ?? this.model.activeWorker;
      this.crew.shanBreakage(thrower, this.model.elapsedMs);
      const at = toWorld(event, surfaceAt(event.x, event.y) + 0.3);
      for (let i = 0; i < 10; i += 1) {
        this.world.puffs.emit(at, { color: parcel?.kind === 'makeup' ? 0xda8db6 : 0xb8875a, size: 0.12, life: 0.9, velocity: new THREE.Vector3((Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.5) * 2), opacity: 0.8, grow: 1.4, spread: 0.3 });
      }
    }
    if (event.type === 'grab' || event.type === 'recover' || event.type === 'drop' || event.type === 'wrong' || event.type === 'miss' || event.type === 'brake' || event.type === 'throw') {
      if (!event.workerId || event.workerId === this.model.activeWorker.id) this.hint = event.message;
    } else if ((event.type === 'sort' && !event.assisted) || event.type === 'damage') {
      this.hint = 'Approach the belt · match letter to dock';
    }
    if (event.type === 'phase' || event.type === 'miss' || (event.type === 'scanner' && this.model.pendingScannerWorker === null)) this.overlay.showToast(event.message);

    this.crew.onEvent(event, this.model);
  }

  private handleMallEvent(event: MallEvent): void {
    const sounds: Record<MallEvent['type'], SoundEffect> = {
      pick: 'grab', load: 'drop', cart: 'switch', drop: 'bulk', sign: 'sign', wrong: 'wrong', run: 'event-alert', done: 'correct',
    };
    audioSystem.play(sounds[event.type]);
    this.chapterHint = event.message;
    if (event.type === 'run' || event.type === 'done') this.overlay.showToast(event.message, 2600);
    const mall = this.mall;
    if (!mall) return;
    const at = this.stage.mallEvent(mall, event);
    if (at && (event.type === 'drop' || event.type === 'sign')) {
      this.overlay.pop(event.type === 'sign' ? '✓ SIGNED' : 'DROPPED', event.type === 'sign' ? '#a6cc9a' : '#edb765', at);
    }
    if (event.type === 'sign' && event.storeId) {
      const store = mall.store(event.storeId);
      this.overlay.say(`clerk-${store.id}`, `${store.name} CLERK`, store.clerkLine, 3000, () => at ?? new THREE.Vector3());
    }
  }

  private updateBanter(): void {
    const t = this.model.elapsedMs;
    const once = (key: string, at: number, action: () => void): void => {
      if (t >= at && !this.banter.has(key)) { this.banter.add(key); action(); }
    };
    once('brian-response', 64600, () => this.say(this.model.activeWorker.id, 'YOU ARE SERIOUSLY SENDING 5 DOWN TO BULK?', 4700));
  }

  private speakerAnchor(id: string): () => THREE.Vector3 {
    return () => {
      const character = id === 'termite' || id === 'skanky' ? this.workers[id] : this.crew.characterFor(id);
      if (!character) return new THREE.Vector3();
      return character.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, character.headHeight + 0.35, 0));
    };
  }

  private say(id: string, copy: string, durationMs: number): void {
    const name = id === 'termite' || id === 'skanky' ? id.toUpperCase() : this.crew.characterFor(id)?.root.name ?? id.toUpperCase();
    this.overlay.say(id, name, copy, durationMs, this.speakerAnchor(id));
    audioSystem.play('npc-talk');
  }

  private syncWorkers(dt: number): void {
    const m = this.model;
    for (const worker of m.workers) {
      const character = this.workers[worker.id];
      setFromModel(character.root.position, worker, surfaceAt(worker.x, worker.y));
      const targetAngle = FACING_ANGLE[worker.facing];
      let delta = targetAngle - character.root.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      character.root.rotation.y += delta * Math.min(1, dt * 12);
      animateCharacter(character, dt, { moving: worker.moving, carrying: worker.heldId !== null, time: this.time, reducedMotion: this.reducedMotion });
      if (this.state === 'celebrating' && !this.reducedMotion) {
        // Termite and Skanky celebrate with the crew.
        const beat = this.time * 9 + (worker.id === 'skanky' ? 1.3 : 0);
        character.body.position.y = Math.abs(Math.sin(beat)) * 0.12;
        character.leftArm.rotation.set(-2.8 + Math.sin(beat) * 0.35, 0, 0.25);
        character.rightArm.rotation.set(-2.8 - Math.sin(beat) * 0.35, 0, -0.25);
      }
    }
    const active = this.workers[m.activeWorker.id];
    this.activeRing.position.set(active.root.position.x, active.root.position.y + 0.02, active.root.position.z);
    const pulse = 1 + Math.sin(this.time * 4) * 0.05;
    this.activeRing.scale.set(pulse, pulse, 1);
    this.activeRing.visible = this.state !== 'story';
    const idle = this.workers[m.activeIndex === 0 ? 'skanky' : 'termite'];
    this.sleepTag.position.set(idle.root.position.x + 0.3, idle.root.position.y + 2.5 + Math.sin(this.time * 2) * 0.08, idle.root.position.z);
    this.sleepTag.visible = this.state !== 'story' && !m.assistanceActive;

    // A marker above the parcel the active worker would grab.
    const nearest = m.heldPackage ? null : m.nearestPackage();
    const view = nearest ? this.parcels.get(nearest.id) : null;
    this.marker.visible = Boolean(view) && this.state === 'playing';
    if (view) {
      this.marker.position.copy(view.root.position).add(new THREE.Vector3(0, view.height + 1.0 + Math.sin(this.time * 6) * 0.06, 0));
      this.marker.rotation.y += dt * 3;
    }
  }

  /** Coworkers yield their standing space while the player keeps control. */
  private clearCrewFootprints(): void {
    const occupied: FootprintCircle[] = this.model.workers.map(worker => ({ x: worker.x, y: worker.y, radius: SHIFT_LAYOUT.workerRadius }));
    for (const parcel of this.model.packages) if (parcel.state === 'floor') occupied.push({ x: parcel.x, y: parcel.y, radius: SHIFT_LAYOUT.parcelRadius });
    for (const [id, actor] of this.crew.clearanceActors) {
      // Authored seated/lying contact scenes use their own poses and staging.
      if (!actor.root.visible || actor.pose === 'massage' || actor.pose === 'sit' || Math.abs(actor.character.body.rotation.z) > 0.8) continue;
      const intended = { x: actor.root.position.x * 32 + 480, y: actor.root.position.z * 32 + 340 };
      const radius = actor.carrying ? DEPOT_CARRY_RADIUS : DEPOT_BODY_RADIUS;
      const clear = clearDepotFootprint(intended, radius, occupied, this.depotSolids);
      const height = actorSurfaceAt(clear.x, clear.y);
      const dy = height - actor.root.position.y;
      this.crew.translateActorFreight(id, (clear.x - intended.x) / 32, (clear.y - intended.y) / 32, dy);
      this.setPieces.translateActorFreight(id, (clear.x - intended.x) / 32, (clear.y - intended.y) / 32, dy);
      setFromModel(actor.root.position, clear, height);
      occupied.push({ ...clear, radius });
    }
  }

  /** Where a throw would land: an arc and a ring in the destination's colour, only when the throw is allowed. */
  private updateThrowPreview(): void {
    const m = this.model;
    const target = this.state === 'playing' && m.heldPackage ? m.throwTarget() : null;
    const visible = Boolean(target?.ok);
    this.throwArc.visible = visible;
    this.throwRing.visible = visible;
    if (!target || !visible) return;
    const color = new THREE.Color(ROUTE_COLORS[target.route]);
    (this.throwArc.material as THREE.LineDashedMaterial).color.copy(color);
    (this.throwRing.material as THREE.MeshBasicMaterial).color.copy(color);
    const worker = this.workers[m.activeWorker.id].root.position;
    const from = worker.clone().add(new THREE.Vector3(0, 1.2, 0));
    const to = toWorld(target, surfaceAt(target.x, target.y) + 0.05);
    const positions = this.throwArc.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i += 1) {
      const t = i / (positions.count - 1);
      const point = from.clone().lerp(to, t);
      point.y += Math.sin(t * Math.PI) * 1.4;
      positions.setXYZ(i, point.x, point.y, point.z);
    }
    positions.needsUpdate = true;
    this.throwArc.geometry.computeBoundingSphere();
    this.throwArc.computeLineDistances();
    this.throwRing.position.copy(to);
    const pulse = 1 + Math.sin(this.time * 6) * 0.08;
    this.throwRing.scale.set(pulse, pulse, 1);
  }

  private parcelPosition(parcel: Parcel, view: ParcelView, target: THREE.Vector3): THREE.Vector3 {
    const carryOffset = setParcelCarried(view, parcel.state === 'held');
    if (parcel.state === 'held' && parcel.workerId) {
      const character = this.workers[parcel.workerId];
      const forward = new THREE.Vector3(Math.sin(character.root.rotation.y), 0, Math.cos(character.root.rotation.y));
      return target.copy(character.root.position).addScaledVector(forward, carryOffset).setY(character.root.position.y + 1.05 - view.height * 0.35);
    }
    if (parcel.state === 'missed') {
      const missed = this.model.packages.filter((item) => item.state === 'missed');
      const index = missed.indexOf(parcel);
      // Two columns stay inside the recovery tray and clear of both workers.
      // Stack by actual model height so mixed parcel forms never intersect.
      let height = PLATFORM_HEIGHT + 0.12;
      for (let i = index % 2; i < index; i += 2) height += (this.parcels.get(missed[i].id)?.height ?? 1) + 0.04;
      return setFromModel(target, { x: SHIFT_LAYOUT.recoveryPile.x + (index % 2 === 0 ? -24 : 24), y: SHIFT_LAYOUT.recoveryPile.y }, height);
    }
    if (parcel.state === 'thrown' && parcel.flight) {
      // An arc from the hands to the drop, dropping to floor level for a throw down the stairs.
      const flight = parcel.flight;
      const t = flight.elapsedMs / flight.durationMs;
      const start = surfaceAt(flight.fromX, flight.fromY) + 1.0;
      const end = surfaceAt(flight.toX, flight.toY) + 0.05;
      return setFromModel(target, parcel, start + (end - start) * t + Math.sin(t * Math.PI) * 1.4);
    }
    return setFromModel(target, parcel, parcel.state === 'belt' ? BELT_HEIGHT + 0.01 : surfaceAt(parcel.x, parcel.y));
  }

  /** Where a delivered parcel goes: into its truck, onto the bulk stock, or onto its lower-floor pile. */
  private deliveryTarget(parcel: Parcel): THREE.Vector3 {
    if (parcel.route === 'C') return this.world.bulkStack.position.clone().add(new THREE.Vector3(0, 0.3, 0));
    if (parcel.route === 'T' || parcel.route === 'S') {
      const slot = floorPileSlot(parcel.route, parcel.pileIndex ?? 0);
      return toWorld(slot, 0.21 + slot.layer * 0.43);
    }
    return this.world.truckRear(parcel.route);
  }

  private syncParcels(dt: number): void {
    const m = this.model;
    const seen = new Set<number>();
    const target = new THREE.Vector3();
    const intake = m.intakePreview;
    if (intake) {
      seen.add(intake.id);
      let view = this.parcels.get(intake.id);
      if (!view) {
        view = createParcelView({ ...intake, x: intake.x, y: intake.y, state: 'belt', workerId: null, beltOffset: 0, recovered: false, missCounted: false, broken: false, breakY: null });
        this.parcels.set(intake.id, view);
        this.world.scene.add(view.root);
      }
      // The reserved parcel slides off the feeder onto the belt head.
      const lift = Math.sin(intake.progress * Math.PI) * 0.15;
      view.root.position.set(toWorldX(intake.x), BELT_HEIGHT + 0.01 + lift, toWorldZ(intake.y));
    }
    for (const parcel of m.packages) {
      if (parcel.state === 'delivered') {
        const view = this.parcels.get(parcel.id);
        if (view && this.stolen.has(parcel.id)) {
          this.parcels.delete(parcel.id);
          disposeObject3D(view.root);
        } else if (view && (parcel.route === 'C' || parcel.route === 'T' || parcel.route === 'S')) {
          // Replace hand-held freight with its stored slot immediately. Flying
          // a full-size long carton into an already occupied stack crossed the
          // neighboring boxes before the canonical stored box appeared.
          this.parcels.delete(parcel.id);
          disposeObject3D(view.root);
          if (parcel.route === 'C') this.bulkVisible += 1;
          else {
            this.pileVisible[parcel.route] += 1;
            this.world.setFloorPile(parcel.route, this.pileVisible[parcel.route]);
          }
        } else if (view) {
          this.parcels.delete(parcel.id);
          this.departing.push({ view, from: view.root.position.clone(), to: this.deliveryTarget(parcel), t: 0, route: parcel.route });
        }
        continue;
      }
      if (parcel.state === 'damaged') {
        // A broken parcel stays crushed where it landed, then is cleared away; it never comes back.
        const age = (this.broken.get(parcel.id) ?? 0) + dt;
        this.broken.set(parcel.id, age);
        const view = this.parcels.get(parcel.id);
        if (!view) continue;
        if (age > DAMAGE_VISIBLE_S) {
          disposeObject3D(view.root);
          this.parcels.delete(parcel.id);
          continue;
        }
        seen.add(parcel.id);
        if (!view.root.userData.crushed) {
          view.root.userData.crushed = true;
          view.body.scale.y *= 0.5;
          view.body.rotation.z = 0.35;
          view.tag.visible = false;
          const tag = textSprite(['BROKEN'], 0.26, { width: 110, height: 30, background: '#c23a2e', color: '#fff6e8', radius: 5 });
          tag.position.y = view.height * 0.6 + 0.3;
          tag.center.set(0.5, 0);
          view.root.add(tag);
          if (view.parts.crack) view.parts.crack.visible = true;
          if (view.parts.spill) view.parts.spill.visible = true;
        }
        setFromModel(view.root.position, parcel, surfaceAt(parcel.x, parcel.y));
        alignParcelToSurface(view, surfaceAt(parcel.x, parcel.y));
        continue;
      }
      seen.add(parcel.id);
      let view = this.parcels.get(parcel.id);
      if (!view) {
        view = createParcelView(parcel);
        this.parcels.set(parcel.id, view);
        this.world.scene.add(view.root);
        audioSystem.play('package-spawn');
        if (NEW_ROUTES.includes(parcel.route) && !this.seenRoutes.has(parcel.route)) {
          this.seenRoutes.add(parcel.route);
          const info = ROUTE_INFO[parcel.route];
          this.overlay.showToast(`NEW: ${parcel.route} · ${info.name} · ${info.caption}`, 3600);
        }
      }
      this.parcelPosition(parcel, view, target);
      // Rules own contact: smoothing a pickup/drop through the worker or deck
      // briefly intersected solids, especially after a long frame.
      view.root.position.copy(target);
      view.root.rotation.y = parcel.state === 'held' && parcel.workerId ? this.workers[parcel.workerId].root.rotation.y
        : parcel.state === 'thrown' && !this.reducedMotion ? this.time * 9 : 0;
      if (parcel.state === 'belt' || parcel.state === 'floor' || parcel.state === 'missed') alignParcelToSurface(view, target.y);
      if (parcel.kind === 'makeup' && parcel.broken) {
        view.parts.crack.visible = true;
        view.parts.spill.visible = true;
      }
      this.animateParcel(view, parcel, dt);
    }
    for (const [id, view] of this.parcels) {
      if (!seen.has(id)) {
        disposeObject3D(view.root);
        this.parcels.delete(id);
      }
    }
    // Ralph's pickups come off the visible shared stock one at a time.
    this.world.setBulkCount(Math.max(0, this.bulkVisible - this.setPieces.ralphLifted));
    for (let i = this.departing.length - 1; i >= 0; i -= 1) {
      const item = this.departing[i];
      item.t += dt / 0.45;
      const t = Math.min(1, item.t);
      item.view.root.position.lerpVectors(item.from, item.to, t).setY(THREE.MathUtils.lerp(item.from.y, item.to.y, t) + Math.sin(t * Math.PI) * 0.6);
      const stays = item.route === 'C' || item.route === 'T' || item.route === 'S';
      item.view.root.scale.setScalar(stays ? 1 : 1 - t * 0.4);
      if (t >= 1) {
        disposeObject3D(item.view.root);
        this.departing.splice(i, 1);
        if (item.route === 'C') this.bulkVisible += 1;
        else if (item.route === 'T' || item.route === 'S') {
          this.pileVisible[item.route] += 1;
          this.world.setFloorPile(item.route, this.pileVisible[item.route]);
        } else {
          this.truckVisible[item.route] += 1;
          this.world.setTruckLoad(item.route, this.truckVisible[item.route]);
        }
      }
    }
  }

  private animateParcel(view: ParcelView, parcel: Parcel, dt: number): void {
    if (this.reducedMotion) return;
    if (parcel.kind === 'lobsters') {
      for (const [key, claw] of Object.entries(view.parts)) {
        if (key.startsWith('claw')) claw.rotation.y = Math.sin(this.time * 7 + key.length) * 0.35 + (key.endsWith('-1') ? -0.4 : 0.4);
      }
    } else if (parcel.kind === 'duck' && view.parts.duck) {
      view.parts.duck.rotation.y = Math.sin(this.time * 2) * 0.6;
    } else if (parcel.kind === 'mallwood') {
      // Mallwood's own curry/spice-coloured fumes.
      this.fumeTimer -= dt;
      if (this.fumeTimer <= 0 && dt > 0) {
        this.fumeTimer = 0.18;
        const at = view.root.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, view.height + 0.1, 0));
        this.world.puffs.emit(at, { color: 0xd99a3a, size: 0.2, life: 1.8, velocity: new THREE.Vector3(0, 0.45, 0), opacity: 0.4, grow: 3 });
      }
    }
  }

  private snapCamera(): void {
    this.updateCamera(1, true);
  }

  private updateCamera(dt: number, snap = false): void {
    const portrait = this.camera.aspect < 1;
    let position: THREE.Vector3;
    let look: THREE.Vector3;
    const state = this.state === 'paused' ? this.pausedFrom : this.state;
    if (state === 'interlude') {
      // Frame the whole outer bay: gunman, Ben, the gate and the demon.
      look = new THREE.Vector3(toWorldX(95), 1.0, toWorldZ(400));
      position = look.clone().add(portrait ? new THREE.Vector3(2, 11, 9) : new THREE.Vector3(3.2, 6.6, 7.6));
    } else if (state === 'story' && this.depotShot) {
      look = this.depotShot.look;
      position = this.depotShot.position.clone();
      if (portrait) position.add(new THREE.Vector3(0, 4, 3));
    } else if (this.overview || this.state === 'briefing' || this.state === 'celebrating') {
      look = new THREE.Vector3(0, 0, toWorldZ((SHIFT_LAYOUT.worldTop + SHIFT_LAYOUT.worldBottom) / 2));
      // Leave room for the final wall, both outer floor signs and their zones,
      // including the narrower horizontal field of view on portrait screens.
      position = look.clone().add(new THREE.Vector3(0, Math.max(60, 48 / this.camera.aspect), 26));
    } else {
      const worker = this.workers[this.model.activeWorker.id].root.position;
      // Lean toward the belt in the sorting lanes, then follow the actual
      // worker through the side flights. Belt bias put ground workers offscreen
      // once the camera stopped at the terminal wall.
      const terminal = THREE.MathUtils.smoothstep(worker.z, toWorldZ(700), toWorldZ(790));
      look = new THREE.Vector3(worker.x * (0.5 + 0.5 * terminal), worker.y + 0.4, worker.z - (1 - terminal));
      position = look.clone().add(portrait ? new THREE.Vector3(0, 15, 9) : new THREE.Vector3(worker.x * 0.2 * (1 - terminal), 10.5, 9.4));
    }
    // The final depot wall is solid. Reframe from its interior side when a
    // worker reaches bulk or either side stair, including overview/portrait.
    const cameraLimitZ = toWorldZ(SHIFT_LAYOUT.bulkRearWall.y - SHIFT_LAYOUT.bulkRearWall.height / 2) - this.camera.near - 0.15;
    position.z = Math.min(position.z, cameraLimitZ);
    const ease = snap ? 1 : 1 - Math.exp(-dt * 4);
    this.camera.position.lerp(position, ease);
    this.camera.position.z = Math.min(this.camera.position.z, cameraLimitZ);
    this.cameraTarget.lerp(look, ease);
    this.camera.lookAt(this.cameraTarget);
    // Overview height must not turn the whole depot into the fog colour.
    // Preserve the close-view haze while moving its distance with camera height.
    const fog = this.world.scene.fog;
    if (fog instanceof THREE.Fog) {
      const altitude = Math.max(0, this.camera.position.y - 20);
      fog.near = 26 + altitude;
      fog.far = 62 + altitude;
    }
  }

  private showResults(): void {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.stage.end();
    this.overlay.setMode('shift');
    this.story.go('results');
    const m = this.model;
    audioSystem.startMusic('results');
    const overflow = m.pileup >= m.capacity;
    const rate = m.packages.length === 0 ? 0 : Math.round(m.sorted / m.packages.length * 100);
    const home = this.lot?.done === true;
    const mall = this.mall;
    const routes = (['A', 'D', 'T', 'B', 'E', 'S', 'C'] as const).map((route) => `${route} ${m.routeSorted[route]}`).join(' · ');
    const total = m.score + this.mallBonus;
    this.overlay.showPanel(`
      <div class="grade">${m.won ? m.grade : 'F'}</div>
      <div class="kicker">${m.won ? `SHIFT COMPLETE / GRADE ${m.grade}` : 'SHIFT TERMINATED / YOU FAILED THE SORT'}</div>
      <h1>${overflow ? 'PILE-UP OVERFLOW' : home ? 'HOME. FINALLY.' : m.gradeQuote}</h1>
      <p><b>${m.sorted} DISPATCHED · ${String(m.score).padStart(5, '0')} POINTS · ${m.bestCombo} BEST STREAK</b></p>
      <p>${rate}% of freight dispatched · ${m.missed} parcels reached the belt end · ${m.bulkSorted} to bulk</p>
      <p>${escapeHtml(routes)}</p>
      <p>${m.thrownDeliveries} thrown in clean · ${m.damaged} broken (−${m.breakagePenalty} points${m.damaged > THROWING.gradeForgivenBreaks ? `, ${m.gradedBreaks} counted against the grade` : ''})</p>
      ${mall ? `<p>MALL RUN · ${mall.delivered}/6 delivered · ${mall.signatures}/6 signed · five-ton ${home ? 'returned' : 'not returned'} · +${this.mallBonus}</p>
      <p><b>NIGHT TOTAL ${String(total).padStart(5, '0')}</b> · ${m.gradeQuote}</p>` : ''}
      <button type="button">ANOTHER NIGHT  ↵</button>
      <a href="${window.location.pathname}?mode=2d">PLAY THE 2D DEPOT</a>`, () => this.restart());
  }
}


export function startBelt3d(): void {
  const host = document.querySelector<HTMLDivElement>('#app');
  if (!host) throw new Error('Expected #app container to exist.');
  document.title = 'THE BELT';
  audioSystem.installUnlockListeners();
  if (!webglAvailable()) {
    showWebglFallback(host);
    window.dispatchEvent(new CustomEvent('belt3d:fallback'));
    return;
  }
  const app = new Belt3d(host);
  if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
  // Browser checks observe the app through this event; nothing global is set.
  window.dispatchEvent(new CustomEvent('belt3d:ready', { detail: app }));
}
