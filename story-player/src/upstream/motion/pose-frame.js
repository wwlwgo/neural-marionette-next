// Template coordinates are anatomical, independent of the mirrored preview.
export const JOINT_INDICES = {leftShoulder:11,rightShoulder:12,leftElbow:13,rightElbow:14,leftWrist:15,rightWrist:16,leftHip:23,rightHip:24};
export const REQUIRED_JOINTS = ['leftShoulder','rightShoulder','leftElbow','rightElbow','leftWrist','rightWrist'];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const scale=(v,n)=>v.map(x=>x*n);
const unit=v=>scale(v,1/Math.hypot(...v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const valid=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
export function normalizePose(image,world,timestampMs,minConfidence=.5) {
  const empty={timestampMs,joints:{},tracking:'lost'};
  if(!Array.isArray(world)||!Array.isArray(image))return empty;
  const confidence=i=>Math.min(world[i]?.visibility??0,image[i]?.visibility??0,image[i]?.presence??1);
  if(![11,12].every(i=>valid(world[i])&&confidence(i)>=minConfidence))return empty;
  const a=[world[11].x,world[11].y,world[11].z],b=[world[12].x,world[12].y,world[12].z];
  const across=sub(a,b),width=Math.hypot(...across);
  if(width<.08||width>1.2)return empty;
  const x=unit(across),vertical=sub([0,-1,0],scale(x,dot([0,-1,0],x)));
  if(Math.hypot(...vertical)<.2)return empty;
  const y=unit(vertical),z=cross(x,y),center=a.map((v,i)=>(v+b[i])/2),joints={};
  for(const [name,i]of Object.entries(JOINT_INDICES))if(valid(world[i])) {
    const d=sub([world[i].x,world[i].y,world[i].z],center);
    joints[name]={position:[dot(d,x)/width,dot(d,y)/width,dot(d,z)/width],confidence:confidence(i)};
  }
  return {timestampMs,joints,tracking:REQUIRED_JOINTS.every(name=>joints[name]?.confidence>=minConfidence)?'valid':'partial'};
}
export function validFrame(frame,minConfidence=.5) {
  return frame?.tracking==='valid'&&Number.isFinite(frame.timestampMs)&&REQUIRED_JOINTS.every(name=>{
    const joint=frame.joints?.[name];return joint?.confidence>=minConfidence&&joint.position?.length===3&&joint.position.every(Number.isFinite);
  });
}
export function wristHeight(frame){return (frame.joints.leftWrist.position[1]+frame.joints.rightWrist.position[1])/2;}
export function wristGap(frame){return Math.hypot(...sub(frame.joints.leftWrist.position,frame.joints.rightWrist.position));}

export class PoseSmoother {
  reset(){this.previous=null;}
  update(frame) {
    if(!validFrame(frame)){this.reset();return frame;}
    const previous=this.previous,dt=previous?frame.timestampMs-previous.timestampMs:Infinity;
    const result=structuredClone(frame);
    if(previous&&dt>0&&dt<250){const alpha=1-Math.exp(-dt/55);for(const [name,joint]of Object.entries(result.joints))if(previous.joints[name]?.confidence>=.5)joint.position=joint.position.map((v,i)=>previous.joints[name].position[i]+alpha*(v-previous.joints[name].position[i]));}
    this.previous=result;return result;
  }
}
