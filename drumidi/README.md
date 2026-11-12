# DruMidi — Phase 1.1

A static, portrait-first acoustic drum sketchpad for App Lab. Launch `drumidi/` from the gallery. Serve the repository using any static HTTP server; there is no build, runtime dependency, account, or external audio service. Relative paths support both `/drumidi/` and GitHub Pages `/small-apps/drumidi/`.

## Patterns and beat entry

P1–P16 share one configurable GM percussion list. Each has 1–4 bars in 4/4 and a selectable color. Tap the compact pattern selector to choose one of sixteen slots. Select a drum/eighth-note cell, then toggle its eight 64th-note subdivisions below the grid. Blue dots show activity; small counts show multiple hits. Green subdivision buttons indicate notes. Bar tabs and arrows navigate the selected pattern. Only the drum rows scroll; subdivisions and the bottom transport remain visible.

Long press the current pattern selector, a pattern in its picker, or a library block to open pattern actions. The adjacent **⋯** button provides the same actions without long press (keyboard and screen-reader accessible). The arrangement library has its own **⋯** for the selected library pattern.

- **Copy** snapshots the complete pattern, including its length, notes and velocities. Subsequent source edits do not change the clipboard.
- **Paste** replaces the destination pattern's contents and length, retaining the destination ID, color and arrangement references. It validates every existing clip before asking for replacement confirmation. A paste that creates overlap or extends a clip past the timeline is rejected without changing the session.
- **Clear** confirms before removing every note, including hidden bars. Length, color and references remain.
- **Change Color** opens a compact named palette: blue, orange, green, purple, yellow, pink, teal and red. The selector, pattern picker, library blocks and all referenced arrangement clips use the stored color. Text labels keep patterns identifiable independently of color.

The copy clipboard lasts while the page remains open and is cleared on reload or project load/new. It is not part of a project file. Color choices and all pattern contents are saved in the project.

Add Drum offers the remaining General MIDI percussion notes, 35–81. Initial rows include acoustic kick, snare, closed/open hats, ride, three toms, and crash. New kicks/snares default to velocity 106, hats/ride to 78, and other instruments to 94. Each note stores its own velocity. Reducing a pattern's length retains hidden notes for later; hidden bars do not play or export. Length changes that invalidate arrangement clips are rejected.

## Global drum muting

Tap a drum's icon/name to toggle its global mute. A muted drum has a dimmed label/icon, a **MUTE** badge, and a pressed state announced by assistive technology. This does not change the selected grid cell or subdivision group. Editing notes continues normally while muted.

Mutes apply to all sixteen patterns and all three lanes. They take effect while playing without resetting the loop: active and already-scheduled sources for the drum stop immediately, and future hits are skipped. Unmuting restores future hits at their original positions. Note positions/velocities remain intact. Muted instruments are excluded from both pattern and arrangement MIDI exports and from the audible rhythm visualization. Mute states survive automatic saves and JSON downloads/imports. Old projects migrate with every drum unmuted.

## Arrangement and transport

The timeline is 1–8 bars, with independent **A — Backbone**, **B — Fills**, and **C — Cymbals/Percussion** lanes. All lanes accept any pattern and play simultaneously. Drag copies from the library to whole bars, or tap a library pattern and then an empty bar. Each clip spans the pattern's actual length. Clips on the same lane cannot overlap or extend past the timeline; gaps remain silent. Clips on different lanes may overlap freely.

Drag an existing clip to move it. Tap, long press, or right-click a clip for explicit Move, Copy, and Delete actions, with lane/start-bar selectors. Every instance references the stored pattern, so editing or pasting updates all instances.

The single **Start/Stop** button applies to the active page. Start always begins at the start of the selected pattern or arrangement; playback loops automatically. Stop immediately ends all active/scheduled sources and resets the playhead. Stop also cancels playback waiting for sample initialization. There is no Pause/resume. Switching pages/patterns, changing composition data, or hiding the browser tab stops/reset playback. BPM changes restart a playing loop at the new tempo. Muting is the exception: it updates live without a restart.

The visualization retains faint 64th timing lines, a fixed red playhead, scrolling dots and A/B/C lane markers. One bar spans its width; loop boundaries wrap. It is not an editor.

## Sound and licensing

Native Web Audio plays the same **FluidR3 GM standard acoustic kit** as Phase 1. The AudioContext is created and resumed from Start. Active instruments are fetched and decoded before playback; newly added instruments load on the next Start. Velocity controls sample gain. Closed/pedal hats choke open hats.

