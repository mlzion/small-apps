// Controller lifecycle checks with DOM/event doubles; these do not verify browser layout.
'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Engine=require('./engine.js');
const nodes=new Map();
class Element {
  constructor(){this.hidden=false;this.value='1';this.clientWidth=230;this.style={};this.handlers={};this.captures=new Set();this.classes=new Set();this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k),toggle:(k,v)=>v?this.classes.add(k):this.classes.delete(k)};}
  addEventListener(k,f){(this.handlers[k]??=[]).push(f);}
  dispatch(k,e={}){for(const f of this.handlers[k]||[])f({target:this,preventDefault(){},...e});}
  querySelector(s){return node(s);}
  append(){}focus(){}setAttribute(){}matches(){return false;}
  hasPointerCapture(id){return this.captures.has(id);}setPointerCapture(id){this.captures.add(id);}releasePointerCapture(id){this.captures.delete(id);}
  getBoundingClientRect(){return {width:360,height:480,left:0,top:0};}
  getContext(){return new Proxy({},{get:()=>()=>{}});}
}
function node(s){if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s);}
const window=new Element(),document=new Element(),orientation=new Element();orientation.matches=false;
document.querySelector=node;document.createElement=()=>new Element();document.hidden=false;
let current,callback,now=0;
const sound={playing:false,sector:1,stops:0,fanfare:null};
window.GalactixAudio={create:()=>({enabled:true,unlock(){},toggle(){},beginSector(level){sound.playing=true;sound.sector=level;sound.fanfare=null;},setGameplay(playing,level){sound.playing=playing;sound.sector=level;},stop(){sound.playing=false;sound.fanfare=null;sound.stops++;},play(cues){const cue=cues.find(c=>c==='victory'||c==='finalVictory'||c==='defeat');if(cue)sound.fanfare=cue;}})};
window.GalactixAttacks=require('./attacks.js');
window.GalactixAppearance=require('./appearance.js');
window.Galactix={...Engine,create:(...args)=>(current=Engine.create(...args))};
const sandbox={window,document,matchMedia:()=>orientation,devicePixelRatio:1,screen:{},localStorage:{getItem:()=>null,setItem(){}},ResizeObserver:class{observe(){}},requestAnimationFrame:f=>callback=f};
vm.runInNewContext(fs.readFileSync(__dirname+'/game.js','utf8'),sandbox);
const frames=(n=1)=>{for(let i=0;i<n;i++){now+=1000/60;callback(now);}};
const pointer=(id,x=50,y=50)=>({pointerId:id,clientX:x,clientY:y,button:0});
node('#action').onclick();assert.equal(node('#menu').hidden,true);frames(120);assert.ok(current.time>1.9);assert.equal(sound.playing,true);
node('#drag-pad').dispatch('pointerdown',pointer(1));node('#fire').dispatch('pointerdown',pointer(2));
node('#drag-pad').dispatch('pointermove',pointer(1,100,30));frames(10);assert.ok(current.player.x>180);assert.ok(current.shots.length>0,'independent movement and fire pointers');
const target=current.target.x;node('#drag-pad').dispatch('pointermove',pointer(9,200,30));assert.equal(current.target.x,target,'extra pointer ignored');
node('#fire').dispatch('pointercancel',pointer(2));assert.ok(!node('#fire').classes.has('active'));
node('#drag-pad').dispatch('lostpointercapture',pointer(1));assert.ok(!node('#drag-pad').classes.has('active'));
window.dispatch('keydown',{code:'Space'});frames(4);window.dispatch('blur');assert.equal(node('#menu').hidden,false);assert.equal(sound.playing,false);const stopped=current.time;frames(60);assert.equal(current.time,stopped);
node('#action').onclick();frames(90);assert.equal(current.shots.length,0,'held fire cleared on blur');
orientation.matches=true;orientation.dispatch('change');assert.equal(node('#orientation-overlay').hidden,false);assert.equal(node('#game').inert,true);assert.equal(sound.playing,false);const rotated=current.time;frames(60);assert.equal(current.time,rotated);
orientation.matches=false;orientation.dispatch('change');assert.equal(node('#orientation-overlay').hidden,true);assert.equal(node('#menu').hidden,false,'returning to portrait requires explicit resume');
node('#action').onclick();document.hidden=true;document.dispatch('visibilitychange');assert.equal(node('#menu').hidden,false);document.hidden=false;node('#action').onclick();
node('#pause').onclick();node('#restart').onclick();assert.equal(current.time,0);assert.equal(current.lives,3);
for(let level=1;level<=30;level++){
  assert.equal(current.level,level);current.state='cleared';current.score=100;frames(2);assert.match(node('#action').textContent,level===30?/Fly again/:/Next sector/);node('#action').onclick();
}
assert.equal(current.level,1);assert.equal(node('#score').textContent,'00000','new mission resets accumulated score');
node('#pause').onclick();node('#action').onclick();current.state='lost';frames(2);assert.match(node('#action').textContent,/Retry/);node('#action').onclick();assert.equal(current.lives,3);
current.state='lost';frames(2);node('#level-select').value='7';node('#level-select').onchange();node('#action').onclick();assert.equal(current.level,7);assert.equal(node('#score').textContent,'00000','test selection starts fresh');
current.enemies=[current.enemies.find(e=>e.type===1)];const victim=current.enemies[0];victim.mode='formation';victim.x=victim.homeX;victim.y=victim.homeY;
current.diveClock=current.shotClock=1e9;
current.shots=[{x:victim.x,y:victim.y+1,vx:0,vy:-440,action:{id:1,attempt:1,multiplier:1}}];frames(2);
assert.equal(sound.fanfare,'victory');assert.equal(sound.playing,false,'completion stops rhythm but keeps the victory cue');
document.hidden=true;document.dispatch('visibilitychange');assert.equal(sound.fanfare,null,'hiding clears the fanfare too');
console.log('PASS: multitouch ownership/cancellation, blur/visibility pause, rotation lockout/resume, restart, thirty-sector progression, retry and test-level selection (DOM doubles)');
