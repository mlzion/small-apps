'use strict';
const assert=require('node:assert/strict'),E=require('./engine.js'),A=require('./attacks.js'),V=require('./appearance.js');
const DT=1/120,tick=(w,n,input={})=>{for(let i=0;i<n;i++)E.step(w,DT,input);};
const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
function world(level){
  const w=E.create(level,73);w.time=4;w.diveClock=w.shotClock=w.bossDiveClock=w.bossShotClock=1e9;
  w.enemies.forEach(e=>{e.mode='formation';e.x=e.homeX;e.y=e.homeY;});return w;
}
function hit(w,e){
  w.fireCooldown=0;E.step(w,DT,{fire:true});const s=w.shots.at(-1);s.x=e.x;s.y=e.y+1;s.vx=0;s.vy=-440;E.step(w,DT);
}
const baseline=require('./fixtures/v02-levels.json');
baseline.forEach((old,i)=>Object.entries(old).forEach(([key,value])=>assert.equal(E.LEVELS[i][key],value,`preserve v0.2 sector ${i+1} ${key}`)));
for(let i=20;i<30;i++){
  const p=E.LEVELS[i-1],c=E.LEVELS[i];
  assert.ok(c.diveSpeed>p.diveSpeed&&c.diveSpeed/p.diveSpeed<1.01);
  assert.ok(c.bulletSpeed>p.bulletSpeed&&c.bulletSpeed/p.bulletSpeed<1.01);
  assert.ok(c.shotInterval<p.shotInterval&&p.shotInterval/c.shotInterval<1.01);
  assert.equal(c.columns*c.rows,28);assert.equal(c.playerCooldown,E.LEVELS[19].playerCooldown);
}
const specs={5:[4,500],10:[6,750],15:[8,1000],20:[10,1250],25:[12,1500],30:[15,2000]};
for(let level=1;level<=30;level++){
  const w=world(level),boss=w.enemies.find(e=>e.boss);
  assert.equal(w.enemies.filter(e=>e.boss).length,level%5===0?1:0);
  if(!boss)continue;
  const [hp,points]=specs[level];assert.equal(boss.hp,hp);assert.equal(boss.maxHp,hp);assert.equal(boss.points,points);
  assert.equal(boss.homeX,180);assert.ok(w.enemies.filter(e=>!e.boss).every(e=>e.homeY-boss.homeY>=40));
  w.enemies=[boss];tick(w,1);assert.equal(w.state,'playing','a living boss blocks sector completion');
  for(let i=0;i<hp-1;i++){hit(w,boss);assert.equal(w.state,'playing');assert.ok(w.cues.includes('bossHit'));assert.equal(w.killScore,0);}
  hit(w,boss);assert.equal(w.killScore,points);assert.equal(w.clearBonus,750);assert.equal(w.state,'cleared');
  assert.ok(w.cues.includes('bossDestroy'));assert.ok(w.cues.includes(level===30?'finalVictory':'victory'));
  assert.ok(w.particles.length>=54,'larger boss explosion');tick(w,1);assert.equal(w.cues.length,0,'no repeated terminal events');
}
let w=world(30),boss=w.enemies.find(e=>e.boss);w.enemies=[boss];boss.hp=1;
for(let i=0;i<5;i++){w.fireCooldown=0;tick(w,1,{fire:true});}
let s=w.shots.at(-1);s.x=boss.x;s.y=boss.y+1;s.vx=0;s.vy=-440;tick(w,1);assert.equal(w.killScore,800,'boss points use killing action accuracy');
for(const level of [5,10,15,20,25,30]){
  w=world(level);boss=w.enemies.find(e=>e.boss);w.invulnerable=100;w.bossDiveClock=0;tick(w,1);
  assert.equal(boss.mode,'telegraph');assert.equal(boss.group.target,null);tick(w,100);assert.equal(boss.mode,'telegraph');
  while(boss.mode==='telegraph')tick(w,1);
  const target={...boss.group.target};E.move(w,18,424);let peak=0,cues=new Set(),bullets=0;
  for(let i=0;i<700&&boss.mode!=='formation';i++){
    tick(w,1);peak=Math.max(peak,boss.y);w.cues.forEach(c=>cues.add(c));bullets=Math.max(bullets,w.bullets.filter(b=>b.sourceType===4).length);
    if(boss.group)assert.deepEqual(boss.group.target,target);
  }
  assert.equal(boss.mode,'formation');assert.ok(peak>180&&peak<218);assert.ok(cues.has('enemyFire'));
  assert.equal(bullets,level>=20?2:1);near(boss.x,boss.homeX+Math.sin(w.time*1.1)*w.config.sway);
  w.bossShotClock=0;w.shotClock=0;tick(w,1);
  assert.ok(w.bullets.some(b=>b.sourceType===4)&&w.bullets.some(b=>b.sourceType!==4),'boss and normal formation can both fire');
}
console.log('PASS: v0.2 parameter preservation, gradual new sectors, exactly six rear bosses, HP/value/accuracy/completion, boss warnings/attacks/returns and explosion cues');

