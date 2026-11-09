"use strict";
const assert = require("node:assert/strict");
const { Game, levelConfig } = require("./engine.js");
const {
  FAMILY,
  PROFILES,
  sampleProfile,
  validateProfile,
  seededRandom,
  selectProfile,
} = require("./motion.js");
const {
  GEOMETRY,
  Ring,
  resolveShot,
  rayArc,
  normalize,
  angleInArc,
} = require("./rings.js");
const near = (a, b) => assert(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const fresh = (seed) => {
  const g = new Game(undefined, undefined, { seed });
  g.newGame();
  return g;
};
const ray = (angle) => ({
  origin: { x: 216 * Math.cos(angle), y: 216 * Math.sin(angle) },
  direction: { x: -Math.cos(angle), y: -Math.sin(angle) },
});
const settings = levelConfig(1).rings;
assert(angleInArc(0.05, Math.PI * 2 - 0.1, 0.2));
assert(!angleInArc(0.3, Math.PI * 2 - 0.1, 0.2));
near(normalize(-0.1), Math.PI * 2 - 0.1);
{
  const r = new Ring(1, settings, PROFILES[0]),
    bomb = {};
  const world = { rings: [r], bomb };
  assert.equal(resolveShot(ray(0), world).kind, "wall");
  let hit = resolveShot(ray(r.displayAngle), world);
  assert.equal(hit.kind, "gate");
  assert.equal(hit.target, r.gate);
  near(hit.distance, 216 - 112);
  assert.equal(
    resolveShot(ray(r.displayAngle + r.gateArc / 2), world).kind,
    "wall",
  );
  r.relativeAngle = Math.PI * 2 + 0.1;
  near(r.gate.angle, r.relativeAngle + r.referenceOffset);
  assert.equal(resolveShot(ray(r.gate.angle), world).kind, "gate");
  r.gate.damage(1);
  assert(r.gate.opacity < 1 && r.gate.opacity > 0);
  r.gate.damage(1.25);
  assert.equal(r.gate.health, 0);
  assert.equal(r.gate.opacity, 0);
  assert(!r.gate.damage(2));
  assert.equal(resolveShot(ray(r.gate.angle), world).target, bomb);
  r.update(2);
  const angle = r.displayAngle;
  r.update(3);
  assert.notEqual(r.displayAngle, angle);
  assert.equal(r.gate.health, 0);
  assert.equal(resolveShot(ray(r.gate.angle), world).kind, "bomb");
  assert.equal(resolveShot(ray(r.gate.angle + Math.PI), world).kind, "wall");
  const outside = new Ring(4, { ...settings, radius: 198 }, PROFILES[0]);
  // Physical encounter order wins even with shuffled numbers and arrays.
  for (const rings of [
    [r, outside],
    [outside, r],
  ])
    assert.equal(resolveShot(ray(0), { rings, bomb }).ring, outside);
  outside.gate.health = 0;
  assert.equal(
    resolveShot(ray(outside.gate.angle), { rings: [outside, r], bomb }).ring,
    r,
  );
  assert.equal(
    resolveShot(ray(outside.gate.angle), { rings: [outside], bomb }).kind,
    "bomb",
  );
  const disk = rayArc(
    { x: 200, y: 0 },
    { x: -1, y: 0 },
    108,
    8,
    0,
    Math.PI * 2,
  );
  near(disk.distance, 88);
  assert.equal(
    rayArc({ x: 200, y: 200 }, { x: 1, y: 0 }, 108, 8, 0, Math.PI * 2),
    null,
  );
  // A noncentral ray can enter through a radial arc face instead of a circle.
  const side = rayArc(
    { x: 106, y: -20 },
    { x: 0, y: 1 },
    108,
    8,
    0,
    Math.PI / 2,
  );
  near(side.distance, 20);
  near(side.point.x, 106);
}
for (const p of PROFILES) {
  assert(validateProfile(p));
  for (const [start, end] of FAMILY.alignmentWindows)
    for (let t = start; t <= end; t += 0.1) near(sampleProfile(p, t), 0);
  near(sampleProfile(p, 16), 0);
  near(sampleProfile(p, 16 + 2), sampleProfile(p, 2));
  near(sampleProfile(p, -1), sampleProfile(p, 15));
}
assert.throws(() =>
  validateProfile({
    ...PROFILES[0],
    keyframes: [
      [0, 0, "linear"],
      [16, 20, "linear"],
    ],
  }),
);
const testTrack = {
  family: { duration: 4 },
  keyframes: [
    [0, 0, "linear"],
    [1, 90, "linear"],
    [2, 90, "linear"],
    [3, -90, "smooth"],
    [4, 0, "linear"],
  ],
};
near(sampleProfile(testTrack, 0.5), Math.PI / 4);
near(sampleProfile(testTrack, 1.5), Math.PI / 2);
assert(sampleProfile(testTrack, 2.5) < sampleProfile(testTrack, 2));
near(sampleProfile(testTrack, 3.5), -Math.PI / 4);
assert.throws(() =>
  selectProfile("easy", seededRandom(1), "incompatible-family"),
);
const choices = seededRandom(77);
assert.equal(
  new Set(Array.from({ length: 50 }, () => selectProfile("easy", choices).name))
    .size,
  2,
);
const a = seededRandom(42),
  b = seededRandom(42);
for (let i = 0; i < 100; i++)
  assert.equal(selectProfile("hard", a), selectProfile("hard", b));
{
  const g = fresh(42),
    same = fresh(42);
  assert.equal(g.rings[0].profile.name, same.rings[0].profile.name);
  const profile = g.rings[0].profile;
  g.update(2);
  assert.equal(g.rings[0].profile, profile);
  g.angle = -Math.PI / 2;
  g.fire();
  assert.equal(g.lastShot.kind, "wall");
  assert.equal(g.health, 3);
  assert.equal(g.ammo, 23);
  g.update(0.25);
  g.angle = g.rings[0].gate.angle;
  g.fire();
  assert.equal(g.lastShot.kind, "gate");
  assert.equal(g.rings[0].gate.health, 1);
  assert.equal(g.health, 3);
  g.pause();
  const snapshot = JSON.stringify(g);
  g.update(100, { fire: true, cw: true });
  assert.equal(JSON.stringify(g), snapshot);
  g.resume();
  g.update(0.25);
  g.angle = g.rings[0].gate.angle;
  g.fire();
  assert.equal(g.rings[0].gate.health, 0);
  g.update(0.25);
  g.angle = g.rings[0].gate.angle;
  g.fire();
  assert.equal(g.health, 2);
  assert.equal(g.lastShot.kind, "bomb");
  g.fail();
  g.update(2);
  g.retry();
  assert.equal(g.animationTime, 0);
  assert.equal(g.rings[0].gate.health, 2);
  assert.equal(g.rings[0].relativeAngle, 0);
  g.level = 3;
  g.startLevel();
  g.update(2);
  near(g.animationTime, 2 * g.config.animationPlaybackSpeed);
  near(
    g.rings[0].relativeAngle,
    sampleProfile(g.rings[0].profile, g.animationTime),
  );
}
{
  const run = (fps) => {
    const events = [];
    const g = new Game(
      (e) => {
        if (["gateHit", "wallHit", "hit"].includes(e)) events.push(e);
      },
      undefined,
      { seed: 12 },
    );
    g.newGame();
    for (let i = 0; i < fps * 3; i++)
      g.update(1 / fps, { fire: true, cw: true });
    return { g, events };
  };
  const slow = run(15),
    fast = run(144);
  assert.deepEqual(slow.events, fast.events);
  near(slow.g.rings[0].relativeAngle, fast.g.rings[0].relativeAngle);
  assert.equal(slow.g.ammo, fast.g.ammo);
}
// Conservative finite-library validation: wait at the shared reference angle,
// shoot only when the geometry is zero. This is an available player strategy,
// not a collision permission rule. All later settings plateau by level 15.
let validated = 0;
for (let level = 1; level <= 3; level++)
  for (const profile of PROFILES.filter(
    (p) => p.difficulty === levelConfig(level).rings.difficulty,
  )) {
    const g = fresh(1);
    g.level = level;
    g.startLevel();
    g.rings[0].profile = profile;
    assert(g.config.ammo > g.config.minimumHits);
    assert.equal(g.rings.length, 1);
    while (g.state === "PLAYING") {
      if (Math.abs(g.rings[0].relativeAngle) < 1e-9) g.fire();
      g.update(0.05);
    }
    assert.equal(g.state, "DEFUSING", `Level ${level}, ${profile.name}`);
    assert(g.ammo > 0);
    assert(g.remaining > 10);
    validated++;
  }
console.log(
  `PASS: arc/ray wrap/edge/side geometry, wall/gate/first-hit order, gate parent/health/opacity/opening, motion after destruction, profiles/interpolation/reversals/holds/loops, seeded selection, exact-time hits, pause/retry/playback, frame invariance, ${validated} conservative level/profile wins`,
);
