import test from 'node:test';
import assert from 'node:assert/strict';
import { StorySession } from './session.js';
const manifest={bodyPages:Array.from({length:5},(_,i)=>({id:String(i)})),storyId:'book',spellRef:{spellId:'spell',revision:1},performanceCue:{id:'cue',expectedOutcome:'moon_restored'}};
function invitation(){const s=new StorySession(manifest);for(let i=0;i<8;i++)s.next();return s;}
test('正文翻页必须停在邀请，不能直接打开结局',()=>{const s=invitation();assert.equal(s.index,4);assert.equal(s.ending,false);});
test('本轮成功打开结局，重复结果忽略',()=>{const s=invitation();const run=s.begin('live');const result={...run,status:'completed',outcome:'moon_restored'};assert.equal(s.accept(result),true);assert.equal(s.ending,true);assert.equal(s.accept(result),false);});
test('旧轮次、旧版本和错误作用结果不能打开结局',()=>{const s=invitation();const old=s.begin('live');const run=s.begin('live');assert.equal(s.accept({...old,status:'completed',outcome:'moon_restored'}),false);assert.equal(s.accept({...run,spellRef:{spellId:'spell',revision:2},status:'completed',outcome:'moon_restored'}),false);assert.equal(s.accept({...run,status:'completed',outcome:'other'}),false);assert.equal(s.ending,false);});
test('取消保留邀请，重试获得新 runId',()=>{const s=invitation();const old=s.begin('demo');assert.equal(s.accept({...old,status:'cancelled'}),true);assert.equal(s.invitation,true);assert.notEqual(s.begin('demo').runId,old.runId);});
