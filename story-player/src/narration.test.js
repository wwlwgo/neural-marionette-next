import test from 'node:test';
import assert from 'node:assert/strict';
import {StoryNarrator} from './narration.js';
function setup(){
  const spoken=[],states=[];let cancelled=0;
  class Utterance{constructor(text){this.text=text;}}
  const synth={getVoices:()=>[{lang:'en-US',name:'English'},{lang:'zh-CN',name:'中文',localService:true}],speak:u=>spoken.push(u),cancel:()=>cancelled++,pause(){},resume(){}};
  const narrator=new StoryNarrator({synth,Utterance,onState:s=>states.push(s)});
  return {narrator,spoken,states,get cancelled(){return cancelled;}};
}
test('advancement callback waits for actual narration end',()=>{
  const h=setup();let ended=0;h.narrator.read('月亮，回家了。',()=>ended++);
  const u=h.spoken[0];assert.equal(u.lang,'zh-CN');assert.equal(u.voice.name,'中文');assert.equal(ended,0);
  u.onstart();assert.equal(ended,0);u.onend();u.onend();assert.equal(ended,1);
});
test('an old page ending cannot advance the current page',()=>{
  const h=setup();let old=0,current=0;h.narrator.read('旧页',()=>old++);const lateEnd=h.spoken[0].onend;
  h.narrator.read('新页',()=>current++);lateEnd();assert.equal(old,0);assert.equal(current,0);assert.equal(h.cancelled,1);
  h.spoken[1].onend();assert.equal(current,1);
});
test('pause/resume retains the current utterance; dispose blocks late ends',()=>{
  const h=setup();let ended=0;h.narrator.read('正在讲故事',()=>ended++);const lateEnd=h.spoken[0].onend;
  h.narrator.pause();assert.equal(h.narrator.state,'paused');h.narrator.resume();assert.equal(h.spoken.length,1);
  h.narrator.dispose();lateEnd();assert.equal(ended,0);
});
test('denied audio never advances the story',()=>{
  const h=setup();let ended=0;h.narrator.read('故事',()=>ended++);h.spoken[0].onerror({error:'not-allowed'});
  h.spoken[0].onend();assert.equal(h.narrator.state,'blocked');assert.equal(ended,0);
});

function recordedSetup(){
  const h=setup(),clips=[];
  class Audio{
    constructor(url){this.src=url;this.currentTime=0;this.plays=0;clips.push(this);}
    play(){this.plays++;return Promise.resolve();}
    pause(){this.paused=true;}
    removeAttribute(){this.src='';}
    load(){}
  }
  h.narrator.Audio=Audio;return {...h,clips};
}
test('generated audio advances only on ended, and old clips cannot advance new pages',()=>{
  const h=recordedSetup();let old=0,current=0;
  h.narrator.read('一',()=>old++,{audioUrl:'/one.wav'});const first=h.clips[0],lateEnd=first.onended;
  first.onplaying();assert.equal(old,0);assert.equal(h.spoken.length,0);
  h.narrator.read('二',()=>current++,{audioUrl:'/two.wav'});lateEnd();assert.equal(old,0);assert.equal(current,0);
  h.clips[1].onended();h.clips[1].onended();assert.equal(current,1);
});
test('recorded narration pause/resume preserves playback position',()=>{
  const h=recordedSetup();h.narrator.read('故事',()=>{},{audioUrl:'/story.wav'});
  h.clips[0].currentTime=3;h.narrator.pause();assert.equal(h.narrator.state,'paused');
  h.narrator.resume();assert.equal(h.clips[0].currentTime,3);assert.equal(h.clips[0].plays,2);assert.equal(h.clips.length,1);
});
test('a missing generated file falls back to speech and still waits for speech end',()=>{
  const h=recordedSetup();let ended=0;h.narrator.read('故事',()=>ended++,{audioUrl:'/missing.wav'});
  const lateEnd=h.clips[0].onended;h.clips[0].onerror();lateEnd();assert.equal(ended,0);
  assert.equal(h.spoken.length,1);h.spoken[0].onend();assert.equal(ended,1);
});
test('autoplay rejection holds the page until the user starts playback',async()=>{
  const h=recordedSetup();h.narrator.Audio.prototype.play=function(){return Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));};
  let ended=0;h.narrator.read('故事',()=>ended++,{audioUrl:'/story.wav'});
  await Promise.resolve();await Promise.resolve();assert.equal(h.narrator.state,'blocked');assert.equal(ended,0);assert.equal(h.spoken.length,0);
});
