# Five-ton night drives

The default 3D game adds two playable drives after the warehouse shift:
UPS to Mallwood Centre before the existing six deliveries, and the same road
back to UPS after all six signatures and returning the cart to the truck.
The legacy 2D depot and classic game retain their original road scenes.

Each journey covers a compact 282-metre road with four rounded street corners,
over 30 buildings, modelled streetlights, ten existing sedan models, cones and a
modelled delivery box truck. Steering the turns and stopping at a red light
reaches the loading bay in about 26 seconds. This is a relaxed trip,
with no timer or cargo-loss condition. A raised chase camera follows the truck.

- W / up arrow accelerates; S / down arrow brakes; A/D / left/right steers.
- Steer left and right through the signed corners. Modest turn assistance helps
  without completing the turns; broad, soft shoulders nudge the nose back towards
  the road and prevent wedging. The chase camera looks ahead around each corner.
- Two cycling red/amber/green signals have visible stop lines. Brake before the
  line and continue on green; the traffic also waits. Crossing a red costs five
  points once, with no cargo loss or game-over condition. Pause freezes signals.
- On touch screens, the stick steers and separate held GAS and BRAKE pedals
  control speed. A second finger can steer while holding a pedal.
- The lit loading bay gently aligns and slows the truck. Stop there, then press
  Space or tap PARK. Enter cannot skip the drive. Parking at the mall starts
  the original introduction and cart run; parking at UPS starts the key return.
- A traffic or cone bump costs five points, with a brief slowdown and a
  1.5-second collision cooldown. A struck object cannot charge twice. Bundles,
  cart loads, delivery credit and signatures remain owned by the mall rules.
- The results show driving deductions separately from warehouse and mall
  points. The mall still awards 50 points per signature, and the warehouse
  dispatch grade is unchanged.
- Escape / PAUSE or focus loss pauses both truck and traffic. M / MUTE silences
  music and effects. Pausing stops the engine layer and releases held controls.
  Replay resets the drive, deductions and input while reusing the road's art.

The recorded chill lo-fi music starts with START THE NIGHT and continues on the
road. A quiet speed-dependent pulsed diesel layer, soft brake hiss and recorded
bump cue use the 3D Web Audio system. Small locally served CC0 recordings also
replace handling, latch and interface effects; see
[foley sources](../public/audio/FOLEY-SOURCES.md). Seven small CC0 Kenney models
upgrade the buildings, lamps, signals and road truck, with procedural loading
and failure fallbacks. Sources, original licences and hashes are in
[driving asset sources](../public/models/driving/SOURCES.md).

Open `?mode=3d&drive=mall` or `?mode=3d&drive=ups` for **START DRIVE**. This
practice start skips the warehouse and deliveries. Parking offers **DRIVE BACK**,
and replay starts a fresh drive. The regular briefing also links to practice.

`src/three/DrivingModel.ts` owns movement, traffic, collision and parking rules;
`src/three/driving.ts` owns the road and chase camera, and `drivingModels.ts`
owns imported art. `main3d.ts` connects them
to the existing story. The shared story scripts and mall rules are preserved.

## Verification

`tests/driving-model.mjs` checks both journey durations, braking, shoulders,
collision cooldown/slowdown, manual turns, traffic signals, pause, reversed road
geometry and slow frames. `tests/driving-assets.mjs` checks original hashes,
licences and local palette references.
`tests/driving-browser.mjs` checks actual held keyboard controls and multitouch,
parking, penalties, model loading, cargo preservation, focus pause, driving-only
round trips and replay. The 3D story
browser suite drives both roads before completing all six drops, signatures,
key return, home and results. Fixtures skip the warehouse clock or carry Skanky
between mall stops; the drives and interactions use real browser input.

The audio suite renders the engine, brake and bump cues and checks mute and
cleanup. Physical-phone handling and listening through speakers remain manual
verification.
