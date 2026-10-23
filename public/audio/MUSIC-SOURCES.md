# 3D music sources

`music/after-hours.mp3` is **After Hours — Depot Lo-Fi**, generated on
2026-10-18 in the project owner's signed-in Google Flow Music account using
Lyria 3.5. The user selected chill lo-fi. The instrumental was downloaded from
[the generated track](https://www.flowmusic.app/song/037920d5-574e-4689-96ba-df4b5e9c5c86)
as MP3: 67.4 seconds, stereo, 74 BPM, 1,729,608 bytes.

The prompt requested original warm electric piano with jazz seventh/ninth
chords, soft piano answers, rounded bass, brushed boom-bap drums, swung hats,
muted guitar and light tape warmth, without vocals or an artist reference.
No user recording or repository file was uploaded.

The file is the original downloaded MP3. The game crossfades its loop, reduces
its level under dialogue and shares the game's mute control. The generated
recording is governed by the account's Google Flow Music terms; it is not one
of the CC0 visual assets. Google documents commercial music rights among its
[Flow Music membership benefits](https://support.google.com/googleone/answer/16286513).

Recorded package/mechanical foley and original local Web Audio effects are
documented in [FOLEY-SOURCES.md](FOLEY-SOURCES.md). They require no external audio
service at runtime. Legacy depots retain their previous audio behavior.

## Scene music (Kevin MacLeod, CC BY 4.0)

Each place and mini-game in the 3D night has its own track (`SCENE_MUSIC` in
`src/three/audio.ts`); the game crossfades between them as the night moves on,
and loads each the first time its scene comes up. The shift itself keeps
After Hours. The owner approved downloading these on 2026-10-23.

All ten are by **Kevin MacLeod (incompetech.com)**, licensed under Creative
Commons: By Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/).
They are credited in the game's end credits. Each file is the original MP3
from `https://incompetech.com/music/royalty-free/mp3-royaltyfree/<title>.mp3`,
downloaded 2026-10-23 and renamed; the bytes are unchanged.

| Scene | File | Title | Bytes | SHA-256 |
|---|---|---|---|---|
| The shift's last minute | `music/machinations.mp3` | Machinations | 4286715 | a9dfc78dccf68107c258a55dfee9efd82b48833745c06bead27d2b937783807e |
| Home (the house) | `music/rollin-at-5.mp3` | Rollin at 5 | 4186817 | f64025e2a3ed44e8d584e98385fe906759bcc32d7ffe7f133e0e339773647bc8 |
| Drives | `music/miami-nights.mp3` | Miami Nights - Extended Theme | 6440513 | 470ce5f9c059ae94a3637adeccc0246400c69c0307528a69f65d4ea2a70310d2 |
| Tim Hortons and the Timmies run | `music/lobby-time.mp3` | Lobby Time | 6184700 | bc47dc1f1a0b1fe4ff631cee89ca3987b8f7b52f533d06233665d51300331beb |
| The UPS lot | `music/sneaky-snitch.mp3` | Sneaky Snitch | 5466943 | db1710333d68a215277f77e4e17e1a64bf4ed38f87c70f8d0f56b16b6aa4f884 |
| Southgate Mall | `music/local-forecast-elevator.mp3` | Local Forecast - Elevator | 7570404 | 8c46b44e65324bc339fbbc3e770611d671f6c74a40f3ec8dd50332c082b25cc9 |
| The Ralph run | `music/surf-shimmy.mp3` | Surf Shimmy | 3934390 | 932424252801c51a6385c1339ebb57571cee76eda6431eaa338dcacb677c4d94 |
| Vic's Mesa offer | `music/metalmania.mp3` | Metalmania | 6096909 | fe6298b6f9fed30870d21edd97d9be4f35de271789e648eee14a3e8472b6ee4a |
| Cha for Tea and the credits | `music/guzheng-city.mp3` | Guzheng City | 3654552 | 7d117a43cad22ff05b32340f2bd331368c48342f503eab85b1e5c403043d4be6 |
| The dream | `music/dreamy-flashback.mp3` | Dreamy Flashback | 5170799 | e63abdb9bcadadb48945760a06ccd56f7fe17207a940729cb9bc806bac636473 |
