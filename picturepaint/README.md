# PicturePaint 1.2

A standalone, local browser painting studio. Launch `picturepaint/` from App Lab using a static HTTP server or GitHub Pages. No build, application dependencies, backend, account, API calls, or browser storage are required. All paths are relative and work below `/small-apps/`.

## Painting and navigation

Choose a library drawing or upload PNG/JPG/WebP line art. Images retain their aspect ratio and are never enlarged on import. Large images are reduced to at most 4,194,304 working pixels (2048 squared), with a 4096-pixel maximum side. Export uses these working dimensions, independent of viewport zoom.

Choose Solid or Gradient, set colors, and tap a region. See Smart Palette below for shade controls. Gradient angles use screen coordinates: 0° points right, 90° down, 180° left, 270° up, and 360° right. The projected region bounding box determines the gradient extent. Each fill copies the tool settings, so later changes do not affect previous fills.

Pinch to zoom, drag with two fingers to pan, or use mouse wheel zoom. The desktop Hand button enables single-pointer dragging. Fit centers the image; changing the workspace size also fits it. Gestures that move more than seven screen pixels, include multiple pointers, or are cancelled cannot paint. Interaction uses Pointer Events and `touch-action: none` only on the workspace; the surrounding page can scroll normally.

Undo/Redo buttons and Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z restore up to 200 painting actions. Outline visibility is a separate display setting. Save a `.picturepaint` download to preserve an editable copy, including its embedded PNG, dimensions, segmentation settings, styles, gradients, and outline visibility. Open restores the painting with a fresh undo history. JPG exports use a white background, current outline visibility, and quality 0.9. The app warns before replacing or leaving unsaved edits; it does not autosave.

## Architecture

- `catalog.js`: library metadata, categories, distinct thumbnails and full-resolution PNG URLs. Full images load only after selection.
- `regions.js` / `region-worker.js`: threshold source luminance (including alpha), optionally dilate barriers by 0–3 working pixels to seal tiny gaps, then label four-connected regions using a typed-array queue in a Web Worker. The rectangular image boundary encloses edge-connected regions; every valid region can be painted on explicit tap. Detection never reads the color layer.
- `renderer.js`: independent original and paint canvases, masked solid/linear-gradient region rendering, white-background composition, and compact per-region style history. No full-image history snapshots. Each change keeps only the previous/next style and region ID; the shared region map uses four bytes per working pixel.
- `viewport.js`: CSS viewport transforms and inverse image-coordinate mapping; export does not use the viewport.
- `palette.js`: twelve vibrant swatches, RGB shade interpolation, active color targets, artwork-derived Used Colors, native vertical range and validated/migrated optional project metadata.
- `project.js`: versioned, validated, self-contained project JSON and local image/download helpers. Segmentation is deterministic and rebuilt from the embedded original/settings on open; region seed pixels restore fills. Failed imports preserve the previous painting.
- `app.js`: UI coordination, import/worker lifecycle, history controls, outline display, and export. A future photograph conversion module can provide a local line-art image to the same import/segmentation path.

Tolerance and gap settings lock while any regions are painted. Undoing all fills unlocks them; changing boundaries starts fresh history. This prevents existing paint from unexpectedly changing shape. Tiny gaps may be sealed. Openings between shapes can join them into one fill region; inspect the drawing and adjust tolerance before painting. Sky, river, field, exterior and other edge-connected regions are paintable, with the rectangular image boundary acting as an enclosing wall. Imports never auto-paint the background, and fills cannot extend outside the working image. Thick barriers remain white when outlines are hidden; gap sealing can leave a narrow white margin inside visible lines and close very narrow regions. Set gap sealing to zero for fine artwork. Detection and the largest fill/export operations still consume transient memory; physical low-memory device performance needs checking.

## Drawing library and hibiscus asset

The included `drawings/hibiscus.png` is the user-supplied `2477.jpg`, converted to RGB PNG at its native 1280 × 1280 resolution without resizing or altering the artwork. A separate 256-pixel thumbnail keeps library browsing lightweight. No additional license is asserted for the supplied artwork.

To add drawings, put a full-resolution PNG and a small PNG thumbnail in `drawings/`, then add `{id, title, category, thumbnail, source, description}` to `catalog.js`. Category labels appear on library cards and can support future grouping/filtering without changing the engine. Prefer black outlines on a white or transparent background and clearly separated shapes; shapes may meet the image edge. Upload/import uses the same engine as library art.

## Verification

From repository root, with Node, Python, Pillow, Playwright, and Chromium installed:

```sh
node picturepaint/test-engine.cjs
python picturepaint/test-browser.py
python tests/check_site.py
```

