# Imported character models

The 3D depot can show a made-in-a-tool character model (glTF/GLB with a
humanoid skeleton) in place of any procedural person. Nothing is listed yet, so
the game still draws every person from code and loads no model files.

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
- Shan's reddening tints any model material whose name contains `skin` or
  `body`.
- If a file fails to load or has no recognisable skeleton, the procedural figure
  stays and a warning is logged.
- The loader is a separate chunk of the bundle, downloaded only when a model is
  listed.

Animations from the file (for example Mixamo clips) are not used yet; the
figure's poses drive the model. Natural walk, idle and carry clips would be a
later step.

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
MakeHuman exports. Use one source for the whole crew so people look like they
belong together.

## Adding a model to the game

1. Put the file in `public/models/characters/`, for example `termite.glb`.
2. List it in `CHARACTER_MODELS` in `src/three/characterModels.ts`:

   ```ts
   export const CHARACTER_MODELS: CharacterModelEntry[] = [
     { names: ['TERMITE', 'TRMYTE'], url: '/models/characters/termite.glb' },
   ];
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
5. Record the model below.

Only use models whose licence allows use in this game. MakeHuman's own
built-in assets export as CC0; community assets and other sources have their
own licences, so check each one. Never commit a model whose licence is unknown.

## Models in use

| Character | File | Source | Licence |
| --- | --- | --- | --- |
| — | — | — | — |

## Checks

`tests/character-models.mjs` and `tests/character-model-browser.mjs` use a
synthetic humanoid built in code (`tests/fixtures/humanoid.mjs`), not a
third-party model. They check loading, side matching, the rest pose, posed
limbs, held props, lying down, skin tint, per-copy materials, fallback and
removal, and that the shipped game swaps the workers' figures and animates
the model during play.