The existing scheduler runs every 25 ms, scheduling 120 ms ahead using absolute AudioContext times. A 64th is `60 / BPM / 16` seconds. Graphics do not drive note timing. Stale events after a long foreground stall are skipped rather than emitted in a burst. Muting filters sources at scheduling time and cancels sources already in the lookahead window.

FluidR3 is MIT licensed. The separate WebAudioFont **data repository is MIT licensed**; the 47 bundled MP3s are unmodified extracted FluidR3 payloads, about 1 MB total. Its GPL player is not used. Original notices remain in [samples/LICENSE.txt](samples/LICENSE.txt); [samples/SOURCE.md](samples/SOURCE.md) records the immutable upstream commit and extraction/tuning recipe; [samples/manifest.json](samples/manifest.json) records SHA-256 hashes. Phase 1.1 does not change these assets. No samples are embedded in MIDI.

## Project compatibility and MIDI

Project settings provides **Save Project**, **Load Project**, and **New Project**. Every edit automatically saves under the existing `app-lab-drumidi-v1` localStorage key to find old sessions. New data uses `format: "drumidi"`, **version 2**. The JSON contains BPM, sixteen patterns/lengths/colors/notes/velocities, drum assignments/default velocities/mutes, timeline length, and clips on three lanes. Notes use integer `step` positions 0–255, in 64ths; clip starts use zero-based bars.

Version 1 projects (eight patterns/two lanes) are validated and automatically migrated on localStorage restore and JSON import. Their original patterns, notes, velocities, lengths, instruments, clips, BPM and timeline remain intact; P9–P16 and Lane C start empty, default colors are assigned, and instruments start unmuted. The migrated local session is written back as v2. JSON imports/new projects require replacement confirmation. Malformed versions, counts, colors, mute types, drum references, duplicate notes/clip IDs, overlap, and bounds are rejected without replacing the existing session. Files over 32 MB are rejected. Storage failures leave manual JSON downloads available.

MIDI remains Standard MIDI File **type 1**, **960 PPQ**, percussion **channel 10**. A pattern export includes the conductor and selected-pattern track. Arrangement export always includes **four tracks**: conductor (tempo and 4/4), Lane A, Lane B, and Lane C, including empty lanes. A 64th is exactly **60 ticks**; note-offs follow 30 ticks later. Simultaneous events, individual velocities, silent gaps, complete end-of-track lengths, and all unmuted note mappings are preserved. The DAW supplies its own percussion instrument.

## Verification

From the repository root:

```sh
node drumidi/test-core.cjs
node drumidi/test-audio.cjs
python drumidi/test-browser.py
python tests/check_site.py
```

Browser checks require Python Playwright and Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`). A local HTTPS origin serves real repository files and samples through route interception.

Core tests independently decode MIDI to check 64ths, simultaneous notes, velocity, tempo, channel, all three percussion tracks and conductor, gaps and loop lengths. They cover all sixteen slots, project migration/roundtrip/validation, independent copies, transactional paste and clip constraints, destination color retention, muted MIDI, preserved notes, and all 47 asset hashes. Audio clock tests cover loop seams, restart/reset, live mutes and cancellation, velocity/tuning, hat choking, and stall recovery.

The browser workflow covers four-bar editing and mixed lengths; all sixteen selectors; colors and referenced clips; pattern copy/paste/clear with accept/cancel; blocked paste; mobile long press on selector/picker/library; three-lane playback; desktop clip dragging and touch actions; actual full looping/64ths/gain; Start/Stop/page reset; MIDI and JSON downloads; v1 migration from storage and files; v2 color/mute roundtrip; refresh; live mute/unmute; audio/storage errors; six widths from 320–1440; and both hosting roots. Screenshots are written to `/tmp/drumidi-*.png`. Existing gallery/calculator checks remain unchanged.

## Limits

4/4 only, 1–4 bar patterns, three lanes, 1–8 bar arrangement, integer BPM 30–300, and one kit with velocity-sensitive gain from a single sample layer. No whole-song arrangement, undo, velocity-curve UI, audio export, MIDI import, or offline service worker. Composition edits stop playback; mutes update live. Physical Android listening and importing into a running REAPER instance remain manual acceptance checks; touch is emulated in Chromium and MIDI is independently decoded in tests.
