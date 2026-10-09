# Interactive 3D Solar System

An interactive 3D model of the solar system that runs in your browser. It's built with [Three.js](https://threejs.org/) and has no build step and no texture files: every planet surface is generated in code. It works with a mouse on desktop and with touch on iPad and phones.

**Live demo:** https://russellambriz.github.io/solar-system/

## Features
- The Sun (glowing, and it's the light source) plus all 8 planets in the right order, with correctly proportional orbital periods
- Real axial tilts and day lengths (spin is slowed 50× so you can see it), Saturn's and Uranus's rings, Earth's clouds, and the Moon clearly orbiting Earth with its own orbit ring
- Click or tap any planet to fly to it and follow it, with an info panel: diameter, distance from the Sun (AU), orbital period, day length and a fun fact
- Time speed slider (paused up to about 2.7 years per second), checkboxes for orbit lines and labels, and collapsible panels
- **Milky Way**: a glowing galactic band across the sky, tilted realistically to the planets' orbital plane (toggle it in Controls)
- **Galaxy view**: zoom far out (or press 🌌 Galaxy view) to see the whole Milky Way as a 4-armed barred spiral, with a pulsing "You are here: Sun" marker 26,000 light-years from the center
- Distances and sizes are scaled so everything is visible (in the galaxy view, *wildly* so); see the note in the bottom-left corner of the page

## Controls
| Action | Mouse / keyboard | Touch (iPad) |
|---|---|---|
| Rotate | Left-drag | One-finger drag |
| Zoom | Scroll wheel | Pinch |
| Pan | Right-drag | Two-finger drag |
| Follow a planet | Click planet, label or list item | Tap planet, label or list item |
| Back to overview | `Esc` or ⟲ Overview | ⟲ Overview or ✕ |
| Pause / play | `Space` or button | Pause button |
| Galaxy view | `G`, 🌌 Galaxy view, or zoom far out | 🌌 Galaxy view, or pinch far out |
| Back from galaxy | `Esc`, ☀ Solar System, or zoom all the way in | ☀ Solar System, or pinch all the way in |
| Galaxy info | Click the galaxy or "You are here" | Tap the galaxy or "You are here" |
| Milky Way sky band on/off | Controls checkbox | Controls checkbox |

## Run locally
Browsers block ES modules on `file://` pages, so serve the folder with any static server:

```bash
cd solar-system
python3 -m http.server 8000
# then open http://localhost:8000
```

The first load needs internet access, because Three.js comes from the jsDelivr CDN.

## Files
- `index.html`: page layout, plus an import map that loads `three` and its addons from the CDN
- `main.js`: scene, procedural textures, picking, camera focus/follow, view switching and UI code (commented)
- `galaxy.js`: Milky Way sky band shader and the particle-based galaxy scene
- `style.css`: dark space-themed UI that adapts to touch screens
- `.nojekyll`: tells GitHub Pages to serve the files as they are

All paths are relative, so it also works from a subpath such as `https://<user>.github.io/solar-system/`.
