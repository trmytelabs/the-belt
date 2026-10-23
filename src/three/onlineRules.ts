/**
 * Online play (the owner's requests, 2026-10-23: "I play Termite, he plays Skanky"; then "it should only be the belt
 * game because that's the only two player game, make it endless"). One player hosts: the endless shift runs in their
 * browser and they play Termite. The other joins from a link with a room code: they see the host's tab, streamed peer
 * to peer, and play Skanky, player 2 on the belt, their keys, controller or touch sent back to the host. These are the
 * rules both sides share; the connection is online.ts, the joining page onlineGuest.ts.
 */
export type SceneOwner = 'termite' | 'both';

/** On the belt (and its countdown) both play; everything else (the room, the results, pausing) is the host's. */
export function sceneOwner(state: string): SceneOwner {
  return state === 'playing' || state === 'countdown' ? 'both' : 'termite';
}

/** The joining page says it is there this often; the host lets go of their keys after this long without a word. */
export const GUEST_HEARTBEAT_MS = 400;
export const GUEST_SILENCE_MS = 1500;

/** Movement keys: held, they move Skanky (they are never replayed as key presses). */
export const MOVE_KEYS: ReadonlySet<string> = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
/**
 * Every key the joining player's browser may send: movement, grab or deliver (SPACE or ENTER), throw (F or RIGHT
 * SHIFT) and pause (ESC). Anything else (and any malformed message) is dropped, so the joining page can only work
 * player 2 and pause.
 */
export const GUEST_KEYS: ReadonlySet<string> = new Set([...MOVE_KEYS, 'Space', 'Enter', 'Escape', 'KeyF', 'ShiftRight']);
/** A controller's buttons: A grabs or delivers, B throws, START pauses. */
export const GUEST_BUTTONS: ReadonlySet<string> = new Set(['a', 'b', 'start']);

/** What the joining player's browser sends. */
export type GuestMessage =
  | { t: 'hello'; v: 1 }
  | { t: 'key'; code: string; down: boolean }
  | { t: 'move'; x: number; y: number; throttle: number; brake: number }
  | { t: 'pad'; button: string };
/** What the host sends back: whether Skanky is on the belt, for the joining page's banner. */
export type HostMessage = { t: 'turn'; owner: SceneOwner; text: string } | { t: 'bye' };

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
  if (m.t === 'turn' && (m.owner === 'termite' || m.owner === 'both') && typeof m.text === 'string') {
    return { t: 'turn', owner: m.owner, text: m.text.slice(0, 120) };
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

/** What the joining page's banner says. */
export function turnText(owner: SceneOwner, state: string): string {
  if (owner === 'both') return state === 'countdown' ? 'THE BELT · get ready, you are Skanky' : 'THE BELT · you are Skanky, player 2';
  return state === 'ended' ? 'SHIFT OVER · Termite starts the next one' : 'BETWEEN SHIFTS · Termite starts the endless shift';
}
