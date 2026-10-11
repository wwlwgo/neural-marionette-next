import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createEffects} from '../src/performance/effects.js';

test('M3 launch leaves hands; moon only rises after actual contact and completes after lifting', () => {
  const effects = createEffects(new THREE.Scene());
  effects.configure({color:'#ff0000',sizeScale:1.5});
  effects.update({phase:'charging',radius:.3},0,[0,1.5,0],.016);
  assert.ok(Math.abs(effects.snapshot().radius-.45)<1e-9);
  const initialMoon = effects.snapshot().moon;
  effects.update({phase:'launched'},0,[0,1.5,0],0);
  assert.equal(effects.snapshot().touched,false);
  assert.deepEqual(effects.snapshot().moon,initialMoon);
  let result;
  for(let i=0;i<300;i++) {
    result = effects.update({phase:'launched'},i/60,[90,90,90],1/60);
    const s=effects.snapshot();
    if(!s.touched) assert.deepEqual(s.moon,initialMoon);
    if(result) break;
  }
  assert.equal(result,'moon_restored');
  assert.ok(effects.snapshot().moon[1]>initialMoon[1]+.69);
  effects.reset();
  assert.equal(effects.snapshot().restored,false);
  assert.deepEqual(effects.snapshot().moon,initialMoon);
});

test('M3 tracking loss holds the unreleased ball in place',()=>{
  const effects=createEffects(new THREE.Scene());
  effects.update({phase:'charging'},0,[1,2,3],.016);
  effects.update({phase:'charging',tracking:false},1,[5,6,7],.016);
  assert.deepEqual(effects.snapshot().ball,[1,2,3]);
});
