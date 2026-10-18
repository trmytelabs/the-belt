# Depot quality review

Review date: 2026-10-18. This record covers the shared simulation, classic Phaser
game, 2D depot and story, Three.js depot and story, input/audio/resource lifecycles,
tests, package scripts and CI. Findings below describe concrete changes; this is
not a claim that every possible state or device has been exhaustively checked.

## Preserved work and scope

The eight modifications described in the request had already been committed as
`c1d4443` and merged through PR #18 before this work began. Their diff was reviewed;
the actual checkout was clean `main` at `61dc076`. The required fast-forward pull
confirmed it was current before creating `codex/depot-quality-and-pacing`.
The repository remains private. This work does not deploy, publish a release, or
authorize merging the new PR; CI and the owner's approval are still required.

## Findings and fixes

| Finding | Fix and regression coverage |
| --- | --- |
| The original 24-parcel target and slow arrivals left too little sustained work; frequent worker switching interrupted each lane. | Shared `ShiftModel` target is 42. The six-second tutorial intake accelerates to 2.8 seconds, then 2.2 seconds with mixed routes. After 36 seconds the inactive worker acquires, carries and sorts its own A/D/T or B/E/S freight. Automatic dispatch earns no player points, combo or accuracy credit. Two scanner faults require selecting the partner and pressing Space, preserving held freight. The complete public-input model test dispatches 64/64 parcels: 42 player deliveries, 22 automatic deliveries, four tutorial switches and exactly two scanner handovers. Both depots explain and test the same rules. |
| Background workers, drivers and their held freight could overlap parked trucks, other actors and props. | Shared circle/rectangle clearance reserves player footprints before placing the cast, preserves the platform/stair/lower-floor region, and moves held freight with its owner. Truck rows now leave 24-pixel aisles and crew stand at their centers. Tests cover truck tangencies, occupied positions, dense cast placement and support boundaries; browser checks inspect sampled poses. |
| Lower-floor delivered stacks occupied the approach lanes, and workers could put down or collect freight across incompatible levels. | T/S storage occupies the outer bands with two columns and four rows per layer, leaving the inner approach clear. Storage and loose freight block walking. Stair put-downs and pickups through the deck edge are rejected. Carried freight reserves clearance at storage, handrails and the final wall; pickups cannot create an already intersecting carry. Empty worker limits also keep the 2D boots before the wall. Model tests cover both workers, assisted pickup and all destination approaches. |
| Route availability and presentation were not covered as one complete contract. | Both depots expose Termite's A/D/T, Skanky's B/E/S and shared C, with visible labels, reachable drop centers and matching shared rules. Browser fixtures move to every destination and dispatch with the real action input; T/S feet are checked at the lower-floor elevation. |
| Parcel bounds varied by shape, causing belt contact, carrying and recovery placement mismatches. | Shape-aware parcel placement, held offsets and recovery/storage spacing keep the tested shapes supported and away from bodies. Browser assertions cover all 14 parcel kinds, mixed recovery cargo, full lower-floor stacks and actual rendered bounds. |
| Truck beds, loading surfaces, steps and receiving geometry did not consistently match the raised platform. | Truck cargo floors align with the 1.1-metre deck, backs meet its edge, ordinary truck bodies and tires fit the shared depth, and stairs include the worker footprint. Receiving walls have physical openings and unloading uses the belt's contact height. Browser checks inspect truck/deck bounds, stairs and receiving handoffs. |
| The classic belt retained its stopped state when replaying a completed shift. | `BeltSystem.create()` resets running state, speed and tread offset. The smoke test stops the belt before results, replays, and verifies fresh running intake. |
| Classic sorting debounce remembered only the worker and zone, so a second parcel at the same dock could be ignored. | Debounce also identifies the parcel: each new parcel can be sorted while repeated attempts with the same wrong parcel remain suppressed. A browser regression delivers two successive parcels at one dock. |
| Touch movement could remain active after pointer capture or focus was lost; restart state was not fully refreshed. | Input creation refreshes the control scheme, ignores competing stick pointers and releases movement on lost capture or blur. Shutdown removes listeners. Touch/keyboard smoke tests cover controls and replay. |
| Mall collision used sample points that missed obstacle corners and narrow boundary crossings. | Exact circle-to-boundary and obstacle tests replace angular sampling; cart rectangles test actual intersections and the parking lot uses the full player radius. Regressions include a former planter-corner failure and internal seams of the walkable union. |
| Story speech bubbles could outlive their scene or disappear while paused. | The current bubble belongs to its story stage and is replaced or cleared on beat changes, scene changes and skips. It no longer expires through an unrelated delayed timer. Story suites exercise transitions, skips, pauses and replay. |
| Assistant pickup events could overwrite the active player's route hint. | Worker-specific HUD feedback is shown only for the active worker in both depots. Assistance retains its separate status/count. |
| More detailed models risked multiplying draw calls, and merging an already colored mesh could erase its palette. | Workers, crew, trucks, belts, parcels and props use richer geometry with compatible static parts merged. Repeated merging preserves vertex colors and world bounds, keeps independently animated parts separate, and retains source meshes if a merge fails. Geometry regressions check colors, bounds and instanced counts. |
| Scene replacement and transient visual effects needed explicit ownership and disposal. | Owned geometry, materials and textures are deduplicated and disposed with scene teardown; shared sprite geometry remains owned by Three.js. Effects and touch listeners have explicit cleanup. Resource tests verify disposal counts and browser checks compare resources over restarts. |
| Arrival car routes could cross one another, pedestrians crowded parked cars, and phone gestures stood seated passengers through car roofs. | Cars pass through the gate one at a time into deeper stalls; walking routes and scrum spacing maintain body clearance. Seated hips and legs remain seated during upper-body gestures. The arrival suite checks 23,743 oriented collision comparisons and 2,123 seated roof-clearance samples across all three openers. |
| Camera and story framing lacked collision-focused regression coverage; clamping the camera inside the final wall cropped the outer floor drops. | Dedicated browser suites inspect physical geometry, sampled actor/story poses, camera near-plane clearances and projected visibility. Labels/decals and hidden parents are excluded from physical bounds. The overview includes the lower-floor destinations and adjusts fog distance with camera height; the close view follows workers on the outer landings. Stair checks include 9,408 carried-parcel samples and 672 floor-stack rotations. |
| The 2D morning scrum crowded the conveyor, cropped heads and name tags, and overlapped Shan with a player during the gathering motion. | The cast gathers in two spaced columns on the west platform, with a wider camera and labels below the crew. The browser suite checks all eleven participants against the belt and visible story viewport, plus 55 pairs of transformed body envelopes at the start, middle and end of gathering. |
| Existing suites did not cover these shared clearance, resource and geometry contracts. | `test:model` now includes clearance, geometry and disposal tests; `test:browser:3d` includes depot geometry and story-clearance suites. Existing Linux/Windows CI consumes these scripts without deployment permissions or a new publication step. |
| Windows CI could finish the short Mesa dream between separate browser inspections, producing a false warehouse-pause failure. | The reference browser fixture observes the active dream and paused warehouse together, sleeps its frame loop for inspection, then resumes real frames. The production dream timing is unchanged. |

