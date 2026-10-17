# 3D preview

Open the local URL with `?mode=3d`. The default entry remains the 2D Night
Shift depot, which still carries every reference in
[reference parity](reference-parity.md). The 3D preview is being built in
phases. It replaces the 2D depot only once it shows every one of those
references.

## How it works

`src/main.ts` loads one engine per mode: Phaser for the 2D game, Three.js for
`?mode=3d`. The 3D preview runs the unchanged `ShiftModel`, so belt timing,
freight order, Brian's five, scoring, grades and failure rules are identical.
Model pixels map to world metres at 1/32 (`src/three/space.ts`), so the ten
truck positions, docks, drop areas and worker lanes keep their original
layout.

- `world.ts` builds the warehouse: lit concrete floor, the belt with a moving
  tread, receiving feeders and trailers, the ten named trucks, A/B/C drop areas,
  the bulk cage, the recovery tray, the resident crew and their props.
- `characters.ts` builds low-poly people with walking and carrying poses.
- `crew.ts` runs the crew's routines and gags on the 2D depot's authored
  schedule and lines (`DepotLife`, `DepotRoutines`, `DepotReceiving`), with
  poses for yelling, crouching, massage, dancing, swearing, coughing and
  cheering.
- `parcels.ts` builds each named freight type with its full shipping tag.
- `overlay.ts` holds the HUD, the briefing/countdown/results panels and the
  speech bubbles. Each bubble is anchored above its speaker. If the speaker is
  off-screen, the bubble moves to the nearest edge with an arrow pointing
  toward them.

Rendering uses ACES tone mapping, soft shadows, a room environment for
reflections and a bloom pass that only catches real light sources. On a
software WebGL renderer (SwiftShader/llvmpipe), the preview switches to low
quality: no shadow maps or bloom, fewer lights and a reduced render resolution.
It also spaces out its draws, so the shift clock, input and bubbles keep running
at full rate even when a single draw takes longer than a frame. Without WebGL it explains
the requirement and links to the 2D game.

## Reference coverage after phase 2

Present in 3D:

- Termite (hat) and Skanky (long hair), with the active ring and `zZz` marker.
- All eight resident coworkers and their identifiers:
  - Hussan's phone.
  - AJ's bare feet and massage table.
  - Ben's shoulder demon.
  - Bannerman's glasses, moustache and LEGO.
  - Fruit Loop's smaller scale.
  - Doris's cigarette and smoke.
  - Brian's green stink trails.
  - Donna's necklace, and her husband playing Warcraft.
- Paytman's fish tank.
- The eight crew trucks and both player trucks, with their names.
- All named freight with full tags:
  - Mallwood's curry-coloured fumes.
  - Live lobster claws.
  - Le Duck.
  - The makeup crack and spill.
  - The Mesa Boogie amp.
  - The Small ATV.
  - Goji berries.
  - Panchetters.
- Kylie's three Timmy Hortans lines, on her walk.
- Shan's seven rants, cycling on each brake, as he reddens.
- Fruit Loop's `LIVE LOBSTERS?!`.
- Brian's `SENDING 5 DOWN` and the active worker's reply.
- The 3-2-1-SORT countdown.
- The grade quotes and the failure flavour.
- **Phase 2 crew routines:**
  - John Rushton: walks in at 13 s and after misses, yells `DON'T STACK BOXES
    ON BOXES!` with his arms raised, crouches, then leaves.
  - Vic and AJ's massage: Vic walks to the table and says `I NEED A QUICK TUNE
    UP`, then lies under a towel while AJ massages him. Both return.
  - THE SNAKES CELL: the case rides the belt and Hussan walks over and
    collects it. Its label becomes `CELL`. He dances with it overhead for
    3.2 s, then returns.
  - Drivers and exhaust: ten drivers bring keys to the cab fronts at 114 s.
    Exhaust stacks then smoke for the rest of the shift.
  - Coughs: Hussan and Doris cough all four original lines.
  - United Way: Shan's announcement, then the whole floor's swearing reaction
    (8 residents, staggered 110 ms apart), all six swear lines and Brian's
    late `WHAT THE FUCK`.
  - The smelly receiving dockhand, with flies and a green haze, pushing each
    real parcel onto the belt. Two unloaders carry crates from the trailers
    onto the feeders. Receiving runs on belt travel, so it stops when the
    belt stops.
  - The crew's 18-second freight trips from the belt side to their own
    trucks, paused while a coworker is busy with a gag.
  - The winning clock-out: Termite and Skanky's lines, all eight resident
    lines, the crew cheering, and every named truck driving out through its
    dock bay.

Still 2D-only, scheduled for later phases:

- **Phase 3 (set pieces):**
  - Vic and Shan's stop/start buttons.
  - Ralph's five-ton truck and five loads.
  - Ben, the gunman, the demon and Paula.
  - The Mesa choice, the capture risk and the bedroom dream.
- **Phase 4:**
  - Touch controls.
  - Making the 3D depot the default.

## Checks

`tests/three-browser.mjs` runs in `npm run test:browser`. It launches its own
SwiftShader WebGL, so it also runs on CI's GPU-free runners. It checks:

- The WebGL fallback.
- That Phaser is not loaded in 3D mode.
- That the resident cast is present.
- That the countdown gates the clock.
- A real-key grab and delivery of `MALLWOOD RD EAST`.
- That Kylie's three lines arrive in order, with her bubble anchored above her
  in the overview.
- Shan's first brake rant.
- Pause and resume.
- The worker handoff.
- John's yell and crouch on the ordinary clock.
- Every phase-2 routine above, using a synthetic shift clock as the 2D
  reference suite does. Belt freight is cleared between jumps so a slow
  renderer cannot fail the shift. The check covers each line, AJ's massage
  pose and the towel, the label change from `THE SNAKES CELL` to `CELL`, all
  ten drivers, the eight-person United Way reaction, the dockhand's position,
  the eight clock-out lines, every truck's departure, and the results.

`BELT_BROWSER_CPU_RATE=4` throttles the page like the 2D suites, to rehearse
slow CI runners.

Set `BELT_3D_GPU=1` to use a hardware GPU instead. Visual quality on hardware
WebGL was checked with local Edge screenshots. Physical devices and touch are
not covered yet.
