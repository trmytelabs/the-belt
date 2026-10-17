# 3D preview: phase 1

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

## Reference coverage in phase 1

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
- Termite and Skanky's clock-out lines.
- The grade quotes and the failure flavour.

Still 2D-only, scheduled for later phases:

- **Phase 2 (crew routines):**
  - John Rushton.
  - Vic and AJ's massage.
  - The snakes cell and Hussan's dance.
  - The United Way announcement and its swears.
  - Drivers, exhaust and coughs.
  - The smelly receiving dockhand.
  - The crew's freight trips.
  - The resident clock-out celebration.
- **Phase 3 (set pieces):**
  - Vic and Shan's stop/start buttons.
  - Ralph's five-ton truck and five loads.
  - Ben, the gunman, the demon and Paula.
  - The Mesa choice, the capture risk and the bedroom dream.
  - Truck departures.
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

Set `BELT_3D_GPU=1` to use a hardware GPU instead. Visual quality on hardware
WebGL was checked with local Edge screenshots. Physical devices and touch are
not covered yet.
