# Changelog

## 0.1.0 — development snapshot

- Add priority freight to the 3D shift. Through the flow and the rush, every
  third parcel the player could take (their own side, not bulk, heavy freight
  or the Mesa) is marked urgent, one at a time, with a toast and an alert. A
  gold ring around it and a PRIORITY label count down 15 seconds, turning red
  for the last five and hiding the ring while it is carried. Loaded by the
  player in time it pays a 100-point bonus with its own pop and a till ring;
  late, or loaded by the partner, it is an ordinary parcel. The briefing
  explains it and the results count the priority parcels made on time. The
  classic and 2D games are unchanged.
- Add a peak night to the 3D game, unlocked once a night has been finished.
  The briefing then offers PEAK NIGHT beside the ordinary night (P, or the
  button): in the flow and the rush freight comes a fifth sooner, the belt runs
  an eighth faster and recovery holds six parcels instead of seven
  (`PEAK_NIGHT` in `ShiftModel3D.ts`). The opening lesson and Brian's
  incident keep their pace, the story is the same night, and the start toast
  and the results say it was a peak night. The ordinary simulated player that
  wins the normal shift in the model tests still wins a peak one.
- Keep the player's record between nights in the 3D game. Each night that
  reaches the results adds to a record kept in the browser's local storage on
  this device (`nightRecord.ts`): nights worked and finished, the best night
  total with its grade, and which of the three openers have been seen. The
  results say whether the night was a new personal best, or show the best to
  beat; the briefing shows the record. Only a finished shift can set the best.
  A blocked or full storage (a private window) just means no record.
- Add a cab view to the five-ton's drives and put the cars' drivers on the
  left. V (or VIEW on a touch screen) puts the camera at Skanky's eyes in the
  cab: the green hood and wipers, a dashboard with two lit gauges, a broad
  wheel that turns with the steering, the windscreen pillars, header, roof
  lining, doors and the passenger's seat, pitching and rolling with the body
  on its springs; V again goes back behind the truck. The truck's own body,
  whose painted windows are opaque, is hidden while in the cab. The city's
  traffic keeps to the right, so the sedans built in the seating pass are now
  left-hand drive: the driver's seat and wheel moved to the car's left, and
  Skanky walks to the driver's door when he leaves home and the lot.
- Ease the 3D figures into and out of walks and seats. A walk now builds to
  full stride over its first 0.3 s and winds down over 0.35 s, finishing the
  step under way, instead of jumping to full stride or to a stand in a frame;
  the arm swing, knee lift, bob, lean and sway all follow it. Sitting down and
  standing up blend the joints over 0.45 s; off a bench or a couch the hips
  lower and rise with them, while in a car they drop straight into the seat so
  the head never passes through the roof. Fixes the hand-built pose blend added
  in the motion-smoothing pass, which slerped into the joint's own quaternion
  and so held the old pose for 0.22 s and then snapped; it now eases part way
  each frame, and its browser check fails on a hold.
- Fixes from the owner's play. The screen no longer flashes black on the
  drives. Two causes, both found by sampling every rendered frame of a drive:
  now and then a sub-sample of the multisampled scene resolved to
  not-a-number, and the bloom's mip blur spread that one pixel over the whole
  frame, which came out fully black; the bloom's input filter now treats such a
  value as no light (`bloomGuard.ts`). And the chase camera, lagging through
  a corner, could end a run of frames inside a building beside the road; it now
  slides along its line of sight toward the truck until that line is clear of
  every building, lamp post and signal (`cameraClear.ts`). The five-ton in the lot and on the road stage
  now wears the same downloaded model as the drive, fitted to the procedural
  truck's own length so the stall and the layout keep their clearances (the
  mall's dock truck keeps its cutaway body, whose open tailgate the cart runs
  use). Shan walks to Skanky facing the way he goes in the clock-out and the
  mall assignment, and turns to him on arrival, instead of crab-walking sideways.
  The two figures in the Mesa dream carry a motion record, so the crew models
  play seated idles under the hand-set guitar and controller arms instead of
  copying a few sine waves; Vic eases into his spot for the Mesa offer.
- Make the 3D night colder and livelier. One wind blows through every
  snowfall in the game (the depot yards, the lot and the other stages, the
  drive), a steady breeze toward the west with slow swells and a gust every two
  minutes or so (`wind.ts`; `Snowfall.update` takes a crosswind). On the drive
  a denser, brighter fall a few metres ahead of the truck is the snow its
  headlights catch. Out in the cold at the lot and on the road the standing
  cast breathe out faint clouds every few seconds, carried off by the wind. The
  plowed lot is wet enough for the lamps and headlights to lie in it, as the
  road already was.
