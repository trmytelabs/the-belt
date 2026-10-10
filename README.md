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
07** playable preview: one polished 90-second section, followed by up to ten
seconds to clear remaining freight. Press Enter or tap **Start Shift**. Dispatch
12 parcels and keep the recovery backlog below five.

- WASD / arrows move; Tab or right-click switches workers.
- Space or left-click grabs, delivers inside a dock, or puts a parcel down.
- Route A goes to the left truck, B to the right truck, and heavy C freight to
  either lower bulk bay. Letters and colors identify every route.
- E brakes the belt for two seconds, with an eight-second cooldown.
- Escape pauses; M toggles sound. Losing focus pauses the preview automatically.
- Pick up missed freight near the belt exit to recover it for half base points.

Touch devices have a movement stick and Switch, Grab / Deliver, and Brake
buttons. Landscape gives a closer view; portrait reserves room below the game
for controls. The preview includes a restartable results screen.

The new scene includes the original crew and workplace humor: Kylie's coffee,
AJ and Vic's massage, Shan's rants, the United Way announcement, Ben's
dodge-training disaster and Paula's response. Recognizable special freight
includes GOJI BERRIES, LIVE LOBSTERS, LE DUCK, MESA BOOGIE and SMALL ATV. At
63 seconds Brian announces five parcels down to bulk, creating a short burst
that rewards switching workers and using the brake.

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
recovery, pacing, and a complete winning shift. Browser checks cover both the
original game and the new section: organic A/B/C deliveries using real keys,
keyboard/touch controls, belt rendering, pause, brake, handoff, recovery,
results, restart, character references and script errors. They use a loopback server and isolated
synthetic state for edge cases. TypeScript strict checking is enabled. Dependabot maintains
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
Timed events, physical-device usability and audible sound still need manual
checks after relevant changes; the smoke suite does not verify every game flow.

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
