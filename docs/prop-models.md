# Prop models

The 3D depot, the Mesa dream and the Southgate mall replace some code-built
props with realistic models from [Poly Haven](https://polyhaven.com), and add a
little set dressing that exists only as models. All of them are CC0.

On software renderers (no GPU, as on CI runners) the game keeps the code-built
props, merged into a few draw calls, and downloads no models. The dressing is
not shown there.

## How it works

`src/three/propModels.ts` lists the props. A scene builds its code-built prop
as before and, on GPU renderers, calls `placeProp(slot, id, { fallback })`:

- The model loads once (the loader is a separate, lazily loaded chunk) and
  every copy shares its geometry, materials and textures.
- The copy stands on the slot's origin, centred on it, facing the slot's +Z.
  `size` scales it to the code-built prop's footprint where that matters.
- The code-built prop is hidden only once the model is in place. If the file
  fails to load, the code-built prop stays and a warning is logged.
- The slot and the stand-in are kept out of static merging (`userData.keep`),
  so one can appear and the other hide later. That costs a few draw calls on
  GPU renderers only.

| Where | Code-built prop | Model |
| --- | --- | --- |
| Depot side walls | 16 emissive fixture strips | `wall-lamp`, scaled to 0.9 m |
| Donna's husband | wooden desk and chair seat | `office-desk`, `school-chair` (the Warcraft monitor stays code-built) |
| Mesa dream | Skanky's stool, the desk under BUILT THE BELT | `metal-stool`, `office-desk` |
| Mall bench pod | none (new) | `trash-can` between the benches |
| Depot front corners | none (new) | storage cart, tool chest, five barrels, a wet-floor sign, two fire extinguishers, a hand truck, a bin |

The depot dressing is listed in `src/three/depotDressing.ts`. It stands in the
two corners by the receiving wall, beside the raised platform, where no crew
route, visitor or truck goes. The mall bin stands inside the bench pod's
obstacle rectangle, which the cart and Skanky cannot enter.

Trucks, pallets, the belt, the conveyors and parcels stay code-built: Poly
Haven has no suitable trucks, pallets or conveyors, and the belt and parcels
are aligned with gameplay. See [Truck options](#truck-options) below.

Before and after, rendered on a GPU from the same camera with the code-built
stand-ins or the models shown: `docs/images/prop-models/` (front-west and
front-east corners, wall lamps, Donna's husband's desk, the Mesa dream, the
mall bench pod).

## Sources and licence

Every model is from Poly Haven and released under
[CC0 1.0](https://polyhaven.com/license) (public domain; no attribution
required, credit given here anyway). The conversion source is each asset's
1k glTF download from `api.polyhaven.com/files/<asset>`, converted on
2026-10-18. `files_hash` is Poly Haven's hash of the asset's files at that time.

| File | Poly Haven asset | Author(s) | files_hash | Triangles | Size |
| --- | --- | --- | --- | --- | --- |
| `wall-lamp.glb` | [industrial_wall_lamp](https://polyhaven.com/a/industrial_wall_lamp) | Kuutti Siitonen | `136c5533789630d2ab312385f75ad413c0d2c221` | 4,446 | 200 KB |
| `office-desk.glb` | [metal_office_desk](https://polyhaven.com/a/metal_office_desk) | Ulan Cabanilla | `687c6d374d4674adb8d065aa3480b04f4f56f2b0` | 6,898 | 297 KB |
| `school-chair.glb` | [SchoolChair_01](https://polyhaven.com/a/SchoolChair_01) | Ethan Place | `f78668ddf3cabcf60afe57e8df1e1982a482617c` | 5,072 | 223 KB |
| `metal-stool.glb` | [metal_stool_02](https://polyhaven.com/a/metal_stool_02) | Ulan Cabanilla | `1a42bd884305ce704ceccec448fefdbe34a28619` | 6,532 | 342 KB |
| `barrel.glb` | [Barrel_02](https://polyhaven.com/a/Barrel_02) | Jorge Camacho | `354f0b9ffcebf4f331533ef183b3eb2fc37ab69e` | 2,688 | 199 KB |
| `wet-floor-sign.glb` | [WetFloorSign_01](https://polyhaven.com/a/WetFloorSign_01) | Fran Calvente | `79eb7de75bfe5924b67412f11e3e63c8abb82593` | 228 | 117 KB |
| `fire-extinguisher.glb` | [korean_fire_extinguisher_01](https://polyhaven.com/a/korean_fire_extinguisher_01) | UM JOORIN | `bf286ac62105374e5c583367e80ce77dcbe6881c` | 9,913 | 316 KB |
| `hand-truck.glb` | [hand_truck](https://polyhaven.com/a/hand_truck) | Mutanzom3D | `b169bd38206dbdde638e2bda547dab1ec7823c39` | 13,220 | 579 KB |
| `tool-chest.glb` | [metal_tool_chest](https://polyhaven.com/a/metal_tool_chest) | Yann Kervran, John Hutcheson | `8fdd3f7409ad7cfd5a4fc3091933d1e1d3785b0e` | 13,360 | 468 KB |
| `storage-cart.glb` | [industrial_storage_cart](https://polyhaven.com/a/industrial_storage_cart) | Jule Bielitz | `1885782cd204ad6fed4d96111bd713aee14fd4bf` | 18,902 | 629 KB |
| `trash-can.glb` | [metal_trash_can](https://polyhaven.com/a/metal_trash_can) (clean bin only) | GurJas Studios | `3ecbee3adbcc53b4af3c8f010e76e10c5b7558a2` | 6,428 | 344 KB |

Total: about 3.7 MB, each file under 1 MB. A GPU player downloads all eleven
the first time the depot is built (the dream's stool and the mall's bin come
with the same files).

## Converting

The converter keeps each model's meshes and only changes formats and sizes:

- textures are resized to the entry's `textureSize` (512 px; 256 px for the
  wall lamp and the extinguisher) and stored as JPEG; colour, normal,
  ambient-occlusion/roughness/metalness and emissive maps are kept;
- positions are stored as 16-bit and normals as 8-bit integers
  (`KHR_mesh_quantization`, read by Three.js without a decoder), about half
  the geometry size;
- glass loses Poly Haven's transmission (which would add a render pass) and
  becomes plain transparent glass;
- `nodes` keeps part of an asset (the trash can asset holds a clean and a
  rusty bin; the clean one is kept).

To add or re-convert a prop:

1. Add an entry to `PROP_MODELS` in `src/three/propModels.ts` with the Poly
   Haven asset id. Check the asset's licence on its page first (all Poly Haven
   assets are CC0).
2. Run `npm run models:polyhaven`, open the printed address and press CONVERT
   (or call `convertProps(['<id>'])` in the console). Each GLB is written to
   `public/models/props/`. `preview.html` on the same server shows every
   converted prop side by side.
3. Call `placeProp` where the prop belongs, on GPU renderers only, and add the
   asset to the table above.

`npm run test:model` checks each file (under 1 MB, JPEG textures no larger
than listed, supported extensions only, real-world size) and that the depot
dressing stays clear of the platform, trucks and every route.
`tests/prop-models-browser.mjs` checks that software renderers download
nothing, and that a GPU-quality depot and mall built in the page place every
model, hide every stand-in and keep the dressing clear of play.

## Truck options

Poly Haven has no trucks. Nothing below was downloaded or bought; each needs
the owner's decision (a purchase, or CC BY attribution in the game's credits)
and a check of its licence, formats and polygon count on the listing itself.

Paid, royalty-free:

- TurboSquid [Box Trucks Collection](https://www.turbosquid.com/fr/3d-models/box-trucks-collection-3d-model-2495035)
  (three trucks, PBR, glTF listed, about $229).
- TurboSquid [Rigged Box Trucks Collection](https://www.turbosquid.com/pl/3d-models/box-trucks-rigged-3d-model-1378758)
  (opening doors and interior; 3ds Max/V-Ray, would need converting).
- TurboSquid [Commercial Vehicle Box Truck Red](https://www.turbosquid.com/es/3d-models/commercial-vehicle-box-truck-red-3d-2508027)
  (photo-real; formats not confirmed).
- Superhive (Blender Market) [Medium Size Box Truck](https://superhivemarket.com/products/medium-size-box-truck-low-poly-3d-model)
  (about 5k triangles, opening rear door with a lift, glTF listed).
- CGTrader [low-poly game-ready truck](https://www.cgtrader.com/3d-models/vehicle/truck/truck-low-poly-game-ready-f5bb5340-453e-46a4-832c-e6c89421b2c0)
  (about 4.9k polygons, PBR) and [delivery truck](https://www.cgtrader.com/3d-models/vehicle/truck/delivery-truck-3d-model)
  (glTF listed, verified).

CC BY (free; credit the author and link the licence):

- Sketchfab [Truck by roy.3dartist](https://sketchfab.com/3d-models/truck-444d7e428fd341d48d192f9e0c04f4e0)
  (about 37k triangles).
- Sketchfab [Low Poly Truck](https://sketchfab.com/3d-models/low-poly-truck-98826ebd44e2492298ac925461509216)
  (about 11k triangles).

A truck model would have to keep the code-built truck's footprint (148 × 72
model pixels), its open rear at deck height and the player trucks' visible
cargo, which `tests/depot-geometry-browser.mjs` checks.
