# Interactive 3D Solar System

An interactive 3D model of the solar system that runs in your browser. It's built with [Three.js](https://threejs.org/) and has no build step and no texture files: every planet surface is generated in code. It works with a mouse on desktop and with touch on iPad and phones.

**Live demo:** https://russellambriz.github.io/solar-system/

## Features
- The Sun (glowing, and it's the light source) plus all 8 planets and 5 dwarf planets in the right order, each planet on its real tilted, eccentric orbit (JPL orbital elements) at its true position for the shown date
- Real axial tilts and day lengths (spin is slowed 50× so you can see it), Saturn's and Uranus's rings, Earth's clouds, the Moon clearly orbiting Earth with its own orbit ring, and Mars' (Phobos, Deimos) and Jupiter's (Io, Europa, Ganymede, Callisto) moons with detailed procedural surfaces
- **Saturn's, Uranus's and Neptune's major moons**: Mimas, Enceladus, Tethys, Dione, Rhea, hazy orange Titan and two-tone Iapetus; Miranda, Ariel, Umbriel, Titania and Oberon orbiting in Uranus's sideways equatorial plane; and Neptune's backwards-orbiting Triton (pink polar cap), Proteus and Nereid (on its stretched-out orbit). Each has a detailed procedural surface, orbit ring, label and info panel
- Click or tap any planet to fly to it and follow it, with an info panel: diameter, distance from the Sun (AU), orbital period, day length and a fun fact
- **Search** (or press `/`): type any name (planets, moons, spacecraft, comets, galaxies, nebulae…) and fly there; long trips pass the orbits and belts in between with labels (Skip ⏭ to jump). The object list is grouped (spacecraft, comets, landing sites, galaxies, nebulae) and filters as you type
- **Smooth on slower devices**: if the frame rate drops, star and particle counts are reduced automatically (Restore in Controls)
- **Date picker**: jump to any day from 1000 to 3000 AD (Today returns to now); planets, spacecraft and the Moon follow
- Time speed slider (paused up to about 2.7 years per second), a compact Layers group (orbits, labels, belts, Milky Way), and collapsible panels; on portrait/small screens both panels start collapsed and the planet list folds away after you pick something
- Planet list with moons folded under their planet (tap ▸ to show them; focusing a planet unfolds its moons)
- **Asteroid belt & Kuiper belt**: thousands of GPU-animated asteroids (with the Kirkwood gaps and Jupiter's Trojans) and an icy Kuiper belt beyond Neptune, each with its own on/off checkbox
- **Dwarf planets**: Ceres and Vesta in the asteroid belt; Pluto with Charon (a tidally locked double world) on its real eccentric, tilted orbit that crosses inside Neptune's; plus Eris, Haumea (egg-shaped, with a ring) and Makemake, all selectable with info panels
- **Milky Way**: a glowing galactic band across the sky, tilted realistically to the planets' orbital plane (toggle it in Controls)
- **Galaxy view**: zoom far out (or press 🌌 Galaxy) to see the whole Milky Way as a 4-armed barred spiral, with a pulsing "You are here: Sun" marker 26,000 light-years from the center
- **Solar flares**: zoom into the Sun to see its boiling granulated surface, sunspots, glowing prominence loops, and random solar flares and CMEs erupting off the edge
- **Spacecraft**: Voyager 1 and 2, New Horizons (with their paths past the planets they visited), Parker Solar Probe on its 88-day orbit and JWST at Sun–Earth L2, at approximate real positions for the shown date; the ISS circling Earth (shown at ~1,500 km instead of ~420 km so it clears the surface); and markers for the six Apollo landing sites and the planned Artemis south-pole landing area, which appear when you zoom in on the Moon. Tap any label for facts; the Layers group has a checkbox for each
- **Comets**: Halley's Comet and Hale-Bopp on their real elliptical orbits, with a blue ion tail pointing straight away from the Sun and a curved dust tail, both growing as the comet nears the Sun (Halley's next visit is 2061). Tap a comet's label for facts; Layers has a Comets checkbox
- **Interstellar visitors**: 1I/'Oumuamua (2017), 2I/Borisov (2019) and 3I/ATLAS (2025) on their real open (hyperbolic) paths from JPL, drawn as violet/magenta curves with dashes flowing in their direction of travel. 'Oumuamua is a bare, elongated reddish rock; Borisov and 3I/ATLAS grow a coma and tail near the Sun. Their cards show the live distance and speed, and the speed they keep far from the Sun (v∞)
- **Famous asteroids**: Apophis (with its 13 Apr 2029 flyby, 31,600 km above Earth), Bennu (OSIRIS-REx), Ryugu (Hayabusa2), Didymos with its moonlet Dimorphos (DART), metal-rich Psyche, Eros (NEAR Shoemaker) and 2024 YR4 on their real JPL orbits, as spinning procedural rocks with cards showing their live distance from the Sun and Earth; findable in search, the list and the mini-map, with Events for the missions and the Apophis flyby
- **Andromeda & the Local Group**: zoom even farther out (or press 🔭 Andromeda / `A`) to see the Andromeda Galaxy (M31) with its companions M32 and M110, shown at its true distance of ~2.5 million light-years
- **Magellanic Clouds & Triangulum (M33)**: the Large and Small Magellanic Clouds (~160,000 and ~200,000 light-years, joined by the Magellanic Bridge) and the Triangulum Galaxy (~2.7 million light-years, near Andromeda) at their true distances and sizes in the galaxy view. Tap one or its label to fly there; Layers has an LMC · SMC · M33 checkbox
- **Scale slider**: morph from the comfortable compressed view to true distance ratios (with a live "Neptune is drawn N× too close" readout), and watch the planets spread out
- **Distance HUD** (Layers → Distances): how far the camera and the selected object are from the Sun and Earth, with light and radio-signal travel times (light-years in the galaxy view)
- **True-size comparisons** in each info card: size in Earth diameters, a ghost Earth at true relative size, and true-scale moon orbits (the Moon really is 60 Earth radii away)
- **Events timeline** (Controls → Events): jump to Voyager 2 at Neptune, Halley's Comet in 1986, Apollo 11 and more; the sim pauses there and flies you to the object
- **Mini-map** (Layers, or `M`): a top-down log-scale map of the planets, belts, comets and probes with your camera on it; tap a dot to fly there
- **Motion trails** (Layers → Trails): dots at equal time steps along each orbit show where planets speed up (Kepler's second law)
- **Help** (`?` or the ? button) and **clean view** (`H` or 🖼) to hide the interface
- Distances and sizes are scaled so everything is visible (in the galaxy view, *wildly* so); tap "Why is this not to scale?" in the bottom-left corner

## Controls
| Action | Mouse / keyboard | Touch (iPad) |
|---|---|---|
| Rotate | Left-drag | One-finger drag |
| Zoom | Scroll wheel | Pinch |
| Pan | Right-drag | Two-finger drag |
| Follow a planet | Click planet, label or list item | Tap planet, label or list item |
| Back to overview | `Esc` or ⟲ Overview | ⟲ Overview or ✕ |
| Search and fly to anything | `/`, type, `Enter` (↑/↓ to pick) | Tap the search box |
| Pause / play | `Space` or button | Pause button |
| Jump to a date | Controls → Date field, or Today | Controls → Date field, or Today |
| Compressed ↔ true distances | Controls → Scale slider | Controls → Scale slider |
| Distance / light-time readout | Layers → Distances | Layers → Distances |
| Ghost Earth / true moon orbits | Buttons in a planet's info card | Buttons in a planet's info card |
| Jump to an event (flybys, comets, landings) | Controls → Events: list, ◀ ▶ or the timeline | Controls → Events |
| Help | `?` or the ? button in Controls | ? button in Controls |
| Clean view (hide the interface) | `H` or 🖼 in Controls | 🖼 in Controls, then Show interface |
| Mini-map on/off | `M` or Layers | Layers |
| Motion trails | Layers → Trails | Layers → Trails |
| Galaxy view | `G`, 🌌 Galaxy, or zoom far out | 🌌 Galaxy, or pinch far out |
| Back from galaxy | `Esc`, ☀ Solar System, or zoom all the way in | ☀ Solar System, or pinch all the way in |
| Galaxy info | Click the galaxy or "You are here" | Tap the galaxy or "You are here" |
| Andromeda | `A`, 🔭 Andromeda, zoom far out from the galaxy, or click it | 🔭 Andromeda, pinch far out, or tap it |
| Back from Andromeda | `Esc` or 🌌 Back to Milky Way | 🌌 Back to Milky Way |
| Magellanic Clouds / M33 (galaxy view) | Click the galaxy or its label | Tap the galaxy or its label |
| Milky Way sky band on/off | Controls checkbox | Controls checkbox |
| Asteroid / Kuiper belt on/off | Controls checkboxes | Controls checkboxes |
| Spacecraft or landing-site facts | Click its label (✕ closes the card and keeps the view) | Tap its label |
| Spacecraft / Moon landings on/off | Layers checkboxes | Layers checkboxes |

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
- `localgroup/`: Large and Small Magellanic Clouds (riding on the Milky Way's disk), the Magellanic Bridge and the Triangulum Galaxy (M33), with labels, fly-to framing and info cards
- `sun.js`: animated close-up Sun (granulation, sunspots, limb darkening), prominences, solar flares and CMEs
- `moons.js`: GPU-baked surfaces of the Galilean moons and the potato-shaped Phobos, Deimos and Vesta
- `outermoons.js`: moons of Saturn, Uranus and Neptune: GPU-baked surfaces, Titan's haze, tilted/retrograde/eccentric orbits and their facts
- `smallbodies.js`: asteroid belt, Trojans and Kuiper belt particles (Kepler orbits on the GPU), plus dwarf-planet orbits, facts and surfaces
- `planets/index.js`: real texture maps for Mercury, Venus, Jupiter, Saturn, Uranus and Neptune (`textures/planets/`, 2K on desktop, 1K on touch devices; the procedural map stays if a file fails to load), sun-facing atmosphere rims, and sun-lit rings with planet/ring shadows
- `search/`: object index, search box, fly-to (cinematic past orbits and belts on long trips) and the grouped, filterable list
- `scale/`: the scale slider (compressed ↔ true distance ratios), the distance / light-time HUD, and the info card's true-size comparisons (ghost Earth, true-scale moon orbits)
- `ui/`: help overlay, clean view, the foldable scale notes, mini-map, events timeline and motion trails
- `perf/`: frame-rate guard that thins particle clouds on slow devices
- `ephemeris/`: JPL Keplerian elements for the planets (real positions and tilted, eccentric orbits for any date from 3000 BC to 3000 AD) and the Controls date picker
- `spacecraft/`: spacecraft positions (flyby trajectories, Parker's Kepler orbit, JWST's L2 halo loop, the ISS via `earth.latLonToWorld`), small procedural models, the Moon landing sites (via `moon.latLonToWorld`), their labels and info cards
- `comets/`: Halley's and Hale-Bopp's orbits (robust Kepler solver), coma, ion and dust tails, labels and info cards; `comets/interstellar.js` holds the JPL elements of the three interstellar visitors (hyperbolic Kepler solver in `comets/index.js`)
- `asteroids/`: famous asteroids and near-Earth objects: JPL elements (`data.js`), procedural potato / spinning-top / peanut meshes (`shapes.js`), orbits, labels, cards and the Apophis 2029 flyby (hooked in through `comets/index.js`)
- `style.css`: dark space-themed UI that adapts to touch screens
- `.nojekyll`: tells GitHub Pages to serve the files as they are

All paths are relative, so it also works from a subpath such as `https://<user>.github.io/solar-system/`.

## Texture credits
- Mercury: NASA/Johns Hopkins University APL/Carnegie Institution of Washington, MESSENGER MDIS global mosaic (public domain).
- Jupiter: NASA/JPL/Space Science Institute, Cassini cylindrical map PIA07782 (public domain).
- Venus (cloud tops, toned down), Saturn, Uranus, Neptune and Saturn's ring strip: [Solar System Scope](https://www.solarsystemscope.com/textures/), CC BY 4.0.
- Details and processing: `textures/planets/SOURCES.md`.
