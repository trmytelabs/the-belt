/**
 * Every new story line and stage direction for the overnight shift, kept as
 * plain data so it can be edited without touching gameplay code.
 *
 * Approved lines (the scrum, both break locations, the drivers) are verbatim
 * from the owner's brief. Everything marked PROVISIONAL is placeholder copy
 * written for review: the three openers, Shan's breakage reactions, the mall
 * assignment, store clerks and the trip home. See
 * docs/overnight-shift-expansion.md for the review list.
 */

/** Speakers that can appear in story scenes. Existing cast keep their original names. */
export type StoryActor =
  | 'termite' | 'skanky' | 'shan' | 'hussan' | 'aj' | 'ben' | 'bannerman' | 'fruitloop' | 'doris'
  | 'brian' | 'donna' | 'kylie' | 'vic' | 'john' | 'cashier' | 'clerk';

/** The boss is Shan O'Mac. Use this constant wherever his name is shown. */
export const SHAN_NAME = "SHAN O'MAC";

export const SPEAKER_NAMES: Record<StoryActor, string> = {
  termite: 'TERMITE', skanky: 'SKANKY', shan: SHAN_NAME, hussan: 'HUSSAN', aj: 'AJ', ben: 'BEN',
  bannerman: 'BANNERMAN', fruitloop: 'FRUIT LOOP', doris: 'DORIS', brian: 'BRIAN', donna: 'DONNA',
  kylie: 'KYLIE', vic: 'VIC', john: 'JOHN RUSHTON', cashier: 'CASHIER', clerk: 'CLERK',
};

/**
 * One story beat. `line` is spoken by `speaker`; `direction` describes visible
 * action for subtitles (so nothing depends on sound alone); `cue` tells the
 * renderer what to stage; `sound` names a sound effect and `caption` its
 * subtitle. `ms` is how long the beat stays up before advancing on its own.
 */
export interface StoryBeat {
  speaker?: StoryActor;
  line?: string;
  direction?: string;
  cue?: string;
  sound?: 'engine' | 'cough' | 'horn' | 'gate' | 'door' | 'spill' | 'register' | 'truck' | 'sign';
  caption?: string;
  ms: number;
}

export type StoryLocation = 'lot' | 'depot' | 'store' | 'coffee' | 'road' | 'mall' | 'home';

export interface StoryScene {
  id: string;
  title: string;
  location: StoryLocation;
  /** On-screen clock, so the lateness joke reads. */
  clock?: string;
  beats: readonly StoryBeat[];
}

// ---------------------------------------------------------------------------
// SCENE 1: three randomized arrivals (PROVISIONAL dialogue).
// A = Shan is late and the gate is locked. B = Termite and Skanky are late.
// ---------------------------------------------------------------------------
export interface Opener extends StoryScene {
  situation: 'shan-late' | 'pair-late';
  startTime: string;
  arrivalTime: string;
}

