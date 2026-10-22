import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { BODY, bendElbows, bendKnees, createCharacter, mergeCharacter, type Character, type CharacterMotion } from './characters';
import { placeProp } from './propModels';
import { poseSeated } from './seating';
import { shadowed, standard, textPlane } from './space';

/**
 * Skanky's bedroom after a successful Mesa theft, rebuilt in 3D from
 * src/game/art/MesaBedroomArt.ts. Trmyte (hat, T) plays Lumines on a TV
 * and PS3. Long-haired Skanky plays guitar through the Mesa cabinet. The
 * BULK RULES, PAYTMAN SUCKS and NO REPEATS posters and the BUILT THE BELT
 * monitor are kept.
 */
export const DREAM_MS = 5000;
export const DREAM_FADE_MS = 450;

const rounded = (w: number, h: number, d: number, material: THREE.Material, r = 0.04): THREE.Mesh =>
  new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), material);

/** Seat height of the stool and armchair cushion. */
const SEAT_HEIGHT = 0.48;

/** Where the hands go on the held things, in each one's own frame: the guitar's neck and sound hole, the controller's grips. */
const HAND_POINTS = {
  fret: new THREE.Vector3(0.5, 0.13, 0.05),
  strum: new THREE.Vector3(-0.02, -0.01, 0.1),
  gripA: new THREE.Vector3(0.08, 0.012, 0.03),
  gripB: new THREE.Vector3(-0.08, 0.012, 0.03),
};

export class MesaDream {
  public readonly scene = new THREE.Scene();
  public readonly camera = new THREE.PerspectiveCamera(44, 1, 0.1, 60);
  public readonly overlay: HTMLDivElement;
  public elapsedMs = 0;
  private readonly trmyte: Character;
  private readonly skanky: Character;
  private readonly lumines: THREE.CanvasTexture;
  private readonly fade: HTMLDivElement;
  private readonly guitar = new THREE.Group();
  /** Trmyte's controller, whose grips his hands hold. */
  private readonly controller: THREE.Object3D;
  private blocks: number[][] = [];
  private piece = { x: 7, y: -2, colors: [0, 1, 1, 0] };
  private sweep = 0;
  private score = 24800;
  private frameClock = 0;

