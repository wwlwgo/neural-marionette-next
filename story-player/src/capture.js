import { PoseTracker } from './upstream/motion/pose-tracker.js';
import { PerformanceStage } from './upstream/performance/stage.js';
import { avatarFromFrame } from './upstream/performance/module.js';
import { buildCapture,saveCapture,getLatestCapture,exportBundle } from './capture-model.js';
import { AutoRecorder } from './auto-recorder.js';
import { validFrame } from './upstream/motion/pose-frame.js';

export async function createCapture(container,{onContinue}={}) {
  container.innerHTML=`<header class="topbar"><a class="brand" href="./"><span class="brand-icon">✦</span><span>贾维斯的故事屋<small>先把你的魔法，教给贾维斯</small></span></a><span class="edition">录入魔法 → 阅读绘本 → 邀请演出</span></header>
  <section class="intro"><span class="eyebrow">第一步 · 创造你的动作</span><h1>你的大招，是什么样的？</h1><p>摆好开始姿势，识别后自动录制。连续做出蓄力和释放，保持最后姿势，贾维斯会自动提取。</p></section>
  <section class="capture-grid"><div class="avatar-panel"><div id="avatar-stage"></div><span class="stage-tag">贾维斯 · 鹿角机甲 V2</span></div><div class="capture-panel"><div class="camera-box"><video id="camera" playsinline muted></video><canvas id="skeleton"></canvas><span id="countdown" class="countdown" hidden></span><span id="camera-label">正在自动连接摄像头…</span></div><div class="capture-copy"><p id="capture-status" role="status">让肩膀、手肘和双手都进入画面。你可以自由设计动作。</p><progress id="capture-progress" max="10000" value="0" aria-label="录制进度"></progress><div class="capture-buttons"><button id="connect" class="primary" hidden>重试连接摄像头</button><button id="record" class="primary" disabled>重新录制</button><button id="stop" class="nav-button" hidden>完成动作</button></div></div></div></section>
  <section id="capture-review" class="capture-review" hidden><h2>贾维斯记住了这三个时刻</h2><div id="capture-nodes" class="capture-nodes"></div><div class="capture-buttons"><button id="replay" class="nav-button">▷ 回放整段动作</button><button id="save" class="primary">重试保存动作</button><button id="export" class="nav-button" disabled>导出给演出模块</button><button id="continue" class="primary" disabled>开始读绘本 →</button></div></section>
  <footer class="reader-footer"><span>只在本机保存骨骼数据，不录制视频或声音。</span><button id="skip" class="text-button">先预览绘本 →</button></footer>`;
  const el=id=>container.querySelector('#'+id),status=text=>el('capture-status').textContent=text;
  const tracker=new PoseTracker(el('camera'));
  let stage,raf,disposed=false,recording=false,armed=false,epoch,frames=[],capture=null,saved=false,replayAt=null,previous=performance.now(),timer,advanceTimer,advanceTicker,saving=false;
  const recorder=new AutoRecorder();
  let captureBefore=null;
  const effect={effectId:'energy-orb-v1',color:'#9be8ef',sizeScale:1};
  function review() {
    el('capture-review').hidden=!capture;el('replay').disabled=false;el('save').disabled=saved;el('save').hidden=saved;el('export').disabled=!saved;el('continue').disabled=!saved;
    if(!capture)return;
    el('capture-nodes').replaceChildren(...capture.clip.windows.map((w,i)=>{
      const button=document.createElement('button');button.className='capture-node';button.innerHTML=`<span>0${i+1} · ${['开始','蓄力','释放'][i]}</span><small>${(w.startMs/1000).toFixed(1)}–${(w.endMs/1000).toFixed(1)} 秒 · ${capture.bundle.samples[i].templateFrameIndices.length} 帧</small>`;
      button.onclick=()=>{cancelAdvance();replayAt=null;stage?.setPose(avatarFromFrame(capture.bundle.samples[i].frames[0]));status('正在查看这个动作。准备好后可以开始读绘本。');};return button;
    }));
  }
  function draw(packet) {
    const canvas=el('skeleton'),ctx=canvas.getContext('2d');canvas.width=640;canvas.height=480;ctx.clearRect(0,0,640,480);
    const points=packet.image;if(!points)return;
    const pairs=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
    ctx.strokeStyle='#8ef5de';ctx.lineWidth=4;
    for(const [a,b] of pairs)if(points[a]?.visibility>.55&&points[b]?.visibility>.55){ctx.beginPath();ctx.moveTo(points[a].x*640,points[a].y*480);ctx.lineTo(points[b].x*640,points[b].y*480);ctx.stroke();}
    ctx.fillStyle='#fff1b3';for(const i of new Set(pairs.flat()))if(points[i]?.visibility>.55){ctx.beginPath();ctx.arc(points[i].x*640,points[i].y*480,5,0,Math.PI*2);ctx.fill();}
  }
  const unsub=tracker.subscribe(packet=>{
    if(disposed)return;
    draw(packet);
    if(packet.error){armed=false;if(recording)finish();status(packet.error.message);clearTimeout(timer);el('countdown').hidden=true;el('connect').hidden=false;el('connect').disabled=false;return;}
    el('record').disabled=recording||armed||saving||!tracker.connected;
    el('camera-label').textContent=packet.frame.tracking==='valid'?'已捕捉 · 肩 / 肘 / 手':'请让肩膀、手肘和双手进入画面';
    if(replayAt===null && (armed||recording||!capture) && validFrame(packet.frame,.55))stage?.setPose(packet.points);
    if(armed||recording){
      const event=recorder.update(packet.frame);
      if(event?.type==='started'){
        armed=false;recording=true;epoch=recorder.epoch;capture=null;saved=false;review();
        el('stop').hidden=false;el('countdown').hidden=false;
        status('已识别开始姿势，正在录制。接着做蓄力 → 释放，最后保持半秒。');
        timer=setTimeout(finish,Math.max(0,10000-(performance.now()-epoch)));
      }
      frames=recorder.frames;
      if(event?.type==='finished')finish();
    }
  });
  function finish() {
    if(!recording)return;recording=false;clearTimeout(timer);el('stop').hidden=true;el('countdown').hidden=true;el('record').disabled=!tracker.connected;
    try {capture=buildCapture(frames,{spellId:captureBefore?.bundle.config.spellRef.spellId,revision:(captureBefore?.bundle.config.spellRef.revision??0)+1});saved=false;status('三个动作已提取，正在自动保存…');review();void confirmCapture();}
    catch(error){capture=null;saved=false;review();status(error.message);}
  }
  async function connectCamera(){
    el('connect').hidden=true;el('connect').disabled=true;
    status('正在自动连接摄像头。首次使用时，请允许浏览器的摄像头权限。');
    try{await tracker.connect();if(disposed)return;el('camera-label').textContent='摄像头已连接';arm();}
    catch(error){if(!disposed){status(error.name==='NotAllowedError'?'请允许摄像头权限，然后点击重试连接。':error.message);el('camera-label').textContent='摄像头连接失败';el('connect').hidden=false;}}
    finally{if(!disposed)el('connect').disabled=false;}
  }
  el('connect').onclick=connectCamera;
  function cancelAdvance(){clearTimeout(advanceTimer);clearInterval(advanceTicker);}
  function continueBook(){if(!capture||!saved||disposed)return;const bundle=exportBundle(capture);dispose();onContinue?.(bundle);}
  function scheduleAdvance(){
    cancelAdvance();let seconds=4;
    const update=()=>status(`三个动作已自动保存，${seconds} 秒后开始读绘本。也可以重新录制或回放。`);
    update();advanceTicker=setInterval(()=>{seconds--;if(seconds>0)update();},1000);
    advanceTimer=setTimeout(continueBook,4000);
  }
  function arm(){
    if(!tracker.connected||recording||saving)return;
    cancelAdvance();
    captureBefore=capture??captureBefore;recorder.reset();armed=true;replayAt=null;stage?.reset(effect);
    el('capture-progress').value=0;el('record').disabled=true;el('countdown').hidden=true;
    el('replay').disabled=true;el('save').disabled=true;el('continue').disabled=true;el('export').disabled=true;
    status('正在等你的开始姿势…让肩、肘、双手入镜，保持半秒就自动开始。');
  }
  el('record').onclick=arm;
  // Keep work identity across successful re-recordings; failed attempts do not change it.
  el('stop').onclick=finish;
  el('replay').onclick=()=>{cancelAdvance();if(capture){replayAt=performance.now();status('正在回放已录入的整段骨骼动作。');}};
  async function confirmCapture(){
    if(!capture||saved||saving||disposed)return;
    saving=true;el('save').disabled=true;el('record').disabled=true;el('replay').disabled=true;
    try{await saveCapture(capture);if(disposed)return;saved=true;review();scheduleAdvance();}
    catch(error){if(!disposed){status('保存失败：'+error.message+'。点击重试保存动作。');el('save').disabled=false;el('replay').disabled=false;}}
    finally{saving=false;if(!disposed)el('record').disabled=!tracker.connected;}
  }
  el('save').onclick=confirmCapture;
  el('export').onclick=()=>{
    cancelAdvance();
    status('动作已导出。准备好后可以开始读绘本。');
    const url=URL.createObjectURL(new Blob([JSON.stringify(exportBundle(capture),null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`m3-${capture.bundle.config.spellRef.spellId}-r${capture.bundle.config.spellRef.revision}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  function dispose(){disposed=true;cancelAdvance();clearTimeout(timer);cancelAnimationFrame(raf);unsub();tracker.dispose();stage?.dispose();}
  el('continue').onclick=continueBook;
  el('skip').onclick=()=>{dispose();onContinue?.(null);};
  try{stage=new PerformanceStage(el('avatar-stage'));await stage.load(effect);if(disposed)return;
    const loop=now=>{if(disposed)return;const dt=Math.min(.1,(now-previous)/1000);previous=now;
      if(recording){const t=Math.min(10000,now-epoch);el('capture-progress').value=t;el('countdown').textContent=Math.ceil((10000-t)/1000)+'s';}
      if(replayAt!==null&&capture){const t=now-replayAt;const frame=capture.clip.frames.findLast(f=>f.timestampMs<=t&&f.tracking==='valid');if(frame)stage.setPose(avatarFromFrame(frame));if(t>capture.clip.frames.at(-1).timestampMs){replayAt=null;status('回放完成。');}}
      stage.render(dt,{phase:'idle',radius:.18},now/1000);raf=requestAnimationFrame(loop);
    };raf=requestAnimationFrame(loop);
  }catch(error){if(!disposed)status('3D 预览加载失败：'+error.message);}
  try{const stored=await getLatestCapture();if(stored&&!disposed&&!armed&&!recording){capture=stored;saved=true;review();status('已恢复上次保存的三个动作。可以回放、导出，或重新录制。');}}catch(error){if(!disposed)status('读取本地动作失败：'+error.message);}
  if(!disposed)void connectCamera();
  return {dispose};
}
