'use strict';
const assert=require('node:assert/strict');
const {LaserAudio,MAX_VOICES,MAX_SHOT_VOICES,MASTER_GAIN}=require('./audio.js');
class Param {
 constructor(){this.events=[];this.value=0;}
 setValueAtTime(v,t){this.events.push([v,t]);}
 linearRampToValueAtTime(v,t){this.events.push([v,t]);}
 exponentialRampToValueAtTime(v,t){this.events.push([v,t]);}
}
class Node {
 constructor(){this.gain=new Param();this.frequency=new Param();this.disconnected=false;}
 connect(){} disconnect(){this.disconnected=true;}
 start(){this.started=true;}
 stop(time){this.end=time;if(time===undefined)this.onended?.();}
}
class Context {
 constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=8000;this.destination={};this.nodes=[];}
 createGain(){const n=new Node();this.nodes.push(n);return n;}
 createOscillator(){return this.createGain();}
 createBufferSource(){return this.createGain();}
 createBiquadFilter(){return this.createGain();}
 createBuffer(c,length){return {data:new Float32Array(length),getChannelData(){return this.data;}};}
 resume(){if(this.reject)return Promise.reject(Error('blocked'));this.state='running';return Promise.resolve();}
}
(async()=>{
 global.AudioContext=Context;
 const s=new LaserAudio();assert.equal(s.enabled,true);assert.equal(s.context,null);assert.equal(s.playShot({single:1}),0);
 s.unlock();await Promise.resolve();assert.equal(s.context.state,'running');assert.equal(s.master.gain.value,MASTER_GAIN);assert.equal(s.voices.size,0);
 const buffer=s.noise;s.unlock();assert.equal(s.noise,buffer);
 assert.equal(s.playShot({single:1}),2);assert.equal(s.voices.size,2);s.stop();assert.equal(s.voices.size,0);
 assert.equal(s.playShot({double:100,single:100,bars:100}),MAX_SHOT_VOICES);assert.equal(s.voices.size,6);
 for(let i=0;i<20;i++)s.playShot({double:100,single:100,bars:100});assert.equal(s.voices.size,MAX_VOICES);
 assert.ok(MAX_VOICES*.18*MASTER_GAIN<1);
 for(const v of [...s.voices])v.source.onended();assert.equal(s.voices.size,0);
 s.playShot({double:1});s.setEnabled(false);assert.equal(s.voices.size,0);assert.equal(s.playShot({double:1}),0);
 s.setEnabled(true);assert.ok(s.playShot({double:1})>0);s.stop();
 s.context.state='suspended';s.context.reject=true;s.unlock();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(s.playShot({single:1}),0);assert.equal(s.resuming,false);
 s.context.resume=()=>{throw Error('synchronous rejection');};s.unlock();assert.equal(s.resuming,false);
 s.context.resume=Context.prototype.resume;s.context.reject=false;s.context.state='interrupted';s.unlock();await new Promise(resolve=>setImmediate(resolve));assert.equal(s.context.state,'running');
 global.AudioContext=undefined;const missing=new LaserAudio();missing.unlock();assert.equal(missing.context,null);assert.equal(missing.playShot({double:1}),0);
 global.AudioContext=class{constructor(){throw Error('denied');}};missing.unlock();assert.equal(missing.context,null);
 global.AudioContext=Context;const muted=new LaserAudio();muted.setEnabled(false);muted.unlock();assert.equal(muted.context,null);
 console.log('PASS: lazy/silent unlock, resume retry/rejection and unsupported fallback, cached noise, distinct aggregate budgets, 6 voices/shot, 8 global voices, headroom, mute and ended-node cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
