# Tasks for Claude Code

Read `CONTRIBUTING.md`, `README.md` and `CHANGELOG.md` first. Three.js 0.160, no build step (CDN import map), and it must run smoothly on iPad and iPhone Safari. Don't edit `earth/`, `moon/`, `mars/`, `planets/`, the galaxy files (`galaxy.js`, `deepspace.js`, `sombrero.js`, `sgra.js`, `ton618.js`) or the camera functions in `main.js` (`flyTo`, `updateCamera`, `focusOn`, arrival/drift). Build new modules and add only a few hook lines to `main.js`. Every new object gets a label, a tap-to-open info panel with real facts, and a Layers toggle; keep 44px touch targets. Commit each feature separately with a dated CHANGELOG entry, test headless (desktop + iPad) with zero console errors, and `git pull --rebase` before every push.

1. **`spacecraft/`**: Voyager 1 and 2, New Horizons, Parker Solar Probe and JWST at real approximate positions for the sim date.
   - ISS orbiting Earth via `body.earth.latLonToWorld(lat, lon, altitudeKm, out)`. Real altitude (~420 km) would sit on the surface at our scale, so use ~1500 km and say in the info panel that it's exaggerated.
   - Apollo landing sites on the Moon via `body.moon.latLonToWorld(lat, lon, 0, out)` every frame: Apollo 11 0.674N 23.473E, 12 3.012S 23.422W, 14 3.645S 17.471W, 15 26.132N 3.634E, 16 8.973S 15.500E, 17 20.191N 30.772E. Mark the south pole (~89.5S) as the planned Artemis III target. Hide markers when the camera is far away.
2. **Comets**: Halley and Hale-Bopp on real elliptical orbits, with ion and dust tails pointing away from the Sun that grow near perihelion.
3. **`localgroup/`**: the Large and Small Magellanic Clouds and the Triangulum Galaxy (M33) at real distances, attached only through the existing `galaxy.group` hook (match the style of `sombrero.js`).
4. **Real positions**: a date picker that places planets using Keplerian orbital elements, including eccentricity and inclination.
5. **Search and performance**: a search box that flies to any object by name. Use `focusOn(body)` for planets and moons and `flyTo(goalCam, goalTarget, duration)` for everything else (goals can be functions, so moving objects stay tracked); don't write new camera code. Add a frame-rate check that lowers particle counts on slow devices.
6. **`postfx/`**: a real background starfield from the HYG or Yale Bright Star catalog with true colors and brightness, FXAA, and a light bloom pass.
   - Apply bloom and ACES tone mapping only in the Solar System view, never in the galaxy view, because `sgra.js` and `ton618.js` use `renderer.copyFramebufferToTexture` for lensing and the Sgr A* and TON 618 close-ups must keep working.
   - Set the bloom threshold so only the Sun, city lights and the ocean glint glow, not Earth's day side or a full Moon.
   - On iPhone and iPad, run bloom at half resolution and turn it off if the frame rate drops below 45 fps. Use one hook line in `main.js`.
   - Ask the user to tell the team before pushing this one, so the Earth, Moon and galaxy owners can retune.
