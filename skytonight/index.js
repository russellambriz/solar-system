// skytonight/: "Tonight's sky from Boise": a panel listing, for the night of the sim's date as seen from Boise, Idaho
// (43.615°N, 116.20°W, America/Boise time, MDT/MST):
//   • sunset, the end and start of astronomical darkness (Sun 18° down), sunrise; the Moon's phase and illumination
//   • the Moon, the five naked-eye planets and Uranus/Neptune (binoculars/telescope): rise, highest (transit) and set times,
//     highest altitude, magnitude, constellation, whether it can be seen tonight, and a plain-English "best time to look"
//   • what's coming up in the next twelve months (oppositions, greatest elongations, close conjunctions; events.js)
// Tap a row: fly there (search's own fly-to → main.js focusOn). "Mark in 3D" rings the labels of what's up tonight.
// Search: "tonight", "visible planets", "what's up"… open the panel.
// The night is local noon → next local noon of the sim date in Boise. All the astronomy is in astro.js (no DOM).
//
// Usage (main.js): createSkyTonight({ bodies, search, constellations, focusOn, realPositions, getTime: () => simTime,
//   isPaused, togglePause, isCompact, setPanelCollapsed })
import { BOISE, SKY_PLANETS, place, altAz, riseTransitSet, constellationOf, moonPhase, nextMoonPhase, compass } from './astro.js';
import { findSkyEvents } from './events.js';
import { NAMES } from '../constellations/data.js';

const DAY = 86400000, MIN = 60000, STEP = 10 * MIN;
const CON_NAME = Object.fromEntries(NAMES.map((n) => [n[0], n[1]]));
const ROWS = ['Moon', ...SKY_PLANETS];
const SCOPE = { Uranus: '🔭 Binoculars', Neptune: '🔭 Telescope' };
// how dark the sky must be (Sun altitude, °) and how high the object (°) before it counts as "visible"
const sunLimit = (name, mag) => (name === 'Moon' ? -3 : mag < -3 ? -3 : mag < 1.5 ? -6 : mag < 6.5 ? -12 : -15);
const minAlt = (name, mag) => (name === 'Moon' || mag <= 1 ? 5 : 10);
const ICONS = { tonight: { icon: '🔭', tag: 'Tonight from Boise', color: '#9dffb0' } };
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').replace(/[^a-z0-9*/+]+/g, ' ').trim();

