/**
 * The crew's animation clips: motion-captured Microsoft Rocketbox animations
 * (MIT, the same repository and commit as the avatars in rocketboxCast.ts),
 * authored for the very Biped skeleton the crew models carry, so they play on
 * the crew without retargeting. `tools/rocketbox` converts them into one GLB,
 * `CREW_CLIPS_URL`, holding a male and a female version of each role as
 * `m_<role>` and `f_<role>`. See docs/character-models.md.
 */
import { assetUrl } from './assetBase.ts';

export type ClipRole =
  | 'idle' | 'idleAlt' | 'walk' | 'walkSlow' | 'run'
  | 'cough' | 'cheer' | 'clap' | 'wave' | 'phone' | 'crouch' | 'dance' | 'sip' | 'shrug' | 'announce'
  | 'crouchIn' | 'crouchOut'
  | 'sitIdle' | 'sitIdleAlt' | 'sitLookAround' | 'lookAround' | 'scratchHead' | 'stretchArms' | 'angry'
  | 'turnLeft90' | 'turnLeft180' | 'turnRight90' | 'turnRight180'
  | 'pickupTable' | 'interact' | 'walkFormal' | 'talking' | 'push';

export interface ClipSource {
  role: ClipRole;
  /** `<folder>/<file>` under Assets/Animations/all_animations_max_motextr_<folder>, without `.max.fbx`. */
  male: string;
  female: string;
  /** Plays on repeat; the others hold their last frame until the state changes. */
  loop: boolean;
  /** A turn on the spot: the converter removes the root's own yaw so the game turns the character over the clip. */
  turn?: boolean;
}

export const CREW_CLIPS_URL = assetUrl('models/animations/crew-clips.glb');

export const ROCKETBOX_CLIPS: ClipSource[] = [
  { role: 'idle', male: 'static/m_idle_neutral_01', female: 'static/f_idle_neutral_01', loop: true },
  { role: 'idleAlt', male: 'static/m_idle_neutral_02', female: 'static/f_idle_neutral_02', loop: true },
  { role: 'walk', male: 'xy/m_walk_neutral', female: 'xy/f_walk_neutral', loop: true },
  { role: 'walkSlow', male: 'xy/m_walk_slow_01', female: 'xy/f_walk_slow_01', loop: true },
  { role: 'run', male: 'xy/m_run_neutral', female: 'xy/f_run_neutral', loop: true },
  { role: 'cough', male: 'static/m_idle_cough_01', female: 'static/f_idle_cough_01', loop: true },
  { role: 'cheer', male: 'static/m_cheer_01', female: 'static/f_cheer_01', loop: true },
  { role: 'clap', male: 'static/m_claphands_01', female: 'static/f_claphands_01', loop: true },
  { role: 'wave', male: 'static/m_wave_01', female: 'static/f_wave_01', loop: true },
  { role: 'phone', male: 'static/m_cell_phone_talk_01', female: 'xyz/f_cell_phone_talk_01', loop: true },
  { role: 'crouch', male: 'static/m_crouch_idle', female: 'static/f_crouch_idle', loop: true },
  // Going down to the floor and standing back up: the lift and the put-down play these once over the figure's reach.
  { role: 'crouchIn', male: 'xy/m_crouch_in', female: 'static/f_crouch_in', loop: false },
  { role: 'crouchOut', male: 'xy/m_crouch_out', female: 'static/f_crouch_out', loop: false },
  // Seated: two idles for the car seats, the couch and the booths, and a look around to break them.
  { role: 'sitIdle', male: 'static/m_sit_chair_idle_neutral_01', female: 'static/f_sit_chair_idle_neutral_01', loop: true },
  { role: 'sitIdleAlt', male: 'static/m_sit_chair_idle_relaxed_01', female: 'static/f_sit_chair_idle_relaxed_01', loop: true },
  { role: 'sitLookAround', male: 'static/m_sit_chair_idle_look_around', female: 'static/f_sit_chair_idle_look_around', loop: false },
  // Fidgets that break a standing idle every so often.
  { role: 'lookAround', male: 'static/m_idle_look_around_01', female: 'static/f_idle_look_around_01', loop: false },
  { role: 'scratchHead', male: 'static/m_idle_scratch_head_01', female: 'static/f_idle_scratch_head_01', loop: false },
  { role: 'stretchArms', male: 'static/m_idle_stretch_arms_01', female: 'static/f_idle_stretch_arms_01', loop: false },
  // Shouting and swearing.
  { role: 'angry', male: 'xyz/m_gestic_talk_angry_01', female: 'static/f_gestic_talk_angry_01', loop: true },
  // Turning on the spot; the converter strips the root's own turn so the game turns the character.
  { role: 'turnLeft90', male: 'xyz/m_turn_left_90', female: 'xyz/f_turn_left_90', loop: false, turn: true },
  { role: 'turnLeft180', male: 'xyz/m_turn_left_180', female: 'xyz/f_turn_left_180', loop: false, turn: true },
  { role: 'turnRight90', male: 'xyz/m_turn_right_90', female: 'xyz/f_turn_right_90', loop: false, turn: true },
  { role: 'turnRight180', male: 'xyz/m_turn_right_180', female: 'xyz/f_turn_right_180', loop: false, turn: true },
  { role: 'dance', male: 'static/m_dancing_cool', female: 'static/f_dancing_cool', loop: true },
  { role: 'sip', male: 'static/m_drink_drinking', female: 'static/f_drink_drinking', loop: true },
  { role: 'shrug', male: 'static/m_gestic_shrug_01', female: 'static/f_gestic_shrug_01', loop: true },
  { role: 'announce', male: 'static/m_gestic_presentation_left_01', female: 'static/f_gestic_presentation_left_01', loop: true },
];

