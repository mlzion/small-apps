'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/audio.js','utf8');
const timers=new Map(),storage=new Map(),records=[];let context,contexts=0,resumed=0,timerId=0;
class AudioContext{
  constructor(){contexts++;context=this;this.state='suspended';this.currentTime=1;this.destination={};}
  resume(){resumed++;this.state='running';return Promise.resolve();}
  createGain(){return {gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(v){assert.ok(v<=.5,'quiet voice peak');},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  createOscillator(){
    const r={start:null,end:Infinity,cancelled:false,ended:false};records.push(r);
    return {frequency:{setValueAtTime(v){r.frequency=v;},exponentialRampToValueAtTime(v){r.endFrequency=v;}},
      connect(){},disconnect(){},start(at){r.start=at;r.type=this.type;r.osc=this;},
      stop(at){if(at===undefined){r.cancelled=true;r.ended=true;this.onended?.();}else r.end=at;}};
  }
}
const window={AudioContext};
const localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
const env={window,localStorage,setInterval:f=>{const id=++timerId;timers.set(id,f);return id;},clearInterval:id=>timers.delete(id)};
vm.runInNewContext(source,env);
const audio=window.GalactixAudio.create(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function advance(seconds){
  const steps=Math.ceil(seconds/.025),dt=seconds/steps;
  for(let i=0;i<steps;i++){
    context.currentTime+=dt;
    for(const r of records)if(!r.ended&&r.end<=context.currentTime){r.ended=true;r.osc?.onended?.();}
    for(const f of [...timers.values()])f();
  }
}
audio.unlock();audio.setGameplay(true,1);audio.play(['fire']);assert.equal(contexts,0);assert.equal(timers.size,0,'muted until user gesture');
audio.toggle();assert.equal(audio.enabled,true);assert.equal(contexts,1);assert.equal(resumed,1);
audio.beginSector(1);assert.equal(timers.size,1);advance(2.4);
let beats=records.filter(r=>r.frequency===88);assert.ok(beats.length>=3);
for(let i=1;i<beats.length;i++)near(beats[i].start-beats[i-1].start,.8);
near(window.GalactixAudio.bpmForSector(1),75);near(window.GalactixAudio.bpmForSector(30),145);
for(let level=2;level<=30;level++)assert.ok(window.GalactixAudio.bpmForSector(level)>window.GalactixAudio.bpmForSector(level-1));
let before=records.length;audio.beginSector(30);advance(1.5);beats=records.slice(before).filter(r=>r.frequency===88);
for(let i=1;i<beats.length;i++)near(beats[i].start-beats[i-1].start,60/145);
assert.equal(audio.diagnostics.bpm,145);assert.equal(timers.size,1,'one scheduler, not one per update');
for(let i=0;i<100;i++)audio.setGameplay(true,30);assert.equal(timers.size,1);
audio.stop();assert.equal(timers.size,0);assert.equal(audio.diagnostics.voices,0);before=records.length;advance(2);assert.equal(records.length,before);
console.log('PASS: gesture gate, retained sound preference, 75–145 BPM, steady AudioContext scheduling, single timer and pause cleanup');

const cues={fire:1000,enemyFire:290,hit:380,destroy:230,dive:160,bossDive:100,damage:155,shield:360,pickup:520,bossHit:180,bossDestroy:180};
for(const [cue,freq] of Object.entries(cues)){
  before=records.length;audio.play([cue]);assert.ok(records.slice(before).some(r=>r.frequency===freq),cue+' has an original cue');advance(.3);
}
for(let i=0;i<150;i++){audio.play(['bossDestroy','bossHit']);assert.ok(audio.diagnostics.voices<=12);advance(.025);}
assert.ok(records.filter(r=>!r.ended).length<=12,'scheduled and active voices are bounded');
audio.toggle();assert.equal(audio.enabled,false);assert.equal(audio.diagnostics.voices,0);assert.equal(timers.size,0);
before=records.length;audio.play(['bossDestroy']);assert.equal(records.length,before);assert.equal(window.GalactixAudio.create().enabled,false);
audio.toggle();assert.equal(window.GalactixAudio.create().enabled,true);
console.log('PASS: distinct combat/boss sounds, repetition limiting, 12-voice cap, mute cancellation and persisted preference');

audio.beginSector(30);before=records.length;audio.play(['finalVictory','bossDestroy']);
assert.equal(audio.diagnostics.fanfare,'finalVictory');assert.equal(records.length-before,10,'eight-note final cue plus a two-voice boss explosion');
let count=records.length;audio.play(['fire','enemyFire']);audio.play(['finalVictory']);audio.play(['defeat']);assert.equal(records.length,count,'fanfare suppresses routine effects and other fanfares');
audio.setGameplay(false,30);assert.equal(timers.size,0);assert.ok(audio.diagnostics.voices>0,'sector completion preserves its fanfare');
advance(2);assert.equal(audio.diagnostics.voices,0);assert.equal(audio.diagnostics.fanfare,null);
const final=records.slice(before);assert.ok(final.every(r=>r.end-r.start<=.65));
audio.beginSector(5);before=records.length;audio.play(['victory']);const win=records.slice(before);
assert.equal(win.length,6);assert.ok(win.at(-1).end-win[0].start>=1&&win.at(-1).end-win[0].start<=2);
assert.ok(win.every((r,i)=>!i||r.frequency>win[i-1].frequency),'bright ascending victory');
advance(.4);assert.equal(records.slice(before).filter(r=>r.frequency===88).length,0,'throb yields to fanfare');
audio.stop();assert.equal(audio.diagnostics.voices,0,'pause cancels scheduled fanfare notes too');
audio.beginSector(1);before=records.length;audio.play(['defeat']);const loss=records.slice(before);
assert.equal(loss.length,5);assert.ok(loss.every((r,i)=>!i||r.frequency<loss[i-1].frequency));assert.ok(loss.at(-1).end-loss[0].start>=1);
audio.toggle();advance(2);assert.equal(audio.diagnostics.voices,0);assert.equal(timers.size,0);
console.log('PASS: ascending victory/final variation, descending defeat, fanfare priority/deduplication, rhythm suppression, completion vs pause and mute lifecycle');

const noAudio={};vm.runInNewContext(source,{...env,window:noAudio,localStorage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});
const fallback=noAudio.GalactixAudio.create();fallback.toggle();fallback.unlock();fallback.beginSector(30);fallback.play(['finalVictory']);fallback.stop();
assert.equal(fallback.diagnostics.voices,0);assert.equal(fallback.diagnostics.timer,false);
const broken={AudioContext:class{constructor(){throw Error('device failed');}}};vm.runInNewContext(source,{...env,window:broken});
const device=broken.GalactixAudio.create();device.unlock();device.beginSector(1);device.play(['fire']);device.stop();
console.log('PASS: blocked storage, missing Web Audio and device failure remain safe and silent');
