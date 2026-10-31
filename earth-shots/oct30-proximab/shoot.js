// Proxima b screenshots + Earth sanity check.
// Serve the site at http://localhost:8793/ then:
//   OUT=earth-shots/oct30-proximab/ CHROME=... node earth-shots/oct30-proximab/shoot.js
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
    await page.waitForFunction(() => window.solar && window.solar.alphaCen && window.solar.proximaB, null, { timeout: 150000 });
    await page.waitForTimeout(1500);

    const info = await page.evaluate(() => {
      const s = window.solar;
      return {
        hasPB: !!s.proximaB?.mesh,
        installed: !!s.proximaB?.group?.parent,
        radius: s.proximaB?.radius,
        stats: s.proximaB?.stats?.(),
        earthOk: !!s.bodies?.find((b) => b.name === 'Earth')?.earth,
      };
    });
    console.log(v.name, 'info', JSON.stringify(info));

    // Hide UI
    await page.evaluate(() => { try { document.getElementById('pause-btn')?.click(); } catch (_) {} });
    await page.keyboard.press('h');
    await page.evaluate(() => window.solar.controls?.dispatchEvent?.({ type: 'start' }));

    // Fly / jump camera to Proxima b
    await page.evaluate(() => {
      const s = window.solar, T = s.THREE, ac = s.alphaCen;
      ac.setOn?.(true);
      const pb = ac.proximaB;
      const c = pb.getWorldPosition(new T.Vector3());
      const star = ac.proxima.getWorldPosition(new T.Vector3());
      const toStar = star.clone().sub(c).normalize();
      // Raise far plane / max distance so we can sit at the soft-capped system
      const need = c.length() + pb.radius * 40;
      if (s.camera.far < need) { s.camera.far = need; s.camera.updateProjectionMatrix(); }
      if (s.controls.maxDistance < need) s.controls.maxDistance = need;
      // Day-side three-quarter view
      const up = new T.Vector3(0, 1, 0);
      const side = new T.Vector3().crossVectors(toStar, up).normalize();
      const elev = up.clone().multiplyScalar(0.35).add(side.multiplyScalar(0.55)).add(toStar.clone().multiplyScalar(0.6)).normalize();
      s.camera.position.copy(c).addScaledVector(elev, pb.radius * 3.2);
      s.controls.target.copy(c);
      s.controls.update();
      s.proximaB?.update?.();
    });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}${v.name}-proximab-day.png` });

    // Terminator / eyeball profile (camera roughly 90° from star)
    await page.evaluate(() => {
      const s = window.solar, T = s.THREE, ac = s.alphaCen;
      const pb = ac.proximaB;
      const c = pb.getWorldPosition(new T.Vector3());
      const star = ac.proxima.getWorldPosition(new T.Vector3());
      const toStar = star.clone().sub(c).normalize();
      const up = new T.Vector3(0, 1, 0);
      let side = new T.Vector3().crossVectors(toStar, up);
      if (side.lengthSq() < 1e-6) side = new T.Vector3().crossVectors(toStar, new T.Vector3(1, 0, 0));
      side.normalize();
      const elev = side.clone().multiplyScalar(0.95).add(up.multiplyScalar(0.25)).normalize();
      s.camera.position.copy(c).addScaledVector(elev, pb.radius * 2.8);
      s.controls.target.copy(c);
      s.controls.update();
      s.proximaB?.update?.();
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}${v.name}-proximab-terminator.png` });

    // Night side
    await page.evaluate(() => {
      const s = window.solar, T = s.THREE, ac = s.alphaCen;
      const pb = ac.proximaB;
      const c = pb.getWorldPosition(new T.Vector3());
      const star = ac.proxima.getWorldPosition(new T.Vector3());
      const toStar = star.clone().sub(c).normalize();
      const away = toStar.clone().negate().add(new T.Vector3(0, 0.2, 0)).normalize();
      s.camera.position.copy(c).addScaledVector(away, pb.radius * 3.0);
      s.controls.target.copy(c);
      s.controls.update();
      s.proximaB?.update?.();
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}${v.name}-proximab-night.png` });

    // Close-up day (share image candidate)
    await page.evaluate(() => {
      const s = window.solar, T = s.THREE, ac = s.alphaCen;
      const pb = ac.proximaB;
      const c = pb.getWorldPosition(new T.Vector3());
      const star = ac.proxima.getWorldPosition(new T.Vector3());
      const toStar = star.clone().sub(c).normalize();
      const up = new T.Vector3(0, 1, 0);
      const side = new T.Vector3().crossVectors(toStar, up).normalize();
      const elev = toStar.clone().multiplyScalar(0.55).add(side.multiplyScalar(0.7)).add(up.multiplyScalar(0.4)).normalize();
      s.camera.position.copy(c).addScaledVector(elev, pb.radius * 1.85);
      s.controls.target.copy(c).addScaledVector(toStar, pb.radius * 0.15);
      s.controls.update();
      s.proximaB?.update?.();
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}${v.name}-proximab-close.png` });

    // Context: Proxima + b
    await page.evaluate(() => {
      const s = window.solar, T = s.THREE, ac = s.alphaCen;
      const c = ac.proxima.getWorldPosition(new T.Vector3());
      const pb = ac.proximaB.getWorldPosition(new T.Vector3());
      const mid = c.clone().add(pb).multiplyScalar(0.5);
      const span = c.distanceTo(pb) * 2.8 + ac.proximaB.radius * 20;
      const dir = new T.Vector3(0.4, 0.35, 0.85).normalize();
      s.camera.position.copy(mid).addScaledVector(dir, span);
      s.controls.target.copy(mid);
      s.controls.update();
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}${v.name}-proxima-system.png` });

    // Earth unaffected check
    await page.evaluate(() => {
      const s = window.solar;
      s.focusOn(s.bodies.find((b) => b.name === 'Earth'));
    });
    await page.waitForFunction(() => !window.solar.isTransitioning(), null, { timeout: 150000 }).catch(() => {});
    await page.waitForTimeout(2000);
    // If focusOn can't reach from Alpha Cen distance, hard-jump
    await page.evaluate(() => {
      const s = window.solar, T = s.THREE;
      const b = s.bodies.find((x) => x.name === 'Earth');
      const c = b.group.getWorldPosition(new T.Vector3());
      s.camera.position.copy(c).add(new T.Vector3(0, b.radius * 0.4, b.radius * 2.8));
      s.controls.target.copy(c);
      s.controls.maxDistance = Math.max(s.controls.maxDistance, 400);
      s.camera.far = Math.max(s.camera.far, 6000);
      s.camera.updateProjectionMatrix();
      s.controls.update();
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}${v.name}-earth-check.png` });

    const earthInfo = await page.evaluate(() => {
      const e = window.solar.bodies.find((b) => b.name === 'Earth')?.earth;
      return { hasEarth: !!e, hiRes: e?.textureInfo?.hiResState, airglow: e?.params?.airglow };
    });
    console.log(v.name, 'earth', JSON.stringify(earthInfo));
    if (logs.length) { console.log(v.name, 'LOGS:\n' + logs.join('\n')); errs += logs.length; }
    else console.log(v.name, 'no console errors/warnings');
    await page.close();
  }
  await browser.close();
  process.exit(errs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