/**
 * Natural ground speed of each locomotion clip in the clip's own units
 * (centimetres per second), measured by the converter from the root's travel
 * before it is removed; the game scales a clip's playback to the character's
 * real speed with it.
 */
export const CLIP_SPEEDS: Partial<Record<string, number>> = {
  m_walk: 140.2, f_walk: 129.5,
  m_walkSlow: 82.1, f_walkSlow: 88.7,
  m_run: 307.5, f_run: 315.7,
  // The Quaternius walks, measured by tools/rocketbox/ual.js from the pack's root-motion copy, in the crew's units.
  m_walkFormal: 93.4, f_walkFormal: 97.2,
  m_push: 28.7, f_push: 29.9,
};

/**
 * Where each one-shot clip's motion lies, in seconds from its start to its end,
 * measured from the root's height track: the crouch clips stand still before
 * going down and sit still after, and the lift plays only the movement.
 */
export const CLIP_SPANS: Partial<Record<string, [number, number]>> = {
  m_crouchIn: [1.35, 3.0], f_crouchIn: [0.25, 1.65],
  m_crouchOut: [1.0, 2.4], f_crouchOut: [0.2, 1.5],
};

/**
 * Clips retargeted from Quaternius's Universal Animation Library (CC0; the free
 * Standard pack, a manual download from quaternius.itch.io) onto the crew's
 * skeleton by `tools/rocketbox/ual.js`, kept in their own GLB beside the
 * Rocketbox library: lifting from waist height, pressing a button, a manager's
 * walk, gesturing while talking and pushing. `clip` names the pack's clip;
 * `speed` asks the converter to measure its ground speed from the pack's
 * root-motion copy.
 */
export interface UalClipSource { role: ClipRole; clip: string; loop: boolean; speed?: boolean }
export const UAL_CLIPS_URL = assetUrl('models/animations/crew-clips-ual.glb');
export const UAL_CLIPS: UalClipSource[] = [
  { role: 'pickupTable', clip: 'PickUp_Table', loop: false },
  { role: 'interact', clip: 'Interact', loop: false },
  { role: 'walkFormal', clip: 'Walk_Formal_Loop', loop: true, speed: true },
  { role: 'talking', clip: 'Idle_Talking_Loop', loop: true },
  { role: 'push', clip: 'Push_Loop', loop: true, speed: true },
];

/** The clip name in the GLB for a role and a body. */
export const clipName = (role: ClipRole, female: boolean): string => `${female ? 'f' : 'm'}_${role}`;
