import*as t from"three";import{BASE as K,bvToRGB as Y}from"./common.js";const p=Math.PI/180,Z=[[-.0011050759763745963,-.8903548127930089,-.4552659508938584],[.4789439484146418,-.400124568803291,.7813533283820794],[-.8778447887146388,-.21718341727347049,.42687221760465]],$=[[-.0548755604,-.8734370902,-.4838350155],[.4941094279,-.44482963,.7469822445],[-.867666149,-.1980763734,.4559837762]],N=s=>new t.Matrix3().set(s[0][0],s[0][1],s[0][2],s[1][0],s[1][1],s[1][2],s[2][0],s[2][1],s[2][2]);function X(s,v){const r=s*p,c=v*p;return new t.Vector3(Math.cos(c)*Math.cos(r),Math.cos(c)*Math.sin(r),Math.sin(c))}function ee(s,v){const r=s*p,c=v*p;return new t.Vector3(Math.cos(c)*Math.cos(r),Math.cos(c)*Math.sin(r),Math.sin(c)).applyMatrix3(N($).transpose())}const J=`
uniform sampler2D uSkyMap;
uniform mat3 uSkyFromStage;
uniform float uSkyGain, uSkyLod, uSkyKnee, uSkyStarCut, uSkyCrisp;
uniform vec3 uSkyFloor;
vec3 skyFromSRGB(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec4 skyCubicW(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x, y = s.y - 4.0 * s.x, z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) * (1.0 / 6.0);
}
// a cubic B-spline from four bilinear taps: soft like a print, no texel diamonds, no JPEG block edges
vec3 skyBicubic(vec2 uv, float lod) {
  vec2 ts = vec2(textureSize(uSkyMap, int(lod)));
  vec2 st = uv * ts - 0.5;
  vec2 f = fract(st);
  st -= f;
  vec4 xc = skyCubicW(f.x), yc = skyCubicW(f.y);
  vec4 c = st.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 o = (c + vec4(xc.yw, yc.yw) / s) / ts.xxyy;
  vec3 s0 = textureLod(uSkyMap, o.xz, lod).rgb, s1 = textureLod(uSkyMap, o.yz, lod).rgb;
  vec3 s2 = textureLod(uSkyMap, o.xw, lod).rgb, s3 = textureLod(uSkyMap, o.yw, lod).rgb;
  float sx = s.x / (s.x + s.y), sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}
uint skyH(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
vec3 skyPhoto(vec3 dirStage) {
  vec3 g = normalize(uSkyFromStage * dirStage);
  float l = atan(g.y, g.x), b = asin(clamp(g.z, -1.0, 1.0));
  vec2 uv = vec2(fract(0.5 - l / 6.2831853), 0.5 + b / 3.1415927);   // l grows to the left; the texture's v runs up
  vec3 c = skyFromSRGB(skyBicubic(uv, uSkyLod));
  // optional crispness: a little of the difference from a softer copy put back (the lens of a print
  // enlarger, not an edge filter: no halos at this amount, stars stay round)
  if (uSkyCrisp > 0.0) {
    vec3 cs = skyFromSRGB(skyBicubic(uv, uSkyLod + 1.0));
    c = max(c + (c - cs) * uSkyCrisp, 0.0);
  }
  // optional star reduction (as astrophotographers do): the faintest of the photograph's own stars, which
  // a long lens shows as soft blobs, sink back into the glow around them; bright ones keep their light
  if (uSkyStarCut > 0.0) {
    vec3 cb = skyFromSRGB(skyBicubic(uv, uSkyLod + 2.0));
    float lc = dot(c, vec3(0.2126, 0.7152, 0.0722)), lb = dot(cb, vec3(0.2126, 0.7152, 0.0722));
    float r = max(lc - lb, 0.0) / (lb + 0.004);
    float w = smoothstep(0.15, 1.6, r);
    vec3 hi = max(c - cb, vec3(0.0)), lo = min(c - cb, vec3(0.0));
    c = cb + lo + hi * mix(1.0, w, uSkyStarCut);
  }
  // the photograph's own sky floor (airglow, scatter) taken down softly: x^2 / (x + k) keeps the dust lanes' gradation
  c = c * c / (c + uSkyKnee);
  // a fixed fine grain (the frame's own, not animated) to break what is left of the JPEG blocks
  uvec2 fc = uvec2(gl_FragCoord.xy);
  float n = float(skyH(fc.x + skyH(fc.y + 71u)) & 1023u) / 1023.0 - 0.5;
  c *= 1.0 + 0.10 * n;
  return uSkyFloor + c * uSkyGain;
}
`,te=`
in vec3 position;
out vec2 vNdc;
void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,oe=`
precision highp float;
precision highp int;
in vec2 vNdc;
out vec4 outColor;
uniform mat4 uInvProj;
uniform mat3 uCamRot;
${J}
vec3 toSRGBs(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec4 v4 = uInvProj * vec4(vNdc, 1.0, 1.0);
  vec3 rd = normalize(uCamRot * (v4.xyz / v4.w));
  vec3 c = skyPhoto(rd);
  uvec2 fc = uvec2(gl_FragCoord.xy);
  uint h = skyH(fc.x + skyH(fc.y + 913u));
  float d = (float(h & 65535u) / 65535.0 + float(h >> 16u) / 65535.0 - 1.0) / 255.0;
  outColor = vec4(toSRGBs(c) + d, 1.0);
}
`,ae=`
precision highp float;
in vec3 position;
in vec3 color;
in float mag;
uniform mat3 uEqToStage, uView;
uniform mat4 uProj;
uniform float uDpr, uScale, uGain;
uniform vec4 uOcc0, uOcc1;     // xyz: direction (stage), w: cos of the angular radius (2.0 = none)
out vec3 vCol;
void main() {
  vec3 d = normalize(uEqToStage * position);
  vec3 vd = uView * d;
  vec4 clip = uProj * vec4(vd, 0.0);
  clip.z = clip.w * 0.99999;
  gl_Position = clip;
  float vis = 1.0;
  if (dot(d, uOcc0.xyz) > uOcc0.w) vis = 0.0;
  if (dot(d, uOcc1.xyz) > uOcc1.w) vis = 0.0;
  float flux = pow(10.0, -0.4 * (mag - 1.0));
  float b = pow(flux, 0.45) * 2.3 * uGain * vis;
  float s = (1.5 + 1.6 * clamp(1.5 - mag * 0.35, 0.0, 1.6)) * uDpr * max(0.75, uScale);
  gl_PointSize = s * 2.6;
  vCol = color * min(b, 3.0);
  if (b < 0.0025) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`,re=`
precision highp float;
in vec3 vCol;
out vec4 outColor;
void main() {
  vec2 q = (gl_PointCoord - 0.5) * 2.6;
  float r2 = dot(q, q);
  float core = exp(-r2 * 5.5);
  float halo = 0.04 * exp(-r2 * 1.4);
  vec3 c = vCol * (core + halo);
  c = 1.0 - exp(-c * 1.4);
  outColor = vec4(c, 0.0);
}
`;async function se(s,v,r={}){const c=new t.BufferGeometry;c.setAttribute("position",new t.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));const l=new t.Matrix3;r.orientation&&l.copy(r.orientation);const Q=N(Z);let S=r.brightness==null?1:+r.brightness;const i={uSkyMap:{value:null},uSkyFromStage:{value:new t.Matrix3},uSkyGain:{value:S},uSkyLod:{value:0},uSkyKnee:{value:r.knee==null?.007:+r.knee},uSkyStarCut:{value:r.starCut==null?0:+r.starCut},uSkyCrisp:{value:r.crisp==null?0:+r.crisp},uSkyFloor:{value:new t.Vector3(...r.floor||[55e-5,65e-5,.0011])}},k={uInvProj:{value:new t.Matrix4},uCamRot:{value:new t.Matrix3}},z=new t.RawShaderMaterial({glslVersion:t.GLSL3,vertexShader:te,fragmentShader:oe,uniforms:{...i,...k},depthTest:!1,depthWrite:!1,blending:t.NoBlending}),A=new t.Mesh(c,z);A.frustumCulled=!1;const B=new t.Scene;B.add(A);const P=new t.OrthographicCamera(-1,1,1,-1,0,1),b=await(await fetch(await v.asset(K+"bsc5-all.json"))).json(),g=b.length,w=new Float32Array(g*3),R=new Float32Array(g*3),L=new Float32Array(g);for(let e=0;e<g;e++){const[o,a,n,y]=b[e],m=o*p,h=a*p;w[e*3]=Math.cos(h)*Math.cos(m),w[e*3+1]=Math.cos(h)*Math.sin(m),w[e*3+2]=Math.sin(h),R.set(Y(y),e*3),L[e]=n}const f=new t.BufferGeometry;f.setAttribute("position",new t.BufferAttribute(w,3)),f.setAttribute("color",new t.BufferAttribute(R,3)),f.setAttribute("mag",new t.BufferAttribute(L,1));const u={uEqToStage:{value:l},uView:{value:new t.Matrix3},uProj:{value:new t.Matrix4},uDpr:{value:1},uScale:{value:1},uGain:{value:r.stars==null?1:+r.stars},uOcc0:{value:new t.Vector4(0,0,1,2)},uOcc1:{value:new t.Vector4(0,0,1,2)}},O=new t.RawShaderMaterial({glslVersion:t.GLSL3,vertexShader:ae,fragmentShader:re,uniforms:u,depthTest:!1,depthWrite:!1,transparent:!0,blending:t.CustomBlending,blendEquation:t.AddEquation,blendSrc:t.OneFactor,blendDst:t.OneFactor,blendSrcAlpha:t.ZeroFactor,blendDstAlpha:t.OneFactor}),T=new t.Points(f,O);T.frustumCulled=!1;const j=new t.Scene;j.add(T);function E(){i.uSkyFromStage.value.copy(Q).multiply(l.clone().transpose())}E();async function V(e){const o=await v.asset(K+e),a=new Image;a.decoding="async",a.src=o,await a.decode();const n=new t.Texture(a);return n.colorSpace=t.NoColorSpace,n.wrapS=t.RepeatWrapping,n.wrapT=t.ClampToEdgeWrapping,n.generateMipmaps=!0,n.minFilter=t.LinearMipmapLinearFilter,n.magFilter=t.LinearFilter,n.needsUpdate=!0,n}const M=[];let _=1024;const D=await V("milkyway-1024.jpg");M.push(D),i.uSkyMap.value=D;let C=!1;const U=r.large===!1?Promise.resolve():V("milkyway-4096.jpg").then(e=>{if(C){e.dispose();return}M.push(e),i.uSkyMap.value=e,_=4096,s.renderer.initTexture(e)}).catch(e=>console.warn("galaxy sky: the 4096 map failed",e));function W(e,o){e.updateMatrixWorld();const a=2*Math.tan(e.fov*p/2)/Math.max(1,o.bh);i.uSkyLod.value=Math.max(0,Math.log2(a*_/(2*Math.PI)))}function q(e,o,a){u.uView.value.setFromMatrix4(o.matrixWorldInverse),u.uProj.value.copy(o.projectionMatrix),u.uDpr.value=a.dpr,u.uScale.value=a.height/720,e.render(j,P)}let F=null;(async()=>{const e=await(await fetch(await v.asset("../../kit/props/stars.json"))).json();F=Array.isArray(e)?e:e.stars})().catch(()=>{});const I={uniforms:i,glsl:J,ready:U,get brightness(){return S},setBrightness(e){S=Math.max(0,+e||0),i.uSkyGain.value=S},setKnee(e){i.uSkyKnee.value=Math.max(0,+e||0)},setStarCut(e){i.uSkyStarCut.value=Math.max(0,Math.min(1,+e||0))},setCrisp(e){i.uSkyCrisp.value=Math.max(0,Math.min(1,+e||0))},get starGain(){return u.uGain.value},setStarGain(e){u.uGain.value=Math.max(0,+e||0)},get orientation(){return l},setOrientation(e){l.copy(e),E()},setOccluders(e=[]){const o=(a,n)=>{n?a.value.set(n.dir.x,n.dir.y,n.dir.z,Math.cos(n.radius)):a.value.set(0,0,1,2)};o(u.uOcc0,e[0]),o(u.uOcc1,e[1])},prepare:W,draw(e,o,a){W(o,a),k.uInvProj.value.copy(o.projectionMatrixInverse),k.uCamRot.value.setFromMatrix4(o.matrixWorld),e.render(B,P),q(e,o,a)},drawStars:q,starAt(e){let o,a,n,y;if(typeof e=="number"){const d=b[e];if(!d)return null;[o,a,n]=d,y=String(e)}else{if(!F)return null;const d=x=>String(x).replace(/\s+/g," ").trim().toLowerCase(),H=d(e),G=F.find(x=>x[5]&&(d(x[5])===H||d(x[5].replace(/^\d+/,""))===H));if(!G)return null;[,o,a,n]=G,y=G[5]}const m=X(o,a).applyMatrix3(l).normalize(),h=s.camera.position.clone().addScaledVector(m,1e3);return{dir:m,screen:s.toScreen(h),mag:n,name:y}},dirGal(e,o){return ee(e,o).applyMatrix3(l).normalize()},dispose(){if(!C){C=!0;for(const e of M)e.dispose();c.dispose(),z.dispose(),f.dispose(),O.dispose()}}};return s.onDestroy(()=>I.dispose()),I}export{$ as EQ_TO_GAL,Z as EQ_TO_PHOTO,J as SKY_GLSL,se as createSky,X as eqDir,ee as galDir};
