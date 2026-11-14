'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/audio.js','utf8');
const records=[],nodes=[];let context,contexts=0,resumed=0,preferenceReads=0;
function param(){return {value:0,targets:[],setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.peak=v;},exponentialRampToValueAtTime(v){this.end=v;},setTargetAtTime(v,at,tau){this.targets.push({v,at,tau});this.value=v;}};}
class AudioContext{
  constructor(){contexts++;context=this;this.state='suspended';this.currentTime=1;this.destination={};}
  resume(){resumed++;this.state='running';return Promise.resolve();}
  createGain(){const n={gain:param(),connections:[],connect(to){this.connections.push(to);},disconnect(){this.disconnected=true;}};nodes.push(n);return n;}
  createOscillator(){
    const r={start:null,end:Infinity,cancelled:false,ended:false};records.push(r);
    const n={frequency:param(),detune:param(),connections:[],connect(to){this.connections.push(to);},disconnect(){this.disconnected=true;},
      start(at){r.start=at??context.currentTime;r.type=this.type;r.osc=this;},stop(at){if(at===undefined){r.cancelled=true;r.ended=true;this.onended?.();}else r.end=at;}};
    nodes.push(n);return n;
  }
}
const window={AudioContext};
vm.runInNewContext(source,{window,localStorage:{getItem(){preferenceReads++;throw Error('old setting must not be read');},setItem(){throw Error('no sound preference');}},setInterval(){throw Error('no background timer is needed');}});
const audio=window.GalactixAudio.create(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function advance(seconds){context.currentTime+=seconds;for(const r of records)if(!r.ended&&r.end<=context.currentTime){r.ended=true;r.osc?.onended?.();}}
assert.equal(contexts,0);audio.setGameplay(true,1);audio.play(['fire']);assert.equal(contexts,0,'no nodes before first gesture');assert.equal(preferenceReads,0);assert.equal('toggle' in audio,false);
audio.unlock();audio.setGameplay(true,1);assert.equal(contexts,1);assert.equal(resumed,1);assert.equal(audio.diagnostics.background,true);assert.equal(audio.diagnostics.backgroundNodes,5);assert.equal(audio.diagnostics.voices,2);
const carrier=records.find(r=>r.osc.frequency.value===196),lfo=records.find(r=>r!==carrier);assert.ok(carrier&&lfo);assert.equal(carrier.type,'sine');assert.equal(lfo.type,'sine');near(carrier.osc.detune.value,50);near(lfo.osc.frequency.value,.7);
const pitch=nodes.find(n=>n.gain?.value===50);assert.ok(pitch.connections.includes(carrier.osc.detune));assert.ok(lfo.osc.connections.includes(pitch));
const level=nodes.find(n=>n.gain?.value===.04),breath=nodes.find(n=>n.gain?.value===.006);assert.ok(level&&breath);assert.ok(breath.connections.includes(level.gain));
assert.deepEqual(Array.from(audio.diagnostics.detuneRange),[0,100]);near(196*2**(100/1200)/196,2**(1/12));
let before=records.length;advance(10);audio.setGameplay(true,1);assert.equal(records.length,before,'continuous nodes are retained, not retriggered notes');
audio.setGameplay(true,40);assert.equal(records.length,before);near(lfo.osc.frequency.targets.at(-1).v,2.5);assert.ok(lfo.osc.frequency.targets.at(-1).tau>0,'smooth rate glide');
for(let s=2;s<=40;s++)assert.ok(window.GalactixAudio.rateForSector(s)>window.GalactixAudio.rateForSector(s-1));
for(let i=0;i<100;i++)audio.setGameplay(true,40);assert.equal(records.length,before,'no duplicate oscillators on RAF updates');
audio.stop();assert.equal(audio.diagnostics.voices,0);assert.ok(carrier.osc.disconnected&&lfo.osc.disconnected&&pitch.disconnected&&breath.disconnected&&level.disconnected);
for(let i=0;i<25;i++){audio.setGameplay(true,20);assert.equal(audio.diagnostics.voices,2);audio.stop();assert.equal(audio.diagnostics.voices,0);}
assert.equal(preferenceReads,0);console.log('PASS: gesture-gated always-on sound, no preference/toggle, continuous sine carrier, 0..100-cent LFO, .7–2.5Hz rate glide, no timer/duplicates and node cleanup');
const cues={fire:1000,enemyFire:290,hit:380,destroy:230,dive:160,bossDive:100,damage:155,shield:360,pickup:520,bossHit:180,bossDestroy:180,bossEnter:80,laser:880,mineDeploy:660,mineBlast:110,enemyMineDeploy:210,mineWarning:540,enemyMineBlast:150};
audio.setGameplay(true,40);
for(const [cue,freq] of Object.entries(cues)){before=records.length;audio.play([cue]);assert.ok(records.slice(before).some(r=>r.osc.frequency.value===freq),cue);advance(.75);}
for(let i=0;i<180;i++){audio.play(['bossDestroy','bossHit']);assert.ok(audio.diagnostics.voices<=12);advance(.025);}
audio.stop();assert.equal(audio.diagnostics.voices,0);assert.ok(records.filter(r=>!r.ended).length===0);
console.log('PASS: retained combat/fanfare sounds plus entrance/laser/player-mine/enemy-mine cues, repetition limiting and 12-total-oscillator cap');
audio.beginSector(20);before=records.length;audio.play(['unlock','bossDestroy']);assert.equal(audio.diagnostics.background,false);assert.equal(audio.diagnostics.fanfare,'unlock');
let count=records.length;audio.play(['fire','enemyFire']);audio.play(['unlock']);assert.equal(records.length,count);audio.setGameplay(false,20);assert.ok(audio.diagnostics.voices>0);
audio.play(['victory']);assert.equal(audio.diagnostics.pending,'victory');assert.equal(records.length,count,'victory waits rather than overlapping or disappearing');
advance(1.4);audio.setGameplay(false,20);assert.equal(audio.diagnostics.fanfare,'victory');assert.equal(audio.diagnostics.pending,null);assert.equal(audio.diagnostics.background,false);
const win=records.slice(count);assert.equal(win.length,6);assert.ok(win.every((r,i)=>!i||r.osc.frequency.value>win[i-1].osc.frequency.value));
count=records.length;audio.play(['victory']);assert.equal(records.length,count,'no duplicate fanfare');advance(2);assert.equal(audio.diagnostics.voices,0);
audio.beginSector(30);audio.play(['bossReward','bossDestroy']);assert.equal(audio.diagnostics.fanfare,'bossReward');audio.stop();assert.equal(audio.diagnostics.voices,0,'pause cancels future notes');
audio.beginSector(40);before=records.length;audio.play(['finalVictory','bossDestroy']);assert.equal(audio.diagnostics.voices,12);assert.equal(audio.diagnostics.background,false);assert.equal(audio.diagnostics.fanfare,'finalVictory');audio.setGameplay(false,40);advance(2.1);assert.equal(audio.diagnostics.voices,0);
audio.beginSector(1);before=records.length;audio.play(['defeat']);const loss=records.slice(before);assert.equal(loss.length,5);assert.ok(loss.every((r,i)=>!i||r.osc.frequency.value<loss[i-1].osc.frequency.value));assert.ok(loss.at(-1).end-loss[0].start>=1);
audio.stop();assert.equal(audio.diagnostics.voices,0);assert.equal(audio.diagnostics.background,false);audio.setGameplay(true,1);assert.equal(audio.diagnostics.background,true);audio.stop();
console.log('PASS: unlock/boss celebration ordering, queued victory, deduplicated ascending/descending/special-final fanfares, background suppression, pause and clean resume');
const absent={};vm.runInNewContext(source,{window:absent});const fallback=absent.GalactixAudio.create();fallback.unlock();fallback.beginSector(40);fallback.play(['finalVictory']);fallback.stop();assert.equal(fallback.diagnostics.voices,0);
const broken={AudioContext:class{constructor(){throw Error('device failed');}}};vm.runInNewContext(source,{window:broken});const device=broken.GalactixAudio.create();device.unlock();device.setGameplay(true,1);device.play(['fire']);device.stop();assert.equal(device.diagnostics.voices,0);
console.log('PASS: unavailable audio devices remain safe; gameplay has no dependency on Web Audio');
