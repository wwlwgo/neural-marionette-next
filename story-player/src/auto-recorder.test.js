import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoRecorder } from './auto-recorder.js';
import { buildCapture } from './capture-model.js';
function frame(t,k=0){
  const joints={};
  for(const [name,p] of Object.entries({leftShoulder:[.5,0,0],rightShoulder:[-.5,0,0],leftElbow:[.7,k*.6,0],rightElbow:[-.7,k*.6,0],leftWrist:[.3+k*.5,k*.8,0],rightWrist:[-.3-k*.5,k*.8,0]}))joints[name]={position:p,confidence:.95};
  return {timestampMs:t,tracking:'valid',joints};
}
test('starts once after recognition and includes the starting pose',()=>{
  const r=new AutoRecorder();let started=0;
  for(let t=1000;t<=2000;t+=50)if(r.update(frame(t))?.type==='started')started++;
  assert.equal(started,1);assert.equal(r.frames[0].timestampMs,0);assert.equal(r.epoch,1000);
});
test('losing tracking during preparation cannot start recording',()=>{
  const r=new AutoRecorder();for(let t=0;t<300;t+=50)r.update(frame(t));
  r.update({timestampMs:300,tracking:'lost',joints:{}});
  assert.equal(r.update(frame(350)),null);assert.equal(r.state,'waiting');
  for(let t=400;t<=850;t+=50)r.update(frame(t));assert.equal(r.state,'recording');
});
test('three poses automatically finish and extract before returning to rest',()=>{
  const r=new AutoRecorder();let finished=0;
  for(let t=0;t<5000;t+=50){const k=t<1000?0:t<2000?1:t<3200?2:0;if(r.update(frame(t,k))?.type==='finished')finished++;}
  assert.equal(finished,1);assert.equal(r.state,'done');assert.ok(r.frames.at(-1).timestampMs<3200);
  assert.equal(buildCapture(r.frames).bundle.samples.length,3);
});
test('no third pose times out instead of fabricating a sample',()=>{
  const r=new AutoRecorder();for(let t=0;t<=10050;t+=50)r.update(frame(t));
  assert.equal(r.state,'done');assert.throws(()=>buildCapture(r.frames),/太相似/);
});
