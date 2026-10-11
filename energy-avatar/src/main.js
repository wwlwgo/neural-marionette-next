import './style.css';
import {createAvatar} from './avatar.js';
import {mapPose,restPose,demoPose} from './pose.js';
import {SpellController} from './spell.js';
const spell=new SpellController();
let latestPoints=restPose(),poseValid=false,demoStart=0,lastDemoCycle=-1;
const $=id=>document.getElementById(id);
const video=$('video'),overlay=$('overlay'),ctx=overlay.getContext('2d');
let avatar;
try{avatar=createAvatar($('stage'),text=>{$('model-status').textContent=text;});}catch(error){$('message').textContent='3D 画面初始化失败，请使用支持 WebGL 的浏览器并开启硬件加速。';$('start').disabled=true;$('demo').disabled=true;throw error;}
let mode='idle',stream=null,worker=null,busy=false,ready=false,origin=null,generation=0,lastFrame=0,lastVideo=-1,lastSeen=0,bootTimer=null;
const edges=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
function state(text,active=false){$('state').textContent=text;$('state').dataset.active=active;}
function clearOverlay(){ctx.clearRect(0,0,overlay.width,overlay.height);}
function draw(image){
  overlay.width=video.videoWidth;overlay.height=video.videoHeight;clearOverlay();if(!image)return;
  ctx.lineWidth=3;ctx.strokeStyle='#bbf3ae';ctx.fillStyle='#fff';
  for(const [a,b] of edges)if(image[a]?.visibility>.45&&image[b]?.visibility>.45){ctx.beginPath();ctx.moveTo(image[a].x*overlay.width,image[a].y*overlay.height);ctx.lineTo(image[b].x*overlay.width,image[b].y*overlay.height);ctx.stroke();}
  for(const i of [11,12,13,14,15,16,23,24,25,26,27,28])if(image[i]?.visibility>.45){ctx.beginPath();ctx.arc(image[i].x*overlay.width,image[i].y*overlay.height,4,0,Math.PI*2);ctx.fill();}
}
function stop(){
  generation++;clearTimeout(bootTimer);bootTimer=null;spell.reset();poseValid=false;latestPoints=restPose();
  stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;worker?.terminate();worker=null;ready=false;busy=false;origin=null;lastSeen=0;mode='idle';
  $('start').disabled=false;$('start').innerHTML='开启摄像头 <span>↗</span>';$('demo').textContent='先看动作演示';$('camera-empty').hidden=false;$('fps').textContent='未连接';clearOverlay();state('准备好了');avatar.setPose(restPose());
}
function fail(message){stop();state('连接未完成');$('message').textContent=message;}
function initTracker(session){
  return new Promise((resolve,reject)=>{
  worker=new Worker('/tracker.js');
  bootTimer=setTimeout(()=>{if(session===generation&&!ready)reject(new Error('识别模型加载超时，请重新开启，或换用 Chrome。'));},45000);
  worker.onerror=event=>{if(session===generation){console.error(event.message);if(ready)fail('动作识别中断，请重新开启。');else reject(new Error('动作识别启动失败，请尝试 Chrome 并刷新页面。'));}};
  worker.onmessage=({data})=>{
    if(session!==generation)return;
    if(data.type==='ready'){
      clearTimeout(bootTimer);ready=true;resolve();
    }else if(data.type==='pose'){
      busy=false;draw(data.image);
      const pose=mapPose(data.image,data.world,{mirror:$('mirror').checked,origin});
      $('fps').textContent=`识别 ${Math.round(data.ms)} ms`;
      poseValid=!!pose?.complete;if(pose){origin=pose.origin;lastSeen=performance.now();latestPoints=pose.points;avatar.setPose(pose.points);state(pose.fullBody?'全身跟随':pose.complete?'上半身跟随':'部分关节被遮挡',true);$('message').textContent=pose.complete?(pose.fullBody?'全身正在同步，双手控制彩虹能量。':'上半身正在同步；后退露出腿部可开启全身跟随。'):'请露出双手；特效等待你回到画面。';}
      else{state('请进入画面');$('message').textContent='没有看清身体，请让双肩进入画面。';}
    }else if(data.type==='error'){console.error(data.message);if(ready)fail('动作识别失败，请重新开启摄像头。');else reject(new Error('识别模型初始化失败，请刷新后重试。'));}
  };
  worker.postMessage({type:'init'});
  });
}
async function start(){
  if(mode==='live'||mode==='loading'){stop();$('message').textContent='摄像头已停止。';return;}
  stop();mode='loading';const session=generation;$('start').innerHTML='取消连接 <span>×</span>';state('准备识别模型');$('message').textContent='正在准备动作识别，随后连接摄像头…';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Object.assign(new Error(),{name:'InsecureContext'});
    await initTracker(session);if(session!==generation)return;
    state('等待摄像头');$('message').textContent='请允许浏览器使用摄像头；可点击取消连接。';
    const incoming=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}});
    if(session!==generation){incoming.getTracks().forEach(track=>track.stop());return;}
    stream=incoming;video.srcObject=stream;await video.play();if(session!==generation)return;
    stream.getVideoTracks()[0].addEventListener('ended',()=>{if(session===generation)fail('摄像头已断开，请重新连接。');});
    $('camera-empty').hidden=true;mode='live';$('start').disabled=false;$('start').innerHTML='停止摄像头 <span>■</span>';$('fps').textContent='已连接';$('message').textContent='先让双手在胸前聚拢，再拉开、上推。';state('寻找身体');lastVideo=-1;
  }catch(error){
    if(session!==generation)return;
    const messages={NotAllowedError:'摄像头权限未允许。请在浏览器地址栏和 Mac 系统设置中允许摄像头，然后重试。',NotFoundError:'没有找到摄像头，请确认 Mac 前置摄像头可用。',NotReadableError:'摄像头可能被其他应用占用，请关闭占用应用后重试。',InsecureContext:'请通过 localhost 本地地址或 HTTPS 打开页面。'};
    fail(messages[error.name]||`连接失败：${error.message}`);
  }
}
$('start').onclick=start;
$('demo').onclick=()=>{const wasDemo=mode==='demo';stop();if(!wasDemo){mode='demo';demoStart=performance.now()/1000;lastDemoCycle=-1;state('自动演出');$('demo').textContent='停止演示';$('message').textContent='自动展示：聚拢 → 拉开 → 上推。开启摄像头后，由你施法。';}else $('message').textContent='点击开启摄像头，开始跟随。';};
$('reset-spell').onclick=()=>{spell.reset();if(mode==='demo'){demoStart=performance.now()/1000;lastDemoCycle=-1;}};
$('character').onchange=()=>avatar.useGuardian($('character').value==='guardian');
$('front').onclick=()=>avatar.front();$('center').onclick=()=>{origin=null;$('message').textContent='下一帧将以你现在的位置居中。';};
function mirror(){for(const el of [video,overlay])el.classList.toggle('mirrored',$('mirror').checked);origin=null;}
$('mirror').onchange=mirror;mirror();$('smooth').oninput=()=>{$('smooth-value').textContent=Number($('smooth').value)<30?'灵敏':Number($('smooth').value)>65?'柔和':'适中';};
window.addEventListener('pagehide',stop);
let previous=performance.now();
async function capture(time){
  busy=true;const session=generation;const currentWorker=worker;
  try{const bitmap=await createImageBitmap(video);if(session!==generation||!ready){bitmap.close();return;}currentWorker.postMessage({type:'frame',bitmap,time},[bitmap]);}
  catch(error){if(session===generation){console.error(error);fail('摄像头画面读取失败，请重新连接。');}}
}
function render(time){
  const dt=Math.min((time-previous)/1000,.1);previous=time;
  if(mode==='demo'){const elapsed=time/1000-demoStart,cycle=Math.floor(elapsed/12);if(cycle!==lastDemoCycle){spell.reset();lastDemoCycle=cycle;}latestPoints=demoPose(elapsed);poseValid=true;avatar.setPose(latestPoints);}
  if(mode==='live'&&ready&&!busy&&video.readyState>=2&&time-lastFrame>50&&video.currentTime!==lastVideo){lastFrame=time;lastVideo=video.currentTime;capture(time);}
  if(mode==='live'&&lastSeen&&time-lastSeen>900){avatar.setPose(restPose());lastSeen=0;clearOverlay();state('跟随暂停');}
  const valid=poseValid&&(mode==='demo'||(mode==='live'&&time-lastSeen<250));
  const effect=spell.update(latestPoints,dt,time/1000,valid);effect.tracking=valid;
  $('spell-hint').textContent=effect.hint;$('spell-phase').textContent=effect.phase==='complete'?'完成':`${Math.min(effect.sequence+1,3)} / 3`;
  document.querySelectorAll('.step').forEach((el,i)=>{el.dataset.active=i===effect.sequence;el.dataset.done=i<effect.sequence;});
  $('power').style.width=`${effect.phase==='idle'?0:Math.round(effect.radius/.9*100)}%`;
  avatar.render(dt,$('smooth').value,effect,time/1000);requestAnimationFrame(render);
}requestAnimationFrame(render);

window.__ENERGY_DEMO__={snapshot:()=>({mode,poseValid,spell:spell.snapshot(performance.now()/1000),points:avatar.getPoints()}),modelReady:avatar.modelReady};
