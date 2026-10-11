# Changelog

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
