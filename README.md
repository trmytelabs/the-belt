# The Belt

The Belt is a browser game built with Phaser, TypeScript and Vite. Players switch
between workers, pick up packages and sort them to the appropriate dock. The game
includes keyboard, mouse and touch controls.

This private repository contains the current development snapshot (`0.0.0`). It
has a working production build and a browser smoke suite, with no published
release. Review playability in the browser when changing game behavior.

## Run locally

Install Node.js 24 (with npm), then run from the repository root:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The default entry is the **Night Shift / Depot
07** playable preview: one polished three-minute warehouse section, followed by up to ten
seconds to clear remaining freight. Press Enter or tap **Start Shift**. Dispatch
24 parcels and keep the recovery backlog below five. The original **3, 2, 1,
SORT!** countdown starts the shift.

- WASD / arrows move; Tab or right-click switches workers.
- Space or left-click grabs, delivers inside a dock, or puts a parcel down.
- Route A goes to the left truck, B to the right truck, and heavy C freight to
  either lower bulk bay. Letters and colors identify every route.
- E brakes the belt for two seconds, with an eight-second cooldown.
- Escape pauses; M toggles sound. Losing focus pauses the preview automatically.
- The closer camera follows your worker up and down the belt and reframes when
  you switch workers. V, or the Overview button, shows the whole warehouse.
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
including Paytman's fish tank and Donna's Warcraft vignette. Drivers, keys,
exhaust, coughs, clock-out lines, departures and original grade quotes return.

Ben's robbery, dodge-training, demon and Paula sequence gets a close-up: the
belt, freight, workers, shift clock and other crew routines freeze until it
finishes. Escape or losing focus pauses the story too. The camera then returns
smoothly to your worker and sorting resumes from the same positions. Everyday
banter, the CELL dance, massage and loading routines continue during gameplay;
Mesa retains its existing paused choice and dream.

Vic's Mesa offer supports Y/N and touch. Leaving keeps the parcel; stealing
risks ending the shift. A successful theft shows Skanky's original bedroom dream
and resumes this shift. The advertised one-in-five capture risk was unfinished
in the original source; it is now implemented. See the source inventory and
restoration evidence in [reference parity](docs/reference-parity.md).

The **original full shift**, including its NPCs, special freight and timed
events, is retained. Choose **Play the original full shift** in the preview
briefing (keyboard O), or open the local URL with `?mode=classic`. Its controls
remain unchanged; it starts with Enter or a title-screen tap.

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
choices/dream, crew loading, Ralph's five pickups, and departures. They use a
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