export const OPENERS: readonly Opener[] = [
  {
    id: 'opener-1', title: 'LOCKED OUT', location: 'lot', situation: 'shan-late',
    startTime: '1:00 AM', arrivalTime: '1:30 AM', clock: '1:30 AM · SHIFT STARTED 1:00 AM',
    beats: [
      { cue: 'establish', direction: 'The UPS gate is chained shut. Cars idle outside with their lights on.', ms: 3000 },
      { speaker: 'skanky', line: 'Half an hour. We could have slept in.', cue: 'pair-in-car', ms: 2800 },
      { speaker: 'termite', line: 'You said be early.', direction: 'Termite does not look up from his hat.', ms: 2500 },
      { speaker: 'doris', line: "Clock doesn't start till he shows. We're out here for free.", direction: 'Doris blows smoke out of her window.', cue: 'doris-smoke', ms: 3200 },
      { speaker: 'hussan', line: "He's not answering. Again.", direction: 'Hussan holds up his phone.', cue: 'hussan-phone', ms: 2600 },
      { direction: 'Headlights sweep the lot. Shan pulls up to the gate.', cue: 'shan-arrives', sound: 'truck', caption: '[CAR PULLS UP]', ms: 2600 },
      { speaker: 'shan', line: 'Traffic.', cue: 'shan-at-gate', ms: 1800 },
      { speaker: 'skanky', line: "It's half past one in the morning.", ms: 2300 },
      { speaker: 'shan', line: 'Lot of traffic.', direction: 'Shan unlocks the gate and swings it open.', cue: 'gate-open', sound: 'gate', caption: '[GATE RATTLES OPEN]', ms: 2800 },
      { direction: 'Everyone files inside.', cue: 'walk-in', ms: 1800 },
    ],
  },
  {
    id: 'opener-2', title: 'RUNNING LATE', location: 'lot', situation: 'pair-late',
    startTime: '2:00 AM', arrivalTime: '2:30 AM', clock: '2:30 AM · SHIFT STARTED 2:00 AM',
    beats: [
      { cue: 'establish-open', direction: 'The gate is open and the lot is full. The belt is already humming inside.', ms: 2800 },
      { direction: "Skanky's car swings in and stops across two spaces.", cue: 'pair-park', sound: 'horn', caption: '[TIRES SQUEAL]', ms: 2400 },
      { speaker: 'skanky', line: 'Nobody counts the first half hour.', ms: 2300 },
      { speaker: 'termite', line: 'Shan counts everything.', cue: 'pair-run', direction: 'They jog for the door. Termite catches his hat.', ms: 2600 },
      { speaker: 'skanky', line: "Walk normal. Act like we've been here.", ms: 2500 },
      { speaker: 'termite', line: "We're in the parking lot.", ms: 2100 },
      { speaker: 'vic', line: "Shan's been asking where you are.", cue: 'vic-at-door', direction: 'Vic is holding the door.', ms: 2600 },
      { speaker: 'skanky', line: 'Bathroom.', ms: 1500 },
      { speaker: 'vic', line: 'Both of you?', ms: 1700 },
      { speaker: 'termite', line: 'Big bathroom.', direction: 'They slip past him inside.', cue: 'walk-in', ms: 2300 },
    ],
  },
  {
    id: 'opener-3', title: 'NOBODY HAS THE KEY', location: 'lot', situation: 'shan-late',
    startTime: '2:15 AM', arrivalTime: '2:47 AM', clock: '2:47 AM · SHIFT STARTED 2:15 AM',
    beats: [
      { cue: 'establish', direction: 'The gate is still locked. Fruit Loop is asleep on his steering wheel.', ms: 3000 },
      { speaker: 'brian', line: 'Thirty-two minutes!', direction: 'Brian leans on his horn.', cue: 'brian-honk', sound: 'horn', caption: '[HORN]', ms: 2400 },
      { speaker: 'skanky', line: 'Brian, rolling your window down made it worse.', cue: 'pair-in-car', ms: 2800 },
      { speaker: 'termite', line: 'Are we getting paid for this?', ms: 2200 },
      { speaker: 'skanky', line: 'Nope.', ms: 1400 },
      { direction: 'Shan rolls up slowly with a large coffee.', cue: 'shan-arrives', sound: 'truck', caption: '[CAR PULLS UP]', ms: 2600 },
      { speaker: 'shan', line: 'What are you all doing out here?', cue: 'shan-at-gate', ms: 2300 },
      { speaker: 'skanky', line: "Waiting for you. You've got the key.", ms: 2400 },
      { direction: 'Shan pats every pocket, then finds the key.', ms: 2000 },
      { speaker: 'shan', line: 'Right.', cue: 'gate-open', sound: 'gate', caption: '[GATE RATTLES OPEN]', ms: 2400 },
      { direction: 'Everyone files inside.', cue: 'walk-in', ms: 1800 },
    ],
  },
];

