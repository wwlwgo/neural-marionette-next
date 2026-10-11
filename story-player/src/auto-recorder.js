import { validFrame } from './upstream/motion/pose-frame.js';
import { features,featureDistance } from './upstream/motion/templates.js';
import { extractWindows } from './capture-model.js';

// Only actual pose packets advance this state machine, never rendering frames.
export class AutoRecorder {
  constructor(){this.reset();}
  reset(){this.state='waiting';this.buffer=[];this.frames=[];this.epoch=null;this.lastCheck=-Infinity;}
  update(frame){
    if(this.state==='done')return null;
    if(this.state==='waiting'){
      if(!validFrame(frame,.55)){this.buffer=[];return null;}
      if(this.buffer.length){
        const gap=frame.timestampMs-this.buffer.at(-1).timestampMs;
        if(gap<=0)return null;
        if(gap>250 || featureDistance(features(frame),features(this.buffer[0]))>.12)this.buffer=[];
      }
      this.buffer.push(structuredClone(frame));
      if(this.buffer.length<4 || frame.timestampMs-this.buffer[0].timestampMs<500)return null;
      this.state='recording';this.epoch=this.buffer[0].timestampMs;
      // Keep the recognized starting pose rather than discarding it at start.
      this.frames=this.buffer.map(f=>({...f,timestampMs:f.timestampMs-this.epoch}));
      this.buffer=[];return {type:'started'};
    }
    const t=frame.timestampMs-this.epoch;
    if(t<0 || t<=this.frames.at(-1).timestampMs)return null;
    if(t<=10000)this.frames.push({...structuredClone(frame),timestampMs:t});
    if(t>=10000){this.state='done';return {type:'finished'};}
    if(t<1800 || t-this.lastCheck<250 || !validFrame(frame,.55))return null;
    this.lastCheck=t;
    // Finish while the release is held, before the child relaxes back to start.
    try{
      const windows=extractWindows(this.frames),end=windows[2];
      const tail=this.frames.filter(f=>f.timestampMs>=t-650);
      const reference=features(this.frames[end[0]]);
      if(tail.length>=4 && t-tail[0].timestampMs>=550 && tail.every((f,i)=>validFrame(f,.55)&&(!i||f.timestampMs-tail[i-1].timestampMs<=200)&&featureDistance(reference,features(f))<=.12)){
        this.state='done';return {type:'finished'};
      }
    }catch{/* Keep recording: an incomplete gesture is not a recording error. */}
    return null;
  }
}
