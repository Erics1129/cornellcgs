import*as r from"three";const ot=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]],$e=`
precision highp float; precision highp int; precision highp sampler2D;
// the depth pre-pass (colour writes off) and the colour pass (EQUAL test) run this shader in two GPU
// pipelines; without 'invariant' Metal (ANGLE, Chrome and Safari) may compile them with different
// floating-point contractions, the two depths then differ in the last bit and the EQUAL test drops
// whole runs of pixels (the plate's fallback grey-blue showed through as specks)
invariant gl_Position;
uniform sampler2D uDepth;     // the film's depth atlas (RGB8: R*256+G = s / sMax * 65535, B = edge bits)
uniform ivec2 uTile;          // this frame's tile origin in the atlas (texels)
uniform ivec2 uGrid;          // samples per frame (gw, gh)
uniform float uSMax;
uniform mat4 uM;              // homogeneous source view -> target clip
uniform vec4 uSrc;            // source lens: (tan of half the horizontal fov, of the vertical, ndc x offset, ndc y offset)
uniform vec2 uTgtPx;          // target: film pixels per NDC unit (x, y), so stretch is measured in film pixels
uniform float uNear;          // the plate's own near plane (for its depth test only; not the players' camera)
uniform float uSkirt;         // weight floor of the skirt
uniform vec2 uFilm;           // film frame size in pixels (1280, 720)
uniform float uFlat;          // tests: 1 = treat everything as infinitely far (rotation only)
uniform float uHalo;          // the weight of a grown (halo) sample: the other frame's own view wins there
out vec2 vUv;
out float vTrust;
flat out float vValid;

int dirIndex(ivec2 d) {
  if (d.y == 0) return d.x > 0 ? 0 : 4;
  if (d.x == 0) return d.y > 0 ? 2 : 6;
  if (d.y > 0) return d.x > 0 ? 1 : 3;
  return d.x > 0 ? 7 : 5;
}
// grid coordinate -1 and g are the skirt: far outside the frame (two frame sizes), edge colour and depth
float filmCoord(int i, int g) { return i < 0 ? -2.0 : i >= g ? 3.0 : (float(i) + 0.5) / float(g); }
// x: s = 1 / depth, y: depth-edge bits, z: 1 if the sample was grown from a nearer neighbour (a halo)
vec4 sampleAt(ivec2 c) {
  ivec2 k = clamp(c, ivec2(0), uGrid - 1);
  vec4 t = texelFetch(uDepth, uTile + k, 0);
  float g = floor(t.g * 255.0 + 0.5);
  float grown = mod(g, 2.0);
  float s = (floor(t.r * 255.0 + 0.5) * 256.0 + g - grown) / 65535.0 * uSMax;
  return vec4(s * (1.0 - uFlat), floor(t.b * 255.0 + 0.5) * (1.0 - uFlat), grown * (1.0 - uFlat), 0.0);
}
vec4 lift(ivec2 c, float s, out vec2 uv) {
  uv = vec2(filmCoord(c.x, uGrid.x), filmCoord(c.y, uGrid.y));
  vec2 ndc = vec2(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  return vec4((ndc.x + uSrc.z) * uSrc.x, (ndc.y + uSrc.w) * uSrc.y, -1.0, s);
}
void main() {
  int id = gl_VertexID;
  int cell = id / 6, corner = id - cell * 6;
  int cw = uGrid.x + 1;                       // cells across, including the skirt columns
  ivec2 c0 = ivec2(cell - (cell / cw) * cw, cell / cw) - 1;   // the cell's top-left vertex (-1 .. g-1)
  // two triangles per cell, split along the diagonal whose ends are closer in depth (so a depth edge
  // runs along triangle edges, not across them: no staircase on a diagonal silhouette)
  float sTL = sampleAt(c0).x, sBR = sampleAt(c0 + ivec2(1, 1)).x, sTR = sampleAt(c0 + ivec2(1, 0)).x, sBL = sampleAt(c0 + ivec2(0, 1)).x;
  bool other = abs(sTR - sBL) < abs(sTL - sBR) * 0.999;
  ivec2 T[6] = ivec2[6](ivec2(0, 0), ivec2(1, 1), ivec2(1, 0), ivec2(0, 0), ivec2(0, 1), ivec2(1, 1));
  if (other) T = ivec2[6](ivec2(0, 0), ivec2(0, 1), ivec2(1, 0), ivec2(1, 0), ivec2(0, 1), ivec2(1, 1));
  int t0 = corner < 3 ? 0 : 3;
  ivec2 P[3] = ivec2[3](c0 + T[t0], c0 + T[t0 + 1], c0 + T[t0 + 2]);
  int me = corner - t0;
  vec4 clip[3]; vec2 src[3]; vec2 uv[3]; float bits[3]; bool skirt = false; bool behind = false; bool sky = true;
  for (int k = 0; k < 3; k++) {
    vec4 d = sampleAt(P[k]);
    bits[k] = d.y;
    if (d.x > 0.0) sky = false;
    if (k == corner - (corner < 3 ? 0 : 3)) vTrust = d.z > 0.5 ? uHalo : 1.0;
    vec4 h = lift(P[k], d.x, uv[k]);
    clip[k] = uM * h;
    clip[k].z = 0.99999 * (clip[k].w - 2.0 * uNear * h.w);
    src[k] = uv[k] * uFilm;
    if (P[k].x < 0 || P[k].y < 0 || P[k].x >= uGrid.x || P[k].y >= uGrid.y) skirt = true;
    if (clip[k].w <= 1e-6) behind = true;
  }
  float valid = 1.0;
  // a skirt triangle (it reaches outside the frame) on SKY (s = 0 at its edge samples: sky, haze, cloud,
  // whose look changes from frame to frame by tone, not by shape) carries the frame's edge outward: the
  // fragment shader fades it out with the distance outside the frame (uFeather), so where the other
  // frame does not reach, the in-between keeps a soft share of this one instead of a hard seam. Over a
  // surface (brick, grass) the skirt stays a floor: the other frame's real pixels fill there.
  if (behind || (skirt && !sky)) valid = 0.0;
  else {
    vec2 tg[3];
    for (int k = 0; k < 3; k++) tg[k] = clip[k].xy / clip[k].w * uTgtPx;
    // folded: the triangle turned over
    float aS = (src[1].x - src[0].x) * (src[2].y - src[0].y) - (src[2].x - src[0].x) * (src[1].y - src[0].y);
    float aT = (tg[1].x - tg[0].x) * -(tg[2].y - tg[0].y) - (tg[2].x - tg[0].x) * -(tg[1].y - tg[0].y);
    if (aS * aT <= 0.0) valid = 0.0;
    else {
      // edge lengths in film pixels, before and after; a step across a depth edge that stretches
      // or shrinks beyond the triangle's own scale is a tear
      float ls[3], lt[3]; bool disc[3]; float rmin = 1e9, rsum = 0.0, nsum = 0.0;
      for (int k = 0; k < 3; k++) {
        int a = k, b = k == 2 ? 0 : k + 1;
        ls[k] = length(src[b] - src[a]); lt[k] = length(tg[b] - tg[a]);
        int bit = dirIndex(P[b] - P[a]);
        disc[k] = mod(floor(bits[a] / exp2(float(bit))), 2.0) > 0.5;
        float r = lt[k] / max(ls[k], 1e-4);
        if (!disc[k]) { rsum += r; nsum += 1.0; }
        rmin = min(rmin, r);
      }
      float rref = nsum > 0.0 ? rsum / nsum : rmin;
      // a step across a depth edge that STRETCHES is a rubber sheet over what this frame never saw:
      // drop it (the other frame fills). One that shrinks is a surface turning away or going behind a
      // nearer one: keep it (the depth test sorts it out), unless it nearly vanished.
      float tear = 0.0, squeeze = 0.0;
      for (int k = 0; k < 3; k++) if (disc[k]) {
        tear = max(tear, lt[k] - rref * ls[k]);
        squeeze = max(squeeze, 1.0 - lt[k] / max(rref * ls[k], 1e-4));
      }
      valid = (1.0 - smoothstep(1.5, 5.0, tear)) * (1.0 - smoothstep(0.75, 0.95, squeeze));
    }
  }
  vValid = max(valid, uSkirt);
  vUv = uv[me];
  gl_Position = clip[me];
}`,Ze=`
precision highp float;
uniform sampler2D uFrame;
uniform float uWeight;
uniform float uSharp;         // 1: Catmull-Rom (the film is magnified or 1:1), 0: trilinear (minified)
uniform float uJref;          // film texels per drawn pixel, squared, of an unwarped picture
uniform vec2 uFilm;           // film frame size in pixels
uniform float uSkirt;         // weight floor of the skirt
uniform float uFeather;       // film pixels outside the frame over which its carried edge fades out
in vec2 vUv;
in float vTrust;
flat in float vValid;
out vec4 outColor;
// Catmull-Rom in 9 bilinear taps: a fractional shift keeps the film as sharp as the frame itself
// (bilinear would soften every in-between and the picture would pulse sharp-soft 12 times a second);
// at a texel centre it returns the texel exactly
vec3 catmullRom(vec2 uv) {
  vec2 size = vec2(textureSize(uFrame, 0));
  vec2 sp = uv * size;
  vec2 t1 = floor(sp - 0.5) + 0.5;
  vec2 f = sp - t1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 p0 = (t1 - 1.0) / size, p3 = (t1 + 2.0) / size, p12 = (t1 + w2 / w12) / size;
  vec3 r = textureLod(uFrame, vec2(p0.x, p0.y), 0.0).rgb * w0.x * w0.y
         + textureLod(uFrame, vec2(p12.x, p0.y), 0.0).rgb * w12.x * w0.y
         + textureLod(uFrame, vec2(p3.x, p0.y), 0.0).rgb * w3.x * w0.y
         + textureLod(uFrame, vec2(p0.x, p12.y), 0.0).rgb * w0.x * w12.y
         + textureLod(uFrame, vec2(p12.x, p12.y), 0.0).rgb * w12.x * w12.y
         + textureLod(uFrame, vec2(p3.x, p12.y), 0.0).rgb * w3.x * w12.y
         + textureLod(uFrame, vec2(p0.x, p3.y), 0.0).rgb * w0.x * w3.y
         + textureLod(uFrame, vec2(p12.x, p3.y), 0.0).rgb * w12.x * w3.y
         + textureLod(uFrame, vec2(p3.x, p3.y), 0.0).rgb * w3.x * w3.y;
  return clamp(r, 0.0, 1.0);
}
void main() {
  vec2 uv = clamp(vUv, vec2(0.0), vec2(1.0));
  // outside the frame (the skirt): how far, in film pixels; the edge is carried out blurred (a wider
  // mip the farther out, so it is a tone, never streaks) and fades to the floor over uFeather
  vec2 o = max(max(-vUv, vUv - 1.0), 0.0) * uFilm;
  float dOut = max(o.x, o.y);
  vec3 c = uSharp > 0.5 ? catmullRom(uv) : texture(uFrame, uv).rgb;
  float cover = 1.0;
  if (dOut > 0.0 && vValid > 0.01) {   // a carried (sky) skirt; any other skirt keeps its plain edge colour at the floor weight
    c = textureLod(uFrame, uv, min(6.0, log2(1.0 + dOut * 0.25))).rgb;
    cover = 1.0 - smoothstep(0.0, uFeather, dOut);
  }
  // where one frame sees a surface in more detail than the other (it was closer, or less slanted),
  // it leads: the in-between keeps the detail instead of averaging it with a magnified copy
  vec2 st = vUv * vec2(textureSize(uFrame, 0));
  vec2 dx = dFdx(st), dy = dFdy(st);
  float detail = clamp(abs(dx.x * dy.y - dx.y * dy.x) / uJref, 0.35, 2.5);
  float w = uWeight * max(vValid * cover, uSkirt) * vTrust * detail;
  outColor = vec4(c * w, w);
}`,et=`
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uDepth;
uniform ivec2 uTile;
uniform ivec2 uGrid;
uniform float uSMax;
uniform mat4 uM;
uniform vec4 uSrc;
uniform vec2 uTgtPx;
uniform vec2 uFilm;
uniform float uA;             // (far + near) / (far - near) of the players' projection
uniform vec2 uBias;           // push the depth back by (relative, metres)
out vec2 vUv;
out float vKeep;
int dirIndex(ivec2 d) {
  if (d.y == 0) return d.x > 0 ? 0 : 4;
  if (d.x == 0) return d.y > 0 ? 2 : 6;
  if (d.y > 0) return d.x > 0 ? 1 : 3;
  return d.x > 0 ? 7 : 5;
}
float filmCoord(int i, int g) { return i < 0 ? -2.0 : i >= g ? 3.0 : (float(i) + 0.5) / float(g); }
vec4 sampleAt(ivec2 c) {
  ivec2 k = clamp(c, ivec2(0), uGrid - 1);
  vec4 t = texelFetch(uDepth, uTile + k, 0);
  float g = floor(t.g * 255.0 + 0.5);
  float grown = mod(g, 2.0);
  float s = (floor(t.r * 255.0 + 0.5) * 256.0 + g - grown) / 65535.0 * uSMax;
  return vec4(s, floor(t.b * 255.0 + 0.5), grown, 0.0);
}
vec4 lift(ivec2 c, float s, out vec2 uv) {
  uv = vec2(filmCoord(c.x, uGrid.x), filmCoord(c.y, uGrid.y));
  vec2 ndc = vec2(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  return vec4((ndc.x + uSrc.z) * uSrc.x, (ndc.y + uSrc.w) * uSrc.y, -1.0, s);
}
void main() {
  int id = gl_VertexID;
  int cell = id / 6, corner = id - cell * 6;
  int cw = uGrid.x + 1;
  ivec2 c0 = ivec2(cell - (cell / cw) * cw, cell / cw) - 1;
  float sTL = sampleAt(c0).x, sBR = sampleAt(c0 + ivec2(1, 1)).x, sTR = sampleAt(c0 + ivec2(1, 0)).x, sBL = sampleAt(c0 + ivec2(0, 1)).x;
  bool other = abs(sTR - sBL) < abs(sTL - sBR) * 0.999;
  ivec2 T[6] = ivec2[6](ivec2(0, 0), ivec2(1, 1), ivec2(1, 0), ivec2(0, 0), ivec2(0, 1), ivec2(1, 1));
  if (other) T = ivec2[6](ivec2(0, 0), ivec2(0, 1), ivec2(1, 0), ivec2(1, 0), ivec2(0, 1), ivec2(1, 1));
  int t0 = corner < 3 ? 0 : 3;
  ivec2 P[3] = ivec2[3](c0 + T[t0], c0 + T[t0 + 1], c0 + T[t0 + 2]);
  int me = corner - t0;
  vec4 d[3]; float sNear = 0.0; bool skirt = false, step = false;
  for (int k = 0; k < 3; k++) {
    d[k] = sampleAt(P[k]);
    sNear = max(sNear, d[k].x);
    if (P[k].x < 0 || P[k].y < 0 || P[k].x >= uGrid.x || P[k].y >= uGrid.y) skirt = true;
  }
  for (int k = 0; k < 3; k++) {
    int b = k == 2 ? 0 : k + 1;
    if (mod(floor(d[k].y / exp2(float(dirIndex(P[b] - P[k])))), 2.0) > 0.5) step = true;
  }
  // a step: every corner at the nearest surface; keep the near corners (and never a grown one)
  vec4 clip[3]; vec2 uv[3]; float keep[3]; bool behind = false;
  for (int k = 0; k < 3; k++) {
    bool near = !step || d[k].x >= 0.6 * sNear;
    keep[k] = near && d[k].z < 0.5 ? 1.0 : 0.0;
    vec4 h = lift(P[k], step ? sNear : d[k].x, uv[k]);
    clip[k] = uM * h;
    clip[k].z = uA * clip[k].w + (clip[k].z - uA * clip[k].w) / ((1.0 + uBias.x) + uBias.y * h.w / max(clip[k].w, 1e-6));
    if (clip[k].w <= 1e-6) behind = true;
  }
  // folded (turned over between the film's camera and this one): drop it
  vec2 tg[3];
  for (int k = 0; k < 3; k++) tg[k] = clip[k].xy / max(clip[k].w, 1e-6) * uTgtPx;
  vec2 s0 = uv[0] * uFilm, s1 = uv[1] * uFilm, s2 = uv[2] * uFilm;
  float aS = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  float aT = (tg[1].x - tg[0].x) * -(tg[2].y - tg[0].y) - (tg[2].x - tg[0].x) * -(tg[1].y - tg[0].y);
  bool drop = behind || skirt || sNear <= 0.0 || aS * aT <= 0.0;
  vKeep = drop ? -1.0 : keep[me];
  vUv = uv[me];
  gl_Position = clip[me];
}`,tt=`
precision highp float;
in vec2 vUv;
in float vKeep;
out vec4 outColor;
void main() {
  if (vKeep < 0.5 || vUv.x < 0.0 || vUv.y < 0.0 || vUv.x > 1.0 || vUv.y > 1.0) discard;
  outColor = vec4(0.0);
}`,rt=`
precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,it=`
precision highp float;
uniform sampler2D uAcc;
uniform vec2 uRes;
uniform vec3 uFallback;
uniform float uDebug;
out vec4 outColor;
void main() {
  vec4 a = texture(uAcc, gl_FragCoord.xy / uRes);
  outColor = vec4(a.a > 1e-7 ? a.rgb / a.a : uFallback, 1.0);
  if (uDebug > 0.5) outColor = vec3(a.a <= 1e-7 ? vec3(1.0, 0.0, 1.0) : vec3(clamp(1.0 + log2(a.a) / 10.0, 0.0, 1.0))).xyzz;
}`;function nt(c,T,B={}){const{track:q,depth:S}=B,De=Math.max(4,B.ring||6),Ge=B.ahead??2,se=B.ease??120,K=B.reach??2.5,O=B.onDirty||(()=>{}),We=128,w=q.frames||q.camera.length,b=q.width||1280,z=q.height||720,J=q.camera,le=S.grid[0],ue=S.grid[1],Be=Math.min(.05,.5*(S.near>0?S.near:.1)),k=new r.Texture(S.image);k.flipY=!1,k.colorSpace=r.NoColorSpace,k.premultiplyAlpha=!1,k.generateMipmaps=!1,k.minFilter=k.magFilter=r.NearestFilter,k.unpackAlignment=1,k.needsUpdate=!0;const xe=e=>{const t=S.static?0:e;return[t%S.cols*le,Math.floor(t/S.cols)*ue]},Ue=(le+1)*(ue+1)*6,Y=new r.BufferGeometry;Y.setAttribute("position",new r.BufferAttribute(new Uint8Array(Ue),1)),Y.boundingSphere=new r.Sphere(new r.Vector3,1e9);const m={uDepth:{value:k},uTile:{value:[0,0]},uGrid:{value:[le,ue]},uSMax:{value:S.sMax},uM:{value:new r.Matrix4},uSrc:{value:new r.Vector4},uTgtPx:{value:new r.Vector2(b/2,z/2)},uNear:{value:.05},uSkirt:{value:.002},uFilm:{value:new r.Vector2(b,z)},uFrame:{value:null},uWeight:{value:1},uFlat:{value:0},uHalo:{value:.05},uSharp:{value:1},uJref:{value:1},uFeather:{value:We}},we=e=>new r.RawShaderMaterial({glslVersion:r.GLSL3,vertexShader:$e,fragmentShader:Ze,uniforms:m,side:r.DoubleSide,...e}),X=we({colorWrite:!1,depthWrite:!0,depthTest:!0,depthFunc:r.LessDepth,blending:r.NoBlending}),ke=we({depthWrite:!1,depthTest:!0,depthFunc:r.EqualDepth,transparent:!0,blending:r.CustomBlending,blendEquation:r.AddEquation,blendSrc:r.OneFactor,blendDst:r.OneFactor,blendSrcAlpha:r.OneFactor,blendDstAlpha:r.OneFactor}),U=new r.Mesh(Y,X);U.frustumCulled=!1;const $=new r.Scene;$.add(U);const Z=new r.Camera,ce=new r.BufferGeometry;ce.setAttribute("position",new r.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));const I=new r.RawShaderMaterial({glslVersion:r.GLSL3,vertexShader:rt,fragmentShader:it,uniforms:{uAcc:{value:null},uRes:{value:new r.Vector2},uFallback:{value:new r.Vector3(.6,.65,.7)},uDebug:{value:0}},depthTest:!1,depthWrite:!1,blending:r.NoBlending}),ye=new r.Mesh(ce,I);ye.frustumCulled=!1;const be=new r.Scene;be.add(ye);let M=null,A=null;function Ne(e,t){M&&M.width===e&&M.height===t||(M&&(M.dispose(),A.dispose()),M=new r.WebGLRenderTarget(e,t,{type:r.HalfFloatType,depthBuffer:!0,stencilBuffer:!1,generateMipmaps:!1,minFilter:r.NearestFilter,magFilter:r.NearestFilter}),A=new r.WebGLRenderTarget(e,t,{type:r.UnsignedByteType,depthBuffer:!1,stencilBuffer:!1,generateMipmaps:!0,minFilter:r.LinearMipmapLinearFilter,magFilter:r.LinearFilter}),A.texture.colorSpace=r.NoColorSpace)}const y=[];for(let e=0;e<De;e++){const t=new r.Texture;t.flipY=!1,t.colorSpace=r.NoColorSpace,t.generateMipmaps=!0,t.minFilter=r.LinearMipmapLinearFilter,t.magFilter=r.LinearFilter,t.wrapS=t.wrapT=r.ClampToEdgeWrapping,y.push({k:-1,tex:t,landed:-1e9,poster:!1,presence:0,ptarget:0,pt:0,frozen:null,role:"bracket"})}const D=e=>y.find(t=>t.k===e&&!t.dead),H=e=>!!D(e);let F=!1,f=0,ee=1,x=0,N=!1,te=!1,Me=-1,Q=!1;const p={draws:0,views:0,uploads:0,holds:0,jumps:0,lastKey:"",gpuMs:[],cpuMs:[]},Fe=new r.Quaternion,Te=new r.Quaternion;function Ve(e,t){const n=Math.max(0,Math.min(w-1,e)),l=Math.floor(n),d=Math.min(w-1,l+1),a=n-l,u=J[l],o=J[d];t.position.set(u.p[0]+(o.p[0]-u.p[0])*a,u.p[1]+(o.p[1]-u.p[1])*a,u.p[2]+(o.p[2]-u.p[2])*a),Fe.fromArray(u.q),Te.fromArray(o.q),t.quaternion.copy(Fe).slerp(Te,a);const s=u.fov+(o.fov-u.fov)*a,i=u.shift||[0,0];return{fov:s,shift:i}}function Se(){const e=Math.floor(f+1e-6),t=f-e,n=[Math.max(0,Math.min(w-1,e))];t>1e-4&&e+1<w&&n.push(e+1),t>.5&&n.length===2&&n.reverse();const l=Math.min(...n),d=Math.max(...n);for(let a=1;a<=Ge;a++)ee>=0?d+a<w&&n.push(d+a):l-a>=0&&n.push(l-a);return ee===0&&l-1>=0&&n.push(l-1),n}function re(){if(F||te)return;const e=Se().find(t=>!H(t)||D(t).poster);if(e!==void 0){if(T.drawn===e){de(e,T.canvas,!1,!0)&&(Q=!0,O(),re());return}(e!==Me||T.target!==e)&&(Me=e,T.setFrame(e))}}function P(e,t){const n=(t-e.pt)/se;return e.ptarget>e.presence?Math.min(e.ptarget,e.presence+n):Math.max(e.ptarget,e.presence-n)}function Ae(e,t,n){e.ptarget!==t&&(e.presence=P(e,n),e.pt=n,e.ptarget=t)}const qe=(e,t)=>e.poster?1:Math.min(1,Math.max(0,(t-e.landed)/se));function Oe(e=performance.now()){const t=Math.max(0,Math.min(w-1,Math.floor(f+1e-6))),l=Math.max(0,f-t)>1e-4&&t+1<w?t+1:-1,d=y.filter(i=>i.k>=0&&!i.frozen),a=d.filter(i=>Math.abs(i.k-f)<=K).sort((i,v)=>Math.abs(i.k-f)-Math.abs(v.k-f)),u=a.filter(i=>i.k===t||i.k===l);let o,s;if(u.length)o=f,s=u;else if(a.length)o=f,s=[a[0]];else if(N){p.holds++;return}else{const i=d.slice().sort((v,h)=>Math.abs(v.k-f)-Math.abs(h.k-f))[0];if(!i)return;o=i.k,s=[i]}if(N&&o!==x){let i=!1;const v={};for(const h of Pe(e))h.f===null&&(v[h.s.k]=h.w);for(const h of d)s.includes(h)||P(h,e)<=.001||Math.abs(h.k-o)<=K||(h.frozen={f:x,w:Math.max(.001,v[h.k]||0)/Math.max(1e-6,fe(P(h,e)))},Ae(h,0,e),i=!0);i&&p.jumps++}x=o,N=!0;for(const i of d){if(i.frozen)continue;const v=s.includes(i);v&&(i.role=i.k===t||i.k===l?"bracket":"fallback"),Ae(i,v?1:0,e)}for(const i of y)i.frozen&&P(i,e)<=0&&(i.frozen=null,i.presence=0,i.ptarget=0)}let j=null;function Pe(e){if(j)return j.sources.map(([o,s])=>({s:D(o),w:s,f:null})).filter(o=>o.s);const t=Math.floor(x+1e-6),n=x-t,l=[];let d=0,a=0;for(const o of y){if(o.k<0||o.frozen)continue;const s=n>1e-4?n*n/((1-n)*(1-n)+n*n):0,i=o.role==="fallback"?1:o.k===t?1-s:o.k===t+1?s:0;o.ptarget>0&&(a+=i);const v=P(o,e)*qe(o,e);if(v<=0||i<=0)continue;const h=i*fe(v);l.push({s:o,w:h,f:null}),d+=h}const u=d<=0?0:Math.min(1,d/Math.max(1e-6,a));if(d>0)for(const o of l)o.w=o.w/d*u;for(const o of y){if(o.k<0||!o.frozen)continue;const s=P(o,e);if(s<=0){o.frozen=null,o.presence=0,o.ptarget=0;continue}l.push({s:o,w:Math.min(1,o.frozen.w)*fe(s)*(1-u)+1e-4,f:o.frozen.f})}return l}const fe=e=>e*e*(3-2*e);function pe(e){for(const t of y){if(t.k<0)continue;const n=P(t,e);if(Math.abs(n-t.ptarget)>1e-6||t.frozen||(n>0||t.ptarget>0)&&!t.poster&&e-t.landed<se)return!0}return!1}function Ie(e=performance.now()){if(te)return!0;const t=Math.floor(f+1e-6),n=f-t;return!H(t)||D(t).poster||n>1e-4&&t+1<w&&(!H(t+1)||D(t+1).poster)||Math.abs(x-f)>1e-9?!1:!pe(e)}function de(e,t,n,l){const d=performance.now();let a=D(e);if(!a){const u=new Set(Se()),o=y.filter(s=>s.k<0);if(o.length)a=o[0];else if(a=y.filter(i=>!i.frozen&&i.ptarget===0&&P(i,d)<=0&&!u.has(i.k)).sort((i,v)=>Math.abs(v.k-f)-Math.abs(i.k-f))[0],!a)return!1;a.k=e,a.presence=0,a.ptarget=0,a.pt=d,a.frozen=null}return a.tex.image=t,a.tex.needsUpdate=!0,c.initTexture(a.tex),a.landed=n||a.poster||l?-1e9:d,a.poster=!!n,p.uploads++,!0}const He=T.onFrame(e=>{if(F)return;const t=Math.abs(e-f)<=K+1||!N||Math.abs(x-f)>1e-9;if(!de(e,T.canvas,!1)){re();return}re(),t&&(Q=!0,O())}),E=T.poster;function he(){F||!E||!E.naturalWidth||H(0)||de(0,E,!0)&&(Q=!0,O())}E&&(E.complete?he():E.addEventListener("load",he,{once:!0})),T.ready.then(()=>{!F&&T.drawn<0&&(te=!0,O())});const Re=new r.PerspectiveCamera,_=new r.Object3D,ie=new r.Matrix4,Le=new r.Matrix4,Ce=new r.Matrix4;let at=null;const ae=(()=>{try{return c.getContext().getExtension("EXT_disjoint_timer_query_webgl2")}catch{return null}})(),V=[];let oe=null;p.bench=(e=60)=>{if(!oe||F)return null;const t=new Uint8Array(4);ve(...oe),c.readRenderTargetPixels(A,0,0,1,1,t);const n=performance.now();for(let l=0;l<e;l++)ve(...oe);return c.readRenderTargetPixels(A,0,0,1,1,t),(performance.now()-n)/e};function ve(e,t,n,l){if(F)return null;oe=[e,t,n,l];const d=performance.now(),a=Pe(d);if(!a.length)return null;{const g=e.view&&e.view.enabled?e.view:null,L=b*(g?g.width/g.fullWidth:1),W=Math.min(1,2*L/t);t=Math.max(1,Math.round(t*W)),n=Math.max(1,Math.round(n*W))}Ne(t,n);const u=c.getContext(),o=globalThis.__kitPlateTiming;let s=null;o&&ae&&(s=u.createQuery(),u.beginQuery(ae.TIME_ELAPSED_EXT,s));const i=o?performance.now():0,v=c.getRenderTarget(),h=c.autoClear;c.autoClear=!1,c.setRenderTarget(M),c.setClearColor(0,0),c.clear(!0,!0,!1);const R=e.view&&e.view.enabled?e.view:null,ze=R?R.width/R.fullWidth:1,Je=R?R.height/R.fullHeight:1;let me=x.toFixed(4);m.uFlat.value=j&&j.flat?1:0;for(const g of a){let L=e;g.f!==null&&(l(Re,g.f),L=Re),L.updateMatrixWorld(!0),ie.copy(L.matrixWorld).invert();const W=J[g.s.k];_.position.fromArray(W.p),_.quaternion.fromArray(W.q),_.updateMatrixWorld(!0),Ce.multiplyMatrices(L.projectionMatrix,ie).multiply(Le.copy(_.matrixWorld)),m.uM.value.copy(Ce);const Ee=Math.tan(W.fov*Math.PI/360),Ye=Ee*(b/z),_e=W.shift||[0,0];m.uSrc.value.set(Ye,Ee,2*_e[0],2*_e[1]*b/z);const Xe=xe(g.s.k);m.uTile.value=Xe;const C=L.view&&L.view.enabled?L.view:null;m.uTgtPx.value.set(b/2*(C?C.width/C.fullWidth:ze),z/2*(C?C.height/C.fullHeight:Je)),m.uNear.value=Be;const ge=b*(C?C.width/C.fullWidth:ze)/t;m.uSharp.value=ge<=1.1?1:0,m.uJref.value=ge*ge,m.uFrame.value=g.s.tex,m.uWeight.value=g.w,c.clear(!1,!0,!1),U.material=X,c.render($,Z),U.material=ke,c.render($,Z),me+=`|${g.s.k}${g.f!==null?"@"+g.f.toFixed(2):""}:${g.w.toFixed(3)}`}return I.uniforms.uAcc.value=M.texture,I.uniforms.uRes.value.set(t,n),c.setRenderTarget(A),c.render(be,Z),c.setRenderTarget(v),c.autoClear=h,m.uFlat.value=0,s&&(u.endQuery(ae.TIME_ELAPSED_EXT),V.push(s)),o==="finish"&&(u.finish(),p.cpuMs.push(performance.now()-i)),je(u),p.draws++,me!==p.lastKey&&(p.views++,p.lastKey=me),p.sources=a.length,p.textures=c.info.memory.textures,p.geometries=c.info.memory.geometries,p.reach=K,p.frames=w,p.shown=x,p.target=f,p.list=a.map(g=>[g.s.k,+g.w.toFixed(3),g.f]),ne=a,pe(d)&&O(),A.texture}let ne=null,G=null;function Qe(e,t=[.004,.02]){if(F||!ne)return!1;const n=ne.filter(s=>s.f===null&&s.w>.02);if(!n.length)return!1;G||(G=new r.RawShaderMaterial({glslVersion:r.GLSL3,vertexShader:et,fragmentShader:tt,uniforms:{...m,uA:{value:1},uBias:{value:new r.Vector2}},side:r.DoubleSide,colorWrite:!1,depthWrite:!0,depthTest:!0,depthFunc:r.LessDepth,blending:r.NoBlending}));const l=c.autoClear;c.autoClear=!1,e.updateMatrixWorld(!0),ie.copy(e.matrixWorld).invert();const d=e.projectionMatrix.elements;G.uniforms.uA.value=-d[10],G.uniforms.uBias.value.set(t[0],t[1]);const a=e.view&&e.view.enabled?e.view:null,u=a?a.width/a.fullWidth:1,o=a?a.height/a.fullHeight:1;m.uTgtPx.value.set(b/2*u,z/2*o),m.uFlat.value=0;for(const s of n){const i=J[s.s.k];_.position.fromArray(i.p),_.quaternion.fromArray(i.q),_.updateMatrixWorld(!0),m.uM.value.multiplyMatrices(e.projectionMatrix,ie).multiply(Le.copy(_.matrixWorld));const v=Math.tan(i.fov*Math.PI/360),h=v*(b/z),R=i.shift||[0,0];m.uSrc.value.set(h,v,2*R[0],2*R[1]*b/z),m.uTile.value=xe(s.s.k),U.material=G,c.render($,Z)}return U.material=X,c.autoClear=l,!0}function je(e){for(;V.length;){const t=V[0];if(!e.getQueryParameter(t,e.QUERY_RESULT_AVAILABLE))break;e.getParameter(ae.GPU_DISJOINT_EXT)||p.gpuMs.push(e.getQueryParameter(t,e.QUERY_RESULT)/1e6),e.deleteQuery(t),V.shift()}p.gpuMs.length>600&&p.gpuMs.splice(0,300),p.cpuMs.length>600&&p.cpuMs.splice(0,300)}const Ke={frames:w,stats:p,get target(){return f},get shown(){return x},get failed(){return te},view(e){return F?x:(e=Math.max(0,Math.min(w-1,Number(e)||0)),e>f+1e-6?ee=1:e<f-1e-6&&(ee=-1),f=e,Q=!1,re(),Oe(),N?x:f)},shownFrame(){return N?x:f},poseAt:Ve,draw:ve,drawDepth:Qe,settled:Ie,busy:()=>pe(performance.now()),needsView:()=>Q,force(e){j=e},debugView(e){I.uniforms.uDebug.value=e?1:0},has:e=>H(e)&&!D(e).poster,get depthTexture_(){return k},get target_(){return A},debug(){const e=performance.now();return y.map(t=>({k:t.k,poster:t.poster,presence:+P(t,e).toFixed(3),target:t.ptarget,frozen:t.frozen?t.frozen.f:null}))},dispose(){if(F)return;F=!0,He(),E&&E.removeEventListener("load",he);for(const t of y)t.tex.image=null,t.tex.dispose();k.dispose(),Y.dispose(),X.dispose(),ke.dispose(),ce.dispose(),I.dispose(),G&&G.dispose(),ne=null,M&&(M.dispose(),A.dispose());const e=c.getContext();for(const t of V)try{e.deleteQuery(t)}catch{}V.length=0}};return globalThis.__kitPlateStats=p,Ke}export{nt as createPlate};
