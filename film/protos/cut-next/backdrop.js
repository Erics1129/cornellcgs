import*as e from"three";import{matchCanvas as F}from"../../kit/seams.js";const z=`
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,D=`
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uNeb;      // the world's own picture (sRGB-encoded, as it would reach the screen)
uniform sampler2D uMatch;    // the shared specks frame (kit/seams.js), sRGB
uniform sampler2D uCorner;   // the terrace tower's sliver, top left (sRGB, alpha)
uniform vec4 uCornerBox;     // its box: x0, y0 (from the top left), w, h (fractions of the frame)
uniform float uCornerK;      // 0..1
uniform float uDev;          // 0..1 how far the nebula has come up
uniform vec2 uMoon;          // the first moon's centre on screen (0..1, from the bottom left)
uniform float uMoonR;        // its radius (fraction of the height)
uniform float uAspect;
uniform vec3 uSkyTop;        // the seam's sky (sRGB 0..1)
uniform vec3 uSkyBot;
uniform mat4 uInvProj;       // the world camera (for the photograph's edges)
uniform mat3 uCamRot;
uniform vec3 uCamPos;
uniform vec2 uSize;
uniform float uD0;
uniform vec3 uOutside;       // the deep blue round the photograph (sRGB)
uniform float uWater;        // 0..1 the match out
uniform vec3 uWaterTop;      // the specks' ground (sRGB)
uniform vec3 uWaterBot;
uniform vec3 uSand;          // the warm glow along the bottom
uniform float uSandA;
uniform float uMatchK;       // 0..1 the exact match frame over everything (the last few hundredths)
uniform vec2 uTexel;

