# Interactive 3D Solar System

An interactive 3D model of the solar system that runs in your browser. It's built with [Three.js](https://threejs.org/) and has no build step and no texture files: every planet surface is generated in code. It works with a mouse on desktop and with touch on iPad and phones.

**Live demo:** https://russellambriz.github.io/solar-system/

## Features
- The Sun (glowing, and it's the light source) plus all 8 planets in the right order, with correctly proportional orbital periods
- Real axial tilts and day lengths (spin is slowed 50× so you can see it), Saturn's and Uranus's rings, and Earth's Moon and clouds
- Click or tap any planet to fly to it and follow it, with an info panel: diameter, distance from the Sun (AU), orbital period, day length and a fun fact
- Time speed slider (paused up to about 2.7 years per second), checkboxes for orbit lines and labels, and collapsible panels
- Distances and sizes are scaled so everything is visible; see the note in the bottom-left corner of the page

## Controls
| Action | Mouse / keyboard | Touch (iPad) |
|---|---|---|
| Rotate | Left-drag | One-finger drag |
| Zoom | Scroll wheel | Pinch |
| Pan | Right-drag | Two-finger drag |
| Follow a planet | Click planet, label or list item | Tap planet, label or list item |
| Back to overview | `Esc` or ⟲ Overview | ⟲ Overview or ✕ |
| Pause / play | `Space` or button | Pause button |

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
- `main.js`: scene, procedural textures, picking, camera focus/follow and UI code (commented)
- `style.css`: dark space-themed UI that adapts to touch screens
- `.nojekyll`: tells GitHub Pages to serve the files as they are

All paths are relative, so it also works from a subpath such as `https://<user>.github.io/solar-system/`.
