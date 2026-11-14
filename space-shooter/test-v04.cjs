'use strict';
const assert=require('node:assert/strict'),A=require('./attacks.js'),V=require('./appearance.js');
const {E,W,DT,tick,quiet,controlled,action,impact,hit,killAll,waitAnnouncement}=require('./test-helpers.cjs');
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
require('./fixtures/v03-levels.json').forEach((old,i)=>Object.entries(old).forEach(([k,v])=>assert.equal(E.LEVELS[i][k],v,`sector ${i+1} preserves ${k}`)));
for(let level=1;level<=40;level++){
  const w=E.create(level),expected=W.OFFENSE.filter(k=>W.DEFS[k].unlock<level);
  assert.deepEqual(w.campaign.unlocked,expected);assert.deepEqual(w.dropPool,expected);assert.equal(w.weapon.kind,'normal');
  assert.ok(w.enemies.every(e=>!e.boss));assert.equal(w.bossStatus,level%5===0?'pending':'none');
  if(level>30){const p=E.LEVELS[level-2],c=w.config;assert.ok(c.diveSpeed/p.diveSpeed<1.01&&p.shotInterval/c.shotInterval<1.01);assert.ok(c.kamikazeChance>p.kamikazeChance&&c.fileChance>p.fileChance);}
}
assert.equal(E.equip(E.create(1),'laser'),false);assert.equal(E.next(E.create(1)),null);
console.log('PASS: 40 configs, first 30 unchanged, gentle later aggression, jump-ahead unlock pools and fresh normal loadouts');
function summon(w){
  const half=Math.ceil(w.ordinaryTotal/2);
  while(w.ordinaryKills<half-1)hit(w,w.enemies.find(e=>!e.boss));
  assert.ok(!w.enemies.some(e=>e.boss));const last=w.enemies.find(e=>!e.boss);while(last.hp>0)hit(w,last);
  assert.equal(w.bossStatus,'entering');assert.ok(w.cues.includes('bossEnter'));
  const boss=w.enemies.find(e=>e.boss);assert.equal(boss.mode,'boss-entry');assert.equal(boss.y,-80);
  tick(w,264);quiet(w);assert.equal(boss.mode,'formation');return boss;
}
function rewardWorld(level,seed=47){const w=controlled(level,seed),boss=summon(w);while(boss.hp>0)hit(w,boss);return w;}
const hp=[6,10,14,18,22,26,30,35];
for(let i=0;i<8;i++){
  const level=(i+1)*5,w=controlled(level),b=summon(w);
  assert.equal(b.maxHp,hp[i]);assert.ok(w.enemies.filter(e=>!e.boss).every(e=>e.homeY-b.homeY>=40));
  const positions=[];for(let k=0;k<240;k++){tick(w,1);positions.push(b.x);}
  const bossSpeed=Math.max(...positions.slice(1).map((x,j)=>Math.abs(x-positions[j])/DT));
  assert.ok(bossSpeed>w.config.sway*1.1,'boss formation movement is faster than ordinary sway');
  w.bossDiveClock=0;tick(w,1);assert.equal(b.mode,'telegraph');
  while(b.mode==='telegraph')tick(w,1);const start={...b.group.target};let fired=0,peakSpeed=0,last={x:b.x,y:b.y};
  for(let k=0;k<600&&b.mode!=='formation';k++){tick(w,1);if(w.cues.includes('enemyFire'))fired++;peakSpeed=Math.max(peakSpeed,Math.hypot(b.x-last.x,b.y-last.y)/DT);last={x:b.x,y:b.y};if(b.group)assert.deepEqual(b.group.target,start);}
  assert.equal(b.mode,'formation');assert.ok(fired>0);assert.ok(peakSpeed>w.config.diveSpeed);
  near(b.x,A.homeX(w,b));while(b.hp>0)hit(w,b);assert.equal(w.state,'celebrating');assert.ok(w.cues.includes('bossDestroy'));
  if(level>=30){assert.equal(w.announcement.kind,'boss');assert.equal(w.bonusScore,1000+b.rank*250);}else assert.equal(w.announcement.kind,'unlock');
}
console.log('PASS: eight delayed bosses, prescribed HP range, rear formation, stronger movement/attacks/return, explosions and late boss bonuses');
for(const kind of W.OFFENSE){
  const level=W.DEFS[kind].unlock,w=rewardWorld(level),twin=rewardWorld(level);
  assert.equal(w.weapon.kind,kind);assert.equal(w.announcement.weapon,kind);assert.ok(w.campaign.unlocked.includes(kind));assert.ok(!w.dropPool.includes(kind),'new weapon enters random pool only in a subsequent sector');
  w.bullets.push({x:30,y:250,speed:100});w.enemyMines.push({x:72,startX:72,lane:72,y:250,age:0,speed:45,radius:50,warning:false,fuse:1});
  twin.bullets.push({x:30,y:250,speed:100});twin.enemyMines.push({...w.enemyMines[0]});
  const snapshot=q=>JSON.stringify({time:q.time,player:q.player,enemies:q.enemies,shots:q.shots,bullets:q.bullets,weapon:q.weapon,mines:q.enemyMines,cooldown:q.fireCooldown,pickups:q.pickups,particles:q.particles});
  const frozen=snapshot(w);tick(w,120,{fire:true,dx:1,dy:1});assert.equal(snapshot(w),frozen);assert.equal(w.random(),twin.random());near(w.announcement.remaining,.5);
  tick(w,60,{fire:true});assert.equal(w.state,'playing');const id=w.actionId;tick(w,10,{fire:true});assert.equal(w.actionId,id,'held fire cannot consume reward after resuming');
  assert.equal(w.weapon.kind,kind);if(!W.DEFS[kind].duration)assert.equal(w.weapon.charges,1);
  tick(w,1);w.fireCooldown=0;tick(w,1,{fire:true});assert.equal(w.actionId,id+1);
  if(!W.DEFS[kind].duration)assert.equal(w.weapon.kind,'normal');
  const retry=E.restart(w),boss=summon(quiet(retry));while(boss.hp>0)hit(retry,boss);
  assert.equal(retry.announcement.kind,'boss');assert.equal(retry.campaign.rewarded.filter(n=>n===level).length,1,'one unlock per campaign');
}
let w=rewardWorld(20);w.enemies=[];waitAnnouncement(w);assert.equal(w.state,'cleared');assert.equal(w.weapon.kind,'laser');assert.ok(w.cues.includes('victory'));
let next=E.next(w);assert.equal(next.level,21);assert.equal(next.weapon.kind,'laser');tick(next,5,{fire:true});assert.equal(next.weapon.charges,1);tick(next,1);tick(next,1,{fire:true});assert.ok(next.beam);
w=controlled(1);for(let level=1;level<=40;level++){quiet(w);killAll(w);assert.equal(w.level,level);if(level<40){w=E.next(w);assert.equal(w.level,level+1);}else{assert.equal(w.state,'cleared');assert.equal(E.next(w),null);}}
assert.deepEqual(w.campaign.unlocked,W.OFFENSE);
console.log('PASS: immediate unlock equip, exact freeze, RNG freeze, fresh-fire latch, once-only unlocks, carry into next sector and sequential final victory');
for(const previous of W.OFFENSE)for(const replacement of W.OFFENSE){
  w=controlled(40);E.equip(w,previous);if(w.weapon.remaining)w.weapon.remaining=1;E.equip(w,replacement);assert.equal(w.weapon.kind,replacement);assert.equal(w.weapon.remaining,W.DEFS[replacement].duration);assert.equal(w.weapon.charges,W.DEFS[replacement].duration?0:1);
}
w=controlled(40);E.equip(w,'laser');action(w);assert.ok(w.beam);E.equip(w,'shield');assert.ok(w.beam&&w.shield);E.equip(w,'spread');assert.equal(w.beam,null);assert.equal(w.weapon.kind,'spread');
E.equip(w,'mine');action(w);assert.ok(w.playerMine);E.equip(w,'double');assert.equal(w.playerMine,null);assert.equal(w.weapon.kind,'double');
E.equip(w,'rapid');tick(w,30);E.equip(w,'rapid');near(w.weapon.remaining,8);E.equip(w,'shield');assert.equal(w.weapon.kind,'rapid');
E.equip(w,'spread');tick(w,240,{fire:true});assert.ok(Math.abs(w.actionId-2/w.config.playerCooldown)<3,'rapid does not stack with spread');
w.weapon.remaining=DT/2;tick(w,1);assert.equal(w.weapon.kind,'normal');
for(const kind of W.OFFENSE){const q=controlled(40);E.equip(q,kind);assert.equal(V.weaponStyle(q.weapon).color,W.DEFS[kind].color);if(W.DEFS[kind].duration){q.weapon.remaining=1.8;assert.equal(V.weaponStyle(q.weapon).color,null);}}
console.log('PASS: full replacement matrix, same-kind refresh, shield independence, emitted-special cancellation, non-stacking cadence, expiry and five weapon colors');
function arena(){
  const q=controlled(26);q.config={...q.config,sway:0};q.enemies=[];q.dropPool=[];q.ordinaryTotal=q.total=20;return q;
}
function enemy(id,x,y,hp=1,type=1){return {id,type,hp,homeX:x,homeY:y,x,y,mode:'formation',age:0,delay:0};}
w=arena();w.enemies=[0,1,2,3,4].map(i=>enemy(i,180,70+i*40));E.equip(w,'laser');tick(w,1,{fire:true});assert.equal(w.actionId,1);assert.equal(w.weapon.kind,'normal');assert.equal(w.kills,3);assert.equal(w.beam.kills,3);const born=w.time;
tick(w,29);assert.ok(w.beam);near(w.time-born,29*DT);tick(w,1);assert.equal(w.beam,null);assert.equal(w.kills,3);
w=arena();w.enemies=[enemy(1,180,200,2,2),enemy(2,220,150)];E.equip(w,'laser');tick(w,1,{fire:true});assert.equal(w.kills,1);E.move(w,220,424);tick(w,12);assert.equal(w.kills,2,'beam tracks the player while active');
w=arena();let b={...A.makeBoss(40),id:100,hp:35,mode:'formation',pattern:null,homeX:180,homeY:260,x:180,y:260};w.bossStatus='active';w.enemies=[b,...[1,2,3,4].map(i=>enemy(i,180,80+i*30))];E.equip(w,'laser');tick(w,1,{fire:true});assert.equal(b.hp,33);assert.equal(w.kills,3);tick(w,10);assert.equal(b.hp,33,'beam hits a boss only once');
w=arena();w.enemies=[0,1,2,3,4].map(i=>enemy(i,180,70+i*40));for(let i=0;i<4;i++)action(w);E.equip(w,'laser');tick(w,1,{fire:true});assert.equal(w.killScore,120);assert.equal(w.attempts,0,'one accuracy snapshot for the whole beam');
console.log('PASS: automatic laser activation/consumption, exact .25s, swept player anchor, 3-kill limit, 2 HP damage once per target and action accuracy');
function detonate(q){q.playerMine.x=180;q.playerMine.y=180+210*DT;q.playerMine.age=.3;tick(q,1);}
w=arena();w.enemies=[enemy(1,170,180),enemy(2,190,180,2,2),enemy(3,180,170),enemy(4,180,190),enemy(5,210,210),enemy(6,280,180)];E.equip(w,'mine');tick(w,1,{fire:true});assert.ok(w.playerMine);assert.equal(w.weapon.kind,'normal');detonate(w);assert.equal(w.lastMine.kills,4);assert.equal(w.enemies.find(e=>e.id===6).hp,1);assert.ok(w.blasts.some(x=>x.radius===72));assert.ok(w.cues.includes('mineBlast'));
w=arena();b={...A.makeBoss(40),mode:'formation',pattern:null,homeX:180,homeY:180,x:180,y:180};w.bossStatus='active';w.enemies=[b,enemy(1,170,170),enemy(2,190,170),enemy(3,170,190),enemy(4,190,190),enemy(5,230,210)];E.equip(w,'mine');tick(w,1,{fire:true});detonate(w);assert.equal(b.hp,33);assert.equal(w.kills,4);tick(w,10);assert.equal(b.hp,33);
w=arena();w.enemies=[1,2,3,4,5].map(i=>enemy(i,170+i*2,180));for(let i=0;i<4;i++)action(w);E.equip(w,'mine');tick(w,1,{fire:true});detonate(w);assert.equal(w.killScore,160);assert.equal(w.lastMine.actionId,5);
console.log('PASS: automatic mine consumption, deployment/detonation radius, 4-kill cap, armor/boss HP limits and one-action area scoring');
const averages=[];
for(const level of [1,6,16,26,40]){
  let sum=0;
  for(let seed=1;seed<=200;seed++){
    const q=E.create(level,Math.imul(seed,0x9e3779b9)),kinds=[];
    for(let n=1;n<=q.ordinaryTotal;n++){q.ordinaryKills=n;W.onOrdinaryKill(q,{x:-5,y:460});kinds.push(...q.pickups.map(p=>p.kind));assert.ok(q.pickups.every(p=>p.x>=42&&p.x<=318&&p.y<=220));q.pickups=[];}
    assert.ok(kinds.every(k=>k==='shield'||q.dropPool.includes(k)));assert.ok(kinds.length<=4);sum+=kinds.length;
  }
  averages.push(sum/200);
}
assert.equal(averages[0],1);assert.ok(averages[1]<averages[2]&&averages[2]<averages[4]);
w=E.create(40,8);for(let n=1;n<=w.ordinaryTotal;n++){w.ordinaryKills=n;W.onOrdinaryKill(w,{x:180,y:200});assert.ok(w.pickups.length<=3);}assert.ok(w.dropStats.spawned<=4);
console.log('PASS: no locked drops, reachable pickup positions, bounded screen/sector counts; mean opportunities:',averages);
w=controlled(40);A.deployMines(w,{x:180,y:70,rank:8,phase:3});A.deployMines(w,{x:180,y:70,rank:8,phase:3});assert.equal(w.enemyMines.length,2);assert.deepEqual(w.enemyMines.map(m=>m.lane).sort((a,b)=>a-b),[72,288]);
for(let i=0;i<1000&&!w.enemyMines.every(m=>m.warning);i++)tick(w,1);
const centers=w.enemyMines.map(m=>({x:m.x,y:m.y}));tick(w,30);w.enemyMines.forEach((m,i)=>{near(m.x,centers[i].x);near(m.y,centers[i].y);});
E.move(w,180,350);tick(w,100);assert.equal(w.lives,3);assert.ok(w.blasts.length<=2);assert.equal(w.enemyMines.length,0);
w=controlled(35);w.invulnerable=0;w.player.x=w.target.x=72;w.player.y=w.target.y=350;w.enemyMines=[{x:72,y:350,age:1,warning:true,fuse:1,radius:50}];tick(w,119);assert.equal(w.lives,3);tick(w,2);assert.equal(w.lives,2);assert.ok(w.cues.includes('enemyMineBlast')||w.blasts.length);
E.equip(w,'mine');E.equip(w,'shield');w.invulnerable=0;w.enemyMines=[{x:72,y:350,age:1,warning:true,fuse:DT/2,radius:50}];tick(w,1);assert.equal(w.lives,2);assert.equal(w.shield,false);assert.equal(w.weapon.kind,'mine');
w=controlled(34);w.fieldMineClock=0;tick(w,1);assert.ok(w.enemyMines.length>0);
w=controlled(40);b=summon(w);for(const [fraction,phase] of [[1,1],[.6,2],[.25,3]]){b.hp=b.maxHp*fraction;tick(w,1);assert.equal(b.phase,phase);w.bossDiveClock=0;tick(w,1);assert.equal(b.attackPhase,phase);b.mode='formation';b.pattern=null;}
assert.equal(new Set([1,2,3,4,5,6,7,8].map(rank=>V.bossStyle({rank,hp:100,maxHp:100,hitFlash:0},0).color)).size,8);
assert.equal(V.bossStyle({rank:8,hp:8,maxHp:35,hitFlash:0},0).sparks,6);
console.log('PASS: two enemy-mine cap, separated lanes, fixed warning centers, dodging/blast damage/shield, later field mines and three final-boss phases');
let peak=0;
for(const level of [5,20,25,30,34,35,39,40]){
  const a=E.create(level,91),c=E.create(level,91);
  for(let i=0;i<120*180&&['playing','celebrating'].includes(a.state);i++){
    a.invulnerable=c.invulnerable=1;const input={fire:i%7<4,dx:Math.sin(i/150)};E.step(a,DT,input);E.step(c,DT,input);V.weaponStyle(a.weapon);
    assert.ok(a.bullets.length<=14&&a.enemyMines.length<=2&&a.pickups.length<=3&&a.shots.length<40);peak=Math.max(peak,a.bullets.length);a.events.length=c.events.length=0;
  }
  assert.equal(JSON.stringify(a),JSON.stringify(c));assert.equal(a.random(),c.random());
}
console.log('PASS: deterministic 3-minute combat runs through later hazards; peak hostile bullets:',peak);
