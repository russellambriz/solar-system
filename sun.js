// Close-up Sun effects: animated surface (granulation, sunspots, limb darkening), magnetic-loop prominences,
// and random solar flares with plasma ejections / small CMEs. Everything here only runs when the camera is near
// the Sun (LOD); far away the surface shader drops to a cheap path and all extras are hidden.
import * as THREE from 'three';

const NOISE = /* glsl */`
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------
function surfaceMaterial(isTouch, spots) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uDetail: { value: 0 },
      uSpots: { value: spots },
      uFlarePos: { value: new THREE.Vector3(1, 0, 0) }, uFlare: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vObj; varying vec3 vN; varying vec3 vView;
      void main() {
        vObj = normalize(position);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uDetail, uFlare; uniform vec4 uSpots[8]; uniform vec3 uFlarePos;
      varying vec3 vObj; varying vec3 vN; varying vec3 vView;
      ${NOISE}
      // cellular (Worley) noise → convection granules: bright cell centers, dark lanes between them
      vec2 worley(vec3 p) {
        vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
        for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec3 g = vec3(x, y, z); vec3 o = hash33(i + g);
          o = 0.5 + 0.45 * sin(uTime * 0.35 + 6.2831 * o);        // granules slowly churn
          float d = length(g + o - f);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        return vec2(d1, d2);
      }
      void main() {
        vec3 p = vObj;
        float mu = clamp(dot(normalize(vN), vView), 0.0, 1.0);
        // large-scale turbulence (supergranulation), drifting
        float t = uTime * 0.03;
        float turb = fbm(p * 3.0 + vec3(t, -t * 0.7, t * 0.4));
        float heat = 0.55 + 0.45 * turb;
        if (uDetail > 0.5) {
          vec3 q = p * 64.0 + (turb - 0.5) * 2.4;
          vec2 w = worley(q);
          float gran = smoothstep(0.0, 0.22, w.y - w.x);           // ~0 in the thin dark intergranular lanes
          heat *= mix(0.74, 1.06, gran) * (1.08 - 0.22 * w.x);     // granules brightest at their centers
          heat *= 0.85 + 0.3 * fbm(p * 14.0 - uTime * 0.02);       // supergranule-scale brightness variation
          ${isTouch ? '' : 'heat *= 0.93 + 0.14 * vnoise(p * 140.0 + uTime * 0.2);'}
        } else {
          heat *= 0.9 + 0.2 * vnoise(p * 30.0);
        }
        // sunspots: dark umbra + filamentary penumbra
        float spot = 0.0, pen = 0.0;
        for (int i = 0; i < 8; i++) {
          vec4 s = uSpots[i]; if (s.w <= 0.0) continue;
          float a = acos(clamp(dot(p, s.xyz), -1.0, 1.0));
          float fil = 0.85 + 0.3 * vnoise(p * 260.0);
          pen = max(pen, 1.0 - smoothstep(s.w * 0.55, s.w * fil, a));
          spot = max(spot, 1.0 - smoothstep(s.w * 0.25, s.w * 0.5, a));
        }
        heat *= mix(1.0, 0.55, pen); heat *= mix(1.0, 0.25, spot);
        // faculae: bright patches around active regions, visible toward the limb
        float fac = smoothstep(0.62, 0.8, fbm(p * 9.0 + 3.0)) * (1.0 - mu);
        heat += fac * 0.35;
        // limb darkening (I = 1 - u(1 - mu), u ~ 0.6) and a redder limb
        float limb = 1.0 - 0.62 * (1.0 - pow(mu, 0.8));
        vec3 hot = vec3(1.0, 0.86, 0.55), warm = vec3(0.98, 0.52, 0.14), cool = vec3(0.5, 0.12, 0.02);
        vec3 col = mix(cool, warm, smoothstep(0.2, 0.62, heat));
        col = mix(col, hot, smoothstep(0.66, 1.08, heat));
        col *= limb * mix(vec3(1.0, 0.7, 0.5), vec3(1.0), mu) * 0.98;
        // flare: brief, intense brightening around the eruption site
        float fd = acos(clamp(dot(p, uFlarePos), -1.0, 1.0));
        col += uFlare * vec3(1.0, 0.95, 0.8) * (exp(-fd * 30.0) * 2.5 + exp(-fd * 7.0) * 0.4);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// ---------------------------------------------------------------------------
// Prominence loops: a glowing tube along a magnetic arch + plasma blobs streaming along it
// ---------------------------------------------------------------------------
const loopVert = /* glsl */`
  uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vView;
  ${NOISE}
  void main() {
    vUv = uv;
    vec3 pos = position + normal * (vnoise(position * 3.0 + uTime * 0.6) - 0.5) * 0.12; // gentle writhing
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vN = normalize(mat3(modelMatrix) * normal); vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const loopFrag = /* glsl */`
  uniform float uTime, uFade, uSeed; varying vec2 vUv; varying vec3 vN; varying vec3 vView;
  ${NOISE}
  void main() {
    float along = vUv.x;
    float ends = smoothstep(0.0, 0.08, along) * smoothstep(1.0, 0.92, along);
    float rim = pow(1.0 - abs(dot(normalize(vN), vView)), 0.8);   // soft edges like a glowing plasma tube
    float core = 1.0 - rim * 0.85;
    // threads of plasma flowing along the loop
    float flow = vnoise(vec3(along * 18.0 - uTime * 0.9, vUv.y * 6.0, uSeed));
    flow = 0.45 + 0.9 * flow * flow;
    float a = ends * flow * core * uFade;
    vec3 col = mix(vec3(1.0, 0.32, 0.08), vec3(1.0, 0.75, 0.35), flow * 0.6);
    gl_FragColor = vec4(col * a, a);
  }`;
const blobVert = /* glsl */`
  uniform float uTime, uFade, uScale; uniform vec3 uP0, uP1, uP2, uP3;
  attribute float aT; attribute float aSpeed; attribute float aSize; attribute vec3 aJit;
  varying float vA;
  void main() {
    float t = fract(aT + uTime * aSpeed);
    float s = 1.0 - t;
    vec3 p = s*s*s*uP0 + 3.0*s*s*t*uP1 + 3.0*s*t*t*uP2 + t*t*t*uP3 + aJit;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vA = uFade * smoothstep(0.0, 0.1, t) * smoothstep(1.0, 0.9, t);
    gl_PointSize = clamp(aSize * uScale / -mv.z, 1.0, 48.0);
    gl_Position = projectionMatrix * mv;
  }`;
const blobFrag = /* glsl */`
  varying float vA;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = pow(1.0 - d * 2.0, 2.0) * vA * 0.55; gl_FragColor = vec4(vec3(1.0, 0.5, 0.18) * a, a); }`;

// ---------------------------------------------------------------------------
// Flare bursts: ballistic plasma (falls back under gravity) or a CME (keeps expanding)
// ---------------------------------------------------------------------------
const burstVert = /* glsl */`
  uniform float uAge, uLife, uGrav, uScale; uniform vec3 uOrigin, uNormal;
  attribute vec3 aVel; attribute float aSize; attribute float aDelay;
  varying float vA; varying float vHeat;
  void main() {
    float t = max(uAge - aDelay, 0.0);
    vec3 p = uOrigin + aVel * t - uNormal * (0.5 * uGrav * t * t);
    float lifeT = t / uLife;
    vA = (uAge > aDelay ? 1.0 : 0.0) * smoothstep(1.0, 0.35, lifeT) * smoothstep(0.0, 0.03, lifeT);
    vHeat = 1.0 - clamp(lifeT * 1.6, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(aSize * (1.0 + lifeT * 1.5) * uScale / -mv.z, 1.0, 40.0);
    gl_Position = projectionMatrix * mv;
  }`;
const burstFrag = /* glsl */`
  varying float vA; varying float vHeat;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = pow(1.0 - d * 2.0, 1.5) * vA;
    vec3 col = mix(vec3(1.0, 0.35, 0.1), vec3(1.0, 0.95, 0.8), vHeat); gl_FragColor = vec4(col * a, a); }`;

function glowSpriteTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.2, 'rgba(255,230,160,0.7)'); gr.addColorStop(0.5, 'rgba(255,150,60,0.18)'); gr.addColorStop(1, 'rgba(255,100,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const randDir = (out = new THREE.Vector3()) => { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u); return out.set(s * Math.cos(a), u, s * Math.sin(a)); };
const tangentFrame = (n) => { const t = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0); const a = t.cross(n).normalize(); return [a, new THREE.Vector3().crossVectors(n, a)]; };

