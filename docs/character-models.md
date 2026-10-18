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

Animations from the file (for example Mixamo clips) are not used yet; the
figure's poses drive the model. Natural walk, idle and carry clips would be a
later step.

## The crew

`src/three/rocketboxCast.ts` lists each character's Rocketbox avatar, and
`CHARACTER_MODELS` is built from it. Each person was matched to the character's
hair, beard, clothes and role:

| Character | Rocketbox avatar | File |
| --- | --- | --- |
| Termite (TERMITE, TRMYTE) | Professions/Delivery_Male_01 | `termite.glb` |
| Skanky | Adults/Male_Adult_06 | `skanky.glb` |
| Shan O'Mac | Professions/Business_Male_07 | `shan.glb` |
| Kylie | Adults/Female_Adult_01 | `kylie.glb` |
| Vic | Adults/Male_Adult_05 | `vic.glb` |
| John Rushton | Adults/Male_Adult_08 | `john-rushton.glb` |
| Hussan | Adults/Male_Adult_17 | `hussan.glb` |
| AJ | Professions/Sports_Male_01 | `aj.glb` |
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

## Converting Rocketbox avatars

Rocketbox ships 3ds Max FBX files with 2048 px TGA textures. The converter in
`tools/rocketbox/` turns each cast entry into a GLB:

```sh
npm run models:rocketbox
```

Open the printed address (http://127.0.0.1:5180) in a browser and press
**CONVERT**. The page loads each avatar's FBX and colour textures from the
pinned commit on GitHub (about 800 MB for the whole crew, held in memory),
converts it and writes `public/models/characters/<file>.glb` through the dev
server. It:

- keeps the highest level of detail (about 7–9k triangles per person) and
  merges shared vertices;
- replaces the 3ds Max materials with glTF materials and drops normal and
  specular maps, which add size but no visible detail at the game's camera
  distance;
- stores opaque textures as JPEG (1024 px for Termite and Skanky, 512 px for
  everyone else) and hair cut-outs as PNG with alpha, at most 512 px.

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

`tests/character-cast.mjs` checks every committed crew model: one file per
cast entry and no extras, at most 1.5 MB each, one skinned mesh with the
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
