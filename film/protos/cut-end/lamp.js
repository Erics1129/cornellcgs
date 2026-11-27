import*as e from"three";function R(){return{uLamp:{value:new e.Vector4(0,0,100,0)},uLampKey:{value:new e.Color(.985,.955,.885)},uLampShade:{value:new e.Color(.74,.76,.9)},uLampHaze:{value:.1},uOutKey:{value:new e.Color(1,1,1)},uOutShade:{value:new e.Color(1,1,1)},uOutOn:{value:0},uOutHaze:{value:1},uLampSoft:{value:new e.Vector2(.5,1.38)}}}const L=`
uniform vec3 uKeyTint0;
uniform vec4 uLamp;
uniform vec2 uLampSoft;
uniform vec3 uLampKey;
uniform vec3 uLampShade;
uniform float uLampHaze;
uniform vec3 uOutKey;
uniform vec3 uOutShade;
uniform float uOutOn;
uniform float uOutHaze;
float tbLamp() {
  float d = length(gl_FragCoord.xy - uLamp.xy);
  return clamp(uLamp.w, 0.0, 1.5) * (1.0 - smoothstep(uLamp.z * uLampSoft.x, uLamp.z * uLampSoft.y, d));
}
#define uKeyTint mix(mix(uKeyTint0, uOutKey, uOutOn), uLampKey, min(tbLamp(), 1.0))
`,C=`
uniform vec3 uShadeTint0;
#define uShadeTint mix(mix(uShadeTint0, uOutShade, uOutOn), uLampShade, min(tbLamp(), 1.0))
`,F=`
uniform float uHazeDensity0;
#define uHazeDensity (uHazeDensity0 * mix(mix(1.0, uOutHaze, uOutOn), uLampHaze, min(tbLamp(), 1.0)))
`;function q(i,l){let n=0;return i.traverse(a=>{const o=Array.isArray(a.material)?a.material:a.material?[a.material]:[];for(const t of o)!t.isShaderMaterial||t.userData.tbLamp||!t.fragmentShader.includes("uniform vec3 uKeyTint;")||(t.userData.tbLamp=!0,t.onBeforeCompile=u=>{u.uniforms.uKeyTint0=u.uniforms.uKeyTint,u.uniforms.uShadeTint0=u.uniforms.uShadeTint,u.uniforms.uHazeDensity0=u.uniforms.uHazeDensity,Object.assign(u.uniforms,l),u.fragmentShader=u.fragmentShader.replace("uniform vec3 uKeyTint;",L).replace("uniform vec3 uShadeTint;",C).replace("uniform float uHazeDensity;",F)},t.customProgramCacheKey=()=>"touch-b-lamp-1",t.needsUpdate=!0,n++)}),n}const z=`
attribute vec4 aSeed;
uniform float uT, uBox, uPx, uFocus, uAperture, uMaxPt, uSize, uBright, uFloor, uSpin;
uniform vec3 uCam, uCentre, uDrift, uBase, uLit;
uniform vec2 uRes, uReach, uYRange;
uniform vec4 uLamp;
uniform vec2 uLampSoft;
varying vec3 vCol; varying float vBig;
void main() {
  float s = aSeed.w;
  vec3 base = aSeed.xyz * uBox;
  vec3 wob = 0.06 * vec3(sin(uT * 0.31 + s * 41.0), sin(uT * 0.23 + s * 13.0), cos(uT * 0.27 + s * 29.0));
  // world-fixed, wrapped round a box that sits AHEAD of the lens (where the lamp's beam is), faded at its faces
  vec3 q = mod(base + uDrift * uT * (0.7 + 0.6 * s) + wob - uCentre + 0.5 * uBox, uBox) - 0.5 * uBox;
  vec3 wp = uCentre + q;
  // dust lies in the room's air only (above the board); snow anywhere (uYRange off)
  float inY = uYRange.y > uYRange.x ? step(uYRange.x, wp.y) * step(wp.y, uYRange.y) : 1.0;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float z = -mv.z;
  gl_Position = projectionMatrix * mv;
  float r = uSize * (0.5 + 1.1 * s * s);
  float rpx = r * uPx / max(z, 0.02);
  float coc = uAperture * abs(1.0 - uFocus / max(z, 0.02));
  float size = clamp(max(2.0 * rpx, coc) + 1.0, 1.0, uMaxPt);
  float energy = max(4.0 * rpx * rpx, 1.0);
  float edge = 1.0 - smoothstep(0.36, 0.5, max(max(abs(q.x), abs(q.y)), abs(q.z)) / uBox);
  float nearF = smoothstep(0.1, 0.4, z);
  // the lamp: where the mote is on screen, and whether the lamp reaches that far
  vec2 sp = (gl_Position.xy / max(gl_Position.w, 1e-4) * 0.5 + 0.5) * uRes;
  float lm = clamp(uLamp.w, 0.0, 1.6) * (1.0 - smoothstep(uLamp.z * uLampSoft.x, uLamp.z * uLampSoft.y, length(sp - uLamp.xy)));
  lm *= 1.0 - smoothstep(uReach.x, uReach.y, z);
  // a flat flake turning: it catches the lamp now and then (a glint), only inside the light
  float glint = pow(max(0.0, sin(uT * (0.9 + 1.7 * s) * uSpin + s * 61.0)), 14.0);
  vec3 col = uBase * (1.0 - 0.6 * min(lm, 1.0)) + uLit * lm * (1.0 + 2.2 * glint);
  vCol = col * uBright * edge * nearF * inY * energy / (size * size);
  vBig = smoothstep(3.0, 9.0, size);
  gl_PointSize = size;
}`,A=`
varying vec3 vCol; varying float vBig;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = length(c);
  if (r > 1.0) discard;
  float small = exp(-r * r * 3.2) * 1.9;
  float disc = (1.0 - smoothstep(0.78, 1.0, r)) * (0.82 + 0.3 * smoothstep(0.45, 0.95, r));
  gl_FragColor = vec4(vCol * mix(small, disc, vBig), 0.0);
}`;function g(i){const l=Math.sin(i*127.1+311.7)*43758.5453;return l-Math.floor(l)}function D(i,l,n={}){const a=n.count??300,o=n.seed??1,t=new Float32Array(a*4);for(let s=0;s<a;s++)t[4*s]=g(o*97+s*3.1)-.5,t[4*s+1]=g(o*31+s*7.7)-.5,t[4*s+2]=g(o*53+s*5.3)-.5,t[4*s+3]=g(o*11+s*1.9);const u=new e.BufferGeometry;u.setAttribute("position",new e.BufferAttribute(new Float32Array(a*3),3)),u.setAttribute("aSeed",new e.BufferAttribute(t,4));const r={uT:{value:0},uBox:{value:n.box??7},uPx:{value:600},uFocus:{value:4},uAperture:{value:8},uMaxPt:{value:64},uSize:{value:n.size??.0016},uBright:{value:n.bright??1},uFloor:{value:0},uSpin:{value:n.spin??1},uCam:{value:new e.Vector3},uCentre:{value:new e.Vector3},uDrift:{value:new e.Vector3(...n.drift||[.006,-.025,.004])},uBase:{value:new e.Color(...n.base||[.05,.09,.13])},uLit:{value:new e.Color(...n.lit||[1,.78,.52])},uRes:{value:new e.Vector2(1,1)},uReach:{value:new e.Vector2(...n.reach||[4.5,7.5])},uYRange:{value:new e.Vector2(...n.yRange||[0,-1])},uLamp:l.uLamp,uLampSoft:l.uLampSoft},c=new e.ShaderMaterial({vertexShader:z,fragmentShader:A,uniforms:r,transparent:!0,depthWrite:!1,depthTest:!0,blending:e.CustomBlending,blendSrc:e.OneFactor,blendDst:e.OneFactor,blendSrcAlpha:e.ZeroFactor,blendDstAlpha:e.OneFactor}),m=new e.Points(u,c);m.frustumCulled=!1,m.renderOrder=20;const p=n.aperture??10;return{object:m,uniforms:r,set({t:s,camera:f,focus:h,bw:d,bh:x,visible:y=!0,aperture:w=1,ahead:b=0}){m.visible=y,y&&(r.uT.value=s,r.uCam.value.copy(f.position),f.getWorldDirection(r.uCentre.value),r.uCentre.value.multiplyScalar(b).add(f.position),r.uPx.value=x/(2*Math.tan(f.fov*Math.PI/360)),r.uFocus.value=Math.max(.2,h),r.uAperture.value=p*w*(x/720),r.uMaxPt.value=Math.min(110,70*x/720),r.uRes.value.set(d,x))},update(){},dispose(){u.dispose(),c.dispose()}}}const S="void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",O=`
uniform vec4 uLamp; uniform vec3 uLift; uniform vec2 uSoft;
void main() {
  float d = length(gl_FragCoord.xy - uLamp.xy) / max(uLamp.z, 1.0);
  float k = clamp(uLamp.w, 0.0, 1.6) * (1.0 - smoothstep(uSoft.x, uSoft.y, d));
  gl_FragColor = vec4(uLift * k, 0.0);       // blended as dst * (1 + this): what is there, a little brighter and warmer
}`,T=`
uniform vec4 uLamp; uniform vec3 uGlow; uniform float uWide;
float hashF(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float d = length(gl_FragCoord.xy - uLamp.xy) / max(uLamp.z, 1.0);
  float a = clamp(uLamp.w, 0.0, 1.6);
  // backscatter: the water just in front of the lens lit by the lamp, densest in the middle, never a disc with an edge
  float k = exp(-d * d * 2.4) * 0.75 + exp(-d * d * 0.55) * 0.25 * uWide;
  vec3 c = uGlow * a * k;
  c += (hashF(gl_FragCoord.xy) - 0.5) / 255.0 * step(0.002, c.r);   // dither: no banding in the soft falloff
  gl_FragColor = vec4(max(c, 0.0), 0.0);
}`;function _(i){const l=new e.BufferGeometry;l.setAttribute("position",new e.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));const n=new e.OrthographicCamera(-1,1,1,-1,0,1),a=new e.ShaderMaterial({vertexShader:S,fragmentShader:O,depthTest:!1,depthWrite:!1,transparent:!0,uniforms:{uLamp:i.uLamp,uLift:{value:new e.Vector3(.2,.12,.04)},uSoft:{value:new e.Vector2(.15,1.1)}},blending:e.CustomBlending,blendEquation:e.AddEquation,blendSrc:e.DstColorFactor,blendDst:e.OneFactor,blendSrcAlpha:e.ZeroFactor,blendDstAlpha:e.OneFactor}),o=new e.ShaderMaterial({vertexShader:S,fragmentShader:T,depthTest:!1,depthWrite:!1,transparent:!0,uniforms:{uLamp:i.uLamp,uGlow:{value:new e.Vector3(.03,.022,.012)},uWide:{value:1}},blending:e.CustomBlending,blendEquation:e.AddEquation,blendSrc:e.OneFactor,blendDst:e.OneFactor,blendSrcAlpha:e.ZeroFactor,blendDstAlpha:e.OneFactor}),t=new e.Mesh(l,a);t.frustumCulled=!1;const u=new e.Scene;return u.add(t),{lift:a,glow:o,draw(r,{lift:c=null,glow:m=null,wide:p=1}={}){const v=r.autoClear;r.autoClear=!1,c&&(a.uniforms.uLift.value.set(c[0],c[1],c[2]),t.material=a,r.render(u,n)),m&&(o.uniforms.uGlow.value.set(m[0],m[1],m[2]),o.uniforms.uWide.value=p,t.material=o,r.render(u,n)),r.autoClear=v},dispose(){l.dispose(),a.dispose(),o.dispose()}}}function P(i,l,n){const a=i.render;let o=null;i.render=function(t){if(!o&&t&&t.isScene){let u=!1;t.traverse(r=>{r.isLight&&(u=!0)}),u&&(o=t)}};try{l(i,new e.PerspectiveCamera(30,16/9,.05,100),n)}catch{}finally{i.render=a,i.setRenderTarget(null)}return o}const M="varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",B=`
varying vec2 vUv;
uniform float uAmt, uSoft, uCube;
uniform vec3 uTint;
float sdTri(vec2 p) {            // the dart: nose at +y, a wide trailing edge at -y (unit box)
  vec2 a = vec2(0.0, 0.48), b = vec2(-0.42, -0.4), c = vec2(0.42, -0.4);
  vec2 e0 = b - a, e1 = c - b, e2 = a - c, v0 = p - a, v1 = p - b, v2 = p - c;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
void main() {
  vec2 p = vUv - 0.5;
  float dart = 1.0 - smoothstep(-uSoft, uSoft, sdTri(p * vec2(1.0, 1.0)));
  vec2 q = abs(p - vec2(0.0, -0.06)) - vec2(0.12, 0.12);
  float box = 1.0 - smoothstep(-uSoft, uSoft, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.02);
  float a = clamp(max(dart, box * uCube), 0.0, 1.0) * uAmt;
  gl_FragColor = vec4(mix(vec3(1.0), uTint, a), 1.0);
}`;function H(){const i=new e.PlaneGeometry(1,1);i.rotateX(-Math.PI/2);const l={uAmt:{value:0},uSoft:{value:.12},uCube:{value:1},uTint:{value:new e.Color(.3,.29,.28)}},n=new e.ShaderMaterial({vertexShader:M,fragmentShader:B,uniforms:l,transparent:!0,depthWrite:!1,depthTest:!0,blending:e.CustomBlending,blendSrc:e.ZeroFactor,blendDst:e.SrcColorFactor,blendSrcAlpha:e.ZeroFactor,blendDstAlpha:e.OneFactor,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-4}),a=new e.Mesh(i,n);a.renderOrder=-5,a.frustumCulled=!1;const o=new e.Vector3,t=new e.Vector3;return{object:a,set({centre:u,nose:r,light:c,amount:m=0,groundY:p=.002,length:v=.62}){if(!c||m<=.001){a.visible=!1;return}const s=c.y-p,f=u.y-p;if(s<=f+.05){a.visible=!1;return}a.visible=!0;const h=s/(s-f);t.copy(u).sub(c).multiplyScalar(h).add(c),t.y=p;const d=h;a.position.copy(t),o.copy(r),o.y=0,o.lengthSq()<1e-6&&o.set(0,0,1),o.normalize(),a.rotation.set(0,Math.atan2(o.x,o.z)+Math.PI,0),a.scale.set(v*.95*d,1,v*d),l.uSoft.value=Math.min(.3,.05+.25*(f/Math.max(.1,s))*d),l.uAmt.value=Math.min(.85,m*.85/Math.max(1,d*.75))},update(){},dispose(){i.dispose(),n.dispose()}}}export{P as captureScene,H as createLampShadow,D as createMotes,_ as createWorldLamp,R as lampUniforms,q as patchPlayers};
