# Changelog

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
