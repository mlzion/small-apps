"use strict";
const assert = require("node:assert/strict"),
  D = require("./core.js"),
  I = require("./presets.js");
let cases = 0;
function eq(a, b) {
  assert.deepEqual(a, b);
  cases++;
}
const p = D.fresh(),
  b = p.builders[0];
eq(D.chord(0, "Major", b).pitches, [60, 64, 67]);
eq(D.chord(9, "Minor", b).pitches, [69, 72, 76]);
eq(D.chord(0, "Major", { ...b, degree: 6 }).pitches, [71, 74, 77]);
eq(D.chord(9, "Minor", { ...b, degree: 1 }).pitches, [71, 74, 77]);
eq(
  D.scale(1, "Major").map((n) => n.name),
  ["C♯", "D♯", "E♯", "F♯", "G♯", "A♯", "B♯"],
);
eq(
  D.scale(3, "Minor").map((n) => n.name),
  ["E♭", "F", "G♭", "A♭", "B♭", "C♭", "D♭"],
);
eq(D.chord(0, "Major", { ...b, inversion: 1 }).pitches, [64, 67, 72]);
eq(
  D.chord(0, "Major", { ...b, inversion: 2, octave: 3 }).pitches,
  [55, 60, 64],
);
eq(D.chord(0, "Major", { ...b, quality: "third" }).pitches, [60, 64]);
eq(D.chord(0, "Minor", { ...b, quality: "third" }).pitches, [60, 63]);
eq(D.chord(0, "Minor", { ...b, quality: "fifth" }).pitches, [60, 67]);
eq(
  D.chord(0, "Major", { ...b, quality: "maj7", inversion: 3 }).pitches,
  [71, 72, 76, 79],
);
eq(D.chord(0, "Major", { ...b, quality: "dim7" }).names, [
  "C",
  "E♭",
  "G♭",
  "B♭♭",
]);
const passingProject = D.fresh();
passingProject.key = 1;
eq(D.passingOptions(passingProject)[6], { pitch: 72, label: "B♯4" });
passingProject.key = 3;
passingProject.mode = "Minor";
eq(D.passingOptions(passingProject)[5], { pitch: 71, label: "C♭5" });
passingProject.passing.source = "chord";
passingProject.key = 1;
passingProject.mode = "Major";
passingProject.builders[0].degree = 6;
eq(D.passingOptions(passingProject)[0], { pitch: 72, label: "B♯4" });
const passingEvent = D.makeEvent(passingProject, 2, 0);
passingProject.builders[0].degree = 0;
eq(passingEvent.sourceBuilder.degree, 6);
for (let key = 0; key < 12; key++)
  for (const mode of ["Major", "Minor"])
    for (let degree = 0; degree < 7; degree++)
      for (const q of D.qualities)
        for (let inv = 0; inv < D.inversionCount(q.id); inv++)
          for (const octave of [1, 4, 6]) {
            const c = D.chord(key, mode, {
              degree,
              quality: q.id,
              inversion: inv,
              octave,
            });
            assert(
              c.pitches.every(
                (n, i) =>
                  Number.isInteger(n) &&
                  n >= 0 &&
                  n <= 127 &&
                  (!i || n > c.pitches[i - 1]),
              ),
            );
            assert.equal(c.pitches.length, c.names.length);
            cases++;
          }
// Octave dyads: every key/mode/degree/register for each independent hand.
for (let key = 0; key < 12; key++)
  for (const mode of ["Major", "Minor"])
    for (let degree = 0; degree < 7; degree++)
      for (let octave = 1; octave <= 6; octave++)
        for (const lane of [0, 1]) {
          const project = D.fresh();
          project.key = key;
          project.mode = mode;
          project.builders[lane] = {
            degree,
            quality: "octave",
            inversion: 0,
            octave,
          };
          const builder = project.builders[lane],
            c = D.chord(key, mode, builder);
          const root =
            12 * (octave + 1) +
            key +
            (mode === "Major"
              ? [0, 2, 4, 5, 7, 9, 11]
              : [0, 2, 3, 5, 7, 8, 10])[degree];
          eq(c.pitches, [root, root + 12]);
          eq(c.names, [
            D.scale(key, mode)[degree].name,
            D.scale(key, mode)[degree].name,
          ]);
          assert(c.pitches.every((pitch) => pitch >= 0 && pitch <= 127));
          const labels = c.noteLabels.map((label) =>
            label.match(/^([A-G])([♯♭]*)(-?\d+)$/),
          );
          labels.forEach((match, i) => {
            assert(match);
            const alteration = Array.from(match[2]).reduce(
              (sum, a) => sum + (a === "♯" ? 1 : -1),
              0,
            );
            eq(
              { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]] +
                alteration +
                12 * (+match[3] + 1),
              c.pitches[i],
            );
          });
          eq(+labels[1][3], +labels[0][3] + 1);
          eq(D.inversionCount("octave"), 1);
          const event = D.makeEvent(project, lane, degree, 2);
          project.events.push(event);
          eq(event.pitches, c.pitches);
          eq(D.validate(JSON.parse(JSON.stringify(project))), project);
          assert.throws(() => D.chord(key, mode, { ...builder, inversion: 1 }));
          builder.inversion = 1;
          assert.throws(() => D.validate(project));
          builder.inversion = 0;
          event.builder.inversion = 1;
          assert.throws(() => D.validate(project));
          cases += 4;
        }
