# Original reference inventory and parity audit

Audit date: 2026-10-10. Baseline: the original `GameScene` and its reachable
supporting classes retained at revision `35caf18`. The comparison below records
the Depot preview **before the second reference-restoration pass**. It is an
implementation checklist, not a claim that every item is already restored.
Line references refer to that audit snapshot and can move in subsequent edits.
The restoration and its completed verification are recorded in the final
acceptance section below; the historical comparison is retained as provenance.

Classic mode does not satisfy parity in the new scene. An item counts as restored
only when its name, line, or recognizable setup and payoff can actually be seen
through ordinary new-scene play. For a pool of alternative lines, every variant
must be reachable across ordinary replays; a string in an unused array or a test
fixture is insufficient. Line wrapping may change; spelling, speaker, meaning,
and the joke's setup and payoff should remain recognizable.

## Event dialogue and staging

| Reference and source | Original reachable content and behavior | Audit snapshot of Depot preview |
| --- | --- | --- |
| Kylie; `entities/KylieNpc.ts:9,83–123` | Pool: **WHERE IS MY TIMMY HORTANS**; **MY TIMMY HORTANS?!**; **WHO TOOK MY TIMMY HORTANS**. One appearance enters from a random top/bottom side, walks through the warehouse with a wandering horizontal path; bubble visibility toggles every 2–3 seconds and selects a fresh random quote on showing. | One visit at 1.8–11.5 seconds, one fixed altered line `WHERE IS MY TIMMY HORTANS?!`. The other two variants are absent. The visit's location can change for the new layout; the coffee search and all three variants must survive. |
| Vic stops belt / Shan fixes it; `systems/BeltEventSystem.ts:116–182,535–563`; `entities/VicNpc.ts`; `entities/ShanNpc.ts:12,104–133` | Vic targets a physical red button, approaches, presses it, and actually stops the belt. Notification **BELT STOPPED**. After 1.5–3 seconds Shan enters, approaches a different button, presses it, and restarts the belt: **BELT RUNNING**. Shan's random rant begins during his entrance. | Player-triggered two-second brake and one Shan reaction exist, but the Vic-causes/Shan-repairs event and physical button actions are absent. An E-key brake is not this original gag. |
| Shan rant pool; `entities/ShanNpc.ts:12–20` | **!@#%!**; **WHO STOPPED THE #@%! BELT?!**; **BACK TO #@%! WORK!**; **#@%! AGAIN?!**; **I'D RATHER BE DIGGING GRAVES**; **I WONDER HOW MUCH A 50 FOOTER WOULD SELL FOR**; **UGH MY ULCERS AGAIN!**. Shan visibly grows redder while ranting; shirt and tie identify him. | Only `WHO STOPPED THE #@%! BELT?!` is reachable, following player brake. Six variants missing. |
| John Rushton; `entities/JohnRushtonEvent.ts:9,100–175` | **DON'T STACK BOXES ON BOXES!**. Enters, yells with arms raised for 1.5 seconds, crouches/squats for 1.85 seconds, then leaves. | Quote, identity, timed visit and small squash animation present. The distinct walk-in → raised-arm yell → pronounced crouch → exit choreography is reduced to appearing/bobbing. Miss reaction is an added use, not the original setup. |
| Vic and AJ massage; `entities/VicMassageEvent.ts:105–196`; `entities/FlavorNpc.ts:365–390,469–474,548–566` | Vic walks to AJ's massage table, rotates into a lying pose over 450 ms, towel appears, says **I NEED A QUICK TUNE UP**, AJ visibly massages for 5.2 seconds, Vic gets up and leaves; AJ returns to work. Bare feet and massage table are original AJ identifiers. | Quote, arrival, lying pose, AJ rocking, and exit present. Towel and clear articulated massage contact/return-to-work missing. |
| The snakes cell; `scenes/GameScene.ts:877–925`; `entities/FlavorNpc.ts:220–254,317–331` | A separate thin green belt prop labeled **THE SNAKES CELL** travels with the belt until y184. Hussan approaches the pickup point, holds a prop labeled **CELL**, performs a 3.2-second dance, then returns. His phone and gesturing hand are separate persistent traits. There is no spoken snake quote in the original. | Label is on a new ordinary snake-crate parcel and a static prop; Hussan says an added `THE SNAKES CELL!`. Original approach → pickup → dance → return missing. A speech bubble does not replace this visual joke. |
| United Way; `entities/UnitedWayEvent.ts:10–19,127–196` | Shan: **TERMITE AND SKANKY HAVE BOTH WON A FREE PAID DAY OFF FROM UNITED WAY**. During the 4.6-second announcement, all visible, living ambient workers react, starting after 1.4 seconds with 110 ms offsets. Each gets one random swear for 3.3 seconds. | Announcement and one fixed Doris response are present. Ensemble reaction and five other variants absent. |
| United Way response pool; `entities/UnitedWayEvent.ts:12–19` | **WHAT THE FUCK**; **BULLSHIT**; **YOU GOTTA BE FUCKING KIDDING**; **FUCK THIS**; **ARE YOU FUCKING SERIOUS**; **SON OF A BITCH**. The speaker is any eligible resident worker; the joke is a whole floor reacting to Termite and Skanky's prize. | Only Doris saying `YOU GOTTA BE FUCKING KIDDING` is used. The new failure line `FUCK THIS.` does not restore its United Way role. |
| Brian's five down; `scenes/GameScene.ts:927–963,1100–1122` | Brian: **SENDING 5 DOWN**. Random Termite or Skanky replies **YOU ARE SERIOUSLY SENDING 5 DOWN TO BULK?**. Five real visible ambient boxes arrive at 170 ms spacing. Original ambient boxes are **not player-pickable** and the crew collects them. | Both lines and a real five-parcel bulk burst are present. New burst deliberately creates player-sortable C freight; preserve this improvement while retaining Brian as speaker and Termite/Skanky as respondent. |
| Ralph; `entities/RalphTruckEvent.ts:19,83,196–335`; `scenes/GameScene.ts:308–320` | Once five bulk items accumulate, **RALPH 5 TON** truck arrives. Ralph gets out, says **I NEED TO HURRY UP AND GET BACK TO MY 3 SETS OF TRIPLETS!**, carries and loads exactly five individual bulk boxes into the truck, boards and drives away. `BulkPileZone.removeCount(1)` actually removes each collected item. | Quote/identity present, triggered by third C delivery or fixed 87.5-second cue. Truck, five-item accumulation, actual five pickups/load visibility, departure missing. Repeating the quote alone is incomplete. |
| Gunman → Ben → demon → Paula; `entities/BenGunmanEvent.ts:9–34,284–477` | Gunman enters and threatens: **I'M GOING TO ROB THIS PLACE!** (4.2 s). Ben: **DON'T WORRY GUYS I GOT THIS I TOOK TRAINING ON HOW TO DODGE GUNS** (5.2 s). Ben moves through dodge points, gunman fires comic shots, Ben falls with `X_X` marker. Portal opens; a demon rises, drags Ben's body into hell; Ben stays absent. Paula enters: **GREAT NOW WHICH BITCH IS GOING TO LOAD MY FUCKING TRUCK** (5.2 s), then leaves. | Full broad sequence is now present at 68–89.5 seconds. Threat lasts 2.4 s, Ben 4.4 s, Paula 4.4 s. New punctuation is harmless, but actual drag is reduced to shrinking both at the portal. Dead-face marker and exact shot sequence absent. Must preserve order, distinct visible stages, and sufficient reading time. |
| Comic shot variants; `entities/BenGunmanEvent.ts:31–32,535–584` | Five impacts: **BANG!**, **BANG!**, **POW!**, **BANG BANG!**, **BANG!**, with intervals 260/420/320/520/420 ms. Muzzle flash and moving impact lettering reinforce the joke. | Three sounds and one continuous `BANG!` label. `POW!`, `BANG BANG!` and five distinct impacts missing. |
| Truck exhaust; `entities/TruckExhaustEvent.ts:21,64–98,153–192`; `scenes/GameScene.ts:41,1054–1069` | Once 45 seconds of non-event gameplay accumulate, drivers appear at every truck with keys for 5.2 seconds and engines start. Gray exhaust continues afterward, a random living worker coughs every 3.2–7.6 s (initial delay 2.2–5.2 s). Pool: **COUGH!**, **HACK!**, **COUGH COUGH!**, **UGH, EXHAUST!**. | Entire exhaust/driver/cough gag missing. Doris's cigarette smoke and Brian's stink are different references. |

