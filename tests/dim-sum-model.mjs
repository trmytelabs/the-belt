import assert from 'node:assert/strict';
import test from 'node:test';
import { GO_HOME } from '../src/game/slice/StoryScript.ts';
import { CHA_FOR_TEA, homeScene3d } from '../src/three/dimSumScript.ts';

// The 3D night's ending: Vic rides with Skanky to Cha for Tea for dim sum.

test('the shared drive home is untouched; the 3D night adds Vic and drives to Cha for Tea, keeping every approved line', () => {
  assert.equal(GO_HOME.beats[0].direction, 'Skanky drops into his own car. The sun is coming up over the lot.');
  assert.equal(GO_HOME.beats[4].direction, 'Skanky drives home.');
  const home = homeScene3d(GO_HOME);
  assert.equal(home.id, 'go-home');
  assert.match(home.beats[0].direction, /Vic climbs into the passenger seat/);
  assert.match(home.beats[4].direction, /to Cha for Tea, with Vic/);
  const lines = (scene) => scene.beats.filter((beat) => beat.line).map((beat) => `${beat.speaker}: ${beat.line}`);
  assert.deepEqual(lines(home), lines(GO_HOME), 'Termite\'s text and Skanky\'s reply stay word for word');
  assert.deepEqual(home.beats.map((beat) => beat.cue), GO_HOME.beats.map((beat) => beat.cue));
  assert.equal(homeScene3d(CHA_FOR_TEA), CHA_FOR_TEA, 'other scenes pass through');
});

test('at Cha for Tea Vic says what the owner wrote about him, and Skanky only reacts', () => {
  assert.equal(CHA_FOR_TEA.location, 'dimsum');
  const vic = CHA_FOR_TEA.beats.filter((beat) => beat.speaker === 'vic').map((beat) => beat.line).join(' ');
  for (const fact of [/millionaire/, /tons of money/i, /Jag in storage/, /Calgary/, /nights at UPS for fun/]) assert.match(vic, fact);
  assert.deepEqual(CHA_FOR_TEA.beats.filter((beat) => beat.line && beat.speaker !== 'vic'), [], 'no invented lines for anyone else');
  assert.match(CHA_FOR_TEA.beats.map((beat) => beat.direction ?? '').join(' '), /grimy work clothes/);
  for (const beat of CHA_FOR_TEA.beats) assert.ok(beat.ms >= 2000 && beat.ms <= 4000, `${beat.line ?? beat.direction} reads in time`);
  assert.ok(CHA_FOR_TEA.beats.some((beat) => beat.cue === 'more') && CHA_FOR_TEA.beats.at(-1).cue === 'leave');
});
