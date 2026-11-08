import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * Ice in soda. One full screen WebGL scene whose whole story is a function of
 * scroll progress p (0..1): the cube falls through the air, breaks the
 * surface, throws a crown of droplets, plunges trailing air, then floats back
 * up and fizzes while the camera sinks under the surface. Every position is
 * computed from p (plus a slow clock for the idle shimmer), so scrolling back
 * plays the whole thing in reverse.
 *
 * The cube is modelled here rather than downloaded: a rounded box with
 * melted edges, physical transmission (IOR 1.31, the index of ice), a
 * procedural frost normal map and a cloudy core with trapped air.
 */

const P_HIT = 0.24 // the cube's bottom touches the surface
const P_DEEP = 0.46 // deepest point of the plunge
const FOV = 38
const CAM_Z = 8
const HALF_H = CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) // half screen height at z = 0

// ---------------------------------------------------------------- helpers
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------- choreography
type Pose = { x: number; y: number; rx: number; ry: number; rz: number }

function cubePose(p: number, half: number, time: number): Pose {
  const yTop = 6.2
  const yHit = half * 0.92
  const yDeep = -2.35
  const yFloat = -half * 0.62
  let y: number
  if (p < P_HIT) {
    const u = p / P_HIT
    y = mix(yTop, yHit, u * u) // gravity: distance grows with the square of time
  } else if (p < P_DEEP) {
    const u = (p - P_HIT) / (P_DEEP - P_HIT)
    y = mix(yHit, yDeep, 1 - Math.pow(1 - u, 2.6)) // water brakes it hard
  } else {
    const u = (p - P_DEEP) / (1 - P_DEEP)
    // buoyancy pulls it back up, overshoots, settles: a damped spring
    y = yFloat + (yDeep - yFloat) * Math.exp(-4.2 * u) * Math.cos(Math.PI * 2 * 1.35 * u)
    y += Math.sin(time * 1.1) * 0.025 * smooth(0.7, 1, p)
  }
  const tumble = 1 - smooth(P_HIT, 0.85, p)
  const spin = mix(0, 1, smooth(0, P_DEEP, p))
  return {
    x: 0.18 - 0.22 * smooth(P_HIT, 1, p) + Math.sin(time * 0.6) * 0.02 * smooth(0.75, 1, p),
    y,
    rx: 0.42 + 1.9 * spin * tumble + 0.1 * (1 - tumble),
    ry: 0.7 + 1.1 * spin + Math.sin(time * 0.4) * 0.03,
    rz: -0.25 + 1.4 * spin * tumble + 0.06 * (1 - tumble),
  }
}

/** Camera height: above water for the fall, then it sinks under the surface. */
const camY = (p: number) => mix(0.95, -2.05, smooth(0.28, 0.8, p))

// ---------------------------------------------------------------- textures
function valueNoise(size: number, seed: number, octaves: number) {
  const r = rng(seed)
  const grid = 64
  const g = new Float32Array(grid * grid).map(() => r())
  const at = (x: number, y: number) => g[((y % grid) + grid) % grid * grid + (((x % grid) + grid) % grid)]
  const out = new Float32Array(size * size)
  for (let o = 0; o < octaves; o++) {
    const f = 4 << o
    const amp = 1 / (1 << o)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * f
        const fy = (y / size) * f
        const ix = Math.floor(fx)
        const iy = Math.floor(fy)
        let tx = fx - ix
        let ty = fy - iy
        tx = tx * tx * (3 - 2 * tx)
        ty = ty * ty * (3 - 2 * ty)
        const wrap = (v: number) => v % f
        const a = at(wrap(ix), wrap(iy))
        const b = at(wrap(ix + 1), wrap(iy))
        const c = at(wrap(ix), wrap(iy + 1))
        const d = at(wrap(ix + 1), wrap(iy + 1))
        out[y * size + x] += amp * mix(mix(a, b, tx), mix(c, d, tx), ty)
      }
    }
  }
  return out
}

