# Falling Blocks

An original, self-contained falling-block puzzle for App Lab. Open `falling-blocks/` on a static server; relative URLs also work at `/small-apps/falling-blocks/`. HTML, CSS, vanilla JavaScript, and an original SVG preview; no libraries, external assets, or build step.

Use Left/Right or A/D to move, Up/X to rotate clockwise, Z counterclockwise, Down/S for soft drop, Space for hard drop, and P/Escape to pause. Large pointer controls support taps and holding left/right/down. Pause, resume, restart, and optional sound have dedicated buttons. Losing window focus or hiding the tab pauses play. Sound starts muted and uses original short Web Audio oscillator tones.

The 10 × 20 board uses seven four-cell shapes, a shuffled seven-piece bag, horizontal/upward rotation adjustments, next-piece preview, and an outlined landing indicator. Pieces lock on a blocked gravity/soft-drop step or immediately on hard drop. Full rows score 100/300/500/800 × current level; soft/hard drops score 1/2 per cell. Every ten cleared rows increases the level. Gravity starts at 850 ms and speeds up to a minimum 80 ms. A blocked spawn ends the game.

`engine.js` contains the independent rules; `game.js` handles Canvas, input, audio, and UI. All code and visual assets were created for this game; no commercial branding, artwork, music, or source code is used.

Run from the repository root:

```sh
node falling-blocks/test-engine.cjs
python falling-blocks/test-browser.py
node breakout/test-engine.cjs
python breakout/test-browser.py
python tests/check_site.py
```

Browser tests require development-only Python Playwright and `/usr/bin/chromium`. They test both root and GitHub Pages paths locally, keyboard input, mobile touch taps/holds/releases, responsive sizes, pause/restart, audio initialization/mute, and deterministic scoring/game-over scenarios. Screenshots are saved to `/tmp/falling-blocks-desktop.png` and `/tmp/falling-blocks-mobile.png`. Physical phones, audible output, Safari/Firefox, and a live GitHub Pages deployment require manual verification.
