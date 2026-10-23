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
| Arrival lot paving, city roads and dock aprons | `asphalt_color.webp`, `asphalt_normal.webp`, `asphalt_arm.webp` | Poly Haven, [Asphalt Snow](https://polyhaven.com/a/asphalt_snow) (`asphalt_snow`, by eye-candy.xyz, files hash `bb9360a6`), 1k JPG: diff, nor_gl, arm | [CC0](https://polyhaven.com/license) |
| City sidewalks (packed snow) | `snowpack_color.webp`, `snowpack_normal.webp`, `snowpack_arm.webp` | Poly Haven, [Snow Floor](https://polyhaven.com/a/snow_floor) (`snow_floor`, by eye-candy.xyz, files hash `8cd3f01d`), 1k JPG: diff, nor_gl, arm | [CC0](https://polyhaven.com/license) |
| The drives' brick blocks and the road's passing brick | `brick_color.webp`, `brick_normal.webp`, `brick_arm.webp` | Poly Haven, [Red Brick 03](https://polyhaven.com/a/red_brick_03) (`red_brick_03`, Rob Tuytel), 1k JPG: diff, nor_gl, arm | [CC0](https://polyhaven.com/license) |
| The drives' plastered blocks, the house (stucco outside, plaster inside), Cha for Tea's walls and the mall's plaster and paint | `plaster_color.webp`, `plaster_normal.webp`, `plaster_arm.webp` | Poly Haven, [Beige Wall 001](https://polyhaven.com/a/beige_wall_001) (`beige_wall_001`, photography Dimitrios Savva, processing Rico Cilliers), 1k JPG: diff, nor_gl, arm | [CC0](https://polyhaven.com/license) |
| The depot's corrugated walls: the lot's long wall and the depot's own side, receiving and rear walls | `siding_color.webp`, `siding_normal.webp`, `siding_arm.webp` | Poly Haven, [Corrugated Iron 02](https://polyhaven.com/a/corrugated_iron_02) (`corrugated_iron_02`, photography Sergej Majboroda, processing Jenelle van Heerden), 1k JPG: diff, nor_gl, arm | [CC0](https://polyhaven.com/license) |
| The house's floor, Cha for Tea's wainscot, the mall's wood | `wood_color.webp`, `wood_normal.webp`, `wood_arm.webp` | Poly Haven, [Wood Floor](https://polyhaven.com/a/wood_floor) (`wood_floor`, Dimitrios Savva), 1k JPG: diff, nor_gl, arm | [CC0](https://polyhaven.com/license) |

The depot sets were downloaded 2026-10-18 and the outdoor sets 2026-10-20,
each Poly Haven file matching the MD5 its API publishes. SHA-256 of the
original downloads:

| Download | SHA-256 |
|---|---|
| `concrete_floor_worn_001_diff_1k.jpg` | `6e40c0fc908f4d66431836f5abe203f3a4eb064e88824378a91a46a26e2f464c` |
| `concrete_floor_worn_001_nor_gl_1k.jpg` | `523bd94a1be5dd2f11c2ae2b7d7c77445cf5bd9e41604db515a7c8364dcba067` |
| `concrete_floor_worn_001_arm_1k.jpg` | `b21e63637d04b969894bd40a45df185d77671ed74b8955cd6e403c34ed465043` |
| `Rubber004_1K-JPG.zip` | `d8933e73c3b983892209bb143ca4bc13a48e4d55720ab12f6e6a303c96c84a31` |
| `Metal038_1K-JPG.zip` | `804a0e45cc923c71277f89b7e1a7b95bd8786899254e43692eb781b8c3981aae` |
| `PaintedMetal001_1K-JPG.zip` | `3e766388832357cdb472102368ef4a237c7ce38a540eec7eb415869c7825d0db` |
| `Cardboard004_1K-JPG.zip` | `f427eb664e0cbc97fc1e7066a800f3ad656ad4eeaa0d0314182ea8b7f03e4a64` |
| `asphalt_snow_diff_1k.jpg` | `07ca86302150f68f3cf72735fb3d0eb5657d180cc53cfaf48aae9c36305def84` |
| `asphalt_snow_nor_gl_1k.jpg` | `0ad8a2f05611f68e78e9a3bc5f117b6998ee796867fef1b077f23bfb2069ebfa` |
| `asphalt_snow_arm_1k.jpg` | `22b3cf34d5205aa9727132fe2473b41358d7ef998f07fa4cde5a9f0ac1385969` |
| `snow_floor_diff_1k.jpg` | `8d016825951e84d03417e8e8cf563144539ecc4588a30a0c35b0134d508b58b8` |
| `snow_floor_nor_gl_1k.jpg` | `356b7194e9a20975a8ca3398daa5f2ba53aebb02644314c7a0a9c0cc22b5fb58` |
| `snow_floor_arm_1k.jpg` | `09a92eff6a150723981d80a36a653f11f28e0e79ef64ef34d246824abf496cd5` |
| `red_brick_03_diff_1k.jpg` | `9c58254c099b2d211478f50a427fcdde622af24249ff2e94da41fb836f8c857f` |
| `red_brick_03_nor_gl_1k.jpg` | `9bfd45e24720d851017c1e1678b70219c72239b2ac6b25e11d57d458bdab8503` |
| `red_brick_03_arm_1k.jpg` | `31d8d33a9c44af49cd082eae8f49016aaca6d55f2fd80be2183e2ba9185bd8cf` |
| `beige_wall_001_diff_1k.jpg` | `72104704d0b9bd3713c5f6238971252b63eccf6e61263059c674caa8f3d0fa6d` |
| `beige_wall_001_nor_gl_1k.jpg` | `cec747be50f91da0693986080b6f59ef868d53cb2ab7d577982165ece63ed75e` |
| `beige_wall_001_arm_1k.jpg` | `2382c7cccde8baedb61830a3c61264c5567aca4fbf825425fcc0544d40323f3d` |
| `corrugated_iron_02_diff_1k.jpg` | `7a7b43099d015c1b08ebb175da5965caeae44b86de65a727b3fffa20a7c69a93` |
| `corrugated_iron_02_nor_gl_1k.jpg` | `9743c93668689c36a67e9c4dc8d6a0870fe91202f82dcdaf70ddc330c12f9ecb` |
| `corrugated_iron_02_arm_1k.jpg` | `da4197f5b3e199ef693082836ca803f9d5cad2b4998a1c1c3dc4ac384f93a890` |
| `wood_floor_diff_1k.jpg` | `2a1c07687b6dbb214c4b9213739c6d92d425f1f0fc8ab3ac157f105d78240789` |
| `wood_floor_nor_gl_1k.jpg` | `452247f0d0d1b7fc7f8324ff3b6ed60bcc6de1405f4284eeb8d9bce90d4939c2` |
| `wood_floor_arm_1k.jpg` | `a84d9457fa35a76cf8a41da8bcef55387230c6b236819de878799585eda76059` |

The building and interior sets (brick, plaster, siding, wood) were downloaded 2026-10-22, each file matching
the MD5 Poly Haven's API publishes, and converted the same way at 512 px (colour and normal) and 256 px (packed
maps). They took the textures from about 1.25 MB to about 1.5 MB. The city's blocks are vertex-coloured, so they use
`vertexSurfaceMaterial` (the photo's grain under each block's tint), and the photo is also drawn, lifted to a light
grey, into the wall round each window cell; brick tints get brick, the rest plaster. A photo's real size is
`SURFACE_TILE` (brick 1 m, the others 2 m).

## How the files were prepared

Each surface has three files, so all twenty-one total about 1.25 MB to
download and about 45 MB of GPU memory with mipmaps:

- `*_color.webp`: the colour (albedo) map, WebP quality 82, sRGB.
- `*_normal.webp`: the OpenGL-convention normal map, WebP quality 88, linear.
- Concrete and paint colour and normal maps, and the rubber colour map, are
  1024 × 1024. Steel and cardboard maps and the fine-grained rubber normal map
  are 512 × 512: thin rails and small cartons never fill enough of a
  phone screen to use more. The rubber colour map is only drawn into the
  belt's 512 × 256 canvas and is never uploaded to the GPU itself. The
  outdoor asphalt and packed-snow maps are also 512 × 512: each photo covers
  2 m (`PAVING_TILE`), so that is 4 mm a texel at the drive's chase-camera
  distance, and the 1024 versions would have broken the 2 MB budget.
- The outdoor sets tint to the flat colours they replace like the depot's:
  dark wet asphalt in the lot (`story.ts`), the city's grey asphalt and dock
  aprons and its pale sidewalks (`driving.ts`). Road markings stay flat paint.
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
