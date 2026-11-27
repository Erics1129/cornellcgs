import*as i from"three";import{GLSL_COMMON as h,GLSL_FRAG as p}from"../../kit/actors/core.js";const s={R:.45,TH:.04,edge:.014},f=18;function g(){const{R:c,TH:d,edge:t}=s,a=d/2,r=[],l=[0,.06,.14,.24,.33,.39,c-t-.012,c-t];for(const e of l)r.push(new i.Vector2(e,a));for(let e=1;e<=8;e++){const o=e/8*(Math.PI/2);r.push(new i.Vector2(c-t+t*Math.sin(o),a-t+t*Math.cos(o)))}for(let e=1;e<=8;e++){const o=e/8*(Math.PI/2);r.push(new i.Vector2(c-t+t*Math.cos(o),-a+t-t*Math.sin(o)))}for(const e of l.slice().reverse())r.push(new i.Vector2(e,-a));return r.filter((e,o)=>o===0||e.distanceTo(r[o-1])>1e-6)}function x(c){const d=new i.LatheGeometry(g(),192),t=()=>Array.from({length:f},()=>new i.Vector3),a={...c.light,uCasters:{value:0},uCC:{value:t()},uCX:{value:t()},uCY:{value:t()},uCZ:{value:t()},uCH:{value:t()},uCK:{value:new Float32Array(f)},uEarth:{value:new i.Color(.34,.42,.62)},uEarthAmt:{value:.36},uSunW:{value:1}},r=new i.ShaderMaterial({uniforms:a,side:i.DoubleSide,vertexShader:`
      varying vec3 vW; varying vec3 vL; varying vec3 vRX; varying vec3 vRY; varying vec3 vRZ;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz; vL = position;
        vRX = mat3(modelMatrix) * vec3(1.0, 0.0, 0.0); vRY = mat3(modelMatrix) * vec3(0.0, 1.0, 0.0); vRZ = mat3(modelMatrix) * vec3(0.0, 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,fragmentShader:`
      ${h}
      ${p}
      #define MAXC ${f}
      uniform int uCasters;
      uniform vec3 uCC[MAXC]; uniform vec3 uCX[MAXC]; uniform vec3 uCY[MAXC]; uniform vec3 uCZ[MAXC]; uniform vec3 uCH[MAXC];
      uniform float uCK[MAXC];
      uniform vec3 uEarth; uniform float uEarthAmt; uniform float uSunW;
      varying vec3 vW; varying vec3 vL; varying vec3 vRX; varying vec3 vRY; varying vec3 vRZ;
      const float R = ${s.R.toFixed(4)}; const float H = ${(s.TH/2).toFixed(4)}; const float EDGE = ${s.edge.toFixed(4)};

      float sdRBox(vec3 q, vec3 b, float r) { vec3 d = abs(q) - b + r; return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - r; }
      vec3 toLocal(int i, vec3 w) { vec3 d = w - uCC[i]; return vec3(dot(d, uCX[i]), dot(d, uCY[i]), dot(d, uCZ[i])); }
      float casterSdf(int i, vec3 w) { vec3 b = uCH[i]; return sdRBox(toLocal(i, w), b, uCK[i] > 0.5 ? min(b.x, b.z) * 0.12 : min(b.x, min(b.y, b.z)) * 0.42); }
      // sun shadow from one caster: 1 lit, 0 in shadow (a 0.5 degree sun: the penumbra grows ~1 cm per metre, plus a little softness)
      float shadowOf(int i, vec3 o, vec3 L) {
        vec3 b = uCH[i];
        vec3 lo = toLocal(i, o), ld = vec3(dot(L, uCX[i]), dot(L, uCY[i]), dot(L, uCZ[i]));
        float rb = length(b);
        float tc = -dot(lo, ld);
        if (tc < -rb) return 1.0;
        vec3 cp = lo + ld * max(tc, 0.0);
        float pen0 = 0.0025 + 0.012 * max(tc, 0.0);
        if (length(cp) > rb + pen0 * 3.0) return 1.0;
        if (uCK[i] > 0.5) {
          // a card: where the ray crosses its middle plane, how far inside its outline
          if (abs(ld.y) < 1e-4) return 1.0;
          float t = -lo.y / ld.y;
          if (t < 0.0) return 1.0;
          vec3 hp = lo + ld * t;
          vec2 q = abs(hp.xz) - b.xz + 0.006;
          float s = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.006;
          float pen = 0.0018 + 0.012 * t;
          return smoothstep(-pen, pen, s);
        }
        // a rounded box: sample the distance along the ray near its closest approach, soft by distance
        float res = 1.0;
        for (int k = 0; k < 7; k++) {
          float t = max(0.002, tc - rb + 2.0 * rb * (float(k) + 0.5) / 7.0);
          float d = sdRBox(lo + ld * t, b, min(b.x, min(b.y, b.z)) * 0.42);
          res = min(res, smoothstep(-0.003, 0.003 + 0.016 * t, d));
        }
        return res;
      }
      // contact darkening: how close the nearest caster is just above this point
      float contact(vec3 w, vec3 N) {
        float occ = 0.0;
        for (int i = 0; i < MAXC; i++) {
          if (i >= uCasters) break;
          if (length(w - uCC[i]) > length(uCH[i]) + 0.06) continue;
          float d1 = casterSdf(i, w + N * 0.006), d2 = casterSdf(i, w + N * 0.022);
          occ += 0.55 * clamp(1.0 - d1 / 0.012, 0.0, 1.0) + 0.35 * clamp(1.0 - d2 / 0.03, 0.0, 1.0);
        }
        return clamp(1.0 - occ * 0.42, 0.45, 1.0);
      }
      float line(float x, float w) { float f = fwidth(x) * 0.9 + 1e-5; return 1.0 - smoothstep(w - f, w + f, abs(x)); }
      // the club's mark printed small in the middle of a face: an isometric cube of three rhombi, each a 7 x 7 grid
      float cubeMark(vec2 q) {
        float s = 0.06;                  // half the mark's height, metres
        q /= s;
        float ink = 0.0;
        // three faces of an isometric cube, each spanned from the centre by two of its edges, each its own tint
        // (top light, left middle, right dark), with the 7 x 7 grid of the logo's blocks drawn in each
        vec2 a = vec2(0.8660254, 0.5), c = vec2(-0.8660254, 0.5), u = vec2(0.0, 1.0);
        for (int f = 0; f < 3; f++) {
          vec2 e1 = f == 0 ? a : f == 1 ? c : -u;
          vec2 e2 = f == 0 ? c : f == 1 ? -u : a;
          vec2 g = inverse(mat2(e1, e2)) * q;          // 0..1 across the face
          vec2 g7 = g * 7.0;
          vec2 fw = fwidth(g7) + 1e-4;                 // (derivatives first, in uniform control flow)
          vec2 cell = fract(g7);
          vec2 l = smoothstep(fw * 0.6, fw * 1.6, cell) * smoothstep(fw * 0.6, fw * 1.6, 1.0 - cell);
          float gap = 1.0 - l.x * l.y;                 // the gaps between blocks print as a fine paper line
          vec2 gi = g * (1.0 - g);
          float inside = smoothstep(0.0, fw.x * 0.14, gi.x) * smoothstep(0.0, fw.y * 0.14, gi.y);
          float tint = f == 0 ? 0.28 : f == 1 ? 0.5 : 0.72;
          ink = max(ink, inside * tint * (1.0 - 0.55 * gap * smoothstep(1.5, 0.6, max(fw.x, fw.y))));
        }
        return ink;
      }
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz; vL = position;
        vRX = mat3(modelMatrix) * vec3(1.0, 0.0, 0.0); vRY = mat3(modelMatrix) * vec3(0.0, 1.0, 0.0); vRZ = mat3(modelMatrix) * vec3(0.0, 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,fragmentShader:`
      ${h}
      ${p}
      #define MAXC ${f}
      uniform int uCasters;
      uniform vec3 uCC[MAXC]; uniform vec3 uCX[MAXC]; uniform vec3 uCY[MAXC]; uniform vec3 uCZ[MAXC]; uniform vec3 uCH[MAXC];
      uniform float uCK[MAXC];
      uniform vec3 uEarth; uniform float uEarthAmt; uniform float uSunW;
      varying vec3 vW; varying vec3 vL; varying vec3 vRX; varying vec3 vRY; varying vec3 vRZ;
      const float R = ${s.R.toFixed(4)}; const float H = ${(s.TH/2).toFixed(4)}; const float EDGE = ${s.edge.toFixed(4)};

      float sdRBox(vec3 q, vec3 b, float r) { vec3 d = abs(q) - b + r; return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - r; }
      vec3 toLocal(int i, vec3 w) { vec3 d = w - uCC[i]; return vec3(dot(d, uCX[i]), dot(d, uCY[i]), dot(d, uCZ[i])); }
      float casterSdf(int i, vec3 w) { vec3 b = uCH[i]; return sdRBox(toLocal(i, w), b, uCK[i] > 0.5 ? min(b.x, b.z) * 0.12 : min(b.x, min(b.y, b.z)) * 0.42); }
      // sun shadow from one caster: 1 lit, 0 in shadow (a 0.5 degree sun: the penumbra grows ~1 cm per metre, plus a little softness)
      float shadowOf(int i, vec3 o, vec3 L) {
        vec3 b = uCH[i];
        vec3 lo = toLocal(i, o), ld = vec3(dot(L, uCX[i]), dot(L, uCY[i]), dot(L, uCZ[i]));
        float rb = length(b);
        float tc = -dot(lo, ld);
        if (tc < -rb) return 1.0;
        vec3 cp = lo + ld * max(tc, 0.0);
        float pen0 = 0.0025 + 0.012 * max(tc, 0.0);
        if (length(cp) > rb + pen0 * 3.0) return 1.0;
        if (uCK[i] > 0.5) {
          // a card: where the ray crosses its middle plane, how far inside its outline
          if (abs(ld.y) < 1e-4) return 1.0;
          float t = -lo.y / ld.y;
          if (t < 0.0) return 1.0;
          vec3 hp = lo + ld * t;
          vec2 q = abs(hp.xz) - b.xz + 0.006;
          float s = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.006;
          float pen = 0.0018 + 0.012 * t;
          return smoothstep(-pen, pen, s);
        }
        // a rounded box: sample the distance along the ray near its closest approach, soft by distance
        float res = 1.0;
        for (int k = 0; k < 7; k++) {
          float t = max(0.002, tc - rb + 2.0 * rb * (float(k) + 0.5) / 7.0);
          float d = sdRBox(lo + ld * t, b, min(b.x, min(b.y, b.z)) * 0.42);
          res = min(res, smoothstep(-0.003, 0.003 + 0.016 * t, d));
        }
        return res;
      }
      // contact darkening: how close the nearest caster is just above this point
      float contact(vec3 w, vec3 N) {
        float occ = 0.0;
        for (int i = 0; i < MAXC; i++) {
          if (i >= uCasters) break;
          if (length(w - uCC[i]) > length(uCH[i]) + 0.06) continue;
          float d1 = casterSdf(i, w + N * 0.006), d2 = casterSdf(i, w + N * 0.022);
          occ += 0.55 * clamp(1.0 - d1 / 0.012, 0.0, 1.0) + 0.35 * clamp(1.0 - d2 / 0.03, 0.0, 1.0);
        }
        return clamp(1.0 - occ * 0.42, 0.45, 1.0);
      }
      float line(float x, float w) { float f = fwidth(x) * 0.9 + 1e-5; return 1.0 - smoothstep(w - f, w + f, abs(x)); }
      // the club's mark printed small in the middle of a face: an isometric cube of three rhombi, each a 7 x 7 grid
      float cubeMark(vec2 q) {
        float s = 0.052;                 // half the mark's height, metres
        q /= s;
        float ink = 0.0;
        // three faces of an isometric cube, each spanned from the centre by two of its edges
        vec2 a = vec2(0.8660254, 0.5), c = vec2(-0.8660254, 0.5), u = vec2(0.0, 1.0);
        for (int f = 0; f < 3; f++) {
          vec2 e1 = f == 0 ? a : f == 1 ? c : -u;
          vec2 e2 = f == 0 ? c : f == 1 ? -u : a;
          vec2 g = inverse(mat2(e1, e2)) * q;          // 0..1 across the face
          vec2 g7 = g * 7.0;
          vec2 fw = fwidth(g7) + 1e-4;                 // (derivatives first, in uniform control flow)
          vec2 cell = fract(g7);
          vec2 l = smoothstep(fw * 0.5, fw * 1.5, cell) * smoothstep(fw * 0.5, fw * 1.5, 1.0 - cell);
          float grid = 1.0 - l.x * l.y;
          float inside = step(0.0, g.x) * step(0.0, g.y) * step(g.x, 1.0) * step(g.y, 1.0);
          ink = max(ink, grid * 0.6 * inside);
        }
        return ink;
      }
      void main() {
        // the exact normal of the shape: flat faces, and round the rim the normal of its rounded section
        float rr0 = length(vL.xz);
        vec3 nl;
        if (rr0 < R - EDGE) nl = vec3(0.0, sign(vL.y), 0.0);
        else {
          vec2 radial = vL.xz / max(rr0, 1e-5);
          vec3 c = vec3(radial.x * (R - EDGE), clamp(vL.y, -H + EDGE, H - EDGE), radial.y * (R - EDGE));
          nl = normalize(vL - c);
        }
        vec3 N = normalize(vRX * nl.x + vRY * nl.y + vRZ * nl.z);
        vec3 V = normalize(cameraPosition - vW);
        float r = length(vL.xz);
        float side = vL.y >= 0.0 ? 1.0 : -1.0;
        vec2 q = vL.xz;                                  // the face's own coordinates (x right, z toward the lens)
        // ---- the carnelian edge band (with the paper meeting it on the rounded corner)
        float band = smoothstep(R - EDGE * 0.58, R - EDGE * 0.38, r);
        // ---- paper: fibre and cockle at their finest scale
        float fib = fbm(vec3(q * 420.0, side * 3.0)) * 0.55 + fbm(vec3(q.x * 900.0 + q.y * 260.0, q.y * 140.0, side)) * 0.45;
        float cockle = fbm(vec3(q * 9.0, side * 7.0));
        vec3 paper = vec3(0.93, 0.85, 0.74) * (0.94 + 0.11 * fib) * (0.975 + 0.05 * cockle);
        // ---- print, in a warm grey ink: a hairline ring, a dotted ring inside it, the mark, a small seat arc each side
        float ink = 0.0;
        ink = max(ink, line(r - 0.405, 0.0007));
        float ang = atan(q.y, q.x);
        float dots = line(r - 0.388, 0.0011) * smoothstep(0.35, 0.15, abs(fract(ang * 96.0 / 6.2831853) - 0.5));
        ink = max(ink, dots * 0.8);
        ink = max(ink, cubeMark(vec2(q.x, -q.y)) * 0.8);
        // the seat marks: a short arc in front of each seat (the near half), like the line at a card table's place
        float seat = line(length(q - vec2(-0.05, 0.25)) - 0.125, 0.0008) * smoothstep(0.02, -0.02, q.y - 0.205) * step(abs(q.x + 0.05), 0.14);
        ink = max(ink, seat * 0.7);
        paper = mix(paper, vec3(0.47, 0.42, 0.37), ink * 0.55 * (1.0 - band));
        // ---- carnelian, worn where the edge rounds over (the paper core shows a little), and a fine seam
        float wear = smoothstep(0.62, 0.86, fbm(vec3(ang * 40.0, vL.y * 260.0, 2.0))) * smoothstep(0.012, 0.004, abs(abs(vL.y) - H * 0.55));
        vec3 carn = vec3(0.478, 0.040, 0.026) * (0.93 + 0.12 * fbm(vec3(ang * 120.0, vL.y * 500.0, 5.0)));
        carn = mix(carn, vec3(0.62, 0.36, 0.30), wear * 0.5);
        float seam = line(abs(vL.y) - H * 0.62, 0.00035) * band;
        carn *= 1.0 - seam * 0.35;
        vec3 base = mix(paper, carn, band);
        // ---- light: the sun (hard, shadowed by the casters), earthlight from below, contact darkening
        vec3 L = uKeyDir;
        float ndl = dot(N, L);
        float sh = 1.0;
        if (ndl > -0.05) {
          vec3 o = vW + N * 0.0015;
          for (int i = 0; i < MAXC; i++) { if (i >= uCasters) break; sh *= shadowOf(i, o, L); }
        }
        float d = smoothstep(-0.08, 0.42, ndl) * sh * uSunW;
        vec3 lit = base * uKeyTint;
        vec3 shade = base * uShadeTint;
        vec3 col = mix(shade, lit, d);
        // earthlight: faces that look down at the daylit Earth (the underside) take its cool light
        col += base * uEarth * uEarthAmt * clamp(-N.y * 0.85 + 0.15, 0.0, 1.0) * (1.0 - 0.6 * d);
        col *= contact(vW, N);
        // the rounded rim catches the sun as a thin warm line; the paper's grain glints faintly at grazing light
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float rimL = smoothstep(0.55, 0.95, 1.0 - ndv) * smoothstep(0.0, 0.5, ndl) * sh;
        col = mix(col, max(col, uRimColor * 0.92), clamp(rimL * 0.55, 0.0, 1.0));
        float spec = pow(max(dot(reflect(-L, N), V), 0.0), 24.0) * 0.05 * sh * (1.0 - band);
        col += uKeyTint * spec * (0.6 + 0.8 * fib);
        col = haze(shoulder(col), length(cameraPosition - vW));
        gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
      }`}),l=new i.Mesh(d,r);l.frustumCulled=!1;const e=new i.Group;e.add(l),c.scene.add(e);const o=new i.Quaternion;return{group:e,mesh:l,uniforms:a,setCasters(u){const m=Math.min(f,u.length);a.uCasters.value=m;for(let n=0;n<m;n++){const v=u[n];o.copy(v.q),a.uCC.value[n].copy(v.c),a.uCX.value[n].set(1,0,0).applyQuaternion(o),a.uCY.value[n].set(0,1,0).applyQuaternion(o),a.uCZ.value[n].set(0,0,1).applyQuaternion(o),a.uCH.value[n].fromArray(v.h),a.uCK.value[n]=v.card?1:0}},dispose(){c.scene.remove(e),d.dispose(),r.dispose()}}}export{f as MAXC,s as TABLE,x as createTable};
