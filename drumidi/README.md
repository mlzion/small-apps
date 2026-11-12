# DruMidi — Phase 1.4

A static, portrait-first acoustic drum sketchpad for App Lab. Launch `drumidi/` from the gallery. Serve the repository using any static HTTP server; there is no build, runtime dependency, account, or external audio service. Relative paths support both `/drumidi/` and GitHub Pages `/small-apps/drumidi/`.

## Patterns and beat entry

P1–P16 share one configurable GM percussion list. Each has 1–4 bars in 4/4 and a selectable color. New and unassigned patterns use **Light Gray**. Tap the compact pattern selector to choose one of sixteen slots. Select a drum/eighth-note cell, then toggle its eight 64th-note subdivisions below the grid. Blue dots show activity; small counts show multiple hits. Green subdivision buttons indicate notes. Bar tabs and arrows navigate the selected pattern. Only the drum rows scroll; subdivisions and the bottom transport remain visible.

Long press the current pattern selector, a pattern in its picker, or an Arrangement library block to open Copy, Paste, Delete and Change Color. Desktop users can right-click; keyboard users can focus a pattern and press **Shift+F10** or the context-menu key. The redundant ellipsis buttons have been removed. Normal taps/clicks still select patterns or open the picker; scrolling/dragging cancels a pending long press.

- **Copy** snapshots the complete pattern, including its **color**, length, notes and velocities. Subsequent source edits do not change the clipboard.
- **Paste** is enabled only when a copied pattern is available and the destination contains **zero notes**, regardless of its length. Muted notes and notes in hidden bars count as notes. Populated destinations disable Paste and explain that Delete must be used first. Paste replaces the contents, length **and color with the copied source values**, retaining the destination ID and arrangement clips. Selectors and referenced clips update immediately. Every clip is revalidated before confirmation; overlaps or invalid boundaries reject the paste without changing the session.
- **Delete** removes every note (including hidden bars) and resets the pattern to **one bar**. Its ID and all arrangement clips remain; its color resets to **Light Gray**. Confirmation is required if the pattern contains notes **or** is referenced by any clip, even if already empty; an empty, unreferenced pattern resets without a prompt. The complete arrangement is revalidated before applying the change; invalid placement rejects the operation without changing the session.
- **Change Color** opens a compact named palette: light gray, blue, orange, green, purple, yellow, pink, teal and red. The selector, pattern picker, library blocks and all referenced arrangement clips use the stored color. Text labels keep patterns identifiable independently of color.

Gray means empty or not assigned a custom color; notes can be entered without assigning a color. Explicit colors are displayed by the Pattern selector, picker, Arrangement strip and all clip instances. Existing stored colors are preserved on import/restore, even for empty patterns; earlier files do not distinguish automatic colors from user choices. Missing, null or empty color fields normalize to gray without a project version change. Copy snapshots include color; Paste now restores the copied color instead of keeping the destination color.

The copy clipboard lasts while the page remains open and is cleared on reload or project load/new. It is not part of a project file. Color choices and all pattern contents are saved in the project.

Add Drum offers the remaining General MIDI percussion notes, 35–81. Initial rows include acoustic kick, snare, closed/open hats, ride, three toms, and crash. New kicks/snares default to velocity 106, hats/ride to 78, and other instruments to 94. Each note stores its own velocity. Reducing a pattern's length retains hidden notes for later; hidden bars do not play or export. Length changes that invalidate arrangement clips are rejected.

## Velocity Editor

The top navigation is **Pattern**, **Velocity**, and **Arrangement**. Velocity has its own Pattern (P1–P16) and Drum selectors. The drum list contains only instruments with stored notes in the chosen pattern, including muted instruments. There is no need to return to Pattern to select another instrument or pattern.

The graph spans the complete selected pattern (1–4 bars). Blue dots/stems show existing hit positions and stored velocities at exact 64th positions; vertical labels span 1–127. The lighter curve passes through three large draggable points:

- Left: vertical movement only, starting velocity.
- Middle: horizontal and vertical movement, shaping the two sides.
- Right: vertical movement only, ending velocity.

The curve is a C1 piecewise cubic Hermite interpolant with a harmonic middle slope. It passes through all three points, remains smooth at the middle and does not overshoot the velocity range. It has no Bézier tangent handles. Dragging writes rounded integer velocities to existing active-bar notes for the selected drum only; it never creates, deletes, reorders, or moves notes. Values between the selected drum's hits affect the visual guide only. Endpoint values apply at the pattern's start/end boundaries; the last 64th lies just before the end boundary.

