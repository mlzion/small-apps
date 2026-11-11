/* Short Web Audio envelopes adapted from D::FUZE. No audio work in animation frames. */
(function (root) {
  'use strict';
  const MAX_VOICES = 8, MAX_SHOT_VOICES = 6, MASTER_GAIN = .35;
  const SINGLE_BEEP = [[.065, 1100]], DOUBLE_BEEP = [[.065, 1100], [.165, 1320]];
  class LaserAudio {
    constructor() {
      this.enabled = true;
      this.context = null;
      this.master = null;
      this.voices = new Set();
      this.resuming = false;
      this.lastEscape = -Infinity;
    }
    unlock() {
      if (!this.enabled) return;
      try {
        const Constructor = root.AudioContext || root.webkitAudioContext;
        if (!Constructor) return;
        if (!this.context) {
          const context = new Constructor();
          this.context = context;
          this.master = context.createGain();
          this.master.gain.value = MASTER_GAIN;
          this.master.connect(context.destination);
        }
        if ((this.context.state === 'suspended' || this.context.state === 'interrupted') && !this.resuming) {
          this.resuming = true;
          Promise.resolve(this.context.resume()).catch(() => {}).finally(() => {this.resuming = false;});
        }
      } catch {this.resuming = false; /* Retry denied/unavailable audio on a later gesture. */ }
    }
    setEnabled(enabled) {
      this.enabled = enabled;
      if (!enabled) this.stop();
    }
    stop() {
      for (const voice of this.voices) {
        try {voice.source.stop();} catch { /* Already stopped. */ }
        voice.cleanup();
      }
    }
    voice(from, to, duration, type, volume, beeps) {
      if (!this.enabled || this.context?.state !== 'running' || this.voices.size >= MAX_VOICES) return false;
      const ctx = this.context, t = ctx.currentTime;
      let source, gain, voice;
      try {
        gain = ctx.createGain();
        source = ctx.createOscillator(); source.type = type;
        source.connect(gain);
        const level = Math.min(volume, .18);
        if (beeps) {
          // A single oscillator reserves the entire pair, including the silent gap.
          // No timer callback can lose the second beep or play it after muting.
          gain.gain.setValueAtTime(0, t);
          for (const [offset, frequency] of beeps) {
            const at = t + offset;
            source.frequency.setValueAtTime(frequency, at);
            gain.gain.setValueAtTime(0, at);
            gain.gain.linearRampToValueAtTime(level, at + .004);
            gain.gain.setValueAtTime(level, at + duration - .012);
            gain.gain.linearRampToValueAtTime(0, at + duration);
          }
        } else {
          // Preserve the existing laser and metallic bar envelopes exactly.
          source.frequency.setValueAtTime(from, t);
          source.frequency.exponentialRampToValueAtTime(to, t + duration);
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(level, t + .003);
          gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
        }
        // At most 8 unit-peak sources × .18 envelope × .35 master = .504 peak.
        gain.connect(this.master);
        voice = {source, cleanup: () => {
          this.voices.delete(voice);
          source.disconnect(); gain.disconnect();
        }};
        source.onended = voice.cleanup;
        this.voices.add(voice);
        source.start(t + (beeps ? beeps[0][0] : 0));
        source.stop(t + (beeps ? beeps[beeps.length - 1][0] : 0) + duration);
        return true;
      } catch {
        if (voice) voice.cleanup();
        else {source?.disconnect(); gain?.disconnect();}
        return false;
      }
    }
    playEscape() {
      // One short warning at most every 180 ms; never queue late escape sounds.
      if (!this.enabled || this.context?.state !== 'running' || this.context.currentTime-this.lastEscape < .18) return false;
      if (!this.voice(880,330,.12,'triangle',.055)) return false;
      this.lastEscape = this.context.currentTime;
      return true;
    }
    playShot(hits) {
      if (!this.enabled || this.context?.state !== 'running') return 0;
      let used = 0;
      const tone = (...args) => {if (used < MAX_SHOT_VOICES && this.voice(...args)) used++;};
      // One hit cue per shot. Doubles take precedence over simultaneous singles.
      if (hits.double || hits.single) {
        tone(1100, 1100, .055, 'sine', .07, hits.double ? DOUBLE_BEEP : SINGLE_BEEP);
      }
      tone(1400, 170, .075, 'sawtooth', .055);
      if (hits.bars) {
        tone(1900, 480, .13, 'square', .035);
        tone(1190, 330, .16, 'triangle', .04);
      }
      return used;
    }
  }
  const api = {LaserAudio, MAX_VOICES, MAX_SHOT_VOICES, MASTER_GAIN};
  if (typeof module !== 'undefined') module.exports = api;
  else root.LaserSound = api;
})(typeof window === 'undefined' ? globalThis : window);
