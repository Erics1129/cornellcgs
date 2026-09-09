/** A small rasterized city: no ray marching, postprocessing or frame textures. */
export const CITY_DEPTH = 216
export const CITY_STRIDE = 13

/** Measured from the generated 1536x1024 artwork, in top-left image coordinates.
 * Position the cover crop around the horizon so ultrawide screens keep the road.
 */
export const CITY_PLATE = {
  width: 1536, height: 1024,
  vanishingPoint: [0.507, 0.705],
  objectPosition: [0.52, 0.70],
} as const

export function cityProjection(width: number, height: number, imageWidth = CITY_PLATE.width as number, imageHeight = CITY_PLATE.height as number) {
  const cover = Math.max(width / imageWidth, height / imageHeight)
  const renderedWidth = imageWidth * cover, renderedHeight = imageHeight * cover
  const left = (width - renderedWidth) * CITY_PLATE.objectPosition[0]
  const top = (height - renderedHeight) * CITY_PLATE.objectPosition[1]
  const x = (left + renderedWidth * CITY_PLATE.vanishingPoint[0]) / width
  const y = (top + renderedHeight * CITY_PLATE.vanishingPoint[1]) / height
  // Scale the camera intrinsics with the image, not just its vanishing point.
  return { x, y, focal: 1.48 * renderedHeight / height }
}

export const CODE_CITY_VERTEX = `
precision highp float;
attribute vec3 a_position;
attribute vec3 a_origin;
attribute vec2 a_uv;
attribute vec2 a_size;
attribute vec3 a_detail;
uniform float u_travel;
uniform float u_aspect;
uniform vec2 u_pointer;
uniform vec3 u_projection;
varying vec2 v_uv;
varying vec2 v_size;
varying vec3 v_detail;
varying vec3 v_world;
void main() {
  vec3 p = a_position;
  if (a_detail.z < 0.5) {
    // A whole building recycles only after its rearmost wall passes the eye.
    p += vec3(a_origin.x, a_origin.y, mod(a_origin.z - u_travel + 16.0, ${CITY_DEPTH.toFixed(1)}) - 16.0);
  }
  v_world = p;
  p.x -= u_pointer.x * 0.38;
  p.y -= 1.72 + u_pointer.y * 0.09;
  // Cover-cropped image coordinates, converted from top-left UV to clip space.
  vec2 center = u_projection.xy;
  float focal = u_projection.z;
  gl_Position = vec4(p.x * focal / u_aspect + center.x * p.z,
                     p.y * focal + center.y * p.z,
                     1.006 * p.z - 1.4042, p.z);
  v_uv = a_uv;
  v_size = a_size;
  v_detail = a_detail;
}
`

