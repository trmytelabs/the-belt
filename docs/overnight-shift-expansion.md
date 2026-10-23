# The overnight shift expansion

This expansion turns one warehouse shift into a whole night: arrival outside UPS,
the morning scrum, the sort (with a mid-shift break and the drivers firing up
their trucks), Skanky's mall run in the five-ton, returning the truck, and home.
It extends the 3D depot. The original full shift (`?mode=classic`) is
unchanged.

Everything already in the depots is kept: the crew and their props, every
original line and reference, the A/B trucks, the shared **C · BULK** pile and
its rules, Ralph's five loads, Brian's five-to-bulk burst, Ben's robbery, the
Mesa choice and dream, Vic and Shan's buttons, United Way, the coughs and the
clock-out departures.

## The night, chapter by chapter

| Chapter | What happens | Where it lives |
| --- | --- | --- |
| Home (3D only) | Termite and Skanky decide: go in, or quit UPS. Quitting plays the night at home and ends the game; going in walks them to Skanky's car for a playable drive to the UPS yard. | `src/three/homeScript.ts` |
| Arrival | One of three openers, chosen at random (see below). | `StoryScript.ts` `OPENERS` |
| Morning scrum | The crew gathers at the head of the belt; Shan's three approved lines and the crew's two approved reactions. | `SCRUM` |
| Countdown | The original **3, 2, 1, SORT!** | unchanged |
| Shift | The existing shift, plus the new destinations, throwing and breakage. | `ShiftModel.ts` |
| Break | Once per shift, between 46 and 56 s of shift time: Tim Hortons or 7-Eleven at random, one of three approved exchanges. The shift, belt and every parcel freeze until the crew is back. The 3D night always goes to Tim Hortons and ends the break with the Timmies run (`coffeeRun.ts`). | `BREAK_SCENES`, `StoryModel.ts` |
| Drivers | From 153 s: drivers bring keys, one engine starts, its exhaust drifts onto the platform, loaders cough, the other trucks start one by one, Shan: "Belt's still moving." | `DRIVERS` |
| Clock-out | The existing celebration and truck departures. | unchanged |
| Assignment | Shan gives Skanky the mall run; Termite goes home. | `MALL_ASSIGNMENT` |
| To the mall | A short drive in the five-ton (a travel scene, not a driving game). | `DRIVE_TO_MALL` |
| Mall run | Playable: three cart runs, two stores each, six drops, six signatures. The 3D game adds a fourth run for BENTLEY, its missing box, mall security's questions and a chase. | `MallModel.ts`, `MallModel3D.ts` |
| Back to UPS | The drive back, then walk the keys to the KEY DROP. | `DRIVE_TO_UPS`, `KeyReturnModel` |
| Home | Skanky drives home at dawn; then the results. | `GO_HOME` |

Story scenes advance by themselves. **Space** (or a click, or NEXT) moves to
the next line; **Enter** (or SKIP SCENE) skips the scene; **Escape** pauses. A
skipped scene lands on its final staging and runs the same transitions, so
nothing is left uninitialized. NEXT never skips a line that has not been shown.

## The warehouse layout

The belt, both worker lanes, the bulk pile and the recovery tray stand on a
raised loading platform (1.1 m in 3D). Every truck backs against the platform
edge with its roll-up rear door open at deck height. Near the belt's end, two
stair flights descend outward from the left and right sides to the ground drops.
Bulk backs against the final warehouse wall; all stairs and floor drops remain
in front of it, with nothing behind that wall.
Workers cannot step off the platform anywhere else: from the lower floor the
only way up is the stairs. Walking speed is unchanged everywhere; the stairs
only make the route longer.

Each worker now has two trucks and a lower-floor drop:

| Letter | Destination | Worker | Where |
| --- | --- | --- | --- |
| A | HERES UR SOVICE | Termite | existing truck, now flush with the platform edge |
| D | DOWNTOWN *(provisional name)* | Termite | second truck row, before the bulk pile |
| T | TERMITE FLOOR DROP | Termite | lower floor, down the west stairs |
| B | PAYTMAN | Skanky | existing truck, now flush with the platform edge |
| E | EASTSIDE *(provisional name)* | Skanky | second truck row, before the bulk pile |
| S | SKANKY FLOOR DROP | Skanky | lower floor, down the east stairs |
| C | BULK | both | unchanged shared pile at the belt end |

Every destination shows its letter and name on the floor, on the truck and on
each parcel, so colour is never the only cue. Floor drops pile parcels in a
grid that leaves the painted name clear, with a tall sign above the pile.
Heavy freight never goes to the floor drops. The first six parcels still
teach A, B and C; D, E, T and S follow, each announced the first time it
appears. Names live in `ROUTE_INFO` in `ShiftModel.ts` and can be renamed there.

