"""Audio-graph/onset checks, not physical touch-to-speaker measurements.

Run from the repository root: python celphonica/test-latency.py
"""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
                                args=['--autoplay-policy=document-user-activation-required'])
    ctx = browser.new_context()
    errors = []
    ctx.on('weberror', lambda error: errors.append(str(error)))

    def serve(route):
        path = urlsplit(route.request.url).path.removeprefix('/small-apps/')
        file = ROOT / path
        if file.is_dir(): file /= 'index.html'
        mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'}
        route.fulfill(path=str(file), content_type=mime.get(file.suffix, 'text/plain'))

    ctx.route('https://app-lab.test/**', serve)
    ctx.add_init_script("""(() => {
      window.probe = {contexts: [], starts: [], compressors: 0, inPointer: false, turns: []};
      const Native = window.AudioContext;
      window.AudioContext = class extends Native {
        constructor(options) { super(options); probe.options = options; probe.contexts.push(this); }
        createDynamicsCompressor() { probe.compressors++; return super.createDynamicsCompressor(); }
        createOscillator() {
          const node = super.createOscillator(), start = node.start.bind(node);
          node.start = when => {
            probe.starts.push({inPointer: probe.inPointer, when, now: this.currentTime,
              readout: document.getElementById('notes').textContent,
              pressed: document.querySelectorAll('.pressed').length});
            return start(when);
          };
          return node;
        }
      };
      window.addEventListener('pointerdown', e => {
        if (e.target.closest('.note')) { probe.inPointer = true; probe.before = probe.starts.length; }
      }, true);
      window.addEventListener('pointerdown', () => {
        if (probe.inPointer) probe.turns.push(probe.starts.length - probe.before);
        probe.inPointer = false;
      });
    })()""")
    page = ctx.new_page()
    page.goto('https://app-lab.test/small-apps/celphonica/')
    assert page.evaluate('probe.contexts.length') == 0
    # A settings gesture prepares output without playing or allocating an oscillator.
    page.locator('#volume').click()
    page.wait_for_function('probe.contexts[0]?.state === "running"')
    assert page.evaluate('probe.starts.length') == 0
    assert page.evaluate('probe.options.latencyHint') == 'interactive'
    if page.evaluate('document.fullscreenEnabled'):
        page.locator('#fullscreen').click()
        page.wait_for_function('document.fullscreenElement !== null')
        page.locator('#fullscreen').click()
        page.wait_for_function('document.fullscreenElement === null')
        assert page.evaluate('probe.starts.length') == 0
    for _ in range(4):
        page.locator('.note').first.click()
    assert page.evaluate('probe.turns') == [1, 1, 1, 1], 'Running notes must start within pointerdown, before microtasks'
    starts = page.evaluate('probe.starts')
    assert all(s['inPointer'] and s['when'] <= s['now'] for s in starts), starts
    assert all(s['readout'] == 'Ready to play' and s['pressed'] == 0 for s in starts), starts
    assert page.evaluate('probe.compressors') == 0
    print('PASS: settings/fullscreen warmup is silent; fullscreen entry/exit; interactive context; repeated notes start synchronously before UI writes with no scheduling offset or compressor')

    # Render real production Synth code via an OfflineAudioContext adapter. The
    # adapter only supplies running/currentTime for deterministic scheduling;
    # oscillators, envelopes, filter, connections and master are production code.
    results = page.evaluate("""async () => {
      const { Synth } = await import('./synth.js');
      const Context = window.AudioContext;
      const results = [];
      function measure(buffer) {
        const data = buffer.getChannelData(0), rate = buffer.sampleRate;
        let peak = 0;
        for (let i = Math.floor(rate * .025); i < rate * .045; i++) peak = Math.max(peak, Math.abs(data[i]));
        const first = fraction => data.findIndex(x => Math.abs(x) > peak * fraction) / rate * 1000;
        let tailPeak = 0;
        for (let i = Math.floor(rate * .095); i < data.length; i++) tailPeak = Math.max(tailPeak, Math.abs(data[i]));
        return {onset10: first(.1), onset50: first(.5), peak, tailPeak};
      }
      for (const rate of [44100, 48000]) {
        for (const midi of [48, 69]) {
          const hz = 440 * 2 ** ((midi - 69) / 12);
          // Frozen v0.1 topology and isolated ablations, at the same pitch.
          for (const mode of ['direct', 'filter', 'attack8', 'compressor', 'legacy', 'production']) {
            const offline = new OfflineAudioContext(1, Math.ceil(rate * .12), rate);
            if (mode === 'production') {
              let time = 0;
              window.AudioContext = function () {
                return {state: 'running', get currentTime() { return time; },
                  destination: offline.destination, addEventListener() {},
                  createOscillator: offline.createOscillator.bind(offline),
                  createGain: offline.createGain.bind(offline),
                  createBiquadFilter: offline.createBiquadFilter.bind(offline)};
              };
              const synth = new Synth();
              await synth.unlock();
              synth.start(1, midi);
              time = .05;
              synth.stop(1);
            } else {
              const osc = offline.createOscillator(), envelope = offline.createGain();
              osc.frequency.value = hz;
              const amplitude = mode === 'legacy' ? .14 : .08;
              const attack = ['legacy', 'attack8'].includes(mode) ? .008 : 0;
              envelope.gain.setValueAtTime(attack ? 0 : amplitude, 0);
              if (attack) envelope.gain.linearRampToValueAtTime(amplitude, attack);
              let end = osc.connect(envelope);
              if (['filter', 'legacy'].includes(mode)) {
                const filter = offline.createBiquadFilter();
                filter.type = 'lowpass'; filter.Q.value = .7;
                filter.frequency.value = 150 * 120 ** .75;
                end = end.connect(filter);
              }
              const master = offline.createGain(); master.gain.value = .65;
              end = end.connect(master);
              if (['compressor', 'legacy'].includes(mode)) end = end.connect(offline.createDynamicsCompressor());
              end.connect(offline.destination);
              osc.start(0); osc.stop(.09);
            }
            results.push({rate, midi, mode, ...measure(await offline.startRendering())});
          }
        }
      }
      window.AudioContext = Context;
      return results;
    }""")
    for rate in (44100, 48000):
        for midi in (48, 69):
            r = {row['mode']: row for row in results if row['rate'] == rate and row['midi'] == midi}
            assert r['compressor']['onset10'] - r['direct']['onset10'] > 5, r
            assert r['filter']['onset10'] - r['direct']['onset10'] < .5, r
            assert r['attack8']['onset50'] > r['direct']['onset50'] + 2, r
            assert r['production']['onset10'] < 2 and r['production']['onset50'] < 3, r
            assert r['legacy']['onset10'] - r['production']['onset10'] > 5, r
            assert 0 < r['production']['peak'] < .06, r
            assert r['production']['tailPeak'] < .000001, r
    print('Offline onset milliseconds (relative to scheduled start; 10% / 50% of steady peak):')
    for row in results:
        print(f"  {row['rate']} Hz MIDI {row['midi']:2} {row['mode']:10} {row['onset10']:.3f} / {row['onset50']:.3f}")
    Path('/tmp/celphonica-latency.json').write_text(json.dumps(results, indent=2) + '\n')
    print('PASS: real offline sample rendering isolates filter/attack/compressor delay, faster production onset and silent release at both sample rates')
    assert not errors, errors
    browser.close()