// ---------------------------------------------------------------------------
// SCENE 2: the morning scrum. Shan's three lines and both crew lines are approved.
// ---------------------------------------------------------------------------
export const SCRUM: StoryScene = {
  id: 'scrum', title: 'MORNING SCRUM', location: 'depot',
  beats: [
    { direction: 'The crew gathers at the head of the belt. Shan stands in the middle.', cue: 'gather', ms: 2600 },
    { speaker: 'shan', line: "We've had a complaint about broken makeup bottles. Stop throwing the packages.", cue: 'shan-complaint', ms: 4600 },
    { direction: 'Nobody makes eye contact. Brian scratches his neck.', cue: 'shrug', ms: 1800 },
    { speaker: 'shan', line: "Thanks to everyone who donated. We've got two United Way days to give out. Termite. Skanky.", cue: 'shan-united-way', ms: 5600 },
    { direction: 'A beat. Everyone turns to look at Termite and Skanky.', cue: 'everyone-turns', ms: 2200 },
    { speaker: 'doris', line: "You've got to be fucking kidding me.", cue: 'crew-furious', ms: 2700 },
    { speaker: 'hussan', line: 'They just started!', direction: 'Hussan throws his hands up. The crew mutters and swears.', cue: 'hands-up', ms: 2600 },
    { direction: 'Termite and Skanky trade an uncomfortable look, unsure whether to look pleased.', cue: 'pair-look', ms: 2400 },
    { speaker: 'shan', line: "Right. Let's get going.", direction: 'Shan talks over the complaints.', cue: 'shan-over', ms: 2600 },
    { direction: 'The crew heads to their stations.', cue: 'to-stations', ms: 1500 },
  ],
};

// ---------------------------------------------------------------------------
// SCENE 4: the random mid-shift break. All six exchanges are approved; the
// cashier's question and the short arrival beats are stage directions.
// ---------------------------------------------------------------------------
export type BreakPlace = '7eleven' | 'timhortons';

export const BREAK_SCENES: Record<BreakPlace, readonly StoryScene[]> = {
  '7eleven': [
    {
      id: '7eleven-1', title: 'BREAK · 7-ELEVEN', location: 'store',
      beats: [
        { direction: 'The crew piles chips, slushies and chocolate on the counter. Termite sets down a bag of apples.', cue: 'store-counter', sound: 'register', caption: '[REGISTER BEEPS]', ms: 3200 },
        { speaker: 'skanky', line: 'You buying lunch or feeding a horse?', ms: 2600 },
        { speaker: 'termite', line: 'Apples.', ms: 1500 },
        { speaker: 'skanky', line: "I can see that. I'm asking why.", ms: 2400 },
        { direction: 'Termite takes his bag.', cue: 'termite-bag', ms: 1500 },
        { speaker: 'termite', line: 'You coming?', cue: 'leave', ms: 2000 },
      ],
    },
    {
      id: '7eleven-2', title: 'BREAK · 7-ELEVEN', location: 'store',
      beats: [
        { direction: 'Junk food everywhere. Termite is buying apples.', cue: 'store-counter', sound: 'register', caption: '[REGISTER BEEPS]', ms: 2800 },
        { speaker: 'bannerman', line: "You're making us look bad.", ms: 2300 },
        { speaker: 'termite', line: 'You did that yourselves.', ms: 2200 },
        { direction: 'Skanky adds another chocolate bar to his purchases.', cue: 'skanky-chocolate', ms: 1800 },
        { speaker: 'skanky', line: 'There. Balanced it out.', cue: 'leave', ms: 2400 },
      ],
    },
    {
      id: '7eleven-3', title: 'BREAK · 7-ELEVEN', location: 'store',
      beats: [
        { direction: 'Junk food for the crew; apples for Termite.', cue: 'store-counter', sound: 'register', caption: '[REGISTER BEEPS]', ms: 2600 },
        { speaker: 'cashier', line: 'Separate receipts?', direction: 'The cashier asks whether they want separate receipts.', ms: 2200 },
        { speaker: 'skanky', line: "Yeah. Don't put his apples on mine.", ms: 2500 },
        { speaker: 'termite', line: 'Why?', ms: 1300 },
        { speaker: 'skanky', line: "I've got a reputation.", cue: 'leave', ms: 2300 },
      ],
    },
  ],
  timhortons: [
    {
      id: 'timhortons-1', title: 'BREAK · TIM HORTONS', location: 'coffee',
      beats: [
        { direction: 'A tray of coffees and a box of donuts on the hood of the car.', cue: 'coffee-tray', ms: 2600 },
        { speaker: 'kylie', line: "Whose is the double-double?", ms: 2200 },
        { direction: 'Three hands rise.', cue: 'three-hands', ms: 1800 },
        { speaker: 'kylie', line: 'Right. Helpful.', ms: 1900 },
        { direction: 'Termite opens the donut box, sees a bitten donut put back inside, and quietly closes it.', cue: 'donut-box', ms: 3400 },
      ],
    },
    {
      id: 'timhortons-2', title: 'BREAK · TIM HORTONS', location: 'coffee',
      beats: [
        { direction: 'Everyone is back in the car with coffee and a dozen donuts.', cue: 'in-car', ms: 2400 },
        { speaker: 'skanky', line: "There's eleven.", cue: 'count-donuts', ms: 1800 },
        { speaker: 'doris', line: 'Someone ate one.', ms: 1800 },
        { speaker: 'skanky', line: "We haven't left the parking lot.", ms: 2300 },
        { speaker: 'brian', line: 'And?', direction: 'From the back seat, through a mouthful.', cue: 'back-seat', ms: 2000 },
      ],
    },
    {
      id: 'timhortons-3', title: 'BREAK · TIM HORTONS', location: 'coffee',
      beats: [
        { direction: 'Coffee run. Skanky hands Termite a coffee.', cue: 'hand-coffee', ms: 2400 },
        { speaker: 'skanky', line: "Careful. Lid's loose.", ms: 1900 },
        { direction: "Coffee spills onto Termite's sleeve.", cue: 'spill', sound: 'spill', caption: '[SPLASH]', ms: 1800 },
        { speaker: 'termite', line: "You could've said that before handing it over.", ms: 2700 },
        { speaker: 'skanky', line: 'I did. You were already taking it.', ms: 2600 },
      ],
    },
  ],
};

