# Night shift asset sources

The playable depot study uses original engine-native vector artwork authored for
this repository in `src/game/slice/DepotArt.ts`, `DepotCastArt.ts`,
`DepotReceiving.ts` and `DepotProps.ts`. Every floor tile, painted line,
truck, pallet, crate, parcel, worker, conveyor slat, rail and motor is editable
TypeScript/Phaser geometry. The conveyor's small repeating slat texture is drawn
from that source when the scene starts; it is not an imported bitmap. Labels use
the system Arial/sans-serif stack. No external asset pack or generated image is
used by this scene, and no assets were purchased.

The briefing, console, route guidance and feedback are editable geometry and
system-font text in `src/game/scenes/DepotScene.ts`. Sound effects and music are
original editable Web Audio synthesis in `AudioSystem.ts`: layered cardboard
rustles, padded impacts, metal latches, warm bells, filtered electric-key chords
and a restrained brushed rhythm. Soft envelopes, shared seeded noise and a
compressor control clicks and bursts. No audio
recordings or third-party sound packs were imported. Precise mechanical alignment
and resolution independence made engine-native art appropriate for this section;
image generation was not used.

The crew, props and special freight are redrawn from the repository's original
`Player`, `FlavorNpc`, `Package`, `SpawnSystem`, and individual NPC/event sources.
`DepotReferences.ts` keeps exact source dialogue pools; `DepotLife.ts`,
`DepotRoutines.ts` and `DepotMesaEncounter.ts` stage their story beats and props.
These references
are inherited game content, not newly invented replacements. It preserves the
original names, intentional spellings and profanity. The original warehouse
artwork remains available. The shared `MesaDreamScene.ts` uses the upgraded illustration
in `src/game/art/MesaBedroomArt.ts`: moonlit window, textured furnishings, Mesa
cabinet, PS3, capped Trmyte holding a controller, and long-haired Skanky strumming
an electric guitar connected to the amp.
An original geometric homage to Lumines animates falling two-color blocks,
matching squares and a sweeping timeline on the TV. No game screenshots, console
assets, recordings or external fonts were imported. Original poster/monitor copy
and the optional return path to the preview are preserved.
New lobster claws, lotion drips, cigarette wisps, stink lines,
the cartoon gunman and purple demon are also editable engine geometry. There
are no AI-generated bitmaps, external character assets or imported recordings.
All eight personal trucks, Paytman's swimming fish, the five-slot Ralph truck,
driver keys, curry fumes, spill cracks, recovered star, inactive-worker zZz,
John's articulated gestures and AJ's massage are editable Phaser geometry.
Full named freight now carries tied paper labels at a readable size; personal
truck lettering uses larger nameplates. Ben's pointed hell-gate pillars,
red/orange opening and fire are redrawn from the original `BenGunmanEvent` in
`DepotLife.ts`, with a longer adult-demon emergence and body-drag sequence.
The truck artwork now shares one 148 × 84 template across player, coworker and
Ralph trucks. Original truck coordinates and row order come from `GameScene.ts`;
bulk and recovery are separate areas at the conveyor end. The revised layout
uses the same editable geometry and adds no external assets.

The receiving annex adds original articulated semis, open trailer doors,
rollers, unloading workers, a ragged dockhand with belongings, and large green
stink trails. These and Brian's enlarged fumes are editable Phaser geometry.
The final package on the receiving feed uses the same artwork and reserved
identity as its subsequent playable belt parcel; upstream anonymous crates are
staging props. No new imported images or recordings are involved.

The palette uses desaturated blue/teal concrete and steel, kraft cardboard,
timber, warm work lights, and restricted cyan/sage/amber destination accents.
Lighting is represented by authored facets and tight contact shadows. The
artwork is designed to keep the moving belt and route labels legible, without
full-screen glow, motion blur or decorative particles over the play lane.

The conveyor receives the same absolute travel distance as the deterministic
parcel movement. Its repeating slats scroll by the negative of that distance;
static rails and end rollers remain fixed. Workers have separate boots, arms,
heads and contact shadows, with walk animation driven only while moving.

Original shift artwork and mechanics are retained separately. This scene is a
bounded direction study rather than an asset replacement across the game.
