# Breakout

Open `breakout/` through a static server. All assets use relative paths, including GitHub Pages at `/small-apps/breakout/`. No build step or runtime dependencies.

- Start prepares a new game; Launch ball or Space serves. Space also pauses/resumes. Restart resets score, level, and all three lives.
- Move with Left/Right, A/D, mouse, or a touch drag on the playfield. Leaving the tab pauses play.
- Each row scores 50, 40, 30, 20, or 10 points per brick. Clearing the board prepares the next level. Speed starts at 300 logical pixels/second, rises by 35 per level, and caps at 720 for playability.
- Sound uses short, quiet Web Audio tones, unlocked by user interaction. Mute is session-local.

`engine.js` owns state, level generation, and substepped circle collision physics in an 800×560 logical world. `game.js` owns input, audio, Canvas rendering, UI, and pixel-density-aware resizing. `styles.css` handles responsive layout. Change level speed, brick arrangement, or paddle size in the engine.

Run checks from the repository root:

```sh
node breakout/test-engine.cjs
python breakout/test-browser.py
python tests/check_site.py
```

Browser checks require Python Playwright and `/usr/bin/chromium`. They emulate mobile touch using Chromium's touch protocol and check GitHub Pages URL resolution locally. Physical mobile devices, audible output, and a live GitHub Pages deployment still require manual verification.
