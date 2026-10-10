import Phaser from 'phaser';

/** The original depot cast, redrawn as editable vector miniatures. */
type Profile = { shirt: number; hair: number; skin: number; width?: number };
const profiles: Record<string, Profile> = {
  hussan: { shirt: 0x5a91a8, hair: 0x312f2b, skin: 0xb98962 },
  aj: { shirt: 0xc49a75, hair: 0x72523b, skin: 0xc49a75 },
  ben: { shirt: 0x5d6170, hair: 0x554638, skin: 0xc19878 },
  paula: { shirt: 0xb85a94, hair: 0x543344, skin: 0xb78363 },
  bannerman: { shirt: 0x8b6f34, hair: 0x71563d, skin: 0xc6a079 },
  fruitloop: { shirt: 0x88aa56, hair: 0x79613b, skin: 0xc6a079 },
  doris: { shirt: 0x85638f, hair: 0xd2b86c, skin: 0xcfa585 },
  brian: { shirt: 0x82705b, hair: 0x6b4a32, skin: 0xbc926e },
  donna: { shirt: 0x608c7b, hair: 0xaf774f, skin: 0xcba380 },
  vic: { shirt: 0x727f83, hair: 0xb4b4a1, skin: 0xc29c7a },
  shan: { shirt: 0xd5d8bb, hair: 0x84928a, skin: 0xc98277 },
  john: { shirt: 0x2f4f64, hair: 0x3a2a19, skin: 0xbf9672 },
  kylie: { shirt: 0xbc598a, hair: 0x83569a, skin: 0xd0a684 },
  ralph: { shirt: 0x8b6f47, hair: 0x8a7051, skin: 0xd1a07d, width: 24 },
  gunman: { shirt: 0x30383f, hair: 0x2c2b2b, skin: 0xb88462, width: 27 },
};

const aliases: Record<string, string> = {
  froodoo: 'fruitloop', 'fruit loop': 'fruitloop', dorothy: 'doris',
  'paula abdul': 'paula', 'john rushton': 'john', johnrushton: 'john',
};

function stroke(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, color: number, width = 1, alpha = 1) {
  g.lineStyle(width, color, alpha).lineBetween(x1, y1, x2, y2);
}

function miniDemon(g: Phaser.GameObjects.Graphics, x: number, y: number) {
  g.fillStyle(0x653251).fillTriangle(x - 5, y, x - 15, y - 4, x - 9, y + 9)
    .fillTriangle(x + 5, y, x + 15, y - 4, x + 9, y + 9);
  g.fillStyle(0xa166a3).fillRoundedRect(x - 7, y - 5, 14, 17, 5);
  g.fillStyle(0xa166a3).fillTriangle(x - 6, y - 4, x - 6, y - 11, x - 1, y - 4)
    .fillTriangle(x + 1, y - 4, x + 6, y - 11, x + 6, y - 4);
  g.fillStyle(0xe69c90).fillCircle(x - 3, y + 1, 1.5).fillCircle(x + 3, y + 1, 1.5);
  stroke(g, x - 2, y + 6, x + 2, y + 7, 0x382637, 1);
}

const accents = new WeakMap<Phaser.GameObjects.Container, { id: string; graphics: Phaser.GameObjects.Graphics }>();
type ColleaguePose = 'idle' | 'shout' | 'crouch' | 'massage';
const articulatedParts = new WeakMap<Phaser.GameObjects.Container, {
  body: Phaser.GameObjects.Graphics;
  arms: Phaser.GameObjects.Container[];
  legs: Phaser.GameObjects.Container[];
}>();

