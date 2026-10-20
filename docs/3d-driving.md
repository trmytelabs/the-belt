# Five-ton night drives

The default 3D game opens with a drive in Skanky's car from home to the UPS
loading yard when Termite and Skanky choose to go in; parking there starts the
original arrival scenes. It also adds two playable drives after the warehouse shift:
UPS to Southgate Mall before the existing six deliveries, and the city journey
back to UPS after all six signatures and returning the cart to the truck.
The classic game retains its original road scenes.

The neighbourhood has 42 connected intersections on a six-by-seven street grid.
Both the playable bounds and scenery area double the previous city. Its 127
buildings range from small shops to apartment blocks and a 68-metre tower.
Modelled streetlights, 28 existing sedan
models, cones and a delivery box truck fill the streets. The direct trip takes
about 40–60 seconds each way, including turns, traffic and the loading yard. Players can
choose other streets and explore for longer, with no timer or cargo-loss condition.
A raised chase camera follows the actual truck heading.

- W / up arrow accelerates; S / down arrow brakes; A/D / left/right steers.
  Holding BRAKE after stopping reverses slowly, so the truck can back out.
- Every intersection offers real turns. The player moves freely in the city;
  holding GAS never follows a prescribed road or automatically finishes a trip.
  A large green 3D compass at the top points directly toward the destination.
  The horizontal arrow turns around its vertical axis, showing its top and sides
  as it points ahead, left, right or behind. Its bearing uses the actual camera
  direction during turns. Choose streets that head toward it; it shows the
  destination's general bearing rather than a prescribed route.
  This follows the direction concept in the [SEGA game manual](https://www.manualslib.com/manual/318218/Sega-Crazy-Taxi.html?page=7).
- Seven cycling red/amber/green junctions have visible stop lines. Brake before the
  line and continue on green; the traffic also waits. Crossing a red costs 100
  points once, with no cargo loss or game-over condition. Pause freezes signals.
- On touch screens, the stick steers and separate held GAS and BRAKE pedals
  control speed. A second finger can steer while holding a pedal.
- Pull off the public street into each depot's separate paved loading yard.
  Signs, a canopy, dock doors and lighting frame a marked bay 18 metres inside.
  Public road markings end before the yard; stopping on the street cannot park.
  The lit loading bay gently slows the truck. Stop there, then press
  Space or tap PARK. Enter cannot skip the drive. Parking at the mall starts
  the original introduction and cart run; parking at UPS starts the key return.
- A traffic, cone or building bump costs 100 points, with a brief slowdown and a
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
- Traffic follows continuous curved lanes through left/right turns and loop
  seams, faces its direction of movement and queues behind cars ahead.

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

`tests/driving-model.mjs` checks both longer journey durations, braking, shoulders,
collision cooldown/slowdown, independent left/right turns, reverse, alternate
street routes, destination-compass alignment across both destinations, every
street and four headings with camera lag, continuous traffic turns and loop
seams, off-street loading bays, traffic signals, pause and slow frames.
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
