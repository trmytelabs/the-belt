import { DEPOT_3D_LAYOUT as SHIFT_LAYOUT, floorPileSlot, truckInteriorAt } from './layout';
import { ARRIVALS_3D, FLOW_3D, INSPECTION_3D, PEAK_NIGHT, PRIORITY_3D, ShiftModel3D, SURPRISE_3D, TRICK_SHOTS } from './ShiftModel3D';
import { createPriorityMarker, updatePriorityMarker, type PriorityMarker } from './priorityMarker';
import { createSurpriseMarker, SURPRISE_PROMPT_LIFT, updateSurpriseMarker, type SurpriseMarker } from './surpriseMarker';
import { GOAL_BONUS, judgeGoals, nightGoals, type NightGoal } from './nightGoals';
import { MEDALS, awardMedals, type NightFacts } from './medals';
import { perkById, perkOffer, type Perk } from './perks';
import { dailyDate, dailyNight, loadDaily, recordDaily, saveDaily, type DailyNight } from './daily';
import { rankNeeds, seniority } from './seniority';
import { PACE_STEP_MS, paceAt, samplePace } from './pace';
import { sortingGuide } from './sortingGuide';
import { pathLength, platformWalkPath, walkPath, type WalkPoint } from './walking';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { guardBloom } from './bloomGuard';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createNightEnvironment, disposeNightEnvironment } from './nightEnvironment';

import { DepotAmbientOcclusion } from './ambientOcclusion';
import { MESA } from './references';
import { clearDepotFootprint, DEPOT_BODY_RADIUS, DEPOT_CARRY_RADIUS, depotSolidFootprints, type FootprintCircle } from '../game/slice/DepotClearance';
import { KeyReturnModel, MALL_RULES, type MallEvent } from '../game/slice/MallModel';
import { MallModel3D as MallModel } from './MallModel3D';
import {
  CARRY_MULTIPLIER, THROWING, type Parcel, type Route, type ShiftEvent, type WorkerId,
} from '../game/slice/ShiftModel';
import { ROUTE_INFO, parcelAddress } from './addresses';
import { Cutscene, StoryRun, type StoryChoices } from '../game/slice/StoryModel';
import {
  DRIVE_TO_MALL, DRIVE_TO_UPS, GO_HOME, KEY_RETURN_LINES, MALL_ASSIGNMENT, MALL_INTRO, SCRUM, SPEAKER_NAMES,
  type StoryActor, type StoryBeat, type StoryScene,
} from '../game/slice/StoryScript';
import { audioSystem, type SoundEffect } from './audio';
import { clipRoleOf, modelFeet, syncCharacterModels, useCharacterClips, useCharacterModels, type CharacterModelEntry } from './characterModels';
import { plantFeet } from './footing';
import { footfall } from './footsteps';
import { animateCharacter, createCharacter, lookToward, mergeCharacter, triggerAction, type Character } from './characters';
import { CrewLife } from './crew';
import { MesaDream } from './dream';
import { MesaEncounter } from './mesa';
import { BEN_CAST, BEN_END, BEN_START, SetPieces } from './setpieces';
import { StoryStage, directDepot } from './story';
import { breakScene3d } from './breakScenes3d';
import { DRIVE_PAR, DrivingModel, driveClock, parBonus, type DriveDestination, type DriveOrigin } from './DrivingModel';
import { GhostRecorder, ghostPose, keepFaster, loadGhosts, saveGhosts, type GhostDrive } from './ghostDrive';
import { COFFEE_RUN, CoffeeRunModel, type CoffeeRunEvent } from './coffeeRun';
import { CoffeeRunScene } from './coffeeRunView';
import { DECISION, HOME_DECISION, LEAVE_HOUSE, QUIT_ENDING, QUIT_NIGHT, type HomeBeat } from './homeScript';
import { DrivingView } from './driving';
import { BELT_SOLID_WIDTH, HEAD_DRIVE, clearReceiving } from './receivingCollision';
import { TouchControls } from './touch';
import { GamepadInput, IDLE_PAD, padKey, type PadButton, type PadFrame } from './gamepad';
import { Overlay } from './overlay';
import { MIN_RESOLUTION, loadSettings, saveSettings, type GameSettings } from './settings';
import { OPENER_COUNT, browserStorage, formatTotal, loadRecord, recordEndless, recordNight, saveRecord, type NightRecord } from './nightRecord';
import { alignParcelToSurface, createParcelView, setParcelCarried, setParcelModels, type ParcelView } from './parcels';
import { disposeObject3D } from './resources';
import { loadSurfaces } from './textures';
import {
  BELT_HEIGHT, PLATFORM_HEIGHT, ROUTE_COLORS, actorSurfaceAt, setFromModel, surfaceAt, surfaceUnder, textSprite, textTexture, toWorld, toWorldX, toWorldZ,
} from './space';
import { DepotWorld, SKANKY_SPEC, TERMITE_SPEC } from './world';

type AppState = 'briefing' | 'story' | 'decision' | 'countdown' | 'playing' | 'break-alert' | 'interlude' | 'mesa' | 'dream' | 'paused' | 'celebrating' | 'driving' | 'mall' | 'lot' | 'ended' | 'coffee' | 'coffee-done';
type Resumable = 'playing' | 'break-alert' | 'interlude' | 'story' | 'driving' | 'mall' | 'lot' | 'coffee';

