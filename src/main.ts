// The 3D preview is a separate renderer for the same deterministic shift
// rules. Each mode loads only its own engine.
const mode = new URLSearchParams(window.location.search).get('mode');

if (mode === '3d') {
  void import('./three/main3d').then(({ startBelt3d }) => startBelt3d());
} else {
  void import('./phaserMain');
}
