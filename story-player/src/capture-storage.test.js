import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCapture,saveCapture,getLatestCapture,exportBundle } from './capture-model.js';
import { IndexedDBSampleStore,prepareTemplates } from './upstream/motion/templates.js';
const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,v)=>values.set(key,v)};
function make(){
  const frames=Array.from({length:90},(_,i)=>{
    const k=Math.floor(i/30),joints={};
    for(const [name,p]of Object.entries({leftShoulder:[.5,0,0],rightShoulder:[-.5,0,0],leftElbow:[.6,k*.6,0],rightElbow:[-.6,k*.6,0],leftWrist:[.3+k*.5,k*.8,0],rightWrist:[-.3-k*.5,k*.8,0]}))joints[name]={position:p,confidence:1};
    return {timestampMs:i*50,tracking:'valid',joints};
  });return buildCapture(frames);
}
test('save and restore all three via the actual upstream SampleStore',async()=>{
  const capture=make();await saveCapture(capture);
  const restored=await getLatestCapture();assert.deepEqual(restored.bundle,capture.bundle);assert.equal(restored.clip.frames.length,90);
  const store=new IndexedDBSampleStore();const samples=await Promise.all(capture.bundle.samples.map(s=>store.get(s.sampleId)));
  assert.equal(prepareTemplates(capture.bundle.config,samples).length,3);
  const exported=exportBundle(capture);assert.notEqual(exported.config.runId,capture.bundle.config.runId);assert.deepEqual(exported.samples,samples);
  // Duplicate IDs are immutable; a failed confirmation preserves the old work.
  await assert.rejects(saveCapture(capture));assert.deepEqual((await getLatestCapture()).bundle,capture.bundle);
});
test('a collision on node 2 rolls back node 1 in the batch',async()=>{
  const capture=make(),store=new IndexedDBSampleStore();await store.put(capture.bundle.samples[1]);
  await assert.rejects(saveCapture(capture));assert.equal(await store.get(capture.bundle.samples[0].sampleId),undefined);assert.equal(await store.get(capture.bundle.samples[2].sampleId),undefined);
});
