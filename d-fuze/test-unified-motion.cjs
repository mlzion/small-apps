"use strict";
const assert = require("node:assert/strict"),
  S = require("./level-schema.js"),
  M = require("./experimental-motion.js"),
  A = require("./assembly.js"),
  L = require("./levels.js"),
  { Game } = require("./engine.js");
const near = (a, b, e = 1e-6) => assert(Math.abs(a - b) < e, `${a} != ${b}`);
const doc = S.defaults();
assert.equal(doc.version, 4);
assert.deepEqual(S.validateDocument(doc), []);
assert(
  doc.levels.every(
    (l) =>
      !Object.hasOwn(l.assembly, "enabled") &&
      l.rings.every(
        (r) =>
          !Object.hasOwn(r, "profiles") &&
          r.gateWidth >= 10 &&
          r.gateWidth <= 120 &&
          r.gateWidth % 10 === 0,
      ),
  ),
);
const edited = doc.ringProfiles.find((p) => p.id === "easy-01");
edited.keyframes[1][1] = -66;
assert.deepEqual(M.validateEditable(edited), []);
assert.deepEqual(S.importJSON(S.exportJSON(doc)), doc);
const library = S.clone(doc.ringProfiles);
for (const p of library.filter(p=>p.difficulty==='easy'))
  for(const key of p.keyframes) if(key[1]!==0)key[1]=-66;
const level = doc.levels[0];
const assigned = M.assignProfiles(level, 42, library);
assert.equal(assigned[0].keyframes[1][1], -66);
const g = new Game(undefined, undefined, {
  testLevel: level,
  assemblyProfiles: doc.assemblyProfiles,
  ringProfiles: library,
});
g.newGame();
g.update(1.2);
assert(g.rings[0].relativeAngle < 0);
assert.notEqual(g.assembly.angle, 0);
near(g.rings[0].displayAngle, g.assembly.angle + g.rings[0].localAngle);
for (const p of doc.ringProfiles) {
  const track = M.compile(p);
  for (const [a, b] of track.family.alignmentWindows) {
    for (let t = a; t <= b; t += 0.02) near(M.sampleProfile(track, t), 0);
    const e = 1e-5;
    near(
      (M.sampleProfile(track, a) - M.sampleProfile(track, a - e)) / e,
      0,
      0.003,
    );
    if (b < 10)
      near(
        (M.sampleProfile(track, b + e) - M.sampleProfile(track, b)) / e,
        0,
        0.003,
      );
  }
}
const broken = S.clone(edited);
broken.keyframes.find((k) => k[0] === 3.5)[1] = 5;
assert(M.validateEditable(broken).length);
broken.keyframes.find((k) => k[0] === 3.5)[1] = 0;
broken.duration = 11;
assert(M.validateEditable(broken).length);
const choices = new Set();
for (let seed = 1; seed < 10000; seed += 29)
  choices.add(M.assignProfiles(level, seed, doc.ringProfiles)[0].id);
assert.deepEqual(
  [...choices].sort(),
  doc.ringProfiles
    .filter((p) => p.difficulty === "easy")
    .map((p) => p.id)
    .sort(),
);
assert.deepEqual(
  M.assignProfiles(level, 42, doc.ringProfiles),
  M.assignProfiles(level, 42, doc.ringProfiles),
);
const old = S.clone(doc);
old.version = 2;
delete old.ringProfiles;
old.levels.forEach((l) => {
  l.assembly.enabled = false;
  l.playbackSpeed=1;l.rings.forEach(r=>{r.family=l.motionFamily;r.profiles=[M.eligible(r.family)[0].id]});delete l.motionFamily;
});
old.levels[0].rings[0].gateWidth = 91;
old.levels[1].rings[0].gateWidth = 180;
old.levels[2].rings[0].gateWidth = 80;
const migrated = S.importJSON(JSON.stringify(old));
assert.equal(migrated.levels[0].rings[0].gateWidth, 90);
assert.equal(migrated.levels[1].rings[0].gateWidth, 120);
assert.equal(migrated.levels[2].rings[0].gateWidth, 80);
assert(migrated.migrationNotes.some((n) => n.includes("91° adjusted to 90°")));
assert(
  migrated.migrationNotes.some((n) => n.includes("180° adjusted to 120°")),
);
assert.equal(migrated.levels[0].timer, old.levels[0].timer);
assert(!Object.hasOwn(migrated.levels[0].rings[0], "profiles"));
assert(!Object.hasOwn(migrated.levels[0].assembly, "enabled"));
for (const width of [9, 15, 121, 180]) {
  const bad = S.clone(doc);
  bad.levels[0].rings[0].gateWidth = width;
  assert(S.validateDocument(bad).some((e) => e.includes("gate width")));
}
const bad = S.clone(doc);
bad.levels[0].rings[0].profiles = ["easy-01"];
assert(S.validateDocument(bad).some((e) => e.includes("unknown")));
const storage = { getItem: () => JSON.stringify(old) };
assert.deepEqual(S.importJSON(storage.getItem()), migrated);
const transfer = S.readTestData(
  S.testPayload(level, doc.assemblyProfiles, doc.ringProfiles),
);
assert.deepEqual(transfer.ringProfiles, doc.ringProfiles);
for (let n = 1; n <= 6; n++) {
  const game = new Game();
  game.level = n;
  game.startLevel();
  game.update(2);
  assert.notEqual(game.assembly.angle, 0);
  assert.equal(game.rings.length, n <= 3 ? 1 : 2);
  const l = L.publishedLevel(n);
  assert.equal(game.config.time, l.timer);
  assert.equal(game.ammo, l.ammo);
  assert(game.rings.every((r) => (r.gateArc * 180) / Math.PI >= 9.999));
}
console.log(
  "PASS: v4 migrations/reporting, width steps, removed eligibility/enable flags, all-family seeded selection, negative custom keys persistence/Test Mode, protected holds and smooth entry/exit, always-on parent/world angles for all six levels",
);

const extended = S.clone(doc.ringProfiles);
extended.push({
  ...S.clone(extended[0]),
  id: "easy-extra",
  name: "Extra Easy",
});
assert(M.validateLibrary(extended).length);
assert.throws(() => M.assignProfiles(level, 1, extended));
