"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  D = require("./core.js");
let wall = 100000,
  checks = 0;
const timers = new Set();
const sandbox = {
  window: {},
  ChordMidi: D,
  structuredClone,
  performance: { now: () => wall },
  setInterval: (fn) => (timers.add(fn), fn),
  clearInterval: (fn) => timers.delete(fn),
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + "/audio.js", "utf8"), sandbox);
const Audio = sandbox.window.ChordAudio;
const close = (a, b, epsilon = 1e-8) => {
  assert(Math.abs(a - b) < epsilon, `${a} != ${b}`);
  checks++;
};
const node = () => ({ connect() {}, disconnect() {} });
const param = () => ({
  value: 0.5,
  held: [],
  ramp: [],
  setValueAtTime() {},
  linearRampToValueAtTime(v, t) {
    this.ramp.push([v, t]);
  },
  cancelAndHoldAtTime(t) {
    this.held.push(t);
  },
});
function context() {
  const c = {
    currentTime: 0,
    sampleRate: 48000,
    baseLatency: 0.012,
    outputLatency: 0.061,
    state: "running",
    resume: async () => {},
    createGain: () => ({ ...node(), gain: param() }),
    createStereoPanner: () => ({ ...node(), pan: { value: 0 } }),
    createBufferSource: () => ({
      ...node(),
      playbackRate: { value: 1 },
      stopCalls: [],
      start(t) {
        this.started = t;
      },
      stop(t) {
        this.stopCalls.push(t ?? c.currentTime);
      },
    }),
  };
  return c;
}
function engine() {
  const a = new Audio();
  a.context = context();
  a.master = node();
  a.font = {
    voices: () => [{}],
    sample: () => ({
      buffer: { duration: 1 },
      start: 0,
      s: { root: 60, correction: 0, rate: 48000 },
    }),
  };
  return a;
}
// Timestamp mapping and graph delay are distinct; latency estimates must not be
// subtracted a second time when a valid output timestamp is present.
const mapping = engine();
mapping.context.currentTime = 10;
mapping.graphLatency = 0.006;
mapping.context.getOutputTimestamp = () => ({
  contextTime: 9.8,
  performanceTime: wall - 50,
});
close(Math.max(0, mapping.rawOutputTime()), 9.844);
mapping.context.getOutputTimestamp = () => ({
  contextTime: 0,
  performanceTime: 0,
});
close(Math.max(0, mapping.rawOutputTime()), 9.921);
mapping.context.getOutputTimestamp = () => {
  throw Error("unsupported");
};
close(Math.max(0, mapping.rawOutputTime()), 9.921);
delete mapping.context.getOutputTimestamp;
mapping.context.baseLatency = NaN;
mapping.context.outputLatency = -1;
close(Math.max(0, mapping.rawOutputTime()), 9.994);
mapping.context.getOutputTimestamp = () => ({
  contextTime: 100,
  performanceTime: wall,
});
close(Math.max(0, mapping.rawOutputTime()), 9.994);
mapping.context.currentTime = 0.001;
delete mapping.context.getOutputTimestamp;
close(Math.max(0, mapping.rawOutputTime()), 0);
// All beat/bar edges, note onsets/durations, and three loop seams at five tempos
// and all meters, with output timestamps updating less often than animation.
for (const bpm of [30, 60, 120, 137, 300])
  for (const meter of D.meters) {
    const a = engine(),
      c = a.context,
      p = D.fresh();
    p.bars = 8;
    p.bpm = bpm;
    p.meter = meter;
    p.metronome = true;
    const per = D.stepsPerBar(meter),
      total = D.totalSteps(p),
      beat = meter === "6/8" ? 3 : 2,
      stepSeconds = 30 / bpm;
    p.events = [
      D.makeEvent(p, 0, 0, per),
      D.makeEvent(p, 1, per, per),
      D.makeEvent(p, 2, per - 1, 1),
    ];
    p.events[2].pitches = [90];
    const before = JSON.stringify(p),
      notes = [],
      clicks = [];
    a.prepare = () => {};
    a.note = (pitch, time, duration, program) =>
      notes.push({ pitch, time, duration, program });
    a.click = (time, accent) => clicks.push({ time, accent });
    a.graphLatency = 0.006;
    let stamp = { contextTime: 0, performanceTime: wall };
    c.getOutputTimestamp = () => stamp;
    const advance = (t) => {
      c.currentTime = t;
      wall = 100000 + t * 1000;
      stamp = { contextTime: t - 0.073 - 0.015, performanceTime: wall - 15 };
    };
    advance(0);
    a.start(p);
    const anchor = a.anchor,
      delay = 0.079;
    for (let t = 0; t < anchor + total * stepSeconds * 3 + 0.15; t += 0.025) {
      advance(t);
      a.pump();
      const unwrapped = Math.max(0, (t - delay - anchor) / stepSeconds),
        expected = unwrapped % total;
      const error = Math.abs(a.position() - expected);
      assert(Math.min(error, total - error) < 1e-7);
      checks++;
    }
    for (const note of notes) {
      const source = p.events.find((e) => e.pitches.includes(note.pitch));
      const cycle = Math.round(
        ((note.time - anchor) / stepSeconds - source.start) / total,
      );
      close(note.time, anchor + (source.start + cycle * total) * stepSeconds);
      close(note.duration, source.duration * stepSeconds);
      advance(note.time + delay);
      const edgeError = Math.abs(a.position() - source.start);
      assert(Math.min(edgeError, total - edgeError) < 1e-7);
      checks++;
    }
    for (const click of clicks) {
      const index = Math.round((click.time - anchor) / stepSeconds);
      assert.equal(index % beat, 0);
      assert.equal(click.accent, index % per === 0);
      checks += 2;
      advance(click.time + delay);
      const error = Math.abs(a.position() - (index % total));
      assert(Math.min(error, total - error) < 1e-7);
      checks++;
    }
    assert.equal(JSON.stringify(p), before);
    a.stop();
    assert.equal(timers.size, 0);
    // Pausing saves the audible position, not the render-ahead position.
    advance(0);
    a.start(p);
    advance(a.startedAt + delay + 1.25 * stepSeconds);
    a.pause();
    close(a.offset, 1.25);
    advance(c.currentTime + 3);
    close(a.position(), 1.25);
    a.start(p, a.offset);
    const resumed = a.startedAt;
    close(a.position(), 1.25);
    advance(resumed + delay + 0.5 * stepSeconds);
    close(a.position(), 1.75);
    a.stop();
    // Natural end waits until the last bar is heard, not merely rendered.
    p.loop = false;
    advance(0);
    a.start(p);
    const end = a.anchor + total * stepSeconds;
    advance(end + 0.02);
    a.pump();
    assert(a.running);
    advance(end + delay + 0.001);
    a.pump();
    assert(!a.running);
    close(a.position(), 0);
    // A tempo edit keeps the existing Stop workflow; the next start has a new anchor.
    p.bpm = bpm === 300 ? 137 : 300;
    advance(c.currentTime + 1);
    a.start(p);
    close(a.stepSeconds, 30 / p.bpm);
    close(a.position(), 0);
    a.stop();
  }
