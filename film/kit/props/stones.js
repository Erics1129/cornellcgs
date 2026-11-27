import*as o from"three";import{RoundedBoxGeometry as I}from"three/addons/geometries/RoundedBoxGeometry.js";import{GLSL_COMMON as A,GLSL_FRAG as q,lin as C}from"../actors/core.js";import{clamp as F,seeded as $,hash01 as O}from"../ease.js";import{contactShadows as E}from"./contact.js";const P=Object.freeze({thickness:.42}),G="#3A3735",Q="#F5F1E7";function B(v,{height:h=1.6}={}){v=F(v);let a=0,t=1,s=0,n=-1;if(v<.42){const e=v/.42;a=h*(1-e*e),t=1+.07*e*e}else{const e=Math.min(1,(v-.42)/.58);t=1-.15*Math.exp(-7*e)*Math.cos(Math.PI*3.2*e)*(1-e)**.5,e<.06&&(t=1+.07*(1-e/.06)-.15*(e/.06)),a=e>.06&&e<.3?.04*Math.sin(Math.PI*(e-.06)/.24):0,s=.16*Math.exp(-4.5*e)*Math.sin(Math.PI*2*2.1*e)*(1-e),n=e<.75?e/.75:-1}return{y:a,sy:t,sxz:1/Math.sqrt(t),tilt:s,ring:n,air:F(a/.1)}}function D(){const h=P.thickness/2,a=[],t=22;for(let e=0;e<=t;e++){const i=Math.PI/2-e/t*Math.PI,d=Math.cos(i),p=Math.sin(i),g=.5*Math.sign(d)*Math.abs(d)**.78,l=h*Math.sign(p)*Math.abs(p)**1.12;a.push(new o.Vector2(Math.max(0,g),l+h))}a[0].x=0,a[t].x=0;const s=new o.LatheGeometry(a.reverse(),48);s.computeVertexNormals();const n=new o.InstancedBufferGeometry;for(const e of["position","normal","uv"])n.setAttribute(e,s.getAttribute(e));return n.setIndex(s.getIndex()),s.dispose(),n}const U=`
${A}
attribute vec4 aStone;    // white (0 slate, 1 shell), seed, flash, unused
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec4 vStone;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  // the normal of a squashed lens: inverse-transpose of the instance's scale
  mat3 m3 = mat3(m);
  vec3 sc = vec3(dot(m3[0], m3[0]), dot(m3[1], m3[1]), dot(m3[2], m3[2]));
  vN = normalize(m3 * (normal / max(sc, vec3(1e-12))));
  vLocal = position; vStone = aStone; vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,_=`
