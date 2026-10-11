import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapPose} from './pose.js';
function sample(){const p=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:0}));for(const [i,x,y,z] of [[11,-.2,-.5,0],[12,.2,-.5,0],[13,-.5,-.1,-.1],[14,.5,-.1,0],[15,-.6,.2,-.2],[16,.6,.2,0]])p[i]={x,y,z,visibility:1};return p;}
test('upper body works with both hips out of frame; arm proportions stay fixed',()=>{const p=sample();const r=mapPose(p,p);assert.ok(r.complete);for(const [a,b,length] of [['ls','le',.65],['le','lw',.57],['rs','re',.65],['re','rw',.57]])assert.ok(Math.abs(Math.hypot(...r.points[a].map((v,i)=>v-r.points[b][i]))-length)<1e-9);});
test('mirror flips left/right placement without flipping vertical movement',()=>{const p=sample();const a=mapPose(p,p,{mirror:true}).points;const b=mapPose(p,p,{mirror:false}).points;assert.equal(a.lw[0],-b.lw[0]);assert.equal(a.lw[1],b.lw[1]);});
test('hidden arm is held while the visible arm updates',()=>{const p=sample();p[13].visibility=0;const r=mapPose(p,p);assert.equal(r.points.le,undefined);assert.equal(r.points.lw,undefined);assert.ok(r.points.rw);assert.equal(r.complete,false);});
test('missing shoulders rejects a pose',()=>{const p=sample();p[11].visibility=0;assert.equal(mapPose(p,p),null);assert.equal(mapPose(undefined,undefined),null);});
test('body translation follows the camera and recenters on demand',()=>{const p=sample();const first=mapPose(p,p);const moved=p.map(point=>({...point,x:point.x+.1}));const r=mapPose(moved,p,{origin:first.origin});assert.ok(r.points.neck[0]<-.29);assert.ok(Math.abs(mapPose(moved,p).points.neck[0])<1e-9);});
