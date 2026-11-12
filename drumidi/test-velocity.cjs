const assert = require("node:assert/strict");
const D = require("./core.js");
// Curve passes all three control points; extreme slopes stay bounded and C1.
for (const points of [
  [
    { x: 0, y: 1 },
    { x: 0.5, y: 64 },
    { x: 1, y: 127 },
  ],
  [
    { x: 0, y: 127 },
    { x: 0.2, y: 1 },
    { x: 1, y: 127 },
  ],
  [
    { x: 0, y: 5 },
    { x: 0.87, y: 126 },
    { x: 1, y: 2 },
  ],
  [
    { x: 0, y: 100 },
    { x: 0.5, y: 100 },
    { x: 1, y: 100 },
  ],
]) {
  for (const p of points)
    assert(Math.abs(D.velocityAtCurve(points, p.x) - p.y) < 1e-8);
  const middle = points[1].x,
    h = 1e-6;
  const left =
    (D.velocityAtCurve(points, middle) -
      D.velocityAtCurve(points, middle - h)) /
    h;
  const right =
    (D.velocityAtCurve(points, middle + h) -
      D.velocityAtCurve(points, middle)) /
    h;
  assert(Math.abs(left - right) < 0.04);
  for (let i = 0; i <= 1000; i++) {
    const x = i / 1000,
      value = D.velocityAtCurve(points, x);
    const [a, b] = x < middle ? [points[0], points[1]] : [points[1], points[2]];
    assert(
      value >= Math.min(a.y, b.y) - 1e-9 && value <= Math.max(a.y, b.y) + 1e-9,
    );
  }
}
const points = [
  { x: 0, y: 15 },
  { x: 0.4, y: 112 },
  { x: 1, y: 40 },
];
for (let bars = 1; bars <= 4; bars++) {
  const project = D.fresh(),
    p = project.patterns[15];
  p.bars = bars;
  p.notes = Array.from({ length: bars * 64 }, (_, step) => ({
    drum: 38,
    step,
    velocity: 80,
  }));
  p.notes.push({ drum: 35, step: 0, velocity: 111 });
  project.patterns[0].notes = [{ drum: 38, step: 0, velocity: 43 }];
  const before = structuredClone(project),
    ids = p.notes.map((n) => [n.drum, n.step]);
  D.applyVelocityCurve(p, 38, points);
  assert.deepEqual(
    p.notes.map((n) => [n.drum, n.step]),
    ids,
  );
  assert.deepEqual(project.patterns.slice(0, 15), before.patterns.slice(0, 15));
  assert.equal(p.notes.at(-1).velocity, 111);
  for (const n of p.notes.filter((n) => n.drum === 38))
    assert.equal(
      n.velocity,
      Math.round(D.velocityAtCurve(points, n.step / (bars * 64))),
    );
  assert.deepEqual(
    D.events(project, "velocity", 15),
    D.events(project, "pattern", 15),
  );
  assert.deepEqual(
    D.midi(project, "velocity", 15),
    D.midi(project, "pattern", 15),
  );
  assert.deepEqual(D.validate(JSON.parse(JSON.stringify(project))), project);
  D.resetVelocity(p, 38);
  assert(p.notes.filter((n) => n.drum === 38).every((n) => n.velocity === 100));
  assert.equal(p.notes.at(-1).velocity, 111);
}
const p = {
  bars: 1,
  notes: [
    { drum: 38, step: 0, velocity: 30 },
    { drum: 38, step: 255, velocity: 12 },
    { drum: 35, step: 255, velocity: 70 },
  ],
};
D.applyVelocityCurve(p, 38, points);
assert.equal(p.notes[1].velocity, 12);
D.resetVelocity(p, 38);
assert.equal(p.notes[1].velocity, 100);
assert.equal(p.notes[2].velocity, 70);
console.log(
  "PASS: three-point interpolation; C1 continuity; bounds/no overshoot; all four lengths/64ths; note timing/count and drum/pattern isolation; reset; persistence; Velocity MIDI equals selected-pattern MIDI.",
);
