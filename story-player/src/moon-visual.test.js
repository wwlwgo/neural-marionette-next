import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMoonVisual, normalizeMoon} from './upstream/performance/moon.js';
import {createEffects} from './upstream/performance/effects.js';
import {disposeModel} from './upstream/model-rig.js';

function model() {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, .8), new THREE.MeshStandardMaterial());
  mesh.position.set(5, 12, -3); scene.add(mesh); return scene;
}
test('imported moon is centered and fits the existing target without changing its proportions', () => {
  const group = normalizeMoon(model());
  const bounds = new THREE.Box3().setFromObject(group);
  assert.ok(bounds.getCenter(new THREE.Vector3()).length() < 1e-6);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.y - .72) < 1e-6);
  assert.ok(Math.abs(size.x / size.y - .5) < 1e-6);
  disposeModel(group);
});
test('failed asset loading preserves a visible crescent and transparent aura', async t => {
  t.mock.method(console, 'warn', () => {});
  const visual = createMoonVisual({loader: {loadAsync: async () => { throw new Error('offline'); }}});
  assert.equal(await visual.load(), false);
  assert.equal(visual.group.children.length, 2);
  assert.equal(visual.snapshot().loaded, false);
  const aura = visual.group.getObjectByName('moon-spherical-aura');
  assert.equal(aura.material.depthWrite, false);
  assert.equal(aura.material.transparent, true);
  visual.dispose();
});
test('an asset completing after disposal is released and never attached', async () => {
  let resolve;
  const visual = createMoonVisual({loader: {loadAsync: () => new Promise(r => { resolve = r; })}});
  const pending = visual.load(); visual.dispose();
  const scene = model(); let releases = 0;
  scene.children[0].geometry.addEventListener('dispose', () => releases++);
  resolve({scene}); assert.equal(await pending, false);
  assert.equal(releases, 1); assert.equal(scene.parent, null);
});
test('repeated load shares the request and loaded textures are released once', async () => {
  const scene = model(), texture = new THREE.Texture(); scene.children[0].material.map = texture;
  let loads = 0, releases = 0; texture.addEventListener('dispose', () => releases++);
  const visual = createMoonVisual({loader: {loadAsync: async () => { loads++; return {scene}; }}});
  const first = visual.load(); assert.equal(visual.load(), first); assert.equal(await first, true);
  assert.equal(loads, 1); assert.equal(visual.snapshot().loaded, true);
  visual.dispose(); visual.dispose(); assert.equal(releases, 1);
});
test('moon follows the palms while charging, then rises independently before reporting completion', () => {
  const scene = new THREE.Scene(), effects = createEffects(scene);
  assert.equal(effects.snapshot().visible, false);
  effects.update({phase: 'charging'}, 0, [-.2, 1.7, .4], .05);
  assert.deepEqual(effects.snapshot().moon, [-.2, 1.7, .4]);
  assert.equal(effects.snapshot().visible, true);
  effects.update({phase: 'expanded'}, 1, [.1, 2.3, .5], 1);
  assert.ok(effects.snapshot().radius > .49);
  const launch = {phase: 'launched'};
  assert.equal(effects.update(launch, 2, [.1, 2.8, .5], 0), null);
  assert.deepEqual(effects.snapshot().launchOrigin, [.1, 2.8, .5]);
  let previous = 2.8;
  for (let i = 0; i < 63; i++) {
    assert.equal(effects.update(launch, 2 + i * .05, [2, .5, 0], .05), null);
    assert.ok(effects.snapshot().moon[1] >= previous);
    previous = effects.snapshot().moon[1];
  }
  assert.equal(effects.update(launch, 6, [2, .5, 0], .1), 'moon_restored');
  assert.deepEqual(effects.snapshot().moon, [.7, 4.5, -.5]);
  effects.reset();
  assert.equal(effects.snapshot().visible, false);
  assert.equal(effects.snapshot().flightProgress, 0);
  assert.equal(effects.snapshot().restored, false);
  assert.equal(effects.snapshot().visual.emissiveIntensity, .45);
  effects.update({phase: 'charging'}, 0, [.3, 1.6, .4], .05);
  assert.deepEqual(effects.snapshot().moon, [.3, 1.6, .4]);
  effects.dispose(); disposeModel(scene);
});
test('tracking loss preserves the held moon and a zero-dt frame pauses its flight', () => {
  const scene = new THREE.Scene(), effects = createEffects(scene);
  effects.update({phase: 'expanded'}, 0, [0, 2, .4], .5);
  effects.update({phase: 'expanded', tracking: false}, 1, [9, 9, 9], .5);
  assert.deepEqual(effects.snapshot().moon, [0, 2, .4]);
  effects.update({phase: 'launched', tracking: false}, 2, [9, 9, 9], 0);
  assert.deepEqual(effects.snapshot().launchOrigin, [0, 2, .4]);
  assert.equal(effects.snapshot().flightProgress, 0);
  effects.update({phase: 'launched', tracking: false}, 3, [], 1);
  assert.ok(effects.snapshot().moon[1] > 2);
  effects.dispose(); disposeModel(scene);
});