export const BREAK_PLACES: readonly BreakPlace[] = ['7eleven', 'timhortons'];

// ---------------------------------------------------------------------------
// SCENE 6: drivers arrive. Two approved lines; the original cough pool stays.
// Times are shift milliseconds, after the United Way reaction has finished.
// ---------------------------------------------------------------------------
export const DRIVERS = {
  /** Drivers walk in with keys. */
  arriveAt: 153_000,
  /** The first engine. */
  firstEngineAt: 155_600,
  /** Each other truck starts this long after the previous one. */
  engineStaggerMs: 650,
  otherEnginesAt: 160_200,
  /** Approved: a nearby worker, coughing. */
  coughLine: { speaker: 'doris' as StoryActor, line: "Could've waited five minutes.", at: 158_400 },
  /** Approved: Shan, unmoved. */
  shanLine: { line: "Belt's still moving.", at: 165_400 },
  /** The original four cough lines, alternating Hussan and Doris, around the approved lines. */
  originalCoughAt: [157_000, 161_600, 163_300, 168_600] as readonly number[],
} as const;

// ---------------------------------------------------------------------------
// Shan's reaction when a thrown parcel breaks (PROVISIONAL, in his rant voice).
// ---------------------------------------------------------------------------
export const SHAN_BREAKAGE_LINES = [
  'WHAT DID I SAY\nTHIS MORNING?\nSTOP THROWING THEM!',
  "THAT'S COMING OUT OF\nYOUR UNITED WAY DAY",
  'THIS IS A SORT,\nNOT A JAVELIN TOSS',
  'ANOTHER ONE?!\nYOU WANT TO ANSWER\nTHE COMPLAINT EMAIL?',
  'CARRY IT. WITH YOUR\nHANDS. LIKE A PERSON.',
] as const;

// ---------------------------------------------------------------------------
// SCENES 7-13: the mall run, the drive back and home (PROVISIONAL).
// ---------------------------------------------------------------------------
export const MALL_ASSIGNMENT: StoryScene = {
  id: 'mall-assignment', title: 'ONE MORE THING', location: 'depot',
  beats: [
    { direction: 'The last truck pulls out. Shan catches Skanky before he reaches the door.', cue: 'shan-catches', ms: 2400 },
    { speaker: 'shan', line: "Skanky. Mall run. The five-ton's loaded.", ms: 2600 },
    { speaker: 'skanky', line: 'I just did a whole shift.', ms: 2100 },
    { speaker: 'shan', line: "And now you're doing a mall.", ms: 2200 },
    { speaker: 'termite', line: 'See you tomorrow.', direction: 'Termite keeps walking.', cue: 'termite-leaves', ms: 2000 },
    { speaker: 'skanky', line: 'Traitor.', ms: 1500 },
  ],
};

