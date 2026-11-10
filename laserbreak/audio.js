/* Short Web Audio envelopes adapted from D::FUZE. No audio work in animation frames. */
(function (root) {
  'use strict';
  const MAX_VOICES = 8, MAX_SHOT_VOICES = 6, MASTER_GAIN = .35;
  class LaserAudio {
    constructor() {
      this.enabled = true;
      this.context = null;
      this.master = null;
      this.noise = null;
      this.voices = new Set();
      this.resuming = false;
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
          this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * .5), context.sampleRate);
          const data = this.noise.getChannelData(0);
          let seed = 1729;
          for (let i = 0; i < data.length; i++) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            data[i] = seed / 2147483648 - 1;
          }
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
    voice(from, to, duration, type, volume) {
      if (!this.enabled || this.context?.state !== 'running' || this.voices.size >= MAX_VOICES) return false;
      const ctx = this.context, t = ctx.currentTime;
      let source, gain, filter, voice;
      try {
        gain = ctx.createGain();
        if (type === 'noise') {
          source = ctx.createBufferSource();
          source.buffer = this.noise;
          filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(from, t);
          filter.frequency.exponentialRampToValueAtTime(to, t + duration);
          source.connect(filter); filter.connect(gain);
        } else {
          source = ctx.createOscillator(); source.type = type;
          source.frequency.setValueAtTime(from, t);
          source.frequency.exponentialRampToValueAtTime(to, t + duration);
          source.connect(gain);
        }
        // At most 8 unit-peak sources × .18 envelope × .35 master = .504 peak.
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(Math.min(volume, .18), t + .003);
        gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
        gain.connect(this.master);
        voice = {source, cleanup: () => {
          this.voices.delete(voice);
          source.disconnect(); gain.disconnect(); if (filter) filter.disconnect();
        }};
        source.onended = voice.cleanup;
        this.voices.add(voice);
        source.start(t); source.stop(t + duration);
        return true;
      } catch {
        if (voice) voice.cleanup();
        else {source?.disconnect(); gain?.disconnect(); filter?.disconnect();}
        return false;
      }
    }
    playShot(hits) {
      if (!this.enabled || this.context?.state !== 'running') return 0;
      let used = 0;
      const tone = (...args) => {if (used < MAX_SHOT_VOICES && this.voice(...args)) used++;};
      // Aggregate each kind once per shot, prioritizing the richer double-hit burst.
      if (hits.double) {
        tone(110, 26, .44, 'triangle', .16);
        tone(54, 22, .5, 'sine', .17);
        tone(850, 65, .35, 'noise', .14);
      }
      tone(1400, 170, .075, 'sawtooth', .055);
      if (hits.bars) {
        tone(1900, 480, .13, 'square', .035);
        tone(1190, 330, .16, 'triangle', .04);
      }
      if (hits.single) tone(440, 90, .07, 'triangle', .045);
      return used;
    }
  }
  const api = {LaserAudio, MAX_VOICES, MAX_SHOT_VOICES, MASTER_GAIN};
  if (typeof module !== 'undefined') module.exports = api;
  else root.LaserSound = api;
})(typeof window === 'undefined' ? globalThis : window);