/** Root positions this container; props and decorative motion never move its feet. */
export function createColleagueArt(scene: Phaser.Scene, name: string): Phaser.GameObjects.Container {
  const normalized = name.toLowerCase();
  const id = aliases[normalized] ?? normalized;
  const p = profiles[id] ?? profiles.vic;
  const articulated = id === 'john' || id === 'aj';
  const root = scene.add.container(0, 0);
  const w = p.width ?? 23;
  const g = scene.add.graphics();
  root.add(g);
  if (id === 'demon') {
    g.fillStyle(0x101622, 0.5).fillEllipse(0, 28, 47, 12);
    for (const direction of [-1, 1]) {
      const points = [
        { x: 12 * direction, y: -13 }, { x: 43 * direction, y: -32 },
        { x: 38 * direction, y: 1 }, { x: 28 * direction, y: -2 },
        { x: 19 * direction, y: 10 },
      ];
      g.fillStyle(0x542e51).fillPoints(points, true);
      stroke(g, 14 * direction, -11, 39 * direction, -28, 0x9c627d, 2);
      stroke(g, 14 * direction, -11, 36 * direction, -1, 0x86506f, 1);
      stroke(g, 14 * direction, -11, 25 * direction, 1, 0x86506f, 1);
      g.fillStyle(0x352b40).fillRoundedRect(direction * 7 - 5, 13, 10, 19, 3);
      g.fillStyle(0x5c3b59).fillRoundedRect(direction * 7 - 6, 27, 12, 7, 2);
      g.fillStyle(0x825087).fillRoundedRect(direction * 21 - 4, -14, 8, 30, 4);
      g.fillStyle(0xb08ba2).fillRoundedRect(direction * 21 - 4, 11, 8, 7, 3);
    }
    g.fillStyle(0x4b3357).fillRoundedRect(-16, -22, 32, 43, 8);
    g.fillStyle(0x93669e).fillRoundedRect(-14, -24, 28, 40, 7);
    g.fillStyle(0xae7fb0).fillTriangle(-12, -15, 0, -9, -3, 10).fillTriangle(12, -15, 0, -9, 3, 10);
    g.fillStyle(0x72477d).fillRoundedRect(-12, -41, 24, 23, 7);
    g.fillStyle(0x996198).fillRoundedRect(-9, -39, 18, 17, 5);
    g.fillStyle(0xd0ac6e).fillTriangle(-11, -37, -11, -52, -3, -39)
      .fillTriangle(3, -39, 11, -52, 11, -37);
    g.fillStyle(0xead0a0).fillTriangle(-10, -43, -11, -52, -6, -43)
      .fillTriangle(6, -43, 11, -52, 10, -43);
    g.fillStyle(0xf08c79).fillEllipse(-5, -32, 5, 3).fillEllipse(5, -32, 5, 3);
    stroke(g, -8, -35, -2, -33, 0x4a2b4a, 2);
    stroke(g, 2, -33, 8, -35, 0x4a2b4a, 2);
    g.fillStyle(0x412b44).fillRoundedRect(-6, -26, 12, 4, 2);
    g.fillStyle(0xe5caa0).fillTriangle(-5, -26, -2, -26, -3, -22).fillTriangle(2, -26, 5, -26, 3, -22);
    return root;
  }
  g.fillStyle(0x081920, 0.48).fillEllipse(1, 22, w + 10, 10);

  // Every colleague retains their source silhouette and a distinctive prop.
  for (const x of [-6, 6]) {
    if (articulated) continue;
    g.fillStyle(id === 'aj' ? p.skin : 0x253a45).fillRoundedRect(x - 4, 7, 8, 15, 2);
    g.fillStyle(id === 'aj' ? p.skin : 0x152730).fillRoundedRect(x - 5, 19, 10, 6, 2);
    stroke(g, x - 3, 21, x + 3, 21, id === 'aj' ? 0xe0b28a : 0x6d7c77, 1);
  }
  if (id === 'donna' || id === 'kylie' || id === 'paula') {
    g.fillStyle(p.hair).fillRoundedRect(-13, -31, 26, 37, 8);
  }
  g.fillStyle(0x192e36).fillRoundedRect(-w / 2 - 1, -18, w + 2, 32, 7);
  g.fillStyle(p.shirt).fillRoundedRect(-w / 2, -19, w, 29, 6);
  g.fillStyle(0xf0d2a0, 0.13).fillRoundedRect(-w / 2 + 2, -14, 4, 18, 2);
  g.fillStyle(id === 'aj' ? 0x4c665c : 0x2e4750).fillRoundedRect(-w / 2 + 1, 7, w - 2, 8, 2);
  g.fillStyle(0xb2ad8d).fillRect(-2, 8, 4, 3);
  for (const x of [-w / 2 - 3, w / 2 + 3]) {
    if (articulated) continue;
    g.fillStyle(id === 'aj' ? p.skin : p.shirt).fillRoundedRect(x - 3, -14, 7, 21, 3);
    g.fillStyle(p.skin).fillRoundedRect(x - 3, 2, 7, 7, 3);
  }
  if (id === 'aj') {
    stroke(g, -9, -6, -2, -5, 0x997254, 1, 0.6);
    stroke(g, 2, -5, 9, -6, 0x997254, 1, 0.6);
    stroke(g, 0, -3, 0, 3, 0x9f7959, 1, 0.5);
  }
  if (id === 'ralph' || id === 'john') {
    for (const x of [-8, 5]) g.fillStyle(0xe4c276).fillRect(x, -15, 4, 22);
    g.fillStyle(0xd6dcc0).fillRect(-11, 1, 22, 3);
  }
  if (id === 'shan') {
    g.fillStyle(0xba6655).fillTriangle(-3, -15, 3, -15, 0, -10);
    g.fillStyle(0x9d4b45).fillTriangle(0, -11, -3, 3, 3, 3);
    g.fillStyle(0x3b575f).fillRect(5, -9, 4, 1);
  }
  if (id === 'gunman') {
    // Black jacket and left-facing, deliberately simplified original weapon.
    g.fillStyle(0x18242c).fillRoundedRect(-6, -18, 12, 29, 2);
    stroke(g, -7, -17, -3, -10, 0x6b7778, 1);
    stroke(g, 7, -17, 3, -10, 0x6b7778, 1);
  }
  g.fillStyle(0x26373a).fillCircle(0, -23, 11);
  g.fillStyle(p.skin).fillRoundedRect(-9, -31, 18, 20, 7);
  g.fillStyle(0xf1ce9c, 0.24).fillRoundedRect(-5, -28, 10, 11, 4);
  g.fillStyle(p.hair).fillRoundedRect(-10, -34, 20, 9, 5);
  g.fillStyle(p.hair).fillRoundedRect(-10, -30, 4, 10, 2);
  g.fillStyle(0x283737).fillCircle(-3, -23, 1).fillCircle(4, -23, 1);
  stroke(g, -2, -16, 3, -16, 0x785640, 1);

  if (id === 'hussan') {
    // His phone and gesturing hand are source details, not invented attire.
    g.fillStyle(0x1b2c35).fillRoundedRect(9, -26, 8, 15, 2);
    g.fillStyle(0x8bc0c6).fillRect(11, -23, 4, 9);
    g.fillStyle(p.skin).fillRoundedRect(13, -15, 6, 7, 3);
    g.fillStyle(p.skin).fillRoundedRect(-19, -15, 6, 9, 3);
    stroke(g, -17, -18, -17, -12, p.skin, 3);
  } else if (id === 'ben') {
    miniDemon(g, 15, -14);
  } else if (id === 'bannerman') {
    g.lineStyle(1.5, 0x22363c).strokeRoundedRect(-8, -25, 7, 5, 1).strokeRoundedRect(1, -25, 7, 5, 1);
    stroke(g, -1, -23, 1, -23, 0x22363c, 1);
    g.fillStyle(0x58432f).fillRoundedRect(-5, -18, 10, 3, 1);
    g.fillStyle(0xbb5e49).fillRect(12, -1, 11, 7);
    g.fillStyle(0xdc8b63).fillCircle(15, -2, 1.5).fillCircle(20, -2, 1.5);
  } else if (id === 'doris') {
    g.fillStyle(0xdec678).fillCircle(-7, -31, 5).fillCircle(0, -34, 6).fillCircle(7, -31, 5);
    stroke(g, 9, -15, 22, -15, 0xd9d4ba, 2);
    g.fillStyle(0xd8865d).fillCircle(22, -15, 1.5);
  } else if (id === 'donna') {
    g.fillStyle(p.hair).fillRoundedRect(-12, -33, 8, 27, 4).fillRoundedRect(7, -31, 6, 27, 3);
    g.lineStyle(1, 0xd9c381).beginPath().moveTo(-6, -12).lineTo(0, -6).lineTo(6, -12).strokePath();
    g.fillStyle(0xe8c96e).fillCircle(0, -5, 2);
  } else if (id === 'vic') {
    stroke(g, -8, -28, -1, -26, 0x5a5d56, 2);
    stroke(g, 2, -26, 8, -28, 0x5a5d56, 2);
  } else if (id === 'kylie') {
    g.fillStyle(0x9467a5).fillRoundedRect(-12, -36, 24, 11, 5);
    g.fillStyle(0x764a8a).fillRoundedRect(-12, -29, 6, 30, 3).fillRoundedRect(8, -29, 6, 26, 3);
    stroke(g, -9, -27, -9, -4, 0xc88dba, 1);
    g.fillStyle(0xe6c5a0).fillCircle(-11, -19, 2).fillCircle(11, -19, 2);
  } else if (id === 'ralph') {
    g.fillStyle(0xd8bf64).fillRoundedRect(-11, -36, 22, 10, 4);
    g.fillStyle(0xb7984d).fillRoundedRect(-12, -28, 26, 4, 2);
  } else if (id === 'paula') {
    g.fillStyle(0x67334c).fillRoundedRect(-12, -35, 25, 10, 5);
    g.fillStyle(0x66394d).fillRoundedRect(-13, -29, 5, 24, 2).fillRoundedRect(9, -29, 5, 24, 2);
    g.fillStyle(0xd4ae75).fillCircle(-11, -19, 2).fillCircle(11, -19, 2);
  } else if (id === 'gunman') {
    g.fillStyle(0x111c24).fillRoundedRect(-23, -7, 28, 10, 2);
    g.lineStyle(1, 0x6f7d7f).strokeRoundedRect(-23, -7, 28, 10, 2);
    g.fillStyle(0x24343d).fillRect(-45, -5, 23, 4);
    g.fillStyle(0x0b1720).fillRect(-48, -6, 5, 6);
    stroke(g, -43, -5, -26, -5, 0x8a9290, 1);
    g.fillStyle(0x111d26).fillRoundedRect(3, -5, 11, 8, 2).fillRect(-9, 0, 6, 10);
    g.fillStyle(0x101d25).fillRect(-26, -10, 12, 3);
    g.fillStyle(p.skin).fillRoundedRect(-21, -1, 7, 5, 2).fillRoundedRect(3, -1, 7, 5, 2);
  }

  if (articulated) {
    const arms: Phaser.GameObjects.Container[] = [];
    const legs: Phaser.GameObjects.Container[] = [];
    for (const direction of [-1, 1]) {
      const leg = scene.add.graphics();
      leg.fillStyle(id === 'aj' ? p.skin : 0x253a45).fillRoundedRect(-4, 0, 8, 15, 2);
      leg.fillStyle(id === 'aj' ? p.skin : 0x152730).fillRoundedRect(-5, 12, 10, 6, 2);
      stroke(leg, -3, 14, 3, 14, id === 'aj' ? 0xe0b28a : 0x6d7c77, 1);
      const legRoot = scene.add.container(direction * 6, 7, [leg]);
      root.add(legRoot);
      legs.push(legRoot);
      const arm = scene.add.graphics();
      arm.fillStyle(p.skin).fillRoundedRect(-3, 0, 7, 18, 3);
      arm.fillStyle(id === 'aj' ? 0xd8ad86 : p.shirt).fillRoundedRect(-3, -1, 7, id === 'aj' ? 6 : 8, 3);
      arm.fillStyle(p.skin).fillRoundedRect(-4, 15, 9, 7, 3);
      const armRoot = scene.add.container(direction * (w / 2 + 2), -14, [arm]);
      root.add(armRoot);
      arms.push(armRoot);
    }
    articulatedParts.set(root, { body: g, arms, legs });
  }
  const effect = scene.add.graphics();
  root.add(effect);
  accents.set(root, { id, graphics: effect });
  updateColleagueArt(root, 0);
  if (id === 'fruitloop') root.setScale(0.76);
  return root;
}