function forcePattern(level,kind){
  const q=world(level);q.enemies=q.enemies.filter(e=>!e.boss);q.config={...q.config,kamikazeChance:kind==='kamikaze'?1:0,fileChance:kind==='file'?1:0};
  q.diveClock=0;tick(q,1);q.diveClock=1e9;return q;
}
w=forcePattern(21,'kamikaze');let e=w.enemies.find(e=>e.pattern==='kamikaze');let g=e.group;
w.enemies=[e];w.invulnerable=0;tick(w,85);assert.equal(e.mode,'telegraph');assert.equal(g.target,null);
E.move(w,230,410);while(e.mode==='telegraph')tick(w,1);
assert.deepEqual(g.target,{x:230,y:410});const target={...g.target},launched=w.time;
E.move(w,18,249.6);let closest=Infinity,arrival=0,previous={x:e.x,y:e.y},speeds=[];
for(let i=0;i<1000&&e.mode!=='formation';i++){
  tick(w,1);assert.deepEqual(g.target,target,'kamikaze does not home');
  if(e.mode==='dive'){
    near((e.x-e.origin.x)*e.direction.y-(e.y-e.origin.y)*e.direction.x,0,1e-6);
    const d=Math.hypot(e.x-target.x,e.y-target.y);if(d<closest){closest=d;arrival=w.time-launched;}
    if(e.age>.05)speeds.push(Math.hypot(e.x-previous.x,e.y-previous.y)/DT);
  }
  previous={x:e.x,y:e.y};
}
assert.ok(closest<5&&arrival>1,'target is reached with time for a dodge');assert.equal(w.lives,3);assert.equal(e.mode,'formation');
assert.ok(speeds.at(-1)>speeds[0]*2&&Math.max(...speeds)<431,'rapid acceleration with a speed limit');
near(e.x,e.homeX+Math.sin(w.time*1.1)*w.config.sway);
w=forcePattern(21,'kamikaze');e=w.enemies.find(e=>e.pattern==='kamikaze');w.enemies=[e];w.invulnerable=0;
for(let i=0;i<800&&e.mode!=='formation';i++)tick(w,1);assert.equal(w.lives,2,'an undodged kamikaze is a real threat');
const rates=[];
for(const level of [21,25,30]){
  const q=world(level),ready=q.enemies.filter(x=>!x.boss);
  for(let i=0;i<2000;i++){ready.forEach(x=>{x.mode='formation';x.pattern=null;});A.scheduleSpecial(q,ready);}
  rates.push(q.attackStats.kamikaze);
}
assert.ok(rates[0]<rates[1]&&rates[1]<rates[2]);assert.equal(E.LEVELS[19].kamikazeChance,0);assert.equal(E.LEVELS[22].fileChance,0);
console.log('PASS: sector-21 introduction, recognizable warning, launch-time snapshot, acceleration, dodge opportunity, stationary hit, return and gradual kamikaze frequency');

for(const [level,count] of [[24,3],[27,4],[30,5]]){
  w=forcePattern(level,'file');const column=w.enemies.filter(x=>x.pattern==='file').sort((a,b)=>a.fileIndex-b.fileIndex);g=column[0].group;
  assert.equal(column.length,count);assert.ok(column.every(x=>x.group===g));w.enemies=column;w.invulnerable=100;
  const origins=column.map(x=>({x:x.homeX,y:x.homeY})),samples=column.map(()=>new Map());let minGap=Infinity,minJoin=Infinity;
  tick(w,90);E.move(w,225,410);
  for(let i=0;i<1500;i++){
    tick(w,1);
    if(g.target)assert.deepEqual(g.target,{x:225,y:410},'one launch target for the entire column');
    column.forEach((x,j)=>{if(x.mode==='dive'&&x.age>.72)samples[j].set(Math.round(x.age/DT),{x:x.x,y:x.y});});
    const divers=column.filter(x=>x.mode==='dive');
    for(let a=0;a<divers.length;a++)for(let b=a+1;b<divers.length;b++)minJoin=Math.min(minJoin,Math.hypot(divers[a].x-divers[b].x,divers[a].y-divers[b].y));
    const lower=column.filter(x=>x.mode==='dive'&&x.y>249.6);
    for(let j=1;j<lower.length;j++)minGap=Math.min(minGap,Math.hypot(lower[j].x-lower[j-1].x,lower[j].y-lower[j-1].y));
    if(column.every(x=>x.mode==='formation'))break;
  }
  assert.ok(minJoin>46,'staging approaches do not overlap');
  assert.ok(minGap>60,'column ships stay more than two collision diameters apart');
  for(let j=1;j<count;j++){
    let compared=0;for(const [age,pos] of samples[j])if(samples[0].has(age)){const lead=samples[0].get(age);near(pos.x,lead.x);near(pos.y,lead.y);compared++;}
    assert.ok(compared>200,'followers trace the same centerline at delayed times');
  }
  column.forEach((x,i)=>{assert.equal(x.mode,'formation');assert.equal(x.homeX,origins[i].x);assert.equal(x.homeY,origins[i].y);});
}
// A depleted back row can queue from the next upper row, with wider spacing.
w=world(30);w.enemies=w.enemies.filter(x=>!x.boss&&x.homeY===118);w.config={...w.config,fileChance:1,kamikazeChance:0};w.diveClock=0;tick(w,1);w.diveClock=1e9;
assert.equal(w.lastAttack.origin.y,190);assert.ok(w.lastAttack.spacing>.5);
let gap=Infinity;w.invulnerable=100;
for(let i=0;i<1000;i++){tick(w,1);const es=w.enemies.filter(x=>x.mode==='dive');for(let a=0;a<es.length;a++)for(let b=a+1;b<es.length;b++)gap=Math.min(gap,Math.hypot(es[a].x-es[b].x,es[a].y-es[b].y));}
assert.ok(gap>46);
w=world(24);w.enemies=w.enemies.slice(0,2);w.config={...w.config,fileChance:1,kamikazeChance:0};w.diveClock=0;tick(w,1);assert.equal(w.attackStats.file,0,'a depleted formation never launches a one/two-ship column');
console.log('PASS: sectors 24/27/30 introduce 3/4/5-member columns with one target, shared delayed path, safe spacing and original formation return');

