import * as THREE from 'three';

const CSS = `
.b3d { position: fixed; inset: 0; overflow: hidden; background: #0a1317; font-family: "Segoe UI", system-ui, Arial, sans-serif; color: #edf0de; }
.b3d canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.b3d-hud { position: absolute; inset: 0; pointer-events: none; }
.b3d-top { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center; gap: 28px; padding: 12px 22px;
  background: linear-gradient(#0b171ce8, #0b171c00); }
.b3d-brand { display: flex; flex-direction: column; border-left: 4px solid #e8b765; padding-left: 10px; }
.b3d-brand b { font: 800 26px/1 "Segoe UI", Arial, sans-serif; letter-spacing: 1px; }
.b3d-brand small { font-size: 10px; letter-spacing: 2.4px; color: #9fb4b4; margin-top: 4px; }
.b3d-stat { display: flex; flex-direction: column; min-width: 92px; }
.b3d-stat small { font-size: 10px; letter-spacing: 2px; color: #8eaaae; }
.b3d-stat b { font: 700 24px/1.1 "Segoe UI", Arial, sans-serif; font-variant-numeric: tabular-nums; }
.b3d-stat.time b { color: #edb765; }
.b3d-progress { height: 3px; background: #26444c; margin-top: 4px; }
.b3d-progress i { display: block; height: 100%; width: 0; background: #76cbd1; transition: width .3s; }
.b3d-pips { display: flex; gap: 5px; margin-top: 6px; }
.b3d-pips i { width: 18px; height: 8px; border-radius: 2px; background: #26444c; }
.b3d-pips i.on { background: #ef7d68; box-shadow: 0 0 8px #ef7d68; }
.b3d-phase { margin-left: auto; text-align: right; font-size: 12px; letter-spacing: 1.5px; color: #76cbd1; }
.b3d-phase em { display: block; font-style: normal; color: #edb765; margin-top: 4px; }
.b3d-bottom { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 24px; padding: 12px 22px;
  background: linear-gradient(#0b171c00, #0b171ce8); font-size: 13px; }
.b3d-worker { font-weight: 800; letter-spacing: 1px; min-width: 120px; }
.b3d-worker.termite { color: #76cbd1; } .b3d-worker.skanky { color: #a6cc9a; }
.b3d-hint { flex: 1; min-width: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.b3d-brake { white-space: nowrap; }
@media (max-width: 1180px) { .b3d-keys { display: none; } }
.b3d-keys { color: #8eaaae; font-size: 11px; letter-spacing: 1px; }
.b3d-brake { font-weight: 700; letter-spacing: 1px; }
.b3d-bubbles, .b3d-pops { position: absolute; inset: 0; pointer-events: none; }
.b3d-bubble { position: absolute; transform: translate(-50%, calc(-100% - 14px)); background: #f3e6c6; color: #18252b;
  border: 2px solid #c9a868; border-radius: 10px; padding: 7px 12px 8px; font: 800 14px/1.2 "Segoe UI", Arial, sans-serif;
  white-space: pre-line; text-align: center; box-shadow: 0 6px 18px #0008; width: max-content; max-width: 260px; transition: opacity .18s; }
.b3d-bubble small { display: block; white-space: nowrap; font-size: 10px; letter-spacing: 1.4px; color: #8a5a2a; margin-bottom: 2px; }
.b3d-bubble::after { content: ""; position: absolute; left: 50%; bottom: -10px; margin-left: -8px; border: 8px solid transparent; border-top-color: #c9a868; border-bottom: 0; }
.b3d-bubble.edge { border-style: dashed; }
.b3d-bubble.thought { border-radius: 40px; padding: 12px 22px; font-size: 18px; }
.b3d-bubble.thought::after { width: 12px; height: 12px; border: 2px solid #c9a868; border-radius: 50%; background: #f3e6c6; bottom: -20px; margin-left: -14px; }
.b3d-bubble.held { display: none; }
.b3d.dreaming .b3d-hud, .b3d.dreaming .b3d-bubbles, .b3d.dreaming .b3d-pops, .b3d.dreaming .b3d-toast { display: none; }
.b3d-notice { position: absolute; top: 120px; left: 50%; transform: translateX(-50%); background: #10232a; color: #edba6d; padding: 8px 16px; border-radius: 4px; font: 800 15px 'Segoe UI', Arial, sans-serif; letter-spacing: 1px; }
.b3d-choices { display: flex; gap: 14px; margin-top: 18px; }
.b3d-choices button { margin-top: 0; }
.b3d-choices button.leave { background: #edba6d; }
.b3d-choices button.steal { background: #a6cc9a; }
.b3d-panel .caught { color: #f3987c; }
.b3d-bubble.edge::after { display: none; }
.b3d-pop { position: absolute; transform: translate(-50%, -50%); font: 900 18px "Segoe UI", Arial, sans-serif; text-shadow: 0 2px 6px #000c; white-space: nowrap; }
.b3d-center { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.b3d-panel { pointer-events: auto; width: min(620px, calc(100vw - 32px)); background: #142a31f2; border: 1px solid #3b5a62; border-radius: 12px;
  padding: 28px 34px; box-shadow: 0 30px 80px #000a; }
.b3d-panel h1 { font: 800 34px/1.1 "Segoe UI", Arial, sans-serif; margin: 6px 0 16px; }
.b3d-panel .kicker { font-size: 12px; letter-spacing: 2px; color: #edb765; }
.b3d-panel p { margin: 6px 0; color: #cfd8cc; font-size: 15px; }
.b3d-panel .grade { font: 900 64px/1 "Segoe UI", Arial, sans-serif; color: #edb765; float: right; margin-left: 16px; }
.b3d-panel button { display: block; width: 100%; margin-top: 18px; padding: 14px; border: 0; border-radius: 6px; background: #edb765;
  color: #1a2226; font: 800 16px "Segoe UI", Arial, sans-serif; letter-spacing: 1px; cursor: pointer; }
.b3d-panel a { display: block; margin-top: 12px; text-align: center; color: #9fb4b4; font-size: 12px; letter-spacing: 1.5px; }
.b3d-count { font: 900 120px "Segoe UI", Arial, sans-serif; color: #f0dfb3; text-shadow: 0 8px 30px #000; }
.b3d-toast { position: absolute; top: 92px; left: 50%; transform: translateX(-50%); background: #10232ae6; border: 1px solid #3b5a62;
  padding: 8px 16px; border-radius: 6px; font-weight: 700; font-size: 14px; transition: opacity .3s; }
/* Phones: one compact row of stats; the brand gives way to the numbers. */
@media (max-width: 720px), (max-height: 520px) {
  .b3d-top { gap: 14px; padding: 8px 12px; flex-wrap: nowrap; }
  .b3d-brand small, .b3d-phase, .b3d-keys { display: none; }
  .b3d-brand b { font-size: 17px; }
  .b3d-stat { min-width: 0; }
  .b3d-stat small { font-size: 9px; letter-spacing: 1.2px; }
  .b3d-stat b { font-size: 17px; }
  .b3d-pips i { width: 12px; height: 7px; }
  .b3d-toast { top: 96px; font-size: 12px; }
}
@media (max-width: 480px) {
  .b3d-brand { display: none; }
}
@media (max-width: 720px) {
  .b3d-bubble { font-size: 12px; max-width: 190px; padding: 6px 10px 7px; }
  .b3d-panel { padding: 20px 22px; }
  .b3d-panel h1 { font-size: 26px; }
  .b3d-panel p { font-size: 14px; }
}
`;

