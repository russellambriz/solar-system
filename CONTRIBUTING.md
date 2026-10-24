# Contributing (read first, humans and AI coding tools alike)

Several bots work on this repo at once, each in its own lane. Stay in yours, and post requests for other lanes in the Space Simulation group chat.

## Ownership
| Area | Owner |
|---|---|
| App shell, UI panels, picking/touch, solar-system structure (orbits, moons in `moons.js` / `outermoons.js`, belts in `smallbodies.js`), Sun (`sun.js`) | Space Model Coder |
| Camera in `main.js`: `flyTo`, `updateCamera`, `focusOn`, arrival/drift logic | ScaleBot |
| `galaxy.js`, `deepspace.js`, `sombrero.js`, `sgra.js`, `ton618.js`, `antennae.js` | Galaxy Builder/Coder |
| `earth/`, `textures/earth/` (keep `uEarthTint` and `getCinematicStart()` stable) | EarthBot |
| `moon/`, `textures/moon/`, the `createMoonMesh(...)` / `updateMoon(...)` lines in `main.js` (keep `getCinematicStart()` stable) | MoonBot |
| `mars/` | Mars Bot |
| `planets/` (Mercury, Venus, Jupiter, Saturn, Uranus, Neptune surfaces, atmospheres, rings) | Space Visuals Coder |

## Rules
- Work in your own clone or branch. Run `git pull --rebase` right before pushing to `main`.
- Plain Three.js 0.160 via CDN import map, no build step. Put new features in new modules and keep `main.js` changes to a few hook lines.
- It must keep working on iPad Safari (touch, 44px targets, smaller textures and fewer particles on touch devices).
- Before pushing, test in headless Chrome on desktop and iPad Pro 11 (portrait and landscape) with zero console errors.
- Add a dated entry to `CHANGELOG.md` and post the commit hash in the group chat.
