const assert = require("node:assert/strict"),
  D = require("./core.js");
const p = D.fresh();
p.bpm = 137;
p.patterns[0].bars = 4;
p.patterns[0].notes = [
  { drum: 35, step: 0, velocity: 111 },
  { drum: 38, step: 0, velocity: 92 },
  { drum: 38, step: 1, velocity: 41 },
  { drum: 38, step: 7, velocity: 71 },
  { drum: 50, step: 255, velocity: 126 },
];
p.patterns[1].bars = 2;
p.patterns[1].notes = [
  { drum: 42, step: 0, velocity: 66 },
  { drum: 42, step: 127, velocity: 79 },
];
p.patterns[2].notes = [{ drum: 49, step: 63, velocity: 90 }];
p.arrangement.lanes = [
  [
    { id: "a1", pattern: "P1", start: 0 },
    { id: "a2", pattern: "P2", start: 5 },
  ],
  [
    { id: "b1", pattern: "P3", start: 1 },
    { id: "b2", pattern: "P2", start: 3 },
    { id: "b3", pattern: "P3", start: 7 },
  ],
];
assert.deepEqual(D.validate(JSON.parse(JSON.stringify(p))), p);
assert(!D.canPlace(p, 0, "P2", 3));
assert(!D.canPlace(p, 0, "P1", 7));
assert(D.canPlace(p, 1, "P1", 0, "b2") === false);
assert(D.canPlace(p, 0, "P1", 0, "a1"));
assert(D.canPlace(p, 0, "P3", 4));
const invalid = (edit) => {
  const copy = structuredClone(p);
  edit(copy);
  assert.throws(() => D.validate(copy));
};
invalid((p) => (p.version = 2));
invalid((p) => (p.bpm = 0));
invalid((p) => p.drums.push(p.drums[0]));
invalid((p) => (p.patterns[0].notes[0].velocity = 128));
invalid((p) => (p.patterns[0].notes[0].step = 0.5));
invalid((p) => (p.patterns[0].notes[0].drum = 1));
invalid((p) => (p.arrangement.lanes[0][1].start = 3));
invalid((p) => (p.arrangement.bars = 6));
invalid((p) => p.patterns[0].notes.push(p.patterns[0].notes[0]));
// Independent SMF decoder: absolute ticks, event channels, metadata, EOT boundaries.
function parse(bytes) {
  const b = Buffer.from(bytes);
  assert.equal(b.toString("ascii", 0, 4), "MThd");
  assert.equal(b.readUInt32BE(4), 6);
  assert.equal(b.readUInt16BE(8), 1);
  assert.equal(b.readUInt16BE(12), 960);
  const count = b.readUInt16BE(10),
    tracks = [];
  let i = 14;
  const variable = () => {
    let n = 0,
      v;
    do {
      v = b[i++];
      n = n * 128 + (v & 127);
    } while (v & 128);
    return n;
  };
  for (let t = 0; t < count; t++) {
    assert.equal(b.toString("ascii", i, i + 4), "MTrk");
    const end = i + 8 + b.readUInt32BE(i + 4);
    i += 8;
    let tick = 0;
    const ev = [];
    while (i < end) {
      tick += variable();
      const status = b[i++];
      if (status === 255) {
        const type = b[i++],
          length = variable(),
          data = [...b.subarray(i, i + length)];
        i += length;
        ev.push({ tick, type, data });
      } else {
        assert([153, 137].includes(status));
        ev.push({ tick, status, note: b[i++], velocity: b[i++] });
      }
    }
    assert.equal(i, end);
    tracks.push(ev);
  }
  assert.equal(i, b.length);
  return tracks;
}
let tracks = parse(D.midi(p, "pattern"));
assert.equal(tracks.length, 2);
assert.deepEqual(
  tracks[1]
    .filter((e) => e.status === 153)
    .map((e) => [e.tick, e.note, e.velocity]),
  [
    [0, 35, 111],
    [0, 38, 92],
    [60, 38, 41],
    [420, 38, 71],
    [15300, 50, 126],
  ],
);
assert.equal(tracks[1].at(-1).tick, 15360);
assert.deepEqual(tracks[0].find((e) => e.type === 81).data, [
  (Math.round(60000000 / 137) >> 16) & 255,
  (Math.round(60000000 / 137) >> 8) & 255,
  Math.round(60000000 / 137) & 255,
]);
tracks = parse(D.midi(p, "arrangement"));
assert.equal(tracks.length, 3);
for (const t of tracks) assert.equal(t.at(-1).tick, 8 * 3840);
assert.deepEqual(
  tracks[1].filter((e) => e.status === 153).map((e) => e.tick),
  [0, 0, 60, 420, 15300, 19200, 26820],
);
assert.deepEqual(
  tracks[2].filter((e) => e.status === 153).map((e) => e.tick),
  [7620, 11520, 19140, 30660],
);
assert(
  !D.events(p, "arrangement").some(
    (e) => e.lane === 0 && e.step >= 256 && e.step < 320,
  ),
);
p.patterns[2].notes[0].velocity = 100;
assert(
  D.events(p, "arrangement")
    .filter((e) => e.drum === 49)
    .every((e) => e.velocity === 100),
);
p.patterns[0].bars = 1;
assert.equal(D.events(p, "pattern").length, 4);
p.patterns[0].bars = 4;
assert.equal(D.events(p, "pattern").length, 5);
const fs = require("node:fs"),
  crypto = require("node:crypto"),
  manifest = require("./samples/manifest.json");
for (let n = 35; n <= 81; n++) {
  const data = fs.readFileSync(`${__dirname}/samples/${n}.mp3`);
  assert.equal(
    crypto.createHash("sha256").update(data).digest("hex"),
    manifest[n].sha256,
  );
}
console.log(
  "PASS: project validation/roundtrip; 64th timing; notes/velocities/channel 10; tempo; simultaneous hits; lane tracks/gaps/EOT; shared references; bounds/overlaps; hidden-note retention; 47 asset hashes.",
);
