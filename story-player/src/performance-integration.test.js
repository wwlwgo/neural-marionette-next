import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCapture } from './capture-model.js';
import { performanceInput } from './performance-config.js';
import { PerformanceModule } from './upstream/performance/module.js';
import { StorySession } from './session.js';
function work(){
  const frames=Array.from({length:90},(_,i)=>{
    const k=Math.floor(i/30),joints={};
    for(const [name,position] of Object.entries({leftShoulder:[.5,0,0],rightShoulder:[-.5,0,0],leftElbow:[.7,k*.6,0],rightElbow:[-.7,k*.6,0],leftWrist:[.3+k*.5,k*.8,0],rightWrist:[-.3-k*.5,k*.8,0]}))joints[name]={position,confidence:1};
    return {timestampMs:i*50,tracking:'valid',joints};
  });return buildCapture(frames).bundle;
}
function book(bundle){const s=new StorySession({bodyPages:[0,1,2,3,4],storyId:'moon-book-v1',spellRef:bundle.config.spellRef,performanceCue:{id:'moon-help',expectedOutcome:'moon_restored'}});s.index=4;return s;}
async function setup(){
  const bundle=work(),session=book(bundle),invitation=session.begin('live');
  const {config,sampleStore}=performanceInput(bundle,invitation);let clock=1000,listener,restored=false;const events=[];
  const tracker={isStable:()=>true,subscribe:cb=>{listener=cb;return()=>listener=null;}};
  const stage={load:async()=>{},setPose(){},render(_dt,state){return restored&&state.phase==='launched'?'moon_restored':null;},dispose(){}};
  const module=new PerformanceModule({tracker,sampleStore,stageFactory:()=>stage,now:()=>clock,requestFrame:()=>0,cancelFrame:()=>{}});
  module.subscribe(e=>{events.push(e);if(e.type==='result')session.accept(e.result);});
  await module.load({},config);await module.start('live');
  function feed(frame){clock+=50;listener({frame:{...structuredClone(frame),timestampMs:clock}});module.step(clock);}
  return {bundle,session,module,events,feed,restoreMoon(){restored=true;clock+=50;module.step(clock);}};
}
test('M1 samples drive real M3 matcher and only its success opens the ending',async()=>{
  const {bundle,session,module,events,feed,restoreMoon}=await setup();
  for(let i=0;i<2;i++){for(let n=0;n<8;n++)feed(bundle.samples[i].frames[0]);assert.equal(session.ending,false);}
  feed({tracking:'lost',joints:{}});assert.equal(session.ending,false);assert.equal(module.matcher.index,2);
  for(let n=0;n<8;n++)feed(bundle.samples[2].frames[0]);
  assert.equal(session.ending,false);assert.equal(module.matcher.phase,'launched');restoreMoon();
  assert.equal(session.ending,true);
  const result=events.find(e=>e.type==='result').result;
  assert.equal(result.mode,'live');assert.deepEqual(result.completedNodeIds,['start','charge','release']);
  assert.equal(session.accept(result),false);module.dispose();
});
test('cancel returns to the invitation and retry uses a fresh run',async()=>{
  const {bundle,session,module}=await setup();const old=module.config.runId;module.cancel();assert.equal(session.invitation,true);
  const next=session.begin('live');assert.notEqual(next.runId,old);assert.equal(performanceInput(bundle,next).config.runId,next.runId);module.dispose();
});
test('missing capture or mismatched revision cannot enter M3',()=>{
  const bundle=work(),invitation=book(bundle).begin('live');assert.throws(()=>performanceInput(null,invitation),/先录入/);
  assert.throws(()=>performanceInput(bundle,{...invitation,spellRef:{...invitation.spellRef,revision:2}}),/版本不一致/);
});
