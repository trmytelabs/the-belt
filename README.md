# The Belt

The Belt is a browser game built with Three.js, Phaser, TypeScript and Vite.
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
[the 3D depot](docs/3d-preview.md).

The **2D Night Shift / Depot 07** is at `?mode=2d`, and the description below
applies to both. Both depots now play a whole night: one of three random
arrivals outside the locked gate, Shan's morning scrum, the warehouse shift
with a Tim Hortons or 7-Eleven break, then Skanky's mall run in the five-ton
(a 3D mall inspired by Edmonton's Southgate Centre),
returning the truck and going home. Story scenes advance by themselves; Space
shows the next line and Enter skips the scene. See
[the overnight shift expansion](docs/overnight-shift-expansion.md).

The shift is one polished three-minute warehouse section, followed by
up to ten seconds to clear remaining freight. Press Enter or tap **START THE NIGHT**. Dispatch
24 parcels and keep the recovery backlog below five. The original **3, 2, 1,
SORT!** countdown starts the shift.

- WASD / arrows move; Tab or right-click switches workers.
- Space or left-click grabs, delivers inside a dock, or puts a parcel down.
- F (or THROW) throws toward the nearest drop. At the top of the stairs it
  throws to the lower-floor drop with a 30% break chance. A break earns nothing,
  costs up to 150 points once, and Shan runs over yelling.
- The belt and both workers stand on a raised loading platform; trucks back
  against its edge, and stairs at the belt's end lead to the lower floor.
- Read parcel street addresses and compare them with the ranges on the truck
  signs. Termite covers Mill Woods (10–49 ST), Downtown (90–109 ST) and the
  Westmount floor drop (110–129 ST). Skanky covers Bonnie Doon (50–89 ST),
  West End (130–169 ST) and the Northside floor drop (170–199 ST). Oversize
  freight goes to shared bulk. These are synthetic game districts.
- The other worker automatically collects and delivers their side. Regular
  freight arrives three times as often, with randomized everyday packages
  mixed between the original named joke parcels. See [address sorting](docs/address-sorting.md).
- Deliver anywhere inside the larger painted drop zones. The bulk zone extends
  farther down, with the recovery tray and more walking room below it.
- E brakes the belt for two seconds, with an eight-second cooldown.
- Escape pauses; M toggles sound. Losing focus pauses the preview automatically.
- The closer camera follows your worker up and down the belt and reframes when
  you switch workers. V, or the Overview button, shows the whole warehouse.
- Walk up past the first truck row to see the receiving dock: two incoming
  semis, unloaders and a smelly dockhand feeding the next real parcel onto the belt.
- The original five truck rows and named bays are preserved. All trucks share
  the same size, with the two player trucks in the bottom row. The incoming
  articulated semis occupy the new receiving area above those rows.
- Pick up missed freight near the belt exit to recover it for half base points.

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

The 3D and 2D depots run the same shift rules and the same reference events.
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
