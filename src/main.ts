// The 3D depot is the default. ?mode=2d keeps the 2D Night Shift depot and
// ?mode=classic the original full shift; both run on Phaser. Each mode loads
// only its own engine, and all of them share the same shift rules.
const mode = new URLSearchParams(window.location.search).get('mode');

if (mode === '2d' || mode === 'classic') {
  void import('./phaserMain');
} else {
  void import('./three/main3d').then(({ startBelt3d }) => startBelt3d());
}
