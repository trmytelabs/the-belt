# Five-ton night drives

The default 3D game adds two playable drives after the warehouse shift:
UPS to Southgate Mall before the existing six deliveries, and the city journey
back to UPS after all six signatures and returning the cart to the truck.
The legacy 2D depot and classic game retain their original road scenes.

The neighbourhood has 20 connected intersections on a four-by-five street grid,
covering twice the previous ground area. Its 51 buildings range from small shops
to apartment blocks and a 68-metre tower. Modelled streetlights, 16 existing sedan
models, cones and a delivery box truck fill the streets. The direct trip takes
20–30 seconds each way, including steering and a red-light stop. Players can
choose other streets and explore for longer, with no timer or cargo-loss condition.
A raised chase camera follows the actual truck heading.

- W / up arrow accelerates; S / down arrow brakes; A/D / left/right steers.
  Holding BRAKE after stopping reverses slowly, so the truck can back out.
- Every intersection offers real turns. The player moves freely in the city;
  holding GAS never follows a prescribed road or automatically finishes a trip.
  A solid bevelled 3D yellow arrow at the top points to the next useful street
  waypoint. It recalculates after wrong turns and accounts for the chase camera's
  lag during steering. A lit beacon marks the destination's parking bay.
- Four cycling red/amber/green junctions have visible stop lines. Brake before the
  line and continue on green; the traffic also waits. Crossing a red costs five
  points once, with no cargo loss or game-over condition. Pause freezes signals.
- On touch screens, the stick steers and separate held GAS and BRAKE pedals
  control speed. A second finger can steer while holding a pedal.
- The lit loading bay gently slows the truck. Stop there, then press
  Space or tap PARK. Enter cannot skip the drive. Parking at the mall starts
  the original introduction and cart run; parking at UPS starts the key return.
- A traffic, cone or building bump costs five points, with a brief slowdown and a
  1.5-second collision cooldown. A struck object cannot charge twice. Bundles,
  cart loads, delivery credit and signatures remain owned by the mall rules.
- The results show driving deductions separately from warehouse and mall
  points. The mall still awards 50 points per signature, and the warehouse
  dispatch grade is unchanged.
- Escape / PAUSE or focus loss pauses both truck and traffic. M / MUTE silences
  music and effects. Pausing stops the engine layer and releases held controls.
  Replay resets the drive, deductions and input while reusing the city's art.
  Shoulders slow the truck gently, solid buildings push it clear of their actual
  footprints, and soft outer boundaries turn it back into the neighbourhood.

The recorded chill lo-fi music starts with START THE NIGHT and continues on the
road. A quiet speed-dependent pulsed diesel layer, soft brake hiss and recorded
bump cue use the 3D Web Audio system. Small locally served CC0 recordings also
replace handling, latch and interface effects; see
[foley sources](../public/audio/FOLEY-SOURCES.md). Eight small CC0 Kenney models
upgrade the buildings, lamps, signals and road truck, with procedural loading
and failure fallbacks. Sources, original licences and hashes are in
[driving asset sources](../public/models/driving/SOURCES.md).

Open `?mode=3d&drive=mall` or `?mode=3d&drive=ups` for **START DRIVE**. This
practice start skips the warehouse and deliveries. Parking offers **DRIVE BACK**,
and replay starts a fresh drive. The regular briefing also links to practice.

`src/three/DrivingModel.ts` owns movement, traffic, collision and parking rules;
`src/three/drivingCity.ts` owns the street graph, building footprints and routing;
`driving.ts` owns the city and chase camera, `drivingNavigation.ts` owns the solid
arrow, and `drivingModels.ts` owns imported art. `main3d.ts` connects them
to the existing story. The shared story scripts and mall rules are preserved.

## Verification

`tests/driving-model.mjs` checks both journey durations, braking, shoulders,
collision cooldown/slowdown, independent left/right turns, reverse, alternate
street routes, navigation, traffic signals, pause and slow frames.
`tests/driving-assets.mjs` checks original hashes,
licences and local palette references.
`tests/driving-browser.mjs` checks actual held keyboard controls and multitouch,
parking, penalties, model loading, solid arrow geometry and bearing, an actual
multi-turn detour, cargo preservation, focus pause, driving-only round trips and
replay. The 3D story
browser suite drives both roads before completing all six drops, signatures,
key return, home and results. Fixtures skip the warehouse clock or carry Skanky
between mall stops; the drives and interactions use real browser input.

The audio suite renders the engine, brake and bump cues and checks mute and
cleanup. Physical-phone handling and listening through speakers remain manual
verification.
