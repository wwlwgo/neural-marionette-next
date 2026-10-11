// Temporary M1 substitute: three fixed upper-body templates, in shoulder-width
// coordinates. M3 receives them through the same sample store as recorded data.
const poses=[
  {elbow:[1.05,-.65,.1],wrist:[1.05,.15,.15]}, // W: bent elbows, hands beside shoulders
  {elbow:[1.3,0,.1],wrist:[2.05,0,.1]},       // T: arms extended sideways
  {elbow:[1,.7,.1],wrist:[1.45,1.35,.1]},    // Y: both arms raised
];
export const gestureTips=['双肘弯曲，双手举到肩旁，呈 W 形','双臂向两侧平举，与肩同高，呈 T 形','双臂向斜上方举高，呈 Y 形'];
function fixedFrame(index,timestampMs){
  const {elbow,wrist}=poses[index],joints={};
  for(const [side,sign] of [['left',1],['right',-1]])for(const [joint,p] of [['Shoulder',[.5,0,0]],['Elbow',elbow],['Wrist',wrist]]){
    joints[side+joint]={position:[p[0]*sign,p[1],p[2]],confidence:1};
  }
  return {timestampMs,joints,tracking:'valid'};
}
export const sampleFixtures=poses.map((_,i)=>({schemaVersion:1,sampleId:`m3-fixed-upper-body-${i+1}-v1`,coordinateVersion:'body-relative-v1',featureVersion:'upper-body-v1',frames:[0,100,200].map(t=>fixedFrame(i,t)),templateFrameIndices:[0,1,2]}));
export function configFixture(runId='dev-run-1'){
  return {schemaVersion:1,runId,storyId:'moon-book-v1',cueId:'moon-help',spellRef:{spellId:'m3-fixed-upper-body',revision:1},avatarId:'antler-guardian-v1',motion:{coordinateVersion:'body-relative-v1',nodes:['start','charge','release'].map((id,i)=>({id,order:i+1,label:['开始','蓄力','释放'][i],semantic:id,targetPhase:['charging','expanded','launched'][i],sampleId:sampleFixtures[i].sampleId,featureVersion:'upper-body-v1',maxDistance:.3,minConfidence:.55,holdMs:250,transition:'from-previous',...(i===2?{minUpwardDelta:.35}:{})}))},effect:{effectId:'energy-orb-v1',color:'#9be8ef',sizeScale:1},target:{id:'moon',expectedOutcome:'moon_restored'}};
}
export const fixtureStore={async get(id){return structuredClone(sampleFixtures.find(s=>s.sampleId===id));}};
