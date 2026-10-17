import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { MESA } from '../game/slice/DepotReferences';
import { SHIFT_LAYOUT, ShiftModel, type Parcel, type ShiftEvent } from '../game/slice/ShiftModel';
import { audioSystem, type SoundEffect } from '../game/systems/AudioSystem';
import { animateCharacter, createCharacter, mergeCharacter, type Character } from './characters';
import { CrewLife } from './crew';
import { MesaDream } from './dream';
import { MesaEncounter } from './mesa';
import { BEN_CAST, BEN_END, BEN_START, SetPieces } from './setpieces';
import { Overlay } from './overlay';
import { createParcelView, type ParcelView } from './parcels';
import { BELT_HEIGHT, ROUTE_COLORS, setFromModel, textSprite, toWorld, toWorldX, toWorldZ } from './space';
import { DepotWorld } from './world';

type AppState = 'briefing' | 'countdown' | 'playing' | 'interlude' | 'mesa' | 'dream' | 'paused' | 'celebrating' | 'ended';

const PHASE_LABELS: Record<string, string> = {
  lesson: '01  /  FIND YOUR RHYTHM', flow: '02  /  KEEP IT MOVING', rush: '03  /  LAST DISPATCH',
  cleanup: '04  /  CLEAR THE LINE', ended: 'SHIFT COMPLETE',
};
const EVENT_SOUNDS: Partial<Record<ShiftEvent['type'], SoundEffect>> = {
  grab: 'grab', drop: 'drop', sort: 'correct', wrong: 'wrong', miss: 'pile-up',
  recover: 'dig', brake: 'belt-stop', switch: 'switch', phase: 'event-alert', end: 'shift-end',
  brian: 'event-alert', spill: 'drop',
};
const FACING_ANGLE = { right: Math.PI / 2, left: -Math.PI / 2, down: 0, up: Math.PI } as const;

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function showWebglFallback(host: HTMLElement): void {
  host.innerHTML = `<div class="b3d-fallback" style="position:fixed;inset:0;display:grid;place-items:center;background:#0b171c;color:#edf0de;font:16px 'Segoe UI',Arial,sans-serif;text-align:center;padding:24px">
    <div><h1 style="font-size:28px;margin:0 0 12px">THE BELT · 3D PREVIEW</h1>
    <p>This preview needs WebGL, which this browser has turned off.</p>
    <p><a style="color:#edb765" href="${window.location.pathname}">Play the full 2D night shift instead</a></p></div></div>`;
}

export class Belt3d {
  public model = new ShiftModel();
  public state: AppState = 'briefing';
  public readonly overlay: Overlay;
  public readonly world: DepotWorld;
  public readonly quality: 'high' | 'low';
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer | null;
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  private readonly cameraTarget = new THREE.Vector3();
  private readonly workers: Record<'termite' | 'skanky', Character>;
  public readonly crew: CrewLife;
  public readonly setPieces: SetPieces;
  public readonly mesa: MesaEncounter;
  public readonly dream: MesaDream;
  /** Ben's story clock, independent of the frozen shift. */
  public benClock = BEN_START;
  private benStarted = false;
  private pausedFrom: 'playing' | 'interlude' = 'playing';
  private readonly stolen = new Set<number>();
  private readonly parcels = new Map<number, ParcelView>();
  private readonly departing: { view: ParcelView; from: THREE.Vector3; to: THREE.Vector3; t: number; bulk: boolean }[] = [];
  private readonly activeRing: THREE.Mesh;
  private readonly sleepTag: THREE.Sprite;
  private readonly marker: THREE.Mesh;
  private readonly keys = new Set<string>();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private overview = false;
  private hint = 'Approach the belt · match letter to dock';
  private countdownMs = 0;
  private time = 0;
  private lastFrame = performance.now();
  private lastRender = 0;
  private renderCost = 0;
  private banter = new Set<string>();
  private bulkVisible = 0;
  private fumeTimer = 0;

  private readonly host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
    this.overlay = new Overlay(host);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const gl = this.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
    this.quality = /swiftshader|llvmpipe|software|basic render/i.test(rendererName) ? 'low' : 'high';
    this.renderer.setPixelRatio(this.quality === 'high' ? Math.min(window.devicePixelRatio, 2) : 0.6);
    this.renderer.shadowMap.enabled = this.quality === 'high';
    this.renderer.shadowMap.type = this.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.overlay.root.prepend(this.renderer.domElement);

