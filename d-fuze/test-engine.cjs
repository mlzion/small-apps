"use strict";
const assert = require("node:assert/strict");
const { Game, STATES, levelConfig } = require("./engine.js");
const fresh = (emit, resolver) => {
  const g = new Game(emit, resolver);
  g.newGame();
  // Isolate the preserved Phase 1 mechanics; ring integration has its own suite.
  g.rings = [];
  return g;
};
{
  const g = fresh();
  assert.equal(g.state, STATES.PLAYING);
  assert.equal(g.level, 1);
  assert.equal(g.lives, 3);
  assert.equal(g.angle, -Math.PI / 2);
  for (const fps of [15, 30, 60, 144]) {
    const a = fresh();
    for (let i = 0; i < fps * 2; i++) a.update(1 / fps, { cw: true });
    assert(Math.abs(a.angle - (-Math.PI / 2 + (4 * Math.PI) / 3)) < 1e-8);
    assert(Math.abs(a.remaining - (a.config.time - 2)) < 1e-8);
    const b = fresh();
    b.update(2, { ccw: true });
    assert(Math.abs(b.angle - (-Math.PI / 2 - (4 * Math.PI) / 3)) < 1e-8);
  }
  const angle = g.angle;
  g.update(1);
  assert.equal(g.angle, angle);
}
{
  const g = fresh();
  assert(g.fire());
  assert.equal(g.ammo, 23);
  assert.equal(g.health, 2);
  assert(!g.fire());
  g.update(0.249);
  assert(!g.fire());
  g.update(0.001);
  assert(g.fire());
  g.update(0.25);
  assert(g.fire());
  assert.equal(g.health, 0);
  assert.equal(g.state, STATES.DEFUSING);
  const time = g.remaining;
  g.update(1);
  assert.equal(g.remaining, time);
  assert.equal(g.state, STATES.LEVEL_COMPLETE);
  assert.equal(g.level, 1);
  assert.equal(g.lives, 3);
  g.update(100);
  assert.equal(g.level, 1);
  g.nextLevel();
  assert.equal(g.level, 2);
  assert.equal(g.health, 5);
  assert.equal(g.ammo, 32);
}
{
  const shots = [];
  const g = fresh((e) => shots.push(e));
  g.update(0.5, { fire: true, cw: true });
  assert.equal(shots.filter((e) => e === "fire").length, 3);
  assert.equal(g.state, STATES.DEFUSING);
  const final = fresh();
  final.ammo = 1;
  final.health = 1;
  final.fire();
  assert.equal(final.state, STATES.DEFUSING);
  assert.equal(final.lives, 3);
  assert.equal(final.ammo, 0);
  assert.equal(final.health, 0);
  assert(!final.fire());
}
{
  const g = fresh();
  g.ammo = 1;
  g.fire();
  assert.equal(g.state, STATES.EXPLODING);
  assert.equal(g.lives, 2);
  g.fail();
  assert.equal(g.lives, 2);
  g.update(2);
  assert.equal(g.state, STATES.LEVEL_FAILED);
  g.retry();
  assert.equal(g.level, 1);
  assert.equal(g.remaining, 48);
  assert.equal(g.ammo, 24);
  assert.equal(g.health, 3);
  assert.equal(g.angle, -Math.PI / 2);
  for (let i = 0; i < 2; i++) {
    g.update(g.config.time);
    assert.equal(g.remaining, 0);
    g.update(2);
    if (i === 0) g.retry();
  }
  assert.equal(g.state, STATES.GAME_OVER);
  assert.equal(g.lives, 0);
  g.newGame();
  assert.equal(g.level, 1);
  assert.equal(g.lives, 3);
}
{
  const pulses = [];
  const g = fresh((e, urgent) => {
    if (e === "pulse") pulses.push([g.elapsed, urgent]);
  });
  g.update(3.4);
  assert.deepEqual(
    pulses.map((p) => p[0]),
    [1, 2, 3],
  );
  g.pause();
  const snapshot = JSON.stringify(g);
  g.update(100, { fire: true, cw: true });
  assert.equal(JSON.stringify(g), snapshot);
  assert(!g.fire());
  g.resume();
  g.update(g.config.time - 8.4);
  assert.equal(g.remaining, 5);
  assert.deepEqual(pulses.at(-1), [g.config.time - 5, true]);
  g.update(0.5);
  assert.equal(pulses.at(-1)[0], g.config.time - 4.5);
  g.update(4.5);
  const count = pulses.length;
  g.update(10);
  assert.equal(pulses.length, count);
  assert.equal(g.lives, 2);
}
{
  let shot;
  const blocker = {};
  const g = fresh(undefined, (s) => {
    shot = s;
    return { target: blocker, damage: 1 };
  });
  g.fire();
  assert.equal(g.health, 3);
  assert.equal(g.ammo, 23);
  assert(Math.abs(shot.origin.x / require("./rings.js").GEOMETRY.muzzleRadius + shot.direction.x) < 1e-10);
  assert(Math.abs(shot.origin.y / require("./rings.js").GEOMETRY.muzzleRadius + shot.direction.y) < 1e-10);
  for (let level = 1; level <= 6; level++) {
    const c = levelConfig(level);
    assert(c.time >= 10);
    assert(c.ammo >= c.hits);
    assert((c.hits - 1) / c.fireRate < c.time);
    assert.equal(c.rings.count, level<=3?1:2);
    assert(c.ammo > c.minimumHits);
  }
}
console.log(
  "PASS: movement/frame-rate invariance, inward shots, cooldown/hold, health/ammo, final-shot precedence, pause/timer/pulses, lives/retry/progression/game over, resolver interception, six published configurations",
);
