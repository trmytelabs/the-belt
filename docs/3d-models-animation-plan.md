# 3D models and animation: strategy and roadmap (October 2026)

Follows [the 3D audit](3d-audit-2026-10.md) and its baseline screenshots in
`docs/images/audit-2026-10/`. Scope rules are unchanged: Three.js r180 in
the browser, the 3D depot only, the legacy 2D game untouched, the
software-renderer fallback preserved, every change as a checked pull request.

## Owner decisions this plan is built on

| Decision | Choice |
| --- | --- |
| Interiors | Glass-only: seats, dashboard, wheel and a seated driver that hold up through the windows. No first-person camera. |
| Art direction | Grounded realism: keep the Rocketbox crew and PBR depot; raise vehicles and city to meet them. |
| Budgets | Desktop first: about 60 MB of models in total, 4 MB per vehicle, 60 fps at 1080p on a mid-range laptop GPU. Phones keep the procedural fallback. |
| Licences | CC0 and MIT only, and nothing paid at any tier. No CC-BY. The game stays private. |
| Horizon | Short: the owner wants this in weeks, not a quarter. The roadmap below is about five weeks of phased PRs. |
| Models | Use existing models. Where no suitable existing model exists, accept the limitation rather than commission or hand-build one. |

Research notes: every external fact below was read from the linked page on
2026-10-20; "unverified" marks anything a page did not state. Nothing was
downloaded or bought.

## 1. Asset acquisition

### The decisive finding

The Microsoft Rocketbox repository, the MIT source of the 23 crew models,
also ships **417 animation clips authored for the same Biped skeleton**
(`Assets/Animations`, added 4/2022 per its README). They are `.max.fbx`
files in three folders: in-place (`static`, about 330 clips: idles, coughs,
yawns, waiting, cheers, claps, waves, phone, talk and listen gestures,
dancing, crouch idle, bag and trolley holds, door knocks, desk work), planar
root motion (`xy`: walk and run in neutral, slow, fast, cool, stroll,
drunk, injured and funny variants, with start, stop and walk-to-run) and
full root motion (`xyz`: sit down and stand up at a chair or table, turns of
60, 90, 120 and 180 degrees with to-walk variants, phone talk). Male and
female versions of nearly everything. The repository was archived read-only
on 2026-10-02, so it stays downloadable but will not change. Source:
[microsoft/Microsoft-Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox).
The README does not state a separate licence for the clips; they sit in the
MIT repository (inference, to be confirmed by reading `LICENSE.md`).

That removes retargeting from the critical path for the crew. Missing from
the set: carry walk, lift, put down, throw and steering. Lift and put down
map onto Rocketbox's own `crouch_in` and `crouch_out` with the carry arms
overlaid; carry walk, carry idle and throw come from the free CC0 tier of
Quaternius's second library (`WALK_CARRY`, `IDLE_CARRY`, `OVERHAND_THROW`,
`COUGHING`, `WAVE` are among its 42 free clips, read from the page's image
text so treat the names as approximate) retargeted once; steering stays a
seated idle with the hands placed by IK. Nothing is bought.

### The vehicle finding

No CC0 sedan with an interior was found on Sketchfab, Poly Haven, Poly
Pizza, Quaternius, Kenney, KayKit or BlenderKit. Every CC0 car pack is
flat-colour low-poly without a stated interior; the sedans with interiors
are CC-BY, royalty-free or paid. Per the owner's rule the plan therefore
keeps the two Quaternius sedans already in the game (their GLBs have the
body and the three wheel groups as separate meshes, so wheels can spin
without re-modelling), gives them a small generated interior, real
materials and real lighting, and swaps in a better CC0 sedan through the
same contract if one appears later.

### Approaches compared

Scores 1 (poor) to 5 (good). Effort and cost are inverted so higher is better.