## Mesa choice and dream

Original evidence: `systems/BeltEventSystem.ts:349–533`,
`scenes/GameScene.ts:792–862`, and `scenes/MesaDreamScene.ts:13–27,60–62,124,150`.

1. An unheld, unsorted Mesa Boogie arrives. This can trigger only once per run.
   Belt pauses, controls are blocked during the approach and choice, and the
   center notification reads **VIC SPOTTED THE MESA**.
2. Vic approaches and offers: **STEAL IT? I'LL TOSS IT IN THE SUV.**
3. The choice title is **VIC WANTS THE MESA**. Body: **Vic says he'll throw it in
   the back of his SUV. 1 IN 5 SHAN O MAC CATCHES YOU BOTH. If he does, the run
   ends.** Buttons **STEAL IT** / **LEAVE IT**; keyboard Y/N and touch work.
4. Leave resumes the belt with **MESA STAYS ON THE BELT**; the parcel remains.
5. Steal removes the parcel and opens Skanky's growing thought bubble
   **MESA AT HOME**, then the bedroom dream. Skanky plays guitar beside a Mesa
   amplifier. Posters read **BULK RULES**, **PAYTMAN SUCKS**, **NO REPEATS**.
   Computer monitor reads **BUILT THE BELT**. Amp label **MESA BOOGIE**.