Layout changes made to fit this:

- The player trucks moved 24 px outward so their rear doors are flush with
  the platform edge, like the crew trucks. Their drop zones now reach the door
  (A and B are wider; they still accept the whole reachable lane).
- Ralph's five-ton now backs into the empty west bay ahead of the bulk pile
  instead of the east outer bay, which the new E truck row would have crossed.
  His five trips to the pile and his departure are unchanged.
- Paytman's fish tank occupies the matching empty east bay, clear of the stairs.
- The outer-bay crew climb short steps in the aisles between trucks to reach
  the platform for their freight trips.

## Throwing and breakage

Holding a parcel, press **F** (or THROW on touch) to throw it straight to its
own destination instead of walking it there. The arc and landing ring show where it
will land and the break risk.
Carrying is unchanged and never breaks anything.

- Heavy freight (bulk crates, the Mesa amp, the ATV, big and long boxes,
  Mallwood) must be carried. Light bulk freight can be thrown onto the pile.
- A throw must be within range and from the worker's own side; from the lower
  floor you cannot throw up onto the platform.
- A clean throw delivers with normal points and keeps the streak.
- A broken parcel earns no delivery credit and costs points **once**. It stays
  visibly crushed with a BROKEN tag for a few seconds and can never be picked
  up, delivered or penalized again. Shan walks over and yells (his reaction
  lines are provisional) while the belt keeps running.

Tuning (`THROWING` in `ShiftModel.ts`):

| Value | Default | Meaning |
| --- | --- | --- |
| `rangePx` | 300 (about 9.4 m) | Farthest throw |
| `breakChance.ordinary` | 0.15 | Break chance for ordinary freight |
| `breakChance.fragile` | 0.55 | Break chance for fragile freight |
| `fragileKinds` | makeup, duck, mesa, lobsters | The fragile list (a simple two-level distinction) |
| `breakPenalty` | 150 points | Charged once per broken parcel, never below zero |
| `gradeForgivenBreaks` | 1 | Breakages beyond this count as errors in the grade |
| `heavyThrowable` | false | Whether heavy freight can be thrown |

The makeup lotion's own leak on the belt is unchanged and is never penalized.

## Scoring and results

The warehouse score, grade thresholds and quotes are unchanged. Delivery points
stay at 100 for trucks and floor drops and 120 for bulk (`DELIVERY_POINTS`).
Breakages subtract their penalty and, after the first, count as grade errors,
so one accident cannot ruin a run but repeated ones lower the grade. The mall
run adds 50 points per signature (`MALL_RULES.pointsPerSignature`) to a
separate **night total**; it does not change the warehouse grade. The results
keep every existing category and add: deliveries per destination, clean
throws, breakages and their penalty, and the mall run (deliveries, signatures,
whether the five-ton was returned).

## The mall run

The mall is an original 3D approximation of a south Edmonton enclosed mall,
modelled on Southgate Centre (111 Street and 51 Avenue, by Whitemud Drive).
It is built entirely in code in `src/three/mall.ts`, with no real logos, store
branding or downloaded assets:

- A skylit barrel-vault concourse over two levels, with stone-clad columns, a
  cream terrazzo-style floor and a darker diagonal-tile centre runner.
