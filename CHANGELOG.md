# Changelog

## 2026-10-15: Constellations (constellations/)

### Added
- **Real bright stars** (V ≤ 5.0: 1,627 on desktop, 921 to V 4.5 on touch) at their true J2000 RA/Dec, rotated into the scene's ecliptic frame by 23.44°. Each star is tinted by its B-V colour index (Betelgeuse orange, Rigel blue-white) and sized by magnitude. One Points draw.
- **Stick figures for all 88 IAU constellations** as faint lines (one LineSegments draw) and small, dim name labels (`.label.const-label`, 44 px touch targets, hidden where they would overlap other labels).
- The sky sphere is re-centred on the camera every frame (at infinity, no distortion at true distances or during fly-tos), drawn in the opaque pass right after the Milky Way band with depthTest/depthWrite off, so planets, rings and night sides always cover it. It fades out with the transition progress on the way to the galaxy view and stays hidden in the galaxy, Andromeda and TON 618 views.
- **Constellations** checkbox in Layers (on by default). `window.solar.constellations` for the console.
- Data embedded in `constellations/data.js` (≈44 KB, no runtime fetch): d3-celestial by Olaf Frohn (BSD-3-Clause), stars from HYG/Hipparcos.

## 2026-10-15: Interstellar visitors: 'Oumuamua, Borisov and 3I/ATLAS (Space Model Coder)

### Added
- **The three known interstellar objects**, on their real open (hyperbolic) paths through the Solar System. Each moves on its path at any date, from the year 1000 to 3000 (thousands of AU out at the extremes).
  - **1I/'Oumuamua** (2017): a bare, elongated, reddish rock that tumbles. It has no coma or tail, because none was ever seen. Its card mentions the small non-gravitational push found in its tracking.
  - **2I/Borisov** (2019): a real comet. A coma and a dusty tail switch on inside ~6 AU and are strongest at perihelion (2.01 AU, 8 Dec 2019).
  - **3I/ATLAS** (C/2025 N1): a comet with a coma, an ion tail and a dust tail around perihelion (1.36 AU, 29 Oct 2025).
- **Paths drawn as open curves**, in violet/magenta so they read as "from outside". They run from 80 AU on the way in, past perihelion and back out to 80 AU, and fade out beyond ~25 AU. Bright dashes flow along each path in the direction of travel, like little arrows. The paths are drawn as a few pixels wide (screen-space ribbons, 2.6 px on desktop and 3.2 px on touch), so they stand out from the 1 px planet orbits. The Orbits and Comets checkboxes hide them.
- **Info cards** (tap the label, search, or the list). Each card shows the designation, the discovery date and discoverer, the live distance from the Sun (falling in / at its closest / leaving for good, and for the two comets whether the coma is on), and the closest-to-Sun distance and date. A live **Speed** row comes from vis-viva and also shows the speed far from the Sun, **v∞**, worked out from the elements: 'Oumuamua 26.4 km/s, Borisov 32.3 km/s and 3I/ATLAS 58.0 km/s. Each card also has a short fact paragraph.
- **Search and list.** Search finds `oumuamua`, `1I`, `A/2017 U1`, `borisov`, `2I`, `C/2019 Q4`, `3I`, `atlas`, `C/2025 N1` and `interstellar`, tagged "Interstellar visitor", and flies there, tracking the moving object. The visitors also sit in the ☄ Comets list group.
- **Mini-map.** Each visitor is a dot in its own colour. Past 50 AU it sits on the rim as an arrowhead, like the Voyagers.
- **Events timeline.** Three new violet markers: 'Oumuamua rounds the Sun (2017-09-09), Borisov (2019-12-08) and 3I/ATLAS (2025-10-29). Each jumps to that date and flies to the object with its card open.

### Changed
- `comets/index.js` now also handles e > 1. It solves the hyperbolic Kepler equation M = e sinh H − H by Newton's method from Danby's log starter. The mean motion is k/|a|^1.5, with elements in the same heliocentric J2000-ecliptic frame and `scaleDistance` compression as Halley and Hale-Bopp. The resulting paths and positions use the same frame and scaling. The `scale/` rebuild redraws the paths too.
- On touch, comet labels keep their 44 px tap areas clear of the planets' labels (the placement test now includes the padding), so a tap on a comet label can't land on a neighbouring label.
- Halley and Hale-Bopp are unchanged. There are no `main.js` changes: `createComets` already wires search, the mini-map, the Comets toggle and the scale tools.

### Notes
- **Elements:** from JPL's Small-Body Database API (`sbdb.api?sstr=1I|2I|3I&full-prec=1`, fetched 2026-10-15), cited in `comets/interstellar.js`: 'Oumuamua JPL solution 16 (2018-06-26), Borisov solution 54 (2024-06-24), 3I/ATLAS solution 54 (2026-02-19). Motion is pure two-body. The small non-gravitational terms in JPL's fits are not modelled.
- **Checks** (headless; sim distances against SBDB q):
  - 3I/ATLAS on 2025-10-29: 1.356 AU (q = 1.3565). 0.194 AU from Mars on 2025-10-03, and 1.80 AU from Earth on 2025-12-19, both matching the published close passes.
  - 'Oumuamua on 2017-09-09: 0.256 AU (q = 0.2559).
  - Borisov on 2019-12-08: 2.007 AU (q = 2.0065).
  - Positions stay finite at 1000-01-01 and 3000-12-31.
- Tested on desktop 1280×800 and iPad Pro 11 portrait + landscape (touch):
  - The page loads with zero console errors.
  - Each visitor can be found in search, focused, and shows its card. A label tap opens the card.
  - Halley search/focus, Saturn focus and the galaxy view (in and back) still work, and so does the 3I/ATLAS event.
- Screenshots: `screenshot-interstellar.png` (new): 3I/ATLAS at perihelion with its coma, tail, path and card.

## 2026-10-14: Real Moon phases and Galilean moon longitudes (Space Model Coder)

### Fixed
- **Earth's Moon phase.** The Moon no longer starts at longitude 0° at J2000. It now uses Meeus's mean ecliptic longitude (~218.316° at J2000, ~13.176°/day) plus the leading equation-of-center term (6.289° sin M), in the same ecliptic frame as the planets (`x = cos L`, `z = −sin L`). Full Moons land on about **2026-10-26** and **2026-11-24**, and new Moons on about **2026-11-09** / **2026-12-09** (within a few hours of the USNO times). `slow` stays 1.

### Added
- **Moon phase readout.** Controls shows a live line under the date (`Moon: Waxing gibbous · 82% lit`), and the Moon's info card gains a Phase row. Illumination comes from the Sun–Earth–Moon elongation in the scene. 44px-friendly; works on iPad touch and desktop.
- **`ephemeris/moons.js`.** Shared helpers for the Moon's longitude, Galilean mean longitudes (Meeus Ch. 44 shifted to J2000), date-anchoring of slowed moons, and phase naming.

### Changed
- **Galilean moons (Io, Europa, Ganymede, Callisto)** use Meeus mean longitudes / periods. Motion is still slowed 20× so they stay readable at 10 days/s; whenever the date is set (picker, Today, or load) their phase is re-anchored so the position at that date is the real mean longitude. Relative angles keep the 1:2:4 Laplace resonance.
- Saturn / Uranus / Neptune moons in `outermoons.js` are unchanged: easy-to-drop-in mean elements in the same frame weren't cleanly sourced this pass, so their decorative phases stay as they were.

### Notes
- Success check (headless): Oct 26 & Nov 24 → Full Moon ~100% lit; Nov 9 & Dec 9 → New Moon ~0% lit; Oct 14 → Waxing crescent ~15% lit.
- Tested on desktop 1280×800 and iPad Pro 11 portrait + landscape (touch). Page loads with zero console errors; Moon / Jupiter / Io focus still work; galaxy view still enters.
- Screenshots: `screenshot-moon-phase.png` (new).


## 2026-10-13: Earth gets 4K ocean mask and 4K clouds (EarthBot)

### Changed
- **4K water mask and 4K cloud map** on desktop. They load right after the 4K day and night maps (same off-thread decode and pre-upload), so ocean glint, coastlines and cloud shadows are now as sharp as the 4K surface. Clouds show visibly finer detail up close.
- **New water mask, straight from NASA**: ocean coastlines come from the NASA Blue Marble GEBCO bathymetry map (21600×10800, area-averaged), which lines up pixel-exact with the Blue Marble day map. Inland lakes are carried over from the old mask. Antarctic ice shelves (Ross, Ronne) and a strip of the Siberian Arctic coast were wrongly marked as water before and no longer glint. The 2K (desktop) and 1K (iPad) masks were regenerated from the same 4K mask, so every tier matches.
- **4K clouds** come from NASA's 8192×4096 *Blue Marble clouds* image (the same pattern as the 2K map, 0.99 correlation), level-matched to the 2K map so the 4K swap doesn't change cloud density or `uEarthTint`.
- iPad still loads only the 1K set. Extra desktop download: about 2.2 MB, after first paint.

