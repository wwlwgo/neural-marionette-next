import test from 'node:test';
import assert from 'node:assert/strict';
import {PerformanceModule} from '../src/performance/module.js';
import {configFixture,fixtureStore,sampleFixtures} from '../fixtures/m3/moon-spell.js';
function harness(){
  let time=0,callback,stops=0,subscriptions=0;
  const tracker={isStable:()=>true,subscribe(cb){callback=cb;subscriptions++;return()=>{subscriptions--;};},stop(){stops++;}};
  const stages=[];
  const stageFactory=()=>{const stage={disposed:false,outcome:null,async load(){},setPose(){},render(){return this.outcome;},dispose(){this.disposed=true;}};stages.push(stage);return stage;};
  const module=new PerformanceModule({tracker,sampleStore:fixtureStore,stageFactory,now:()=>time,requestFrame:()=>1,cancelFrame(){}});
  const events=[];module.subscribe(e=>events.push(e));
  return {module,stages,events,tracker,advance(dt=50){time+=dt;module.step(time);},send(index,dt=50){time+=dt;callback({frame:{...structuredClone(sampleFixtures[index].frames[0]),timestampMs:time}});module.step(time);},get stops(){return stops;},get subscriptions(){return subscriptions;}};
}
async function loaded(){const h=harness();await h.module.load({},configFixture());return h;}

test('live requires stable tracking and real samples; three nodes alone do not complete',async()=>{
  const h=await loaded();h.tracker.isStable=()=>false;await assert.rejects(h.module.start('live'),/稳定/);
  h.tracker.isStable=()=>true;await h.module.start('live');
  for(const i of [0,1,2])for(let n=0;n<8;n++)h.send(i);
  assert.equal(h.module.snapshot().spell.phase,'launched');assert.equal(h.events.filter(e=>e.type==='result').length,0);
  h.stages[0].outcome='wrong';h.advance();assert.equal(h.module.result,null);
  h.stages[0].outcome='moon_restored';h.advance();h.advance();
  const results=h.events.filter(e=>e.type==='result');assert.equal(results.length,1);assert.equal(results[0].result.mode,'live');assert.deepEqual(results[0].result.completedNodeIds,['gather','spread','lift']);
});
test('pause clears pending dwell; resume ignores an old packet and cancel emits one result',async()=>{
  const h=await loaded();await h.module.start('live');for(let i=0;i<4;i++)h.send(0);
  h.module.pause();for(let i=0;i<12;i++)h.send(0);assert.equal(h.module.matcher.phase,'idle');
  await h.module.resume();h.advance();assert.equal(h.module.matcher.dwell,0);
  h.module.cancel();h.module.cancel();assert.equal(h.events.filter(e=>e.type==='result').length,1);assert.equal(h.module.result.status,'cancelled');
});
test('reset requires new run and releases stage/subscription without closing shared camera',async()=>{
  const h=await loaded();await h.module.start('live');
  await assert.rejects(h.module.reset(configFixture()),/runId/);
  await h.module.reset(configFixture('new-run'));
  assert.equal(h.stages[0].disposed,true);assert.equal(h.subscriptions,1);assert.equal(h.module.result,null);assert.equal(h.module.matcher.phase,'idle');
  h.module.dispose();assert.equal(h.subscriptions,0);assert.equal(h.stops,0);assert.equal(h.stages[1].disposed,true);
});
test('dispose during asynchronous sample load never creates stage or sends ready',async()=>{
  let resolve;const waiting=new Promise(r=>{resolve=r;});const h=harness();h.module.sampleStore={get:()=>waiting};
  const pending=h.module.load({},configFixture());h.module.dispose();resolve(sampleFixtures[0]);await pending;
  assert.equal(h.stages.length,0);assert.equal(h.events.length,0);
});
test('demo uses configured templates and result is explicitly demo; launch finishes while paused',async()=>{
  const h=await loaded();await h.module.start('demo');for(let i=0;i<150;i++)h.advance();
  assert.equal(h.module.matcher.phase,'launched');h.module.pause();h.stages[0].outcome='moon_restored';h.advance();
  assert.equal(h.module.result.mode,'demo');assert.equal(h.module.result.status,'completed');
});

test('late sample response from an old load cannot overwrite a newer run',async()=>{
  const h=harness();let release;
  const waiting=new Promise(resolve=>{release=resolve;});
  h.module.sampleStore={get:async id=>{await waiting;return fixtureStore.get(id);}};
  const old=h.module.load({},configFixture('old'));
  h.module.sampleStore=fixtureStore;
  await h.module.load({},configFixture('new'));
  release();await old;
  assert.equal(h.module.config.runId,'new');assert.equal(h.stages.length,1);
  assert.deepEqual(h.events.filter(e=>e.type==='ready').map(e=>e.runId),['new']);
});
test('controller may dispose immediately on a phase event without stale render callbacks',async()=>{
  const h=await loaded();await h.module.start('live');
  h.module.subscribe(event=>{if(event.type==='phaseChanged')h.module.dispose();});
  for(let i=0;i<8&&h.module.status!=='disposed';i++)h.send(0);
  assert.equal(h.module.status,'disposed');assert.equal(h.module.result.status,'cancelled');
});
