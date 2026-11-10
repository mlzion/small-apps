// Audio only. Expression sources (including future motion input) use setExpression.
export class Synth {
  constructor() {
    this.context = null;
    this.voices = new Map();
    this.waveform = 'sine';
    this.volume = 0.65;
    this.expression = { brightness: 0.75, level: 1 };
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
      // Gentle limiting protects the output when several thumbs/fingers play together.
      this.limiter = this.context.createDynamicsCompressor();
      this.filter.connect(this.master).connect(this.limiter).connect(this.context.destination);
      this.applyExpression();
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
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.008);
    oscillator.connect(gain).connect(this.filter);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now);
    this.voices.set(id, { oscillator, gain });
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
  setVolume(value) { this.volume = value; this.applyExpression(); }
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
  applyExpression() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.filter.frequency.setTargetAtTime(150 * (120 ** this.expression.brightness), now, 0.015);
    this.master.gain.setTargetAtTime(this.volume * this.expression.level, now, 0.015);
  }
}
