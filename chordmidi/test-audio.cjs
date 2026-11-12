"use strict";
const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  D = require("./core.js");
const param = () => ({
  value: 0,
  setValueAtTime() {},
  linearRampToValueAtTime() {},
  exponentialRampToValueAtTime() {},
});
const base = () => ({ connect() {}, disconnect() {} });
const context = {
  currentTime: 0,
  createBuffer(channels, length, sampleRate) {
    const data = new Float32Array(length);
    return {
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => data,
    };
  },
  createGain() {
    return { ...base(), gain: param() };
  },
  createStereoPanner() {
    return { ...base(), pan: param() };
  },
  createBufferSource() {
    return {
      ...base(),
      playbackRate: param(),
      start(time) {
        this.time = time;
      },
      stop(time) {
        this.stopped = time ?? context.currentTime;
      },
    };
  },
  createOscillator() {
    return {
      ...base(),
      frequency: param(),
      start(time) {
        clicks.push({ time, frequency: this.frequency.value });
      },
      stop() {},
    };
  },
};
const clicks = [],
  sandbox = {
    window: {},
    ChordMidi: D,
    structuredClone,
    setInterval,
    clearInterval,
  };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + "/audio.js", "utf8"), sandbox);
const bytes = fs.readFileSync(__dirname + "/soundfont/TimGM6mb.sf2"),
  font = new sandbox.window.SoundFont(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    context,
  );
let count = 0;
for (let program = 0; program < 128; program++)
  for (const pitch of [24, 36, 60, 84, 108, 119]) {
    const voices = font.voices(program, pitch);
    assert(voices.length, `Silent preset ${program}, pitch ${pitch}`);
    for (const zone of voices) {
      const s = font.sample(zone);
      assert(s.buffer.length > 0 && s.s.rate > 0);
      assert(s.buffer.getChannelData(0).some((n) => Math.abs(n) > 0));
      count++;
    }
  }
const a = new sandbox.window.ChordAudio();
a.context = context;
a.master = base();
a.font = font;
const p = D.fresh();
p.bars = 1;
p.bpm = 120;
p.metronome = true;
p.events = [
  D.makeEvent(p, 0, 0, 4),
  D.makeEvent(p, 1, 0, 8),
  D.makeEvent(p, 2, 2, 1),
];
a.start(p);
assert.deepEqual(
  [
    ...new Set(
      [...a.sources].map((r) => r.pitch).filter((n) => n !== undefined),
    ),
  ].sort((a, b) => a - b),
  [48, 52, 55, 60, 64, 67],
);
assert(
  [...a.sources]
    .filter((r) => r.pitch !== undefined)
    .every((r) => r.time === 0.04),
);
assert(clicks.some((c) => c.time === 0.04 && c.frequency === 1400));
context.currentTime = 0.45;
a.pump();
assert(
  [...a.sources].some((r) => r.pitch === 60 && Math.abs(r.time - 0.54) < 1e-8),
);
context.currentTime = 0.7;
const held = [...a.sources].filter((r) => r.pitch !== undefined);
a.pause();
assert(!a.running);
assert(held.every((r) => r.source.stopped === 0.7));
assert(Math.abs(a.offset - 2.64) < 1e-8);
a.start(p, a.offset);
assert(
  [...a.sources].some((r) => r.pitch === 48 && Math.abs(r.time - 0.74) < 1e-8),
);
context.currentTime = 2.05;
a.pump();
assert([...a.sources].some((r) => r.pitch === 48 && r.time > 2));
a.stop();
assert.equal(a.sources.size, 0);
assert.equal(a.offset, 0);
// Foreground recovery skips missed notes instead of bursting the entire gap.
context.currentTime = 0;
a.start(p);
context.currentTime = 15;
a.pump();
assert(
  [...a.sources]
    .filter((r) => r.pitch !== undefined)
    .every((r) => r.time < 0.1 || r.time >= 15),
);
a.stop();
p.loop = false;
context.currentTime = 0;
a.start(p);
context.currentTime = 3;
a.pump();
assert(!a.running && a.sources.size === 0);
// Shared pitches merge only within each lane, with accurate release boundaries.
p.events = [
  { ...D.makeEvent(p, 0, 0, 4), pitches: [60] },
  { ...D.makeEvent(p, 0, 2, 4), pitches: [60] },
  { ...D.makeEvent(p, 1, 0, 2), pitches: [60] },
];
context.currentTime = 0;
a.start(p);
assert.deepEqual(
  [...a.sources]
    .filter((r) => r.pitch === 60)
    .map((r) => r.off)
    .sort(),
  [0.54, 1.54],
);
a.stop();
console.log(
  `PASS: ${count} real SF2 sample zones across all 128 GM programs and six registers; polyphony/common onsets, sustained note-offs, passing notes, metronome, pause/resume, looping, stop, stalled-clock recovery and overlap isolation.`,
);
