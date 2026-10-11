import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCapture,extractWindows } from './capture-model.js';
import { prepareTemplates,TemplateSequence } from './upstream/motion/templates.js';

function frame(t,kind=0){
  const joints={};
  for(const [name,position] of Object.entries({leftShoulder:[.5,0,0],rightShoulder:[-.5,0,0],leftElbow:[.7,kind*.6-.4,0],rightElbow:[-.7,kind*.6-.4,0],leftWrist:[.3+kind*.5,kind*.8-.7,0],rightWrist:[-.3-kind*.5,kind*.8-.7,0]}))joints[name]={position,confidence:.95};
  return {timestampMs:t,tracking:'valid',joints};
}
const clip=()=>Array.from({length:120},(_,i)=>frame(i*50,Math.floor(i/40)));
test('one continuous clip produces upstream-compatible chronological templates',()=>{
  let next=0;const capture=buildCapture(clip(),{spellId:'child-spell',id:()=>`unique-${next++}`});
  const templates=prepareTemplates(capture.bundle.config,capture.bundle.samples);
  assert.equal(templates.length,3);assert.deepEqual(capture.bundle.config.motion.nodes.map(n=>n.semantic),['start','charge','release']);
  assert.equal(new Set(capture.bundle.samples.map(s=>s.sampleId)).size,3);
  assert.equal(capture.clip.frames.length,120);
  const windows=capture.clip.windows;assert.ok(windows[0].endMs<windows[1].startMs&&windows[1].endMs<windows[2].startMs);
  for(const sample of capture.bundle.samples){assert.equal(sample.frames[0].timestampMs,0);assert.ok(sample.frames.at(-1).timestampMs>=300);}
  const matcher=new TemplateSequence(templates);
  capture.clip.frames.forEach(f=>matcher.update(f));assert.equal(matcher.snapshot().phase,'launched');
});
test('identical beginning/end cannot be saved',()=>{
  const frames=clip().map((f,i)=>i>=80?frame(f.timestampMs,0):f);
  assert.throws(()=>extractWindows(frames),/开始和结束太相似/);
});
test('low-confidence charging section is not silently used',()=>{
  const frames=clip();for(let i=40;i<80;i++)frames[i].joints.leftWrist.confidence=.2;
  assert.throws(()=>extractWindows(frames),/蓄力姿势/);
});
test('discontinuous timestamps cannot create a stable window',()=>{
  const frames=[frame(0),frame(400),frame(800),frame(1200,1),frame(1600,1),frame(2000,2)];
  assert.throws(()=>extractWindows(frames),/稳定片段/);
});
test('lost tracking is preserved in the full clip but excluded from templates',()=>{
  const frames=clip();frames[36]={timestampMs:1800,tracking:'lost',joints:{}};
  const capture=buildCapture(frames);assert.equal(capture.clip.frames[36].tracking,'lost');
  assert.ok(capture.bundle.samples.every(s=>s.frames.every(f=>f.tracking==='valid')));
});
