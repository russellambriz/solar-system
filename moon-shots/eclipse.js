// Lunar eclipse check: jump to real eclipse dates and look at the Moon from Earth's side.
//   2026-03-03 10:30 UTC  partial phase before totality (umbral mag ~0.59)
//   2026-03-03 11:34 UTC  greatest total eclipse (umbral mag ~1.15), plus the same moment with uEclipse = 0
//   2026-08-28 04:13 UTC  deep partial (umbral mag ~0.93, Moon's north edge outside the umbra)
//   2026-10-26 04:12 UTC  an ordinary full Moon: must show no shadow
const { chromium } = require('playwright');
const OUT = '/workspace/work-moonbot/moon-shots/';
const views = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, touch: false, dpr: 1 },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, touch: true, dpr: 2 },
];
const SHOTS = [
  ['partial', '2026-03-03T10:30:00Z', 1], ['total', '2026-03-03T11:34:00Z', 1], ['total-off', '2026-03-03T11:34:00Z', 0],
  ['aug28', '2026-08-28T04:13:00Z', 1], ['fullmoon', '2026-10-26T04:12:00Z', 1],
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
    page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
    await page.goto('http://localhost:8794/index.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.solar && window.solar.bodies, null, { timeout: 60000 });
    await page.evaluate(() => { const s = window.solar; s.focusOn(s.bodies.find((b) => b.name === 'Moon')); });
    await page.waitForFunction(() => !window.solar.isTransitioning(), null, { timeout: 60000 });
    await page.evaluate(() => window.solar.controls.dispatchEvent({ type: 'start' }));
    await page.evaluate(() => { if (document.getElementById('pause-btn').textContent.includes('Pause')) document.getElementById('pause-btn').click(); });
    await page.evaluate(() => { for (const el of document.body.querySelectorAll('*')) if (el.tagName !== 'CANVAS' && !el.querySelector('canvas')) el.style.visibility = 'hidden'; });
    for (const [k, [tag, iso, on]] of SHOTS.entries()) {
      let info;
      for (let pass = 0; pass < (k ? 3 : 6); pass++) {
        info = await page.evaluate(([iso, on]) => {
          const s = window.solar, T = s.THREE, b = s.bodies.find((x) => x.name === 'Moon');
          s.realPositions.jumpTo(Date.parse(iso));
          const u = b.mesh.userData.moonUniforms; u.uEclipse.value = on;
          const c = b.group.getWorldPosition(new T.Vector3());
          const e = b.parent.group.getWorldPosition(new T.Vector3()).sub(c).normalize();
          s.controls.target.copy(c);
          s.camera.position.copy(c).addScaledVector(e, b.radius * (innerHeight > innerWidth ? 4.2 : 3.0));
          s.controls.update();
          const ec = b.moon.getEclipse();
          return { type: ec.type, umbralMag: +ec.umbralMag.toFixed(3), on: u.uEclipseOn.value };
        }, [iso, on]);
        await page.waitForTimeout(pass ? 1500 : 800);
      }
      console.log(v.name, tag, JSON.stringify(info));
      await page.screenshot({ path: `${OUT}${v.name}-eclipse-${tag}.png` });
    }
    if (logs.length) { problems += logs.length; console.log(v.name, 'console:', logs.join('\n')); }
    await ctx.close();
  }
  await browser.close();
  console.log(problems ? `PROBLEMS: ${problems}` : 'clean');
})();
