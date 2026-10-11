# Interactive 3D Solar System

An interactive 3D model of the solar system that runs in your browser. It's built with [Three.js](https://threejs.org/) and has no build step and no texture files: every planet surface is generated in code. It works with a mouse on desktop and with touch on iPad and phones.

**Live demo:** https://russellambriz.github.io/solar-system/

## Features
- The Sun (glowing, and it's the light source) plus all 8 planets and 5 dwarf planets in the right order, with correctly proportional orbital periods
- Real axial tilts and day lengths (spin is slowed 50× so you can see it), Saturn's and Uranus's rings, Earth's clouds, the Moon clearly orbiting Earth with its own orbit ring, and Mars' (Phobos, Deimos) and Jupiter's (Io, Europa, Ganymede, Callisto) moons with detailed procedural surfaces
- **Saturn's, Uranus's and Neptune's major moons**: Mimas, Enceladus, Tethys, Dione, Rhea, hazy orange Titan and two-tone Iapetus; Miranda, Ariel, Umbriel, Titania and Oberon orbiting in Uranus's sideways equatorial plane; and Neptune's backwards-orbiting Triton (pink polar cap), Proteus and Nereid (on its stretched-out orbit). Each has a detailed procedural surface, orbit ring, label and info panel
- Click or tap any planet to fly to it and follow it, with an info panel: diameter, distance from the Sun (AU), orbital period, day length and a fun fact
- Time speed slider (paused up to about 2.7 years per second), a compact Layers group (orbits, labels, belts, Milky Way), and collapsible panels; on portrait/small screens both panels start collapsed and the planet list folds away after you pick something
- Planet list with moons folded under their planet (tap ▸ to show them; focusing a planet unfolds its moons)
- **Asteroid belt & Kuiper belt**: thousands of GPU-animated asteroids (with the Kirkwood gaps and Jupiter's Trojans) and an icy Kuiper belt beyond Neptune, each with its own on/off checkbox
- **Dwarf planets**: Ceres and Vesta in the asteroid belt; Pluto with Charon (a tidally locked double world) on its real eccentric, tilted orbit that crosses inside Neptune's; plus Eris, Haumea (egg-shaped, with a ring) and Makemake, all selectable with info panels
- **Milky Way**: a glowing galactic band across the sky, tilted realistically to the planets' orbital plane (toggle it in Controls)
- **Galaxy view**: zoom far out (or press 🌌 Galaxy) to see the whole Milky Way as a 4-armed barred spiral, with a pulsing "You are here: Sun" marker 26,000 light-years from the center
- **Solar flares**: zoom into the Sun to see its boiling granulated surface, sunspots, glowing prominence loops, and random solar flares and CMEs erupting off the edge
- **Andromeda & the Local Group**: zoom even farther out (or press 🔭 Andromeda / `A`) to see the Andromeda Galaxy (M31) with its companions M32 and M110, shown at its true distance of ~2.5 million light-years
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
| Galaxy view | `G`, 🌌 Galaxy, or zoom far out | 🌌 Galaxy, or pinch far out |
| Back from galaxy | `Esc`, ☀ Solar System, or zoom all the way in | ☀ Solar System, or pinch all the way in |
| Galaxy info | Click the galaxy or "You are here" | Tap the galaxy or "You are here" |
| Andromeda | `A`, 🔭 Andromeda, zoom far out from the galaxy, or click it | 🔭 Andromeda, pinch far out, or tap it |
| Back from Andromeda | `Esc` or 🌌 Back to Milky Way | 🌌 Back to Milky Way |
| Milky Way sky band on/off | Controls checkbox | Controls checkbox |
| Asteroid / Kuiper belt on/off | Controls checkboxes | Controls checkboxes |

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
- `galaxy.js`: Milky Way sky band shader, the particle-based Milky Way, and Andromeda (M31) with M32/M110
- `sun.js`: animated close-up Sun (granulation, sunspots, limb darkening), prominences, solar flares and CMEs
- `moons.js`: GPU-baked surfaces of the Galilean moons and the potato-shaped Phobos, Deimos and Vesta
- `outermoons.js`: moons of Saturn, Uranus and Neptune: GPU-baked surfaces, Titan's haze, tilted/retrograde/eccentric orbits and their facts
- `smallbodies.js`: asteroid belt, Trojans and Kuiper belt particles (Kepler orbits on the GPU), plus dwarf-planet orbits, facts and surfaces
- `planets/index.js`: real texture maps for Mercury, Venus, Jupiter, Saturn, Uranus and Neptune (`textures/planets/`, 2K on desktop, 1K on touch devices; the procedural map stays if a file fails to load), sun-facing atmosphere rims, and sun-lit rings with planet/ring shadows
- `style.css`: dark space-themed UI that adapts to touch screens
- `.nojekyll`: tells GitHub Pages to serve the files as they are

All paths are relative, so it also works from a subpath such as `https://<user>.github.io/solar-system/`.

## Texture credits
- Mercury: NASA/Johns Hopkins University APL/Carnegie Institution of Washington, MESSENGER MDIS global mosaic (public domain).
- Jupiter: NASA/JPL/Space Science Institute, Cassini cylindrical map PIA07782 (public domain).
- Venus (cloud tops, toned down), Saturn, Uranus, Neptune and Saturn's ring strip: [Solar System Scope](https://www.solarsystemscope.com/textures/), CC BY 4.0.
- Details and processing: `textures/planets/SOURCES.md`.
