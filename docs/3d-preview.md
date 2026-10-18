# 3D depot

The 3D depot is the default entry. It shows every reference in
[reference parity](reference-parity.md), as the 2D depot does. The 2D depot is
kept at `?mode=2d`, the original full shift at `?mode=classic`, and `?mode=3d`
still opens the 3D depot. It was built in four phases: core loop, crew
routines, set pieces, then touch controls and the default switch.

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
- `setpieces.ts` stages Vic and Shan's belt buttons, Ralph's five-ton and
  Ben's robbery. `mesa.ts` runs the Mesa choice, and `dream.ts` is Skanky's
  bedroom.
- `merge.ts` merges rigid meshes into a few vertex-coloured draw calls.
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

## Reference coverage after phase 3

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
  - Drivers and exhaust: twelve drivers bring keys to the cab fronts at 153 s
    (moved from 114 s by the [overnight expansion](overnight-shift-expansion.md)).
    One engine starts first, then the others one by one; exhaust stacks then
    smoke for the rest of the shift.
  - Coughs: Hussan and Doris cough all four original lines.
  - United Way: Shan's announcement, then the whole floor's swearing reaction
    (every resident except Ben, who is gone by then, staggered 110 ms apart), all six swear lines and Brian's
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
- **Phase 3 set pieces:**
  - Vic and Shan's buttons: Vic walks down the west lane and presses STOP at
    96 s (`BELT STOPPED`), which really stops the belt. Shan comes down the
    east lane, rants, and presses START at 101.8 s (`BELT RUNNING`). The
    buttons light amber and green.
  - RALPH 5 TON: once five bulk parcels are in and the clock passes 90 s, the
    grey and yellow flatbed backs in through its dock bay. Ralph says `I NEED
    TO HURRY UP AND GET BACK TO MY 3 SETS OF TRIPLETS!`, then makes five
    3-second trips. Each trip lifts one real crate off the visible bulk stock
    into one of five truck slots, and the truck then drives away.
  - Ben's robbery, from 68 to 92.5 s on its own story clock. The shift, belt,
    freight and other crew freeze, and other speech waits. In order:
    - The gunman says `I'M GOING TO ROB THIS PLACE!`.
    - Ben gives his full dodge-training boast.
    - Ben dodges five comic shots (BANG!, BANG!, POW!, BANG BANG!, BANG!)
      with muzzle flashes, then falls with `X_X`.
    - The pointed red hell gate rises with its fire.
    - The winged demon emerges, drags Ben in by the ankles and sinks with
      him.
    - Paula arrives with her complaint.

    The camera frames the outer bay, and pause or losing focus freezes the
    story. Ben never returns.
  - Mesa: the first unheld Mesa after 34 s pauses the shift with `VIC
    SPOTTED THE MESA`. Vic makes his offer and the `VIC WANTS THE MESA`
    choice appears with the one-in-five risk. Y/N or a click chooses:
    - Leave: the parcel stays and the shift resumes.
    - Steal: Skanky's `MESA AT HOME` thought, then a fresh 20% roll.
      - Caught: `BUSTED BY SHAN O MAC` ends the run with the original detail
        and `GAME OVER`.
      - Safe: the 5-second 3D bedroom dream, then the same shift resumes.
        The stolen Mesa is not a dispatch.
  - The bedroom keeps everything from the 2D dream:
    - The `BULK RULES`, `PAYTMAN SUCKS` and `NO REPEATS` posters and the
      `BUILT THE BELT` monitor.
    - The night window.
    - Trmyte in his T hat playing an animated Lumines on a TV and PS3.
    - Long-haired Skanky strumming a guitar cabled to the `MESA BOOGIE` Dual
      Rectifier.
    - The `MESA AT HOME` / `ONE MORE GAME.` titles.

- **Phase 4 touch and default:**
  - On touch screens (`touch.ts`), a movement stick and GRAB / DELIVER,
    SWITCH and BRAKE buttons sit at the bottom, with VIEW and PAUSE at the
    top left. They appear only while the shift is playable, and the BRAKE
    button shows its cooldown. Mesa choices and panels are tapped. A tap on
    the scene itself does nothing, so stray touches cannot grab.
  - The briefing gives touch instructions.
  - On phones the HUD collapses to one row in both orientations.
  - The plain address opens the 3D depot.

## Checks

`tests/three-browser.mjs` runs in `npm run test:browser` (or on its own with
`npm run test:browser:3d`). It launches its own SwiftShader WebGL, so it runs
in CI's GPU-free Linux job. The Windows job runs the 2D suites only
(`test:browser:2d`): on that runner, software WebGL delays input and page
round trips by seconds at unpredictable times. Real Windows PCs with a GPU
are unaffected, and the game itself is identical on every platform. It
checks:

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
  twelve drivers, the United Way reaction without Ben, the dockhand's position,
  the eight clock-out lines, every truck's departure, and the results.
- Touch, in a 390×844 touch browser: the touch briefing, stick movement,
  GRAB / DELIVER, SWITCH, BRAKE, VIEW, and PAUSE / RESUME.
- That the plain address opens the 3D depot; without WebGL it links to
  `?mode=2d`.
- Every phase-3 set piece:
  - Ben: each story stage, the five shots, `X_X`, the gate and demon,
    Paula's line, the frozen shift clock and belt, Escape pausing the story,
    and Ben's absence afterwards.
  - Ralph: each of the five trips removing one crate from the pile, a full
    truck, and the departure.
  - Buttons: Vic's STOP really stopping the belt, and Shan's rant and
    restart.
  - Mesa: leave by keyboard; a click steal into the dream and back to the
    same shift, with no dispatch credited; and a keyboard steal caught by
    Shan, which ends the run.

`BELT_BROWSER_CPU_RATE=6` throttles the page like the 2D suites, to rehearse
slow CI runners.

Set `BELT_3D_GPU=1` to use a hardware GPU instead. Visual quality on hardware
WebGL was checked with local Edge screenshots, including 390×844 portrait and
844×390 landscape touch layouts. Physical phones and tablets still need a hands-on
check.