export const DRIVE_TO_MALL: StoryScene = {
  id: 'drive-to-mall', title: 'UPS → MALLWOOD CENTRE', location: 'road', clock: '5:05 AM',
  beats: [
    { direction: 'Skanky pulls the five-ton out of the UPS yard.', cue: 'depart', sound: 'engine', caption: '[FIVE-TON ENGINE]', ms: 2600 },
    { speaker: 'skanky', line: 'No air conditioning. No radio. Love it.', ms: 2600 },
    { direction: 'Empty roads, orange streetlights, one red light he runs anyway.', cue: 'cruise', ms: 2600 },
    { direction: 'The five-ton backs up to the mall loading dock.', cue: 'arrive', sound: 'truck', caption: '[BACKUP BEEPER]', ms: 2400 },
  ],
};

export const MALL_INTRO: StoryScene = {
  id: 'mall-intro', title: 'MALLWOOD CENTRE', location: 'mall', clock: '5:20 AM',
  beats: [
    { direction: 'The freight stays in the truck. A little cart sits by the tailgate.', cue: 'mall-establish', ms: 2600 },
    { speaker: 'skanky', line: 'Six stores. One cart. Three trips. Great.', ms: 2400 },
  ],
};

export const DRIVE_TO_UPS: StoryScene = {
  id: 'drive-to-ups', title: 'MALLWOOD CENTRE → UPS', location: 'road', clock: '6:10 AM',
  beats: [
    { direction: 'Six signatures. Skanky drives the empty five-ton back to UPS.', cue: 'depart', sound: 'engine', caption: '[FIVE-TON ENGINE]', ms: 2600 },
    { speaker: 'skanky', line: 'If Shan has one more thing, I am quitting.', ms: 2600 },
    { direction: 'The sky is starting to go grey.', cue: 'cruise', ms: 2200 },
    { direction: 'The five-ton pulls back into the UPS yard.', cue: 'arrive', sound: 'truck', caption: '[AIR BRAKES]', ms: 2200 },
  ],
};

export const GO_HOME: StoryScene = {
  id: 'go-home', title: 'HOME', location: 'home', clock: '6:31 AM',
  beats: [
    { direction: 'Skanky drops into his own car. The sun is coming up over the lot.', cue: 'car', ms: 2600 },
    { direction: 'His phone buzzes. A text from Termite.', cue: 'phone', ms: 2000 },
    { speaker: 'termite', line: 'You alive?', direction: '(text message)', ms: 1800 },
    { speaker: 'skanky', line: 'Barely. Same time tomorrow.', ms: 2400 },
    { direction: 'Skanky drives home.', cue: 'drive-home', sound: 'engine', caption: '[ENGINE]', ms: 2400 },
  ],
};

/** Mall stores, from the game's own freight references. PROVISIONAL names. */
export const MALL_STORES = [
  { id: 'timmy', name: 'TIMMY HORTANS', clerkLine: "Is that cups? We've been out of cups since Tuesday." },
  { id: 'mesa', name: 'MESA MUSIC', clerkLine: "Careful, that's an amp." },
  { id: 'duck', name: 'LE DUCK', clerkLine: 'Is it... the duck?' },
  { id: 'goji', name: 'GOJI HUT', clerkLine: 'Finally. Berries.' },
  { id: 'glamour', name: 'GLAMOUR LOTION', clerkLine: 'If one bottle is broken, I am calling UPS.' },
  { id: 'panchetters', name: 'PANCHETTERS', clerkLine: 'Just leave it by the panchetters.' },
] as const;

export const KEY_RETURN_LINES = {
  prompt: 'Return the five-ton: walk the keys to the KEY DROP by the dispatch door.',
  done: 'Keys in the drop. The five-ton is back.',
};
