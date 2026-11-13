"use strict";
const assert = require("node:assert/strict"),
  D = require("./core.js");
let cases = 0;
for (let key = 0; key < 12; key++)
  for (const mode of ["Major", "Minor"]) {
    const roots = D.chromaticRoots(key, mode);
    assert.equal(roots.length, 12);
    assert.equal(roots.filter((r) => r.degree >= 0).length, 7);
    roots.forEach((r, i) => {
      assert.equal(r.pc, (key + i) % 12);
      assert.equal(r.offset, i);
      if (r.degree >= 0)
        assert.equal(r.name, D.scale(key, mode)[r.degree].name);
    });
    for (let offset = 0; offset < 12; offset++)
      for (const lane of [0, 1])
        for (const q of D.qualities) {
          const p = D.fresh();
          p.key = key;
          p.mode = mode;
          Object.assign(p.builders[lane], {
            rootOffset: offset,
            quality: q.id,
            degree: 0,
          });
          const b = p.builders[lane];
          if (q.steps && roots[offset].degree < 0) {
            assert(!D.qualityAvailable(key, mode, b));
            assert.deepEqual(D.builderChord(p, b).pitches, []);
            assert.throws(() => D.makeEvent(p, lane, 0), /explicit/);
            assert.deepEqual(D.validate(p), p);
            continue;
          }
          for (
            let inversion = 0;
            inversion < D.inversionCount(q.id);
            inversion++
          ) {
            b.inversion = inversion;
            const view = D.builderChord(p, b),
              root = 12 * (b.octave + 1) + key + offset;
            const degree = roots[offset].degree,
              sc = D.scales[mode],
              at = (i) => sc[i % 7] + 12 * Math.floor(i / 7);
            const intervals = q.steps
              ? q.steps.map((i) => at(degree + i) - at(degree))
              : q.intervals;
            const expected = intervals.map((n) => n + root);
            for (let i = 0; i < inversion; i++)
              expected.push(expected.shift() + 12);
            assert.deepEqual(view.pitches, expected);
            assert(view.name.startsWith(roots[offset].name + " "));
            const e = D.makeEvent(p, lane, 0, 3);
            p.events = [e];
            assert.equal(e.builder.rootOffset, offset);
            assert.deepEqual(
              D.builderChord(p, D.restoreBuilder(p, e)).pitches,
              expected,
            );
            const saved = JSON.stringify(p);
            assert.deepEqual(D.validate(JSON.parse(saved)), p);
            for (const direction of ["up", "down", "shortest"]) {
              const dest = (key + 7) % 12,
                delta = D.transposeShift(key, dest, direction),
                next = D.transpose(p, dest, direction);
              assert.equal(JSON.stringify(p), saved);
              assert.deepEqual(
                next.events[0].pitches,
                expected.map((v) => v + delta),
              );
              assert.equal(next.events[0].builder.rootOffset, offset);
              assert.deepEqual(
                D.builderChord(next, D.restoreBuilder(next, next.events[0]))
                  .pitches,
                next.events[0].pitches,
              );
              assert.equal(
                next.events[0].label,
                D.chord(next.events[0].key, mode, next.events[0].builder).label,
              );
            }
            cases++;
          }
        }
    // Missing rootOffset always means a legacy seven-degree selection.
    for (let degree = 0; degree < 7; degree++)
      for (const lane of [0, 1]) {
        const p = D.fresh();
        p.key = key;
        p.mode = mode;
        p.builders[lane].degree = degree;
        const old = D.makeEvent(p, lane, 0),
          oldBytes = D.midi({ ...p, events: [old] });
        const chromatic = {
          ...p.builders[lane],
          rootOffset: D.scales[mode][degree],
        };
        assert.deepEqual(D.chord(key, mode, chromatic).pitches, old.pitches);
        p.events = [old];
        const restored = D.validate(JSON.parse(JSON.stringify(p)));
        assert(!("rootOffset" in restored.events[0].builder));
        assert.deepEqual(D.midi(restored), oldBytes);
        assert.deepEqual(
          D.builderChord(restored, D.restoreBuilder(restored, old)).pitches,
          old.pitches,
        );
      }
  }
// Borrowed iv, bVI and bVII; exact notes, both hands, passing chord tones.
const p = D.fresh();
p.builders[0] = {
  degree: 0,
  rootOffset: 5,
  quality: "minor",
  inversion: 1,
  octave: 4,
};
p.builders[1] = {
  degree: 0,
  rootOffset: 8,
  quality: "major",
  inversion: 0,
  octave: 3,
};
p.passing.source = "chord";
p.passing.index = 1;
p.events = [
  D.makeEvent(p, 0, 0, 3),
  D.makeEvent(p, 1, 1, 4),
  D.makeEvent(p, 2, 2, 1),
];
assert.deepEqual(
  p.events.map((e) => e.pitches),
  [[68, 72, 77], [56, 60, 63], [72]],
);
assert.equal(p.events[0].label, "F Minor");
assert.equal(p.events[1].label, "A♭ Major");
const n = D.transpose(p, 2, "up");
assert.deepEqual(
  n.events.map((e) => e.pitches),
  [[70, 74, 79], [58, 62, 65], [74]],
);
assert.equal(n.events[1].label, "B♭ Major");
// Pending explicit-quality selection survives JSON and does not obstruct transpose.
p.builders[0].rootOffset = 1;
p.builders[0].quality = "diatonic";
p.passing.index = 0;
assert.deepEqual(D.passingOptions(p), []);
assert.deepEqual(D.validate(p), p);
assert.throws(() => D.makeEvent(p, 2, 3), /explicit/);
const pending = D.transpose(p, 2);
assert.deepEqual(
  pending.events.map((e) => e.pitches),
  n.events.map((e) => e.pitches),
);
assert(!D.builderChord(pending, pending.builders[0]).pitches.length);
assert.deepEqual(D.validate(pending), pending);
// Custom imported pitches remain authoritative even with an unavailable template.
p.events[0].pitches = [61, 69, 78];
p.events[0].builder.rootOffset = 1;
p.events[0].builder.quality = "diatonic";
p.builders[0] = D.restoreBuilder(p, p.events[0]);
assert.deepEqual(D.builderChord(p, p.builders[0]).pitches, [61, 69, 78]);
const custom = D.transpose(p, 2);
assert.deepEqual(custom.events[0].pitches, [63, 71, 80]);
assert.match(custom.events[0].label, /Stored/);
for (const value of [-1, 12, 1.5, null, "1"]) {
  const invalid = D.fresh();
  invalid.builders[0].rootOffset = value;
  assert.throws(() => D.validate(invalid));
}
console.log(
  `PASS: ${cases} chromatic chord/inversion/hand cases across all keys/modes; seven scale roots, explicit qualities, unavailable diatonic templates, legacy degree semantics/MIDI bytes, borrowed chords, independent hands, custom voicings, passing tones, JSON and all transpose directions.`,
);