function frostTextures() {
  const size = 256
  const h = valueNoise(size, 7, 5)
  const nCanvas = document.createElement('canvas')
  nCanvas.width = nCanvas.height = size
  const nctx = nCanvas.getContext('2d')!
  const nimg = nctx.createImageData(size, size)
  const rCanvas = document.createElement('canvas')
  rCanvas.width = rCanvas.height = size
  const rctx = rCanvas.getContext('2d')!
  const rimg = rctx.createImageData(size, size)
  const H = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 3.2
      const dy = (H(x, y + 1) - H(x, y - 1)) * 3.2
      const len = Math.hypot(dx, dy, 1)
      const i = (y * size + x) * 4
      nimg.data[i] = ((-dx / len) * 0.5 + 0.5) * 255
      nimg.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255
      nimg.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
      nimg.data[i + 3] = 255
      // frosted patches where the height noise is high, wet glass elsewhere
      const rough = 0.04 + 0.32 * smooth(0.95, 1.35, H(x, y))
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rough * 255
      rimg.data[i + 3] = 255
    }
  }
  nctx.putImageData(nimg, 0, 0)
  rctx.putImageData(rimg, 0, 0)
  const normal = new THREE.CanvasTexture(nCanvas)
  const rough = new THREE.CanvasTexture(rCanvas)
  for (const t of [normal, rough]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.NoColorSpace
  }
  return { normal, rough }
}

