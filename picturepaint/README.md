# PicturePaint 1.0

A standalone, local browser painting studio. Launch `picturepaint/` from App Lab using a static HTTP server or GitHub Pages. No build, application dependencies, backend, account, API calls, or browser storage are required. All paths are relative and work below `/small-apps/`.

## Painting and navigation

Choose a library drawing or upload PNG/JPG/WebP line art. Images retain their aspect ratio and are never enlarged on import. Large images are reduced to at most 4,194,304 working pixels (2048 squared), with a 4096-pixel maximum side. Export uses these working dimensions, independent of viewport zoom.

Choose Solid or Gradient, set colors, and tap a closed shape. Gradient angles use screen coordinates: 0° points right, 90° down, 180° left, 270° up, and 360° right. The projected region bounding box determines the gradient extent. Each fill copies the tool settings, so later changes do not affect previous fills.

Pinch to zoom, drag with two fingers to pan, or use mouse wheel zoom. The desktop Hand button enables single-pointer dragging. Fit centers the image; changing the workspace size also fits it. Gestures that move more than seven screen pixels, include multiple pointers, or are cancelled cannot paint. Interaction uses Pointer Events and `touch-action: none` only on the workspace; the surrounding page can scroll normally.

Undo/Redo buttons and Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z restore up to 200 painting actions. Outline visibility is a separate display setting. Save a `.picturepaint` download to preserve an editable copy, including its embedded PNG, dimensions, segmentation settings, styles, gradients, and outline visibility. Open restores the painting with a fresh undo history. JPG exports use a white background, current outline visibility, and quality 0.9. The app warns before replacing or leaving unsaved edits; it does not autosave.

## Architecture

- `catalog.js`: library metadata, categories, distinct thumbnails and full-resolution PNG URLs. Full images load only after selection.
- `regions.js` / `region-worker.js`: threshold source luminance (including alpha), optionally dilate barriers by 0–3 working pixels to seal tiny gaps, then label four-connected regions using a typed-array queue in a Web Worker. Edge-connected regions are protected from painting. Detection never reads the color layer.
- `renderer.js`: independent original and paint canvases, masked solid/linear-gradient region rendering, white-background composition, and compact per-region style history. No full-image history snapshots. Each change keeps only the previous/next style and region ID; the shared region map uses four bytes per working pixel.
- `viewport.js`: CSS viewport transforms and inverse image-coordinate mapping; export does not use the viewport.
- `project.js`: versioned, validated, self-contained project JSON and local image/download helpers. Segmentation is deterministic and rebuilt from the embedded original/settings on open; region seed pixels restore fills. Failed imports preserve the previous painting.
- `app.js`: UI coordination, import/worker lifecycle, history controls, outline display, and export. A future photograph conversion module can provide a local line-art image to the same import/segmentation path.

Tolerance and gap settings lock while any regions are painted. Undoing all fills unlocks them; changing boundaries starts fresh history. This prevents existing paint from unexpectedly changing shape. Tiny gaps may be sealed, while larger open boundaries reaching an image edge receive a message and no paint. The exterior/background is intentionally protected, including when it would be a desired fill. Interior openings between shapes cannot always be inferred and may join them; inspect the drawing and adjust tolerance before painting. Thick barriers remain white when outlines are hidden; gap sealing can leave a narrow white margin inside visible lines and close very narrow regions. Set gap sealing to zero for fine artwork. Detection and the largest fill/export operations still consume transient memory; physical low-memory device performance needs checking.

## Drawing library and hibiscus asset

The included `drawings/hibiscus.png` is an original, CC0 botanical sample created for this implementation, with a separate 256-pixel thumbnail. **The user-supplied hibiscus drawing was not attached or present in the repository/workspace. This sample is not that supplied artwork.** Replace the two PNGs or add a new catalog entry when the supplied asset is available.

To add drawings, put a full-resolution PNG and a small PNG thumbnail in `drawings/`, then add `{id, title, category, thumbnail, source, description}` to `catalog.js`. Category labels appear on library cards and can support future grouping/filtering without changing the engine. Prefer black outlines on a white or transparent background and closed shapes with margins from the image edge. Upload/import uses the same engine as library art.

## Verification

From repository root, with Node, Python, Pillow, Playwright, and Chromium installed:

```sh
node picturepaint/test-engine.cjs
python picturepaint/test-browser.py
python tests/check_site.py
```

All passed in Chromium on the implementation branch. The browser suite uses the repository's local route interception convention; production has no test dependencies. It checks deferred full-resolution loading, the 2048-square library image, non-square uploads, antialiased curved/irregular neighbors, solid fills, gradients at 0/45/90/180/270/360°, retained region settings, zoomed filling, wheel/Hand navigation, undo/redo, outline display, JPG dimensions/appearance/white background, project round trips including hidden outlines, malformed project recovery, open-edge protection, 320/375/768/1024/1440 layouts, mobile tap/pinch/pan without painting or page scroll, and Pages navigation. Screenshots: `/tmp/picturepaint-desktop.png`, `/tmp/picturepaint-mobile.png`.

The pure engine suite checks neighboring and narrow regions, antialiased grayscale lines, open boundaries, and gap repair. The existing gallery/calculator suite passes at both domain root and `/small-apps/`, including original calculator blob hashes and no-JavaScript navigation. The PicturePaint browser suite also smoke-opens all nine existing apps. Existing Breakout, Falling Blocks, Synth Lab, LaserBreak, D::FUZE, DruMidi, and ChordMidi core/engine suites passed. Existing app directories and gallery CSS/JS are unchanged.

Still required on physical devices: iPad Safari and Android Chrome touch precision and gesture cancellation, portrait/landscape usability, large-image memory/responsiveness, native project/JPG downloads and reopening from Files, and long painting sessions. Mobile emulation does not establish physical-device performance or Safari compatibility. The supplied hibiscus asset also needs integration and a fill check when available.
