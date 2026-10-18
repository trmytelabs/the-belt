# Five-ton night drives

The default 3D game adds two playable drives after the warehouse shift:
UPS to Mallwood Centre before the existing six deliveries, and the same road
back to UPS after all six signatures and returning the cart to the truck.
The legacy 2D depot and classic game retain their original road scenes.

Each journey covers a compact 284-metre road with four broad bends, streetlights,
existing sedan models, cones and the existing five-ton truck. Holding the
accelerator reaches the loading bay in about 23 seconds. This is a relaxed trip,
with no timer or cargo-loss condition. A raised chase camera follows the truck.

- W / up arrow accelerates; S / down arrow brakes; A/D / left/right steers.
- Gentle turn assist follows the road's bends. Steering moves across the lanes;
  broad, soft shoulders keep the truck clear of scenery and prevent wedging.
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

The recorded chill lo-fi music continues on the road. A quiet speed-dependent
diesel layer, soft brake hiss and short bump cue use the existing 3D Web Audio
system. No additional downloaded audio or model assets are required.

`src/three/DrivingModel.ts` owns movement, traffic, collision and parking rules;
`src/three/driving.ts` owns the road and chase camera. `main3d.ts` connects them
to the existing story. The shared story scripts and mall rules are preserved.

## Verification

`tests/driving-model.mjs` checks both journey durations, braking, shoulders,
collision cooldown/slowdown, pause, reversed road geometry and slow frames.
`tests/driving-browser.mjs` checks actual held keyboard controls and multitouch,
parking, penalties, cargo preservation, focus pause and replay. The 3D story
browser suite drives both roads before completing all six drops, signatures,
key return, home and results. Fixtures skip the warehouse clock or carry Skanky
between mall stops; the drives and interactions use real browser input.

The audio suite renders the engine, brake and bump cues and checks mute and
cleanup. Physical-phone handling and listening through speakers remain manual
verification.
