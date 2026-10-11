import { StorySession } from './session.js';

export function createBookPlayer(container, { onPerformanceRequested, spellRef } = {}) {
  let session, manifest, imageUrls, timer, auto = false, disposed = false, generation = 0;
  let listeners = new Set();
  container.innerHTML = `
    <header class="topbar"><a class="brand" href="./"><span class="brand-icon">✦</span><span>贾维斯的故事屋<small>每个动作，都有一个故事</small></span></a><div class="header-right"><span class="edition">蜡笔绘本 · 第一章</span><button class="icon-button" id="fullscreen" aria-label="全屏阅读">⛶</button></div></header>
    <section class="intro"><span class="eyebrow">今晚的魔法，等你来完成</span><h1>把月亮轻轻送回家</h1><p>和贾维斯一起，把一点点想象，变成照亮天空的力量。</p></section>
    <section class="book" aria-label="互动绘本"><div class="art"><img id="illustration" alt="" hidden><div id="loading" class="loading" role="status">✦<span>正在打开故事…</span></div><span id="page-badge" class="page-badge"></span></div><div class="caption"><span id="chapter" class="chapter"></span><p id="story-text" aria-live="polite"></p><button id="cue" class="primary" hidden>准备好了，开始施法 <span>↗</span></button><span id="ending-label" class="ending-label" hidden>✦ 示范完成 · 月亮回家了</span></div></section>
    <nav class="reader-controls" aria-label="绘本控制"><button id="previous" class="nav-button">← <span>上一页</span></button><div id="dots" class="dots" aria-label="正文页码"></div><button id="next" class="nav-button"><span>下一页</span> →</button></nav>
    <footer class="reader-footer"><span id="reader-note">慢慢看，故事会等你。</span><div><button id="auto" class="text-button" aria-pressed="false">▷ 自动翻页</button><button id="restart" class="text-button">↺ 从头阅读</button></div></footer>
    <dialog id="stage-dialog" aria-labelledby="stage-title"><button id="close-stage" class="dialog-close" aria-label="关闭演出预览">×</button><span class="eyebrow">轮到你的魔法了</span><h2 id="stage-title">一起把月亮送回家</h2><p>聚拢蓄力，拉开变大，向上释放。</p><div class="steps"><span>01<small>聚拢</small></span><span>02<small>拉开</small></span><span>03<small>上推</small></span></div><p class="prototype-note">这里将接入实时 3D 演出。当前可预览演出完成后的绘本结局。</p><button id="preview-ending" class="primary">示范：查看结局 →</button><button id="back-book" class="text-button">回到绘本，等一等</button></dialog>`;
  const el = id => container.querySelector('#' + id);
  const listen = (target, type, fn) => { target.addEventListener(type, fn); cleanup.push(() => target.removeEventListener(type, fn)); };
  const cleanup = [];
  const stopTimer = () => { clearTimeout(timer); timer = null; };
  function render() {
    if (!session || disposed) return;
    stopTimer();
    const page = session.ending ? manifest.endingPage : manifest.bodyPages[session.index];
    el('illustration').src = imageUrls.get(page.id); el('illustration').alt = page.altText;
    el('story-text').textContent = page.text;
    el('chapter').textContent = session.ending ? '故事的最后' : `第 ${['一','二','三','四','五','六','七','八','九','十'][session.index]} 页`;
    el('page-badge').textContent = session.ending ? '大结局' : `${String(session.index + 1).padStart(2,'0')} / ${String(manifest.bodyPages.length).padStart(2,'0')}`;
    el('previous').disabled = session.index === 0 || session.ending;
    el('next').disabled = session.invitation || session.ending;
    el('cue').hidden = !session.invitation;
    el('ending-label').hidden = !session.ending;
    el('reader-note').textContent = session.invitation ? '现在，故事等你来接着写。' : session.ending ? '你的小小魔法，让整个村庄亮了起来。' : '慢慢看，故事会等你。';
    el('dots').replaceChildren(...manifest.bodyPages.map((p,i) => {
      const b = document.createElement('button'); b.className = 'dot' + (i === session.index ? ' active' : '');
      b.type = 'button'; b.setAttribute('aria-label', `第 ${i+1} 页`); b.setAttribute('aria-current', i === session.index ? 'step' : 'false');
      b.disabled = session.ending; b.onclick = () => { session.index = i; render(); }; return b;
    }));
    el('auto').setAttribute('aria-pressed', String(auto));
    el('auto').textContent = auto ? 'Ⅱ 暂停自动翻页' : '▷ 自动翻页';
    if (auto && !session.invitation && !session.ending) timer = setTimeout(() => { session.next(); render(); }, page.autoAdvanceMs || 5500);
  }
  function cancelStage() {
    if (session?.run) session.accept({ ...session.run, status: 'cancelled' });
    el('stage-dialog').close(); render();
  }
  listen(el('previous'),'click',()=> {session?.previous();render();});
  listen(el('next'),'click',()=> {session?.next();render();});
  listen(el('restart'),'click',()=> {session?.restart();auto=false;render();});
  listen(el('auto'),'click',()=> {auto=!auto;render();});
  listen(el('fullscreen'),'click', async()=> {try {if(document.fullscreenElement) await document.exitFullscreen();else await container.requestFullscreen();} catch {el('reader-note').textContent='浏览器暂不支持全屏，可以继续阅读。';}});
  listen(el('cue'),'click',()=> {
    stopTimer();auto=false;render();
    const run = session.begin(onPerformanceRequested ? 'live' : 'demo');
    const event = {type:'performanceRequested',...run}; listeners.forEach(cb=>cb(event));
    if (onPerformanceRequested) onPerformanceRequested(event);
    else el('stage-dialog').showModal();
  });
  listen(el('preview-ending'),'click',()=> { const run=session.run;if(run)api.showEnding({...run,schemaVersion:1,status:'completed',outcome:manifest.performanceCue.expectedOutcome,completedNodeIds:[],finishedAt:new Date().toISOString()}); });
  listen(el('close-stage'),'click',cancelStage); listen(el('back-book'),'click',cancelStage);
  listen(el('stage-dialog'),'cancel',e=> {e.preventDefault();cancelStage();});
  listen(window,'keydown',e=> {if(container.hidden || el('stage-dialog').open || !session || ['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;if(e.key==='ArrowRight'){session.next();render();}if(e.key==='ArrowLeft'){session.previous();render();}});
  const api = {
    async load(url) {
      const token = ++generation; stopTimer(); session=null;
      el('loading').hidden=false;el('illustration').hidden=true;
      try {
        const response=await fetch(url);if(!response.ok)throw new Error('故事清单加载失败');
        const data=await response.json();
        const pages=[...data.bodyPages,data.endingPage];
        if(data.schemaVersion!==1 || data.bodyPages.length<5 || data.bodyPages.length>10 || data.performanceCue.afterPageId!==data.bodyPages.at(-1).id || new Set(pages.map(p=>p.id)).size!==pages.length)throw new Error('故事清单格式不正确');
        const urls=new Map(); const base=new URL(url,location.href);
        await Promise.all(pages.map(async p=> {const absolute=new URL(p.imageUrl,base).href;const image=new Image();image.src=absolute;await image.decode();urls.set(p.id,absolute);}));
        if(disposed || token!==generation)return;
        if(spellRef)data.spellRef=structuredClone(spellRef);
        manifest=data;imageUrls=urls;session=new StorySession(data);auto=false;
        el('loading').hidden=true;el('illustration').hidden=false;render();
      } catch(error) {if(!disposed && token===generation){el('loading').textContent=error.message+'，请刷新重试。';}}
    },
    start(){render();}, pause(){auto=false;stopTimer();},
    showInvitation(){if(session){session.index=manifest.bodyPages.length-1;render();}},
    showEnding(result){if(!session?.accept(result))return false;el('stage-dialog').close();render();if(session.ending)el('ending-label').textContent=result.mode==='demo'?'✦ 示范完成 · 月亮回家了':'✦ 你的魔法成功了 · 月亮回家了';return true;},
    subscribe(cb){listeners.add(cb);return()=>listeners.delete(cb);},
    dispose(){disposed=true;generation++;stopTimer();el('stage-dialog').close();cleanup.forEach(fn=>fn());listeners.clear();container.replaceChildren();}
  };
  return api;
}
