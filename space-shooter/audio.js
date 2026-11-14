/* Original synthesized arcade sound. Web Audio time is independent of the engine. */
(() => {
  'use strict';
  const MAX_VOICES=12;
  const bpmForSector=sector=>75+70*(Math.max(1,Math.min(30,sector))-1)/29;
  window.GalactixAudio={bpmForSector,create(){
    let enabled=false,context,output,timer=null,playing=false,sector=1,nextBeat=0,fanfareUntil=0,fanKind=null;
    const voices=new Set(),lastCue=new Map();
    try{enabled=localStorage.getItem('galactix.sound.v02')==='on';}catch{}
    function unlock(){
      if(!enabled)return;
      try{
        const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
        if(!context){context=new Audio();output=context.createGain();output.gain.value=.12;output.connect(context.destination);}
        if(context.state==='suspended')context.resume().then(syncTimer).catch(()=>{});
      }catch{/* Unsupported devices stay silent. */}
    }
    function remove(v,cancel=false){
      voices.delete(v);
      if(cancel){try{v.osc.stop();}catch{}}
      try{v.osc.disconnect();v.gain.disconnect();}catch{}
    }
    function prune(){if(context)for(const v of voices)if(v.end<=context.currentTime)remove(v);}
    function stopVoices(category){for(const v of [...voices])if(!category||v.category===category)remove(v,true);}
    function clearTimer(){if(timer!==null){clearInterval(timer);timer=null;}}
    function stop(){playing=false;clearTimer();stopVoices();fanfareUntil=0;fanKind=null;lastCue.clear();nextBeat=0;}
    function tone(frequency,endFrequency,duration,type,volume,at,category='effect'){
      if(!enabled||!context||context.state!=='running')return;
      prune();if(voices.size>=MAX_VOICES)return;
      let voice;
      try{
        const start=at??context.currentTime,osc=context.createOscillator(),gain=context.createGain();
        voice={osc,gain,end:start+duration,category};
        osc.type=type;osc.frequency.setValueAtTime(frequency,start);osc.frequency.exponentialRampToValueAtTime(endFrequency,start+duration);
        gain.gain.setValueAtTime(.001,start);gain.gain.linearRampToValueAtTime(volume,start+.004);gain.gain.exponentialRampToValueAtTime(.001,start+duration);
        osc.connect(gain);gain.connect(output);voices.add(voice);
        osc.onended=()=>remove(voice);osc.start(start);osc.stop(voice.end);
      }catch{if(voice)remove(voice,true);}
    }
    function tick(){
      prune();if(!enabled||!playing||!context||context.state!=='running')return;
      const now=context.currentTime;
      if(now<fanfareUntil){nextBeat=fanfareUntil+.06;return;}
      fanKind=null;
      // Look-ahead scheduling on AudioContext time avoids timer jitter. Never replay
      // missed beats in a burst after a throttled tab; visibility also calls stop().
      if(nextBeat<now-.1)nextBeat=now+.03;
      while(nextBeat<now+.12){tone(88,48,.14,'sine',.075,nextBeat,'rhythm');nextBeat+=60/bpmForSector(sector);}
    }
    function syncTimer(){
      if(enabled&&playing&&context?.state==='running'){
        if(timer===null){nextBeat=Math.max(context.currentTime+.04,fanfareUntil+.06);timer=setInterval(tick,25);tick();}
      }else{clearTimer();stopVoices('rhythm');}
    }
    function setGameplay(value,level=sector){
      const changed=playing!==value||sector!==level;playing=value;sector=level;
      if(changed&&context)nextBeat=context.currentTime+.04;
      syncTimer();
    }
    function fanfare(kind,bossExplosion=false){
      if(!enabled||!context||context.state!=='running'||context.currentTime<fanfareUntil)return;
      stopVoices();lastCue.clear();
      const now=context.currentTime,final=kind==='finalVictory',lost=kind==='defeat';
      const notes=lost?[440,349,294,220,185]:final?[523,622,784,932,1047,1245,1397,1568]:[523,622,784,932,1245,1397];
      const gap=final?.19:.22,offset=bossExplosion?.12:0;
      fanfareUntil=now+(final?1.9:1.65);fanKind=kind;
      if(bossExplosion){tone(160,28,.55,'sawtooth',.48,now,'fanfare');tone(70,32,.6,'sine',.45,now,'fanfare');}
      notes.forEach((n,i)=>tone(n,lost?n*.85:n*1.015,i===notes.length-1?.35:.19,'triangle',lost?.32:.38,now+offset+i*gap,'fanfare'));
      nextBeat=fanfareUntil+.06;
    }
    const priority=['bossDestroy','damage','bossHit','shield','pickup','destroy','bossDive','dive','hit','enemyFire','fire'];
    function effect(cue){
      const now=context.currentTime,spacing=cue==='fire'?.065:cue==='enemyFire'?.12:cue==='dive'?.16:.07;
      if(now-(lastCue.get(cue)??-Infinity)<spacing)return;
      lastCue.set(cue,now);
      switch(cue){
        case 'fire':tone(1000,380,.045,'square',.16);break;
        case 'enemyFire':tone(290,480,.075,'triangle',.21);break;
        case 'hit':tone(380,150,.065,'triangle',.28);break;
        case 'destroy':tone(230,38,.18,'sawtooth',.32);break;
        case 'dive':tone(160,760,.24,'sine',.23);break;
        case 'bossDive':tone(100,620,.35,'triangle',.3);break;
        case 'damage':tone(155,32,.32,'sawtooth',.44);break;
        case 'shield':tone(360,1100,.26,'sine',.36);break;
        case 'pickup':tone(520,1050,.17,'triangle',.3);break;
        case 'bossHit':tone(180,65,.13,'triangle',.4);break;
        case 'bossDestroy':tone(180,27,.6,'sawtooth',.45);tone(65,30,.65,'sine',.42);break;
      }
    }
    return {
      get enabled(){return enabled;},unlock,stop,setGameplay,
      beginSector(level){stop();sector=level;unlock();setGameplay(true,level);},
      toggle(){enabled=!enabled;try{localStorage.setItem('galactix.sound.v02',enabled?'on':'off');}catch{}if(enabled)unlock();else stop();},
      play(cues){
        if(!enabled||!context||context.state!=='running'||!cues.length)return;
        const terminal=cues.find(c=>['victory','finalVictory','defeat'].includes(c));
        if(terminal){fanfare(terminal,cues.includes('bossDestroy'));return;}
        if(context.currentTime<fanfareUntil)return;
        let count=0;for(const cue of priority)if(cues.includes(cue)){effect(cue);if(++count===2)break;}
      },
      get diagnostics(){prune();return {voices:voices.size,timer:timer!==null,playing,bpm:bpmForSector(sector),nextBeat,fanfare:context&&context.currentTime<fanfareUntil?fanKind:null};}
    };
  }};
})();