const PHASE_LABELS: Record<string, string> = {
  lesson: '01  /  FIND YOUR RHYTHM', flow: '02  /  KEEP IT MOVING', rush: '03  /  LAST DISPATCH',
  cleanup: '04  /  CLEAR THE LINE', ended: 'SHIFT COMPLETE',
};
const EVENT_SOUNDS: Partial<Record<ShiftEvent['type'], SoundEffect>> = {
  grab: 'grab', drop: 'drop', sort: 'correct', wrong: 'wrong', miss: 'pile-up',
  recover: 'dig', brake: 'belt-stop', switch: 'switch', phase: 'event-alert', end: 'shift-end',
  brian: 'event-alert', spill: 'drop', throw: 'throw', damage: 'smash', scanner: 'event-alert', trick: 'correct',
};
const BEAT_SOUNDS: Record<NonNullable<StoryBeat['sound']>, SoundEffect> = {
  engine: 'engine', cough: 'cough', horn: 'horn', gate: 'gate', door: 'button', spill: 'splash', register: 'register', truck: 'truck', sign: 'sign',
};
const HOME_SOUNDS: Record<NonNullable<HomeBeat['effect']>, SoundEffect> = { phone: 'event-alert', vomit: 'splash', keg: 'splash' };
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
    <p><a style="color:#edb765" href="${window.location.pathname}?mode=classic">Play the original full shift instead</a></p></div></div>`;
}

const escapeHtml = (text: string): string => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export class Belt3d {
  public model = new ShiftModel3D();
  public state: AppState = 'briefing';
  public story = new StoryRun();
  /** The cutscene on screen, if any. */
  public cutscene: Cutscene | null = null;
  public mall: MallModel | null = null;
  public lot: KeyReturnModel | null = null;
  public driving: DrivingModel | null = null;
  public drivingView: DrivingView | null = null;
  private drivingPenalty = 0;
  private drivingCollisions = 0;
  private drivingRedLights = 0;
  private practiceDestination: DriveDestination | null = (() => {
    const value = new URLSearchParams(window.location.search).get('drive');
    return value === 'mall' || value === 'ups' ? value : null;
  })();
  public readonly overlay: Overlay;
  public readonly world: DepotWorld;
  public readonly stage: StoryStage;
  public readonly quality: 'high' | 'low';
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer | null;
  private readonly renderPass: RenderPass | null;
  private readonly gtao: DepotAmbientOcclusion | null;
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
  /** The player's record between nights, kept in this browser's local storage (nightRecord.ts). */
  public record: NightRecord = loadRecord(browserStorage());
  /** Tonight's three goals, chosen by the nights on record, and the live ones already announced. */
  public goals: NightGoal[] = nightGoals(this.record.played);
  private readonly goalsAnnounced = new Set<string>();
  /** Sorting time and frames counted towards the one-time hint to lower the resolution. */
  private readonly slowFrames = { seconds: 0, frames: 0, hinted: false };
  /** Tonight's shift score every five seconds, kept with the record if tonight becomes the best night. */
  private paceSamples: number[] = [];
  /** Whether the streak was on fire last frame, so the faster walk is announced once per streak. */
  private wasOnFire = false;
  /** What the goals paid at the last results. */
  public goalBonus = 0;
  /** The medals the last results awarded for the first time. */
  public medalsEarned: string[] = [];
  /** The shared sound system, reachable like the rest of the app (the browser checks use it). */
  public readonly audio = audioSystem;
  /** The perk picked on the briefing for tonight, and the one tonight's shift runs with. */
  public perk: string | null = null;
  public perkInPlay: Perk | null = null;
  private depotShot: { position: THREE.Vector3; look: THREE.Vector3 } | null = null;
  private readonly stolen = new Set<number>();
  private readonly parcels = new Map<number, ParcelView>();
  private readonly departing: { view: ParcelView; from: THREE.Vector3; to: THREE.Vector3; t: number; route: Route }[] = [];
  /** Broken parcels stay in view where they landed for a while. */
  private readonly broken = new Map<number, number>();
  /** The countdown rings on live priority parcels, by parcel id. */
  private readonly priorityMarkers = new Map<number, PriorityMarker>();
  /** The labels on mystery boxes and fragile crates, by parcel id. */
  private readonly surpriseMarkers = new Map<number, SurpriseMarker>();
  private readonly throwers = new Map<number, WorkerId>();
  private readonly throwStarts = new Map<number, THREE.Vector3>();
  private readonly seenRoutes = new Set<Route>();
  private readonly activeRing: THREE.Mesh;
  /** With two players, the ring under player 2's worker, and the grab prompt over the parcel they would take. */
  private readonly partnerRing: THREE.Mesh;
  /** A stand-in for the camera, for fitting both players into the view before moving the real one. */
  private readonly framing = new THREE.PerspectiveCamera();
  private readonly partnerPrompt: THREE.Sprite;
  private readonly mesaRing: THREE.Mesh;
  private readonly mesaTag: THREE.Sprite;
  private readonly sleepTag: THREE.Sprite;
  private readonly marker: THREE.Mesh;
  private readonly pickupHalo: THREE.Mesh;
  private readonly pickupPrompt: THREE.Sprite;
  private readonly deliveryHalo: THREE.Mesh;
  private readonly keys = new Set<string>();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** The player's sound levels and camera shake, kept on this device. */
  public settings: GameSettings = loadSettings(browserStorage());
  /** A connected controller, read once a frame. */
  private readonly gamepad = new GamepadInput();
  public pad: PadFrame = { ...IDLE_PAD };
  /** The second controller, with two players: it plays Skanky. */
  private readonly gamepad2 = new GamepadInput();
  public pad2: PadFrame = { ...IDLE_PAD };
  private overview = false;
  private hint = 'Approach the belt · read the street address';
  private chapterHint = '';
  private countdownMs = 0;
  private countdownStartedAt = 0;
  private readonly workerWalks = new Map<WorkerId, WalkPoint[]>();
  private time = 0;
  private lastFrame = performance.now();
  private lastRender = 0;
  private renderCost = 0;
  private banter = new Set<string>();
  private bulkVisible = 0;
  private readonly pileVisible: Record<'T' | 'S', number> = { T: 0, S: 0 };
  private fumeTimer = 0;
  private mallBonus = 0;
  /** What tonight's delivery drives earned against par, and their times in seconds. */
  public driveBonus = 0;
  public driveTimes: number[] = [];
  /** The fastest earlier drive to this yard, raced as a ghost, and this drive's own recording (`ghostDrive.ts`); none in the car. */
  private ghost: GhostDrive | null = null;
  private ghostRecorder: GhostRecorder | null = null;
  /** The Timmies run (`coffeeRun.ts`): the lunch mini-game on the drive back from Tim Hortons, and its scene (made once). */
  private coffee: CoffeeRunModel | null = null;
  private coffeeScene: CoffeeRunScene | null = null;
  /** Tonight's Timmies run once played: the coffees that made it and what they paid the shift. */
  public coffeeResult: { cups: number; points: number } | null = null;
  /** `?minigame=coffee`: the Timmies run on its own, from its own briefing. */
  private readonly practiceCoffee = new URLSearchParams(window.location.search).get('minigame') === 'coffee';
  private breakAlertMs = 0;
  /**
   * JUST PLAY on the briefing: tonight runs without its story scenes. Each scene is passed over as a skip would pass
   * it, the lunch break and Ben's robbery go by without stopping the shift, and stealing the Mesa skips the dream.
   * The shift, the drives, the mall run, the key return and the results are all still played.
   */
  private justPlay = false;
  /** Tonight's daily challenge (`daily.ts`), when that is what is being played. */
  private daily: DailyNight | null = null;
  /** Each worker's smoothed velocity in world metres per second, for the camera's look-ahead. */
  private readonly motion: Record<WorkerId, { previous: THREE.Vector3 | null; velocity: THREE.Vector3 }> = {
    termite: { previous: null, velocity: new THREE.Vector3() }, skanky: { previous: null, velocity: new THREE.Vector3() },
  };
  private readonly lookAhead = new THREE.Vector3();
  /** A decaying camera shake, in metres, for breakages. */
  private shake = 0;
  /** The current story scene's heading, so a beat can move its clock. */
  private storyHeading = { title: '', kicker: '' };
  /**
   * The night opens at Termite and Skanky's place. Checks of the later
   * chapters turn this off to start at the arrival scenes, as before.
   */
  public playPrologue = true;

  private readonly host: HTMLElement;
  private readonly inputAbort = new AbortController();
  private readonly environment: THREE.WebGLRenderTarget;
  /** The snowy night outside: reflections and ambient for every scene but the depot. */
  private readonly nightEnvironment: THREE.WebGLRenderTarget;
  private tickTimer: number | undefined;
  private disposed = false;
  private readonly depotSolids = [...depotSolidFootprints(SHIFT_LAYOUT, SHIFT_LAYOUT.crewTruckRows, SHIFT_LAYOUT.playerTruckDepth).map(rect =>
    rect.x === SHIFT_LAYOUT.beltX && rect.width === 104 ? { ...rect, width: BELT_SOLID_WIDTH, height: rect.height + 16 } : rect), HEAD_DRIVE];

  constructor(host: HTMLElement) {
    this.applySettings();
    this.host = host;
    this.overlay = new Overlay(host);
    void audioSystem.preloadFoley();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // The Timmies run cuts the roof off Skanky's car with a clipping plane on its materials.
    this.renderer.localClippingEnabled = true;
    const gl = this.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
    this.quality = /swiftshader|llvmpipe|software|basic render/i.test(rendererName) ? 'low' : 'high';
    this.renderer.setPixelRatio(this.pixelRatio());
    // Software renderers keep the lighter procedural people and cartons and download no models.
    if (this.quality === 'low') void useCharacterModels([]);
    // Motion-captured clips move the crew models on GPU renderers; software renderers keep the figures' poses.
    else void useCharacterClips(true);
    setParcelModels(this.quality === 'high');
    this.renderer.shadowMap.enabled = this.quality === 'high';
    this.renderer.shadowMap.type = this.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('aria-label', 'The Belt game');
    this.overlay.root.prepend(this.renderer.domElement);

    this.world = new DepotWorld(this.quality);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.world.scene.environment = this.environment.texture;
    room.dispose();
    this.world.scene.environmentIntensity = 0.18;
    // Outside the depot nothing reflected anything: car paint and glass read as
    // flat film. A procedural night sky, moon and sodium lamps give the lot,
    // road, house, dream and drive their reflections and a little ambient.
    const night = createNightEnvironment();
    this.nightEnvironment = pmrem.fromScene(night, 0.04);
    disposeNightEnvironment(night);
    pmrem.dispose();
    this.stage = new StoryStage(this.quality);
    this.stage.setEnvironment(this.nightEnvironment.texture, 0.32);

    if (this.quality === 'high') {
      // The scene's depth is kept for the ambient-occlusion pass, which reads it instead of drawing the scene again.
      const depthTexture = DepotAmbientOcclusion.depthTexture();
      const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType, depthTexture });
      this.composer = new EffectComposer(this.renderer, target);
      this.renderPass = new RenderPass(this.world.scene, this.camera);
      this.composer.addPass(this.renderPass);
      // Ambient occlusion: contact shading under trucks, freight, shelves and
      // people, which the merged, flat-lit geometry otherwise lacks.
      // The composer clones its target, and the render pass draws into the clone (its read buffer), so the pass reads that clone's depth.
      const sceneDepth = this.composer.readBuffer.depthTexture ?? depthTexture;
      this.gtao = new DepotAmbientOcclusion(this.world.scene, this.camera, sceneDepth);
      this.composer.addPass(this.gtao);
      const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.96);
      // One invalid pixel from the multisampled scene must not spread through the bloom and black out the frame.
      guardBloom(bloom);
      this.composer.addPass(bloom);
      this.composer.addPass(new OutputPass());
    } else {
      this.composer = null;
      this.renderPass = null;
      this.gtao = null;
    }

    this.workers = { termite: createCharacter(TERMITE_SPEC), skanky: createCharacter(SKANKY_SPEC) };
    for (const worker of Object.values(this.workers)) {
      mergeCharacter(worker);
      this.world.scene.add(worker.root);
    }
    this.crew = new CrewLife(this.world, (id, copy, ms) => this.say(id, copy, ms));
    this.crew.caption = (text) => this.overlay.showToast(text, 2600);
    this.crew.foley = (effect, at) => audioSystem.playNear(effect, this.nearness(at));
    this.setPieces = new SetPieces(this.world, this.crew, (id, copy, ms) => this.say(id, copy, ms));
    this.mesa = new MesaEncounter(this.overlay, this.crew, {
      say: (id, copy, ms) => this.say(id, copy, ms),
      thought: () => this.overlay.say('skanky-thought', 'SKANKY', MESA.thought, 850, this.speakerAnchor('skanky'), true),
      dream: () => this.beginDream(),
      caught: (penalty) => this.showMesaCaught(penalty),
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
    this.dream = new MesaDream(this.overlay.root, this.quality);
    this.dream.scene.environment = this.nightEnvironment.texture;
    this.dream.scene.environmentIntensity = 0.22;
    this.touch = new TouchControls(this.overlay.root, {
      action: () => this.act(),
      switchWorker: () => { if (this.state === 'playing') this.model.switchWorker(); },
      brake: () => {
        if (this.state === 'playing') this.model.brake();
        else if (this.state === 'mall') this.mall?.toggleCart();
      },
      throwParcel: () => { if (this.state === 'playing') this.model.throwHeld(); },
      // VIEW: the depot's overview, or on the drive the five-ton's cab.
      overview: () => { if (this.state === 'driving') this.drivingView?.toggleView(); else this.overview = !this.overview; },
      pause: () => { if (this.canPause()) this.pause(); },
      mute: () => { audioSystem.toggleMuted(); },
    });
    this.overlay.onStoryButton((action) => {
      if (action === 'skip' && this.state === 'interlude') { this.skipInterlude(); return; }
      if (this.state !== 'story' || !this.cutscene) return;
      if (action === 'pause') { if (this.canPause()) this.pause(); return; }
      if (action === 'next') this.cutscene.userNext();
      else this.cutscene.skip();
    });

    this.activeRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), new THREE.MeshBasicMaterial({ color: 0xf3e6c6, transparent: true, opacity: 0.85 }));
    this.activeRing.rotation.x = -Math.PI / 2;
    this.world.scene.add(this.activeRing);
    this.partnerRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), new THREE.MeshBasicMaterial({ color: 0x7fd6e0, transparent: true, opacity: 0.85 }));
    this.partnerRing.rotation.x = -Math.PI / 2; this.partnerRing.visible = false;
    this.world.scene.add(this.partnerRing);
    this.partnerPrompt = textSprite(['ENTER · GRAB'], 0.19, { width: 150, height: 30, color: '#d9f6fa', background: '#172b30' });
    this.partnerPrompt.visible = false; this.world.scene.add(this.partnerPrompt);
    this.sleepTag = textSprite(['SORTING'], 0.22, { width: 110, height: 30, color: '#d8e2d0' });
    this.world.scene.add(this.sleepTag);
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), new THREE.MeshStandardMaterial({ color: 0xffd47c, emissive: 0xffd47c, emissiveIntensity: 0.8 }));
    this.marker.rotation.x = Math.PI;
    this.world.scene.add(this.marker);
    this.pickupHalo = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.49, 40), new THREE.MeshBasicMaterial({
      color: 0xffefc1, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.pickupHalo.name = 'pickup-highlight'; this.pickupHalo.rotation.x = -Math.PI / 2;
    this.pickupHalo.renderOrder = 8; this.pickupHalo.visible = false; this.world.scene.add(this.pickupHalo);
    this.pickupPrompt = textSprite([this.touch.enabled ? 'TAP GRAB' : 'SPACE · GRAB'], 0.19, { width: 150, height: 30, color: '#ffefc1', background: '#172b30' });
    this.pickupPrompt.visible = false; this.world.scene.add(this.pickupPrompt);
    this.deliveryHalo = new THREE.Mesh(new THREE.RingGeometry(0.64, 0.76, 40), new THREE.MeshBasicMaterial({
      color: 0xffd47c, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.deliveryHalo.name = 'delivery-highlight'; this.deliveryHalo.rotation.x = -Math.PI / 2;
    this.deliveryHalo.renderOrder = 8; this.deliveryHalo.visible = false; this.world.scene.add(this.deliveryHalo);
    // The Mesa Vic wants: a warm ring under it and its name above it while he makes the offer.
    this.mesaRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 40), new THREE.MeshBasicMaterial({
      color: 0xff9f43, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesaRing.name = 'mesa-highlight'; this.mesaRing.rotation.x = -Math.PI / 2;
    this.mesaRing.renderOrder = 8; this.mesaRing.visible = false; this.world.scene.add(this.mesaRing);
    this.mesaTag = textSprite(['MESA BOOGIE'], 0.26, { width: 220, height: 40, color: '#1a1206', background: '#ffb15c' });
    this.mesaTag.name = 'mesa-tag'; this.mesaTag.renderOrder = 9; this.mesaTag.visible = false; this.world.scene.add(this.mesaTag);
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
    this.drivingView?.dispose();
    disposeObject3D(this.dream.scene);
    disposeObject3D(this.world.scene);
    this.environment.dispose();
    this.nightEnvironment.dispose();
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

  /** Turns the crew's animation clips on or off. For checks and rehearsal. */
  public useCharacterClips(enabled: boolean): Promise<void> {
    return useCharacterClips(enabled);
  }

  /** The clip a character's imported model is playing, for checks. */
  public clipRoleOf(character: Character): string | null {
    return clipRoleOf(character);
  }

  /** Advances the imported models to their figures without drawing; the browser suites step time by hand. */
  public syncModels(): void {
    const stageScene = this.usesDriving() ? this.drivingView!.scene : this.usesStage() ? this.stage.scene : null;
    syncCharacterModels(this.state === 'dream' ? this.dream.scene : stageScene ?? this.world.scene);
  }

  /** Fixes the next run's random choices (opener, break place, variant, time). For checks and rehearsal. */
  public forceStory(choices: Partial<StoryChoices>): void {
    this.forcedStory = { ...choices };
    if (this.state === 'briefing') this.story = new StoryRun(Math.random, this.forcedStory);
  }

  private resize(): void {
    const width = this.host.clientWidth || window.innerWidth;
    const height = this.host.clientHeight || window.innerHeight;
    // A page opened in a hidden or collapsed window has no size yet. A 0/0
    // aspect would poison every camera; wait for the resize that gives it one.
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
    this.camera.aspect = width / height;
    // Narrow portrait screens need a wider lens to keep both lanes in view.
    this.camera.fov = width < height ? 58 : 38;
    this.camera.updateProjectionMatrix();
    this.stage.resize(width / height);
    this.drivingView?.resize(width / height);
    this.dream?.resize(width / height);
  }

  private canPause(): boolean {
    return this.state === 'playing' || this.state === 'break-alert' || this.state === 'interlude' || this.state === 'story' || this.state === 'driving' || this.state === 'mall' || this.state === 'lot' || this.state === 'coffee';
  }

  /** The primary action: grab/deliver on the belt, next line in a story, interact in the mall or lot. */
  private act(): void {
    if (this.state === 'playing') this.model.action();
    else if (this.state === 'story') this.cutscene?.userNext();
    else if (this.state === 'mall') this.mall?.action();
    else if (this.state === 'lot') this.lot?.action();
    else if (this.state === 'driving') this.driving?.park();
  }

  private bindInput(): void {
    window.addEventListener('keydown', (event) => {
      // A focused setting (a slider or a switch) keeps its own arrows, Space and Tab.
      if (event.target instanceof HTMLInputElement && (event.code.startsWith('Arrow') || event.code === 'Space' || event.code === 'Tab')) return;
      if (event.code === 'Tab') event.preventDefault();
      if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
      this.keys.add(event.code);
      if (event.repeat) return;
      void audioSystem.unlock();
      if (this.state === 'mesa' && this.mesa.key(event.code)) {
        event.preventDefault();
        return;
      }
      if (this.state === 'decision') {
        if (event.code === 'KeyG') this.decide('go');
        else if (event.code === 'KeyQ') this.decide('quit');
        else if (event.code === 'KeyM') audioSystem.toggleMuted();
        return;
      }
      if (event.code === 'Enter') {
        if (['briefing', 'story', 'ended', 'paused', 'coffee-done'].includes(this.state)) event.preventDefault();
        if (this.state === 'briefing') this.startNight();
        else if (this.state === 'coffee-done') this.afterCoffee();
        else if (this.state === 'story') this.cutscene?.skip();
        else if (this.state === 'ended') {
          if (this.practiceDestination) this.beginDriving(this.practiceDestination);
          else this.restart();
        }
        else if (this.state === 'paused') this.resume();
        else if (this.state === 'interlude') this.skipInterlude();
        else if (this.state === 'playing' && this.model.coop) this.model.action(this.model.partnerWorker);
      } else if (event.code === 'KeyM') {
        audioSystem.toggleMuted();
      } else if (event.code === 'Escape') {
        if (this.canPause()) this.pause();
        else if (this.state === 'paused') this.resume();
      } else if (this.state === 'story') {
        if (event.code === 'Space') this.cutscene?.userNext();
      } else if (this.state === 'driving') {
        if (event.code === 'Space') this.act();
        else if (event.code === 'KeyV') this.drivingView?.toggleView();
      } else if (this.state === 'mall') {
        if (event.code === 'Space') this.mall?.action();
        else if (event.code === 'KeyE') this.mall?.toggleCart();
      } else if (this.state === 'lot') {
        if (event.code === 'Space') this.lot?.action();
      } else if (this.state === 'briefing' && event.code === 'KeyP') {
        if (this.record.completed > 0) this.startNight(true);
      } else if (this.state === 'briefing' && event.code === 'KeyC' && !this.touch.enabled) {
        this.togglePlayers();
      } else if (this.state === 'briefing' && event.code === 'KeyJ') {
        this.startNight(false, true);
      } else if (this.state === 'briefing' && event.code === 'KeyN') {
        this.startEndless();
      } else if (this.state === 'briefing' && event.code === 'KeyY') {
        this.startDaily();
      } else if (this.state === 'briefing' && /^Digit[123]$/.test(event.code)) {
        this.pickPerk(Number(event.code.slice(5)) - 1);
      } else if (this.state === 'briefing' && (event.code === 'BracketLeft' || event.code === 'BracketRight')) {
        this.stepPerk(event.code === 'BracketRight' ? 1 : -1);
      } else if (event.code === 'KeyV') {
        this.overview = !this.overview;
      } else if (this.state === 'playing') {
        if (event.code === 'Space') this.model.action();
        else if (event.code === 'Tab') this.model.switchWorker();
        else if (event.code === 'KeyE') this.model.brake();
        else if (event.code === 'KeyF') this.model.throwHeld();
        else if (event.code === 'ShiftRight' && this.model.coop) this.model.throwHeld(this.model.partnerWorker);
      }
    }, { signal: this.inputAbort.signal });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code), { signal: this.inputAbort.signal });
    window.addEventListener('blur', () => { this.keys.clear(); this.touch.reset(); if (this.canPause()) this.pause(); }, { signal: this.inputAbort.signal });
    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointerdown', (event) => {
      canvas.focus({ preventScroll: true });
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
    if (this.model.coop) return 'P1 WASD · SPACE GRAB · F THROW   ·   P2 ARROWS · ENTER GRAB · RIGHT SHIFT THROW';
    return 'READ THE ADDRESS · MATCH THE STREET TO A TRUCK RANGE · TAB SWITCHES · COWORKER SORTS';
  }

  private showBriefing(): void {
    if (this.practiceDestination) {
      this.overlay.setMode('chapter');
      this.overlay.storyTitle('TRY THE FIVE-TON', 'DRIVING PRACTICE', 'EXPLORE THE CITY');
      this.overlay.showPanel(`<div class="kicker">THE BELT · 3D DRIVING PRACTICE</div><h1>TAKE THE FIVE-TON FOR A SPIN.</h1>
        <p>Explore the expanded city or drive straight to Southgate Mall. Real intersections, alternate routes and no time limit. Direct trips take around 45 seconds.</p>
        <p>${this.touch.enabled ? 'The stick steers. Hold GAS to accelerate and BRAKE to slow. Tap PARK in the lit bay.' : 'W / ↑ accelerates. A D / ← → steers. S / ↓ brakes. SPACE parks in the lit bay.'}</p>
        <p>The green 3D compass points directly toward your destination. Choose streets that head that way. Bumps and red lights cost 100 points. Hold BRAKE / S to reverse. ESC / PAUSE holds the road; M / MUTE controls sound.</p>
        <button type="button">START DRIVE  ↵</button><a href="${window.location.pathname}?mode=3d">PLAY THE FULL NIGHT</a>`, () => this.startNight());
      return;
    }
    if (this.practiceCoffee) {
      this.overlay.setMode('shift');
      this.overlay.showPanel(`<div class="kicker">TERMITE &amp; SKANKY  /  THE LUNCH MINI-GAME</div><h1>THE TIMMIES RUN.</h1>
        <p>Lunch at Tim Hortons is over. Termite drives everyone back to the depot, with Brian and Doris in the back, and Skanky rides up front holding two trays of coffees: thirty seconds, eight coffees.</p>
        <p>${this.touch.enabled ? 'The stick tilts the trays.' : 'WASD or the arrows tilt the trays.'} Lean into each turn, back when Termite brakes, forward as he pulls away, and keep the coffee in the middle over the bumps. Each coffee that makes it pays +${COFFEE_RUN.pointsPerCup}; all eight, +${COFFEE_RUN.allSafeBonus} more.</p>
        <button type="button">START  ↵</button><a href="${window.location.pathname}?mode=3d">PLAY THE FULL NIGHT</a>`, () => this.startNight());
      return;
    }
    this.overlay.setMode('shift');
    this.overlay.showPanel(`
      <div class="kicker">TERMITE &amp; SKANKY  /  ONE MORE OVERNIGHT</div>
      <h1>ANOTHER NIGHT ON THE BELT.</h1>
      <details class="b3d-howto"${this.record.completed > 0 ? '' : ' open'}><summary><b>HOW TO PLAY · Dispatch ${this.model.goal} packages together in three minutes.</b></summary>
      <ol class="b3d-steps">
        <li><b>Move beside a package.</b> ${this.touch.enabled ? 'Use the stick. Tap GRAB / DELIVER' : 'Use WASD / arrows. Press SPACE'} to grab the glowing parcel.</li>
        <li><b>Follow its destination.</b> The big street number chooses the truck: <b>27 ST → MILL WOODS (10–49 ST)</b>. The guide and gold marker show where to go.</li>
        <li><b>Walk through the truck’s open rear door.</b> ${this.touch.enabled ? 'Tap GRAB / DELIVER' : 'Press SPACE'} inside to load. OVERSIZE goes to BULK at the back; floor freight goes down the side stairs.</li>
      </ol>
      <p><b>Missed one? Recover it at the belt end.</b> The shift ends at ${this.model.capacity} packages in recovery. ${this.touch.enabled ? 'STOP THE BELT' : 'E / STOP THE BELT'} gives you two seconds to catch up: 3 stops per run, with a 15-second cooldown after each use. You get ${this.model.cleanupMs / 1000} seconds to finish after intake closes.</p>
      <p>Your partner sorts their side automatically. ${this.touch.enabled ? 'SWITCH' : 'TAB / right-click'} changes worker; only your controlled worker picks up bulk. Partner deliveries count toward the goal. Wrong drops cost 10 points; throws can break freight. A gold PRIORITY ring marks urgent freight: load it before the ring runs out for +${PRIORITY_3D.bonus}. Twice a night a supervisor watches for ${INSPECTION_3D.durationMs / 1000} seconds: clean loads +${INSPECTION_3D.bonus}, wrong drops cost more.</p>
      ${this.touch.enabled ? `
      <p>The stick moves. SWITCH changes worker. GRAB / DELIVER picks up and delivers. THROW risks it to save the walk.</p>
      <p>STOP THE BELT gives you a moment to catch up. VIEW shows the whole warehouse. In story scenes, NEXT or SKIP.</p>` : `
      <p>WASD / arrows move. TAB or right-click switches. SPACE or click grabs and delivers.</p>
      <p>F throws toward the nearest drop. At the top of the stairs, throw down with a 30% break risk. E stops the belt. V overview.</p>
      <p>Story scenes: SPACE next line, ENTER skips the scene, ESC pauses. JUST PLAY (J) skips every one.</p>
      <p>TWO PLAYERS (C): player 1 is Termite on WASD, SPACE grabs, F throws; player 2 is Skanky on the arrows, ENTER grabs, RIGHT SHIFT throws. A second controller plays Skanky.</p>`}
      <p>The night starts at home: go in to work, or quit UPS. After the shift, drive the five-ton to Southgate Mall and finish the deliveries. Driving controls appear when you get there.</p>
      </details>
      ${this.recordLine()}
      ${this.seniorityLine()}
      ${this.goalsLine()}
      ${this.perkLine()}
      ${this.record.completed > 0 ? `<p class="b3d-record">PEAK NIGHT UNLOCKED · in the flow and the rush freight comes a fifth sooner, the belt runs faster and recovery holds ${PEAK_NIGHT.capacity}. ${this.touch.enabled ? 'Tap PEAK NIGHT.' : 'Press P or click PEAK NIGHT.'} ENDLESS SHIFT${this.touch.enabled ? '' : ' (N)'} has no clock: the belt speeds up every minute until recovery overflows.</p>` : ''}
      <div class="b3d-start">${this.touch.enabled ? '' : `<button type="button" data-action="players" class="b3d-players">${this.settings.twoPlayers ? '2 PLAYERS' : '1 PLAYER'}  C<small>${this.settings.twoPlayers ? 'P2 · ARROWS · ENTER' : 'C FOR TWO PLAYERS'}</small></button>`}<button type="button" data-action="night">START THE NIGHT  ↵</button><button type="button" data-action="play" title="The shift, the drives and the mall run, without the story scenes">JUST PLAY${this.touch.enabled ? '' : '  J'}<small>NO STORY SCENES</small></button></div>
      ${this.dailyButton()}
      ${this.record.completed > 0 ? '<button type="button" data-action="peak">PEAK NIGHT  P</button><button type="button" data-action="endless">ENDLESS SHIFT  N</button>' : ''}
      ${this.record.played > 0 ? `<button type="button" class="b3d-medals-link" data-action="medals">MEDALS · ${this.record.medals.length} OF ${MEDALS.length} · RECENT NIGHTS</button>` : ''}
      <a href="${window.location.pathname}?mode=3d&amp;drive=mall">TRY JUST THE DRIVE · EXPLORE THE CITY</a>
      <a href="${window.location.pathname}?mode=3d&amp;minigame=coffee">TRY THE TIMMIES RUN · THE LUNCH MINI-GAME</a>
      <a href="${window.location.pathname}?mode=classic">PLAY THE ORIGINAL FULL SHIFT</a>`, { night: () => this.startNight(), play: () => this.startNight(false, true), players: () => this.togglePlayers(), peak: () => this.startNight(true), medals: () => this.showMedals(), endless: () => this.startEndless(), daily: () => this.startDaily(),
        'perk-0': () => this.pickPerk(0), 'perk-1': () => this.pickPerk(1), 'perk-2': () => this.pickPerk(2) });
  }

  // ---------------------------------------------------------------- story flow

  private startNight(peak = false, justPlay = false): void {
    if (this.state !== 'briefing') return;
    this.justPlay = justPlay && !this.practiceDestination;
    this.applyPlayers();
    // A peak night, once a night has been finished: a fresh shift with the peak rules (nothing has read the briefing's yet).
    if (peak && this.record.completed > 0 && !this.practiceDestination) this.model = new ShiftModel3D({ peak: true });
    // Tonight's perk changes the shift's rules before it starts.
    this.perkInPlay = this.daily ? this.daily.perk : this.record.completed > 0 && !this.practiceDestination ? perkById(this.perk) : null;
    this.perkInPlay?.apply(this.model);
    this.renderer.domElement.focus({ preventScroll: true });
    void audioSystem.unlock();
    audioSystem.play('ui-start');
    audioSystem.startMusic('game');
    if (this.practiceDestination) { this.beginDriving(this.practiceDestination); return; }
    if (this.practiceCoffee) { this.overlay.clearCenter(); this.beginCoffeeRun(); return; }
    this.overlay.clearCenter();
    if (this.playPrologue && !this.justPlay) {
      this.story.go('prologue');
      this.playScene(HOME_DECISION);
      return;
    }
    this.story.go('arrival');
    this.playScene(this.story.opener);
  }

  /**
   * The endless shift, once a night is finished: straight from the briefing to the
   * countdown, with no story around it and no lunch break; it ends when recovery overflows.
   */
  private startEndless(): void {
    if (this.state !== 'briefing' || this.record.completed === 0 || this.practiceDestination) return;
    this.model = new ShiftModel3D({ endless: true });
    this.story = new StoryRun(Math.random, { ...this.forcedStory, breakAtMs: Infinity });
    this.applyPlayers();
    this.renderer.domElement.focus({ preventScroll: true });
    void audioSystem.unlock();
    audioSystem.play('ui-start');
    audioSystem.startMusic('game');
    this.overlay.clearCenter();
    this.story.go('countdown');
    this.startCountdown();
  }

  /**
   * The daily challenge: today's seeded night (`daily.ts`), played like JUST PLAY, with the day's freight, goals and
   * rule. It counts as a night like any other, and keeps today's best and the days in a row besides.
   */
  private startDaily(): void {
    if (this.state !== 'briefing' || this.practiceDestination) return;
    const night = dailyNight(dailyDate());
    this.daily = night;
    this.model = new ShiftModel3D({ freightRandom: night.random.freight, random: night.random.throws, prizeRandom: night.random.prizes });
    this.goals = night.goals;
    this.story = new StoryRun(night.random.story, this.forcedStory);
    this.startNight(false, true);
  }

  /** The briefing's daily challenge button: today's rule, and today's best once there is one. */
  private dailyButton(): string {
    if (this.practiceDestination) return '';
    const date = dailyDate(), night = dailyNight(date), today = loadDaily(browserStorage(), date);
    const best = today.best === null ? '' : ` · BEST ${formatTotal(today.best)}`;
    const run = today.streak > 1 ? ` · ${today.streak} DAYS IN A ROW` : '';
    return `<button type="button" data-action="daily" title="One night a day, the same on every device: the date picks the freight, the surprises, the goals and a rule">DAILY CHALLENGE${this.touch.enabled ? '' : '  Y'}<small>TODAY: ${escapeHtml(night.perk.title)}${best}${run}</small></button>`;
  }

  /** The daily challenge's line on the results: this try against today's best, and the days in a row. */
  private dailyResult(total: number, grade: string): string {
    const daily = this.daily;
    if (!daily) return '';
    const storage = browserStorage();
    const { record, newBest } = recordDaily(loadDaily(storage, daily.date), total, grade);
    saveDaily(storage, record);
    const verdict = record.tries === 1 ? 'FIRST TRY TODAY' : newBest ? 'NEW BEST TODAY' : `TODAY'S BEST ${formatTotal(record.best ?? 0)}`;
    return `<p class="b3d-best"><b>DAILY CHALLENGE ${daily.date} · ${verdict}</b> · try ${record.tries} · ${record.streak} ${record.streak === 1 ? 'day' : 'days'} in a row · rule: ${escapeHtml(daily.perk.title)}</p>`;
  }

  /** C on the briefing: one player or two, remembered on this device. */
  private togglePlayers(): void {
    if (this.state !== 'briefing' || this.touch.enabled) return;
    this.settings.twoPlayers = !this.settings.twoPlayers;
    saveSettings(browserStorage(), this.settings);
    audioSystem.play('ui-start');
    this.showBriefing();
  }

  /** Tonight's model plays with two players when the setting asks (not on a touch screen, which has one stick). */
  private applyPlayers(): void {
    this.model.coop = this.settings.twoPlayers && !this.touch.enabled;
  }

  private playScene(scene: StoryScene): void {
    // Just playing: the scene is passed over as a skip would pass it, straight to what follows.
    if (this.justPlay) {
      this.state = 'story';
      this.cutscene = new Cutscene(scene);
      this.finishScene();
      return;
    }
    scene = { ...scene, title: scene.title.replace('MALLWOOD CENTRE', 'SOUTHGATE MALL') };
    // The 3D road now has a playable journey after the departure and original quip.
    // Keep shared cutscenes intact for both legacy versions.
    if (scene.id === 'drive-to-mall' || scene.id === 'drive-to-ups') scene = { ...scene, beats: scene.beats.slice(0, 2) };
    scene = breakScene3d(scene);
    this.overlay.setLunchAlert(false);
    this.state = 'story';
    this.cutscene = new Cutscene(scene);
    this.keys.clear();
    this.touch.reset();
    this.overlay.clearSpeech();
    this.overlay.setMode('story');
    const kicker = scene.location === 'depot' ? 'THE DEPOT' : scene.location === 'road' ? 'ON THE ROAD' : scene.location === 'mall' ? 'THE MALL RUN' : scene.location === 'home' ? 'FINALLY' : scene.location === 'house' ? 'AT HOME' : 'THE NIGHT SHIFT';
    this.storyHeading = { title: scene.title, kicker };
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
    this.overlay.setLunchAlert(false);
    const scene = this.cutscene?.scene;
    this.cutscene = null;
    this.overlay.clearSpeech();
    if (!scene) return;
    if (scene.id === 'home-decision') {
      this.showDecision();
    } else if (scene.id === 'leave-house') {
      this.story.go('commute');
      this.beginDriving('ups', 'home');
    } else if (scene.id === 'quit-night') {
      this.showQuitEnding();
    } else if (scene.id.startsWith('opener')) {
      this.story.go('scrum');
      this.playScene(SCRUM);
    } else if (scene.id === 'scrum') {
      this.story.go('countdown');
      this.startCountdown();
    } else if (this.story.chapter === 'break') {
      if (this.story.choices.breakPlace === 'timhortons' && !this.coffeeResult) this.beginCoffeeRun();
      else this.endBreak();
    } else if (scene.id === 'mall-assignment') {
      this.story.go('to-mall');
      this.playScene(DRIVE_TO_MALL);
    } else if (scene.id === 'drive-to-mall') {
      this.beginDriving('mall');
    } else if (scene.id === 'mall-intro') {
      this.beginMall();
    } else if (scene.id === 'drive-to-ups') {
      this.beginDriving('ups');
    } else if (scene.id === 'go-home') {
      this.showResults();
    }
  }

  /** Termite and Skanky choose: go in to work, or quit UPS. */
  private showDecision(): void {
    this.state = 'decision';
    this.keys.clear(); this.touch.reset();
    this.overlay.clearSpeech();
    this.overlay.showPanel(`<div class="kicker">${DECISION.kicker}</div>
      <h1>${DECISION.title}</h1>
      <p>${DECISION.body}</p>
      <p style="color:#8da7ac;font-size:12px;letter-spacing:1px">${this.touch.enabled ? 'TAP A CHOICE' : 'G GOES IN · Q QUITS · OR CLICK A CHOICE'}</p>
      <div class="b3d-choices"><button type="button" class="steal" data-action="go">${DECISION.go}</button><button type="button" class="leave" data-action="quit">${DECISION.quit}</button></div>`,
    { go: () => this.decide('go'), quit: () => this.decide('quit') });
  }

  private decide(choice: 'go' | 'quit'): void {
    if (this.state !== 'decision') return;
    audioSystem.play('button');
    this.overlay.clearCenter();
    if (choice === 'go') this.playScene(LEAVE_HOUSE);
    else {
      this.story.go('quit');
      this.playScene(QUIT_NIGHT);
    }
  }

  /** The quit ending: no shift and no results to grade. The morning living room stays in view. */
  private showQuitEnding(): void {
    this.state = 'ended';
    this.overlay.setMode('shift');
    this.story.go('results');
    audioSystem.startMusic('results');
    this.overlay.showPanel(`<div class="kicker">${QUIT_ENDING.kicker}</div>
      <h1>${QUIT_ENDING.title}</h1>
      <p>${QUIT_ENDING.body}</p>
      <button type="button">ANOTHER NIGHT  ↵</button>`, () => this.restart());
  }

  private startCountdown(): void {
    this.stage.end();
    this.overlay.setMode('shift');
    audioSystem.play('countdown');
    this.state = 'countdown';
    this.countdownMs = 0;
    this.countdownStartedAt = this.time;
    this.crew.beginWorkWalk();
    this.workerWalks.clear();
    for (const worker of this.model.workers) {
      const root = this.workers[worker.id].root;
      this.workerWalks.set(worker.id, platformWalkPath({ x: root.position.x * 32 + 480, y: root.position.z * 32 + 340 }, worker));
    }
    this.overlay.showCount('3');
    this.syncWorkers(0);
    this.snapCamera();
  }

  /** The random mid-shift break: the shift, belt and every parcel freeze until the crew is back. */
  private beginBreak(): void {
    this.story.takeBreak(this.model.elapsedMs);
    // Just playing, the break goes by without stopping the shift.
    if (this.justPlay) return;
    this.story.go('break');
    this.model.paused = true;
    audioSystem.stopMusic();
    this.state = 'break-alert';
    this.breakAlertMs = 3500;
    this.keys.clear(); this.touch.reset();
    this.overlay.setMode('shift');
    this.overlay.clearSpeech();
    this.overlay.setLunchAlert(true);
    audioSystem.lunchWhistle();
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
    this.overlay.storyTitle('SOUTHGATE MALL', 'SKANKY · THE MALL RUN', '5:20 AM');
    this.chapterHint = 'Take a store bundle from the truck';
    audioSystem.startMusic('game');
  }

  /** The city's view, made the first time a drive or the Timmies run needs it and kept for the night. */
  private ensureDrivingView(): DrivingView {
    if (!this.drivingView) {
      this.drivingView = new DrivingView(this.quality);
      this.drivingView.scene.environment = this.nightEnvironment.texture;
      this.drivingView.scene.environmentIntensity = 0.35;
    }
    this.drivingView.resize(this.camera.aspect);
    return this.drivingView;
  }

  /**
   * The Timmies run: the ride back from a Tim Hortons lunch (or `?minigame=coffee` on its own), Skanky in the
   * passenger seat holding two trays of coffees for thirty seconds while Termite drives.
   */
  private beginCoffeeRun(): void {
    const view = this.ensureDrivingView();
    if (this.coffee) this.coffeeScene?.end();
    this.coffeeScene ??= new CoffeeRunScene(view);
    this.coffee = new CoffeeRunModel();
    this.coffeeScene.begin();
    this.stage.end();
    this.state = 'coffee';
    this.keys.clear(); this.touch.reset();
    this.overlay.clearCenter(); this.overlay.clearSpeech();
    this.overlay.setMode('chapter');
    this.overlay.storyTitle('TIMMIES RUN', 'SKANKY · HOLD THE COFFEES');
    this.overlay.showToast(this.touch.enabled ? 'The stick tilts the trays · lean into turns, back when Termite brakes'
      : 'WASD / arrows tilt the trays · lean into turns, back when Termite brakes', 3600);
    audioSystem.startMusic('game');
    this.coffeeScene.update(this.coffee, [], 0, this.reducedMotion);
  }

  private handleCoffeeEvent(event: CoffeeRunEvent): void {
    if (event.type === 'spill') {
      audioSystem.play('splash');
      this.gamepad.rumble(0.45, 160);
      this.overlay.showToast(`SPLASH · ${event.left} of ${COFFEE_RUN.cups} coffees left`, 1400);
    } else if (event.type === 'bump') {
      audioSystem.play('drop');
      this.gamepad.rumble(Math.min(0.8, event.strength * 0.3), 120);
    } else if (event.type === 'warn') audioSystem.play('event-alert');
  }

  /** The ride is over: the coffees that made it pay the shift (or the practice keeps its score), and a card says so. */
  private finishCoffeeRun(): void {
    const run = this.coffee;
    if (!run) return;
    this.coffeeResult = { cups: run.cupsLeft, points: run.points };
    if (!this.practiceCoffee) this.model.score += run.points;
    this.state = 'coffee-done';
    this.keys.clear(); this.touch.reset();
    if (run.points) audioSystem.play('register');
    const all = run.cupsLeft === COFFEE_RUN.cups;
    this.overlay.showPanel(`<div class="kicker">TIMMIES RUN · ${this.practiceCoffee ? 'THE LUNCH MINI-GAME' : 'BACK AT THE DEPOT'}</div>
      <h1>${all ? 'NOT A DROP SPILLED.' : run.cupsLeft === 0 ? 'EVERY LAST COFFEE, GONE.' : `${run.cupsLeft} OF ${COFFEE_RUN.cups} COFFEES MADE IT.`}</h1>
      <p>${run.cupsLeft} × ${COFFEE_RUN.pointsPerCup}${all ? ` + ${COFFEE_RUN.allSafeBonus} for all ${COFFEE_RUN.cups}` : ''} · <b>+${run.points}</b>${this.practiceCoffee ? '' : ' to the shift'}</p>
      ${this.practiceCoffee ? `<button type="button">AGAIN  ↵</button><a href="${window.location.pathname}?mode=3d">PLAY THE FULL NIGHT</a>` : '<button type="button">BACK TO THE BELT  ↵</button>'}`,
    () => this.afterCoffee(), { docked: true });
  }

  /** After the card: the practice rides again; a night goes back to the belt. */
  private afterCoffee(): void {
    if (this.state !== 'coffee-done') return;
    this.overlay.clearCenter();
    if (this.practiceCoffee) { this.coffeeResult = null; this.beginCoffeeRun(); return; }
    this.coffeeScene?.end();
    this.coffee = null;
    this.endBreak();
  }

  private beginDriving(destination: DriveDestination, origin: DriveOrigin = 'depot'): void {
    this.driving = new DrivingModel(destination, origin);
    this.ghost = origin === 'home' ? null : loadGhosts(browserStorage())[destination] ?? null;
    this.ghostRecorder = origin === 'home' ? null : new GhostRecorder();
    this.ensureDrivingView();
    this.drivingView!.begin(this.driving, origin === 'home' ? 'car' : 'truck');
    this.stage.end();
    this.state = 'driving';
    this.keys.clear(); this.touch.reset();
    this.overlay.clearCenter(); this.overlay.clearSpeech();
    this.overlay.setMode('chapter');
    if (origin === 'home') this.overlay.storyTitle('HOME → UPS', 'SKANKY · DRIVING TO WORK', '12:40 AM');
    else this.overlay.storyTitle(destination === 'mall' ? 'UPS → SOUTHGATE MALL' : 'SOUTHGATE MALL → UPS',
      'SKANKY · FIVE-TON · FREE DRIVE', destination === 'mall' ? '5:05 AM' : '6:10 AM');
    this.overlay.showToast(this.touch.enabled ? `Green compass points to the bay · hold GAS · BRAKE / reverse${origin === 'home' ? '' : ' · VIEW cab'}` : `Green compass points to the bay · W / ↑ GAS · A D / ← → STEER · S / ↓ BRAKE / reverse${origin === 'home' ? '' : ' · V cab view'}`, 4500);
    audioSystem.startMusic('game');
  }

  /** A five-ton drive that parked: kept as the ghost when it is the first or the fastest, and how it compares. */
  private keepGhost(): string {
    const drive = this.driving, recorder = this.ghostRecorder;
    this.ghostRecorder = null;
    this.drivingView?.setGhost(null);
    if (!drive || !recorder || drive.origin === 'home' || !drive.parked) return '';
    const run = recorder.finish(drive.elapsed, drive.pose);
    if (!run) return '';
    const storage = browserStorage();
    const { store, newBest, previous } = keepFaster(loadGhosts(storage), drive.destination, run);
    if (newBest) saveGhosts(storage, store);
    if (!previous) return 'GHOST SAVED · race it next time';
    return newBest ? `BEAT YOUR GHOST BY ${(previous.seconds - run.seconds).toFixed(1)} s` : `${(run.seconds - previous.seconds).toFixed(1)} s BEHIND YOUR GHOST`;
  }

  private finishDrive(): void {
    const destination = this.driving?.destination;
    const ghostNote = this.keepGhost();
    audioSystem.setDriving(null);
    this.keys.clear(); this.touch.reset();
    if (this.practiceDestination && this.driving) {
      const drive = this.driving;
      this.practiceDestination = destination === 'mall' ? 'ups' : 'mall';
      this.state = 'ended';
      this.overlay.showPanel(`<div class="kicker">DRIVING PRACTICE · PARKED AT ${destination === 'mall' ? 'SOUTHGATE MALL' : 'UPS'}</div>
        <h1>TRUCK PARKED. NICE.</h1><p>${drive.elapsed.toFixed(1)} seconds · ${drive.collisions} bumps · ${drive.redLights} red lights · −${drive.penalty} points · cargo safe.</p>
        ${ghostNote ? `<p class="b3d-best"><b>${ghostNote}</b></p>` : ''}
        <p>Try the road in the other direction, or take the same drive again.</p>
        <button type="button">DRIVE BACK  ↵</button>
        <a href="${window.location.pathname}?mode=3d&amp;drive=${destination}">TRY THIS DRIVE AGAIN</a>
        <a href="${window.location.pathname}?mode=3d">PLAY THE FULL NIGHT</a>`, () => this.beginDriving(this.practiceDestination!));
      return;
    }
    if (this.driving && this.driving.origin !== 'home') {
      // A delivery drive between the yards pays for beating par.
      const seconds = this.driving.elapsed, bonus = parBonus(seconds);
      this.driveBonus += bonus;
      this.driveTimes.push(seconds);
      this.overlay.showToast(`${bonus ? `PARKED IN ${driveClock(seconds)} · UNDER ${seconds <= DRIVE_PAR.fast ? 'PAR' : 'TIME'} · +${bonus}` : `PARKED IN ${driveClock(seconds)} · over par`}${ghostNote ? ` · ${ghostNote}` : ''}`, ghostNote ? 3400 : 2600);
      if (bonus) audioSystem.play('register');
    }
    if (this.driving?.origin === 'home') {
      // Parked at work: the night continues with the original arrival scenes.
      this.story.go('arrival');
      this.playScene(this.story.opener);
    } else if (destination === 'mall') {
      this.story.go('mall');
      this.playScene(MALL_INTRO);
    } else {
      this.story.go('return');
      this.beginLot();
    }
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
    this.overlay.setLunchAlert(false);
    this.overlay.setInterlude(false);
    this.pausedFrom = this.state as Resumable;
    this.state = 'paused';
    this.model.paused = true;
    if (this.mall) this.mall.paused = true;
    if (this.lot) this.lot.paused = true;
    if (this.driving) this.driving.paused = true;
    this.keys.clear();
    this.touch.reset();
    audioSystem.stopMusic();
    const kicker = this.pausedFrom === 'interlude' || this.pausedFrom === 'story' ? 'STORY PAUSED' : this.pausedFrom === 'playing' ? 'SHIFT PAUSED' : 'PAUSED';
    this.showPausePanel(kicker);
  }

  private showPausePanel(kicker: string): void {
    this.overlay.showPanel(`<div class="kicker">${kicker}</div><h1>GAME PAUSED.</h1><p>Click RESUME or press ENTER to keep playing.</p><p>Your packages and timers are safe while paused.</p><button type="button" data-action="resume">RESUME  ↵</button><button type="button" class="b3d-secondary" data-action="settings">SETTINGS</button><button type="button" class="b3d-secondary" data-action="help">HOW TO PLAY</button><button type="button" class="b3d-secondary" data-action="end">END ${this.runName()}</button>`,
      { resume: () => this.resume(), settings: () => this.showSettings(kicker), help: () => this.showHelp(kicker), end: () => this.confirmEnd(kicker) });
  }

  /** What END on the pause screen drops: the practice drive, the endless shift or the night. */
  private runName(): string {
    return this.practiceDestination ? 'DRIVE' : this.model.endless ? 'SHIFT' : 'NIGHT';
  }

  /** Asks before dropping the run; ENTER still resumes. */
  private confirmEnd(kicker: string): void {
    const run = this.runName();
    this.overlay.showPanel(`<div class="kicker">${kicker} · END ${run}</div><h1>END THIS ${run}?</h1>
      <p>${this.practiceDestination ? 'The drive starts over from its briefing.' : 'Nothing from it is recorded: no night played, no best and no medals. You go back to the briefing.'}</p>
      <button type="button" data-action="back">BACK</button><button type="button" class="b3d-secondary" data-action="end">END ${run}</button>`,
    { back: () => this.showPausePanel(kicker), end: () => { if (this.state === 'paused') this.restart(); } });
  }

  /** The rules and controls in one place, from the pause screen. */
  private showHelp(kicker: string): void {
    const touch = this.touch.enabled, pad = this.pad.connected && !touch, m = this.model;
    const stops = ['no', 'once', 'twice', 'three times', 'four times', 'five times'][m.beltStopsLimit] ?? `${m.beltStopsLimit} times`;
    const rows: [string, string][] = [
      ['SORT', `${touch ? 'Tap GRAB' : pad ? 'A grabs' : 'SPACE grabs'} a parcel at the belt. Its street number names the truck: carry it through that truck's rear door and load it. Oversize goes to bulk at the back; floor freight goes down the side stairs.`],
      ['RECOVERY', `A parcel that reaches the belt end piles up in recovery; pick it up again for half points. ${this.model.capacity} in recovery ends the shift.`],
      ['STOP THE BELT', `${touch ? 'STOP THE BELT' : pad ? 'X' : 'E'} holds the belt for two seconds, ${stops} a night, with 15 seconds between.`],
      ['THROW', `${touch ? 'THROW' : pad ? 'B' : 'F'} throws to the nearest drop to save the walk. Fragile freight can break, and a throw down the stairs risks more.`],
      ['PRIORITY', `A gold ring marks urgent freight. Load it yourself before the ring runs out for +${PRIORITY_3D.bonus}.`],
      ['SURPRISES', `Twice a night a siren starts a RUSH WAVE: freight twice as fast for ${SURPRISE_3D.waveMs / 1000} seconds, +${SURPRISE_3D.waveBonus} if none of it reaches recovery. A MYSTERY BOX pays a random prize when you deliver it. A FRAGILE crate cannot be thrown and slows you down: carry it in for +${SURPRISE_3D.fragileBonus}.`],
      ['INSPECTIONS', `Twice a night a supervisor watches for ${INSPECTION_3D.durationMs / 1000} seconds. Each clean load while they watch pays +${m.inspectionPay}; a wrong drop costs ${INSPECTION_3D.penalty} more than usual.`],
      ['STREAKS', `Each clean load in a row adds 15 more points, up to +150. From ${FLOW_3D.combo} in a row you are ON FIRE and walk ${Math.round((FLOW_3D.pace - 1) * 100)}% faster. A wrong drop or a miss ends the streak.`],
      ['GOALS', `Each night sets three goals, shown on the briefing and as chips on the HUD. Each one met pays +${GOAL_BONUS}.`],
      ['PERKS', `Once you finish a night, the briefing offers three perks: pick one${touch ? '' : pad ? ' with LB / RB' : ' with 1, 2 or 3'} to bend that night's rules.`],
      ['DAILY CHALLENGE', `One night a day, the same on every device: the date picks the freight, the surprises, the goals and a rule. It plays without the story scenes${this.touch.enabled ? '' : ' (Y on the briefing)'}; today's best and the days in a row are kept on this device.`],
      ['GHOST DRIVES', 'Your fastest drive to each yard in the five-ton is kept on this device and drives beside you next time as a see-through truck. Beat it to keep the new one.'],
      ['TIMMIES RUN', `After a Tim Hortons lunch, Skanky rides back up front holding two trays of coffees for thirty seconds. ${touch ? 'The stick tilts' : pad ? 'The left stick tilts' : 'WASD or the arrows tilt'} the trays: lean into turns, back when Termite brakes, forward as he pulls away. +${COFFEE_RUN.pointsPerCup} a coffee, +${COFFEE_RUN.allSafeBonus} more for all eight.`],
      ['ENDLESS SHIFT', 'Also unlocked by a finished night: no clock. From the rush on, freight comes sooner and the belt runs faster every minute until recovery overflows. It keeps its own best.'],
      ['CONTROLS', touch ? 'The stick moves; SWITCH changes worker; GRAB / DELIVER, THROW and STOP THE BELT do what they say; VIEW shows the whole warehouse.'
        : pad ? 'Left stick or d-pad moves · A grabs and delivers · B throws · X stops the belt · Y switches worker · BACK overview · START pause. On menus the d-pad or stick picks, A presses and B goes back.'
        : 'WASD or arrows move · TAB or right-click switches worker · SPACE grabs and delivers · F throws · E stops the belt · V overview · ESC pause · M sound.'],
    ];
    this.overlay.showPanel(`<div class="kicker">${kicker} · HOW TO PLAY</div><h1>HOW TO PLAY</h1>
      <dl class="b3d-help">${rows.map(([term, text]) => `<dt>${term}</dt><dd>${escapeHtml(text)}</dd>`).join('')}</dl>
      <button type="button" data-action="back">BACK</button><button type="button" class="b3d-secondary" data-action="resume">RESUME  ↵</button>`,
    { back: () => this.showPausePanel(kicker), resume: () => this.resume() });
  }

  /** Music and effects levels, the camera shake and the resolution, changed live and kept on this device. */
  private showSettings(kicker: string): void {
    const percent = (value: number): number => Math.round(value * 100);
    const s = this.settings;
    this.overlay.showPanel(`<div class="kicker">${kicker} · SETTINGS</div><h1>SOUND AND CAMERA</h1>
      <label class="b3d-setting">MUSIC <input type="range" min="0" max="100" step="5" data-setting="music" value="${percent(s.music)}"><output>${percent(s.music)}%</output></label>
      <label class="b3d-setting">EFFECTS <input type="range" min="0" max="100" step="5" data-setting="effects" value="${percent(s.effects)}"><output>${percent(s.effects)}%</output></label>
      <label class="b3d-setting">RESOLUTION <input type="range" min="${percent(MIN_RESOLUTION)}" max="100" step="5" data-setting="resolution" value="${percent(s.resolution)}"><output>${percent(s.resolution)}%</output></label>
      <label class="b3d-setting check"><input type="checkbox" data-setting="shake"${s.shake ? ' checked' : ''}> CAMERA SHAKE WHEN FREIGHT BREAKS</label>
      <p>Saved on this device. M still mutes everything; reduced motion always stills the camera. A lower resolution draws fewer pixels, for a smoother game on a slow or very sharp screen.</p>
      <button type="button" data-action="back">BACK</button><button type="button" class="b3d-secondary" data-action="resume">RESUME  ↵</button>`,
    { back: () => this.showPausePanel(kicker), resume: () => this.resume() });
    for (const input of document.querySelectorAll<HTMLInputElement>('.b3d-panel [data-setting]')) {
      input.addEventListener('input', () => {
        const key = input.dataset.setting as keyof GameSettings;
        if (key === 'shake') this.settings = { ...this.settings, shake: input.checked };
        else {
          this.settings = { ...this.settings, [key]: Number(input.value) / 100 };
          const output = input.nextElementSibling;
          if (output) output.textContent = `${input.value}%`;
        }
        this.applySettings();
        saveSettings(browserStorage(), this.settings);
      });
    }
  }

  private applySettings(): void {
    audioSystem.setLevels(this.settings.music, this.settings.effects);
    // The constructor sets the levels before the renderer exists, and gives it its first pixel ratio itself.
    if (!this.renderer) return;
    const ratio = this.pixelRatio();
    if (this.renderer.getPixelRatio() === ratio) return;
    this.renderer.setPixelRatio(ratio);
    this.composer?.setPixelRatio(ratio);
    this.resize();
  }

  /** The screen's pixel ratio (up to 2) on a GPU, 0.6 on a software renderer, scaled by the RESOLUTION setting. */
  private pixelRatio(): number {
    return (this.quality === 'high' ? Math.min(window.devicePixelRatio, 2) : 0.6) * this.settings.resolution;
  }

  private resume(): void {
    this.state = this.pausedFrom;
    this.overlay.setLunchAlert(this.state === 'break-alert');
    this.overlay.setInterlude(this.state === 'interlude');
    // The shift stays frozen through a story; only active sorting runs its clock.
    this.model.paused = this.state !== 'playing';
    if (this.mall) this.mall.paused = false;
    if (this.lot) this.lot.paused = false;
    if (this.driving) this.driving.paused = false;
    this.keys.clear(); this.touch.reset();
    this.overlay.clearCenter();
    this.renderer.domElement.focus({ preventScroll: true });
    if (this.state === 'playing' || this.state === 'mall' || this.state === 'driving' || this.state === 'coffee'
      || this.state === 'story' && this.story.chapter !== 'break') audioSystem.startMusic('game');
  }

  /** Ben's robbery freezes the shift, belt, freight and crew until Paula leaves. */
  private beginInterlude(): void {
    this.benStarted = true;
    // Just playing, Ben's scene is over before it starts (as ENTER would leave it) and the shift never stops.
    if (this.justPlay) { this.setPieces.skipBen(this.time); return; }
    this.state = 'interlude';
    this.model.paused = true;
    this.benClock = BEN_START;
    this.keys.clear();
    this.overlay.hold = (key) => BEN_CAST.has(key);
    this.overlay.setInterlude(true);
    this.overlay.showToast(`BEN'S BIG MOMENT · belt held, your freight is safe · ${this.touch.enabled ? 'SKIP SCENE' : 'ENTER'} skips it`, 3000);
    audioSystem.stopMusic();
  }

  /** ENTER or SKIP SCENE: Ben's scene jumps to its end and the shift carries on. */
  private skipInterlude(): void {
    if (this.state !== 'interlude') return;
    this.setPieces.skipBen(this.time);
    this.benClock = BEN_END;
    this.endInterlude();
  }

  private endInterlude(): void {
    this.overlay.setInterlude(false);
    this.state = 'playing';
    this.model.paused = false;
    this.overlay.dropSpeech((key) => BEN_CAST.has(key));
    this.overlay.hold = null;
    this.overlay.showToast('BACK TO THE BELT', 1800);
    audioSystem.startMusic('game');
  }

  private beginDream(): void {
    // Just playing, the stolen Mesa goes home without the dream, straight back to the shift.
    if (this.justPlay) { this.mesa.dreamFinished(); return; }
    this.state = 'dream';
    this.overlay.root.classList.add('dreaming');
    this.dream.start();
    audioSystem.startMusic('results');
  }

  private showMesaCaught(penalty: number): void {
    audioSystem.play('wrong');
    this.overlay.showToast(`${MESA.caught} · −${penalty} points · back to work`, 3500);
  }

  /** A replay starts clean: no leftover scenes, parcels, timers, speech or input. */
  private restart(): void {
    audioSystem.stopMusic();
    this.justPlay = false;
    for (const view of this.parcels.values()) disposeObject3D(view.root);
    for (const item of this.departing) disposeObject3D(item.view.root);
    this.parcels.clear();
    this.departing.length = 0;
    this.broken.clear();
    this.priorityMarkers.clear();
    this.surpriseMarkers.clear();
    this.throwers.clear();
    this.throwStarts.clear();
    this.seenRoutes.clear();
    this.bulkVisible = 0;
    this.pileVisible.T = this.pileVisible.S = 0;
    this.world.setFloorPile('T', 0);
    this.world.setFloorPile('S', 0);
    this.stolen.clear();
    this.benStarted = false;
    this.benClock = BEN_START;
    this.overlay.hold = null;
    this.overlay.setInterlude(false);
    this.setPieces.reset();
    this.mesa.reset();
    this.dream.stop();
    this.overlay.root.classList.remove('dreaming');
    this.model = new ShiftModel3D();
    this.goals = nightGoals(this.record.played);
    this.goalsAnnounced.clear();
    this.paceSamples = [];
    this.goalBonus = 0;
    this.perk = null;
    this.perkInPlay = null;
    this.daily = null;
    this.story = new StoryRun(Math.random, this.forcedStory);
    this.cutscene = null;
    this.mall = null;
    this.lot = null;
    this.driving = null;
    this.drivingPenalty = this.drivingCollisions = this.drivingRedLights = 0;
    this.driveBonus = 0; this.driveTimes = [];
    this.ghost = null; this.ghostRecorder = null;
    if (this.coffee) this.coffeeScene?.end();
    this.coffee = null; this.coffeeResult = null;
    this.mallBonus = 0;
    this.breakAlertMs = 0;
    this.overlay.setLunchAlert(false);
    this.stage.reset();
    this.stage.resetMall();
    this.depotShot = null;
    for (const motion of Object.values(this.motion)) { motion.previous = null; motion.velocity.set(0, 0, 0); }
    this.lookAhead.set(0, 0, 0);
    this.shake = 0;
    for (const worker of Object.values(this.workers)) worker.action = undefined;
    this.banter.clear();
    this.crew.reset();
    this.workerWalks.clear();
    this.overlay.clearSpeech();
    this.keys.clear();
    this.touch.reset();
    this.hint = 'Approach the belt · read the street address';
    this.state = 'briefing';
    this.snapCamera();
    this.showBriefing();
  }

  private movement(): { x: number; y: number } {
    // With two players on the belt, the arrows are player 2's.
    const arrows = !(this.model.coop && this.state === 'playing');
    const keyX = (this.keys.has('KeyD') || (arrows && this.keys.has('ArrowRight')) ? 1 : 0) - (this.keys.has('KeyA') || (arrows && this.keys.has('ArrowLeft')) ? 1 : 0);
    const keyY = (this.keys.has('KeyS') || (arrows && this.keys.has('ArrowDown')) ? 1 : 0) - (this.keys.has('KeyW') || (arrows && this.keys.has('ArrowUp')) ? 1 : 0);
    return {
      x: Math.max(-1, Math.min(1, keyX + this.touch.move.x + this.pad.move.x)),
      y: Math.max(-1, Math.min(1, keyY + this.touch.move.y + this.pad.move.y)),
    };
  }

  /**
   * The shift's time scale this frame: a long throw (`TRICK_SHOTS`) plays the end of its flight at a third of the speed,
   * so the landing (or the break) is seen. Reduced motion never slows it.
   */
  private throwTime(): number {
    if (this.reducedMotion) return 1;
    const slow = this.model.packages.some((parcel) => {
      const flight = parcel.state === 'thrown' ? parcel.flight : null;
      return !!flight && flight.elapsedMs / flight.durationMs >= 0.45
        && Math.hypot(flight.toX - flight.fromX, flight.toY - flight.fromY) >= TRICK_SHOTS.long.px;
    });
    return slow ? 0.33 : 1;
  }

  /** Player 2's arrows and second controller, with two players. */
  private partnerMovement(): { x: number; y: number } {
    const keyX = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    const keyY = (this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('ArrowUp') ? 1 : 0);
    return { x: Math.max(-1, Math.min(1, keyX + this.pad2.move.x)), y: Math.max(-1, Math.min(1, keyY + this.pad2.move.y)) };
  }

  /** With a controller in use, the HUD and the grab prompt name its buttons; without one, the keyboard's again. */
  private showPadHints(pad: boolean): void {
    this.overlay.setPadHints(pad);
    if (this.touch.enabled) return;
    const material = this.pickupPrompt.material;
    const previous = material.map;
    material.map = textTexture([pad ? 'A · GRAB' : 'SPACE · GRAB'], { width: 150, height: 30, color: '#ffefc1', background: '#172b30' });
    material.needsUpdate = true;
    previous?.dispose();
  }

  /** Reads the controller: its stick and triggers feed movement and the pedals, and each button press presses its key. */
  private pollGamepad(): void {
    const pads = typeof navigator.getGamepads === 'function' ? [...navigator.getGamepads()] : [];
    const frame = this.gamepad.poll(pads);
    if (frame.connected && !this.pad.connected) {
      this.overlay.showToast('CONTROLLER READY · A grab / deliver · B throw · X stop the belt · Y switch · START pause', 4200);
    }
    if (frame.connected !== this.pad.connected) this.showPadHints(frame.connected);
    // A controller that drops out mid-play (a flat battery, a pulled cable) pauses the game, as a console does.
    if (!frame.connected && this.pad.connected && this.canPause()) this.pause();
    this.pad = frame;
    const frame2 = this.model.coop ? this.gamepad2.poll(pads, 1) : { ...IDLE_PAD, move: { x: 0, y: 0 }, pressed: [] };
    if (frame2.connected && !this.pad2.connected) this.overlay.showToast('SECOND CONTROLLER · PLAYER 2 IS SKANKY · A grab · B throw', 3500);
    this.pad2 = frame2;
    for (const button of frame2.pressed) {
      if (button === 'start') { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape' })); continue; }
      if (this.state !== 'playing') continue;
      if (button === 'a') this.model.action(this.model.partnerWorker);
      else if (button === 'b') this.model.throwHeld(this.model.partnerWorker);
    }
    for (const button of frame.pressed) {
      if (this.padMenu(button)) continue;
      const code = padKey(this.state, button);
      if (!code) continue;
      // The same path as a key press, so every screen behaves exactly as it does for the keyboard.
      window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    }
  }

  /**
   * On the briefing, pause and results panels the d-pad or stick steps a highlight
   * through the panel's buttons, links and settings, left and right move a
   * highlighted slider, A presses the highlighted control and B presses BACK.
   * Until a direction is pushed, A keeps its usual meaning. True when the press was used here.
   */
  private padMenu(button: PadButton): boolean {
    if (this.state !== 'briefing' && this.state !== 'paused' && this.state !== 'ended') return false;
    const controls = [...this.overlay.root.querySelectorAll<HTMLElement>('.b3d-panel button, .b3d-panel summary, .b3d-panel a[href], .b3d-panel input')]
      .filter((control) => control.offsetParent !== null);
    const at = controls.findIndex((control) => control.classList.contains('pad-focus'));
    const current = controls[at];
    if (button === 'up' || button === 'down') {
      if (!controls.length) return false;
      const step = button === 'down' ? 1 : -1;
      const next = at < 0 ? (step > 0 ? 0 : controls.length - 1) : (at + step + controls.length) % controls.length;
      current?.classList.remove('pad-focus');
      controls[next].classList.add('pad-focus');
      controls[next].focus({ preventScroll: true });
      controls[next].scrollIntoView({ block: 'nearest' });
      return true;
    }
    if (button === 'b') {
      const back = controls.find((control) => control.dataset.action === 'back');
      back?.click();
      return back !== undefined;
    }
    if (!current) return false;
    if ((button === 'left' || button === 'right') && current instanceof HTMLInputElement && current.type === 'range') {
      if (button === 'right') current.stepUp(); else current.stepDown();
      current.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (button === 'a') { current.click(); return true; }
    return false;
  }

  private tick(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;
    this.pollGamepad();
    const m = this.model;
    let dispersed = false;

    if (this.state === 'break-alert') {
      this.breakAlertMs = Math.max(0, this.breakAlertMs - dt * 1000);
      if (this.breakAlertMs === 0) this.playScene(this.story.breakScene);
    }
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
      const step = Math.min(dt, this.time - this.countdownStartedAt);
      this.crew.disperse(step, this.time);
      dispersed = true;
      const before = this.countdownMs;
      this.countdownMs += step * 1000;
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
        // Resuming an opening scene keeps sorting paused until this handoff.
        m.paused = false;
        this.renderer.domElement.focus({ preventScroll: true });
        this.story.go('shift');
        this.overlay.showToast(m.coop ? `${m.peak ? 'PEAK NIGHT · ' : ''}P1 ${m.activeWorker.id.toUpperCase()}: WASD · SPACE · F   ·   P2 ${m.partnerWorker.id.toUpperCase()}: ARROWS · ENTER · RIGHT SHIFT`
          : `${m.peak ? 'PEAK NIGHT · ' : ''}You are ${m.activeWorker.id.toUpperCase()} · ${this.touch.enabled ? 'SWITCH' : 'TAB'} changes worker · follow the package guide`, m.coop ? 5000 : 3200);
        audioSystem.startMusic('game');
      }
    }
    if (this.state === 'playing') {
      // Ben's big moment is a story scene; the endless shift has none.
      if (!this.benStarted && !m.endless && m.elapsedMs >= BEN_START && !m.ended) this.beginInterlude();
      else if (this.mesa.check(m)) this.state = 'mesa';
      else if (this.story.breakDue(m.elapsedMs) && !m.ended) this.beginBreak();
    }
    if (this.state === 'playing') {
      m.laneObstacles = this.crew.patrolObstacles;
      m.partnerMove = m.coop ? this.partnerMovement() : { x: 0, y: 0 };
      m.update(dt * 1000 * this.throwTime(), this.movement());
      if (!m.endless) samplePace(this.paceSamples, m.elapsedMs, m.score);
      this.watchFrameRate(dt);
      for (const event of m.drainEvents()) this.handleEvent(event);
      this.crew.watcher = m.inspection ? this.watcherName === 'VIC' ? 'vic' : 'shan' : null;
      this.announceGoals();
      if (m.onFire && !this.wasOnFire) this.overlay.showToast(`ON FIRE · ${FLOW_3D.combo} IN A ROW · YOU WALK FASTER WHILE THE STREAK LASTS`, 2600);
      this.wasOnFire = m.onFire;
      this.updateBanter();
      this.crew.update(dispersed ? 0 : dt, m, this.time);
      this.setPieces.update(dt, m, this.time);
      // The far end of the building, while sorting goes on.
      audioSystem.updateAmbience(dt, !m.paused && !m.ended);
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
    } else if (this.state === 'driving' && this.driving) {
      const drive = this.driving, move = this.movement();
      const wasBraking = drive.braking;
      drive.update(dt, { steer: move.x, throttle: Math.max(0, -move.y, this.touch.pedals.throttle, this.pad.throttle), brake: Math.max(0, move.y, this.touch.pedals.brake, this.pad.brake) });
      if (drive.braking && !wasBraking) audioSystem.drivingCue('brake');
      for (const event of drive.drainEvents()) {
        if (event.type === 'collision') {
          this.drivingPenalty += event.points; this.drivingCollisions++;
          audioSystem.drivingCue('collision');
          this.gamepad.rumble(event.kind === 'cone' ? 0.35 : 0.7, 220);
          this.drivingView?.jolt(event.kind === 'cone' ? 0.18 : 0.4);
          this.overlay.showToast(`EASY DOES IT · −${event.points} points${drive.origin === 'home' ? '' : ' · cargo safe'}`, 1600);
        } else if (event.type === 'red-light') {
          this.drivingPenalty += event.points; this.drivingRedLights++;
          this.overlay.showToast(`RED LIGHT · −${event.points} points · brake before the line`, 1800);
        }
      }
      this.ghostRecorder?.sample(drive.elapsed, drive.pose);
      this.drivingView?.setGhost(this.ghost ? ghostPose(this.ghost, drive.elapsed) : null);
      this.drivingView?.update(drive, dt);
      if (drive.parked) this.finishDrive();
    } else if (this.state === 'coffee' && this.coffee && this.coffeeScene) {
      this.coffee.update(dt * 1000, this.movement());
      const events = this.coffee.drainEvents();
      for (const event of events) this.handleCoffeeEvent(event);
      this.coffeeScene.update(this.coffee, events, dt, this.reducedMotion);
      if (this.coffee.done) this.finishCoffeeRun();
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
        if (event.type === 'done') audioSystem.play('correct');
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
    audioSystem.setTruckIdle((this.state === 'playing' && !m.endless && m.elapsedMs >= 120_000) || this.state === 'celebrating');
    // The conveyor runs while sorting goes on, and falls quiet when it stops (a brake, a story stop, a pause, the end).
    const beltRunning = this.state === 'playing' && !m.paused && !m.ended && !m.eventStopped && m.brakeRemainingMs <= 0;
    audioSystem.setBelt(beltRunning ? m.beltSpeed : null, beltRunning ? m.packages.filter((parcel) => parcel.state === 'belt').length : 0);
    audioSystem.setDriving(this.state === 'driving' && this.driving ? this.driving.speed : null);
    if (this.state === 'playing') this.crew.updateReceiving(m, dt, this.time);
    this.world.update(running ? dt : 0, this.time, m.beltTravel, this.reducedMotion);
    // Depot snow only falls while the depot is on screen; the wall piles always follow the shift clock.
    const depotShown = this.state !== 'paused' && this.state !== 'dream' && !this.usesDriving() && !this.usesStage();
    this.world.updateChristmas(depotShown ? dt : 0, m.elapsedMs, m.durationMs, this.reducedMotion);
    const depotStory = this.state === 'story' && this.cutscene?.scene.location === 'depot';
    if (!depotStory) this.syncWorkers(running || this.state === 'countdown' ? dt : 0);
    if (this.state === 'playing' || this.state === 'countdown' || this.state === 'briefing') this.clearCrewFootprints();
    this.syncParcels(running ? dt : 0);
    this.footsteps();
    this.world.updateTruckInterior(m.activeWorker);
    this.updateCamera(dt);
    this.updateHud();
    const size = this.renderer.getSize(new THREE.Vector2());
    const speechClock = running || this.state === 'interlude' || this.state === 'mesa' || this.state === 'dream' || this.state === 'story' || this.state === 'driving' || this.state === 'mall' || this.state === 'lot';
    const camera = this.activeCamera();
    // Bubbles project with the camera as it is now, whether or not a draw follows.
    camera.updateMatrixWorld();
    this.overlay.update(dt * 1000, speechClock, camera, size.x, size.y);
  }

  /**
   * Once a visit, after eight seconds of sorting below 30 frames a second on a GPU renderer, suggests a lower
   * resolution; never at the lowest already, and never on a software renderer, which draws at 0.6 anyway.
   */
  private watchFrameRate(dt: number): void {
    const watch = this.slowFrames;
    if (watch.hinted || this.quality !== 'high' || this.settings.resolution <= MIN_RESOLUTION || !(dt > 0)) return;
    watch.seconds += dt; watch.frames += 1;
    if (watch.seconds < 8) return;
    if (watch.frames / watch.seconds < 30) {
      watch.hinted = true;
      this.overlay.showToast('RUNNING SLOWLY? A LOWER RESOLUTION IN SETTINGS (ESC) CAN HELP', 5000);
    }
    watch.seconds = 0; watch.frames = 0;
  }

  /** Tonight's score less the best night's at the same moment of the shift, while sorting; null with nothing to race. */
  private paceGap(): number | null {
    const m = this.model;
    if (this.state !== 'playing' || m.endless || m.elapsedMs < PACE_STEP_MS) return null;
    const best = paceAt(this.record.best?.pace, m.elapsedMs);
    return best === null ? null : Math.round(m.score - best);
  }

  private updateHud(): void {
    const m = this.model;
    const held = m.heldPackage;
    const scannerWorker = this.state === 'playing' ? m.pendingScannerWorker : null;
    const scannerSelected = scannerWorker !== null && scannerWorker === m.activeWorker.id;
    const scanner = scannerWorker ? `${scannerWorker.toUpperCase()} NEEDS A SCANNER RESET · ${scannerSelected
      ? this.touch.enabled ? 'TAP RESET SCANNER' : 'SPACE TO RESET'
      : this.touch.enabled ? 'SWITCH, THEN RESET SCANNER' : 'TAB TO SWITCH, THEN SPACE'}` : '';
    this.overlay.sortingGuide(this.state === 'playing' ? scannerSelected
      ? { title: 'RESET YOUR SCANNER', detail: `${this.touch.enabled ? 'Tap RESET SCANNER' : 'Press SPACE'} · then keep sorting; your package stays in hand` }
      : sortingGuide(m, this.touch.enabled) : null);
    const target = this.state === 'playing' && held ? m.throwTarget() : null;
    const throwHint = target ? (target.ok ? ` · [F] ${target.reason}` : ` · ${target.reason}`) : '';
    const truck = truckInteriorAt(m.activeWorker);
    const overflow = truck ? [...m.truckLoads.values()].filter(load => load.route === truck && load.overflow).length : 0;
    const loadingHint = truck ? overflow ? `SHELVES FULL · ${overflow} in rear overflow` : 'Face a shelf · SPACE loads near where you stand' : '';
    this.overlay.updateHud({
      sorted: m.sorted, goal: m.endless ? 0 : m.goal, score: m.score, timeLeftMs: m.endless ? m.elapsedMs : m.timeLeftMs, backlog: m.pileup, capacity: m.capacity,
      clockLabel: m.endless ? 'SURVIVED' : undefined,
      pace: this.paceGap(),
      phase: this.state === 'interlude' ? 'BEN  /  DODGE TRAINING'
        : m.endless ? `ENDLESS  /  LEVEL ${m.endlessLevel}${this.record.endless ? `  /  BEST ${this.record.endless.sorted}` : ''}${this.underWay()}`
        : `${PHASE_LABELS[m.phase] ?? ''}${this.underWay()}`, combo: m.combo, worker: m.activeWorker.id,
      partner: m.coop ? m.partnerWorker.id : undefined,
      hint: this.state === 'interlude' ? 'Belt held · your freight is safe' : this.state === 'mesa' ? 'Y steals the Mesa · N leaves it'
        : scannerSelected ? `${this.touch.enabled ? 'RESET SCANNER' : 'SPACE resets scanner'} · carried freight stays in hand`
        : held ? `${parcelAddress(held)} · ${held.label}${throwHint}${loadingHint ? ` · ${loadingHint}` : ''}` : loadingHint || this.hint,
      overview: this.overview, routes: this.routeLegend(), scanner,
      goals: [...(m.endless ? [] : this.goals.map((goal) => goal.chip(m))), ...(this.perkInPlay ? [{ text: `PERK · ${this.perkInPlay.title}`, state: 'perk' as const }] : [])],
      brake: m.brakeRemainingMs > 0 || m.eventStopped ? `■ BELT STOPPED · ${m.beltStopsRemaining} LEFT`
        : `[E] STOP THE BELT · ${m.beltStopsRemaining} LEFT${m.beltStopsRemaining > 0 && m.brakeCooldownMs > 0 ? ` · ${Math.ceil(m.brakeCooldownMs / 1000)}s` : ''}`,
    });
    this.overlay.drivingNavigation(this.state === 'driving' && this.driving ? {
      destination: this.driving.destination === 'mall' ? 'SOUTHGATE MALL' : 'UPS DEPOT', distance: this.driving.remaining, instruction: this.driving.navigation.instruction,
    } : null);
    const coffeeShown = (this.state === 'coffee' || this.state === 'coffee-done' || this.state === 'paused' && this.pausedFrom === 'coffee') && this.coffee !== null;
    this.overlay.coffeeGauge(coffeeShown && this.coffee ? { forward: this.coffee.slosh.forward, right: this.coffee.slosh.right,
      tiltForward: this.coffee.tilt.forward, tiltRight: this.coffee.tilt.right, danger: this.coffee.danger, cups: this.coffee.cups } : null);
    if (coffeeShown && this.coffee) {
      const run = this.coffee, next = run.upcoming;
      this.overlay.chapterHud([['COFFEES', `${run.cupsLeft} / ${COFFEE_RUN.cups}`], ['TIME', `0:${String(Math.ceil(run.remainingMs / 1000)).padStart(2, '0')}`], ['POINTS', `+${run.points}`]],
        next ? `${next.label} · ${next.hint}` : run.waiting ? 'RED LIGHT · hold the trays steady' : 'Keep the coffee in the middle of the gauge',
        this.touch.enabled ? 'THE STICK TILTS THE TRAYS' : 'WASD / ARROWS TILT THE TRAYS · ESC PAUSE · M MUTE');
    } else if (this.state === 'driving' && this.driving) {
      const drive = this.driving;
      const objective = drive.origin === 'home' ? drive.objective.replace(' · cargo safe', '') : drive.objective;
      const hint = this.touch.enabled ? objective
        .replace('W / ↑ gas · A D / ← → steer · S / ↓ brake', 'Hold GAS · stick steers · BRAKE slows')
        .replace('SPACE to park', 'Tap PARK').replace('S / ↓ brake', 'BRAKE').replace('A / D to steer', 'Steer with the stick') : objective;
      this.overlay.chapterHud([
        ['SPEED', `${Math.round(Math.abs(drive.speed) * 3.6)} km/h`], ['TO BAY', `${Math.ceil(drive.remaining)} m`],
        [this.practiceDestination ? 'PENALTY' : 'NIGHT SCORE', this.practiceDestination ? `−${drive.penalty} PTS` : String(Math.max(0, m.score + this.mallBonus - this.drivingPenalty + this.driveBonus))],
        ...(drive.origin === 'home' ? [] : [['TIME', `${driveClock(drive.elapsed)} · PAR ${driveClock(DRIVE_PAR.fast)}${this.ghost ? ` · GHOST ${driveClock(this.ghost.seconds)}` : ''}`] as [string, string]]),
        drive.origin === 'home' ? ['IN THE CAR', 'TERMITE + SKANKY']
          : ['CARGO', this.practiceDestination ? 'PRACTICE · SAFE' : drive.destination === 'mall' ? '6 BUNDLES · SAFE' : '6 / 6 SIGNED'],
      ], hint,
      'W / ↑ GAS · A D / ← → STEER · S / ↓ BRAKE · SPACE PARK · V VIEW · M MUTE · ESC PAUSE');
    } else if (this.state === 'mall' && this.mall) {
      const mall = this.mall;
      this.overlay.chapterHud([
        ['RUN', `${Math.min(3, mall.run + 1)} / 3`], ['DELIVERED', `${mall.delivered} / 6`], ['SIGNED', `${mall.signatures} / 6`],
        ['CART', mall.cart.load.length === 0 ? 'EMPTY' : mall.cart.load.map((id) => mall.store(id).name).join(' + ')],
      ], `${mall.interaction.label} · ${mall.objective}`, 'WASD MOVE · SPACE TAKE / LOAD / GRAB CART / DROP / SIGN · E ALSO GRABS CART · ESC PAUSE');
    } else if (this.state === 'lot' && this.lot) {
      this.overlay.chapterHud([['MALL', '6 / 6 SIGNED'], ['FIVE-TON', this.lot.done ? 'RETURNED' : 'PARKED']],
        this.lot.atKeyDrop ? 'Press SPACE to drop the keys' : this.chapterHint, 'WASD MOVE · SPACE DROP KEYS · ESC PAUSE');
    }
    const driving = this.state === 'driving';
    this.overlay.root.classList.toggle('driving', driving);
    this.touch.setDriving(driving, driving && this.driving?.canPark === true);
    const chapter = this.state === 'mall' || this.state === 'lot' || driving || this.state === 'coffee';
    this.touch.setLive(this.state === 'playing' || this.state === 'interlude' || chapter,
      chapter ? (this.state === 'mall' ? (this.mall?.cart.pushed ? 'PARK' : 'CART') : '—')
        : `${m.beltStopsRemaining} LEFT${m.beltStopsRemaining > 0 && m.brakeCooldownMs > 0 ? ` · ${Math.ceil(m.brakeCooldownMs / 1000)}s` : ''}`,
      chapter ? this.state === 'mall' : this.state === 'playing' && m.canStopBelt, chapter, scannerSelected);
  }

  private activeCamera(): THREE.PerspectiveCamera {
    if (this.usesDriving()) return this.drivingView!.camera;
    return this.usesStage() ? this.stage.camera : this.camera;
  }

  private usesDriving(): boolean {
    const state = this.state === 'paused' ? this.pausedFrom : this.state;
    return this.drivingView !== null && (state === 'driving' || state === 'ended' && this.practiceDestination !== null || state === 'coffee' || state === 'coffee-done');
  }

  private usesStage(): boolean {
    const state = this.state === 'paused' ? this.pausedFrom : this.state;
    if (state === 'mall' || state === 'lot' || state === 'decision') return true;
    if (state === 'ended') return this.stage.active === 'house';
    return state === 'story' && this.stage.active !== null;
  }

  private draw(): void {
    const now = performance.now();
    // A software renderer can take longer than a frame to draw; space its draws out.
    if (this.quality === 'low' && now - this.lastRender < Math.max(100, this.renderCost * 2)) return;
    this.lastRender = now;
    const stageScene = this.usesDriving() ? this.drivingView!.scene : this.usesStage() ? this.stage.scene : null;
    const scene = stageScene ?? this.world.scene;
    const camera = this.activeCamera();
    if (!stageScene && this.state !== 'dream') this.world.truckCutaway.update(camera,
      [...Object.values(this.workers).map(worker => worker.root), ...[...this.crew.actors.values()].map(actor => actor.root)]);
    syncCharacterModels(this.state === 'dream' ? this.dream.scene : scene);
    if (this.state === 'dream') this.renderer.render(this.dream.scene, this.dream.camera);
    else if (this.composer && this.renderPass) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      if (this.gtao) { this.gtao.scene = scene; this.gtao.camera = camera; }
      this.composer.render();
    } else this.renderer.render(scene, camera);
    this.renderCost = performance.now() - now;
  }

  /** A story beat starts: its sound, its subtitles, and a bubble over the speaker. */
  private enterBeat(beat: StoryBeat): void {
    if (beat.sound) audioSystem.play(BEAT_SOUNDS[beat.sound]);
    const home = beat as HomeBeat;
    if (home.effect) audioSystem.play(HOME_SOUNDS[home.effect]);
    if (home.clock) this.overlay.storyTitle(this.storyHeading.title, this.storyHeading.kicker, home.clock);
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
    if (event.type === 'priority') { this.handlePriority(event); return; }
    if (event.type === 'surprise') { this.handleSurprise(event); return; }
    if (event.type === 'inspection') { this.handleInspection(event); return; }
    const sound = event.assisted || event.type === 'wrong' && !event.message.startsWith('WRONG DROP') ? undefined : EVENT_SOUNDS[event.type];
    if (sound) audioSystem.play(sound);
    if (event.type === 'wrong' && event.message.startsWith('WRONG DROP')) this.gamepad.rumble(0.25, 120);
    // The worker whose hands did it: the event names a worker, or stands nearest the spot.
    const actor = event.workerId ? this.workers[event.workerId]
      : this.workers[[...this.model.workers].sort((a, b) => Math.hypot(a.x - event.x, a.y - event.y) - Math.hypot(b.x - event.x, b.y - event.y))[0].id];
    // A grab off the belt bends at the hips to waist height; off the floor and from recovery it crouches.
    if (event.type === 'grab' || event.type === 'recover') triggerAction(actor, 'lift', this.time, event.type === 'grab' && Math.abs(event.x - SHIFT_LAYOUT.beltX) <= 40 ? 'belt' : 'floor');
    else if (event.type === 'drop' || event.type === 'sort' || (event.type === 'wrong' && event.message.startsWith('WRONG DROP'))) triggerAction(actor, 'drop', this.time);
    else if (event.type === 'throw') triggerAction(actor, 'throw', this.time);
    if (event.type === 'sort' && event.score) {
      // A clean dispatch pops its points, growing with the streak, and throws a little gold up from the drop.
      const combo = this.model.combo;
      const streak = combo >= 3 ? ` · ${combo} IN A ROW` : '';
      this.overlay.pop(`+${event.score}${streak}`, ROUTE_COLORS[event.route ?? 'A'], toWorld(event, surfaceAt(event.x, event.y) + 1.8), 1 + Math.min(combo, 10) * 0.06);
      if (!this.reducedMotion) {
        const at = toWorld(event, surfaceAt(event.x, event.y) + 0.5);
        for (let i = 0; i < 9; i += 1) {
          this.world.puffs.emit(at, { color: 0xffd98a, size: 0.11, life: 0.55 + Math.random() * 0.25, opacity: 0.9, grow: 0.35, spread: 0.5,
            velocity: new THREE.Vector3((Math.random() - 0.5) * 1.6, 1.4 + Math.random() * 0.8, (Math.random() - 0.5) * 1.6) });
        }
      }
    }
    if (event.type === 'trick') {
      const big = (event.score ?? 0) >= TRICK_SHOTS.trick.bonus;
      this.overlay.pop(`${big ? 'TRICK SHOT' : 'LONG THROW'} +${event.score ?? 0}`, '#ffd56a', toWorld(event, surfaceAt(event.x, event.y) + 2.2), big ? 1.6 : 1.3);
      this.overlay.showToast(event.message, 2600);
      this.gamepad.rumble(big ? 0.7 : 0.4, 220);
      if (!this.reducedMotion) {
        const at = toWorld(event, surfaceAt(event.x, event.y) + 0.6);
        for (let i = 0; i < (big ? 26 : 14); i += 1) {
          this.world.puffs.emit(at, { color: 0xffd56a, size: 0.13, life: 0.7 + Math.random() * 0.35, opacity: 0.95, grow: 0.4, spread: 0.6,
            velocity: new THREE.Vector3((Math.random() - 0.5) * 2.4, 2 + Math.random() * 1.4, (Math.random() - 0.5) * 2.4) });
        }
      }
    }
    if (event.type === 'throw' && event.packageId !== undefined && event.workerId) {
      this.throwers.set(event.packageId, event.workerId);
      const view = this.parcels.get(event.packageId);
      if (view) this.throwStarts.set(event.packageId, view.root.position.clone());
    }
    if (event.type === 'damage') {
      this.gamepad.rumble(0.8, 260);
      const parcel = this.model.packages.find((item) => item.id === event.packageId);
      const lost = Math.abs(event.score ?? 0);
      this.overlay.pop(`BROKEN −${lost}`, '#f3987c', toWorld(event, surfaceAt(event.x, event.y) + 2.0));
      this.overlay.showToast(`${parcel?.label ?? 'PARCEL'} BROKE · no credit · −${lost} points`, 2800);
      const thrower = this.model.workers.find((worker) => worker.id === (event.packageId !== undefined ? this.throwers.get(event.packageId) : undefined)) ?? this.model.activeWorker;
      this.crew.shanBreakage(thrower, this.model.elapsedMs);
      this.shake = Math.max(this.shake, 0.22);
      const at = toWorld(event, surfaceAt(event.x, event.y) + 0.3);
      for (let i = 0; i < 10; i += 1) {
        this.world.puffs.emit(at, { color: parcel?.kind === 'makeup' ? 0xda8db6 : 0xb8875a, size: 0.12, life: 0.9, velocity: new THREE.Vector3((Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.5) * 2), opacity: 0.8, grow: 1.4, spread: 0.3 });
      }
    }
    if ((!event.workerId || event.workerId === this.model.activeWorker.id) &&
      (event.type === 'grab' || event.type === 'recover' || event.type === 'drop' || event.type === 'wrong' || event.type === 'miss' || event.type === 'brake' || event.type === 'throw')) {
      this.hint = event.message;
    } else if ((event.type === 'sort' && !event.assisted) || event.type === 'damage') {
      this.hint = 'Approach the belt · read the street address';
    }
    if (event.type === 'phase' && this.model.endless) {
      // The endless shift names each new level; the ordinary rush caption would promise a last push.
      if (event.message.startsWith('LEVEL')) this.overlay.showToast(`ENDLESS · ${event.message}`, 3200);
      else if (this.model.phase === 'flow') this.overlay.showToast('STEADY FLOW · read the street ranges · coworker loading');
    } else if (event.type === 'phase') {
      const caption = this.model.phase === 'flow' ? 'STEADY FLOW · read the street ranges · coworker loading'
        : this.model.phase === 'rush' ? `LAST PUSH · freight every ${ARRIVALS_3D.rushMs / 1000} seconds` : event.message;
      this.overlay.showToast(caption);
    } else if (event.type === 'miss' || (event.type === 'scanner' && this.model.pendingScannerWorker === null)) this.overlay.showToast(event.message);

    this.crew.onEvent(event, this.model);
  }

  /** Priority freight: marked (no score), delivered on time (its bonus), or late (a score of zero). */
  private handlePriority(event: ShiftEvent): void {
    if (event.score === undefined) {
      audioSystem.play('event-alert');
      this.overlay.showToast(event.message, 3200);
    } else if (event.score > 0) {
      audioSystem.play('register');
      this.overlay.pop(`PRIORITY +${event.score}`, '#ffc23a', toWorld(event, surfaceAt(event.x, event.y) + 2.6), 1.2);
    } else this.overlay.showToast(event.message, 2400);
  }

  /** The HUD's note of an inspection or a rush wave under way, with its seconds left. */
  private underWay(): string {
    const m = this.model;
    return `${m.inspection ? `  /  ${this.watcherName} WATCHING ${Math.ceil(m.inspectionRemainingMs / 1000)}s` : ''}${m.waveRemainingMs > 0 ? `  /  RUSH WAVE ${Math.ceil(m.waveRemainingMs / 1000)}s` : ''}`;
  }

  /**
   * Surprise freight: a rush wave starts (no parcel, no score: the siren) or is judged (no parcel, its bonus), a parcel
   * becomes a mystery box or a fragile crate (a parcel, no score), or one pays as the player delivers it.
   */
  private handleSurprise(event: ShiftEvent): void {
    if (event.packageId === undefined) {
      if (event.score === undefined) {
        audioSystem.rushSiren();
        this.gamepad.rumble(0.35, 260);
      } else if (event.score > 0) audioSystem.play('register');
      this.overlay.showToast(event.message, 3600);
    } else if (event.score === undefined) {
      audioSystem.play('event-alert');
      this.overlay.showToast(event.message, 3200);
    } else {
      audioSystem.play(event.score > 0 ? 'register' : 'event-alert');
      const fragile = event.message.startsWith('HANDLED');
      this.overlay.pop(event.message.replace('MYSTERY · ', ''), fragile ? '#ff9f8f' : '#c9a8ff', toWorld(event, surfaceAt(event.x, event.y) + 2.6), 1.3);
      if (!fragile) this.overlay.showToast(event.message, 2600);
    }
  }

  /** A mystery box or fragile crate wears its label until it is delivered or broken. */
  private syncSurprise(parcel: Parcel, view: ParcelView): void {
    const kind = this.model.surpriseOf(parcel.id);
    if (!kind) return;
    let marker = this.surpriseMarkers.get(parcel.id);
    if (!marker) {
      marker = createSurpriseMarker(kind);
      this.surpriseMarkers.set(parcel.id, marker);
    }
    if (marker.root.parent !== view.root) view.root.add(marker.root);
    marker.root.visible = view.tag.visible;
    updateSurpriseMarker(marker, view.tag.position.y + view.tag.scale.y, this.time, this.reducedMotion);
  }

  /** The supervisor on the player's side: Vic on Termite's, Shan on Skanky's. */
  private get watcherName(): 'VIC' | 'SHAN' { return this.model.activeWorker.side === 'left' ? 'VIC' : 'SHAN'; }

  /** An inspection starts (no parcel, no score), pays or costs for a load (a parcel), or ends (no parcel, its total). */
  private handleInspection(event: ShiftEvent): void {
    if (event.packageId === undefined) {
      if (event.score === undefined) {
        audioSystem.play('event-alert');
        this.overlay.showToast(`${this.watcherName} IS WATCHING · ${event.message.replace('INSPECTION · ', '')}`, 3600);
      } else {
        if (event.score > 0) audioSystem.play('register');
        this.overlay.showToast(event.message, 3000);
      }
    } else if ((event.score ?? 0) > 0) {
      this.overlay.pop(`WATCHED +${event.score}`, '#9fe3a5', toWorld(event, surfaceAt(event.x, event.y) + 3.2), 1.05);
    } else {
      this.overlay.pop(`SEEN −${Math.abs(event.score ?? 0)}`, '#f3987c', toWorld(event, surfaceAt(event.x, event.y) + 2.6));
    }
  }

  /** A live priority parcel wears its countdown; anything else loses it. */
  private syncPriority(parcel: Parcel, view: ParcelView): void {
    const remaining = this.model.priorityRemainingMs(parcel.id);
    if (remaining === null) return;
    let marker = this.priorityMarkers.get(parcel.id);
    if (!marker) {
      marker = createPriorityMarker(view.highlight.scale.x);
      this.priorityMarkers.set(parcel.id, marker);
    }
    if (marker.root.parent !== view.root) view.root.add(marker.root);
    // The countdown sits on the floor side of the ring nearest the camera (+z in the world), where
    // nothing else is drawn; the parcel's own turn is undone so it stays there when the parcel turns.
    const reach = view.highlight.scale.x * 0.84 + 0.12, turn = view.root.rotation.y;
    updatePriorityMarker(marker, remaining, PRIORITY_3D.windowMs, this.time, {
      label: { x: -reach * Math.sin(turn), y: 0.05, z: reach * Math.cos(turn) },
      carried: parcel.state === 'held' || parcel.state === 'thrown',
      reducedMotion: this.reducedMotion,
    });
  }

  private handleMallEvent(event: MallEvent): void {
    const sounds: Record<MallEvent['type'], SoundEffect> = {
      pick: 'grab', load: 'drop', cart: 'switch', drop: 'bulk', sign: 'sign', wrong: 'wrong', run: 'event-alert', done: 'correct',
    };
    if (event.type !== 'wrong' || /Nothing on the cart for|goes out on run/.test(event.message)) audioSystem.play(sounds[event.type]);
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
    this.crew.noteSpeech(id, durationMs);
    audioSystem.play('npc-talk');
  }

  /** The volume fall-off for a sound made at `at`, by its distance from the active camera. */
  private nearness(at: THREE.Vector3): number {
    const distance = this.activeCamera().position.distanceTo(at);
    return Math.max(0, 1 - distance / 18) ** 2;
  }

  /** Footsteps for everyone walking in view: the workers, the crew and a scene's cast, read off their feet. */
  private footsteps(): void {
    const characters: Character[] = Object.values(this.workers);
    for (const actor of this.crew.actors.values()) if (actor.root.visible) characters.push(actor.character);
    if (this.usesStage()) for (const actor of this.stage.castActors()) if (actor.root.visible && !actor.seatedIn) characters.push(actor.character);
    for (const character of characters) {
      if (!character.root.visible) continue;
      const foot = footfall(character, modelFeet(character), this.time);
      if (!foot || !character.motion?.moving) continue;
      const gain = this.nearness(character.root.position) * character.root.scale.x;
      if (gain <= 0.02) continue;
      // The raised deck is steel and knocks; the floor, the lot and the street are concrete.
      audioSystem.footstep(gain, !this.usesStage() && character.root.position.y >= PLATFORM_HEIGHT - 0.05 ? 'deck' : 'floor');
    }
  }

  private syncWorkers(dt: number): void {
    const m = this.model;
    for (const worker of m.workers) {
      const character = this.workers[worker.id];
      const route = this.state === 'countdown' ? this.workerWalks.get(worker.id) : undefined;
      const walk = route ? walkPath(route, pathLength(route) * Math.min(1, this.countdownMs / 3200)) : null;
      const point = walk ?? worker;
      setFromModel(character.root.position, point, surfaceAt(point.x, point.y));
      const targetAngle = walk?.heading ?? FACING_ANGLE[worker.facing];
      let delta = targetAngle - character.root.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      character.root.rotation.y += delta * Math.min(1, dt * 12);
      // Smoothed velocity, so the camera can lead a walking worker.
      const motion = this.motion[worker.id];
      if (motion.previous && dt > 0) {
        const velocity = character.root.position.clone().sub(motion.previous).divideScalar(dt);
        motion.velocity.lerp(velocity, Math.min(1, dt * 6));
      } else if (dt > 0) motion.velocity.set(0, 0, 0);
      motion.previous = (motion.previous ?? new THREE.Vector3()).copy(character.root.position);
      // A heavy box pulls the carrier back onto their heels; an envelope weighs nothing.
      const held = worker.heldId === null ? null : m.packages.find((item) => item.id === worker.heldId) ?? null;
      const load = held ? THREE.MathUtils.clamp((1 - CARRY_MULTIPLIER[held.kind]) / 0.6, 0, 1) : 0;
      animateCharacter(character, dt, { moving: walk ? !walk.done : worker.moving, carrying: held !== null, time: this.time, reducedMotion: this.reducedMotion, load });
      // On a stair flight each foot stands on its own tread instead of hanging over the root's.
      plantFeet(character, surfaceUnder);
      // Saying a line, a worker standing still talks with their hands.
      if (character.motion) character.motion.speaking = this.crew.isSpeaking(worker.id);
      if (character.motion) character.motion.fidgets = false;
      // Eyes on the work: the parcel about to be grabbed, or the drop the held one is bound for.
      const focus = this.state === 'playing' ? held ? m.deliveryPoint(held, worker) : m.nearestPackage(worker) : null;
      if (focus) {
        const toFocus = toWorld(focus, character.root.position.y).sub(character.root.position);
        const facing = character.root.rotation.y;
        // Into the figure's own frame, which faces +Z.
        lookToward(character, { x: toFocus.x * Math.cos(facing) - toFocus.z * Math.sin(facing), z: toFocus.x * Math.sin(facing) + toFocus.z * Math.cos(facing) }, dt, this.reducedMotion);
      } else lookToward(character, null, dt, this.reducedMotion);
      if (this.state === 'celebrating' && !this.reducedMotion) {
        // Termite and Skanky celebrate with the crew (an imported model plays its cheer).
        if (character.motion) character.motion.pose = 'cheer';
        const beat = this.time * 9 + (worker.id === 'skanky' ? 1.3 : 0);
        character.body.position.y = Math.abs(Math.sin(beat)) * 0.12;
        character.leftArm.rotation.set(-2.8 + Math.sin(beat) * 0.35, 0, 0.25);
        character.rightArm.rotation.set(-2.8 - Math.sin(beat) * 0.35, 0, -0.25);
      }
    }
    const active = this.workers[m.activeWorker.id];
    this.activeRing.position.set(active.root.position.x, active.root.position.y + 0.02, active.root.position.z);
    // On fire, the ring under your worker burns orange and beats faster.
    const pulse = 1 + Math.sin(this.time * (m.onFire ? 9 : 4)) * (m.onFire ? 0.09 : 0.05);
    this.activeRing.scale.set(pulse, pulse, 1);
    (this.activeRing.material as THREE.MeshBasicMaterial).color.setHex(m.onFire ? 0xff8a3c : 0xf3e6c6);
    this.activeRing.visible = this.state !== 'story';
    const idle = this.workers[m.activeIndex === 0 ? 'skanky' : 'termite'];
    this.sleepTag.position.set(idle.root.position.x + 0.3, idle.root.position.y + 2.5 + Math.sin(this.time * 2) * 0.08, idle.root.position.z);
    this.sleepTag.visible = this.state === 'playing' && m.autonomousCoworker && !m.coop;
    this.partnerRing.visible = m.coop && this.state !== 'story';
    this.partnerPrompt.visible = false;
    if (m.coop) {
      const partner = this.workers[m.partnerWorker.id].root.position;
      this.partnerRing.position.set(partner.x, partner.y + 0.02, partner.z);
      const beat = 1 + Math.sin(this.time * (m.onFire ? 9 : 4) + 1.3) * (m.onFire ? 0.09 : 0.05);
      this.partnerRing.scale.set(beat, beat, 1);
      const reach = m.partnerWorker.heldId === null ? m.nearestPackage(m.partnerWorker) : null;
      const reachView = reach ? this.parcels.get(reach.id) : null;
      if (reachView && this.state === 'playing') {
        this.partnerPrompt.visible = true;
        this.partnerPrompt.position.copy(reachView.root.position).y += Math.max(reachView.height + 1.75, reachView.tag.position.y + reachView.tag.scale.y + 0.55
          + (this.surpriseMarkers.has(reach!.id) ? SURPRISE_PROMPT_LIFT : 0));
      }
    }

    // A marker above the parcel the active worker would grab.
    const nearest = m.heldPackage ? null : m.nearestPackage();
    const view = nearest ? this.parcels.get(nearest.id) : null;
    this.marker.visible = Boolean(view) && this.state === 'playing';
    this.pickupHalo.visible = this.pickupPrompt.visible = this.marker.visible;
    for (const [id, parcelView] of this.parcels) parcelView.root.userData.pickable = this.marker.visible && id === nearest?.id;
    if (view) {
      this.marker.position.copy(view.root.position).add(new THREE.Vector3(0, view.height + 1.55 + Math.sin(this.time * 6) * 0.06
        + (this.surpriseMarkers.has(nearest!.id) ? SURPRISE_PROMPT_LIFT : 0), 0));
      this.marker.rotation.y += dt * 3;
      this.pickupHalo.position.copy(view.root.position).y += 0.025;
      this.pickupHalo.scale.setScalar(Math.max(0.8, view.width, view.depth) + 0.2);
      // Above the address tag, never over it: the tag stands taller than the parcel on tall freight.
      this.pickupPrompt.position.copy(view.root.position).y += Math.max(view.height + 1.75, view.tag.position.y + view.tag.scale.y + 0.55
        + (this.surpriseMarkers.has(nearest!.id) ? SURPRISE_PROMPT_LIFT : 0));
    }
    const offered = this.mesa.offered, mesaView = offered ? this.parcels.get(offered.id) : undefined;
    this.mesaRing.visible = this.mesaTag.visible = mesaView !== undefined;
    if (mesaView) {
      const pulse = 1 + Math.sin(this.time * 6) * 0.08;
      this.mesaRing.position.copy(mesaView.root.position).y += 0.04;
      this.mesaRing.scale.setScalar((Math.max(0.8, mesaView.width, mesaView.depth) + 0.3) * pulse);
      this.mesaTag.position.copy(mesaView.root.position).y += mesaView.height + 1.2;
    }
    const held = m.heldPackage;
    this.deliveryHalo.visible = this.state === 'playing' && held !== null;
    this.deliveryHalo.userData.route = held?.route ?? null;
    if (held) {
      const point = m.deliveryPoint(held);
      const route = ROUTE_INFO[held.route];
      const atDoor = route.kind === 'truck' && truckInteriorAt(m.activeWorker) !== held.route;
      if (atDoor) point.x = m.activeWorker.side === 'left' ? 330 : 630;
      this.deliveryHalo.position.copy(toWorld(point, surfaceAt(point.x, point.y) + 0.04));
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
      let clear = clearDepotFootprint(intended, radius, occupied, this.depotSolids, SHIFT_LAYOUT);
      for (let pass = 0; pass < 3; pass++) {
        const equipment = clearReceiving(clear, radius);
        if (Math.hypot(equipment.x - clear.x, equipment.y - clear.y) < 0.001) break;
        clear = clearDepotFootprint(equipment, radius, occupied, this.depotSolids, SHIFT_LAYOUT);
      }
      const height = actorSurfaceAt(clear.x, clear.y);
      const dy = height - actor.root.position.y;
      this.crew.translateActorFreight(id, (clear.x - intended.x) / 32, (clear.y - intended.y) / 32, dy);
      this.setPieces.translateActorFreight(id, (clear.x - intended.x) / 32, (clear.y - intended.y) / 32, dy);
      setFromModel(actor.root.position, clear, height);
      occupied.push({ ...clear, radius });
    }
  }

  private parcelPosition(parcel: Parcel, view: ParcelView, target: THREE.Vector3): THREE.Vector3 {
    const carryOffset = setParcelCarried(view, parcel.state === 'held', parcel.workerId ? 0.32 * this.workers[parcel.workerId].root.scale.z : 0.32);
    if (parcel.state === 'held' && parcel.workerId) {
      const character = this.workers[parcel.workerId];
      const forward = new THREE.Vector3(Math.sin(character.root.rotation.y), 0, Math.cos(character.root.rotation.y));
      // The box rides the torso: it bobs with each step and dips with a lift or a put-down.
      return target.copy(character.root.position).addScaledVector(forward, carryOffset)
        .setY(character.root.position.y + 1.05 + character.body.position.y - view.height * 0.35);
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
      const start = this.throwStarts.get(parcel.id) ?? toWorld({ x: flight.fromX, y: flight.fromY }, surfaceAt(flight.fromX, flight.fromY) + 1.0);
      const end = toWorld({ x: flight.toX, y: flight.toY }, surfaceAt(flight.toX, flight.toY) + 0.05);
      target.copy(start).lerp(end, t);
      target.y += Math.sin(t * Math.PI) * 1.4;
      return target;
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
    for (const view of this.parcels.values()) { view.highlight.visible = false; view.root.userData.assignedToPlayer = false; }
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
      if (parcel.state === 'delivered' && m.truckLoads.has(parcel.id) && !this.stolen.has(parcel.id)) {
        seen.add(parcel.id);
        const load = m.truckLoads.get(parcel.id)!;
        const truck = this.world.trucks.find(truck => truck.route === load.route)!;
        let view = this.parcels.get(parcel.id);
        if (!view) { view = createParcelView(parcel); this.parcels.set(parcel.id, view); }
        if (view.root.parent !== truck.group) truck.group.add(view.root);
        const home = SHIFT_LAYOUT.playerTrucks[load.route];
        view.root.position.set((load.x - home.x) / 32, PLATFORM_HEIGHT + 0.09 + load.height / 32, (load.y - home.y) / 32);
        view.root.rotation.y = Math.PI / 2;
        view.root.scale.setScalar(1);
        view.tag.visible = false;
        view.root.name = 'loaded-parcel';
        view.root.userData.parcelId = parcel.id;
        continue;
      }
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
          this.overlay.showToast('Read the street address · truck and floor signs show their ranges', 3600);
        }
      }
      this.parcelPosition(parcel, view, target);
      // In the hands, the shipping tag rides higher, clear of the carrier's face,
      // at its full size so the street number stays readable while carrying.
      view.tag.position.y = view.tag.userData.baseY + (parcel.state === 'held' ? 0.5 : 0);
      const assigned = parcel.route === 'C' || ROUTE_INFO[parcel.route].side === m.activeWorker.side;
      view.highlight.visible = this.state === 'playing' && assigned && ['belt', 'floor', 'missed'].includes(parcel.state)
        && (parcel.state !== 'floor' || (m.activeWorker.side === 'left' ? parcel.x < 440 : parcel.x > 520));
      view.root.userData.assignedToPlayer = view.highlight.visible;
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
      this.syncPriority(parcel, view);
      this.syncSurprise(parcel, view);
    }
    for (const [id, marker] of this.surpriseMarkers) {
      if (m.surpriseOf(id) !== null && marker.root.parent === this.parcels.get(id)?.root) continue;
      marker.root.removeFromParent();
      disposeObject3D(marker.root);
      this.surpriseMarkers.delete(id);
    }
    for (const [id, marker] of this.priorityMarkers) {
      if (m.priorityRemainingMs(id) !== null && marker.root.parent === this.parcels.get(id)?.root) continue;
      marker.root.removeFromParent();
      disposeObject3D(marker.root);
      this.priorityMarkers.delete(id);
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

  /** During Vic's offer, the point between the worker and the Mesa (a little toward the screen's top), and how far apart they are. */
  private mesaShot(): { look: THREE.Vector3; span: number } | null {
    const offered = this.mesa.offered, view = offered ? this.parcels.get(offered.id) : undefined;
    if (!view) return null;
    const worker = this.workers[this.model.activeWorker.id].root.position, mesa = view.root.position;
    // The docked panel covers the foot of the screen, so the pair sits a little above the middle.
    const look = new THREE.Vector3((worker.x + mesa.x) / 2, 0.6, (worker.z + mesa.z) / 2 + 2.6);
    return { look, span: Math.hypot(worker.x - mesa.x, worker.z - mesa.z) };
  }

  private updateCamera(dt: number, snap = false): void {
    const portrait = this.camera.aspect < 1;
    let position: THREE.Vector3;
    let look: THREE.Vector3;
    let follow = false;
    const state = this.state === 'paused' ? this.pausedFrom : this.state;
    if (state === 'interlude') {
      // Frame the open end of Ben's aisle from past the truck noses, so no truck
      // stands between the camera and the gunman, Ben, the gate and the demon.
      look = new THREE.Vector3(toWorldX(90), 1.0, toWorldZ(SHIFT_LAYOUT.eventBays.ben.y));
      position = look.clone().add(portrait ? new THREE.Vector3(1.2, 11, 8) : new THREE.Vector3(1.4, 6.2, 7.2));
    } else if (state === 'mesa' && this.mesaShot()) {
      // Vic's offer: pull back over the worker and the Mesa on the belt so both are in view above the docked choice.
      const shot = this.mesaShot()!;
      look = shot.look;
      position = look.clone().add(portrait ? new THREE.Vector3(0, 14 + shot.span * 0.8, 8 + shot.span * 0.5) : new THREE.Vector3(0, 9 + shot.span * 0.55, 8.5 + shot.span * 0.35));
    } else if (state === 'story' && this.depotShot) {
      look = this.depotShot.look;
      position = this.depotShot.position.clone();
      if (portrait) position.add(new THREE.Vector3(0, 4, 3));
    } else if (this.overview || this.state === 'briefing' || this.state === 'celebrating') {
      look = new THREE.Vector3(0, 0, toWorldZ((SHIFT_LAYOUT.worldTop + SHIFT_LAYOUT.worldBottom) / 2));
      position = look.clone().add(new THREE.Vector3(0, Math.max(portrait ? 104 : 80, 58 / this.camera.aspect), portrait ? 39 : 27));
    } else if (this.model.coop && (state === 'playing' || state === 'countdown' || state === 'ended')) {
      // Two players: the usual angle over the point between them, backed off until both stand inside the view
      // (clear of the guide and HUD along the bottom), up to the whole warehouse.
      const a = this.workers[this.model.activeWorker.id].root.position, b = this.workers[this.model.partnerWorker.id].root.position;
      look = new THREE.Vector3((a.x + b.x) / 4, (a.y + b.y) / 2 + 0.4, (a.z + b.z) / 2);
      const direction = (portrait ? new THREE.Vector3(0, 15, 9) : new THREE.Vector3(0, 10.5, 9.4)).normalize();
      const probe = this.framing;
      probe.fov = this.camera.fov; probe.aspect = this.camera.aspect; probe.near = this.camera.near; probe.far = this.camera.far;
      probe.updateProjectionMatrix();
      const head = new THREE.Vector3();
      const inView = (p: THREE.Vector3, lift: number): boolean => {
        head.copy(p).setY(p.y + lift).project(probe);
        return Math.abs(head.x) < 0.86 && head.y < 0.82 && head.y > -0.5;
      };
      let distance = portrait ? 17.5 : 14.1;
      for (let i = 0; i < 24; i += 1) {
        probe.position.copy(look).addScaledVector(direction, distance);
        probe.lookAt(look); probe.updateMatrixWorld(true);
        if ([a, b].every((p) => inView(p, 0) && inView(p, 2.2))) break;
        distance *= 1.1;
      }
      position = look.clone().addScaledVector(direction, Math.min(distance, 95));
      follow = true;
    } else {
      const active = this.model.activeWorker;
      const worker = this.workers[active.id].root.position;
      const insideTruck = truckInteriorAt(active);
      // Follow the worker inside so the transparent roof reveals the shelves.
      const terminal = THREE.MathUtils.smoothstep(worker.z, toWorldZ(SHIFT_LAYOUT.stairs.minY - 80), toWorldZ(SHIFT_LAYOUT.stairs.minY + 10));
      look = new THREE.Vector3(worker.x * (insideTruck ? 1 : 0.5 + 0.5 * terminal), worker.y + 0.4, worker.z - (1 - terminal));
      // Lead a walking worker a little, so there is more belt or floor in view ahead of them.
      const velocity = this.motion[active.id].velocity;
      const lead = snap || this.reducedMotion ? new THREE.Vector3() : velocity.clone().setY(0).multiplyScalar(0.28);
      if (lead.length() > 0.9) lead.setLength(0.9);
      this.lookAhead.lerp(lead, snap ? 1 : 1 - Math.exp(-dt * 3));
      look.add(this.lookAhead);
      position = look.clone().add(portrait ? new THREE.Vector3(0, 15, 9) : new THREE.Vector3(worker.x * 0.2 * (1 - terminal), 10.5, 9.4));
      if (insideTruck && !portrait) position = look.clone().add(new THREE.Vector3(0, 9, 5.5));
      follow = true;
    }
    // The overview and story shots stay inside the terminal wall. The follow
    // camera may pass behind it at the back of the depot: the wall fades out
    // ahead of the camera (see DepotWorld.fadeRearWall), keeping the same
    // oblique view over the stairs, the floor drops and bulk instead of a
    // top-down one jammed against the wall.
    const rearLimit = toWorldZ(SHIFT_LAYOUT.bulkRearWall.y - SHIFT_LAYOUT.bulkRearWall.height / 2) - this.camera.near - 0.15;
    if (!follow) position.z = Math.min(position.z, rearLimit);
    // Easing never recovers from an invalid position (NaN stays NaN), which left the depot black.
    if (!Number.isFinite(this.camera.position.lengthSq()) || !Number.isFinite(this.cameraTarget.lengthSq())) {
      this.camera.position.copy(position);
      this.cameraTarget.copy(look);
    }
    const ease = snap ? 1 : 1 - Math.exp(-dt * 4);
    this.camera.position.lerp(position, ease);
    if (!follow) this.camera.position.z = Math.min(this.camera.position.z, rearLimit);
    this.cameraTarget.lerp(look, ease);
    this.world.fadeRearWall(this.camera.position);
    this.camera.lookAt(this.cameraTarget);
    // A breakage rattles the camera briefly; the lookAt above keeps the framing.
    this.shake = snap ? 0 : this.shake * Math.exp(-dt * 7);
    if (this.shake > 0.004 && !this.reducedMotion && this.settings.shake) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    } else this.shake = 0;
    const fog = this.world.scene.fog;
    if (fog instanceof THREE.Fog) {
      const altitude = Math.max(0, this.camera.position.y - 20);
      fog.near = 26 + altitude;
      fog.far = 62 + altitude;
    }
  }

  /** Every medal, earned or still to earn, from the briefing; BACK returns to it. */
  private showMedals(): void {
    const held = new Set(this.record.medals);
    const rows = MEDALS.map((medal) => `<li class="${held.has(medal.id) ? 'earned' : 'locked'}"><b>${medal.title}</b><span>${escapeHtml(medal.detail)}</span></li>`).join('');
    this.overlay.showPanel(`<div class="kicker">YOUR RECORD · MEDALS</div><h1>${held.size} OF ${MEDALS.length} EARNED</h1>
      <ul class="b3d-medal-list">${rows}</ul>${this.recentNights()}<p>Kept on this device with your record.</p>
      <button type="button" data-action="back">BACK</button>`, { back: () => this.showBriefing() });
  }

  /** The record panel's last few nights: a bar for each night's total, oldest to newest, then the list, newest first. */
  private recentNights(): string {
    const recent = this.record.recent;
    if (!recent.length) return '';
    const top = Math.max(1, ...recent.map((night) => night.total));
    const bars = [...recent].reverse().map((night) =>
      `<span class="${night.won ? 'won' : 'failed'}" style="height:${Math.max(4, Math.round(night.total / top * 100))}%"></span>`).join('');
    const rows = recent.map((night) => `<li class="${night.won ? 'won' : 'failed'}"><b>NIGHT ${night.night} · GRADE ${escapeHtml(night.grade)}${night.peak ? ' · PEAK' : ''}</b>`
      + `<span>${formatTotal(night.total)} · ${night.sorted} dispatched${night.won ? '' : ' · shift failed'}${night.date ? ` · ${escapeHtml(night.date)}` : ''}</span></li>`).join('');
    return `<p class="b3d-record"><b>RECENT NIGHTS</b></p><div class="b3d-trend" aria-hidden="true">${bars}</div><ol class="b3d-recent">${rows}</ol>`;
  }

  /** Once a night is finished, the briefing offers three perks for tonight; 1, 2 or 3 (or a click) picks one. */
  private perkLine(): string {
    if (this.record.completed === 0 || this.practiceDestination) return '';
    const offer = perkOffer(this.record.played);
    const buttons = offer.map((perk, index) => `<button type="button" class="b3d-perk${this.perk === perk.id ? ' picked' : ''}" data-action="perk-${index}" aria-pressed="${this.perk === perk.id}"><b>${index + 1} · ${escapeHtml(perk.title)}</b><span>${escapeHtml(perk.detail)}</span></button>`).join('');
    const keys = this.touch.enabled ? '' : this.pad.connected ? ' (LB / RB)' : ' (1, 2 OR 3)';
    return `<p class="b3d-record"><b>TONIGHT’S PERK · PICK ONE${keys}:</b></p><div class="b3d-perks">${buttons}</div>`;
  }

  /** Picks the offer's `index`th perk for tonight (again to drop it). */
  private pickPerk(index: number): void {
    if (this.state !== 'briefing' || this.record.completed === 0) return;
    const perk = perkOffer(this.record.played)[index];
    if (perk) this.setPerk(this.perk === perk.id ? null : perk.id);
  }

  /** A controller's bumpers: steps the pick along the offer, `step` places, and through no perk at either end. */
  private stepPerk(step: number): void {
    if (this.state !== 'briefing' || this.record.completed === 0) return;
    const offer = perkOffer(this.record.played), places = offer.length + 1;
    // Place 0 is no perk; places 1 to 3 are the offer.
    const place = (offer.findIndex((perk) => perk.id === this.perk) + 1 + step + places) % places;
    this.setPerk(place === 0 ? null : offer[place - 1].id);
    document.querySelector('.b3d-perk.picked')?.scrollIntoView({ block: 'nearest' });
  }

  /** Makes `id` tonight's perk (null for none), marked in place so a scrolled briefing stays put. */
  private setPerk(id: string | null): void {
    this.perk = id;
    const offer = perkOffer(this.record.played);
    document.querySelectorAll<HTMLButtonElement>('.b3d-perk').forEach((button, i) => {
      const picked = offer[i]?.id === this.perk;
      button.classList.toggle('picked', picked);
      button.setAttribute('aria-pressed', String(picked));
    });
  }

  /** The briefing's line naming tonight's goals. */
  private goalsLine(): string {
    return `<p class="b3d-goals"><b>TONIGHT’S GOALS · +${GOAL_BONUS} EACH:</b> ${this.goals.map((goal) => escapeHtml(goal.label)).join(' · ')}</p>`;
  }

  /** A goal reached mid-shift is announced once, the moment it happens; it pays at the results. */
  private announceGoals(): void {
    if (this.model.endless) return;
    for (const goal of this.goals) {
      if (!goal.live || this.goalsAnnounced.has(goal.id) || !goal.met(this.model)) continue;
      this.goalsAnnounced.add(goal.id);
      audioSystem.play('countdown-go');
      this.overlay.showToast(`NIGHT GOAL MET · ${goal.label.toUpperCase()} · +${GOAL_BONUS} AT THE RESULTS`, 3000);
    }
  }

  /** The briefing's line about the player's record, once there is one. */
  private recordLine(): string {
    const { played, completed, best, openers } = this.record;
    if (played === 0) return '';
    const bestText = best ? `BEST NIGHT ${formatTotal(best.total)} · GRADE ${escapeHtml(best.grade)}` : 'NO SHIFT FINISHED YET';
    return `<p class="b3d-record"><b>YOUR RECORD · ${completed} OF ${played} ${played === 1 ? 'NIGHT' : 'NIGHTS'} FINISHED · ${bestText} · ${openers.length} OF ${OPENER_COUNT} OPENERS SEEN · ${this.record.medals.length} OF ${MEDALS.length} MEDALS</b></p>`;
  }

  /** The briefing's line naming the player's seniority and what the next title takes. */
  private seniorityLine(): string {
    const { rank, next } = seniority(this.record);
    return `<p class="b3d-record">SENIORITY · <b>${rank.title}</b> · ${next ? `NEXT: ${next.title} AT ${rankNeeds(next)}` : 'THE TOP OF THE BELT'}</p>`;
  }

  /** Adds this night to the record and says how it compares with the best, and any promotion or medal it earned. */
  private recordResults(won: boolean, total: number, grade: string, night: Omit<NightFacts, 'openersSeen' | 'nightsPlayed'>): string {
    const before = seniority(this.record).level;
    const result = recordNight(this.record, { won, total, grade, sorted: this.model.sorted, opener: this.story.opener.id, date: new Date().toISOString().slice(0, 10), peak: this.model.peak, pace: this.paceSamples });
    const awarded = awardMedals(result.record.medals, { ...night, openersSeen: result.record.openers.length, nightsPlayed: result.record.played });
    this.record = { ...result.record, medals: awarded.medals };
    this.medalsEarned = awarded.fresh.map((medal) => medal.id);
    saveRecord(browserStorage(), this.record);
    const nightLabel = `NIGHT ${this.record.played}`;
    const now = seniority(this.record);
    const promoted = now.level > before ? `<p class="b3d-medal"><b>PROMOTED · ${now.rank.title}</b> · ${rankNeeds(now.rank).toLowerCase()}</p>` : '';
    const medals = promoted + awarded.fresh.map((medal) => `<p class="b3d-medal"><b>MEDAL · ${medal.title}</b> · ${escapeHtml(medal.detail)}</p>`).join('');
    if (result.newBest || promoted || awarded.fresh.length) audioSystem.fanfare(result.newBest);
    if (result.newBest) return `<p class="b3d-best"><b>NEW PERSONAL BEST · ${nightLabel}</b>${result.previous ? ` · beat ${formatTotal(result.previous.total)}` : ''}</p>${medals}`;
    const best = this.record.best;
    return `<p class="b3d-best">${best ? `BEST NIGHT ${formatTotal(best.total)} · GRADE ${escapeHtml(best.grade)}` : 'NO SHIFT FINISHED YET'} · ${nightLabel} · ${this.record.completed} finished</p>${medals}`;
  }

  /** The endless shift's results: how long and how much, against the best endless run on this device. */
  private showEndlessResults(): void {
    const m = this.model;
    const seconds = Math.floor(m.elapsedMs / 1000), clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const result = recordEndless(this.record, { sorted: m.sorted, seconds, score: m.score, date: new Date().toISOString().slice(0, 10) });
    // The endless shift earns its own two medals, and a streak or a priority run can earn the night medals that do not need a finished shift.
    const awarded = awardMedals(result.record.medals, {
      won: false, grade: '', peak: false, goalsMet: 0, goalsTotal: 0, priorityCount: m.priorityCount, priorityOnTime: m.priorityOnTime,
      bestCombo: m.bestCombo, wrongDrops: m.wrongDrops, damaged: m.damaged, missed: m.missed, safeDrive: false, longestThrowM: m.longestThrowPx / 32,
      openersSeen: result.record.openers.length, nightsPlayed: result.record.played, endlessLevel: m.endlessLevel, endlessSorted: m.sorted,
    });
    this.record = { ...result.record, medals: awarded.medals };
    this.medalsEarned = awarded.fresh.map((medal) => medal.id);
    saveRecord(browserStorage(), this.record);
    if (result.newBest || awarded.fresh.length) audioSystem.fanfare(result.newBest);
    const medals = awarded.fresh.map((medal) => `<p class="b3d-medal"><b>MEDAL · ${medal.title}</b> · ${escapeHtml(medal.detail)}</p>`).join('');
    const best = this.record.endless!;
    const bestClock = `${Math.floor(best.seconds / 60)}:${String(best.seconds % 60).padStart(2, '0')}`;
    this.overlay.showPanel(`
      <div class="grade">∞</div>
      <div class="kicker">ENDLESS SHIFT / LEVEL ${m.endlessLevel}</div>
      <h1>THE BELT WINS</h1>
      <p class="b3d-best">${result.newBest ? `<b>NEW ENDLESS BEST</b>${result.previous ? ` · beat ${result.previous.sorted} dispatched` : ''}` : `BEST ENDLESS · ${best.sorted} dispatched · ${bestClock}`}</p>${medals}
      <p><b>${m.sorted} DISPATCHED · ${String(m.score).padStart(5, '0')} POINTS · SURVIVED ${clock}</b></p>
      <p>${m.bestCombo} best streak · ${m.priorityOnTime} of ${m.priorityCount} priority on time · ${m.wrongDrops} wrong drops · ${m.damaged} broken</p>
      <p>Recovery overflowed at level ${m.endlessLevel}. Endless shifts keep their own best and leave your nights' record alone.</p>
      <button type="button">ANOTHER NIGHT  ↵</button>`, () => this.restart());
  }

  private showResults(): void {
    if (this.state === 'ended') return;
    if (this.model.endless) {
      this.state = 'ended';
      this.stage.end();
      this.overlay.setMode('shift');
      audioSystem.startMusic('results');
      this.showEndlessResults();
      return;
    }
    this.state = 'ended';
    this.stage.end();
    this.overlay.setMode('shift');
    this.story.go('results');
    const m = this.model;
    audioSystem.startMusic('results');
    const overflow = m.pileup >= m.capacity;
    const rate = Math.round(m.dispatchRate);
    const home = this.lot?.done === true;
    const mall = this.mall;
    const routes = (['A', 'D', 'T', 'B', 'E', 'S', 'C'] as const).map((route) => `${ROUTE_INFO[route].name} ${m.routeSorted[route]}`).join(' · ');
    const judged = judgeGoals(this.goals, m);
    this.goalBonus = judged.bonus;
    const total = Math.max(0, m.score + this.mallBonus - this.drivingPenalty + this.driveBonus + judged.bonus);
    const goals = this.goals.map((goal) => `${judged.met.includes(goal) ? '✓' : '✗'} ${escapeHtml(goal.label)}`).join(' · ');
    const record = this.recordResults(m.won, total, m.won ? m.grade : 'F', {
      won: m.won, grade: m.won ? m.grade : 'F', peak: m.peak, goalsMet: judged.met.length, goalsTotal: this.goals.length,
      priorityCount: m.priorityCount, priorityOnTime: m.priorityOnTime, bestCombo: m.bestCombo, wrongDrops: m.wrongDrops,
      damaged: m.damaged, missed: m.missed, safeDrive: home && this.drivingCollisions === 0 && this.drivingRedLights === 0,
      longestThrowM: m.longestThrowPx / 32,
    });
    const daily = this.dailyResult(total, m.won ? m.grade : 'F');
    this.overlay.showPanel(`
      <div class="grade">${m.won ? m.grade : 'F'}</div>
      <div class="kicker">${m.won ? `SHIFT COMPLETE / GRADE ${m.grade}` : 'SHIFT TERMINATED / YOU FAILED THE SORT'}${m.peak ? ' · PEAK NIGHT' : ''}${this.daily ? ' · DAILY CHALLENGE' : ''}</div>
      <h1>${overflow ? 'PILE-UP OVERFLOW' : home ? 'HOME. FINALLY.' : m.gradeQuote}</h1>
      ${daily}
      ${record}
      <p><b>${m.sorted} DISPATCHED · ${String(m.score).padStart(5, '0')} POINTS · ${m.bestCombo} BEST STREAK</b></p>
      <p>${rate}% of freight dispatched · ${m.recoveredDeliveries} recovered and dispatched · ${m.bulkSorted} to bulk</p>
      ${m.longestThrowPx > 0 ? `<p>LONGEST THROW ${(m.longestThrowPx / 32).toFixed(1)} m${m.trickShots ? ` · ${m.trickShots} long ${m.trickShots === 1 ? 'throw' : 'throws'} for a bonus` : ''}</p>` : ''}
      <p>${m.unshipped} left behind · ${m.wrongDrops} wrong drops · GRADE ${m.accuracy.toFixed(1)}% (S: 95%+)</p>
      <p>${escapeHtml(routes)}</p>
      ${m.priorityCount ? `<p>${m.priorityOnTime} of ${m.priorityCount} priority parcels on time · +${m.priorityOnTime * PRIORITY_3D.bonus}</p>` : ''}
      ${this.perkInPlay ? `<p class="b3d-goals">PERK · ${escapeHtml(this.perkInPlay.title)} · ${escapeHtml(this.perkInPlay.detail)}</p>` : ''}
      <p class="b3d-goals">NIGHT GOALS · ${judged.met.length} OF ${this.goals.length} · ${goals} · +${judged.bonus}</p>
      ${m.wavesRun || m.mysteriesOpened || m.fragileDelivered ? `<p>SURPRISES · ${m.wavesCleared} of ${m.wavesRun} rush ${m.wavesRun === 1 ? 'wave' : 'waves'} cleared · ${m.mysteriesOpened} mystery ${m.mysteriesOpened === 1 ? 'box' : 'boxes'} opened · ${m.fragileDelivered} fragile ${m.fragileDelivered === 1 ? 'crate' : 'crates'} carried in</p>` : ''}
      ${m.inspectionsHeld ? `<p>INSPECTIONS · ${m.inspectionLoads} clean ${m.inspectionLoads === 1 ? 'load' : 'loads'} watched · +${m.inspectionBonus}</p>` : ''}
      ${this.coffeeResult ? `<p>TIMMIES RUN · ${this.coffeeResult.cups} of ${COFFEE_RUN.cups} coffees made it · +${this.coffeeResult.points}</p>` : ''}
      <p>${m.thrownDeliveries} thrown in clean · ${m.damaged} broken (−${m.breakagePenalty} points${m.damaged > THROWING.gradeForgivenBreaks ? `, ${m.gradedBreaks} counted against the grade` : ''})</p>
      ${mall ? `<p>MALL RUN · ${mall.delivered}/6 delivered · ${mall.signatures}/6 signed · five-ton ${home ? 'returned' : 'not returned'} · +${this.mallBonus}</p>
      <p>DRIVING · ${this.drivingCollisions} bumps${this.drivingRedLights ? ` · ${this.drivingRedLights} red lights` : ''} · −${this.drivingPenalty} points · cargo safe${this.driveTimes.length ? ` · ${this.driveTimes.map(driveClock).join(' and ')}${this.driveBonus ? ` · against par +${this.driveBonus}` : ''}` : ''}</p>
      <p class="b3d-sum">SHIFT ${m.score} + NIGHT GOALS ${judged.bonus} + MALL RUN ${this.mallBonus} + ON PAR ${this.driveBonus} − ROAD ${this.drivingPenalty}</p>
      <p><b>NIGHT TOTAL ${String(total).padStart(5, '0')}</b> · ${m.gradeQuote}</p>` : ''}
      <button type="button">ANOTHER NIGHT  ↵</button>
      <a href="${window.location.pathname}?mode=classic">PLAY THE ORIGINAL FULL SHIFT</a>`, () => this.restart());
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
  // The depot's materials are built once, so its photo surfaces load first;
  // a missing or slow texture leaves the flat colours (see textures.ts).
  void loadSurfaces().then(() => {
    const app = new Belt3d(host);
    if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
    // Browser checks observe the app through this event; nothing global is set.
    window.dispatchEvent(new CustomEvent('belt3d:ready', { detail: app }));
  });
}
