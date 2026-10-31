// Proxima b flare verify: desktop + iPad, zero console errors; flare=1 screenshot → flare.png
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.env.OUT || path.join(__dirname, '/');
const ONLY = process.env.ONLY;
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  let errs = 0;
  const views = [
    { name: 'desktop', viewport: { width: 1280, height: 800 }, touch: false, dpr: 1 },
    { name: 'ipad', viewport: { width: 820, height: 1180 }, touch: true, dpr: 2 },
  ].filter((v) => !ONLY || v.name === ONLY);

  for (const v of views) {
    const page = await (await browser.newContext({
      viewport: v.viewport, hasTouch: v.touch, isMobile: v.touch, deviceScaleFactor: v.dpr,
    })).newPage();
    const logs = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    await page.goto('http://localhost:8793/index.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.solar?.proximaB && window.solar?.alphaCen, null, { timeout: 150000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { try { document.getElementById('pause-btn')?.click(); } catch (_) {} });
    await page.keyboard.press('h');
    await page.evaluate(() => window.solar.controls?.dispatchEvent?.({ type: 'start' }));

    // Camera on Proxima b day side
    await page.evaluate(() => {
      const s = window.solar, T = s.THREE, ac = s.alphaCen;
      ac.setOn?.(true);
      const pb = ac.proximaB;
      const c = pb.getWorldPosition(new T.Vector3());
      const star = ac.proxima.getWorldPosition(new T.Vector3());
      const toStar = star.clone().sub(c).normalize();
      const need = c.length() + pb.radius * 40;
      if (s.camera.far < need) { s.camera.far = need; s.camera.updateProjectionMatrix(); }
      if (s.controls.maxDistance < need) s.controls.maxDistance = need;
      const up = new T.Vector3(0, 1, 0);
      const side = new T.Vector3().crossVectors(toStar, up).normalize();
      const elev = toStar.clone().multiplyScalar(0.55).add(side.multiplyScalar(0.7)).add(up.multiplyScalar(0.4)).normalize();
      s.camera.position.copy(c).addScaledVector(elev, pb.radius * 1.85);
      s.controls.target.copy(c).addScaledVector(toStar, pb.radius * 0.15);
      s.controls.update();
    });

    // Fallback path (no lightColor/flare yet)
    const base = await page.evaluate(() => {
      delete window.solar.alphaCen.proxima.lightColor;
      delete window.solar.alphaCen.proxima.flare;
      window.solar.proximaB.update();
      return window.solar.proximaB.stats().star;
    });
    await page.waitForTimeout(800);
    if (v.name === 'desktop') {
      await page.screenshot({ path: `${OUT}flare-off.png` });
    }

    // Simulate Space Visuals API: lightColor + flare=1
    const flared = await page.evaluate(() => {
      const T = window.solar.THREE;
      window.solar.alphaCen.proxima.lightColor = new T.Color('#ffb376');
      window.solar.alphaCen.proxima.flare = 1;
      window.solar.proximaB.update();
      const st = window.solar.proximaB.stats().star;
      const u = window.solar.proximaB.uniforms.uStarColor.value;
      const a = window.solar.proximaB.atmoUniforms.uStarColor.value;
      return { star: st, surfLen: Math.hypot(u.r, u.g, u.b), atmoLen: Math.hypot(a.r, a.g, a.b) };
    });
    await page.waitForTimeout(900);
    // Share / verify image: desktop flare.png as requested; also per-view copies
    await page.screenshot({ path: `${OUT}${v.name}-flare.png` });
    if (v.name === 'desktop') {
      await page.screenshot({ path: `${OUT}flare.png` });
    }

    const okBoost = flared.star.flare === 1 && flared.star.boost === 2;
    console.log(v.name, 'base', JSON.stringify(base), 'flared', JSON.stringify(flared), okBoost ? 'boost-ok' : 'BOOST-FAIL');
    if (!okBoost) errs += 1;
    if (logs.length) { console.log(v.name, 'LOGS:\n' + logs.join('\n')); errs += logs.length; }
    else console.log(v.name, 'no console errors/warnings');
    await page.close();
  }
  await browser.close();
  process.exit(errs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
