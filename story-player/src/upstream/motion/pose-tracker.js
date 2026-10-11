import {normalizePose,PoseSmoother} from './pose-frame.js';
import {mapPose} from './avatar-pose.js';

// Application-owned service; M1 and M3 subscribe without owning the media stream.
export class PoseTracker {
  constructor(video) {
    this.video=video;this.listeners=new Set();this.generation=0;this.smoother=new PoseSmoother();this.latest=null;
    this.enabled=true;this.mirror=true;this.stableSince=null;
  }
  subscribe(cb){this.listeners.add(cb);return()=>this.listeners.delete(cb);}
  emit(packet){for(const cb of this.listeners)cb(packet);}
  get connected(){return !!this.stream?.getVideoTracks().some(track=>track.readyState==='live');}
  isStable(now=performance.now()){return this.connected&&this.latest?.frame.tracking==='valid'&&now-this.latest.frame.timestampMs<250&&this.stableSince!==null&&now-this.stableSince>=350;}
  setEnabled(value){this.enabled=value;this.latest=null;this.stableSince=null;this.smoother.reset();}
  recenter(){this.origin=null;}
  async connect(){
    if(this.connected)return;
    if(this.connecting)return this.connecting;
    const generation=++this.generation;
    this.connecting=this.open(generation).finally(()=>{if(generation===this.generation)this.connecting=null;});
    return this.connecting;
  }
  async open(generation){
    try {
      await new Promise((resolve,reject)=>{
        this.rejectBoot=reject;this.worker=new Worker('/pose-tracker.worker.js');
        this.bootTimer=setTimeout(()=>reject(new Error('身体识别模型加载超时，请重试。')),45000);
        this.worker.onerror=event=>{if(generation!==this.generation)return;const error=new Error(event.message||'身体识别中断');if(this.ready)this.fail(error);else reject(error);};
        this.worker.onmessage=({data})=>{
          if(generation!==this.generation)return;
          if(data.type==='ready'){clearTimeout(this.bootTimer);this.rejectBoot=null;this.ready=true;resolve();}
          else if(data.type==='error'){const error=new Error(data.message);if(this.connected)this.fail(error);else reject(error);}
          else if(data.type==='pose'){
            this.busy=false;
            if(!this.enabled||performance.now()-data.timestamp>250)return;
            const frame=this.smoother.update(normalizePose(data.image,data.world,data.timestamp));
            const mapped=mapPose(data.image,data.world,{mirror:this.mirror,origin:this.origin});
            if(mapped)this.origin=mapped.origin;
            if(frame.tracking==='valid')this.stableSince??=data.timestamp;else this.stableSince=null;
            this.latest={frame,points:mapped?.points,image:data.image,fullBody:!!mapped?.fullBody,ms:data.ms};
            this.emit(this.latest);
          }
        };
        this.worker.postMessage({type:'init'});
      });
      if(generation!==this.generation)return;
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('请通过 localhost 或 HTTPS 使用摄像头。');
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}});
      if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());return;}
      this.stream=stream;this.video.srcObject=stream;await this.video.play();
      if(generation!==this.generation)return;
      for(const track of stream.getVideoTracks())track.onended=()=>{if(generation===this.generation)this.fail(new Error('摄像头已断开，请重新连接。'));};
      this.lastDispatch=-Infinity;this.lastVideo=-1;this.busy=false;
      const loop=now=>{
        if(generation!==this.generation)return;
        if(this.latest&&now-this.latest.frame.timestampMs>=250){this.latest=null;this.stableSince=null;this.smoother.reset();this.emit({frame:{timestampMs:now,joints:{},tracking:'lost'}});}
        if(this.enabled&&this.video.readyState>=2&&!this.busy&&now-this.lastDispatch>=50&&this.video.currentTime!==this.lastVideo)this.capture(now,generation);
        this.raf=requestAnimationFrame(loop);
      };
      this.raf=requestAnimationFrame(loop);
    }catch(error){if(generation===this.generation)this.stop();throw error;}
  }
  async capture(timestamp,generation){
    this.busy=true;this.lastDispatch=timestamp;this.lastVideo=this.video.currentTime;
    try{
      const bitmap=await createImageBitmap(this.video,{resizeWidth:640,resizeHeight:Math.round(640*this.video.videoHeight/this.video.videoWidth)});
      if(generation!==this.generation){bitmap.close();return;}
      this.worker.postMessage({type:'frame',timestamp,bitmap},[bitmap]);
    }catch(error){if(generation===this.generation)this.fail(error);}
  }
  fail(error){this.stop();this.emit({error,frame:{timestampMs:performance.now(),joints:{},tracking:'lost'}});}
  stop(){
    this.generation++;clearTimeout(this.bootTimer);cancelAnimationFrame(this.raf);
    this.rejectBoot?.(new DOMException('连接已取消','AbortError'));this.rejectBoot=null;
    this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;this.video.srcObject=null;
    this.worker?.terminate();this.worker=null;this.ready=false;this.busy=false;this.latest=null;
    this.connecting=null;this.stableSince=null;this.origin=null;this.smoother.reset();
  }
  dispose(){this.stop();this.listeners.clear();}
}