- Give the whole 3D crew eye contact and the depot its footsteps. Every
  unposed character turns its head to the nearest person speaking within
  earshot, else to a worker passing close by, and eases back when nothing holds
  its attention; in the story scenes the cast look at whoever is speaking and
  the speaker at the nearest listener (`attention.ts`). Footsteps are read off
  the feet themselves, an imported model's foot bones or the figure's ankles,
  so each sound lands when the visible foot does, softer with distance from the
  camera and hollower on the steel deck than on the concrete; the crew's lifts
  off the belt and set-downs are heard the same way (`footsteps.ts`,
  `DepotAudio.footstep`/`playNear`). The classic game's cue list is unchanged.
- Loosen the 3D crew's motion (phase 5, after the owner found the gestures,
  the house scene and the turns stiff). Seated passengers on the crew models play
  Rocketbox seated idles, their legs kept on the seat, and look around now and
  then (a driver keeps the whole figure so the hands stay on the wheel); standing idles are broken
  every ten seconds or so by a look around, a scratch of the head or a stretch;
  shouting and swearing play an angry gesture and a raised hand a wave; a big
  change of facing while standing is a turn on the spot over 0.7 s, the model
  stepping round on a turn clip (the converter strips the clip's own yaw) while
  the root comes round at the same pace; and every hand-built pose now blends in
  over 0.22 s from the joints' last positions instead of snapping, on the models
  and the figures alike. Reduced motion keeps everything as it was.
- Lift from the knees and climb the stairs on the treads (phase 4 of the
  models and animation plan). A grab, recovery, load or put-down on an
  imported crew model plays the Rocketbox crouch-in and crouch-out clips
  (converted into `crew-clips.glb`, each half timed to its measured movement)
  while the arms keep the figure's reach for the parcel; a throw keeps the
  figure's swing. On a stair flight or an aisle's steps every worker and crew
  member plants each foot on the tread under it, bending the uphill knee and
  reaching the downhill foot, with a swinging foot keeping its lift; a model's
  legs follow the figure on a flight and the software fallback does the same.
- Light and batch the 3D city (phase 3 of the models and animation plan). The
  28 traffic sedans draw as three batched meshes (paint tinted per car, trim
  and wheels by vertex colour, unlit lamps) with each car switching to a
  600-triangle shell beyond 45 m, in place of 28 full models; the player's
  car and the lot's cars keep theirs, and software renderers keep the
  procedural stand-ins and download nothing for traffic. Every building gets
  lit windows on all four faces as one instanced draw, about half of them lit
  in warm, cool or dim light under the bloom. The plowed road and the loading
  aprons are wet: low roughness reflects the sky, the lamps and the headlights.
- Seat the 3D crew properly in their cars (phase 2 of the models and
  animation plan). The sedans' generated interior now carries a vehicle
  contract of named empties: four seats, the steering wheel, the driver's
  wrist targets on the rim, every seat's resting hands and feet, and a
  suspension pivot. Drivers and passengers in the UPS lot and on the drive
  in from home sit with their hips on the seats; two-bone inverse kinematics
  on the figure's own pivots puts the driver's hands on the wheel (unless a
  gesture owns the arms), the passengers' hands on their laps and everyone's
  feet on the pedals or the floor, and the imported models follow their
  figures as before. The steering wheel turns with the front wheels, and the
  car and five-ton bodies pitch under power and braking, lean out of a bend
  and jolt on a bump. Skanky and Termite ride in the car on the commute. A
  clearance suite now checks every seated joint stays inside the cabin and
  on its targets instead of only under the roof line.
- Remove the 2D depot. The 3D depot is the only night shift; its briefing,
  results screen and WebGL fallback offer the original full shift
  (`?mode=classic`) instead of `?mode=2d`, which now opens the 3D depot like
  any other address. The 2D scene, its art, browser suites, touch styles and
  docs are gone; the shared shift, story and mall models stay, and the source
  parity checks read the 3D set pieces and cast instead. The classic game is
  unchanged. The Windows CI job runs `test:browser:classic`.
- Make the 3D night's models more realistic. The twelve depot trucks are
  rebuilt as cab-over box trucks: riveted aluminium-white boxes with rub and
  cap rails, livery bands and cabs in each crew member's colour (Paula Abdul's
  stays purple), fleet-brown cabs on the player's four, raked windshields,
  door seams, mirrors, roof and side markers, grilles, chrome bumpers, dual
  rear wheels, fuel tanks, battery boxes and mud flaps. Twelve more Poly Haven
  CC0 models join on GPU renderers: a photographed cardboard box stands in for
  the plain parcels, the bulk stock, Ralph's load, the receiving cargo and the
  unloaders' crates; metal racks join the depot's front corners; the UPS lot
  gets a real chain-link fence (with its gate) and lamp posts; the living room
  a leather sofa, armchair, coffee table, bookcase and wall clock; Tim Hortons
  a wall clock. A half-resolution screen-space ambient-occlusion pass, fed by
  the main render's own depth so it draws the scene no second time, grounds
  the scene without letting tags, rings or snow cast false shadows. The
  converter keeps alpha cut-outs as PNG; software renderers keep every
  code-built stand-in and download nothing.
