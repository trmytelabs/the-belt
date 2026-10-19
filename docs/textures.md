# Depot surface textures

The 3D depot's floor, platform deck, conveyor belt, steel rails, truck bodies
and cardboard parcels use photo-based, physically based (PBR) textures. The
shapes, layout and belt motion stay code-built in `src/three/world.ts` and
`src/three/parcels.ts`; only the surface materials changed. The textures
live in `public/textures/` and load through `src/three/textures.ts` before
the depot is built.

Every asset is **CC0 1.0 (public domain dedication)**. No attribution is
required, but it is recorded here so every file can be traced back to its source.

## Assets

| Surface | Files in `public/textures/` | Source asset | Licence |
|---|---|---|---|
| Lower floor and raised platform deck | `concrete_color.webp`, `concrete_normal.webp`, `concrete_arm.webp` | Poly Haven, [Concrete Floor Worn 001](https://polyhaven.com/a/concrete_floor_worn_001) (photography Dimitrios Savva, processing Rico Cilliers), 1k JPG: diffuse, nor_gl, arm | [CC0](https://polyhaven.com/license) |
| Conveyor belt surface | `rubber_color.webp`, `rubber_normal.webp`, `rubber_arm.webp` | ambientCG, [Rubber004](https://ambientcg.com/view?id=Rubber004), 1K-JPG: Color, NormalGL, Roughness | [CC0](https://docs.ambientcg.com/license/) |
| Belt side rails, skirts, legs and rollers; stair treads; truck chassis and rolled doors | `steel_color.webp`, `steel_normal.webp`, `steel_arm.webp` | ambientCG, [Metal038](https://ambientcg.com/view?id=Metal038), 1K-JPG: Color, NormalGL, Roughness, Metalness | [CC0](https://docs.ambientcg.com/license/) |
| Yellow guard and stair rails; relief and wear on truck bodies, cabs and Ralph's five-ton | `paint_color.webp`, `paint_normal.webp`, `paint_arm.webp` | ambientCG, [PaintedMetal001](https://ambientcg.com/view?id=PaintedMetal001), 1K-JPG: Color, NormalGL, Roughness, Metalness | [CC0](https://docs.ambientcg.com/license/) |
| Cardboard parcels, truck cargo and bulk crates | `cardboard_color.webp`, `cardboard_normal.webp`, `cardboard_arm.webp` | ambientCG, [Cardboard004](https://ambientcg.com/view?id=Cardboard004), 1K-JPG: Color, NormalGL, Roughness | [CC0](https://docs.ambientcg.com/license/) |

Downloaded 2026-10-18. SHA-256 of the original downloads:

| Download | SHA-256 |
|---|---|
| `concrete_floor_worn_001_diff_1k.jpg` | `6e40c0fc908f4d66431836f5abe203f3a4eb064e88824378a91a46a26e2f464c` |
| `concrete_floor_worn_001_nor_gl_1k.jpg` | `523bd94a1be5dd2f11c2ae2b7d7c77445cf5bd9e41604db515a7c8364dcba067` |
| `concrete_floor_worn_001_arm_1k.jpg` | `b21e63637d04b969894bd40a45df185d77671ed74b8955cd6e403c34ed465043` |
| `Rubber004_1K-JPG.zip` | `d8933e73c3b983892209bb143ca4bc13a48e4d55720ab12f6e6a303c96c84a31` |
| `Metal038_1K-JPG.zip` | `804a0e45cc923c71277f89b7e1a7b95bd8786899254e43692eb781b8c3981aae` |
| `PaintedMetal001_1K-JPG.zip` | `3e766388832357cdb472102368ef4a237c7ce38a540eec7eb415869c7825d0db` |
| `Cardboard004_1K-JPG.zip` | `f427eb664e0cbc97fc1e7066a800f3ad656ad4eeaa0d0314182ea8b7f03e4a64` |

## How the files were prepared

Each surface has three files, so all fifteen total about 850 KB to download
and about 40 MB of GPU memory with mipmaps:

- `*_color.webp`: the colour (albedo) map, WebP quality 82, sRGB.
- `*_normal.webp`: the OpenGL-convention normal map, WebP quality 88, linear.
- Concrete and paint colour and normal maps, and the rubber colour map, are
  1024 × 1024. Steel and cardboard maps and the fine-grained rubber normal map
  are 512 × 512: thin rails and small cartons never fill enough of a
  phone screen to use more. The rubber colour map is only drawn into the
  belt's 512 × 256 canvas and is never uploaded to the GPU itself.
- `*_arm.webp`: ambient occlusion, roughness and metalness packed into the
  red, green and blue channels, 512 × 512, WebP quality 85, linear. Poly Haven
  supplies this packed map. For ambientCG sets it was packed from the separate
  Roughness and Metalness maps, with red set to white (no occlusion) and blue set
  to black where a set has no metalness map.

They were resized and encoded with the Chromium browser bundled with the
repository's Playwright dev dependency (canvas `convertToBlob`), without colour
conversion for the data maps. No new dependency was added. The DirectX normal
maps, displacement maps, preview images and Blender/USD/MaterialX files in
the ambientCG archives were not used and are not committed.

## Use in code

- `loadSurfaces()` loads every texture before the depot is built. If a
  file is missing or takes longer than eight seconds, the depot falls back
  to exactly the flat materials and canvas textures it used before.
- `surfaceMaterial(name, flat)` takes the flat material a mesh used before
  and returns its textured replacement. It tints the colour map and scales
  roughness by each set's measured average (`SURFACE_MEANS`), so the depot
  keeps its palette and brightness, and the photo adds grain, relief and wear.
  Truck bodies, cabs and Ralph's five-ton use the paint relief and roughness
  without its yellow colour map, keeping each truck's own colour; paint's bare-metal
  scratches stay metallic.
- Identical requests return one shared material. Merged meshes key on
  texture identity, and `merge.ts` now also compares normal, roughness,
  metalness and AO maps, so meshes on the same surface still merge into one
  draw call and different surfaces never merge together.
- Textures are never repeated per material. `boxUVs()` and `scaleUVs()` size
  each mesh's own UVs so one texture tile spans a fixed real-world size
  (concrete 3 m, steel 1 m, paint 1.5 m, rubber 1 m, cardboard 0.6 m).
  Geometry, positions and bounds are unchanged.
- The belt keeps its code-built geometry and scrolling. Its colour map is
  drawn once from the photo rubber with the original slat joints and bolts
  over it, so movement stays easy to read. Its normal and roughness maps are
  clones that share the uploaded images, and every belt map scrolls by the
  same belt travel.
- Steel also covers the stair treads and the trucks' rolled doors. Photo
  cardboard also covers truck cargo, the bulk crates and the box Ralph carries.
- Shared textures are flagged `userData.shared`, and `disposeObject3D()`
  leaves them loaded, so a dispatched or removed parcel does not force the GPU
  to upload them again.
- `tests/three-textures.mjs` checks the committed files, this record, the
  flat fallback, merge separation, disposal and UV sizing.

To replace a texture, keep the same file names and channel layout, add the
new source and licence to the tables above, re-measure its averages for
`SURFACE_MEANS`, and check the depot in the browser.
