import { validFrame } from './upstream/motion/pose-frame.js';
import { features, featureDistance, prepareTemplates, IndexedDBSampleStore } from './upstream/motion/templates.js';

// M1 records once; M3 v1 consumes three stable templates, in temporal order.
export function extractWindows(frames) {
  if (!frames.length || frames.some((f,i) => !Number.isFinite(f.timestampMs) || f.timestampMs < 0 || (i && f.timestampMs <= frames[i-1].timestampMs))) throw new Error('动作时间戳无效，请重新录制。');
  const candidates = [], vectors=frames.map(f=>validFrame(f,.55)?features(f):null);
  for (let i=0;i<frames.length;i++) {
    if (!vectors[i]) continue;
    const indices=[i], first=vectors[i];
    for (let j=i+1;j<frames.length;j++) {
      if (!vectors[j] || frames[j].timestampMs-frames[j-1].timestampMs>200 || featureDistance(first,vectors[j])>.10) break;
      indices.push(j);
      if (frames[j].timestampMs-frames[i].timestampMs>=300) {
        // Verify all pairs: an averaging shortcut could conceal unstable frames.
        if(indices.every(a=>indices.every(b=>featureDistance(vectors[a],vectors[b])<=.13))) candidates.push(indices);
        break;
      }
    }
  }
  if (candidates.length<3) throw new Error('还没找到三个稳定片段。开始、蓄力、释放时，各停留半秒再继续。');
  const start=candidates[0], end=candidates.at(-1);
  const separated=(a,b)=>Math.min(...a.flatMap(i=>b.map(j=>featureDistance(vectors[i],vectors[j]))));
  if(start.at(-1)>=end[0] || separated(start,end)<.12) throw new Error('开始和结束太相似。释放后保持最终姿势半秒，再结束录制。');
  const middle=candidates.filter(c=>c[0]>start.at(-1)&&c.at(-1)<end[0]).map(indices=>({indices,score:Math.min(separated(start,indices),separated(indices,end))})).sort((a,b)=>b.score-a.score)[0];
  if(!middle || middle.score<.12) throw new Error('蓄力姿势和两端太相似。请在中间做一个明显不同的动作，并停留半秒。');
  return [start,middle.indices,end];
}

export function buildCapture(frames, {spellId=crypto.randomUUID(),revision=1,color='#9be8ef',sizeScale=1,id=()=>crypto.randomUUID()}={}) {
  const windows=extractWindows(frames);
  const labels=['开始','蓄力','释放'],semantics=['start','charge','release'],phases=['charging','expanded','launched'];
  const samples=windows.map(indices=>{
    const epoch=frames[indices[0]].timestampMs;
    return {schemaVersion:1,sampleId:id(),coordinateVersion:'body-relative-v1',featureVersion:'upper-body-v1',frames:indices.map(i=>({...structuredClone(frames[i]),timestampMs:frames[i].timestampMs-epoch})),templateFrameIndices:indices.map((_,i)=>i)};
  });
  const config={schemaVersion:1,runId:id(),storyId:'moon-book-v1',cueId:'moon-help',spellRef:{spellId,revision},avatarId:'antler-guardian-v1',motion:{coordinateVersion:'body-relative-v1',nodes:samples.map((s,i)=>({id:semantics[i],order:i+1,label:labels[i],semantic:semantics[i],targetPhase:phases[i],sampleId:s.sampleId,featureVersion:'upper-body-v1',maxDistance:.3,minConfidence:.55,holdMs:250,transition:'from-previous'}))},effect:{effectId:'energy-orb-v1',color,sizeScale},target:{id:'moon',expectedOutcome:'moon_restored'}};
  prepareTemplates(config,samples); // Use the unmodified upstream validator.
  return {bundle:{schemaVersion:1,config,samples},clip:{schemaVersion:1,clipId:id(),frames:structuredClone(frames),windows:windows.map(indices=>({startMs:frames[indices[0]].timestampMs,endMs:frames[indices.at(-1)].timestampMs})),createdAt:new Date().toISOString()}};
}

const sampleStore=new IndexedDBSampleStore();
async function clipDB() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('jarvis-capture-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('captures',{keyPath:'clipId'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
export async function saveCapture(capture) {
  prepareTemplates(capture.bundle.config,capture.bundle.samples);
  // One transaction saves all three immutable samples; a failed write saves none.
  const db=await sampleStore.open();
  try {await new Promise((resolve,reject)=>{
    const tx=db.transaction('samples','readwrite');
    capture.bundle.samples.forEach(s=>tx.objectStore('samples').add(structuredClone(s)));
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });} finally {db.close();}
  const clips=await clipDB();
  try {await new Promise((resolve,reject)=>{
    const tx=clips.transaction('captures','readwrite');tx.objectStore('captures').add(structuredClone({...capture,clipId:capture.clip.clipId}));
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });} catch(error) {
    // The clip failed before confirmation. Remove this attempt's newly created
    // samples, so retrying is possible without touching any confirmed work.
    const rollback=await sampleStore.open();
    try {await new Promise((resolve,reject)=>{const tx=rollback.transaction('samples','readwrite');capture.bundle.samples.forEach(s=>tx.objectStore('samples').delete(s.sampleId));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});} finally {rollback.close();}
    throw error;
  } finally {clips.close();}
  localStorage.setItem('jarvis-latest-capture-v1',capture.clip.clipId);
  return capture.bundle.config.spellRef;
}
export async function getLatestCapture() {
  const key=localStorage.getItem('jarvis-latest-capture-v1');if(!key)return null;
  const db=await clipDB();
  try{return await new Promise((resolve,reject)=>{const r=db.transaction('captures').objectStore('captures').get(key);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error);});}finally{db.close();}
}
export function exportBundle(capture) {
  const bundle=structuredClone(capture.bundle);bundle.config.runId=crypto.randomUUID();
  return bundle;
}
