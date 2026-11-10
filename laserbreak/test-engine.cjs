'use strict';
const assert=require('node:assert/strict');
const {World,Input,circleHit,barHit,blastHits,MAX_OBJECTS,defaults}=require('./engine.js');
let count=0;
function test(name,run){run();count++;console.log('PASS:',name);}
function world(){const w=new World(()=>.5);Object.assign(w.settings,{density:0,targetSpeed:0,barSpeed:0,barRotation:0});return w;}
function target(id,x,y=250,radius=15){return {id,type:'target',x,y,radius,color:'#65f5ef',angle:0};}
function bar(id,x,y=250,angle=0,length=100,thickness=10){return {id,type:'bar',x,y,angle,length,thickness};}
function finish(w){w.step(.6);}
function controls(mode='touch') {let shots=[];let ready=true;const i=new Input((a,b)=>shots.push([a,b]),()=>ready,()=>mode);return {i,shots,setReady:r=>ready=r};}
test('touch: opposite pads, endpoint movement, extra pointers, full release re-arm',()=>{
 const {i,shots}=controls();i.down(1,'left',100);i.down(2,'left',150);assert.equal(shots.length,0);
 i.move(1,180);i.down(3,'right',200);assert.deepEqual(shots,[[180,200]]);
 i.up(3);i.down(4,'right',200);assert.equal(shots.length,1);[1,2,4].forEach(id=>i.up(id));
 i.down(5,'right',300);i.down(6,'left',400);assert.deepEqual(shots[1],[400,300]);
});
test('release: aim, either release fires once, cancellation aborts',()=>{
 for(const first of [1,2]) {const {i,shots}=controls('release');i.down(1,'left',100);i.down(2,'right',200);
 assert.equal(shots.length,0);i.move(2,350);i.up(first);assert.deepEqual(shots,[[100,350]]);i.up(first===1?2:1);assert.equal(i.locked,false);}
 const {i,shots}=controls('release');i.down(1,'left',100);i.down(2,'right',100);i.up(1,true);i.up(2);assert.equal(shots.length,0);
});
test('release: unrelated third finger cannot fire; duplicate/unknown pointers ignored',()=>{
 const {i,shots}=controls('release');i.down(1,'left',100);i.down(1,'right',200);i.down(2,'right',150);i.down(3,'left',180);i.up(3);i.up(99);assert.equal(shots.length,0);i.up(2);assert.deepEqual(shots,[[100,150]]);
});
test('cooldown gesture is consumed; cooldown uses simulation time and both fingers release',()=>{
 const w=world(),i=new Input((a,b)=>w.fire(a,b),()=>w.ready(),()=>w.settings.mode);
 const gesture=()=>{i.down(1,'left',250);i.down(2,'right',250);};
 gesture();assert.equal(w.shots.length,1);i.up(1);i.up(2);gesture();assert.equal(w.shots.length,1);
 w.step(.76);assert.equal(w.shots.length,0);i.up(1);i.down(1,'left',250);assert.equal(w.shots.length,0);
 i.up(1);i.up(2);gesture();assert.equal(w.shots.length,1);
 w.paused=true;w.step(10);assert.equal(w.ready(),false);assert.equal(w.time<1,true);
});
test('release mode respects cooldown',()=>{
 const {i,shots,setReady}=controls('release');setReady(false);i.down(1,'left',100);i.down(2,'right',100);i.up(1);setReady(true);i.down(3,'left',100);i.up(2);assert.equal(shots.length,0);i.up(3);i.down(4,'left',100);i.down(5,'right',100);i.up(5);assert.equal(shots.length,1);
});
test('circle geometry: tangent, miss, start inside, diagonal',()=>{
 assert.equal(circleHit({x:0,y:0},{x:10,y:0},{x:5,y:1},1),.5);
 assert.equal(circleHit({x:0,y:0},{x:10,y:0},{x:5,y:2},1),null);
 assert.equal(circleHit({x:0,y:0},{x:0,y:0},{x:0,y:0},1),0);
 assert.ok(circleHit({x:0,y:0},{x:10,y:10},{x:5,y:5},1)<.5);
});
test('oriented rectangle geometry respects thickness and rotation, including ends',()=>{
 const b=bar(1,100,100,Math.PI/4,100,10);
 assert.notEqual(barHit({x:60,y:60},{x:140,y:140},b),null);
 assert.equal(barHit({x:50,y:100},{x:60,y:100},b),null);
 assert.notEqual(barHit({x:100,y:0},{x:100,y:200},b),null);
 assert.notEqual(barHit({x:65,y:65},{x:65,y:65},b),null);
});
test('independent inward pulses stop at first bar, targets behind remain safe',()=>{
 const w=world();w.objects=[bar(1,100),bar(2,800),target(3,50),target(4,900),target(5,450)];w.fire(250,250);w.step(.05);
 const p=w.shots[0].pulses;assert.equal(p[0].done,true);assert.equal(p[1].done,false);assert.ok(p[0].position.x<100);
 finish(w);assert.deepEqual(w.objects.map(o=>o.id),[1,2,5]);assert.equal(w.effects.some(e=>e.type==='explosion'),false);
});
test('single-sided hits dissolve; targets do not stop the pulse',()=>{
 const w=world();w.objects=[target(1,100),target(2,200),bar(3,300)];w.fire(250,250);w.step(.3);
 assert.deepEqual(w.objects.map(o=>o.id),[3]);assert.equal(w.effects.filter(e=>e.type==='dissolve').length,2);
});
test('double hits survive first arrival, then explode at twice collision radius',()=>{
 const w=world();w.objects=[target(1,150)];w.fire(250,250);w.step(.1);assert.equal(w.objects.length,1);assert.equal(w.shots[0].hits.get(1).sides.size,1);
 w.step(.27);assert.equal(w.objects.length,0);const e=w.effects.find(e=>e.type==='explosion');assert.equal(e.r,30);
});
test('explosions intersect circle edges and oriented bar corners, with no chain reaction',()=>{
 const w=world();w.objects=[target(1,500),target(2,500,292,15),target(3,500,327,15),bar(4,530,280,Math.PI/4,40,8),bar(5,700,320)];
 w.fire(250,250);w.step(.37);assert.deepEqual(w.objects.map(o=>o.id),[3,5]);assert.equal(w.effects.filter(e=>e.type==='explosion').length,1);
 assert.equal(blastHits({x:0,y:0},30,target(6,45,0,15)),true);
 assert.equal(blastHits({x:0,y:0},30,target(6,45.1,0,15)),false);
 assert.equal(blastHits({x:0,y:0},30,bar(6,50,0,0,40,2)),true);
});
test('actual falling and rotating bars change collision geometry',()=>{
 const w=world();w.settings.barRotation=90;w.settings.barSpeed=20;w.objects=[bar(1,500,200,0)];w.step(1);
 assert.ok(Math.abs(w.objects[0].angle-Math.PI/2)<1e-10);assert.ok(Math.abs(w.objects[0].y-220)<1e-8);
 w.settings.barRotation=0;w.settings.barSpeed=0;w.fire(260,260);w.step(.2);
 assert.equal(w.shots.length,0);const sparks=w.effects.filter(e=>e.type==='spark');assert.equal(sparks.length,2);
 assert.ok(sparks.every(e=>Math.abs(e.x-500)<=5.01));
});
test('random density is monotonic, zero disables immediately, cap prevents excess objects',()=>{
 const counts=[];
 for(const density of [0,20,50,100]) {const w=world();w.settings.density=density;w.step(10);counts.push(w.objects.length);}
 assert.equal(counts[0],0);assert.ok(counts[1]>0&&counts[1]<counts[2]&&counts[2]<counts[3]);
 const w=world();w.configure('density',100);w.step(30);assert.equal(w.objects.length,MAX_OBJECTS);w.configure('density',0);w.step(5);assert.equal(w.objects.length,MAX_OBJECTS);
 assert.equal(w.settings.targetSize,defaults.targetSize);assert.equal(w.settings.barSpeed,0);
});
test('random positions and types; dimensions update live; objects leave bottom; clear',()=>{
 let seed=42;const w=new World(()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;});w.settings.density=0;
 for(let n=0;n<20;n++)w.spawn();assert.equal(new Set(w.objects.map(o=>o.type)).size,2);assert.equal(new Set(w.objects.map(o=>o.x)).size,20);
 assert.ok(w.objects.every(o=>o.x>=o.radius&&o.x<=1000-o.radius&&o.y<0));
 w.configure('targetSize',25);w.configure('barLength',140);assert.ok(w.objects.every(o=>o.type==='target'?o.radius===25:o.length===140));
 w.objects.forEach(o=>o.y=700);w.step(.01);assert.equal(w.objects.length,0);w.spawn();w.fire(200,200);w.clear();assert.equal(w.objects.length+w.shots.length+w.effects.length,0);
});
console.log(`${count} mechanic tests passed`);
