# Changelog

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
