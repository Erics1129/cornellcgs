import*as e from"three";const P=`
uniform vec2 uDance;          // x: seconds, y: amount
uniform vec2 uClip;           // x: the water's height, y: +1 keep below it, -1 keep above it, 0 keep all
vec2 dropinH2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
// a net of light: the borders of slowly moving cells (Voronoi F2 - F1), as the surface's lenses throw it
float dropinNet(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = dropinH2(i + g);
    o = 0.5 + 0.42 * sin(t * (0.6 + 0.5 * o) + 6.2831 * o);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return 1.0 - smoothstep(0.0, 0.16, d2 - d1);
}
float dropinCaus(vec2 p, float t) {
  vec2 w = p + 0.25 * vec2(sin(p.y * 0.9 + t * 0.7), sin(p.x * 0.8 - t * 0.6));
  return max(dropinNet(w, t), 0.6 * dropinNet(w * 1.7 + 4.0, t * 1.3));
}
// the net of light at a point under the water, on a surface facing N (1 = no change)
float dropinDance(vec3 w, vec3 N) {
  if (uDance.y <= 0.0 || w.y > 0.0) return 1.0;
  vec2 s = w.xz + uKeyDir.xz / max(uKeyDir.y, 0.25) * (-w.y);
  float c = dropinCaus(s * 5.5 + vec2(3.1, 1.7), uDance.x * 0.9);
  float face = clamp(dot(N, uKeyDir) * 1.2 + 0.35, 0.0, 1.0);
  // the lit faces sit a little lower, in the dark cells of the net, and its bright threads run over them
  return 1.0 - uDance.y * face * 0.34 + uDance.y * face * c * 1.25;
}
`;function R(c,i,o){c.traverse(t=>{const r=Array.isArray(t.material)?t.material:t.material?[t.material]:[];for(const a of r)if(!a.userData.dropinA)if(a.userData.dropinA=!0,a.isShaderMaterial&&/varying vec3 vWorld/.test(a.fragmentShader)&&/void main\(\) \{/.test(a.fragmentShader)){a.uniforms.uClip=i.uClip,a.uniforms.uDance=i.uDance;let n=a.fragmentShader.replace(/void main\(\) \{/,P+`
void main() {
  if (uClip.y * (vWorld.y - uClip.x) > 0.0) discard;`);/vec3 N = normalize/.test(n)&&n.includes("col = haze(shoulder(col),")&&(n=n.replace("col = haze(shoulder(col),",`col *= dropinDance(vWorld, N);
  col = haze(shoulder(col),`)),n=n.replace("if (wall) col = max(col, uPaper * uKeyTint * 0.9);","if (wall) col = max(col, uPaper * uKeyTint * (vWorld.y < 0.0 ? 0.62 : 0.9));"),a.fragmentShader=n,a.customProgramCacheKey=()=>"dropin-a-under",a.needsUpdate=!0}else(a.isMeshBasicMaterial||a.isMeshStandardMaterial)&&(a.clippingPlanes=[o],a.needsUpdate=!0)})}function W(c,i="#9AA6A8"){let o=null;return c.object.traverse(t=>{t.isMesh&&t.material&&t.material.isMeshBasicMaterial&&!t.isInstancedMesh&&(o=t)}),o.material.color.set(i).convertSRGBToLinear(),{set(t){o.scale.setScalar(1+.2*t)}}}function k(c,i,o){let t=null,r=null;i.object.traverse(s=>{s.isInstancedMesh&&!t&&s.material.isShaderMaterial&&/lightBox/.test(s.material.fragmentShader)&&(t=s),s.isMesh&&!s.isInstancedMesh&&s.material.isMeshBasicMaterial&&(r=s)});const a={value:new e.Vector3},n={uTwin:{value:new e.Vector4(0,.008,.74,0)}},l=t.material.vertexShader.replace("vec4 wp = m * vec4(position, 1.0);",`vec4 wp = m * vec4(position, 1.0);
  wp.xz += uTwin.y * vec2(sin(wp.y * 41.0 + uTwin.x * 5.3 + wp.x * 9.0), cos(wp.y * 33.0 - uTwin.x * 4.1 + wp.z * 7.0));`).replace("void main() {",`uniform vec4 uTwin;
void main() {`);let d=t.material.fragmentShader.replace("void main() {",`uniform vec4 uTwin;
void main() {
  if (vWorld.y < 0.0) discard;
  { vec3 dv = normalize(vWorld - cameraPosition); if (dv.y > 0.655) discard; }`).replace("gl_FragColor = linearToOutputTexel(vec4(col, 1.0));",`col *= uTwin.z;
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));`);const u=new e.ShaderMaterial({vertexShader:l,fragmentShader:d,uniforms:{...t.material.uniforms,uKeyDir:a,uClip:{value:new e.Vector2(0,-1)},uDance:{value:new e.Vector2(0,0)},...n}});u.extensions={derivatives:!0};const m=new e.InstancedMesh(t.geometry,u,t.count);m.instanceMatrix=t.instanceMatrix,m.frustumCulled=!1;const x=new e.Plane(new e.Vector3(0,1,0),0),h=r.material.clone();h.clippingPlanes=[x];const f=new e.Mesh(r.geometry,h),v=new e.Group;v.matrixAutoUpdate=!1,v.add(m,f);const b=new e.Matrix4().makeScale(1,-1,1);let p=!1;return{object:v,show(s){p=!!s},update(){v.visible=p&&i.object.visible,v.visible&&(t.updateWorldMatrix(!0,!1),v.matrix.multiplyMatrices(b,t.matrixWorld),r.updateMatrix(),f.matrix.copy(r.matrix),f.matrixAutoUpdate=!1,f.visible=r.visible,a.value.copy(c.light.uKeyDir.value),a.value.y*=-1,n.uTwin.value.x=o.uDance.value.x)},dispose(){u.dispose(),h.dispose()}}}const z=`
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,D=`
varying vec3 vW;
uniform vec3 uCam; uniform float uTime; uniform vec3 uSunA; uniform float uSky;
uniform vec4 uPl; uniform vec3 uPlF, uPlR, uPlU; uniform vec2 uPlDim;   // the plane above the water: centre + amount, axes, half length / half span
uniform vec4 uCb; uniform vec3 uCbX, uCbY, uCbZ;                        // the cube above the water: centre + amount, axes x half sizes
uniform vec4 uRing[6]; uniform vec4 uFroth[2]; uniform vec4 uMen;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
vec4 over(vec4 acc, vec3 c, float a) { a = clamp(a, 0.0, 1.0); return vec4(c * a + acc.rgb * (1.0 - a), a + acc.a * (1.0 - a)); }
void main() {
  vec3 d = vW - uCam; float t = length(d); d /= t;
  if (d.y <= 0.02) discard;
  vec2 x = vW.xz;
  // the rings: wave packets travelling out from where something broke the surface
  vec2 rs = vec2(0.0); float rh = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 r = uRing[i];
    if (r.w <= 0.0) continue;
    vec2 dd = x - r.xy; float rho = length(dd) + 1e-4;
    float age = r.z;
    float th = atan(dd.y, dd.x);
    float R = 0.05 + 0.38 * age + 0.012 * sin(3.0 * th + r.x * 7.0) * age + 0.008 * sin(5.0 * th + 1.3);
    float lam = 0.065 + 0.022 * age, sig = 0.6 * lam + 0.015 * age;
    float amp = r.w * exp(-1.5 * age) / (1.0 + 3.0 * R);
    float u = rho - R;
    float env = exp(-u * u / (sig * sig)) * smoothstep(0.0, 0.08, rho);
    float ph = 6.2831 * u / lam;
    rh += amp * env * cos(ph);
    rs += amp * env * (-sin(ph) * 6.2831 / lam) * dd / rho;
  }
  // the surface's own small ripples, and the rings, tilt its normal
  vec2 sl = 0.022 * vec2(sin(x.x * 7.1 + uTime * 2.3 + 1.3 * sin(x.y * 3.1)), cos(x.y * 6.3 - uTime * 2.0))
          + 0.016 * vec2(sin(x.y * 13.7 - uTime * 3.1 + x.x * 4.0), cos(x.x * 11.9 + uTime * 2.7))
          + 0.008 * vec2(sin(x.x * 23.0 + x.y * 9.0 - uTime * 4.2), cos(x.y * 21.0 - x.x * 7.0 + uTime * 3.6))
          + rs * 0.032;
  vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));
  vec3 rr = refract(d, -N, 1.333);
  float sinT = sqrt(max(0.0, 1.0 - d.y * d.y));
  float win = 1.0 - smoothstep(0.645, 0.74, sinT);
  vec4 acc = vec4(0.0);
  if (dot(rr, rr) > 0.0 && win > 0.0) {
    // the sky through the window: blue, a few slow clouds; the sun's glitter is the world's own
    float ct = clamp(rr.y, 0.0, 1.0);
    vec3 sky = mix(vec3(0.80, 0.91, 0.98), vec3(0.40, 0.66, 0.92), pow(ct, 0.7));
    vec2 cuv = rr.xz / (rr.y + 0.14) * 0.62 + vec2(uTime * 0.010, uTime * 0.0035);
    float cl = fbm(cuv * 1.5 + 3.0);
    float cloud = smoothstep(0.47, 0.70, cl) * smoothstep(0.0, 0.3, ct);
    vec3 cc = mix(vec3(0.74, 0.80, 0.88), vec3(1.0, 0.995, 0.98), smoothstep(0.45, 0.8, fbm(cuv * 3.2 + 7.0)));
    sky = mix(sky, cc, cloud);
    float mu = dot(rr, uSunA);
    float sunK = smoothstep(0.88, 0.985, mu);
    float a = uSky * win * (1.0 - sunK) * mix(0.55, 0.88, cloud) * (1.0 - 0.45 * smoothstep(0.55, 0.7, sinT));
    acc = over(acc, sky, a);
    float wob = 0.004 + 0.0;
    // the cube above the water (farther), seen through the surface: a ray through a box
    if (uCb.w > 0.0) {
      vec3 o = vW - uCb.xyz;
      vec3 ol = vec3(dot(o, uCbX) / dot(uCbX, uCbX), dot(o, uCbY) / dot(uCbY, uCbY), dot(o, uCbZ) / dot(uCbZ, uCbZ));
      vec3 dl = vec3(dot(rr, uCbX) / dot(uCbX, uCbX), dot(rr, uCbY) / dot(uCbY, uCbY), dot(rr, uCbZ) / dot(uCbZ, uCbZ));
      vec3 t1 = (-1.0 - ol) / dl, t2 = (1.0 - ol) / dl;
      vec3 tn = min(t1, t2), tf = max(t1, t2);
      float t0 = max(max(tn.x, tn.y), max(tn.z, 0.0)), t3 = min(tf.x, min(tf.y, tf.z));
      float cov = smoothstep(0.0, 0.012 + 0.01 * t0, t3 - t0);
      vec3 cc2 = vec3(0.33, 0.40, 0.48);                                   // clay in its own shade, seen from below
      acc = over(acc, cc2, cov * 0.88 * uCb.w * win);
    }
    // the plane above the water: its paper, lit from above, glows through where the sun comes through it
    if (uPl.w > 0.0) {
      float s = dot(uPl.xyz - vW, uPlU) / dot(rr, uPlU);
      if (s > 0.0) {
        vec3 hp = vW + rr * s - uPl.xyz;
        float aa = dot(hp, uPlF), bb = dot(hp, uPlR);
        float L = uPlDim.x, Wd = uPlDim.y;
        float w = Wd * clamp((L - aa) / (2.0 * L), 0.0, 1.0);
        float notch = 0.18 * Wd * smoothstep(0.0, 1.0, abs(bb) / max(Wd, 1e-3));
        float e = 0.008 + 0.03 * s;
        float cov = smoothstep(-e, e, w - abs(bb)) * smoothstep(-e, e, aa + L - notch) * smoothstep(-e, e, L - aa);
        float keel = 1.0 - smoothstep(0.008, 0.02, abs(bb));
        float fold = 1.0 - smoothstep(0.004, 0.012, abs(abs(bb) - 0.42 * w));
        float fibre = fbm(vec2(aa * 60.0, bb * 160.0));
        vec3 pc = vec3(0.60, 0.24, 0.18) * (0.92 + 0.16 * fibre);
        pc *= 1.0 + 0.4 * clamp(dot(rr, uSunA) - 0.6, 0.0, 1.0);           // the paper glows toward the sun
        pc = mix(pc, vec3(0.86, 0.52, 0.40), 0.35 * smoothstep(0.55 * w, w, abs(bb)));   // thin at the wing's edge: the light comes through
        pc = mix(pc, pc * 0.55, max(keel, fold * 0.6));
        acc = over(acc, pc, cov * 0.84 * uPl.w * win);
      }
    }
  }
  // outside the window the underside is a mirror of the sunlit sand below: its net of light, wavering
  if (dot(rr, rr) <= 0.0 || sinT > 0.62) {
    vec3 rv = reflect(d, -N);
    float s2 = (-6.0) / min(rv.y, -0.05);
    vec2 fp = vW.xz + rv.xz * s2;
    vec2 g = fp * 1.7 + vec2(uTime * 0.05, -uTime * 0.03);
    float net = abs(sin(g.x * 2.1 + sin(g.y * 1.3 + uTime * 0.6) * 1.6) + sin(g.y * 1.9 + sin(g.x * 1.1 - uTime * 0.5) * 1.4));
    float lines = pow(clamp(1.0 - net * 0.55, 0.0, 1.0), 6.0);
    float m = smoothstep(0.6, 0.72, sinT) * exp(-0.09 * (t + s2)) * (1.0 - smoothstep(0.9, 0.99, sinT));
    acc = over(acc, vec3(0.72, 0.95, 0.90), lines * m * 0.55);
  }
  // the rim of the window: the horizon's light squeezed into a soft bright band (the window does not end in a cut)
  float rimB = smoothstep(0.6, 0.67, sinT) * (1.0 - smoothstep(0.68, 0.79, sinT + 0.02 * sin(x.x * 9.0 + uTime) ));
  acc = over(acc, mix(vec3(0.80, 0.92, 0.96), vec3(0.42, 0.72, 0.78), smoothstep(0.64, 0.76, sinT)), rimB * 0.42);
  // the rings, as the eye sees them: a crest catches the light, faintly, in the window and the mirror alike
  float hb = rh * 7.0;
  if (hb > 0.0) acc = over(acc, vec3(0.92, 0.98, 1.0), min(hb, 0.22) * (1.0 - 0.6 * win));   // in the window the rings mostly bend the sky
  else acc = over(acc, vec3(0.03, 0.15, 0.22), min(-hb, 0.08));
  // a splash seen from below: a crown of white water, breaking up as it spreads
  for (int i = 0; i < 2; i++) {
    vec4 f = uFroth[i];
    if (f.w <= 0.0 || f.z < 0.0) continue;
    float rho = length(x - f.xy), age = f.z;
    float R = f.w * (0.3 + 0.7 * (1.0 - exp(-age * 7.0)));
    float n = fbm((x - f.xy) * 22.0 + vec2(age * 1.3, -age));
    float core = 1.0 - smoothstep(R * 0.45, R, rho + (n - 0.5) * 0.09);
    float rim = exp(-pow((rho - R * 0.9) / (0.03 + 0.04 * age), 2.0));
    float brk = smoothstep(0.18 + age * 0.5, 0.36 + age * 0.5, n);
    float fa = max(core, rim * 0.85) * brk * exp(-age * 1.25);
    acc = over(acc, vec3(0.94, 0.985, 1.0), fa);
  }
  // the meniscus: a thin bright line where the floating cube pierces the water, a darker band just outside
  if (uMen.w > 0.0) {
    vec2 q = x - uMen.xy;
    float c = cos(uMen.z), s2 = sin(uMen.z);
    q = vec2(c * q.x - s2 * q.y, s2 * q.x + c * q.y);
    vec2 bq = abs(q) - vec2(uMen.w);
    float dist = length(max(bq, 0.0)) + min(max(bq.x, bq.y), 0.0);
    float line = exp(-pow((dist - 0.003) / 0.0045, 2.0));
    float band = smoothstep(0.004, 0.012, dist) * (1.0 - smoothstep(0.02, 0.06, dist));
    acc = over(acc, vec3(0.03, 0.12, 0.18), band * 0.22);
    acc = over(acc, vec3(0.88, 0.97, 1.0), line * 0.75);
  }
  acc *= exp(-t * 0.07) * (1.0 - smoothstep(9.0, 15.0, t));
  gl_FragColor = acc;
}`;function q(c){const i={uCam:{value:new e.Vector3},uTime:{value:0},uSky:{value:1},uSunA:{value:new e.Vector3(.4927,.866,-.085).normalize()},uPl:{value:new e.Vector4},uPlF:{value:new e.Vector3},uPlR:{value:new e.Vector3},uPlU:{value:new e.Vector3},uPlDim:{value:new e.Vector2(.3,.2)},uCb:{value:new e.Vector4},uCbX:{value:new e.Vector3},uCbY:{value:new e.Vector3},uCbZ:{value:new e.Vector3},uRing:{value:Array.from({length:6},()=>new e.Vector4)},uFroth:{value:Array.from({length:2},()=>new e.Vector4)},uMen:{value:new e.Vector4}},o=new e.PlaneGeometry(28,28,1,1);o.rotateX(-Math.PI/2);const t=new e.ShaderMaterial({vertexShader:z,fragmentShader:D,uniforms:i,transparent:!0,depthWrite:!1,depthTest:!0,side:e.DoubleSide,blending:e.CustomBlending,blendSrc:e.OneFactor,blendDst:e.OneMinusSrcAlphaFactor,blendSrcAlpha:e.OneFactor,blendDstAlpha:e.OneMinusSrcAlphaFactor}),r=new e.Mesh(o,t);return r.position.set(.6,-.003,1.6),r.frustumCulled=!1,r.renderOrder=7,{object:r,U:i,update(){i.uCam.value.copy(c.camera.position)},dispose(){o.dispose(),t.dispose()}}}const A=`
attribute vec4 aB;            // x: radius (px), y: alpha, z: rim (0 a soft mote .. 1 a bubble's bright ring), w: seed
varying vec4 vB;
void main() { vB = aB; gl_PointSize = aB.x * 2.0; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,B=`
varying vec4 vB;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0; float r = length(q);
  if (r > 1.0) discard;
  float edge = 1.0 - smoothstep(0.86, 1.0, r);
  float disc = 0.55 + 0.45 * smoothstep(0.35, 0.95, r) * vB.z;                 // a bubble's disc is brighter at its rim
  float hi = exp(-pow(length(q - vec2(-0.32, 0.36)) / 0.22, 2.0)) * 0.6 * vB.z;   // and holds a small window of light
  float a = vB.y * edge * (disc + hi);
  vec3 c = mix(vec3(0.80, 0.95, 1.0), vec3(1.0), hi);
  gl_FragColor = vec4(c * a, a);
}`;function V(c,i=24){const o=new e.BufferGeometry,t=new Float32Array(i*3),r=new Float32Array(i*4);o.setAttribute("position",new e.BufferAttribute(t,3).setUsage(e.DynamicDrawUsage)),o.setAttribute("aB",new e.BufferAttribute(r,4).setUsage(e.DynamicDrawUsage)),o.setDrawRange(0,0);const a=new e.ShaderMaterial({vertexShader:A,fragmentShader:B,transparent:!0,depthWrite:!1,depthTest:!1,blending:e.CustomBlending,blendSrc:e.OneFactor,blendDst:e.OneMinusSrcAlphaFactor}),n=new e.Points(o,a);n.frustumCulled=!1,n.renderOrder=20;let l=0;const d=new e.Vector3;return{object:n,clear(){l=0},add(u,m,{focus:x=1.5,alpha:h=.35,rim:f=1,seed:v=0,maxPx:b=140}={}){if(l>=i)return;const p=c.camera;d.fromArray(u).applyMatrix4(p.matrixWorldInverse);const w=-d.z;if(w<.06)return;const s=c.height||720,y=s/(2*Math.tan(p.fov*Math.PI/360)),g=m*y/w,M=Math.abs(1-x/w)*.012*y,C=Math.min(b*(s/720),Math.sqrt(g*g+M*M)),S=h*Math.min(1,Math.pow(g/Math.max(C,.001),.9)+.18),T=c.renderer.getPixelRatio();t.set(u,l*3),r.set([C*T,S,f,v],l*4),l++},update(){o.setDrawRange(0,l),o.attributes.position.needsUpdate=!0,o.attributes.aB.needsUpdate=!0},dispose(){o.dispose(),a.dispose()}}}const F=`
varying vec2 vUv;
uniform vec4 uS;   // x: amount, y: softness (0..1 of the half size), z: yaw, w: unused
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float c = cos(uS.z), s = sin(uS.z);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  vec2 b = abs(q) - vec2(0.42);
  float d = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0);
  float a = uS.x * (1.0 - smoothstep(-uS.y, uS.y, d));
  gl_FragColor = vec4(mix(vec3(1.0), vec3(0.52, 0.66, 0.72), a), 1.0);
}`;function U(c){const i=new e.PlaneGeometry(1,1);i.rotateX(-Math.PI/2);const o={uS:{value:new e.Vector4(0,.4,0,0)}},t=new e.ShaderMaterial({vertexShader:"varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }",fragmentShader:F,uniforms:o,transparent:!0,depthWrite:!1,depthTest:!0,blending:e.CustomBlending,blendSrc:e.ZeroFactor,blendDst:e.SrcColorFactor,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-4}),r=new e.Mesh(i,t);return r.frustumCulled=!1,r.renderOrder=1,{object:r,set(a,n,l,d=0,u=.45){r.visible=l>.003,r.position.fromArray(a),r.scale.setScalar(n),o.uS.value.set(l,u,d,0)},dispose(){i.dispose(),t.dispose()}}}export{V as createBokeh,U as createSandShadow,q as createSurface,k as createTwin,W as fillCore,R as patchPlayers};
