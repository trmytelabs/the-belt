/**
 * Controller support for the 3D game, for pads with the browser's standard
 * layout (Xbox-style names): the left stick or the d-pad moves and steers,
 * the triggers are the five-ton's pedals, and the face buttons, Back and Start
 * press the same keys the keyboard does, chosen by what is on screen.
 */

/** A push of the stick or d-pad, for stepping through menus. */
export type PadDirection = 'up' | 'down' | 'left' | 'right';
export type PadButton = 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'back' | 'start' | PadDirection;

/** Standard-mapping button indexes. */
const BUTTON_INDEX: Readonly<Record<Exclude<PadButton, PadDirection>, number>> = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, back: 8, start: 9 };
const DPAD = { up: 12, down: 13, left: 14, right: 15 } as const;
const TRIGGER = { left: 6, right: 7 } as const;

/** The part of the browser's Gamepad the game reads, and its rumble where the pad has one. */
export interface PadLike {
  connected: boolean;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
  vibrationActuator?: { playEffect?: (type: 'dual-rumble', params: { duration: number; strongMagnitude: number; weakMagnitude: number }) => Promise<unknown> } | null;
}

export interface PadFrame {
  connected: boolean;
  /** Stick or d-pad, each axis -1 to 1 (x right, y down), as the keyboard's WASD. */
  move: { x: number; y: number };
  /** Right and left triggers, 0 to 1. */
  throttle: number;
  brake: number;
  /** Buttons pressed since the last poll; a push of the stick or d-pad past `NAV_THRESHOLD` presses its direction. */
  pressed: PadButton[];
}

/** Stick travel ignored around the centre, so a resting stick never drifts the worker. */
export const STICK_DEADZONE = 0.2;
/** How far the stick or d-pad must go (after the dead zone) to count as one step through a menu. */
export const NAV_THRESHOLD = 0.6;

export const IDLE_PAD: Readonly<PadFrame> = { connected: false, move: { x: 0, y: 0 }, throttle: 0, brake: 0, pressed: [] };

const clamp = (value: number): number => Math.max(-1, Math.min(1, value));

export class GamepadInput {
  private readonly held = new Set<PadButton>();
  private connected = false;
  private pad: PadLike | null = null;

  /** A short rumble on the pad in use, where it has one: `strength` 0 to 1, for `ms`. Never throws. */
  public rumble(strength: number, ms: number): void {
    const level = Math.max(0, Math.min(1, strength));
    try {
      void this.pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: level, weakMagnitude: Math.min(1, level * 1.2) })?.catch(() => {});
    } catch { /* a pad without rumble, or one that went away */ }
  }

  /** Reads the first connected pad. A button already held when a pad appears never counts as a press. */
  public poll(pads: readonly (PadLike | null | undefined)[]): PadFrame {
    const pad = pads.find((candidate): candidate is PadLike => !!candidate && candidate.connected);
    this.pad = pad ?? null;
    if (!pad) {
      this.held.clear();
      this.connected = false;
      return { ...IDLE_PAD, move: { x: 0, y: 0 }, pressed: [] };
    }
    const fresh = !this.connected;
    this.connected = true;
    const down = (index: number): boolean => pad.buttons[index]?.pressed ?? false;
    const ax = Number(pad.axes[0]) || 0, ay = Number(pad.axes[1]) || 0, length = Math.hypot(ax, ay);
    // A radial dead zone, rescaled so the stick still reaches full speed at its rim.
    const scale = length <= STICK_DEADZONE ? 0 : Math.min(1, (length - STICK_DEADZONE) / (1 - STICK_DEADZONE)) / length;
    const move = {
      x: clamp(ax * scale + (down(DPAD.right) ? 1 : 0) - (down(DPAD.left) ? 1 : 0)),
      y: clamp(ay * scale + (down(DPAD.down) ? 1 : 0) - (down(DPAD.up) ? 1 : 0)),
    };
    const pressed: PadButton[] = [];
    const states: [PadButton, boolean][] = [
      ...(Object.entries(BUTTON_INDEX) as [PadButton, number][]).map(([name, index]): [PadButton, boolean] => [name, down(index)]),
      ['up', move.y <= -NAV_THRESHOLD], ['down', move.y >= NAV_THRESHOLD], ['left', move.x <= -NAV_THRESHOLD], ['right', move.x >= NAV_THRESHOLD],
    ];
    for (const [name, isDown] of states) {
      if (!isDown) { this.held.delete(name); continue; }
      if (!this.held.has(name) && !fresh) pressed.push(name);
      this.held.add(name);
    }
    const value = (index: number): number => Math.max(0, Math.min(1, pad.buttons[index]?.value ?? 0));
    return { connected: true, move, throttle: value(TRIGGER.right), brake: value(TRIGGER.left), pressed };
  }
}

/**
 * The key a button presses on the screen in `state` (the app's state), or null.
 * Start always pauses and resumes; A is the confirm or action button; B throws on
 * the belt and skips a story scene; X stops the belt or moves the mall cart; Y
 * switches workers; Back is the overview or the cab view; on the briefing Y and X
 * pick the peak night and the endless shift, and the bumpers step through
 * tonight's perks. The four directions press no key: they move, and on a panel
 * the game steps through its buttons with them.
 */
export function padKey(state: string, button: PadButton): string | null {
  if (button === 'start') return 'Escape';
  switch (state) {
    case 'decision': return button === 'a' ? 'KeyG' : button === 'b' ? 'KeyQ' : null;
    // The Mesa: Y steals it, as the Y key does; A or B leaves it.
    case 'mesa': return button === 'y' ? 'KeyY' : button === 'a' || button === 'b' ? 'KeyN' : null;
    case 'briefing': return ({ a: 'Enter', y: 'KeyP', x: 'KeyN', lb: 'BracketLeft', rb: 'BracketRight' } as Partial<Record<PadButton, string>>)[button] ?? null;
    case 'ended': case 'paused': case 'interlude': return button === 'a' ? 'Enter' : null;
    case 'story': return button === 'a' ? 'Space' : button === 'b' ? 'Enter' : null;
    case 'driving': return button === 'a' ? 'Space' : button === 'back' || button === 'rb' ? 'KeyV' : null;
    case 'mall': return button === 'a' ? 'Space' : button === 'x' ? 'KeyE' : null;
    case 'lot': return button === 'a' ? 'Space' : null;
    case 'playing': return ({ a: 'Space', b: 'KeyF', x: 'KeyE', y: 'Tab', back: 'KeyV' } as Partial<Record<PadButton, string>>)[button] ?? null;
    default: return null;
  }
}
