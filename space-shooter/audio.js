/* Always-on original synthesis, unlocked by a gesture. No gameplay clock/RNG. */
(() => {
  'use strict';
  const MAX_VOICES=12,ROOT=196;
  const rateForSector=sector=>.7+1.8*(Math.max(1,Math.min(40,sector))-1)/39;
  window.GalactixAudio={rateForSector,create(){
    let context,output,background=null,playing=false,sector=1,fanfareUntil=0,fanKind=null,pending=null,unavailable=false;
    const voices=new Set(),lastCue=new Map();
    function stopBackground(){
      const bg=background;background=null;if(!bg)return;
      for(const osc of bg.oscillators)try{osc.stop();}catch{}
      for(const node of bg.nodes)try{node.disconnect();}catch{}
    }
    function syncBackground(){
      if(!playing||!context||context.state!=='running'||context.currentTime<fanfareUntil||unavailable){stopBackground();return;}
      if(background){
        if(background.sector!==sector){background.lfo.frequency.setTargetAtTime(rateForSector(sector),context.currentTime,.15);background.sector=sector;}
        return;
      }
      const nodes=[],oscillators=[];
      try{
        const carrier=context.createOscillator();nodes.push(carrier);oscillators.push(carrier);
        const lfo=context.createOscillator();nodes.push(lfo);oscillators.push(lfo);
        const pitch=context.createGain();nodes.push(pitch);
        const breath=context.createGain();nodes.push(breath);
        const level=context.createGain();nodes.push(level);
        carrier.type='sine';carrier.frequency.value=ROOT;carrier.detune.value=50;
        lfo.type='sine';lfo.frequency.value=rateForSector(sector);pitch.gain.value=50;
        // One LFO continuously glides detune through 0..100 cents, never switches notes.
        breath.gain.value=.006;level.gain.value=.04;
        lfo.connect(pitch);pitch.connect(carrier.detune);lfo.connect(breath);breath.connect(level.gain);
        carrier.connect(level);level.connect(output);carrier.start();lfo.start();
        background={nodes,oscillators,lfo,sector};
      }catch{
        for(const osc of oscillators)try{osc.stop();}catch{}
        for(const node of nodes)try{node.disconnect();}catch{}
        unavailable=true;
      }
    }
    function unlock(){
      try{
        const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
        unavailable=false;
        if(!context){context=new Audio();output=context.createGain();output.gain.value=.12;output.connect(context.destination);}
        if(context.state==='suspended')context.resume().then(syncBackground).catch(()=>{});
      }catch{unavailable=true;}
    }
    function remove(v,cancel=false){
      voices.delete(v);if(cancel)try{v.osc.stop();}catch{}
      try{v.osc.disconnect();v.gain.disconnect();}catch{}
    }
    function prune(){if(context)for(const v of voices)if(v.end<=context.currentTime)remove(v);}
    function stopVoices(){for(const v of [...voices])remove(v,true);}
    function stop(){playing=false;stopBackground();stopVoices();fanfareUntil=0;fanKind=null;pending=null;lastCue.clear();}
    function tone(frequency,endFrequency,duration,type,volume,at,category='effect'){
      if(!context||context.state!=='running'||unavailable)return;
      prune();if(voices.size+(background?2:0)>=MAX_VOICES)return;
      let voice;
      try{
        const start=at??context.currentTime,osc=context.createOscillator(),gain=context.createGain();
        voice={osc,gain,end:start+duration,category};osc.type=type;
        osc.frequency.setValueAtTime(frequency,start);osc.frequency.exponentialRampToValueAtTime(endFrequency,start+duration);
        gain.gain.setValueAtTime(.001,start);gain.gain.linearRampToValueAtTime(volume,start+.004);gain.gain.exponentialRampToValueAtTime(.001,start+duration);
        osc.connect(gain);gain.connect(output);voices.add(voice);
        osc.onended=()=>remove(voice);osc.start(start);osc.stop(voice.end);
      }catch{if(voice)remove(voice,true);}
    }
    function fanfare(kind,bossExplosion=false){
      if(!context||context.state!=='running')return;
      if(context.currentTime<fanfareUntil){
        if(['victory','finalVictory','defeat'].includes(kind)&&['unlock','bossReward'].includes(fanKind))pending={kind,bossExplosion};
        return;
      }
      stopBackground();stopVoices();lastCue.clear();
      const now=context.currentTime,final=kind==='finalVictory',lost=kind==='defeat',reward=['unlock','bossReward'].includes(kind);
      const notes=reward?(kind==='unlock'?[440,660,880]:[220,330,440]):lost?[440,349,294,220,185]:final?[523,622,784,932,1047,1245,1397,1568]:[523,622,784,932,1245,1397];
      const gap=reward?.28:final?.18:.22,offset=bossExplosion?.14:0;
      fanfareUntil=now+(reward?1.35:final?2:1.65);fanKind=kind;
      if(bossExplosion){tone(160,28,.65,'sawtooth',.46,now,'fanfare');tone(70,32,.7,'sine',.43,now,'fanfare');}
      notes.forEach((n,i)=>tone(n,lost?n*.85:n*1.015,i===notes.length-1?.35:.19,'triangle',lost?.32:.36,now+offset+i*gap,'fanfare'));
      if(final){const at=now+offset+7*gap;tone(1047,1055,.45,'sine',.2,at,'fanfare');tone(1245,1253,.45,'sine',.2,at,'fanfare');}
    }
    function setGameplay(value,level=sector){
      playing=value;sector=level;prune();
      if(context&&context.currentTime>=fanfareUntil&&pending){const next=pending;pending=null;fanfare(next.kind,next.bossExplosion);}
      syncBackground();
    }
    const priority=['bossDestroy','bossEnter','laser','mineBlast','enemyMineBlast','damage','bossHit','shield','enemyMineDeploy','mineDeploy','mineWarning','pickup','destroy','bossDive','dive','hit','enemyFire','fire'];
    function effect(cue){
      const now=context.currentTime,spacing=cue==='fire'?.065:cue==='enemyFire'?.12:cue==='dive'?.16:.07;
      if(now-(lastCue.get(cue)??-Infinity)<spacing)return;lastCue.set(cue,now);
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
        case 'bossDestroy':tone(180,27,.7,'sawtooth',.45);tone(65,30,.7,'sine',.42);break;
        case 'bossEnter':tone(80,480,.65,'triangle',.3);tone(190,540,.5,'sine',.2);break;
        case 'laser':tone(880,220,.27,'sine',.4);break;
        case 'mineDeploy':tone(660,330,.12,'triangle',.3);break;
        case 'mineBlast':tone(110,32,.4,'sawtooth',.4);tone(220,60,.3,'sine',.25);break;
        case 'enemyMineDeploy':tone(210,100,.22,'triangle',.28);break;
        case 'mineWarning':tone(540,680,.1,'sine',.23);break;
        case 'enemyMineBlast':tone(150,40,.35,'triangle',.4);break;
      }
    }
    return {
      unlock,stop,setGameplay,
      beginSector(level){stop();sector=level;unlock();setGameplay(true,level);},
      play(cues){
        if(!context||context.state!=='running'||!cues.length)return;
        const important=cues.find(c=>['victory','finalVictory','defeat','unlock','bossReward'].includes(c));
        if(important){fanfare(important,cues.includes('bossDestroy'));return;}
        if(context.currentTime<fanfareUntil)return;
        let count=0;for(const cue of priority)if(cues.includes(cue)){effect(cue);if(++count===2)break;}
      },
      get diagnostics(){prune();return {voices:voices.size+(background?2:0),background:!!background,backgroundNodes:background?.nodes.length||0,playing,rate:rateForSector(sector),root:ROOT,detuneRange:[0,100],fanfare:context&&context.currentTime<fanfareUntil?fanKind:null,pending:pending?.kind||null};}
    };
  }};
})();
