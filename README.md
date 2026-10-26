# The Belt

A 3D browser game of one more overnight at a UPS depot in Edmonton, based on real
nights on the belt. Termite and Skanky sort the parcels with the crew, then take
the five-ton out after the shift. Built with Three.js, TypeScript and Vite; the
original 2D game (Phaser) is kept alongside it.

**Play it at https://trmytelabs.github.io/the-belt/** · Current version: **1.1.0**
(see [CHANGELOG.md](CHANGELOG.md) and the GitHub Releases, which carry a packaged
web build).

Active development targets **the 3D game only**. The original full shift is kept as
a legacy version; new gameplay requests apply to 3D unless the owner asks
otherwise.

## Playing

A laptop or desktop with Chrome or Edge and a keyboard plays best; game
controllers and touch screens work too. The game needs WebGL (without it, the
page links to the original game).

The start screen offers:

| Choice | Key | What it is |
| --- | --- | --- |
| START THE NIGHT | Enter | The whole story night (below) |
| JUST PLAY | J | The shift, the drives and the mall run, without the story scenes |
| 1 PLAYER / 2 PLAYERS | C | Two players on one computer (see [Two players](#two-players)) |
| PLAY ONLINE | O | The endless belt with someone on another computer |
| DAILY CHALLENGE | Y | One seeded night a day, the same on every device |
| PEAK NIGHT | P | The hardest mode, once a night is finished |
| ENDLESS SHIFT | N | No clock until recovery overflows, once a night is finished |
| Perks | 1, 2, 3 | Tonight's perk, once a night is finished |

Straight to one part of the game:

- `?mode=3d&minigame=mall`: the mall run (TRY THE MALL RUN), with START AT
  BENTLEY (B) for its fourth run.
- `?mode=3d&minigame=coffee`: the Timmies run. `?mode=3d&minigame=ralph`: the
  Ralph run.
- `?mode=3d&drive=mall` or `?mode=3d&drive=ups`: driving the five-ton.
- `?mode=classic`: the original full shift, as it was.

Your record (nights, best total and grade, medals, recent nights and settings)
is kept in this browser only.

## The night

The title loads over a moving belt, then the start screen opens. START THE
NIGHT plays one snowy Christmas night. Story scenes advance by themselves; Space
shows the next line and Enter skips the scene.

1. **Home, 12:20 AM.** Termite and Skanky decide whether to go in or quit UPS.
   Quitting ends the night on the couch with a Wii; going in means driving
   Skanky's car to work.
2. **The arrival:** one of three openers outside the locked gate, then Shan's
   morning scrum.
3. **The shift** (below), with lunch inside Tim Hortons and the Timmies run back.
4. **After the shift, the five-ton:** Skanky's mall run to Southgate, or
   Termite's paper route with Ralph.
5. **Breakfast at Cha for Tea with Vic,** then the credits for the whole cast.

The night's results show the grade and the night total: the shift's score plus
the night goals, the mall run's or the Ralph run's points and the drives' par
bonus, less road penalties. See
[the overnight shift expansion](docs/overnight-shift-expansion.md) for the full
story and its scenes.

## The shift

Three minutes of sorting, then up to 25 seconds to clear what is left, after the
original **3, 2, 1, SORT!** countdown. Dispatch 42 parcels and keep the recovery
backlog under seven; the seventh ends the shift.

- **Sorting.** Each label shows its street number in large type. Termite covers
  Mill Woods (10–49 ST), Downtown (90–109 ST) and the Westmount floor drop
  (110–129 ST); Skanky covers Bonnie Doon (50–89 ST), West End (130–169 ST) and
  the Northside floor drop (170–199 ST); oversize freight goes to shared bulk.
  These are synthetic districts. A guide names the destination, a gold circle
  marks the truck door or floor drop, and parcels for the worker you control
  have cyan rings. Carry truck freight in through the open rear door and load
  it facing a shelf; the roof turns see-through inside. A wrong drop costs up to
  10 points. See [address sorting and loading](docs/address-sorting.md).
- **Your partner** sorts their own ranges unless a second player has them; only
  the worker you control collects bulk. Switch workers with Tab or right-click.
- **Throwing** (F) sends a parcel to the nearest drop. From the top of the
  stairs it reaches the lower floor with a 30% chance of breaking: a break earns
  nothing, costs up to 150 points once, and Shan runs over yelling. A throw of
  5 m or more is a LONG THROW (+25), and of 7.5 m a TRICK SHOT (+50).
- **Priority freight:** through the flow and the rush, every third parcel you
  could take is urgent. Its gold ring runs down over 15 seconds; load it
  yourself in time for +100.
- **Surprise freight:** twice a night a siren starts a RUSH WAVE, 15 seconds of
  freight at twice the rate (+150 if none of it reaches recovery). Three
  MYSTERY BOXES open when delivered: a jackpot (+200), a free belt stop, ON FIRE,
  or socks. Two FRAGILE crates cannot be thrown, slow their carrier down and pay
  +75 carried in.
- **Streaks:** each clean load in a row adds 15 more points (up to +150). From
  ten in a row you are ON FIRE and walk 8% faster.
- **Stop the belt** (E) for two seconds, three times a run, with a 15-second
  cooldown.
- **Recovery:** missed freight piles up at the belt's end; picking it up there
  dispatches it for half points. Recovered freight counts toward the grade; S
  starts at 95%.
- **Inspections:** twice a night Vic or Shan watches you for 20 seconds: each
  load +50, a wrong drop −30 more.
- **Night goals:** three optional goals each night (such as 8 in a row, or
  nothing broken), +150 each.
- **Perks** (once a night is finished): the start screen offers three of six
  (ONE MORE STOP, PRIORITY GRACE, ROOMY RECOVERY, QUICK FEET, EASY RUSH and
  SUPERVISOR'S FAVOURITE), for that night.
- **Medals:** thirteen, from FIRST SHIFT and S RANK to TRICK SHOT and BELT
  MARATHON, kept with your record. **Seniority** climbs six titles, from NEW
  HIRE to BELT LEGEND. Your best night's pace shows under YOUR SCORE, so you
  can race it.
- **PEAK NIGHT:** freight a fifth sooner, a quicker belt and one less slot in
  recovery. **ENDLESS SHIFT:** no clock or story; from the rush, every minute
  the freight comes sooner and the belt runs faster until recovery overflows.
- **The crew** work around you: Shan and Vic patrol, John Rushton does squats,
  Hussan dances with THE SNAKES CELL, Brian's stink trails drift, Ben's robbery
  and dodge-training disaster stops the belt, and Vic may offer you a Mesa amp
  (Y/N: steal it for a dream, with a one-in-five chance of getting caught).
  With a minute left the trucks start up and the loaders cough in the exhaust.

## After the shift

**The mall run.** Skanky drives the five-ton to Southgate Mall, a 3D mall
modelled on Edmonton's Southgate Centre, and wheels the freight in on a cart:
seven stores over four runs, each delivery dropped (Space) and signed for
(+50). The cart is E. The fourth run is BENTLEY's alone. Delivered, the clerk
yells that a box is missing and won't sign, and Skanky freaks out. Mall
security's lost and found has it, through the staff doors and down a long
service hallway, but the guard asks three questions about the night first
(1, 2 or 3). Answer right and Skanky carries it back. Get one wrong and Skanky
can ask again, or grab the box and run: shove it at BENTLEY, then make for the
five-ton with the guard chasing and shooting. The guard's aim shows as a band on
the floor; sidestep when it turns red. One hit and Skanky goes down: medics
carry Skanky out to an ambulance, and the night is lost. A getaway pays +100;
being marched out costs 100. Back at UPS, Skanky walks the keys to the KEY DROP.

**Driving.** Drive the five-ton (W / ↑ gas, A D / ← → steer, S / ↓ brake and
reverse) through a city of 42 intersections, 127 buildings and 28 cars, with a
green compass pointing the way and working traffic lights. Park in the lit bay
(Space). Bumps and red lights cost 100 points; parking within a minute pays 200,
within 1:20 pays 100. Your fastest drive to each yard comes back as a
see-through ghost truck to race. See [the 3D driving mini-game](docs/3d-driving.md).

**The Ralph run.** Termite drives the five-ton round the streets by the depot
with Ralph riding along and talking, throwing eight businesses their parcels out
of the window (F) inside two minutes: +50 a delivery, +25 more dead on.

**The Timmies run.** Every lunch is at Tim Hortons. On the ride back Skanky
holds two trays of coffees for 30 seconds while Termite drives: tilt the trays
(WASD) to keep the big gauge in the middle through the turns, the swerve, the
red light and the bumps. Each cup that survives pays 25, all eight +100 more.

## Two players

**On one computer** (C on the start screen, or a second controller): player 1
is Termite on WASD, Space to grab and F to throw; player 2 is Skanky on the
arrows, Enter to grab and Right Shift to throw. Not on touch screens.

**Online** (PLAY ONLINE, O): the belt as an endless shift, from two computers.
One player hosts (Chrome or Edge on a computer) and is Termite; the other opens
the room link, or enters its six-character code, and is Skanky, player 2, on a
computer or phone with keys, a controller or touch. The host shares the game's
tab, so the joining player sees the game with its sound on a light page that
loads no game engine. Either can pause; the joining player's keys can do
nothing else. Voice chat is built in (K mutes the microphone; headphones stop
the game's sound echoing). PeerJS's free public server introduces the two
browsers, which then talk directly over WebRTC; each player can see the other's
internet address, and some strict networks block the direct link.
`?online=local` links two tabs of one browser instead (no picture or voice),
for the tests and a try-out.

## Controls

| | Keyboard and mouse | Controller | Touch |
| --- | --- | --- | --- |
| Move / steer | WASD or arrows | Stick or d-pad | Stick |
| Grab, deliver, act | Space or left-click | A | GRAB / DELIVER |
| Throw | F | B | THROW |
| Stop the belt | E | X | STOP THE BELT |
| Switch worker | Tab or right-click | Y | SWITCH |
| Overview | V | Back | VIEW |
| Pause | Esc | Start | PAUSE |
| Gas / brake | W / S | Triggers | GAS / BRAKE |

M mutes. On the start screen a controller's Y starts a peak night, X the endless
shift and LB / RB step through the perks; on the menus the d-pad highlights, A
presses and B goes back. A controller that drops out pauses the game, and pads
with rumble shake on a wrong drop, a breakage and a bump.

SETTINGS on the pause screen sets the music and effects levels, the resolution
(down to half, for slow or very sharp screens) and the breakage camera shake.
END NIGHT drops the night without recording it. HOW TO PLAY sums up the rules.
Losing focus pauses the game.

## Look and sound

- **The crew** are 23 rigged Microsoft Rocketbox characters with motion-captured
  clips (walking, running, coughing, cheering, phoning and more), turning their
  heads to whoever is speaking, with procedural figures on software graphics.
  See [character models](docs/character-models.md).
- **The world** (the depot and its twelve trucks, the city, the yards,
  Southgate Mall, Tim Hortons, Cha for Tea and the house) is built in the game,
  dressed with CC0 photo textures and a few CC0 models. See
  [depot surface textures](docs/textures.md), [prop models](docs/prop-models.md)
  and [prop sources](public/models/PROP-SOURCES.md).
- **Music:** the shift plays "After Hours — Depot Lo-Fi", which the owner made
  in Google Flow Music; every other place has its own track by Kevin MacLeod (incompetech.com,
  CC BY 4.0), crossfaded as the night moves on. Foley uses small CC0
  recordings. See [music sources](public/audio/MUSIC-SOURCES.md) and
  [foley sources](public/audio/FOLEY-SOURCES.md).
- **Faithful to the original:** every reference event, line and joke parcel of
  the original game is kept. See [reference parity](docs/reference-parity.md)
  and [the 3D depot](docs/3d-preview.md).

## The original game

The original full shift (Phaser), with its NPCs, special freight and timed
events, is kept as it was: choose PLAY THE ORIGINAL FULL SHIFT on the 3D start
screen or open `?mode=classic`. It starts with Enter or a tap.

## Development

### Run locally

Install Node.js 24 (recorded in `.node-version`, and used by CI), then from the
repository root:

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. The default entry is the 3D game; `?mode=3d`
(or any other `mode`) opens it too.

### Build, preview and deploy

```sh
npm run build
npm run preview
```

The build type-checks (strict TypeScript) and writes the production bundle to
`dist/`. Every merge to `main` is published to
https://trmytelabs.github.io/the-belt/ by the Pages workflow. To host a build
elsewhere (at a domain's root or under a path), see
[docs/deploying.md](docs/deploying.md).

### Tests

```sh
npm run test:model
npm run test:browser
```

The model tests (Node's test runner) cover the rules: sorting and
placement, pacing and the belt, throwing and breakage, scoring and grades,
goals, perks, medals and seniority, the daily challenge, the story, the mall run
(Bentley, the security questions, the chase and the ambulance), driving and
traffic, the mini-games, and online play's rules. The browser suites (Playwright)
play the real game with real keys: the shift, all three openers, the scrum,
lunch and the Timmies run, the stairs, the full mall run, the drives, the key
return, the Ralph run, two players, online play between two tabs, audio,
geometry and camera clearances, and resource clean-up across restarts.
Timed events use controlled fixtures. See the
[depot review and validation record](docs/depot-quality-review.md).

### CI

CI runs on the owner's own Windows PC, a self-hosted GitHub Actions runner
labelled `belt-pc`, so checks use no GitHub Actions minutes; the PC has to be on
for checks to run. Every pull request gets the full checks (the TypeScript build
and the browser suites for the 3D and original games, in Edge with software
WebGL so the fallback path is covered). Branch protection requires them, up to
date with `main`. After a merge, main's run skips them when the merge's code is
exactly what its pull request already passed, so the site publishes about a
minute after merging. Dependabot proposes updates a week after each release,
and CI installs packages with `--ignore-scripts`.

### Network use and privacy

The game keeps no account and sends nothing about the player anywhere. The
original scenes load Google Fonts when online. PLAY ONLINE contacts PeerJS's
public server (0.peerjs.com), its STUN/TURN servers and Google's STUN server,
only once a player hosts or joins. See [SECURITY.md](SECURITY.md).

## Releases

Versions follow the rules in [CONTRIBUTING.md](CONTRIBUTING.md) and are listed
in [CHANGELOG.md](CHANGELOG.md). Each GitHub Release carries a ready-to-host
static build (zip and tar.gz, with checksums and an INSTALL.md) of its tagged
commit.

## Source and history

The source was recovered from a local checkout originally associated with
[`RecursiveDelete/thebelt`](https://github.com/RecursiveDelete/thebelt). Its old
Git metadata could not resolve the recorded HEAD and was preserved locally in the
ignored `.git-recovery-backup/`. This repository starts from a reviewed snapshot
of the source rather than a reconstruction of that history; the old remote stays
recorded as `upstream` for provenance.

No licence has been established. Repository privacy does not grant permission to
redistribute the source or its assets.

See [CONTRIBUTING.md](CONTRIBUTING.md) for making changes and
[SECURITY.md](SECURITY.md) for private security reporting.
