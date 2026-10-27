# The Belt

The Belt is a browser game built with Three.js, Phaser, TypeScript and Vite.

Active development targets **the 3D depot only**. The original full shift is
retained as a legacy version; new gameplay requests apply to 3D unless the
owner explicitly requests another version.
Players switch between workers, pick up packages and sort them to the appropriate
dock. The game includes keyboard, mouse and touch controls.

This repository (public since 2026-10-26, at the owner's choice) holds The Belt 1.1.0 (see CHANGELOG.md; releases are on
GitHub with a packaged web build). The game is published from `main` at
https://trmytelabs.github.io/the-belt/. Review playability in the browser when
changing game behavior.

## Run locally

Install Node.js 24 (with npm), then run from the repository root:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The default entry is the **3D depot**: the
night shift in a lit Three.js warehouse, with every original reference event and
speech bubbles anchored to whoever is speaking. On touch screens it shows a
movement stick and GRAB / DELIVER, SWITCH, STOP THE BELT, VIEW and PAUSE buttons. It needs
WebGL; without it the page links to the original full shift. See
[the 3D depot](docs/3d-preview.md). The crew uses 23 rigged Microsoft Rocketbox
characters, with procedural figures on software graphics. Their animation,
props and provenance are covered in [character models](docs/character-models.md).
On GPU renderers the crew walk, run, idle, cough, cheer, clap, wave, phone,
crouch, dance, drink, shrug and announce with motion-captured Rocketbox clips
(MIT) made for their own skeleton; poses without a clip, carried boxes and
reduced motion keep the hand-built animation below.
Arms stay beside the torso with natural elbow bends during walking, carrying
and gestures. Walking leans the torso in and sways it with each step; a heavy
box pulls the carrier back onto their heels; grabbing, loading and putting down
dip the knees, and a throw swings the arms. Termite and Skanky's heads turn
toward the parcel they are about to grab or the drop they are carrying to, and
everyone else turns theirs to whoever is speaking nearby or a worker passing
close by. Footsteps land when the visible feet do, softer with distance and
hollower on the steel deck, and the crew's lifts and set-downs are heard too.
Cars use two detailed sedan models, and the devil uses an animated
horned, winged model. These compact CC0 models retain the existing story paths
and have procedural fallbacks; see [prop sources](public/models/PROP-SOURCES.md).
Kylie is a short Asian man; AJ is a clothed bald man with fitted glasses.
The shift plays a recorded chill lo-fi instrumental made in Google Flow
Music; each other place and mini-game has its own track by Kevin MacLeod
(incompetech.com, CC BY 4.0, credited in the ending), crossfaded as the night
moves on. Loops are smooth, package foley quieter, and music ducks
under dialogue. It starts with START THE NIGHT, during the arrival scene.
Package rustles, impacts, mechanical latches and tablet clicks use small local
recordings, with subtle variation and controlled volume. M mutes both music and
effects. Source details are in [music sources](public/audio/MUSIC-SOURCES.md)
and [foley sources](public/audio/FOLEY-SOURCES.md).
The floor, belt, rails, trucks, parcels, arrival lot and city streets use small CC0 photo textures; see
[depot surface textures](docs/textures.md). The twelve depot trucks are
cab-over box trucks with riveted aluminium boxes, each crew member's colour on
the cab and livery band, fleet-brown cabs on the player's four, mirrors, roof
markers, dual rear wheels, fuel tanks and mud flaps. On GPU renderers the
plain parcels, the bulk stock, Ralph's load and the receiving cargo are a
photographed cardboard box, the UPS lot has a real chain-link fence and lamp
posts, the living room has a leather sofa, armchair, coffee table and bookcase,
and a screen-space ambient-occlusion pass grounds everything; see
[prop models](docs/prop-models.md). The sedans carry a vehicle contract
(`src/three/vehicleRig.ts`): named seats, a steering wheel that turns with
the front wheels, hand and foot targets and a suspension pivot, so the
drivers and passengers in the lot and on the drive in from home sit on
their seats with their hands on the wheel or their lap and their feet on
the pedals or the floor, and the body pitches under power and braking and
leans out of a bend. On the road the 28 traffic sedans draw as three batched
meshes that switch to a small shell at a distance, every building shows lit
windows from one instanced draw, and the wet asphalt reflects the night. Lifts
and put-downs on the crew models play the Rocketbox crouch clips, on the stairs
every foot stands on its own tread, seated crew play seated idles, standing
idles fidget, a big turn steps round on a turn clip and every hand-built gesture
blends in rather than snapping.

