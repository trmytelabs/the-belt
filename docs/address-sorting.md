# Address sorting and package flow

The actively developed **3D depot** uses street addresses and explicit destination
guidance. In **2417 119 ST**, the prominent **119 ST** selects the route; the
building number does not. Package tags show that street in large type, with the
full address and freight name below. The three-step briefing explains grabbing,
following the destination and loading inside a truck. A persistent guide names
the district, street range and next walking direction; a gold marker identifies
the correct rear door or floor drop while carrying. Truck floor markings show both
district names and ranges. Signs and tags retain the neutral palette.
Internal route IDs remain in the rules and tests only.

These are simplified, synthetic Edmonton-inspired delivery districts for the
game, rather than geographic boundaries or real delivery assignments.

| Worker | District | Street range | Drop |
| --- | --- | --- | --- |
| Termite | Mill Woods | 10–49 ST | First truck |
| Termite | Downtown | 90–109 ST | Second truck |
| Termite | Westmount | 110–129 ST | Below the west stairs |
| Skanky | Bonnie Doon | 50–89 ST | First truck |
| Skanky | West End | 130–169 ST | Second truck |
| Skanky | Northside | 170–199 ST | Below the east stairs |
| Both | Bulk | OVERSIZE | Shared platform pile |

Every boundary is inclusive. The ordinary address ranges do not overlap.
An address and its shipping identity remain attached through receiving, pickup,
handoff, put-down, recovery and delivery. A wrong truck keeps the parcel in hand
and records a sorting error with a reminder of the correct district. In 3D,
each wrong delivery attempt costs **10 points**, capped at the remaining score.
An intact throw to a wrong drop also costs 10 points once at landing.

Selection and pickup only allow the controlled worker's own truck and floor
routes, plus bulk. The marker skips the other worker's parcels, even when they
are closer. This applies on the belt, on the floor and in recovery.

The worker you are not controlling walks to ordinary freight for their side,
picks it up and carries it to the correct drop. **Only the currently controlled
worker picks up bulk**, including missed or loose bulk. Switching away from a
worker already holding bulk leaves it in their hands until you return. They use the same walking
bounds, stairs, carrying speeds, delivery areas and scoring as the player.
Tab immediately gives you control of that worker. Pausing and story scenes
freeze both workers. The coworker carries rather than risking throws.

3D arrivals run every 4.8 seconds during the opening, 3.6 seconds in flow and
2.8 seconds during the final rush. A full uninterrupted shift supplies about
52 packages for the unchanged 42-dispatch goal. Two random
everyday parcels are interleaved between authored reference parcels. Sixteen
ordinary labels include documents, books, shoes, clothing, kitchenware, spare
parts and sports equipment, using five different package forms. Original joke
freight and Brian's five actual bulk parcels remain. Brian's burst uses 2.8-second
intervals; the shared minimum belt spacing still applies, including speed ramps,
brakes and blocked receiving.

Recovery holds six packages safely; the seventh ends the shift. The HUD shows
the live count out of seven, and rescuing a package frees space immediately.
After intake closes, 3D allows up to 25 seconds to finish the remaining freight.
Workers move at 265 model pixels per second; carrying retains at least 82% of
that speed, and squeezing past a supervisor retains 75%. The belt opens at 50,
then eases to 59.9 and 69.25 pixels per second. The controlled worker only moves
on player input. Correct loading, recovering missed freight, the score/streak,
scanner handovers and risky optional throws retain a modest challenge.

Held 3D freight is placed in front of the worker using the actual scaled parcel
depth. Its transform follows the worker's turn directly, preventing interpolation
through the torso.

Truck rows are five metres apart, leaving at least two metres between their
bodies. Crew stations, the massage table, LEGO, Ben's robbery and demon scene,
Donna's computer and the fish tank occupy the gaps between rows. Loading doors
and the central walking lanes remain clear. The warehouse and belt extend to
fit the wider spacing; receiving stays at the front, and the two player truck
rows come before the rear bulk platform. Stairs descend outward
to the left and right. Both floor drops and all walking space remain in front
of the final rear wall. The gold destination ring marks the door until the worker
enters the correct truck, then marks the loading point inside. Lower-floor drops
have low wooden pallets, neutral pads and tidy stacks.

