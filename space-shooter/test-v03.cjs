// Retained v0.3 attack regressions; new boss/reward/weapon semantics live in test-v04.
'use strict';
const assert=require('node:assert/strict'),A=require('./attacks.js');
const {E,DT,tick,controlled}=require('./test-helpers.cjs');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
require('./fixtures/v02-levels.json').forEach((old,i)=>Object.entries(old).forEach(([k,v])=>assert.equal(E.LEVELS[i][k],v)));
for(const [level,count,loops] of [[11,1,false],[12,1,false],[13,1,true],[14,1,true],[15,2,true],[18,2,true],[19,3,true],[20,3,true]]){
  const w=controlled(level);w.enemies=w.enemies.filter(e=>e.type===3).slice(0,count);w.diveClock=0;tick(w,1);w.diveClock=1e6;
  const group=w.enemies.slice();assert.equal(group.length,count);assert.ok(group.every(e=>e.mode==='telegraph'&&e.loop===loops));tick(w,80);assert.ok(group.every(e=>e.mode==='telegraph'));
  tick(w,12);assert.ok(group.every(e=>e.mode==='dive'));let rising=false,last=group[0].y,returned=false;
  for(let i=0;i<1100;i++){
    tick(w,1);if(group[0].mode==='dive'&&group[0].y<last-.001)rising=true;last=group[0].y;
    const lower=group.filter(e=>e.mode==='dive'&&e.y>249);for(let j=1;j<lower.length;j++)assert.ok(lower[j].x-lower[j-1].x>=90);
    if(group.every(e=>e.mode==='return')){returned=true;break;}
  }
  assert.equal(rising,loops);assert.ok(returned);tick(w,160);assert.ok(group.every(e=>e.mode==='formation'));
}
function force(level,kind){const w=controlled(level,73);w.time=4;w.config={...w.config,fileChance:kind==='file'?1:0,kamikazeChance:kind==='kamikaze'?1:0};w.diveClock=0;tick(w,1);w.diveClock=1e6;return w;}
let w=force(21,'kamikaze'),e=w.enemies.find(x=>x.pattern==='kamikaze'),g=e.group;w.enemies=[e];w.invulnerable=0;
tick(w,85);assert.equal(e.mode,'telegraph');assert.equal(g.target,null);E.move(w,230,410);while(e.mode==='telegraph')tick(w,1);
assert.deepEqual(g.target,{x:230,y:410});const target={...g.target},start=w.time;E.move(w,18,249.6);let closest=Infinity,arrival=0;
for(let i=0;i<1000&&e.mode!=='formation';i++){tick(w,1);assert.deepEqual(g.target,target);if(e.mode==='dive'){near((e.x-e.origin.x)*e.direction.y-(e.y-e.origin.y)*e.direction.x,0);const d=Math.hypot(e.x-target.x,e.y-target.y);if(d<closest){closest=d;arrival=w.time-start;}}}
assert.ok(closest<5&&arrival>1);assert.equal(w.lives,3);assert.equal(e.mode,'formation');
w=force(21,'kamikaze');e=w.enemies.find(x=>x.pattern==='kamikaze');w.enemies=[e];w.invulnerable=0;for(let i=0;i<800&&e.mode!=='formation';i++)tick(w,1);assert.equal(w.lives,2);
for(const [level,count] of [[24,3],[27,4],[30,5]]){
  w=force(level,'file');const column=w.enemies.filter(x=>x.pattern==='file').sort((a,b)=>a.fileIndex-b.fileIndex);g=column[0].group;assert.equal(column.length,count);w.enemies=column;
  const samples=column.map(()=>new Map());let minGap=Infinity,minJoin=Infinity;
  for(let i=0;i<1500;i++){
    tick(w,1);column.forEach((x,j)=>{if(x.mode==='dive'&&x.age>.72)samples[j].set(Math.round(x.age/DT),{x:x.x,y:x.y});});
    const divers=column.filter(x=>x.mode==='dive');for(let a=0;a<divers.length;a++)for(let b=a+1;b<divers.length;b++)minJoin=Math.min(minJoin,Math.hypot(divers[a].x-divers[b].x,divers[a].y-divers[b].y));
    const lower=divers.filter(x=>x.y>249.6);for(let j=1;j<lower.length;j++)minGap=Math.min(minGap,Math.hypot(lower[j].x-lower[j-1].x,lower[j].y-lower[j-1].y));
    if(column.every(x=>x.mode==='formation'))break;
  }
  assert.ok(minJoin>46&&minGap>60);assert.ok(column.every(x=>x.mode==='formation'));
  for(let j=1;j<count;j++){let n=0;for(const [age,pos] of samples[j])if(samples[0].has(age)){near(pos.x,samples[0].get(age).x);near(pos.y,samples[0].get(age).y);n++;}assert.ok(n>200);}
}
console.log('PASS: retained first-20 configs, curved/looping/synchronized dives, locked kamikaze targeting/dodge/hit and 3/4/5-ship shared-path spacing/return');
