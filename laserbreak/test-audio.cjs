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
 start(time){this.started=true;this.begin=time;}
 stop(time){this.end=time;if(time===undefined)this.onended?.();}
}
class Context {
 constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=8000;this.destination={};this.nodes=[];}
 createGain(){const n=new Node();this.nodes.push(n);return n;}
 createOscillator(){return this.createGain();}
 resume(){if(this.reject)return Promise.reject(Error('blocked'));this.state='running';return Promise.resolve();}
}
(async()=>{
 global.AudioContext=Context;
 const s=new LaserAudio();assert.equal(s.enabled,true);assert.equal(s.context,null);assert.equal(s.playShot({single:1}),0);
 s.unlock();await Promise.resolve();assert.equal(s.context.state,'running');assert.equal(s.master.gain.value,MASTER_GAIN);assert.equal(s.voices.size,0);
 const context=s.context,master=s.master;s.unlock();assert.equal(s.context,context);assert.equal(s.master,master);
 assert.equal(s.playShot({single:1}),2);assert.equal(s.voices.size,2);s.stop();assert.equal(s.voices.size,0);
 assert.equal(s.playShot({double:100,single:100,bars:100}),4);assert.ok(s.voices.size<=MAX_SHOT_VOICES);
 for(let i=0;i<20;i++)s.playShot({double:100,single:100,bars:100});assert.equal(s.voices.size,MAX_VOICES);
 assert.ok(MAX_VOICES*.18*MASTER_GAIN<1);
 s.stop();
 for(let i=0;i<MAX_VOICES-1;i++)s.voice(400,400,.2,'sine',.01);
 assert.equal(s.playShot({double:100,single:100}),1);
 const pair=[...s.voices].at(-1).source;
 assert.deepEqual(pair.frequency.events,[[1100,.065],[1320,.165]]);
 assert.equal(pair.begin,.065);assert.equal(pair.end,.22);
 s.setEnabled(false);assert.equal(s.voices.size,0);s.setEnabled(true);
 s.playShot({bars:1});
 assert.deepEqual([...s.voices].map(v=>v.source.frequency.events),[[[1400,0],[170,.075]],[[1900,0],[480,.13]],[[1190,0],[330,.16]]]);

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
 console.log('PASS: lazy/silent unlock, resume retry/rejection and unsupported fallback, context reuse, paired beep reservation, preserved zap/bar profiles, aggregate budgets, 6 voices/shot, 8 global voices, headroom, mute and ended-node cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
