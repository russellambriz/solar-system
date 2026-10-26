// 8K colour check: closest desktop views with the streamed 8K LROC colour map vs the 4K one, plus iPad (must never load 8K).
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
    const logs = [], tex = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
    page.on('response', (r) => { if (r.url().includes('textures/moon')) tex.push(r.url().split('/textures/moon/')[1]); });
    await page.goto('http://localhost:8794/index.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.solar && window.solar.bodies, null, { timeout: 60000 });
    await page.evaluate(() => { const s = window.solar; s.focusOn(s.bodies.find((b) => b.name === 'Moon')); });
    await page.waitForFunction(() => !window.solar.isTransitioning(), null, { timeout: 60000 });
    await page.evaluate(() => window.solar.controls.dispatchEvent({ type: 'start' }));
    await page.evaluate(() => { if (document.getElementById('pause-btn').textContent.includes('Pause')) document.getElementById('pause-btn').click();
      for (const el of document.body.querySelectorAll('*')) if (el.tagName !== 'CANVAS' && !el.querySelector('canvas')) el.style.visibility = 'hidden'; });
    const place = (ang, distR) => page.evaluate(([ang, distR]) => {
      const s = window.solar, T = s.THREE, b = s.bodies.find((x) => x.name === 'Moon');
      const p = b.group.getWorldPosition(new T.Vector3());
      const toSun = p.clone().negate().setY(0).normalize();
      const dir = toSun.applyAxisAngle(new T.Vector3(0, 1, 0), ang).add(new T.Vector3(0, 0.15, 0)).normalize();
      s.controls.target.copy(p); s.camera.position.copy(p).addScaledVector(dir, b.radius * distR); s.controls.update();
    }, [ang, distR]);
    // Fly close and let the 4K set, then (desktop) the 8K colour map, stream in.
    for (let i = 0; i < 3; i++) { await place(0.7, 1.55); await page.waitForTimeout(1500); }
    const state = () => page.evaluate(() => { const ud = window.solar.bodies.find((b) => b.name === 'Moon').mesh.userData; return { hiRes: ud.hiRes, colour8k: ud.colour8k }; });
    if (!v.touch) await page.waitForFunction(() => window.solar.bodies.find((b) => b.name === 'Moon').mesh.userData.colour8k === 'loaded', null, { timeout: 180000 }).catch(() => {});
    else await page.waitForTimeout(4000);
    const st = await state();
    console.log(v.name, JSON.stringify(st), 'moon textures:', tex.join(', '));
    if (v.touch && (st.colour8k || tex.some((t) => /4k|8k/.test(t)))) { console.log('FAIL: iPad loaded hi-res maps'); problems++; }
    if (!v.touch && st.colour8k !== 'loaded') { console.log('FAIL: 8K colour map did not load'); problems++; }
    if (!v.touch) await page.evaluate(() => new Promise((res) => { const s = window.solar;
      const t = new s.THREE.TextureLoader().load('textures/moon/moon_color_4k.jpg', () => res());
      t.colorSpace = s.THREE.SRGBColorSpace; t.wrapS = s.THREE.RepeatWrapping; t.anisotropy = 8; window._c4 = t;
      window._c8 = s.bodies.find((b) => b.name === 'Moon').mesh.userData.moonUniforms.uMap.value; }));
    for (const [tag, ang, distR] of [['hisun', 0.7, 1.55], ['terminator', 1.3, 1.52]]) {
      for (const k8 of v.touch ? [1] : [1, 0]) {
        await page.evaluate((k8) => { if (window._c8) window.solar.bodies.find((b) => b.name === 'Moon').mesh.userData.moonUniforms.uMap.value = k8 ? window._c8 : window._c4; }, k8);
        for (let pass = 0; pass < 2; pass++) { await place(ang, distR); await page.waitForTimeout(pass ? 3000 : 800); }
        await page.screenshot({ path: `${OUT}${v.name}-c8k-${tag}${k8 ? '' : '-4k'}.png` });
      }
    }
    console.log(logs.length ? logs.join('\n') : 'no console errors/warnings');
    problems += logs.filter((l) => !l.startsWith('[warning]')).length;
    await ctx.close();
  }
  await browser.close();
  process.exit(problems ? 1 : 0);
})();
