# Imported character models

The 3D depot shows the crew as realistic rigged people from the Microsoft
Rocketbox avatar library (MIT licence) in place of the procedural figures. Any
other glTF/GLB with a humanoid skeleton can be added the same way.

On software renderers (no GPU, as on CI runners) the game keeps the lighter
procedural figures and downloads no models.

## How it works

Every person is still created as the procedural figure in
`src/three/characters.ts`. Its joints (`head`, `leftArm`, `rightForearm`,
`leftShin`, ...) are what the walk cycle, carrying, story scenes and gags pose.
When a model is listed for a character's name, `src/three/characterModels.ts`
loads it once, hides the figure's meshes and, every frame before drawing,
copies each joint's rotation onto the matching model bone. So every existing
pose, from carrying a parcel to lying on the floor, drives the model without
changes to the scenes.

- T-posed and A-posed models are lowered to the figure's rest pose (arms and
  legs straight down) when they are attached.
- Props held in a hand (parcels, coffee, keys) stay on the figure's hand,
  which is moved onto the model's wrist each frame.
- The model is scaled to the figure's height (1.78 m, times the character's
  own `scale`) and stands on the floor.
- Shan's reddening tints the model materials matched by the entry's
  `skinMaterial` pattern (`skin` or `body` by default; `head` for Rocketbox,
  whose body material includes the clothes).
- If a file fails to load or has no recognisable skeleton, the procedural figure
  stays and a warning is logged.
- The loader is a separate chunk of the bundle. Each model downloads the first
  time its character is created.

## Motion-captured clips

On GPU renderers the crew move with motion-captured clips from the same MIT
Rocketbox repository and commit as the avatars. They were captured on the
very Biped skeleton the crew models carry, so they play without retargeting.
`src/three/rocketboxClips.ts` lists them: two standing idles, walk, slow
walk and run, the cough, cheer, clap, wave, phone call, crouch, dance,
drink, shrug and announcement gestures, and the crouch-in and crouch-out
clips a lift plays, each in a male and a female version
(the four women use the female ones). `tools/rocketbox` converts them into
one file, `public/models/animations/crew-clips.glb` (about 4.6 MB), keeping
every bone's rotation, fingers included, and the root's rise and fall, and
removing the root's travel across the floor: the game moves the character and
the clip plays in place, sped up or slowed to match the character's real
speed so the feet do not slide. Each person starts their clips at a
different point, so the crew do not idle in step.

What a character is doing comes from the same code as before: the walk cycle
records whether they move or carry, and the pose code records the named pose
or a seat. `characterModels.ts` picks the clip and cross-fades to it over a
quarter of a second. The figure's pose is blended over the clips wherever a
clip would be wrong:

