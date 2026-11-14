'use strict';
const assert=require('node:assert/strict'),A=require('./attacks.js');
const {E,W,DT,tick,controlled,action,impact,killAll}=require('./test-helpers.cjs');
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
assert.equal(E.LEVELS.length,40);
for(let level=1;level<=40;level++){
  const w=controlled(level,42),c=w.config;
  assert.equal(w.enemies.length,c.rows*c.columns);assert.ok(w.enemies.every(e=>!e.boss));
  assert.equal(w.enemies.filter(e=>e.type===2).length,c.armored);assert.equal(w.enemies.filter(e=>e.type===3).length,c.loopers);
  const base=w.enemies.reduce((n,e)=>n+E.TYPES[e.type].points,0)+(A.BOSSES[level]?.[1]||0);
  killAll(w);assert.equal(w.state,'cleared');assert.equal(w.kills,w.total);
  assert.equal(w.killScore,base);assert.equal(w.clearBonus,750);assert.equal(w.score,base+750+w.bonusScore);
  const time=w.time;tick(w,10);assert.equal(w.time,time);assert.equal(E.create(level).attempts,0);
  if(level>1){const p=E.LEVELS[level-2];assert.ok(c.diveSpeed>p.diveSpeed&&c.bulletSpeed>p.bulletSpeed&&c.shotInterval<p.shotInterval);}
}
console.log('PASS: all 40 formations/bosses/announcements clear, base points, separate bonuses and terminal freeze');
let w=controlled();E.move(w,-100,900);tick(w,240);near(w.player.x,18);near(w.player.y,455);
E.move(w,900,-100);tick(w,240);near(w.player.x,342);near(w.player.y,E.H*.52);
function jitter(source){const q=controlled(),p=[];for(let i=0;i<120;i++){E.move(q,180+(i%2?1:-1),424,source);tick(q,1);p.push(q.player.x);}return Math.max(...p)-Math.min(...p);}
assert.ok(jitter('drag')<jitter('direct')*.35);w=controlled();E.move(w,260,424,'drag');tick(w,1);near(w.player.x,180+520*DT);tick(w,17);assert.ok(w.player.x>252);
w=controlled();tick(w,1,{dx:1});near(w.player.x,180+260*DT);
for(const level of [1,20,40]){
  for(const rapid of [false,true]){const q=controlled(level);if(rapid){q.campaign.unlocked.push('rapid');E.equip(q,'rapid');}tick(q,240,{fire:true});const expected=2/(q.config.playerCooldown*(rapid?.5:1));assert.ok(Math.abs(q.actionId-expected)<=1);}
}
console.log('PASS: movement bounds, jitter reduction, responsive dodge/keyboard and normal/rapid cadence');
for(let attempts=1;attempts<=8;attempts++){
  w=controlled();w.enemies=[w.enemies[0]];let shot;for(let i=0;i<attempts;i++)shot=action(w)[0];impact(w,shot,w.enemies[0]);
  assert.equal(w.killScore,Math.round(100*[1,.85,.7,.55,.4][Math.min(attempts-1,4)]));assert.equal(w.attempts,0);assert.equal(w.clearBonus,750);
}
w=controlled(4);let armor=w.enemies.find(e=>e.type===2);w.enemies=[armor];let old;
for(let i=0;i<4;i++)old=action(w)[0];const delayed=action(w)[0];impact(w,old,armor);assert.equal(armor.hp,1);assert.equal(w.attempts,0);impact(w,delayed,armor);assert.equal(w.killScore,80);
for(const kind of ['spread','double']){
  w=controlled(16);w.enemies=w.enemies.filter(e=>e.type===1).slice(0,2);for(let i=0;i<4;i++)action(w);
  E.equip(w,kind);const pair=action(w);assert.equal(pair.length,2);assert.equal(pair[0].action,pair[1].action);assert.equal(w.attempts,5);
  if(kind==='spread'){near(Math.atan2(pair[1].vx,-pair[1].vy)*180/Math.PI,2.5);}else{near(pair[1].x-pair[0].x,12);assert.equal(pair[0].vx,0);assert.equal(pair[1].vx,0);}
  impact(w,pair[0],w.enemies[0]);impact(w,pair[1],w.enemies[0]);assert.equal(w.killScore,80);
}
console.log('PASS: accuracy tiers, delayed/nonlethal snapshots and one-action spread/double scoring without promotion');
w=controlled(4,71);w.enemies=[w.enemies.find(e=>e.type===1),w.enemies.find(e=>e.type===2)];const fires={1:0,2:0},dives={1:0,2:0};
for(let i=0;i<1800;i++){
  w.enemies.forEach(e=>{e.mode='formation';});w.shotClock=0;w.diveClock=1e6;tick(w,1);const b=w.bullets.at(-1);fires[b.sourceType]++;near(b.speed,w.config.bulletSpeed*(b.sourceType===2?1.08:1));w.bullets=[];
  w.shotClock=1e6;w.diveClock=0;tick(w,1);const e=w.enemies.find(e=>e.mode==='telegraph');dives[e.type]++;near(e.speed,w.config.diveSpeed*E.TYPES[e.type].speed);
}
assert.ok(fires[2]/fires[1]>1.3);assert.ok(dives[2]/dives[1]>1.1);
w=controlled();w.invulnerable=0;function bullet(){w.bullets.push({x:w.player.x,y:w.player.y-1,speed:100});tick(w,1);}
bullet();assert.equal(w.lives,2);bullet();assert.equal(w.lives,2);w.shield=true;w.invulnerable=0;bullet();assert.equal(w.lives,2);assert.equal(w.shield,false);
w.invulnerable=0;w.lives=1;bullet();assert.equal(w.state,'lost');assert.ok(w.cues.includes('defeat'));
console.log('PASS: armor speed/selection weights and shield/hull/grace/defeat regression');
for(let level=1;level<=40;level++){
  w=E.create(level,level*27);
  for(let i=0;i<120*120&&['playing','celebrating'].includes(w.state);i++){
    w.invulnerable=1;E.step(w,DT,{fire:true,dx:Math.sin(i/180)});w.events.length=0;
    assert.ok(Number.isFinite(w.player.x)&&w.bullets.length<=14&&w.shots.length<40&&w.particles.length<=240&&w.pickups.length<=3&&w.enemyMines.length<=2);
  }
}
console.log('PASS: two-minute simulations in all 40 sectors keep transient entities bounded');
