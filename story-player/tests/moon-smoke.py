"""Run against npm run dev; no camera or saved user capture is needed."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--use-angle=metal'])
    page = browser.new_page(viewport={'width': 1200, 'height': 800})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.goto('http://127.0.0.1:5185/', wait_until='networkidle')
    result = page.evaluate('''async () => {
      const {PerformanceModule} = await import('/src/upstream/performance/module.js');
      const bundle = await (await fetch('/tests/m3-fixture.json')).json();
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;inset:0;width:800px;height:600px'; document.body.append(host);
      let clock = 1000;
      const module = new PerformanceModule({sampleStore:{get:async id=>bundle.samples.find(s=>s.sampleId===id)},
        now:()=>clock,requestFrame:()=>0,cancelFrame:()=>{}});
      const config = {...bundle.config,runId:crypto.randomUUID()};
      await module.load(host,config); await module.start('demo');
      for(let i=0;i<500 && module.status==='running';i++){clock+=50;module.step(clock);}
      const completed=module.snapshot();
      await module.reset({...config,runId:crypto.randomUUID()});
      const reset=module.snapshot();
      module.dispose(); host.remove();
      return {completed,reset,canvasesAfterDispose:host.querySelectorAll('canvas').length};
    }''')
    completed = result['completed']
    assert completed['result']['status'] == 'completed', completed
    assert completed['result']['outcome'] == 'moon_restored', completed
    assert completed['result']['completedNodeIds'] == ['start','charge','release']
    assert completed['stage']['effects']['visual']['loaded']
    assert result['reset']['stage']['effects']['moon'] == [1.25,3.05,-.5]
    assert not result['reset']['stage']['effects']['restored']
    assert result['canvasesAfterDispose'] == 0
    page.goto('http://127.0.0.1:5185/moon-preview.html',wait_until='networkidle')
    page.wait_for_function('moonPreview.effects.snapshot().visual.loaded')
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_function('moonPreview.camera.aspect < 1')
    assert page.locator('#stage canvas').bounding_box()['width'] == 390
    assert not errors, errors
    print(json.dumps({'result':completed['result'],'moon':completed['stage']['effects'],'reset':result['reset']['status'],'portrait':'passed','errors':errors},ensure_ascii=False))
    browser.close()