| Class | Approach | Visual gain | Animation flexibility | Effort | Cost | Maintenance | Performance | Licensing | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Vehicles | **Improve existing (Quaternius sedans, Kenney five-ton): materials, lights, wheels, contract nodes)** | 3 | 4 | 5 | 5 | 4 | 5 | 5 | **Recommended** |
| Vehicles | Generate (Blender Python or procedural bodies) | 2 | 3 | 2 | 5 | 2 | 4 | 5 | No |
| Vehicles | Download CC0 (RgsDev, Kenney Car Kit) | 3 | 3 | 4 | 5 | 4 | 4 | 5 | Same quality as what is in use; optional swap |
| Vehicles | Hybrid (hand-build a hero sedan) | 5 | 5 | 1 | 5 | 3 | 4 | 5 | Ruled out: needs an artist |
| Interiors | Improve existing | 1 | 1 | 5 | 5 | 5 | 5 | 5 | Nothing exists to improve |
| Interiors | **Generate (parametric seats, dash, wheel, door cards; about 600 triangles)** | 3 | 4 | 4 | 5 | 4 | 5 | 5 | **Recommended** for glass-only |
| Interiors | Download CC0 | 2 | 2 | 3 | 5 | 3 | 4 | 2 | None found |
| Interiors | Hybrid | 3 | 4 | 4 | 5 | 4 | 5 | 5 | Same as generate |
| People | **Improve existing (reconvert Rocketbox with normal and specular maps, 1024 px)** | 4 | 5 | 5 | 5 | 5 | 4 | 5 | **Recommended** |
| People | Generate (MakeHuman MPFB, CC0 output) | 3 | 4 | 2 | 5 | 2 | 4 | 5 | Only for new characters |
| People | Download CC0 (KayKit, Quaternius bases) | 2 | 4 | 4 | 5 | 4 | 5 | 5 | Stylised; clashes |
| People | Hybrid | 4 | 5 | 4 | 5 | 4 | 4 | 5 | Same as improve |
| Clips | Improve existing (extend the procedural figure) | 2 | 2 | 3 | 5 | 2 | 5 | 5 | Fallback and overlay only |
| Clips | Generate (procedural IK walk) | 2 | 3 | 1 | 5 | 1 | 5 | 5 | No |
| Clips | **Download: Rocketbox MIT set, Quaternius CC0 free tier** | 5 | 5 | 4 | 5 | 4 | 4 | 5 | **Recommended** |
| Clips | Hybrid (clips plus procedural look-at, carry and props) | 5 | 5 | 4 | 5 | 4 | 4 | 5 | **Recommended** |
| Environments | **Improve existing (Kenney city geometry, PBR retexture, lit windows)** | 4 | n/a | 4 | 5 | 4 | 4 | 5 | **Recommended** |
| Environments | Generate (procedural facades) | 3 | n/a | 3 | 5 | 2 | 4 | 5 | Variety only |
| Environments | **Download CC0 (Poly Haven HDRIs and textures)** | 5 | n/a | 5 | 5 | 5 | 4 | 5 | **Recommended** for lighting |
| Environments | Hybrid | 5 | n/a | 4 | 5 | 4 | 4 | 5 | Improve plus Poly Haven |

### Candidate assets (none downloaded)

