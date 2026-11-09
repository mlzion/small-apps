"use strict";
class ArcadeAudio {
  constructor() {
    this.context = null;
    this.voices = new Set();
    try {
      this.muted = localStorage.getItem("d-fuze-muted") === "true";
    } catch {
      this.muted = false;
    }
  }
  unlock() {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      this.context ??= new C();
      if (this.context.state === "suspended")
        this.context.resume().catch(() => {});
    } catch {}
  }
  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem("d-fuze-muted", String(this.muted));
    } catch {}
    if (this.muted) this.stop();
  }
  stop() {
    for (const node of this.voices) {
      try {
        node.stop();
      } catch {}
    }
    this.voices.clear();
  }
  tone(from, to, duration, type = "sine", volume = 0.06) {
    if (this.muted || !this.context || this.context.state !== "running") return;
    try {
      const ctx = this.context,
        t = ctx.currentTime,
        osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(to, t + duration);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      this.voices.add(osc);
      osc.onended = () => {
        this.voices.delete(osc);
        osc.disconnect();
        gain.disconnect();
      };
      osc.start(t);
      osc.stop(t + duration);
    } catch {}
  }
  play(event, urgent) {
    const sounds = {
      fire: [900, 220, 0.07, "square", 0.025],
      hit: [170, 75, 0.06, "triangle", 0.05],
      pulse: urgent
        ? [1000, 700, 0.09, "square", 0.035]
        : [580, 480, 0.1, "sine", 0.07],
      defuse: [850, 45, 0.8, "triangle", 0.08],
      explode: [100, 20, 0.7, "sawtooth", 0.08],
      destroy: [1700, 80, 0.15, "sawtooth", 0.025],
      begin: [240, 700, 0.2, "sine", 0.06],
      click: [500, 350, 0.04, "sine", 0.035],
    };
    if (sounds[event]) this.tone(...sounds[event]);
  }
}