All three handles have 44 px touch targets. Pointer capture keeps a drag active outside a handle, and `touch-action: none` prevents scrolling on the graph. Keyboard users can focus each handle: Up/Down changes velocity, Home/End sets 1/127, and Left/Right moves the middle point in time. Shift increases the step. The middle point stays far enough from either end to keep touch targets usable.

Start previews the **entire selected pattern**, including the other drums, in a loop. Curve editing and Reset keep the clock running but **do not alter the playing velocities or active/queued gains**. Start captures a deep copy of event velocities and repeats that snapshot until playback stops. Stop and Start again to hear edits. Project values, JSON and MIDI export update immediately, even while the old snapshot is playing. The editor continues to show edited values; the footer visualization uses the audible snapshot during playback. Changing drums preserves playback. Changing the Velocity pattern selector automatically starts that pattern from the beginning, including when previously stopped. Top-level tab changes retain the existing Stop/reset behavior. The moving red graph playhead follows the same AudioContext clock as sound.

**Reset to Default** sets only that drum's notes in that pattern to **100**, including retained notes in hidden bars. Curve dragging edits only hits in active bars; notes beyond a temporarily shortened pattern are not silently changed. The footer reports hidden-bar notes if present. An empty pattern has a disabled drum selector and Reset; hidden-only instruments can still be reset.

Velocities autosave through the existing project/localStorage system and remain editable in Pattern, shared arrangement references, JSON projects and MIDI exports. There is no Apply or Undo. Control-point guides are cached while the page is open; after reload or project load they are estimated from stored note velocities. Loading/selecting a graph never changes those velocities until a handle is moved or Reset is used. A three-point guide cannot exactly describe an arbitrary existing velocity sequence, so the note dots always show the saved values. No new project-format version is required.

## Global drum muting

Tap a drum's icon/name to toggle its global mute. A muted drum has a dimmed label/icon, a **MUTE** badge, and a pressed state announced by assistive technology. This does not change the selected grid cell or subdivision group. Editing notes continues normally while muted.

Mutes apply to all sixteen patterns and all three lanes. They take effect while playing without resetting the loop: active and already-scheduled sources for the drum stop immediately, and future hits are skipped. Unmuting restores future hits at their original positions. Note positions/velocities remain intact. Muted instruments are excluded from both pattern and arrangement MIDI exports and from the audible rhythm visualization. Mute states survive automatic saves and JSON downloads/imports. Old projects migrate with every drum unmuted.

## Arrangement and transport

The pattern library is a **single horizontal, touch-scrollable P1–P16 strip**. Swipe to reach later patterns; selection preserves scroll position and does not rebuild the timeline.

The timeline is 1–8 bars, with independent **A — Backbone**, **B — Cymbals**, and **C — Fills** lanes. All lanes accept any pattern or drum instrument and play simultaneously. These are label changes only: existing lane arrays, clip IDs/positions and MIDI track order are never swapped. Drag copies from the library to whole bars, or tap a library pattern and then an empty bar. Each clip spans the pattern's actual length. Clips on the same lane cannot overlap or extend past the timeline; gaps remain silent. Clips on different lanes may overlap freely. Each whole-bar drop area is a fixed **56×56 px square**, with a 52 px high clip inside it. Two bars span two columns plus the existing gap; musical duration and snapping are unchanged. Reduced spacing and the single-row library let all three lanes fit vertically on tested portrait sizes from 320×740 upward. The timeline still scrolls horizontally to maintain usable whole-bar targets. Shorter screens, zoom and long status messages can require vertical scrolling.

Drag an existing clip to move it. Tap, long press, or right-click a clip for explicit Move, Copy, and Delete actions, with lane/start-bar selectors. Every instance references the stored pattern, so editing or pasting updates all instances.

The single **Start/Stop** button applies to the active page. Start always begins at the start of the selected pattern or arrangement; playback loops automatically. Stop immediately ends all active/scheduled sources and resets the playhead. Stop also cancels playback waiting for sample initialization. There is no Pause/resume. Switching pages/patterns, changing composition data, or hiding the browser tab stops/reset playback. BPM changes restart a playing loop at the new tempo. Muting remains live. Velocity editing preserves playback but waits for the next Stop/Start to change what is heard.

The visualization retains faint 64th timing lines, a fixed red playhead, scrolling dots and A/B/C lane markers. One bar spans its width; loop boundaries wrap. It is not an editor.