## Requested rear layout

All four player trucks remain: A/B is followed by D/E, then the bulk build-up
against the warehouse's final back wall. The owner's final clarification places
the stairs on the left and right sides, descending outward to T/S ground drops.
All stairs, landings, storage and destinations remain in front of that wall;
there is no floor or destination behind it. Ralph and the fish tank retain the
rear bays ahead of the stair flights. Both renderers and route tests use the same
layout. Recovery remains at the belt exit, ahead of bulk, with separate storage
and delivery approaches.

## Validation status

Local integration results on Node 24:

| Check | Status |
| --- | --- |
| `npm ci` | Passed. |
| `npx playwright install chromium` | Passed installation. The installed Chromium process could not launch locally (`spawn UNKNOWN`). |
| `npm run build` | Passed on the final gameplay source. TypeScript and Vite succeed; the existing large engine-chunk warning remains. |
| `npm run test:model` | Passed: 103/103 tests, including the complete winning shift, two handovers, zero-score assistance, clearance, geometry, disposal and 50 ms stair-navigation checks. |
| `npm run test:browser` | Passed the complete 2D and 3D production suites. Local checks use `BELT_BROWSER_EXECUTABLE` for Microsoft Edge and `BELT_3D_GPU=1` because of the Chromium launch failure. CI retains its configured Chromium/Edge jobs. |
| Focused browser reruns | The reference suite passed with the Canvas renderer after the Windows dream-inspection repair. Final development geometry checks passed, including side-stair cargo, floor-stack rotations, route/worker framing and camera clearance. These suites also run in the complete production check above. |
| `npm run dev`, default 3D and `?mode=2d` | Passed browser play with real keyboard start, movement, brake, first A pickup/delivery and both stair descents. Final arrival, scrum, drop-zone, platform and scanner screenshots were captured and visually reviewed. Later coffee and scanner-threshold captures use explicitly identified synthetic fixtures; switching/resetting uses actual Tab/Space input. No page errors. |
| Staged diff and generated-file exclusion | Reviewed; no tracked dependencies, generated output, logs or private configuration. |
| PR CI | Results are recorded on the pull request. Both existing Linux and Windows jobs remain required before merge. |

