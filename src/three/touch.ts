/**
 * On-screen controls for touch devices: a movement stick, GRAB / DELIVER,
 * SWITCH and BRAKE, plus VIEW (overview) and PAUSE. They mirror the
 * keyboard bindings and appear only while the shift can be played.
 */
const CSS = `
.b3d-touch { position: absolute; inset: 0; pointer-events: none; display: none; z-index: 4; }
.b3d.touch .b3d-touch.live { display: block; }
.b3d-stick { position: absolute; left: max(18px, env(safe-area-inset-left)); bottom: max(22px, env(safe-area-inset-bottom));
  width: 128px; height: 128px; border-radius: 50%; border: 2px solid #ffffff4a; background: #0b171cb8; pointer-events: auto;
  touch-action: none; box-shadow: 0 10px 30px #0008; }
.b3d-knob { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%;
  background: #a6cc9a; box-shadow: 0 4px 14px #0009; transition: transform .06s linear; }
.b3d-actions { position: absolute; right: max(16px, env(safe-area-inset-right)); bottom: max(22px, env(safe-area-inset-bottom));
  display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; gap: 10px; align-items: end; }
.b3d-actions button, .b3d-corner button { pointer-events: auto; touch-action: none; border: 1px solid #ffffff3a; color: #edf0de;
  background: #14262dd9; font: 800 12px 'Segoe UI', Arial, sans-serif; letter-spacing: 1px; border-radius: 14px;
  -webkit-tap-highlight-color: transparent; box-shadow: 0 6px 18px #0008; }
.b3d-actions .grab { grid-row: 1 / span 2; grid-column: 2; width: 104px; height: 104px; border-radius: 50%; background: #a6cc9a; color: #10232a; font-size: 13px; }
.b3d-actions .switch, .b3d-actions .brake, .b3d-actions .throw { width: 82px; height: 47px; }
.b3d-actions { grid-template-rows: auto auto auto; }
.b3d-actions .grab { grid-row: 1 / span 3; }
.b3d-actions .throw { background: #6d4a7a; }
.b3d-touch.chapter .switch, .b3d-touch.chapter .throw, .b3d-touch.chapter .b3d-corner [data-touch="view"] { display: none; }
.b3d-touch.driving .b3d-actions { display: none; }
.b3d-drive-pedals { display: none; position: absolute; right: max(16px, env(safe-area-inset-right)); bottom: max(22px, env(safe-area-inset-bottom)); gap: 10px; }
.b3d-touch.driving .b3d-drive-pedals { display: flex; align-items: end; }
.b3d-drive-pedals button { pointer-events: auto; touch-action: none; width: 76px; min-height: 64px; border: 1px solid #ffffff70; border-radius: 14px; background: #b8d5a9; color: #10232a; font: 800 13px 'Segoe UI', sans-serif; }
.b3d-drive-pedals [data-drive="brake"] { background: #edba6d; }
.b3d-drive-pedals [data-drive="park"] { position: absolute; bottom: 76px; right: 0; width: 162px; min-height: 44px; }
.b3d-drive-pedals button.down { filter: brightness(1.3); }
.b3d-drive-pedals button[hidden] { display: none; }
.b3d.touch.chapter.driving .b3d-corner { top: 164px; }
.b3d.touch.driving .b3d-storybar .title { font-size: 16px; }
.b3d.touch.driving .b3d-storybar .title small { font-size: 9px; letter-spacing: 1px; }
.b3d.driving .b3d-storybar .clock { white-space: nowrap; flex-shrink: 0; }
.b3d.touch.driving .b3d-storybar .clock { font-size: 14px; }
.b3d.touch.chapter.driving .b3d-chapterhud { top: 76px; padding: 8px 12px; display: grid; grid-template-columns: .8fr .8fr 1fr 1.6fr; gap: 6px 12px; }
.b3d.touch.driving .b3d-chapterhud .stat b { font-size: 14px; }
.b3d.touch.driving .b3d-chapterhud .objective { grid-column: 1 / -1; min-width: 0; font-size: 12px; }
.b3d.touch.driving .b3d-toast { top: 310px; width: max-content; max-width: calc(100% - 32px); box-sizing: border-box; }
@media (max-height: 520px) {
  .b3d.touch.chapter.driving .b3d-chapterhud { top: 108px; }
  .b3d.touch.chapter.driving .b3d-corner { top: 174px; }
  .b3d.touch.driving .b3d-toast { top: 212px; }
}
.b3d-actions button.down, .b3d-corner button.down { background: #edba6d; color: #10232a; }
.b3d-actions .brake[disabled] { opacity: .55; }
.b3d-corner { position: absolute; left: max(12px, env(safe-area-inset-left)); top: 96px; display: flex; gap: 8px; }
.b3d-corner button { width: 58px; height: 38px; font-size: 11px; }
.b3d.touch .b3d-bottom { bottom: auto; top: 54px; background: none; justify-content: center; padding: 0 12px; pointer-events: none; gap: 10px; }
.b3d.touch .b3d-worker { min-width: 0; font-size: 12px; }
.b3d.touch .b3d-bottom .b3d-brake, .b3d.touch .b3d-keys { display: none; }
.b3d.touch .b3d-hint { flex: 0 1 auto; background: #0b171cc8; padding: 5px 10px; border-radius: 6px; font-size: 12px; }
/* Narrow portrait phones (320-380px): smaller controls keep the stick and
   the action buttons apart. */
@media (orientation: portrait) and (max-width: 380px) {
  .b3d-drive-pedals { right: max(12px, env(safe-area-inset-right)); gap: 8px; }
  .b3d-drive-pedals button { width: 64px; }
  .b3d-drive-pedals [data-drive="park"] { width: 136px; }
  .b3d-stick { width: 96px; height: 96px; left: max(12px, env(safe-area-inset-left)); }
  .b3d-knob { width: 44px; height: 44px; margin: -22px 0 0 -22px; }
  .b3d-actions { right: max(12px, env(safe-area-inset-right)); gap: 8px; }
  .b3d-actions .grab { width: 84px; height: 84px; font-size: 11px; }
  .b3d-actions .switch, .b3d-actions .brake, .b3d-actions .throw { width: 66px; height: 38px; font-size: 11px; }
}
@media (orientation: landscape) and (max-height: 520px) {
  .b3d-stick { width: 104px; height: 104px; }
  .b3d-actions .grab { width: 88px; height: 88px; }
  .b3d-actions .switch, .b3d-actions .brake, .b3d-actions .throw { width: 72px; height: 36px; }
  .b3d-corner { top: 92px; }
  .b3d.touch .b3d-bottom { top: 50px; }
}
`;