export interface HudState {
  sorted: number; goal: number; score: number; timeLeftMs: number; backlog: number; capacity: number;
  phase: string; combo: number; worker: 'termite' | 'skanky'; hint: string; brake: string; overview: boolean;
}

interface Bubble {
  element: HTMLDivElement;
  anchor: () => THREE.Vector3;
  remainingMs: number;
}

export class Overlay {
  public readonly root: HTMLDivElement;
  private readonly hud: HTMLDivElement;
  private readonly bubbles: HTMLDivElement;
  private readonly pops: HTMLDivElement;
  private readonly center: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly fields: Record<string, HTMLElement> = {};
  private readonly speech = new Map<string, Bubble>();
  private readonly popups: { element: HTMLDivElement; world: THREE.Vector3; age: number }[] = [];
  private toastMs = 0;
  private serial = 0;
  /** While set, only matching bubbles are shown and count down (story holds). */
  public hold: ((key: string) => boolean) | null = null;
  /** Every centre notice shown, for the reference checks. */
  public readonly notices: string[] = [];
  /** Every displayed line, for the reference checks. */
  public readonly history: string[] = [];

  constructor(host: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.root = document.createElement('div');
    this.root.className = 'b3d';
    host.append(this.root);
    this.hud = this.div('b3d-hud', this.root);
    this.hud.innerHTML = `
      <div class="b3d-top">
        <div class="b3d-brand"><b>THE BELT</b><small>NIGHT SORT SIMULATOR</small></div>
        <div class="b3d-stat"><small>DISPATCHED</small><b data-f="sorted">00 / 24</b><div class="b3d-progress"><i data-f="bar"></i></div></div>
        <div class="b3d-stat"><small>SHIFT SCORE</small><b data-f="score">00000</b></div>
        <div class="b3d-stat time"><small>TIME LEFT</small><b data-f="time">03:00</b></div>
        <div class="b3d-stat"><small>BACKLOG</small><div class="b3d-pips" data-f="pips"></div></div>
        <div class="b3d-phase"><span data-f="phase"></span><em data-f="combo"></em></div>
      </div>
      <div class="b3d-bottom">
        <div class="b3d-worker" data-f="worker"></div>
        <div class="b3d-hint" data-f="hint"></div>
        <div class="b3d-brake" data-f="brake"></div>
        <div class="b3d-keys">WASD MOVE · TAB SWITCH · SPACE GRAB/DELIVER · E BRAKE · V <span data-f="view"></span> · ESC PAUSE · M SOUND</div>
      </div>`;
    this.hud.querySelectorAll<HTMLElement>('[data-f]').forEach((element) => { this.fields[element.dataset.f!] = element; });
    this.bubbles = this.div('b3d-bubbles', this.root);
    this.pops = this.div('b3d-pops', this.root);
    this.toast = this.div('b3d-toast', this.root);
    this.toast.style.opacity = '0';
    this.center = this.div('b3d-center', this.root);
  }