float luma(vec3 c) { return dot(c, vec3(0.3, 0.55, 0.15)); }
vec3 blur(vec2 uv, float lod) { return textureLod(uNeb, uv, lod).rgb; }
void main() {
  vec2 uv = vUv;
  vec3 neb = texture(uNeb, uv).rgb;
  // ---- the photograph's edge, softened into the deep blue round it
  vec4 v4 = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(uCamRot * (v4.xyz / v4.w));
  float t = (uCamPos.z + uD0) / max(-rd.z, 1e-3);
  vec2 pu = (uCamPos.xy + rd.xy * t) / uSize + 0.5;
  vec2 m = smoothstep(vec2(0.0), vec2(0.075, 0.12), pu) * smoothstep(vec2(0.0), vec2(0.075, 0.12), 1.0 - pu);
  float edge = rd.z < -0.02 ? m.x * m.y : 0.0;
  neb = mix(uOutside, neb, edge);
  // ---- the match out: water (u runs linearly through the last tenth; each part eases on its own stretch of it)
  if (uWater > 0.0) {
    float u = uWater;
    // the dust sinks: the picture slides down and is pulled toward the bottom edge
    float sink = 0.34 * smoothstep(0.08, 0.95, u);
    vec2 su = vec2(uv.x, uv.y + sink * (0.35 + 0.65 * uv.y));
    // the far blue softens as water does: out of focus, then a wash
    float lod = 0.6 + 5.8 * smoothstep(0.02, 0.7, u);
    vec3 b = blur(clamp(su, 0.0, 1.0), lod);
    float warm = clamp((b.r - b.b) * 1.5 + 0.05, 0.0, 1.0);
    // the dust settling: the warmth of the cliffs above a point comes down to rest along the bottom edge
    vec2 hu = clamp(vec2(uv.x, uv.y + 0.18), 0.0, 1.0), hu2 = clamp(vec2(uv.x, uv.y + 0.4), 0.0, 1.0);
    vec3 b1 = blur(hu, 5.5), b2 = blur(hu2, 6.0);
    float above = max(clamp((b1.r - b1.b) * 1.5, 0.0, 1.0), 0.8 * clamp((b2.r - b2.b) * 1.5, 0.0, 1.0));
    vec3 water = mix(uWaterBot, uWaterTop, smoothstep(0.05, 1.0, uv.y));
    float bottom = smoothstep(0.45, 0.0, uv.y);
    // the light of the place becomes the water's: its brightness kept, its colour the water's (never murky: the
    // water is lit, brightest toward the top); the warm dust keeps its warmth and settles low as the sand's glow
    vec3 cool = water * (0.92 + 0.42 * luma(b));
    vec3 dust = water + uSand * (0.25 + 0.5 * bottom) * warm;
    float settled = above * bottom * smoothstep(0.15, 0.6, u) * (1.0 - smoothstep(0.7, 1.0, u));
    vec3 wcol = mix(cool, dust, warm * mix(0.5, 1.0, bottom)) + uSand * uSandA * bottom + uSand * 0.32 * settled;
    // what slides in from above the picture's top edge is the water itself (no clamped edge rows)
    float over = smoothstep(0.985, 1.04, su.y);
    b = mix(b, water * 0.9, over); wcol = mix(wcol, water, over);
    neb = mix(neb, b, smoothstep(0.0, 0.3, u));
    neb = mix(neb, wcol, smoothstep(0.08, 0.78, u));
  }
  // ---- the match in: the seam's sky, and the nebula coming up through it
  vec3 sky = mix(uSkyBot, uSkyTop, smoothstep(0.0, 1.0, uv.y));
  vec2 dm = (uv - uMoon) * vec2(uAspect, 1.0);
  float near = clamp(length(dm) / 1.6, 0.0, 1.0);
  float dev = uDev * 1.55 - 0.35 * near - 0.4 * (1.0 - smoothstep(0.02, 0.5, luma(neb)));
  float a = smoothstep(0.0, 0.55, dev);
  vec3 col = mix(sky, neb, a);
  // the terrace tower's sliver
  if (uCornerK > 0.0) {
    vec2 cu = vec2((uv.x - uCornerBox.x) / uCornerBox.z, ((1.0 - uv.y) - uCornerBox.y) / uCornerBox.w);
    if (cu.x >= 0.0 && cu.x <= 1.0 && cu.y >= 0.0 && cu.y <= 1.0) {
      vec4 c = texture(uCorner, cu);
      col = mix(col, c.rgb, c.a * uCornerK);
    }
  }
  if (uMatchK > 0.0) col = mix(col, texture(uMatch, uv).rgb, uMatchK);
  outColor = vec4(col, 1.0);
}`,h=o=>{const r=new e.Color;return r.setStyle(o,e.LinearSRGBColorSpace),new e.Vector3(r.r,r.g,r.b)},p=new e.Euler,L=new e.Quaternion;function W(o,r,{eye:d,mag:s=1,about:i=[0,0],aspect:m}){return o.updateMatrixWorld(),typeof s=="function"&&(s=s(o.fov)),r.position.fromArray(d?d(o.position.toArray()):o.position.toArray()),p.setFromQuaternion(o.quaternion,"YXZ"),p.set(i[0]+s*(p.x-i[0]),i[1]+s*(p.y-i[1]),p.z,"YXZ"),r.quaternion.setFromEuler(p),r.fov=2*Math.atan(s*Math.tan(o.fov*Math.PI/360))*180/Math.PI,r.aspect=m||o.aspect,r.near=o.near,r.far=o.far,r.updateProjectionMatrix(),r.updateMatrixWorld(!0),r}function V(o,r,{corner:d=null,cornerBox:s=[0,0,.2,.45],eye:i,mag:m=1,about:y=[0,0]}={}){const g=o.backdrop,G=o.renderer,l=new e.WebGLRenderTarget(4,4,{depthBuffer:!1,type:e.UnsignedByteType,generateMipmaps:!0,minFilter:e.LinearMipmapLinearFilter,magFilter:e.LinearFilter});l.texture.colorSpace=e.NoColorSpace;const v=new e.CanvasTexture(F("specks",1280,720));v.colorSpace=e.NoColorSpace,v.minFilter=e.LinearFilter,v.generateMipmaps=!1,v.flipY=!0;const c=d?new e.Texture(d):new e.DataTexture(new Uint8Array(4),1,1);c.colorSpace=e.NoColorSpace,c.needsUpdate=!0,c.flipY=!1,c.generateMipmaps=!1,c.minFilter=e.LinearFilter;const a={uNeb:{value:l.texture},uMatch:{value:v},uCorner:{value:c},uCornerBox:{value:new e.Vector4(...s)},uCornerK:{value:0},uDev:{value:1},uMoon:{value:new e.Vector2(.5,.55)},uMoonR:{value:.1},uAspect:{value:16/9},uSkyTop:{value:h("#091223")},uSkyBot:{value:h("#121e37")},uInvProj:{value:new e.Matrix4},uCamRot:{value:new e.Matrix3},uCamPos:{value:new e.Vector3},uSize:{value:new e.Vector2(340,340/(14575/8441))},uD0:{value:150},uOutside:{value:h("#0d1627")},uWater:{value:0},uWaterTop:{value:h("#2E9FC2")},uWaterBot:{value:h("#184F8E")},uSand:{value:h("#E8AA60")},uSandA:{value:.24},uMatchK:{value:0},uTexel:{value:new e.Vector2(1,1)}},C=new e.RawShaderMaterial({glslVersion:e.GLSL3,vertexShader:z,fragmentShader:D,uniforms:a,depthTest:!1,depthWrite:!1}),w=new e.BufferGeometry;w.setAttribute("position",new e.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));const M=new e.Mesh(w,C);M.frustumCulled=!1;const S=new e.Scene;S.add(M);const A=new e.OrthographicCamera(-1,1,1,-1,0,1),B=new e.Vector3,k=new e.Quaternion,f=new e.PerspectiveCamera,R=[];function T(n,t,u){(l.width!==u.bw||l.height!==u.bh)&&l.setSize(u.bw,u.bh),B.copy(t.position),k.copy(t.quaternion);const b=t.fov;W(t,f,{eye:i,mag:m,about:y,aspect:u.width/u.height}),t.position.copy(f.position),t.quaternion.copy(f.quaternion),t.fov=f.fov,t.updateProjectionMatrix(),t.updateMatrixWorld(),n.setRenderTarget(l),n.clear(!0,!1,!1),g(n,t,u),a.uInvProj.value.copy(t.projectionMatrixInverse),a.uCamRot.value.setFromMatrix4(t.matrixWorld),a.uCamPos.value.copy(t.position),t.position.copy(B),t.quaternion.copy(k),t.fov=b,t.updateProjectionMatrix(),t.updateMatrixWorld(),n.setRenderTarget(null),a.uAspect.value=u.width/u.height,a.uTexel.value.set(1/u.bw,1/u.bh),n.render(S,A);for(const x of R)x(n,t,u)}return o.setBackdrop(T),{uniforms:a,view(n){return W(o.camera,f,{eye:i,mag:m,about:y,aspect:n})},add(n){R.push(n)},set({dev:n=1,moon:t,moonR:u,cornerK:b=0,water:x=0,matchK:P=0}={}){a.uDev.value=n,t&&a.uMoon.value.set(t[0],1-t[1]),u!=null&&(a.uMoonR.value=u),a.uCornerK.value=b,a.uWater.value=x,a.uMatchK.value=P},dispose(){o.backdrop===T&&o.setBackdrop(g),l.dispose(),v.dispose(),c.dispose(),C.dispose(),w.dispose()}}}export{V as createBackdrop,W as worldView};