  constructor(host: HTMLElement, quality: 'high' | 'low') {
    const scene = this.scene;
    scene.background = new THREE.Color(0x161e2a);
    scene.add(new THREE.HemisphereLight(0xa9bfdc, 0x514338, 1.0));
    const lamp = new THREE.PointLight(0xffc98a, 14, 9, 1.6);
    lamp.position.set(3.1, 2.1, -1.4);
    lamp.castShadow = true;
    const tvGlow = new THREE.PointLight(0x9fd0ff, 9, 6, 1.8);
    tvGlow.position.set(1.4, 1.5, -1.6);
    const moon = new THREE.DirectionalLight(0xb9cfff, 1.0);
    moon.position.set(-2, 4, -3);
    moon.castShadow = true;
    moon.shadow.mapSize.setScalar(1024);
    const ampFill = new THREE.SpotLight(0xffd9a8, 9, 6, 0.6, 0.6, 1.4);
    ampFill.position.set(1.4, 2.6, 1.6);
    ampFill.target.position.set(2.4, 0.5, -0.1);
    scene.add(lamp, tvGlow, moon, ampFill, ampFill.target);

    this.buildRoom(quality);
    this.lumines = this.buildTv();
    this.buildAmp();

    // Trmyte in the armchair with the controller, facing the TV.
    this.trmyte = createCharacter({ name: 'TRMYTE', skin: 0xe2b088, shirt: 0x2f5f8f, pants: 0x2a3f5c, overalls: 0x2a3f5c, hair: 0x5a3a20, hairStyle: 'short', headwear: 'termiteHat', beard: true });
    this.seat(this.trmyte, new THREE.Vector3(0.75, 0.05, 0.55), -2.7);
    // A pad-sized controller held in both hands over the lap; poseHands puts his hands on its grips.
    this.controller = rounded(0.19, 0.05, 0.1, standard(0x161616, 0.4), 0.025);
    this.controller.position.set(0, 1.12, 0.36);
    this.controller.rotation.x = -0.35;
    bendElbows(this.trmyte, -1.3);
    mergeCharacter(this.trmyte);
    // After the merge: merged into the body mesh, the controller left the hierarchy and his hands reached for nowhere.
    this.trmyte.body.add(this.controller);
    const armchair = new THREE.Group();
    const seatMat = standard(0x56604a, 0.9);
    const base = rounded(0.95, 0.45, 0.9, seatMat, 0.08);
    base.position.y = 0.23;
    const back = rounded(0.95, 0.85, 0.22, seatMat, 0.08);
    back.position.set(0, 0.6, 0.38);
    armchair.add(base, back);
    for (const side of [-1, 1]) {
      const arm = rounded(0.18, 0.55, 0.9, seatMat, 0.06);
      arm.position.set(side * 0.47, 0.42, 0);
      armchair.add(arm);
    }
    armchair.position.set(0.75, 0, 0.62);
    armchair.rotation.y = -2.7 + Math.PI;
    scene.add(shadowed(armchair), this.trmyte.root);

    // Long-haired Skanky on a stool with the guitar, cabled to the Mesa.
    this.skanky = createCharacter({ name: 'SKANKY', skin: 0xe8b98f, shirt: 0x8f3f34, pants: 0x34404c, hair: 0x5b3a22, hairStyle: 'long', beard: true });
    this.seat(this.skanky, new THREE.Vector3(-1.35, 0.1, -0.25), 0.75);
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.5, 14), standard(0x5b4636, 0.8));
    stool.position.set(-1.35, 0.25, -0.25);
    scene.add(shadowed(stool));
    if (quality === 'high') {
      // A round steel shop stool at the same seat height.
      const seat = new THREE.Group();
      seat.position.set(-1.35, 0, -0.25);
      void placeProp(seat, 'metal-stool', { fallback: stool, size: { y: 0.5 } });
      scene.add(seat);
    }
    this.buildGuitar();
    this.skanky.body.add(this.guitar);
    mergeCharacter(this.skanky);
    scene.add(this.skanky.root);
    for (const c of [this.trmyte, this.skanky]) {
      c.nameTag.visible = false;
      // Seated and holding something (the controller, the guitar): an imported model plays a seated idle under the figure's arms and legs.
      c.motion = { time: 0, moving: false, carrying: false, holding: true, reduced: false, pose: 'none', seated: true, stairs: false, hands: false, turn: null } satisfies CharacterMotion;
    }
    // The guitar cable runs across the rug to the amp's input.
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.05, 0.6, 0.0), new THREE.Vector3(-0.8, 0.02, 0.6), new THREE.Vector3(0.6, 0.02, 1.25),
      new THREE.Vector3(2.0, 0.02, 0.6), new THREE.Vector3(2.35, 0.55, 0.05),
    ]), 40, 0.018, 6), standard(0x111111, 0.5));
    scene.add(cable);

    this.camera.position.set(0.2, 2.45, 5.0);
    this.camera.lookAt(0.2, 1.05, -0.8);

    this.overlay = document.createElement('div');
    this.overlay.className = 'b3d-dream';
    this.overlay.innerHTML = `
      <div style="position:absolute;left:5%;top:7%;font:800 15px 'Segoe UI',Arial,sans-serif;letter-spacing:4px;color:#bccecb">MESA AT HOME</div>
      <div style="position:absolute;left:5%;top:calc(7% + 24px);font:700 10px 'Segoe UI',Arial,sans-serif;letter-spacing:2px;color:#869f9e">SKANKY’S ROOM  /  AFTER HOURS</div>
      <div style="position:absolute;left:5%;bottom:9%;font:800 22px 'Segoe UI',Arial,sans-serif;letter-spacing:3px;color:#e5d8b9">ONE MORE GAME.</div>
      <div style="position:absolute;left:5%;bottom:calc(9% - 22px);font:700 11px 'Segoe UI',Arial,sans-serif;letter-spacing:2px;color:#a99f91">THE BELT CAN WAIT A MINUTE.</div>`;
    Object.assign(this.overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none', display: 'none', zIndex: '5' });
    this.fade = document.createElement('div');
    Object.assign(this.fade.style, { position: 'absolute', inset: '0', background: '#fff6d2', opacity: '1', transition: 'none' });
    this.overlay.prepend(this.fade);
    host.append(this.overlay);
    this.resetLumines();
  }

  /** Seats a character: hips on the seat, thighs forward, shins down. */
  private seat(c: Character, at: THREE.Vector3, yaw: number): void {
    c.root.position.copy(at);
    c.root.rotation.y = yaw;
    c.body.position.y = SEAT_HEIGHT - BODY.hipY;
    c.leftLeg.rotation.x = c.rightLeg.rotation.x = -1.45;
    bendKnees(c, 1.45);
  }

  private buildRoom(quality: 'high' | 'low'): void {
    const scene = this.scene;
    // Floorboards.
    const boards = document.createElement('canvas');
    boards.width = 512; boards.height = 512;
    const b = boards.getContext('2d')!;
    for (let i = 0; i < 16; i += 1) {
      const shade = 70 + (i * 37 % 26);
      b.fillStyle = `rgb(${shade + 28},${shade + 6},${shade - 18})`;
      b.fillRect(0, i * 32, 512, 30);
      b.fillStyle = 'rgba(20,10,4,0.6)';
      b.fillRect(0, i * 32 + 30, 512, 2);
      b.fillRect((i * 173) % 512, i * 32, 2, 30);
    }
    const floorTex = new THREE.CanvasTexture(boards);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(2, 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.75 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = 0.5;
    floor.receiveShadow = true;
    const wallMat = standard(0x2a3846, 0.9);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), wallMat);
    back.position.set(0, 2, -2.5);
    back.receiveShadow = true;
    const left = new THREE.Mesh(new THREE.PlaneGeometry(7, 4), standard(0x24303c, 0.9));
    left.rotation.y = Math.PI / 2;
    left.position.set(-3.6, 2, 0.5);
    left.receiveShadow = true;
    const skirting = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.04), standard(0x1b232c, 0.7));
    skirting.position.set(0, 0.06, -2.48);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.9), standard(0x355a5e, 0.95));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0.2, 0.005, 0.75);
    rug.receiveShadow = true;
    scene.add(floor, back, left, skirting, rug);

    // Night window: moon, stars and a lit skyline, framed by purple curtains.
    const sky = document.createElement('canvas');
    sky.width = 512; sky.height = 320;
    const s = sky.getContext('2d')!;
    const gradient = s.createLinearGradient(0, 0, 0, 320);
    gradient.addColorStop(0, '#0c1830'); gradient.addColorStop(1, '#1d2d4a');
    s.fillStyle = gradient; s.fillRect(0, 0, 512, 320);
    s.fillStyle = '#b3d1db';
    for (let i = 0; i < 40; i += 1) s.fillRect((i * 97) % 512, (i * 53) % 180, 2, 2);
    s.fillStyle = '#f2e8c4';
    s.beginPath(); s.arc(380, 70, 28, 0, Math.PI * 2); s.fill();
    s.fillStyle = '#0c1830';
    s.beginPath(); s.arc(392, 62, 26, 0, Math.PI * 2); s.fill();
    for (let i = 0; i < 16; i += 1) {
      const h = 60 + (i * 41 % 110);
      s.fillStyle = '#0c1c2d';
      s.fillRect(i * 33, 320 - h, 30, h);
      s.fillStyle = '#e3ba70';
      for (let w = 0; w < 4; w += 1) if ((i + w) % 3) s.fillRect(i * 33 + 6 + (w % 2) * 12, 320 - h + 12 + Math.floor(w / 2) * 22, 6, 8);
    }
    const skyTex = new THREE.CanvasTexture(sky);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const window_ = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.25), new THREE.MeshStandardMaterial({ map: skyTex, emissive: 0xffffff, emissiveMap: skyTex, emissiveIntensity: 0.9 }));
    window_.position.set(-0.75, 2.45, -2.48);
    const frameMat = standard(0x718083, 0.6);
    const frame = new THREE.Group();
    for (const [w, h, x, y] of [[2.1, 0.08, 0, 0.66], [2.1, 0.12, 0, -0.68], [0.08, 1.35, -1.03, 0], [0.08, 1.35, 1.03, 0], [0.05, 1.25, 0, 0], [2.0, 0.04, 0, 0.1]] as const) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), frameMat);
      bar.position.set(x, y, 0);
      frame.add(bar);
    }
    frame.position.set(-0.75, 2.45, -2.45);
    scene.add(window_, frame);
    for (const side of [-1, 1]) {
      const curtain = rounded(0.42, 1.75, 0.08, standard(0x66596d, 0.95), 0.03);
      curtain.position.set(-0.75 + side * 1.2, 2.3, -2.38);
      scene.add(shadowed(curtain));
    }

    // The original three posters.
    const poster = (lines: string[], color: string, w: number, h: number, position: THREE.Vector3, rotation: THREE.Euler): void => {
      const plane = textPlane(lines, w, h, { width: 220, height: Math.round(220 * h / w), background: color, border: '#c4b69a', color: '#f1e8cf', radius: 4 });
      plane.position.copy(position);
      plane.rotation.copy(rotation);
      scene.add(plane);
    };
    poster(['BULK', 'RULES'], '#8d663e', 0.95, 1.05, new THREE.Vector3(-2.75, 2.55, -2.47), new THREE.Euler(0, 0, -0.08));
    poster(['PAYTMAN', 'SUCKS'], '#91594d', 1.1, 0.95, new THREE.Vector3(1.3, 2.75, -2.47), new THREE.Euler(0, 0, 0.05));
    poster(['NO', 'REPEATS'], '#3e6667', 0.95, 0.85, new THREE.Vector3(2.7, 2.62, -2.47), new THREE.Euler(0, 0, -0.07));

    // Desk and the BUILT THE BELT monitor.
    const desk = rounded(1.5, 0.08, 0.7, standard(0x5b4636, 0.7), 0.02);
    desk.position.set(-2.55, 0.78, -1.95);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.74, 0.6), standard(0x463528, 0.8));
    legs.position.set(-2.55, 0.37, -1.95);
    const monitor = rounded(0.8, 0.55, 0.06, standard(0x1a1c1e, 0.4), 0.02);
    monitor.position.set(-2.55, 1.2, -2.15);
    const screen = textPlane(['BUILT', 'THE BELT'], 0.72, 0.46, { width: 180, height: 116, background: '#2b5a5c', color: '#d5e6d1', radius: 2 });
    (screen.material as THREE.MeshStandardMaterial).emissive.set(0xffffff);
    (screen.material as THREE.MeshStandardMaterial).emissiveMap = (screen.material as THREE.MeshStandardMaterial).map;
    (screen.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8;
    screen.position.set(-2.55, 1.2, -2.115);
    const keyboard = rounded(0.55, 0.03, 0.18, standard(0x222428, 0.5), 0.01);
    keyboard.position.set(-2.55, 0.835, -1.75);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.12, 12), standard(0xd8d0c0, 0.5));
    mug.position.set(-2.05, 0.88, -1.9);
    scene.add(shadowed(desk), shadowed(legs), shadowed(monitor), screen, keyboard, mug);
    if (quality === 'high') {
      // A steel office desk in the same footprint, under the same monitor.
      const wooden = new THREE.Group();
      wooden.add(desk, legs);
      scene.add(wooden);
      const steel = new THREE.Group();
      steel.position.set(-2.55, 0, -1.95);
      void placeProp(steel, 'office-desk', { fallback: wooden, size: { x: 1.5, y: 0.82, z: 0.7 } });
      scene.add(steel);
    }

    // Bed against the side wall.
    const bed = new THREE.Group();
    const frameBed = rounded(1.1, 0.35, 2.0, standard(0x4a3426, 0.8), 0.05);
    frameBed.position.y = 0.2;
    const mattress = rounded(1.02, 0.2, 1.9, standard(0xd8cdb8, 0.95), 0.08);
    mattress.position.y = 0.47;
    const blanket = rounded(1.06, 0.1, 1.2, standard(0x9a5a44, 0.95), 0.05);
    blanket.position.set(0, 0.6, 0.35);
    const pillow = rounded(0.7, 0.14, 0.35, standard(0xece4d4, 0.95), 0.07);
    pillow.position.set(0, 0.62, -0.72);
    bed.add(frameBed, mattress, blanket, pillow);
    bed.position.set(-2.95, 0, 0.75);
    scene.add(shadowed(bed));

    // Lamp, a can and scattered papers.
    const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 8), standard(0x3b3b3b, 0.4, 0.6));
    lampPost.position.set(3.1, 0.85, -1.4);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 0.32, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2d8a0, emissive: 0xffc98a, emissiveIntensity: 1.6, side: THREE.DoubleSide }));
    shade.position.set(3.1, 1.85, -1.4);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.13, 12), standard(0xb03a2e, 0.3, 0.6));
    can.position.set(1.85, 0.065, 0.55);
    scene.add(shadowed(lampPost), shade, can);
    for (const [x, z, r] of [[-1.7, 1.35, 0.3], [-1.4, 1.5, -0.4]] as const) {
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.25), standard(0xd8c8a0, 0.9));
      paper.rotation.set(-Math.PI / 2, 0, r);
      paper.position.set(x, 0.007, z);
      scene.add(paper);
    }
  }

  private buildTv(): THREE.CanvasTexture {
    const scene = this.scene;
    const stand = rounded(2.4, 0.55, 0.6, standard(0x3a2c22, 0.7), 0.04);
    stand.position.set(1.2, 0.28, -2.05);
    scene.add(shadowed(stand));
    const tvBody = rounded(2.3, 1.36, 0.1, standard(0x101214, 0.3, 0.4), 0.04);
    tvBody.position.set(1.2, 1.32, -2.15);
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 288;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.18, 1.23), new THREE.MeshStandardMaterial({ map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 1.0 }));
    screen.position.set(1.2, 1.32, -2.095);
    const bravia = textPlane(['BRAVIA'], 0.22, 0.05, { width: 80, height: 18, color: '#a2abae' });
    bravia.position.set(1.2, 0.67, -2.095);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.08), standard(0x101214, 0.4));
    neck.position.set(1.2, 0.6, -2.15);
    // The PS3 and a Lumines case on the stand.
    const ps3 = rounded(0.5, 0.1, 0.4, standard(0x0d0d0f, 0.15, 0.5), 0.04);
    ps3.position.set(0.55, 0.61, -1.95);
    const ps3Label = textPlane(['PS3'], 0.16, 0.06, { width: 60, height: 22, color: '#aebdc2' });
    ps3Label.rotation.x = -Math.PI / 2;
    ps3Label.position.set(0.55, 0.662, -1.95);
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.01), new THREE.MeshStandardMaterial({ color: 0x40ff60, emissive: 0x40ff60, emissiveIntensity: 3 }));
    light.position.set(0.72, 0.61, -1.749);
    const case_ = textPlane(['PS3', 'LUMINES'], 0.17, 0.2, { width: 60, height: 72, background: '#1f3550', color: '#ffdfa3', radius: 2 });
    case_.position.set(1.95, 0.66, -1.84);
    case_.rotation.x = -0.25;
    scene.add(shadowed(tvBody), screen, bravia, neck, shadowed(ps3), ps3Label, light, case_);
    return texture;
  }

  private buildAmp(): void {
    // The stolen Mesa Boogie, now a Dual Rectifier half-stack in the corner.
    const amp = new THREE.Group();
    const cabinet = rounded(1.0, 0.8, 0.5, standard(0x1b1b1d, 0.55), 0.05);
    cabinet.position.y = 0.4;
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.5), standard(0x4b4334, 0.95));
    grille.position.set(0, 0.36, 0.252);
    const head = rounded(1.0, 0.3, 0.45, standard(0x1b1b1d, 0.5), 0.04);
    head.position.y = 0.96;
    const panel = rounded(0.9, 0.14, 0.02, standard(0xc7b278, 0.35, 0.6), 0.01);
    panel.position.set(0, 0.98, 0.23);
    const plate = textPlane(['MESA BOOGIE'], 0.5, 0.09, { width: 180, height: 32, background: '#1b1b1d', color: '#ecdfbf' });
    plate.position.set(0, 0.36, 0.256);
    const model = textPlane(['DUAL RECTIFIER'], 0.34, 0.05, { width: 160, height: 24, color: '#2b2416' });
    model.position.set(-0.2, 0.98, 0.242);
    amp.add(cabinet, grille, head, panel, plate, model);
    for (let i = 0; i < 6; i += 1) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 10), standard(0x111111, 0.4));
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0.05 + i * 0.07, 0.98, 0.25);
      amp.add(knob);
    }
    amp.position.set(2.4, 0, -0.1);
    amp.rotation.y = -0.6;
    this.scene.add(shadowed(amp));
  }

  private buildGuitar(): void {
    const sunburst = new THREE.MeshStandardMaterial({ color: 0xd07a2a, roughness: 0.3, metalness: 0.1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.07, 18), sunburst);
    body.rotation.x = Math.PI / 2;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.07, 16), sunburst);
    upper.rotation.x = Math.PI / 2;
    upper.position.set(0.18, 0.08, 0);
    const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.075, 14), standard(0xf2ead8, 0.4));
    guard.rotation.x = Math.PI / 2;
    guard.position.set(-0.04, -0.06, 0.003);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.04), standard(0x6b4a2a, 0.5));
    neck.position.set(0.55, 0.12, 0);
    neck.rotation.z = 0.2;
    const headstock = rounded(0.16, 0.08, 0.04, standard(0x2a1c10, 0.5), 0.01);
    headstock.position.set(0.95, 0.2, 0);
    headstock.rotation.z = 0.2;
    this.guitar.add(body, upper, guard, neck, headstock);
    this.guitar.position.set(-0.05, 1.1, 0.25);
    this.guitar.rotation.set(0, 0, 0.15);
    shadowed(this.guitar);
    // One hand frets the neck and the other strums over the sound hole: poseHands places them every frame.
    this.poseHands(0, true);
  }

  /**
   * Hands on the instruments, by the seated reach solver: Skanky's on the neck and over the strings
   * (a small wrist strum, and the fretting hand moving up and down the neck), Trmyte's on the
   * controller's grips with a little thumb work. The arms used to be set by fixed rotations, which
   * left Skanky reaching past the guitar with both arms out straight.
   */
  private poseHands(seconds: number, still: boolean): void {
    const strum = still ? 0 : Math.sin(seconds * 18) * 0.03;
    const slide = still ? 0 : Math.sin(seconds * 0.9) * 0.05;
    this.handsOn(this.skanky, this.guitar, HAND_POINTS.fret.clone().setX(HAND_POINTS.fret.x + slide), HAND_POINTS.strum.clone().setY(HAND_POINTS.strum.y + strum));
    const tap = still ? 0 : Math.sin(seconds * 11) * 0.006;
    this.handsOn(this.trmyte, this.controller, HAND_POINTS.gripA.clone().setY(HAND_POINTS.gripA.y + tap), HAND_POINTS.gripB.clone().setY(HAND_POINTS.gripB.y - tap));
  }

  /** Puts a character's hands on two points of a held object (in its own frame), each hand on the nearer one. */
  private handsOn(c: Character, held: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void {
    c.root.updateMatrixWorld(true);
    held.localToWorld(a); held.localToWorld(b);
    const left = c.leftArm.getWorldPosition(new THREE.Vector3()), right = c.rightArm.getWorldPosition(new THREE.Vector3());
    const straight = left.distanceTo(a) + right.distanceTo(b), crossed = left.distanceTo(b) + right.distanceTo(a);
    poseSeated(c, { hands: straight <= crossed ? { left: a, right: b } : { left: b, right: a } });
  }

  private resetLumines(): void {
    this.blocks = Array.from({ length: 10 }, (_, y) => Array.from({ length: 16 }, (_, x) => (y >= 5 + ((x * 7) % 4) ? (x + y) % 3 === 0 ? 1 : 0 : -1)));
    this.piece = { x: 7, y: -2, colors: [0, 1, 1, 0] };
    this.sweep = 0;
    this.score = 24800;
  }

  /** Lumines: falling two-colour squares, a timeline sweep and a rising score. */
  private drawLumines(dt: number): void {
    this.frameClock += dt;
    this.sweep = (this.sweep + dt * 4) % 16;
    if (this.frameClock > 0.18) {
      this.frameClock = 0;
      this.piece.y += 1;
      const landed = this.piece.y + 2 >= 10 || this.blocks[this.piece.y + 2]?.[this.piece.x] >= 0 || this.blocks[this.piece.y + 2]?.[this.piece.x + 1] >= 0;
      if (landed) {
        for (let i = 0; i < 4; i += 1) {
          const bx = this.piece.x + (i % 2);
          const by = this.piece.y + Math.floor(i / 2);
          if (by >= 0 && by < 10) this.blocks[by][bx] = this.piece.colors[i];
        }
        this.score += 160;
        this.piece = { x: 2 + Math.floor(Math.random() * 12), y: -2, colors: [0, 1, 2, 3].map(() => Math.random() < 0.5 ? 0 : 1) };
        if (this.blocks[1].some((cell) => cell >= 0)) this.resetLumines();
      }
    }
    const canvas = this.lumines.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#071322';
    ctx.fillRect(0, 0, 512, 288);
    ctx.fillStyle = '#ffe9ab';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('LUMINES', 20, 30);
    ctx.fillStyle = '#a4bfcd';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('01', 470, 30);
    ctx.fillStyle = '#c3dfdc';
    ctx.font = 'bold 13px Arial';
    ctx.fillText(String(this.score).padStart(6, '0'), 448, 120);
    ctx.fillStyle = '#658799';
    ctx.font = 'bold 10px Arial';
    ctx.fillText('HI SCORE', 448, 150);
    const cell = 24;
    const left = 50;
    const top = 44;
    ctx.fillStyle = '#0d2238';
    ctx.fillRect(left, top, 16 * cell, 10 * cell);
    const color = (value: number): string => value === 0 ? '#f0a030' : '#f2ead8';
    for (let y = 0; y < 10; y += 1) for (let x = 0; x < 16; x += 1) {
      const value = this.blocks[y][x];
      if (value < 0) continue;
      const swept = Math.floor(this.sweep) === x;
      ctx.fillStyle = swept ? '#ffffff' : color(value);
      ctx.fillRect(left + x * cell + 1, top + y * cell + 1, cell - 2, cell - 2);
    }
    for (let i = 0; i < 4; i += 1) {
      const y = this.piece.y + Math.floor(i / 2);
      if (y < 0) continue;
      ctx.fillStyle = color(this.piece.colors[i]);
      ctx.fillRect(left + (this.piece.x + (i % 2)) * cell + 1, top + y * cell + 1, cell - 2, cell - 2);
    }
    ctx.fillStyle = '#ffe9ab';
    ctx.fillRect(left + this.sweep * cell, top - 6, 3, 10 * cell + 6);
    this.lumines.needsUpdate = true;
  }

  public start(): void {
    this.elapsedMs = 0;
    this.overlay.style.display = 'block';
    this.fade.style.background = '#fff6d2';
    this.fade.style.opacity = '1';
  }

  /** Returns true once the dream has faded out. */
  public update(dt: number, reducedMotion: boolean): boolean {
    this.elapsedMs += dt * 1000;
    const t = this.elapsedMs;
    this.fade.style.background = t < DREAM_MS ? '#fff6d2' : '#120c08';
    this.fade.style.opacity = String(t < 260 ? 1 - t / 260 : t < DREAM_MS ? 0 : Math.min(1, (t - DREAM_MS) / DREAM_FADE_MS));
    this.drawLumines(dt);
    for (const c of [this.trmyte, this.skanky]) if (c.motion) { c.motion.time = t / 1000; c.motion.reduced = reducedMotion; }
    if (!reducedMotion) {
      // Strumming, controller taps and a little nodding along.
      const s = t / 1000;
      this.skanky.head.rotation.x = 0.18 + Math.sin(s * 6) * 0.06;
      this.trmyte.head.rotation.y = Math.sin(s * 0.7) * 0.1;
    }
    this.poseHands(t / 1000, reducedMotion);
    return t >= DREAM_MS + DREAM_FADE_MS;
  }

  public stop(): void {
    this.overlay.style.display = 'none';
  }

  public resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? 70 : 44;
    this.camera.updateProjectionMatrix();
  }
}