One wind blows through every snowfall, gusting now and then; the headlights
catch the snow ahead of the truck; and out in the cold the cast's breath shows.
Your record (nights finished, your best night total and grade, the openers you have seen) is kept in this browser and shown on the briefing and the results.
Finish a night and the briefing offers a peak night (P): faster freight, a quicker belt and one fewer slot in recovery.
The 3D game plays a whole snowy Christmas night: it starts at home, where Termite and Skanky decide whether
to go in or quit UPS (quitting ends the night on the couch with a Wii; going in
means driving Skanky's car to work), then one of three random
arrivals outside the locked gate, Shan's morning scrum, the warehouse shift
(peak season: cartons pile up against the walls until they hit the top and
overflow) with a lunch inside Tim Hortons and the Timmies run back (balance two trays of coffees
through Termite's driving), then the five-ton: Skanky's mall run (a 3D mall inspired by Edmonton's
Southgate Centre) or Termite's paper route with Ralph, and at last breakfast with Vic at Cha for Tea
before going home. Story scenes advance by themselves; Space
shows the next line and Enter skips the scene. See
[the overnight shift expansion](docs/overnight-shift-expansion.md).

The shift is one polished three-minute warehouse section, followed by
up to 25 seconds to clear remaining freight in 3D. Press Enter or tap **START THE NIGHT**. Dispatch
42 parcels and keep the recovery backlog below seven (the seventh ends the shift). The original **3, 2, 1,
SORT!** countdown starts the shift.

- WASD / arrows move; Tab or right-click switches workers.
- Space or left-click grabs, loads inside a truck, delivers at a floor drop,
  or puts a parcel down. Carry truck freight through its open rear door.
  All packages for the selected worker have bright cyan rings, including ones
  still travelling toward them. The parcel Space will grab also has a gold arrow
  and a GRAB prompt. Other workers' freight stays visible without those rings. Empty button
  presses stay quiet; incorrect deliveries still sound an error and cost points.
- Inside a truck the roof turns transparent. Face a shelf and load near where
  you stand; the actual parcels remain on the shelves. Full shelves overflow
  through the rear opening. The roof returns when you leave.
- Rear doorways gently guide an off-centre approach into the aisle. A soft
  circular cutaway follows people beside trucks so the bodies cannot hide them
  or their packages; the rest of each truck stays solid.
- F (or THROW) throws toward the nearest drop. At the top of the stairs it
  throws to the lower-floor drop with a 30% break chance. A break earns nothing,
  costs up to 150 points once, and Shan runs over yelling.
- The raised platform ends at the back wall, behind both player truck rows.
  Stairs descend outward to the left and right, with tidy pallet drops below.
- The briefing teaches three steps: grab, follow the destination, then load inside
  the truck. Package labels show the sorting street number in large type, with
  the full address and freight name below. A persistent guide names the destination
  and next direction; a gold circle highlights the correct truck door or floor drop,
  without floating action labels.
  Termite covers Mill Woods (10–49 ST), Downtown (90–109 ST) and the
  Westmount floor drop (110–129 ST). Skanky covers Bonnie Doon (50–89 ST),
  West End (130–169 ST) and the Northside floor drop (170–199 ST). Oversize
  freight goes to shared bulk. These are synthetic game districts.
- The other worker automatically loads their own address ranges. Only the worker
  you control collects bulk. Random everyday freight mixes with the original
  joke parcels. Arrivals allow more breathing room: every 4.8 seconds initially,
  3.6 seconds in flow and 2.8 seconds in rush. The later belt speed increases are
  gentler, and heavier freight retains at least 82% of the quicker walking speed.
- District names and street ranges are painted beside the truck doors. The
  destination marker guides loading; throws still target the nearest physical drop
  and retain their break risk. A wrong drop costs up to 10 points.
  See [address sorting and loading](docs/address-sorting.md).
- Priority freight: through the flow and the rush, every third parcel your worker
  could take is marked urgent (never bulk, heavy freight or the Mesa), one at a
  time. A gold ring around it runs down over 15 seconds (20 with the PRIORITY
  GRACE perk), turning red for the last five. Load it yourself before it empties for a 100-point bonus; late, or
  loaded by your partner, it is an ordinary parcel. Results show how many made it.
- Medals: twelve achievements, each earned once and kept with the record on
  this device (two are for the endless shift: reach level 5, or dispatch 60 in
  one run; others include an S, a peak night, all three goals in one night, 20 in
  a row, or bringing the five-ton home with no bumps or red lights). The
  results name new ones; the briefing counts them and MEDALS lists them all,
  with your last eight nights below (a bar for each total, then grade, total
  and freight dispatched). Once a night is finished, the briefing folds its
  HOW TO PLAY section into one line (click it to open), so the record, goals
  and perks come first.
- Seniority: finished nights and medals climb six titles, from NEW HIRE through
  PART-TIMER, LOADER, SENIOR LOADER and PRELOAD LEAD to BELT LEGEND (15
  finished nights and every medal). The briefing names yours and what the next
  takes; the results announce a promotion.
- Racing your best: the best night keeps its shift score every five seconds,
  and on later nights a small line under YOUR SCORE shows how far ahead (green)
  or behind (red) of that pace you are at the same moment of the shift.
- Inspections: twice a night the supervisor on your side (Vic or Shan) watches
  you for 20 seconds, with a WATCHING tag over them and a countdown on the HUD.
  Each load meanwhile earns 50 points (75 with the SUPERVISOR'S FAVOURITE
  perk); a wrong drop costs 30 more.
- Perks: once a night is finished, the briefing offers three perks for the
  night (1, 2 or 3 picks one; LB / RB on a controller), such as a fourth belt
  stop, more time on priority freight or quicker feet. They last that night
  only, and the HUD shows tonight's as a gold chip after the goal chips.
- Endless shift: once a night is finished, N (or ENDLESS SHIFT) starts a shift
  with no clock and no story. Each minute from the rush the freight comes
  sooner and the belt runs faster, until recovery overflows. It keeps its own
  best, apart from your nights, and the HUD names that best to beat.
- Night goals: each night sets three optional goals, named in the briefing
  (for example, load 8 in a row, finish with nothing broken, make 3 priority
  parcels on time). They rotate with the nights recorded on this device, and the HUD tracks each one. A goal
  you reach mid-shift is announced at once; goals about a clean shift are judged
  when it ends. Each goal met adds 150 points to the night total.
- E / STOP THE BELT stops it for two seconds. You get three stops per 3D run
  (four with the ONE MORE STOP perk), with a 15-second cooldown starting on each use. The controls show stops left
  and cooldown time; starting another night restores all three.
- Controllers with the standard layout work too: stick or d-pad to move, A to
  grab and deliver, B to throw, X to stop the belt, Y to switch, Back for the
  overview, Start to pause; on the road the triggers are gas and brake. On the
  briefing Y starts a peak night, X the endless shift, and LB / RB step through
  the perks (on the mall run's practice briefing, B starts at BENTLEY). On the briefing, pause and results screens the d-pad or stick
  highlights a button or setting, A presses it, left and right move a slider,
  and B goes back. A controller that drops out mid-play pauses the game. Pads
  with rumble shake on a wrong drop, a breakage and a bump on the road.
- PLAY ONLINE (O on the briefing) plays the belt, the game's two-player part,
  on two computers, as an endless shift (no finished night needed): one player
  hosts and is Termite, the other opens the room link (or PLAY ONLINE, JOIN and
  the six-character code) and is Skanky, player 2. The shift runs on the host's
  computer; the host shares the game's tab (Chrome or Edge on a computer) and
  the joining player sees it, with the game's sound, on a light page that loads
  no engine (`?join=CODE`), playing with keys, a controller or touch. Either
  can pause; the joining player's keys can do nothing else. Voice chat rides the same link (K mutes the microphone on
  either side; headphones keep the game's sound from echoing). PeerJS's free
  public server introduces the two browsers, then everything goes directly
  between them over WebRTC; each player can see the other's internet address.
  Some strict networks block the direct link. `?online=local` links two tabs of
  one browser instead, with no picture or voice, for the tests and a try-out.
- Escape pauses; M toggles sound. SETTINGS on the pause screen sets the music
  and effects levels and the resolution (down to half, for a smoother game on a
  slow or very sharp screen) and turns the breakage camera shake on or off; they are
  kept on this device. END NIGHT there drops the night without recording it
  and goes back to the briefing. HOW TO PLAY sums up the rules (goals,
  inspections, perks and the endless shift included) and names a connected
  controller's buttons. Losing focus pauses the preview automatically.
- The closer camera follows your worker up and down the belt, leads them a
  little as they walk, and reframes when you switch workers. At the back of
  the depot the terminal wall fades out so the view stays oblique over the
  stairs, floor drops and bulk. V, or the Overview button, shows the whole
  warehouse.
- Walk up past the first truck row to see the receiving dock: two incoming
  semis, unloaders and a smelly dockhand feeding the next real parcel onto the belt.
- Original named crew bays are preserved above the two player truck rows.
  Rows are spread apart, with crew events and props between the trucks.
  Incoming articulated semis occupy the receiving area above those rows.
- After the morning scrum, the same crew walk to their stations. They stay
  mostly on the platform, collecting and loading parcels on short work cycles;
  their boxes visibly ride the belt before the same box is lifted into their hands.
  Braking holds those boxes on the tread and the crew wait for them to arrive;
  the original gags remain brief interruptions. Shan stays visible between reactions.
- John Rushton walks both sides of the belt, crossing around its head and stopping
  for occasional sets of squats. Shan O'Mack and Vic patrol the loading lanes
  between their existing scenes. Squeezing past them briefly slows your worker;
  there is room to step around, and patrols stay clear of the stairs.
- Pick up missed freight near the belt exit to recover it for half base points.
- Recovered freight counts as dispatched for the 3D grade. S starts at 95%;
  freight left behind, wrong drops and excess breakages lower the percentage.
  Results show the calculation. Recovery still reduces points and breaks a streak.
- Streaks: each clean load in a row adds 15 more points, up to +150. From 10 in
  a row you are ON FIRE, and the worker you control walks 8% faster until the
  streak ends.
- Approaching either stair flight gently aligns the worker with its clear
  centre, including while carrying bulky freight.
- With one minute left, the trucks start their engines, illuminate headlights
  and emit exhaust. Loaders occasionally cough while continuing their work.
- Lunch starts with a whistle and a short **15 MINUTE LUNCH BREAK!** alert,
  still inside the warehouse. Only after the alert does the game travel to
  lunch; the shift and held freight remain paused.
- In the mall, Space also grabs or parks the cart. Each stop has a labelled bundle
  of 6–10 cartons; the cart carries two stops per trip. Taking freight highlights
  an available bundle for the current run and skips empty truck slots. Delivering
  a stop removes that stop's bundle while the other one stays on the cart.
  Try just the mall run at `?mode=3d&minigame=mall` (TRY THE MALL RUN on the
  briefing): all four runs from the truck, or START AT BENTLEY (B) for the fourth
  run with the six other stores already signed, straight on to the refusal, mall
  security and the chase. It ends on a card with the mall bonus instead of the
  drive back to UPS; AGAIN plays it again from the same start. The Timmies and
  Ralph runs open the same way, at `minigame=coffee` and `minigame=ralph`.
- In 3D, drive the five-ton from UPS to Southgate Mall and back, about 40–60 seconds each
  way. W / up accelerates, A/D / left/right steers and S / down brakes. Touch has
  a steering stick plus held GAS and BRAKE pedals. Hold BRAKE after stopping to reverse.
  Explore a city with twice the previous playable area, 42 connected intersections,
  127 shops, apartments and towers, and 28 cars that steer through curved turns.
  A large green 3D compass points directly toward the destination as you choose
  your streets. Brake at working traffic lights, pull off the street into the
  separate UPS or Southgate loading yard and stop in its lit dock bay.
  Press Space / PARK to continue. Bumps cost 100 points and briefly slow the
  truck; crossing a red light costs 100 points, and cargo stays safe.
  Escape / PAUSE and M / MUTE work on the road too. Try just the driving at
  `?mode=3d&drive=mall` (or `drive=ups`); parking offers the trip back.
  See [the 3D driving mini-game](docs/3d-driving.md).
- Each delivery drive is timed against par: parked within a minute pays 200
  points, within 1:20 pays 100. Bumps and red lights still cost 100 each.

Touch devices have a movement stick and Switch, Grab / Deliver, and Stop the
Belt buttons. Landscape gives a closer view; portrait reserves room below the game
for controls. The preview includes a restartable results screen.

The new scene includes the source's specific references: all of Kylie's coffee
lines and Shan's rants, AJ and Vic's massage, the United Way announcement and
swearing crew, Ben's dodge-training disaster, demon and Paula, and the original
named freight. Hussan collects and dances with THE SNAKES CELL. Vic stops the
belt and Shan physically restarts it. Brian sends five real parcels to bulk;
after five accumulate, Ralph loads them into his five-ton truck and heads back
to his three sets of triplets. The crew has its own trucks and personal props,
including Paytman's fish tank and Donna's Warcraft vignette. Brian's much larger
curling green stink trails make his particular contribution unmistakable. Drivers, keys,
exhaust, coughs, clock-out lines, departures and original grade quotes return.

Ben's robbery, dodge-training, demon and Paula sequence plays out in the open
end of his aisle, past the parked trucks, with a clear close-up: the
belt, freight, workers, shift clock and other crew routines freeze until it
finishes. Enter or SKIP SCENE skips it. Escape or losing focus pauses the story too. The camera then returns
smoothly to your worker and sorting resumes from the same positions. Everyday
banter, the CELL dance, massage and loading routines continue during gameplay;
Mesa retains its existing paused choice and dream.

Vic's Mesa offer supports Y/N and touch. Leaving keeps the parcel; stealing
has a fresh 20% catch chance per attempt, so consecutive catches are possible.
Getting caught costs up to 500 points and resumes the shift.
A successful theft shows the upgraded bedroom dream: Trmyte plays Lumines on
the PS3 while long-haired Skanky plays guitar through the Mesa amp. The original
posters and computer remain in the room. The dream resumes this shift.
The advertised one-in-five capture risk was unfinished
in the original source; it is now implemented. See the source inventory and
restoration evidence in [reference parity](docs/reference-parity.md).

The **original full shift**, including its NPCs, special freight and timed
events, is retained. Choose **PLAY THE ORIGINAL FULL SHIFT** in the 3D briefing
or results screen, or open the local URL with `?mode=classic`. Its controls
remain unchanged; it starts with Enter or a title-screen tap.

The 3D depot preserves every reference event of the original. New loading,
layout and scoring changes apply to 3D only.
`?mode=3d` also opens the 3D depot; any other `mode` value does too.

Node 24 is recorded in `.node-version` and used by CI. The locked Vite dependency
requires Node `^20.19.0 || >=22.12.0`; use the documented Node version so local and
CI checks agree.

## Build and preview

```sh
npm run build
npm run preview
```

The build runs TypeScript checking and then creates the production bundle in
`dist/`. Preview serves that bundle locally. Generated output and dependency
folders are ignored; the GitHub workflow only installs from `package-lock.json`
and runs the build and browser checks. It does not deploy or publish a release; the separate deploy workflow
ships `main` to the owner's server at https://thebelt.fun, and the Pages workflow publishes it to
https://trmytelabs.github.io/the-belt/ (both public).

To put a build online (at a domain's root or in a folder such as a GitHub Pages site), see
[docs/deploying.md](docs/deploying.md).

To run the browser smoke checks against a fresh production build:

```sh
npx playwright install chromium
npm run test:model
npm run test:browser
```

The model suite checks belt contact through speed ramps and stops, placement,
recovery, pacing, and a complete winning shift. Source parity checks extract
the original dialogue pools and compare their exact content with the preview.
Browser checks cover both the
original game and the new section: organic A/B/C deliveries using real keys,
keyboard/touch controls, belt rendering, pause, brake, handoff, recovery,
results, restart, readable dialogue variants, scripted story stages, Mesa
choices/dream, crew loading, Ralph's five pickups, and departures. Audio checks
render every effect and music mode in Chromium, checking headroom, envelopes,
mute/resume and scheduling after a stall.
Story checks play all three arrivals, the scrum, all six break exchanges,
throwing and breakage, the stairs, the full mall run, the key return and a
clean replay.
Geometry checks cover all seven destinations, truck/deck alignment, stairs,
mixed recovery freight, full lower-floor stacks, sampled story and camera
clearances, and GPU-resource cleanup across restarts. See the
[depot review and validation record](docs/depot-quality-review.md) for findings,
fixes, performance measurements and remaining manual checks.
Browser checks use a
loopback server, real opening inputs and isolated synthetic clock/cargo fixtures
for later events and edge cases. TypeScript strict checking is enabled. Dependabot maintains
compatible dependencies; major upgrades require a separate planned review.
Dependabot waits a week after each release before proposing it, and CI installs
packages with `--ignore-scripts`, so a hijacked update has a smaller window and
cannot run an install script on a runner.

CI runs on GitHub-hosted runners (a Linux job for the build, the model checks and
the 3D browser suites in Playwright's Chromium; a Windows job for the classic
game's checks in Edge). Pull requests
always get the full checks; after a merge, main's run skips them when the merge
commit's tree is the one its pull request just passed (see
[docs/deploying.md](docs/deploying.md)). The browser
suites use software WebGL there, so CI
still checks the real Canvas fallback. Local
checks retain the default renderer unless `BELT_BROWSER_RENDERER=canvas` is set.
The Windows job runs the original game's smoke and audio checks; neither job
changes the production game configuration or bypasses its countdown. The default WebGL renderer still
needs a local check on a machine with usable graphics support.

The original scenes reference Google Fonts when a network connection is available.
Online play (PLAY ONLINE) contacts PeerJS's public server (0.peerjs.com) and its
STUN/TURN servers, and Google's STUN server, only once a player hosts or joins.
Physical-device usability and audible sound still need manual checks. Automated
coverage of timed events uses controlled fixtures, not a claim that every story
was encountered in one unassisted playthrough.

## Source and history

The source was recovered from a local checkout originally associated with
[`RecursiveDelete/thebelt`](https://github.com/RecursiveDelete/thebelt). Its old
Git metadata could not resolve the recorded HEAD and was preserved locally in
ignored `.git-recovery-backup/`. This repository starts with a reviewed snapshot
of the current source, rather than reconstructing that unavailable history.
The old remote remains recorded as `upstream` for provenance.

No license has been established for this snapshot. Repository privacy does not
grant permission to redistribute the source or its assets.

See [CONTRIBUTING.md](CONTRIBUTING.md) for changes and
[SECURITY.md](SECURITY.md) for private security reporting.
