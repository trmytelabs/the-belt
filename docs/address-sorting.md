# Address sorting and package flow

The 3D and 2D depots use street addresses instead of visible route letters or
matching colours. Read the second number in an address such as **2417 119 ST**,
then compare **119** with the ranges posted on the trucks and floor drops.
The building number does not select the route. Signs and parcel labels use the
same neutral palette. Walking guidance and hints do not identify the answer.
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
and records a sorting error without revealing the correct destination.

The worker you are not controlling walks to freight for their side or shared
bulk, picks it up and carries it to the correct drop. They use the same walking
bounds, stairs, carrying speeds, delivery areas and scoring as the player.
Tab immediately gives you control of that worker. Pausing and story scenes
freeze both workers. The coworker carries rather than risking throws.

Regular arrivals are three times as frequent: every 2 seconds during the opening,
then every 1⅓ seconds in flow and every second during the final rush. Two random
everyday parcels are interleaved between authored reference parcels. Sixteen
ordinary labels include documents, books, shoes, clothing, kitchenware, spare
parts and sports equipment, using five different package forms. Original joke
freight and Brian's five actual bulk parcels remain. Brian's burst uses one-second
intervals; the shared minimum belt spacing still applies, including speed ramps,
brakes and blocked receiving.

Held 3D freight is placed in front of the worker using the actual scaled parcel
depth. Its transform follows the worker's turn directly, preventing interpolation
through the torso. The 2D offset clears the worker's silhouette as well.

**F / THROW** targets the nearest physical drop. It does not automatically find
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

Regression coverage includes the range boundaries, varied freight and contact
spacing, coworker stair navigation and switching, all 3D parcel forms in four
directions, the exact stair risk boundary, wrong throws, Shan's visible visit,
Mesa's keyboard/touch outcomes and clean restart. Fixtures are synthetic.
Physical touch-device usability and audible sound still need manual checks.
