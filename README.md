# The Belt

The Belt is a browser game built with Three.js, Phaser, TypeScript and Vite.

Active development targets **the 3D depot only**. The 2D depot and classic game
are retained as legacy versions; new gameplay requests apply to 3D unless the
owner explicitly requests another version.
Players switch between workers, pick up packages and sort them to the appropriate
dock. The game includes keyboard, mouse and touch controls.

This private repository contains the current development snapshot (`0.1.0`). It
has a working production build and a browser smoke suite, with no published
release. Review playability in the browser when changing game behavior.

## Run locally

Install Node.js 24 (with npm), then run from the repository root:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The default entry is the **3D depot**: the
night shift in a lit Three.js warehouse, with every original reference event and
speech bubbles anchored to whoever is speaking. On touch screens it shows a
movement stick and GRAB / DELIVER, SWITCH, BRAKE, VIEW and PAUSE buttons. It needs
WebGL; without it the page links to the 2D depot. See
[the 3D depot](docs/3d-preview.md). The crew uses 23 rigged Microsoft Rocketbox
characters, with procedural figures on software graphics. Their animation,
props and provenance are covered in [character models](docs/character-models.md).
Arms stay beside the torso with natural elbow bends during walking, carrying
and gestures. Cars use two detailed sedan models, and the devil uses an animated
horned, winged model. These compact CC0 models retain the existing story paths
and have procedural fallbacks; see [prop sources](public/models/PROP-SOURCES.md).
Kylie is a short Asian man; AJ is a clothed bald man with fitted glasses.
The 3D soundtrack is a recorded chill lo-fi instrumental made in Google Flow
Music, with smooth loop transitions, quieter package foley and music ducking
under dialogue. It starts with START THE NIGHT, during the arrival scene.
Package rustles, impacts, mechanical latches and tablet clicks use small local
recordings, with subtle variation and controlled volume. M mutes both music and
effects. Source details are in [music sources](public/audio/MUSIC-SOURCES.md)
and [foley sources](public/audio/FOLEY-SOURCES.md).

