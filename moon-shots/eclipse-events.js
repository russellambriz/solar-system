// Events timeline: lunar eclipses (moon/eclipse.js LUNAR_ECLIPSE_EVENTS). Lists them, then picks one from the
// "Pick an event…" menu like a user would and checks the Moon is actually in Earth's shadow on arrival.
//   EVENT=<substring of the option text>   default: the 2028-12-31 total eclipse
const { chromium } = require('playwright');
const OUT = '/workspace/work-moonbot/moon-shots/';
const views = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, touch: false, dpr: 1 },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, touch: true, dpr: 2 },
];
const PICK = process.env.EVENT || '2028 · Total lunar eclipse';
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
    await page.waitForTimeout(1500);
    const opts = await page.evaluate(() => [...document.querySelectorAll('#event-select option')].map((o) => ({ v: o.value, t: o.textContent })));
    const ecl = opts.filter((o) => /lunar eclipse/.test(o.t));
    console.log(v.name, `${ecl.length} lunar eclipses in Events:`); for (const o of ecl) console.log('  ', o.t);
    const pick = ecl.find((o) => o.t.includes(PICK)) || ecl[0];
    if (!pick) { problems++; console.log('no eclipse events'); await ctx.close(); continue; }
    if (v.touch) await page.evaluate(() => { const d = document.getElementById('events'); if (d && !d.open) d.open = true; });
    await page.evaluate((val) => { const s = document.getElementById('event-select'); s.value = val; s.dispatchEvent(new Event('change')); }, pick.v);
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => !window.solar.isTransitioning(), null, { timeout: 90000 });
    await page.waitForTimeout(3500);
    const info = await page.evaluate(() => { const b = window.solar.bodies.find((x) => x.name === 'Moon'); const e = b.moon.getEclipse();
      return { type: e.type, umbralMag: +e.umbralMag.toFixed(3), on: b.mesh.userData.moonUniforms.uEclipseOn.value, caption: document.querySelector('#events')?.textContent.match(/⏸[^\n]*/)?.[0]?.slice(0, 120) }; });
    console.log(v.name, 'picked', pick.t, JSON.stringify(info));
    if (info.type === 'none' || !info.on) { problems++; console.log('  Moon not in shadow on arrival'); }
    await page.screenshot({ path: `${OUT}${v.name}-eclipse-event.png` });
    if (logs.length) { problems += logs.length; console.log(v.name, 'console:', logs.join('\n')); }
    await ctx.close();
  }
  await browser.close();
  console.log(problems ? `PROBLEMS: ${problems}` : 'clean');
})();