/** Source John gestures and AJ kneading are limb poses, independent of foot motion. */
export function setColleaguePose(container: Phaser.GameObjects.Container, pose: ColleaguePose, timeMs = container.scene.time.now): void {
  const parts = articulatedParts.get(container);
  if (!parts) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Math.sin(timeMs / 115);
  parts.body.setPosition(0, pose === 'crouch' ? 6 : 0).setScale(1, pose === 'crouch' ? 0.82 : 1);
  parts.legs.forEach((leg, index) => {
    const direction = index === 0 ? -1 : 1;
    leg.setPosition(direction * (pose === 'crouch' ? 9 : 6), pose === 'crouch' ? 15 : 7)
      .setRotation(pose === 'crouch' ? -direction * 0.55 : 0).setScale(1, pose === 'crouch' ? 0.62 : 1);
  });
  parts.arms.forEach((arm, index) => {
    const direction = index === 0 ? -1 : 1;
    arm.setScale(1).setPosition(direction * 13.5, -14).setRotation(0);
    if (pose === 'shout') arm.setRotation(-direction * (2.05 + motion * 0.06));
    else if (pose === 'crouch') arm.setPosition(direction * 17, 3).setRotation(-direction * 1.15);
    else if (pose === 'massage') {
      arm.setPosition(direction * 11, -10 + (index === 0 ? motion : -motion) * 2);
      arm.setRotation(1.12 + (index === 0 ? motion : -motion) * 0.1).setScale(1, 1.12);
    }
  });
}