- Six 3D storefronts with glazing, mullions, door jambs, fascias, lit name
  signs and store interiors (the game's parody stores keep their names).
- A food-court gallery upstairs, with original stall names, and shuttered shops
  on the other side.
- A railed centre-court atrium looking down on lower-level bleacher seating,
  a nod to the redeveloped former anchor's three-level atrium.
- The anchor portal at the east end, which is BENTLEY in the 3D game (dark
  wood, luggage on plinths and wall shelves), and a bench pod around a mall
  directory that maps this concourse.
- In 3D, staff doors in the south-east corner open onto a block-walled
  service hallway: 10 m south, then 31 m east outside the building (steel
  doors, a pallet of returns, a cleaning cart and stacked empties along it), to
  the mall security office (the guard's desk, a bank of CCTV screens, lost and
  found, a bench and a water cooler).
- The receiving dock where the five-ton backs in. Outside it are 111 Street,
  an LRT station with a train, the pedestrian overpass into the mall's upper
  level, spruce on the berm, and 51 Avenue and Whitemud Drive beyond.

The intro opens on two establishing shots, one from 111 Street and one down
the concourse. Gameplay then uses a cutaway: tall south-side walls, the upper
level on that side, roofs and door headers are hidden, leaving 1.1 m stubs with
dark caps. Ceilings and the skylight face down only, so they vanish from above.
Skanky, the cart and every doorway stay in view. Each store shows its run
status on a lit 3D board: on the fascia for north stores, and on an angled
window plaque for the cut-away south stores. At the owner's request, the 3D
destination is named Southgate Mall. The legacy versions retain their original
mall title.

Skanky's five-ton is backed up to the loading dock with six labelled store
bundles inside. The run order is shuffled each night (every shuffle is valid:
all stores are reachable and every store gets exactly one bundle).

1. Park the cart by the tailgate (**E** takes or releases its handle).
2. Take a bundle from the truck (**Space** beside its slot). Only this run's
   two stores can be taken; later ones say which run they belong to.
3. Load it onto the cart (**Space** beside the cart). The cart holds two.
4. Push the cart through the concourse, around the planter island, the
   centre-court atrium railing and the directory bench pod, to each store's
   doorway.
5. **Space** drops that store's boxes (only if they are on the cart), then
   **Space** again gets the signature. Nothing is credited twice.
6. Back at the truck, the next run's bundles become available.
7. After six signatures, bring the cart back to the truck and press **Space**
   at the tailgate. The run is not over at the last signature.

In the 3D game (the owner's requests, 2026-10-23), a fourth run is BENTLEY's
alone: its two loads fill the cart. Delivered, the clerk yells that a box is
missing and will not sign; the clerk has no idea where it is. Skanky freaks out
(a cartoon swear, no words) and sweats until the box is sorted. A beacon points
him to mall security's lost and found, through the staff doors and down the
long hallway, on foot (the cart cannot follow him through the staff doors).

The guard has the box, and asks three questions first, on a card answered with
1, 2 or 3 (a controller's A, B or Y, or a tap). They are about the night, and
everything needed is on screen: who the box is for, who Skanky delivers for,
how many boxes were on the BENTLEY order, what he is driving, which door he
came in by, and what mall this is. All right, and Skanky carries the box back
by hand; handed over, BENTLEY signs, and the cart goes back to the truck after
seven signatures.

One wrong answer and the guard keeps the box. Skanky can ask again (three new
questions), or grab it and run. On the chase Skanky runs a little faster than
he walks, and the guard follows his trail, catching up when he is far behind.
With a clear line he stops and aims: an amber band on the floor tracks Skanky,
turns red when the aim holds, and the shot follows a moment later along that
band. A sidestep once it is red is a miss. Walls, corners, the hallway's
clutter, the planters and the railings are cover. A hit slows Skanky for a
moment; three hits, or the guard's hand on his shoulder, and he is caught. With
the box, that puts it back on the desk and Skanky back at the counter, to ask
again or try again. Shoving the box at BENTLEY on the run signs it at once.
Then into the five-ton at the dock is a getaway (+100 on the night, the cart
left behind); caught after BENTLEY has signed, Skanky is marched out to the
five-ton (−100). The rush's music plays through the chase. In the 3D mall
Skanky also slides round the corner of anything he walks into, rather than
stopping dead. The legacy mall keeps its three runs.

At UPS, Skanky walks the keys to the **KEY DROP** by the dispatch door. Only
then does the trip home, and the results, follow.

## Review list: provisional copy

Approved lines are used verbatim: the scrum (Shan's three lines, "You've got to
be fucking kidding me.", "They just started!"), all six break exchanges, and
the drivers ("Could've waited five minutes.", "Belt's still moving."). The
following were written for review and are easy to change in `StoryScript.ts`:

- The three openers (below).
- Who says unattributed lines: Doris and Hussan in the scrum; Bannerman and the
  cashier at 7-Eleven; Kylie, Doris and Brian at Tim Hortons; AJ coughing at the
  drivers.
- Shan's breakage reactions (`SHAN_BREAKAGE_LINES`).
- The mall assignment, the drives, the mall intro, the store clerks, the key
  return and the trip home.
- The BENTLEY clerk's lines ("A BOX IS MISSING! I'M NOT SIGNING FOR A SHORT
  ORDER.", "NOT UNTIL ALL TWENTY ARE HERE.", "Finally. Signed." and, on the
  run, "WHAT IS GOING ON?! ...FINE. SIGNED."), and mall security's questions
  and lines (at the desk, on the chase, catching Skanky or seeing him off), in
  `main3d.ts` and `MallModel3D.ts`. Both are generic characters; Skanky has
  no new lines (his freak-out is a cartoon swear, "#@$%&!?").
- The new truck names DOWNTOWN and EASTSIDE, the mall SOUTHGATE MALL in 3D
  (MALLWOOD CENTRE in the legacy story) and its
  stores (built from the game's own references: TIMMY HORTANS, MESA MUSIC,
  LE DUCK, GOJI HUT, GLAMOUR LOTION, PANCHETTERS).

### Opener 1, "LOCKED OUT" (Shan is late) · 1:30 AM, shift started 1:00 AM

> *The UPS gate is chained shut. Cars idle outside with their lights on.*
> **SKANKY:** Half an hour. We could have slept in.
> **TERMITE:** You said be early. *(He does not look up from his hat.)*
> **DORIS:** Clock doesn't start till he shows. We're out here for free. *(Smoke out of her window.)*
> **HUSSAN:** He's not answering. Again. *(Holds up his phone.)*
> *Headlights sweep the lot. Shan pulls up to the gate.*
> **SHAN O'MAC:** Traffic.
> **SKANKY:** It's half past one in the morning.
> **SHAN O'MAC:** Lot of traffic. *(Unlocks the gate and swings it open.)*
> *Everyone files inside.*

### Opener 2, "RUNNING LATE" (Termite and Skanky are late) · 2:30 AM, shift started 2:00 AM

> *The gate is open and the lot is full. The belt is already humming inside.*
> *Skanky's car swings in and stops across two spaces.*
> **SKANKY:** Nobody counts the first half hour.
> **TERMITE:** Shan counts everything. *(They jog for the door. Termite catches his hat.)*
> **SKANKY:** Walk normal. Act like we've been here.
> **TERMITE:** We're in the parking lot.
> **VIC:** Shan's been asking where you are. *(Holding the door.)*
> **SKANKY:** Bathroom.
> **VIC:** Both of you?
> **TERMITE:** Big bathroom. *(They slip past him inside.)*

### Opener 3, "NOBODY HAS THE KEY" (Shan is late) · 2:47 AM, shift started 2:15 AM

> *The gate is still locked. Fruit Loop is asleep on his steering wheel.*
> **BRIAN:** Thirty-two minutes! *(Leans on his horn.)*
> **SKANKY:** Brian, rolling your window down made it worse.
> **TERMITE:** Are we getting paid for this?
> **SKANKY:** Nope.
> *Shan rolls up slowly with a large coffee.*
> **SHAN O'MAC:** What are you all doing out here?
> **SKANKY:** Waiting for you. You've got the key.
> *Shan pats every pocket, then finds the key.*
> **SHAN O'MAC:** Right. *(The gate rattles open.)*
> *Everyone files inside.*

## Decisions to review

- **United Way appears twice.** The scrum now has the approved announcement.
  The existing mid-shift moment (134 s: Shan's original line and the whole
  floor swearing with the original swear pool) is kept as a callback, so no
  original line is lost. It could be removed if one mention is preferred.
- **Drivers moved from 114 s to 153 s** so they arrive near the end, after the
  break and after United Way; the original four cough lines are kept around
  the two approved lines.
- **Shan's name** is shown as SHAN O'MAC everywhere in both depots. The Mesa
  text (`1 IN 5 SHAN O MAC CATCHES YOU BOTH`, `BUSTED BY SHAN O MAC`) is the
  original game's verbatim copy and is checked against the original source, so
  it keeps its original spelling; the classic mode is unchanged.
- **Gamepad.** None of the depots had gamepad support before this change, so
  there was none to preserve; every new interaction works with keyboard, mouse
  and the touch controls.
- **Brand names** (UPS, Tim Hortons, 7-Eleven) appear only as plain text signs,
  as the brief describes them; no logos are reproduced.

## Checks

- `npm run test:model` adds `tests/story-model.mjs`: destinations and zones,
  platform/stairs heights and walls, speed on stairs, floor piles, every throw
  rule, exactly-once breakage, grade forgiveness, pause mid-throw, story
  choices and once-only break, verbatim approved lines, cutscene skip/next, a
  full mall run with three reloads, mall anti-exploit cases, mall collision,
  and the key return.
- `tests/story-browser.mjs` plays the
  story through the real app with real keys: all three openers reach the scrum
  (stepped, skipped and unattended), the scrum lines in order, the countdown
  into play, all six break exchanges once each with freight preserved, F
  throws (clean, broken with Shan while the belt runs, no repeat penalty),
  carrying down and up the stairs to a floor pile, the full mall run with no
  early or duplicate credit, the key return, home, results and a clean restart.
- The existing suites now skip the two opening scenes with ENTER (or SKIP on
  touch) and hold the break out of their way; their assertions are otherwise
  unchanged except where the layout or timing above changed (truck bays,
  Ralph's bay, driver count and time, Shan's name, the sound-effect count).

What is not verified automatically: physical phones and tablets, audible sound
quality, and how the new story feels on replay. Those still need a hands-on
check.
