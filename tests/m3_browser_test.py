"""Real GLB + real Worker blank-frame smoke + synthetic camera routing, never a real camera."""
import json, os, pathlib, sys, tempfile
from playwright.sync_api import sync_playwright
BASE=os.environ.get('NM_TEST_URL','http://127.0.0.1:5180').rstrip('/')
OUT=pathlib.Path(tempfile.gettempdir())/'neural-marionette-m3-tests'
OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=os.environ.get('NM_TEST_CHROME'),args=(['--use-angle=metal'] if sys.platform=='darwin' else [])+['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    page=browser.new_page(viewport={'width':1440,'height':1120})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/m3.html');page.wait_for_load_state('networkidle')
    page.wait_for_function("__M3_LAB__.snapshot().status==='ready'")
    assert page.evaluate('__M3_LAB__.snapshot().stage.modelLoaded')
    assert not page.evaluate('__M3_LAB__.tracker.connected')
    page.screenshot(path=str(OUT/'m3-ready.png'),full_page=True)
    # Sequential controls use templates; trying lift first cannot launch.
    page.locator('summary').click()
    page.locator('[data-pose="2"]').click()
    page.wait_for_timeout(600)
    assert page.evaluate('__M3_LAB__.snapshot().spell.phase')=='idle'
    for index,phase in [(0,'charging'),(1,'expanded'),(2,'launched')]:
        page.locator('[data-pose="%s"]'%index).click()
        page.wait_for_function('phase=>__M3_LAB__.snapshot().spell.phase===phase',arg=phase)
        page.screenshot(path=str(OUT/('m3-'+phase+'.png')),full_page=True)
    page.wait_for_function("__M3_LAB__.snapshot().result?.status==='completed'")
    assert page.evaluate('__M3_LAB__.snapshot().stage.effects.touched')
    assert page.evaluate('__M3_LAB__.snapshot().result.mode')=='demo'
    page.locator('summary').click()
    page.screenshot(path=str(OUT/'m3-completed.png'),full_page=True)
    # Three rounds: new run id, exactly one terminal result, reset scene and flags.
    run_ids=[page.evaluate('__M3_LAB__.snapshot().config.runId')]
    for _ in range(2):
        page.locator('#reset').click();page.wait_for_function("__M3_LAB__.snapshot().status==='ready'")
        run_ids.append(page.evaluate('__M3_LAB__.snapshot().config.runId'))
        assert not page.evaluate('__M3_LAB__.snapshot().stage.effects.restored')
        assert page.locator('#stage canvas').count()==1
        page.locator('#demo').click()
        page.wait_for_function("__M3_LAB__.snapshot().result?.status==='completed'",timeout=20000)
    assert len(set(run_ids))==3
    assert page.evaluate("__M3_LAB__.events.filter(e=>e.type==='result').length")==3
    # Pause and cancel before release.
    page.locator('#reset').click();page.wait_for_function("__M3_LAB__.snapshot().status==='ready'")
    page.locator('#demo').click();page.locator('#pause').click()
    phase=page.evaluate('__M3_LAB__.snapshot().spell.phase')
    page.wait_for_timeout(500)
    assert page.evaluate('__M3_LAB__.snapshot().spell.phase')==phase
    page.locator('#pause').click();page.locator('#cancel').click()
    assert page.evaluate('__M3_LAB__.snapshot().result.status')=='cancelled'
    # Persist external M1-compatible bundle; reload resolves immutable sample references.
    bundle=page.evaluate("async()=>{const f=await import('/fixtures/m3/moon-spell.js');const config=f.configFixture('import');config.effect.color='#ff44bb';return {config,samples:f.sampleFixtures};}")
    page.locator('summary').click()
    page.locator('#import').set_input_files({'name':'m1-fixture.json','mimeType':'application/json','buffer':json.dumps(bundle).encode()})
    page.wait_for_function("__M3_LAB__.snapshot().status==='ready'&&__M3_LAB__.snapshot().config.effect.color==='#ff44bb'")
    page.reload();page.wait_for_load_state('networkidle');page.wait_for_function("__M3_LAB__.snapshot().status==='ready'")
    assert page.evaluate('__M3_LAB__.snapshot().config.effect.color')=='#ff44bb'
    # Real body worker: all assets local, real WASM inference over a blank frame.
    worker_result=page.evaluate('''async()=>new Promise((resolve,reject)=>{
      const worker=new Worker('/pose-tracker.worker.js'),timer=setTimeout(()=>{worker.terminate();reject(new Error('worker timeout'));},45000);
      worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(new Error(e.message));};
      worker.onmessage=async({data})=>{
        if(data.type==='ready'){const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,640,480);const bitmap=await createImageBitmap(canvas);worker.postMessage({type:'frame',timestamp:100,bitmap},[bitmap]);}
        else if(data.type==='pose'){clearTimeout(timer);worker.terminate();resolve({type:data.type,points:data.image?.length||0,ms:data.ms});}
        else if(data.type==='error'){clearTimeout(timer);worker.terminate();reject(new Error(data.message));}
      };worker.postMessage({type:'init'});
    })''')
    assert worker_result['points']==0
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_timeout(150)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(OUT/'m3-mobile.png'),full_page=True)
    assert not errors,errors
    # Whole camera -> normalizer -> template matcher -> rig -> effect -> result chain.
    live=browser.new_page(viewport={'width':1280,'height':1000})
    live.on('pageerror',lambda e:errors.append(str(e)))
    live.add_init_script('''window.Worker=class {
      postMessage(data){if(data.type==='init'){queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));return;}
        if(data.type==='frame'){data.bitmap.close();const frame=window.testPose;
          let image,world;if(frame){image=Array.from({length:33},()=>({x:.5,y:.7,z:0,visibility:0}));world=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:0}));
            const indices={leftShoulder:11,rightShoulder:12,leftElbow:13,rightElbow:14,leftWrist:15,rightWrist:16,leftHip:23,rightHip:24};
            for(const [name,i]of Object.entries(indices)){const joint=frame.joints[name],v=joint.position;world[i]={x:v[0]*.4,y:-v[1]*.4-.5,z:-v[2]*.4,visibility:joint.confidence};image[i]={x:.5+v[0]*.15,y:.4-v[1]*.15,z:-v[2]*.15,visibility:joint.confidence};}}
          queueMicrotask(()=>this.onmessage?.({data:{type:'pose',timestamp:data.timestamp,image,world,ms:0}}));}}
      terminate(){this.onmessage=null;}
    };''')
    live.goto(BASE+'/m3.html');live.wait_for_load_state('networkidle');live.wait_for_function("__M3_LAB__.snapshot().status==='ready'")
    # Start is actionable before tracking: connect, wait visibly, and allow cancellation.
    assert live.locator('#start').is_enabled()
    live.locator('#start').click();live.wait_for_function('__M3_LAB__.tracker.connected')
    live.wait_for_function("document.getElementById('start').textContent==='取消等待'")
    assert live.evaluate('__M3_LAB__.snapshot().status')=='ready'
    live.locator('#start').click()
    live.evaluate("async()=>{window.testSamples=(await import('/fixtures/m3/moon-spell.js')).sampleFixtures;window.testPose=testSamples[0].frames[0];}")
    live.wait_for_function('__M3_LAB__.tracker.isStable()')
    # A cancelled wait must not start when the person subsequently enters the frame.
    live.wait_for_timeout(400)
    assert live.evaluate('__M3_LAB__.snapshot().status')=='ready'
    live.wait_for_function("Math.abs(__M3_LAB__.snapshot().stage.points.lw[1]-.94)>.1")
    # Demo -> dismiss -> live is a fresh run, with no hidden Reset prerequisite.
    live.locator('#demo').click();live.wait_for_function("__M3_LAB__.snapshot().result?.status==='completed'",timeout=20000)
    demo_run=live.evaluate('__M3_LAB__.snapshot().config.runId')
    live.locator('#ending-close').click()
    assert live.locator('#start').is_enabled()
    live.evaluate('window.testPose=null');live.wait_for_function('!__M3_LAB__.tracker.isStable()')
    live.locator('#start').click()
    live.wait_for_function("document.getElementById('start').textContent==='取消等待'")
    live.evaluate('window.testPose=testSamples[0].frames[0]')
    live.wait_for_function("__M3_LAB__.snapshot().spell.phase==='charging'")
    assert live.evaluate('__M3_LAB__.snapshot().config.runId')!=demo_run
    assert live.evaluate('__M3_LAB__.snapshot().mode')=='live'
    live.evaluate('window.testPose=null');live.wait_for_function("__M3_LAB__.snapshot().tracking==='lost'")
    assert live.evaluate('__M3_LAB__.snapshot().spell.phase')=='charging'
    live.evaluate('window.testPose=testSamples[1].frames[0]');live.wait_for_function("__M3_LAB__.snapshot().spell.phase==='expanded'")
    live.evaluate('window.testPose=testSamples[2].frames[0]');live.wait_for_function("__M3_LAB__.snapshot().spell.phase==='launched'")
    live.evaluate('window.testPose=null');live.wait_for_function("__M3_LAB__.snapshot().result?.status==='completed'")
    result=live.evaluate('__M3_LAB__.snapshot().result')
    assert result['mode']=='live' # Synthetic input to live path, NOT a real-human acceptance.
    live.locator('#connect').click();assert not live.evaluate('__M3_LAB__.tracker.connected')
    live.evaluate('__M3_LAB__.module.dispose()');assert live.locator('#stage canvas').count()==0
    assert not errors,errors
    report={'realGLB':'passed','sequentialButtons':'passed','threeRounds':'passed','pauseCancelReset':'passed','M1BundlePersistence':'passed','realWorkerBlankFrame':worker_result,'syntheticCameraLivePath':'passed (not human acceptance)','startAndDemoToLive':'passed','mobile':'passed','pageErrors':errors,'humanCamera':'NOT TESTED','evidence':str(OUT)}
    (OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));browser.close()
