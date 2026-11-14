'use strict';
const assert=require('node:assert/strict');
const E=require('./engine.js');
const tick=(w,n,input={})=>{for(let i=0;i<n;i++)E.step(w,1/120,input);};
assert.equal(E.LEVELS.length,10);
for(let i=0;i<10;i++){
  const w=E.create(i+1,42),c=w.config;
  assert.equal(w.enemies.length,c.rows*c.columns);
  assert.equal(w.enemies.filter(e=>e.hp===2).length,c.armored);
  if(i){const p=E.LEVELS[i-1];assert.ok(c.rows*c.columns>=p.rows*p.columns);assert.ok(c.armored>=p.armored);assert.ok(c.diveInterval<p.diveInterval&&c.shotInterval<p.shotInterval&&c.bulletSpeed>p.bulletSpeed&&c.diveSpeed>p.diveSpeed);}
  tick(w,444);assert.ok(w.enemies.every(e=>e.mode==='formation'));
  // Destroy every real formation using the same swept projectile collision path.
  // No frame is advanced long enough to introduce an unrelated player hit.
  while(w.enemies.length){const e=w.enemies[0];w.shots.push({x:e.x,y:e.y+1,previousY:e.y+1});tick(w,1);}
  assert.equal(w.state,'cleared');assert.equal(w.kills,w.total);
  assert.equal(w.score,(w.total-c.armored)*100+c.armored*200+750);
  assert.equal(w.bullets.length,0);
  const time=w.time;tick(w,120);assert.equal(w.time,time,'terminal levels freeze');
}
let w=E.create();
E.move(w,-100,900);tick(w,240);assert.equal(w.player.x,18);assert.equal(w.player.y,455);
E.move(w,900,-100);tick(w,240);assert.equal(w.player.x,342);assert.equal(w.player.y,249.60000000000002);
w=E.create();tick(w,120,{fire:true});assert.ok(w.shots.length>=4&&w.shots.length<=6,'held fire is rate limited');
w=E.create();w.invulnerable=0;w.bullets.push({x:180,y:420,previousY:420});tick(w,1);assert.equal(w.lives,2);
w.bullets.push({x:180,y:420,previousY:420});tick(w,1);assert.equal(w.lives,2,'grace period prevents repeated hits');
w.invulnerable=0;w.shield=true;w.bullets.push({x:180,y:420,previousY:420});tick(w,1);assert.equal(w.lives,2);assert.equal(w.shield,false);
w.invulnerable=0;w.pickup={x:180,y:424};tick(w,1);assert.equal(w.shield,true);assert.equal(w.pickup,null);
w.shield=false;w.lives=1;w.invulnerable=0;w.bullets.push({x:180,y:420,previousY:420});tick(w,1);assert.equal(w.state,'lost');assert.equal(w.lives,0);
w=E.create(10);tick(w,1200);assert.ok(w.enemies.some(e=>e.mode==='dive'||e.mode==='return'),'enemies break formation');
const a=E.create(6,57),b=E.create(6,57);tick(a,900);tick(b,900);assert.deepEqual(a.enemies,b.enemies,'seeded runs are repeatable');
w=E.create(10);for(let i=0;i<120*300;i++){if(w.state!=='playing')break;E.step(w,1/120,{fire:true,dx:Math.sin(i/180)});assert.ok(Number.isFinite(w.player.x)&&Number.isFinite(w.player.y));assert.ok(w.shots.length<20&&w.bullets.length<30&&w.particles.length<250,'bounded transient objects');}
console.log('PASS: ten increasing levels, formations/dives, all-level clears, score, boundaries, fire cadence, damage, shield, defeat, deterministic and bounded simulation');