6. The dream lasts five seconds, fades and restarts `GameScene`.

The audit snapshot only says `VIC WANTS THE MESA` on grab. All choice, SUV,
leave/steal distinction, thought transition, dream and dream references are
missing from the new scene.

**Original incomplete behavior, not a working feature:** the source advertises
a one-in-five capture risk and contains a `mesaCaught` handler displaying
**BUSTED BY SHAN O MAC**, **Shan caught you and Vic trying to load the Mesa into
the SUV.**, **GAME OVER**. No source assigns `mesaCaught`, calls `ShanNpc.confront`,
or performs that chance roll. Original steal always reaches the dream. Making
the advertised chance work would complete an unfinished feature; do not report
it as existing original behavior. A restored choice must truthfully explain its
implemented consequence.

## Cast, personal props, freight and locations

Original cast and truck labels: `scenes/GameScene.ts:452–578`. Personal details:
`entities/FlavorNpc.ts:174–176,451–621`. New art comparison:
`slice/DepotCastArt.ts`, `slice/DepotArt.ts:307–336`.

| Identity/reference | Original identifier | Audit snapshot |
| --- | --- | --- |
| Termite and Skanky | Named playable pair; Termite hat, Skanky long hair; inactive worker `zZz` | Names and recognizable silhouettes present. New interface active marker replaces sleeping marker. |
| Hussan | HUSSAN truck, phone, gesturing hand, snakes-cell dance | Character/phone present; own truck and dance missing. |
| AJ | AJ truck, bare feet, massage table, works on Vic | Character/table/bare feet present; own truck missing; massage partly present. |
| Ben | Loads truck labeled PAULA ABDUL; literal small purple shoulder demon before incident | Character and shoulder demon present; PAULA ABDUL is a small sign instead of his identifiable truck. |
| Bannerman | BANNERMAN truck; glasses, moustache, adjacent LEGO bricks | Character and LEGO present; own truck missing. |
| Fruit Loop | FRUIT LOOP truck; visibly smaller scale; green shirt | Identity/small scale present; own truck missing. |
| Doris | DORIS truck; yellow hair, purple shirt, cigarette with ember and rising smoke | Identity/cigarette/smoke present; own truck missing. |
| Brian | BRIAN truck; animated green stink, brown work clothes | Identity/animated stink present; own truck missing. |
| Donna | DONNA truck; red-brown hair and necklace; husband at computer playing Warcraft | Identity and husband/computer vignette present; own truck missing. |
| Vic, Shan O Mack, John Rushton, Kylie, Ralph, Paula Abdul, gunman and demon | Dedicated visitor identities and silhouettes; exact events above | All now exist, but event mechanics/pools have gaps above. Shan original UI uses both O MACK (name) and O MAC (Mesa text); this is source spelling, not a new invented name. |
| HERES UR SOVICE and PAYTMAN | Named player trucks (`GameScene.ts:383–399`) | Names retained across split labels; added EXPRESS under Paytman is new text. |
| Paytman's fish tank | Blue glass tank containing fish, beside right truck (`GameScene.ts:405,1222–1244`) | Missing. |
| RALPH 5 TON | Named gray/yellow truck, driver, five visible cargo slots | Missing beyond Ralph himself. |

