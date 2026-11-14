'use strict';
const assert = require('node:assert/strict');
const E = require('./engine.js'), DT = 1 / 120;
const tick = (w, n, input = {}) => { for (let i = 0; i < n; i++) E.step(w, DT, input); };
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function controlled(level = 1, seed = 17) {
  const w = E.create(level, seed); w.diveClock = w.shotClock = w.bossDiveClock = w.bossShotClock = 1e9;
  w.enemies.forEach(e => { e.mode = 'formation'; e.x = e.homeX; e.y = e.homeY; });
  return w;
}
function action(w) { w.fireCooldown = 0; E.step(w, DT, {fire: true}); return w.shots.filter(s => s.action.id === w.actionId); }
function impact(w, s, e) { s.x = e.x; s.y = e.y + 2; s.vx = 0; s.vy = -440; tick(w, 1); }
function killAll(w, onKill = () => {}) {
  while (w.enemies.length) {
    const e = w.enemies[0];
    while (e.hp > 0) impact(w, action(w)[0], e);
    onKill(w);
  }
}
assert.equal(E.LEVELS.length, 30);
for (let i = 0; i < 30; i++) {
  const w = E.create(i + 1, 42), c = w.config;
  assert.equal(w.enemies.length, c.rows * c.columns + (w.level % 5 === 0 ? 1 : 0));
  assert.equal(w.enemies.filter(e => e.type === 2).length, c.armored);
  assert.equal(w.enemies.filter(e => e.type === 3).length, c.loopers);
  assert.ok(w.enemies.every(e => e.hp === (e.maxHp ?? E.TYPES[e.type].hp)));
  if (i) {
    const p = E.LEVELS[i - 1];
    assert.ok(c.rows * c.columns >= p.rows * p.columns && c.armored >= p.armored && c.loopers >= p.loopers);
    assert.ok(c.diveInterval < p.diveInterval && c.shotInterval < p.shotInterval && c.bulletSpeed > p.bulletSpeed && c.diveSpeed > p.diveSpeed);
    assert.ok(c.playerCooldown <= p.playerCooldown);
  }
  if (i < 10) {
    near(c.diveSpeed, 83 + i * 10); near(c.shotInterval, 2.8 - i * .17);
    assert.equal(c.columns, 4 + Math.floor(i / 3)); assert.equal(c.rows, 2 + Math.floor(i / 4));
  } else {
    const p = E.LEVELS[i - 1];
    assert.ok(c.diveSpeed / p.diveSpeed < 1.03 && p.shotInterval / c.shotInterval < 1.04, 'no sector-11+ parameter spike');
  }
  w.diveClock = w.shotClock = w.bossDiveClock = w.bossShotClock = 1e9;
  tick(w, 444); assert.ok(w.enemies.every(e => e.mode === 'formation'));
  const base = w.enemies.reduce((n, e) => n + (e.points ?? E.TYPES[e.type].points), 0);
  killAll(w);
  assert.equal(w.state, 'cleared'); assert.equal(w.kills, w.total);
  assert.equal(w.killScore, base); assert.equal(w.clearBonus, 750); assert.equal(w.score, base + 750);
  assert.equal(w.bullets.length, 0); const time = w.time; tick(w, 120); assert.equal(w.time, time);
  assert.equal(E.create(i + 1).attempts, 0);
}
console.log('PASS: 30 increasing sectors, early curve retained, all formations clear, base values and separate bonuses');