(async () => {
  // Measurement accepts the actual first nonzero impulse sample, not a baked-in delay.
  const a = engine();
  sandbox.window.OfflineAudioContext = class {
    constructor(ch, length, rate) {
      this.rate = rate;
      assert.equal(length, rate);
    }
    createBuffer() {
      return { getChannelData: () => new Float32Array(1) };
    }
    createBufferSource() {
      return { ...node(), start() {} };
    }
    createDynamicsCompressor() {
      return node();
    }
    async startRendering() {
      const pcm = new Float32Array(1000);
      pcm[301] = 0.25;
      return { getChannelData: () => pcm };
    }
  };
  await a.measureGraphLatency();
  close(a.graphLatency, 301 / 48000);
  delete sandbox.window.OfflineAudioContext;
  const preview = engine();
  preview.offset = 3.5;
  preview.context.currentTime = 2;
  let boot;
  const loading = new Promise((resolve) => (boot = resolve));
  preview.init = () => loading;
  const programs = [];
  preview.font.voices = (program) => (programs.push(program), [{}]);
  const first = preview.audition([60, 64, 67], 0),
    second = preview.audition([48, 52, 55], 24),
    input = [61, 65, 73],
    third = preview.audition(input, 73);
  input[0] = 127;
  boot();
  assert.deepEqual(await Promise.all([first, second, third]), [
    false,
    false,
    true,
  ]);
  assert.deepEqual(
    [...preview.auditionSources].map((r) => r.pitch),
    [61, 65, 73],
  );
  assert(programs.every((program) => program === 73));
  close(preview.position(), 3.5);
  assert(!preview.running);
  const old = [...preview.auditionSources];
  preview.context.currentTime = 2.1;
  // Existing arrangement notes are not cut by replacing the preview group.
  preview.note(40, 2.1, 4, 73);
  const arrangement = [...preview.sources].find((r) => r.pitch === 40),
    plannedEnd = arrangement.source.stopCalls.at(-1);
  assert(await preview.audition([57, 60, 64], 24));
  assert(old.every((r) => r.source.stopCalls.at(-1) <= 2.105));
  assert(old.every((r) => r.gain.gain.held.length === 1));
  assert.equal(arrangement.source.stopCalls.at(-1), plannedEnd);
  assert.deepEqual(
    [...preview.auditionSources].map((r) => r.pitch),
    [57, 60, 64],
  );
  for (const r of preview.auditionSources) {
    close(r.time, 2.1 + 128 / 48000);
    close(r.off - r.time, 0.8);
    assert(r.source.stopCalls.at(-1) > r.off);
  }
  close(preview.position(), 3.5);
  assert(await preview.audition([60, 64, 67], 0, 1.2));
  close(
    [...preview.auditionSources][0].off - [...preview.auditionSources][0].time,
    1.2,
  );
  let load;
  preview.init = () => new Promise((resolve) => (load = resolve));
  const pending = preview.audition([72], 0);
  preview.stop();
  load();
  assert.equal(await pending, false);
  assert.equal(preview.auditionSources.size, 0);
  close(preview.position(), 0);
  console.log(
    `PASS: ${checks} sync checks across 5 BPMs/all meters/8 bars/three loops; timestamp extrapolation, latency fallbacks and measured graph delay; audible pause/resume/end, tempo restart, exact source timing/durations; latest-wins cold/hot auditions, stored pitch snapshots, instrument selection, releases, voice isolation and pending cancellation.`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
