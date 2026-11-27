import*as t from"three";const y=`
attribute vec4 seed;            // xyz: a place in the box (0..1), w: a size and brightness seed
uniform vec3 uBox0, uBox1;      // the box the motes live in (world)
uniform vec3 uDrift;            // metres moved by the current so far
uniform float uPx;              // px per (metre / metre of distance): H * dpr / (2 tan(fov / 2))
uniform float uFocus;           // metres from the lens to the heroes
uniform float uDpr;
varying float vA;
varying float vSoft;
void main() {
  vec3 size = uBox1 - uBox0;
  vec3 p = uBox0 + mod(seed.xyz * size + uDrift, size);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = -mv.z;
  gl_Position = projectionMatrix * mv;
  float r = mix(0.005, 0.013, seed.w * seed.w);                     // radius of a mote, metres
  float sharp = r * uPx / max(d, 0.05);                              // its true size on screen (radius, device px)
  // the lens: the heroes and everything beyond them (the eye itself is sharp) are in focus; only dust close to the
  // lens, well in front of the heroes, opens into a soft disc
  float coc = 6.0 * uDpr * max(0.0, uFocus / max(d, 0.05) - 1.6);
  coc = min(coc, 22.0 * uDpr);
  float rad = max(0.75 * uDpr, sqrt(sharp * sharp + coc * coc));
  gl_PointSize = 2.0 * rad + 2.0;
  // the same light spread over a bigger disc: dimmer (a little kept, so a near disc still reads); none behind the lens
  float a = mix(0.22, 0.62, seed.w) * clamp((sharp + 0.7 * uDpr) / rad, 0.0, 1.0);
  a *= smoothstep(0.25, 0.9, d) * (1.0 - 0.75 * smoothstep(12.0, 34.0, d));
  vA = a;
  vSoft = clamp(coc / max(rad, 1e-3), 0.0, 1.0);
}`,A=`
uniform vec4 uLamp;             // x, y (device px from the bottom left), radius (device px), amount
varying float vA;
varying float vSoft;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = length(q);
  if (r > 1.0) discard;
  // a sharp mote is a soft dot; an out-of-focus one is a flat disc with a faintly brighter rim (a real lens's bokeh)
  float dot0 = 1.0 - smoothstep(0.15, 1.0, r);
  float disc = (1.0 - smoothstep(0.82, 1.0, r)) * (0.7 + 0.3 * smoothstep(0.55, 0.95, r));
  float k = mix(dot0, disc, vSoft);
  float warm = 0.0;
  if (uLamp.w > 0.0) {
    float l = length(gl_FragCoord.xy - uLamp.xy);
    warm = uLamp.w * (1.0 - smoothstep(uLamp.z * 0.25, uLamp.z * 1.1, l));
  }
  vec3 cool = vec3(0.72, 0.84, 1.0);
  vec3 lamp = vec3(1.0, 0.86, 0.66);
  float a = clamp(vA * k * (1.0 - 0.5 * vSoft) * (1.0 + 1.4 * warm), 0.0, 1.0);
  vec3 col = mix(cool, lamp, clamp(warm * 1.2, 0.0, 1.0));
  gl_FragColor = vec4(col * a, a);
}`;function S(u,{count:c=170,box0:h=[-12.5,-3.6,1.1],box1:x=[8,5.4,58],seed:w=11}={}){let a=w>>>0;const n=()=>{a=a+1831565813|0;let e=Math.imul(a^a>>>15,1|a);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296},s=new Float32Array(c*4);for(let e=0;e<c;e++)s[e*4]=n(),s[e*4+1]=n(),s[e*4+2]=n(),s[e*4+3]=n();const i=new t.BufferGeometry;i.setAttribute("position",new t.BufferAttribute(new Float32Array(c*3),3)),i.setAttribute("seed",new t.BufferAttribute(s,4)),i.boundingSphere=new t.Sphere(new t.Vector3(0,0,0),1e6);const r={uBox0:{value:new t.Vector3().fromArray(h)},uBox1:{value:new t.Vector3().fromArray(x)},uDrift:{value:new t.Vector3},uPx:{value:1e3},uFocus:{value:5},uDpr:{value:1},uLamp:{value:new t.Vector4(0,0,100,0)}},f=new t.ShaderMaterial({vertexShader:y,fragmentShader:A,uniforms:r,transparent:!0,depthWrite:!1,depthTest:!0,blending:t.CustomBlending,blendSrc:t.OneFactor,blendDst:t.OneMinusSrcAlphaFactor,blendSrcAlpha:t.OneFactor,blendDstAlpha:t.OneMinusSrcAlphaFactor}),l=new t.Points(i,f);l.frustumCulled=!1,l.renderOrder=2;let p=1;const v={object:l,update(e){const d=e.camera,o=e.renderer.getPixelRatio();r.uDpr.value=o,r.uPx.value=e.height*o/(2*Math.tan(d.fov*Math.PI/360)),l.visible=p>.001}};return u.add(v),{set({t:e=0,focus:d=5,lamp:o=null,H:g=720,amount:b=1}={}){p=b,r.uDrift.value.set(.05*e,.018*e,-.03*e),r.uFocus.value=d;const m=u.renderer.getPixelRatio();o&&o.a>.001?r.uLamp.value.set(o.x*m,(g-o.y)*m,o.r*m,o.a):r.uLamp.value.set(0,0,100,0)},dispose(){u.remove(v),i.dispose(),f.dispose()}}}export{S as createMotes};
