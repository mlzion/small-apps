/* Deterministic AudioContext-clock checks complement real browser sample tests. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const sandbox = { window: {}, setInterval: () => 1, clearInterval: () => {} };
vm.runInNewContext(fs.readFileSync(`${__dirname}/audio.js`, "utf8"), sandbox);
const audio = new sandbox.window.DrumAudio(),
  sources = [],
  gains = [];
audio.context = {
  currentTime: 0,
  createBufferSource() {
    const s = {
      playbackRate: { value: 1 },
      connect() {},
      disconnect() {},
      start(t) {
        s.time = t;
      },
      stop(t) {
        s.stopTime = t ?? audio.context.currentTime;
      },
    };
    sources.push(s);
    return s;
  },
  createGain() {
    const g = { gain: { value: 1 }, connect() {}, disconnect() {} };
    gains.push(g);
    return g;
  },
};
audio.master = {};
audio.manifest = {
  35: { rate: 1 },
  38: { rate: 1.01 },
  42: { rate: 1 },
  46: { rate: 1 },
};
for (const n of [35, 38, 42, 46]) audio.buffers.set(n, {});
const notes = [
  { step: 0, drum: 35, velocity: 106 },
  { step: 0, drum: 38, velocity: 78 },
  { step: 1, drum: 38, velocity: 41 },
  { step: 63, drum: 35, velocity: 120 },
];
audio.start(notes, 1, 300);
assert.equal(sources.length, 3);
assert.equal(sources[0].time, 0.04);
assert.equal(sources[1].time, 0.04);
assert(Math.abs(sources[2].time - 0.0525) < 1e-9);
assert(Math.abs(gains[0].gain.value - (106 / 127) ** 1.35) < 1e-9);
assert(gains[1].gain.value > gains[2].gain.value);
assert.equal(sources[1].playbackRate.value, 1.01);
audio.context.currentTime = 0.78;
audio.pump();
assert(sources.some((s) => Math.abs(s.time - 0.8275) < 1e-9));
assert(sources.some((s) => Math.abs(s.time - 0.84) < 1e-9));
audio.context.currentTime = 0.85;
const position = audio.position();
audio.pause();
assert.equal(audio.offset, position);
assert(!audio.running);
assert(sources.every((s) => s.stopTime !== undefined));
audio.start(notes, 1, 300);
assert(audio.running);
audio.stop();
assert.equal(audio.position(), 0);
assert(!audio.running);
// Open hats are choked by a later scheduled closed hat, with actual event times.
audio.hit({ drum: 46, velocity: 90 }, 1);
const open = sources.at(-1);
audio.hit({ drum: 42, velocity: 80 }, 1.05);
assert.equal(open.stopTime, 1.05);
// Long stalls skip stale events while retaining a bounded, future schedule.
audio.context.currentTime = 0;
audio.start(notes, 1, 120);
audio.context.currentTime = 5;
const before = sources.length;
audio.pump();
assert(sources.slice(before).every((s) => s.time >= 5 && s.time < 5.12));
audio.stop();
console.log(
  "PASS: simultaneous/64th scheduling; loop seam; velocity gain and tuning; pause/resume/reset; hi-hat choke; stalled-clock recovery.",
);