eq(D.chord(1, "Major", { ...b, quality: "octave", degree: 6 }).noteLabels, [
  "B♯4",
  "B♯5",
]);
eq(D.chord(3, "Minor", { ...b, quality: "octave", degree: 5 }).noteLabels, [
  "C♭5",
  "C♭6",
]);
for (const [meter, length] of [
  ["2/4", 4],
  ["3/4", 6],
  ["4/4", 8],
  ["6/8", 6],
])
  eq(D.totalSteps({ ...p, bars: 8, meter }), length * 8);
p.events = [
  D.makeEvent(p, 0, 0, 4),
  D.makeEvent(p, 1, 0, 8),
  D.makeEvent(p, 2, 7, 1),
];
const original = p.events.map((e) => e.pitches.slice());
p.key = 7;
p.mode = "Minor";
eq(
  p.events.map((e) => e.pitches),
  original,
);
eq(D.validate(JSON.parse(JSON.stringify(p))), p);
for (const mutate of [
  (p) => (p.version = 2),
  (p) => (p.events[0].pitches = [128]),
  (p) => (p.events[0].duration = 100),
  (p) => (p.events[0].builder.inversion = 9),
  (p) => (p.events[0].label = "<x>".repeat(100)),
  (p) => (p.bpm = NaN),
  (p) => (p.instrumentName = "Wrong GM name"),
  (p) => delete p.instrumentName,
  (p) => (p.program = 128),
  (p) => p.events.push(p.events[0]),
]) {
  const bad = structuredClone(p);
  mutate(bad);
  assert.throws(() => D.validate(bad));
  cases++;
}
// Independent SMF reader: verify metadata, channels, absence of programs, exact note lengths and overlap union.
p.bpm = 137;
p.meter = "6/8";
p.bars = 2;
p.program = 48;
p.instrumentName = "String Ensemble 1";
p.events = [
  { ...D.makeEvent(p, 0, 0, 4), pitches: [60, 64, 67] },
  { ...D.makeEvent(p, 0, 2, 4), pitches: [60, 65, 69] },
  D.makeEvent(p, 1, 0, 6),
  { ...D.makeEvent(p, 2, 11, 1), pitches: [72] },
];
const octaveMidiProject = structuredClone(p);
octaveMidiProject.builders[0].quality = "octave";
octaveMidiProject.builders[0].inversion = 0;
p.events.push(D.makeEvent(octaveMidiProject, 0, 8, 4));
const bytes = Buffer.from(D.midi(p));
eq(bytes.subarray(0, 4).toString(), "MThd");
eq(bytes.readUInt16BE(8), 1);
eq(bytes.readUInt16BE(10), 3);
eq(bytes.readUInt16BE(12), 480);
let offset = 14;
const parsed = [];
for (let lane = 0; lane < 3; lane++) {
  eq(bytes.subarray(offset, offset + 4).toString(), "MTrk");
  const len = bytes.readUInt32BE(offset + 4),
    end = offset + 8 + len;
  offset += 8;
  let tick = 0;
  const ev = [];
  const vlq = () => {
    let n = 0,
      v;
    do {
      v = bytes[offset++];
      n = n * 128 + (v & 127);
    } while (v & 128);
    return n;
  };
  while (offset < end) {
    tick += vlq();
    const status = bytes[offset++];
    if (status === 255) {
      const type = bytes[offset++],
        size = vlq(),
        data = [...bytes.subarray(offset, offset + size)];
      offset += size;
      ev.push({ tick, type, data });
    } else {
      const data = [bytes[offset++]];
      if ((status & 240) !== 192) data.push(bytes[offset++]);
      ev.push({ tick, status, data });
    }
  }
  eq(tick, 2880);
  eq(
    ev.filter((e) => (e.status & 240) === 192),
    [],
  );
  eq(Buffer.from(ev.find((e) => e.type === 3).data).toString(), D.lanes[lane]);
  parsed.push(ev);
}
eq(parsed[0].find((e) => e.type === 1).tick, 0);
eq(
  Buffer.from(parsed[0].find((e) => e.type === 1).data).toString(),
  "Preview instrument: String Ensemble 1",
);
eq(
  parsed.slice(1).flatMap((track) => track.filter((e) => e.type === 1)),
  [],
);
eq(parsed[0].find((e) => e.type === 88).data, [6, 3, 36, 8]);
eq(parsed[0].find((e) => e.type === 81).data, [
  (Math.round(60000000 / 137) >> 16) & 255,
  (Math.round(60000000 / 137) >> 8) & 255,
  Math.round(60000000 / 137) & 255,
]);
eq(
  parsed[0]
    .filter((e) => [144, 128].includes(e.status) && e.data[0] === 60)
    .map((e) => [e.tick, e.status]),
  [
    [0, 144],
    [1440, 128],
  ],
);
eq(
  parsed[2]
    .filter((e) => e.status === 146 || e.status === 130)
    .map((e) => [e.tick, e.status, e.data[0]]),
  [
    [2640, 146, 72],
    [2880, 130, 72],
  ],
);
eq(
  parsed[0]
    .filter((e) => e.status === 144 && e.tick === 1920)
    .map((e) => e.data[0])
    .sort((a, b) => a - b),
  [67, 79],
);
eq(
  parsed[0]
    .filter((e) => e.status === 128 && e.tick === 2880)
    .map((e) => e.data[0])
    .sort((a, b) => a - b),
  [67, 79],
);
// Instrument names and zero-based programs round trip without app-wide preferences.
for (const preset of I.presets) {
  const project = {
    ...D.fresh(),
    program: preset.program,
    instrumentName: preset.name,
  };
  eq(D.validate(JSON.parse(JSON.stringify(project))), project);
}
console.log(
  `PASS ${cases} model assertions: all keys, natural minor, qualities/inversions/registers, spelling, meter, frozen pitches, validation, JSON and parsed three-track MIDI.`,
);
