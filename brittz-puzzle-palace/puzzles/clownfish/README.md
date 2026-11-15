# Clownfish

Original geometric stained-glass reef composition for the v0.2 content system: a large right-facing orange-red clownfish with three buttery-yellow ribbons, outlined fins, turquoise/deep-blue water, purple anemones, green seaweed, orange coral, and bubbles.

The 1400 × 1000 rectangle contains exactly **45 playable pieces**: 19 fish/fin pieces, 14 water pieces, and 12 reef/anemone/seaweed pieces. Long contours have shared polygon subdivisions; each neighbor uses the same vertices in reverse order. Eye, smile, side fin, bubbles, and fin veins are attached circle decorations under the existing schema. Overlapping circles form decorative fin lines; none becomes an extra puzzle piece. No external images, scripts, or new rendering features are used.

`puzzle.json` is the source of truth for the board, reference image, and completion certificate. `thumbnail.svg` is generated with the existing `preview.mjs` tool. Its stable save identity is `clownfish`, version `1`.

Verification from the repository root:

```sh
node brittz-puzzle-palace/validate.mjs
node brittz-puzzle-palace/content.test.mjs
node brittz-puzzle-palace/engine.test.mjs
python brittz-puzzle-palace/check_clownfish.py
python brittz-puzzle-palace/check_collection.py
```

The Clownfish browser check assembles every piece through the existing line-rotation and circular-movement controls using desktop mouse and emulated touch. It also checks reference decorations, JPG certificate download, and completed-progress reload. Screenshots and exported certificates are saved under `/tmp/clownfish-*`. Physical Android touch ergonomics and download UI still require device testing.