Freight original evidence: `systems/SpawnSystem.ts:175–251`;
`entities/Package.ts:17,169–176,214–216,527–563`.

- **MALLWOOD RD EAST**: present as full interaction label and abbreviated stamp.
  Original alone gets animated curry/spice-colored odor; new art uses green
  wafts. This smell belongs to **Mallwood**, not Panchetters.
- **PANCHETTERS**: present. Original is a label/variant without its own special
  body art or smell. Do not attribute invented contents to the old source.
- **LE DUCK**: present. Original is a shipping label rather than animated duck
  contents; new duck drawing is an embellishment.
- **MAKEUP LOTION**: label/bottles and pink spill are present. Original begins
  intact and breaks open at a random belt height of 220–520, showing a crack,
  parcel spill, a separate fading puddle and a brief shake. New art spills from
  creation; discrete break-open event is missing.
- **GOJI BERRIES**: named berry crate present; source routes it to Paytman.
- **LIVE LOBSTERS**: named lobster crate present; source routes it to bulk and
  makes it slow to carry. Added claw animation and Fruit Loop reaction are new.
- **MESA BOOGIE**: amp parcel present, source bulk and very slow to carry;
  missing story choice/dream described above.
- **SMALL ATV**: quad-bike freight present, source bulk and very slow to carry.
- **THE SNAKES CELL / CELL**: separate traveling prop and held dance prop in the
  original, not originally a sortable snake shipping crate.
- Generic original shapes/labels are **ENVELOPE**, **SMALL BOX**, **PARCEL**,
  **BIG BOX**, **LONG BOX** (`Package.ts:241–289`). New normal/heavy generic
  crates collapse that shape variety. Preserve named references first; these
  are ordinary freight variation rather than unique jokes.

Original `MISSED` destination/`MISS` label and automatic score behavior exist in
types and sorting, but `SpawnSystem` excludes MISSED from all spawn profiles.
They are not an ordinary reachable original shipping reference; do not invent
a requirement that players must intentionally miss live freight to restore it.

## Title, HUD, callouts and shift endings

- `TitleScene.ts:26,35,51`: **NIGHT SORT SIMULATOR**, **THE BELT**,
  **SORT FAST. MISS NOTHING. SURVIVE THE SHIFT.** The game name and slogan are
  present in the new HUD/footer; NIGHT SORT SIMULATOR is absent. There is **no
  randomized title quote pool** in the source.
- `ui/Hud.ts`: SCORE, COMBO, TIME, ERRORS, ACTIVE, EVENT, BELT; current worker
  name, RUN/STOP indicator and countdown to Vic. No hidden jokes or dialogue
  pool. New HUD preserves most informational roles but removes the Vic event
  countdown with that event. Preserve an understandable event warning if the
  original interruption returns; exact generic HUD words are not jokes.
