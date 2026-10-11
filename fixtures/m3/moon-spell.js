import {demoPose} from '../../src/motion/avatar-pose.js';
export function frameFromAvatar(points,timestampMs=0){
  const mid=points.ls.map((v,i)=>(v+points.rs[i])/2),width=Math.hypot(...points.ls.map((v,i)=>v-points.rs[i]));
  const names={leftShoulder:'ls',rightShoulder:'rs',leftElbow:'le',rightElbow:'re',leftWrist:'lw',rightWrist:'rw',leftHip:'lh',rightHip:'rh'};
  const joints=Object.fromEntries(Object.entries(names).map(([name,key])=>[name,{position:points[key].map((v,i)=>(v-mid[i])/width*(i===0?-1:1)),confidence:1}]));
  return {timestampMs,joints,tracking:'valid'};
}
export const sampleFixtures=[1,4.7,6.7].map((time,i)=>({schemaVersion:1,sampleId:`dev-moon-${i+1}-v2`,coordinateVersion:'body-relative-v1',featureVersion:'upper-body-v1',frames:[0,100,200].map(t=>frameFromAvatar(demoPose(time),t)),templateFrameIndices:[0,1,2]}));
export function configFixture(runId='dev-run-1'){
  return {schemaVersion:1,runId,storyId:'moon-book-v1',cueId:'moon-help',spellRef:{spellId:'moon-spell-v1',revision:2},avatarId:'antler-guardian-v1',motion:{coordinateVersion:'body-relative-v1',nodes:['gather','spread','lift'].map((id,i)=>({id,order:i+1,label:['聚拢','展开','上推'][i],semantic:id,targetPhase:['charging','expanded','launched'][i],sampleId:sampleFixtures[i].sampleId,featureVersion:'upper-body-v1',maxDistance:.3,minConfidence:.55,holdMs:250,transition:'from-previous',...(i===2?{minUpwardDelta:.35}:{})}))},effect:{effectId:'energy-orb-v1',color:'#9be8ef',sizeScale:1},target:{id:'moon',expectedOutcome:'moon_restored'}};
}
export const fixtureStore={async get(id){return structuredClone(sampleFixtures.find(s=>s.sampleId===id));}};
