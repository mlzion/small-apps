// Session and input lifecycle checks with DOM doubles; browser coverage is separate.
'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const E=require('./engine.js'),A=require('./attacks.js');
const nodes=new Map();
class Element{
  constructor(){this.hidden=false;this.value='1';this.clientWidth=230;this.style={};this.handlers={};this.captures=new Set();this.classes=new Set();this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k),toggle:(k,v)=>v?this.classes.add(k):this.classes.delete(k)};}
  addEventListener(k,f){(this.handlers[k]??=[]).push(f);}dispatch(k,e={}){for(const f of this.handlers[k]||[])f({target:this,preventDefault(){},...e});}
  querySelector(s){return node(s);}append(){}focus(){}setAttribute(){}matches(){return false;}
  hasPointerCapture(id){return this.captures.has(id);}setPointerCapture(id){this.captures.add(id);}releasePointerCapture(id){this.captures.delete(id);}
  getBoundingClientRect(){return {width:360,height:480,left:0,top:0};}getContext(){return new Proxy({},{get:()=>()=>{}});}
}
function node(s){if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s);}
const window=new Element(),document=new Element(),orientation=new Element();orientation.matches=false;
document.querySelector=node;document.createElement=()=>new Element();document.hidden=false;
let current,callback,now=0;
const sound={playing:false,unlocks:0,fanfare:null};
window.GalactixAudio={create:()=>({unlock(){sound.unlocks++;},beginSector(){sound.playing=true;sound.fanfare=null;},setGameplay(v){sound.playing=v;},stop(){sound.playing=false;sound.fanfare=null;},play(cues){const cue=cues.find(c=>['victory','finalVictory','defeat','unlock','bossReward'].includes(c));if(cue)sound.fanfare=cue;}})};
window.GalactixAppearance=require('./appearance.js');window.GalactixAttacks=A;
window.Galactix={...E,create:(...args)=>(current=E.create(...args)),next:w=>(current=E.next(w)),restart:w=>(current=E.restart(w))};
vm.runInNewContext(fs.readFileSync(__dirname+'/game.js','utf8'),{window,document,matchMedia:()=>orientation,devicePixelRatio:1,screen:{},localStorage:{getItem:()=>null,setItem(){}},ResizeObserver:class{observe(){}},requestAnimationFrame:f=>callback=f});
const frames=(n=1)=>{for(let i=0;i<n;i++){now+=1000/60;callback(now);}};
const pointer=(id,x=50,y=50)=>({pointerId:id,clientX:x,clientY:y,button:0});
node('#action').onclick();assert.equal(current.level,1);frames(120);assert.ok(current.time>1.9);
node('#drag-pad').dispatch('pointerdown',pointer(1));node('#fire').dispatch('pointerdown',pointer(2));node('#drag-pad').dispatch('pointermove',pointer(1,100,30));frames(10);assert.ok(current.player.x>180&&current.actionId>0);
const target=current.target.x;node('#drag-pad').dispatch('pointermove',pointer(9,200,30));assert.equal(current.target.x,target);
node('#fire').dispatch('pointercancel',pointer(2));node('#drag-pad').dispatch('lostpointercapture',pointer(1));assert.ok(!node('#fire').classes.has('active')&&!node('#drag-pad').classes.has('active'));
window.dispatch('keydown',{code:'Space'});frames(4);window.dispatch('blur');assert.equal(node('#menu').hidden,false);assert.equal(sound.playing,false);const stopped=current.time;frames(60);assert.equal(current.time,stopped);assert.equal(node('#level-picker').hidden,false);
node('#action').onclick();frames(90);assert.equal(current.shots.length,0);
orientation.matches=true;orientation.dispatch('change');assert.equal(node('#game').inert,true);const rotated=current.time;frames(60);assert.equal(current.time,rotated);
orientation.matches=false;orientation.dispatch('change');assert.equal(node('#menu-title').textContent,'Flight paused');node('#action').onclick();
document.hidden=true;document.dispatch('visibilitychange');assert.equal(sound.playing,false);document.hidden=false;node('#action').onclick();
node('#pause').onclick();node('#restart').onclick();assert.equal(current.level,1);assert.equal(current.lives,3);
for(let level=1;level<=40;level++){assert.equal(current.level,level);current.state='cleared';current.score=100;frames(2);assert.match(node('#action').textContent,level===40?/Fly again/:/Next sector/);node('#action').onclick();}
assert.equal(current.level,1);assert.equal(node('#score').textContent,'00000');
node('#pause').onclick();node('#level-select').value='20';node('#level-select').onchange();assert.deepEqual(current.campaign.unlocked,['rapid','spread','double']);node('#action').onclick();
// A real queued killing projectile enters the celebration during held touch/keyboard input.
const boss=A.makeBoss(20);boss.mode='formation';boss.pattern=null;boss.hp=1;boss.x=boss.homeX;boss.y=boss.homeY;
current.enemies=[boss,{id:1,type:1,hp:1,x:300,y:100,homeX:300,homeY:100,mode:'formation',age:0}];current.bossStatus='active';
current.shotClock=current.diveClock=current.bossShotClock=current.bossDiveClock=1e6;
node('#fire').dispatch('pointerdown',pointer(3));window.dispatch('keydown',{code:'Space'});
current.shots=[{x:180,y:39,vx:0,vy:-440,action:{id:999,attempt:1,multiplier:1}}];frames(2);
assert.equal(current.state,'celebrating');assert.equal(current.weapon.kind,'laser');assert.equal(node('#celebration').hidden,false);assert.equal(sound.fanfare,'unlock');
const freeze=current.time,id=current.actionId;frames(40);assert.equal(current.time,freeze);assert.equal(current.actionId,id);assert.equal(current.weapon.charges,1);
node('#pause').onclick();const remaining=current.announcement.remaining;frames(40);assert.equal(current.announcement.remaining,remaining);assert.equal(node('#celebration').hidden,true);assert.equal(sound.playing,false);node('#action').onclick();
frames(80);assert.equal(current.state,'playing');window.dispatch('keydown',{code:'Space',repeat:true});frames(10);assert.equal(current.weapon.kind,'laser','auto-repeat is not a fresh fire action');
window.dispatch('keyup',{code:'Space'});node('#fire').dispatch('pointerup',pointer(3));node('#fire').dispatch('pointerdown',pointer(4));frames(3);assert.equal(current.weapon.kind,'normal');assert.ok(current.beam);node('#fire').dispatch('pointerup',pointer(4));
current.enemies=[];current.bossStatus='defeated';frames(2);assert.equal(sound.playing,false);assert.equal(sound.fanfare,'victory');
document.hidden=true;document.dispatch('visibilitychange');assert.equal(sound.fanfare,null);
console.log('PASS: portrait/two-pointer/keyboard controls, cancellation, pause/restart, all 40 transitions, visible selector/jump unlocks, announcement freeze/pause and fresh-fire rearm');
