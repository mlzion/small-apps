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
// Live velocity edits preserve scheduler position and source identity, including
// already scheduled hits. Non-selected drums keep their gain and note velocity.
audio.context.currentTime = 0;
audio.start(notes, 1, 300);
const anchor = audio.anchor,
  next = audio.next,
  records = [...audio.sources],
  oldCount = sources.length;
const kick = records.find((r) => r.drum === 35),
  originalKickGain = kick.gain.gain.value;
const edited = notes.map((n) => ({
  ...n,
  velocity: n.drum === 38 ? 20 : n.velocity,
}));
audio.updateVelocities(edited, 38);
assert.equal(audio.anchor, anchor);
assert.equal(audio.next, next);
assert(audio.running);
assert.equal(sources.length, oldCount);
assert.equal(kick.gain.gain.value, originalKickGain);
assert(
  audio.byStep
    .get(0)
    .filter((n) => n.drum === 38)
    .every((n) => n.velocity === 20),
);
assert(
  [...audio.sources]
    .filter((r) => r.drum === 38)
    .every((r) => Math.abs(r.gain.gain.value - (20 / 127) ** 1.35) < 1e-9),
);
// Exercise the real AudioParam path for active tails and future queued samples.
for (const record of audio.sources) {
  record.gain.gain.calls = [];
  for (const method of [
    "cancelScheduledValues",
    "setValueAtTime",
    "linearRampToValueAtTime",
  ])
    record.gain.gain[method] = (...args) =>
      record.gain.gain.calls.push([method, ...args]);
}
audio.context.currentTime = 0.045;
audio.updateVelocities(notes, 38);
const snare = [...audio.sources].filter((r) => r.drum === 38);
assert(
  snare
    .find((r) => r.time < 0.045)
    .gain.gain.calls.some((c) => c[0] === "linearRampToValueAtTime"),
);
assert(
  snare
    .find((r) => r.time > 0.045)
    .gain.gain.calls.some(
      (c) =>
        c[0] === "setValueAtTime" && Math.abs(c[1] - (41 / 127) ** 1.35) < 1e-9,
    ),
);
audio.stop();
console.log(
  "PASS: live velocity edits update future events, queued hits and active tails without resetting loop or changing other instruments.",
);
