/* Optional local Web Audio cues; no assets, timers, or simulation randomness. */
(() => {
  'use strict';
  window.GalactixAudio = {create() {
    let enabled = false, context, output;
    const voices = new Set();
    try { enabled = localStorage.getItem('galactix.sound.v02') === 'on'; } catch {}
    function unlock() {
      if (!enabled) return;
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        if (!context) { context = new Audio(); output = context.createGain(); output.gain.value = .12; output.connect(context.destination); }
        if (context.state === 'suspended') context.resume().catch(() => {});
      } catch { /* Audio is optional, including in restricted/mobile browsers. */ }
    }
    function stop() { for (const voice of voices) { try { voice.stop(); } catch {} } voices.clear(); }
    function tone(frequency, endFrequency, duration, type, volume) {
      if (!context || context.state !== 'running') return;
      try {
        const now = context.currentTime, osc = context.createOscillator(), gain = context.createGain();
        osc.type = type; osc.frequency.setValueAtTime(frequency, now); osc.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
        gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
        osc.connect(gain); gain.connect(output); voices.add(osc);
        osc.onended = () => { voices.delete(osc); osc.disconnect(); gain.disconnect(); };
        osc.start(now); osc.stop(now + duration);
      } catch { /* An interrupted audio device must never interrupt a flight. */ }
    }
    return {
      get enabled() { return enabled; }, unlock, stop,
      toggle() { enabled = !enabled; try { localStorage.setItem('galactix.sound.v02', enabled ? 'on' : 'off'); } catch {} if (enabled) unlock(); else stop(); },
      play(cues) {
        if (!enabled || !cues.length) return;
        // At most one cue per simulation step; destruction takes priority over fire.
        if (cues.includes('damage')) tone(130, 35, .22, 'sawtooth', .5);
        else if (cues.includes('pickup') || cues.includes('shield')) tone(420, 950, .18, 'sine', .5);
        else if (cues.includes('destroy')) tone(220, 55, .14, 'triangle', .5);
        else if (cues.includes('hit')) tone(310, 140, .07, 'triangle', .25);
        else if (cues.includes('fire')) tone(720, 280, .045, 'sine', .18);
      }
    };
  }};
})();
