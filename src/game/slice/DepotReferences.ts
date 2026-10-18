/** Verbatim game-specific text from the original NPC/event/shift sources.
 * Keep intentional spellings and profanity. See docs/reference-parity.md.
 */
export const KYLIE_QUOTES = [
  'WHERE IS MY\nTIMMY HORTANS', 'MY TIMMY\nHORTANS?!', 'WHO TOOK MY\nTIMMY HORTANS',
] as const;

export const SHAN_RANTS = [
  '!@#%!', 'WHO STOPPED THE\n#@%! BELT?!', 'BACK TO #@%!\nWORK!', '#@%! AGAIN?!',
  "I'D RATHER BE\nDIGGING GRAVES", 'I WONDER HOW MUCH\nA 50 FOOTER\nWOULD SELL FOR', 'UGH MY ULCERS\nAGAIN!',
] as const;

export const WORKER_SWEARS = [
  'WHAT THE FUCK', 'BULLSHIT', 'YOU GOTTA BE\nFUCKING KIDDING', 'FUCK THIS',
  'ARE YOU\nFUCKING SERIOUS', 'SON OF A BITCH',
] as const;

export const COUGH_LINES = ['COUGH!', 'HACK!', 'COUGH COUGH!', 'UGH, EXHAUST!'] as const;
export const SHOT_WORDS = ['BANG!', 'BANG!', 'POW!', 'BANG BANG!', 'BANG!'] as const;
export const CLOCK_OUT_LINES = [
  'WE MADE IT!', 'GO HOME!', 'CLOCK OUT!', 'SHIFT DONE!', 'TRUCKS OUT!',
  "BELT'S DEAD!", 'WE SURVIVED!', 'LAST TRUCK OUT!',
] as const;

export const MESA = {
  spotted: 'VIC SPOTTED THE MESA', title: 'VIC WANTS THE MESA',
  offer: "STEAL IT?\nI'LL TOSS IT IN\nTHE SUV.",
  body: "Vic says he'll throw it in the back of his SUV.\n1 IN 5 SHAN O MAC CATCHES YOU BOTH.\nIf he does, the run ends.",
  leave: 'MESA STAYS ON THE BELT', thought: 'MESA\nAT HOME',
  caught: 'BUSTED BY SHAN O MAC',
  caughtDetail: 'Shan caught you and Vic trying to load the Mesa into the SUV.',
} as const;