  private div(className: string, parent: HTMLElement): HTMLDivElement {
    const element = document.createElement('div');
    element.className = className;
    parent.append(element);
    return element;
  }

  public updateHud(state: HudState): void {
    const f = this.fields;
    f.sorted.textContent = `${String(state.sorted).padStart(2, '0')} / ${state.goal}`;
    f.bar.style.width = `${Math.min(100, state.sorted / state.goal * 100)}%`;
    f.score.textContent = String(state.score).padStart(5, '0');
    const seconds = Math.ceil(state.timeLeftMs / 1000);
    f.time.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (f.pips.childElementCount !== state.capacity) f.pips.innerHTML = '<i></i>'.repeat(state.capacity);
    [...f.pips.children].forEach((pip, index) => pip.classList.toggle('on', index < state.backlog));
    f.phase.textContent = state.phase;
    f.combo.textContent = state.combo > 1 ? `${state.combo} IN A ROW  /  +${Math.min(state.combo, 10) * 15} NEXT` : 'TARGET  /  24 CLEAN DISPATCHES';
    f.worker.textContent = `● ${state.worker.toUpperCase()}`;
    f.worker.className = `b3d-worker ${state.worker}`;
    f.hint.textContent = state.hint;
    f.brake.textContent = state.brake;
    f.view.textContent = state.overview ? 'CLOSE VIEW' : 'OVERVIEW';
  }

  /** A speech bubble anchored to a point in the world, above its speaker. */
  public say(key: string, name: string, copy: string, durationMs: number, anchor: () => THREE.Vector3, thought = false): void {
    // A speaker's unfinished line is kept (stacked above) rather than cut off.
    const existing = this.speech.get(key);
    if (existing && existing.remainingMs > 800) {
      this.serial += 1;
      this.speech.set(`${key}:${this.serial}`, existing);
    } else {
      existing?.element.remove();
    }
    const element = this.div(thought ? 'b3d-bubble thought' : 'b3d-bubble', this.bubbles);
    element.dataset.speaker = name;
    const label = document.createElement('small');
    label.textContent = name;
    element.append(label, document.createTextNode(copy));
    this.speech.set(key, { element, anchor, remainingMs: durationMs });
    this.history.push(`${name}: ${copy.replace(/\n/g, ' ')}`);
  }

  public showToast(text: string, ms = 2200): void {
    this.toast.textContent = text;
    this.toast.style.opacity = '1';
    this.toastMs = ms;
  }

  public pop(text: string, color: string, world: THREE.Vector3): void {
    const element = this.div('b3d-pop', this.pops);
    element.textContent = text;
    element.style.color = color;
    this.popups.push({ element, world: world.clone(), age: 0 });
  }

