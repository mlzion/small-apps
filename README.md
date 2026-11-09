# App Lab

Small ideas. Working experiments.

A static gallery for browser games, audio tools, MIDI applications, and creative projects. Calculator, Breakout, Falling Blocks, and D::FUZE are available; Space Shooter, Synth Lab, MIDI Lab, and Paint Studio are planned.

## Running locally

Open the root `index.html` in a modern browser, or serve this directory with any static HTTP server. No dependencies, framework, or build step are required. JavaScript only keeps the footer year current; the gallery and launch link work without it.

## GitHub Pages

The site lives at the repository root and uses relative asset and app paths, including `calculator/`. It works at `/small-apps/` as well as a domain root. When publishing, use GitHub Pages with the repository root (`/`) as the source. No deployment configuration has been changed by this gallery addition.

## Updating the collection

Edit the cards in root `index.html` and their presentation in root `styles.css`. Each card includes a name, description, and written status. The decorative HTML/SVG previews are placeholders, hidden from assistive technology; replace them with screenshots and appropriate alternative text when available. Planned apps intentionally have no launch controls. Add an actual relative launch link only when an app is available, and update the collection summary.

The `calculator/` directory is the existing standalone application. Its files are unchanged and its styles and script remain separate from the gallery.

## Verification

See `tests/README.md` for regression and responsive checks. Test tools are development-only and are not needed to run the site.

## D::FUZE

See [d-fuze/README.md](d-fuze/README.md) for Phase 1 architecture, controls, configuration, and verification.
