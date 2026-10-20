import type { StoryScene } from '../game/slice/StoryScript';

/**
 * The 3D night's Tim Hortons breaks happen inside the restaurant, at a booth
 * and the pickup counter, instead of in the parking lot. Only the wording
 * that put the crew in or on the car changes; every other line stays as
 * approved. The shared script, and the 2D depot that plays it, keep the lot.
 */
const INSIDE: Record<string, Record<number, { line?: string; direction?: string }>> = {
  'timhortons-1': { 0: { direction: 'Inside Tim Hortons: a tray of coffees and a box of donuts on the booth table.' } },
  'timhortons-2': {
    0: { direction: 'Everyone is squeezed into a booth with coffee and a dozen donuts.' },
    3: { line: "We haven't left the counter." },
    4: { direction: 'From the next booth, through a mouthful.' },
  },
  'timhortons-3': { 0: { direction: 'At the pickup counter, Skanky hands Termite a coffee.' } },
};

/** The scene as the 3D night plays it. */
export function breakScene3d(scene: StoryScene): StoryScene {
  const changes = INSIDE[scene.id];
  if (!changes) return scene;
  return { ...scene, beats: scene.beats.map((beat, index) => ({ ...beat, ...changes[index] })) };
}
