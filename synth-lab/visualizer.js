// Actual post-volume audio only. Fixed sample buffers, capped resolution and 30 fps.
export class Visualizer {
  constructor(engine, scope, spectrum) {
    this.engine = engine; this.scope = scope; this.spectrum = spectrum;
    this.time = new Float32Array(4096); this.bins = new Uint8Array(2048);
    this.last = 0;
    this.observer = new ResizeObserver(() => this.resize());
    for (const canvas of [scope, spectrum]) this.observer.observe(canvas);
    this.resize();
    this.frame = requestAnimationFrame(t => this.tick(t));
  }
  resize() {
    for (const canvas of [this.scope, this.spectrum]) {
      const rect = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
    }
    this.draw();
  }
  tick(t) {
    if (!document.hidden && t - this.last >= 1000 / 30) { this.last = t; this.draw(); }
    this.frame = requestAnimationFrame(t => this.tick(t));
  }
  grid(canvas) {
    const ctx = canvas.getContext('2d'), { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h); ctx.strokeStyle = '#26323e'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= 4; x++) { ctx.moveTo(w * x / 4, 0); ctx.lineTo(w * x / 4, h); }
    for (let y = 1; y < 4; y++) { ctx.moveTo(0, h * y / 4); ctx.lineTo(w, h * y / 4); }
    ctx.stroke(); return ctx;
  }
  draw() {
    const analyser = this.engine.analyser;
    if (analyser) { analyser.getFloatTimeDomainData(this.time); analyser.getByteFrequencyData(this.bins); }
    else { this.time.fill(0); this.bins.fill(0); }
    const scope = this.grid(this.scope), w = this.scope.width, h = this.scope.height;
    // Positive zero-crossing trigger reduces horizontal drift. A fixed ~12 ms window shows pitch changes.
    let start = 0;
    for (let i = 1; i < 2048; i++) if (this.time[i - 1] <= 0 && this.time[i] > 0) { start = i; break; }
    const samples = Math.min(2048, Math.round((this.engine.context?.sampleRate || 48000) * .012));
    scope.beginPath(); scope.strokeStyle = '#9cddcf'; scope.lineWidth = Math.min(devicePixelRatio || 1, 2) * 1.5;
    // A fixed display gain makes quiet, safely attenuated voices legible; it is not audio gain.
    for (let x = 0; x < w; x++) {
      const value = this.time[start + Math.floor(x / w * samples)];
      const y = h / 2 - Math.max(-1, Math.min(1, value * 16)) * h * .45;
      if (x === 0) scope.moveTo(x, y); else scope.lineTo(x, y);
    }
    scope.stroke();
    const ctx = this.grid(this.spectrum), sw = this.spectrum.width, sh = this.spectrum.height;
    const nyquist = (this.engine.context?.sampleRate || 48000) / 2;
    ctx.fillStyle = '#a5c4ff';
    // Log frequency bins, aggregated by peak so narrow harmonics remain visible.
    const count = Math.max(1, Math.min(160, Math.floor(sw / 3)));
    for (let bar = 0; bar < count; bar++) {
      const low = 20 * 1000 ** (bar / count), high = 20 * 1000 ** ((bar + 1) / count);
      const from = Math.max(1, Math.floor(low / nyquist * this.bins.length));
      const to = Math.min(this.bins.length - 1, Math.max(from, Math.ceil(high / nyquist * this.bins.length) - 1));
      let peak = 0;
      for (let i = from; i <= to; i++) peak = Math.max(peak, this.bins[i]);
      const height = peak / 255 * sh;
      ctx.fillRect(bar * sw / count, sh - height, Math.max(1, sw / count - 1), height);
    }
  }
  destroy() { cancelAnimationFrame(this.frame); this.observer.disconnect(); }
}
