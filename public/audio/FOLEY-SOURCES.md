# 3D sound effects

The selected original OGG recordings in `foley/` are by **Kenney** and licensed
under **Creative Commons Zero (CC0)**. Downloaded from the creator's pages on
2026-10-18; their original license files are retained beside the recordings.

| Pack | Included original filenames |
| --- | --- |
| [RPG Audio](https://kenney.nl/assets/rpg-audio) | `cloth1`, `cloth2`, `cloth3`, `handleSmallLeather`, `handleSmallLeather2`, `bookPlace1`, `bookPlace2`, `metalClick`, `metalLatch`, `doorClose_1`, `handleCoins`, `knifeSlice` |
| [Impact Sounds](https://kenney.nl/assets/impact-sounds) | `impactSoft_medium_000`, `impactSoft_medium_001`, `impactSoft_medium_002`, `impactWood_light_000`, `impactWood_light_001`, `impactMetal_light_000`, `impactGlass_light_000` |
| [Interface Sounds](https://kenney.nl/assets/interface-sounds) | `click_001`, `click_002`, `confirmation_001`, `error_001`, `scratch_001` |

The source files are unchanged. At runtime the 3D mixer normalizes their levels,
filters harsh high frequencies, varies pickup/impact recordings and playback
rate in a deterministic sequence, and limits overlapping voices. All recordings
are served locally. Failed loads retain quiet synthesized fallback cues and do
not replay old events when loading finishes.

Package rustles and thuds, latches, gate movement, the signature pad, interface
clicks and road bumps now use recordings. The diesel bed uses locally authored
combustion pulses and filtered noise, with pitch tied to road speed. Brake air,
lunch whistle and remaining story cues are local Web Audio effects. Music is
unchanged; its provenance remains in [MUSIC-SOURCES.md](MUSIC-SOURCES.md).

No changes apply to legacy 2D/classic audio.
