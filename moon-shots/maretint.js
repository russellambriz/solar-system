// Mare colour at full Moon: whole disc, Serenitatis / Tranquillitatis (brown vs blue maria), Imbrium / Aristarchus
// plateau / Procellarum. Each view is shot with the tint on (uMareTint 3) and off (1 = the LROC map as is).
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
        b.moon.latLonToWorld(0, 0, 0, ns).sub(c).normalize(); return c.clone().negate().normalize().dot(ns); };
      const t0 = Date.parse('2026-10-20T00:00:00Z'); let best = t0, bestV = -2;
      for (let h = 0; h <= 30 * 24; h += 12) { const v = await score(t0 + h * 3600e3); if (v > bestV) { bestV = v; best = t0 + h * 3600e3; } }
      for (let h = -12; h <= 12; h += 1) { const v = await score(best + h * 3600e3); if (v > bestV) { bestV = v; best = best + h * 3600e3; } }
      await score(best);
      return { date: new Date(best).toISOString(), sunNearSideDeg: +(Math.acos(Math.min(1, bestV)) * 180 / Math.PI).toFixed(1) };
    });
    console.log(v.name, 'full Moon', JSON.stringify(info));
    const k = v.viewport.height > v.viewport.width ? 1.45 : 1;
    // [tag, lat, lon, distance in Moon radii from the centre (negative = hover over the site, Sun behind the camera)]
    for (const [tag, lat, lon, distR] of [['disc', 0, 0, 2.6 * k], ['seren', 18, 24, -1.4 * k], ['imbrium', 28, -38, -1.4 * k]]) {
      for (const on of [3, 1]) {
        for (let pass = 0; pass < 2; pass++) {
          await page.evaluate(([lat, lon, distR, on]) => {
            const s = window.solar, T = s.THREE, b = s.bodies.find((x) => x.name === 'Moon');
            b.mesh.userData.moonUniforms.uMareTint.value = on;
            const c = b.group.getWorldPosition(new T.Vector3());
            const site = b.moon.latLonToWorld(lat, lon, 0, new T.Vector3());
            if (distR < 0) { s.controls.target.copy(site); s.camera.position.copy(site).addScaledVector(c.clone().negate().normalize(), -distR * b.radius); }
            else { s.controls.target.copy(c); s.camera.position.copy(c).addScaledVector(site.sub(c).normalize(), b.radius * distR); }
            s.controls.update();
          }, [lat, lon, distR, on]);
          await page.waitForTimeout(pass ? 2500 : 900);
        }
        await page.screenshot({ path: `${OUT}${v.name}-mare-${tag}-${on > 1 ? 'on' : 'off'}.png` });
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
