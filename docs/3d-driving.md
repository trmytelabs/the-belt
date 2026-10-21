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

On the drive in from home, Skanky sits at the wheel of his car with Termite
beside him, placed by the car's vehicle contract (`src/three/vehicleRig.ts`):
hips on the seat nodes, the driver's wrists on the rim targets by two-bone
inverse kinematics on the figure's pivots, feet on the pedals and the floor.
The steering wheel turns with the front wheels, and both the car and the
five-ton settle on springs: the nose rises under power and dips under braking,
the body leans out of a bend and a bump kicks it. The five-ton carries no
visible driver because its Kenney cab is opaque.

The traffic is drawn in batches (`src/three/trafficBatch.ts`): each sedan
variant is baked once into paint (tinted per car), trim with its wheels, and
unlit lamps, three batched meshes for all 28 cars, and a car beyond 45 m of the
camera draws a 600-triangle shell with no trim or lamps. Software renderers
keep the procedural cars and download nothing for traffic. Every building has
lit windows on its four faces from one instanced mesh
(`src/three/cityWindows.ts`), seeded so the same windows light every night, and
the plowed road is wet asphalt that reflects the sky, the lamps and the
headlights.

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

## The cab view

V on a keyboard, or VIEW on a touch screen, switches the five-ton's drive
between the chase camera and the cab (`DrivingView.toggleView`); Skanky's car
keeps the chase camera. The downloaded truck's cab is a closed shell with
opaque, painted windows, so the cab view hides the truck's body (the model, or
the procedural parts until it lands) and shows `createTruckCab`
(`vehicleInterior.ts`) instead: the hood in the truck's green with its wipers,
a dashboard with two dimly lit gauges in bezels, a broad wheel that turns with
the front wheels (2.5 times their angle), the windscreen pillars, the header,
the roof lining, the doors, the floor, the passenger's seat and a mirror. The
camera sits at the driver's eyes (`TRUCK_CAB.eye`, left-hand drive) and
pitches and rolls with the body on its springs. The driving browser suite
checks the camera's place and heading, the hidden body, the turning wheel and
the way back, by key and by touch.

The city's traffic keeps to the right, so the cars are left-hand drive: the
sedan contract's driver seat, wheel and pedals sit on the car's left (−z; the
nose is +x), and the plain seats of the procedural car match.

## Black frames and the bloom

On the high-quality renderer the scene draws into a multisampled half-float
buffer and then through ambient occlusion, bloom and the output pass. At some
views a sub-sample of a sliver of geometry resolves to not-a-number: one wrong
pixel (a single-sample render of the same view has none). The bloom blurs its
input down a chain of ever smaller mip levels, so that one value reached every
pixel of the bloom and the frame came out fully black. `guardBloom`
(`bloomGuard.ts`) makes the bloom's input filter treat a not-a-number or
infinite texel as no light; `tests/bloom-guard-model.mjs` checks the shader.
The software renderer draws without the composer and never showed it.

## The chase camera and the scenery

The camera follows a point nine metres behind the truck on an exponential lag.
Through a corner the lag swings it wide, and the city's blocks begin only
12.5 m from each street's centreline, so the camera used to spend a run of
frames inside a building, and a pass along the kerb could put it through a lamp
post for one frame: each a frame of the inside of a mesh, black or near black,
which the owner saw as the screen flashing. `DrivingView` keeps a list of
padded boxes (the buildings, the lamp posts with the reach of their arms, the
signals) and after each frame's lag `pullClear` (`cameraClear.ts`) slides the
camera along its line of sight toward the truck until that line is clear of all
of them. `tests/camera-clear-model.mjs` checks the geometry; the driving
browser suite drives three hard turns and asserts the camera never ends a frame
inside a box and no frame is presented empty.

## The five-ton everywhere

The drive fits a downloaded delivery truck (`cars/delivery`) over the
procedural five-ton (`DrivingModels.place`). The lot and the road stage now do
the same through `dressFiveTon` in `story.ts`, fitted to the procedural
truck's own length so the lot's stall and the road's layout keep their
clearances, with the procedural body as the fallback until the model lands. The
mall's dock truck keeps its cutaway body: its open tailgate is where the cart
runs load.

## Weather on the road

The snow over the road (`Snowfall`, a box that follows the truck) is blown by
the game's one wind (`wind.ts`: a steady breeze toward −x with slow swells and a
gust every two minutes or so), added to the road's own headwind. A second,
smaller box of denser, brighter flakes follows a point seven metres ahead of
the truck along its heading (`snowfall-beam`): the snow the headlights catch.
The driving browser suite checks that it falls ahead of the truck and reads
brighter than the rest.

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