All passed in Chromium on the implementation branch. The browser suite uses the repository's local route interception convention; production has no test dependencies. It checks deferred full-resolution loading, the native 1280-square supplied hibiscus image and fills in its petals/leaves, non-square uploads, antialiased curved/irregular neighbors, solid fills, gradients at 0/45/90/180/270/360°, retained region settings, zoomed filling, wheel/Hand navigation, undo/redo, outline display, JPG dimensions/appearance/white background, project round trips including hidden outlines, malformed project recovery, edge-connected filling, 320/375/768/1024/1440 layouts, mobile tap/pinch/pan without painting or page scroll, and Pages navigation. Screenshots: `/tmp/picturepaint-desktop.png`, `/tmp/picturepaint-mobile.png`.

The pure engine suite checks neighboring and narrow regions, antialiased grayscale lines, open boundaries, and gap repair. The existing gallery/calculator suite passes at both domain root and `/small-apps/`, including original calculator blob hashes and no-JavaScript navigation. The PicturePaint browser suite also smoke-opens all nine existing apps. Existing Breakout, Falling Blocks, Synth Lab, LaserBreak, D::FUZE, DruMidi, and ChordMidi core/engine suites passed. Existing app directories and gallery CSS/JS are unchanged.

Still required on physical devices: iPad Safari and Android Chrome touch precision and gesture cancellation, portrait/landscape usability, large-image memory/responsiveness, native project/JPG downloads and reopening from Files, and long painting sessions. Mobile emulation does not establish physical-device performance or Safari compatibility.

## Smart Palette

The compact grid contains twelve named base colors: red, orange, yellow, green, cyan, blue, violet, magenta, rose, brown, gray and white. The 1.2 bases use saturated spectrum colors, with brown and neutral tones; lightening naturally creates pastels without a separate saturation control. A single tap selects the swatch at its remembered shade. A double tap (two pointer clicks within 350 ms) selects and resets only that swatch. Selection is immediate; there is no single-tap delay. A ring and checkmark mark the selected swatch, and its visible color updates as it is shaded. Keyboard activation selects without triggering double-tap reset.

The vertical **Palette shade** slider has white at the top (+100%), the original base shade at the marked center (0%), and black at the bottom (−100%). It stores adjustments with 0.1% precision, linearly interpolating each RGB channel toward white or black, then rounding to the image's 8-bit RGB values. The slider has a 44-pixel-wide interaction area and a large handle. Arrow keys make fine adjustments. Its position returns to the selected swatch's remembered value. Palette memory is shared across Solid and Gradient modes and remains available when switching drawings.

In Gradient mode, first choose the **Color 1** or **Color 2** target, then tap a swatch or drag its shade slider. Only the active endpoint changes. Switching targets shows the target's existing color and selects its matching remembered swatch, if any. Each endpoint keeps its assigned RGB value when another swatch or endpoint is shaded; previously painted regions are never updated. The large color preview shows the active color, its hex value and shade adjustment. Both native custom color inputs remain available. A custom color that does not match a remembered swatch has no swatch selection; the shade slider is disabled until a swatch is selected, while the custom color is still ready for painting.

The gradient preview is a 120 × 120 CSS square, placed alongside the direction controls where space allows and stacked in the narrow sidebar. It updates immediately for either endpoint or the angle. It uses the existing screen-coordinate convention (0° right, 90° down) and the existing CSS angle mapping. Region detection, paint/gradient calculations, image dimensions and paint history have not changed. The existing canvas width is preserved; on desktop/tablet the workspace remains visible while scrolling the taller control panel.

Projects retain schema `version: 1` with optional `palette` metadata. `palette.baseVersion: 2` identifies the vibrant bases introduced in 1.2:

```json
{
  "palette": {
    "baseVersion": 2,
    "shades": {"red": 50, "orange": 0, "yellow": 0, "green": 0, "cyan": 0, "blue": -30, "violet": 0, "magenta": 0, "rose": 0, "brown": 0, "gray": 0, "white": 0},
    "selected": "red",
    "activeEndpoint": "color1",
    "colors": {"color1": "#ff8080", "color2": "#ffff00"}
  }
}
```

`selected` may be `null` for a custom color. All shades, selection, active endpoint and both current RGB colors restore on open. If the saved target is Color 2, Gradient controls open so that target is visible. A 1.0 file with no `palette` field opens with fresh default shades, red selected and default red/yellow endpoint colors. Its embedded artwork, dimensions, region seeds, paint styles, gradients, outline setting and boundary definitions are preserved. A 1.1 palette without `baseVersion` is validated against its original twelve IDs. Shared IDs retain their shade percentages; new cyan/magenta/rose/white swatches start at center. The removed coral/teal/pink/charcoal bases have no matching shade slot. Exact endpoint RGB colors are always retained, even when a changed or removed base means the current color becomes a custom selection. An unchanged base such as gray can keep its selection. Region colors and gradient definitions are never migrated or recolored. Invalid palette metadata is rejected before replacing the current painting. There is no browser-storage dependency, and palette changes mark the project as unsaved.