## Fullscreen and Project Name

The small header button toggles the document through the browser's Fullscreen API. Fullscreen is **never** entered automatically. It survives Pattern/Velocity/Arrangement tab switches and includes settings and clip dialogs. The toggle or the browser's normal exit command restores the normal layout; returning through **Back to App Lab** explicitly exits fullscreen before navigating. Unsupported browsers show a disabled button with an explanation, and denied requests produce a status message. Browser policies and mobile support can vary; native Android UI behavior still warrants a physical-device check.

Project Settings has an editable **Project Name**, saved immediately without interrupting playback. New projects and unnamed localStorage sessions use **DruMidi Project**. Version 1/2 JSON imports with no stored name use the imported filename without its final `.json` extension (case-insensitive); a stored name takes precedence. Normalization is written back to localStorage. New Project resets the name. Name metadata does not require a format-version bump; existing pattern, mute and arrangement data remain intact.

Downloads use the stored project name:

| Action, name `Rock Beat 1` | Download |
| --- | --- |
| Save Project | `Rock Beat 1.json` |
| Arrangement MIDI | `Rock Beat 1.mid` |
| Pattern or Velocity export for P3 | `Rock Beat 1-P3.mid` |

Stored names can contain characters that are unsuitable for Windows filenames. Downloads replace forbidden characters/control codes with underscores, remove trailing spaces/dots, prefix reserved device names (for example `CON` → `_CON`), and limit the filename stem to 200 UTF-16 units without splitting Unicode characters. The stored name is retained independently of filename sanitization. Names are trimmed and limited to 1024 characters; blank names fall back to the default.

## Sound and licensing

Native Web Audio plays the same **FluidR3 GM standard acoustic kit** as Phase 1. The AudioContext is created and resumed from Start. Active instruments are fetched and decoded before playback; newly added instruments load on the next Start. Velocity controls sample gain. Closed/pedal hats choke open hats.

The existing scheduler runs every 25 ms, scheduling 120 ms ahead using absolute AudioContext times. A 64th is `60 / BPM / 16` seconds. Graphics do not drive note timing. Stale events after a long foreground stall are skipped rather than emitted in a burst. Muting filters sources at scheduling time and cancels sources already in the lookahead window.

FluidR3 is MIT licensed. The separate WebAudioFont **data repository is MIT licensed**; the 47 bundled MP3s are unmodified extracted FluidR3 payloads, about 1 MB total. Its GPL player is not used. Original notices remain in [samples/LICENSE.txt](samples/LICENSE.txt); [samples/SOURCE.md](samples/SOURCE.md) records the immutable upstream commit and extraction/tuning recipe; [samples/manifest.json](samples/manifest.json) records SHA-256 hashes. Phase 1.4 does not change these assets. No samples are embedded in MIDI.

## Project compatibility and MIDI

Project settings provides **Save Project**, **Load Project**, and **New Project**. Every edit automatically saves under the existing `app-lab-drumidi-v1` localStorage key to find old sessions. New data uses `format: "drumidi"`, **version 2**. The JSON contains the project name, BPM, sixteen patterns/lengths/colors/notes/velocities, drum assignments/default velocities/mutes, timeline length, and clips on three lanes. Notes use integer `step` positions 0–255, in 64ths; clip starts use zero-based bars.

Version 1 projects (eight patterns/two lanes) are validated and automatically migrated on localStorage restore and JSON import. Their original patterns, notes, velocities, lengths, instruments, clips, BPM and timeline remain intact; P9–P16 and Lane C start empty, missing colors default to light gray, and instruments start unmuted. The migrated local session is written back as v2. JSON imports/new projects require replacement confirmation. Malformed versions, counts, colors, mute types, drum references, duplicate notes/clip IDs, overlap, and bounds are rejected without replacing the existing session. Files over 32 MB are rejected. Storage failures leave manual JSON downloads available.

MIDI remains Standard MIDI File **type 1**, **960 PPQ**, percussion **channel 10**. Pattern and Velocity exports include the conductor and the entire selected-pattern track (all unmuted drums). Arrangement export always includes **four tracks**: conductor (tempo and 4/4), Lane A, Lane B, and Lane C, including empty lanes. A 64th is exactly **60 ticks**; note-offs follow 30 ticks later. Simultaneous events, individual velocities, silent gaps, complete end-of-track lengths, and all unmuted note mappings are preserved. The DAW supplies its own percussion instrument.

## Verification

From the repository root:

