// Far-side ray craters (FAR_RAYS / uRayFar) at "full far side" (the new Moon seen from beyond it): the whole far-side
// disc, Giordano Bruno, Jackson / Moore F / Larmor Q, Ohm / Pierazzo and Necho. Each view is shot with the new rays on
// and off (uRayFar).
const { chromium } = require('playwright');
const OUT = '/workspace/work-moonbot/moon-shots/';
const views = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, touch: false, dpr: 1 },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, touch: true, dpr: 2 },
];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let problems = 0;
  for (const v of views) {
    if (process.env.ONLY && process.env.ONLY !== v.name) continue;
    const ctx = await browser.newContext({ viewport: v.viewport, hasTouch: v.touch, isMobile: v.touch, deviceScaleFactor: v.dpr });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    await page.goto('http://localhost:8794/index.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.solar && window.solar.bodies, null, { timeout: 60000 });
    await page.evaluate(() => { const s = window.solar; s.focusOn(s.bodies.find((b) => b.name === 'Moon')); });
    await page.waitForFunction(() => !window.solar.isTransitioning(), null, { timeout: 60000 });
    await page.evaluate(() => window.solar.controls.dispatchEvent({ type: 'start' }));
    const info = await page.evaluate(async () => {
      const s = window.solar, T = s.THREE, b = s.bodies.find((x) => x.name === 'Moon');
      if (document.getElementById('pause-btn').textContent.includes('Pause')) document.getElementById('pause-btn').click();
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const c = new T.Vector3(), ns = new T.Vector3();
      const score = async (ms) => { s.realPositions.jumpTo(ms); await frame(); b.group.getWorldPosition(c);
        b.moon.latLonToWorld(0, 180, 0, ns).sub(c).normalize(); return c.clone().negate().normalize().dot(ns); };
      const t0 = Date.parse('2026-10-20T00:00:00Z'); let best = t0, bestV = -2;
      for (let h = 0; h <= 30 * 24; h += 12) { const v = await score(t0 + h * 3600e3); if (v > bestV) { bestV = v; best = t0 + h * 3600e3; } }
      for (let h = -12; h <= 12; h += 1) { const v = await score(best + h * 3600e3); if (v > bestV) { bestV = v; best = best + h * 3600e3; } }
      await score(best);
      // Time the Sun stands highest over a site: the subsolar longitude runs west ~12.19 deg/day from 180 at this
      // "far side full" moment, then refine to the hour.
      window.__farFull = best;
      window.__sunOver = async (lat, lon) => {
        const sc = async (ms) => { s.realPositions.jumpTo(ms); await frame(); b.group.getWorldPosition(c);
          b.moon.latLonToWorld(lat, lon, 0, ns).sub(c).normalize(); return c.clone().negate().normalize().dot(ns); };
        let t = best + (((180 - lon + 540) % 360) - 180) / 12.19 * 86400e3, tv = -2, tb = t;
        for (let h = -12; h <= 12; h += 2) { const v = await sc(t + h * 3600e3); if (v > tv) { tv = v; tb = t + h * 3600e3; } }
        await sc(tb);
        return { date: new Date(tb).toISOString(), sunZenithDeg: +(Math.acos(Math.min(1, tv)) * 180 / Math.PI).toFixed(1) };
      };
      return { date: new Date(best).toISOString(), sunNearSideDeg: +(Math.acos(Math.min(1, bestV)) * 180 / Math.PI).toFixed(1) };
    });
    console.log(v.name, 'far side full', JSON.stringify(info));
    const k = v.viewport.height > v.viewport.width ? 1.45 : 1;
    // [tag, lat, lon, distance in Moon radii from the centre (negative = hover over the site, Sun behind the camera)]
    // sunOver = step to the time the Sun is high over that site (else stay at the far-side full moment).
    for (const [tag, lat, lon, distR, sunOver] of [['disc', 10, 180, 2.6 * k, 0], ['jackson', 24, -168, -1.1 * k, 0], ['bruno', 36, 103, -0.8 * k, 1], ['ohm', 10, -108, -1.1 * k, 1], ['necho', -5, 123, -0.9 * k, 1]]) {
      const when = await page.evaluate(async ([lat, lon, sunOver]) => {
        if (sunOver) return window.__sunOver(lat, lon);
        window.solar.realPositions.jumpTo(window.__farFull); return { date: new Date(window.__farFull).toISOString() };
      }, [lat, lon, sunOver]);
      console.log(v.name, tag, JSON.stringify(when));
      for (const on of [1, 0]) {
        for (let pass = 0; pass < 2; pass++) {
          await page.evaluate(([lat, lon, distR, on]) => {
            const s = window.solar, T = s.THREE, b = s.bodies.find((x) => x.name === 'Moon');
            b.mesh.userData.moonUniforms.uRayFar.value = on;
            const c = b.group.getWorldPosition(new T.Vector3());
            const site = b.moon.latLonToWorld(lat, lon, 0, new T.Vector3());
            if (distR < 0) { const up = site.clone().sub(c).normalize(); const look = up.add(c.clone().negate().normalize()).normalize();   // between overhead and the Sun's direction
              s.controls.target.copy(site); s.camera.position.copy(site).addScaledVector(look, -distR * b.radius); }
            else { s.controls.target.copy(c); s.camera.position.copy(c).addScaledVector(site.sub(c).normalize(), b.radius * distR); }
            s.controls.update();
          }, [lat, lon, distR, on]);
          await page.waitForTimeout(pass ? 2500 : 900);
        }
        await page.screenshot({ path: `${OUT}${v.name}-raysfar-${tag}-${on ? 'on' : 'off'}.png` });
      }
    }
    console.log(v.name, 'hiRes', await page.evaluate(() => window.solar.bodies.find((b) => b.name === 'Moon').mesh.userData.hiRes));
    console.log(logs.length ? logs.join('\n') : 'no console errors/warnings');
    problems += logs.filter((l) => !l.startsWith('[warning]')).length;
    await ctx.close();
  }
  await browser.close();
  process.exit(problems ? 1 : 0);
})();
