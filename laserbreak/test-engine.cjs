'use strict';
const assert=require('node:assert/strict');
const {World,Input,circleHit,barHit,blastHits,MAX_OBJECTS,MAX_PARTICLES,defaults,BAR_THICKNESS,spawnOverlaps,entryOverlaps}=require('./engine.js');
let count=0;
function test(name,run){run();count++;console.log('PASS:',name);}
function world(){const w=new World(()=>.5);Object.assign(w.settings,{density:0,targetSpeed:0,barSpeed:0,barRotation:0});return w;}
function target(id,x,y=250,radius=15){return {id,type:'target',x,y,radius,color:'#36fff3',speed:0,extent:radius};}
function bar(id,x,y=250,angle=0,length=100,thickness=10){return {id,type:'bar',x,y,angle,length,thickness,speed:0,rotation:0,extent:Math.hypot(length,thickness)/2};}
function finish(w){w.step(.6);}
function controls() {let shots=[];let ready=true;const i=new Input((a,b)=>shots.push([a,b]),()=>ready);return {i,shots,setReady:r=>ready=r};}
test('release-only: first and opposite contacts never fire on touch; movement and full re-arm',()=>{
 const {i,shots}=controls();i.down(1,'left',100);i.down(2,'left',150);i.move(1,180);i.down(3,'right',200);
 assert.equal(shots.length,0);i.up(3);assert.deepEqual(shots,[[180,200]]);
 i.down(4,'right',200);i.up(4);assert.equal(shots.length,1);[1,2].forEach(id=>i.up(id));
 i.down(5,'right',300);i.down(6,'left',400);assert.equal(shots.length,1);i.up(6);assert.deepEqual(shots[1],[400,300]);
});
test('release: aim, either release fires once, cancellation aborts',()=>{
 for(const first of [1,2]) {const {i,shots}=controls('release');i.down(1,'left',100);i.down(2,'right',200);
 assert.equal(shots.length,0);i.move(2,350);i.up(first);assert.deepEqual(shots,[[100,350]]);i.up(first===1?2:1);assert.equal(i.locked,false);}
 const {i,shots}=controls('release');i.down(1,'left',100);i.down(2,'right',100);i.up(1,true);i.up(2);assert.equal(shots.length,0);
});
test('release: unrelated third finger cannot fire; duplicate/unknown pointers ignored',()=>{
 const {i,shots}=controls('release');i.down(1,'left',100);i.down(1,'right',200);i.down(2,'right',150);i.down(3,'left',180);i.up(3);i.up(99);assert.equal(shots.length,0);i.up(2);assert.deepEqual(shots,[[100,150]]);
});
test('cooldown rejection locks gesture until every contact releases; pause freezes time',()=>{
 const w=world(),i=new Input((a,b)=>w.fire(a,b),()=>w.ready());
 i.down(1,'left',250);i.down(2,'right',250);assert.equal(w.effects.length,0);i.up(2);assert.equal(w.effects.length,1);i.up(1);
 i.down(1,'left',250);i.down(2,'right',250);i.up(2);w.step(.76);assert.equal(w.effects.length,0);
 i.down(2,'right',250);i.up(2);assert.equal(w.effects.length,0);i.up(1);
 i.down(1,'left',250);i.down(2,'right',250);i.up(1);assert.equal(w.effects.length,1);i.up(2);
 const time=w.time;w.paused=true;w.step(10);assert.equal(w.ready(),false);assert.equal(w.time,time);
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
test('instant beams cross a sloped line to opposite boundaries, without traveling state',()=>{
 const w=world();w.fire(100,400);
 assert.equal(w.shots,undefined);const beams=w.effects.find(e=>e.type==='flash').beams;
 assert.deepEqual(beams,[{from:{x:0,y:100},to:{x:1000,y:400}},{from:{x:1000,y:400},to:{x:0,y:100}}]);
});
test('each beam stops at its nearest bar; targets behind it survive',()=>{
 const w=world();w.objects=[bar(1,100),bar(2,800),target(3,20),target(4,950),target(5,450)];
 assert.equal(w.fire(250,250),true);assert.deepEqual(w.objects.map(o=>o.id),[1,2,5]);
 const beams=w.effects.find(e=>e.type==='flash').beams;assert.equal(beams[0].to.x,50);assert.equal(beams[1].to.x,850);
 assert.equal(w.effects.filter(e=>e.type==='dissolve').length,2);
});
test('bars past the midpoint still block beams crossing from either side',()=>{
 const w=world();w.objects=[bar(1,700)];w.fire(250,250);
 const beams=w.effects.find(e=>e.type==='flash').beams;assert.equal(beams[0].to.x,650);assert.equal(beams[1].to.x,750);
});
test('targets never block beams; single hits dissolve immediately',()=>{
 const w=world();w.objects=[target(1,100),target(2,200),target(3,850),bar(4,500)];w.fire(250,250);
 assert.deepEqual(w.objects.map(o=>o.id),[4]);assert.equal(w.effects.filter(e=>e.type==='dissolve').length,3);
 assert.equal(w.effects.some(e=>e.type==='explosion'),false);
});
test('targets away from midpoint explode immediately on double hit at selected blast radius',()=>{
 for(const x of [150,500,850]) {const w=world();w.objects=[target(1,x)];w.fire(250,250);
 assert.equal(w.objects.length,0);const e=w.effects.find(e=>e.type==='explosion');assert.equal(e.r,45);assert.equal(e.age,0);assert.equal(e.x,x);}
});
test('a blocking bar prevents double hits for targets beyond it',()=>{
 const w=world();w.objects=[bar(1,460,250,Math.PI/2),target(2,500)];w.fire(250,250);
 assert.equal(w.effects.filter(e=>e.type==='explosion').length,0);assert.equal(w.effects.filter(e=>e.type==='dissolve').length,1);
});
test('immediate blasts include circle edges and rotated bar corners with no chains',()=>{
 const w=world();w.objects=[target(1,500),target(2,500,292),target(3,500,327),bar(4,530,280,Math.PI/4,40,8),bar(5,700,320)];
 w.fire(250,250);assert.deepEqual(w.objects.map(o=>o.id),[3,5]);assert.equal(w.effects.filter(e=>e.type==='explosion').length,1);
 assert.equal(blastHits({x:0,y:0},30,target(6,45,0)),true);
 assert.equal(blastHits({x:0,y:0},30,target(6,45.1,0)),false);
 assert.equal(blastHits({x:0,y:0},30,bar(6,50,0,0,40,2)),true);
});
test('target defaults are diameter 40; bars are fixed solid 100x12 geometry',()=>{
 const w=new World(()=>.1);w.bag=['target'];w.spawn();assert.equal(w.objects[0].radius,20);assert.equal(w.objects[0].angle,undefined);
 w.random=()=>.9;w.bag=['bar'];w.spawn();const b=w.objects.find(o=>o.type==='bar');assert.equal(b.length,100);assert.equal(b.thickness,12);assert.equal(BAR_THICKNESS,12);
 assert.equal(defaults.barThickness,undefined);
});
test('settings snapshot size, speed, and rotation on spawn; current objects stay unchanged',()=>{
 const w=new World(()=>.1);w.bag=['target'];w.spawn();const t=w.objects[0],snapshot={...t};
 w.configure('targetSize',60);w.configure('targetSpeed',160);assert.deepEqual(t,snapshot);
 w.bag=['target'];w.spawn();assert.equal(w.objects[1].radius,30);assert.equal(w.objects[1].speed,160);
 w.random=()=>.9;w.bag=['bar'];w.spawn();const b=w.objects.at(-1),bs={...b};
 w.configure('barLength',200);w.configure('barSpeed',120);w.configure('barRotation',-90);assert.deepEqual(b,bs);
 w.bag=['bar'];w.spawn();const newBar=w.objects.at(-1);assert.equal(newBar.length,200);assert.equal(newBar.speed,120);assert.equal(newBar.rotation,-Math.PI/2);
 w.configure('density',0);w.step(.5);assert.equal(t.y,snapshot.y+snapshot.speed*.5);assert.equal(b.angle,bs.angle+bs.rotation*.5);
});
test('rotation and movement are updated once per frame using each object properties',()=>{
 const w=world(),b=bar(1,500,200);b.rotation=Math.PI/2;b.speed=20;let angle=0,sets=0;
 Object.defineProperty(b,'angle',{get:()=>angle,set:v=>{angle=v;sets++;}});w.objects=[b];
 w.step(1);assert.equal(sets,1);assert.equal(angle,Math.PI/2);assert.equal(b.y,220);
 w.fire(260,260);assert.equal(w.effects.filter(e=>e.type==='spark').length,2);
});
function seededWorld(){let seed=42;return new World(()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;});}
function advance(w,seconds){for(let t=0;t<seconds;t+=1/60)w.step(1/60);}
test('density zero stops immediately; higher density increases accepted spawn count',()=>{
 const counts=[];
 for(const density of [0,20,50,100]) {const w=seededWorld();w.configure('density',density);advance(w,5);counts.push(w.nextId-1);}
 assert.equal(counts[0],0);assert.ok(counts[1]>0&&counts[1]<counts[2]&&counts[2]<counts[3],counts);
 const w=seededWorld();w.configure('density',100);advance(w,3);const id=w.nextId;w.configure('density',0);advance(w,2);assert.equal(w.nextId,id);
 assert.equal(w.settings.targetSize,40);assert.equal(w.settings.barSpeed,32);
});
test('every new/initial object has rotation-safe clearance; alternate positions and skip',()=>{
 const w=seededWorld();w.start();assert.equal(w.objects.length,3);
 for(let i=0;i<w.objects.length;i++)for(let j=0;j<i;j++)assert.equal(spawnOverlaps(w.objects[i],w.objects[j]),false);
 w.configure('density',100);
 for(let frame=0;frame<900;frame++){
   const id=w.nextId;w.step(1/60);const fresh=w.objects.find(o=>o.id===id);
   if(fresh)for(const other of w.objects)if(fresh!==other)assert.equal(spawnOverlaps(fresh,other),false);
 }
 const same=new World(()=>.1);same.spawn(40);same.spawn(40);assert.equal(same.objects.length,2);assert.notEqual(same.objects[0].x,same.objects[1].x);
 same.objects=Array.from({length:11},(_,i)=>target(i,i*100,-12,100));assert.equal(same.spawn(),false);
});
test('entry corridor rejects a spawn above a stationary target, including rotating bar tips',()=>{
 const a=bar(1,500,-51,Math.PI/2);assert.equal(entryOverlaps(a,target(2,500,40)),true);
 assert.equal(entryOverlaps(a,target(2,700,40)),false);
 const w=new World(()=>.9);w.objects=[target(1,810,40)];w.spawn();
 const fresh=w.objects.at(-1);assert.equal(entryOverlaps(fresh,w.objects[0]),false);
});
test('active cap is enforced, objects fully leave bottom, effects stay bounded',()=>{
 const w=world();w.settings.density=100;
 w.objects=Array.from({length:MAX_OBJECTS},(_,id)=>target(id,500,450));assert.equal(w.spawn(),false);
 w.configure('density',0);w.objects[0].y=600;w.step(.01);assert.equal(w.objects.length,MAX_OBJECTS-1);
 w.clear();w.settings.cooldown=0;for(let n=0;n<500;n++)w.fire(100,100);assert.ok(w.effects.length<=160);
});
test('pause, stop, start, and orientation blocking freeze timing and gate firing',()=>{
 const w=seededWorld();w.start();advance(w,1);w.fire(250,250);w.paused=true;
 const snapshot=JSON.stringify({objects:w.objects,effects:w.effects,particles:w.particles,time:w.time,spawn:w.spawnClock});w.step(2);
 assert.equal(JSON.stringify({objects:w.objects,effects:w.effects,particles:w.particles,time:w.time,spawn:w.spawnClock}),snapshot);assert.equal(w.fire(200,200),false);
 w.paused=false;w.step(.1);assert.ok(w.time>1);w.stop();const t=w.time;w.step(10);assert.equal(w.time,t);assert.equal(w.objects.length+w.effects.length+w.particles.length,0);assert.equal(w.fire(1,1),false);
 w.start();assert.equal(w.objects.length,3);assert.equal(w.ready(),true);assert.equal(w.time,0);
 w.orientationBlocked=true;w.step(10);assert.equal(w.time,0);assert.equal(w.fire(1,1),false);
 w.orientationBlocked=false;w.step(.1);assert.equal(w.time,.1);
});
test('single hits fragment briefly; double hits have larger, faster, longer bursts',()=>{
 const single=world();single.objects=[target(1,150),bar(2,500)];single.fire(250,250);
 assert.equal(single.particles.length,6);
 const double=world();double.objects=[target(1,150)];double.fire(250,250);
 assert.equal(double.particles.length,14);
 assert.ok(double.particles[0].life>single.particles[0].life);
 assert.ok(Math.hypot(double.particles[0].vx,double.particles[0].vy)>Math.hypot(single.particles[0].vx,single.particles[0].vy));
 const p=double.particles[0],x=p.x;double.step(.1);assert.notEqual(p.x,x);assert.equal(p.age,.1);
 double.step(.4);assert.equal(double.particles.length,0);assert.equal(double.effects.length,0);
});
test('blast-destroyed bars emit shards without causing another explosion',()=>{
 const w=world();w.objects=[target(1,150),bar(2,170,279,0,20,12)];w.fire(250,250);
 assert.equal(w.objects.length,0);assert.equal(w.effects.filter(e=>e.type==='explosion').length,1);
 assert.equal(w.particles.filter(p=>p.color==='#9bb9cd').length,8);
});
test('particle cap, repeated bursts, pause freeze, stop/start and clear cleanup',()=>{
 const w=world();w.settings.cooldown=0;
 for(let shot=0;shot<20;shot++){w.objects=[target(shot+1,150)];w.fire(250,250);}
 assert.equal(w.particles.length,MAX_PARTICLES);const snapshot=JSON.stringify(w.particles);
 w.paused=true;w.step(1);assert.equal(JSON.stringify(w.particles),snapshot);
 w.paused=false;w.step(.5);assert.equal(w.particles.length,0);
 w.objects=[target(99,150)];w.fire(250,250);w.clear();assert.equal(w.particles.length,0);
 w.objects=[target(100,150)];w.fire(250,250);w.stop();assert.equal(w.particles.length,0);
 w.start();assert.equal(w.particles.length,0);
});
test('blast multiplier changes collision radius and ring together, snapshots at firing',()=>{
 for(const multiplier of [1,1.5,3,5]) {
   const w=world();w.settings.blastMultiplier=multiplier;
   w.objects=[target(1,250,250,20),target(2,250,250+20*multiplier+10,10),target(3,250,250+20*multiplier+10.1,10)];
   w.fire(250,250);const explosion=w.effects.find(e=>e.type==='explosion');
   assert.equal(explosion.r,20*multiplier);assert.deepEqual(w.objects.map(o=>o.id),[3]);
   w.configure('blastMultiplier',2);assert.equal(explosion.r,20*multiplier);
 }
 assert.equal(defaults.blastMultiplier,3);
});
test('six-target/four-bar shuffle bags, randomized order, failed placement retains entry',()=>{
 const w=seededWorld();const bags=[];
 for(let bag=0;bag<5;bag++) {
   const types=[];
   for(let n=0;n<10;n++){w.objects=[];assert.equal(w.spawn(),true);types.push(w.objects[0].type);}
   assert.equal(types.filter(t=>t==='target').length,6);assert.equal(types.filter(t=>t==='bar').length,4);bags.push(types.join(','));
 }
 assert.ok(new Set(bags).size>1);
 w.objects=Array.from({length:11},(_,id)=>target(id,id*100,-12,100));
 assert.equal(w.spawn(),false);const snapshot=[...w.bag],id=w.nextId;
 assert.equal(w.spawn(),false);assert.deepEqual(w.bag,snapshot);assert.equal(w.nextId,id);
 w.objects=[];assert.equal(w.spawn(),true);assert.equal(w.objects[0].type,snapshot.at(-1));assert.equal(w.bag.length,snapshot.length-1);
 w.configure('density',0);w.start();assert.equal(w.bag.length,0);assert.equal(w.objects.length,0);
 w.configure('density',20);w.start();assert.equal(w.bag.length,7);
});
test('0/40/70/100 percent ratios refill exact ten-object bags and preserve failed entries',()=>{
 assert.equal(defaults.barPercentage,40);
 for(const percentage of [0,40,70,100]) {
   const w=seededWorld();w.configure('barPercentage',percentage);
   for(let round=0;round<3;round++) {
     const types=[];
     for(let n=0;n<10;n++){w.objects=[];assert.equal(w.spawn(),true);types.push(w.objects[0].type);}
     assert.equal(types.filter(t=>t==='bar').length,percentage/10);
     assert.equal(types.filter(t=>t==='target').length,10-percentage/10);
   }
   w.objects=Array.from({length:11},(_,id)=>target(id,id*100,-12,100));
   assert.equal(w.spawn(),false);const pending=[...w.bag],id=w.nextId;
   assert.equal(w.spawn(),false);assert.deepEqual(w.bag,pending);assert.equal(w.nextId,id);
   w.objects=[];assert.equal(w.spawn(),true);assert.equal(w.objects[0].type,pending.at(-1));
 }
});
test('ratio change immediately replaces remaining bag, without altering live objects or timing',()=>{
 const w=seededWorld();w.start();const snapshot=JSON.stringify(w.objects),time=w.time,clock=w.spawnClock;
 assert.equal(w.bag.length,7);w.configure('barPercentage',70);
 assert.equal(w.bag.length,10);assert.equal(w.bag.filter(t=>t==='bar').length,7);
 assert.equal(JSON.stringify(w.objects),snapshot);assert.equal(w.time,time);assert.equal(w.spawnClock,clock);
 w.objects=[];w.spawn();const bag=[...w.bag];w.configure('barPercentage',70);assert.deepEqual(w.bag,bag);
 w.configure('barPercentage',0);assert.equal(w.bag.length,10);assert.ok(w.bag.every(t=>t==='target'));
 w.configure('barPercentage',100);assert.equal(w.bag.length,10);assert.ok(w.bag.every(t=>t==='bar'));
 w.start();assert.equal(w.bag.length,7);assert.ok(w.objects.every(o=>o.type==='bar'));
});
test('settings panel freezes clock and effects without modifying explicit session state',()=>{
 for(const state of ['active','paused','stopped']) {
   const w=seededWorld();w.start();w.fire(250,250);
   if(state==='paused')w.paused=true;if(state==='stopped')w.stop();
   const snapshot=JSON.stringify([w.objects,w.effects,w.particles,w.time,w.spawnClock,w.bag,w.running,w.paused]);
   w.settingsOpen=true;w.step(5);assert.equal(w.fire(100,100),false);
   assert.equal(JSON.stringify([w.objects,w.effects,w.particles,w.time,w.spawnClock,w.bag,w.running,w.paused]),snapshot);
   w.settingsOpen=false;assert.equal(w.running,state!=='stopped');assert.equal(w.paused,state==='paused');
 }
});
test('shot audio summary aggregates direct doubles, singles, and blast-destroyed bars',()=>{
 const w=world();w.objects=[target(1,150),bar(2,170,290,0,20,12)];w.fire(250,250);
 assert.deepEqual(w.lastShotSounds,{single:0,double:1,bars:1});
 const single=world();single.objects=[target(1,150),bar(2,500)];single.fire(250,250);
 assert.deepEqual(single.lastShotSounds,{single:1,double:0,bars:0});
});
test('frame update avoids collision geometry reads; 60-object update budget',()=>{
 const w=world();w.objects=Array.from({length:60},(_,id)=>target(id,id*16,0));
 for(const o of w.objects)Object.defineProperty(o,'radius',{get(){throw Error('collision work during frame update');}});
 const start=performance.now();for(let n=0;n<10000;n++)w.step(1/60);
 assert.ok(performance.now()-start<1500,'600k object updates exceeded broad regression budget');
});
console.log(`${count} mechanic tests passed`);