  /** Projects anchored UI. Off-screen speakers keep a bubble at the nearest edge. */
  public update(dtMs: number, clockRunning: boolean, camera: THREE.Camera, width: number, height: number): void {
    const v = new THREE.Vector3();
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const entries = [...this.speech.entries()].sort((a, b) => a[1].anchor().z - b[1].anchor().z);
    for (const [key, bubble] of entries) {
      const held = this.hold !== null && !this.hold(key.split(':')[0]);
      bubble.element.classList.toggle('held', held);
      if (held) continue;
      if (clockRunning) bubble.remainingMs -= dtMs;
      if (bubble.remainingMs <= 0) {
        bubble.element.remove();
        this.speech.delete(key);
        continue;
      }
      v.copy(bubble.anchor()).project(camera);
      let x = (v.x + 1) / 2 * width;
      let y = (1 - v.y) / 2 * height;
      const behind = v.z > 1;
      const w = bubble.element.offsetWidth;
      const h = bubble.element.offsetHeight;
      const margin = 12;
      const minY = 96 + h + 14;
      const maxY = height - 64;
      const inside = !behind && x > w / 2 + margin && x < width - w / 2 - margin && y > minY && y < maxY;
      bubble.element.classList.toggle('edge', !inside);
      if (behind) { x = width - x; y = maxY; }
      const rawX = x;
      const rawY = y;
      x = Math.min(width - w / 2 - margin, Math.max(w / 2 + margin, x));
      const label = bubble.element.firstElementChild as HTMLElement;
      const name = bubble.element.dataset.speaker ?? '';
      const arrow = inside ? '' : rawX > x + 1 ? ' ▶' : rawX < x - 1 ? '◀ ' : rawY < minY ? '▲ ' : '▼ ';
      const text = arrow === ' ▶' ? `${name}${arrow}` : `${arrow}${name}`;
      if (label.textContent !== text) label.textContent = text;
      y = Math.min(maxY, Math.max(minY, y));
      // Nudge bubbles upward until they no longer cover one another.
      // Bubbles are bottom-anchored; go up first, then below if the top is full.
      let direction = -1;
      for (let guard = 0; guard < 10; guard += 1) {
        const hit = placed.find((p) => Math.abs(p.x - x) < (p.w + w) / 2 + 6 && Math.abs(p.y - y) < Math.max(p.h, h) + 6);
        if (!hit) break;
        y = direction < 0 ? hit.y - hit.h - 8 : hit.y + h + 8;
        if (y < minY) { direction = 1; y = hit.y + h + 8; }
      }
      placed.push({ x, y, w, h });
      bubble.element.style.left = `${x}px`;
      bubble.element.style.top = `${y}px`;
    }
    for (let i = this.popups.length - 1; i >= 0; i -= 1) {
      const pop = this.popups[i];
      pop.age += dtMs;
      if (pop.age > 1100) { pop.element.remove(); this.popups.splice(i, 1); continue; }
      v.copy(pop.world).project(camera);
      pop.element.style.left = `${(v.x + 1) / 2 * width}px`;
      pop.element.style.top = `${(1 - v.y) / 2 * height - pop.age * 0.05}px`;
      pop.element.style.opacity = String(1 - Math.max(0, pop.age - 600) / 500);
    }
    if (this.toastMs > 0) {
      this.toastMs -= dtMs;
      if (this.toastMs <= 0) this.toast.style.opacity = '0';
    }
  }

  public dropSpeech(predicate: (key: string) => boolean): void {
    for (const [key, bubble] of this.speech) {
      if (predicate(key.split(':')[0])) { bubble.element.remove(); this.speech.delete(key); }
    }
  }

  public clearSpeech(): void {
    for (const bubble of this.speech.values()) bubble.element.remove();
    this.speech.clear();
  }

  public activeSpeech(): { speaker: string; text: string; x: number; y: number; edge: boolean }[] {
    return [...this.speech.values()].filter(({ element }) => !element.classList.contains('held')).map(({ element }) => ({
      speaker: element.dataset.speaker ?? '', text: element.lastChild?.textContent ?? '',
      x: parseFloat(element.style.left), y: parseFloat(element.style.top), edge: element.classList.contains('edge'),
    }));
  }

  /** A centred panel; one handler for its button, or handlers by data-action. */
  public showPanel(html: string, onButton?: (() => void) | Record<string, () => void>): void {
    this.center.innerHTML = `<div class="b3d-panel">${html}</div>`;
    for (const button of this.center.querySelectorAll<HTMLButtonElement>('button')) {
      const handler = typeof onButton === 'function' ? onButton : onButton?.[button.dataset.action ?? ''];
      button.addEventListener('pointerdown', (event) => event.stopPropagation());
      button.addEventListener('click', (event) => { event.stopPropagation(); handler?.(); });
    }
  }

  public showNotice(text: string | null, color = '#edba6d'): void {
    this.root.querySelector('.b3d-notice')?.remove();
    if (!text) return;
    this.notices.push(text);
    const notice = this.div('b3d-notice', this.root);
    notice.style.color = color;
    notice.textContent = text;
  }

  public showCount(text: string): void {
    this.center.innerHTML = `<div class="b3d-count">${text}</div>`;
  }

  public clearCenter(): void {
    this.center.innerHTML = '';
  }
}
