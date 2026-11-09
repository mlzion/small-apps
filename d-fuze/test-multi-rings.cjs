"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  crypto = require("node:crypto"),
  S = require("./level-schema.js"),
  L = require("./levels.js"),
  M = require("./experimental-motion.js"),
  A = require("./assembly.js"),
  R = require("./rings.js"),
  { Game } = require("./engine.js");
const near = (a,b) => assert(Math.abs(a-b)<1e-7, `${a} != ${b}`);
const original = L.publishedDocument();
// Content regression: activating 7–12 must not edit any published 1–6 field/library.
assert.equal(crypto.createHash("sha256").update(JSON.stringify(original.levels.slice(0,6))).digest("hex"),
  "90f1b7a9b971da73f75d033a896225a46b1125c5a1b42c64c243c8a85a792741");
assert.deepEqual(original.ringProfiles, M.defaults());
assert.deepEqual(original.assemblyProfiles, A.defaults());
assert.deepEqual(original.levels.slice(6), S.defaults().levels.slice(6));
const make = (level) => {
  const g = new Game(undefined,undefined,{testLevel:level,assemblyProfiles:original.assemblyProfiles,ringProfiles:original.ringProfiles});
  g.newGame();return g;
};
for (let count=1;count<=4;count++) {
  const level = S.clone(original.levels[(count-1)*3]);
  level.timer=300;
  level.rings.forEach((r,i)=>Object.assign(r,{gateWidth:[10,60,120,20][i],gateHealth:i+1,family:["hard","easy","medium","hard"][i]}));
  const g=make(level), sequence=[];
  assert.equal(g.rings.length,count);
  assert(g.rings.at(-1).radius+R.GEOMETRY.ringThickness/2<R.GEOMETRY.muzzleRadius);
  assert(g.rings.every(r=>r.parent===g.assembly));
  const initialAmmo=g.ammo, initialHealth=g.health;
  let shot=0;
  // Use actual common holds and the real cooldown, assembly offset and ray path.
  for (let target=count-1;target>=0;target--)
    for (let hit=0;hit<level.rings[target].gateHealth;hit++) {
      g.update(4.6+5*shot++-g.elapsed);
      const before=g.rings.map(r=>r.gate.health);
      assert(g.rings.every(r=>Math.abs(r.relativeAngle)<1e-8));
      g.angle=g.rings.at(-1).displayAngle;
      assert(g.fire());
      assert.equal(g.lastShot.kind,"gate");
      near(Math.hypot(g.lastShot.point.x,g.lastShot.point.y),g.rings[target].radius+4);
      assert.deepEqual(g.rings.map(r=>r.gate.health),before.map((h,i)=>h-(i===target?1:0)));
      assert.equal(g.health,initialHealth);
      sequence.push(target+1);
    }
  assert.equal(g.ammo,initialAmmo-sequence.length);
  assert.deepEqual(sequence,Array.from({length:count},(_,i)=>count-i).flatMap(n=>Array(n).fill(n)));
  const destroyedAngles=g.rings.map(r=>r.displayAngle);
  g.update(.3);
  assert.deepEqual(g.rings.map(r=>r.gate.health),Array(count).fill(0));
  assert(g.rings.some((r,i)=>Math.abs(r.displayAngle-destroyedAngles[i])>1e-8));
  for(let hit=0;hit<initialHealth;hit++) {
    g.update(4.6+5*shot++-g.elapsed);g.angle=g.rings.at(-1).displayAngle;g.fire();
    assert.equal(g.lastShot.kind,"bomb");
    near(Math.hypot(g.lastShot.point.x,g.lastShot.point.y),75);
  }
  assert.equal(g.health,0);assert.equal(g.state,"DEFUSING");g.update(1);assert.equal(g.state,"LEVEL_COMPLETE");
  const completedNumber=g.level;g.nextLevel();assert.equal(g.level,completedNumber);
  g.retry();assert.equal(g.elapsed,0);assert.equal(g.assembly.time,0);
  assert.deepEqual(g.rings.map(r=>r.gate.health),level.rings.map(r=>r.gateHealth));
  // Open outer rings cannot bypass a solid wall at ANY inner/outer radius.
  for(let blocker=0;blocker<count;blocker++) {
    const wall=make(level);wall.update(4.6);
    wall.rings.forEach(r=>r.gate.health=0);
    wall.rings[blocker].referenceOffset+=Math.PI;
    wall.angle=wall.assemblyAngle+R.GEOMETRY.referenceOffset;
    const ammo=wall.ammo;wall.fire();
    assert.equal(wall.lastShot.kind,"wall");
    near(Math.hypot(wall.lastShot.point.x,wall.lastShot.point.y),wall.rings[blocker].radius+4);
    assert.equal(wall.ammo,ammo-1);assert.equal(wall.health,level.bombHealth);
  }
}
// The normal three-life run behaves identically with larger ring counts.
for(const number of [7,10]) {
  const g=new Game();g.level=number;g.startLevel();
  for(const lives of [2,1,0]) {
    if(lives===1) g.update(g.config.time);
    else {g.ammo=1;g.angle=g.rings.at(-1).displayAngle+Math.PI;g.fire();}
    assert.equal(g.state,"EXPLODING");assert.equal(g.lives,lives);
    g.fail();assert.equal(g.lives,lives);g.update(1.3);
    if(lives) {g.retry();assert.equal(g.ammo,g.config.ammo);assert(g.rings.every(r=>r.gate.health===r.gate.maxHealth));}
  }
  assert.equal(g.state,"GAME_OVER");g.newGame();assert.equal(g.level,1);assert.equal(g.lives,3);
  g.level=number;g.startLevel();g.rings.forEach(r=>r.gate.health=0);
  g.health=1;g.ammo=1;g.angle=g.rings.at(-1).displayAngle;g.fire();
  assert.equal(g.state,"DEFUSING");assert.equal(g.lives,3);assert.equal(g.ammo,0);
}
// Every mixed family combination retains exact nested holds at later cycles,
// including independently scaled assembly time and deterministic assignments.
for (let combination=0;combination<81;combination++) {
  const level=S.clone(original.levels[11]);level.timer=300;level.playbackSpeed=1.3;level.assembly.playbackSpeed=.7;
  level.rings.forEach((r,i)=>r.family=["easy","medium","hard"][Math.floor(combination/3**i)%3]);
  const g=make(level), repeat=make(level);
  assert.deepEqual(g.rings.map(r=>r.profile.id),repeat.rings.map(r=>r.profile.id));
  for(const localTime of [4.5,4.75,9.5,9.75,54.75,109.75]) {
    g.update(localTime/1.3-g.elapsed);
    near(g.assemblyAngle,A.sampleProfile(original.assemblyProfiles[0],g.elapsed*.7));
    for(const ring of g.rings) {
      near(ring.relativeAngle,0);near(ring.displayAngle,g.assemblyAngle+R.GEOMETRY.referenceOffset);
    }
  }
  g.pause();const frozen=JSON.stringify(g);g.update(200);assert.equal(JSON.stringify(g),frozen);
  g.resume();g.fail();g.update(2);g.retry();assert.equal(g.elapsed,0);
}
// A bounded-speed turret strategy provides concrete (not universal balance)
// evidence of completion with existing geometry, cooldown and assembly motion.
for(let number=7;number<=12;number++) for(const seed of [1,42,4200,90000]) {
  const g=new Game(undefined,undefined,{seed});g.level=number;g.startLevel();
  while(g.state==="PLAYING") {
    const desired=g.assemblyAngle+R.GEOMETRY.referenceOffset;
    const delta=Math.atan2(Math.sin(desired-g.angle),Math.cos(desired-g.angle));
    if(Math.abs(delta)<.025 && g.rings.every(r=>Math.abs(r.relativeAngle)<1e-8)) g.fire();
    g.update(.02,{cw:delta>.02,ccw:delta<-.02});
  }
  assert.equal(g.state,"DEFUSING",`Level ${number}, seed ${seed}`);
  assert(g.ammo>0);assert(g.remaining>0);
}
(async()=>{
  for(const count of [1,12,13,20,200]) {
    const doc=S.clone(original);
    doc.levels=Array.from({length:count},(_,i)=>({...S.clone(original.levels[i%12]),number:i+1}));
    const exported=S.exportJSON(doc);
    await L.loadPublished(async()=>({ok:true,json:async()=>JSON.parse(exported)}));
    const game=new Game();game.newGame();assert.equal(game.levelCount,count);
    for(let n=1;n<=count;n++) {
      assert.equal(game.level,n);assert.equal(game.rings.length,doc.levels[n-1].ringCount);
      assert.equal(game.hasNextLevel,n<count);
      game.transition("LEVEL_COMPLETE");game.nextLevel();
    }
    assert.equal(game.level,count);assert.equal(game.state,"LEVEL_COMPLETE");
    // Loader updates, profile edits and even a failed request cannot alter this run.
    const changed=S.clone(original);changed.levels[0].timer=123;changed.levels[1].timer=124;changed.ringProfiles[0].keyframes[1][1]=-67;
    await L.loadPublished(async()=>({ok:true,json:async()=>changed}));
    const newer=new Game();newer.newGame();assert.equal(newer.config.time,123);
    await assert.rejects(L.loadPublished(async()=>({ok:false,status:503})));
    game.newGame();assert.equal(game.levelCount,count);assert.equal(game.config.time,doc.levels[0].timer);
    assert.deepEqual(game.ringProfiles,doc.ringProfiles);
    if(count>1) {
      game.transition("LEVEL_COMPLETE");game.nextLevel();
      assert.equal(game.level,2);assert.equal(game.config.time,doc.levels[1].timer);
    }
  }
  for(const mutation of [d=>d.levels[0].number=2,d=>d.levels[1].number=3,d=>d.levels.reverse(),d=>d.levels[1].number=1,d=>d.levels=[]]) {
    const doc=S.clone(original);mutation(doc);assert.throws(()=>L.validatePublished(doc));assert.throws(()=>S.exportJSON(doc));
  }
  const level={...S.clone(original.levels[11]),number:20};
  const transfer=S.readTestData(S.testPayload(level,original.assemblyProfiles,original.ringProfiles));
  const test=make(transfer.level);assert.equal(test.level,20);assert.equal(test.rings.length,4);
  level.rings[3].gateHealth=49;assert.equal(test.rings[3].gate.health,original.levels[11].rings[3].gateHealth);
  test.fail();test.update(2);test.retry();assert.equal(test.level,20);assert.equal(test.elapsed,0);
  assert.deepEqual(JSON.parse(fs.readFileSync(`${__dirname}/published-levels.json`)),original);
  console.log("PASS: 1–4 rings/outside-in health, widths, walls, beam endpoints, retry, 81 mixed-family holds and independent world clocks, 24 bounded-turret published wins, 1/12/13/20/200-level progression, config session snapshots, numbering rejection, standalone Level 20 Test Mode and export-loader isolation; Levels 1–6/libraries unchanged");
})().catch(e=>{console.error(e);process.exitCode=1;});
