# Night shift asset sources

The playable depot study uses original engine-native vector artwork authored for
this repository in `src/game/slice/DepotArt.ts` and `DepotCastArt.ts`. Every floor tile, painted line,
truck, pallet, crate, parcel, worker, conveyor slat, rail and motor is editable
TypeScript/Phaser geometry. The conveyor's small repeating slat texture is drawn
from that source when the scene starts; it is not an imported bitmap. Labels use
the system Arial/sans-serif stack. No external asset pack or generated image is
used by this scene, and no assets were purchased.

The briefing, console, route guidance and feedback are editable geometry and
system-font text in `src/game/scenes/DepotScene.ts`. Sound effects and music reuse
the repository's existing Web Audio synthesizer in `AudioSystem.ts`; no audio
recordings or third-party sound packs were imported. Precise mechanical alignment
and resolution independence made engine-native art appropriate for this section;
image generation was not used.

The crew, props and special freight are redrawn from the repository's original
`Player`, `FlavorNpc`, `Package`, `SpawnSystem`, and individual NPC/event sources.
`DepotLife.ts` adapts their existing dialogue and story beats; these references
are inherited game content, not newly invented replacements. It preserves the
original names, intentional spellings and profanity. The original art files
remain unchanged. New lobster claws, lotion drips, cigarette wisps, stink lines,
the cartoon gunman and purple demon are also editable engine geometry. There
are no AI-generated bitmaps, external character assets or imported recordings.

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