assert.equal(V.weaponStyle({rapid:0,spread:0},0).color,null);
assert.equal(V.weaponStyle({rapid:8,spread:0},0).color,'#ffda63');assert.equal(V.weaponStyle({rapid:0,spread:10},0).color,'#75acff');
const blend=V.weaponStyle({rapid:8,spread:10},0).color;assert.notEqual(blend,'#ffda63');assert.notEqual(blend,'#75acff');
const flashes=[];for(let i=0;i<120;i++)flashes.push(V.weaponStyle({rapid:2-i/60,spread:0},0).rapid);
assert.ok(flashes.filter((v,i)=>i&&v!==flashes[i-1]).length>=10,'multiple final-two-second flashes');
assert.equal(V.weaponStyle({rapid:1.8,spread:8},0).color,'#75acff','flashing rapid leaves stable spread visible');
assert.equal(V.weaponStyle({rapid:8,spread:1.8},0).color,'#ffda63');
assert.equal(V.weaponStyle({rapid:0,spread:0},10).hull,'#9eb6dc');
assert.deepEqual(V.weaponStyle({rapid:1.2,spread:1.6},3),V.weaponStyle({rapid:1.2,spread:1.6},3),'paused visuals remain stable');
console.log('PASS: yellow/blue/blended power colors, expiration flashing and correct remaining/normal color restoration');

w=world(4);let armor=w.enemies.find(x=>x.type===2);w.enemies=[armor];
w.fireCooldown=0;tick(w,1,{fire:true});assert.ok(w.cues.includes('fire'));
s=w.shots.at(-1);s.x=armor.x;s.y=armor.y+1;s.vx=0;s.vy=-440;tick(w,1);assert.ok(w.cues.includes('hit')&&!w.cues.includes('destroy'));
hit(w,armor);assert.ok(w.cues.includes('destroy')&&w.cues.includes('victory'));
w=world(1);w.shotClock=0;tick(w,1);assert.ok(w.cues.includes('enemyFire'));w.diveClock=0;tick(w,1);e=w.enemies.find(x=>x.mode==='telegraph');
while(e.mode==='telegraph')tick(w,1);assert.ok(w.cues.includes('dive'));
w.invulnerable=0;w.shield=true;w.bullets=[{x:w.player.x,y:w.player.y-1,speed:100}];tick(w,1);assert.ok(w.cues.includes('shield')&&!w.cues.includes('damage'));
w.invulnerable=0;w.lives=1;w.bullets=[{x:w.player.x,y:w.player.y-1,speed:100}];tick(w,1);assert.ok(w.cues.includes('damage')&&w.cues.includes('defeat'));
tick(w,1);assert.equal(w.cues.length,0);
console.log('PASS: player/enemy fire, nonlethal hit, destruction, dive, shield, damage, victory and defeat emit the correct one-step audio cues');

let maxBullets=0;
for(const level of [5,10,15,20,21,24,25,27,30]){
  const a=E.create(level,271),b=E.create(level,271);
  for(let i=0;i<120*180;i++){
    a.invulnerable=b.invulnerable=1;
    const input={dx:Math.sin(i/140),fire:i%7<4};E.step(a,DT,input);V.weaponStyle(a.effects,a.time);E.step(b,DT,input);
    maxBullets=Math.max(maxBullets,a.bullets.length);
    assert.ok(a.bullets.length<=10&&a.shots.length<40&&a.particles.length<=240,'bounded representative combat');
    a.events.length=b.events.length=0;
    if(a.state!=='playing')break;
  }
  assert.equal(JSON.stringify(a),JSON.stringify(b),'visuals do not change deterministic state');assert.equal(a.random(),b.random());
}
assert.ok(maxBullets>2);console.log('PASS: deterministic 3-minute combat runs including bosses and all new attacks; peak live enemy projectiles:',maxBullets);
