export class StoryNarrator {
  constructor({synth=globalThis.speechSynthesis,Utterance=globalThis.SpeechSynthesisUtterance,Audio=globalThis.Audio,onState=()=>{}}={}) {
    this.synth=synth;this.Utterance=Utterance;this.Audio=Audio;this.onState=onState;this.generation=0;this.state='idle';
  }
  setState(state){this.state=state;this.onState(state);}
  read(text,onEnd,{audioUrl}={}){
    this.stop();
    if(audioUrl&&this.Audio){this.readAudio(audioUrl,text,onEnd);return;}
    this.readSpeech(text,onEnd);
  }
  readAudio(url,text,onEnd){
    const token=this.generation,audio=new this.Audio(url);this.audio=audio;audio.preload='auto';
    audio.onplaying=()=>{if(token===this.generation)this.setState('speaking');};
    audio.onended=()=>{if(token!==this.generation)return;this.generation++;this.audio=null;this.setState('ended');onEnd?.();};
    audio.onerror=()=>{if(token!==this.generation)return;this.stop();this.readSpeech(text,onEnd);};
    this.setState('loading');this.playAudio(audio,token);
  }
  playAudio(audio,token){
    try{Promise.resolve(audio.play()).catch(error=>{
      if(token!==this.generation)return;
      if(error.name==='NotAllowedError')this.setState('blocked');else audio.onerror?.();
    });}catch(error){if(token===this.generation){if(error.name==='NotAllowedError')this.setState('blocked');else audio.onerror?.();}}
  }
  readSpeech(text,onEnd){
    if(!this.synth||!this.Utterance){this.setState('unavailable');return;}
    const token=this.generation,utterance=new this.Utterance(text);
    this.utterance=utterance;utterance.lang='zh-CN';utterance.rate=.83;utterance.pitch=1.03;utterance.volume=1;
    const voices=this.synth.getVoices();
    const chinese=voices.filter(v=>/^zh/i.test(v.lang));
    utterance.voice=chinese.find(v=>/^zh[-_]CN$/i.test(v.lang)&&v.localService)||chinese.find(v=>/^zh[-_]CN$/i.test(v.lang))||chinese[0]||null;
    utterance.onstart=()=>{if(token===this.generation)this.setState('speaking');};
    utterance.onend=()=>{if(token!==this.generation)return;this.generation++;this.utterance=null;this.setState('ended');onEnd?.();};
    utterance.onerror=event=>{if(token!==this.generation)return;this.generation++;this.utterance=null;this.setState(event.error==='not-allowed'?'blocked':'error');};
    this.setState('loading');
    this.synth.resume();
    try{this.synth.speak(utterance);}catch{this.generation++;this.utterance=null;this.setState('error');}
  }
  pause(){if(this.audio){this.audio.pause();this.setState('paused');}else if(this.utterance){this.synth.pause();this.setState('paused');}}
  resume(){if(this.audio){this.setState('loading');this.playAudio(this.audio,this.generation);}else if(this.utterance){this.synth.resume();this.setState('speaking');}}
  stop(){this.generation++;if(this.audio){this.audio.onended=null;this.audio.onerror=null;this.audio.onplaying=null;this.audio.pause();this.audio.removeAttribute('src');this.audio.load();}this.audio=null;if(this.utterance){this.utterance.onend=null;this.utterance.onerror=null;this.utterance.onstart=null;this.synth?.cancel();}this.utterance=null;this.setState('idle');}
  dispose(){this.stop();}
}
