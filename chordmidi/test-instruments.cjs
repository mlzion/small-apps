"use strict";
const assert = require("node:assert/strict"),
  I = require("./presets.js");
const categories = [
  ["Pianos", 1],
  ["Chromatic Percussion", 9],
  ["Organs", 17],
  ["Guitars", 25],
  ["Strings", 41],
  ["Ensembles", 49],
  ["Brass", 57],
  ["Reeds", 65],
  ["Pipes", 73],
  ["Synth Pads", 89],
  ["Ethnic Instruments", 105],
  ["Percussive Instruments", 113],
];
assert.equal(I.presets.length, 128);
assert.equal(I.categories.length, 12);
for (const [i, [name, start]] of categories.entries()) {
  assert.equal(I.categories[i].name, name);
  assert.deepEqual(
    I.categories[i].programs,
    Array.from({ length: 8 }, (_, j) => start + j - 1),
  );
}
const defaults = [
  [1, "Acoustic Grand Piano"],
  [5, "Electric Piano 1"],
  [7, "Harpsichord"],
  [12, "Vibraphone"],
  [14, "Xylophone"],
  [15, "Tubular Bells"],
  [17, "Drawbar Organ"],
  [20, "Church Organ"],
  [23, "Harmonica"],
  [25, "Acoustic Guitar (Nylon)"],
  [26, "Acoustic Guitar (Steel)"],
  [27, "Electric Guitar (Jazz)"],
  [46, "Pizzicato Strings"],
  [47, "Orchestral Harp"],
  [49, "String Ensemble 1"],
  [51, "Synth Strings 1"],
  [53, "Choir Aahs"],
  [57, "Trumpet"],
  [61, "French Horn"],
  [62, "Brass Section"],
  [66, "Alto Sax"],
  [70, "English Horn"],
  [74, "Flute"],
  [90, "Pad 2 (Warm)"],
  [115, "Steel Drums"],
];
assert.deepEqual(
  I.defaults,
  defaults.map(([gm]) => gm - 1),
);
assert.deepEqual(
  I.defaults.map((p) => I.presets[p].name),
  defaults.map(([, name]) => name),
);
assert.equal(I.eligible.length, 96);
assert.equal(new Set(I.eligible).size, 96);
for (const p of I.defaults) assert(I.eligible.includes(p));
for (const start of [33, 81, 97, 121])
  for (let gm = start; gm < start + 8; gm++)
    assert(!I.eligible.includes(gm - 1));
for (const bad of [
  null,
  [],
  [0, 0],
  [32],
  [80],
  [96],
  [120],
  [128],
  ["0"],
  [0.5],
  {},
])
  assert.throws(() => I.validateEnabled(bad));
assert.deepEqual(I.validateEnabled([114, 0, 4]), [0, 4, 114]);
const choice = [4];
assert.notEqual(I.validateEnabled(choice), choice);
assert.deepEqual(I.validateEnabled(choice), [4]);
console.log(
  "PASS: exact 12 categories/96 eligible programs, excluded ranges, all 25 GM default names/numbers, sorted independent preferences and nonempty validation.",
);
