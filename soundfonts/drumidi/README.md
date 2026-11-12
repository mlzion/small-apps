# DruMidi.sf2 — acoustic GM drum kit

**47 notes (35–81), one acoustic kit, 16-bit mono PCM at the original 44.1 kHz.** This standalone asset uses the unchanged DruMidi MP3 samples. It does not modify or require the browser app.

## Download to Windows

[Download DruMidi.sf2](https://raw.githubusercontent.com/mlzion/small-apps/feat/drumidi-sf2-kit/soundfonts/drumidi/DruMidi.sf2). Save it to a permanent folder such as `Documents\SoundFonts\DruMidi.sf2`. Alternatively open [the file on GitHub](https://github.com/mlzion/small-apps/blob/feat/drumidi-sf2-kit/soundfonts/drumidi/DruMidi.sf2) and use **Download raw file**. No Python, FFmpeg, or build is needed to use it. Keep the adjacent [LICENSE.txt](LICENSE.txt) if redistributing the kit.

## Bertom SF2 Player in REAPER 7 / Windows 11

1. Install the Windows VST3 version of [Bertom SF2 Player](https://www.bertomaudio.com/sf2-player.html). Rescan REAPER's VST plug-ins if it does not appear.
2. Create an instrument track and insert **Bertom SF2 Player** in its FX chain.
3. Open `DruMidi.sf2` using the plug-in's SoundFont file chooser. Select **DruMidi GM Drums**, **bank 128, program 0**. If the player does not offer bank 128, select **DruMidi Compat**, **bank 0, program 0**. Some interfaces display program 0 as preset 1. Both names play the same kit and share the samples.
4. Put your drum MIDI on that track, or route the imported drum lane tracks to it. Use MIDI **channel 10**. For live playing, enable record monitoring and choose the MIDI input.
5. Start at a conservative track/plugin volume. No octave transposition is needed; use MIDI numbers because REAPER's octave labels are configurable.

| MIDI note | Drum |
| --- | --- |
| 36 | Kick (Bass Drum 1) |
| 38 | Acoustic snare |
| 42 / 44 / 46 | Closed / pedal / open hi-hat |
| 49 | Crash |
| 51 | Ride |

## Playback and compatibility

All decoded audio frames are retained. A **fixed 3 dB headroom reduction for the entire kit** prevents clipping of MP3 reconstruction overshoots (the source pedal hat reaches 1.123 full scale). This preserves waveform shape and relative levels; add 3 dB player/track gain if desired. There is no per-sample normalization, trimming, EQ, resampling, or added effect. Source tuning from `manifest.json` is encoded as SF2 tuning: note 35 is −106 cents, 36 is −6 cents, and toms 41/43/45/47/48/50 are −5 cents. These match DruMidi playback; root keys and single-note zones prevent unwanted keyboard transposition. Velocity controls volume, with the standard SF2 response; velocity-to-filter defaults are neutralized.

Samples do not loop. SF2 has no portable “ignore note-off” switch: its maximum standard release (about 101.6 seconds) allows short MIDI notes to ring, but the envelope can slightly alter tails after note-off. Holding notes through their natural sample duration gives the closest waveform. Hi-hats 42/44/46 share a **mutual** choke class; compliant players cut the previous hat when any new hat starts. This differs from DruMidi's one-way open-hat choke. Player interpolation, envelopes and MIDI controllers can affect the result. The MP3 source's lost detail cannot be recovered by PCM conversion.

Validated with **FluidSynth 2.4.4**: file loading, all 47 notes at three velocities, short-note crash tails, natural sample ending, both hat closers, and both preset banks. Rendered waveforms for the six required notes and every source-tuned note match pitch references (correlation > 0.9). Native Windows REAPER/Bertom playback has **not** been tested here. Bertom's official page describes near-complete SF2 2.04 support; this file uses the older SF2 2.01 feature set.

## Rebuild and verify

From the repository root, with Python 3.9+ and `ffmpeg`/`ffprobe` on PATH:

```sh
python soundfonts/drumidi/build.py
python soundfonts/drumidi/validate.py --samples drumidi/samples --render --report soundfonts/drumidi/validation-report.json
```

`--render` requires the FluidSynth shared library; omit it for structural/PCM validation only. `build.py` accepts `--samples PATH` and `--output PATH/DruMidi.sf2`. No Python packages are required. It verifies source SHA-256 hashes before decoding. The same FFmpeg version/input files produce identical output; different decoder versions may vary in PCM rounding. `build-report.json` records all note names, tuning, frame counts, hashes and decoder version; `validation-report.json` records verification results.

Samples and WebAudioFont data packaging are MIT licensed: full notices are in `LICENSE.txt` and embedded in SF2 comments. [Original provenance](../../drumidi/samples/SOURCE.md). No WebAudioFont GPL player code or Debian packaging is bundled. SoundFont is a trademark of E-mu Systems.
