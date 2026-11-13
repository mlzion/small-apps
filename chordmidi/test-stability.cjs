"use strict";
const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  D = require("./core.js");
let wall = 100000,
  checks = 0,
  rawBacks = 0;
const sandbox = {
  window: {},
  ChordMidi: D,
  structuredClone,
  performance: { now: () => wall },
  setInterval: () => 1,
  clearInterval() {},
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + "/audio.js", "utf8"), sandbox);
function setup(fallback = false) {
  const a = new sandbox.window.ChordAudio(),
    state = { io: 0.08, noise: 0, invalid: false };
  const c = {
    currentTime: 0,
    sampleRate: 48000,
    baseLatency: 0.01,
    get outputLatency() {
      return state.io - 0.01 - state.noise;
    },
    getOutputTimestamp() {
      if (state.invalid) throw Error("no timestamp");
      return {
        contextTime: c.currentTime - state.io + state.noise,
        performanceTime: wall,
      };
    },
  };
  if (fallback) delete c.getOutputTimestamp;
  a.context = c;
  a.graphLatency = 0.006;
  a.prepare = () => {};
  a.note = () => {};
  a.click = () => {};
  const advance = (t) => {
    c.currentTime = t;
    wall = 100000 + t * 1000;
  };
  return { a, c, state, advance };
}
for (const fallback of [false, true])
  for (const bpm of [30, 60, 120, 137, 300])
    for (const meter of D.meters) {
      const { a, c, state, advance } = setup(fallback),
        p = D.fresh();
      p.bpm = bpm;
      p.meter = meter;
      p.bars = 8;
      p.metronome = true;
      const per = D.stepsPerBar(meter),
        total = D.totalSteps(p),
        step = 30 / bpm;
      p.events = [D.makeEvent(p, 0, 0, per)];
      const scheduled = [];
      a.note = (pitch, time, duration) =>
        scheduled.push({ pitch, time, duration });
      a.start(p);
      const anchor = a.anchor;
      let prev = 0,
        prevRaw = 0,
        prevPosition = 0,
        prevRender = 0;
      const jitter = [0, 0.03, -0.03, 0.015, -0.015];
      for (let i = 0; i < (anchor + total * step * 3 + 0.2) * 60; i++) {
        const t = i / 60;
        advance(t);
        state.noise = jitter[i % jitter.length];
        a.pump();
        const raw = Math.max(0, a.rawOutputTime());
        if (raw < prevRaw) rawBacks++;
        const time = a.outputTime(),
          position = a.position(),
          dt = t - prevRender;
        assert(time >= prev - 1e-10, "Audible clock went backward");
        if (prev > 0 && dt > 0) {
          assert(time - prev >= dt * 0.875 - 1e-9);
          assert(time - prev <= dt * 1.125 + 1e-9);
          checks += 2;
        }
        assert(
          Math.abs(time - Math.max(0, t - 0.086)) < 0.008,
          "Unbounded synchronization error",
        );
        if (position < prevPosition - 1e-8) {
          assert(
            prevPosition > total - 0.5 && position < 0.5,
            "Small cursor reversal away from loop boundary",
          );
          checks++;
        }
        prev = time;
        prevRaw = raw;
        prevPosition = position;
        prevRender = t;
        checks += 2;
      }
      for (const n of scheduled) {
        const cycle = Math.round((n.time - anchor) / (total * step));
        assert(Math.abs(n.time - (anchor + cycle * total * step)) < 1e-7);
        assert.equal(n.duration, per * step);
        checks += 2;
      }
      // The estimator is device-clock state, not a cursor high-water mark. New
      // anchors naturally allow backward seek/rewind, pause/resume and tempo edits.
      a.start(p, 2.5);
      assert.equal(a.position(), 2.5);
      a.pause();
      const frozen = a.position();
      advance(c.currentTime + 2);
      assert.equal(a.position(), frozen);
      state.noise = 0;
      a.start(p, a.offset);
      assert.equal(a.position(), frozen);
      a.stop();
      assert.equal(a.position(), 0);
      p.bpm = 121;
      a.start(p);
      assert.equal(a.stepSeconds, 30 / 121);
      assert.equal(a.position(), 0);
      a.stop();
      checks += 6;
    }
assert(rawBacks > 100, "The simulated timestamps must reproduce v0.2 bouncing");
// A real sustained output-latency change is followed, not permanently hidden by
// max(previous position). Isolated spikes do not advance the display clock.
for (const fallback of [false, true]) {
  const { a, c, state, advance } = setup(fallback);
  let prev = 0;
  for (let i = 0; i < 240; i++) {
    advance(1 + i / 60);
    const time = a.outputTime();
    assert(time >= prev);
    prev = time;
  }
  state.io = 0.18;
  for (let i = 0; i < 120; i++) {
    advance(c.currentTime + 1 / 60);
    const time = a.outputTime();
    assert(time >= prev);
    assert(time - prev >= (1 / 60) * 0.875 - 1e-9);
    prev = time;
    checks += 2;
  }
  assert(Math.abs(a.outputTime() - (c.currentTime - 0.186)) < 0.0001);
  const before = a.outputTime();
  state.noise = -0.2;
  advance(c.currentTime + 1 / 60);
  const spike = a.outputTime();
  assert(Math.abs(spike - before - 1 / 60) < 0.0001);
  state.noise = 0;
  // Same render quantum and changing estimates cannot move the clock backward.
  const held = a.outputTime();
  state.noise = -0.1;
  assert.equal(a.outputTime(), held);
  state.noise = 0;
  if (!fallback) {
    state.invalid = true;
    advance(c.currentTime + 1 / 60);
    assert(a.outputTime() >= held);
    state.invalid = false;
  }
}
console.log(
  `PASS: ${checks} stability assertions; ${rawBacks} raw timestamp reversals reproduced without any stabilized reversal; five tempos/all meters/8 bars/three loops; source onsets/durations unchanged, bounded beat error, timestamp/fallback jitter, outliers, latency reacquisition, same-quantum holds, pause/resume, rewind, Stop and tempo restart.`,
);
