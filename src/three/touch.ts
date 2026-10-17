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
.b3d-actions .switch, .b3d-actions .brake { width: 82px; height: 47px; }
.b3d-actions button.down, .b3d-corner button.down { background: #edba6d; color: #10232a; }
.b3d-actions .brake[disabled] { opacity: .55; }
.b3d-corner { position: absolute; left: max(12px, env(safe-area-inset-left)); top: 96px; display: flex; gap: 8px; }
.b3d-corner button { width: 58px; height: 38px; font-size: 11px; }
.b3d.touch .b3d-bottom { bottom: auto; top: 54px; background: none; justify-content: center; padding: 0 12px; pointer-events: none; gap: 10px; }
.b3d.touch .b3d-worker { min-width: 0; font-size: 12px; }
.b3d.touch .b3d-bottom .b3d-brake, .b3d.touch .b3d-keys { display: none; }
.b3d.touch .b3d-hint { flex: 0 1 auto; background: #0b171cc8; padding: 5px 10px; border-radius: 6px; font-size: 12px; }
@media (orientation: landscape) and (max-height: 520px) {
  .b3d-stick { width: 104px; height: 104px; }
  .b3d-actions .grab { width: 88px; height: 88px; }
  .b3d-actions .switch, .b3d-actions .brake { width: 72px; height: 40px; }
  .b3d-corner { top: 92px; }
  .b3d.touch .b3d-bottom { top: 50px; }
}
`;

export interface TouchHandlers {
  action(): void;
  switchWorker(): void;
  brake(): void;
  overview(): void;
  pause(): void;
}

export class TouchControls {
  /** Current stick direction, each axis -1..1. */
  public readonly move = { x: 0, y: 0 };
  public readonly enabled: boolean;
  private readonly root: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly brakeButton: HTMLButtonElement;
  private stickPointer: number | null = null;

  constructor(host: HTMLElement, handlers: TouchHandlers) {
    this.enabled = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    if (this.enabled) host.classList.add('touch');
    this.root = document.createElement('div');
    this.root.className = 'b3d-touch';
    this.root.innerHTML = `
      <div class="b3d-stick" aria-label="Move"><div class="b3d-knob"></div></div>
      <div class="b3d-actions">
        <button type="button" class="switch" data-touch="switch">SWITCH</button>
        <button type="button" class="grab" data-touch="grab">GRAB /<br>DELIVER</button>
        <button type="button" class="brake" data-touch="brake">BRAKE</button>
      </div>
      <div class="b3d-corner">
        <button type="button" data-touch="view">VIEW</button>
        <button type="button" data-touch="pause">PAUSE</button>
      </div>`;
    host.append(this.root);
    this.knob = this.root.querySelector('.b3d-knob')!;
    this.brakeButton = this.root.querySelector('.brake')!;

    const actions: Record<string, () => void> = {
      grab: handlers.action, switch: handlers.switchWorker, brake: handlers.brake, view: handlers.overview, pause: handlers.pause,
    };
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button')) {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.classList.add('down');
        actions[button.dataset.touch!]?.();
      });
      const release = (): void => button.classList.remove('down');
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
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
      this.reset();
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
  }

  /** Shows the controls while the shift is playable; releases the stick otherwise. */
  public setLive(live: boolean, brakeLabel: string, brakeReady: boolean): void {
    this.root.classList.toggle('live', live);
    if (!live && this.stickPointer === null) this.reset();
    if (this.brakeButton.textContent !== brakeLabel) this.brakeButton.textContent = brakeLabel;
    this.brakeButton.disabled = !brakeReady;
  }

  public reset(): void {
    this.move.x = 0;
    this.move.y = 0;
    this.knob.style.transform = '';
  }
}
