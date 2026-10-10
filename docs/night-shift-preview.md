# Night Shift / Depot 07

This is one playable section for direction review, not a replacement of the
full game or a release. Termite, Skanky, the warehouse crew, special parcels and
adaptations of the original comic incidents are part of this preview itself.
The original scene and its randomized event timing also remain accessible
from the briefing and at `?mode=classic`. The repository remains a private 0.0.0
snapshot.

## Why this direction

The original's strongest decision is when to switch between workers while
freight keeps moving. Its character comes from the eccentric coworkers, strange
freight and specific workplace jokes interrupting that job. Both are essential.
The first art pass lost too much of that personality. The second restoration
inventories the actual original source and restores its specific references
inside the new scene; classic-mode access alone does not count as parity.
The preview preserves the switching decision and the three
route types, heavy carries, temporary belt stops, and recovery.

The original playthrough exposed several readability problems: movement keys
were not taught; parcel names were more prominent than their routing; many
decorative trucks looked like valid destinations; and tiny workers crossed a
large floor before reaching the first parcel. Layers of dark brown, light halos,
inconsistent shadows, and unrelated shape styles obscured the play lane.

The new scene uses a restrained midnight freight palette, a consistent shallow
overhead view, illustrated steel and timber, kraft parcels, and warm task lights.
Route letters accompany cyan, sage, and amber accents. Art and functional
affordances share the same language: lit approach bays, contact shadows,
selection brackets, and a short dotted delivery guide.

## The warehouse's personality

The resident crew has recognizable silhouettes and props: Hussan's phone, AJ's
barefoot massage station, Ben's shoulder demon, Bannerman's LEGO, little Fruit
Loop, Doris's cigarette, Brian's stink and Donna's Warcraft monitor. Skanky keeps
the long brown hair and red shirt; Termite keeps the blue shirt and yellow hat.
Kylie wants her TIMMY HORTANS, Vic gets a tune-up, John objects to stacked boxes,
Shan announces the United Way prize and complains when the belt stops, and Ralph
has three sets of triplets to get back to. The original profanity and spellings
are preserved. Ben's robbery / dodge-training / demon / Paula incident plays as
a short sequence in the outer loading bay.

The freight sequence guarantees MALLWOOD RD EAST, GOJI BERRIES, LIVE LOBSTERS,
LE DUCK, MAKEUP LOTION, MESA BOOGIE, PANCHETTERS and SMALL ATV
during a surviving shift. These have different editable artwork, including
moving lobster claws, lotion that breaks and spills during transport, and
Mallwood's curry-colored stink. Generic envelopes, small boxes, parcels, big
boxes and long boxes also have distinct shapes. The nearby-parcel hint
shows their full names while the route letter remains readable on each object.
Brian's "SENDING 5 DOWN" is an actual five-parcel bulk burst, not just dialogue.

`DepotLife.ts` and `DepotRoutines.ts` stage scenes against simulation time. The
three-minute duration gives the jokes breathing room. Dialogue waits its turn
on each side of the warehouse instead of dropping or truncating a line. All
original coffee, rant, swear, cough, shot and clock-out variants remain reachable.
Pause freezes the cast, speech and set pieces with the belt. Comic action stays
in the outer bays and does not block worker movement.

THE SNAKES CELL is a separate belt prop: Hussan approaches, takes it, dances
with CELL and returns. Ralph waits for five actual bulk deliveries, then makes
five trips with attached cargo, fills his truck and drives away. Vic and Shan
use distinct physical stop/start buttons that control the same belt simulation.
The resident crew carries its own ambient parcels to personal trucks. Drivers
bring keys, engines produce continuing exhaust and coworkers cough. John walks
in, raises his arms, crouches and leaves. Ben's five comic impacts, X_X face,
demon dragging him through a portal, and Paula's response retain their sequence.

The Mesa offer freezes freight and accepts keyboard or touch choices. Leaving
keeps cargo and score. Stealing consumes the amp without awarding a delivery,
shows MESA AT HOME and the original bedroom with BULK RULES, PAYTMAN SUCKS,
NO REPEATS and BUILT THE BELT. The dream returns to this shift instead of
restarting it. The original source advertised a one-in-five Shan capture risk
but never called its capture path; the preview completes that unfinished risk.
This is a deliberate behavior change, not a claim of restoring working logic.

The [reference inventory](reference-parity.md) records source evidence, original
gaps and verification. Scheduling is adapted to the new warehouse. Original
reference identity, spelling, context and payoff are the acceptance criteria,
rather than reproducing the original random event ordering or sprite dimensions.

## Movement and rules

`ShiftModel.ts` owns the deterministic simulation. Belt parcels store an offset
from one absolute conveyor travel distance, which also drives the tread texture
and motor rotation. Speed changes and brakes cannot put parcel motion out of
phase with the belt. The scene smooths only the short pickup transfer; seated
parcels are rendered at their exact model position. No rigid-body physics is
needed for a sorting belt with intentional lane constraints.

Workers stay on their sides, normalize diagonal movement, and slow down under
load. Drops reject occupied space. Parcels can be returned to the belt and handed
to the other worker. Deliveries require an explicit action in a dock: a wrong
destination keeps the parcel and explains where it belongs. Correct deliveries
move into the bay with restrained animation and existing synthesized audio.

The first six parcels teach A, B, and C at six-second intervals. Flow increases
after 36 seconds. Brian announces a rush at 63 seconds: five heavy bulk parcels
arrive at 1.9-second intervals, then four-second intake resumes; the final rush
uses three-second intake after 126 seconds. Speed
ramps smoothly and brakes stop the scheduled intake as well as belt travel.
New freight stops at 180 seconds, with up to ten seconds of cleanup. Twenty-four
dispatches meets the target. Five simultaneous missed parcels fill the recovery
bay and end the shift. Original per-freight carrying penalties distinguish
lobsters, the amp and ATV from lighter boxes. Recovery earns half base points;
a parcel never adds the
same miss twice. The input, pause, mute, and results paths support repeat play.

## Verification and review boundary

`npm run build` checks strict TypeScript and the production bundle.
`npm run test:model` runs deterministic rule tests, including a full shift won
through movement and action inputs, plus source-derived reference checks.
`npm run test:browser` tests the original
game and the preview on desktop and touch, with no production test hooks.
The opening preview test completes naturally spawned A/B/C deliveries with real
keyboard input, then uses explicit synthetic fixtures for edge cases. The
reference browser suite steps through later story stages, checks the rendered
speech windows (not merely a log entry), and verifies keyboard/touch Mesa paths,
Ralph loading, physical stops, carry contact and crew/truck departures.

Comparison screenshots are local review artifacts and are not committed.
The preview should be reviewed for difficulty, character style, legibility, and
sound on a physical device before carrying this direction through the original
full shift. Automated browser checks do not establish that audio sounds good on
speakers, or that controls feel good on every touch device. No public deployment
or publication is part of this change.