export interface TouchHandlers {
  action(): void;
  switchWorker(): void;
  brake(): void;
  throwParcel(): void;
  overview(): void;
  pause(): void;
  mute(): void;
}

export class TouchControls {
  /** Current stick direction, each axis -1..1. */
  public readonly move = { x: 0, y: 0 };
  public readonly pedals = { throttle: 0, brake: 0 };
  public readonly enabled: boolean;
  private readonly root: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly brakeButton: HTMLButtonElement;
  private readonly style = document.createElement('style');
  private stickPointer: number | null = null;

  constructor(host: HTMLElement, handlers: TouchHandlers) {
    this.enabled = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const style = this.style;
    style.textContent = CSS;
    document.head.append(style);
    if (this.enabled) host.classList.add('touch');
    this.root = document.createElement('div');
    this.root.className = 'b3d-touch';
    this.root.innerHTML = `
      <div class="b3d-stick" aria-label="Move"><div class="b3d-knob"></div></div>
      <div class="b3d-actions">
        <button type="button" class="switch" data-touch="switch">SWITCH</button>
        <button type="button" class="grab" data-touch="grab" aria-label="Grab or deliver">GRAB /<br>DELIVER</button>
        <button type="button" class="brake" data-touch="brake">BRAKE</button>
        <button type="button" class="throw" data-touch="throw">THROW</button>
      </div>
      <div class="b3d-corner">
        <button type="button" data-touch="view">VIEW</button>
        <button type="button" data-touch="pause">PAUSE</button>
        <button type="button" data-touch="mute">MUTE</button>
      </div>
      <div class="b3d-drive-pedals">
        <button type="button" data-drive="brake" aria-label="Brake truck">BRAKE</button>
        <button type="button" data-drive="throttle" aria-label="Accelerate truck">GAS</button>
        <button type="button" data-drive="park" aria-label="Park truck" hidden>PARK</button>
      </div>`;
    host.append(this.root);
    this.knob = this.root.querySelector('.b3d-knob')!;
    this.brakeButton = this.root.querySelector('.brake')!;

    const actions: Record<string, () => void> = {
      grab: handlers.action, switch: handlers.switchWorker, brake: handlers.brake, throw: handlers.throwParcel, view: handlers.overview, pause: handlers.pause, mute: handlers.mute,
    };
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-touch]')) {
      // Pointer presses act at once, for responsive play. A click with no
      // preceding press (screen readers, switch control, keyboard) acts too,
      // but the click that follows an ordinary press does not act twice.
      let pressedAt = -Infinity;
      let clickPending = false;
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        pressedAt = performance.now();
        clickPending = true;
        button.classList.add('down');
        actions[button.dataset.touch!]?.();
      });
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        // Only the click that completes this press is skipped.
        const fromPress = clickPending && performance.now() - pressedAt < 1000;
        clickPending = false;
        if (!fromPress) actions[button.dataset.touch!]?.();
      });
      const release = (): void => button.classList.remove('down');
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
    }

    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-drive]')) {
      const pedal = button.dataset.drive as 'throttle' | 'brake' | 'park';
      button.addEventListener('pointerdown', event => {
        event.preventDefault(); event.stopPropagation();
        button.setPointerCapture(event.pointerId);
        if (pedal === 'park') handlers.action();
        else { this.pedals[pedal] = 1; button.classList.add('down'); }
      });
      const release = (): void => { if (pedal !== 'park') this.pedals[pedal] = 0; button.classList.remove('down'); };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      button.addEventListener('click', event => {
        if (event.detail === 0) { if (pedal === 'park') handlers.action(); else this.pedals[pedal] = this.pedals[pedal] ? 0 : 1; }
      });
    }

    const stick = this.root.querySelector<HTMLDivElement>('.b3d-stick')!;
    const steer = (event: PointerEvent): void => {
      const rect = stick.getBoundingClientRect();
      const radius = rect.width / 2;
      let dx = (event.clientX - rect.left - radius) / radius;
      let dy = (event.clientY - rect.top - radius) / radius;
      const length = Math.hypot(dx, dy);
      if (length > 1) { dx /= length; dy /= length; }
      const live = Math.hypot(dx, dy) > 0.18;
      this.move.x = live ? dx : 0;
      this.move.y = live ? dy : 0;
      this.knob.style.transform = `translate(${dx * radius * 0.6}px, ${dy * radius * 0.6}px)`;
    };
    stick.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.stickPointer = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      steer(event);
    });
    stick.addEventListener('pointermove', (event) => {
      if (event.pointerId === this.stickPointer) steer(event);
    });
    const end = (event: PointerEvent): void => {
      if (event.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.move.x = this.move.y = 0;
      this.knob.style.transform = '';
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    stick.addEventListener('lostpointercapture', end);
  }

  /**
   * Shows the controls while something is playable: the shift, or the mall and
   * lot chapters (where GRAB acts, BRAKE takes the cart and SWITCH, THROW and
   * VIEW are hidden). Releases the stick otherwise.
   */
  public setLive(live: boolean, brakeLabel: string, brakeReady: boolean, chapter = false, scannerReset = false): void {
    this.root.classList.toggle('live', live);
    this.root.classList.toggle('chapter', chapter);
    const grab = this.root.querySelector<HTMLButtonElement>('.grab')!;
    const grabLabel = chapter ? 'ACT' : scannerReset ? 'RESET<br>SCANNER' : 'GRAB /<br>DELIVER';
    if (grab.innerHTML !== grabLabel) {
      grab.innerHTML = grabLabel;
      grab.setAttribute('aria-label', chapter ? 'Act' : scannerReset ? 'Reset scanner' : 'Grab or deliver');
    }
    if (!live) this.reset();
    if (this.brakeButton.textContent !== brakeLabel) this.brakeButton.textContent = brakeLabel;
    this.brakeButton.disabled = !brakeReady;
  }

  public setDriving(driving: boolean, canPark: boolean): void {
    this.root.classList.toggle('driving', driving);
    this.root.querySelector<HTMLElement>('[data-drive="park"]')!.hidden = !canPark;
    this.root.querySelector('.b3d-stick')!.setAttribute('aria-label', driving ? 'Steer truck' : 'Move');
  }

  public reset(): void {
    this.stickPointer = null;
    this.move.x = 0;
    this.move.y = 0;
    this.pedals.throttle = this.pedals.brake = 0;
    for (const button of this.root.querySelectorAll('.down')) button.classList.remove('down');
    this.knob.style.transform = '';
  }

  public dispose(): void {
    this.reset();
    this.root.remove();
    this.style.remove();
  }
}
