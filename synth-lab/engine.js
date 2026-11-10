export const WAVEFORMS = ['sine', 'triangle', 'sawtooth', 'square'];
export const frequencyForNote = (midi, reference = 440) => reference * 2 ** ((midi - 69) / 12);

// Audio-only module. Voice IDs belong to input sources, so shared pitches release independently.
export class SynthEngine {
  constructor(contextFactory = () => new (window.AudioContext || window.webkitAudioContext)()) {
    this.contextFactory = contextFactory;
    this.voices = new Map();
    this.waveform = 'sine';
    this.reference = 440;
    this.volume = .2;
    this.maxVoices = 16;
  }
  async enable() {
    if (!this.context) {
      this.context = this.contextFactory();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 4096;
      this.analyser.smoothingTimeConstant = .7;
      this.master.connect(this.analyser);
      this.analyser.connect(this.context.destination);
    }
    if (this.context.state !== 'running') await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Audio is paused. Tap Enable audio to try again.');
  }
  noteOn(id, midi) {
    if (this.context?.state !== 'running' || this.voices.has(id) || this.voices.size >= this.maxVoices) return false;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = this.waveform;
    oscillator.frequency.value = frequencyForNote(midi, this.reference);
    const now = this.context.currentTime;
    gain.gain.setValueAtTime(0, now);
    // Fixed headroom keeps even sixteen full-scale square waves below unity.
    gain.gain.linearRampToValueAtTime(1 / this.maxVoices, now + .015);
    oscillator.connect(gain); gain.connect(this.master);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start();
    this.voices.set(id, { oscillator, gain, midi });
    return true;
  }
  noteOff(id) {
    const voice = this.voices.get(id);
    if (!voice) return;
    const now = this.context.currentTime;
    const param = voice.gain.gain;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else { const value = param.value; param.cancelScheduledValues(now); param.setValueAtTime(value, now); }
    param.linearRampToValueAtTime(0, now + .06);
    voice.oscillator.stop(now + .065);
    this.voices.delete(id);
  }
  allNotesOff() { for (const id of this.voices.keys()) this.noteOff(id); }
  setWaveform(value) {
    if (!WAVEFORMS.includes(value)) throw new RangeError('Unknown waveform');
    this.waveform = value;
    for (const { oscillator } of this.voices.values()) oscillator.type = value;
  }
  setReference(value) {
    this.reference = Math.min(480, Math.max(400, Number(value)));
    for (const { oscillator, midi } of this.voices.values()) {
      oscillator.frequency.setTargetAtTime(frequencyForNote(midi, this.reference), this.context.currentTime, .015);
    }
  }
  setVolume(value) {
    this.volume = Math.min(1, Math.max(0, Number(value)));
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, .02);
  }
}