export function createSkyTonight(o) {
  const { bodies, search, constellations, realPositions } = o;
  const tz = BOISE.tz, $ = (id) => document.getElementById(id);
  const store = { get: (k) => { try { return localStorage.getItem('solar.sky.' + k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem('solar.sky.' + k, v); } catch (e) { /* private mode */ } } };
  const byName = (n) => bodies.find((b) => b.name === n);

  // ---- time formatting (America/Boise, MDT/MST) ---------------------------------------------------------------------------
  const fTime = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const fZone = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' });
  const fDay = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
  const fYear = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' });
  const fIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fParts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const zoneOf = (ms) => fZone.formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value || '';
  const tzOffsetMin = (ms) => {
    const p = Object.fromEntries(fParts.formatToParts(ms).map((x) => [x.type, x.value]));
    return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms) / MIN);
  };
  let mixedZones = false;
  const rm = (ms) => Math.round(ms / MIN) * MIN;   // to the nearest minute, as almanacs do
  const t = (ms) => (ms == null ? '—' : fTime.format(rm(ms)).replace(' ', '\u00a0') + (mixedZones ? '\u00a0' + zoneOf(ms) : ''));
  const tz2 = (ms) => `${fTime.format(rm(ms)).replace(' ', '\u00a0')}\u00a0${zoneOf(ms)}`;

  // ---- the astronomy for one night -------------------------------------------------------------------------------------------
  function nightOf(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const t0 = Date.UTC(y, m - 1, d, 12) - tzOffsetMin(Date.UTC(y, m - 1, d, 19)) * MIN;            // local noon
    const t1 = Date.UTC(y, m - 1, d + 1, 12) - tzOffsetMin(Date.UTC(y, m - 1, d + 1, 19)) * MIN;    // next local noon
    const sun = riseTransitSet('Sun', t0, t1), astro = riseTransitSet('Sun', t0, t1, BOISE, -18);
    const dusk = sun.set ?? t0 + 6 * 3600000, dawn = sun.rise ?? t1 - 6 * 3600000;
    const samples = [];
    for (let ts = Math.ceil(dusk / STEP) * STEP; ts <= dawn; ts += STEP) samples.push({ ts, sunAlt: altAz(place('Sun', ts), ts).alt });
    const rows = ROWS.map((name) => {
      const rts = riseTransitSet(name, t0, t1);
      let best = null, first = null, last = null, okCount = 0, everUp = false;
      const mid = place(name, (dusk + dawn) / 2);
      for (const s of samples) {
        const p = place(name, s.ts), h = altAz(p, s.ts);
        if (h.alt > 0) everUp = true;
        if (s.sunAlt <= sunLimit(name, p.mag) && h.alt >= minAlt(name, p.mag) && (name === 'Moon' || p.elong >= 8)) {
          okCount++; if (first === null) first = s.ts; last = s.ts;
          // best: highest while the sky is properly dark (Sun 12° down), else highest in twilight
          const dark = s.sunAlt <= -12;
          if (!best || (dark && !best.dark) || (dark === best.dark && h.alt > best.alt)) best = { ts: s.ts, alt: h.alt, az: h.az, p, dark };
        }
      }
      const at = best ? best.p : place(name, rts.transit ?? (dusk + dawn) / 2);
      const con = constellationOf(at.ra, at.dec, at.T);
      return { name, rts, best, first, last, okCount, everUp, mag: at.mag, elong: mid.elong, con, conName: CON_NAME[con] || con,
        visible: !!best, scope: SCOPE[name] || null, line: bestLine(name, best, first, last, okCount, samples, dusk, dawn, mid, everUp) };
    });
    const ph = moonPhase((dusk + dawn) / 2);
    const nextFull = nextMoonPhase(t0, 180), nextNew = nextMoonPhase(t0, 0);
    mixedZones = zoneOf(t0) !== zoneOf(t1);
    return { iso, t0, t1, sun, astro, dusk, dawn, rows, ph, nextFull, nextNew, zone: zoneOf(dusk) };
  }

  function bestLine(name, best, first, last, n, samples, dusk, dawn, mid, everUp) {
    if (!best) {
      if (name !== 'Moon' && mid.elong < 15) return `Too close to the Sun tonight (${mid.elong.toFixed(0)}° away), lost in the glare.`;
      if (!everUp) return 'Below the horizon all night: only up in daylight.';
      return name === 'Moon' ? 'Only up in daylight or twilight tonight.' : 'Too low in twilight to see well tonight.';
    }
    const altWord = best.alt < 15 ? 'low' : best.alt < 40 ? 'halfway up' : 'high';
    const dir = compass(best.az), at = t(best.ts);
    if (n >= samples.length * 0.8) return `All night; highest around ${at}, ${altWord} in the ${dir}.`;
    const afterDusk = (best.ts - dusk) / 3600000, beforeDawn = (dawn - best.ts) / 3600000;
    const hour = +fParts.formatToParts(best.ts).find((p) => p.type === 'hour').value;
    let when, tail = '';
    if (afterDusk < 2.5) { when = 'Evening'; if (best.alt < 20 && (first - dusk) < 75 * MIN) tail = ' after sunset'; }
    else if (beforeDawn < 2.5) { when = 'Before dawn'; if (best.alt < 20 && (dawn - last) < 75 * MIN) tail = ' before sunrise'; }
    else {
      const m = +fParts.formatToParts(best.ts).find((p) => p.type === 'minute').value, fromMidnight = ((hour + 12) % 24 - 12) * 60 + m;
      when = Math.abs(fromMidnight) <= 45 ? 'Around midnight' : hour >= 12 ? 'Late evening' : 'After midnight';
    }
    const span = first !== last ? ` (visible ${t(first)}–${t(last)})` : '';
    return `${when}, ${altWord} in the ${dir}${tail}: best around ${at}${span}.`;
  }

  // ---- DOM ------------------------------------------------------------------------------------------------------------------
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = new URL('./skytonight.css', import.meta.url).href;
  document.head.appendChild(css);

  const openBtn = document.createElement('button');
  openBtn.type = 'button'; openBtn.id = 'sky-tonight-btn'; openBtn.className = 'sky-open-btn';
  openBtn.title = "What's up tonight from Boise: planets, Moon, rise and set times";
  openBtn.innerHTML = '<span class="ico">🔭</span><span>Tonight’s sky from Boise</span>';
  const anchor = $('moon-phase') || document.querySelector('#controls .date-row');
  if (anchor) anchor.after(openBtn); else document.querySelector('#controls .panel-body')?.appendChild(openBtn);

  const panel = document.createElement('div');
  panel.id = 'sky-tonight'; panel.className = 'panel hidden';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'sky-title');
  panel.innerHTML = `
    <div class="panel-head">
      <h2 id="sky-title">🔭 Tonight from Boise</h2>
      <div class="sky-head-btns">
        <button type="button" class="collapse-btn sky-collapse" aria-label="Fold or unfold the sky panel" aria-expanded="true">▾</button>
        <button type="button" class="sky-close" aria-label="Close the sky panel" title="Close">✕</button>
      </div>
    </div>
    <div class="panel-body sky-body scrollable">
      <div class="sky-when"><span class="sky-date"></span><button type="button" class="sky-now" title="Jump the sim to now and pause it">📍 Now</button></div>
      <div class="sky-running hidden">⏩ Time is running, so the night keeps changing. Tap <b>📍 Now</b> or pause.</div>
      <div class="sky-sun"></div>
      <div class="sky-moon"></div>
      <div class="sky-list" role="list"></div>
      <label class="toggle sky-mark"><input type="checkbox" id="sky-mark" /> Mark what’s up tonight on the 3D labels</label>
      <details class="sky-events"><summary>📅 Coming up (next 12 months)</summary><div class="sky-ev-list"></div></details>
      <p class="sky-foot"></p>
    </div>`;
  document.body.appendChild(panel);
  const q = (s) => panel.querySelector(s);
  const elDate = q('.sky-date'), elSun = q('.sky-sun'), elMoon = q('.sky-moon'), elList = q('.sky-list'), elRun = q('.sky-running');
  const elEv = q('.sky-ev-list'), evBox = q('.sky-events'), mark = q('#sky-mark'), foot = q('.sky-foot'), colBtn = q('.sky-collapse');
  mark.checked = store.get('mark') === '1';   // off by default: the default view stays as it was
  foot.innerHTML = `${BOISE.lat.toFixed(3)}°N, ${Math.abs(BOISE.lon).toFixed(2)}°W. Worked out from this sim’s own planet ephemeris (JPL elements) and Meeus’s Moon; ` +
    'checked against JPL Horizons, rise/set within ~1 min. “Visible” = above 5–10° while the sky is dark enough for its brightness. Tap a row to fly there.';

  let open = false, night = null, shownIso = null, events = null, eventsIso = null, lastEvAt = 0, lastNightAt = 0;
  const isoNow = () => fIso.format(o.getTime ? o.getTime() : Date.now());

  function goTo(name) {
    const b = byName(name);
    if (!b) return;
    const e = search?.entries?.find((x) => x.body === b);
    if (o.isCompact?.() && window.innerWidth < 600) setCollapsed(true);
    if (e) e.go(); else o.focusOn?.(b);
  }
  function holdNow(ms) {
    realPositions?.jumpTo(ms);
    if (o.isPaused && !o.isPaused()) o.togglePause?.();
  }

  function render() {
    if (!night) return;
    const n = night;
    elDate.textContent = `${fDay.format(n.t0 + 6 * 3600000)} → ${fDay.format(n.t1 - 6 * 3600000)}, ${fYear.format(n.t0)} · times in ${mixedZones ? 'MDT/MST' : n.zone}`;
    elSun.innerHTML = `<span title="Sunset">🌇 Sunset <b>${t(n.sun.set)}</b></span><span title="Astronomical twilight ends: the Sun is 18° down">🌌 Dark <b>${t(n.astro.set)}</b>–<b>${t(n.astro.rise)}</b></span>` +
      `<span title="Sunrise">🌅 Sunrise <b>${t(n.sun.rise)}</b></span>`;
    const full = n.nextFull ? `Full ${fDay.format(n.nextFull)}` : '', nw = n.nextNew ? `new ${fDay.format(n.nextNew)}` : '';
    elMoon.innerHTML = `<span class="sky-moon-emoji">${n.ph.emoji}</span><span>Moon: <b>${n.ph.name}</b>, ${Math.round(n.ph.illum * 100)}% lit</span>` +
      `<span class="sky-moon-next">${[n.nextFull < n.nextNew ? full : nw, n.nextFull < n.nextNew ? nw : full].filter(Boolean).join(' · ')}</span>`;
    elList.innerHTML = '';
    for (const r of n.rows) {
      const b = byName(r.name), color = b?.info?.color || '#cfd8ee';
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'sky-row' + (r.visible ? ' up' : ' down'); row.setAttribute('role', 'listitem');
      row.dataset.name = r.name;
      const badge = r.visible ? (r.scope ? `<span class="sky-badge scope">${r.scope}</span>` : '<span class="sky-badge ok">✓ Up tonight</span>')
        : '<span class="sky-badge no">Not tonight</span>';
      const hi = r.rts.transit != null ? `${t(r.rts.transit)} (${Math.max(0, r.rts.transitAlt).toFixed(0)}°)` : '—';
      row.innerHTML = `<div class="sky-r1"><span class="dot" style="background:${color}"></span><b class="nm">${r.name}</b>` +
        `<span class="sky-mag" title="Apparent magnitude (smaller is brighter)">mag ${r.mag.toFixed(1).replace('-', '−')}</span>` +
        `<span class="sky-con" title="Constellation">in ${r.conName}</span>${badge}</div>` +
        `<div class="sky-r2"><span>Rise <b>${t(r.rts.rise)}</b></span><span>Highest <b>${hi}</b></span><span>Set <b>${t(r.rts.set)}</b></span></div>` +
        `<div class="sky-r3">${r.line}</div>`;
      row.addEventListener('click', () => goTo(r.name));
      elList.appendChild(row);
    }
    applyMarks();
  }

  function renderEvents() {
    if (!events) return;
    elEv.innerHTML = events.length ? '' : '<div class="sky-ev-none">Nothing in the next twelve months.</div>';
    for (const e of events) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `sky-ev ${e.type}`;
      b.innerHTML = `<span class="sky-ev-d">${fDay.format(e.ms)}</span><span class="sky-ev-t"></span><span class="sky-ev-h">${tz2(e.ms)}</span>`;
      b.querySelector('.sky-ev-t').textContent = e.title;
      b.title = `${fDay.format(e.ms)}, ${fYear.format(e.ms)}, ${tz2(e.ms)}: ${e.title}`;
      b.addEventListener('click', () => { holdNow(e.ms); setTimeout(() => goTo(e.target), 60); });
      elEv.appendChild(b);
    }
  }

  // ---- "up tonight" label marks -----------------------------------------------------------------------------------------------
  function applyMarks() {
    const on = mark.checked && !!night;
    for (const r of night?.rows || []) {
      const el = byName(r.name)?.labelEl;
      if (!el) continue;
      el.classList.toggle('sky-up', on && r.visible);
    }
    if (!on) for (const n of ROWS) byName(n)?.labelEl?.classList.remove('sky-up');
  }
  mark.addEventListener('change', () => { store.set('mark', mark.checked ? '1' : '0'); if (mark.checked && !night) refresh(true); applyMarks(); });

  // ---- refresh: when the sim's local date changes --------------------------------------------------------------------------------
  function refresh(force = false) {
    if (!open && !mark.checked) return;
    const iso = isoNow();
    // closed but marking labels: follow the date at most every 2 s (one night is ~10 ms of maths)
    if (!open && !force && performance.now() - lastNightAt < 2000) return;
    if (force || iso !== shownIso) {
      shownIso = iso; lastNightAt = performance.now();
      try { night = nightOf(iso); render(); } catch (err) { console.warn('skytonight', err); }
    }
    const running = o.isPaused ? !o.isPaused() : false;
    elRun.classList.toggle('hidden', !running);
    // the 12-month list: only while it's open, at most once a second
    if (open && evBox.open && iso !== eventsIso && performance.now() - lastEvAt > 1000) {
      eventsIso = iso; lastEvAt = performance.now();
      try { events = findSkyEvents(night.t0, 365, tz); renderEvents(); } catch (err) { console.warn('skytonight events', err); }
    }
  }
  setInterval(refresh, 300);
  evBox.addEventListener('toggle', () => refresh());

  // ---- open / close / fold, and sharing the left column with the planet list -------------------------------------------------
  const nav = $('nav-panel');
  function setCollapsed(c) {
    panel.classList.toggle('collapsed', c);
    colBtn.setAttribute('aria-expanded', String(!c));
    if (!c && nav && !nav.classList.contains('collapsed')) o.setPanelCollapsed?.('nav-panel', true);
    layout();
  }
  function setOpen(v) {
    open = v;
    panel.classList.toggle('hidden', !v);
    openBtn.classList.toggle('active', v);
    if (v) {
      if (o.isCompact?.()) o.setPanelCollapsed?.('controls', true);
      setCollapsed(false);
      refresh(true);
    } else applyMarks();
  }
  function layout() {
    if (!open) return;
    const navBottom = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().bottom : 0;
    const bottomGap = parseFloat(getComputedStyle(panel).bottom) || 0;
    panel.style.maxHeight = `${Math.max(120, window.innerHeight - navBottom - 10 - bottomGap)}px`;
  }
  // the planet list unfolding folds this panel (and unfolding this panel folds the list), so they never overlap
  if (nav) new MutationObserver(() => { if (open && !nav.classList.contains('collapsed') && !panel.classList.contains('collapsed')) setCollapsed(true); layout(); })
    .observe(nav, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', layout);
  openBtn.addEventListener('click', () => setOpen(!open));
  q('.sky-close').addEventListener('click', () => setOpen(false));
  colBtn.addEventListener('click', () => setCollapsed(!panel.classList.contains('collapsed')));
  q('.sky-now').addEventListener('click', () => holdNow(Date.now()));
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } });
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  panel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

  // ---- search: "tonight", "visible planets", "what's up"… ---------------------------------------------------------------------
  if (search?.entries) {
    const aliases = ['tonight', 'sky tonight', 'tonights sky', 'visible planets', 'whats up', 'whats up tonight', 'up tonight', 'planets tonight',
      'night sky', 'stargazing', 'boise sky', 'rise and set', 'sunset', 'sunrise', 'twilight', 'conjunction', 'opposition', 'elongation', 'observing'];
    const e = { name: 'Tonight’s sky from Boise', kind: 'tonight', kindInfo: ICONS.tonight, color: ICONS.tonight.color, sub: 'Planets & Moon tonight · rise/set',
      go: () => { if (!open) setOpen(true); else setCollapsed(false); } };
    e.keys = [norm(e.name), ...aliases.map(norm)];
    search.entries.push(e);
  }

  return {
    open: () => setOpen(true), close: () => setOpen(false), toggle: () => setOpen(!open), get isOpen() { return open; },
    nightOf, findEvents: (ms, days) => findSkyEvents(ms, days, tz), get night() { return night; }, refresh: () => refresh(true),
  };
}