## 2026-10-13: Hyperion and Phoebe join Saturn's moons (Space Model Coder)

### Added
- **Hyperion**, the "sponge" moon, between Titan and Iapetus.
  - Irregular potato shape (360 × 266 × 205 km): very lumpy, crowded with deep, sharp craters, with one big pit. Dark reddish crater floors, like the ones Cassini found.
  - Real orbit: a = 1,481,009 km, e = 0.124, 21.28 days.
  - It isn't tidally locked. It turns on its own (~13 days, slowed like the planets' spin) instead of keeping one face to Saturn, a stand-in for its chaotic tumble.
  - It sits in its real **4:3 resonance with Titan**. Its ellipse slowly precesses at the real rate (−18.6°/year), which keeps the resonance locked at any date, so it only lines up with Titan at its far point, just as in reality.
- **Phoebe**, Saturn's dark captured moon, beyond Iapetus.
  - Coal-dark, battered potato (~213 km) with a Jason-like crater.
  - Real orbit: a = 12.95 million km, e = 0.16, 550.3 days.
  - It orbits **backwards** (tilted 173°) and spins every 9 h 16 min (slowed for display).
  - Its card covers its likely Centaur/Kuiper-belt origin, the Phoebe ring, and the dust that darkens Iapetus's leading side.
- Both have info cards and tap-to-focus, and appear in the Saturn list and in search. Saturn's list now shows 9 moons.

### Changed
- **Saturn framing.** Phoebe's orbit reaches 15.4–16.1 display units, past Iapetus at 13.2. Saturn's system now uses a fixed `frame: 14` (Iapetus + margin), so focusing Saturn frames the same way as before instead of pulling back to Phoebe's orbit. Phoebe stays in view at the edge of the system.
- `createPotatoMesh` (moons.js) takes an optional `floor` colour for tinted crater floors (only Hyperion uses it). Eccentric moons in `outermoons.js` take an optional `periRate` (apsidal precession, only Hyperion uses it). Nereid, Proteus, Phobos, Deimos and Vesta are unchanged.

### Notes
- No `main.js` changes: `createOuterMoons` already wires every moon in `OUTER_MOON_SYSTEMS`.
- With the compressed distances, Hyperion's tiny marker can just touch the edge of Titan's haze shell at their closest pass (once per ~64 days of orbit, slowed 30×).
- Tested on desktop (1280×800) and iPad Pro 11 in portrait and landscape (touch). The page loads, both moons can be tapped from the Saturn view and from the list, Phoebe is retrograde, Nereid's ellipse still works, and the console is clean.
- Screenshots: `screenshot-hyperion-phoebe.png` (new) and `screenshot-saturn.png` (refreshed).

## 2026-10-11: Help overlay, clean view, mini-map, events timeline and motion trails (Claude Code)

### Added
- **Help overlay** (new module `ui/`). Open it with the **?** button in the Controls header or the `?` key.
  - It lists the mouse/keyboard and touch controls (touch first on touch screens) and a few things to try.
  - ✕, Esc, `?` or a tap outside the card closes it. While it's open, Esc and the single-letter shortcuts don't reach the app.
- **Clean view.** The 🖼 button next to Pause and Overview, or `H`, hides every panel, note, the HUD and the mini-map, so only the sky is left. A **Show interface** button in the corner (it dims after a moment) or `H` brings them back. Labels stay, and Layers → Labels still turns them off.
- **"Why is this not to scale?"** The long bottom-left note now starts folded to a one-line button and opens on a tap. The galaxy-view note works the same way ("Galaxy view: what's to scale?"). Open or closed is remembered. Phones and short landscape screens, which used to hide the notes, now show the folded button.
- **Mini-map** (Layers → Mini-map, or `M`). It's on by default on desktop and landscape tablets and off on compact screens; the setting is remembered.
  - It's a top-down view of the Solar System on a log distance scale (out to 50 AU). It shows the planets' real eccentric orbits, the asteroid and Kuiper belts, the planets, the dwarf planets, Halley and Hale-Bopp, Parker Solar Probe, New Horizons and the Voyagers. Anything past 50 AU sits on the rim as an arrowhead.
  - It also shows the camera as a dot with a view cone, and rings the focused object.
  - Tap or click a dot to fly there (the same search fly-to, cinematic on long trips). Hovering with a mouse shows the name.
  - It moves left of the Controls or info panel when they cover the corner, hides if nothing fits, and hides in the galaxy view.
- **Events timeline** (Controls → 📅 Events, under the date).
  - A 1965–2065 strip has coloured markers and a needle for the current date, plus ◀ ▶ (previous/next event) and a list of 18 events:
    - the Apollo 11 and 17 landings;
    - Voyager 1 and 2 at Jupiter and Saturn, and Voyager 2 at Uranus and Neptune;
    - the Pale Blue Dot photo;
    - Halley in 1986 and 2061, and Hale-Bopp in 1997;
    - Pluto's reclassification and New Horizons at Pluto;
    - both Voyagers reaching interstellar space;
    - JWST arriving at L2, and Parker's record close pass.
  - Picking one jumps to that day, pauses, says what happened and flies to the object. For a flyby it flies to the planet and then opens the probe's card, with the probe's path running into the planet. Planets are drawn ~1,000× too big, so at closest approach the probe is inside the drawn planet. Tapping the strip away from a marker jumps to that date.
  - The group starts open on desktop and closed on compact screens.
