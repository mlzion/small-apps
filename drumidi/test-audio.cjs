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
audio.stop();
assert.equal(audio.position(), 0);
assert(!audio.running);
assert(sources.every((s) => s.stopTime !== undefined));
audio.start(notes, 1, 300);
assert.equal(sources.at(-3).time, 0.89);
audio.stop();
// Muting ends active and lookahead sources immediately, while the clock keeps running.
audio.context.currentTime = 0;
audio.start(notes, 1, 300);
const live = sources.slice(-3);
audio.setMuted([{ midi: 38, muted: true }]);
assert(live.slice(1).every((s) => s.stopTime !== undefined));
assert(audio.running);
const count = sources.length;
audio.hit({ drum: 38, velocity: 99 }, 0.2);
assert.equal(sources.length, count);
audio.context.currentTime = 0.046;
audio.setMuted([{ midi: 38, muted: false }]);
assert.equal(sources.length, count + 1);
assert.equal(sources.at(-1).time, 0.052500000000000005);
const restored = sources.length;
audio.hit({ drum: 38, velocity: 99 }, 0.21);
assert.equal(sources.length, restored + 1);
audio.stop();
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
  "PASS: simultaneous/64th scheduling; loop seam; velocity gain and tuning; start/stop/reset; live global mutes; hi-hat choke; stalled-clock recovery.",
);
// Start captures a deep event snapshot; editing project velocities must not
// alter gains, queued notes, or later repeats until playback is restarted.
audio.context.currentTime = 0;
const projectNotes = notes.map((n) => ({ ...n }));
audio.start(projectNotes, 1, 300);
const anchor = audio.anchor,
  next = audio.next,
  records = [...audio.sources],
  oldCount = sources.length;
const gainValues = records.map((r) => r.gain.gain.value);
for (const note of projectNotes) if (note.drum === 38) note.velocity = 120;
assert.equal(audio.anchor, anchor);
assert.equal(audio.next, next);
assert(audio.running);
assert.equal(sources.length, oldCount);
assert.deepEqual(
  records.map((r) => r.gain.gain.value),
  gainValues,
);
assert.equal(audio.byStep.get(0).find((n) => n.drum === 38).velocity, 78);
audio.context.currentTime = 0.78;
audio.pump();
assert.equal(
  [...audio.sources].filter((r) => r.drum === 38 && r.step === 0).at(-1)
    .velocity,
  78,
);
audio.stop();
audio.start(projectNotes, 1, 300);
assert.equal(
  [...audio.sources].find((r) => r.drum === 38 && r.step === 0).velocity,
  120,
);
assert(
  Math.abs(
    [...audio.sources].find((r) => r.drum === 38).gain.gain.value -
      (120 / 127) ** 1.35,
  ) < 1e-9,
);
audio.stop();
console.log(
  "PASS: playback velocities/gains are fixed across loop repeats; source project can edit immediately; Stop/Start captures new velocities.",
);
