/* Native sample player with a 120 ms lookahead on the AudioContext clock. */
"use strict";
class DrumAudio {
  constructor() {
    this.context = null;
    this.buffers = new Map();
    this.sources = new Set();
    this.muted = new Set();
    this.running = false;
    this.offset = 0;
    this.token = 0;
    this.timer = null;
  }
  async init(drums) {
    // resume is invoked synchronously from the Play gesture, before network awaits.
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error("Web Audio is unavailable in this browser.");
      this.context = new Audio();
      this.master = this.context.createGain();
      this.master.gain.value = 0.65;
      this.master.connect(this.context.destination);
    }
    await this.context.resume();
    if (!this.manifest) {
      const response = await fetch("samples/manifest.json");
      if (!response.ok) throw new Error("Could not load the acoustic kit.");
      this.manifest = await response.json();
    }
    await Promise.all(
      drums.map(async (d) => {
        if (this.buffers.has(d.midi)) return;
        const response = await fetch("samples/" + this.manifest[d.midi].file);
        if (!response.ok)
          throw new Error(
            `Could not load ${d.name}. Check your connection and try Play again.`,
          );
        const buffer = await this.context.decodeAudioData(
          await response.arrayBuffer(),
        );
        this.buffers.set(d.midi, buffer);
      }),
    );
  }
  hit(note, time) {
    if (this.muted.has(note.drum)) return;
    const buffer = this.buffers.get(note.drum);
    if (!buffer) return;
    // Closed/pedal hats choke open hats at the scheduled event time.
    if (note.drum === 42 || note.drum === 44)
      for (const record of this.sources)
        if (record.drum === 46 && record.time <= time) {
          try {
            record.source.stop(time);
          } catch {
            /* already ended */
          }
        }
    const source = this.context.createBufferSource(),
      gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = this.manifest[note.drum].rate;
    gain.gain.value = (note.velocity / 127) ** 1.35;
    source.connect(gain);
    gain.connect(this.master);
    const record = { source, gain, drum: note.drum, time };
    this.sources.add(record);
    source.onended = () => {
      this.sources.delete(record);
      source.disconnect();
      gain.disconnect();
    };
    source.start(time);
  }
  setMuted(drums) {
    const previous = this.muted;
    this.muted = new Set(drums.filter((d) => d.muted).map((d) => d.midi));
    for (const record of this.sources)
      if (this.muted.has(record.drum)) {
        try {
          record.source.stop();
        } catch {
          /* already ended */
        }
        this.sources.delete(record);
      }
    // Restore newly unmuted hits inside the window already visited by pump().
    if (this.running) {
      const now = this.context.currentTime;
      const first = Math.max(
        0,
        Math.ceil((now - this.anchor) / this.stepSeconds),
      );
      for (let step = first; step < this.next; step++)
        for (const note of this.byStep.get(step % this.total) || [])
          if (previous.has(note.drum) && !this.muted.has(note.drum))
            this.hit(note, this.anchor + step * this.stepSeconds);
    }
  }
  start(events, bars, bpm) {
    this.clearSources();
    this.byStep = new Map();
    for (const note of events) {
      if (!this.byStep.has(note.step)) this.byStep.set(note.step, []);
      this.byStep.get(note.step).push(note);
    }
    this.total = bars * 64;
    this.stepSeconds = 60 / bpm / 16;
    this.offset = 0;
    this.anchor =
      this.context.currentTime + 0.04 - this.offset * this.stepSeconds;
    this.next = Math.ceil(this.offset - 1e-7);
    this.running = true;
    this.pump();
    this.timer = setInterval(() => this.pump(), 25);
  }
  pump() {
    const now = this.context.currentTime;
    // Do not burst old notes after a stalled foreground event loop.
    if (this.anchor + this.next * this.stepSeconds < now - 0.05)
      this.next = Math.ceil((now - this.anchor) / this.stepSeconds);
    while (this.anchor + this.next * this.stepSeconds < now + 0.12) {
      const step = this.next % this.total,
        time = this.anchor + this.next * this.stepSeconds;
      for (const note of this.byStep.get(step) || [])
        this.hit(note, Math.max(time, now));
      this.next++;
    }
  }
  position() {
    return this.running
      ? Math.max(
          0,
          (this.context.currentTime - this.anchor) / this.stepSeconds,
        ) % this.total
      : this.offset;
  }
  stop() {
    this.token++;
    this.running = false;
    this.clearSources();
    this.offset = 0;
  }
  clearSources() {
    clearInterval(this.timer);
    for (const r of this.sources) {
      try {
        r.source.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
  }
}
window.DrumAudio = DrumAudio;
