import {PerformanceStage} from './stage.js';
import {prepareTemplates,TemplateSequence,validateConfig} from '../motion/templates.js';
import {validFrame} from '../motion/pose-frame.js';
import {restPose} from '../motion/avatar-pose.js';

export function avatarFromFrame(frame){
  const pose=restPose(),j=frame.joints;
  const position=name=>{const p=j[name]?.position;return p?[-p[0]*.7,2.12+p[1]*.7,p[2]*.7]:null;};
  for(const [name,key]of Object.entries({leftShoulder:'ls',rightShoulder:'rs',leftHip:'lh',rightHip:'rh'})){const p=position(name);if(p)pose[key]=p;}
  for(const [side,label]of [['l','left'],['r','right']]) {
    for(const [from,to,a,b,length]of [[label+'Shoulder',label+'Elbow',side+'s',side+'e',.65],[label+'Elbow',label+'Wrist',side+'e',side+'w',.57]]){
      const start=position(from),end=position(to);
      if(start&&end){const delta=end.map((v,i)=>v-start[i]),norm=Math.hypot(...delta);if(norm>1e-6)pose[b]=pose[a].map((v,i)=>v+delta[i]/norm*length);}
    }
  }
  return pose;
}

export class PerformanceModule {
  constructor({tracker,sampleStore,demoFrameProvider,stageFactory=container=>new PerformanceStage(container),now=()=>performance.now(),requestFrame=cb=>requestAnimationFrame(cb),cancelFrame=id=>cancelAnimationFrame(id)}={}) {
    this.tracker=tracker;this.sampleStore=sampleStore;this.stageFactory=stageFactory;
    this.now=now;this.requestFrame=requestFrame;this.cancelFrame=cancelFrame;this.demoFrameProvider=demoFrameProvider;
    this.listeners=new Set();this.usedRuns=new Set();this.generation=0;this.disposed=false;this.status='empty';
  }
  subscribe(cb){this.listeners.add(cb);return()=>this.listeners.delete(cb);}
  emit(event){for(const cb of [...this.listeners])cb(structuredClone(event));}
  async load(container,config){
    if(this.disposed)throw new Error('组件已销毁');
    validateConfig(config);
    if(this.usedRuns.has(config.runId))throw new Error('重试或重播必须使用新 runId');
    this.cancel();this.unsub?.();this.cancelFrame(this.raf);this.stage?.dispose();this.stage=null;
    const generation=++this.generation;this.status='loading';this.config=structuredClone(config);this.container=container;
    config=this.config;
    this.matcher=null;
    this.usedRuns.add(config.runId);this.result=null;this.mode=null;this.latest=null;this.tracking=null;
    try {
      const samples=await Promise.all(config.motion.nodes.map(node=>this.sampleStore.get(node.sampleId)));
      if(generation!==this.generation)return;
      this.templates=prepareTemplates(config,samples);this.matcher=new TemplateSequence(this.templates);
      const stage=this.stageFactory(container);this.stage=stage;
      await stage.load(config.effect);
      if(generation!==this.generation){stage.dispose();return;}
      this.status='ready';this.paused=false;this.demoElapsed=0;this.demoNode=0;this.demoNodeStart=0;
      this.unsub=this.tracker?.subscribe(packet=>{
        if(generation!==this.generation)return;
        this.latest=packet;
        if(packet.error){this.emit({type:'error',runId:this.config.runId,code:'TRACKER_ERROR',recoverable:true});if(this.status==='running')this.finish('failed','TRACKER_ERROR');}
      });
      this.previous=this.now();
      const loop=time=>{
        if(generation!==this.generation)return;
        try{this.step(time);}catch(error){
          if(generation!==this.generation)return;
          this.emit({type:'error',runId:this.config.runId,code:'RENDER_FAILED',recoverable:true});
          if(this.status==='running')this.finish('failed','RENDER_FAILED');
          return;
        }
        if(generation===this.generation&&!this.disposed)this.raf=this.requestFrame(loop);
      };
      this.raf=this.requestFrame(loop);
      this.emit({type:'ready',runId:config.runId});
    }catch(error){
      if(generation!==this.generation)return;
      this.stage?.dispose();this.stage=null;this.status='error';
      this.emit({type:'error',runId:config.runId,code:'LOAD_FAILED',recoverable:true});throw error;
    }
  }
  async start(mode){
    if(this.status!=='ready')throw new Error('演出未就绪，或本轮已开始');
    if(!['live','demo'].includes(mode))throw new Error('未知演出模式');
    if(mode==='live'&&!this.tracker?.isStable(this.now())){
      this.emit({type:'error',runId:this.config.runId,code:'TRACKING_NOT_READY',recoverable:true});
      throw new Error('请先连接摄像头，让肩、肘、双手稳定进入画面。');
    }
    this.mode=mode;this.status='running';this.paused=false;this.minimumTimestamp=this.now();
    this.latest=null;this.matcher.interrupt();this.demoElapsed=0;this.demoNodeStart=0;this.demoNode=0;
  }
  pause(){if(this.status==='running'){this.paused=true;this.matcher.interrupt();}}
  async resume(){
    if(this.status!=='running'||!this.paused)return;
    if(this.mode==='live'&&!this.tracker?.isStable(this.now()))throw new Error('请回到画面，待追踪稳定后继续。');
    this.minimumTimestamp=this.now();this.latest=null;this.matcher.interrupt();this.paused=false;
  }
  cancel(){if(this.status==='running')this.finish('cancelled');}
  async reset(config){return this.load(this.container,config);}
  demoFrame(time,dt){
    const manual=this.demoFrameProvider?.();
    if(manual){const frame=structuredClone(manual);frame.timestampMs=time;return frame;}
    this.demoElapsed+=dt;
    const index=Math.min(2,this.matcher.index);
    if(index!==this.demoNode){this.demoNode=index;this.demoNodeStart=this.demoElapsed;}
    const target=this.templates[index].frames[0],from=this.templates[Math.max(0,index-1)].frames[0];
    const blend=Math.min(1,(this.demoElapsed-this.demoNodeStart)/.8),frame=structuredClone(target);
    for(const name of Object.keys(frame.joints))if(from.joints[name])frame.joints[name].position=frame.joints[name].position.map((v,i)=>from.joints[name].position[i]+(v-from.joints[name].position[i])*blend);
    frame.timestampMs=time;return frame;
  }
  step(time){
    if(!this.stage||!this.matcher||this.disposed)return;
    const generation=this.generation;
    const dt=Math.max(0,Math.min(.05,(time-this.previous)/1000));this.previous=time;
    let packet=this.latest;
    if(this.status==='running'&&this.mode==='demo'&&!this.paused){const frame=this.demoFrame(time,dt);packet={frame,points:avatarFromFrame(frame)};}
    const frame=packet?.frame;
    const fresh=frame&&frame.timestampMs>= (this.minimumTimestamp??-Infinity)&&time-frame.timestampMs>=0&&time-frame.timestampMs<250;
    const state=fresh?frame.tracking:'lost';
    if(this.status==='running'&&state!==this.tracking){this.tracking=state;this.emit({type:'tracking',runId:this.config.runId,state});}
    if(generation!==this.generation)return;
    const valid=fresh&&validFrame(frame);
    if(valid&&!this.paused&&this.matcher.phase!=='launched')this.stage.setPose(packet.points||avatarFromFrame(frame));
    if(this.status==='running'&&!this.paused){
      if(valid){const event=this.matcher.update(frame);if(event)this.emit({type:'phaseChanged',runId:this.config.runId,...event});}
      else this.matcher.interrupt();
    }
    if(generation!==this.generation)return;
    const snapshot=this.matcher.snapshot();
    if(this.result?.status==='completed')snapshot.phase='complete';
    const animate=this.status==='running'&&(!this.paused||snapshot.phase==='launched');
    const outcome=this.stage.render(animate||this.status==='ready'?dt:0,{...snapshot,tracking:valid&&!this.paused},time/1000);
    if(this.status==='running'&&snapshot.phase==='launched'&&outcome===this.config.target.expectedOutcome)this.finish('completed');
  }
  finish(status,errorCode){
    if(this.result)return;
    this.result={schemaVersion:1,runId:this.config.runId,storyId:this.config.storyId,cueId:this.config.cueId,spellRef:structuredClone(this.config.spellRef),mode:this.mode,status,completedNodeIds:[...this.matcher.completed],finishedAt:new Date().toISOString(),...(status==='completed'?{outcome:this.config.target.expectedOutcome}:{}),...(errorCode?{errorCode}:{})};
    this.status='finished';this.paused=false;
    if(status==='completed'){this.matcher.phase='complete';this.emit({type:'phaseChanged',runId:this.config.runId,phase:'complete'});}
    this.emit({type:'result',result:this.result});
  }
  snapshot(){return structuredClone({status:this.status,mode:this.mode,paused:!!this.paused,tracking:this.tracking,config:this.config,spell:this.matcher?.snapshot(),result:this.result,stage:this.stage?.snapshot?.()});}
  dispose(){
    if(this.disposed)return;
    this.cancel();this.disposed=true;this.generation++;this.cancelFrame(this.raf);this.unsub?.();this.stage?.dispose();this.stage=null;this.listeners.clear();this.status='disposed';
  }
}
