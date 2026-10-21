# Quaternius Universal Animation Library

`crew-clips-ual.glb` holds five clips from the **Universal Animation Library
(Standard)** by Quaternius, retargeted onto the crew's Rocketbox skeleton by
`tools/rocketbox/ual.js`:

| Role | Source clip |
| --- | --- |
| `pickupTable` | `PickUp_Table` |
| `interact` | `Interact` |
| `walkFormal` | `Walk_Formal_Loop` |
| `talking` | `Idle_Talking_Loop` |
| `push` | `Push_Loop` |

Source: <https://quaternius.itch.io/universal-animation-library>, the free
Standard download, version 3.0 (`UAL1_Standard.glb` and its root-motion copy
`UAL1_Standard_RM.glb`, used only to measure walking speed), downloaded on
2026-10-21.

Licence, as shipped with the pack:

> CC0 1.0 Universal (CC0 1.0) Public Domain Dedication
> <https://creativecommons.org/publicdomain/zero/1.0/>
>
> Models by @Quaternius

The pack itself is not in this repository; to convert again, download it,
then set `UAL_GLB` and `UAL_RM_GLB` to its two GLBs before running the
converter (see `docs/character-models.md`).