Truck deliveries require walking through the open rear door and pressing
**SPACE / GRAB-DELIVER inside**. The roof turns transparent and its large sign
clears from view while the controlled worker is inside, then both return on exit.
The camera follows into the cargo bay. Two banks of three shelves hold the
actual delivered parcels, preserving their forms and labels throughout the shift.
Standing farther along the truck selects the nearest shelf bay; facing up or
down selects a shelf bank. The next available tier at that position fills first.
Long packages occupy two neighbouring slots. Eighteen ordinary slots fit inside;
when no suitable shelf space remains, real parcels protrude through the rear
opening in visible overflow piles. Leaving and switching workers preserve cargo;
loaded parcels move with their truck at clock-out. Restart clears the load.

Near a rear door, walking inward gently centres the worker on the cargo aisle,
including diagonal approaches. The wider mouth slides past the frame at ordinary
carrying speed, and empty hands allow more movement between shelves. Walls and
shelves still bound the bay. A soft circular transparent window follows nearby
people through foreground truck shells, leaving the rest of the truck solid.
Foreground shelf boards share the cutaway; loaded parcels remain visible, and
the window closes as people move away.

**F / THROW** targets the nearest physical drop. Truck freight must be carried
inside and cannot be thrown to bypass loading. Throwing does not automatically find
the address's correct destination. An intact throw to the wrong drop gets no
dispatch credit, records an error and leaves recoverable freight there.
At the stair top, it targets that side's lower-floor drop with an exact **30%**
break chance for both ordinary and fragile throwable freight. The risk is stored
at launch; switching workers or moving does not change it. A break deducts up
to **150 points once**, gives no delivery credit, and brings Shan over to yell
while sorting continues. Heavy freight still needs carrying. Other throws retain
their 15% ordinary / 55% fragile risks.

Vic's Mesa offer retains a fresh 20% catch roll per accepted theft. Getting caught
deducts up to **500 points**, resets the combo, then resumes the same shift.
It never ends the night. Leaving preserves the parcel; a successful theft retains
the bedroom dream and returns to the same shift without dispatch credit.

Night exteriors, the warehouse and the bedroom dream have brighter ambient
lighting; a modest exposure lift keeps faces, paths and freight readable while
preserving the night sky and warm work lights.
The scrum gathers from below and walks up toward Shan, facing forward.
When it finishes, the same residents, Shan and playable pair walk to their work
areas without disappearing or resetting their positions. Crossing workers use
the gap before the belt head. Residents spend most of each ordinary work cycle
collecting visible parcels on the platform and taking them to their rear doors;
their named gags remain short interruptions. Shan stays on the platform between reactions.

Future gameplay and visual changes target 3D only. The 2D and classic versions
are legacy modes; new 3D layout and scoring are isolated from their rules.

Regression coverage includes the range boundaries, varied freight and contact
spacing, coworker stair navigation and switching, all 3D parcel forms in four
directions against both actual Rocketbox worker torsos, the exact stair risk
boundary, wrong throws, Shan's visible visit, Mesa's keyboard/touch outcomes and
clean restart. Cargo and clock fixtures are synthetic; the shipped character
models and production rendering are exercised directly.
The sorting-guide rules suite covers the seven-package boundary, recovery freeing
space, cleanup deadline, carrying pace and all seven destination instructions.
Its browser suite checks real pickup and truck loading, large address tags,
desktop and portrait/landscape touch layouts, pause, overflow and clean restart.
Physical touch-device usability and audible sound still need manual checks.

The nearest eligible package has a neutral light halo and a **SPACE · GRAB**
prompt. Empty or out-of-reach actions do not play an error sound. A wrong drop
still sounds its error and deducts points.

John patrols both sides around the belt head and stops for random squat sets.
Shan and Vic walk up and down the loading lanes between their existing scenes.
They briefly slow a head-on squeeze, while sidestepping keeps normal speed.
Their patrols do not enter the stairs or truck interiors.

In the 3D mall, Space handles the highlighted action, including grabbing or
parking the cart. Eligible truck bundles are highlighted and empty or future-run
slots are skipped. Each store has 6–10 visible cartons, and the cart holds two
separate store bundles. Dropping one leaves the other bundle visible aboard.
The legacy mall retains its original controls and box counts.
