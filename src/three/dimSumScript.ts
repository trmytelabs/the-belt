import type { StoryScene } from '../game/slice/StoryScript';

/**
 * The 3D night's ending (the owner's, 2026-10-22): Skanky does not drive straight home. Vic rides with him to Cha
 * for Tea, and over a table of dim sum Vic tells him what he is worth. Vic's lines are the owner's own notes about
 * him; Skanky only reacts, in the directions. The shared GO_HOME scene (the classic game's) is left as it is.
 */

/** GO_HOME as the 3D night plays it: Vic climbs in, and the drive goes to Cha for Tea, not home. */
const HOME_3D: Record<string, Record<number, { direction?: string }>> = {
  'go-home': {
    0: { direction: 'Skanky drops into his own car. Vic climbs into the passenger seat. The sun is coming up over the lot.' },
    4: { direction: 'Skanky drives off. Not home: to Cha for Tea, with Vic.' },
  },
};

export function homeScene3d(scene: StoryScene): StoryScene {
  const changes = HOME_3D[scene.id];
  if (!changes) return scene;
  // Clocked out, not home: the drive home comes after breakfast.
  return { ...scene, title: 'CLOCKED OUT', beats: scene.beats.map((beat, index) => ({ ...beat, ...changes[index] })) };
}

/** Breakfast after the night shift, at Cha for Tea. */
export const CHA_FOR_TEA: StoryScene = {
  id: 'cha-for-tea', title: 'CHA FOR TEA', location: 'dimsum', clock: '6:55 AM',
  beats: [
    { direction: 'Cha for Tea. A round table, a lazy Susan, and more bamboo steamers than two people should ever order.', cue: 'table', ms: 3400 },
    { direction: 'Vic, in the same grimy work clothes as always, works his way through the har gow.', cue: 'eat', ms: 3000 },
    { speaker: 'vic', line: "I'm a millionaire, you know.", cue: 'millionaire', ms: 2300 },
    { speaker: 'vic', line: 'Worth tons of money. Tons.', ms: 2300 },
    { direction: "Skanky looks at the stains on Vic's sleeves.", cue: 'look', ms: 2400 },
    { speaker: 'vic', line: 'Got a Jag in storage. I drive it to Calgary.', cue: 'jag', ms: 3000 },
    { speaker: 'vic', line: 'I work nights at UPS for fun.', cue: 'fun', ms: 2700 },
    { direction: 'The lazy Susan goes round again. Another stack of steamers arrives.', cue: 'more', ms: 3000 },
    { direction: 'The sun is well up when Skanky finally drives home.', cue: 'leave', ms: 2600 },
  ],
};
