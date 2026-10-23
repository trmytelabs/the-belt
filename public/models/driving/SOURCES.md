# 3D driving model sources

Retrieved 2026-10-18 from Kenney's official downloads. These selected GLBs and
their local palette PNGs are unchanged. The game scales and orients them at
runtime; road markings, route signs, working light bulbs and truck labels are
authored in code. Each kit's original licence is included beside its models.

| Kit | Official source | Selected models |
| --- | --- | --- |
| City Kit Commercial 2.1 | [Kenney](https://kenney.nl/assets/city-kit-commercial) | `city/building-a.glb`, `building-d.glb`, `building-e.glb`, `building-g.glb`, `building-skyscraper-a.glb` |
| City Kit Roads 2.2 | [Kenney](https://kenney.nl/assets/city-kit-roads) | `roads/light-curved.glb`, `traffic-light.glb` |
| Car Kit 3.1 | [Kenney](https://kenney.nl/assets/car-kit) | `cars/delivery.glb` (closed box truck) |

Since 2026-10-22 the drives' five-ton is built like the depot's trucks (`createTruck` in
`src/three/world.ts`, textured, sized for the road with its door down), as the story scenes' is: the owner
found the low-poly delivery truck looked worse than the trucks at the dock. `cars/delivery.glb` stays
recorded here but is no longer drawn.

Licence: **Creative Commons Zero (CC0 1.0 Universal)**, as stated in the official
packs. [Licence text](https://creativecommons.org/publicdomain/zero/1.0/).
Creator: [Kenney](https://kenney.nl/). Each directory also needs its own original
`Textures/colormap.png`. `manifest.json` records SHA-256 hashes and sizes.

These assets are used only by the 3D driving scene. The existing depot and mall
truck remains in place, and the existing Quaternius sedan models are reused for
the expanded traffic. Procedural buildings, lamps and truck remain as loading
and failure fallbacks. The road owns and reuses its art across both journeys and
restarts; disposing it cancels late model attachment.