- carrying (and Kylie's raised cup), where the arms follow the figure while the
  legs and body walk or idle;
- a throw, a seat, lying down, and every pose without a clip (the squat,
  massage, push, keys and others), where the whole body follows the figure;
- a lift or put-down, where the body goes down and comes back up on the
  crouch-in and crouch-out clips (each half plays its measured movement,
  `CLIP_SPANS`, in half of `LIFT_SECONDS`) while the arms follow the figure's
  reach for the parcel;
- a stair flight, where the legs follow the figure, whose feet are planted on
  the treads (`footing.ts`);
- reduced motion, where the clips stop and the figure takes over.

Termite and Skanky's head turn toward their work is added on top of the
clip's head. Software renderers (CI) and any model without a clip set follow
their figures exactly as before.

Walking uses a restrained opposite arm swing with relaxed elbow flexion.
Carrying keeps upper arms beside the ribs and bends primarily at the elbows.
Angry and celebratory poses keep the hands on their own sides of the torso,
avoiding the former chest-crossing, clapping motion. Regression checks cover
complete pose cycles and the actual elbow/wrist positions on all 23 crew rigs.
The separately loaded devil uses its own animation clips; see
[prop sources](../public/models/PROP-SOURCES.md).

## The crew

`src/three/rocketboxCast.ts` lists each character's Rocketbox avatar, and
`CHARACTER_MODELS` is built from it. Each person was matched to the character's
hair, beard, clothes and role:

| Character | Rocketbox avatar | File |
| --- | --- | --- |
| Termite (TERMITE, TRMYTE) | Professions/Delivery_Male_01 | `termite.glb` |
| Skanky | Adults/Male_Adult_06 | `skanky.glb` |
| Shan O'Mac | Professions/Business_Male_07 | `shan.glb` |
| Kylie | Adults/Male_Adult_10 | `kylie.glb` |
| Vic | Adults/Male_Adult_05 | `vic.glb` |
| John Rushton | Adults/Male_Adult_08 | `john-rushton.glb` |
| Hussan | Adults/Male_Adult_17 | `hussan.glb` |
| AJ | Adults/Male_Adult_14 | `aj.glb` |
| Ben | Adults/Male_Adult_02 | `ben.glb` |
| Bannerman | Adults/Male_Adult_13 | `bannerman.glb` |
| Fruit Loop | Adults/Male_Adult_01 | `fruit-loop.glb` |
| Doris | Adults/Female_Adult_04 | `doris.glb` |
| Brian | Professions/Gardener_Male_01 | `brian.glb` |
| Donna | Adults/Female_Adult_15 | `donna.glb` |
| Paula Abdul | Adults/Female_Adult_05 | `paula-abdul.glb` |
| Ralph | Professions/Wood_Male_01 | `ralph.glb` |
| Gunman | Adults/Male_Adult_18 | `gunman.glb` |
| Donna's husband | Adults/Male_Adult_07 | `donnas-husband.glb` |
| Cashier | Adults/Male_Adult_12 | `cashier.glb` |
| Clerk | Adults/Female_Adult_11 | `clerk.glb` |
| Unloaders | Professions/Construction_Male_08 | `unloader.glb` |
| Driver | Adults/Male_Adult_16 | `driver.glb` |
| Dockhand | Adults/Male_Adult_04 | `dockhand.glb` |

Source: [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox),
commit `0943055db6ec570bcef9f2c8b41c9e5467c808f9`, released under the MIT
licence (November 2020), Copyright (c) 2020 Microsoft; the licence text ships
beside the models in `public/models/characters/ROCKETBOX-LICENSE.md`. The converted
files keep the original meshes and skeletons; only formats and texture sizes
change.

Kylie uses the male avatar at 86% of normal height (about 1.53 m). AJ uses the
bald, clothed male avatar with glasses fitted in front of the face; the glasses
remain visible when the procedural figure is hidden. These two recasts replace
only their own GLBs and retain their existing dialogue, props and animations.

## Converting Rocketbox avatars

Rocketbox ships 3ds Max FBX files with 2048 px TGA textures. The converter in
`tools/rocketbox/` turns each cast entry into a GLB:

```sh
npm run models:rocketbox
```

Open the printed address (http://127.0.0.1:5180) in a browser and press
**CONVERT**. The page loads each avatar's FBX with its colour, normal and
specular textures from the pinned commit on GitHub (about 800 MB for the
whole crew, held in memory), converts it and writes
`public/models/characters/<file>.glb` through the dev server. A scripted run
can call `window.convertRocketbox(files?)` instead of pressing the button. It:

- keeps the highest level of detail (about 7–9k triangles per person) and
  merges shared vertices;
- replaces the 3ds Max materials with glTF materials;
- keeps each normal map, in glTF's convention: the converter tests which way
  each map's green channel points (a normal map's slopes have no curl when
  read the right way round) and inverts the 3ds Max (DirectX) ones. In the
  2026-10-20 conversion 47 of 49 maps were inverted; one each on Skanky and
  the dockhand already pointed the glTF way;
- turns each specular map into a glTF roughness map: 0.94 on the dullest
  texels to 0.52 on the shiniest, against the map's own 95th percentile;
- stores opaque colour and normal maps as JPEG (1024 px for Termite and
  Skanky, 512 px for everyone else), the roughness map at half that, and hair
  cut-outs as PNG with alpha, at most 512 px, with no normal or roughness map.

The same page converts the clips: `window.convertRocketboxClips()` loads each
role's male and female FBX from `Assets/Animations` at the pinned commit (about
70 MB), drops redundant keys (most of a motion-capture track; under 0.0025 rad
or 1 mm of error) and writes `public/models/animations/crew-clips.glb`; it
reports each clip's natural ground speed, which `CLIP_SPEEDS` in
`rocketboxClips.ts` records for the locomotion clips. `window.inspectClip(path)`
prints a clip's hierarchy and tracks, for checking a new one.

To recast someone, change their entry in `rocketboxCast.ts`, run the converter
and check `npm run test:model`, which verifies every listed file.

## Making a model with MakeHuman

