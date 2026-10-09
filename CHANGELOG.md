# Changelog

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