/** The milky heart of a freezer cube: streaks of white plus trapped air beads. */
function coreTexture() {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const n = valueNoise(size, 19, 4)
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size - 0.5
      const v = y / size - 0.5
      const center = Math.max(0, 1 - Math.hypot(u * 1.25, v * 1.1) * 2.1)
      const streak = Math.pow(Math.abs(Math.sin((u * 0.4 + v) * 22 + n[y * size + x] * 5)), 6)
      const a = clamp01(center * (0.35 + 0.65 * n[y * size + x] - 0.25) + streak * center * 0.35)
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = 255
      img.data[i + 2] = 255
      img.data[i + 3] = a * 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const r = rng(3)
  for (let k = 0; k < 70; k++) {
    const x = size * (0.28 + 0.44 * r())
    const y = size * (0.25 + 0.5 * r())
    const rad = 0.8 + r() * 2.6
    const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, 0, x, y, rad)
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(0.7, 'rgba(255,255,255,0.35)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---------------------------------------------------------------- shaders
const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }
`

const SODA_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uWater;   // waterline height in NDC
uniform vec3 uImpact;   // x (NDC), seconds since impact, strength
uniform float uDepth;   // how far the camera has sunk
uniform vec2 uLook;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
float surfaceY(float x) {
  float y = uWater;
  y += 0.0055 * sin(x * 3.1 + uTime * 1.25) + 0.0035 * sin(x * 7.7 - uTime * 1.9) + 0.002 * sin(x * 17.0 + uTime * 2.7);
  float T = uImpact.y;
  if (T > 0.0) {
    float d = abs(x - uImpact.x);
    float front = 0.12 + T * 0.75;
    y += uImpact.z * 0.03 * sin((d - front) * 30.0) * exp(-abs(d - front) * 5.0) * exp(-T * 0.9);
    y -= uImpact.z * 0.05 * exp(-d * d * 30.0) * sin(min(T * 6.0, 3.14159)) * exp(-T * 1.5);
  }
  return y;
}
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(ndc.x * aspect, ndc.y) + uLook * 0.04;
  float px = 2.0 / uRes.y;
  float sy = surfaceY(ndc.x);
  float above = ndc.y - sy;

  // ---------- the air above the glass rim: a dim warm room, out of focus
  vec3 air = mix(vec3(0.045, 0.030, 0.022), vec3(0.20, 0.13, 0.085), smoothstep(-0.3, 1.2, ndc.y));
  air += vec3(0.35, 0.24, 0.15) * exp(-length(p - vec2(-0.6 * aspect, 1.15)) * 1.6) * 0.5;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(fi * 2.31 + 0.7) * aspect * 0.95, sy + 0.35 + 0.8 * fract(fi * 0.618 + 0.13));
    float r = 0.025 + 0.035 * fract(fi * 0.37);
    float dl = length(p - c);
    float b = smoothstep(r, r * 0.8, dl);
    float ring = smoothstep(r * 0.7, r * 0.95, dl) * b;
    air += vec3(1.0, 0.74, 0.46) * (b * 0.07 + ring * 0.06) * (0.6 + 0.8 * fract(fi * 0.71));
  }

  // ---------- the soda
  float depth = max(0.0, sy - ndc.y) * 0.55 + uDepth;
  vec2 w = vec2(fbm(p * 1.6 + vec2(0.0, uTime * 0.13)), fbm(p * 1.6 + vec2(4.1, -uTime * 0.11))) - 0.5;
  vec2 q = p + w * 0.06;
  vec3 top = vec3(0.80, 0.38, 0.10);
  vec3 mid = vec3(0.42, 0.15, 0.04);
  vec3 deep = vec3(0.075, 0.020, 0.008);
  vec3 liq = mix(top, mid, smoothstep(0.0, 0.55, depth));
  liq = mix(liq, deep, smoothstep(0.45, 2.0, depth));

  // light shafts falling from the surface, swaying with the refraction
  float slant = q.x + (sy - q.y) * 0.32;
  float rays = 0.5 + 0.5 * sin(slant * 8.0 + uTime * 0.35 + fbm(vec2(slant * 2.5, uTime * 0.08)) * 5.0);
  rays *= 0.55 + 0.45 * sin(slant * 21.0 - uTime * 0.27 + w.x * 6.0);
  rays = rays * rays;
  liq += vec3(1.0, 0.64, 0.28) * rays * exp(-depth * 1.5) * 0.32;

  // caustic net dancing just under the surface
  vec2 cq = q * 9.0;
  float c1 = noise(cq + vec2(uTime * 0.5, uTime * 0.2));
  float c2 = noise(cq * 1.07 - vec2(uTime * 0.35, -uTime * 0.4) + 3.1);
  float caus = pow(1.0 - abs(c1 - c2), 14.0);
  liq += vec3(1.0, 0.82, 0.55) * caus * 0.07 * exp(-depth * 3.2);

  // suspended glints, the tiny specks that catch light in a real drink
  vec2 gq = q * 60.0 + vec2(0.0, -uTime * 2.0);
  float gl = step(0.996, hash(floor(gq))) * smoothstep(0.5, 0.0, length(fract(gq) - 0.5));
  liq += vec3(1.0, 0.8, 0.55) * gl * 0.25 * exp(-depth * 1.2);

  // the underside of the surface mirrors the light back (total internal reflection)
  float below = sy - ndc.y;
  liq += vec3(1.0, 0.72, 0.42) * exp(-below / 0.05) * 0.55 * step(0.0, below);
  liq += vec3(0.9, 0.55, 0.25) * exp(-below / 0.18) * 0.12 * step(0.0, below);

  // the churned white water right where the cube went in
  float T = uImpact.y;
  if (T > 0.0) {
    vec2 ip = vec2(uImpact.x * aspect, sy - 0.12 - T * 0.05);
    vec2 dd = (p - ip) * vec2(1.0, 1.4);
    float cloud = exp(-dot(dd, dd) * 9.0) * fbm(p * 9.0 + vec2(0.0, -uTime)) ;
    liq += vec3(1.0, 0.9, 0.78) * cloud * uImpact.z * 0.9 * exp(-T * 1.1);
  }

  // ---------- composite
  float edge = smoothstep(-px * 1.2, px * 1.2, above);
  vec3 col = mix(liq, air, edge);
  col += vec3(1.0, 0.9, 0.76) * exp(-abs(above) / (px * 1.3)) * 0.85; // the meniscus line
  col += vec3(1.0, 0.68, 0.36) * exp(-abs(above) / 0.025) * 0.10;

  float vig = smoothstep(1.55, 0.35, length(ndc * vec2(0.85, 1.0)));
  col *= mix(0.55, 1.0, vig);
  col += (hash(vUv * uRes + fract(uTime) * 91.0) - 0.5) * 0.02;

  gl_FragColor = vec4(toLinear(max(col, 0.0)), 1.0);
  #include <colorspace_fragment>
}
`

const BUBBLE_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
uniform float uPx;
uniform float uMaxPoint;
varying float vAlpha;
varying float vBlur;
varying float vFog;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = -mv.z;
  float d = aSize * uPx / dist;
  vBlur = clamp(abs(dist - ${CAM_Z.toFixed(1)}) / 7.0, 0.0, 0.85);
  vFog = clamp((dist - ${CAM_Z.toFixed(1)}) / 12.0, 0.0, 1.0);
  // a blurred bubble spreads its light: grow the sprite, keep its energy
  float spread = 1.0 + vBlur * 0.9;
  gl_PointSize = clamp(d * spread, 1.5, uMaxPoint);
  vAlpha = aAlpha * (d < 3.0 ? d / 3.0 : 1.0) / (spread * 0.8);
  gl_Position = projectionMatrix * mv;
}
`

const BUBBLE_FRAG = /* glsl */ `
varying float vAlpha;
varying float vBlur;
varying float vFog;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  uv.y = -uv.y;
  float r = length(uv);
  float soft = 0.06 + vBlur * 0.55;
  float disk = 1.0 - smoothstep(1.0 - soft, 1.0, r);
  if (disk <= 0.0) discard;
  float rim = smoothstep(0.62, 0.97, r) * disk;
  vec2 hp = uv - vec2(-0.34, 0.36);
  float spec = exp(-dot(hp, hp) * 26.0);
  vec2 bp = (uv - vec2(0.1, -0.5)) * vec2(1.0, 2.3);
  float cres = exp(-dot(bp, bp) * 7.0);
  float a = rim * 0.8 + spec * 0.95 * (1.0 - vBlur) + cres * 0.4 + disk * 0.07;
  a = mix(a, disk * 0.42 + rim * 0.2, vBlur);
  vec3 col = mix(vec3(1.0, 0.95, 0.86), vec3(0.95, 0.62, 0.32), vFog * 0.75);
  a *= vAlpha * (1.0 - vFog * 0.55);
  gl_FragColor = vec4(pow(col, vec3(2.2)) * a, a);
  #include <colorspace_fragment>
}
`

// ---------------------------------------------------------------- the scene
export type SodaHandle = {
  setProgress(p: number, snap?: boolean): void
  setLook(x: number, y: number): void
  resize(): void
  frame(now: number): void
  dispose(): void
}

export function createSodaScene(canvas: HTMLCanvasElement, opts: { mobile: boolean }): SodaHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.mobile, alpha: false, powerPreference: 'high-performance' })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  const maxDpr = opts.mobile ? 1.5 : 1.75
  let dprScale = 1
  const r2 = renderer as unknown as { transmissionResolutionScale?: number }
  if ('transmissionResolutionScale' in r2) r2.transmissionResolutionScale = opts.mobile ? 0.5 : 0.75

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60)
  camera.position.set(0, 0, CAM_Z)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTex

  const key = new THREE.DirectionalLight(0xfff1dd, 4)
  key.position.set(-3, 6, 4)
  scene.add(key)
  const rim = new THREE.PointLight(0xffa860, 14, 12)
  rim.position.set(2.5, -1.5, 2)
  scene.add(rim)

  // the soda itself, drawn behind everything (and refracted by the ice)
  const sodaMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: SODA_FRAG,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uWater: { value: 0 },
      uImpact: { value: new THREE.Vector3(0, -1, 1) },
      uDepth: { value: 0 },
      uLook: { value: new THREE.Vector2() },
    },
  })
  const sodaQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sodaMat)
  sodaQuad.frustumCulled = false
  sodaQuad.renderOrder = -10
  scene.add(sodaQuad)

  // ---- the ice cube
  const SIDE = opts.mobile ? 1.05 : 1.2
  const half = SIDE / 2
  const geo = new RoundedBoxGeometry(SIDE, SIDE * 0.94, SIDE * 0.98, 6, SIDE * 0.14)
  {
    // melt it: nudge every vertex along its normal by a little noise so no
    // face is perfectly flat, then rebuild the normals
    const pos = geo.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const n = Math.sin(v.x * 7.1 + v.y * 3.3) * Math.cos(v.z * 6.7 - v.x * 2.1) + Math.sin(v.y * 9.3 + v.z * 4.1) * 0.5
      v.multiplyScalar(1 + n * 0.012)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    geo.computeVertexNormals()
  }
  const frost = frostTextures()
  const iceMat = new THREE.MeshPhysicalMaterial({
    color: 0xf4fbff,
    transmission: 1,
    thickness: SIDE * 0.9,
    ior: 1.31,
    roughness: 0.06,
    roughnessMap: frost.rough,
    normalMap: frost.normal,
    normalScale: new THREE.Vector2(0.12, 0.12),
    attenuationColor: new THREE.Color(0xdcefff),
    attenuationDistance: 6,
    clearcoat: 0.8,
    clearcoatRoughness: 0.08,
    specularIntensity: 1,
    envMapIntensity: 2.4,
    sheen: 0.4,
    sheenColor: new THREE.Color(0xfff4e6),
    sheenRoughness: 0.3,
  })
  const ice = new THREE.Group()
  const iceMesh = new THREE.Mesh(geo, iceMat)
  ice.add(iceMesh)
  const core = new THREE.Mesh(
    new RoundedBoxGeometry(SIDE * 0.62, SIDE * 0.58, SIDE * 0.6, 3, SIDE * 0.2),
    new THREE.MeshStandardMaterial({
      map: coreTexture(),
      transparent: true,
      opacity: 0.32,
      roughness: 0.6,
      depthWrite: false,
      depthTest: false,
      color: 0xffffff,
      emissive: 0x2a1a10,
    }),
  )
  core.renderOrder = 5
  ice.add(core)
  scene.add(ice)

  // ---- droplets of the splash (they are soda, so they are amber glass)
  const DROPS = opts.mobile ? 46 : 80
  const dropMat = new THREE.MeshPhysicalMaterial({
    color: 0xe0903e,
    emissive: 0x6a2a08,
    roughness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2.6,
    transparent: true,
    opacity: 0.92,
  })
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 9), dropMat, DROPS)
  drops.frustumCulled = false
  scene.add(drops)
  const dropSeeds = Array.from({ length: DROPS }, (_, i) => {
    const r = rng(100 + i)
    const ang = r() * Math.PI * 2
    const crown = i < DROPS * 0.7 // most come off the crown ring, a few jet straight up
    return {
      ang,
      ring: half * (crown ? 1.05 + r() * 0.25 : r() * 0.4),
      vh: crown ? 1.2 + r() * 1.8 : 0.3 + r() * 0.6,
      vy: crown ? 2.6 + r() * 2.6 : 4.5 + r() * 2.2,
      size: 0.014 + Math.pow(r(), 2.4) * (crown ? 0.05 : 0.035),
      delay: r() * 0.06,
    }
  })

  // ---- bubbles: one point cloud, three populations
  const FIZZ = opts.mobile ? 520 : 900
  const STREAMS = opts.mobile ? 7 : 11
  const PER_STREAM = 26
  const TRAIL = opts.mobile ? 190 : 300
  const SKIN = opts.mobile ? 70 : 110
  const TOTAL = FIZZ + STREAMS * PER_STREAM + TRAIL + SKIN
  const bPos = new Float32Array(TOTAL * 3)
  const bSize = new Float32Array(TOTAL)
  const bAlpha = new Float32Array(TOTAL)
  const bGeo = new THREE.BufferGeometry()
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3).setUsage(THREE.DynamicDrawUsage))
  bGeo.setAttribute('aSize', new THREE.BufferAttribute(bSize, 1).setUsage(THREE.DynamicDrawUsage))
  bGeo.setAttribute('aAlpha', new THREE.BufferAttribute(bAlpha, 1).setUsage(THREE.DynamicDrawUsage))
  const bMat = new THREE.ShaderMaterial({
    vertexShader: BUBBLE_VERT,
    fragmentShader: BUBBLE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uPx: { value: 500 }, uMaxPoint: { value: 256 } },
  })
  const bubbles = new THREE.Points(bGeo, bMat)
  bubbles.frustumCulled = false
  bubbles.renderOrder = 4
  scene.add(bubbles)
  const maxPoint = (renderer.getContext().getParameter(renderer.getContext().ALIASED_POINT_SIZE_RANGE) as Float32Array)[1] || 64
  bMat.uniforms.uMaxPoint.value = Math.min(maxPoint, 320)

  const fizz = Array.from({ length: FIZZ }, (_, i) => {
    const r = rng(1000 + i)
    const z = mix(-14, 3.2, Math.pow(r(), 0.8))
    const size = (0.012 + Math.pow(r(), 3) * 0.05) * (z > 1.5 ? 2.2 : 1)
    return { x: (r() * 2 - 1) * (9 + Math.max(0, -z) * 0.5), z, phase: r(), speed: 0.18 + size * 9 + r() * 0.1, size, wob: r() * 6.28, span: 10 + Math.max(0, -z) * 0.6 }
  })
  const streams = Array.from({ length: STREAMS }, (_, i) => {
    const r = rng(5000 + i)
    return { x: (r() * 2 - 1) * 4.2, z: mix(-6, 1.2, r()), speed: 0.35 + r() * 0.25, phase: r() }
  })
  const trail = Array.from({ length: TRAIL }, (_, i) => {
    const r = rng(9000 + i)
    return {
      s: P_HIT + Math.pow(r(), 1.4) * (P_DEEP - P_HIT + 0.04), // when it is torn off the cube
      ox: (r() * 2 - 1) * half * 1.3,
      oy: (r() * 2 - 0.4) * half,
      oz: (r() * 2 - 1) * half * 1.1,
      rise: 9 + r() * 10,
      size: 0.015 + Math.pow(r(), 2.5) * 0.11,
      wob: r() * 6.28,
    }
  })
  const skin = Array.from({ length: SKIN }, (_, i) => {
    const r = rng(12000 + i)
    // nucleation sites spread over the faces of the cube
    const face = Math.floor(r() * 5)
    const a = (r() * 2 - 1) * half * 0.85
    const b = (r() * 2 - 1) * half * 0.85
    const local = [
      new THREE.Vector3(half, a, b),
      new THREE.Vector3(-half, a, b),
      new THREE.Vector3(a, -half * 0.94, b),
      new THREE.Vector3(a, b, half),
      new THREE.Vector3(a, b, -half),
    ][face]
    return { local, phase: r(), speed: 0.35 + r() * 0.4, size: 0.012 + r() * 0.03, wob: r() * 6.28 }
  })

  // ---------------------------------------------------------------- state
  let target = 0
  let p = 0
  let lookX = 0
  let lookY = 0
  let lx = 0
  let ly = 0
  let last = 0
  let start = 0
  let width = 1
  let height = 1
  const slowFrames: number[] = []
  const tmpM = new THREE.Matrix4()
  const tmpQ = new THREE.Quaternion()
  const tmpE = new THREE.Euler()
  const tmpV = new THREE.Vector3()
  const tmpS = new THREE.Vector3()
  const ndcV = new THREE.Vector3()

  function resize() {
    const rect = canvas.getBoundingClientRect()
    width = Math.max(1, Math.round(rect.width))
    height = Math.max(1, Math.round(rect.height))
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr) * dprScale
    renderer.setPixelRatio(dpr)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    // keep the cube a sensible size on a tall phone: widen the view a touch
    camera.fov = width / height < 0.7 ? FOV * 1.18 : FOV
    camera.updateProjectionMatrix()
    sodaMat.uniforms.uRes.value.set(width * dpr, height * dpr)
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    bMat.uniforms.uPx.value = (height * dpr) / (2 * tanHalf)
  }

  function frame(now: number) {
    if (!start) start = now
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60
    last = now
    const time = ((now - start) / 1000) % 3600

    // smooth the scroll a hair so a flicked wheel still reads as motion
    p += (target - p) * (1 - Math.exp(-dt * 10))
    lx += (lookX - lx) * (1 - Math.exp(-dt * 3))
    ly += (lookY - ly) * (1 - Math.exp(-dt * 3))

    // camera
    const cy = camY(p)
    camera.position.set(lx * 0.25, cy + ly * 0.15, CAM_Z)
    camera.lookAt(lx * 0.1, cy, 0)
    camera.updateMatrixWorld()

    // waterline in NDC, measured at the cube's depth
    ndcV.set(0, 0, 0).project(camera)
    const water = ndcV.y
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const viewHalf = CAM_Z * tanHalf

    // cube
    const pose = cubePose(p, half, time)
    ice.position.set(pose.x, pose.y, 0)
    ice.rotation.set(pose.rx, pose.ry, pose.rz)
    ice.updateMatrixWorld()

    // impact, in seconds of "story time" since the hit
    const T = (p - P_HIT) * 7
    ndcV.set(pose.x, 0, 0).project(camera)
    sodaMat.uniforms.uImpact.value.set(ndcV.x, T, 1)
    sodaMat.uniforms.uWater.value = water
    sodaMat.uniforms.uDepth.value = Math.max(0, -cy) * 0.12
    sodaMat.uniforms.uTime.value = time
    sodaMat.uniforms.uLook.value.set(lx, ly)

    // splash droplets: ballistic, so the arc plays the same forwards and back
    const g = 9.8
    for (let i = 0; i < DROPS; i++) {
      const d = dropSeeds[i]
      const t = T * 0.55 - d.delay
      let visible = t > 0
      let y = 0
      let x = 0
      let z = 0
      let vyNow = 0
      if (visible) {
        const vh = d.vh
        x = pose.x + Math.cos(d.ang) * (d.ring + vh * t)
        z = Math.sin(d.ang) * (d.ring + vh * t)
        y = d.vy * t - 0.5 * g * t * t
        vyNow = d.vy - g * t
        visible = y > -0.02
      }
      if (!visible) {
        tmpM.makeScale(0, 0, 0)
      } else {
        // stretch along the direction of travel, like a real drop in flight
        const speed = Math.hypot(d.vh, vyNow)
        const stretch = 1 + Math.min(1.4, speed * 0.14)
        tmpE.set(0, -d.ang, Math.atan2(vyNow, d.vh) - Math.PI / 2)
        tmpQ.setFromEuler(tmpE)
        const shrink = 1 - smooth(0.9, 1.3, t)
        tmpS.set(d.size * shrink, d.size * stretch * shrink, d.size * shrink)
        tmpV.set(x, y, z)
        tmpM.compose(tmpV, tmpQ, tmpS)
      }
      drops.setMatrixAt(i, tmpM)
    }
    drops.instanceMatrix.needsUpdate = true

    // bubbles
    let k = 0
    const put = (x: number, y: number, z: number, size: number, alpha: number) => {
      // nothing fizzes in the air: pop at the surface
      const a = y > -0.02 ? 0 : alpha * smooth(-0.02, -0.18, y)
      bPos[k * 3] = x
      bPos[k * 3 + 1] = y
      bPos[k * 3 + 2] = z
      bSize[k] = size
      bAlpha[k] = a
      k++
    }
    const lift = p * 6 // scrolling drives the fizz up
    const fizzIn = 0.35 + 0.65 * smooth(P_HIT, 0.6, p)
    for (const b of fizz) {
      const ph = (b.phase + time * b.speed * 0.045 + lift * b.speed * 0.25) % 1
      const y = -b.span + ph * (b.span + 0.2) + cy * 0.0
      const x = b.x + Math.sin(time * 2.2 + b.wob + ph * 30) * b.size * 2.2
      put(x, y + Math.min(0, cy) * 0, b.z, b.size, fizzIn * smooth(0, 0.08, ph))
    }
    for (const s of streams) {
      for (let j = 0; j < PER_STREAM; j++) {
        const ph = (j / PER_STREAM + s.phase + time * s.speed * 0.08 + lift * s.speed * 0.3) % 1
        // stream bubbles start tiny and swell as the pressure drops
        const y = -9.5 + Math.pow(ph, 1.35) * 9.6
        const size = 0.008 + ph * 0.022
        put(s.x + Math.sin(ph * 40 + j) * 0.012, y, s.z, size, fizzIn * smooth(0, 0.05, ph))
      }
    }
    for (const b of trail) {
      if (p < b.s) {
        put(0, 1, 0, 0, 0)
        continue
      }
      const at = cubePose(b.s, half, 0)
      const age = p - b.s
      const y = at.y + b.oy + age * b.rise - 0.5 * age * 0 // rises straight up from where it tore off
      const x = at.x + b.ox + Math.sin(age * 60 + b.wob) * (0.02 + b.size * 0.5)
      const fade = 1 - smooth(0.35, 0.6, age)
      put(x, y, b.oz, b.size * (1 + age * 1.5), fade)
    }
    const skinIn = smooth(P_DEEP, 0.75, p)
    for (const b of skin) {
      const ph = (b.phase + time * b.speed * 0.25 + lift * b.speed) % 1
      tmpV.copy(b.local).applyMatrix4(ice.matrixWorld)
      const rise = ph * ph * 2.4
      const x = tmpV.x + Math.sin(ph * 25 + b.wob) * 0.02
      put(x, tmpV.y + rise + 0.02, tmpV.z, b.size * (0.6 + ph), skinIn * smooth(0, 0.1, ph))
    }
    bGeo.attributes.position.needsUpdate = true
    ;(bGeo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true
    ;(bGeo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true

    // underwater the light goes amber; above, the room light is cooler
    const sub = clamp01(-pose.y / half)
    iceMat.attenuationColor.setRGB(mix(0.86, 0.95, sub), mix(0.94, 0.62, sub), mix(1.0, 0.32, sub))
    iceMat.attenuationDistance = mix(6, 1.6, sub)
    rim.intensity = mix(6, 16, sub)
    iceMat.envMapIntensity = mix(2.6, 0.35, sub)
    iceMat.specularColor.setRGB(1, mix(1, 0.62, sub), mix(1, 0.32, sub))
    iceMat.clearcoat = mix(0.8, 0.2, sub)
    iceMat.sheen = mix(0.5, 0.1, sub)

    renderer.render(scene, camera)

    // if a phone struggles, render a little softer rather than drop frames
    if (dt > 0) {
      slowFrames.push(dt)
      if (slowFrames.length > 50) {
        const avg = slowFrames.reduce((a, b) => a + b, 0) / slowFrames.length
        slowFrames.length = 0
        if (avg > 1 / 45 && dprScale > 0.6) {
          dprScale *= 0.85
          resize()
        }
      }
    }
    void viewHalf
  }

  resize()

  return {
    setProgress(v, snap) {
      target = clamp01(v)
      if (snap) p = target
    },
    setLook(x, y) {
      lookX = x
      lookY = y
    },
    resize,
    frame,
    dispose() {
      geo.dispose()
      iceMat.dispose()
      frost.normal.dispose()
      frost.rough.dispose()
      core.geometry.dispose()
      ;(core.material as THREE.MeshStandardMaterial).map?.dispose()
      ;(core.material as THREE.Material).dispose()
      drops.geometry.dispose()
      dropMat.dispose()
      bGeo.dispose()
      bMat.dispose()
      sodaMat.dispose()
      sodaQuad.geometry.dispose()
      envTex.dispose()
      pmrem.dispose()
      renderer.dispose()
    },
  }
}

export const SODA_P_HIT = P_HIT
export const SODA_HALF_H = HALF_H