| Asset | Source and licence | Format | Polygons | Rig / notes |
| --- | --- | --- | --- | --- |
| Rocketbox animations, 417 clips | [GitHub, MIT repo](https://github.com/microsoft/Microsoft-Rocketbox) | `.max.fbx`, 0.7–13.7 MB each | n/a | Same Biped skeleton as the crew; no retargeting. Convert with the existing `tools/rocketbox` page (FBXLoader → GLTFExporter). |
| Universal Animation Library 1 | [Quaternius, itch.io, CC0](https://quaternius.itch.io/universal-animation-library) | FBX and GLB | n/a | 45 free of 120+; "universal humanoid rig", Mixamo-compatible claim; 30 fps; root-motion and in-place exports; bone names not stated (unverified). Only the free tier is used; the paid tiers are out. |
| Universal Animation Library 2 | [Quaternius, itch.io, CC0](https://quaternius.itch.io/universal-animation-library-2) | GLB (FBX unverified) | n/a | 42 free of 130+, including carry walk, carry idle, throw, cough, wave. Only the free tier is used; the paid tiers are out. |
| KayKit Character Animations | [itch.io, CC0](https://kaylousberg.itch.io/kaykit-character-animations) | glTF and FBX | n/a | KayKit rigs only; stylised; backup only. |
| Quaternius sedans (in use) | [itch.io, CC0](https://quaternius.itch.io/lowpoly-cars) via Poly Pizza | GLB in `public/models/vehicles` | 2,954 / 3,124 | Body plus three wheel meshes; flat materials. Kept. |
| Free Low Poly Vehicles Pack | [RgsDev, itch.io, CC0](https://rgsdev.itch.io/free-low-poly-vehicles-pack) | Not stated (unverified) | "low poly" | Sedan, van, truck, truck with trailer; separated wheels; per-material colours; no interior stated. Optional swap if its sedan reads better than Quaternius's. |
| Kenney Car Kit 3.1 | [kenney.nl, CC0](https://kenney.nl/assets/car-kit) | GLB, FBX, OBJ (per Kenney's import guide) | not stated | 45 files; list not on the page (unverified). Same style as `delivery.glb`. |
| Poly Haven tyres and rims | [Old Tyre](https://polyhaven.com/a/old_tyre), [Rusted Wheel Rim 02](https://polyhaven.com/a/rusted_wheel_rim_02), CC0 | glTF with PBR | scan-level; needs decimation | Optional wheel upgrade for the player's own car only. |
| Poly Haven night HDRIs | [Lakeside Night](https://polyhaven.com/a/lakeside_night), [Rogland Clear Night](https://polyhaven.com/a/rogland_clear_night), [Qwantani Night (Pure Sky)](https://polyhaven.com/a/qwantani_night_puresky), [Cobblestone Street Night](https://polyhaven.com/a/cobblestone_street_night), CC0 | EXR/HDR, 1k–24k | n/a | Reflection and ambient source for lot, road, house and dream. Cobblestone Street Night is closest to a lamp-lit lot. |
| Poly Haven snow and asphalt | [Asphalt Snow](https://polyhaven.com/a/asphalt_snow), [Snow Floor](https://polyhaven.com/a/snow_floor), [Asphalt 02](https://polyhaven.com/a/asphalt_02), CC0 | PBR sets | n/a | Road and lot surfaces through the `docs/textures.md` pipeline. |
| Sketchfab sedans with interiors | [3DHA](https://sketchfab.com/3d-models/sedan-glb-format-with-interior-fe0d953112044d6893d04dbbec75ac82), [scailman](https://sketchfab.com/3d-models/low-poly-sedan-car-aeb2699532b4402e8b75ec8888b800b9): CC-BY | GLB | not stated | Excluded by the licence rule; listed so the trade-off is visible. |
| BlenderKit free cars | [free car gallery](https://www.blenderkit.com/asset-gallery?query=category_subtree%3Acar+is_free%3Atrue) | Blend | 737k for one sedan | "Royalty Free", not CC0 ([licence page](https://www.blenderkit.com/docs/licenses/)); excluded. |
| Mixamo; CMU mocap | Adobe terms; CMU notice forbids resale and the FBX conversion is CC BY-NC | FBX/BVH | n/a | Excluded. |

## 2. Animation architecture

### From joint copying to clip playback

Today `characterModels.ts:driveModel` overwrites eleven bones every frame
from the procedural pivots. The target is three layers on the Rocketbox
skeleton:

| Layer | Source | Joints | Blending |
| --- | --- | --- | --- |
| 1. Locomotion and state | Rocketbox clips through `AnimationMixer`: idle variants, walk start/loop/stop, run, turn 60–180, sit down/up, seated idles, cough, cheer, clap, wave, phone, talk/listen, crouch in/out, dancing | Whole skeleton | Cross-fade 0.15–0.3 s; walk `timeScale` from ground speed; turn clip chosen by heading delta |
| 2. Overrides | Quaternius carry/throw clips (retargeted once offline) or the existing procedural arm solver for carry and lift | Arms, clavicles | Additive over layer 1 with a per-bone weight mask |
| 3. Procedural | Existing `lookToward` (head), hand IK onto prop sockets and the steering wheel, foot plant on stairs | Head, neck, hands, feet | Written after the mixer update |

`driveModel` stops copying the figure wholesale. The procedural figure
stays as the collision body, the software-fallback animation and the prop
anchor. The state machine lives where state already is (`crew.ts` `Actor`,
`story.ts` `StageActor`, `main3d.ts` `syncWorkers`), which switch from "set
pivots" to "request state".

### Three.js facilities, used only where the audit showed a gap

| Facility | Use | Why |
| --- | --- | --- |
| `AnimationMixer`, `AnimationAction` | Layers 1 and 2, cross-fades, `setEffectiveWeight`, `timeScale` | Snapping poses and the single-sine walk (audit causes 2–4) |
| `SkeletonUtils.retargetClip` (r180: `names`, `hip`, `useFirstFramePosition`, `fps` options) | One offline conversion of the Quaternius carry/throw clips to Biped names in the converter page, checked by eye, committed as GLB; never at runtime | Only non-Rocketbox clips need it; forum reports of twisting make a one-off, inspected conversion the safe use |
| `CCDIKSolver` | Two-bone chains: hands to the steering wheel and box sockets, feet to stair treads | Hands on a wheel that is not there, fingers around a box (audit) |
| `KHR_materials_variants` | Paint colours on one sedan GLB | Replaces the colour override in `upgradeCar` |

### Vehicle contract (one GLB per vehicle, no per-car code)

Named nodes read by a new `src/three/vehicleRig.ts`. For the current
Quaternius GLBs the loader creates them at load time from the existing
meshes (body, wheel meshes split by bounding box into four pivots) and from
the generated interior; a file that already contains them is used as is.

| Node | Purpose | Consumer |
| --- | --- | --- |
| `body` | Paint, clearcoat, variants | `propModels.ts`, `driving.ts` |
| `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` | Spin from distance; front pair yaw with steer | `driving.ts`, story cars |
| `steering_wheel` | Rotates with steer; IK target for hands | `vehicleRig.ts` |
| `seat_driver`, `seat_passenger_f`, `seat_rear_l`, `seat_rear_r` | Hip position and facing | replaces `SEAT_Y` and the offsets at `story.ts:1684–1729` |
| `hand_l_wheel`, `hand_r_wheel`, `foot_l_driver`, `foot_r_driver`, `hand_l_rest`, `hand_r_rest` | IK targets | `vehicleRig.ts` |
| `door_fl`, `door_fr`, `door_rl`, `door_rr` | Hinge pivots for the openers' exits (optional; absent on the Quaternius files, so exits stay as now) | `story.ts` |
| `headlight_l`, `headlight_r`, `taillight_l`, `taillight_r` | Emissive and the existing blink hook | `propModels.ts` |
| `glass_*` | Glass material class | `propModels.ts` |
| `suspension` | Root under `body` for pitch and roll | `driving.ts` |

### Character contract

| Item | Rule |
| --- | --- |
| Skeleton | Rocketbox Biped names as converted today; any new character is retargeted to them offline |
| Rest pose | T-pose, feet on y 0, 1.78 m before the character's own `scale` |
| Prop sockets | `socket_hand_l`, `socket_hand_r`, `socket_back`, `socket_hat` as empties added by `tools/rocketbox` from the hand and head bones |
| Clips | `idle_*`, `walk_*`, `run_*`, `turn_l_90` …, `sit_down_chair`, `sit_idle_*`, `stand_up_chair`, `carry_walk`, `carry_idle`, `lift`, `throw`, `steer_idle`, in one shared `public/models/characters/clips.glb` |
| Fallback | Software renderers keep the procedural figure and pivots; the same state machine drives both |

### Files that change and interfaces that stay

| File | Change |
| --- | --- |
| `src/three/characterModels.ts` | `driveModel` becomes layer 3 only; mixer ownership, clip loading, bone masks, IK |
| `src/three/characterAnimation.ts` (new) | `requestState(actor, { locomotion, speed, headingDelta, carry, pose, seat })` → actions and weights |
| `src/three/vehicleRig.ts` (new) | Contract loader with synthesis for the current GLBs; `seat`, `steer`, `advance`, `suspension`, `door` |
| `src/three/vehicleInterior.ts` (new) | Generated seats, dash, wheel, door cards sized from the body bounds |
| `src/three/propModels.ts` | `upgradeCar` uses `vehicleRig`; no wheel merge; variants |
| `src/three/driving.ts` | `rig.advance/steer/suspension` from `DrivingModel`; traffic in `BatchedMesh` |
| `src/three/story.ts` | `seat()` resolves `rig.seat(...)`; otherwise unchanged |
| `src/three/crew.ts`, `src/three/main3d.ts` | Pose and walk calls become `requestState`; `Pose` names map to clips |
| `tools/rocketbox/` | Clip import and resample, Quaternius retarget, `clips.glb` export, sockets, keep normal and specular maps |

Stable: `Actor.pose`, `setPoseAt`, `carrying`, `faceAngle`;
`StageActor.at`, `seatedIn`, `setPose`; `DrivingView.begin/update/vehicle`
and `DrivingModel.pose`; the `Character` pivots and `walkPhase` for the
fallback; `CHARACTER_MODELS`, `useCharacterModels`, the `belt3d:ready` hook
and the capture tool.

## 3. Vehicle strategy

| Topic | Plan |
| --- | --- |
| Exterior | Keep the Quaternius sedans; smooth their normals where the facets are not intentional (a one-time pass in the converter page), scale uniformly to length instead of to a 4.2 × 1.5 × 1.8 box, add a bumper and sill edge strip in dark plastic. Files stay under 300 KB. |
| Paint | `MeshPhysicalMaterial`, `clearcoat 1`, `clearcoatRoughness 0.08`, base `roughness 0.45`, `metalness 0.1`, colour by variant. |
| Reflections | Poly Haven night HDRI (Cobblestone Street Night for the lot, Qwantani Night Pure Sky for the road) through `PMREMGenerator` as `scene.environment` on the lot, road, house, dream and driving scenes at intensity 0.25–0.4; the depot keeps `RoomEnvironment`. |
| Glass | `MeshPhysicalMaterial`, `transparent`, `opacity 0.35`, `roughness 0.05`, `metalness 0`, `envMapIntensity 1.2`, double-sided, faint tint gradient. **No `transmission`** (extra scene pass per frame, multiplied by 28 traffic cars). The generated interior is scene-lit so it shows through. |
| Interior (glass-only) | `vehicleInterior.ts`: two front seats, a rear bench, dash slab with a dark glossy top, steering wheel torus, door cards, head rests; about 600 triangles; dark fabric and plastic materials; one point of dash glow at night. |
| Wheels and steering | Wheels unmerged and spun by `distance / radius`; front wheels yaw with `DrivingModel.steer`; `steering_wheel` turns `steer × 2.5`. Traffic spins from path speed. |
| Suspension | `suspension` node: pitch `−accel × 0.015 rad`, roll `steer × speed × 0.01 rad`, critically damped; jolts from the existing collision hook. |
| Occupants | Seats from the contract; driver plays `steer_idle` (a Rocketbox seated idle with hands moved by CCD onto `hand_*_wheel`); passengers play seated idle variants. |
| LOD for 28 city cars | `BatchedMesh` with two geometry ids per car (full, and a 600-triangle shell) switched by `setGeometryIdAt` from camera distance; `perObjectFrustumCulled` on; variant colours as vertex colours. Target under 25k triangles for traffic in view. |
| Five-ton | Keep Kenney's `delivery.glb`; its wheel nodes are already separate, so the loader synthesises the contract; add the generated dash and a seated driver. |

## 4. Visual presentation

Only changes the audit tied to a rating:

| Area | Change | Audit reason |
| --- | --- | --- |
| Lighting | Environment maps for lot, road, house and dream; lot gets lamp-post point lights and one directional "moon" at 0.6 with soft shadows; blue hemisphere | Lot flat and dark; no reflections |
| Shadows | Shadow-casting directional on the road scene (2048 map, 60 m frustum following the truck) | City had none |
| SSAO | Keep GTAO; enable it for the lot and road | Depot AO was the strongest scene |
| Materials | Reconvert the crew with normal and specular maps at 1024 px (cap 1.5 → 2.5 MB); snow and asphalt PBR on lot and road | Waxy skin, flat city |
| Camera | Chase camera from (15 back, 9.5 up) to (9 back, 4.5 up), look 10 m ahead at 1.2 m, with the depot camera's speed lead | Truck a small block in the bottom third |
| Timing | Cross-fades 0.15–0.3 s; carry overlay 0.2 s; turn clips above 45°; walk `timeScale` = speed / clip speed | Snapping poses, sliding feet |

**Visual quality target for the snowy night:** a parked car in the lot reads
as painted metal under sodium light, its windows show the driver and seats,
and the crew look lit by the same lamps as the car; the road shows the
truck's shadow and wet-asphalt reflections of its headlights; every scene
holds 60 fps at 1080p on the reference laptop, proven by the capture tool.

## 5. Vertical slice

One sedan (the red Quaternius sedan with the generated interior), one crew
member (Skanky: walks to the gate, turns, sits in, drives the commute) in
the existing opener-1 arrival and the home-to-UPS commute drive.

| Acceptance criterion | Measure | Baseline shot it replaces |
| --- | --- | --- |
| Walking from a Rocketbox clip with no foot slide | Contact foot moves under 2 cm per stride on flat ground, measured by the capture tool from bone positions over 60 frames | `crew-walking` |
| Turning uses a turn clip | Heading change over 45° plays `turn_*`; no in-place pivot of a standing figure | new `crew-turning` |
| Seated through the glass | Hands on the wheel within 2 cm (IK), feet on the pedal targets, no body part outside the shell (oriented-box test from `story-clearance-browser.mjs`) | `sedan-window-passengers`, `sedan-interior-over-shoulder` |
| Exterior reads as paint | Clearcoat highlight and environment reflection visible; file under 300 KB | `sedan-exterior-front-left`, `sedan-exterior-rear` |
| Wheels and steering move | Rotation equals distance / radius ± 2 %; front yaw follows `steer` | `truck-drive-side`, `city-game-camera` (car variant) |
| Camera transitions | Lot shot → seat → chase cross-fade under 0.6 s with no clipping (near-plane test extended to the lot) | `lot-game-camera`, `truck-drive-chase` |
| Performance | 60 fps median, 50 fps p95 at 1280×800 on the reference laptop with the composer; `renderer.info` triangles under 600k | all |
| Fallback | Same scenes on SwiftShader show the procedural figures and cars with no errors | CI |

The capture tool gains `crew-turning` and a `car-drive-*` set; the
comparison is old and new JPEGs side by side in the PR.

## 6. Roadmap

Working days for one developer. Each phase is one or more PRs stacked on
the current chain; every new path keeps the existing one as its fallback so
the game stays playable at every merge.

**Progress (2026-10-21).** Phase 0 (#36, #37, #38) and phase 1 (#39) are
merged. Phase 2 is done: the contract loader and synthesis
(`vehicleRig.ts`, `vehicleInterior.ts`), seats, the steering wheel, hand and
foot IK on the figure's pivots (`seating.ts`), the suspension, and Skanky
and Termite riding the commute. Seated occupants keep the figure's `sit`
pose under the solver rather than a `steer_idle` clip, since the figure's
pivots already drive the imported models and the software fallback alike;
seated clips remain with the deferred turn and sit-down clips. The five-ton
carries no occupant because the Kenney cab's windows are opaque in its
single palette material. Phase 3 is done: the traffic draws as three batched
meshes with a distance shell (`trafficBatch.ts`), every facade has lit windows
from one instanced draw (`cityWindows.ts`) and the road is wet asphalt. The
road already drew 60 fps on the reference GPU before batching, at about 330
draw calls and 450k triangles a frame; batching the traffic is for lower-end
machines and the draw-call budget the browser check now holds.

| Phase | Objective | Files | Actions | Depends on | Effort | Risks | Tests affected and replacement | Done when |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **0 Quick wins** (PRs 0a lighting, 0b vehicles, 0c crew) | Visible gains, no architecture | `main3d.ts`, `story.ts`, `driving.ts`, `propModels.ts`, `world.ts`, `public/textures`, `tools/rocketbox` | Environment maps per scene; lot and road lights and shadows; chase camera reframe; unmerge and spin sedan wheels; clearcoat paint; generated interior; snow and asphalt PBR; crew reconvert with normal maps | HDRI and texture downloads (owner) | 6 days | Bloom and envMap over-brighten the sodium lamps; `character-cast.mjs` size cap | `driving-model.mjs` camera numbers re-baselined; `prop-model-browser.mjs` keeps the headlight-material and vertex checks, box test loosened to length; `character-cast.mjs` cap 2.5 MB; `three-textures.mjs` budget updated | Shots retaken; lighting, camera and vehicle ratings up by 2 |
| **1 Clip pipeline** (1a converter, 1b runtime) | Rocketbox clips on the crew | `tools/rocketbox/`, `characterModels.ts`, `characterAnimation.ts`, `crew.ts`, `main3d.ts`, `story.ts` | Convert about 30 clips to `clips.glb`; mixer per character; state machine; cross-fades; walk speed warp; turn clips; head look and procedural carry arms kept as overlays | Phase 0c | 9 days | Rest-pose mismatch between the converted avatars and the clips; mixer and `driveModel` fighting over bones; CI without models | `arm-motion-model.mjs` and `character-animation-model.mjs` keep the fallback; new `tests/character-clips-model.mjs` (inventory, names, durations, bone coverage) and a browser check that bones move from clips; `character-model-browser.mjs` pose sampling by state name; `three-browser.mjs` Shan press sampled from the bone | Walk, idle, sit, turn, cheer, cough, wave from clips on GPU; CI green |
| **2 Vehicle contract and seating** (2a loader, 2b seats and IK) | Occupants that hold up through the glass | `vehicleRig.ts`, `vehicleInterior.ts`, `propModels.ts`, `story.ts`, `driving.ts` | Contract loader with synthesis; seats, steering wheel, hand and foot IK; suspension; driver and passengers on clips | Phase 1 | 5 days | IK hand twist; seat heights on two sedan shapes | `story-clearance-browser.mjs` roof bound becomes an inside-the-shell test; `prop-model-browser.mjs` checks contract nodes; `driving-assets.mjs` unchanged | Vertical slice criteria met |
| **3 City and traffic** (3a BatchedMesh LOD, 3b facades and road) | Road at the quality target at 60 fps | `driving.ts`, `drivingModels.ts`, `drivingCity.ts` | Two-level LOD for 28 cars; retextured Kenney facades with emissive windows; wet asphalt; shadow directional | Phase 0a | 5 days | BatchedMesh with multi-material parts; texture memory | `driving-browser.mjs` `modelReady` kept; new batched-instance count test; `three-resources.mjs` counts updated | City shots retaken; fps criterion met |
| **4 Carry, lift, throw** (4a retargeted clips, 4b feet on stairs) | Last procedural locomotion gone | `tools/rocketbox/`, `characterAnimation.ts`, `characterModels.ts` | Retarget the free Quaternius clips once; lift and put down from Rocketbox crouch clips; carry overlay from clips; CCD feet on stairs | Phases 1–2 | 4 days | `retargetClip` quality; if a free clip reads badly that motion stays procedural | `gameplay-adjustments-browser.mjs` torso clearance resampled; `crew-work-browser.mjs` pixel readback re-baselined once | Grab, carry and throw shots retaken |

Quick wins: phase 0 and PR 2a. Architectural: phases 1, 2b, 3 and 4. Total
about 29 developer days, roughly five to six calendar weeks including
review and re-baselining, with phase 4 droppable if time runs short.

## 7. Readiness

| Can be implemented without the owner | Needs the owner to provide | Needs the owner's approval |
| --- | --- | --- |
| Everything in code: lighting and environment, camera, wheels and suspension, the generated interior, the clip converter and runtime, the state machine, the contract loader, IK, BatchedMesh LOD, tests, capture-tool extensions | The CC0/MIT downloads placed where the converters expect them (Rocketbox clips, Quaternius free tier, Poly Haven HDRIs and textures), since this plan downloads nothing | Raising the crew file cap to 2.5 MB; the chase-camera reframe; re-baselining the tests named above; each PR merge. Nothing in this plan costs money. |

## Recommended strategy, first milestone, open decisions

**Strategy.** Hybrid with no new modelling: the crew's own MIT skeleton has
417 ready clips, so locomotion and poses move to clip playback without
retargeting, with the procedural figure kept as the fallback and as the
head, hand and foot overlay; the existing CC0 sedans and five-ton stay and
gain real materials, lighting, moving wheels, a generated interior and
seated occupants through a vehicle contract that any better CC0 model can
slot into later. Lighting gains come first and cheaply from Poly Haven CC0
environment maps.

**First milestone (end of week 1).** Phase 0 merged: environment maps, lot
and road lighting, chase camera, spinning wheels, clearcoat paint, the
generated interior, crew reconverted with normal maps; baseline shots
retaken and the audit ratings for lighting, camera and vehicles updated.
Phase 1a (the clip converter and `clips.glb`) opened for review.

**Decisions still open.**

1. Approval for the crew file cap (1.5 → 2.5 MB) and the chase-camera reframe.
2. Which night HDRI sets the lot's look (Cobblestone Street Night versus a
   pure sky with the lot's own lamps), from a side-by-side in PR 0a.
3. Whether to swap the Quaternius sedans for the RgsDev CC0 sedan if it
   reads better once both are under the new materials.