The legacy **2D Night Shift / Depot 07** is at `?mode=2d`. The current 3D game
plays a whole night: one of three random
arrivals outside the locked gate, Shan's morning scrum, the warehouse shift
with a Tim Hortons or 7-Eleven break, then Skanky's mall run in the five-ton
(a 3D mall inspired by Edmonton's Southgate Centre),
returning the truck and going home. Story scenes advance by themselves; Space
shows the next line and Enter skips the scene. See
[the overnight shift expansion](docs/overnight-shift-expansion.md).

The shift is one polished three-minute warehouse section, followed by
up to ten seconds to clear remaining freight. Press Enter or tap **START THE NIGHT**. Dispatch
42 parcels and keep the recovery backlog below five. The original **3, 2, 1,
SORT!** countdown starts the shift.

- WASD / arrows move; Tab or right-click switches workers.
- Space or left-click grabs, loads inside a truck, delivers at a floor drop,
  or puts a parcel down. Carry truck freight through its open rear door.
  The parcel Space will grab has a bright halo and a GRAB prompt. Empty button
  presses stay quiet; incorrect deliveries still sound an error and cost points.
- Inside a truck the roof turns transparent. Face a shelf and load near where
  you stand; the actual parcels remain on the shelves. Full shelves overflow
  through the rear opening. The roof returns when you leave.
- Rear doorways gently guide an off-centre approach into the aisle. A soft
  circular cutaway follows people beside trucks so the bodies cannot hide them
  or their packages; the rest of each truck stays solid.
- F (or THROW) throws toward the nearest drop. At the top of the stairs it
  throws to the lower-floor drop with a 30% break chance. A break earns nothing,
  costs up to 150 points once, and Shan runs over yelling.
- The raised platform ends at the back wall, behind both player truck rows.
  Stairs descend outward to the left and right, with tidy pallet drops below.
- Read parcel street addresses and compare them with the ranges painted on the
  floor beside each truck. Termite covers Mill Woods (10–49 ST), Downtown (90–109 ST) and the
  Westmount floor drop (110–129 ST). Skanky covers Bonnie Doon (50–89 ST),
  West End (130–169 ST) and the Northside floor drop (170–199 ST). Oversize
  freight goes to shared bulk. These are synthetic game districts.
- The other worker automatically loads their own address ranges. Only the worker
  you control collects bulk. Random everyday freight mixes with the original
  joke parcels. Arrivals allow more breathing room: every 4.8 seconds initially,
  3.2 seconds in flow and 2.4 seconds in rush.
- Read street numbers painted on the floor. Floating location signs are removed. There are
  no safe-zone outlines or aiming guides. A wrong drop costs up to 10 points.
  See [address sorting and loading](docs/address-sorting.md).
- E brakes the belt for two seconds, with an eight-second cooldown.
- Escape pauses; M toggles sound. Losing focus pauses the preview automatically.
- The closer camera follows your worker up and down the belt and reframes when
  you switch workers. V, or the Overview button, shows the whole warehouse.
- Walk up past the first truck row to see the receiving dock: two incoming
  semis, unloaders and a smelly dockhand feeding the next real parcel onto the belt.
- Original named crew bays are preserved above the two player truck rows.
  Rows are spread apart, with crew events and props between the trucks.
  Incoming articulated semis occupy the receiving area above those rows.
- After the morning scrum, the same crew walk to their stations. They stay
  mostly on the platform, collecting and loading parcels on short work cycles;
  the original gags remain brief interruptions. Shan stays visible between reactions.
- John Rushton walks both sides of the belt, crossing around its head and stopping
  for occasional sets of squats. Shan O'Mack and Vic patrol the loading lanes
  between their existing scenes. Squeezing past them briefly slows your worker;
  there is room to step around, and patrols stay clear of the stairs.
- Pick up missed freight near the belt exit to recover it for half base points.
- Recovered freight counts as dispatched for the 3D grade. S starts at 95%;
  freight left behind, wrong drops and excess breakages lower the percentage.
  Results show the calculation. Recovery still reduces points and breaks a streak.
- Approaching either stair flight gently aligns the worker with its clear
  centre, including while carrying bulky freight.
- With one minute left, the trucks start their engines, illuminate headlights
  and emit exhaust. Loaders occasionally cough while continuing their work.
- Lunch starts with a whistle and a short **15 MINUTE LUNCH BREAK!** alert,
  still inside the warehouse. Only after the alert does the game travel to
  lunch; the shift and held freight remain paused.
- In the mall, Space also grabs or parks the cart. Each stop has a labelled bundle
  of 6–10 cartons; the cart carries two stops per trip. Taking freight highlights
  an available bundle for the current run and skips empty truck slots. Delivering
  a stop removes that stop's bundle while the other one stays on the cart.
- In 3D, drive the five-ton from UPS to Southgate Mall and back, about 40–60 seconds each
  way. W / up accelerates, A/D / left/right steers and S / down brakes. Touch has
  a steering stick plus held GAS and BRAKE pedals. Hold BRAKE after stopping to reverse.
  Explore a city with twice the previous playable area, 42 connected intersections,
  127 shops, apartments and towers, and 28 cars that steer through curved turns.
  A large green 3D compass points directly toward the destination as you choose
  your streets. Brake at working traffic lights, pull off the street into the
  separate UPS or Southgate loading yard and stop in its lit dock bay.
  Press Space / PARK to continue. Bumps cost 100 points and briefly slow the
  truck; crossing a red light costs 100 points, and cargo stays safe.
  Escape / PAUSE and M / MUTE work on the road too. Try just the driving at
  `?mode=3d&drive=mall` (or `drive=ups`); parking offers the trip back.
  See [the 3D driving mini-game](docs/3d-driving.md).

Touch devices have a movement stick and Switch, Grab / Deliver, and Brake
buttons. Landscape gives a closer view; portrait reserves room below the game
for controls. The preview includes a restartable results screen.

The new scene includes the source's specific references: all of Kylie's coffee
lines and Shan's rants, AJ and Vic's massage, the United Way announcement and
swearing crew, Ben's dodge-training disaster, demon and Paula, and the original
named freight. Hussan collects and dances with THE SNAKES CELL. Vic stops the
belt and Shan physically restarts it. Brian sends five real parcels to bulk;
after five accumulate, Ralph loads them into his five-ton truck and heads back
to his three sets of triplets. The crew has its own trucks and personal props,
including Paytman's fish tank and Donna's Warcraft vignette. Brian's much larger
curling green stink trails make his particular contribution unmistakable. Drivers, keys,
exhaust, coughs, clock-out lines, departures and original grade quotes return.

Ben's robbery, dodge-training, demon and Paula sequence gets a close-up: the
belt, freight, workers, shift clock and other crew routines freeze until it
finishes. Escape or losing focus pauses the story too. The camera then returns
smoothly to your worker and sorting resumes from the same positions. Everyday
banter, the CELL dance, massage and loading routines continue during gameplay;
Mesa retains its existing paused choice and dream.

Vic's Mesa offer supports Y/N and touch. Leaving keeps the parcel; stealing
has a fresh 20% catch chance per attempt, so consecutive catches are possible.
Getting caught costs up to 500 points and resumes the shift.
A successful theft shows the upgraded bedroom dream: Trmyte plays Lumines on
the PS3 while long-haired Skanky plays guitar through the Mesa amp. The original
posters and computer remain in the room. The dream resumes this shift.
The advertised one-in-five capture risk was unfinished
in the original source; it is now implemented. See the source inventory and
restoration evidence in [reference parity](docs/reference-parity.md).

The **original full shift**, including its NPCs, special freight and timed
events, is retained. Choose **Play the original full shift** in either depot's
briefing (keyboard O in the 2D depot), or open the local URL with `?mode=classic`. Its controls
remain unchanged; it starts with Enter or a title-screen tap.

The 3D and legacy 2D depots preserve the same reference events. New loading,
layout and scoring changes apply to 3D only.
`?mode=3d` also opens the 3D depot.

Node 24 is recorded in `.node-version` and used by CI. The locked Vite dependency
requires Node `^20.19.0 || >=22.12.0`; use the documented Node version so local and
CI checks agree.

## Build and preview

```sh
npm run build
npm run preview
```

The build runs TypeScript checking and then creates the production bundle in
`dist/`. Preview serves that bundle locally. Generated output and dependency
folders are ignored; the GitHub workflow only installs from `package-lock.json`
and runs the build and browser checks. It does not deploy or publish a release.

To run the browser smoke checks against a fresh production build:

```sh
npx playwright install chromium
npm run test:model
npm run test:browser
```

The model suite checks belt contact through speed ramps and stops, placement,
recovery, pacing, and a complete winning shift. Source parity checks extract
the original dialogue pools and compare their exact content with the preview.
Browser checks cover both the
original game and the new section: organic A/B/C deliveries using real keys,
keyboard/touch controls, belt rendering, pause, brake, handoff, recovery,
results, restart, readable dialogue variants, scripted story stages, Mesa
choices/dream, crew loading, Ralph's five pickups, and departures. Audio checks
render every effect and music mode in Chromium, checking headroom, envelopes,
mute/resume and scheduling after a stall. Receiving checks inspect the actual
unloading handoff, parcel identity, contact, stops and restart cleanup.
Story checks play all three arrivals, the scrum, all six break exchanges,
throwing and breakage, the stairs, the full mall run, the key return and a
clean replay in both depots.
Geometry checks cover all seven destinations, truck/deck alignment, stairs,
mixed recovery freight, full lower-floor stacks, sampled story and camera
clearances, and GPU-resource cleanup across restarts. See the
[depot review and validation record](docs/depot-quality-review.md) for findings,
fixes, performance measurements and remaining manual checks.
Browser checks use a
loopback server, real opening inputs and isolated synthetic clock/cargo fixtures
for later events and edge cases. TypeScript strict checking is enabled. Dependabot maintains
compatible dependencies; major upgrades require a separate planned review.

CI checks the real Canvas fallback on GPU-free Linux and Windows runners. Local
checks retain the default renderer unless `BELT_BROWSER_RENDERER=canvas` is set.
Both CI jobs run the same gameplay assertions; they do not change the production
game configuration or bypass its countdown. The default WebGL renderer still
needs a local check on a machine with usable graphics support.

The original scenes reference Google Fonts when a network connection is available;
the preview uses system fonts and editable engine-native art. See
[asset provenance](docs/night-shift-assets.md) and
[the preview's scope and design](docs/night-shift-preview.md).
Physical-device usability and audible sound still need manual checks. Automated
coverage of timed events uses controlled fixtures, not a claim that every story
was encountered in one unassisted playthrough.

## Source and history

The source was recovered from a local checkout originally associated with
[`RecursiveDelete/thebelt`](https://github.com/RecursiveDelete/thebelt). Its old
Git metadata could not resolve the recorded HEAD and was preserved locally in
ignored `.git-recovery-backup/`. This repository starts with a reviewed snapshot
of the current source, rather than reconstructing that unavailable history.
The old remote remains recorded as `upstream` for provenance.

No license has been established for this snapshot. Repository privacy does not
grant permission to redistribute the source or its assets.

See [CONTRIBUTING.md](CONTRIBUTING.md) for changes and
[SECURITY.md](SECURITY.md) for private security reporting.
