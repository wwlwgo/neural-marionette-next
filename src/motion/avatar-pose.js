export const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function restPose(){return {waist:[0,1.12,0],neck:[0,2.27,0],head:[0,2.55,0],ls:[-.35,2.12,0],rs:[.35,2.12,0],le:[-.58,1.51,0],re:[.58,1.51,0],lw:[-.62,.94,0],rw:[.62,.94,0],lh:[-.18,1.12,0],rh:[.18,1.12,0],lk:[-.18,.57,0],rk:[.18,.57,0],la:[-.18,.05,0],ra:[.18,.05,0]};}
const visible=p=>p&&[p.x,p.y,p.z??0].every(Number.isFinite)&&(p.visibility??1)>.45;
export function mapPose(image,world,{mirror=true,origin=null}={}){
  if(!image||!world||![11,12].every(i=>visible(image[i])&&visible(world[i])))return null;
  const convert=p=>[(mirror?-1:1)*p.x,-p.y,-(p.z??0)*.8];
  const left=convert(world[11]),right=convert(world[12]);
  const across=unit(sub(right,left));
  const midpoint=[(image[11].x+image[12].x)/2,(image[11].y+image[12].y)/2];
  const base=origin||midpoint;
  const center=[clamp((midpoint[0]-base[0])*(mirror?-1:1)*3,-.6,.6),2.12+clamp((base[1]-midpoint[1])*2,-.3,.3),0];
  const hips=[23,24].every(i=>visible(image[i])&&visible(world[i]));
  const hipAcross=hips?unit(sub(convert(world[24]),convert(world[23]))):[Math.sign(across[0]||1),0,0];
  const up=hips?unit(sub(mul(add(left,right),.5),mul(add(convert(world[23]),convert(world[24])),.5))):unit([-across[1]*Math.sign(across[0]||1),Math.abs(across[0]),0]);
  const waist=add(center,mul(up,-1));
  const result={waist,ls:add(center,mul(across,-.35)),rs:add(center,mul(across,.35)),neck:add(center,mul(up,.15)),head:add(center,mul(up,.43)),lh:add(waist,mul(hipAcross,-.18)),rh:add(waist,mul(hipAcross,.18))};
  for(const [s,e,w,name] of [[11,13,15,'l'],[12,14,16,'r']]){
    if(visible(image[e])&&visible(world[e])){
      result[name+'e']=add(result[name+'s'],mul(unit(sub(convert(world[e]),convert(world[s]))),.65));
      if(visible(image[w])&&visible(world[w]))result[name+'w']=add(result[name+'e'],mul(unit(sub(convert(world[w]),convert(world[e]))),.57));
    }
  }
  const fullBody=hips&&[25,26,27,28].every(i=>visible(image[i])&&visible(world[i]));
  for(const [hip,knee,ankle,name] of [[23,25,27,'l'],[24,26,28,'r']]){
    if(fullBody){
      result[name+'k']=add(result[name+'h'],mul(unit(sub(convert(world[knee]),convert(world[hip]))),.55));
      result[name+'a']=add(result[name+'k'],mul(unit(sub(convert(world[ankle]),convert(world[knee]))),.52));
    }else{
      result[name+'k']=add(result[name+'h'],[0,-.55,0]);
      result[name+'a']=add(result[name+'k'],[0,-.52,0]);
    }
  }
  // Plant the lowest ankle: squats and lifted knees retain the avatar's proportions.
  const lift=.05-Math.min(result.la[1],result.ra[1]);
  for(const p of Object.values(result))p[1]+=lift;
  return {points:result,origin:base,complete:!!(result.lw&&result.rw),fullBody};
}
function reach(p,side,wrist){
  const s=p[side+'s'],d=sub(wrist,s),length=clamp(Math.hypot(...d),.081,1.219),u=unit(d);
  const along=(.65*.65-.57*.57+length*length)/(2*length);
  const height=Math.sqrt(Math.max(0,.65*.65-along*along));
  // Choose the lower, outward elbow solution throughout the gesture. Project
  // onto the arm's bend plane so both limb lengths remain unchanged.
  const preferred=[side==='l'?-.35:.35,-1,0];
  const projection=preferred.reduce((sum,v,i)=>sum+v*u[i],0);
  const bend=unit(sub(preferred,mul(u,projection)));
  p[side+'e']=add(add(s,mul(u,along)),mul(bend,height));
  p[side+'w']=add(s,mul(u,length));
}
export function demoPose(t){
  const p=restPose(),cycle=t%12;
  const spread=clamp((cycle-2)/2.5,0,1),rise=clamp((cycle-5)/1.2,0,1);
  const x=(.16+spread*1.1)*(1-rise)+.38*rise;
  const y=1.93+spread*.15+rise*.93;
  reach(p,'l',[-x,y,.25]);reach(p,'r',[x,y,.25]);
  return p;
}
