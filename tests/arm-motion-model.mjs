import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createServer } from 'vite';

// Load the actual 3D pose functions without constructing canvas-backed art.
const server = await createServer({ cacheDir: 'node_modules/.vite-arm-motion', server:{ middlewareMode:true } });
let animateCharacter, applyPose, BODY;
try {
  ({ animateCharacter, BODY } = await server.ssrLoadModule('/src/three/characters.ts'));
  ({ applyPose } = await server.ssrLoadModule('/src/three/crew.ts'));
} finally { await server.close(); }

function figure() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const pivot = (parent,x,y) => { const joint = new THREE.Group(); joint.position.set(x,y,0); parent.add(joint); return joint; };
  const leftArm = pivot(body,-BODY.shoulderX,BODY.shoulderY), rightArm = pivot(body,BODY.shoulderX,BODY.shoulderY);
  const leftForearm = pivot(leftArm,0,-BODY.upperArm), rightForearm = pivot(rightArm,0,-BODY.upperArm);
  return { root,body,head:pivot(body,0,BODY.neckY),leftArm,rightArm,leftForearm,rightForearm,
    leftHand:pivot(leftForearm,0,-BODY.forearm),rightHand:pivot(rightForearm,0,-BODY.forearm),
    leftLeg:pivot(body,-BODY.hipX,BODY.hipY),rightLeg:pivot(body,BODY.hipX,BODY.hipY),
    leftShin:pivot(body,0,0),rightShin:pivot(body,0,0),walkPhase:0 };
}
const at = joint => joint.getWorldPosition(new THREE.Vector3());
function clearTorso(character) {
  character.root.updateMatrixWorld(true);
  const inverse = character.body.matrixWorld.clone().invert();
  const local = joint => at(joint).applyMatrix4(inverse);
  for (const side of ['left','right']) {
    const shoulder = local(character[`${side}Arm`]), elbow = local(character[`${side}Forearm`]), hand = local(character[`${side}Hand`]);
    assert.ok(side === 'left' ? elbow.x < -0.19 && hand.x < -0.19 : elbow.x > 0.19 && hand.x > 0.19, `${side} arm stays on its own side`);
    for (const [from,to] of [[shoulder,elbow],[elbow,hand]]) for (let step = 0; step <= 10; step++) {
      const point = from.clone().lerp(to,step/10);
      assert.ok(!(Math.abs(point.x)<0.16 && point.y>0.9 && point.y<1.43 && Math.abs(point.z)<0.13), 'arm segments stay outside the chest');
    }
  }
  assert.ok(at(character.leftHand).distanceTo(at(character.rightHand)) > 0.38, 'hands never meet in a clapping motion');
}

test('3D walking has a small opposite arm swing with naturally flexed elbows and no chest crossing', () => {
  const c = figure();
  for (let frame = 0; frame < 360; frame++) {
    animateCharacter(c,1/60,{ moving:true,time:frame/60 }); clearTorso(c);
    for (const side of ['left','right']) {
      assert.ok(Math.abs(c[`${side}Arm`].rotation.x) <= 0.241);
      assert.ok(c[`${side}Forearm`].rotation.x <= 0 && c[`${side}Forearm`].rotation.x > -0.33);
    }
  }
});
test('3D carrying bends at the elbow while upper arms stay beside the ribs', () => {
  const c = figure();
  for (let frame = 0; frame < 120; frame++) animateCharacter(c,1/60,{ moving:true,carrying:true,time:frame/60 });
  clearTorso(c);
  for (const side of ['left','right']) {
    const upper = at(c[`${side}Forearm`]).sub(at(c[`${side}Arm`])).normalize();
    const forearm = at(c[`${side}Hand`]).sub(at(c[`${side}Forearm`])).normalize();
    assert.ok(upper.y < -0.9, 'elbows hang below the shoulders');
    assert.ok(upper.angleTo(forearm) > 1.15 && upper.angleTo(forearm) < 1.35, 'the elbow provides the carrying bend');
    assert.ok(at(c[`${side}Hand`]).z < 0.4, 'hands do not pump far into the parcel');
  }
});
test('3D angry, cheering and speaking gestures keep both arms outside the torso and fists apart', () => {
  for (const pose of ['swear','shout','cheer','dance','announce']) for (const still of [false,true]) {
    const c = figure();
    for (let frame = 0; frame < 180; frame++) {
      animateCharacter(c,1/60,{ moving:false,time:frame/60,reducedMotion:still });
      applyPose(c,pose,frame/60,still); clearTorso(c);
    }
  }
});