Additional automated checks (all passed):

```sh
node picturepaint/test-palette.cjs
python picturepaint/test-palette-browser.py
```

The new suites check RGB interpolation/endpoints/fractional adjustments and metadata validation; independent shade memory and slider restoration; selected swatch indication; mouse double-click and touch double-tap reset; keyboard precision; native touchscreen shade dragging on tablet and phone emulation; solid/gradient target application without repainting earlier fills; new/legacy/custom project round trips and invalid metadata recovery; square preview pixels at 0/45/90/180/270/360°; and control sizes/overflow at phone, tablet and desktop widths. Screenshots are saved to `/tmp/picturepaint-palette-desktop.png`, `/tmp/picturepaint-palette-tablet.png`, and `/tmp/picturepaint-palette-phone.png`.

The original PicturePaint browser and region-engine suites and the gallery/calculator regression suite also pass. The PicturePaint browser suite smoke-opens all nine other App Lab apps, whose source files remain unchanged. Physical iPad Safari and Android Chrome checks remain necessary for native color pickers, vertical range behavior and double-tap ergonomics; Chromium emulation is not a substitute for those device checks.

## Edge-connected landscape regions (1.1 addendum)

Sky touching the top/sides, rivers through the bottom, hills/fields meeting a side and enclosed details near an edge all use the same explicit-tap solid/gradient fill path. The existing flood-fill neighbor bounds already treat the image rectangle as a wall. Only the old edge-region checks in bucket application and project restoration were removed; segmentation, region IDs, gap tolerance, history, gradient calculations and export are unchanged. Edge metadata remains descriptive and does not prevent painting. Deliberately broken outlines still connect regions when unsealed; increasing Seal gaps can separate them.

`python picturepaint/test-landscape-browser.py` imports a landscape fixture and checks all five area types, solid/gradient fills, Undo/Redo, image-bound clipping, project reopening (including a file without palette metadata), JPG dimensions and corner/river appearance, and small broken-outline behavior at gap values 0 and 1. The existing engine suite also verifies that a blank image is a single finite region covering exactly its image dimensions. No controls, warning dialogs, automatic background fill or background toggle were added.

## Used Colors (1.2)

The Color 1/Color 2 area shares one scrollable **Used colors** grid. Choose the active target, then tap a recorded color to assign that exact RGB value to that endpoint. Both native custom color inputs remain alongside the target buttons. The app controls Used Colors; the platform's custom chooser and any presets within that native dialog remain browser-owned. No native preset is used to populate the artwork collection.

Used Colors is derived from `Painting.styles`, the current region assignments, on painting redraws. `collectUsedColors` reads one color for each solid region and both endpoints for each gradient, normalizes hex letter case, deduplicates and sorts by RGB hex for a stable order. It never scans pixels, records gradient intermediate shades, reads undo/redo history, or records palette/custom selections that have not been applied. Recoloring removes a previous color only when no region still uses it. Undo/Redo, loading a project, boundary rebuilding and switching drawings all refresh the same derived collection. An intentionally painted white region counts as used white; untouched white background and original black outlines do not.

There is no twelve-color cap: the compact grid scrolls beyond its visible rows, with 44-pixel touch targets and a quiet empty state before painting. Existing buttons are retained where possible to preserve focus and scroll position. Selecting a Used Color updates only the active endpoint, native picker, selected-color preview and live gradient preview; it neither repaints regions nor changes remembered base shades.

No additional Used Colors data is serialized. Save/open restores the existing region style data as before and reconstructs the collection from those assignments. This works with 1.0 files without palette metadata, original 1.1 palettes and 1.2 palettes; exact applied RGB values and the existing artwork, region definitions, gradients and dimensions are preserved.

Additional check:

```sh
python picturepaint/test-used-colors-browser.py
```

Passed checks cover the twelve exact vibrant bases; pastel/darker interpolation; no entries from color selection; solid-only colors and gradient endpoints; duplicate/shared use; recolor removal; Undo/Redo growth and shrinkage; both endpoint targets; explicit white paint; save/open and real 1.1 palette migration; 1.0 project compatibility; sixteen distinct applied colors with scrolling; new-drawing reset; five responsive widths; tablet/phone touch selection; and JPG export. Screenshots: `/tmp/picturepaint-used-desktop.png`, `/tmp/picturepaint-used-tablet.png`, `/tmp/picturepaint-used-phone.png`.

The palette unit suite also verifies current-style collection and legacy metadata migration. The existing shade/touch, painting/navigation, landscape/gap/edge-fill, and gallery/calculator suites pass; other app sources and the painting engine are unchanged. Physical tablet/phone testing remains for native color chooser ergonomics, scrolling the collection during long sessions and device-specific touch behavior. Mobile emulation cannot establish physical-device usability or memory performance. No saturation control, Line Repair, brushes, erasers, eyedropper or photograph conversion was added.
