import './lab.css';
import {PerformanceModule} from './module.js';
import {PoseTracker} from '../motion/pose-tracker.js';
import {IndexedDBSampleStore,prepareTemplates} from '../motion/templates.js';
import {configFixture,sampleFixtures} from '../../fixtures/m3/moon-spell.js';
const $=id=>document.getElementById(id);
const tracker=new PoseTracker($('camera')),persistentStore=new IndexedDBSampleStore();
let samples=structuredClone(sampleFixtures),config=configFixture(),manualIndex=null,loading=false,endingReturnFocus=null,pendingStart=false,startBusy=false,startRequest=0;
const sampleStore={get:async id=>structuredClone(samples.find(s=>s.sampleId===id))||await persistentStore.get(id)};
const module=new PerformanceModule({tracker,sampleStore,demoFrameProvider:()=>manualIndex===null?null:samples.find(s=>s.sampleId===config.motion.nodes[manualIndex].sampleId).frames[0]});
const events=[];
const labels={idle:'手肘自然下垂，双手靠近胸前',charging:'慢慢拉开双手',expanded:'双手向上托举',launched:'能量正在托起月亮…',complete:'月亮回到天空！'};
const gestureTips=['手肘自然下垂，双手在胸前相距约一拳','双手向两侧展开，抬到肩膀附近','从展开姿势向上托举，双手举过头顶'];
function motionFeedback(s){
  const live=s.status==='running'&&s.mode==='live',index=s.spell?.sequence??0,node=config.motion.nodes[index];
  const progress=$('motion-progress');progress.hidden=!live||!node;progress.value=0;
  let text='点击开始施法后，按顺序完成三个动作。';
  if(pendingStart)text='等待识别身体：请让双肩、手肘和双手进入画面。';
  else if(live){
    if(!node)text='三个动作已完成，能量正在托起月亮。';
    else if(s.paused)text='施法已暂停，点击「继续」后再做动作。';
    else if(s.tracking!=='valid')text=`第 ${index+1} 步：请露出双肩、手肘和双手。`;
    else if(s.spell.dwellMs>0){progress.value=Math.min(100,Math.round(s.spell.dwellMs/node.holdMs*100));text=`第 ${index+1} 步姿势已匹配，请保持 · ${progress.value}%`;}
    else text=`第 ${index+1} 步${node.label||''}：${node.sampleId===sampleFixtures[index].sampleId?gestureTips[index]:'请对照本轮动作示范调整姿势'}，保持片刻。`;
  }else if(s.status==='ready'&&tracker.connected)text='角色正在跟随你；点击「开始施法」后才会生成能量球。';
  else if(s.status==='running'&&s.mode==='demo')text='正在播放示范，完成后可以亲自试试。';
  else if(s.result?.status==='completed')text='本轮已完成，可以再来一次。';
  $('motion-feedback').textContent=text;
}
function message(text){$('message').textContent=text;}
function report(error){message(error.name==='NotAllowedError'?'摄像头权限未允许。请在浏览器与系统设置中开启后重试。':error.message);}
function controls(){
  const s=module.snapshot(),running=s.status==='running',ready=['ready','finished'].includes(s.status);
  $('demo').disabled=loading||startBusy||pendingStart||!ready;
  $('start').disabled=loading||startBusy||!ready;
  $('start').textContent=pendingStart?'取消等待':startBusy?'正在准备施法…':!tracker.connected?'连接摄像头并开始施法':'我准备好了，开始施法';
  $('pause').disabled=!running;$('cancel').disabled=!running;
  $('reset').disabled=loading||startBusy||s.status==='empty';
  $('pause').textContent=s.paused?'继续':'暂停';
  for(const id of ['color','size','import'])$(id).disabled=loading||running||startBusy||pendingStart;
  for(const button of document.querySelectorAll('[data-pose],#auto'))button.disabled=loading||startBusy||pendingStart||(running&&s.mode==='live');
  motionFeedback(s);
}
function cancelStart(){startRequest++;pendingStart=false;startBusy=false;}
async function tryStart(){
  if(!pendingStart||module.status!=='ready'||!tracker.isStable())return;
  pendingStart=false;
  try{await module.start('live');$('mode').textContent='真人施法';message('请按顺序做出三个动作，系统会等待你。');}
  catch(error){report(error);}controls();
}
async function connectCamera(){
  $('connect').textContent='取消连接';message('正在准备本地身体识别，随后请求摄像头权限。');
  await tracker.connect();
  if(tracker.connected){$('camera-empty').hidden=true;$('connect').textContent='关闭摄像头';$('mode').textContent='摄像头已连接';}
  else $('connect').textContent='连接摄像头';
}

