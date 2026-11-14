# Browser checks

With Python, Playwright, and Chromium installed, run from the repository root:

```sh
python tests/check_site.py
```

Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. For a fresh development environment, install the Python `playwright` package and Chromium first. These tools are only for testing; the deployed website has no dependencies.

The test routes a reserved `.test` origin to the local repository through Playwright, without external network requests or a running server. It checks browser URL resolution at `/` and `/small-apps/`, all local assets, the calculator launch link, planned cards without launch controls, JavaScript errors, and the gallery with JavaScript disabled. It verifies one, two, and three columns and horizontal overflow at widths 320, 375, 640, 768, 1000, 1024, and 1440 pixels. Screenshots are written to `/tmp/app-lab-desktop.png` and `/tmp/app-lab-mobile.png` for visual inspection.

Calculator regression checks cover arithmetic, sequential operations, replacing operators, starting or continuing after results, decimals, precision, backspace, clearing, input limits, divide-by-zero messaging and recovery, and both mouse and keyboard controls. Original calculator Git blob hashes are checked to ensure all four existing files are unchanged.

Synth Lab audio, lesson, keyboard, touch, and display checks are documented in [synth-lab/README.md](../synth-lab/README.md). LaserBreak brings the gallery to ten cards and seven launch links. Its engine and mobile landscape checks are documented in [laserbreak/README.md](../laserbreak/README.md).

DruMidi brings the gallery to eleven cards and eight launch links. See [drumidi/README.md](../drumidi/README.md) for pattern, arrangement, audio, MIDI, persistence, and portrait touch workflow checks.

ChordMidi brings the gallery to twelve cards and nine launch links. See [chordmidi/README.md](../chordmidi/README.md) for music-model, real-SF2 audio, gesture, MIDI, persistence and portrait checks.

PicturePaint makes ten gallery launch links. See [picturepaint/README.md](../picturepaint/README.md) for region detection, gradient/export/project round trips, mobile gesture automation, existing-app smoke checks, and outstanding physical-device checks.

Galactix makes eleven gallery launch links, with MIDI Lab the only planned card. See [space-shooter/README.md](../space-shooter/README.md) for simulation and input lifecycle checks plus the outstanding portrait-phone checks.
