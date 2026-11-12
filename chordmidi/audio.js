/* Minimal native SF2 sample player for the bundled TimGM6mb bank.
   Supports preset/instrument global zones, key/velocity ranges, tuning,
   sample offsets/loops, pan, attenuation and volume ADSR. No external runtime. */
"use strict";
class SoundFont {
  constructor(buffer, context) {
    this.context = context;
    this.view = new DataView(buffer);
    this.chunks = {};
    this.buffers = new Map();
    const tag = (o) => String.fromCharCode(...new Uint8Array(buffer, o, 4));
    const scan = (start, end) => {
      for (let o = start; o + 8 <= end; ) {
        const id = tag(o),
          size = this.view.getUint32(o + 4, true);
        if (o + 8 + size > end) throw Error("Invalid soundfont chunk");
        if (id === "LIST" || id === "RIFF") scan(o + 12, o + 8 + size);
        else this.chunks[id] = { offset: o + 8, size };
        o += 8 + size + (size % 2);
      }
    };
    scan(0, buffer.byteLength);
    for (const id of [
      "phdr",
      "pbag",
      "pgen",
      "inst",
      "ibag",
      "igen",
      "shdr",
      "smpl",
    ])
      if (!this.chunks[id]) throw Error("Incomplete soundfont");
    this.presets = this.records("phdr", 38, (o) => ({
      name: this.name(o),
      program: this.u16(o + 20),
      bank: this.u16(o + 22),
      bag: this.u16(o + 24),
    }));
    this.instruments = this.records("inst", 22, (o) => ({
      bag: this.u16(o + 20),
    }));
    this.samples = this.records("shdr", 46, (o) => ({
      start: this.u32(o + 20),
      end: this.u32(o + 24),
      loopStart: this.u32(o + 28),
      loopEnd: this.u32(o + 32),
      rate: this.u32(o + 36),
      root: this.view.getUint8(o + 40),
      correction: this.view.getInt8(o + 41),
    }));
  }
  u16(o) {
    return this.view.getUint16(o, true);
  }
  u32(o) {
    return this.view.getUint32(o, true);
  }
  name(o) {
    let s = "";
    for (let i = 0; i < 20 && this.view.getUint8(o + i); i++)
      s += String.fromCharCode(this.view.getUint8(o + i));
    return s;
  }
  records(id, size, read) {
    const c = this.chunks[id],
      out = [];
    for (let o = c.offset; o < c.offset + c.size; o += size) out.push(read(o));
    return out;
  }
  zones(id, index) {
    const list = id === "p" ? this.presets : this.instruments,
      bag = this.chunks[id + "bag"].offset,
      gen = this.chunks[id + "gen"].offset;
    const out = [];
    for (let i = list[index].bag; i < list[index + 1].bag; i++) {
      const z = {};
      for (
        let j = this.u16(bag + i * 4);
        j < this.u16(bag + (i + 1) * 4);
        j++
      ) {
        const o = gen + j * 4,
          op = this.u16(o);
        z[op] = [43, 44].includes(op)
          ? [this.view.getUint8(o + 2), this.view.getUint8(o + 3)]
          : this.view.getInt16(o + 2, true);
      }
      out.push(z);
    }
    return out;
  }
  voices(program, pitch, velocity = 96) {
    const pi = this.presets.findIndex(
      (p) => p.bank === 0 && p.program === program,
    );
    if (pi < 0) throw Error("Preset unavailable");
    const match = (z) =>
      !z[44] || (velocity >= z[44][0] && velocity <= z[44][1]);
    const distance = (z) =>
      Math.max(0, (z[43]?.[0] ?? 0) - pitch, pitch - (z[43]?.[1] ?? 127));
    let pg = {};
    const out = [];
    for (const p of this.zones("p", pi)) {
      if (p[41] === undefined) {
        pg = p;
        continue;
      }
      const preset = { ...pg, ...p };
      if (!match(preset)) continue;
      let ig = {};
      for (const z of this.zones("i", p[41])) {
        if (z[53] === undefined) {
          ig = z;
          continue;
        }
        const instrument = { ...ig, ...z };
        if (!match(instrument)) continue;
        const merged = { ...instrument };
        for (const [op, value] of Object.entries(preset))
          if (![41, 43, 44].includes(+op))
            merged[op] = (merged[op] || 0) + value;
        out.push({
          zone: merged,
          distance: Math.max(distance(preset), distance(instrument)),
        });
      }
    }
    // Extend a restricted acoustic instrument's nearest zone into the selected
    // register rather than silently dropping pitches outside its natural range.
    const nearest = Math.min(...out.map((v) => v.distance));
    return out.filter((v) => v.distance === nearest).map((v) => v.zone);
  }
  sample(z) {
    const s = this.samples[z[53]],
      start = s.start + (z[0] || 0) + (z[4] || 0) * 32768,
      end = s.end + (z[1] || 0) + (z[12] || 0) * 32768,
      key = `${z[53]}:${start}:${end}`;
    if (!this.buffers.has(key)) {
      if (start < 0 || end <= start || end * 2 > this.chunks.smpl.size)
        throw Error("Invalid sample bounds");
      const b = this.context.createBuffer(1, end - start, s.rate),
        data = b.getChannelData(0),
        offset = this.chunks.smpl.offset;
      for (let i = 0; i < data.length; i++)
        data[i] = this.view.getInt16(offset + (start + i) * 2, true) / 32768;
      this.buffers.set(key, b);
    }
    return { buffer: this.buffers.get(key), s, start };
  }
}
class ChordAudio {
  constructor() {
    this.context = null;
    this.sources = new Set();
    this.auditionSources = new Set();
    this.auditionGeneration = 0;
    this.graphLatency = 0;
    this.running = false;
    this.offset = 0;
    this.generation = 0;
  }
  async init() {
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw Error("Web Audio unavailable");
      this.context = new Audio();
      this.master = this.context.createGain();
      this.master.gain.value = 0.22;
      const limiter = this.context.createDynamicsCompressor();
      this.master.connect(limiter);
      limiter.connect(this.context.destination);
    }
    await this.context.resume();
    if (!this.graphReady) this.graphReady = this.measureGraphLatency();
    if (!this.font) {
      if (!this.loading)
        this.loading = fetch("soundfont/TimGM6mb.sf2")
          .then((r) => {
            if (!r.ok) throw Error("Soundfont download failed");
            return r.arrayBuffer();
          })
          .then((b) => (this.font = new SoundFont(b, this.context)))
          .catch((e) => {
            this.loading = null;
            throw e;
          });
      await this.loading;
    }
    await this.graphReady;
  }
  async measureGraphLatency() {
    // Measure this browser's compressor delay, rather than applying a guessed
    // visual offset. Gain and pan do not delay samples; SF2 attack stays musical.
    const Offline =
      window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return;
    try {
      const rate = this.context.sampleRate;
      const offline = new Offline(1, rate, rate);
      const impulse = offline.createBuffer(1, 1, rate);
      impulse.getChannelData(0)[0] = 0.25;
      const source = offline.createBufferSource();
      source.buffer = impulse;
      const compressor = offline.createDynamicsCompressor();
      source.connect(compressor);
      compressor.connect(offline.destination);
      source.start(0);
      const rendered = await offline.startRendering();
      const first = rendered
        .getChannelData(0)
        .findIndex((value) => Math.abs(value) > 1e-8);
      if (first >= 0) this.graphLatency = first / rate;
    } catch {
      // Playback remains available without an offline renderer. Do not guess
      // at an unmeasured graph delay on that browser.
    }
  }
  outputTime(now = performance.now()) {
    const c = this.context;
    let time;
    try {
      const stamp = c.getOutputTimestamp?.();
      if (
        stamp &&
        Number.isFinite(stamp.contextTime) &&
        stamp.contextTime >= 0 &&
        Number.isFinite(stamp.performanceTime) &&
        stamp.performanceTime > 0
      ) {
        time = stamp.contextTime + (now - stamp.performanceTime) / 1000;
      }
    } catch {
      /* Fall back to the browser's latency estimates. */
    }
    if (!Number.isFinite(time)) {
      const latency = (value) =>
        Number.isFinite(value) && value >= 0 ? value : 0;
      time = c.currentTime - latency(c.baseLatency) - latency(c.outputLatency);
    }
    return Math.max(0, Math.min(c.currentTime, time) - this.graphLatency);
  }
  async audition(pitches, program, duration = 0.8) {
    this.cancelAudition();
    const token = this.auditionGeneration,
      generation = this.generation;
    const notes = pitches.slice();
    try {
      await this.init();
    } catch (error) {
      if (token !== this.auditionGeneration || generation !== this.generation)
        return false;
      throw error;
    }
    if (token !== this.auditionGeneration || generation !== this.generation)
      return false;
    this.prepare(notes, program);
    // One render quantum of scheduling headroom; no fixed 40 ms preview wait.
    const time = this.context.currentTime + 128 / this.context.sampleRate;
    for (const pitch of notes) this.note(pitch, time, duration, program, true);
    return true;
  }
  cancelAudition() {
    this.auditionGeneration++;
    for (const record of this.auditionSources) {
      const now = this.context.currentTime;
      try {
        // A short de-click fade when cutting an old preview. Normal note-offs
        // still use the instrument's natural SF2 release envelope.
        if (record.time <= now) {
          if (record.gain.gain.cancelAndHoldAtTime)
            record.gain.gain.cancelAndHoldAtTime(now);
          else {
            const value = record.gain.gain.value;
            record.gain.gain.cancelScheduledValues(now);
            record.gain.gain.setValueAtTime(value, now);
          }
          record.gain.gain.linearRampToValueAtTime(0, now + 0.005);
          record.source.stop(now + 0.005);
        } else record.source.stop(now);
      } catch {
        /* Already ended. */
      }
    }
    this.auditionSources.clear();
  }
  prepare(pitches, program) {
    for (const pitch of new Set(pitches))
      for (const zone of this.font.voices(program, pitch))
        this.font.sample(zone);
  }
  note(pitch, time, duration, program = 0, audition = false) {
    const c = this.context;
    for (const z of this.font.voices(program, pitch)) {
      const { buffer, s, start } = this.font.sample(z),
        source = c.createBufferSource(),
        gain = c.createGain(),
        pan = c.createStereoPanner();
      source.buffer = buffer;
      const rate =
        2 **
        (((pitch - (z[58] ?? s.root)) * (z[56] ?? 100) +
          (z[51] || 0) * 100 +
          (z[52] || 0) +
          s.correction) /
          1200);
      source.playbackRate.value = rate;
      const mode = (z[54] || 0) & 3;
      if (mode === 1 || mode === 3) {
        source.loop = true;
        source.loopStart =
          (s.loopStart + (z[2] || 0) + (z[45] || 0) * 32768 - start) / s.rate;
        source.loopEnd =
          (s.loopEnd + (z[3] || 0) + (z[50] || 0) * 32768 - start) / s.rate;
        if (
          source.loopStart < 0 ||
          source.loopEnd <= source.loopStart ||
          source.loopEnd > buffer.duration
        )
          source.loop = false;
      }
      const tc = (op, def = -12000) =>
        Math.max(0.001, Math.min(20, 2 ** ((z[op] ?? def) / 1200)));
      const delay = tc(33),
        attack = tc(34),
        hold = tc(35),
        decay = tc(36),
        release = Math.min(2, tc(38)),
        level = 0.7 * 10 ** (-(z[48] || 0) / 200),
        sustain = level * 10 ** (-(z[37] || 0) / 200);
      const off = time + duration;
      const points = [
        [time, 0],
        [time + delay, 0],
        [time + delay + attack, level],
        [time + delay + attack + hold, level],
        [time + delay + attack + hold + decay, sustain],
      ];
      gain.gain.setValueAtTime(0, time);
      for (let i = 1; i < points.length; i++) {
        const [t, v] = points[i],
          [prevT, prevV] = points[i - 1];
        if (t <= off) gain.gain.linearRampToValueAtTime(v, t);
        else {
          gain.gain.linearRampToValueAtTime(
            prevV + (v - prevV) * Math.max(0, (off - prevT) / (t - prevT)),
            off,
          );
          break;
        }
      }
      if (off >= points.at(-1)[0]) gain.gain.setValueAtTime(sustain, off);
      gain.gain.linearRampToValueAtTime(0, off + release);
      pan.pan.value = Math.max(-1, Math.min(1, (z[17] || 0) / 500));
      source.connect(gain);
      gain.connect(pan);
      pan.connect(this.master);
      const r = { source, gain, pan, pitch, time, off };
      this.sources.add(r);
      if (audition) this.auditionSources.add(r);
      source.onended = () => {
        this.sources.delete(r);
        this.auditionSources.delete(r);
        source.disconnect();
        gain.disconnect();
        pan.disconnect();
      };
      source.start(time);
      source.stop(off + release + 0.01);
    }
  }
  click(time, accent) {
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain();
    o.frequency.value = accent ? 1400 : 900;
    g.gain.setValueAtTime(0.35, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.035);
    o.connect(g);
    g.connect(this.master);
    const r = { source: o };
    this.sources.add(r);
    o.onended = () => {
      this.sources.delete(r);
      o.disconnect();
      g.disconnect();
    };
    o.start(time);
    o.stop(time + 0.04);
  }
  start(p, offset = 0) {
    this.clear();
    this.project = structuredClone(p);
    this.total = ChordMidi.totalSteps(p);
    this.stepSeconds = 30 / p.bpm;
    this.notes = [0, 1, 2].flatMap((lane) =>
      ChordMidi.noteSpans(p.events.filter((e) => e.lane === lane)),
    );
    this.prepare(
      this.notes.map((n) => n.pitch),
      p.program,
    );
    this.offset = offset % this.total;
    this.startedAt = this.context.currentTime + 0.04;
    this.anchor = this.startedAt - this.offset * this.stepSeconds;
    this.next = Math.ceil(this.offset - 1e-7);
    this.running = true;
    // Resume held chords when pausing between grid divisions.
    for (const n of this.notes)
      if (n.start < this.offset && n.end > this.offset)
        this.note(
          n.pitch,
          this.startedAt,
          (n.end - this.offset) * this.stepSeconds,
          p.program,
        );
    this.pump();
    this.timer = setInterval(() => this.pump(), 25);
  }
  pump() {
    const c = this.context,
      p = this.project,
      now = c.currentTime;
    if (this.anchor + this.next * this.stepSeconds < now - 0.05)
      this.next = Math.ceil((now - this.anchor) / this.stepSeconds);
    while (this.anchor + this.next * this.stepSeconds < now + 0.12) {
      if (!p.loop && this.next >= this.total) break;
      const step = this.next % this.total,
        time = Math.max(now, this.anchor + this.next * this.stepSeconds);
      for (const n of this.notes)
        if (n.start === step)
          this.note(
            n.pitch,
            time,
            (n.end - n.start) * this.stepSeconds,
            p.program,
          );
      const per = ChordMidi.stepsPerBar(p.meter),
        beat = p.meter === "6/8" ? 3 : 2;
      if (p.metronome && step % beat === 0) this.click(time, step % per === 0);
      this.next++;
    }
    if (
      !p.loop &&
      this.outputTime() >= this.anchor + this.total * this.stepSeconds
    ) {
      this.stop();
      this.onEnd?.();
    }
  }
  position() {
    if (!this.running) return this.offset;
    const pos = Math.max(
      this.offset,
      (this.outputTime() - this.anchor) / this.stepSeconds,
    );
    return this.project.loop ? pos % this.total : Math.min(this.total, pos);
  }
  pause() {
    this.offset = this.position();
    this.running = false;
    this.clear();
  }
  clear() {
    clearInterval(this.timer);
    this.cancelAudition();
    for (const r of this.sources) {
      try {
        r.source.stop();
      } catch {}
    }
    this.sources.clear();
  }
  stop() {
    this.generation++;
    this.running = false;
    this.offset = 0;
    this.clear();
  }
}
window.SoundFont = SoundFont;
window.ChordAudio = ChordAudio;
