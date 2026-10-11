const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const PHASES={idle:'双手在胸前聚拢',charging:'慢慢拉开双手',expanded:'双手向上托举',launched:'彩虹能量正在托起月亮',complete:'月亮回到天空！'};
export class SpellController{
  constructor(){this.reset();}
  reset(){this.phase='idle';this.dwell=0;this.radius=.18;this.hands=[0,1.9,0];this.launchAt=null;this.launchFrom=null;this.liftStartY=null;this.sequence=0;}
  update(points,dt,time,valid=true){
    dt=Math.min(dt,.1);
    if(this.phase==='launched'){if(time-this.launchAt>=4)this.phase='complete';return this.snapshot(time);}
    if(this.phase==='complete')return this.snapshot(time);
    if(!valid||!points?.lw||!points?.rw||!points.neck){this.dwell=0;return this.snapshot(time);}
    const {lw,rw,neck}=points;
    const gap=Math.hypot(...lw.map((v,i)=>v-rw[i]));
    const hands=lw.map((v,i)=>(v+rw[i])/2);this.hands=hands;
    const chest=neck[1]-.35;
    const gather=gap<.65&&Math.abs(hands[1]-chest)<.43&&Math.abs(lw[1]-rw[1])<.3;
    const spread=gap>1.35&&Math.min(lw[1],rw[1])>neck[1]-.7;
    const lift=Math.min(lw[1],rw[1])>neck[1]+.12&&hands[1]>(this.liftStartY??hands[1])+.22;
    const match=this.phase==='idle'?gather:this.phase==='charging'?spread:lift;
    this.dwell=match?this.dwell+dt:0;
    if(this.phase==='charging')this.radius+=(clamp(.18+(gap-.3)*.5,.18,.9)-this.radius)*(1-Math.exp(-dt*7));
    if(this.phase==='expanded')this.radius=Math.max(this.radius,clamp(.18+(gap-.3)*.5,.18,.9));
    if(this.dwell>.22){
      this.dwell=0;this.sequence++;
      if(this.phase==='idle')this.phase='charging';
      else if(this.phase==='charging'){this.phase='expanded';this.liftStartY=hands[1];}
      else{this.phase='launched';this.launchAt=time;this.launchFrom=[...hands];}
    }
    return this.snapshot(time);
  }
  snapshot(time){return {phase:this.phase,hint:PHASES[this.phase],radius:this.radius,hands:[...this.hands],launchFrom:this.launchFrom,flight:this.launchAt===null?0:clamp((time-this.launchAt)/3,0,1),sequence:this.sequence};}
}