async function load(){
  loading=true;controls();$('ending').hidden=true;config={...config,runId:crypto.randomUUID(),effect:{...config.effect,color:$('color').value,sizeScale:Number($('size').value)}};
  try{await module.load($('stage'),config);message('守护者准备好了。你可以先看示范，或连接摄像头。');}catch(error){report(error);}finally{loading=false;controls();}
}
module.subscribe(event=>{
  events.push(event);if(events.length>100)events.shift();
  if(event.type==='ready')$('stage-status').textContent='鹿角守护者 · 已就绪';
  if(event.type==='phaseChanged'){$('hint').textContent=labels[event.phase];$('stage-status').textContent=labels[event.phase];}
  if(event.type==='result'){
    if(event.result.status==='completed'){endingReturnFocus=document.activeElement;$('ending').hidden=false;$('ending-title').textContent=event.result.mode==='demo'?'示范完成':'你接住了月亮！';$('ending-detail').textContent=event.result.mode==='demo'?'现在可以连接摄像头，亲自试试。':'故事可以继续了。';$('ending-close').focus({preventScroll:true});}
    else message(event.result.status==='cancelled'?'本轮已取消，点击「再来一次」重新开始。':'本轮未完成，请检查摄像头后重试。');
  }
  controls();
});
tracker.subscribe(packet=>{
  $('tracking').textContent=packet.frame.tracking==='valid'?(packet.fullBody?'全身跟随':'上半身跟随'):packet.frame.tracking==='partial'?'请露出双手':'请进入画面';
  if(packet.error){cancelStart();report(packet.error);$('connect').textContent='连接摄像头';$('camera-empty').hidden=false;$('mode').textContent='摄像头未开启';}
  const canvas=$('overlay'),ctx=canvas.getContext('2d');canvas.width=$('camera').videoWidth||640;canvas.height=$('camera').videoHeight||480;ctx.clearRect(0,0,canvas.width,canvas.height);
  if(packet.image){ctx.strokeStyle='#a9f0db';ctx.lineWidth=3;for(const [a,b]of [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24]])if(packet.image[a]?.visibility>.5&&packet.image[b]?.visibility>.5){ctx.beginPath();ctx.moveTo(packet.image[a].x*canvas.width,packet.image[a].y*canvas.height);ctx.lineTo(packet.image[b].x*canvas.width,packet.image[b].y*canvas.height);ctx.stroke();}}
  controls();
});
$('connect').onclick=async()=>{
  if(tracker.connected||tracker.connecting){cancelStart();module.cancel();tracker.stop();$('connect').textContent='连接摄像头';$('camera-empty').hidden=false;$('mode').textContent='摄像头未开启';controls();return;}
  try{await connectCamera();if(tracker.connected)message('摄像头已连接。点击开始施法，再让双肩、手肘和手腕进入画面。');}
  catch(error){if(error.name!=='AbortError')report(error);$('connect').textContent='连接摄像头';}controls();
};
$('start').onclick=async()=>{
  if(pendingStart){cancelStart();message('已取消等待，准备好后可以重新开始。');controls();return;}
  const request=++startRequest;startBusy=true;manualIndex=null;controls();
  try{
    dismissEnding();
    if(module.status==='finished')await load();
    if(request!==startRequest||module.status!=='ready')return;
    if(!tracker.connected)await connectCamera();
    if(request!==startRequest||!tracker.connected)return;
    pendingStart=true;message('等待身体进入画面：请露出双肩、手肘和双手，稳定片刻后自动开始。');
    await tryStart();
  }catch(error){if(error.name!=='AbortError')report(error);if(!tracker.connected)$('connect').textContent='连接摄像头';}
  finally{if(request===startRequest)startBusy=false;controls();}
};
$('demo').onclick=async()=>{try{cancelStart();manualIndex=null;if(module.status==='finished')await load();await module.start('demo');$('mode').textContent='动作示范 · 非真人';}catch(error){report(error);}controls();};
$('pause').onclick=async()=>{try{if(module.paused)await module.resume();else module.pause();}catch(error){report(error);}controls();};
function dismissEnding(){
  if($('ending').hidden)return;
  $('ending').hidden=true;
  const target=endingReturnFocus?.isConnected&&!endingReturnFocus.disabled?endingReturnFocus:$('reset');
  target.focus({preventScroll:true});
}
$('ending-close').onclick=dismissEnding;
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('ending').hidden){event.preventDefault();dismissEnding();}});
$('cancel').onclick=()=>{module.cancel();controls();};
async function restart(){cancelStart();manualIndex=null;dismissEnding();await load();$('demo').focus({preventScroll:true});}
$('reset').onclick=restart;$('ending-again').onclick=restart;
$('color').onchange=load;$('size').onchange=load;
$('mirror').onchange=()=>{tracker.mirror=$('mirror').checked;tracker.recenter();for(const id of ['camera','overlay'])$(id).style.transform=$('mirror').checked?'scaleX(-1)':'none';};
$('center').onclick=()=>tracker.recenter();
for(const button of document.querySelectorAll('[data-pose]'))button.onclick=async()=>{
  if(loading)return;
  try{if(module.status==='running'&&module.mode==='live')throw new Error('请先取消真人演出，再使用分步示范。');
    manualIndex=Number(button.dataset.pose);if(module.status!=='ready'&&module.status!=='running')await load();if(module.status==='ready')await module.start('demo');$('mode').textContent='分步示范 · 非真人';
  }catch(error){report(error);}controls();
};
$('auto').onclick=()=>{manualIndex=null;};
$('import').onchange=async()=>{
  const file=$('import').files[0];if(!file)return;
  try{
    if(file.size>10*1024*1024)throw new Error('样本包超过 10 MB，请缩减后重试。');
    const bundle=JSON.parse(await file.text());prepareTemplates(bundle.config,bundle.samples);
    for(const sample of bundle.samples){const old=await persistentStore.get(sample.sampleId);if(old&&JSON.stringify(old)!==JSON.stringify(sample))throw new Error('样本 ID 已存在且内容不同，请使用新 sampleId。');if(!old)await persistentStore.put(sample);}
    config=bundle.config;samples=bundle.samples;$('color').value=config.effect.color;$('size').value=config.effect.sizeScale;
    localStorage.setItem('m3-last-config',JSON.stringify(config));$('sample-status').textContent=`已载入 ${file.name}：作品 ${config.spellRef.spellId} / 版本 ${config.spellRef.revision}。`;await load();
  }catch(error){report(error);}finally{$('import').value='';}
};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({schemaVersion:1,config,samples},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='m3-sample-bundle.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
let previousUpdate=0,uiRaf;
function update(time){if(time-previousUpdate>120){previousUpdate=time;tryStart();const s=module.snapshot();document.querySelectorAll('.step').forEach((el,i)=>{el.classList.toggle('active',s.spell?.sequence===i&&s.status==='running');el.classList.toggle('done',s.spell?.sequence>i);});$('diagnostics').textContent=JSON.stringify({runId:config.runId,mode:s.mode,status:s.status,phase:s.spell?.phase,tracking:s.tracking,distance:s.spell?.distance,holdMs:s.spell?.dwellMs,result:s.result},null,2);controls();}uiRaf=requestAnimationFrame(update);}
window.addEventListener('pagehide',()=>{cancelAnimationFrame(uiRaf);module.dispose();tracker.dispose();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelStart();module.pause();controls();}});
window.__M3_LAB__={module,tracker,snapshot:()=>module.snapshot(),events};
async function boot(){
  try{const saved=JSON.parse(localStorage.getItem('m3-last-config')||'null');if(saved){const restored=await Promise.all(saved.motion.nodes.map(n=>persistentStore.get(n.sampleId)));prepareTemplates(saved,restored);config=saved;samples=restored;$('color').value=config.effect.color;$('size').value=config.effect.sizeScale;$('sample-status').textContent='已恢复上次导入的作品与本地动作样本。';}}
  catch{message('上次的动作样本不可用，已回到开发样例。');}
  await load();uiRaf=requestAnimationFrame(update);
}
boot();