- Polish the 3D depot's motion, camera and feedback. Walking leans and sways
  the torso; a heavy box leans the carrier back and lowers the arms; grabbing,
  loading and putting down dip the knees and a throw swings the arms; Termite
  and Skanky's heads turn to the parcel they can grab or the drop they are
  heading for; a carried box bobs with the step. The follow camera leads a
  walking worker, rattles on a breakage and keeps its oblique angle at the
  back of the depot: the terminal wall fades out ahead of the camera, showing
  the snowy lot behind, instead of forcing a top-down view over the stairs,
  floor drops and bulk. A carried parcel's tag rides higher, clear of the
  face. Clean dispatches throw gold sparks and pop points that grow
  with the streak, the chase camera jolts on a road bump, a soft vignette
  frames the picture and hazard stripes mark the top of each stair flight.
  Reduced motion disables every new movement.
- Set the 3D night at Christmas. Snow covers the yards outside the depot's
  bays, the UPS lot, the road, home, the city drive and the view from the break
  stops, and keeps falling (the flakes hold still with reduced motion). Shan wears a Santa hat,
  which stays on over his imported model. Through the three-minute shift,
  cartons pile up at random against the depot's corner walls until the columns
  reach the top and start tumbling off the edges onto the floor; the piles stay
  in corners no worker, coworker or truck uses and reset each night.
- Stage the 3D Tim Hortons break inside the restaurant, at a booth and the
  pickup counter, beside a Christmas tree and a snowy window. Only the wording
  that placed the crew in the car changes ("We haven't left the counter."); the
  2D depot keeps the original parking-lot script. The 7-Eleven break gains a
  window onto the snowy street.
- Fill the strip behind the 3D bulk area, either side of the bulk pile, with
  cartons up to the top of the rear wall through the shift, out of every
  worker's reach and without spilling onto the bulk drops.
- Make Termite and Skanky's house a closed, furnished living room: solid walls
  with skirting, crown molding, a ceiling, curtained windows onto the snowy
  street, a framed side door, a bookcase, armchair, dining corner, coats, rug,
  pictures, a clock, a Christmas tree with presents and string lights. Every
  indoor shot is taken from inside the room.
- Stage Ben's 3D robbery in the open end of his aisle, where no truck hides it;
  the gunman and Paula walk in from the yard. Enter or SKIP SCENE skips it,
  passing over its lines, shots and sounds.
- Remove the scanner-reset fault from the 3D shift; the 2D depot keeps it.
- Fix a black 3D depot when the game loaded in a hidden or zero-size window.
- Open the 3D night at Termite and Skanky's place. They choose to go in or quit
  UPS. Quitting plays an all-nighter with a Warsteiner keg, Hershey's Eggies,
  Twilight Princess on the Wii and Heavy Metal, Skanky being sick and Shan's
  morning call, which Termite ends with "We no longer work
  for UPS." Going in walks them out to Skanky's car for a playable drive from
  home to the UPS yard, followed by the original arrival scenes. The 2D depot and
  classic game keep their original openings.
- Add a driving-only practice start and freely connected streets with 42 real
  intersections, twice the previous playable area, 127 buildings from small shops
  to apartments and a 68-metre tower, 28 cars and locally served Kenney models.
  Rename the 3D destination Southgate Mall. A large green compass turns in 3D
  toward the actual destination, accounting for the chase camera's bearing.
  Traffic steers through continuous curves and queues behind other cars.
  Longer drives end inside separate lit loading yards at UPS and Southgate.
  Brake at working lights and hold BRAKE to reverse; bumps and red crossings
  cost 100 points while cargo stays safe. Detours have no deadline.