let w = controlled();
E.move(w, -100, 900); tick(w, 240); near(w.player.x, 18); near(w.player.y, 455);
E.move(w, 900, -100); tick(w, 240); near(w.player.x, 342); near(w.player.y, E.H * .52);
// Alternating 1px trackpad noise should be damped; a fast dodge keeps the old speed cap.
function jitter(source) {
  const q = controlled(), positions = [];
  for (let i = 0; i < 120; i++) { E.move(q, 180 + (i % 2 ? 1 : -1), 424, source); tick(q, 1); positions.push(q.player.x); }
  return Math.max(...positions) - Math.min(...positions);
}
assert.ok(jitter('drag') < jitter('direct') * .35);
w = controlled(); E.move(w, 260, 424, 'drag'); tick(w, 1); near(w.player.x, 180 + 520 * DT);
tick(w, 17); assert.ok(w.player.x > 252, 'dodge arrives in under 150ms');
E.move(w, w.player.x, w.player.y); const stopped = w.player.x; tick(w, 20); near(w.player.x, stopped);
w = controlled(); tick(w, 1, {dx: 1}); near(w.player.x, 180 + 260 * DT);
for (const level of [1, 10, 20]) {
  for (const rapid of [false, true]) {
    const q = controlled(level); if (rapid) q.effects.rapid = 8;
    tick(q, 240, {fire: true});
    const expected = 2 / (q.config.playerCooldown * (rapid ? .5 : 1));
    assert.ok(Math.abs(q.actionId - expected) <= 1, 'cadence tracks cooldown independent of fixed step');
  }
}
near(E.LEVELS[0].playerCooldown, .285); near(E.LEVELS[0].playerCooldown / E.LEVELS[19].playerCooldown, 1.18);
console.log('PASS: movement bounds, jitter attenuation, immediate fast dodge, keyboard response and normal/rapid cadence');

for (let attempts = 1; attempts <= 8; attempts++) {
  w = controlled(); w.enemies = [w.enemies[0]];
  let shot; for (let i = 0; i < attempts; i++) shot = action(w)[0];
  impact(w, shot, w.enemies[0]);
  assert.equal(w.killScore, Math.round(100 * [1, .85, .7, .55, .4][Math.min(attempts - 1, 4)]));
  assert.equal(w.attempts, 0); assert.equal(w.clearBonus, 750, 'clear bonus is never multiplied');
}
w = controlled(4); const armor = w.enemies.find(e => e.type === 2); w.enemies = [armor];
let shots; for (let i = 0; i < 5; i++) shots = action(w);
impact(w, shots[0], armor); assert.equal(armor.hp, 1); assert.equal(w.killScore, 0); assert.equal(w.attempts, 0);
impact(w, action(w)[0], armor); assert.equal(w.killScore, 200, 'nonlethal hit resets future action accuracy');
// Two low-accuracy actions already in flight retain their launch multipliers.
w = controlled(4); const a = w.enemies[0]; w.enemies = [a];
let old; for (let i = 0; i < 4; i++) old = action(w)[0]; const delayed = action(w)[0];
impact(w, old, a); assert.equal(w.attempts, 0); impact(w, delayed, a);
assert.equal(w.killScore, 80); assert.equal(w.lastAward.attempt, 5);
// Two targets killed by one spread action both keep its 40% snapshot, even after reset.
w = controlled(); w.enemies = w.enemies.slice(0, 2); for (let i = 0; i < 4; i++) action(w);
w.effects.spread = 10; const spread = action(w); assert.equal(spread.length, 2); assert.equal(w.attempts, 5);
assert.equal(spread[0].action, spread[1].action); near(Math.atan2(-spread[0].vx, -spread[0].vy) * 180 / Math.PI, 2.5);
near(Math.atan2(spread[1].vx, -spread[1].vy) * 180 / Math.PI, 2.5);
impact(w, spread[0], w.enemies[0]); impact(w, spread[1], w.enemies[0]); assert.equal(w.killScore, 80);
w = controlled(4); w.enemies = [w.enemies[0]]; for (let i = 0; i < 4; i++) action(w);
w.effects.spread = 10; const double = action(w); impact(w, double[0], w.enemies[0]); impact(w, double[1], w.enemies[0]);
assert.equal(w.killScore, 80, 'two spread impacts on armor do not promote the killing shot');
// Exercise real angled flight: a target off-center can only be struck by the diverging shot.
w = controlled(); w.enemies = [w.enemies[0]]; w.enemies[0].homeX = 193; w.enemies[0].x = 193;
w.effects.spread = 10; action(w); tick(w, 100); assert.ok(w.kills > 0);
console.log('PASS: accuracy tiers, nonlethal resets, delayed flights, spread action identity, real angled collisions, no scoring promotion');