Browser fixtures use loopback servers, real start/action inputs and isolated
synthetic cargo or clock state for late events. They do not constitute one
unassisted playthrough of every random story. Screenshots are kept outside the
repository; no personal screenshots or absolute local paths belong in commits.

## Performance comparison

The baseline was `git archive main` at `61dc076`; the comparison used a separate
copy of the working source. Both were served by separate local Vite instances
with the same existing dependencies, without rebuilding or changing the main
checkout. All comparison servers were stopped afterward.

The fixture used headless Microsoft Edge, ANGLE with an NVIDIA RTX 4090, high
quality, 1280×800 pixels and device scale 1. Cameras, fog, random seed, effects and
scene state were held constant. The active fixture contained six identical
small-box parcels on the belt. Two rounds reversed version order; each phase
had 15 warm-up renders and 30 measured renders per round (60 pooled samples).
Renderer counters include all render passes. Reported timings measure CPU draw
submission; a GPU completion barrier follows each sample but is excluded from
those timings. These are not gameplay frames-per-second measurements.

| Scene / metric | Main baseline | Working source |
| --- | ---: | ---: |
| Briefing draw calls | 1,123 | 1,178 (+4.90%) |
| Briefing triangles | 444,808 | 459,980 (+3.41%) |
| Briefing median / p95 draw duration | 3.25 / 4.10 ms | 3.30 / 4.70 ms |
| Briefing allocated geometries / textures | 400 / 87 | 415 / 85 |
| Active belt draw calls | 617 | 617 (unchanged) |
| Active belt triangles | 249,592 | 255,888 (+2.52%) |
| Active belt median / p95 draw duration | 1.60 / 2.10 ms | 1.70 / 2.90 ms |
| Active belt allocated geometries / textures | 428 / 98 | 443 / 96 |

No page errors occurred in these fixtures. Detail increased triangle counts and
the overview's draw calls; the active fixture's draw calls stayed constant.
Geometry allocations increased by 15 and texture allocations fell by two.
Median CPU draw submission rose by 0.05 ms in the briefing and 0.10 ms in the
active fixture; p95 rose by 0.60 ms and 0.80 ms respectively. Timings vary across
samples and runs. The final benchmark ran without the other browser suites; one high-end
GPU and one browser still do not establish zero performance cost or a frame-rate
guarantee. Low-end devices and sustained gameplay need a manual performance check.

## Remaining manual checks and limits

- Physical touch controls, small-screen readability, audible audio and mute/resume
  on actual devices.
- Sustained play and thermal/frame-rate behavior on low-end hardware.
- Owner approval of the final layout, difficulty and visual style using the
  reviewed drop-zone, platform and cutscene screenshots.
- Unscripted combinations of story timing, actors, thrown freight and camera
  movement. Clearance tests cover finite fixtures and sampled poses; they do not
  prove that no clipping can occur anywhere in every possible game state.

The new PR must remain unmerged until its applicable CI checks pass and the owner
approves it. Generated builds, dependencies, logs and credentials are excluded
from delivery.
