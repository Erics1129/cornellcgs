import*as e from"three";import{rng as fe,makeFlight as l0,frameQuat as d0}from"./rig.js";import{studioEnvironment as f0}from"./post.js";const y=2,v=46,Y=.6,j=.9,he=1.07,I=2,C=12,Pt=2,W=-.3,M=Y*.95,G=1.94,Tt=.16,Le=.135,S=3.7,f=-29.4,c=F=>new e.Color(F).convertSRGBToLinear();async function p0(F,h0,{quality:Re="high"}={}){const It=F.renderer,a=new e.Scene,Wt=new e.Color("#4A5058");a.fog=new e.FogExp2(Wt.clone().convertSRGBToLinear(),.022);const qe=f0(It,[{p:[0,8,-6],size:[2,30],color:[3,3.1,3.3]},{p:[3,8,-6],size:[1,30],color:[1.6,1.7,1.8]},{p:[-3,8,-6],size:[1,30],color:[1.6,1.7,1.8]},{p:[0,1.2,-30],size:[1.6,2.2],color:[3,1.9,1]},{p:[0,3.2,-14],size:[.5,6],color:[2.2,2.3,2.5]},{p:[0,3.2,14],size:[.5,6],color:[2.2,2.3,2.5]},{p:[0,1.6,-16],size:[3.5,2.6],color:[.32,.34,.37]},{p:[0,1.6,16],size:[3.5,2.6],color:[.32,.34,.37]},{p:[0,-2,-8],size:[3,10],color:[.25,.26,.28]},{p:[6,1,0],size:[4,2],color:[.12,.13,.15]},{p:[-6,1,0],size:[4,2],color:[.12,.13,.15]}],{background:723982}),x=qe.texture;a.add(new e.HemisphereLight(14213870,6975092,.42));const Gt=9;for(let t=0;t<Gt;t++){const o=new e.PointLight(15331583,7.5,11,2);o.position.set(0,2.95,-1.2-t*3.05),a.add(o)}const Ee=new e.PointLight(16756839,5,8,2);Ee.position.set(0,1.9,-28.7),a.add(Ee);const Ve=new e.PointLight(16757611,70,9,2);Ve.position.set(.4,2.3,-31.2),a.add(Ve);const $e=new e.PointLight(3800975,.35,2.2,2);$e.position.set(0,2.5,-29.1),a.add($e);const _e=1,Z=[],P=new e.Matrix4,B=new e.Quaternion,A=new e.Vector3,He=new e.Vector3,z=new e.Vector3(1,1,1),zt=fe(5),K=new Uint8Array(C*y*v*4),Ue=[],Oe=[],ve=[],je=[],Ke=[];{const t=fe(23);for(let o=0;o<y*v;o++){const n=t()<.1,i=t()<.34,r=t(),l=Math.floor(t()*3);Oe.push(l),ve.push(t()<.22?1.1:1);{const d=t();je.push(d<.05?1:d<.11?2:0)}Ke.push(t());for(let d=0;d<C;d++){const h=t(),p=(n?h<.6:h<.1)?0:h<.45+.2*(r-.5)?1:h<.8?2:3;Ue.push(p);const g=(o*C+d)*4;K[g]=p*64,K[g+1]=i?255:0,K[g+2]=Math.floor(t()*255),K[g+3]=l*100}}}const me=new e.DataTexture(K,C,y*v,e.RGBAFormat);me.needsUpdate=!0,Z.push(me);const Dt=new e.BoxGeometry(Y*.995,I,he),Lt=new e.MeshStandardMaterial({color:c("#101113"),roughness:.5,metalness:.2,envMap:x,envMapIntensity:.3}),Ne=new e.InstancedMesh(Dt,Lt,y*v),Qe=new e.PlaneGeometry(M,G),Xe=new e.InstancedBufferAttribute(new Float32Array(y*v*4),4);Qe.setAttribute("aDoor",Xe);const pe=new e.MeshStandardMaterial({color:16777215,roughness:.5,metalness:0,envMap:x,envMapIntensity:.4});pe.onBeforeCompile=t=>{t.uniforms.uSlots={value:me},t.vertexShader=t.vertexShader.replace("#include <common>",`#include <common>
attribute vec4 aDoor; varying vec4 vDA; varying vec2 vDoor; varying vec3 vWp; varying vec3 vTx; varying vec3 vNz;`).replace("#include <worldpos_vertex>",`#include <worldpos_vertex>
vDoor = uv; vDA = aDoor;
vWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
vTx = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * vec3(1.0, 0.0, 0.0));
vNz = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0));`),t.fragmentShader=t.fragmentShader.replace("#include <common>",`#include <common>
varying vec4 vDA; varying vec2 vDoor; varying vec3 vWp; varying vec3 vTx; varying vec3 vNz; uniform sampler2D uSlots;
float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 gBW = vec2(1e-4);
float boxw(vec2 q, vec2 a, vec2 b, vec2 w) { vec2 s = smoothstep(a - w, a + w, q) * (1.0 - smoothstep(b - w, b + w, q)); return s.x * s.y; }
float box(vec2 q, vec2 a, vec2 b) { return boxw(q, a, b, gBW); }
// what stands behind the mesh, 5 cm in: servers, a patch panel, cables. q in metres across/up the door.
vec3 behind(vec2 q, vec4 A, out vec3 em) {
  em = vec3(0.0);
  float seed = A.z;
  int ri = int(A.x + 0.5) * ${v} + int(A.y + 0.5);
  bool silverRack = texelFetch(uSlots, ivec2(0, ri), 0).g > 0.5;
  vec3 col = vec3(0.012, 0.013, 0.015);                              // the rack's dark inside
  // rails: the 19-inch mounting rails just inside the frame
  col = mix(col, vec3(0.06, 0.062, 0.066), box(q, vec2(0.035, 0.05), vec2(0.05, 1.93)) + box(q, vec2(${(M-.05).toFixed(3)}, 0.05), vec2(${(M-.035).toFixed(3)}, 1.93)));
  // servers: 12 slots of 3U
  float sh0 = floor(texelFetch(uSlots, ivec2(0, ri), 0).a * 2.55 + 0.5) * 0.04445;
  float su = (q.y - ${Tt.toFixed(3)} + sh0) / ${Le.toFixed(3)};
  float u = floor(su); float fy = fract(su) * ${Le.toFixed(3)};   // metres up inside the slot
  if (u >= 0.0 && u < ${C.toFixed(1)} && q.x > 0.05 && q.x < ${(M-.05).toFixed(3)}) {
    vec4 sd = texelFetch(uSlots, ivec2(int(u), ri), 0);
    float h = sd.r < 0.1 ? 0.05 : sd.r < 0.35 ? 0.3 : sd.r < 0.6 ? 0.6 : 0.9;
    float x = q.x - 0.05; float W = ${(M-.1).toFixed(3)};
    vec3 bez = silverRack ? vec3(0.26, 0.265, 0.275) : vec3(0.035, 0.036, 0.04);
    vec3 bay = vec3(0.022, 0.023, 0.026), lip = silverRack ? vec3(0.42, 0.43, 0.44) : vec3(0.2, 0.205, 0.215);
    float ears = box(vec2(x, fy), vec2(0.0, 0.006), vec2(0.022, 0.088)) + box(vec2(x, fy), vec2(W - 0.022, 0.006), vec2(W, 0.088));
    if (h < 0.1) {
      // blanking panels: 1U lines
      float l = fract(fy / 0.04445);
      col = vec3(0.022, 0.023, 0.025) * (0.8 + 0.4 * smoothstep(0.04, 0.1, l) * (1.0 - smoothstep(0.9, 0.96, l)));
    } else if (h < 0.5) {
      // a 2U server: 12 vertical 2.5-inch bays, ears and handles, a vent; 1U blank above it
      float s = box(vec2(x, fy), vec2(0.0, 0.004), vec2(W, 0.093));
      vec3 c = bez;
      float bx = (x - 0.03) / 0.0205; float bi = floor(bx); float bf = fract(bx);
      float inBay = step(0.0, bi) * step(bi, 11.0) * boxw(vec2(bf, fy), vec2(0.06, 0.012), vec2(0.94, 0.086), gBW / vec2(0.0205, 1.0));
      c = mix(c, bay, inBay);
      c = mix(c, lip, inBay * boxw(vec2(bf, fy), vec2(0.15, 0.072), vec2(0.85, 0.083), gBW / vec2(0.0205, 1.0)));
      float act = inBay * boxw(vec2(bf, fy), vec2(0.62, 0.016), vec2(0.82, 0.022), gBW / vec2(0.0205, 1.0));
      em += vec3(0.25, 1.0, 0.45) * act * 0.9 * step(0.35, hsh(vec2(bi, seed + u)));
      float vent = box(vec2(x, fy), vec2(0.28, 0.015), vec2(W - 0.03, 0.08));
      c = mix(c, c * (0.55 + 0.45 * step(0.5, fract(x / 0.004))), vent);
      c = mix(c, lip * 1.4, ears);
      col = mix(col, c, s);
      col = mix(col, vec3(0.022, 0.023, 0.025), box(vec2(x, fy), vec2(0.0, 0.094), vec2(W, 0.133)));
    } else if (h < 0.8) {
      // three 1U servers: 4 horizontal bays each
      float k = floor(fy / 0.04445); float fk = fract(fy / 0.04445) * 0.04445;
      float s = box(vec2(x, fk), vec2(0.0, 0.002), vec2(W, 0.0425));
      vec3 c = mix(bez, bez * 1.25, hsh(vec2(k, seed)));
      float bx = (x - 0.03) / 0.104; float bi = floor(bx); float bf = fract(bx);
      float inBay = step(0.0, bi) * step(bi, 3.0) * boxw(vec2(bf, fk), vec2(0.04, 0.008), vec2(0.96, 0.036), gBW / vec2(0.104, 1.0));
      c = mix(c, bay, inBay);
      c = mix(c, lip, inBay * boxw(vec2(bf, fk), vec2(0.08, 0.012), vec2(0.18, 0.032), gBW / vec2(0.104, 1.0)));
      em += vec3(0.25, 1.0, 0.45) * inBay * boxw(vec2(bf, fk), vec2(0.88, 0.014), vec2(0.92, 0.018), gBW / vec2(0.104, 1.0)) * 0.8 * step(0.4, hsh(vec2(bi + k * 7.0, seed + u)));
      c = mix(c, lip * 1.3, box(vec2(x, fk), vec2(0.0, 0.004), vec2(0.016, 0.04)) + box(vec2(x, fk), vec2(W - 0.016, 0.004), vec2(W, 0.04)));
      col = mix(col, c, s);
    } else {
      // a 3U storage box: 3.5-inch bays in a 4 x 3 grid
      float s = box(vec2(x, fy), vec2(0.0, 0.003), vec2(W, 0.132));
      vec3 c = bez * 0.9;
      vec2 g = vec2((x - 0.03) / 0.106, (fy - 0.008) / 0.0405); vec2 gi = floor(g); vec2 gf = fract(g);
      float inBay = step(0.0, gi.x) * step(gi.x, 3.0) * step(0.0, gi.y) * step(gi.y, 2.0) * boxw(gf, vec2(0.03, 0.08), vec2(0.97, 0.92), gBW / vec2(0.106, 0.0405));
      c = mix(c, bay * 1.3, inBay);
      c = mix(c, lip, inBay * boxw(gf, vec2(0.05, 0.3), vec2(0.6, 0.7), gBW / vec2(0.106, 0.0405)));
      em += vec3(0.25, 1.0, 0.45) * inBay * boxw(gf, vec2(0.86, 0.4), vec2(0.92, 0.55), gBW / vec2(0.106, 0.0405)) * 0.45;
      c = mix(c, lip * 1.3, ears);
      col = mix(col, c, s);
    }
  }
  // the top: a switch (1U) and a patch panel with coloured boots
  if (q.y > 1.79 && q.y < 1.92 && q.x > 0.05 && q.x < ${(M-.05).toFixed(3)}) {
    float x = q.x - 0.05;
    col = vec3(0.04, 0.042, 0.046);
    float pp = box(q, vec2(0.05, 1.86), vec2(${(M-.05).toFixed(3)}, 1.904));
    float px = x / 0.0196; float pi = floor(px); float pf = fract(px);
    float port = boxw(vec2(pf, q.y), vec2(0.2, 1.872), vec2(0.8, 1.893), gBW / vec2(0.0196, 1.0));
    float ci = hsh(vec2(pi, seed * 3.1));
    vec3 cc = ci < 0.35 ? vec3(0.05, 0.22, 0.75) : ci < 0.55 ? vec3(0.75, 0.6, 0.04) : ci < 0.68 ? vec3(0.06, 0.55, 0.6) : ci < 0.76 ? vec3(0.8, 0.28, 0.04) : vec3(0.02);
    col = mix(col, mix(vec3(0.006), cc, step(0.12, hsh(vec2(pi, seed + 9.0)))), pp * port);
    float sw = box(q, vec2(0.05, 1.805), vec2(${(M-.05).toFixed(3)}, 1.85));
    float sx = x / 0.0175; float si = floor(sx); float sf = fract(sx);
    float sport = boxw(vec2(sf, q.y), vec2(0.15, 1.813), vec2(0.85, 1.835), gBW / vec2(0.0175, 1.0));
    col = mix(col, vec3(0.01), sw * sport);
    em += vec3(0.3, 1.0, 0.4) * sw * boxw(vec2(sf, q.y), vec2(0.15, 1.837), vec2(0.4, 1.842), gBW / vec2(0.0175, 1.0)) * step(0.3, hsh(vec2(si, seed))) * 0.6;
  }
  // cable bundles down both sides, curving in from the patch panel
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float ci = hsh(vec2(fi, seed * 5.7));
    vec3 cc = ci < 0.4 ? vec3(0.05, 0.2, 0.7) : ci < 0.6 ? vec3(0.72, 0.58, 0.04) : ci < 0.75 ? vec3(0.06, 0.5, 0.55) : ci < 0.85 ? vec3(0.75, 0.26, 0.04) : vec3(0.03);
    float bend = smoothstep(1.62, 1.86, q.y);
    float xl = mix(0.012 + fi * 0.0055, 0.06 + fi * 0.03, bend) + 0.0015 * sin(q.y * 9.0 + fi + seed * 6.0);
    float xr = mix(${(M-.012).toFixed(3)} - fi * 0.0055, ${(M-.06).toFixed(3)} - fi * 0.03, bend) + 0.0015 * sin(q.y * 8.0 - fi + seed * 4.0);
    float on = step(fi, 2.0 + floor(hsh(vec2(seed, 2.0)) * 4.0));
    float span = step(0.08 + 0.25 * hsh(vec2(fi, seed)), q.y) * step(q.y, 1.86);
    float wl = gBW.x + 1e-4;
    float cl = (1.0 - smoothstep(0.0024 - wl, 0.0024 + wl, abs(q.x - xl))) * on * span;
    float cr = (1.0 - smoothstep(0.0024 - wl, 0.0024 + wl, abs(q.x - xr))) * on * span * step(0.3, hsh(vec2(fi, seed + 1.0)));
    float shade = 0.75 + 0.25 * sin(q.y * 60.0 + fi);
    col = mix(col, cc * shade * 1.7, max(cl, cr));
  }
  // row B: blue light strips inside the racks, along the hinge edge
  if (mod(A.w, 2.0) > 0.5) {
    float st = box(q, vec2(0.018, 0.12), vec2(0.026, 1.9));
    em += vec3(0.1, 0.35, 1.0) * st * 0.55;
    col += vec3(0.01, 0.03, 0.09) * smoothstep(0.12, 0.02, abs(q.x - 0.022));
  }
  return col;
}`).replace("#include <map_fragment>",`
vec2 dp = vDoor * vec2(${M.toFixed(3)}, ${G.toFixed(3)});
vec3 I = normalize(vWp - cameraPosition);
float cosA = abs(dot(I, vNz));
// the mesh: 3.5 mm holes on a 5 mm hex pitch; under a pixel it turns to its average, at a grazing view the sheet's
// thickness closes the holes
vec2 g = dp / vec2(0.005, 0.00433);
vec2 r = vec2(g.x + mod(floor(g.y), 2.0) * 0.5, g.y);
float d = length(fract(r) - 0.5);
float fw = length(fwidth(g));
float hole = smoothstep(0.37 + fw * 0.7, 0.37 - fw * 0.7, d);
hole = mix(hole, 0.5, smoothstep(0.22, 0.6, fw));
hole *= smoothstep(0.06, 0.55, cosA);
// the door's frame: a solid border, a wider band at top and bottom
float inMesh = step(0.028, dp.x) * step(dp.x, ${(M-.028).toFixed(3)}) * step(0.07, dp.y) * step(dp.y, ${(G-.075).toFixed(3)});
hole *= inMesh;
float doorKind = floor(vDA.w / 2.0 + 0.01);
float glassDoor = step(1.5, doorKind);
if (doorKind > 0.5 && doorKind < 1.5) hole = inMesh * 0.92;   // an open rack: no door in the way
if (glassDoor > 0.5) hole = inMesh * 0.82;                      // a smoked glass door
// behind, 5 cm in (parallax)
vec2 off = vec2(dot(I, vTx), I.y) / max(cosA, 0.25) * 0.05;
vec3 em0 = vec3(0.0);
gBW = max(fwidth(dp), vec2(1e-5)) * 0.7;
vec3 bc = vec3(0.0);
if (hole > 0.001) bc = behind(dp + off, vDA, em0);   // nothing behind a closed sheet needs drawing (frames, grazing views)
float depthShade = (0.75 + 0.3 * smoothstep(0.2, 1.6, dp.y)) * (vDA.w > 1.5 ? 1.8 : 1.0);
float dv = hsh(vec2(vDA.z * 17.0, 3.3));
vec3 steel = vec3(0.012, 0.0125, 0.014) * (0.85 + 0.3 * dv);
diffuseColor.rgb = mix(steel, bc * depthShade, hole);
float hx = hsh(vec2(vDA.z * 31.0, 1.7)) < 0.4 ? 0.016 : ${(M-.016).toFixed(3)};
float handle = smoothstep(0.009, 0.006, abs(dp.x - hx)) * smoothstep(0.17, 0.16, abs(dp.y - 1.05));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.092, 0.1), handle);
float floorAO = smoothstep(0.0, 0.35, dp.y) * (0.85 + 0.15 * smoothstep(${G.toFixed(3)}, ${(G-.3).toFixed(3)}, dp.y));
diffuseColor.rgb *= floorAO;
vec3 gEm = em0 * hole * 1.6;
`).replace("#include <roughnessmap_fragment>","float roughnessFactor = mix(mix(0.3 + 0.14 * hsh(vec2(vDA.z * 17.0, 5.1)), 0.95, hole), 0.3, glassDoor * inMesh) - handle * 0.25;").replace("#include <metalnessmap_fragment>","float metalnessFactor = handle * 0.6;").replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>
totalEmissiveRadiance += gEm;`).replace("#include <aomap_fragment>",`#include <aomap_fragment>
float solidPart = mix(1.0, 0.5, inMesh * (1.0 - glassDoor) * step(doorKind, 0.5));
reflectedLight.indirectSpecular *= solidPart; reflectedLight.directSpecular *= solidPart;`)},pe.customProgramCacheKey=()=>"machine-hall-door-2";const Ye=new e.InstancedMesh(Qe,pe,y*v),xe=[],ue=[];for(let t=0;t<y;t++)for(let o=0;o<v;o++){const n=t===0?-1:1,i=W-(o+.5)*Y,r=t*v+o,l=ve[r];Ne.setMatrixAt(r,P.compose(A.set(n*(j+he/2+.012),I*l/2,i),B.identity(),He.set(1,l,1))),B.setFromAxisAngle(A.set(0,1,0),n<0?Math.PI/2:-Math.PI/2);const d=new e.Matrix4().compose(A.set(n*(j+.006),(.03+G/2)*l,i),B.clone(),He.set(1,l,1));Ye.setMatrixAt(r,d),xe.push(d),Xe.setXYZW(r,t,o,zt(),(t===1?1:0)+je[r]*2),ue.push({row:t,rack:o,p:[n*(j+he/2),I/2,i],units:C,label:String.fromCharCode(65+t)+String(o+1).padStart(2,"0")})}a.add(Ne,Ye);const D=12,Ze=Math.ceil(y*v/D),J=128,ee=48,$=document.createElement("canvas");$.width=D*J,$.height=Ze*ee;const k=$.getContext("2d");k.fillStyle="#1a1a1a",k.fillRect(0,0,$.width,$.height);for(let t=0;t<y*v;t++){const o=t%D*J,n=Math.floor(t/D)*ee;k.fillStyle="#EDEDEA",k.fillRect(o+4,n+4,J-8,ee-8),k.fillStyle="#151515",k.font='600 30px "Helvetica Neue", Arial, sans-serif',k.textAlign="center",k.textBaseline="middle",k.fillText(ue[t].label,o+J/2,n+ee/2+1)}const te=new e.CanvasTexture($);te.colorSpace=e.SRGBColorSpace,te.anisotropy=4;const Je=new e.PlaneGeometry(.085,.032),et=new e.InstancedBufferAttribute(new Float32Array(y*v*2),2);Je.setAttribute("aCell",et);const ge=new e.MeshStandardMaterial({map:te,roughness:.6,metalness:0});ge.onBeforeCompile=t=>{t.vertexShader=t.vertexShader.replace("#include <common>",`#include <common>
attribute vec2 aCell;`).replace("#include <uv_vertex>",`#include <uv_vertex>
vMapUv = vec2((uv.x + aCell.x) / ${D.toFixed(1)}, 1.0 - (1.0 - uv.y + aCell.y) / ${Ze.toFixed(1)});`)},ge.customProgramCacheKey=()=>"machine-hall-label";const tt=new e.InstancedMesh(Je,ge,y*v);for(let t=0;t<y*v;t++){const o=xe[t].clone().multiply(new e.Matrix4().makeTranslation(0,G/2-.036,.004));tt.setMatrixAt(t,o),et.setXY(t,t%D,Math.floor(t/D))}a.add(tt),Z.push(te);const _=y*v*C*Pt,ot=new e.PlaneGeometry(2,2),H=new e.InstancedBufferAttribute(new Float32Array(_*4),4);ot.setAttribute("aLed",H);const N={uCols:{value:[c("#46FF86"),c("#FFA43A"),c("#4EA6FF")]},fogColor:{value:a.fog.color},fogDensity:{value:a.fog.density},uRes:{value:new e.Vector2(1280,720)},uGain:{value:1}},Rt=new e.ShaderMaterial({uniforms:N,transparent:!0,depthWrite:!1,blending:e.AdditiveBlending,vertexShader:`attribute vec4 aLed; uniform vec2 uRes; varying vec4 vL; varying vec2 vQ; varying float vCore; varying float vFog; varying float vFace;
      void main() {
        vL = aLed;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xyz -= normalize(mv.xyz) * 0.01;
        vec3 nrm = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0));
        vFace = abs(dot(nrm, normalize(mv.xyz)));
        vec4 clip = projectionMatrix * mv;
        float pxm = projectionMatrix[1][1] * uRes.y * 0.5 / max(-mv.z, 0.02);   // px per metre at this depth
        vCore = 0.0028 * pxm;                                                     // the lit dome, radius in px
        float rpx = max(vCore * 5.0, 4.5);
        vQ = position.xy * rpx;
        clip.xy += position.xy * rpx * 2.0 / uRes * clip.w;
        vFog = length(mv.xyz);
        gl_Position = clip;
      }`,fragmentShader:`uniform vec3 uCols[3]; uniform float fogDensity; uniform float uGain; varying vec4 vL; varying vec2 vQ; varying float vCore; varying float vFog; varying float vFace;
      void main() {
        float r = length(vQ);
        float sig = max(vCore * 0.75, 0.6);
        float core = exp(-r * r / (2.0 * sig * sig));
        float halo = exp(-r / max(vCore * 1.6, 1.3)) * 0.09;
        float energy = clamp(vCore / 1.1, 0.3, 1.0) * mix(0.35, 1.0, smoothstep(0.05, 0.5, vFace));
        vec3 c = uCols[int(vL.y + 0.5)] * (vL.x * 9.0 * uGain) * (core + halo) * energy;
        float f = exp(-fogDensity * fogDensity * vFog * vFog);
        gl_FragColor = vec4(c * f, 1.0);
      }`}),Me=new e.InstancedMesh(ot,Rt,_),Q=[],qt=fe(11);for(let t=0;t<y;t++)for(let o=0;o<v;o++)for(let n=0;n<C;n++)for(let i=0;i<Pt;i++){const r=Q.length,l=xe[t*v+o],d=Ke[t*v+o],h=d<.55?.072:d<.85?M-.095:.2,p=d*7%1<.35,g=[.03,.06,.078][Math.floor(d*13%1*3)],E=-M/2+h+(p?0:i*.011),de=.03+Tt-Oe[t*v+o]*.04445+n*Le+g+(p?i*.012:0)-(.03+G/2);Me.setMatrixAt(r,l.clone().multiply(new e.Matrix4().makeTranslation(E,de,.003)));const V=qt(),ze=i===1?t===1&&V<.35?2:0:V<.012?1:n===C-1?2:0;H.setXYZW(r,0,ze,V,0),Q.push([t,o,n,i])}Me.frustumCulled=!1,a.add(Me);const U=new e.WebGLRenderTarget(16,16,{type:e.HalfFloatType,generateMipmaps:!0,minFilter:e.LinearMipmapLinearFilter,magFilter:e.LinearFilter}),we=new e.MeshStandardMaterial({color:c("#6E737A"),roughness:.55,metalness:0,envMap:x,envMapIntensity:.15}),ye={uMirror:{value:U.texture},uMirrorVP:{value:new e.Matrix4},uMirrorAmt:{value:1},uMirrorTexel:{value:new e.Vector2(1/640,1/360)}};we.onBeforeCompile=t=>{Object.assign(t.uniforms,ye),t.vertexShader=t.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vW;`).replace("#include <worldpos_vertex>",`#include <worldpos_vertex>
vW = (modelMatrix * vec4(transformed, 1.0)).xyz;`),t.fragmentShader=t.fragmentShader.replace("#include <common>",`#include <common>
varying vec3 vW; uniform sampler2D uMirror; uniform mat4 uMirrorVP; uniform float uMirrorAmt; uniform vec2 uMirrorTexel;
float gSeam, gPerf, gScuff; vec2 gTile;
float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y); }`).replace("#include <map_fragment>",`
vec2 t = vec2(vW.x + 0.3, vW.z + 0.3) / 0.6; gTile = floor(t); vec2 ft = abs(fract(t) - 0.5);
float sw = length(fwidth(t));
float hw = sw * 24.0;
gSeam = smoothstep(0.494 - sw, 0.497 + sw * 0.5, max(ft.x, ft.y));
// perforated tiles: the middle column of the aisle (three in four), 12 mm holes on a 25 mm grid
gPerf = 0.0;
if (gTile.x == 0.0 && abs(vW.z) < 28.0 && mod(gTile.y, 4.0) != 3.0) {
  vec2 lp = fract(t) * 0.6;
  vec2 hg = lp / 0.025; float hd = length(fract(hg) - 0.5);
  float ho = smoothstep(0.26 + hw * 0.7, 0.26 - hw * 0.7, hd);
  ho = mix(ho, 0.2, smoothstep(0.2, 0.6, hw));
  float edge = step(0.03, lp.x) * step(lp.x, 0.57) * step(0.03, lp.y) * step(lp.y, 0.57);
  gPerf = ho * edge;
}
float tileVar = hsh(gTile) * 0.05 - step(0.93, hsh(gTile + 11.0)) * 0.1;   // the odd replaced tile
// scuffs: faint cart tracks along the aisle and soft patches
gScuff = smoothstep(0.55, 0.85, vn(vec2(vW.x * 26.0, vW.z * 0.7))) * 0.6 + smoothstep(0.6, 0.9, vn(vW.xz * 2.3)) * 0.4;
diffuseColor.rgb *= (0.94 + tileVar - 0.05 * gScuff) * (1.0 - gSeam * 0.8);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012), gPerf * 0.85);
// contact darkening where the racks stand on the floor
float ao = mix(0.45, 1.0, smoothstep(0.0, 0.4, ${j.toFixed(2)} - abs(vW.x)));
diffuseColor.rgb *= ao;
`).replace("#include <roughnessmap_fragment>","float roughnessFactor = roughness + 0.12 * gScuff + gSeam * 0.3 + gPerf * 0.3;").replace("#include <opaque_fragment>",`
{
  // the reflection: the mirrored render, streaked along the view (as a polished floor does), each tile tilted a hair
  vec2 tilt = (vec2(hsh(gTile + 3.1), hsh(gTile + 7.7)) - 0.5) * 0.0035;
  vec4 mc = uMirrorVP * vec4(vW, 1.0); vec2 muv = mc.xy / mc.w * 0.5 + 0.5 + tilt;
  float blurK = 1.0 + 1.5 * gScuff;
  vec3 refl = vec3(0.0); float ws = 0.0;
  for (int i = -4; i <= 4; i++) {
    float fi = float(i);
    float w = exp(-fi * fi / 8.0);
    vec2 o = vec2(fi * 0.15, fi) * uMirrorTexel * 0.8 * blurK;
    refl += textureLod(uMirror, muv + o, 0.35 + gScuff).rgb * w; ws += w;
  }
  refl /= ws;
  // the polish is not perfect: a wide soft glow of the bright things (light lines, the warm door) round their sharp reflection
  vec3 wide = textureLod(uMirror, muv + vec2(0.0, -3.0) * uMirrorTexel, 3.6).rgb * 0.5 + textureLod(uMirror, muv + vec2(0.0, 3.0) * uMirrorTexel, 3.6).rgb * 0.5;
  refl = refl * 0.86 + wide * 0.18;
  vec3 V2 = normalize(cameraPosition - vW);
  float fres = 0.05 + 0.95 * pow(1.0 - max(V2.y, 0.0), 5.0);
  float amt = mix(0.36, 1.0, fres) * (1.0 - gSeam * 0.85) * (1.0 - gPerf * 0.7) * (1.0 - 0.35 * gScuff);
  outgoingLight += refl * uMirrorAmt * amt * mix(0.8, 1.0, ao);   // contact darkening is for the diffuse light, the mirror keeps the rack bases
}
#include <opaque_fragment>`)},we.customProgramCacheKey=()=>"machine-hall-floor-2";const oe=new e.Mesh(new e.PlaneGeometry(16,48),we);oe.rotation.x=-Math.PI/2,oe.position.set(0,0,-15),oe.layers.set(_e),a.add(oe);const Et=new e.MeshStandardMaterial({color:c("#141518"),emissive:c("#0B0C0D"),roughness:.5,metalness:.3,envMap:x,envMapIntensity:.4});for(const t of[-3.7,3.7,-6,6]){const o=new e.Mesh(new e.BoxGeometry(1.07,I,27.6),Et);o.position.set(t,I/2,W-13.8),a.add(o)}const Vt=new e.MeshStandardMaterial({color:c("#4C4F54"),emissive:c("#33363A"),roughness:.92,envMap:x,envMapIntensity:.2,side:e.DoubleSide}),be=new e.Mesh(new e.PlaneGeometry(16,48),Vt);be.rotation.x=Math.PI/2,be.position.set(0,S,-15),a.add(be);const $t=new e.MeshStandardMaterial({side:e.DoubleSide,color:c("#3C3F44"),emissive:c("#2A2C30"),roughness:.9,envMap:x,envMapIntensity:.2});for(const t of[-1,1]){const o=new e.Mesh(new e.PlaneGeometry(48,S),$t);o.position.set(t*7.5,S/2,-15),o.rotation.y=-t*Math.PI/2,a.add(o)}const nt=new e.MeshStandardMaterial({color:c("#9A9EA4"),roughness:.35,metalness:.8,envMap:x,envMapIntensity:.6}),at=new e.MeshBasicMaterial({color:new e.Color(4.2,4.4,4.7)}),L=new e.MeshBasicMaterial({color:new e.Color(3,3.15,3.4)}),_t=new e.BoxGeometry(.07,.05,1.18),st=new e.PlaneGeometry(.05,1.16),Se=[[0,3.05,at],[-1.5,3.2,L],[1.5,3.2,L],[-2.6,3.25,L],[2.6,3.25,L],[-4.85,3.3,L],[4.85,3.3,L]],R=24,rt=new e.InstancedMesh(_t,nt,Se.length*R),Ae=new e.InstancedMesh(st,at,R),ne=new e.InstancedMesh(st,L,(Se.length-1)*R);let Ht=0,Ut=0;const Ot=new e.Quaternion().setFromAxisAngle(new e.Vector3(1,0,0),Math.PI/2);Se.forEach(([t,o,n],i)=>{for(let r=0;r<R;r++){const l=-.6-r*1.2;rt.setMatrixAt(Ht++,P.compose(A.set(t,o+.025,l),B.identity(),z));const d=P.compose(A.set(t,o-.001,l),Ot,z);i===0?Ae.setMatrixAt(r,d):ne.setMatrixAt(Ut++,d)}});const it=new e.Color,ae=fe(41);for(let t=0;t<R;t++){const o=.9+.1*ae(),n=ae()*.04;Ae.setColorAt(t,it.setRGB(o*(1+n),o,o*(1-n)))}for(let t=0;t<ne.count;t++){const o=.85+.15*ae(),n=ae()*.04;ne.setColorAt(t,it.setRGB(o*(1+n),o,o*(1-n)))}a.add(rt,Ae,ne);const jt=new e.MeshStandardMaterial({color:c("#5E6268"),roughness:.55,metalness:.6,envMap:x,envMapIntensity:.4}),ct=new e.InstancedMesh(new e.BoxGeometry(15,.045,.042),jt,25);for(let t=0;t<25;t++)ct.setMatrixAt(t,P.compose(A.set(0,S-.12,.6-t*1.2),B.identity(),z));a.add(ct);const lt=new e.InstancedMesh(new e.BoxGeometry(15,.3,.16),new e.MeshStandardMaterial({color:c("#46494E"),roughness:.8,emissive:c("#1C1E21"),envMap:x,envMapIntensity:.2}),6);for(let t=0;t<6;t++)lt.setMatrixAt(t,P.compose(A.set(0,S-.15,-3-t*6),B.identity(),z));a.add(lt);const Kt=new e.MeshStandardMaterial({color:c("#55585D"),roughness:.5,metalness:.7}),dt=new e.InstancedMesh(new e.CylinderGeometry(.004,.004,S-3.08,5),Kt,R);for(let t=0;t<R;t++)dt.setMatrixAt(t,P.compose(A.set(0,(S+3.08)/2,-.6-t*1.2-.5),B.identity(),z));a.add(dt);const ft=new e.MeshStandardMaterial({color:c("#8C9096"),roughness:.4,metalness:.85,envMap:x,envMapIntensity:.7}),ht=new e.MeshStandardMaterial({color:c("#1B2433"),roughness:.7}),Nt=new e.MeshStandardMaterial({color:c("#2357B8"),roughness:.6});for(const t of[-1,1]){const o=t*1.5,n=2.55,i=29,r=W-14;for(const p of[-.2,.2]){const g=new e.Mesh(new e.BoxGeometry(.008,.09,i),ft);g.position.set(o+p,n+.045,r),a.add(g)}const l=new e.Mesh(new e.BoxGeometry(.4,.006,i),ft);l.position.set(o,n,r),a.add(l);const d=new e.Mesh(new e.CylinderGeometry(.045,.045,i,10),t<0?Nt:ht);d.rotation.x=Math.PI/2,d.position.set(o-.08,n+.04,r),a.add(d);const h=new e.Mesh(new e.CylinderGeometry(.04,.04,i,10),ht);h.rotation.x=Math.PI/2,h.position.set(o+.07,n+.038,r),a.add(h)}const Ce=new e.MeshStandardMaterial({color:c("#F5C800"),emissive:c("#2E2400"),roughness:.42,metalness:0,envMap:x,envMapIntensity:.5});for(const t of[-1,1]){const o=t*1.12,n=2.78,i=29,r=W-14,l=new e.Mesh(new e.BoxGeometry(.24,.012,i),Ce);l.position.set(o,n,r),a.add(l);for(const h of[-.12,.12]){const p=new e.Mesh(new e.BoxGeometry(.012,.1,i),Ce);p.position.set(o+h,n+.05,r),a.add(p)}const d=new e.InstancedMesh(new e.CylinderGeometry(.016,.016,n-I,8),Ce,7);for(let h=0;h<7;h++)d.setMatrixAt(h,P.compose(A.set(o+t*.09,(n+I)/2,W-(3+h*6+(t>0?2:0)+.5)*Y),B.identity(),z));a.add(d)}const Qt=new e.MeshStandardMaterial({color:c("#8E2A22"),roughness:.45,metalness:.2,envMap:x,envMapIntensity:.4}),Fe=new e.Mesh(new e.CylinderGeometry(.026,.026,29,10),Qt);Fe.rotation.x=Math.PI/2,Fe.position.set(.55,3.42,W-14),a.add(Fe);const vt=new e.InstancedMesh(new e.CylinderGeometry(.012,.02,.09,8),new e.MeshStandardMaterial({color:c("#B8913A"),roughness:.35,metalness:.9}),9);for(let t=0;t<9;t++)vt.setMatrixAt(t,P.compose(A.set(.55,3.35,W-1.5-t*3.1),B.identity(),z));a.add(vt);const Be=new e.MeshStandardMaterial({color:c("#8A8C8E"),roughness:.88,envMap:x,envMapIntensity:.2}),m=1.6,w=2.15,se=new e.Mesh(new e.PlaneGeometry(7.5-m/2,S),Be);se.position.set(-(7.5+m/2)/2,S/2,f),a.add(se);const mt=se.clone();mt.position.x=-se.position.x,a.add(mt);const pt=new e.Mesh(new e.PlaneGeometry(m,S-w),Be);pt.position.set(0,(S+w)/2,f),a.add(pt);const T=new e.MeshStandardMaterial({color:c("#2B2D30"),roughness:.4,metalness:.7,envMap:x,envMapIntensity:.6}),u=(t,o,n,i,r,l,d)=>{const h=new e.Mesh(new e.BoxGeometry(t,o,n),d);return h.position.set(i,r,l),a.add(h),h};u(.06,w,.12,-m/2,w/2,f,T),u(.06,w,.12,m/2,w/2,f,T),u(m+.06,.06,.12,0,w,f,T);for(const t of[-1,1]){const o=t*m/4;u(m/2-.04,.16,.04,o,.11,f-.02,T),u(m/2-.04,.14,.04,o,w-.1,f-.02,T),u(.1,w-.06,.04,o-t*(m/4-.07),w/2,f-.02,T),u(.06,w-.06,.04,o+t*(m/4-.05),w/2,f-.02,T),u(m/2-.2,.035,.05,o,1,f+.03,nt)}const Xt=new e.MeshStandardMaterial({color:c("#B8C4C4"),roughness:.04,metalness:0,transparent:!0,opacity:.07,envMap:x,envMapIntensity:.45,depthWrite:!1}),xt=new e.Mesh(new e.PlaneGeometry(m-.1,w-.2),Xt);xt.position.set(0,w/2,f-.02),a.add(xt);const ut=new e.MeshStandardMaterial({color:c("#3A3C3F"),roughness:.6});u(7.5-m/2-.03,.1,.02,-(7.5+m/2)/2,.05,f+.01,ut),u(7.5-m/2-.03,.1,.02,(7.5+m/2)/2,.05,f+.01,ut),u(.08,.12,.025,m/2+.2,1.2,f+.012,new e.MeshStandardMaterial({color:c("#202224"),roughness:.4}));const gt=new e.Mesh(new e.PlaneGeometry(.008,.008),new e.MeshBasicMaterial({color:new e.Color(.4,2.2,.8)}));gt.position.set(m/2+.2,1.24,f+.026),a.add(gt);const Yt=new e.MeshStandardMaterial({color:c("#B0231B"),roughness:.35,metalness:.1,envMap:x,envMapIntensity:.6}),Mt=new e.Mesh(new e.CylinderGeometry(.075,.075,.48,16),Yt);Mt.position.set(-1.35,.62,f+.1),a.add(Mt);const wt=new e.Mesh(new e.CylinderGeometry(.03,.05,.08,12),new e.MeshStandardMaterial({color:c("#1E1F21"),roughness:.5}));wt.position.set(-1.35,.9,f+.1),a.add(wt),u(.06,.2,.06,-1.35,.7,f+.03,T);const ke=new e.MeshStandardMaterial({color:c("#D8C3A2"),emissive:c("#7A5A38"),roughness:.9}),Zt=new e.MeshStandardMaterial({color:c("#8E7458"),emissive:c("#4A3522"),roughness:.55}),yt=new e.Mesh(new e.PlaneGeometry(5,3),ke);yt.position.set(0,1.5,f-4.2),a.add(yt);for(const t of[-1,1]){const o=new e.Mesh(new e.PlaneGeometry(4.3,3),ke);o.position.set(t*2.5,1.5,f-2.1),o.rotation.y=-t*Math.PI/2,a.add(o)}const Pe=new e.Mesh(new e.PlaneGeometry(5,4.3),Zt);Pe.rotation.x=-Math.PI/2,Pe.position.set(0,.001,f-2.1),a.add(Pe);const Te=new e.Mesh(new e.PlaneGeometry(5,4.3),ke);Te.rotation.x=Math.PI/2,Te.position.set(0,2.9,f-2.1),a.add(Te);const Ie=new e.Mesh(new e.PlaneGeometry(1.2,1.2),new e.MeshBasicMaterial({color:new e.Color(5,3.6,2.2)}));Ie.rotation.x=Math.PI/2,Ie.position.set(.3,2.89,f-2.4),a.add(Ie);const We=new e.MeshStandardMaterial({color:c("#6B4A2E"),roughness:.6});u(1.4,.04,.7,.9,.74,f-3.2,We),u(.04,.72,.6,.25,.37,f-3.2,We),u(.04,.72,.6,1.55,.37,f-3.2,We);const re=document.createElement("canvas");re.width=320,re.height=128;const s=re.getContext("2d");s.fillStyle="#0A9A4E",s.fillRect(0,0,320,128),s.strokeStyle="#F4FFF6",s.fillStyle="#F4FFF6",s.lineCap="round",s.lineJoin="round",s.lineWidth=7,s.strokeRect(196,22,70,86),s.fillRect(266,22,22,86),s.beginPath(),s.arc(150,30,11,0,Math.PI*2),s.fill(),s.lineWidth=15,s.beginPath(),s.moveTo(146,46),s.lineTo(134,76),s.stroke(),s.beginPath(),s.moveTo(146,50),s.lineTo(170,60),s.lineTo(184,50),s.stroke(),s.beginPath(),s.moveTo(144,52),s.lineTo(124,58),s.lineTo(112,72),s.stroke(),s.beginPath(),s.moveTo(134,76),s.lineTo(158,88),s.lineTo(166,110),s.stroke(),s.beginPath(),s.moveTo(134,76),s.lineTo(118,98),s.lineTo(96,100),s.stroke(),s.lineWidth=10,s.beginPath(),s.moveTo(28,64),s.lineTo(80,64),s.stroke(),s.beginPath(),s.moveTo(62,44),s.lineTo(84,64),s.lineTo(62,84),s.stroke();const ie=new e.CanvasTexture(re);ie.colorSpace=e.SRGBColorSpace,ie.anisotropy=4,Z.push(ie),u(.42,.17,.05,0,2.42,f+.03,new e.MeshStandardMaterial({color:c("#D9DBDD"),roughness:.5}));const bt=new e.Mesh(new e.PlaneGeometry(.38,.152),new e.MeshBasicMaterial({map:ie,color:new e.Color(2.4,2.4,2.4)}));bt.position.set(0,2.42,f+.056),a.add(bt);const Ge=new e.Mesh(new e.PlaneGeometry(16,S),Be);Ge.position.set(0,S/2,4),Ge.rotation.y=Math.PI,a.add(Ge);const b=new e.PerspectiveCamera,Jt=new e.Matrix4().makeScale(1,-1,1),St=(t,o)=>{const n=new Set;t.traverse(i=>{const r=i.material;!r||Array.isArray(r)||n.has(r)||r.side===e.DoubleSide||(n.add(r),o.push([r,r.side]),r.side=r.side===e.FrontSide?e.BackSide:e.FrontSide)})},At=Re==="low"?.5:1;function e0(t,o,n){const i=Re==="low"?4:2,r=Math.max(16,Math.round(n.bw/i)),l=Math.max(16,Math.round(n.bh/i));(U.width!==r||U.height!==l)&&U.setSize(r,l),ye.uMirrorTexel.value.set(1/r,1/l),b.copy(o),b.matrixWorld.premultiply(Jt),b.matrixWorldInverse.copy(b.matrixWorld).invert(),b.matrixAutoUpdate=!1,b.matrixWorldAutoUpdate=!1,b.projectionMatrix.copy(o.projectionMatrix),b.projectionMatrixInverse.copy(o.projectionMatrixInverse),b.layers.set(0),ye.uMirrorVP.value.multiplyMatrices(b.projectionMatrix,b.matrixWorldInverse);const d=t.autoClear,h=t.toneMapping;t.toneMapping=e.NoToneMapping,t.setRenderTarget(U),t.setClearColor(790032,1),t.clear(!0,!0,!0),N.uRes.value.set(r,l),N.uGain.value=2.2;const p=[];if(St(a,p),t.autoClear=!1,t.render(a,b),F.scene){const g=[];St(F.scene,g);const E=F.scene.background;F.scene.background=null,t.render(F.scene,b),F.scene.background=E;for(const[de,V]of g)de.side=V}for(const[g,E]of p)g.side=E;t.setRenderTarget(null),t.autoClear=d,t.toneMapping=h,N.uRes.value.set(Math.round(n.bw*At),Math.round(n.bh*At)),N.uGain.value=1,o.layers.enable(_e)}let q=null;function ce(t){for(let o=0;o<_;o++){let n;if(q)n=q[o];else{const[i,r,l,d]=Q[o],h=H.array[o*4+1]===1;if(Ue[(i*v+r)*C+l]===0)n=0;else if(h)n=.45;else if(d===1)n=.22+.12*H.array[o*4+2];else{const p=((t/6-r*.045-i*.5-l*.004)%1+1)%1;n=l===3?Math.exp(-Math.pow((p-.5)/.035,2))*.9:.05}}H.array[o*4]=n}H.needsUpdate=!0}ce(0);const X=l0([[.34,.25,-2.6],[.34,.25,-5],[.54,.27,-7.6],[.16,.3,-10.4],[-.32,.3,-13.2],[-.47,.28,-16.4],[-.24,.26,-20.2],[-.4,.25,-24]],{lag:2,height:.28,side:0,lead:.6,fov:50,bank:6,maxBank:.72,camBank:.25,drop:.12}),Ct=50,t0=16/9,Ft=Math.tan(Ct/2*Math.PI/180),o0=Ft*t0,n0=(t,o,n)=>{const i=Math.max(0,Math.min(1,(n-t)/(o-t)));return i*i*(3-2*i)},Bt=new e.Quaternion,O=new e.Vector3;function a0(t){const o=X.flight(t),n=o.s,i=X.at(n-.25),r=-.52+1.04*n0(.3,.74,t),l=new e.Vector3(r,i.y+1.05,i.z+2.45),d=new e.Vector3().fromArray(o.hero.p),h=X.at(n-.9),p=new e.Vector3(d.x*.45+h.x*.55,d.y,d.z);O.subVectors(p,l);const g=Math.atan2(O.x,-O.z),E=Math.atan2(O.y,Math.hypot(O.x,O.z)),V=.34*Math.max(-1,Math.min(1,(p.x-l.x)/.55)),ze=-.26,kt=g-Math.atan(V*o0),De=E-Math.atan(ze*Ft),c0=new e.Vector3(Math.sin(kt)*Math.cos(De),Math.sin(De),-Math.cos(kt)*Math.cos(De));return d0(c0,-X.flight(Math.max(0,t-.03)).bank*.18,Bt),{hero:o.hero,camera:{p:l.toArray(),q:Bt.toArray(),fov:Ct},s:n,bank:o.bank}}const s0={entry:[0,1.3,-.6],aisle:[0,1.35,-11],far:[0,1.3,-26],warm:[.4,2.3,-31.2],door:[0,1.075,f],exit:[0,2.42,f+.06]},r0={dir:[.04,1,-.42],color:[.92,.96,1],ambient:[.3,.33,.38],bounce:["#7C8188",.08],haze:["#353B42",.02],sunOpts:{key:.84,rim:.65,hue:.3,shade:.6}},i0=new Float32Array(16),le={scene:a,anchors:s0,light:r0,racks:ue,lightIndex:Q,hooks:["racks","lightIndex","setLights"],ready:Promise.resolve(),groundMeta:{origin:[-7,-40],size:[14,44],res:[4,4]},heights:i0,heightAt:(t,o)=>{if(Math.abs(t)<=j||Math.abs(t)>j+he)return 0;const n=Math.floor((W-o)/Y);return n>=0&&n<v?I*ve[(t<0?0:1)*v+n]:0},flight:a0,path:X,lens:{focus:2,aperture:0,maxCoc:8,exposure:1.22,veil:.07,vignette:.28,sat:1.04,lift:.01,tint:[.97,1,1.04],clear:790032},focusFor(t,o=1){return{focus:Math.max(.1,t),aperture:.5*o,maxCoc:3}},time:0,setTime(t){le.time=t,q||ce(t)},setLights(t){if(!t){q=null,ce(le.time);return}if(typeof t=="function"){q=new Float32Array(_);for(let o=0;o<_;o++){const[n,i,r,l]=Q[o];q[o]=Math.max(0,Math.min(1,Number(t(n,i,r,l))||0))}}else q=Float32Array.from(t);ce(le.time)},beforeDraw:e0,stats(){return{lights:_,meshes:a.children.length,mirror:!0}},dispose(){a.traverse(t=>{t.geometry&&t.geometry.dispose(),t.material&&t.material.dispose(),t.dispose&&t.isInstancedMesh&&t.dispose()});for(const t of Z)t.dispose();U.dispose(),qe.dispose()}};return le}export{p0 as createHall};
