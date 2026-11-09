"use strict";
const assert = require("node:assert/strict");
const M = require("./experimental-motion.js"),
  S = require("./level-schema.js"),
  { Game } = require("./engine.js");
assert.equal(M.PROFILES.length, 18);
assert.equal(new Set(M.PROFILES.map((p) => p.id)).size, 18);
for (const [family, total] of [
  ["easy", 3],
  ["medium", 2],
  ["hard", 1],
]) {
  const profiles = M.eligible(family);
  assert.equal(profiles.length, 6);
  const signatures = new Set();
  for (const p of profiles) {
    assert(M.validateExperimentalProfile(p));
    assert.equal(p.family.duration, 10);
    assert.equal(
      p.family.alignmentWindows.reduce((s, [a, b]) => s + b - a, 0),
      total,
    );
    signatures.add(JSON.stringify(p.keyframes));
    assert(Object.isFrozen(p.keyframes));
    for (const [a, b] of p.family.alignmentWindows)
      for (let t = a; t <= b; t += 0.01) assert.equal(M.sampleProfile(p, t), 0);
    for (const speed of [0.25, 1, 3]) {
      const duration = 10 / speed,
        holds = p.family.alignmentWindows.reduce(
          (s, [a, b]) => s + (b - a) / speed,
          0,
        );
      assert(Math.abs(holds / duration - total / 10) < 1e-10);
    }
    assert.equal(M.sampleProfile(p, 10), 0);
    assert(
      Math.abs(M.sampleProfile(p, 11.2) - M.sampleProfile(p, 1.2)) < 1e-10,
    );
    // Every actual key is sampled exactly, including signed unwrapped angles.
    for (const [t, angle] of p.keyframes)
      assert(Math.abs(M.sampleProfile(p, t) - (angle * Math.PI) / 180) < 1e-8);
  }
  assert.equal(signatures.size, 6);
}
for (const a of M.eligible("easy"))
  for (const b of M.eligible("medium"))
    for (const c of M.eligible("hard"))
      for (const [start, end] of M.COMMON_WINDOWS)
        for (const t of [start, (start + end) / 2, end])
          for (const p of [a, b, c]) assert.equal(M.sampleProfile(p, t), 0);
assert.throws(() =>
  M.validateExperimentalProfile({ ...M.PROFILES[0], id: "legacy-copy" }),
);
const defaults = S.defaults();
assert.deepEqual(S.validateDocument(defaults), []);
assert.deepEqual(
  defaults.levels.map((l) => l.ringCount),
  [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4],
);
assert.deepEqual(S.importJSON(S.exportJSON(defaults)), defaults);
const assignments = M.assignProfiles(defaults.levels[11]);
assert.deepEqual(M.assignProfiles(defaults.levels[11]), assignments);
const mixed = S.clone(defaults.levels[8]);
mixed.rings.forEach((r, i) =>
  Object.assign(r, S.defaultRing(i + 1, ["hard", "medium", "easy"][i])),
);
assert.deepEqual(S.validateLevel(mixed), []);
const selected = M.assignProfiles(mixed);
assert.deepEqual(
  selected.map((p) => p.difficulty),
  ["hard", "hard", "hard"],
);
function invalid(mutator, match) {
  const d = S.clone(defaults);
  mutator(d);
  const errors = S.validateDocument(d);
  assert(
    errors.some((e) => e.includes(match)),
    errors.join("\n"),
  );
  assert.throws(() => S.exportJSON(d));
}
invalid((d) => (d.version = 99), "Unsupported");
invalid((d) => (d.levels[0].timer = NaN), "Timer");
invalid((d) => (d.levels[0].ringCount = 5), "Rings");
invalid((d) => (d.levels[0].rings[0].gateWidth = 0), "gate width");
invalid((d) => (d.levels[0].rings[0].gateHealth = -1), "gate health");
invalid((d) => (d.levels[0].motionFamily = "legacy"), "family");
invalid((d) => (d.levels[0].rings[0].profiles = []), "unknown");
invalid((d) => (d.levels[0].ammo = 1), "ammo must");
invalid((d) => {
  d.levels[0].timer = 5;
  d.levels[0].fireRate = 1;
  d.levels[0].bombHealth = 20;
}, "timer is too short");
invalid(
  (d) => (d.levels[0].assembly = { enabled: true, speed: 999 }),
  "assembly",
);
invalid((d) => (d.levels[0].seed = -1), "seed");
invalid((d) => (d.levels[1].number = 1), "unique");
invalid((d) => (d.levels[0].rings[0].keyframes = []), "unknown");
for (const text of [
  "null",
  "[]",
  '{"levels":[]}',
  "not JSON",
  '{"format":"d-fuze-levels","version":1,"motionLibrary":"builder-10-v1","levels":[null]}',
])
  assert.throws(() => S.importJSON(text));
assert.throws(() => S.importJSON(" ".repeat(1000001)));
assert.equal(S.saveDraft, undefined);
assert.equal(S.loadDraft, undefined);
assert.equal(S.exportCSV, undefined);
const level = defaults.levels[0];
assert.deepEqual(S.readTest(S.testPayload(level)), level);
assert.deepEqual(S.readTest(S.testPayload(defaults.levels[6])), defaults.levels[6]);
assert.throws(() => S.readTest('{"version":99}'));
const g = new Game(undefined, undefined, {
  seed: level.seed,
  testLevel: level,
});
g.newGame();
assert(g.testMode);
assert.equal(g.config.time, level.timer);
assert.equal(g.rings[0].profile.id, M.assignProfiles(level)[0].id);
g.update(1);
g.pause();
const before = JSON.stringify(g);
g.update(100);
assert.equal(JSON.stringify(g), before);
g.resume();
g.transition("LEVEL_COMPLETE");
g.nextLevel();
assert.equal(g.level, 1);
assert.equal(g.state, "LEVEL_COMPLETE");
const profile = g.rings[0].profile;
g.retry();
assert.equal(g.state, "PLAYING");
assert.equal(g.elapsed, 0);
assert.equal(g.rings[0].gate.health, level.rings[0].gateHealth);
assert.equal(g.rings[0].profile.id, profile.id);
g.seed = 90000;
g.transition("LEVEL_FAILED");
g.retry();
assert.equal(g.rings[0].profile.id, M.assignProfiles(level, 90000)[0].id);
assert.equal(g.lives, 3);
assert.equal(new Game(undefined, undefined, { testLevel: defaults.levels[11] }).rings.length, 4);
for (let number = 1; number <= 6; number++) {
  const g = new Game(undefined, undefined, { seed: 42 });
  g.level = number;
  g.startLevel();
  assert(
    g.rings.every(
      (r) => r.profile.family.duration === 10 && M.BY_ID.has(r.profile.id),
    ),
  );
  assert.equal(g.rings.length, number <= 3 ? 1 : 2);
}
const normal = new Game(undefined, undefined, { seed: 42 });
normal.newGame();
assert(!normal.testMode);
assert.equal(normal.rings[0].profile.family.duration, 10);
assert.equal(normal.config.time, 48);
console.log(
  "PASS: 18 starter profiles, exact holds, 216 cross-family library combinations, interpolation/loops/playback ratios, deterministic assignment, schema/rejections, JSON, removed draft helpers, Test Mode retry/no advance, four-ring Test Mode, published 10-second profiles",
);
