/**
 * The crew's animation clips: motion-captured Microsoft Rocketbox animations
 * (MIT, the same repository and commit as the avatars in rocketboxCast.ts),
 * authored for the very Biped skeleton the crew models carry, so they play on
 * the crew without retargeting. `tools/rocketbox` converts them into one GLB,
 * `CREW_CLIPS_URL`, holding a male and a female version of each role as
 * `m_<role>` and `f_<role>`. See docs/character-models.md.
 */
export type ClipRole =
  | 'idle' | 'idleAlt' | 'walk' | 'walkSlow' | 'run'
  | 'cough' | 'cheer' | 'clap' | 'wave' | 'phone' | 'crouch' | 'dance' | 'sip' | 'shrug' | 'announce';

export interface ClipSource {
  role: ClipRole;
  /** `<folder>/<file>` under Assets/Animations/all_animations_max_motextr_<folder>, without `.max.fbx`. */
  male: string;
  female: string;
  /** Plays on repeat; the others hold their last frame until the state changes. */
  loop: boolean;
}

export const CREW_CLIPS_URL = '/models/animations/crew-clips.glb';

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
};

/** The clip name in the GLB for a role and a body. */
export const clipName = (role: ClipRole, female: boolean): string => `${female ? 'f' : 'm'}_${role}`;