- `ui/Callout.ts` is a generic `show(text)` renderer with **no authored dialogue**
  and is not imported elsewhere. Actual original event bubbles and worker
  announcements are implemented in the classes inventoried above.
- `ShiftSystem.ts:31,149–175`: **3, 2, 1, SORT!** timed start/countdown sounds.
  The new scene starts immediately from the explicit briefing button.
- `GameScene.ts:676–786`: shift-end horn stops freight, center **SHIFT COMPLETE**;
  Termite says **SHIFT DONE!**, Skanky **CLOCKED OUT!**, both celebrate. Each living
  visible resident celebrates and picks from **WE MADE IT!**, **GO HOME!**,
  **CLOCK OUT!**, **SHIFT DONE!**, **TRUCKS OUT!**, **BELT'S DEAD!**,
  **WE SURVIVED!**, **LAST TRUCK OUT!**. All trucks leave in staggered departures.
  New snapshot only says WE SURVIVED! through active worker on success; named
  two-worker responses, remaining pool, crew dance and departures absent.
- `ShiftSystem.ts:243–257` / `ResultsScene.ts:80`: grade quotes
  **PERFECT SHIFT** (S), **GOOD WORK** (A), **ACCEPTABLE** (B),
  **SHAN IS WATCHING** (C), **DO NOT COME BACK MONDAY** (F). All absent from new
  results. Especially the last two are distinctive voice, not generic UI.
- `GameOverScene.ts:16–18,28`: **PILE-UP OVERFLOW**, **YOU FAILED THE SORT**,
  **SHIFT TERMINATED**. New results use BACKLOG FULL / SHIFT STOPPED instead.
  This is understandable feedback, but exact original failure flavor is absent.

## Scheduling and actual accessibility

Original source has an event mutex (`GameScene.ts:331–355`) and starts resetting
the other timers when a timed event begins (`GameScene.ts:357–370`). Timers are
random 10–18 seconds (`utils/eventTiming.ts`). They count down only when no major
event is active. Thus the big scenes have breathing room and do not overwrite
one another. Kylie is independent; exhaust continues after its initial driver
event, so original incidental quotes can overlap. Original randomness and the
180-second limit do **not** guarantee every scene or variant in one run.

Depot's audit snapshot schedules almost everything directly against the same
90-second clock (`slice/DepotLife.ts:58–146`). It has one speech panel per side.
`say` drops lower-priority speech while a higher-priority panel is active;
same-priority speech immediately replaces the prior panel. `once` permanently
marks a cue before its action runs (`DepotLife.ts:193–233`). A dropped cue is not
queued or retried. Existing browser assertions check history, but history only
records panel creation, not whether its full reading time survived replacement.

Concrete problems to guard against when restoring content:

1. Brian speaks on the right at 63 seconds for 4.2 seconds. His worker response
   occurs at 64.6 seconds. With Skanky active it uses the same right panel and
   truncates Brian to 1.6 seconds. A few words remain readable here, but copying
   this pattern to longer setups would lose them.
2. An E-brake during Kylie's priority-one speech drops Shan's sole rant entirely;
   repeated brake use is presently necessary to hear it. A future mandatory
   scripted rant must wait rather than disappear.
3. Ralph's third-bulk-delivery reaction is priority zero and can be dropped
   behind Kylie/United Way/Brian on the right. Its fallback at 87.5 seconds helps
   only survivors. The meaningful trigger should preserve the five-item story.
4. United Way cannot be restored by dispatching eight same-side `say` calls in
   one frame. Those calls would keep only the last panel. Use visible ensemble
   reactions or a deliberate readable response sequence with reachable variants.
5. The final incident occupies 68–89.5 seconds; the results overlay can cover
   late dialogue at 90 seconds. Scheduling after gameplay needs to keep both
   cast animations and dialogue expiry running until the payoff is complete.