export function createSunFX({ radius, isTouch = false, mesh }) {
  const R = radius;
  // sunspot groups (object space, slowly varying); w = angular radius
  const spots = [];
  for (let i = 0; i < 8; i++) {
    const lat = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 26) * Math.PI / 180, lon = Math.random() * Math.PI * 2;
    spots.push(new THREE.Vector4(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon), i < (isTouch ? 5 : 7) ? 0.035 + Math.random() * 0.05 : 0));
  }
  const surf = surfaceMaterial(isTouch, spots);
  mesh.material = surf;

  // everything that is only shown up close lives here (in world-aligned sun space, not spinning with the surface)
  const fx = new THREE.Group();
  fx.visible = false;

  // chromosphere rim: thin reddish fresnel shell just above the surface
  const rim = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 64, 48), new THREE.ShaderMaterial({
    uniforms: { uFade: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uFade; varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - abs(dot(vN, vV)); float a = pow(f, 5.0) * uFade; gl_FragColor = vec4(vec3(1.0,0.35,0.12)*a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  fx.add(rim);

  // --- prominences ---
  const NLOOPS = isTouch ? 6 : 11, BLOBS = isTouch ? 40 : 90;
  const loops = [];
  const makeLoop = (L) => {
    if (L.mesh) { fx.remove(L.mesh, L.blobs); L.mesh.geometry.dispose(); L.blobs.geometry.dispose(); }
    // prefer spots near the limb as seen from the camera, so the arches show against space
    const n = randDir();
    if (L.view) n.addScaledVector(L.view, -n.dot(L.view) * 0.85).normalize();
    const [ta] = tangentFrame(n);
    const span = (0.08 + Math.random() * 0.14);              // angular half-separation of the foot points
    const tilt = (Math.random() - 0.5) * 0.8;
    const dirA = ta.clone().applyAxisAngle(n, tilt);
    const f0 = n.clone().applyAxisAngle(new THREE.Vector3().crossVectors(n, dirA).normalize(), span).multiplyScalar(R * 0.995);
    const f1 = n.clone().applyAxisAngle(new THREE.Vector3().crossVectors(n, dirA).normalize(), -span).multiplyScalar(R * 0.995);
    const h = R * (0.12 + Math.random() * 0.3) * (0.7 + span * 2.5);
    const c0 = f0.clone().normalize().multiplyScalar(R + h * 1.25).addScaledVector(dirA, R * 0.05);
    const c1 = f1.clone().normalize().multiplyScalar(R + h * 1.25).addScaledVector(dirA, -R * 0.05);
    const curve = new THREE.CubicBezierCurve3(f0, c0, c1, f1);
    const thick = R * (0.03 + Math.random() * 0.035);
    L.mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, isTouch ? 40 : 64, thick, isTouch ? 6 : 10, false), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: Math.random() * 100 }, uFade: { value: 0 }, uSeed: { value: Math.random() * 50 } },
      vertexShader: loopVert, fragmentShader: loopFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const g = new THREE.BufferGeometry();
    const at = new Float32Array(BLOBS), sp = new Float32Array(BLOBS), sz = new Float32Array(BLOBS), jit = new Float32Array(BLOBS * 3);
    for (let i = 0; i < BLOBS; i++) {
      at[i] = Math.random(); sp[i] = (Math.random() < 0.5 ? 1 : -1) * (0.04 + Math.random() * 0.07); sz[i] = R * (0.025 + Math.random() * 0.035);
      jit.set([(Math.random() - 0.5) * thick * 2.5, (Math.random() - 0.5) * thick * 2.5, (Math.random() - 0.5) * thick * 2.5], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BLOBS * 3), 3));
    g.setAttribute('aT', new THREE.BufferAttribute(at, 1)); g.setAttribute('aSpeed', new THREE.BufferAttribute(sp, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); g.setAttribute('aJit', new THREE.BufferAttribute(jit, 3));
    L.blobs = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uScale: { value: 800 }, uP0: { value: f0 }, uP1: { value: c0 }, uP2: { value: c1 }, uP3: { value: f1 } },
      vertexShader: blobVert, fragmentShader: blobFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    L.blobs.frustumCulled = false;
    fx.add(L.mesh, L.blobs);
    L.age = 0; L.life = 18 + Math.random() * 22;
  };
  for (let i = 0; i < NLOOPS; i++) { const L = {}; makeLoop(L); L.age = Math.random() * L.life; loops.push(L); }

  // --- flares + CMEs (small pool, reused) ---
  const NB = isTouch ? 260 : 700;
  const flareTex = glowSpriteTexture();
  const bursts = [];
  for (let k = 0; k < 2; k++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NB * 3), 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(new Float32Array(NB * 3), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(NB), 1));
    g.setAttribute('aDelay', new THREE.BufferAttribute(new Float32Array(NB), 1));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uAge: { value: 0 }, uLife: { value: 4 }, uGrav: { value: 0 }, uScale: { value: 800 }, uOrigin: { value: new THREE.Vector3() }, uNormal: { value: new THREE.Vector3(0, 1, 0) } },
      vertexShader: burstVert, fragmentShader: burstFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    pts.frustumCulled = false; pts.visible = false;
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    flash.visible = false;
    fx.add(pts, flash);
    bursts.push({ pts, flash, age: 0, active: false, life: 4, cme: false, n: new THREE.Vector3(), local: new THREE.Vector3() });
  }
  let nextFlare = 2.5, flareCount = 0, cmeCount = 0;
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

  function launch(b, view, forceCME) {
    const n = randDir(b.n);
    n.addScaledVector(view, -n.dot(view) * 0.8).normalize();      // near the limb, so the ejecta shows against space
    if (n.dot(view) < -0.2) n.addScaledVector(view, 0.4).normalize();
    b.cme = forceCME ?? Math.random() < 0.3;
    b.life = b.cme ? 7 : 4.2; b.age = 0; b.active = true;
    const origin = n.clone().multiplyScalar(R * 1.01);
    const [ta, tb] = tangentFrame(n);
    const vel = b.pts.geometry.attributes.aVel.array, size = b.pts.geometry.attributes.aSize.array, delay = b.pts.geometry.attributes.aDelay.array;
    for (let i = 0; i < NB; i++) {
      const spread = b.cme ? 0.9 : 0.45, a = Math.random() * Math.PI * 2, r = Math.pow(Math.random(), 0.7) * spread;
      _v.copy(n).addScaledVector(ta, Math.cos(a) * r).addScaledVector(tb, Math.sin(a) * r).normalize();
      const speed = R * (b.cme ? 0.6 + Math.random() * 0.7 : 0.35 + Math.random() * 0.75);
      vel.set([_v.x * speed, _v.y * speed, _v.z * speed], i * 3);
      size[i] = R * (b.cme ? 0.02 + Math.random() * 0.035 : 0.02 + Math.random() * 0.04);
      delay[i] = Math.random() * (b.cme ? 0.8 : 0.35);
    }
    b.pts.geometry.attributes.aVel.needsUpdate = true; b.pts.geometry.attributes.aSize.needsUpdate = true; b.pts.geometry.attributes.aDelay.needsUpdate = true;
    const u = b.pts.material.uniforms;
    u.uOrigin.value.copy(origin); u.uNormal.value.copy(n); u.uLife.value = b.life * 0.8; u.uGrav.value = b.cme ? 0 : R * 0.45;
    b.pts.visible = true; b.flash.visible = true; b.flash.position.copy(origin);
    b.local.copy(n);
    flareCount++; if (b.cme) cmeCount++;
  }

  let time = 0, near = 0;
  const api = {
    group: fx,
    stats: () => ({ near: +near.toFixed(2), visible: fx.visible, loops: loops.length, blobsPerLoop: BLOBS, burstParticles: NB, flares: flareCount, cmes: cmeCount, detail: surf.uniforms.uDetail.value }),
    triggerFlare(cme) { const b = bursts.find((x) => !x.active) || bursts[0]; launch(b, api._view || new THREE.Vector3(0, 0, 1), cme); },
    setScale(px) { for (const L of loops) L.blobs.material.uniforms.uScale.value = px; for (const b of bursts) b.pts.material.uniforms.uScale.value = px; },
    /** dt: seconds; camera; sunWorld: Sun center; animate: false when paused */
    update(dt, camera, sunWorld, animate) {
      const d = camera.position.distanceTo(sunWorld);
      // LOD: full effects within ~60 units (focus distance is 32), fading out by ~110
      near = 1 - THREE.MathUtils.smoothstep(d, 60, 110);
      surf.uniforms.uDetail.value = d < 100 ? 1 : 0;   // granulation only when it can actually be seen
      fx.visible = near > 0.005;
      if (!animate) dt = 0;
      time += dt;
      surf.uniforms.uTime.value = time;
      if (!fx.visible) return;
      const view = (api._view ||= new THREE.Vector3()).subVectors(camera.position, sunWorld).normalize();
      rim.material.uniforms.uFade.value = near;
      for (const L of loops) {
        L.age += dt;
        if (L.age > L.life) { L.view = view.clone(); makeLoop(L); }
        const life = Math.min(1, L.age / 4, (L.life - L.age) / 4);
        L.mesh.material.uniforms.uTime.value += dt; L.mesh.material.uniforms.uFade.value = life * near * 0.85;
        L.blobs.material.uniforms.uTime.value += dt; L.blobs.material.uniforms.uFade.value = life * near;
      }
      nextFlare -= dt;
      if (nextFlare <= 0) { const b = bursts.find((x) => !x.active); if (b) launch(b, view); nextFlare = 5 + Math.random() * 8; }
      let flareI = 0;
      for (const b of bursts) {
        if (!b.active) continue;
        b.age += dt;
        const u = b.pts.material.uniforms; u.uAge.value = b.age;
        // flash: fast rise, slower decay
        const f = b.age < 0.25 ? b.age / 0.25 : Math.exp(-(b.age - 0.25) * 1.6);
        b.flash.material.opacity = f * near; b.flash.scale.setScalar(R * (0.7 + 2.0 * Math.min(1, b.age * 2)) * (b.cme ? 1.5 : 1));
        if (f > flareI) { flareI = f; _q.copy(mesh.quaternion).invert(); surf.uniforms.uFlarePos.value.copy(b.local).applyQuaternion(_q); }
        if (b.age > b.life) { b.active = false; b.pts.visible = false; b.flash.visible = false; }
      }
      surf.uniforms.uFlare.value = flareI * near;
    },
  };
  return api;
}
