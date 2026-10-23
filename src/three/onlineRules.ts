/**
 * Online play (the owner's request, 2026-10-23: "I play Termite, he plays Skanky"). One player hosts: the night runs in
 * their browser and they play Termite. The other joins from a link with a room code: they see the host's tab, streamed
 * peer to peer, and play Skanky, their keys, controller or touch sent back to the host. These are the rules both sides
 * share; the connection is online.ts, the joining page onlineGuest.ts.
 */
export type SceneOwner = 'termite' | 'skanky' | 'both';

/**
 * Whose controls each part of the night takes. The shift is played together (Skanky is player 2) and either player
 * moves a story scene on. The mall run, the key drop, the Timmies run's trays and the five-ton drives are Skanky's;
 * the Ralph run, and its drive back, are Termite's. Menus and cards (the start screen, the choices, the results) stay
 * with the host.
 */
export function sceneOwner(state: string, ralph: boolean): SceneOwner {
  switch (state) {
    case 'playing': case 'countdown': case 'story': return 'both';
    case 'mall': case 'lot': case 'coffee': return 'skanky';
    case 'driving': return ralph ? 'termite' : 'skanky';
    default: return 'termite';
  }
}

/** The joining page says it is there this often; the host lets go of their keys after this long without a word. */
export const GUEST_HEARTBEAT_MS = 400;
export const GUEST_SILENCE_MS = 1500;

/** Movement keys: held, they move the joining player's character (they are never replayed as key presses). */
export const MOVE_KEYS: ReadonlySet<string> = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
/**
 * Every key the joining player's browser may send: movement and the game's own action keys. Anything else (and any
 * malformed message) is dropped, so the joining page can only press the game's keys.
 */
export const GUEST_KEYS: ReadonlySet<string> = new Set([
  ...MOVE_KEYS, 'Space', 'Enter', 'Escape', 'KeyE', 'KeyF', 'KeyV', 'Tab', 'ShiftRight',
  'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3',
]);
/** A controller's buttons, mapped on the host to keys for whatever is on screen there (gamepad.ts padKey). */
export const GUEST_BUTTONS: ReadonlySet<string> = new Set(['a', 'b', 'x', 'y', 'start', 'back', 'lb', 'rb', 'up', 'down', 'left', 'right']);

/** What the joining player's browser sends. */
export type GuestMessage =
  | { t: 'hello'; v: 1 }
  | { t: 'key'; code: string; down: boolean }
  | { t: 'move'; x: number; y: number; throttle: number; brake: number }
  | { t: 'pad'; button: string };
/**
 * What the host sends back: whose turn it is, for the joining page's banner; and, when the joining player sees only the
 * 3D view (no HUD or cards), mall security's card, with its answers (an empty title clears it).
 */
export type HostMessage = { t: 'turn'; owner: SceneOwner; text: string } | { t: 'card'; title: string; options: string[] } | { t: 'bye' };

const unit = (value: unknown, low: number): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(low, Math.min(1, value)) : 0;

/** A guest message checked field by field, numbers clamped; null for anything not exactly one of ours. */
export function readGuestMessage(raw: unknown): GuestMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.t === 'hello') return { t: 'hello', v: 1 };
  if (m.t === 'key' && typeof m.code === 'string' && GUEST_KEYS.has(m.code) && typeof m.down === 'boolean') return { t: 'key', code: m.code, down: m.down };
  if (m.t === 'move') return { t: 'move', x: unit(m.x, -1), y: unit(m.y, -1), throttle: unit(m.throttle, 0), brake: unit(m.brake, 0) };
  if (m.t === 'pad' && typeof m.button === 'string' && GUEST_BUTTONS.has(m.button)) return { t: 'pad', button: m.button };
  return null;
}

/** A host message checked the same way, on the joining page. */
export function readHostMessage(raw: unknown): HostMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.t === 'bye') return { t: 'bye' };
  if (m.t === 'turn' && (m.owner === 'termite' || m.owner === 'skanky' || m.owner === 'both') && typeof m.text === 'string') {
    return { t: 'turn', owner: m.owner, text: m.text.slice(0, 120) };
  }
  if (m.t === 'card' && typeof m.title === 'string' && Array.isArray(m.options) && m.options.length <= 3 && m.options.every((option) => typeof option === 'string')) {
    return { t: 'card', title: m.title.slice(0, 120), options: (m.options as string[]).map((option) => option.slice(0, 60)) };
  }
  return null;
}

/** Where held movement keys point (WASD and the arrows alike), each axis -1..1. */
export function heldMove(keys: ReadonlySet<string>): { x: number; y: number } {
  const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  return { x, y };
}

/** Room codes avoid letters and digits that read alike (0/O, 1/I/L). */
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export function roomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_LETTERS[Math.min(CODE_LETTERS.length - 1, Math.floor(random() * CODE_LETTERS.length))];
  return code;
}

/** A typed or pasted code (any case, spaces or dashes), or null if it cannot be one. */
export function readRoomCode(text: string | null | undefined): string | null {
  const code = (text ?? '').toUpperCase().replace(/[\s-]/g, '');
  return code.length === CODE_LENGTH && [...code].every((letter) => CODE_LETTERS.includes(letter)) ? code : null;
}

/** The game's name on the connection service, so a room code only ever finds a host of this game. */
export const PEER_PREFIX = 'trmytelabs-the-belt-';

/** What the joining page says for each owner. */
export function turnText(owner: SceneOwner, state: string): string {
  if (owner === 'both') return state === 'story' ? 'STORY · either of you moves it on' : 'THE BELT · you are Skanky, player 2';
  if (owner === 'skanky') return state === 'driving' ? "YOUR DRIVE · you're Skanky at the wheel" : state === 'coffee' ? "YOUR TURN · keep Skanky's coffee trays level" : "YOUR TURN · you're Skanky";
  return state === 'paper' || state === 'driving' ? "TERMITE'S TURN · watch the Ralph run" : 'TERMITE IS ON THE MENU · hold on';
}