- Match 3D receiving collisions to its angled feeder guards and head drive,
  leaving a clear crossing and keeping the workers apart around the belt top.
- Start the 3D lo-fi at START THE NIGHT and resume it after pausing the opening.
  Replace handling, impact, latch and interface tones with 24 small local CC0
  recordings, mix varied quiet foley, and use a pulsed diesel bed on the road.
- Refresh lower-floor stack culling bounds as cartons arrive so delivered
  freight stays visible, and remove invisible sorting-lane fences beside the
  belt, recovery tray, bulk and stair approaches while retaining solid scenery.
- Add two short 3D five-ton drives between UPS and the mall, with a raised chase
  camera, traffic, cones, keyboard and held touch pedals.
  Parking continues the existing deliveries and key return; driving deductions
  stay separate from warehouse grading, while cargo and signatures stay safe. Retain
  lo-fi music with quiet engine, brake and bump cues, pause, mute and clean replay.
- Add John Rushton's two-lane patrol and random squat sets, plus Shan and Vic's
  loading-lane patrols with a brief slowdown when squeezing past them.
- Let Space grab/park the 3D mall cart, highlight eligible truck bundles, skip
  empty slots and show 6–10 real cartons per store delivery.
- Highlight the parcel Space can grab, and keep empty interactions quiet while
  retaining error sounds for actual wrong deliveries.
- Grade 3D recovered freight by its final dispatch outcome, with S at 95% and
  a visible breakdown instead of permanent errors for belt-end incidents.
- Guide carrying approaches through both stair flights and keep location street
  ranges on the floor, removing floating truck, stair and floor-drop signs.
- Recast Kylie as a short Asian man and AJ as a clothed bald man with glasses.
- Add a recorded chill lo-fi soundtrack created in Google Flow Music, smooth
  loop transitions, softer package foley and dialogue ducking in 3D.
- Start 3D truck engines with one minute left, showing headlights, exhaust,
  a continuous diesel idle and occasional loader coughs.
- Make engine exhaust larger and more frequent, lower the hum, and gently shake
  running trucks while respecting reduced motion, pause and restart.
- Announce lunch in the warehouse with a whistle and a multi-second
  15 MINUTE LUNCH BREAK alert before travelling to the lunch location.
- Combine the 3D gameplay with 23 rigged Microsoft Rocketbox characters,
  preserving their animations, attached props and software-renderer fallback.
- Spread truck rows apart and stage crew events between them, keeping loading
  doors clear and the bulk platform and left/right stairs at the back.
- Restrict 3D package selection to the controlled worker's own routes and bulk.
- Guide off-centre truck entry into the cargo aisle without increasing walking
  or touch-stick speed, and allow more empty-handed movement between shelves.
- Walk the same crew out of the scrum to platform work stations, with frequent
  parcel collection/loading and brief original gags. Keep Shan visible at work.
- Reveal people through soft circular cutaways in foreground truck parts,
  restoring the solid view as they move away.
- Keep elbows beside the torso, soften the walking swing and separate fists
  during angry gestures so the crew no longer appears to clap through its chest.
- Upgrade 3D cars to two detailed sedan models and the devil to an animated,
  winged Quaternius model. Include CC0 provenance and procedural fallbacks.
- Sort street addresses against city district ranges, including Mill Woods for
  Termite, with neutral signs and no visible routing letters or answer guidance.
- Let the uncontrolled coworker collect and deliver freight automatically.
  In 3D, bulk remains exclusively for the currently controlled worker.
- Mix sixteen ordinary package labels with the existing reference freight.
  Ease 3D arrivals to 4.8 seconds initially, 3.2 in flow and 2.4 in rush.
- Keep carried packages in front of workers, accounting for their scaled depth.
- Throw down from the stair top with a 30% break risk; breakage costs points
  once and brings Shan over yelling.
- Resume the shift after a caught Mesa theft with a 500-point maximum penalty.
- Restore the 3D rear bulk platform, outward left/right stairs and original area
  order; keep all drops in front of the final wall.
- Remove 3D safe-zone and aiming guides; wrong drops cost up to 10 points.
- Brighten 3D night scenes, the warehouse and the bedroom dream; make the scrum
  approach Shan facing forward.
- Enter trucks to place actual parcels on shelves, with a transparent roof while
  inside, persistent cargo and rear overflow when full.
- Paint street ranges on the floor and tidy the ground drops with pallets.
- Record 3D as the only actively developed game version.

This is an unpublished development snapshot. No deployment or release is part
of this change.
