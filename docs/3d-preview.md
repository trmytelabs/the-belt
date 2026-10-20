# 3D depot

Active development targets **3D only**. The 2D and classic modes are retained as
legacy versions. See [current gameplay rules](address-sorting.md) for street
sorting, the rear platform and side stairs, player-only bulk, the 10-point wrong
drop penalty and brighter night lighting. New 3D rules use `ShiftModel3D` and
`layout.ts`; shared model extensions must preserve legacy behavior.

The 3D briefing teaches grab → destination → load, and `sortingGuide.ts` supplies
the live next step. Large street numbers, named truck floor markings and a gold
delivery marker make matching freight easier. Recovery fails at seven packages;
the shift retains its 42-dispatch goal with gentler intake, faster carrying and
25 seconds of cleanup. The legacy modes retain their previous pacing and limits.

All freight for the selected worker has a bright cyan ring, including packages
still out of reach; switching workers changes the rings immediately. Other
workers' packages remain visible without player markings. Residents' routine
boxes visibly travel on the tread before the same box is lifted and carried.
Their incoming freight stops with the belt. Destination circles have no floating
action labels.

E / STOP THE BELT gives a two-second stop, three times per run, with a 15-second
cooldown from each press. Stops left and cooldown time stay visible; failed
presses and story-controlled stops spend no uses. Replay restores all three.
Starting and resuming focus the game canvas for keyboard input. A paused game
explicitly says to click RESUME or press ENTER.
The countdown-to-play transition releases any pause left by resuming an opening
scene, and restores keyboard focus, so WASD, arrows and pickup work immediately.

The 3D depot is the default entry. It shows every reference in
[reference parity](reference-parity.md), as the 2D depot does. The 2D depot is
kept at `?mode=2d`, the original full shift at `?mode=classic`, and `?mode=3d`
still opens the 3D depot. It was built in four phases: core loop, crew
routines, set pieces, then touch controls and the default switch.

## How it works

`src/main.ts` loads one engine per mode: Phaser for the 2D game, Three.js for
`?mode=3d`. `ShiftModel3D` extends the shared shift engine with the current
3D-only layout, intake cadence, truck loading, coworker bulk restriction and
wrong-drop penalty. The legacy model retains its behavior. Model pixels map to
world metres at 1/32 (`src/three/space.ts`); `src/three/layout.ts` defines the
rear platform, outward side stairs, truck interiors and lower-floor drops.

- `world.ts` builds the warehouse: lit concrete floor, the belt with a moving
  tread, receiving feeders and trailers, named trucks with player cargo shelves,
  floor street ranges, the bulk cage, the recovery tray, pallet drops, the
  resident crew and their props.
