import {validFrame,wristHeight} from './pose-frame.js';
export const COORDINATE_VERSION='body-relative-v1';
export const FEATURE_VERSION='upper-body-v1';
const phases=['charging','expanded','launched'];
const semantics=[['start','gather'],['charge','spread'],['release','lift']];
const finite=Number.isFinite;
export function features(frame){
  if(!validFrame(frame,0))return null;
  return ['leftElbow','rightElbow','leftWrist','rightWrist'].flatMap(name=>frame.joints[name].position.map((v,i)=>v*(i===2?.55:1)));
}
export function featureDistance(a,b){return Math.sqrt(a.reduce((sum,v,i)=>sum+(v-b[i])**2,0)/a.length);}
export function validateConfig(config){
  const text=v=>typeof v==='string'&&v.length>0;
  if(config?.schemaVersion!==1||![config.runId,config.storyId,config.cueId,config.spellRef?.spellId].every(text)||!Number.isInteger(config.spellRef?.revision)||config.spellRef.revision<1)throw new Error('演出标识或作品版本无效');
  if(config.avatarId!=='antler-guardian-v1'||config.effect?.effectId!=='energy-orb-v1'||config.target?.id!=='moon'||config.target.expectedOutcome!=='moon_restored')throw new Error('不支持的角色、特效或目标');
  if(!/^#[0-9a-f]{6}$/i.test(config.effect.color)||!finite(config.effect.sizeScale)||config.effect.sizeScale<.5||config.effect.sizeScale>1.5)throw new Error('特效颜色或大小无效');
  const nodes=config.motion?.nodes;
  if(config.motion?.coordinateVersion!==COORDINATE_VERSION||!Array.isArray(nodes)||nodes.length!==3||new Set(nodes.map(n=>n.id)).size!==3)throw new Error('需要三个唯一的动作节点');
  nodes.forEach((node,i)=>{
    if(!text(node.id)||!text(node.sampleId)||node.order!==i+1||node.targetPhase!==phases[i]||!semantics[i].includes(node.semantic)||node.transition!=='from-previous'||node.featureVersion!==FEATURE_VERSION)throw new Error('动作顺序或模板版本无效');
    if(!finite(node.maxDistance)||node.maxDistance<=0||node.maxDistance>1||!finite(node.minConfidence)||node.minConfidence<.5||node.minConfidence>1||!finite(node.holdMs)||node.holdMs<100||node.holdMs>5000)throw new Error('动作阈值无效');
  });
  if(nodes[2].minUpwardDelta!==undefined&&(!finite(nodes[2].minUpwardDelta)||nodes[2].minUpwardDelta<=0))throw new Error('上推距离必须为正数');
  return config;
}
export function prepareTemplates(config,samples){
  validateConfig(config);
  const templates=config.motion.nodes.map(node=>{
    const sample=samples.find(s=>s?.sampleId===node.sampleId);
    if(!sample||sample.schemaVersion!==1||sample.coordinateVersion!==COORDINATE_VERSION||sample.featureVersion!==FEATURE_VERSION)throw new Error(`样本缺失或版本不兼容：${node.sampleId}`);
    if(!Array.isArray(sample.frames)||!sample.frames.length||sample.frames.some((f,i)=>!finite(f.timestampMs)||f.timestampMs<0||(i>0&&f.timestampMs<=sample.frames[i-1].timestampMs)))throw new Error('样本时间戳无效');
    if(!Array.isArray(sample.templateFrameIndices)||!sample.templateFrameIndices.length)throw new Error('缺少稳定模板帧');
    const frames=sample.templateFrameIndices.map(i=>Number.isInteger(i)?sample.frames[i]:null);
    if(frames.some(f=>!validFrame(f,node.minConfidence)))throw new Error('模板关键关节不完整或置信度不足');
    return {node,frames:structuredClone(frames),features:frames.map(features)};
  });
  for(let i=0;i<3;i++)for(let j=i+1;j<3;j++) {
    const separation=Math.min(...templates[i].features.flatMap(a=>templates[j].features.map(b=>featureDistance(a,b))));
    if(separation<.12)throw new Error('三个模板太相似，请重录');
  }
  const heights=templates.map(t=>t.frames.reduce((sum,f)=>sum+wristHeight(f),0)/t.frames.length);
  if(config.motion.nodes[2].minUpwardDelta!==undefined&&heights[2]-heights[1]<config.motion.nodes[2].minUpwardDelta)throw new Error('第三模板没有足够上推变化');
  return templates;
}

export class TemplateSequence {
  constructor(templates){this.templates=templates;this.reset();}
  reset(){this.index=0;this.phase='idle';this.dwell=0;this.lastTimestamp=null;this.upwardBaseline=null;this.radius=.18;this.completed=[];this.distance=null;}
  interrupt(){this.dwell=0;this.lastTimestamp=null;if(this.index===2)this.upwardBaseline=null;}
  update(frame){
    if(this.index>=3)return null;
    const current=this.templates[this.index],node=current.node;
    if(!validFrame(frame,node.minConfidence)){this.interrupt();return null;}
    if(this.lastTimestamp!==null&&frame.timestampMs<=this.lastTimestamp)return null;
    const gap=this.lastTimestamp===null?0:frame.timestampMs-this.lastTimestamp;
    if(gap>250)this.interrupt();
    const elapsed=this.lastTimestamp===null?0:frame.timestampMs-this.lastTimestamp;
    this.lastTimestamp=frame.timestampMs;
    const f=features(frame),distances=this.templates.map(t=>Math.min(...t.features.map(template=>featureDistance(f,template))));
    this.distance=distances[this.index];
    if(this.index===2)this.upwardBaseline=Math.min(this.upwardBaseline??Infinity,wristHeight(frame));
    const upward=this.index!==2||node.minUpwardDelta===undefined||wristHeight(frame)-this.upwardBaseline>=node.minUpwardDelta;
    const match=this.distance<=node.maxDistance&&this.distance<=Math.min(...distances)+1e-6&&upward;
    this.dwell=match?this.dwell+elapsed:0;
    if(this.dwell<node.holdMs)return null;
    this.completed.push(node.id);this.phase=node.targetPhase;this.index++;this.dwell=0;
    this.radius=this.index===1?.22:.65; // Effect size follows the stage meaning, not the recorded wrist gap.
    if(this.index===2)this.upwardBaseline=wristHeight(frame);
    return {phase:this.phase,nodeId:node.id};
  }
  snapshot(){return {phase:this.phase,sequence:this.index,radius:this.radius,completedNodeIds:[...this.completed],distance:this.distance,dwellMs:this.dwell};}
}

export class IndexedDBSampleStore {
  constructor(name='neural-marionette-motion-v1'){this.name=name;}
  async open(){return new Promise((resolve,reject)=>{const request=indexedDB.open(this.name,1);request.onupgradeneeded=()=>request.result.createObjectStore('samples',{keyPath:'sampleId'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
  async get(sampleId){const db=await this.open();try{return await new Promise((resolve,reject)=>{const request=db.transaction('samples').objectStore('samples').get(sampleId);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{db.close();}}
  // Immutable key: re-recording must create a fresh sampleId, preserving confirmed works.
  async put(sample){const db=await this.open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('samples','readwrite');tx.objectStore('samples').add(structuredClone(sample));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
}
