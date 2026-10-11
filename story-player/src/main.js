import './style.css';
import { createBookPlayer } from './player.js';
import { createCapture } from './capture.js';
import { createPerformanceView } from './performance-view.js';
const app=document.querySelector('#app');
createCapture(app,{onContinue:bundle=>{
  app.replaceChildren();
  const reader=document.createElement('div'),stage=document.createElement('div');
  stage.hidden=true;app.append(reader,stage);
  let view;
  const player=createBookPlayer(reader,{
    spellRef:bundle?.config.spellRef,
    onPerformanceRequested:bundle ? invitation=>{
      player.pause();reader.hidden=true;stage.hidden=false;
      try{
        view=createPerformanceView(stage,{bundle,invitation,onResult:result=>{
          view?.dispose();view=null;stage.hidden=true;reader.hidden=false;
          player.showEnding(result);
        }});
      }catch(error){
        stage.hidden=true;reader.hidden=false;
        player.showEnding({...invitation,status:'failed',errorCode:'INVALID_CAPTURE'});
        reader.querySelector('#reader-note').textContent=error.message;
      }
    } : undefined,
  });
  player.load('/book/manifest.json');
}});