// Seeded selection verifies weights rather than only comparing constants.
w = controlled(4, 71); w.enemies = [w.enemies.find(e => e.type === 1), w.enemies.find(e => e.type === 2)];
const fires = {1: 0, 2: 0}, dives = {1: 0, 2: 0};
for (let i = 0; i < 2400; i++) {
  w.enemies.forEach(e => { e.mode = 'formation'; }); w.shotClock = 0; w.diveClock = 1e9; tick(w, 1);
  const bullet=w.bullets.at(-1); fires[bullet.sourceType]++; near(bullet.speed,w.config.bulletSpeed*(bullet.sourceType===2?1.08:1)); w.bullets = [];
  w.diveClock = 0; w.shotClock = 1e9; tick(w, 1);
  const e = w.enemies.find(e => e.mode === 'telegraph'); dives[e.type]++; near(e.speed, w.config.diveSpeed * E.TYPES[e.type].speed);
}
assert.ok(fires[2] / fires[1] > 1.3 && fires[2] / fires[1] < 1.7);
assert.ok(dives[2] / dives[1] > 1.15 && dives[2] / dives[1] < 1.6);
for (const [level, count, loops] of [[11, 1, false], [12, 1, false], [13, 1, true], [14, 1, true], [15, 2, true], [18, 2, true], [19, 3, true], [20, 3, true]]) {
  w = controlled(level); w.enemies = w.enemies.filter(e => e.type === 3).slice(0, count);
  w.diveClock = 0; tick(w, 1);
  const group = w.enemies.slice(); assert.equal(group.length, count); assert.ok(group.every(e => e.mode === 'telegraph' && e.attack === 1 && e.loop === loops));
  const startY = group.map(e => e.y); tick(w, 80);
  assert.ok(group.every(e => e.mode === 'telegraph'), 'readable warning lasts at least 0.66s');
  group.forEach((e, i) => assert.ok(Math.abs(e.y - startY[i]) < 8));
  tick(w, 12); assert.ok(group.every(e => e.mode === 'dive'));
  let rising = false, lastY = group[0].y, returned = false;
  w.player.x = w.target.x = 18; w.invulnerable = 100;
  for (let i = 0; i < 1100; i++) {
    tick(w, 1);
    for (const e of group) assert.ok(e.x >= 18 && e.x <= 342 && Number.isFinite(e.y));
    if (group[0].mode === 'dive' && group[0].y < lastY - .001) rising = true;
    lastY = group[0].y;
    const lower = group.filter(e => e.mode === 'dive' && e.y > 249);
    for (let j = 1; j < lower.length; j++) assert.ok(lower[j].x - lower[j - 1].x >= 90, 'clear lower-field escape gaps');
    if (group.every(e => e.mode === 'return')) { returned = true; break; }
  }
  assert.equal(rising, loops); assert.ok(returned, 'curved flight completes and re-enters');
  w.diveClock=1e9;
  let previous=group.map(e=>({x:e.x,y:e.y}));
  for(let i=0;i<160;i++){
    tick(w,1);
    group.forEach((e,j)=>assert.ok(Math.hypot(e.x-previous[j].x,e.y-previous[j].y)<6,'smooth re-entry without snapping to formation'));
    previous=group.map(e=>({x:e.x,y:e.y}));
  }
  assert.ok(group.every(e=>e.mode==='formation'));
}
w = controlled(19); w.enemies = [w.enemies.find(e=>e.type===1),w.enemies.find(e=>e.type===2),w.enemies.find(e=>e.type===3)];
w.diveClock=0; tick(w,1); assert.ok(w.enemies.every(e=>e.loop));
tick(w,92); assert.ok(w.enemies.every(e=>e.mode==='dive' && e.age===w.enemies[0].age && e.speed===w.enemies[0].speed), 'mixed group synchronizes its entire path');
const first = E.create(20, 57), second = E.create(20, 57); tick(first, 2000); tick(second, 2000);
assert.deepEqual(first.enemies, second.enemies); assert.deepEqual(first.bullets, second.bullets); assert.equal(first.random(), second.random());
console.log('PASS: armored fire/dive weighting and speed, later introductions, telegraphs, loops, synchronized groups, fair lanes, seeded determinism');