${A}
${q}
uniform vec3 uSlate; uniform vec3 uShell;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec4 vStone;
void main() {
  float white = vStone.x;
  vec3 base = mix(uSlate, uShell, white);
  // the shell's fine growth lines (across the stone, very quiet); the slate's faint mottle
  float lines = sin((vLocal.x * 1.0 + vLocal.z * 0.2 + 0.03 * sin(vLocal.z * 9.0 + vStone.y * 20.0)) * 120.0 + vStone.y * 40.0);
  base *= mix(1.0 + 0.012 * (fbm(vLocal * 7.0 + vStone.y * 13.0) - 0.5), 1.0 - 0.018 * smoothstep(0.3, 1.0, lines), white);
  base = mix(base, vec3(1.0, 0.985, 0.95), vStone.z * 0.5);
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float occl = mix(0.82, 1.0, smoothstep(0.0, 0.25, vLocal.y / ${P.thickness.toFixed(3)}));   // the belly near the board
  vec3 col = lightPlayer(base, N, V, occl, 0.0, 0.5, 1.0);
  // a soft broad sheen (polished slate, glossy shell), lit by the sun's colour, never a hard dot
  vec3 H = normalize(uKeyDir + V);
  float sp = pow(max(dot(N, H), 0.0), mix(14.0, 26.0, white)) * smoothstep(-0.1, 0.4, dot(N, uKeyDir));
  col += uKeyTint * sp * mix(0.16, 0.12, white);
  // the sky in the slate's upper face: a cool lift so black stays readable, never pitch black
  col += uShadeTint * mix(0.05, 0.0, white) * clamp(N.y, 0.0, 1.0);
  if (uStyle > 1.5) col *= 0.96 + 0.06 * fbm(vLocal * 40.0);
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function te(v,h={}){const a=h.count||1,t=h.diameter||.022,s=D(),n=new o.InstancedBufferAttribute(new Float32Array(a*4),4);n.setUsage(o.DynamicDrawUsage),s.setAttribute("aStone",n),s.boundingSphere=new o.Sphere(new o.Vector3,1e5);const e=new o.ShaderMaterial({vertexShader:U,fragmentShader:_,uniforms:{...v.light,uSlate:{value:C(G)},uShell:{value:C(Q)}}}),i=new o.InstancedMesh(s,e,a);i.instanceMatrix.setUsage(o.DynamicDrawUsage),i.frustumCulled=!1;const d=E(v);d.reserve(a*3);const p=[];for(let m=0;m<a;m++)p.push({position:new o.Vector3,quaternion:new o.Quaternion,white:0,land:1,height:1.6,floor:void 0,visible:!0,shadow:!0,shadowOpacity:1,ring:!0,ringColour:null,seed:O("stone"+m)});const g=new o.Matrix4,l=new o.Quaternion,w=new o.Quaternion,z=new o.Vector3,x=new o.Vector3,M=new o.Vector3,k=new o.Matrix4().makeScale(0,0,0),W=new o.Vector3,b=new o.Vector3,L=new o.Vector3,y=new o.Vector3,N=new o.Vector3(0,1,0),V=new o.Color,S={object:i,count:a,diameter:t,get(m){return p[m]},set(m,c){const u=p[m];if(!u)return S;c.position&&(Array.isArray(c.position)?u.position.fromArray(c.position):u.position.copy(c.position)),c.quaternion&&(Array.isArray(c.quaternion)?u.quaternion.fromArray(c.quaternion):u.quaternion.copy(c.quaternion)),c.colour!==void 0&&(u.white=c.colour==="white"||c.colour===1?1:0);for(const r of["land","height","visible","shadow","shadowOpacity","ring","ringColour"])c[r]!==void 0&&(u[r]=c[r]);return"floor"in c&&(u.floor=c.floor),S},hideAll(){for(const m of p)m.visible=!1;return S},setStyle(){},update(m){const c=!!(m.plate||m.plateEngine);for(let u=0;u<a;u++){const r=p[u];if(!r.visible||r.land<=0){i.setMatrixAt(u,k);continue}const f=B(r.land,{height:r.height}),R=r.seed*Math.PI*2;if(M.set(Math.cos(R),0,Math.sin(R)),w.setFromAxisAngle(M,f.tilt),l.copy(w).multiply(r.quaternion),z.copy(r.position).addScaledVector(N,f.y*t),g.compose(z,l,x.set(t*f.sxz,t*f.sy,t*f.sxz)),i.setMatrixAt(u,g),n.setXYZW(u,r.white,r.seed,0,0),r.shadow&&r.shadowOpacity>0){const T=P.thickness*t*f.sy;y.copy(z).addScaledVector(N.set(0,1,0).applyQuaternion(l),T/2),W.set(t*f.sxz*.5,0,0).applyQuaternion(l),b.set(0,0,t*f.sxz*.5).applyQuaternion(l),L.set(0,T/2,0).applyQuaternion(l),N.set(0,1,0),d.cast(y,W,b,L,{floor:r.floor??r.position.y,size:t,opacity:r.shadowOpacity*(c?1.4:1.05),round:t*.5*f.sxz,lift:t*.003})}r.ring&&f.ring>0&&f.ring<1&&(V.set(r.ringColour||"#F7E3B8"),m.fx.ring(r.position,N,.4+.58*f.ring,{width:t*1.5,colour:V,dashes:0,seed:u+1}))}n.needsUpdate=!0,i.instanceMatrix.needsUpdate=!0},dispose(){s.dispose(),e.dispose()}};return S}function j(v){const a=document.createElement("canvas");a.width=1024,a.height=1024;const t=a.getContext("2d"),s=t.createLinearGradient(0,0,1024,0),n=$(41);for(let i=0;i<=8;i++){const d=n();s.addColorStop(i/8,`rgb(${236+d*8},${196+d*10},${128+d*12})`)}t.fillStyle=s,t.fillRect(0,0,1024,1024);for(let i=0;i<260;i++){let d=n()*1024;const p=.6+n()*2.4,g=.025+n()*.07;t.strokeStyle=`rgba(${150+n()*30},${92+n()*20},${40+n()*15},${g})`,t.lineWidth=p,t.beginPath();for(let l=-20;l<=1044;l+=32){const w=d+Math.sin(l*.004+i)*3+Math.sin(l*.013+i*2)*1.2;l<0?t.moveTo(w,l):t.lineTo(w,l)}t.stroke()}const e=new o.CanvasTexture(a);return e.colorSpace=o.SRGBColorSpace,e.wrapS=e.wrapT=o.RepeatWrapping,e.anisotropy=v?Math.min(8,v.capabilities.getMaxAnisotropy()):4,e}const H=`
${A}
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vLocalN;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vLocal = position; vLocalN = normal; vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,K=`
${A}
${q}
uniform sampler2D uWood; uniform vec3 uSize; uniform vec2 uCell; uniform float uLines; uniform vec3 uInk;
uniform float uLineW; uniform float uStarR; uniform vec4 uStars;   // star point indices (first, second, third, count)
uniform float uReal; uniform float uFive; uniform mat4 modelMatrix;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vLocalN;
float lineMask(float d, float w) {
  float aa = max(fwidth(d), 1e-6);
  float ww = max(w, aa * 0.7);                       // never thinner than a pixel: fade instead
  return (1.0 - smoothstep(ww - aa, ww + aa, abs(d))) * min(1.0, w / (aa * 0.7));
}
void main() {
  vec3 an = abs(vLocalN);
  bool top = vLocalN.y > 0.7;
  vec2 wuv = an.y > 0.5 ? vLocal.xz : an.x > 0.5 ? vLocal.zy : vLocal.xy;
  vec3 wood = texture2D(uWood, wuv / uSize.x * vec2(1.0, 0.5) + 0.5).rgb;
  vec3 base = wood;
  if (!top) base *= vec3(0.9, 0.86, 0.82);            // the sides: a touch deeper
  if (top) {
    float n = uLines - 1.0;
    vec2 g = vLocal.xz / uCell + n * 0.5;             // grid coordinates 0..n
    vec2 inside = step(-0.02, g) * step(g, vec2(n + 0.02));
    vec2 f = (g - floor(g + 0.5)) * uCell;            // metres to the nearest line
    float lx = lineMask(f.x, uLineW) * step(-0.5 * uLineW / uCell.y, g.y) * step(g.y, n + 0.5 * uLineW / uCell.y);
    float lz = lineMask(f.y, uLineW) * step(-0.5 * uLineW / uCell.x, g.x) * step(g.x, n + 0.5 * uLineW / uCell.x);
    float ink = max(lx * step(-0.5, g.x) * step(g.x, n + 0.5), lz * step(-0.5, g.y) * step(g.y, n + 0.5));
    // star points
    vec2 gi = floor(g + 0.5);
    float star = 0.0;
    for (int a = 0; a < 3; a++) for (int b = 0; b < 3; b++) {
      if (float(a) >= uStars.w || float(b) >= uStars.w) continue;
      if (uFive > 0.5 && ((a == 1) != (b == 1))) continue;
      vec2 s = vec2(a == 0 ? uStars.x : a == 1 ? uStars.y : uStars.z, b == 0 ? uStars.x : b == 1 ? uStars.y : uStars.z);
      float d = length((g - s) * uCell) - uStarR;
      float aa = max(fwidth(d), 1e-6);
      star = max(star, 1.0 - smoothstep(-aa, aa, d));
    }
    ink = max(ink, star);
    base = mix(base, uInk, ink * 0.88);
  }
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 col;
  if (uReal > 0.5) {
    // on a plate: lit like the cube, face by face
    vec3 face = an.y > 0.5 ? vec3(0.0, sign(vLocalN.y), 0.0) : an.x > 0.5 ? vec3(sign(vLocalN.x), 0.0, 0.0) : vec3(0.0, 0.0, sign(vLocalN.z));
    vec3 NL = normalize(mix(N, normalize(mat3(modelMatrix) * face), 0.85));
    col = lightBox(base, N, NL, V, 1.0, 0.5, 1.0, 0.0);
  } else col = lightPlayer(base, N, V, 1.0, 0.0, 0.5, 1.0);
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function oe(v,h={}){const a=h.lines||19,t=h.width||.45,s=h.cellAspect||1.07,n=h.thickness||t*.055,e=t/(a-1+1.5),i=e*s*(a-1)+e*1.5,d=new I(t,n,i,3,Math.min(n*.35,t*.012));d.translate(0,n/2,0);const p=j(v.renderer),g=a>=19?[3,9,15,3]:a>=13?[3,6,9,3]:[2,4,6,3],l={...v.light,uWood:{value:p},uSize:{value:new o.Vector3(t,n,i)},uCell:{value:new o.Vector2(e,e*s)},uLines:{value:a},uInk:{value:C("#3B2A1E")},uLineW:{value:Math.max(e*.045,t*.0016)*.5},uStarR:{value:e*.12},uStars:{value:new o.Vector4(...g)},uReal:{value:0},uFive:{value:a<19?1:0}},w=new o.ShaderMaterial({vertexShader:H,fragmentShader:K,uniforms:l});w.extensions={derivatives:!0};const z=new o.Mesh(d,w),x=new o.Group;x.add(z);const M=new o.Vector3,k=new o.Vector3,W=new o.Vector3,b=new o.Quaternion,L={object:x,lines:a,cell:e,size:{width:t,depth:i,thickness:n},get topY(){return x.updateMatrixWorld(),M.set(0,n,0).applyMatrix4(x.matrixWorld).y},point(y,N,V=new o.Vector3){x.updateMatrixWorld();const S=a-1;return V.set((y-S/2)*e,n,(N-S/2)*e*s).applyMatrix4(x.matrixWorld)},shadowOpacity:1,setStyle(){},update(y){l.uReal.value=y.plate||y.plateEngine?1:0,L.shadowOpacity>0&&(x.updateMatrixWorld(),b.setFromRotationMatrix(x.matrixWorld),M.setFromMatrixPosition(x.matrixWorld),k.set(t/2,0,0).applyQuaternion(b),W.set(0,0,i/2).applyQuaternion(b),y.shadows.cast(M,k,W,{opacity:L.shadowOpacity*(y.plate||y.plateEngine?1.4:1),shape:0,round:.04,size:Math.max(t,i),extent:n}))},dispose(){d.dispose(),w.dispose(),p.dispose()}};return L}export{P as STONE,oe as createGoBoard,te as createStones,B as landShape};
