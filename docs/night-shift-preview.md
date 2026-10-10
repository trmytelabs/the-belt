# Night Shift / Depot 07

This is one playable section for direction review, not a replacement of the
full game or a release. The original three-minute shift, narrative events,
special parcels, NPCs, and alternate scenes remain accessible from the preview
briefing and at `?mode=classic`. The repository remains a private 0.0.0 snapshot.

## Why this direction

The original's strongest decision is when to switch between workers while
freight keeps moving. The preview preserves that decision and the three route
types, heavy carries, temporary belt stops, and recovery. It reduces the opening
section to the usable destinations so the player can learn its spatial language.

The original playthrough exposed several readability problems: movement keys
were not taught; parcel names were more prominent than their routing; many
decorative trucks looked like valid destinations; and tiny workers crossed a
large floor before reaching the first parcel. Layers of dark brown, light halos,
inconsistent shadows, and unrelated shape styles obscured the play lane.

The new scene uses a restrained midnight freight palette, a consistent shallow
overhead view, illustrated steel and timber, kraft parcels, and warm task lights.
Route letters accompany cyan, sage, and amber accents. Art and functional
affordances share the same language: lit approach bays, contact shadows,
selection brackets, and a short dotted delivery guide.

## Movement and rules

`ShiftModel.ts` owns the deterministic simulation. Belt parcels store an offset
from one absolute conveyor travel distance, which also drives the tread texture
and motor rotation. Speed changes and brakes cannot put parcel motion out of
phase with the belt. The scene smooths only the short pickup transfer; seated
parcels are rendered at their exact model position. No rigid-body physics is
needed for a sorting belt with intentional lane constraints.

Workers stay on their sides, normalize diagonal movement, and slow down under
load. Drops reject occupied space. Parcels can be returned to the belt and handed
to the other worker. Deliveries require an explicit action in a dock: a wrong
destination keeps the parcel and explains where it belongs. Correct deliveries
move into the bay with restrained animation and existing synthesized audio.

The first six parcels teach A, B, and C at six-second intervals. Flow increases
after 36 seconds, then enters a rush after 63 seconds; speed ramps smoothly.
New freight stops at 90 seconds, with up to ten seconds of cleanup. Twelve
dispatches meets the target. Five simultaneous missed parcels fill the recovery
bay and end the shift. Recovery earns half base points; a parcel never adds the
same miss twice. The input, pause, mute, and results paths support repeat play.

## Verification and review boundary

`npm run build` checks strict TypeScript and the production bundle.
`npm run test:model` runs deterministic rule tests, including a full shift won
through movement and action inputs. `npm run test:browser` tests the original
game and the preview on desktop and touch, with no production test hooks.
The opening preview test completes naturally spawned A/B/C deliveries with real
keyboard input, then uses explicit synthetic fixtures for edge cases.

Comparison screenshots are local review artifacts and are not committed.
The preview should be reviewed for difficulty, character style, legibility, and
sound on a physical device before carrying this direction through the original
full shift. Automated browser checks do not establish that audio sounds good on
speakers, or that controls feel good on every touch device. No public deployment
or publication is part of this change.