const drops = {shield: 0, rapid: 0, spread: 0};
for (let seed = 1; seed <= 100; seed++) {
  w = controlled(1, seed); const seen = new Set();
  killAll(w, q => { q.pickups.forEach(p => seen.add(p.kind)); assert.ok(q.pickups.length <= 3); });
  for (const kind of seen) drops[kind]++;
}
assert.equal(drops.shield, 100); assert.ok(drops.rapid > 40 && drops.rapid < 85); assert.ok(drops.spread > 30 && drops.spread < 80);
w = controlled();
for (const kind of ['shield', 'rapid', 'spread']) w.pickups.push({kind, x: 180, y: 424, age: 0});
tick(w, 1); assert.equal(w.shield, true); near(w.effects.rapid, 8); near(w.effects.spread, 10); assert.equal(w.pickups.length, 0);
const both = action(w); assert.equal(both.length, 2); assert.equal(w.actionId, 1); near(w.fireCooldown + DT, w.config.playerCooldown * .5);
w.effects.rapid = 2; w.pickups.push({kind: 'rapid', x: 180, y: 424, age: 0}); tick(w, 1); near(w.effects.rapid, 8);
w.pickups.push({kind: 'spread', x: 20, y: E.H + 19, age: 0}); tick(w, 2); assert.equal(w.pickups.length, 0, 'missed drop falls offscreen');
w.effects.rapid = DT / 2; w.effects.spread = 2; tick(w,1);
assert.equal(w.effects.rapid,0); const slowerSpread=action(w); assert.equal(slowerSpread.length,2); near(w.fireCooldown + DT,w.config.playerCooldown);
w.effects.rapid = 2; w.effects.spread = DT / 2; tick(w,1); const fastSingle=action(w); assert.equal(fastSingle.length,1); near(w.fireCooldown + DT,w.config.playerCooldown*.5);
w.effects.rapid = DT / 2; w.effects.spread = DT / 2; tick(w, 1); assert.equal(w.effects.rapid, 0); assert.equal(w.effects.spread, 0);
const normal = action(w); assert.equal(normal.length, 1); near(w.fireCooldown + DT, w.config.playerCooldown);
w = controlled(); w.invulnerable = 0;
function bulletHit() { w.bullets.push({x: w.player.x, y: w.player.y - 2, previousY: w.player.y - 2, speed: 100}); tick(w, 1); }
bulletHit(); assert.equal(w.lives, 2); bulletHit(); assert.equal(w.lives, 2);
w.shield = true; w.invulnerable = 0; bulletHit(); assert.equal(w.lives, 2); assert.equal(w.shield, false);
w.invulnerable = 0; w.lives = 1; bulletHit(); assert.equal(w.state, 'lost'); assert.equal(w.lives, 0);
console.log('PASS: bounded seeded drops, pickup collection/refresh/miss/expiry, stacked weapons, shield protection/grace and defeat');
for (let level = 1; level <= 30; level++) {
  w = E.create(level, level * 27);
  for (let i = 0; i < 120 * 120 && w.state === 'playing'; i++) {
    w.invulnerable = 1; E.step(w, DT, {fire: true, dx: Math.sin(i / 180)});
    assert.ok(Number.isFinite(w.player.x) && Number.isFinite(w.player.y));
    assert.ok(w.shots.length < 40 && w.bullets.length < 40 && w.particles.length < 250 && w.pickups.length <= 3);
    w.events.length = 0;
  }
}
console.log('PASS: two-minute simulations in all 30 sectors keep transient entities bounded');
