"use strict";
const assert = require("node:assert/strict");
const S = require("./level-schema.js"),
  M = require("./experimental-motion.js"),
  { Game } = require("./engine.js");
const make = (level = S.defaults().levels[3]) => {
  const g = new Game(undefined, undefined, {
    seed: level.seed,
    testLevel: level,
  });
  g.newGame();
  return g;
};
const close = (a, b) => assert(Math.abs(a - b) < 1e-7);
{
  const g = make(),
    [inner, outer] = g.rings;
  assert.equal(inner.radius, 108);
  assert.equal(outer.radius, 138);
  g.angle = Math.PI / 2;
  g.fire();
  assert.equal(g.lastShot.kind, "wall");
  close(Math.hypot(g.lastShot.point.x, g.lastShot.point.y), 142);
  assert.deepEqual(
    g.rings.map((r) => r.gate.health),
    [2, 2],
  );
  assert.equal(g.health, 3);
  // Work inside the real Easy alignment hold with the real firing cooldown.
  g.update(3.5 - g.elapsed);
  g.angle = -Math.PI / 2;
  for (let i = 0; i < 2; i++) {
    const before = g.ammo;
    g.fire();
    assert.equal(g.ammo, before - 1);
    assert.equal(inner.gate.health, 2);
    assert.equal(outer.gate.health, 1 - i);
    assert.equal(g.health, 3);
    g.update(0.25);
  }
  assert.equal(outer.gate.health, 0);
  for (let i = 0; i < 2; i++) {
    g.fire();
    assert.equal(inner.gate.health, 1 - i);
    assert.equal(outer.gate.health, 0);
    assert.equal(g.health, 3);
    close(Math.hypot(g.lastShot.point.x, g.lastShot.point.y), 112);
    g.update(0.25);
  }
  g.fire();
  assert.equal(g.health, 2);
  close(Math.hypot(g.lastShot.point.x, g.lastShot.point.y), 75);
  g.update(0.25);
  g.angle = Math.PI / 2;
  g.fire();
  assert.equal(g.health, 2);
  assert.equal(g.lastShot.kind, "wall");
  assert.deepEqual(
    g.rings.map((r) => r.gate.health),
    [0, 0],
  );
  g.fail();
  g.update(2);
  g.retry();
  assert.deepEqual(
    g.rings.map((r) => r.gate.health),
    [2, 2],
  );
  assert.equal(g.elapsed, 0);
}
{
  const g = make();
  g.rings[1].gate.health = 0;
  g.rings[0].referenceOffset = 0;
  g.angle = -Math.PI / 2;
  g.fire();
  assert.equal(g.lastShot.kind, "wall");
  assert.equal(g.rings[0].gate.health, 2);
  close(Math.hypot(g.lastShot.point.x, g.lastShot.point.y), 112);
}
for (const family1 of ["easy", "medium", "hard"])
  {
    const level = S.clone(S.defaults().levels[3]);
    level.motionFamily = family1;
    level.rings[0] = S.defaultRing(1);
    level.rings[1] = S.defaultRing(2);
    level.assembly = {
      profileId: "gentle-drift",
      playbackSpeed: 1,
    };
    const g = make(level),
      same = make(level);
    assert.deepEqual(
      g.rings.map((r) => r.profile.id),
      same.rings.map((r) => r.profile.id),
    );
    g.update(4.5);
    close(g.rings[0].relativeAngle, 0);
    close(g.rings[1].relativeAngle, 0);
    close(
      g.rings[0].assemblyAngle,
      require("./assembly.js").sampleProfile(
        require("./assembly.js").defaults()[0],
        4.5,
      ),
    );
    close(g.rings[0].displayAngle, g.rings[1].displayAngle);
    g.angle = g.rings[1].displayAngle;
    g.fire();
    assert.equal(g.rings[1].gate.health, 1);
    assert.equal(g.rings[0].gate.health, 2);
    g.pause();
    const frozen = JSON.stringify(g);
    g.update(100);
    assert.equal(JSON.stringify(g), frozen);
    g.resume();
    g.update(0.25);
    close(g.rings[0].assemblyAngle, g.rings[1].assemblyAngle);
  }
// Validate a conservative shared-hold strategy for each level family.
for (const a of ["easy", "medium", "hard"])
  {
    const level = S.clone(S.defaults().levels[3]);
    level.rings = [S.defaultRing(1), S.defaultRing(2)];
    level.motionFamily = a;
    const g = make(level);
    while (g.state === "PLAYING") {
      if (g.rings.every((r) => Math.abs(r.relativeAngle) < 1e-8)) g.fire();
      g.update(0.05);
    }
    assert.equal(g.state, "DEFUSING");
  }
{
  const g = new Game(undefined, undefined, { seed: 42 });
  g.newGame();
  for (let level = 1; level <= 6; level++) {
    assert.equal(g.level, level);
    assert.equal(g.rings.length, level < 4 ? 1 : 2);
    if (level >= 4) {
      assert.equal(g.config.time, S.defaults().levels[level - 1].timer);
      assert.deepEqual(
        g.rings.map((r) => r.gate.maxHealth),
        S.defaults().levels[level - 1].rings.map((r) => r.gateHealth),
      );
    }
    g.transition("LEVEL_COMPLETE");
    g.nextLevel();
  }
  assert.equal(g.level, 7);
  assert.equal(g.state, "PLAYING");
  const fail = make();
  fail.ammo = 1;
  fail.angle = 0;
  fail.fire();
  assert.equal(fail.state, "EXPLODING");
  assert.equal(fail.lives, 2);
  const timeout = make();
  timeout.update(timeout.config.time);
  assert.equal(timeout.state, "EXPLODING");
}
console.log(
  "PASS: outer/inner walls and gates, independent health, outside-in immunity, one target/shot, beam endpoints, destroyed-wall blocking, retry, three level-family wins, shared holds/assembly/collision/pause, seeded profiles, normal levels 1–6/advance, ammo/timeout",
);

for (let level = 4; level <= 6; level++)
  for (const seed of [1, 42, 90000]) {
    const g = new Game(undefined, undefined, { seed });
    g.level = level;
    g.startLevel();
    while (g.state === "PLAYING") {
      if (g.rings.every((r) => Math.abs(r.relativeAngle) < 1e-8)) g.fire();
      g.update(0.05);
    }
    assert.equal(g.state, "DEFUSING");
    assert(g.ammo > 0);
  }
console.log("PASS: nine published level/seed conservative wins");
