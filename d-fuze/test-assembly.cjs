"use strict";
const assert = require("node:assert/strict"),
  A = require("./assembly.js"),
  S = require("./level-schema.js"),
  L = require("./levels.js"),
  { Game } = require("./engine.js"),
  R = require("./rings.js"),
  M = require("./experimental-motion.js");
const near = (a, b, t = 1e-7) => assert(Math.abs(a - b) < t, `${a} vs ${b}`),
  p = A.defaults()[0];
assert.equal(p.duration, 25);
assert.deepEqual(A.validateProfile(p), []);
for (const [t, a] of p.keyframes)
  near(A.sampleProfile(p, t), (a * Math.PI) / 180);
for (let i = 0; i < p.keyframes.length - 1; i++) {
  const [t, a] = p.keyframes[i],
    [u, b] = p.keyframes[i + 1];
  for (let x = t; x <= u; x += 0.01) {
    const v = (A.sampleProfile(p, x) * 180) / Math.PI;
    assert(v >= Math.min(a, b) - 1e-7 && v <= Math.max(a, b) + 1e-7);
  }
}
const e = 0.00001;
near(
  (A.sampleProfile(p, 25) - A.sampleProfile(p, 25 - e)) / e,
  (A.sampleProfile(p, e) - A.sampleProfile(p, 0)) / e,
  1e-5,
);
const turn = {
  id: "turn",
  name: "Unwrapped turn",
  duration: 25,
  keyframes: [
    [0, 0],
    [25, 400],
  ],
};
near(A.sampleProfile(turn, 50), (800 * Math.PI) / 180);
near(A.sampleProfile(turn, -1), (-16 * Math.PI) / 180);
for (const q of [
  { ...p, duration: 0 },
  {
    ...p,
    keyframes: [
      [0, 0],
      [0, 5],
      [25, 0],
    ],
  },
  {
    ...p,
    keyframes: [
      [0, 0],
      [25, Infinity],
    ],
  },
  {
    ...p,
    keyframes: [
      [1, 0],
      [25, 0],
    ],
  },
])
  assert(A.validateProfile(q).length);
const doc = S.defaults();
doc.levels[3].assembly = { profileId: p.id, playbackSpeed: 1.7 };
doc.levels[3].playbackSpeed = 1.2;
assert.deepEqual(S.importJSON(S.exportJSON(doc)), doc);
const g = new Game(undefined, undefined, {
  seed: 42,
  testLevel: doc.levels[3],
  assemblyProfiles: doc.assemblyProfiles,
});
g.newGame();
g.update(4.5 / 1.2);
near(g.animationTime, 4.5);
near(g.assembly.time, g.elapsed * 1.7);
assert(g.rings.every((r) => r.parent === g.assembly));
near(
  g.rings[0].displayAngle - g.rings[1].displayAngle,
  g.rings[0].relativeAngle - g.rings[1].relativeAngle,
);
g.angle = g.rings[1].displayAngle;
g.fire();
assert.equal(g.rings[1].gate.health, 1);
assert.equal(g.rings[0].gate.health, 2);
g.pause();
const snapshot = JSON.stringify(g);
g.update(99);
assert.equal(JSON.stringify(g), snapshot);
g.resume();
g.fail();
g.update(2);
g.retry();
assert.equal(g.assembly.time, 0);
near(g.assembly.angle, 0);
const old = S.clone(doc);
old.version = 1;
delete old.assemblyProfiles;
delete old.ringProfiles;
old.levels.forEach((l) => {
  l.assembly = { enabled: false };
  l.rings.forEach((r) => (r.profiles = M.eligible(r.family).map((p) => p.id)));
});
old.levels[3].assembly = { enabled: true, speed: -30 };
const migrated = S.importJSON(JSON.stringify(old));
assert.equal(migrated.version, 3);
assert.deepEqual(
  migrated.levels[3].rings,
  doc.levels[3].rings.map((r) => ({
    ...r,
    gateWidth: Math.round(r.gateWidth / 10) * 10,
  })),
);
const cp = migrated.assemblyProfiles.find(
  (p) => p.id === migrated.levels[3].assembly.profileId,
);
near(A.sampleProfile(cp, 51), (-1530 * Math.PI) / 180);
const storage = { getItem: () => JSON.stringify(old) };
assert.deepEqual(S.importJSON(storage.getItem()), migrated);
assert.throws(() => S.importJSON(JSON.stringify({ ...doc, version: 99 })));
const bad = S.clone(doc);
bad.levels[0].assembly.profileId = "missing";
assert(S.validateDocument(bad).some((e) => e.includes("profile ID")));
for (let n = 1; n <= 6; n++) {
  const published = L.publishedLevel(n),
    game = new Game(undefined, undefined, { seed: published.seed });
  game.level = n;
  game.startLevel();
  for (const [key, value] of Object.entries({
    time: published.timer,
    hits: published.bombHealth,
    ammo: published.ammo,
    turretSpeed: published.turretSpeed,
    fireRate: published.fireRate,
    animationPlaybackSpeed: published.playbackSpeed,
  }))
    assert.equal(game.config[key], value);
  assert.equal(game.rings.length, published.ringCount);
  assert.deepEqual(
    game.rings.map((r) => r.gate.maxHealth),
    published.rings.map((r) => r.gateHealth),
  );
}
const published = require("./published-levels.json"),
  saved = published.levels[0].timer;
published.levels[0].timer = 0;
assert.throws(() => new Game(), /Timer/);
published.levels[0].timer = saved;
assert.equal(require("./motion.js").PROFILES, undefined);
assert(M.PROFILES.every((p) => p.family.duration === 10));
console.log(
  "PASS: published source/no overrides/invalid rejection, parent/world collisions, independent clocks, no overshoot/C1 loops/unwrapped turns, keys/library validation, JSON/draft v1 migration, pause/retry, unchanged 10-second library",
);

const source = require("./published-levels.json"),
  original = S.clone(source.levels[0]);
try {
  Object.assign(source.levels[0], {
    timer: 89,
    bombHealth: 8,
    ammo: 55,
    turretSpeed: 90,
    fireRate: 5,
    seed: 123,
  });
  Object.assign(source.levels[0].rings[0], { gateWidth: 70, gateHealth: 3 });
  const live = new Game();
  live.newGame();
  assert.equal(live.config.time, 89);
  assert.equal(live.health, 8);
  assert.equal(live.ammo, 55);
  assert.equal(live.config.turretSpeed, 90);
  assert.equal(live.config.fireRate, 5);
  assert.equal(live.seed, 123);
  near(live.rings[0].gateArc, (70 * Math.PI) / 180);
  assert.equal(live.rings[0].gate.maxHealth, 3);
  source.levels[0].timer = 0;
  const test = new Game(undefined, undefined, {
    testLevel: doc.levels[0],
    assemblyProfiles: doc.assemblyProfiles,
  });
  test.newGame();
  assert.equal(test.config.time, doc.levels[0].timer);
} finally {
  source.levels[0] = original;
}
console.log(
  "PASS: edited published fields/seed used without overrides; Test Mode independent of invalid published data",
);
