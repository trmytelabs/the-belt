import { GamepadInput } from './gamepad';
import { OnlineGuest, openMicrophone, setMicrophone, transportFromUrl } from './online';
import { GUEST_HEARTBEAT_MS, GUEST_KEYS, readRoomCode } from './onlineRules';

/**
 * The joining player's page (`?join=CODE`): Skanky, player 2 on Termite's endless belt from another computer. It does
 * not run the game. It shows the host's tab, streamed, and sends back this player's keys, controller and touch, which
 * the host gives to Skanky (onlineRules.ts). It is light: no 3D engine is loaded.
 */
const CSS = `
.b3g { position: fixed; inset: 0; background: #0b1520; color: #f0e6d0; font: 600 14px/1.45 "Segoe UI", Arial, sans-serif; overflow: hidden; }
.b3g video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; }
.b3g-bar { position: absolute; left: 0; right: 0; top: 0; display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; padding: 8px 14px;
  background: linear-gradient(#0b1520e6, #0b152000); pointer-events: none; }
.b3g-bar b { letter-spacing: 1.5px; color: #edb765; }
.b3g-turn { padding: 3px 10px; border-radius: 6px; background: #142a31; border: 1px solid #3b5a62; letter-spacing: 1px; }
.b3g-turn.mine { background: #a6cc9a; color: #10241a; border-color: #a6cc9a; }
.b3g-bar .b3g-tools { margin-left: auto; display: flex; gap: 8px; pointer-events: auto; }
.b3g button { font: 700 13px "Segoe UI", Arial, sans-serif; letter-spacing: 1px; color: #10241a; background: #edba6d; border: 0; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
.b3g button.quiet { background: #23404a; color: #f0e6d0; }
.b3g-card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(520px, calc(100vw - 32px)); box-sizing: border-box;
  background: #142a31f2; border: 1px solid #3b5a62; border-radius: 12px; padding: 24px 28px; box-shadow: 0 30px 80px #000a; }
.b3g-card h1 { font: 800 28px/1.1 "Segoe UI", Arial, sans-serif; margin: 6px 0 12px; }
.b3g-card .kicker { color: #edb765; letter-spacing: 2px; font-size: 12px; }
.b3g-card input { font: 800 26px "Segoe UI", Arial, sans-serif; letter-spacing: 6px; text-transform: uppercase; width: 100%; box-sizing: border-box;
  padding: 10px 12px; margin: 8px 0 14px; border-radius: 8px; border: 1px solid #3b5a62; background: #0b1520; color: #f0e6d0; }
.b3g-card button { width: 100%; padding: 14px; font-size: 15px; }
.b3g-card p { margin: 6px 0; color: #c9d6d2; }
.b3g-help { position: absolute; left: 0; right: 0; bottom: 0; padding: 8px 14px; font-size: 12px; letter-spacing: 1px; color: #b8c8c6;
  background: linear-gradient(#0b152000, #0b1520e6); pointer-events: none; }
.b3g-touch { position: absolute; inset: auto 0 34px 0; height: 190px; pointer-events: none; }
.b3g-stick { position: absolute; left: 22px; bottom: 0; width: 150px; height: 150px; border-radius: 50%; background: #ffffff18; border: 2px solid #ffffff40; pointer-events: auto; touch-action: none; }
.b3g-knob { position: absolute; left: 50%; top: 50%; width: 60px; height: 60px; margin: -30px; border-radius: 50%; background: #edba6dcc; }
.b3g-pads { position: absolute; right: 18px; bottom: 0; display: grid; grid-template-columns: repeat(3, 64px); gap: 10px; pointer-events: auto; }
.b3g-pads button { height: 56px; padding: 0; touch-action: none; }
.b3g-pads button.big { grid-column: span 3; height: 64px; }
.b3g-pads button.wide { grid-column: span 2; }
`;

export function startGuest(codeText: string | null): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const root = document.createElement('div');
  root.className = 'b3g';
  document.body.append(root);
  document.title = 'The Belt · playing online';
  const code = readRoomCode(codeText);
  const card = document.createElement('div');
  card.className = 'b3g-card';
  card.setAttribute('role', 'dialog');
  card.innerHTML = `<div class="kicker">THE BELT · PLAY ONLINE</div>
    <h1>JOIN TERMITE'S GAME</h1>
    <p>You're Skanky, on the belt with Termite: an endless shift that speeds up until recovery overflows. It runs on Termite's computer; you see it here and play with your keys, a controller or the touch controls.</p>
    <label for="b3g-code">ROOM CODE</label>
    <input id="b3g-code" maxlength="9" autocomplete="off" spellcheck="false" value="${code ?? ''}">
    <button type="button" data-action="join">JOIN AS SKANKY</button>
    <p class="b3g-error" role="status"></p>`;
  root.append(card);
  const input = card.querySelector<HTMLInputElement>('input')!;
  const error = card.querySelector<HTMLElement>('.b3g-error')!;
  const go = (): void => {
    const room = readRoomCode(input.value);
    if (!room) {
      error.textContent = 'A room code is six letters and numbers, as Termite sees it.';
      return;
    }
    card.remove();
    void play(root, room);
  };
  card.querySelector('button')!.addEventListener('click', go);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') go(); });
  if (!code) input.focus();
}