- **Motion trails** (Layers → Trails, off by default).
  - Each planet and dwarf planet trails the last eighth of its orbit, fading behind it, with dots at equal time steps.
  - The dots spread out near the Sun, where a body moves fastest (Kepler's second law; easy to see on Mercury, Pluto and Eris).
  - It follows the scale slider and costs nothing while paused.
- **Signal delay on the probes' labels.** While Layers → Distances is on, Voyager 1 and 2, New Horizons and Parker show their one-way radio delay from Earth, for example "Voyager 1 · 📡 23 h 56 min". This is `spacecraft.setSignalDelay`, driven by `ui/`.

### Fixed
- **Typing a year into the date field.** On desktop Chrome the field reports every keystroke as a date, for example year "0002" while you type 2061. The out-of-range check reset the field to the sim date halfway through. It now ignores out-of-range years; the field resyncs when it loses focus.
- **Controls panel scrolls by touch.** It's marked `scrollable` like the other panels, so on a short screen its lower rows stay reachable when Layers and Events are open.

### `main.js` hook lines
- One import.
- `createUI({...})` before the first frame, with `ui.update(...)` once per frame.
- `ui` on `window.solar`.

## 2026-10-11: Scale slider, distance HUD and true-size comparisons (Claude Code)

### Added
- **Scale slider** (new module `scale/`), in Controls under the date. It runs from "Comfortable" (compressed) to "True distances" in five steps, and the planets glide between them.
  - Distances are drawn as `a + b·AU^p`. The slider moves `p` from 0.55 to 1 (and `a` to 0) while keeping Earth's orbit where it is, so at the right end every distance has its true ratio (20 units per AU).
  - A live readout says how compressed the view is, for example "Neptune is drawn 6.2× too close to the Sun (compared with Earth)" or "Distances: true ratios". The note in the bottom-left corner follows it.
  - Everything placed through `scaleDistance` moves at once: planets, dwarf planets, spacecraft and comets. What was drawn once is rebuilt: orbit lines, the probes' paths, Halley's and Hale-Bopp's orbits, Parker's orbit and the belts' shader.
  - The zoom-out limit and ⟲ Overview pull back as the system spreads out. The background stars follow the camera so they stay "at infinity", and the far clip plane grows with the system.
  - Planet sizes are not changed (Earth's and the Moon's arrival framing and the Moon's size easing depend on them). The comparisons below show true sizes instead.
  - The setting is remembered (when the browser allows storage).
- **Distance HUD** (Layers → Distances), at the top of the screen.
  - It shows the camera's distance from the Sun with the light time, and the selected object's distance from the Sun and from Earth. For spacecraft that second figure is the one-way radio delay (Voyager 1: about 23 hours).
  - In the galaxy view it switches to light-years from the Sun. It hides during cinematic trips and is remembered.
- **Scale section in each body's info card.** It gives the size in Earth diameters, plus two toggle buttons:
  - **👻 Earth for scale:** a wireframe Earth beside the body at its true size relative to the body as drawn (Jupiter is 11 Earths across; on Earth it shows the Moon).
  - **📏 True-scale moon orbits:** ghost rings and moons at their true distances and sizes in units of the drawn planet. For example, the Moon is 60 Earth radii out and Callisto is 26 Jupiter radii out. The rest of the view stays compressed.

### Changed
- `spacecraft/` and `comets/` each gained a `rebuild()` that redraws their paths and orbits for the current distance scale (in place, no new geometry).

### `main.js` hook lines
- `scaleDistance` reads its three numbers from a `DIST_SCALE` object, and `SOLAR_MAX_DIST` became a `let`.
- Small bodies keep a reference to their orbit line, and the starfield gets a name.
- `createScaleTools({...})` before the first frame, with `scaleTools.update(...)` once per frame.
- `scaleTools` on `window.solar`.

## 2026-10-11: Search with cinematic fly-to, grouped object list, frame-rate guard (Claude Code)

### Added
- **Search box** (new module `search/`), at the top of the object list. Press `/` to jump to it on a keyboard.
  - It finds anything by name or nickname: the Sun, planets, moons, dwarf planets, spacecraft, comets, Moon landing sites, the Milky Way, Andromeda, the Sombrero, Sgr A*, TON 618, the Magellanic Clouds, M33 and the 13 named nebulae and clusters. Nicknames include "JWST", "ISS", "M31", "black hole" and "LMC".
  - Results show a type icon and a short description. Arrow keys and Enter pick a result, and Esc clears the box.
  - While you type, keystrokes stay out of the app's single-key shortcuts (A, S, C, T, G).
- **Fly-to uses `main.js`'s own camera functions only.**
  - Planets, moons, dwarf planets and the Sun use `focusOn`.
  - Voyager 1 and 2, New Horizons, Parker and the comets use `flyTo` with function goals, so the moving object stays tracked during the flight. Their info card opens on arrival.
  - The ISS and JWST ride with Earth, so they focus Earth and then open their card. Moon landing sites focus the Moon.
  - Galaxies use the existing `flyToAndromeda`, `flyToSombrero`, `flyToSgrA`, `flyToTon618`, `flyToLocalGroup` and `flyToMilkyWay`, entering the galaxy view first if needed.
  - Nebulae and clusters use two `galaxyFly` stages, coming home to the Milky Way first if you are looking at another galaxy. They open a card with distance, light travel time, galactic position and a fact. The disk's cosmetic spin holds still while you look at one (one extra condition on the spin flag), so it stays in view.
- **Cinematic long trips.**
  - When the destination is more than ~2.5× farther from (or closer to) the Sun than where you are, the camera passes up to three landmarks on the way. Landmarks include the orbits of Mercury through Neptune, the main asteroid belt, the Kuiper belt and the heliopause.
  - Each landmark gets ~1.5 s, a temporary label (for example "Main asteroid belt · 2.2–3.3 AU · sunlight takes 22 min") and a glowing band on its orbit or across the belt.
  - A **Skip ⏭** button at the top of the screen jumps straight to the destination. A trip also ends cleanly if something else takes over the camera (Esc, a tap on a planet).
- **Grouped, filterable object list.**
  - A "Sun & planets" header sits at the top. Collapsible groups (with counts) for 🛰 Spacecraft, ☄ Comets, ⚑ Moon landings, 🌌 Galaxies & black holes and ✺ Nebulae & star clusters follow the dwarf planets. Each entry has a colour dot.
  - Typing in the search box filters the whole list, including folded moons and collapsed groups.
- **Frame-rate guard** (new module `perf/`).
  - It measures the real frame rate in 2-second windows, after a 5 s warm-up and ignoring hidden tabs.
  - Below ~40 fps (~36 on touch devices) it thins the big particle clouds: 100% → 60% → 35%, at most one step every 6 s. The clouds are the background stars, the asteroid and Kuiper belts, the Milky Way, Andromeda, the Sombrero and the Local Group dwarfs.
  - It uses each cloud's draw range, after a one-time shuffle so the reduced set is an even sample (the asteroid belt keeps its Trojans).
  - A note in Controls says what's happening and has a **Restore** button.
  - The Sun effects, Sgr A* and TON 618 are left alone.

### `main.js` hook lines
- Two imports.
- `createSearch({...})` and `createPerfGuard({...})` just before the first frame. `createSearch` also gets a small `releaseFocus` callback: the same three lines `goOverview` starts with (stop following, stop the Earth/Moon arrival drift, un-highlight). Search calls it before flying to a spacecraft or comet, so the camera isn't pulled back to the planet or moon you were looking at.
- `&& !search.holdsSpin()` on the galaxy spin flag.
- `search` and `perfGuard` on `window.solar`.

## 2026-10-11: Real planet positions and a date picker (Claude Code)

### Added
- **New module `ephemeris/`.** `planets.js` holds JPL's Keplerian elements for the eight planets (E. M. Standish, "Approximate Positions of the Major Planets"), and `index.js` holds the hook and the date picker.
  - The elements include eccentricity, inclination, node, perihelion and their drift per century.
  - Table 1 is used for 1800–2050 and Table 2a+2b (with the extra Jupiter–Neptune terms) outside that span.
  - Positions come from solving Kepler's equation and then applying `main.js`'s radial distance compression, as the dwarf planets already do.
  - **Checked against real events:** the 2020 Mars, 2023 Jupiter and 2024 Saturn/Uranus/Neptune oppositions and the 2025 Venus and 2024 Mercury inferior conjunctions all land within 0.2° of Earth's longitude. Earth's 2026 perihelion lands on 3 Jan at 0.98330 AU.
- **Orbit lines are now the real tilted ellipses**, e.g. Mercury's 7° tilt and e = 0.21, and Mars' e = 0.09. Each planet rides exactly on its line. The lines are redrawn when the date moves on by more than 20 years.
- **Date picker** in the Controls panel, under Pause/Overview: a native date field and a **Today** button. Picking a day jumps the sim clock to noon UTC on that day, from 1000 to 3000 AD. Out-of-range input is ignored. The sim keeps running, or stays paused, from there, and the field follows the sim date while you aren't typing in it.

### Changed
- `main.js` hook lines:
  - The import.
  - `createRealPositions({ bodies, scaleDistance, getTime, setTime })` after the time controls.
  - Each planet's orbit line is kept on its body (`body.orbit`).
  - `updateBodies()` calls `realPositions.place(b, days)`, keeping the old mean-longitude circle as a fallback.
  - `realPositions` on `window.solar`.
- `spacecraft/` uses the same real planet positions for its flyby waypoints and for Earth's position (signal time), instead of the old circular model. On their flyby dates Voyager 2 sits on Jupiter (1979-07-09), Saturn (1981-08-26), Uranus (1986-01-24) and Neptune (1989-08-25), within 0.012 scene units.
- `index.html` scale note: planets now follow their real tilted, eccentric orbits for the shown date.

## 2026-10-11: Magellanic Clouds and the Triangulum Galaxy (Claude Code)

### Added
- **New module `localgroup/`** (`addLocalGroup(galaxy, { isTouch, labels })`, written in the same style as `sombrero.js`). It adds the Large and Small Magellanic Clouds and the Triangulum Galaxy (M33) to the galaxy view at their true distances, directions and sizes (1 unit = 100 ly). Directions use the same galactic frame `galaxy.js` uses for Andromeda.
  - **LMC:** ~160,000 ly → 1,600 units at l = 280.5°, b = −32.9°, ~14,000 ly across. It has an off-centre bar, one main arm, the pink Tarantula Nebula and a few smaller star-forming knots, and turns slowly about its own axis.
  - **SMC:** ~200,000 ly → 2,000 units at l = 302.8°, b = −44.3°, ~7,000 ly across. It has an elongated body, the "Wing" reaching toward the LMC, and NGC 346. It sits ~76,000 ly from the LMC, joined by a faint **Magellanic Bridge** of gas and young stars.
  - **M33:** ~2.7 million ly → 27,000 units at l = 133.6°, b = −31.3°, ~60,000 ly across, ~700,000 ly from Andromeda. It is a patchy two-arm spiral with a tiny nucleus and the giant pink nebula NGC 604. Like M31 it turns slowly, and a constant-size beacon marks it when it shrinks below a few pixels.
- **Attachment.** The Clouds hang off `galaxy.group`, so they ride along as the disk turns and their direction from the Sun stays right, like the nebulae. M33 sits in `galaxy.scene` next to Andromeda. 27,000 units out, the disk's sped-up spin would sweep it hundreds of units per second and break its true distance from M31. Nothing in `galaxy.js` or the other galaxy files was edited.
- **Labels** carry the `galaxy-label` and `small` classes, so the overlap pass in `galaxy.js` nudges or hides them before Andromeda's label or the Sun marker; the M33 and M31 labels were checked not to overlap in the Local Group view. Their styles are slightly larger and tappable, with ≥ 44 px touch targets.
  - The Clouds' labels show out to ~9,000 units from the Milky Way.
  - M33's label shows in the Local Group views. It is hidden while you explore the Milky Way up close, and beyond the Sombrero scale.
- **Tap to fly**, following `flyToSombrero()`: `flyToLocalGroup(key)` in `main.js` runs two `flyTo()` stages through `galaxyFly`, with no new camera code and no `updateCamera` change.
  - The Clouds go through a view of the Milky Way beside the Cloud. M33 goes through the Local Group view.
  - Each flight ends on a view from our side and opens the galaxy's info card (distance, size, stars, where it is in the sky, and a fact).
  - Tapping the galaxy itself or its label works; a second tap reopens the card.
- **Info cards** with real facts: the Tarantula Nebula and R136a1, SN 1987A, al-Sufi (964 AD), Henrietta Leavitt's Cepheids in the SMC, NGC 604.
- New **LMC · SMC · M33** Layers checkbox. The galaxy-view scale note mentions the three galaxies.

### Changed (`main.js` hook lines)
- The Milky Way's cosmetic spin pauses while a Magellanic Cloud is focused, so the Cloud (which rides on the turning disk) stays in view. Zooming far out (> 2,500 units) releases the focus, as for Sgr A*.
- Going home from a Cloud (Esc, 🌌 Milky Way, ☀ Solar System, Sgr A*) passes through the Milky Way + Cloud view instead of the far Local Group view. Every other path is unchanged.
- The `lg-view` note stays on the Milky Way text while a Cloud is focused.
- `window.solar` gains `localGroup` and `flyToLocalGroup` for tests.
## 2026-10-11: Halley's Comet and Comet Hale-Bopp (Claude Code)

### Added
- **New module `comets/`** (`index.js`, `data.js`), hooked into `main.js` with three lines (import, `createComets(...)`, and `comets.update(days, camera, dt)` in the solar-view frame), plus `comets` on `window.solar` for tests. A new **Comets** checkbox in the Layers group shows or hides them, and their orbits also follow the Orbits checkbox.
- **Real elliptical orbits** from J2000 ecliptic elements, with the same radial distance compression as the dwarf planets. Kepler's equation uses Danby's starting guess, which converges even at Hale-Bopp's e = 0.995. Orbit lines are sampled densely around perihelion so the hairpin turn stays smooth.
  - **Halley (1P):** q = 0.586 AU, e = 0.967, i = 162.3° (retrograde), Ω = 58.4°, ω = 111.3°. Perihelion is 9 Feb 1986, and the period is set so the next perihelion comes out on 28 Jul 2061. In Oct 2026 it is ~35 AU out, just past aphelion.
  - **Hale-Bopp (C/1995 O1):** q = 0.914 AU, e = 0.995, i = 89.4°, Ω = 282.5°, ω = 130.6°, perihelion 1 Apr 1997. It is ~50 AU out in 2026, and its aphelion is ~370 AU.
- **Two tails that point away from the Sun and grow near perihelion.**
  - The **ion tail** is narrow and blue, runs straight away from the Sun, and has faint drifting streamers.
  - The **dust tail** is broader and cream-coloured, and curves back along the orbit, away from the direction of motion.
  - Tail length and brightness follow an activity factor ∝ 1/r². It switches on inside 5 AU for Halley and 8 AU for Hale-Bopp (which had a coma at 7 AU when it was found) and peaks at perihelion. Peak lengths are about real: Halley 0.25 AU ion and 0.15 AU dust, Hale-Bopp 0.6 AU and 0.4 AU.
  - The tails use one uniform local scale (the compressed orbit's sideways scale at the comet), so their shape and their size next to the nearby orbits stay true.
  - Each tail is a camera-facing additive ribbon: 56 vertices updated per frame and one draw call. The coma swells near the Sun, a constant-size marker dot keeps each comet findable far out, and a small dark nucleus shows only when the comet is inactive.
- **Labels and info cards.** Tapping "Halley" or "Hale-Bopp" opens a card with the orbit, the live distance from the Sun (heading in or out), perihelion dates, the live length of each tail, and a fact. Labels use the standard `.label` style, with 44 px touch targets on touch screens. They never cover `main.js`'s labels, and they hide behind the Sun and planets. ✕ on a comet card closes it without flying back to the overview.
## 2026-10-11: Spacecraft and Moon landing sites (Claude Code)

### Added
- **New module `spacecraft/`**, hooked into `main.js` with three lines (import, `createSpacecraft(...)`, and `spacecraft.update(days, camera, dt)` in the solar-view frame), plus `spacecraft` on `window.solar` for tests. Two new Layers checkboxes, **Spacecraft** and **Moon landings**, are in `index.html`. The probes' paths and orbits also follow the Orbits checkbox.
- **Voyager 1, Voyager 2 and New Horizons** at approximate real positions for the sim date. Each one starts at Earth on its launch date and arcs to each flyby planet on the flyby date (Jupiter, Saturn, Uranus, Neptune, Pluto). The planet positions come from `main.js`'s own model, so the path passes through the planet. From the last flyby each probe coasts in a straight line to its measured mid-2026 distance and sky direction, then keeps going at today's speed: 17.0, 15.4 and about 13.7 km/s. On 2026-10-14 the model gives Voyager 1 at 172.2 AU (ecliptic longitude 256.8°, latitude +35.4°), Voyager 2 at 144.2 AU (290.2°, −38.8°) and New Horizons at 65.9 AU (288.8°, +2.0°). Each has a faint trail of its past path.
- **Parker Solar Probe** on its final orbit: perihelion 0.0459 AU (9.86 solar radii), aphelion ~0.73 AU, perihelia 88.4 days apart, timed from 4 Sep 2026 14:53 UTC. The orbit is near Venus's plane, with perihelion on the far side of the Sun from Earth in September. Its position uses the same `keplerAU()` as the dwarf planets, and the orbit is drawn.
- **JWST** at Sun–Earth L2, on the Sun–Earth line beyond Earth, with a 6-month halo loop. The real distance (~4× the Moon's) would put it beyond Mars at this scale, so it is drawn just outside the Moon's orbit. It is hidden before launch, and before arrival (25 Dec 2021 to 24 Jan 2022) it moves out from Earth.
- **ISS** placed every frame with `body.earth.latLonToWorld(lat, lon, 1500, out)` on a 51.6° orbit, so it follows Earth's tilt and spin. The real altitude (~420 km) would sit on the drawn surface, so it flies at 1,500 km, and the info card says so. Its 93-minute orbit is slowed 300×: one lap every ~1.9 s at the default 10 days/s, and never faster than one lap per 1.5 s at high time-warp. Its orbit ring shows near Earth.
- **Moon landing sites**: Apollo 11, 12, 14, 15, 16 and 17 at their published coordinates, placed every frame with `body.moon.latLonToWorld(lat, lon, 0, out)`, so they follow the tidal lock, libration and size easing. The **Artemis** marker sits at ~89.5° S. The sites appear only once the Moon's disc is at least 110 px in radius on screen, and only on the hemisphere facing the camera.
- Small procedural models (Voyager, New Horizons, Parker with its heat shield toward the Sun, JWST with its sunshield toward the Sun and an 18-segment mirror, ISS) are merged per material. They are drawn only once they are over ~1 px. Farther out, a constant-size marker dot shows where each craft is.
- **Labels and info cards for everything.** Tapping a label fills the existing info panel with launch or landing dates, crew, live distance from the Sun, one-way signal time from Earth, Parker's live speed and days to its next perihelion, and a fact. Labels use the standard `.label` style, so they get 44 px touch targets on touch screens. They are placed after `main.js`'s labels and never cover a planet's label. Among themselves they are nudged below the marker or hidden, and they hide behind the Sun, a planet or the Moon. ISS/JWST markers and labels only show near Earth.
- On a spacecraft or landing-site card, ✕ just closes the card and keeps the current view. It does not fly back to the overview. Esc and planet taps work as before.
- `index.html` scale note: one sentence on spacecraft sizes, the ISS altitude and the JWST distance.

### Notes
- The task list asked for the south pole to be marked as the Artemis III target. In 2026 NASA changed Artemis III into a 2027 Earth-orbit docking test, and the first south-pole landing is now planned for Artemis IV (2028). The marker is labelled "Artemis (planned)" and its card explains the change.

## 2026-10-11: Arrival drift stays on the day/night line at any time speed (ScaleBot)

### Fixed
- **The Earth and Moon arrival drift no longer slides to full phase.** At the default 10 days/s, Earth swings about 10° around the Sun every second. The old drift rotated a camera offset captured at arrival, so within a few seconds the view had moved off the terminator and the Moon looked nearly full. Now the drift re-reads `getCinematicStart()` every frame. The camera sits at the fresh offset times the live radius, swung about the fresh `driftAxis` by an accumulated drift angle (`driftSpeed` times real seconds). The camera targets the live body. The view therefore keeps the helper's Sun angle plus the intended slow sweep toward night, whatever the time speed.
- Any drag, pinch, wheel or tap still stops the drift for that focus, and plain follow takes over from there.
- No per-frame allocations in `main.js`. If a helper fills an `out` object (`getCinematicStart(out, opts)`), it gets a reused one. Support is checked once per helper. Today's `(opts)` helpers are called without arguments as before.

## 2026-10-11: Cinematic Earth & Moon arrivals; fly-tos track the turning galaxy (ScaleBot)

### Added
- **Cinematic arrival at Earth and the Moon.** Focusing either body (tap, list button or keyboard, anything that calls `focusOn`) now flies in with the same log-space distance move as the galaxy fly-tos, instead of the old straight-line focus move. The trip is longer when you start far away (about 4 s from the overview) and short when you are already close (about 2 s from Earth to the Moon). The goal is recomputed every frame, so the camera follows the body along its orbit.
- The flight ends on the framing suggested by `earth.getCinematicStart()` / `moon.getCinematicStart()`: about 2.8 Earth radii or 2.6 Moon radii out, with the terminator across the disc. Distances use the body's live rendered radius, so the Moon arrival follows its 0.5x to 0.273x size easing. The camera never ends inside `controls.minDistance`, which is set from the final radius on arrival.
- **Slow drift after arrival.** The view then drifts across the terminator at the helper's `driftSpeed` (0.02 rad/s for Earth, 0.015 rad/s for the Moon, in real time). Any drag, pinch, wheel or tap stops the drift for the rest of that focus, and so does touching the controls during the flight.
- Other planets and moons keep the old focus move. Earth and the Moon also fall back to it if their helper is missing.

### Changed
- `flyTo` / `flyToFixed` accept functions for `goalCam` and `goalTarget`. A function goal is re-evaluated every frame, so a fly-to can track a moving goal. Existing Vector3 callers work unchanged, and the duration is still worked out from the starting goal.
- The first stage of `exitGalaxy` (the dive to the Sun marker) now tracks `galaxy.sunWorldPos()` live, so the camera lands on the Sun's current position in the turning Milky Way rather than where it was at take-off. The galaxy currently pauses its spin while a fly-to runs (it only turns in `galaxy` mode), so today this guards against future changes; you won't see a difference yet. `enterGalaxy` already starts from the Sun's position at the moment of the scene swap and then flies to the fixed galaxy view, so it needed no change.
- `window.solar` gains `isDrifting()` and `getTransitionInfo()` for tests.

## 2026-10-11: Longer, log-scale fly-to animations (ScaleBot)

### Changed
- Scripted fly-tos (`flyTo` in `main.js`) now move the camera's distance to its target in log space, so every factor of ten gets equal screen time instead of racing through the near part of a huge jump like the one to TON 618. The view direction blends smoothly between the start and end angles.
- Fly-tos last longer the farther they travel: the `duration` each caller passes is now a minimum, and each stage gets about 1.5 s per factor of ten zoomed plus a little extra for moving across the view, capped at 9 s per stage. Short hops stay quick.
- The two stages timed against the fade to black between the Solar System and the galaxy keep their old lengths (`flyToFixed`) so the fade still lines up. Tapping a planet still uses the older focus move.
## 2026-10-11: Galaxy animations and label cleanup

### Added
- **The Milky Way turns.** The disk now rotates about the galactic center once every ~10 minutes (it was ~4 minutes). The rotation is clockwise as seen from the north galactic pole, so the arms trail. It is rigid, like the real spiral pattern (a density wave that turns as a whole). Differential star motion at this speed-up would wind the arms up within minutes. The Sun marker, nebulae, star clusters and their labels all ride along, so "You are here" stays in the Orion Spur. The rotation eases to a stop when the camera gets within ~450 units of the center, so the **Sgr A\* close-up stays perfectly steady**. All fly-tos read live positions: the Sun comes from `galaxy.sunWorldPos()`, Sgr A\* sits on the axis, and Andromeda, Sombrero and TON 618 are in the non-rotating scene.
- **Andromeda and the Sombrero spin slowly** about their own disk axes (~15 minutes per turn, trailing arms). The Sombrero rotates its `disk` group, and the depth-slab direction is recomputed from `disk.matrixWorld` every frame, so the dust-lane layering stays correct. Both pause with the Milky Way (time paused, or mid-flight). TON 618's jets are unchanged.
- **Nebulae breathe.** Every emission-nebula sprite gently pulses in size (±7%) and brightness (±~19%). Each sprite has its own phase and rate, so a cloud's puffs drift in and out of step. Round core glows pulse at 40%, and dust clouds stay still.
- Everything is time-based (seconds, frame-rate independent) and uses uniforms only: a group rotation, a quaternion and one shared `uTime` uniform. There are no per-particle CPU loops, so it stays cheap on iPad.

### Fixed
- **Overlapping galaxy labels.** A screen-space declutter pass runs inside the galaxy render, after every module's update and right before the CSS2D labels are drawn. It needed no `main.js` change. Labels are placed in priority order: Sun, Milky Way, Andromeda, Sombrero, Sgr A\*, then dwarf companions, named nebulae/clusters, and distance captions. A lower-priority label that overlaps one already placed, or the pulsing "You are here" ring, is nudged just above, below or beside it. If no slot is free nearby, it is hidden. Nudged labels stay clickable.
  - Default galaxy view: the **M4** label no longer sits on the "You are here" ring.
  - Near the Sun: the **Sun** label no longer covers the **Orion Nebula** label.
  - Far zoom-out: the **Milky Way** and **Andromeda** labels are stacked instead of on top of each other, and the "≈ 31 million light-years" caption moves clear of them.

## 2026-10-11: Moving clouds on Venus, Jupiter, Saturn and Neptune

### Added
- **Jupiter and Saturn: bands that flow at different speeds** (`planets/index.js`). Each latitude drifts at its own zonal wind speed, built from Gaussian jets in m/s: alternating east/west jet streams, with a fast prograde equatorial band (Jupiter about +100 m/s, Saturn about +400 m/s). The drift is shown flow-map style: two phase-offset texture samples crossfaded with a triangle weight. No feature is displaced more than 2.5% of the map width per cycle, so bands never smear endlessly and there is no seam.
- **The Great Red Spot rolls with its band.** Jupiter's GRS band (about 40 m/s westward) is a rigid offset that never resets, so the spot and its band travel all the way around the planet. A soft mask around the spot keeps the vortex intact instead of letting the neighbouring jets shear it.
- **Venus: cloud-top superrotation.** The cloud deck slides westward (the same way as Venus's slow retrograde spin) at the real ratio: about 60 laps of the clouds for each turn of the solid planet (4 days vs 243 days). This uses one texture sample.
- **Neptune: a very faint band drift**: retrograde equator and prograde high latitudes, kept deliberately subtle.

### How it works
- The clock is driven by sim time with no `main.js` change. `main.js` already sets each planet's `mesh.rotation.y` from `simTime` every frame. The planet's `onBeforeRender` reads how far the mesh turned since the last frame, so clouds stop when the sim is paused, follow the time-speed slider, and move relative to the displayed (50× slowed) rotation.
- Winds relative to rotation are exaggerated so they show next to the spin: Jupiter 5×, Saturn 1.5×. Neptune is scaled down to 0.15×. Venus uses the real ratio.
- The drift rate is capped per wall-clock second (fastest band ≤ 0.04 map widths/s for Jupiter and Saturn, 0.03 for Venus, 0.01 for Neptune), so high time-warp doesn't strobe. At the default 10 days/s nothing is capped.
- iPad cost: at most two texture samples (Jupiter, Saturn, Neptune), one on Venus, and about a dozen `exp()` calls for the wind profile. Mercury and Uranus shaders are unchanged. The procedural fallback maps also drift (set to repeat-wrap).

## 2026-10-11: Sun glow no longer draws a band at the screen edge

### Fixed
- The Sun's two glow sprites (`main.js`) fade out when the Sun is far off to the side of the view. Before, a sprite near the screen edge projected to a giant straight-edged warm band when the Sun was about 85° off-axis. Their opacity is now multiplied by smoothstep(cos 75°, cos 55°, camera forward · direction to the Sun), so the glow is full within 55° of the view axis and gone beyond 75° or behind. The base opacities (including the close-up dimming) are unchanged.
- The glow sprites now set `depthTest: true` explicitly, so a planet in front of the Sun hides the glow instead of it washing over the planet's night side.

## 2026-10-10: Moons of Saturn, Uranus & Neptune

### Added
- **Saturn's seven major moons** (new module `outermoons.js`). Each has its own detailed surface generated in code and baked once on the GPU into a color map plus a height (bump) map, like the Galilean moons.
  - **Mimas**: cratered ice with the giant Herschel crater and its central peak (the "Death Star" look).
  - **Enceladus**: the whitest surface in the solar system, fractured plains and the four bluish "tiger stripe" fissures at the south pole.
  - **Tethys**: icy and cratered, with the huge Odysseus basin and the Ithaca Chasma canyon running most of the way around.
  - **Dione** and **Rhea**: cratered leading sides and darker trailing sides streaked with bright ice cliffs ("wispy terrain"). Rhea has the bright-rayed young crater Inktomi.
  - **Titan**: wrapped in a **hazy orange atmosphere**, a translucent sunlit shell with a bluish haze layer at the edge and a glowing ring when backlit. The dark dune seas, bright Xanadu and the northern lakes show faintly through it.
  - **Iapetus**: **two-tone**, with a coal-dark leading hemisphere (Cassini Regio), a snow-bright trailing side and its equatorial ridge. Its orbit is tilted 15.5°.
- **Uranus's five major moons**, orbiting in Uranus's **sideways (97.8°) equatorial plane**, the same plane as its rings:
  - **Miranda**: patchwork "Frankenstein" surface with three grooved coronae (including Inverness's bright chevron) and the Verona Rupes cliff.
  - **Ariel**: bright, with rift canyons that have smooth floors.
  - **Umbriel**: dark and cratered, with the bright Wunda ring.
  - **Titania**: huge fault canyons (Messina Chasmata), bright-rayed craters and the Gertrude basin.
  - **Oberon**: old, reddish and heavily cratered, with dark crater floors and Hamlet.
- **Neptune's moons**:
  - **Triton** orbits **backwards** on an orbit tilted 157°, with its **pinkish south polar cap**, dark windblown geyser streaks, bluish cap fringe and "cantaloupe" terrain.
  - **Proteus**: a dark, lumpy potato-shaped moon with the Pharos crater.
  - **Nereid**: a small potato-shaped moon on its real, very stretched orbit (e = 0.75). It follows Kepler's law, so it speeds up near Neptune.
- The moons are in the right order, with real relative periods (Mimas 0.94 d → Iapetus 79.3 d, Miranda 1.41 d → Oberon 13.5 d, Proteus 1.12 d, Triton 5.88 d, Nereid 360 d). Round moons are tidally locked, so the right face always leads: Iapetus's dark side, for example.
- Every moon has a faint orbit ring (toggled with "Orbits"), a label, and a finger-sized tap zone. Each also has an info panel with real facts: size, distance from its planet, orbital period, rotation and a fun fact.
- They are folded under Saturn (7), Uranus (5) and Neptune (3) in the body list.

### Changed
- **Focusing Saturn, Uranus or Neptune** frames the moon system from ~40° above, like Mars and Jupiter. Neptune is framed on Proteus and Triton, and Nereid swings out of the frame at the far end of its orbit.
- **Scaling.** Moon sizes are enlarged the same way as Jupiter's. Distances are compressed logarithmically, so each system fits between the planets while keeping the order and spacing. The innermost moons sit just outside Saturn's and Uranus's rings. Motion is slowed 30× so the moons don't blur. The scaling note explains this.
- `main.js`: one import and one `createOuterMoons(...)` call in the planet loop, next to `planets/`' `createPlanetRing(...)` calls. `moons.js` now exports `bake`, `POTATO` and `GLSL_COMMON` for reuse. The `planets/`, `earth/`, `moon/` and `mars/` modules are untouched.

### Fixed
- **Moons no longer steal taps meant for their planet** in the overview. With 15 new moons around Saturn, Uranus and Neptune, a tap just off a planet's edge could pick a tiny moon. Picking now has a third step: when a moon's planet isn't focused and the planet is also within reach, the planet wins if the finger is at the planet's edge or isn't right on the moon. Focused systems still use nearest-center picking with the moon boost.
- A label tap can only be redirected to a planet whose visible disc is under the finger (as with the Sun's label over Mars). A tiny moon or asteroid that happens to sit under a label no longer steals the tap.

### Performance
- On iPad and phones the surface maps are 512×256 for big moons and 256×128 for small ones (1024×512 / 512×256 on desktop), with fewer sphere segments. All maps are baked once at startup.
- Titan's haze is one extra draw call. Moon motion is a few lines of math per frame.

## 2026-10-10: Mars night side matches the new scene ambient

### Changed
- `mars/`: lowered Mars's built-in ambient from 0.03 to 0.013 to match the scene's AmbientLight dropping from 0.12 to 0.04 (in 45c0fb6). Mars's night side is now as dark as the other planets'.

## 2026-10-10: Planets pass 1: real maps, atmosphere rims, sun-lit Saturn rings

New module `planets/` (Mars, Earth and the Moon are untouched; they have their own modules).

### Added
- **Real texture maps** for Mercury (NASA MESSENGER mosaic), Venus cloud tops, Jupiter (NASA Cassini PIA07782), Saturn, Uranus and Neptune (Solar System Scope, CC BY 4.0), in `textures/planets/`: 2048×1024 on desktop (≈1.1 MB in total) and 1024×512 on touch devices such as iPad (≈0.3 MB). The procedural map shows until a file loads, and stays if it fails. Sources and processing: `textures/planets/SOURCES.md`.
- **Saturn's rings are lit by the Sun:** a real ring color/opacity strip (C, B and A rings, Cassini Division, Encke Gap) with these effects:
  - The lit face reflects sunlight. The unlit face lets light through, so thin rings glow and the dense B ring goes dark.
  - The **planet's shadow falls on the rings**.
  - The rings brighten slightly (**forward scattering**) when the Sun is behind them.
- **The rings' shadow falls on Saturn:** the striped band of shade across the hemisphere facing away from the Sun.
- **Atmosphere rims** that glow only on the sunlit limb and fade across the terminator: thick yellow-white on Venus, faint and warm on Jupiter and Saturn, soft cyan on Uranus and blue on Neptune. Mercury has none (it has no air).

### Changed
- Uranus' rings use the same lit ring shader (sunlight and the planet's shadow; its procedural strip is unchanged).
- Saturn's rings now run from 1.17 to 2.35 Saturn radii (was 1.25–2.35), matching the real ring strip. All ring and atmosphere sizes are multiples of the planet's drawn radius, so they stay in proportion with the √diameter planet sizing.
- **Darker night sides:** the global ambient light is lowered from 0.12 to 0.04, so night sides now look like night. To keep silhouettes readable, `planets/` adds a faint surface-tinted rim on the planets' night sides and a very dim camera "headlight" fill (`addNightFill`, about 4% of the Sun's light), so unlit moons, dwarf planets and Charon don't go pure black.
- `main.js` hook: one import, one `addNightFill(scene)` line after the lights, one `addPlanetFX(...)` line after each planet mesh is created (it does nothing for Earth and Mars), and the two Saturn/Uranus `makeRing` calls are replaced by `createPlanetRing(...)`.

## 2026-10-10: Mars module (mars/): real NASA/USGS maps, seasonal polar caps, dusty atmosphere

Built by **MarsBot**, following EarthBot's `earth/` pattern.

### Added
- **Real Mars surface** (new module `mars/`): USGS Viking MDIM 2.1 colour mosaic (warm-graded) with a normal map from MGS MOLA laser-altimeter topography, so Olympus Mons, the Tharsis volcanoes, Valles Marineris and Hellas show real relief that moves with the light. Both are public domain; see `textures/mars/SOURCES.md` (and `build_mars_textures.py` to rebuild them).
- **Polar ice caps** drawn by the shader, with a ragged edge and a faint frost fringe. They follow Mars' seasons: the winter cap reaches ~60° latitude and the summer one shrinks to its small residual cap. The south residual cap sits slightly off the pole, as it does on the real Mars.
- **Thin dusty atmosphere:** a butterscotch rim glow on the day side, a hint of Mars' blue sunset at the terminator, a bright forward-scattering ring when Mars is backlit, and a soft dust haze toward the day-side limb.
- **Lighting from the Sun's real position:** the shader reads `sunLight`'s world position every frame (no render-loop hook needed) and has a slightly softened, dusty terminator.
- **iPad and phones get the small texture set:** 1024×512 maps (≈ 0.19 MB) instead of 2048×1024 (≈ 1 MB), using the same `IS_TOUCH` detection as Earth.

### Changed
- `main.js`: one import and one line in the planet loop. Mars keeps its orbit, size, axial tilt and spin, and Phobos and Deimos still orbit in its tilt group. The old procedural Mars texture is only shown until the real map loads.

## 2026-10-09: Deep space: Sombrero Galaxy, Sagittarius A* and TON 618

Built by **Galaxy Builder/Coder** (deep-space batch), integrated onto the compact iPad UI and EarthBot's Earth module.

### Added
- **Sombrero Galaxy (M104)** (new module `sombrero.js`) at its true distance, ~31 million light-years (12× farther than Andromeda), and to scale (~50,000 ly across): bright bulge, dark dust lane, near-edge-on as we see it. Far away it is marked with a glow, a labeled dashed line and a smudge so you can find it. Fly there with the 🎩 button, the **S** key or by clicking its label; the info panel has its facts.
- **Sagittarius A\*** (new module `sgra.js`): the Milky Way's central black hole, enlarged so it can be seen, with a ray-traced close-up (shadow, lensed accretion disk) when you fly in. It replaces the old "Galactic center" label with a clickable "Sagittarius A\* · black hole" label. ⚫ button, **C** key (galactic Center), label click or tap on it; Esc flies back out.
- **TON 618** (new module `ton618.js`): one of the most massive black holes known, a quasar at its light-travel distance of ~10.8 billion light-years. The trip pulls back until the Milky Way and TON 618 are both on screen (one dash per billion light-years), then glides in past the host galaxy, jets and glowing gas into an enlarged black-hole close-up with Neptune's orbit drawn to scale inside the shadow. ✴ button, **T** key, label click or tap.
- Zooming far out from the galaxy view now slides past the Local Group to a view of the Milky Way, Andromeda and the Sombrero together.

### Changed
- The Galaxy and Andromeda buttons now share **one compact view row** with the new Sombrero, Sgr A\* and TON 618 buttons. Each shows an icon above a short name and is at least 44 px tall on touch screens, and the row wraps to two lines. The button for the object you are visiting turns into "🌌 Milky Way".
- Galaxy-view camera range: far plane 200,000 → 2,000,000 units and maximum zoom-out 60,000 → 700,000 units (1 unit = 100 ly), so the Sombrero is reachable.
- Esc, the ☀ Solar System button and the Andromeda button now come home correctly from any of the new objects.
- The "≈ 2.5 million light-years" Andromeda distance label is hidden in the far Milky Way + Andromeda + Sombrero view, where it covered the Andromeda label.

### Fixed
- **The Milky Way sky band no longer shows through night sides.** Its material is now opaque-pass (`transparent: false`) with additive blending and `depthWrite: false`, so planets, Earth's night side and the Moon block it.

## 2026-10-09: Compact UI for iPad portrait & easier Moon taps

### Changed
- **Panels no longer hide planets on iPad portrait.**
  - On portrait and small screens (portrait, or shorter side under 600 px), the planet list and Controls start collapsed and Layers starts closed.
  - The list folds away after you pick a body, and rotating to landscape restores the full panels.
- **Planet list:**
  - Moons are folded under their planet, with a ▸ arrow showing how many there are.
  - Focusing a planet or one of its moons unfolds that group automatically.
  - The list is a scrollable panel capped at 78% of the screen height.
- **Controls:**
  - Galaxy and Andromeda sit in one compact row of icon + short-label buttons (it has room for more, e.g. a future Sombrero button). In the galaxy view they read ☀ Solar System / 🌌 Milky Way.
  - The checkboxes are grouped in a **🗂 Layers** disclosure as a 2-column grid: Orbits, Labels, Asteroids, Kuiper belt, Milky Way.
  - The Controls panel scrolls if it ever gets taller than the screen.
- Touch targets stay at least 44 px, including the moon-group arrows, the Layers header and each layer toggle.

### Fixed
- **The Moon is easy to tap next to Venus in the far overview.** Picking now works in two steps:
  - If the tap is well inside a body's visible disc, that body wins (the front-most one if discs overlap).
  - Otherwise the body whose center is nearest the finger wins, so a tiny moon beside a bigger planet's edge is no longer stolen by the planet.
  - Moons of the focused planet get a small priority boost.
- The galaxy view's "☀ You are here" marker now stays on top of nearby star-cluster labels (e.g. M4), so it is always tappable.

## 2026-10-09: Asteroid belt, Kuiper belt and dwarf planets update

### Added
- **Main asteroid belt** between Mars and Jupiter (new module `smallbodies.js`): ~13,000 asteroids on desktop and ~4,500 on touch devices. Each one has its own tilted, slightly eccentric Kepler orbit, so the inner ones lap the outer ones. The **Kirkwood gaps** (3:1, 5:2, 7:3 and 2:1 resonances with Jupiter) are carved out, and the belt has grey, brown and bluish rock colors.
- **Jupiter Trojans**: two swarms of asteroids sharing Jupiter's orbit, 60° ahead of and behind it, plus the Hilda group at 4 AU.
- **Kuiper belt** beyond Neptune: a sparse ring of icy bluish and reddish particles (6,000 on desktop, 2,000 on iPad). It has the dense classical belt at 42–48 AU, plutinos at 39.4 AU (in step with Neptune like Pluto) and scattered-disk objects on long, eccentric orbits.
- **Ceres** (dwarf planet) with a cratered surface and the bright salt spots of Occator crater, and **Vesta** as a lumpy 3D shape with its giant Rheasilvia basin at the south pole.
- **Pluto and Charon** as a tidally locked double world. Both circle their shared center and always show each other the same face. Pluto has its bright heart (Tombaugh Regio) and dark Cthulhu band, and Charon its reddish north pole (Mordor Macula).
- Pluto follows its **real eccentric (e = 0.25), 17°-tilted orbit**, which you can see dip inside Neptune's.
- **Eris, Haumea and Makemake** on their real tilted, stretched orbits. Haumea is egg-shaped, spins every 3.9 hours and has its ring.
- Every new body can be selected: label, info panel with real facts (diameter, distance range, orbital period, day length, fun fact), click or tap to fly there and follow it, and its own orbit line (sandy for the asteroid belt, violet for the Kuiper belt).
- The body list has **"Asteroid belt"** (Ceres, Vesta, between Mars and Jupiter) and **"Dwarf planets · Kuiper belt"** (Pluto with Charon indented, Eris, Haumea, Makemake) sections.
- **Asteroid belt** and **Kuiper belt** checkboxes in Controls.
- The scaling note explains that the belts are drawn as huge glowing dots (the real belts are mostly empty space) and that Charon's orbit is shrunk and slowed 20×.

### Changed
- Info panels can show custom distance, period and day text, used for eccentric orbits and odd shapes.
- When the taller body list would cover the bottom-left scale note, the note now slides to the right of the list.

### Performance
- Both belts are computed entirely on the GPU (one draw call each, no per-frame CPU work). iPad uses about a third of the particles, a bit bigger. Sub-pixel particles fade instead of flickering, and particle size is capped up close.
- The 900-unit zoom-out into the galaxy view still works. Eris, the farthest body, sits at about 180 units.

## 2026-10-09: Nebulae & star clusters in the galaxy view

### Added
- **Deep-space layer** (new module `deepspace.js`, wired into `galaxy.js`): glowing pink emission nebulae and dark dust clouds along the spiral arms, bright blue young-star knots, and ~150 halo globular clusters around the Milky Way.
- **Real named objects** at their true positions relative to the Sun (sizes exaggerated so they're visible): Orion Nebula, Pleiades, Eagle, Lagoon, Carina and Crab nebulae, and the globular clusters Omega Centauri, 47 Tucanae, M13, M4, M22, M15 and M3.
- Labels for these objects fade in only when you zoom near them, and are hidden in the Local Group / Andromeda view.
- The galaxy scale note mentions that nebulae and clusters are drawn larger than life.

### Performance
- 4 extra draw calls (instanced billboards + points). iPad uses about a third of the sprites and points and smaller textures.

## 2026-10-09: Solar flares & close-up Sun

### Added
- **Animated close-up Sun** (new module `sun.js`): the surface is now a live shader instead of a static texture.
  - Boiling convection granules (cellular noise that slowly churns) and drifting supergranule turbulence.
  - Sunspots with dark umbrae and filament-like penumbrae, and bright faculae toward the limb.
  - Realistic limb darkening (the edge is dimmer and redder) and a thin reddish chromosphere rim.
- **Prominences:** glowing magnetic loops arching off the surface (11 on desktop, 6 on iPad). Plasma threads stream along them, they writhe gently, and they fade out and re-form elsewhere every 20–40 s. Loops prefer the limb, so they stand out against space.
- **Solar flares:** every ~5–13 s a random eruption fires near the limb, with a bright flash, a local surface brightening, and plasma blasting out and falling back. About 30% of flares launch a **CME**, a wider, faster particle burst that keeps expanding outward and fades.
- The Sun's info panel now mentions prominences, flares and CMEs.

### Performance
- Level of detail: the effects only exist near the Sun. They fade in when the camera is within ~110 units and are fully on at the Sun focus distance; farther out they're hidden and nothing is updated. Granulation is only computed within 100 units.
- iPad uses fewer loops, plasma particles (40 vs 90 per loop) and flare particles (260 vs 700), and a cheaper surface detail layer.
- The Sun's big glow sprites dim when you're close, so the surface detail shows.

## 2026-10-09: Andromeda Galaxy & Local Group

### Added
- **Andromeda Galaxy (M31)** in the galaxy view, built from particles: 140,000 stars and 14,000 dust particles on desktop, 50,000 and 5,000 on touch devices.
  - About 220,000 light-years across, roughly twice the Milky Way.
  - A big, bright yellowish bulge, two tightly wound spiral arms and its famous slightly off-center "10 kpc" star-forming ring with pink HII regions.
  - Dark dust lanes along the arms and ring, bluish outer arms and a faint outer disk.
  - Tilted 77° from face-on as seen from the Milky Way, so it looks like the classic long oval from photos.
- **Companions M32 and M110**, small elliptical galaxies in roughly their photo positions.
- **True-scale distance.** Andromeda sits ~2.5 million light-years away (≈ 25 Milky Way diameters) in its real direction on the sky (galactic longitude 121°, latitude −22°). Both galaxies are drawn to scale, so from home it's just a small smudge.
- **Local Group view.** Zoom (or pinch) far out from the galaxy view and the camera eases back to show both galaxies. It adds labels and a dashed "≈ 2.5 million light-years" line.
- **🔭 Andromeda button** (or the `A` key), also available from the Solar System view. The camera pulls back to the Local Group, then glides in to Andromeda and opens its info panel. The info covers distance, diameter, ~1 trillion stars, approaching at ~110 km/s, merging in ~4–5 billion years ("Milkomeda") and fun facts.
- Tap Andromeda (even as a far-away smudge) to fly there.
- **Ways back:** 🌌 Back to Milky Way, `Esc`, or ☀ Solar System (which goes home via the Milky Way). Zooming all the way into Andromeda never drops you into the Solar System.
- An on-screen Local Group scale note.
- On narrow (portrait) screens, the Local Group view looks from behind the Milky Way toward Andromeda, so both stay clear of the side panels.

### Changed
- The galaxy-view camera far plane went from 20,000 to 200,000 units, and max zoom-out from 3,000 to 60,000 units.
- Galaxy particles smaller than a pixel now fade by their true area, and galaxy glows strengthen with distance. So far-away galaxies render as smooth, faint smudges instead of noisy sparkles.
- Background stars now follow the camera, so they stay "at infinity" at any zoom.

## 2026-10-09: Mars & Jupiter moons

### Added
- **Mars' moons, Phobos and Deimos**, as lumpy, potato-shaped 3D models instead of spheres. Their shapes are built in code from noise lumps and craters, with real proportions (Phobos 27×22×18 km, Deimos 15×12×11 km). Phobos has its big Stickney crater and the long grooves across its surface. Deimos is smoother and dustier.
- **Jupiter's four Galilean moons**, each with its own detailed surface generated in code and baked once on the GPU into a color map plus a height (bump) map. Maps are 1024×512 on desktop and 512×256 on touch devices.
  - **Io**: sulfur yellows and oranges, white SO₂ frost, reddish poles, and dark volcanic calderas with red plume rings (like Pele) and bright halos.
  - **Europa**: icy white, crossed by reddish-brown cracks (lineae) at several sizes with bright ridge centers, plus patches of chaos terrain and very few craters.
  - **Ganymede**: dark ancient regions and bright grooved terrain, bright-rayed young craters and frosty poles.
  - **Callisto**: dark, heavily cratered surface with bright crater speckle and the huge multi-ring Valhalla basin.
- All six moons are tidally locked (they always show the same face to their planet) and orbit in their planet's equatorial plane, in the right order. Their relative periods are real: Io 1.77 d, Europa 3.55 d, Ganymede 7.15 d, Callisto 16.7 d (the 1:2:4 resonance is visible), Phobos 7 h 39 min, Deimos 30 h 18 min.
- Each moon has a faint orbit ring (toggled with "Orbit lines"), a label, and a finger-sized tap zone. Each also has an info panel with real facts: size, distance from its planet, orbital period, rotation and a fun fact.
- Moons appear in the body list, indented under their planet.

### Changed
- **Focusing Mars or Jupiter** frames the whole moon system from ~40° above its plane, so no moon hides behind the planet. All of that system's moon labels get top priority.
- Moon sizes and orbit distances are exaggerated so they're visible. Their motion is slowed (Jupiter's moons 20×, Mars' 60×) so they don't blur; the scaling note explains this.

## 2026-10-09: Moon visibility update

### Changed
- **The Moon is now clearly visible orbiting Earth.** Its orbit radius went from 2.6× to 3.4× Earth's radius (~3.2 units), and it's drawn at half Earth's size. Both are exaggerated on purpose; the real Moon is 0.27× Earth's diameter and ~30 Earth-diameters away, which at this compressed scale would put it inside Earth. The scaling note now says so.
- The Moon has a slightly brighter orbit ring around Earth. It follows Earth and is toggled with "Orbit lines".
- **Focusing Earth** now pulls the camera back far enough to show the whole Moon orbit. Earth's and the Moon's labels are always shown together when either one is focused. In the far overview the Moon label can still hide behind Earth's, and it comes back as you zoom in.
- The Moon has a faint glow so its night side isn't pitch black. It still always shows the same face to Earth, and it laps Earth in ~2.7 s at the default 10 days/s.
- **Easier tapping of fast-moving bodies:** picking also checks where each body was over the last ~400 ms. So tapping the Moon (or anything moving quickly on screen) where you just saw it still selects it, on iPad and desktop.

## 2026-10-09: Milky Way update

### Added
- **Milky Way sky band**: a glowing band across the background sky, generated in code (shader). It's oriented realistically: the galactic plane is tilted ~60° to the ecliptic, and the galactic center is toward Sagittarius (ecliptic longitude ~266.8°). It has a brighter core and bulge, a dark "Great Rift" dust lane, soft mottling, and 9,000 extra faint stars concentrated along the band (4,000 on touch devices). It's drawn as a large inside-out sphere that follows the camera, so it stays at "infinity".
- **Milky Way toggle**: checkbox in Controls to show or hide the sky band.
- **Galaxy view**: a zoomed-out view of the whole Milky Way, built from particles: a barred spiral with 4 arms (2 major, 2 minor), a central bulge and bar, yellowish core to bluish arms, pink star-forming regions, dark dust lanes, a disk glow and an Orion Spur.
  - A pulsing **"You are here: Sun"** marker sits in the Orion Spur ~26,000 light-years from the center, plus a "Galactic center · Sgr A*" label.
  - Tap or click the galaxy (or the marker) for an info panel: diameter ~100,000 ly, ~100–400 billion stars, the Sun's distance from the center, its ~230-million-year orbit, and a fun fact.
  - Ways in: the **🌌 Galaxy view** button, the `G` key, or zooming / pinching far out past Neptune. Ways back: the **☀ Solar System** button, `Esc`, ⟲ Overview, tapping a planet in the list, or zooming / pinching all the way in.
  - Smooth transition: the camera flies out, fades to black, swaps scenes and flies in.
  - The galaxy is a separate scene with its own units (1 unit = 100 ly) and its own camera near/far range, so there are no floating-point or depth precision problems.
  - An on-screen note explains that the scale is wildly compressed.
- New module `galaxy.js`, which holds the sky band and galaxy generation.

### Changed
- Zooming out is now capped at 900 units in the Solar System view; reaching the cap opens the galaxy view.
- Touch devices draw fewer galaxy particles (26,000 instead of 65,000 stars, 3,500 instead of 9,000 dust particles).
- The info panel's row titles now change with what's selected (planet or galaxy).
- On touch devices, the hint text in Controls hides while an info panel is open, so the two panels don't overlap.

## 2026-10-09

### Added: initial build
- Three.js 0.160 scene loaded from jsDelivr through an import map (no build step)
- Glowing Sun acting as the point light, the 8 planets with proportional orbital periods, and starting positions from mean longitudes for the current date
- Code-generated planet textures, Earth's clouds and Moon, and rings for Saturn and Uranus
- Real axial tilts and day lengths (spin shown 50× slower; Venus and Uranus spin backwards)
- Faint orbit lines and a starfield
- OrbitControls for rotate, zoom and pan; click to smoothly fly to and follow a body; info panel with real data and a fun fact
- Time speed slider with pause, checkboxes for orbit lines and labels, and planet name labels (CSS2DRenderer)
- Note explaining the distance and size scaling; resizes with the window

### Changed: iPad and touch update
- Taps are told apart from drags (movement and time limits; a second finger cancels the tap)
- Easier picking: invisible enlarged hit spheres, plus a fallback that picks the nearest planet within a finger-sized distance of the tap; labels have a larger invisible tap area
- Touch gestures: one finger rotates, pinch zooms, two fingers pan. The page itself no longer zooms, scrolls, bounces, pops up a long-press menu or selects text (`touch-action`, `overscroll-behavior`, iOS gesture events blocked, `user-scalable=no`)
- Layout: collapsible planet list and controls (collapsed by default on small screens), info panel limited in height and scrollable, 44px touch targets, respects the screen's safe-area insets, separate portrait and landscape tweaks
- Touch hints appear on touch devices; keyboard shortcuts are kept for desktop
- Performance: device pixel ratio capped at 2, fewer stars (5,000 instead of 9,000) and smaller generated textures on touch devices
- Overlapping labels are hidden, keeping the more important one (selected > hovered > Sun > bigger planets)
- Relative asset paths for GitHub Pages subpaths; added `.nojekyll`, `README.md` and this changelog