- `characters.ts` builds the pose pivots and procedural fallback figures at
  about 1.78 m. `characterModels.ts` loads the 23 rigged Rocketbox people from
  `rocketboxCast.ts`, then drives their bones from those pivots. The existing
  walk, carrying, gestures, attached props and story poses continue to work.
  See [character models](character-models.md) for the cast and MIT provenance.
  The walk cycle leans the torso in and sways it with each step, a heavy load
  (`load`, from the freight's carry multiplier) leans the carrier back and
  lowers the arms, and `triggerAction` layers a one-shot lift, put-down or
  throw over whatever the figure is doing. `lookToward` turns a head toward a
  point within the neck's range; Termite and Skanky look at the parcel they
  can grab or the drop they are carrying to. All of these fold into the
  existing easing targets, so nothing accumulates, and reduced motion keeps
  every figure still. `tests/character-animation-model.mjs` covers them.
- `setpieces.ts` stages Vic and Shan's belt buttons, Ralph's five-ton and
  Ben's robbery. `mesa.ts` runs the Mesa choice, and `dream.ts` is Skanky's
  bedroom.
- `merge.ts` merges rigid meshes into a few vertex-coloured draw calls.
- `crew.ts` runs the crew's routines and gags on the 2D depot's authored
  schedule and lines (`DepotLife`, `DepotRoutines`, `DepotReceiving`), with
  poses for yelling, crouching, massage, dancing, swearing, coughing and
  cheering. The crew walk out of the scrum to platform work stations, then
  spend most of their time collecting and loading parcels. `walking.ts`
  keeps cross-lane departures around the belt head.
- `truckCutaway.ts` opens soft circular windows in foreground truck shells
  and shelf boards around nearby people. Delivered cargo remains visible.
- `propModels.ts` upgrades cars and the devil with compact CC0 Quaternius GLBs,
  preserving their original driving and story roots and procedural fallbacks.
  See [asset sources](../public/models/PROP-SOURCES.md).
- `parcels.ts` builds each named freight type with its full shipping tag.
- `overlay.ts` holds the HUD, the briefing/countdown/results panels and the
  speech bubbles. Each bubble is anchored above its speaker. If the speaker is
  off-screen, the bubble moves to the nearest edge with an arrow pointing
  toward them.

The follow camera leads a walking worker slightly in their direction of
travel and rattles briefly when freight breaks (never with reduced motion).
At the back of the depot it keeps its oblique angle over the stairs, the floor
drops and bulk instead of being stopped against the terminal wall: the wall
fades out as the camera approaches its inner face and is hidden once the
camera is behind it (`DepotWorld.fadeRearWall`), showing the snowy lot behind
the depot instead. The fade is a function of the camera's position, so the
near plane never meets a visible wall; the overview, high above the wall,
keeps it solid. `tests/depot-geometry-browser.mjs` checks both.

Rendering uses ACES tone mapping, soft shadows, a room environment for
reflections, a screen-space ambient-occlusion pass (`ambientOcclusion.ts`:
Three's GTAO at half resolution, reading the depth the main render already
wrote and reconstructing normals from it, so it draws the scene no second
time; tags, rings and snow write no depth, so they cast no false shadows) and
a bloom pass that only catches real light sources. A soft vignette over the picture and a
hazard-striped band at the top of each stair flight round out the look. On a
software WebGL renderer (SwiftShader/llvmpipe), the preview switches to low
quality: procedural figures without model downloads, no shadow maps or bloom,
fewer lights and a reduced render resolution.
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
- Kylie's three Timmy Hortans lines, on his walk.
- Shan's seven-rant pool, cycling on each belt stop, as he reddens.
- Fruit Loop's `LIVE LOBSTERS?!`.
- Brian's `SENDING 5 DOWN` and the active worker's reply.
- The 3-2-1-SORT countdown.
- The grade quotes and the failure flavour.
- **Phase 2 crew routines:**
  - John Rushton: patrols both belt lanes around the receiving end, stopping for
    randomly spaced squat sets. At 13 s and after misses he retains his warning
    `DON'T STACK BOXES ON BOXES!`.
  - Shan and Vic walk up and down loading lanes between their reference scenes.
    A player can squeeze past or step around them; patrols avoid stair entrances.
  - Vic and AJ's massage: Vic walks to the table and says `I NEED A QUICK TUNE
    UP`, then lies under a towel while AJ massages him. Both return.
  - THE SNAKES CELL: the case rides the belt and Hussan walks over and
    collects it. Its label becomes `CELL`. He dances with it overhead for
    3.2 s, then returns.
  - Drivers and exhaust: twelve drivers head for their cabs at 117 s.
    With one minute left, an engine starts first, then the others one by one; exhaust stacks then
    smoke for the rest of the shift.
  - Coughs: Hussan and Doris cough all four original lines.
  - United Way: Shan's announcement, then the whole floor's swearing reaction
    (every resident except Ben, who is gone by then, staggered 110 ms apart), all six swear lines and Brian's
    late `WHAT THE FUCK`.
  - The smelly receiving dockhand, with flies and a green haze, pushing each
    real parcel onto the belt. Two unloaders carry crates from the trailers
    onto the feeders. Receiving runs on belt travel, so it stops when the
    belt stops.
  - The crew's eight-second loading trips, with visible incoming boxes and a wait
    for the actual belt arrival, paused while a coworker is busy with a gag.
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
      - Caught: `BUSTED BY SHAN O MAC` deducts up to 500 points, then resumes
        the same shift.
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
    SWITCH and STOP THE BELT buttons sit at the bottom, with VIEW and PAUSE at
    the top left. They appear only while the shift is playable, and the STOP
    THE BELT button shows its remaining uses and cooldown. Mesa choices and panels are tapped. A tap on
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
- Shan's first belt-stop rant.
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
  GRAB / DELIVER, SWITCH, STOP THE BELT, VIEW, and PAUSE / RESUME.
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
    Shan, which costs points and resumes the shift.

`BELT_BROWSER_CPU_RATE=6` throttles the page like the 2D suites, to rehearse
slow CI runners.

Set `BELT_3D_GPU=1` to use a hardware GPU instead. Visual quality on hardware
WebGL was checked with local Edge screenshots, including 390×844 portrait and
844×390 landscape touch layouts. Physical phones and tablets still need a hands-on
check.