6. Pause must freeze event clocks, transport contact, staged cast movement,
   dialogue timers and any newly added story choices. Reduced motion should
   reduce oscillation while retaining essential entering/pickup/dragging stages.

## Acceptance evidence for the restoration

The next checks should verify the new scene, not merely the classic path:

- Run ordinary play long enough to see each staged story's beginning and payoff.
  Inspect screenshots of characteristic moments and check readable bubble sizes.
- Exercise every variant-selection path through replayable seeds or ordinary
  run-selection state. Assert each original variant is eventually displayed,
  with its correct speaker and context. Do not satisfy this by directly calling
  a private speech method with every string.
- Check event spacing and minimum visible reading windows. A `history.includes`
  assertion alone does not catch a one-frame appearance or subsequent overwrite.
- Confirm belt travel and carried contact remain deterministic during the
  Vic/Shan interruption, Mesa choice, pause and restoration of motion.
- Verify Mesa keyboard and touch choices, truthful outcome copy, and return to
  the new scene. Verify Ralph loads exactly five visible, accumulated bulk items.
- Verify the intentional event state transitions: snake pickup/dance, intact
  makeup → break/spill, five comic shots, Ben removed, Paula response, and final
  crew/truck departures before the results panel obscures them.

This document was produced by direct source inspection. It adds no production
code. Earlier browser/model checks passed for the first restoration snapshot;
those passes do not establish the fuller parity listed here. The second pass
requires fresh browser, visual, model and variant-accessibility verification.

The independent `tests/reference-parity.mjs` suite now derives its baseline from
the retained original TypeScript source. Its nine checks passed after adding
`DepotReferences`: exact six quote/impact pools, exact Mesa copy, all eight named
shipping labels actually emitted by the new model before shift end, and the
eight resident identities. Synthetic instant parcel collection isolates the
spawn schedule from backlog failure. These checks prove source correspondence
and scheduled freight availability; they do **not** prove readable speech,
successful choice flow, staging, or playability. Those need the browser checks
listed above.

## Second-pass implementation and acceptance

The new warehouse now runs for the original three-minute duration, with a
24-parcel dispatch target and a separate clock-out celebration. The original
source remains the content authority; the new scene schedules the set pieces
deliberately so the humor is encountered during play. It is not necessary to
open classic mode to reach these references.

