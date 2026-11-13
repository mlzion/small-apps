"use strict";
const assert = require("node:assert/strict"),
  D = require("./core.js");
let cases = 0;
const clone = (p) => JSON.parse(JSON.stringify(p));
const intervals = (p) => p.map((n) => n - p[0]);
for (let from = 0; from < 12; from++)
  for (let to = 0; to < 12; to++)
    for (const direction of ["shortest", "up", "down"]) {
      const up = (to - from + 12) % 12,
        expected =
          direction === "up"
            ? up
            : direction === "down"
              ? up
                ? up - 12
                : 0
              : up > 6
                ? up - 12
                : up;
      assert.equal(D.transposeShift(from, to, direction), expected);
      for (const mode of ["Major", "Minor"])
        for (const quality of D.qualities)
          for (let degree = 0; degree < 7; degree++) {
            const p = D.fresh();
            p.key = from;
            p.mode = mode;
            p.builders.forEach((b, i) =>
              Object.assign(b, {
                quality: quality.id,
                degree,
                inversion: (degree + i) % D.inversionCount(quality.id),
              }),
            );
            p.passing.source = degree % 2 ? "chord" : "scale";
            p.passing.index = 0;
            p.events = [
              D.makeEvent(p, 0, 0, 3),
              D.makeEvent(p, 1, 1, 5),
              D.makeEvent(p, 2, 2, 2),
            ];
            p.events[0].velocity = 91;
            const before = JSON.stringify(p),
              next = D.transpose(p, to, direction);
            assert.equal(JSON.stringify(p), before);
            assert.equal(next.key, to);
            assert.equal(next.mode, mode);
            next.events.forEach((e, i) => {
              const old = p.events[i];
              assert.deepEqual(
                e.pitches,
                old.pitches.map((n) => n + expected),
              );
              assert.deepEqual(intervals(e.pitches), intervals(old.pitches));
              for (const k of [
                "id",
                "lane",
                "start",
                "duration",
                "velocity",
                "mode",
              ])
                assert.deepEqual(e[k], old[k]);
              assert.equal(e.key, (old.key + expected + 12) % 12);
              if (i < 2) {
                assert.equal(e.builder.quality, quality.id);
                assert.equal(e.builder.inversion, old.builder.inversion);
                const b = D.restoreBuilder(next, e);
                assert.deepEqual(D.builderChord(next, b).pitches, e.pitches);
                assert.equal(e.label, D.chord(e.key, e.mode, e.builder).label);
              } else {
                const restored = clone(next);
                if (e.sourceBuilder)
                  restored.builders[0] = {
                    ...e.sourceBuilder,
                    context: { key: e.key, mode: e.mode },
                  };
                restored.passing = D.restorePassing(restored, e);
                assert.deepEqual(
                  D.makeEvent(restored, 2, 8).pitches,
                  e.pitches,
                );
              }
            });
            next.builders.forEach((b, i) =>
              assert.deepEqual(
                D.builderChord(next, b).pitches,
                D.builderChord(p, p.builders[i]).pitches.map(
                  (n) => n + expected,
                ),
              ),
            );
            assert.deepEqual(D.validate(clone(next)), next);
            if (expected === 0) assert.deepEqual(next, p);
            cases++;
          }
    }
// Foreign original contexts, custom voicings, snapshots and octave crossings.
for (const shift of [-11, -6, -1, 1, 6, 11]) {
  const p = D.fresh();
  p.key = shift < 0 ? 11 : 0;
  const foreign = D.fresh();
  foreign.key = shift < 0 ? 1 : 11;
  foreign.mode = "Minor";
  foreign.builders[0].quality = "octave";
  p.events = [D.makeEvent(foreign, 0, 0, 4), D.makeEvent(foreign, 1, 0, 3)];
  p.events[1].pitches = [31, 50, 78];
  p.events[1].label = "Custom";
  p.builders[0] = D.restoreBuilder(p, p.events[0]);
  p.builders[1] = D.restoreBuilder(p, p.events[1]);
  p.passing.source = "chord";
  p.passing.voicing = { pitches: [80], label: "Custom note" };
  p.passing.octave = 4;
  p.events.push(D.makeEvent(p, 2, 1));
  p.events[2].sourceBuilder.voicing = {
    pitches: [50, 67],
    label: "Old custom source",
  };
  const before = clone(p),
    dest = (p.key + shift + 12) % 12,
    n = D.transpose(p, dest, shift < 0 ? "down" : "up");
  assert.deepEqual(p, before);
  for (let i = 0; i < 3; i++)
    assert.deepEqual(
      n.events[i].pitches,
      p.events[i].pitches.map((v) => v + shift),
    );
  assert.equal(n.events[0].key, (foreign.key + shift + 12) % 12);
  assert.equal(n.events[0].mode, "Minor");
  assert.deepEqual(
    D.builderChord(n, n.builders[1]).pitches,
    [31, 50, 78].map((v) => v + shift),
  );
  assert.match(n.events[1].label, /^Stored /);
  assert(!n.builders[1].voicing.label.includes("Custom"));
  assert.deepEqual(n.passing.voicing.pitches, [80 + shift]);
  assert(!n.passing.voicing.label.includes("Custom"));
  assert.deepEqual(n.events[2].sourceBuilder.voicing.pitches, [
    50 + shift,
    67 + shift,
  ]);
  assert(!n.events[2].sourceBuilder.voicing.label.includes("Old"));
  assert.deepEqual(D.validate(clone(n)), n);
}
// MIDI boundaries are exact; failure never changes any part of the input.
for (const pitch of [0, 127])
  for (const location of [
    "RH",
    "LH",
    "Passing",
    "RH preview",
    "LH preview",
    "Passing preview",
    "source snapshot",
  ]) {
    const p = D.fresh();
    p.events = [
      D.makeEvent(p, 0, 0),
      D.makeEvent(p, 1, 0),
      D.makeEvent(p, 2, 0),
    ];
    if (location === "RH") p.events[0].pitches = [pitch];
    if (location === "LH") p.events[1].pitches = [pitch];
    if (location === "Passing") p.events[2].pitches = [pitch];
    if (location === "RH preview")
      p.builders[0].voicing = { pitches: [pitch], label: "edge" };
    if (location === "LH preview")
      p.builders[1].voicing = { pitches: [pitch], label: "edge" };
    if (location === "Passing preview")
      p.passing.voicing = { pitches: [pitch], label: "edge" };
    if (location === "source snapshot")
      p.events[2].sourceBuilder = {
        ...p.builders[0],
        voicing: { pitches: [pitch], label: "edge" },
      };
    const saved = JSON.stringify(p);
    assert.throws(
      () => D.transpose(p, 1, pitch === 0 ? "down" : "up"),
      /outside 0–127/,
    );
    assert.equal(JSON.stringify(p), saved);
  }
