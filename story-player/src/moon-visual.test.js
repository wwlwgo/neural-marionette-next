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
test('moon rises only after contact, reaches the same goal, and resets the aura with the model', () => {
  const scene = new THREE.Scene(), effects = createEffects(scene);
  const idle = {phase: 'idle', radius: .2};
  effects.update(idle, 0, [0, 1.8, 0], 10);
  assert.equal(effects.snapshot().moon[1], 3.05);
  const launch = {...idle, phase: 'launched'};
  effects.update(launch, 0, [0, 1.8, 0], .01);
  assert.equal(effects.snapshot().touched, false);
  assert.equal(effects.snapshot().moon[1], 3.05);
  let result;
  for (let i = 0; i < 200; i++) result = effects.update(launch, i * .05, [0, 1.8, 0], .05);
  assert.equal(result, 'moon_restored');
  assert.equal(effects.snapshot().moon[1], 3.75);
  effects.reset();
  assert.deepEqual(effects.snapshot().moon, [1.25, 3.05, -.5]);
  assert.equal(effects.snapshot().restored, false);
  assert.equal(effects.snapshot().visual.emissiveIntensity, .45);
  effects.dispose(); disposeModel(scene);
});