export const CODE_CITY_FRAGMENT = `
precision highp float;
uniform float u_travel;
uniform vec3 u_tint;
uniform sampler2D u_code;
varying vec2 v_uv;
varying vec2 v_size;
varying vec3 v_detail;
varying vec3 v_world;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.31, 37.17))) * 4375.85); }
float line(float d, float width, float aa) { return 1.0 - smoothstep(width, width + aa, abs(d)); }

void main() {
  float z = max(v_world.z, 0.0);
  // Analytic pixel footprint works in WebGL1 without derivative extensions.
  float aa = clamp(z * 0.0017, 0.025, 0.38);
  vec3 cyan = mix(vec3(0.07, 0.72, 1.0), u_tint, 0.30);
  vec3 violet = mix(vec3(0.43, 0.20, 1.0), u_tint, 0.28);
  vec3 col;
  float alpha;
  if (v_detail.z > 0.5) {
    // World-space road markings translate toward the eye, never scale as a plate.
    vec2 p = vec2(v_world.x, v_world.z + u_travel);
    float roadEdge = abs(abs(p.x) - 7.9);
    float rail = line(roadEdge, 0.028, aa);
    float railHalo = line(roadEdge, 0.24, aa * 2.0);
    float dash = 1.0 - smoothstep(2.8, 3.2 + aa, mod(p.y, 9.0));
    float lane = line(abs(p.x) - 5.6, 0.045, aa) * dash;
    float cross = line(mod(p.y + 12.0, 24.0) - 12.0, 0.045, aa);
    cross *= smoothstep(5.7, 8.0, abs(p.x));
    float reflection = exp(-abs(abs(p.x) - 9.0) * 0.75);
    reflection *= 0.5 + 0.5 * sin(p.y * 1.04719755 + sin(p.y * 0.34906585));
    col = vec3(0.006, 0.012, 0.031) + cyan * (rail * 0.58 + railHalo * 0.075 + lane * 0.40);
    col += violet * (cross * 0.18 + reflection * 0.055);
    alpha = (1.0 - smoothstep(18.0, 100.0, z)) * 0.92;
  } else {
    float seed = v_detail.x;
    float face = v_detail.y;
    vec2 uv = v_uv;
    vec3 neon = mix(cyan, violet, step(0.57, fract(seed * 0.73)));
    vec2 cell = floor(uv / vec2(0.76, 1.12));
    vec2 tile = mod(uv, vec2(0.76, 1.12));
    float lit = step(0.35, hash(cell + seed));
    float windowMask = smoothstep(0.15, 0.15 + aa, tile.x) * (1.0 - smoothstep(0.52 - aa, 0.52, tile.x));
    windowMask *= smoothstep(0.22, 0.22 + aa, tile.y) * (1.0 - smoothstep(0.64 - aa, 0.64, tile.y));
    float windowLevel = mix(0.15, 0.70, hash(cell * 1.7 + seed));
    float edge = min(min(uv.x, v_size.x - uv.x), min(uv.y, v_size.y - uv.y));
    float rim = line(edge, 0.025, aa);
    float halo = line(edge, 0.17, aa) * 0.09;
    // Sparse connected traces on glass: vertical buses and floor-level branches.
    float busX = 0.4 + floor(v_size.x * 0.36);
    float bus = line(uv.x - busX, 0.021, aa);
    float branch = line(mod(uv.y + seed, 5.6) - 2.8, 0.020, aa);
    branch *= step(busX, uv.x) * (1.0 - smoothstep(busX + 1.5, busX + 1.8, uv.x));
    float circuit = (bus + branch) * step(0.45, fract(seed * 0.31));
    float panel = line(mod(uv.y, 4.48), 0.035, aa) * 0.13;
    float light = windowMask * lit * windowLevel * 0.48 + rim * 0.48 + halo + circuit * 0.18 + panel;
    col = mix(vec3(0.010, 0.019, 0.045), vec3(0.019, 0.028, 0.060), face * 0.28);
    col += neon * light;
    // Four short, real source fragments baked once into a 1024x512 atlas.
    // A restrained panel per facade; none in the central avenue or sky.
    vec2 panelUV = (uv - vec2(0.35, 3.3)) / vec2(min(v_size.x - 0.7, 5.6), 2.8);
    if (face < 1.5 && v_size.x > 3.0 && panelUV.x > 0.0 && panelUV.x < 1.0 && panelUV.y > 0.0 && panelUV.y < 1.0) {
      float row = floor(mod(seed, 4.0));
      vec2 atlasUV = vec2(panelUV.x, (row + 1.0 - panelUV.y) * 0.25);
      float glyph = texture2D(u_code, atlasUV).a;
      float code = glyph * 0.55 * (1.0 - smoothstep(24.0, 62.0, z));
      col += neon * code;
      light += code;
    }
    float fog = 1.0 - smoothstep(36.0, 164.0, z);
    col = mix(vec3(0.016, 0.034, 0.09), col, fog);
    // Let the photographic glass/architecture remain the main surface. Moving
    // near geometry contributes readable light and slight glass occlusion,
    // rather than opaque boxes that replace the generated city with a grid.
    float nearGlass = 1.0 - smoothstep(12.0, 42.0, z);
    alpha = fog * (0.045 + nearGlass * 0.13 + smoothstep(0.025, 0.30, light) * 0.48);
    if (face > 1.5) { col *= 0.48; alpha *= 0.32; }
  }
  // Straight-alpha shader output; blend state maintains a premultiplied canvas.
  gl_FragColor = vec4(col, alpha);
}
`

/** Static mesh upload. Per-frame travel and parallax need only uniform updates. */
export function createCityGeometry(compact: boolean): { vertices: Float32Array; groundCount: number } {
  const vertices: number[] = []
  const quad = (points: number[][], origin: number[], size: number[], detail: number[]) => {
    const uv = [[0, 0], [size[0], 0], [size[0], size[1]], [0, size[1]]]
    for (const i of [0, 1, 2, 0, 2, 3]) vertices.push(...points[i], ...origin, ...uv[i], ...size, ...detail)
  }
  quad([[-80, 0, 0.7], [80, 0, 0.7], [80, 0, 205], [-80, 0, 205]], [0, 0, 0], [160, 205], [0, 0, 1])
  let seed = 631
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  const rows = compact ? 2 : 3
  const slots = 19
  for (let row = 0; row < rows; row++) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < slots; i++) {
        const width = 3.1 + random() * 3.9
        const depth = 4.0 + random() * 5.0
        const height = 8 + random() * 23 + row * 9
        const x = side * (9.4 + row * 8.5 + width * 0.5 + random() * 1.4)
        const z = i * CITY_DEPTH / slots + random() * 2.0 + row * 3.3
        const origin = [x, 0, z]
        const key = random() * 99
        const w = width / 2, d = depth / 2
        quad([[-w, 0, -d], [w, 0, -d], [w, height, -d], [-w, height, -d]], origin, [width, height], [key, 0, 0])
        // Only the avenue-facing side and roof can face this fixed forward camera.
        const edge = side === -1 ? w : -w
        quad([[edge, 0, -d], [edge, 0, d], [edge, height, d], [edge, height, -d]], origin, [depth, height], [key, 1, 0])
        quad([[-w, height, -d], [w, height, -d], [w, height, d], [-w, height, d]], origin, [width, depth], [key, 2, 0])
      }
    }
  }
  return { vertices: new Float32Array(vertices), groundCount: 6 }
}
