import*as e from"three";import{WHITE as x}from"../../kit/seams.js";const b=Math.PI/180,F=(()=>{const t=new e.Quaternion().setFromAxisAngle(new e.Vector3(0,1,0),12*b).multiply(new e.Quaternion().setFromAxisAngle(new e.Vector3(1,0,0),16*b)).multiply(new e.Quaternion().setFromAxisAngle(new e.Vector3(0,1,0),Math.PI));return Object.freeze({p:Object.freeze([0,-.162,-2.4]),q:Object.freeze(t.toArray().map(a=>Number(a.toFixed(7)))),scale:.62})})(),T=Object.freeze({names:[""],count:1,length:.6,colours:["#B8372C"],nameWing:0}),c=Object.freeze({dir:Object.freeze([-.585431,.762781,-.274555]),color:Object.freeze([1.2,1.128,1.032]),ambient:Object.freeze([.4147,.4747,.5933]),key:1,rim:1.1}),R=Object.freeze({scale:1.042,k:.011}),z=Object.freeze({"name-b":12,"planes-c":16});function G(t,a,s,n=new e.Vector3,i=new e.Quaternion){return n.fromArray(a).applyQuaternion(t.quaternion).add(t.position),i.copy(t.quaternion).multiply(s.isQuaternion?s:new e.Quaternion().fromArray(s)),{position:n,quaternion:i}}function j(t){const a=new e.Vector3().fromArray(c.dir).applyQuaternion(t.quaternion);return{sun:{dir:[a.x,a.y,a.z],color:c.color.slice(),ambient:c.ambient.slice()},opts:{key:c.key,rim:c.rim}}}const p=t=>new e.Vector3(parseInt(t.slice(1,3),16)/255,parseInt(t.slice(3,5),16)/255,parseInt(t.slice(5,7),16)/255),D="void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",M=`
uniform vec2 uRes; uniform vec4 uMap;
uniform float uS, uAmount, uWisp, uMode, uDens, uGlow;
uniform sampler2D uDepth; uniform float uDepthOn; uniform vec2 uTile; uniform float uSMax;
uniform vec3 uTone, uEdge, uGold;
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y);
  float b = mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y);
  return mix(a, b, f.z);
}
float fbm(vec3 p) { return 0.5 * vn(p) + 0.27 * vn(p * 2.03 + 7.1) + 0.15 * vn(p * 4.07 + 3.7) + 0.08 * vn(p * 8.13 + 1.3); }
vec3 srgbToLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
// planes-c: the film's depth (films/<name>/depth.png: 160 x 90 tiles of 1/depth, 12 bits in R and G) at a film uv
float dec(vec4 t) { float q = floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5); q -= mod(q, 2.0); return q / 65535.0 * uSMax; }
float invDepthAt(vec2 fuv) {
  vec2 g = vec2(160.0, 90.0);
  vec2 p = vec2(fuv.x, 1.0 - fuv.y) * g - 0.5;
  vec2 i0 = floor(p), f = clamp(p - i0, 0.0, 1.0);
  ivec2 base = ivec2(uTile * g);
  ivec2 a = ivec2(clamp(i0, vec2(0.0), g - 1.0)), b = ivec2(clamp(i0 + 1.0, vec2(0.0), g - 1.0));
  float s00 = dec(texelFetch(uDepth, base + ivec2(a.x, a.y), 0)), s10 = dec(texelFetch(uDepth, base + ivec2(b.x, a.y), 0));
  float s01 = dec(texelFetch(uDepth, base + ivec2(a.x, b.y), 0)), s11 = dec(texelFetch(uDepth, base + ivec2(b.x, b.y), 0));
  return mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / uRes;                                    // 0..1 across the canvas, y up
  float asp = uRes.x / uRes.y;
  // kit/seams.js 'white': a radial fall-off from the frame's centre (0.46 down) to the corners, in sRGB
  float t = clamp(length(fc - vec2(0.5, 0.54) * uRes) / (length(uRes) * 0.62), 0.0, 1.0);
  vec3 col = mix(uTone, uEdge, t);
  // the cloud's inside: soft lobes drifting up past the lens as we sink (s grows as we go down), and nearer, finer
  // wisps of droplets streaming up faster in front of them
  float n = fbm(vec3(uv.x * asp * 1.7, uv.y * 1.7 - uS, uS * 0.21));
  float nf = fbm(vec3(uv.x * asp * 6.0, uv.y * 6.0 - uS * 2.6, uS * 0.5 + 2.0));
  col *= 1.0 + 0.12 * (n - 0.5) + 0.05 * (nf - 0.5);
  float a;
  if (uMode < 0.5) {
    // name-b, going in: wisps of the cloud reach up past the lens, thicker below, then the cloud closes round us
    float w = smoothstep(0.42, 0.78, fbm(vec3(uv.x * asp * 0.9, uv.y * 0.9 - uS * 1.35, uS * 0.11 + 4.0)) + 0.28 * (0.5 - uv.y));
    a = uAmount + (1.0 - uAmount) * uWisp * w;
  } else {
    // planes-c, coming out: mist by the film's own depth (the near stones clear first), patchy, lit from the low sun
    float d = 1.0e4;
    if (uDepthOn > 0.5) { float iv = invDepthAt(uv * uMap.xy + uMap.zw); d = iv > 1.0e-5 ? 1.0 / iv : 1.0e4; }
    float patchy = 0.62 + 0.76 * fbm(vec3(uv.x * asp * 1.3, uv.y * 1.3 - uS * 0.9, uS * 0.17 + 9.0));
    a = 1.0 - exp(-uDens * min(d, 400.0) * patchy);
    float g = exp(-length((uv - vec2(-0.08, 0.52)) * vec2(asp, 1.0)) * 2.1);
    col = mix(col, uGold, clamp(uGlow * g, 0.0, 1.0));
  }
  a = clamp(a, 0.0, 1.0);
  vec4 o = linearToOutputTexel(vec4(srgbToLin(col), 1.0));
  gl_FragColor = vec4(o.rgb * a, a);
}`;function E(t,{order:a=0,mist:s=!1,depth:n=null}={}){const i=new e.BufferGeometry;i.setAttribute("position",new e.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));let o=null;n&&n.image&&(o=new e.Texture(n.image),o.colorSpace=e.NoColorSpace,o.generateMipmaps=!1,o.flipY=!1,o.premultiplyAlpha=!1,o.minFilter=o.magFilter=e.NearestFilter,o.needsUpdate=!0);const r={uRes:t.light.uResolution,uMap:t.light.uPlateMap,uS:{value:0},uAmount:{value:1},uWisp:{value:0},uMode:{value:s?1:0},uDens:{value:1e6},uGlow:{value:0},uDepth:{value:o},uDepthOn:{value:o?1:0},uTile:{value:new e.Vector2},uSMax:{value:n&&n.sMax||1},uTone:{value:p(x.tone)},uEdge:{value:p(x.edge)},uGold:{value:p("#F7D9A4")}},v=new e.ShaderMaterial({vertexShader:D,fragmentShader:M,uniforms:r,depthTest:!1,depthWrite:!1,transparent:!1,blending:e.CustomBlending,blendSrc:e.OneFactor,blendDst:e.OneMinusSrcAlphaFactor,blendSrcAlpha:e.OneFactor,blendDstAlpha:e.OneMinusSrcAlphaFactor}),f=new e.Mesh(i,v);f.frustumCulled=!1;const u=new e.Group;u.renderOrder=a,u.add(f),u.visible=!1;let m=!1;f.onAfterRender=l=>{m&&l.clearDepth()};const h=n&&n.cols||9;return{object:u,mesh:f,uniforms:r,get visible(){return u.visible},set visible(l){u.visible=!!l},set clearDepth(l){m=!!l},set({s:l=0,amount:g=1,wisp:y=0,dens:w=1e6,glow:A=0,frame:S=0}={}){r.uS.value=l,r.uAmount.value=g,r.uWisp.value=y,r.uDens.value=w,r.uGlow.value=A;const d=Math.max(0,Math.round(S));r.uTile.value.set(d%h,Math.floor(d/h))},dispose(){i.dispose(),v.dispose(),o&&o.dispose()}}}export{F as HERO,c as LIGHT,R as LOOK,T as PLANE,z as RATE,E as createCloud,G as heroWorld,j as lightFor};
