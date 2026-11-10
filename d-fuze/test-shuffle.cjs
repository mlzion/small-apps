"use strict";
const assert=require('node:assert/strict'),S=require('./level-schema.js'),
 M=require('./experimental-motion.js'),A=require('./assembly.js'),R=require('./rings.js'),
 {Game}=require('./engine.js');
const near=(a,b,e=1e-7)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const doc=require('./published-levels.json');
const old={...S.clone(doc),version:3,ringProfiles:S.clone(doc.ringProfiles.filter(p=>!p.id.endsWith('-06'))),levels:require('./test-fixtures/levels-v3.json')};
const migrated=S.importJSON(JSON.stringify(old));
assert.equal(migrated.version,4);
// The historical v3 fixture has its own authored levels. Migration must preserve
// those values, independently of later edits to the currently published levels.
const expectedMigration={...S.clone(old),version:4,levels:[],
 ringProfiles:[...S.clone(old.ringProfiles),...M.defaults().filter(p=>p.id.endsWith('-06'))]};
assert.equal(migrated.migrationNotes.length,15);
old.levels.forEach((l,i)=>{
 const expected=S.clone(l);delete expected.playbackSpeed;
 expected.rings.forEach(r=>delete r.family);
 expected.motionFamily=['easy','medium','hard'][Math.max(...l.rings.map(r=>['easy','medium','hard'].indexOf(r.family)))];
 assert.deepEqual(migrated.levels[i],expected);
 expectedMigration.levels.push(expected);
});
assert.deepEqual(migrated,expectedMigration);
assert.deepEqual(S.importJSON(S.exportJSON(doc)),doc);
for(const change of [d=>d.levels[0].motionFamily='unknown',d=>d.levels[0].playbackSpeed=1,
 d=>d.levels[0].rings[0].family='easy',d=>d.ringProfiles[0].keyframes[0][0]=.01,
 d=>d.ringProfiles[0].keyframes[0][1]=360,d=>d.ringProfiles[0].duration=11,
 d=>d.ringProfiles[0].keyframes.find(k=>k[0]===8.5)[1]=1,
 d=>d.ringProfiles.splice(0,1)]) {
 const bad=S.clone(doc);change(bad);assert.throws(()=>S.exportJSON(bad));assert.throws(()=>S.importJSON(JSON.stringify(bad)));
}
for(const change of [d=>delete d.levels[0].rings[0].family,d=>d.levels[0].playbackSpeed=null]) {
 const bad=S.clone(old);change(bad);assert.throws(()=>S.importJSON(JSON.stringify(bad)));
}
// Existing six-profile custom families survive import; excess profiles are
// rejected explicitly instead of silently selecting/discarding user data.
const customLegacy=S.clone(old);
customLegacy.ringProfiles=S.clone(doc.ringProfiles);
customLegacy.ringProfiles.find(p=>p.id==='easy-06').name='Retained custom sixth';
assert.equal(S.importJSON(JSON.stringify(customLegacy)).ringProfiles.find(p=>p.id==='easy-06').name,'Retained custom sixth');
customLegacy.ringProfiles.push({...S.clone(customLegacy.ringProfiles[0]),id:'seventh-easy'});
assert.throws(()=>S.importJSON(JSON.stringify(customLegacy)),/No profiles were discarded/);
for(const family of ['easy','medium','hard'])for(let count=1;count<=4;count++)for(const seed of [1,42,4294967295]) {
 const level={...S.clone(doc.levels[9]),ringCount:count,motionFamily:family,seed};level.rings.length=count;
 const shuffle=M.createShuffle(level),twin=M.createShuffle(level),history=[],seen=Array.from({length:count},()=>new Set());
 let previous=[];const combinations=new Set();
 for(let cycle=0;cycle<500;cycle++) {
  const profiles=shuffle.atCycle(cycle),ids=profiles.map(p=>p.id);
  assert.equal(new Set(ids).size,count);
  assert(ids.every((id,i)=>id!==previous[i]));
  assert(profiles.every(p=>p.difficulty===family));
  assert.deepEqual(twin.atCycle(cycle).map(p=>p.id),ids);
  assert.deepEqual(shuffle.atCycle(cycle).map(p=>p.id),ids); // extra renders consume no randomness
  ids.forEach((id,i)=>seen[i].add(id));
  if(cycle%6===5){assert(seen.every(s=>s.size===6));seen.forEach(s=>s.clear());}
  combinations.add(ids.join('|'));history.push(ids);previous=ids;
 }
 assert(combinations.size>=Math.min(15,count===1?6:20));
 const jump=M.createShuffle(level);assert.deepEqual(jump.atCycle(499).map(p=>p.id),history[499]);
 assert.deepEqual(jump.atCycle(7).map(p=>p.id),history[7]);
 assert.deepEqual(jump.atCycle(499).map(p=>p.id),history[499]);
 assert(shuffle.recent.length<=24);assert(shuffle.block.length<6);
}
for(const family of ['easy','medium','hard']) {
 const level={...S.clone(doc.levels[9]),motionFamily:family,assembly:{profileId:'gentle-drift',playbackSpeed:1.7}};
 const g=new Game(undefined,undefined,{testLevel:level,ringProfiles:doc.ringProfiles,assemblyProfiles:doc.assemblyProfiles});g.newGame();
 const idsAt=t=>{g.elapsed=t;g.updateRings();return g.rings.map(r=>r.profile.id)};
 const before=idsAt(9.999),at=idsAt(10),after=idsAt(10.001);
 assert(at.every((id,i)=>id!==before[i]));assert.deepEqual(at,after);
 assert.equal(g.animationTime,10.001);assert(!Object.hasOwn(g.config,'animationPlaybackSpeed'));
 near(g.assembly.angle,A.sampleProfile(doc.assemblyProfiles.find(p=>p.id===level.assembly.profileId),10.001*level.assembly.playbackSpeed));
 for(const t of [0,9.999,10,10.001,19.999,20,20.001,99.999,100,100.001]) {
  idsAt(t);
  for(const r of g.rings){near(r.displayAngle,r.relativeAngle+g.assembly.angle+R.GEOMETRY.referenceOffset);assert(Math.abs(r.relativeAngle)<.0001);}
 }
 for(const p of doc.ringProfiles.filter(p=>p.difficulty===family)) {
  assert.deepEqual(p.keyframes[0].slice(0,2),[0,0]);assert.equal(p.keyframes.filter(k=>k[0]===10).length,1);
  const compiled=M.compile(p),e=1e-6;
  near((M.sampleProfile(compiled,e)-M.sampleProfile(compiled,0))/e,0,.001);
  near((M.sampleProfile(compiled,10)-M.sampleProfile(compiled,10-e))/e,0,.001);
  for(const [a,b] of M.FAMILIES[family].alignmentWindows)for(const t of [a,(a+b)/2,b])near(M.sampleProfile(compiled,t),0);
 }
 g.elapsed=24.7;g.updateRings();g.pause();const frozen=JSON.stringify(g);g.update(100);assert.equal(JSON.stringify(g),frozen);
 g.resume();g.fail();g.update(2);g.retry();assert.equal(g.animationTime,0);assert.deepEqual(g.rings.map(r=>r.profile.id),M.assignProfiles(level).map(p=>p.id));
}
for (const fps of [15,30,60,144]) {
 const level=S.clone(doc.levels[11]);level.timer=300;
 const g=new Game(undefined,undefined,{testLevel:level,ringProfiles:doc.ringProfiles,assemblyProfiles:doc.assemblyProfiles});g.newGame();
 for(let i=0;i<fps*60;i++)g.update(1/fps);
 g.update(.1);
 assert.deepEqual(g.rings.map(r=>r.profile.id),M.assignProfiles(level,level.seed,doc.ringProfiles,6).map(p=>p.id));
}
const unwrapped=S.clone(doc.ringProfiles[0]);unwrapped.keyframes[1][1]=720;
assert.deepEqual(M.validateEditable(unwrapped),[]);near(M.sampleProfile(M.compile(unwrapped),unwrapped.keyframes[1][0]),4*Math.PI);
const geometry=R.GEOMETRY,edge=geometry.ringRadius+3*geometry.ringSpacing+geometry.ringThickness/2;
assert.equal(edge,202);assert.equal(geometry.muzzleRadius,230);assert.equal(geometry.turretRadius-19,230);
assert(geometry.muzzleRadius-edge>=28);assert(geometry.turretRadius+14<300);
assert(geometry.ringRadius-geometry.ringThickness/2>geometry.bombRadius);
console.log('PASS: schema v4/12-level migration and unchanged balance, malformed imports/start/holds rejected, 18,000 seeded cycles across 1–4 rings/all families, distinct/no repeats/full coverage/random seeks/bounded state, exact boundary/zero-velocity continuity/unwrapped turns, independent assembly/pause/retry, four-ring muzzle and bomb clearance');
