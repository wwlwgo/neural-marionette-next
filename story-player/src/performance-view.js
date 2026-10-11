import { PoseTracker } from './upstream/motion/pose-tracker.js';
import { PerformanceModule } from './upstream/performance/module.js';
import { performanceInput } from './performance-config.js';

export function createPerformanceView(container,{bundle,invitation,onResult}){
  const {config,sampleStore}=performanceInput(bundle,invitation);
  container.innerHTML=`<header class="topbar"><span class="brand"><span class="brand-icon">✦</span><span>贾维斯的魔法舞台<small>现在，轮到你来完成故事</small></span></span><button id="back" class="nav-button">← 回到绘本</button></header>
    <section class="intro"><span class="eyebrow">第三步 · 亲自演出</span><h1>一起把月亮送回家</h1><p>照着你刚才创造的动作，依次开始、蓄力、释放。每个姿势保持半秒。</p></section>
    <section class="performance-layout"><div id="live-stage" class="live-stage"></div><aside class="performance-sidebar"><div class="camera-box"><video id="live-camera" playsinline muted></video><span id="tracking-label">正在自动连接摄像头…</span></div><p id="live-status" role="status">正在准备贾维斯与月亮…</p><div id="live-nodes" class="live-nodes"></div><button id="live-connect" class="primary" hidden disabled>重试连接摄像头</button><p class="performance-note">离开画面会暂停动作识别，回到画面可以接着完成。</p></aside></section>`;
  const el=id=>container.querySelector('#'+id),status=text=>el('live-status').textContent=text;
  let disposed=false,waiting=false,starting=false,finished=false,timer;
  const tracker=new PoseTracker(el('live-camera'));
  const module=new PerformanceModule({tracker,sampleStore});
  const cards=config.motion.nodes.map((node,i)=>{
    const card=document.createElement('div');card.className='live-node'+(i===0?' current':'');
    const canvas=document.createElement('canvas');canvas.width=140;canvas.height=120;canvas.setAttribute('aria-label',node.label+'姿势参考');
    const ctx=canvas.getContext('2d'),j=bundle.samples.find(s=>s.sampleId===node.sampleId).frames[0].joints;
    const positions=Object.fromEntries(Object.entries(j).map(([name,v])=>[name,[70-v.position[0]*24,50-v.position[1]*24]]));
    ctx.strokeStyle='#9be8ef';ctx.lineWidth=3;
    for(const [a,b]of [['leftShoulder','rightShoulder'],['leftShoulder','leftElbow'],['leftElbow','leftWrist'],['rightShoulder','rightElbow'],['rightElbow','rightWrist']]){ctx.beginPath();ctx.moveTo(...positions[a]);ctx.lineTo(...positions[b]);ctx.stroke();}
    ctx.fillStyle='#f2d298';for(const name of ['leftShoulder','rightShoulder','leftElbow','rightElbow','leftWrist','rightWrist']){ctx.beginPath();ctx.arc(...positions[name],3,0,Math.PI*2);ctx.fill();}
    const label=document.createElement('span');label.textContent=`0${i+1} · ${node.label}`;card.append(canvas,label);el('live-nodes').append(card);return card;
  });
  function deliver(result){if(disposed||finished)return;finished=true;onResult(result);}
  function dispose(){if(disposed)return;disposed=true;clearTimeout(timer);unsub();unsubTracker();module.dispose();tracker.dispose();container.replaceChildren();}
  const unsub=module.subscribe(event=>{
    if(disposed)return;
    if(event.type==='tracking'){
      el('tracking-label').textContent=event.state==='valid'?'已捕捉 · 正在匹配你的动作':'请让肩、肘、双手回到画面';
      if(event.state!=='valid'&&module.matcher.index<3)status('暂时没看清你的动作。回到画面，接着做'+config.motion.nodes[module.matcher.index].label+'。');
    }
    if(event.type==='phaseChanged'){
      const index=module.matcher.index;
      cards.forEach((card,i)=>card.className='live-node'+(i<index?' done':i===index?' current':''));
      status(event.phase==='charging'?'开始动作成功！现在做你的蓄力动作。':event.phase==='expanded'?'能量球变大了！现在做你的释放动作。':event.phase==='launched'?'大招释放！贾维斯正在把月亮送回天空…':'成功了！月亮回家了。');
    }
    if(event.type==='result'){
      waiting=false;el('live-connect').disabled=true;
      if(event.result.status==='completed')timer=setTimeout(()=>deliver(event.result),1200);
      else deliver(event.result);
    }
    if(event.type==='error' && event.code!=='TRACKING_NOT_READY')status('演出暂时中断，可以回到绘本重新开始。');
  });
  const unsubTracker=tracker.subscribe(async packet=>{
    if(disposed)return;
    if(packet.error){waiting=false;status(packet.error.message);el('live-connect').disabled=false;el('live-connect').hidden=false;return;}
    if(waiting&&module.status==='ready'&&!starting&&tracker.isStable()){
      starting=true;
      try{await module.start('live');if(disposed)return;waiting=false;status('开始演出！先做你的第一个姿势，保持半秒。');}
      catch(error){if(!disposed)status(error.message);}
      finally{starting=false;}
    }
  });
  el('back').onclick=()=>{
    // Covers loading/ready as well as a running M3; same invitation round closes.
    deliver({...invitation,schemaVersion:1,status:'cancelled',completedNodeIds:[],finishedAt:new Date().toISOString()});
  };
  async function connectCamera(){
    if(disposed||module.status!=='ready')return;
    el('live-connect').hidden=true;
    el('live-connect').disabled=true;status('正在连接摄像头，身体入镜后自动开始演出…');waiting=true;
    try{await tracker.connect();if(disposed)return;el('tracking-label').textContent='摄像头已连接';if(waiting)status('让肩膀、手肘和双手进入画面，稳定后就开始。');}
    catch(error){if(!disposed){waiting=false;status(error.name==='NotAllowedError'?'请允许摄像头权限，然后点击重试连接。':error.message);el('live-connect').disabled=false;el('live-connect').hidden=false;}}
  };
  el('live-connect').onclick=connectCamera;
  const ready=module.load(el('live-stage'),config).then(()=>{
    if(!disposed)return connectCamera();
  }).catch(error=>{if(!disposed)status('舞台加载失败：'+error.message+'。请回到绘本重新开始。');});
  return {dispose,ready};
}
