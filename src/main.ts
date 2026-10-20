// The 3D depot is the default game. ?mode=classic keeps the original full
// shift, which runs on Phaser. Each mode loads only its own engine.
const mode = new URLSearchParams(window.location.search).get('mode');

if (mode === 'classic') {
  void import('./phaserMain');
} else {
  void import('./three/main3d').then(({ startBelt3d }) => startBelt3d());
}