```sh
node drumidi/test-core.cjs
node drumidi/test-audio.cjs
node drumidi/test-velocity.cjs
python drumidi/test-velocity-browser.py
python drumidi/test-layout-browser.py
python drumidi/test-interface-browser.py
python drumidi/test-browser.py
python tests/check_site.py
```

Browser checks require Python Playwright and Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`). A local HTTPS origin serves real repository files and samples through route interception.

Core tests independently decode MIDI to check 64ths, simultaneous notes, velocity, tempo, channel, all three percussion tracks and conductor, gaps and loop lengths. They cover all sixteen slots, project migration/roundtrip/validation, independent copies, transactional paste and clip constraints, copied source color retention, muted MIDI, preserved notes, and all 47 asset hashes. Audio clock tests cover loop seams, restart/reset, live mutes and cancellation, velocity/tuning, hat choking, and stall recovery.

The browser workflow covers four-bar editing and mixed lengths; all sixteen selectors; colors and referenced clips; empty-only paste; pattern deletion/reset with conditional accept/cancel; retained clip references; blocked paste; mobile long press on selector/picker/library; three-lane playback; desktop clip dragging and touch actions; actual full looping/64ths/gain; Start/Stop/page reset; MIDI and JSON downloads; v1 migration from storage and files; v2 color/mute roundtrip; refresh; live mute/unmute; audio/storage errors; six widths from 320–1440; and both hosting roots. Screenshots are written to `/tmp/drumidi-*.png`. Existing gallery/calculator checks remain unchanged.

Velocity model tests check interpolation through each control point, C1 continuity, bounded monotone segments, all four pattern lengths and 64th positions, unchanged note counts/timing/other drums and patterns, Reset 100, persistence, and Velocity MIDI equivalence. The audio suite also verifies unchanged queued/active gains and old velocities across loop repeats, then edited velocities after Stop/Start. `test-velocity-browser.py` checks mouse, real touch events and keyboard interaction, no-scroll/cancellation, editing while hearing a frozen snapshot, restart behavior, independent selectors, automatic pattern restart, empty patterns, reset, reload, independently parsed downloaded MIDI, and six portrait/desktop widths. Velocity screenshots use `/tmp/drumidi-velocity-*.png`.

## Playback and rendering work

Phase 1.3 removes the edit-time audio event/source traversal and gain automation. The audio scheduler still pumps every 25 ms with 120 ms lookahead, and graphics never drive timing. The velocity curve/notes canvas redraws only after edits, selection changes or resize; a lightweight DOM playhead moves independently. The footer runs at up to 30 fps while playing and reads only visible step buckets (roughly one bar), with drum rows prepared outside the frame loop. When stopped, rendering is invalidation-driven with no continuous animation. A ResizeObserver refreshes resized canvases.

`test-layout-browser.py` verifies a real horizontal touch swipe to P16, assigned/gray/deleted colors, unchanged bar spans and touch clip movement, all three lanes fitting on five phone/desktop layouts, fixed velocities and gains across repeated loops, new velocities after restart, immediate MIDI/JSON exports, persistence/import, cached graph draws, bounded footer frame counts, and zero idle canvas redraws. Screenshots use `/tmp/drumidi-layout-*.png`. The checks identify and guard avoidable rendering/audio-update work; they are not a physical Android performance certification. Saving the complete project to localStorage remains synchronous to preserve immediate persistence.

`test-interface-browser.py` covers native Fullscreen API entry/exit, external exit, tab/dialog persistence and explicit gallery exit at both hosting roots; unsupported and denied requests; project-name persistence/defaults, legacy JSON filename and localStorage naming, Windows-safe exports; source-color paste into referenced patterns with immediate selector/clip updates; right-click/long-press actions without ellipses; unchanged lane arrays and MIDI track order with renamed labels; square drop cells and portrait fit at six sizes. Screenshots use `/tmp/drumidi-interface-*.png`.

## Limits

4/4 only, 1–4 bar patterns, three lanes, 1–8 bar arrangement, integer BPM 30–300, and one kit with velocity-sensitive gain from a single sample layer. No whole-song arrangement, undo, per-note velocity bars, audio export, MIDI import, or offline service worker. The Velocity curve operates on the selected drum across the active pattern, not a selected eighth-note group. Pattern/arrangement composition edits stop playback; mutes update live and velocity edits wait for a playback restart. Physical Android listening and importing into a running REAPER instance remain manual acceptance checks; touch is emulated in Chromium and MIDI is independently decoded in tests.