MakeHuman gives realistic people with control over body, face, age, skin, hair
and clothes. The MPFB add-on runs it inside Blender, which exports GLB directly.

1. Install Blender and the MPFB add-on (static.makehumancommunity.org/mpfb.html).
2. In MPFB, create a human. Shape the body and face, set the skin, and add eyes,
   eyebrows, hair and clothes. For phones, pick a low-poly **proxy** body
   topology and low-poly hair and clothes.
3. Add a skeleton: **Game engine** or **Default**. Both are recognised.
4. Leave the character facing Blender's front view (−Y), standing at the origin.
5. Export with **File → Export → glTF 2.0**: format **glTF Binary (.glb)**,
   **+Y Up** on, **Apply Modifiers** on, animation off. Export only the
   character's objects (body, clothes, hair, armature).

Aim for about 10–20k triangles and 1024 px textures, a file of a few megabytes
at most; up to 20 people can be on screen. Meshopt compression is supported
(`gltf-transform optimize in.glb out.glb --compress meshopt`); Draco is not.

Other sources work the same way if they have a humanoid skeleton: Mixamo
characters (`mixamorig:` bones), Microsoft Rocketbox (`Bip01` bones) and other
MakeHuman exports. Keep to one source for the whole crew so people look like
they belong together.

## Adding a model to the game

1. Put the file in `public/models/characters/`, for example `termite.glb`.
2. List it in `CHARACTER_MODELS` in `src/three/characterModels.ts` (a
   Rocketbox avatar goes in `rocketboxCast.ts` instead):

   ```ts
   { names: ['TERMITE', 'TRMYTE'], url: '/models/characters/termite.glb' },
   ```

   `names` are the character names from each `CharacterSpec`. Termite is
   `TERMITE` in the depot and `TRMYTE` in the Mesa dream. Others include `SKANKY`,
   Shan (`SHAN_NAME` in `src/three/world.ts`), `KYLIE`, `VIC`, `JOHN RUSHTON`,
   `HUSSAN`, `AJ`, `BEN`, `BANNERMAN`, `FRUIT LOOP`, `DORIS`, `BRIAN`, `DONNA`,
   `RALPH`, `PAULA ABDUL`, `UNLOADER`, `DRIVER` and `DOCKHAND`.
3. If the model faces sideways or backwards, set `rotationY` (radians). Set
   `height` (metres) for a person who should stand taller or shorter than 1.78 m.
4. Run the game and check the person standing, walking, carrying and in the
   story scenes.
5. Record its source and licence in this document.

Only use models whose licence allows use in this game. MakeHuman's own
built-in assets export as CC0; community assets and other sources have their
own licences, so check each one. Never commit a model whose licence is unknown.

## Checks

`tests/character-clips-model.mjs` checks the clip library: every role in both
bodies, rotations and the root's height only (no per-bone position or scale,
no 3ds Max helpers), every clip bone present on every crew model, each
avatar's hip height within 5 cm of its body's clips, the root held in place
(15 cm of sway at most, 20 for gestures and 35 for the dance) and a natural
speed recorded for each locomotion clip. `tests/character-model-browser.mjs`
plays the clips on the real cast, a man and a woman, and checks that the torso
and fingers move under them, that they play in place, and that a pose without
a clip and reduced motion hand the body back to the figure.

`tests/character-cast.mjs` checks every committed crew model: one file per
cast entry and no extras, at most 2 MB each, one skinned mesh with the
expected bones, a head material, JPEG textures and real character names.
`tests/character-models.mjs` and `tests/character-model-browser.mjs` first use a
synthetic humanoid built in code (`tests/fixtures/humanoid.mjs`). They check loading, side matching, the rest pose, posed
limbs, held props, lying down, skin tint, per-copy materials, fallback and
removal, and that the shipped game swaps the workers' figures and animates
the model during play.

The browser check also decodes and attaches all 23 shipped models in controlled
depot, story, mall and dream scenes. The 3D run of
`tests/gameplay-adjustments-browser.mjs` explicitly loads the real Termite,
Skanky and Shan even on software graphics. It measures actual worker torso
clearance for 14 parcel forms in four directions on both workers, then checks
truck entry, roof transparency, persistent shelf positions, capacity, overflow,
restart and Shan's breakage reaction. Cargo and late-game states are synthetic;
inputs and the production renderer are real. The ordinary software fallback is
still checked separately.
