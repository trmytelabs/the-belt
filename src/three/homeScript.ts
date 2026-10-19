import type { StoryBeat, StoryScene } from '../game/slice/StoryScript';

/**
 * The 3D night's prologue at Termite and Skanky's place, before the arrival
 * scenes. Termite and Skanky decide whether to go in: going in leads to the
 * drive to UPS and the existing openers; quitting ends the night at home.
 * The legacy 2D depot and classic game never play these scenes.
 *
 * The owner set the story; the dialogue wording is PROVISIONAL.
 */
export interface HomeBeat extends StoryBeat {
  /** Moves the on-screen clock, so a night can pass inside one scene. */
  clock?: string;
  /** A 3D-only sound for this beat. */
  effect?: 'phone' | 'vomit' | 'can';
}

export interface HomeScene extends StoryScene {
  beats: readonly HomeBeat[];
}

export const HOME_DECISION: HomeScene = {
  id: 'home-decision', title: 'BEFORE THE SHIFT', location: 'house', clock: '12:20 AM',
  beats: [
    { cue: 'establish', direction: "Termite and Skanky's place. The shift starts in forty minutes.", ms: 3000 },
    { speaker: 'termite', line: 'Shoes on. We have to leave.', cue: 'termite-keys', direction: 'Termite stands by the door with his hat on.', ms: 2600 },
    { speaker: 'skanky', line: "I'm not feeling it tonight.", direction: 'Skanky does not get up off the couch.', ms: 2400 },
    { speaker: 'termite', line: "Shan's doing the scrum.", ms: 2000 },
    { speaker: 'skanky', line: "Shan's always doing the scrum.", ms: 2200 },
    { speaker: 'skanky', line: 'I bought a twelve-pack. Twilight Princess is right there.', cue: 'skanky-pitch', direction: 'Skanky holds up a Wii remote.', ms: 3200 },
    { direction: 'Termite looks at the door. Then at the Wii.', cue: 'tempted', ms: 2600 },
    { speaker: 'termite', line: 'We could just... not go.', ms: 2200 },
    { speaker: 'skanky', line: 'Ever.', cue: 'choose', ms: 1800 },
  ],
};

export const LEAVE_HOUSE: HomeScene = {
  id: 'leave-house', title: 'FINE. WE GO IN.', location: 'house', clock: '12:31 AM',
  beats: [
    { speaker: 'termite', line: "Get up. We're going.", cue: 'get-up', direction: 'Skanky drops the remote and gets off the couch.', ms: 2400 },
    { speaker: 'skanky', line: "Fine. I'm driving.", cue: 'keys', direction: 'Skanky grabs his car keys.', ms: 2200 },
    { direction: "They head out the door to Skanky's car.", cue: 'out', sound: 'door', caption: '[DOOR SLAMS]', ms: 3200 },
    { direction: 'Skanky starts the car.', cue: 'start-car', sound: 'engine', caption: '[ENGINE TURNS OVER]', ms: 2200 },
  ],
};

export const QUIT_NIGHT: HomeScene = {
  id: 'quit-night', title: 'WE QUIT', location: 'house', clock: '12:40 AM',
  beats: [
    { direction: 'Skanky cracks two cans. Termite drops onto the couch and grabs the other Wii remote.', cue: 'crack', effect: 'can', caption: '[CANS CRACK OPEN]', ms: 3000 },
    { speaker: 'skanky', line: 'To not working at UPS.', ms: 2200 },
    { direction: 'Twilight Princess loads up on the TV. The twelve-pack starts to empty.', cue: 'play', ms: 3000 },
    { speaker: 'termite', line: 'How do you get out of the wolf?', clock: '2:10 AM', ms: 2400 },
    { speaker: 'skanky', line: 'You stay the wolf. The wolf is good.', ms: 2400 },
    { direction: 'More cans. Another dungeon.', cue: 'drink', clock: '3:45 AM', ms: 2600 },
    { speaker: 'skanky', line: "I don't feel good.", cue: 'woozy', clock: '4:30 AM', ms: 2200 },
    { direction: 'Skanky leans over the side of the couch and throws up.', cue: 'vomit', effect: 'vomit', caption: '[RETCHING]', ms: 2800 },
    { speaker: 'termite', line: 'Not on the Wii.', ms: 1900 },
    { direction: 'The sun comes up. They are both asleep on the couch.', cue: 'morning', clock: '8:15 AM', ms: 3200 },
    { direction: "Termite's phone rings. The screen says SHAN O'MAC.", cue: 'ring', effect: 'phone', caption: '[PHONE RINGING]', ms: 3000 },
    { direction: 'Termite answers. Shan is already yelling.', cue: 'answer', ms: 2400 },
    { speaker: 'termite', line: 'We no longer work for UPS.', cue: 'quit-line', ms: 2600 },
    { direction: 'Termite hangs up and goes back to sleep.', cue: 'hang-up', ms: 2600 },
  ],
};

export const DECISION = {
  kicker: 'TERMITE & SKANKY · 12:24 AM',
  title: 'GO IN, OR QUIT UPS?',
  body: 'The shift starts at one. Skanky has a twelve-pack and Twilight Princess. Termite has the car keys.',
  go: 'GO IN',
  quit: 'QUIT UPS',
} as const;

export const QUIT_ENDING = {
  kicker: 'ENDING · THE WII NIGHT',
  title: 'WE NO LONGER WORK FOR UPS.',
  body: 'Termite and Skanky never made it to the belt. No scrum, no sort, no mall run. One very long game of Zelda.',
} as const;