/** Source accents remain local, including Shan's red face during a rant. */
export function updateColleagueArt(container: Phaser.GameObjects.Container, timeMs: number): void {
  const accent = accents.get(container);
  if (!accent) return;
  const { id, graphics: g } = accent;
  g.clear();
  if (id === 'doris') {
    for (let i = 0; i < 3; i++) {
      const phase = (timeMs / 1600 + i / 3) % 1;
      g.fillStyle(0xbdc9bc, 0.32 * (1 - phase)).fillCircle(22 + Math.sin(timeMs / 440 + i) * 3, -20 - phase * 17, 2 + phase * 3);
    }
  } else if (id === 'brian') {
    for (let i = 0; i < 3; i++) {
      const phase = (timeMs / 1500 + i / 3) % 1;
      stroke(g, -12 + i * 11, -34 - phase * 8, -10 + i * 11, -39 - phase * 8, 0x9cad72, 2, 0.55 * (1 - phase));
    }
  } else if (id === 'shan' && container.getData('ranting')) {
    // ShanNpc's source head color, restricted to the face so his white shirt and red tie stay readable.
    g.fillStyle(0xd06262).fillRoundedRect(-9, -31, 18, 20, 7);
    g.fillStyle(0xf1ce9c, 0.16).fillRoundedRect(-5, -28, 10, 11, 4);
    g.fillStyle(profiles.shan.hair).fillRoundedRect(-10, -34, 20, 9, 5).fillRoundedRect(-10, -30, 4, 10, 2);
    g.fillStyle(0x283737).fillCircle(-3, -23, 1).fillCircle(4, -23, 1);
    stroke(g, -2, -16, 3, -16, 0x785640, 1);
  }
}
