// Memoryless output guard: unity below .85, smooth knee to .925, no look-ahead.
const OUTPUT_CURVE = Float32Array.from({ length: 4097 }, (_, i) => {
  const x = i / 2048 - 1, magnitude = Math.abs(x), excess = Math.max(0, magnitude - .85);
  return Math.sign(x) * (magnitude - excess * excess / .3);
});
function smooth(param, target, now, timeConstant) {
  param.cancelAndHoldAtTime(now);
  param.setTargetAtTime(target, now, timeConstant);
}
// Audio only. Manual expression and optional motion are independent inputs.
export class Synth {
  constructor() {
    this.context = null;
    this.voices = new Map();
    this.sounding = new Set();
    this.waveform = 'sine';
    this.volume = 0.65;
    this.expression = { brightness: 0.75, level: 1 };
    this.motion = { bendCents: 0, volume: 1 };
  }

  unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Web Audio is unavailable in this browser.');
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.filter = this.context.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.Q.value = 0.7;
      this.master = this.context.createGain();
      // No compressor/look-ahead. The memoryless guard only shapes overloads.
      this.safety = this.context.createWaveShaper();
      this.safety.curve = OUTPUT_CURVE;
      this.safety.oversample = 'none';
      this.filter.connect(this.master).connect(this.safety).connect(this.context.destination);
      this.applyExpression(true);
      this.context.addEventListener('statechange', () => {
        if (this.context.state !== 'running') this.stopAll();
      });
    }
    return this.context.state === 'running' ? Promise.resolve() : this.context.resume();
  }

  start(id, midi) {
    this.stop(id);
    if (!this.context || this.context.state !== 'running') return false;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = this.waveform;
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    oscillator.detune.setValueAtTime(this.motion.bendCents, now);
    gain.gain.setValueAtTime(0, now);
    // A 1 ms attack keeps a tiny click-prevention ramp without a soft onset.
    gain.gain.linearRampToValueAtTime(0.08, now + 0.001);
    oscillator.connect(gain).connect(this.filter);
    const voice = { oscillator, gain };
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.sounding.delete(voice); };
    this.sounding.add(voice);
    oscillator.start(now);
    this.voices.set(id, voice);
    return true;
  }

  stop(id) {
    const voice = this.voices.get(id);
    if (!voice) return;
    const now = this.context.currentTime;
    voice.gain.gain.cancelAndHoldAtTime(now);
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.035);
    voice.oscillator.stop(now + 0.04);
    this.voices.delete(id);
  }

  stopAll() { for (const id of this.voices.keys()) this.stop(id); }
  setVolume(value) {
    if (Number.isFinite(value)) this.volume = Math.max(0, Math.min(1, value));
    this.applyVolume();
  }
  setWaveform(value) {
    this.waveform = value;
    for (const voice of this.voices.values()) voice.oscillator.type = value;
  }
  setExpression(values) {
    for (const key of ['brightness', 'level']) {
      if (Number.isFinite(values[key])) this.expression[key] = Math.max(0, Math.min(1, values[key]));
    }
    this.applyExpression();
  }
  setMotion({ bendCents = 0, volume = 1 } = {}) {
    const bend = Number.isFinite(bendCents) ? Math.max(-200, Math.min(200, bendCents)) : 0;
    const gain = Number.isFinite(volume) ? Math.max(.85, Math.min(1.15, volume)) : 1;
    const pitchChanged = bend !== this.motion.bendCents, volumeChanged = gain !== this.motion.volume;
    this.motion.bendCents = bend;
    this.motion.volume = gain;
    if (!this.context) return;
    const now = this.context.currentTime;
    if (pitchChanged) for (const voice of this.sounding) smooth(voice.oscillator.detune, bend, now, .025);
    if (volumeChanged) this.applyVolume(false, .025);
  }
  applyExpression(initial = false) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const cutoff = 150 * (120 ** this.expression.brightness);
    if (initial) {
      // Initialize immediately; smoothing is only for later control changes.
      this.filter.frequency.setValueAtTime(cutoff, now);
    } else {
      this.filter.frequency.setTargetAtTime(cutoff, now, 0.015);
    }
    this.applyVolume(initial);
  }
  applyVolume(initial = false, timeConstant = .015) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const value = this.volume * this.expression.level * this.motion.volume;
    if (initial) this.master.gain.setValueAtTime(value, now);
    else smooth(this.master.gain, value, now, timeConstant);
  }
}
