'use strict';
const assert=require('node:assert/strict');
const {World,defaults}=require('./engine.js');
const {CONFIG,generateLevel,defenseResult,ArcadeSession}=require('./arcade.js');
const {attempt,MODELS,random}=require('./simulate-arcade.cjs');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS:',name);}
function setup(n=1){const w=new World(random(42)),s=new ArcadeSession(w);s.setMode('arcade');s.begin(n);return {w,s};}
function target(id,x,y,radius=20){return {id,type:'target',x,y,radius,extent:radius,speed:0,color:'#36fff3'};}
function bar(id,x,y){return {id,type:'bar',x,y,length:20,thickness:12,angle:0,rotation:0,speed:0,extent:12};}
test('pure deterministic generation and bounded extension through 50 levels',()=>{
 for(let n=1;n<=50;n++){
  const a=generateLevel(n);assert.deepEqual(a,generateLevel(n));assert.equal(a.duration,45);assert.ok(a.requiredDestructionPercent>=40&&a.requiredDestructionPercent<=80);assert.equal(a.required,undefined);
  assert.ok(a.settings.targetSize>=24&&a.settings.targetSize<=40);assert.ok(a.settings.density>=20&&a.settings.density<=60);
  assert.ok(a.settings.barPercentage%10===0&&a.settings.barPercentage<=60);assert.ok(a.settings.targetSpeed<=140&&a.settings.barSpeed<=110);
  assert.equal(a.settings.blastMultiplier,3);assert.equal(a.settings.barLength,100);
 }
 for(const n of [0,-1,1.5,NaN,Infinity])assert.throws(()=>generateLevel(n),RangeError);
 assert.equal(CONFIG.levelCount,25);
});
test('budget adjusts at most one extra setting per step and has plateaus',()=>{
 for(let n=2;n<=25;n++){
  const prev=generateLevel(n-1),next=generateLevel(n),keys=['density','barPercentage','targetSize','barRotation'];
  const changes=keys.filter(k=>prev.settings[k]!==next.settings[k]);assert.ok(changes.length<=1);
  assert.ok(Math.abs(next.settings.targetSpeed/prev.settings.targetSpeed-1.02)<1e-10);
  if((n-1)%CONFIG.plateauEvery===0)assert.equal(changes.length,0);
 }
});
test('Free Play retains settings and ordinary indefinite start/stop behavior',()=>{
 const w=new World(random(4));w.configure('density',70);w.configure('targetSize',54);const original={...w.settings};
 const s=new ArcadeSession(w);s.step(70);assert.equal(s.mode,'free');assert.equal(s.state,'playing');assert.equal(w.time,70);
 s.setMode('arcade');assert.equal(s.state,'ready');assert.equal(w.ready(),false);s.step(10);assert.equal(s.remaining,45);
 w.settings.sound=false;s.setMode('free');assert.deepEqual(w.settings,{...original,sound:false});assert.equal(w.arcadeBlocked,false);assert.equal(w.running,true);
 s.stop();assert.equal(w.running,false);s.start();assert.equal(w.running,true);
});
test('45 active seconds, exact terminal gate, retry then next-level transition',()=>{
 const {w,s}=setup();s.step(44.9);assert.equal(s.state,'playing');s.step(.2);assert.equal(s.state,'retry');assert.ok(Math.abs(s.elapsed-45)<1e-8);
 assert.equal(w.fire(100,100),false);assert.equal(s.lastResult.passed,false);s.begin(1);assert.equal(w.stats.targets,0);assert.equal(s.remaining,45);
 w.stats.targets=10;s.step(44);assert.equal(s.state,'playing');s.step(1);assert.equal(s.state,'between');assert.equal(s.lastResult.passed,true);
 s.begin(s.level.number+1);assert.equal(s.level.number,2);assert.equal(w.time,0);assert.equal(s.elapsed,0);assert.equal(w.stats.shots,0);
});
test('direct and blast targets count once; bars and repeated hits do not count',()=>{
 const {w,s}=setup();w.clear();w.settings.cooldown=0;
 w.objects=[target(1,150,250),target(2,150,320,15),target(3,150,390,15),bar(4,175,300)];
 w.fire(250,250);assert.equal(w.stats.targets,2);assert.deepEqual(w.objects.map(o=>o.id),[3]);
 w.fire(250,250);assert.equal(w.stats.targets,2);w.objects.push(bar(5,500,250));w.fire(250,250);assert.equal(w.stats.targets,2);assert.equal(w.stats.blockedShots,1);
 assert.equal(w.stats.shots,3);assert.equal(s.state,'playing');
});
test('Setup, pause, stopped state and portrait freeze countdown/cooldown',()=>{
 for(const gate of ['paused','settingsOpen','orientationBlocked']){
  const {w,s}=setup();s.step(1);const time=w.time,remain=s.remaining;w[gate]=true;s.step(20);assert.equal(w.time,time);assert.equal(s.remaining,remain);
  w[gate]=false;s.step(1);assert.equal(s.remaining,remain-1);
 }
 const {w,s}=setup(4);s.step(3);s.stop();s.step(50);assert.equal(s.remaining,42);assert.equal(w.objects.length,0);s.start();assert.equal(s.level.number,4);assert.equal(s.remaining,45);
});
test('selected levels reset timer, stats, objects, cooldown and shuffle bag',()=>{
 const {w,s}=setup(2);s.step(5);w.stats.targets=20;w.stats.shots=9;w.bag=['bar'];const objects=[...w.objects];
 s.begin(9);assert.equal(s.level.number,9);assert.equal(s.remaining,45);assert.equal(w.stats.targets,0);assert.equal(w.stats.shots,0);assert.equal(w.ready(),true);
 assert.ok(w.objects.every(o=>!objects.includes(o)));assert.equal(w.bag.length,7);assert.equal(w.objects.length,3);
 const types=[...w.bag,...w.objects.map(o=>o.type)];assert.equal(types.filter(t=>t==='bar').length,s.level.settings.barPercentage/10);
 assert.throws(()=>s.begin(26),RangeError);
});
test('25 successful levels reach victory; restart returns to Level 1',()=>{
 const {w,s}=setup();for(let n=1;n<=25;n++){assert.equal(s.level.number,n);w.stats.targets=10;s.step(45);assert.equal(s.state,n===25?'victory':'between');if(n<25)s.begin(n+1);}
 assert.equal(w.fire(200,200),false);s.begin(1);assert.equal(s.state,'playing');assert.equal(s.remaining,45);assert.equal(w.stats.targets,0);
});
test('slow frame advances active clock but only one bounded motion update',()=>{
 const {w,s}=setup();w.clear();w.objects=[target(1,200,100)];w.objects[0].speed=50;s.step(2);assert.equal(s.remaining,43);assert.equal(w.time,2);assert.equal(w.objects[0].y,105);
});
test('seeded player attempts reproduce production mechanics and outcomes',()=>{
 const a=attempt(5,MODELS[0],1234),b=attempt(5,MODELS[0],1234);assert.deepEqual(a,b);assert.ok(a.shots>0&&a.targets>0);assert.ok(a.blocked<=a.shots);
});
test('Levels 1–10 preserve every gameplay setting; 11–25 continue the same bounded progression',()=>{
 const legacy=require('./fixtures/pre-defense-settings.json');for(const l of legacy.levels)assert.deepEqual(generateLevel(l.number).settings,l.settings);
 assert.ok(Math.abs(generateLevel(11).settings.targetSpeed/generateLevel(10).settings.targetSpeed-1.02)<1e-10);
 const early=generateLevel(10).settings,late=generateLevel(25).settings;
 assert.ok(late.targetSpeed>early.targetSpeed&&late.density>early.density&&late.barPercentage>early.barPercentage&&late.targetSize<early.targetSize&&late.barRotation>early.barRotation);
});
test('generated threshold uses the budget, plateaus on hard steps, reaches 40 to 80 smoothly',()=>{
 assert.equal(generateLevel(1).requiredDestructionPercent,40);assert.equal(generateLevel(25).requiredDestructionPercent,80);
 for(let n=2;n<=25;n++){
  const a=generateLevel(n-1),b=generateLevel(n),delta=b.requiredDestructionPercent-a.requiredDestructionPercent;
  assert.ok(delta>=0&&delta<=4);
  if(b.settings.targetSize<a.settings.targetSize||b.settings.barPercentage>a.settings.barPercentage)assert.equal(delta,0);
 }
});
test('defense math: resolved only, exact threshold, zero cannot pass, and threshold varies by level',()=>{
 assert.deepEqual(defenseResult({targets:0,escaped:0},40),{resolved:0,percent:null,passed:false});
 assert.equal(defenseResult({targets:4,escaped:1},80).passed,true);assert.equal(defenseResult({targets:3,escaped:1},80).passed,false);
 assert.equal(defenseResult({targets:2,escaped:3},40).passed,true);assert.equal(defenseResult({targets:2,escaped:3},41.9).passed,false);
 assert.equal(defenseResult({targets:419,escaped:581},41.9).passed,true);
});
test('escape boundary counts each target once, never bars or active circles; Free Play is unchanged',()=>{
 const {w,s}=setup();w.clear();w.configure('density',0);
 const active=target(1,100,w.height+20),escaped=target(2,200,w.height+20.01),obstacle=bar(3,300,w.height+30);
 w.objects=[active,escaped,obstacle];s.step(.01);assert.equal(w.stats.escaped,1);assert.deepEqual(w.objects.map(o=>o.id),[1]);
 assert.equal(w.effects.filter(e=>e.type==='escape').length,1);assert.equal(w.effects[0].x,200);assert.equal(w.effects[0].y,w.height);
 s.step(.01);assert.equal(w.stats.escaped,1);
 active.speed=2;s.step(.01);assert.equal(w.stats.escaped,2);w.clear();w.fire(200,200);assert.equal(w.stats.escaped,2);
 s.setMode('free');w.objects=[target(99,200,w.height+30)];w.step(.01);assert.equal(w.stats.escaped,0);assert.equal(w.effects.some(e=>e.type==='escape'),false);
});
test('no early loss, recovery, unresolved targets ignored, and full-circle exit cannot double count a hit',()=>{
 const {w,s}=setup(25);w.clear();w.configure('density',0);w.stats.targets=1;w.stats.escaped=9;s.step(1);assert.equal(s.state,'playing');
 w.stats.targets=40;s.step(43);assert.equal(s.state,'playing');w.objects=[target(44,200,100)];s.step(1);
 assert.equal(s.state,'victory');assert.equal(s.lastResult.percent,40/49*100);assert.equal(s.lastResult.resolved,49);
 s.begin(25);w.clear();w.configure('density',0);s.step(45);assert.equal(s.state,'retry');assert.equal(s.lastResult.percent,null);
 s.begin(1);w.clear();w.configure('density',0);w.objects=[target(55,150,w.height+10)];w.fire(w.height,w.height);assert.equal(w.stats.targets,1);s.step(.1);assert.equal(w.stats.escaped,0);
});
test('warning once per downward crossing, suppressed below five, recovery does not warn',()=>{
 const {w,s}=setup(25);w.clear();w.configure('density',0);
 const escape=()=>{w.objects=[target(w.nextId++,200,w.height+30)];s.step(.01);};
 w.stats.targets=1;escape();assert.equal(s.warningCount,0);escape();escape();escape();assert.equal(s.warningCount,0);
 w.stats.targets=16;assert.equal(s.defense.passed,true);escape();assert.equal(s.warningCount,1);
 escape();assert.equal(s.warningCount,1);w.stats.targets=24;s.step(.01);assert.equal(s.warningCount,1);
 escape();assert.equal(s.warningCount,2);s.begin(2);assert.equal(s.warningCount,0);assert.equal(w.stats.escaped,0);
 w.clear();w.configure('density',0);w.stats.targets=3;w.stats.escaped=4;assert.equal(s.defense.passed,true);escape();assert.equal(s.warningCount,1); // 37.5% crosses Level 2's 41.9%, not a fixed 80%.
});
test('committed simulation covers 7,500 attempts with current formulas and consistent outcomes',()=>{
 const data=require('./arcade-simulation.json');assert.deepEqual(data.config,CONFIG);assert.deepEqual(data.models,MODELS);
 assert.equal(data.results.length,CONFIG.levelCount*MODELS.length);assert.deepEqual(data.levels,Array.from({length:CONFIG.levelCount},(_,i)=>generateLevel(i+1)));
 for(const row of data.results){
  assert.ok(row.attempts>=100);const entries=Object.entries(row.histogram).map(([key,count])=>({targets:Number(key.split(':')[0]),escaped:Number(key.split(':')[1]),count}));
  assert.equal(entries.reduce((n,r)=>n+r.count,0),row.attempts);
  const wins=entries.reduce((n,r)=>n+(defenseResult(r,data.levels[row.level-1].requiredDestructionPercent).passed?r.count:0),0);
  assert.equal(wins/row.attempts,row.completion);assert.equal(entries.reduce((n,r)=>n+r.targets*r.count,0)/row.attempts,row.targets);
  assert.equal(entries.reduce((n,r)=>n+r.escaped*r.count,0)/row.attempts,row.escaped);
 }
});
console.log(`${passed} Arcade tests passed`);
