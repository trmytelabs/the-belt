// The 3D depot is the default game. ?mode=classic keeps the original full
// shift, which runs on Phaser. Each mode loads only its own engine. ?join=CODE is the page for
// joining an online game as Skanky: it shows the host's game and loads no engine at all.
const params = new URLSearchParams(window.location.search);
const mode = params.get('mode');
const join = params.get('join');

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
} else if (join !== null) {
  void import('./three/onlineGuest').then(({ startGuest }) => startGuest(join)).finally(bootDone);
} else {
  void import('./three/main3d').then(({ startBelt3d }) => startBelt3d());
}