| Restored content | Verification and deliberate adaptation |
| --- | --- |
| All original quote pools | The source suite derives all six pools from original TypeScript declarations and compares exact spellings and sequence. Browser checks observe three distinct readable Kylie windows, all seven Shan rants through actual brake controls, all six United Way responses, four coughs, five impact words, and eight clock-out lines. |
| Dialogue scheduling and speakers | Speech waits behind an occupied panel instead of disappearing. Interrupted incidental lines return for their full duration. Browser checks prove a real miss cannot replace Ben's setup, and queued John/Shan lines retain a visible speaker. The United Way ensemble now uses readable left/right pairs and includes Brian; Ben remains absent after his incident. |
| Cast, trucks and props | Eight recognizable coworkers, their eight named trucks, Ben's shoulder demon, Bannerman's LEGO, Doris's cigarette, Brian's stink, Donna's husband at a Warcraft computer, AJ's table/bare feet and Paytman's fish tank are rendered in the new warehouse. All eight coworker freight trips complete in the browser fixture. Their service-bin-to-truck routines adapt the original ambient freight to keep active worker lanes clear. |
| John and massage | John walks in before yelling and crouching, then leaves. Vic lies under a visible towel while AJ performs articulated massage motion. The organic massage capture and scripted entry checks show the actual scenes. |
| The snakes cell | Separate prop uses shared belt travel, then moves into Hussan's hands for a dance and returns him to the crew area. Belt label THE SNAKES CELL becomes the original CELL held label. Browser checks shared displacement, hand contact, pause stability, held label, disappearance and return. |
| Special freight | All eight original named shipping labels occur in the model's normal spawn schedule. Shape variety, original per-kind carrying weights, Mallwood's curry-colored fumes, makeup cracking/spilling, and recovered-freight star are restored. Model checks cover break thresholds and weights; screenshots verify representative parcel identity and contact. |
| Vic/Shan belt event | Vic walks to a real stop button; the model, a placed parcel and visible belt tread all stop together. Shan approaches the restart button and travel resumes. This event coexists with the player's brake. The browser asserts both mechanical and rendered contact states. |
| Ralph's five-ton | Trigger requires five accumulated bulk dispatches. Truck enters, Ralph makes five separate carrying trips, each removes one stock item and adds one visible truck box, then the truck leaves. Browser checks all five lift/load transitions, counts and departure. |
| Ben and Paula | Threat, training claim, distinct dodge motion, five comic impacts, X_X fall, demon appearance, body dragged toward the portal, disappearance and Paula's complaint/exit are staged in sequence. Browser checks motion and rendered states; the incident screenshot is explicitly a synthetic clock fixture. |
| Drivers and exhaust | Ten drivers appear beside the restored trucks; exhaust remains after drivers disappear. Four original cough variants each receive a readable panel. Browser checks driver count, generated exhaust geometry and speech windows. |
| Mesa | Real Y/N and touch choice, intact leave outcome, Skanky's thought and guitar-bedroom dream, original posters/monitor text, preserved shift progress on return, and announced capture consequence. The previously advertised but unfinished one-in-five capture risk is now implemented. Isolated rolls test safe/caught paths; they do not bypass any production choice code. Blur during the dream returns to a paused warehouse. The original bedroom art is intentionally preserved. |
| Opening and ending | Original 3–2–1–SORT countdown is visible and keeps movement/grab/clock gated. Original player clock-out lines, all resident celebration variants, real named-truck departures, grade quotes and failure flavor are restored. Browser checks countdown, celebration panels and every truck's displacement before results. |

Checks run on 2026-10-10:

- TypeScript and production build passed; final bundle at this checkpoint is
  `index-ZXm9sDJL.js`. The existing large-bundle advisory remains.
- `node --test tests/reference-parity.mjs`: all nine source/reference checks
  passed. The model suite separately covers deterministic rules and grading.
- Canvas original-game keyboard/touch smoke passed before the final input-only
  correction to `DepotScene`; the original scene was unchanged by that fix.
- Canvas ordinary gameplay/touch/rotation checks and the complete reference
  suite passed against the final build, including the queued-input regression
  and Mesa keyboard leave/dream paths.
- Default WebGL ordinary gameplay/touch/rotation checks passed against the final
  build, including the queued-input regression. The full WebGL reference suite
  passed at the preceding build, before that input-only correction. Both suites
  confirmed the actual WebGL renderer (Phaser renderer type 2).

Screenshots were inspected, not merely captured. Organic `after-game`,
`after-personality`, `after-massage`, title and mobile captures show ordinary
play. `after-cell-fixture`, `after-incident`, `after-mesa-choice-fixture` and
`after-mesa-dream-fixture` use disclosed synthetic timing/cargo fixtures to inspect
rare story stages. Synthetic captures wake the renderer for a real frame, and
the dream capture waits for its fade to finish. This corrected an initial test
capture bug that had shown stale canvas pixels despite updated logical state.

The tests also found and fixed a real countdown regression: Phaser's initially
false `Game.hasFocus` paused an already-focused fresh page. Focus handling now
tracks actual blur/focus events, including Mesa return. CI later exposed an
input replay bug: Phaser can revisit old DOM key events when several arrive
before its next frame clears the queue. A deterministic regression suspended
the frame loop, then sent real Space, ArrowLeft and Tab events. The old build
dropped the held parcel and switched twice for one Tab press; the corrected
scene processes each native event once. Canvas and WebGL now pass that test,
including independent sound toggles and native key-repeat suppression.

Physical-device sound
quality, finger ergonomics and a human's ability to finish a full shift remain
manual judgments; passing deterministic/browser checks does not establish them.
