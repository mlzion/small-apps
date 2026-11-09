# D::FUZE

A minimalist Canvas arcade game in App Lab. Orbit the bomb, break blue gates from the outside inward, and shoot through the rotating openings before time or ammunition runs out. Red walls remain indestructible. Three lives carry through a run; each retry restores level resources. Desktop uses A/D or arrows, Space to fire and Escape to pause. Phones use portrait touch controls, with landscape rotation automatically pausing until manual resume.

Current gameplay supports **one to four rings** and twelve initial published levels. The final level comes from the published JSON dataset, so Level 13 and beyond require content changes rather than engine changes. Published timers, health, ammo and gate settings are preserved. Each level selects one motion family with six editable profiles; distinct per-ring assignments shuffle every ten seconds. Ring profiles use protected family holds; the separately animated assembly parent runs its own profile and clock.

- [Phase 5.1 motion shuffle, v4 migration and Android checklist](PHASE51.md)
- [Phase 5 architecture, initial balance, adding levels and manual checks](PHASE5.md)
- [Level Builder](builder/README.md)
- [Memory-only editing, Test Mode and publishing JSON](PUBLISHING.md)
- [Unified ring/assembly motion editor](UNIFIED-MOTION.md)

## Modules

- `published-levels.json`: versioned normal-game level dataset and both editable motion libraries.
- `levels.js`: fetch/validate published data, with useful load errors and no generated fallback levels.
- `level-schema.js`: schema v4 validation, explicit legacy imports, runtime conversion and validated standalone Test Mode snapshots.
- `engine.js`: game states, per-session configuration snapshot, content-based progression, timer, lives, ammo and firing.
- `rings.js`: configurable geometry, parented rings/gates and nearest annular-sector ray collisions.
- `motion.js` / `experimental-motion.js`: shared interpolation, seeded choice, six ten-second profiles per family, coordinated shuffling and protected holds.
- `assembly.js`: independent keyframe-driven assembly parent with Gentle Drift and editable profiles.
- `renderer.js`, `audio.js`, `input.js`, `game.js`: Canvas/effects, synthesized audio, keyboard/multitouch, orientation and menus.
- `builder/`: separate developer tool, shared motion editor, preview and complete JSON publishing.

Serve the repository over HTTP. Both `/d-fuze/` and `/small-apps/d-fuze/` work, including direct navigation. No external assets, frameworks or dependencies are required to play. The repository's `test-*.cjs` suites run in Node; `test-*.py` browser checks use Playwright and Chromium. Older phase documents describe historical milestones; the linked current instructions above take precedence.
