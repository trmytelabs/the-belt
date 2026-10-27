# Security

Report a suspected vulnerability privately to the repository owner through an
existing private contact channel. Include a minimal reproduction, affected
revision and expected impact. Do not open a public issue or include credentials,
private screenshots or local recovery data in a report.

This project is a browser game development snapshot with no server component.
Online play (PLAY ONLINE) uses PeerJS's free public server to introduce two
players' browsers, then a direct WebRTC link between them carries the host's
picture and sound, voice chat and the joining player's controls. Each player can
see the other's internet address. The host accepts only a fixed list of the
game's keys, controller buttons and a clamped stick from the joining page
(`src/three/onlineRules.ts`): player 2's moves on the belt, and pausing.
Keep dependencies reviewed and test changes before using a build outside local
development. CI does not deploy or publish this repository. The Pages workflow publishes the built game
from main to https://trmytelabs.github.io/the-belt/. The repository itself has been public since 2026-10-26, at the owner's choice.
The deploy workflow ships the same build to the owner's server at https://thebelt.fun as a
read-only container behind Cloudflare (`Dockerfile`, `deploy/`); the SSH key it uses can run only that one
deploy command, and the image never passes through a registry.
