import Phaser from 'phaser';

type Graphics = Phaser.GameObjects.Graphics;
type Point = readonly [number, number];
export interface MesaBedroom { animate(elapsed: number): void }

/** Original editable illustration; ordinary alpha lighting supports Canvas too. */
export function createMesaBedroom(scene: Phaser.Scene): MesaBedroom {
  const text = (x: number, y: number, copy: string, size: number, color = '#e7dfc9') =>
    scene.add.text(x, y, copy, { fontFamily: 'Arial, sans-serif', fontSize: `${size}px`,
      fontStyle: 'bold', color, lineSpacing: 3 });
  const rect = (g: Graphics, x: number, y: number, w: number, h: number, color: number, radius = 0, alpha = 1) => {
    g.fillStyle(color, alpha);
    if (radius) g.fillRoundedRect(x, y, w, h, radius);
    else g.fillRect(x, y, w, h);
  };
  const oval = (g: Graphics, x: number, y: number, w: number, h: number, color: number, alpha = 1) => {
    g.fillStyle(color, alpha).fillEllipse(x, y, w, h);
  };
  const line = (g: Graphics, points: readonly Point[], color: number, width = 1, alpha = 1) => {
    g.lineStyle(width, color, alpha).beginPath().moveTo(...points[0]);
    for (const point of points.slice(1)) g.lineTo(...point);
    g.strokePath();
  };
  const poly = (g: Graphics, points: readonly Point[], color: number, alpha = 1) => {
    g.fillStyle(color, alpha).beginPath().moveTo(...points[0]);
    for (const point of points.slice(1)) g.lineTo(...point);
    g.closePath().fillPath();
  };

  const room = scene.add.graphics();
  rect(room, 0, 0, 960, 720, 0x18232b);
  const top = Phaser.Display.Color.ValueToColor(0x15242e);
  const bottom = Phaser.Display.Color.ValueToColor(0x394146);
  for (let y = 0; y < 458; y += 2) {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bottom, 458, y);
    rect(room, 0, y, 960, 2, Phaser.Display.Color.GetColor(c.r, c.g, c.b));
  }
  poly(room, [[0, 0], [40, 26], [40, 435], [0, 474]], 0x101b26);
  poly(room, [[922, 25], [960, 0], [960, 480], [922, 436]], 0x0e1921);
  rect(room, 40, 29, 882, 5, 0x5b6060, 0, 0.4);
  for (let x = 68; x < 920; x += 46) line(room, [[x, 40], [x, 441]], 0x899087, 1, 0.06);
  rect(room, 0, 454, 960, 266, 0x493b35);
  for (let row = 0; row < 8; row++) {
    const y = 454 + row * row * 4.5;
    rect(room, 0, y, 960, 2, 0x251f23, 0, 0.7);
    for (let x = -200; x < 1100; x += 190) {
      line(room, [[x + (row % 2) * 85, y], [x + (row % 2) * 85 - 8, y + 18 + row * 8]], 0x2d2728, 1, 0.65);
      line(room, [[x + 20, y + 8], [x + 116, y + 10]], 0x998069, 1, 0.14);
    }
  }
  rect(room, 40, 436, 882, 18, 0x182227);
  rect(room, 40, 435, 882, 3, 0x808078, 0, 0.45);
  // Moonlit skyline, glass reflection, sill and gathered curtains.
  rect(room, 343, 76, 219, 140, 0x0c141e, 5);
  rect(room, 350, 82, 205, 126, 0x607578, 3);
  rect(room, 356, 88, 193, 114, 0x172c43);
  oval(room, 509, 113, 24, 24, 0xe5e5c6);
  oval(room, 515, 109, 21, 22, 0x172c43);
  for (const [x, y] of [[376, 106], [409, 121], [464, 100], [533, 146], [486, 155]]) oval(room, x, y, 2, 2, 0xb3d1db);
  for (let i = 0; i < 13; i++) {
    const height = 17 + (i * 17 % 35);
    rect(room, 357 + i * 15, 202 - height, 13, height, 0x0c1c2d);
    if (i % 3) rect(room, 360 + i * 15, 208 - height, 3, 5, 0xe3ba70, 0, 0.7);
  }
  poly(room, [[365, 88], [387, 88], [441, 202], [419, 202]], 0x92bbc3, 0.08);
  rect(room, 449, 84, 5, 122, 0x718083);
  rect(room, 351, 146, 201, 4, 0x718083);
  rect(room, 338, 208, 230, 10, 0x81908b, 2);
  line(room, [[325, 70], [577, 70]], 0xa1a49a, 4);
  for (const x of [326, 550]) {
    poly(room, [[x, 73], [x + 28, 73], [x + 19, 132], [x + 31, 228], [x - 8, 228]], 0x66596d);
    for (let i = 0; i < 3; i++) line(room, [[x + i * 8, 76], [x + 5 + i * 4, 131], [x + i * 9, 221]], 0xa28b97, 2, 0.35);
    line(room, [[x + 1, 133], [x + 23, 136]], 0xbd9870, 4);
  }
  poly(room, [[353, 218], [545, 218], [702, 579], [450, 580]], 0x9cbccd, 0.035);
  const poster = (x: number, y: number, w: number, h: number, copy: string, color: number, angle: number) => {
    const group = scene.add.container(x, y).setAngle(angle);
    const paper = scene.add.graphics();
    rect(paper, 4, 5, w, h, 0x07121a, 1, 0.45);
    rect(paper, 0, 0, w, h, 0xc4b69a);
    rect(paper, 5, 5, w - 10, h - 10, color);
    line(paper, [[10, h - 21], [w - 10, h - 21]], 0xe9ddbf, 1, 0.7);
    rect(paper, 6, -4, 21, 9, 0xc5bea2, 0, 0.65);
    rect(paper, w - 27, h - 5, 21, 9, 0xc5bea2, 0, 0.65);
    group.add([paper, text(w / 2, h / 2 - 5, copy, 18).setOrigin(0.5).setAlign('center')]);
  };
  poster(83, 114, 116, 126, 'BULK\nRULES', 0x8d663e, -5);
  poster(629, 91, 132, 114, 'PAYTMAN\nSUCKS', 0x91594d, 3);
  poster(786, 115, 110, 99, 'NO\nREPEATS', 0x3e6667, -4);
  text(64, 51, 'MESA AT HOME', 13, '#bccecb').setLetterSpacing(3);
  text(65, 72, 'SKANKY’S ROOM  /  AFTER HOURS', 9, '#869f9e').setLetterSpacing(1.6);

  const furniture = scene.add.graphics();
  oval(furniture, 185, 525, 293, 47, 0x12171e, 0.48);
  rect(furniture, 67, 336, 32, 169, 0x372e2c, 6);
  rect(furniture, 74, 344, 18, 155, 0x6d5543, 3);
  poly(furniture, [[82, 399], [219, 390], [293, 476], [78, 481]], 0x3b2c2a);
  rect(furniture, 80, 461, 211, 53, 0x31282b, 5);
  rect(furniture, 86, 501, 14, 27, 0x201f24, 2);
  rect(furniture, 271, 495, 14, 30, 0x201f24, 2);
  poly(furniture, [[88, 388], [214, 388], [286, 453], [83, 458]], 0xbcb59e);
  rect(furniture, 83, 447, 203, 22, 0xccc2a6, 6);
  poly(furniture, [[113, 414], [239, 413], [287, 455], [287, 490], [141, 491], [110, 454]], 0x945c47);
  poly(furniture, [[146, 421], [236, 419], [256, 441], [150, 441], [169, 486], [151, 486]], 0xb07a5a);
  line(furniture, [[114, 451], [166, 450], [187, 476], [283, 478]], 0x543d38, 3, 0.65);
  line(furniture, [[183, 414], [202, 439], [244, 444]], 0xe0a87b, 2, 0.35);
  poly(furniture, [[91, 389], [156, 386], [186, 412], [110, 416]], 0xe0d8bb);
  line(furniture, [[102, 393], [145, 392], [169, 408]], 0xb4ac93, 2);
  // Computer nook preserves the original monitor reference.
  oval(furniture, 327, 492, 159, 31, 0x10151c, 0.4);
  rect(furniture, 251, 380, 148, 16, 0x8e6c4d, 3);
  rect(furniture, 259, 394, 11, 110, 0x342e2b);
  rect(furniture, 380, 394, 11, 101, 0x342e2b);
  rect(furniture, 279, 286, 114, 83, 0x0c161d, 6);
  rect(furniture, 285, 292, 102, 66, 0x294c58, 2);
  rect(furniture, 326, 369, 15, 12, 0x152027);
  rect(furniture, 307, 378, 53, 4, 0x6b7775, 2);
  for (let row = 0; row < 3; row++) rect(furniture, 294, 300 + row * 7, 22 + row * 11, 2, 0x8eb8b0, 0, 0.5);
  text(336, 336, 'BUILT\nTHE BELT', 13, '#d5e6d1').setOrigin(0.5).setAlign('center');
  poly(furniture, [[282, 375], [344, 375], [354, 386], [277, 386]], 0x172831);
  for (let i = 0; i < 11; i++) line(furniture, [[285 + i * 5, 378], [284 + i * 5, 382]], 0x7b8e8d, 2);
  oval(furniture, 373, 381, 13, 7, 0x99a49a);
  rect(furniture, 259, 363, 13, 17, 0xc3b293, 3);
  oval(furniture, 265, 364, 10, 4, 0x443b35);
  oval(furniture, 467, 583, 441, 115, 0x182128, 0.35);
  poly(furniture, [[330, 518], [606, 518], [692, 642], [286, 642]], 0x4d6664);
  poly(furniture, [[337, 529], [599, 529], [669, 632], [308, 632]], 0x334b4e);
  for (let i = 0; i < 5; i++) line(furniture, [[333 - i * 4, 546 + i * 18], [611 + i * 12, 546 + i * 18]], 0x92a498, 2, 0.18);
  for (let x = 295; x < 691; x += 9) line(furniture, [[x, 643], [x - 2, 648]], 0x8a9c89, 1, 0.7);
  oval(furniture, 841, 526, 94, 24, 0x0d1720, 0.45);
  rect(furniture, 838, 305, 5, 209, 0x92816a);
  oval(furniture, 841, 513, 47, 12, 0x30333a);
  for (let radius = 115; radius > 20; radius -= 12) oval(furniture, 842, 300, radius * 2, radius * 2, 0xefb76b, 0.018);
  poly(furniture, [[817, 270], [863, 270], [878, 323], [801, 323]], 0xc5a273);
  poly(furniture, [[826, 274], [850, 274], [859, 319], [814, 319]], 0xe6c38d);
  oval(furniture, 840, 323, 76, 10, 0xf7daa4);

  const tv = scene.add.graphics().setName('mesa-television');
  oval(tv, 683, 511, 344, 44, 0x0a1721, 0.4);
  poly(tv, [[557, 425], [820, 425], [847, 442], [539, 442]], 0x947350);
  rect(tv, 539, 442, 308, 65, 0x463b33, 4);
  rect(tv, 552, 453, 133, 42, 0x192126, 2);
  rect(tv, 695, 453, 138, 42, 0x28282b, 2);
  rect(tv, 551, 505, 13, 20, 0x232528, 2);
  rect(tv, 822, 505, 13, 20, 0x232528, 2);
  for (let i = 0; i < 8; i++) rect(tv, 701 + i * 11, 461 + (i % 3), 8, 28, [0x506875, 0xafa88a, 0x77514b][i % 3], 1);
  rect(tv, 661, 405, 32, 21, 0x101b24, 2);
  oval(tv, 677, 428, 105, 10, 0x0c1922);
  rect(tv, 525, 201, 310, 215, 0x070e15, 9);
  rect(tv, 529, 205, 302, 204, 0x364651, 6);
  rect(tv, 534, 210, 292, 192, 0x070f1d, 2);
  rect(tv, 539, 234, 256, 160, 0x121d36);
  oval(tv, 812, 409, 3, 3, 0x96d5ad);
  text(542, 214, 'LUMINES', 14, '#ffe9ab').setLetterSpacing(2);
  text(797, 215, '01', 11, '#a4bfcd');
  const score = text(801, 281, '024\n800', 8, '#c3dfdc');
  text(800, 334, 'HI\nSCORE', 6, '#658799');
  text(669, 403, 'BRAVIA', 5, '#a2abae');
  const screen = scene.add.graphics().setName('lumines-board');
  const block = (col: number, row: number, color: number) => {
    const x = 539 + col * 16, y = 234 + row * 16;
    rect(screen, x + 1, y + 1, 14, 14, color, 1);
    rect(screen, x + 2, y + 2, 12, 2, 0xffffff, 0, 0.33);
    rect(screen, x + 2, y + 13, 12, 1, 0x11162d, 0, 0.35);
  };
  // Curved PS3 shell, disc slot, USB ports and power light.
  const ps3 = scene.add.graphics().setName('mesa-ps3');
  rect(ps3, 565, 458, 104, 29, 0x080d12, 8);
  poly(ps3, [[571, 459], [646, 456], [665, 465], [571, 465]], 0x34424b);
  line(ps3, [[572, 468], [661, 468]], 0x84908e);
  rect(ps3, 574, 477, 7, 3, 0x71818a, 1);
  rect(ps3, 585, 477, 7, 3, 0x71818a, 1);
  oval(ps3, 658, 474, 3, 3, 0x9ad487);
  text(612, 471, 'PS3', 10, '#aebdc2').setAngle(-3);
  line(ps3, [[668, 480], [675, 488], [675, 502], [651, 510]], 0x0a1821, 2);
  rect(ps3, 793, 438, 30, 45, 0x94a9ad, 2);
  rect(ps3, 796, 441, 24, 39, 0x243b4c, 1);
  rect(ps3, 796, 441, 24, 5, 0x171d24);
  text(798, 442, 'PS3', 4, '#ffffff');
  for (let i = 0; i < 4; i++) rect(ps3, 799 + i % 2 * 9, 452 + Math.floor(i / 2) * 9, 8, 8, i % 3 === 0 ? 0xf4ac46 : 0xf6edc8);
  text(798, 473, 'LUMINES', 4, '#ffdfa3');
  const spill = scene.add.graphics();
  poly(spill, [[538, 392], [794, 392], [740, 570], [361, 578]], 0x79bac8, 0.04);
  oval(spill, 579, 531, 256, 47, 0x8fcccb, 0.04);

  // Mesa cabinet: woven grille, knobs, piping, handle and metal guards.
  const amp = scene.add.graphics().setName('mesa-amplifier');
  oval(amp, 777, 606, 176, 31, 0x11161d, 0.5);
  poly(amp, [[697, 493], [825, 487], [852, 500], [726, 509]], 0x414340);
  poly(amp, [[825, 488], [852, 500], [852, 597], [827, 606]], 0x151e25);
  rect(amp, 699, 500, 133, 103, 0x141b21, 6);
  rect(amp, 704, 505, 123, 94, 0xb29768, 3);
  rect(amp, 708, 509, 115, 27, 0x282b2b, 2);
  rect(amp, 708, 540, 115, 54, 0x716450, 1);
  for (let x = 710; x < 823; x += 3) line(amp, [[x, 541], [x, 593]], 0xc3ab7b, 1, 0.48);
  for (let y = 541; y < 593; y += 3) line(amp, [[709, y], [822, y]], 0x1a262a, 1, 0.55);
  rect(amp, 731, 553, 78, 17, 0x1b2427, 2);
  text(770, 562, 'MESA BOOGIE', 9, '#ecdfbf').setOrigin(0.5);
  text(714, 512, 'DUAL RECTIFIER', 6, '#cdbb9c');
  for (let i = 0; i < 7; i++) {
    oval(amp, 717 + i * 13, 527, 6, 6, 0xcbbf9e);
    line(amp, [[717 + i * 13, 527], [718 + i * 13, 525]], 0x393e3d);
  }
  oval(amp, 813, 516, 4, 4, 0xeeb46c);
  line(amp, [[747, 494], [748, 484], [782, 483], [787, 491]], 0x0b141d, 5);
  for (const [x, y] of [[699, 500], [820, 500], [699, 591], [820, 591]]) rect(amp, x, y, 12, 12, 0x89908a, 2);
  rect(amp, 712, 602, 12, 9, 0x111820, 2);
  rect(amp, 809, 602, 12, 9, 0x111820, 2);
  line(amp, [[811, 532], [843, 545], [853, 611], [815, 650], [321, 650], [285, 638], [271, 531]], 0x0e171f, 3);

  const chair = scene.add.graphics();
  oval(chair, 445, 608, 213, 44, 0x0c1821, 0.6);
  rect(chair, 351, 439, 135, 150, 0x25353c, 24);
  rect(chair, 358, 430, 122, 132, 0x606350, 22);
  rect(chair, 365, 438, 110, 120, 0x767762, 19);
  line(chair, [[378, 450], [371, 521], [386, 548]], 0xa2a18a, 2, 0.55);
  rect(chair, 347, 532, 153, 61, 0x464f42, 16);
  rect(chair, 364, 531, 125, 37, 0x82816a, 12);
  rect(chair, 344, 499, 31, 75, 0x676c56, 13);
  rect(chair, 472, 498, 31, 76, 0x585e4d, 13);
  line(chair, [[350, 515], [353, 554]], 0xb4af8a, 2, 0.4);
  for (const x of [362, 479]) rect(chair, x, 587, 10, 20, 0x262629, 2);
  const stool = scene.add.graphics();
  oval(stool, 251, 625, 147, 28, 0x0c1821, 0.5);
  rect(stool, 204, 540, 84, 17, 0x8c6a4f, 6);
  for (const x of [211, 275]) rect(stool, x, 553, 9, 70, 0x3e3330, 2);
  line(stool, [[214, 590], [279, 590]], 0x695342, 5);

  const seatedBody = (shirt: readonly [number, number, number]) => {
    const body = scene.add.graphics();
    poly(body, [[-23, 58], [29, 59], [66, 93], [58, 125], [36, 126], [41, 99], [-1, 87]], 0x334b5b);
    poly(body, [[-13, 62], [9, 76], [21, 111], [10, 139], [-12, 137], [-5, 109], [-31, 85]], 0x456174);
    line(body, [[3, 89], [13, 111], [4, 132]], 0x809294, 2, 0.5);
    poly(body, [[38, 117], [61, 119], [80, 132], [76, 143], [34, 140]], 0x161f28);
    poly(body, [[-13, 128], [10, 133], [25, 147], [21, 155], [-22, 148]], 0x18232b);
    line(body, [[34, 139], [75, 143]], 0xb7b3a1, 3);
    line(body, [[-20, 147], [20, 155]], 0xb7b3a1, 3);
    for (let i = 0; i < 3; i++) line(body, [[48 + i * 5, 126], [43 + i * 5, 130]], 0x989e97, 2);
    poly(body, [[-26, -32], [14, -39], [38, -6], [37, 42], [45, 65], [9, 81], [-38, 65], [-36, 10]], shirt[0]);
    poly(body, [[-25, -20], [-10, -23], [-8, 47], [15, 70], [-31, 61]], shirt[1]);
    poly(body, [[20, -29], [39, -5], [32, 40], [42, 63], [24, 67], [15, 19]], shirt[2]);
    line(body, [[-29, 56], [-5, 64], [16, 61]], 0xe0a375, 2, 0.35);
    return body;
  };
  const skanky = scene.add.container(239, 480).setName('skanky-guitarist');
  skanky.add(seatedBody([0x914f3c, 0xb06b4d, 0x633e35]));
  // Skanky's long loose hair reaches mid-back as he plays beside Trmyte.
  const head = scene.add.container(0, 0).setName('skanky-long-hair');
  const hair = scene.add.graphics();
  poly(hair, [[-40, -60], [-31, -86], [-2, -93], [23, -77], [29, -49], [17, -14], [10, 19], [-6, 38], [-19, 31], [-24, 39], [-39, 27], [-45, -10]], 0x302b27);
  poly(hair, [[-31, -78], [-12, -89], [8, -82], [-9, -55], [-15, 19], [-26, 30], [-32, 13]], 0x634732);
  poly(hair, [[-5, -72], [19, -69], [24, -53], [35, -47], [27, -40], [27, -24], [15, -17], [-2, -24], [-11, -42]], 0xd3a077);
  poly(hair, [[21, -53], [35, -47], [26, -44], [25, -28], [13, -23], [5, -30]], 0xe8bc8c);
  oval(hair, 1, -44, 10, 14, 0xb88362);
  line(hair, [[1, -48], [-1, -43], [2, -40]], 0x805c48, 1.5);
  line(hair, [[15, -55], [23, -53]], 0x4d3a2c, 2);
  oval(hair, 22, -49, 3, 3, 0x20252b);
  line(hair, [[20, -33], [27, -35]], 0x694737, 1.5);
  for (let i = 0; i < 5; i++) line(hair, [[9 + i * 3, -28 + (i % 2) * 2], [10 + i * 3, -25 + (i % 2) * 2]], 0x6b5242, 1, 0.6);
  poly(hair, [[-29, -77], [-2, -86], [24, -75], [20, -65], [6, -69], [-3, -49], [-4, -7], [-14, 29], [-22, 32], [-18, -20]], 0x765236);
  for (const [x, end] of [[-34, 21], [-27, 28], [-18, 26], [-10, 10]]) line(hair, [[x + 5, -74], [x, -36], [x + 2, end]], 0xb08953, 1.4, 0.58);
  line(hair, [[7, -84], [23, -74], [27, -58]], 0xb4d1bb, 2, 0.5);
  head.add(hair);
  skanky.add(head);

  const guitar = scene.add.container(3, 25).setName('skanky-guitar').setAngle(-12);
  const g = scene.add.graphics();
  // A sunburst electric guitar with pickups, six strings and a fretted neck.
  poly(g, [[-30, -15], [-18, -25], [-9, -17], [9, -18], [17, -28], [28, -20], [19, -1], [29, 18], [24, 37], [5, 45], [-23, 36], [-32, 16], [-24, 0]], 0x3e2528);
  poly(g, [[-26, -13], [-17, -20], [-8, -12], [10, -13], [17, -21], [22, -18], [14, -1], [24, 18], [20, 33], [5, 39], [-19, 31], [-27, 16], [-19, 0]], 0xb1663e);
  oval(g, -1, 13, 37, 46, 0xd29752);
  rect(g, 8, -6, 108, 12, 0x644735, 2);
  poly(g, [[114, -7], [139, -11], [144, -4], [139, 9], [114, 5]], 0xc89b66);
  poly(g, [[-3, -10], [14, -9], [13, 17], [3, 28], [-10, 17]], 0xd5c9ac);
  for (const x of [-13, 1, 14]) rect(g, x, -6, 5, 16, 0x263139, 1);
  for (let x = 28; x < 114; x += 8) line(g, [[x, -5], [x, 5]], 0xabaa93);
  for (let y = -3; y <= 3; y += 1.2) line(g, [[-14, y], [137, y]], 0xeee0b5, 0.65, 0.8);
  for (let x = 120; x < 141; x += 7) { oval(g, x, -11, 4, 5, 0xcad1c3); oval(g, x, 10, 4, 5, 0xcad1c3); }
  oval(g, 14, 25, 5, 5, 0xe5d6ae);
  oval(g, 21, 18, 5, 5, 0xe5d6ae);
  guitar.add(g);
  skanky.add(guitar);
  const fretArm = scene.add.graphics();
  poly(fretArm, [[28, -3], [39, 0], [61, 14], [85, 3], [92, 13], [63, 28], [54, 26], [29, 12]], 0xd6a77a);
  line(fretArm, [[38, 5], [62, 21], [83, 10]], 0xe9bc88, 3, 0.65);
  oval(fretArm, 88, 8, 12, 15, 0xe0b184);
  for (let y = 3; y < 13; y += 3) line(fretArm, [[84, y], [91, y + 1]], 0x90694f, 1);
  skanky.add(fretArm);
  const strumArm = scene.add.container(-25, 0).setName('skanky-strumming');
  const picking = scene.add.graphics();
  poly(picking, [[-5, -2], [7, -2], [12, 25], [35, 29], [34, 40], [5, 38], [0, 32]], 0xba875f);
  line(picking, [[2, 4], [7, 29], [30, 34]], 0xe3b786, 3, 0.7);
  oval(picking, 34, 34, 13, 12, 0xe3b487);
  poly(picking, [[38, 30], [43, 34], [38, 37]], 0xf0dfba);
  strumArm.add(picking);
  skanky.add(strumArm);

  // Trmyte keeps the playable character's blue shirt and yellow cap.
  const trmyte = scene.add.container(427, 463).setName('trmyte-gaming');
  trmyte.add(seatedBody([0x3b719a, 0x5995b6, 0x2c4d70]));
  const gamingArms = scene.add.graphics();
  poly(gamingArms, [[-18, 7], [-8, 6], [10, 33], [47, 21], [54, 34], [9, 49], [-2, 43]], 0xba875f);
  poly(gamingArms, [[29, 0], [40, 1], [44, 18], [73, 14], [76, 26], [34, 34]], 0xd6a77a);
  line(gamingArms, [[-11, 13], [12, 39], [43, 29]], 0xe4bb88, 3, 0.6);
  trmyte.add(gamingArms);
  const trmyteHead = scene.add.container(0, 0);
  const face = scene.add.graphics();
  rect(face, -4, -36, 22, 18, 0xbc8a63, 3);
  poly(face, [[-20, -76], [17, -75], [24, -54], [35, -47], [27, -41], [26, -27], [14, -20], [-7, -25], [-23, -46]], 0xd3a077);
  poly(face, [[19, -60], [24, -54], [35, -47], [26, -44], [26, -29], [14, -24], [8, -29]], 0xe8bc8c);
  poly(face, [[-23, -68], [-5, -66], [-5, -45], [-13, -41], [-14, -30], [-22, -39]], 0x5a4230);
  oval(face, -5, -45, 11, 15, 0xbb8660);
  line(face, [[-4, -49], [-7, -44], [-3, -41]], 0x805c48, 1.5);
  line(face, [[15, -55], [24, -53]], 0x59422c, 2);
  oval(face, 23, -49, 3, 3, 0x20252b);
  line(face, [[19, -33], [27, -35]], 0x79503b, 1.5);
  poly(face, [[-29, -72], [-27, -87], [-13, -98], [9, -96], [22, -82], [24, -69]], 0xb49a4b);
  poly(face, [[-19, -87], [-9, -95], [8, -92], [17, -79], [17, -73], [-20, -75]], 0xd7bb63);
  line(face, [[-5, -94], [-1, -76]], 0xf2d88a, 1.5, 0.55);
  poly(face, [[-29, -73], [24, -75], [44, -68], [38, -64], [-28, -67]], 0xdec576);
  trmyteHead.add([face, text(-5, -85, 'T', 10, '#5c583d').setOrigin(0.5)]);
  trmyte.add(trmyteHead);
  const controller = scene.add.container(59, 27).setName('trmyte-controller').setAngle(-8);
  const pad = scene.add.graphics();
  poly(pad, [[-25, -8], [-14, -15], [16, -15], [27, -8], [33, 10], [27, 16], [15, 5], [-12, 5], [-23, 16], [-31, 10]], 0x111d27);
  line(pad, [[-22, -7], [-13, -11], [15, -11], [25, -5]], 0x536976, 2);
  oval(pad, -7, 0, 9, 9, 0x53616a);
  oval(pad, 9, 0, 9, 9, 0x53616a);
  rect(pad, -22, -6, 10, 3, 0xa9b9b9, 1);
  rect(pad, -19, -9, 3, 10, 0xa9b9b9, 1);
  for (const [x, y, color] of [[20, -10, 0x78bba7], [25, -5, 0xc98883], [20, 0, 0x8faadc], [15, -5, 0xc28faa]]) oval(pad, x, y, 3, 3, color);
  oval(pad, 0, -8, 3, 3, 0xadb8b8);
  rect(pad, -6, -13, 3, 2, 0xe7a87c);
  oval(pad, -24, 4, 12, 18, 0xd3a177);
  oval(pad, 29, 4, 12, 17, 0xe2b789);
  controller.add(pad);
  const leftThumb = scene.add.ellipse(-16, -7, 11, 7, 0xe6b98a).setAngle(-18);
  const rightThumb = scene.add.ellipse(22, -6, 10, 7, 0xf0c596).setAngle(24);
  controller.add([leftThumb, rightThumb]);
  trmyte.add(controller);

  const clutter = scene.add.graphics();
  poly(clutter, [[130, 605], [177, 600], [197, 616], [149, 623]], 0xbc9770);
  poly(clutter, [[149, 623], [197, 616], [194, 626], [149, 633]], 0x705341);
  line(clutter, [[157, 609], [176, 614]], 0x965340, 3);
  poly(clutter, [[116, 540], [139, 532], [155, 543], [168, 541], [177, 558], [161, 563], [149, 555], [139, 569], [111, 560]], 0x4c5961);
  line(clutter, [[136, 538], [143, 548], [131, 560]], 0x8a9690, 2, 0.4);
  rect(clutter, 595, 554, 41, 6, 0xbcb694, 1);
  rect(clutter, 599, 548, 40, 6, 0x765549, 1);
  rect(clutter, 603, 542, 40, 6, 0x52717a, 1);
  rect(clutter, 626, 506, 15, 35, 0xb2ac87, 4);
  rect(clutter, 628, 516, 11, 15, 0x7d4839, 1);
  oval(clutter, 633, 508, 12, 4, 0xced0b6);
  oval(clutter, 633, 508, 5, 2, 0x3e4844);
  text(67, 661, 'ONE MORE GAME.', 18, '#e5d8b9').setLetterSpacing(2);
  text(68, 687, 'THE BELT CAN WAIT A MINUTE.', 9, '#a99f91').setLetterSpacing(1.6);

  const heights = [3, 2, 3, 4, 2, 3, 2, 2, 2, 2, 4, 3, 2, 3, 4, 3];
  return {
    animate(elapsed: number) {
      screen.clear();
      const cycle = elapsed % 2400;
      const sweepCol = cycle / 2400 * 16;
      // Matching 2x2 squares clear as Lumines' timeline crosses them.
      for (let col = 0; col < 16; col++) for (let row = 10 - heights[col]; row < 10; row++) {
        const matchColumn = col === 2 || col === 3 || col === 10 || col === 11;
        const matching = row >= 8 && matchColumn;
        const cleared = matchColumn && sweepCol > (col < 4 ? 4 : 12);
        if (matching && cleared) continue;
        const settle = cleared ? Math.min(2, (sweepCol - (col < 4 ? 4 : 12)) * 2) : 0;
        block(col, row + settle, matching || (col * 3 + row * 7) % 5 < 3 ? 0xf3ad48 : 0xecebcf);
      }
      const fallingRow = Math.min(6, cycle / 135);
      block(7, fallingRow, 0xecebcf);
      block(8, fallingRow, 0xf3ad48);
      block(7, fallingRow + 1, 0xf3ad48);
      block(8, fallingRow + 1, 0xf3ad48);
      for (const col of [2, 10]) if (sweepCol < col + 2) {
        screen.lineStyle(1.5, 0xfff2b7, 0.7 + Math.sin(elapsed / 110) * 0.25).strokeRect(540 + col * 16, 363, 30, 30);
      }
      const scanX = 539 + sweepCol * 16;
      rect(screen, scanX - 8, 234, 8, 160, 0xffdf91, 0, 0.11);
      rect(screen, scanX, 234, 2, 160, 0xffefd0, 0, 0.94);
      poly(screen, [[scanX - 4, 231], [scanX + 6, 231], [scanX + 1, 237]], 0xffe1a0);
      const points = String(24800 + Math.floor(elapsed / 2400) * 800 + (cycle > 600 ? 400 : 0) + (cycle > 1800 ? 400 : 0)).padStart(6, '0');
      score.setText(`${points.slice(0, 3)}\n${points.slice(3)}`);
      head.y = Math.sin(elapsed / 340) * 1.3;
      strumArm.angle = Math.sin(elapsed / 90) * 9;
      trmyteHead.y = Math.sin(elapsed / 410) * 0.8;
      controller.y = 27 + Math.sin(elapsed / 160) * 0.7;
      controller.angle = -8 + Math.sin(elapsed / 260) * 1.5;
      leftThumb.x = -16 + Math.sin(elapsed / 180) * 1.2;
      rightThumb.y = -6 + Math.sin(elapsed / 85) * 1.3;
      spill.alpha = 0.8 + Math.sin(elapsed / 380) * 0.15;
    },
  };
}