    this.world = new DepotWorld(this.quality);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.world.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.world.scene.environmentIntensity = 0.18;

    if (this.quality === 'high') {
      const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.world.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.96));
      this.composer.addPass(new OutputPass());
    } else {
      this.composer = null;
    }

    this.workers = {
      termite: createCharacter({ name: 'TERMITE', skin: 0xe2b088, shirt: 0x2f5f8f, pants: 0x2a3f5c, overalls: 0x2a3f5c, hair: 0x5a3a20, hairStyle: 'short', headwear: 'termiteHat', beard: true }),
      skanky: createCharacter({ name: 'SKANKY', skin: 0xe8b98f, shirt: 0x8f3f34, pants: 0x34404c, hair: 0x5b3a22, hairStyle: 'long', beard: true }),
    };
    for (const worker of Object.values(this.workers)) {
      mergeCharacter(worker);
      this.world.scene.add(worker.root);
    }
    this.crew = new CrewLife(this.world, (id, copy, ms) => this.say(id, copy, ms));
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

    this.activeRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), new THREE.MeshBasicMaterial({ color: 0xf3e6c6, transparent: true, opacity: 0.85 }));
    this.activeRing.rotation.x = -Math.PI / 2;
    this.world.scene.add(this.activeRing);
    this.sleepTag = textSprite(['zZz'], 0.3, { width: 60, height: 30, color: '#d8e2d0' });
    this.world.scene.add(this.sleepTag);
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshStandardMaterial({ color: 0xf3e6c6, emissive: 0xf3e6c6, emissiveIntensity: 0.8 }));
    this.marker.rotation.x = Math.PI;
    this.world.scene.add(this.marker);

    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
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
      window.setInterval(() => this.tick(), 16);
      this.renderer.setAnimationLoop(() => this.draw());
    }
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
    this.dream?.resize(width / height);
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
        if (this.state === 'briefing') this.startCountdown();
        else if (this.state === 'ended') this.restart();
        else if (this.state === 'paused') this.resume();
      } else if (event.code === 'KeyV') {
        this.overview = !this.overview;
      } else if (event.code === 'KeyM') {
        audioSystem.toggleMuted();
      } else if (event.code === 'Escape') {
        if (this.state === 'playing' || this.state === 'interlude') this.pause();
        else if (this.state === 'paused') this.resume();
      } else if (this.state === 'playing') {
        if (event.code === 'Space') this.model.action();
        else if (event.code === 'Tab') this.model.switchWorker();
        else if (event.code === 'KeyE') this.model.brake();
      }
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => { this.keys.clear(); if (this.state === 'playing' || this.state === 'interlude') this.pause(); });
    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointerdown', (event) => {
      void audioSystem.unlock();
      if (this.state !== 'playing') return;
      if (event.button === 0) this.model.action();
      else if (event.button === 2) this.model.switchWorker();
    });
  }

  private showBriefing(): void {
    this.overlay.showPanel(`
      <div class="kicker">TERMITE &amp; SKANKY  /  3D PREVIEW</div>
      <h1>ANOTHER NIGHT ON THE BELT.</h1>
      <p><b>Dispatch 24 parcels in a three-minute night shift.</b></p>
      <p>A and B go to your trucks. C goes to BULK at the belt end.</p>
      <p>WASD / arrows move. TAB or right-click switches your worker.</p>
      <p>SPACE or click grabs, delivers at a dock, or puts a parcel down.</p>
      <p>E brakes. V shows the whole warehouse. Recover misses before 5 pile up.</p>
      <button type="button">START SHIFT  ↵</button>
      <a href="${window.location.pathname}">PLAY THE FULL 2D SHIFT WITH EVERY CREW EVENT</a>`, () => this.startCountdown());
  }

  private startCountdown(): void {
    if (this.state !== 'briefing') return;
    void audioSystem.unlock();
    audioSystem.play('ui-start');
    audioSystem.play('countdown');
    this.state = 'countdown';
    this.countdownMs = 0;
    this.overlay.showCount('3');
  }

  private pause(): void {
    this.pausedFrom = this.state === 'interlude' ? 'interlude' : 'playing';
    this.state = 'paused';
    this.model.paused = true;
    audioSystem.stopMusic();
    this.overlay.showPanel(`<div class="kicker">${this.pausedFrom === 'interlude' ? 'STORY PAUSED' : 'SHIFT PAUSED'}</div><h1>BELT ON HOLD.</h1><p>Your freight stays exactly where it is.</p><button type="button">RESUME  ↵</button>`, () => this.resume());
  }

  private resume(): void {
    this.state = this.pausedFrom;
    this.model.paused = this.state === 'interlude';
    this.overlay.clearCenter();
    if (this.state === 'playing') audioSystem.startMusic('game');
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
    audioSystem.play('wrong');
    this.overlay.showPanel(`
      <div class="kicker">SHIFT TERMINATED</div>
      <h1 class="caught">${MESA.caught}</h1>
      <p>${MESA.caughtDetail}</p>
      <p><b>GAME OVER</b></p>
      <p>Vic offered a one-in-five risk. This time Shan caught you both.</p>
      <button type="button">ANOTHER SHIFT  ↵</button>`, () => this.restart());
  }

  private restart(): void {
    for (const view of this.parcels.values()) this.world.scene.remove(view.root);
    for (const item of this.departing) this.world.scene.remove(item.view.root);
    this.parcels.clear();
    this.departing.length = 0;
    this.bulkVisible = 0;
    this.stolen.clear();
    this.benStarted = false;
    this.benClock = BEN_START;
    this.overlay.hold = null;
    this.setPieces.reset();
    this.mesa.reset();
    this.dream.stop();
    this.overlay.root.classList.remove('dreaming');
    this.model = new ShiftModel();
    this.banter.clear();
    this.crew.reset();
    this.overlay.clearSpeech();
    this.hint = 'Approach the belt · match letter to dock';
    this.state = 'briefing';
    this.snapCamera();
    this.showBriefing();
  }

  private tick(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;
    const m = this.model;

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
        audioSystem.startMusic('game');
      }
    }
    if (this.state === 'playing') {
      if (!this.benStarted && m.elapsedMs >= BEN_START && !m.ended) this.beginInterlude();
      else if (this.mesa.check(m)) this.state = 'mesa';
    }
    if (this.state === 'playing') {
      const move = {
        x: (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0),
        y: (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0),
      };
      m.update(dt * 1000, move);
      for (const event of m.drainEvents()) this.handleEvent(event);
      this.updateBanter();
      this.crew.update(dt, m, this.time);
      this.setPieces.update(dt, m, this.time);
      if (m.ended && m.won) {
        this.state = 'celebrating';
        audioSystem.play('truck');
        this.overlay.showToast('SHIFT COMPLETE', 13000);
        this.crew.beginCelebration(this.time);
      } else if (m.ended) {
        this.showResults();
      }
    } else if (this.state === 'celebrating') {
      if (this.crew.updateCelebration(dt, this.time)) this.showResults();
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
    }
    this.mesa.update(dt * 1000, this.time);

    const running = this.state === 'playing' || this.state === 'celebrating' || this.state === 'ended';
    if (this.state === 'playing') this.crew.updateReceiving(m, dt, this.time);
    this.world.update(running ? dt : 0, this.time, m.beltTravel, this.reducedMotion);
    this.syncWorkers(running ? dt : 0);
    this.syncParcels(running ? dt : 0);
    this.updateCamera(dt);
    this.overlay.updateHud({
      sorted: m.sorted, goal: m.goal, score: m.score, timeLeftMs: m.timeLeftMs, backlog: m.pileup, capacity: m.capacity,
      phase: this.state === 'interlude' ? 'BEN  /  DODGE TRAINING' : PHASE_LABELS[m.phase] ?? '', combo: m.combo, worker: m.activeWorker.id,
      hint: this.state === 'interlude' ? 'Belt held · your freight is safe' : this.state === 'mesa' ? 'Y steals the Mesa · N leaves it' : this.hint, overview: this.overview,
      brake: m.brakeRemainingMs > 0 ? '■ BELT HELD' : m.brakeCooldownMs > 0 ? `[E] RECHARGE ${Math.ceil(m.brakeCooldownMs / 1000)}s` : '[E] BRAKE READY',
    });
    const size = this.renderer.getSize(new THREE.Vector2());
    const speechClock = running || this.state === 'interlude' || this.state === 'mesa' || this.state === 'dream';
    // Bubbles project with the camera as it is now, whether or not a draw follows.
    this.camera.updateMatrixWorld();
    this.overlay.update(dt * 1000, speechClock, this.camera, size.x, size.y);
  }

  private draw(): void {
    const now = performance.now();
    // A software renderer can take longer than a frame to draw; space its draws out.
    if (this.quality === 'low' && now - this.lastRender < Math.max(100, this.renderCost * 2)) return;
    this.lastRender = now;
    if (this.state === 'dream') this.renderer.render(this.dream.scene, this.dream.camera);
    else if (this.composer) this.composer.render();
    else this.renderer.render(this.world.scene, this.camera);
    this.renderCost = performance.now() - now;
  }

  private handleEvent(event: ShiftEvent): void {
    const sound = EVENT_SOUNDS[event.type];
    if (sound) audioSystem.play(sound);
    if (event.type === 'sort' && event.score) {
      this.overlay.pop(`+${event.score}`, ROUTE_COLORS[event.route ?? 'A'], toWorld(event, 1.8));
    }
    if (event.type === 'grab' || event.type === 'recover' || event.type === 'drop' || event.type === 'wrong' || event.type === 'miss' || event.type === 'brake') {
      this.hint = event.message;
    } else if (event.type === 'sort') {
      this.hint = 'Approach the belt · match letter to dock';
    }
    if (event.type === 'phase' || event.type === 'miss') this.overlay.showToast(event.message);

    this.crew.onEvent(event, this.model);
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
      setFromModel(character.root.position, worker, 0);
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
    this.activeRing.position.set(active.root.position.x, 0.02, active.root.position.z);
    const pulse = 1 + Math.sin(this.time * 4) * 0.05;
    this.activeRing.scale.set(pulse, pulse, 1);
    const idle = this.workers[m.activeIndex === 0 ? 'skanky' : 'termite'];
    this.sleepTag.position.set(idle.root.position.x + 0.3, 2.5 + Math.sin(this.time * 2) * 0.08, idle.root.position.z);

    // A marker above the parcel the active worker would grab.
    const nearest = m.heldPackage ? null : m.nearestPackage();
    const view = nearest ? this.parcels.get(nearest.id) : null;
    this.marker.visible = Boolean(view) && this.state === 'playing';
    if (view) {
      this.marker.position.copy(view.root.position).add(new THREE.Vector3(0, view.height + 1.0 + Math.sin(this.time * 6) * 0.06, 0));
      this.marker.rotation.y += dt * 3;
    }
  }

  private parcelPosition(parcel: Parcel, view: ParcelView, target: THREE.Vector3): THREE.Vector3 {
    if (parcel.state === 'held' && parcel.workerId) {
      const character = this.workers[parcel.workerId];
      const forward = new THREE.Vector3(Math.sin(character.root.rotation.y), 0, Math.cos(character.root.rotation.y));
      return target.copy(character.root.position).addScaledVector(forward, 0.42).setY(1.05 - view.height * 0.35);
    }
    if (parcel.state === 'missed') {
      const missed = this.model.packages.filter((item) => item.state === 'missed');
      const index = missed.indexOf(parcel);
      return setFromModel(target, { x: SHIFT_LAYOUT.recoveryPile.x - 64 + index * 32, y: SHIFT_LAYOUT.recoveryPile.y }, 0.14);
    }
    return setFromModel(target, parcel, parcel.state === 'belt' ? BELT_HEIGHT + 0.01 : 0);
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
          this.world.scene.remove(view.root);
        } else if (view) {
          this.parcels.delete(parcel.id);
          const to = parcel.route === 'C'
            ? this.world.bulkStack.position.clone().add(new THREE.Vector3(0, 0.3, 0))
            : toWorld(parcel.route === 'A' ? { x: 300, y: 532 } : { x: 660, y: 532 }, 1.2);
          this.departing.push({ view, from: view.root.position.clone(), to, t: 0, bulk: parcel.route === 'C' });
        }
        continue;
      }
      seen.add(parcel.id);
      let view = this.parcels.get(parcel.id);
      if (!view) {
        view = createParcelView(parcel);
        this.parcels.set(parcel.id, view);
        this.world.scene.add(view.root);
        audioSystem.play('package-spawn');
      }
      this.parcelPosition(parcel, view, target);
      const settle = parcel.state === 'belt' ? 1 : Math.min(1, dt * 18);
      view.root.position.lerp(target, settle);
      view.root.rotation.y = parcel.state === 'held' && parcel.workerId ? this.workers[parcel.workerId].root.rotation.y : 0;
      if (parcel.kind === 'makeup' && parcel.broken) {
        view.parts.crack.visible = true;
        view.parts.spill.visible = true;
      }
      this.animateParcel(view, parcel, dt);
    }
    for (const [id, view] of this.parcels) {
      if (!seen.has(id)) {
        this.world.scene.remove(view.root);
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
      item.view.root.scale.setScalar(item.bulk ? 1 : 1 - t * 0.6);
      if (t >= 1) {
        this.world.scene.remove(item.view.root);
        this.departing.splice(i, 1);
        if (item.bulk) this.bulkVisible += 1;
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
    if (this.state === 'interlude' || (this.state === 'paused' && this.pausedFrom === 'interlude')) {
      // Frame the whole outer bay: gunman, Ben, the gate and the demon.
      look = new THREE.Vector3(toWorldX(95), 1.0, toWorldZ(400));
      position = look.clone().add(portrait ? new THREE.Vector3(2, 11, 9) : new THREE.Vector3(3.2, 6.6, 7.6));
    } else if (this.overview || this.state === 'briefing' || this.state === 'celebrating') {
      look = new THREE.Vector3(0, 0, toWorldZ(352));
      position = look.clone().add(portrait ? new THREE.Vector3(0, 48, 24) : new THREE.Vector3(0, 33, 17));
    } else {
      const worker = this.workers[this.model.activeWorker.id].root.position;
      // Keep the belt in frame by leaning the view toward the conveyor.
      look = new THREE.Vector3(worker.x * 0.5, 0.4, worker.z - 1.0);
      position = look.clone().add(portrait ? new THREE.Vector3(0, 15, 9) : new THREE.Vector3(worker.x * 0.2, 10.5, 9.4));
    }
    const ease = snap ? 1 : 1 - Math.exp(-dt * 4);
    this.camera.position.lerp(position, ease);
    this.cameraTarget.lerp(look, ease);
    this.camera.lookAt(this.cameraTarget);
  }

  private showResults(): void {
    if (this.state === 'ended') return;
    this.state = 'ended';
    const m = this.model;
    audioSystem.startMusic('results');
    const overflow = m.pileup >= m.capacity;
    const rate = m.packages.length === 0 ? 0 : Math.round(m.sorted / m.packages.length * 100);
    this.overlay.showPanel(`
      <div class="grade">${m.won ? m.grade : 'F'}</div>
      <div class="kicker">${m.won ? `SHIFT COMPLETE / GRADE ${m.grade}` : 'SHIFT TERMINATED / YOU FAILED THE SORT'}</div>
      <h1>${overflow ? 'PILE-UP OVERFLOW' : m.gradeQuote}</h1>
      <p><b>${m.sorted} DISPATCHED · ${String(m.score).padStart(5, '0')} POINTS · ${m.bestCombo} BEST STREAK</b></p>
      <p>${rate}% of freight dispatched · ${m.missed} parcels reached the belt end</p>
      <button type="button">ANOTHER SHIFT  ↵</button>
      <a href="${window.location.pathname}">PLAY THE FULL 2D SHIFT WITH EVERY CREW EVENT</a>`, () => this.restart());
  }
}

export function startBelt3d(): void {
  const host = document.querySelector<HTMLDivElement>('#app');
  if (!host) throw new Error('Expected #app container to exist.');
  document.title = 'THE BELT · 3D';
  audioSystem.installUnlockListeners();
  if (!webglAvailable()) {
    showWebglFallback(host);
    window.dispatchEvent(new CustomEvent('belt3d:fallback'));
    return;
  }
  const app = new Belt3d(host);
  // Browser checks observe the app through this event; nothing global is set.
  window.dispatchEvent(new CustomEvent('belt3d:ready', { detail: app }));
}
