// perf/index.js: frame-rate guard. Watches the real frame rate and, if the device can't keep up, thins out the big
// particle clouds (background stars, asteroid and Kuiper belts, Milky Way, Andromeda, Sombrero, Local Group…).
//
// Usage (main.js): createPerfGuard({ scenes: [scene, galaxy.scene], exclude: [sunFX.group, sgra.group, ton618.group], isTouch });
//
// How: its own requestAnimationFrame loop measures frames over 2-second windows (after a 5 s warm-up, ignoring hidden
// tabs and hitches). Below ~40 fps (~36 on touch devices) it steps down one level: 100% → 60% → 35% of the particles,
// waiting 6 s between steps; it never steps back up on its own. Thinning uses each cloud's drawRange, so nothing is rebuilt
// and "Restore" brings everything back. The first time a cloud is thinned its points are shuffled once (all attributes
// together), so a smaller draw range is an even sample of the whole cloud rather than dropping, say, the Trojans that
// smallbodies.js appends at the end of the belt. Clouds under `exclude` (animated per-point on the CPU, or effects that
// need every point) and clouds under 3,000 points are left alone.
const LEVELS = [1, 0.6, 0.35];

export function createPerfGuard({ scenes, exclude = [], isTouch = false }) {
  const FPS_LOW = isTouch ? 36 : 40;
  let level = 0, auto = true, clouds = null;
  const shuffled = new WeakSet();

  function collect() {
    const found = new Map();                       // geometry → point count (shared geometries counted once)
    const skip = new Set(exclude.filter(Boolean));
    const visit = (o) => {
      if (skip.has(o)) return;
      if (o.isPoints && o.geometry && !o.geometry.index && !o.geometry.morphAttributes?.position) {
        const n = o.geometry.attributes.position?.count || 0;
        if (n >= 3000) found.set(o.geometry, n);
      }
      for (const c of o.children) visit(c);
    };
    for (const s of scenes) if (s) visit(s);
    return [...found].map(([geometry, count]) => ({ geometry, count }));
  }
  function shuffle(geo, n) {
    let seed = 1234567;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const attrs = Object.values(geo.attributes).filter((a) => a.count === n && !a.isInterleavedBufferAttribute);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      for (const a of attrs) {
        const s = a.itemSize, arr = a.array;
        for (let k = 0; k < s; k++) { const t = arr[i * s + k]; arr[i * s + k] = arr[j * s + k]; arr[j * s + k] = t; }
      }
    }
    for (const a of attrs) a.needsUpdate = true;
  }
  function apply() {
    clouds ||= collect();
    const f = LEVELS[level];
    for (const c of clouds) {
      if (f < 1 && !shuffled.has(c.geometry)) { shuffle(c.geometry, c.count); shuffled.add(c.geometry); }
      c.geometry.setDrawRange(0, f < 1 ? Math.max(1, Math.floor(c.count * f)) : Infinity);
    }
    note.classList.toggle('hidden', level === 0);
    note.querySelector('.lv').textContent = `${Math.round(f * 100)}%`;
  }

  // small notice in the Controls panel while particles are reduced
  const note = document.createElement('div');
  note.className = 'perf-note hidden';
  note.innerHTML = '⚡ Showing <span class="lv">60%</span> of the stars and particles to keep motion smooth. <button type="button">Restore</button>';
  document.querySelector('#controls .panel-body')?.appendChild(note);
  note.querySelector('button').addEventListener('click', () => { auto = false; level = 0; apply(); });

  // frame-rate sampling
  let frames = 0, winStart = 0, started = performance.now(), last = performance.now(), lastStep = 0, fps = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = now - last; last = now;
    if (document.hidden || dt > 500) { frames = 0; winStart = now; return; }     // tab switch / hitch: restart the window
    if (!winStart) winStart = now;
    frames++;
    if (now - winStart < 2000) return;
    fps = (frames * 1000) / (now - winStart);
    frames = 0; winStart = now;
    if (auto && now - started > 5000 && now - lastStep > 6000 && fps < FPS_LOW && level < LEVELS.length - 1) {
      level++; lastStep = now; apply();
    }
  }
  requestAnimationFrame(tick);

  return {
    setLevel: (k) => { auto = false; level = Math.max(0, Math.min(LEVELS.length - 1, k)); apply(); },
    stats: () => ({ level, factor: LEVELS[level], auto, fps: Math.round(fps), clouds: (clouds ||= collect()).map((c) => c.count) }),
  };
}
