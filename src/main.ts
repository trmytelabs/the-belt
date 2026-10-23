// The 3D depot is the default game. ?mode=classic keeps the original full
// shift, which runs on Phaser. Each mode loads only its own engine.
const mode = new URLSearchParams(window.location.search).get('mode');

/** Fades out and removes index.html's loading screen. */
function bootDone(): void {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('gone');
  window.setTimeout(() => boot.remove(), 600);
}
// The 3D depot announces itself once built (or that it cannot run); the classic game starts at once.
window.addEventListener('belt3d:ready', bootDone, { once: true });
window.addEventListener('belt3d:fallback', bootDone, { once: true });

if (mode === 'classic') {
  void import('./phaserMain').finally(bootDone);
} else {
  void import('./three/main3d').then(({ startBelt3d }) => startBelt3d());
}