for (const octave of [0, 7]) {
  const p = D.fresh();
  p.builders[0].octave = octave;
  p.events = [D.makeEvent(p, 0, 0)];
  const n = D.transpose(p, 1);
  assert.deepEqual(D.validate(n), n);
  assert.deepEqual(
    D.builderChord(n, n.builders[0]).pitches,
    p.events[0].pitches.map((v) => v + 1),
  );
}
assert.throws(() => D.transpose(D.fresh(), 1), /before transposing/);
assert.throws(() => D.transposeShift(0, 12), /destination/);
assert.throws(() => D.transposeShift(0, 1, "sideways"), /direction/);
// Parse exported SMF independently: exact tracks, metadata, pitches and note lengths.
const p = D.fresh();
p.mode = "Minor";
p.bpm = 137;
p.meter = "6/8";
p.builders[0].quality = "octave";
p.events = [
  D.makeEvent(p, 0, 0, 3),
  D.makeEvent(p, 1, 1, 4),
  D.makeEvent(p, 2, 2, 1),
];
const n = D.transpose(p, 10, "down"),
  bytes = Buffer.from(D.midi(n));
assert.equal(bytes.readUInt16BE(8), 1);
assert.equal(bytes.readUInt16BE(10), 3);
let pos = 14;
const trackNames = [];
for (let lane = 0; lane < 3; lane++) {
  assert.equal(bytes.toString("ascii", pos, pos + 4), "MTrk");
  const end = pos + 8 + bytes.readUInt32BE(pos + 4);
  pos += 8;
  let tick = 0;
  const notes = [];
  let text = "";
  const readVLQ = () => {
    let value = 0,
      b;
    do {
      b = bytes[pos++];
      value = (value << 7) | (b & 127);
    } while (b & 128);
    return value;
  };
  while (pos < end) {
    tick += readVLQ();
    const status = bytes[pos++];
    if (status === 255) {
      const type = bytes[pos++],
        len = readVLQ(),
        data = bytes.subarray(pos, pos + len);
      pos += len;
      if (type === 3) trackNames.push(data.toString());
      if (type === 1) text = data.toString();
      if (type === 81)
        assert.equal(data.readUIntBE(0, 3), Math.round(60000000 / 137));
      if (type === 88) assert.deepEqual([...data], [6, 3, 36, 8]);
    } else {
      assert.notEqual(status & 240, 192);
      const pitch = bytes[pos++],
        velocity = bytes[pos++];
      notes.push({ tick, pitch, on: (status & 240) === 144 && velocity > 0 });
    }
  }
  const e = n.events[lane];
  assert.deepEqual(
    notes
      .filter((x) => x.on)
      .map((x) => x.pitch)
      .sort((a, b) => a - b),
    [...e.pitches].sort((a, b) => a - b),
  );
  assert(notes.filter((x) => x.on).every((x) => x.tick === e.start * 240));
  assert(
    notes
      .filter((x) => !x.on)
      .every((x) => x.tick === (e.start + e.duration) * 240),
  );
  if (lane === 0)
    assert.equal(text, "Preview instrument: Acoustic Grand Piano");
}
assert.deepEqual(trackNames, ["RH Chords", "LH Chords", "Passing Notes"]);
console.log(
  `PASS: ${cases} transpose cases, all keys/degrees/qualities/modes/directions/hands; intervals, inversions, IDs, durations, exact custom voicings, passing notes, foreign contexts, labels, registers, atomic range rejection, JSON and independently parsed three-track MIDI.`,
);