async function play(root: HTMLElement, code: string): Promise<void> {
  const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const video = document.createElement('video');
  video.playsInline = true;
  video.autoplay = true;
  const bar = document.createElement('div');
  bar.className = 'b3g-bar';
  bar.innerHTML = `<b>ONLINE · ROOM ${code} · YOU ARE SKANKY</b><span class="b3g-turn">CONNECTING…</span>
    <span class="b3g-tools"><button type="button" class="quiet" data-action="mic">MIC…</button><button type="button" class="quiet" data-action="sound">SOUND ON</button><button type="button" class="quiet" data-action="full">FULL SCREEN</button><button type="button" class="quiet" data-action="leave">LEAVE</button></span>`;
  const status = document.createElement('div');
  status.className = 'b3g-card';
  status.setAttribute('role', 'status');
  const help = document.createElement('div');
  help.className = 'b3g-help';
  const keysHelp = 'WASD / ARROWS MOVE · SPACE GRAB / DELIVER · F THROW · ESC PAUSE · K MIC';
  help.textContent = touch ? 'STICK MOVES · GRAB / DELIVER · THROW · PAUSE' : keysHelp;
  root.append(video, bar, status, help);
  const turn = bar.querySelector<HTMLElement>('.b3g-turn')!;
  const say = (title: string, text: string, rejoin = false): void => {
    status.hidden = false;
    status.innerHTML = `<div class="kicker">ROOM ${code}</div><h1>${title}</h1><p>${text}</p>${rejoin ? '<button type="button" data-action="rejoin">TRY AGAIN</button>' : ''}`;
    status.querySelector('button')?.addEventListener('click', () => window.location.reload());
  };
  say('CONNECTING…', 'Finding Termite\'s game.');

  // Voice chat: the microphone is asked for alongside joining (the picture never waits on its prompt); K or MIC mutes it.
  const transport = transportFromUrl();
  const asking = transport === 'peer' ? openMicrophone() : Promise.resolve(null);
  let microphone: MediaStream | null = null;
  let micOn = true;
  const micButton = bar.querySelector<HTMLButtonElement>('[data-action="mic"]')!;
  const showMic = (): void => { micButton.textContent = !microphone ? 'NO MIC' : micOn ? 'MIC ON' : 'MIC MUTED'; };
  const toggleMic = (): void => {
    if (!microphone) return;
    micOn = !micOn;
    setMicrophone(microphone, micOn);
    showMic();
  };
  micButton.textContent = 'MIC…';
  void asking.then((voice) => { microphone = voice; showMic(); });
  micButton.addEventListener('click', toggleMic);
  window.addEventListener('keydown', (event) => { if (event.code === 'KeyK' && !event.repeat) toggleMic(); });
  let guest: OnlineGuest;
  try {
    guest = await OnlineGuest.join(code, transport, asking);
  } catch {
    say('COULD NOT CONNECT', 'The connection service did not answer. Check your internet, then try again.', true);
    return;
  }
  let picture = false;
  guest.onState = (state) => {
    if (state === 'connected') { if (!picture) say('CONNECTED', 'Waiting for Termite to share the game…'); }
    else if (state === 'no-host') say('NO GAME WITH THAT CODE', `Nobody is hosting room ${code} right now. Ask Termite for the code on their screen, then try again.`, true);
    else if (state === 'lost') say('THE CONNECTION DROPPED', 'Termite\'s game closed or the internet blinked.', true);
    else say('COULD NOT CONNECT', 'Your network may be blocking the direct connection. Try again, or another network.', true);
  };
  guest.onStream = (stream) => {
    // The same stream arrives once per track (picture, then sound): load it once.
    if (video.srcObject === stream) return;
    picture = true;
    status.hidden = true;
    video.srcObject = stream;
    video.muted = false;
    void video.play().catch(() => { video.muted = true; return video.play(); }).catch(() => undefined);
  };
  guest.onMessage = (message) => {
    if (message.t === 'bye') { say('TERMITE STOPPED HOSTING', 'Thanks for playing.', true); return; }
    turn.textContent = message.text;
    turn.classList.toggle('mine', message.owner !== 'termite');
  };
  bar.querySelector('[data-action="sound"]')!.addEventListener('click', (event) => {
    video.muted = !video.muted;
    (event.currentTarget as HTMLElement).textContent = video.muted ? 'SOUND OFF' : 'SOUND ON';
  });
  bar.querySelector('[data-action="full"]')!.addEventListener('click', () => { void document.documentElement.requestFullscreen?.().catch(() => undefined); });
  bar.querySelector('[data-action="leave"]')!.addEventListener('click', () => {
    guest.close();
    window.location.href = `${window.location.pathname}?mode=3d`;
  });

  // The keyboard: the game's keys only, sent as pressed and released (held movement keys move Skanky).
  const held = new Set<string>();
  const stick = { x: 0, y: 0 };
  const press = (code: string, down: boolean): void => {
    if (down ? held.has(code) : !held.has(code)) return;
    if (down) held.add(code); else held.delete(code);
    guest.send({ t: 'key', code, down });
  };
  window.addEventListener('keydown', (event) => {
    if (!GUEST_KEYS.has(event.code) || event.target instanceof HTMLInputElement) return;
    event.preventDefault();
    press(event.code, true);
  });
  window.addEventListener('keyup', (event) => { if (GUEST_KEYS.has(event.code)) press(event.code, false); });
  // Away from the page (another window, a locked phone): let go of everything, so Skanky does not run on.
  const letGo = (): void => {
    for (const code of [...held]) press(code, false);
    stick.x = 0;
    stick.y = 0;
    guest.send({ t: 'move', x: 0, y: 0, throttle: 0, brake: 0 });
  };
  window.addEventListener('blur', letGo);
  document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });

  // Touch: a stick, and buttons for the game's keys.
  if (touch) {
    const pad = document.createElement('div');
    pad.className = 'b3g-touch';
    pad.innerHTML = `<div class="b3g-stick" aria-label="Move"><div class="b3g-knob"></div></div>
      <div class="b3g-pads"><button type="button" data-key="Escape" class="quiet">PAUSE</button><button type="button" data-key="KeyF" class="wide">THROW</button>
      <button type="button" data-key="Space" class="big">GRAB / DELIVER</button></div>`;
    root.append(pad);
    const area = pad.querySelector<HTMLElement>('.b3g-stick')!;
    const knob = pad.querySelector<HTMLElement>('.b3g-knob')!;
    let pointer: number | null = null;
    const steer = (event: PointerEvent): void => {
      const box = area.getBoundingClientRect();
      const radius = box.width / 2;
      let x = (event.clientX - box.left - radius) / radius, y = (event.clientY - box.top - radius) / radius;
      const length = Math.hypot(x, y);
      if (length > 1) { x /= length; y /= length; }
      stick.x = x; stick.y = y;
      knob.style.transform = `translate(${x * radius * 0.6}px, ${y * radius * 0.6}px)`;
    };
    area.addEventListener('pointerdown', (event) => { pointer = event.pointerId; area.setPointerCapture(event.pointerId); steer(event); });
    area.addEventListener('pointermove', (event) => { if (event.pointerId === pointer) steer(event); });
    const release = (event: PointerEvent): void => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      stick.x = 0; stick.y = 0;
      knob.style.transform = '';
    };
    area.addEventListener('pointerup', release);
    area.addEventListener('pointercancel', release);
    for (const button of pad.querySelectorAll<HTMLButtonElement>('button[data-key]')) {
      const key = button.dataset.key!;
      button.addEventListener('pointerdown', (event) => { event.preventDefault(); press(key, true); });
      for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) button.addEventListener(type, () => press(key, false));
    }
  }

  // A controller, and the stick: the analog part goes as one movement message whenever it changes.
  const gamepad = new GamepadInput();
  let sent = { x: 0, y: 0, throttle: 0, brake: 0 };
  let padShown = false;
  let lastSent = 0;
  const frame = (time: number): void => {
    const pads = typeof navigator.getGamepads === 'function' ? [...navigator.getGamepads()] : [];
    const input = gamepad.poll(pads);
    if (input.connected !== padShown) {
      padShown = input.connected;
      help.textContent = padShown ? 'CONTROLLER · STICK MOVES · A GRAB / DELIVER · B THROW · START PAUSE' : touch ? help.textContent : keysHelp;
    }
    for (const button of input.pressed) guest.send({ t: 'pad', button });
    // Held keys are sent as keys; this is the rest: the stick (pad or touch) and the triggers.
    const move = { x: Math.max(-1, Math.min(1, input.move.x + stick.x)), y: Math.max(-1, Math.min(1, input.move.y + stick.y)), throttle: input.throttle, brake: input.brake };
    const changed = Math.abs(move.x - sent.x) > 0.02 || Math.abs(move.y - sent.y) > 0.02 || Math.abs(move.throttle - sent.throttle) > 0.02 || Math.abs(move.brake - sent.brake) > 0.02;
    // Changes go at once; otherwise a heartbeat, so the host knows this page is still here (onlineRules).
    if (changed || time - lastSent > GUEST_HEARTBEAT_MS) {
      guest.send({ t: 'move', ...move });
      sent = move;
      lastSent = time;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
