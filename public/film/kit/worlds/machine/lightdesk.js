import*as e from"three";import{RectAreaLightUniformsLib as Xt}from"three/addons/lights/RectAreaLightUniformsLib.js";import{rng as ie,makeFlight as Jt}from"./rig.js";import{studioEnvironment as eo}from"./post.js";const n={w:1.6,d:1,y:.806,rim:.065,rimUp:.007,corner:.055,glassCorner:.014},d={p:[.1,1.6,-.04],mouth:.16,half:.38},i={x0:-3.3,x1:3.3,z0:-1.08,z1:3.6,h:2.75},a={x0:-1.45,x1:.25,y0:.98,y1:2.3,z:i.z0},$=4,ve=`
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y);
  float b = mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y);
  return mix(a, b, f.z);
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;function fe(u,f){const b=document.createElement("canvas");return b.width=u,b.height=f,b}function to(u,f,b=7){const C=fe(u,f),c=C.getContext("2d"),r=ie(b);c.clearRect(0,0,u,f);const L=u/2048;for(let m=0;m<2600;m++){const A=r()*u,w=r()*f,x=(.6+Math.pow(r(),5)*3.2)*L;c.fillStyle=`rgba(40,32,26,${(.18+r()*.5).toFixed(3)})`,c.beginPath(),c.arc(A,w,x,0,6.283),c.fill()}c.lineCap="round";for(let m=0;m<26;m++){let A=r()*u,w=r()*f,x=r()*6.283;c.strokeStyle=`rgba(52,44,38,${(.16+r()*.25).toFixed(3)})`,c.lineWidth=(.5+r()*.6)*L,c.beginPath(),c.moveTo(A,w);const T=5+Math.floor(r()*6);for(let W=0;W<T;W++)x+=(r()-.5)*.9,A+=Math.cos(x)*4*L,w+=Math.sin(x)*4*L,c.lineTo(A,w);c.stroke()}for(const[m,A,w,x]of[[.63,.7,2.6,.13],[.24,.31,.5,.09]]){let T=m*u,W=A*f,P=w;c.strokeStyle="rgba(28,22,18,0.75)",c.lineWidth=1.5*L,c.beginPath(),c.moveTo(T,W);const I=60,Z=x*u/I;for(let j=0;j<I;j++)P+=Math.sin(j*.21+m*9)*.045+.012,T+=Math.cos(P)*Z,W+=Math.sin(P)*Z,c.lineTo(T,W);c.stroke()}const z=c.createRadialGradient(.78*u,.86*f,0,.78*u,.86*f,.05*u);return z.addColorStop(0,"rgba(60,50,40,0.05)"),z.addColorStop(1,"rgba(60,50,40,0)"),c.fillStyle=z,c.fillRect(0,0,u,f),C}function oo(u=1024,f=256,b=11){const C=fe(u,f),c=C.getContext("2d"),r=ie(b),L=c.createImageData(u,f),z=L.data,m=Array.from({length:6},()=>[r()*.02+.004,r()*6.28,r()*8+2]);for(let A=0;A<f;A++)for(let w=0;w<u;w++){let x=A/f*26;for(const[Z,j,he]of m)x+=Math.sin(w/u*he*6.283+j)*Z*40;const T=.5+.5*Math.sin(x*3.1),W=.5+.5*Math.sin(x*17+Math.sin(w*.05)*.6);let P=.62+.22*T+.08*W;r()<.012&&(P*=.55);const I=(A*u+w)*4;z[I]=74*P,z[I+1]=47*P,z[I+2]=31*P,z[I+3]=255}return c.putImageData(L,0,0),C}function ao(u=1024,f=1024,b=19){const C=fe(u,f),c=C.getContext("2d"),r=ie(b),L=12;for(let z=0;z<L;z++){const m=z/L*f,A=f/L;let w=-r()*u;for(;w<u;){const x=u*(.35+r()*.5),T=.75+r()*.3;c.fillStyle=`rgb(${Math.round(58*T)},${Math.round(40*T)},${Math.round(28*T)})`,c.fillRect(w,m,x,A);for(let W=0;W<14;W++)c.fillStyle=`rgba(20,12,8,${(.05+r()*.08).toFixed(3)})`,c.fillRect(w,m+r()*A,x,1+r()*2);c.fillStyle="rgba(10,6,4,0.8)",c.fillRect(w,m,2,A),w+=x}c.fillStyle="rgba(8,5,3,0.9)",c.fillRect(0,m,u,2)}return C}function xe(u,{srgb:f=!0,repeat:b=!1,aniso:C=8}={}){const c=new e.CanvasTexture(u);return c.colorSpace=f?e.SRGBColorSpace:e.NoColorSpace,c.anisotropy=C,b&&(c.wrapS=c.wrapT=e.RepeatWrapping),c.generateMipmaps=!0,c.minFilter=e.LinearMipmapLinearFilter,c}function wt(u,f,b,C,c,r){return u.moveTo(f+r,b),u.lineTo(C-r,b),u.quadraticCurveTo(C,b,C,b+r),u.lineTo(C,c-r),u.quadraticCurveTo(C,c,C-r,c),u.lineTo(f+r,c),u.quadraticCurveTo(f,c,f,c-r),u.lineTo(f,b+r),u.quadraticCurveTo(f,b,f+r,b),u}async function mo(u,f,{quality:b="high"}={}){const C=u.renderer,c=b==="low";Xt.init();const r=new e.Scene,L=[],z=t=>(L.push(t),t),m={bright:1,tint:new e.Color("#FFF4E6"),lampOn:1,lampAngle:0,warmth:1,time:0,columns:[]},A=()=>new e.Color().setRGB(1,.7+.12*(1-m.warmth),.42+.3*(1-m.warmth)),w=eo(C,[{p:[0,-3,0],size:[5,3.2],color:[3.2,3.05,2.8]},{p:[.6,1.2,-2.4],size:[.5,.5],color:[2,1.35,.75]},{p:[-1.5,1.2,-4],size:[3.6,2.6],color:[.05,.09,.2]},{p:[5,.6,-1],size:[3,2.4],color:[.5,.3,.16]}],{background:657415});z(w);const x=w.texture,T=new e.RectAreaLight(16774374,1.55,n.w,n.d);T.position.set(0,n.y+.002,0),T.lookAt(0,5,0),r.add(T);const W=new e.PointLight(16773344,0,3,2),P=new e.SpotLight(16763018,5.5,1.3,d.half+.08,.75,2);P.position.set(d.p[0],d.p[1]+.03,d.p[2]),P.target.position.set(d.p[0],0,d.p[2]),r.add(P,P.target,W);const I=new e.PointLight(16758904,.08,0,2);I.position.set(d.p[0],d.p[1]+.6,d.p[2]),r.add(I);const Z=new e.PointLight(16757882,.55,0,2);Z.position.set(2.95,.55,-.55),r.add(Z),r.add(new e.HemisphereLight(2764604,1182728,.06));const j=c?1024:2048,he=Math.round(j*n.d/n.w),bt=z(xe(to(j,he),{srgb:!1,aniso:8})),ee=fe(j,he),ye=ee.getContext("2d"),We=z(xe(ee,{srgb:!0,aniso:8})),se=z(new e.WebGLRenderTarget(16,16,{type:e.HalfFloatType,generateMipmaps:!0,minFilter:e.LinearMipmapLinearFilter,magFilter:e.LinearFilter})),k={uBright:{value:1},uTint:{value:new e.Color},uDust:{value:bt},uProj:{value:We},uProjOn:{value:0},uMirror:{value:se.texture},uMirrorOn:{value:0},uMirrorGain:{value:3},uRes:{value:new e.Vector2(1,1)},uLampP:{value:new e.Vector3},uLampAxis:{value:new e.Vector3(0,-1,0)},uLampCol:{value:new e.Color},uLampOn:{value:1},uCols:{value:Array.from({length:$},()=>new e.Vector4)},uColAmt:{value:new Array($).fill(0)},uT:{value:0}},Oe=new e.ShaderMaterial({uniforms:k,vertexShader:`
      varying vec2 vUv; varying vec3 vW;
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,fragmentShader:`
      uniform float uBright, uProjOn, uMirrorOn, uMirrorGain, uLampOn, uT; uniform vec3 uTint, uLampCol, uLampP, uLampAxis;
      uniform sampler2D uDust, uProj, uMirror; uniform vec2 uRes; uniform vec4 uCols[${$}]; uniform float uColAmt[${$}];
      varying vec2 vUv; varying vec3 vW;
      ${ve}
      void main() {
        // the diffuser: brighter in the middle, softly falling to the frame, a faint mottle of the opal
        vec2 q = (vUv - 0.5) * 2.0;
        vec2 qe = q * vec2(1.0, ${(n.d/n.w).toFixed(4)});
        float r2 = dot(qe, qe);
        float fall = 1.0 - 0.3 * r2 - 0.14 * r2 * r2;
        vec2 m = vec2(${(n.w/2).toFixed(4)}, ${(n.d/2).toFixed(4)}) - abs(vW.xz);
        float edge = min(m.x, m.y);
        fall *= mix(0.5, 1.0, smoothstep(0.0, 0.045, edge));             // darker within a few cm of the frame
        float mott = vn3(vec3(vW.xz * 9.0, 1.3)) * 0.6 + vn3(vec3(vW.xz * 31.0, 4.1)) * 0.4;
        fall *= 0.985 + 0.03 * mott;
        vec3 L = uTint * uBright * 1.9 * fall;
        // columns of light: their source shows as a brighter spot under them
        for (int i = 0; i < ${$}; i++) {
          if (uColAmt[i] <= 0.0) continue;
          vec2 dd = (vW.xz - uCols[i].xy) / max(uCols[i].z, 0.01);
          L += uTint * uBright * 1.6 * uColAmt[i] * exp(-dot(dd, dd) * 1.6);
        }
        // the lamp's pool adds a little warmth where it falls on the glass
        vec3 tl = vW - uLampP;
        float along = dot(tl, uLampAxis);
        float rad = length(tl - uLampAxis * along);
        float cone = 1.0 - smoothstep(0.6, 1.05, rad / (0.16 + along * ${Math.tan(d.half).toFixed(4)}));
        L += uLampCol * uLampOn * 0.22 * cone / max(along * along, 0.3);
        // the film lying on the glass (world.project): ink holds light back, coloured ink lets its colour through
        if (uProjOn > 0.5) { vec4 ink = texture2D(uProj, vUv); L *= mix(vec3(1.0), ink.rgb, ink.a); }
        // dust and hairs on the glass
        float dust = texture2D(uDust, vUv).a;
        L *= 1.0 - dust * 0.92;
        // the glass: emission seen through it falls at grazing angles; it mirrors the lamp and the players
        vec3 V = normalize(cameraPosition - vW);
        float F = 0.04 + 0.96 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
        L *= 1.0 - F;
        vec3 Rr = reflect(-V, vec3(0.0, 1.0, 0.0));
        float tt = (uLampP.y - vW.y) / max(Rr.y, 1e-3);
        vec3 hit = vW + Rr * tt;
        float dl = length(hit.xz - uLampP.xz);
        L += uLampCol * uLampOn * F * (smoothstep(0.17, 0.05, dl) * 30.0 + smoothstep(0.5, 0.0, dl) * 0.6);
        if (uMirrorOn > 0.5) {
          vec4 mr = texture2D(uMirror, gl_FragCoord.xy / uRes);
          L = mix(L, mr.rgb * uMirrorGain, mr.a * clamp(F * 2.2 + 0.05, 0.0, 0.6));
        }
        gl_FragColor = vec4(L, 1.0);
      }`});Oe.extensions={derivatives:!0};const ge=new e.Mesh(new e.PlaneGeometry(n.w,n.d),Oe);ge.rotation.x=-Math.PI/2,ge.position.y=n.y,r.add(ge);const Me=z(xe(oo(),{repeat:!0})),we=new e.MeshPhysicalMaterial({map:Me,roughness:.42,metalness:0,clearcoat:.35,clearcoatRoughness:.35,envMap:x,envMapIntensity:.55});we.onBeforeCompile=t=>{t.vertexShader=t.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vWp; varying vec3 vWn;`).replace("#include <worldpos_vertex>",`#include <worldpos_vertex>
vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal);`),t.fragmentShader=t.fragmentShader.replace("#include <common>",`#include <common>
varying vec3 vWp; varying vec3 vWn; uniform vec3 uDeskL;`).replace("#include <opaque_fragment>",`
vec2 hm = vec2(${(n.w/2).toFixed(4)}, ${(n.d/2).toFixed(4)});
vec2 cl = clamp(vWp.xz, -hm, hm);
vec3 toD = vec3(cl.x, ${n.y.toFixed(4)}, cl.y) - vWp;
float dist = length(toD);
vec3 Ld = toD / max(dist, 1e-4);
float facing = max(dot(normalize(vWn), Ld), 0.0);
float inside = step(abs(vWp.x), hm.x + 0.002) * step(abs(vWp.z), hm.y + 0.002);
float lit = facing * exp(-dist * 38.0) * (1.0 - inside * 0.0) * step(vWp.y, ${(n.y+n.rimUp+.003).toFixed(4)} + 0.02);
outgoingLight += diffuseColor.rgb * uDeskL * lit * 1.4 + uDeskL * lit * 0.05;
#include <opaque_fragment>`),t.uniforms.uDeskL=Ie};const Ie={value:new e.Color(2.6,2.5,2.3)};we.customProgramCacheKey=()=>"lightdesk-walnut";const le=n.w/2+n.rim,E=n.d/2+n.rim,Ve=wt(new e.Shape,-le,-E,le,E,n.corner);Ve.holes.push(wt(new e.Path,-n.w/2,-n.d/2,n.w/2,n.d/2,n.glassCorner));const $e=.05,be=new e.ExtrudeGeometry(Ve,{depth:$e-.012,bevelEnabled:!0,bevelThickness:.006,bevelSize:.006,bevelSegments:4,curveSegments:16});{const t=be.attributes.position,o=be.attributes.uv;for(let s=0;s<t.count;s++)o.setXY(s,t.getX(s)*.9+.13,t.getY(s)*2.2+t.getZ(s)*2.2)}const Ce=new e.Mesh(be,we);Ce.rotation.x=-Math.PI/2,Ce.position.y=n.y+n.rimUp-$e+.006,r.add(Ce);const Ue=new e.MeshStandardMaterial({map:Me,color:10128e3,roughness:.55,envMap:x,envMapIntensity:.3}),_e=new e.Mesh(new e.BoxGeometry(n.w+2*n.rim-.02,.11,n.d+2*n.rim-.02),Ue);_e.position.y=n.y-.045-.055,r.add(_e);const Ct=new e.BoxGeometry(.05,n.y-.15,.05);for(const t of[-1,1])for(const o of[-1,1]){const s=new e.Mesh(Ct,Ue);s.position.set(t*(le-.07),(n.y-.15)/2,o*(E-.07)),r.add(s)}const zt=new e.MeshStandardMaterial({color:new e.Color("#C8A15A"),metalness:1,roughness:.32,envMap:x,envMapIntensity:1.1}),je=new e.SphereGeometry(.0062,20,10,0,Math.PI*2,0,Math.PI/2);je.scale(1,.45,1);const At=new e.MeshBasicMaterial({color:1708554}),St=new e.BoxGeometry(.0105,.004,.0013),qe=n.y+n.rimUp+2e-4,Pt=[[-.52,E-n.rim/2,.4],[.52,E-n.rim/2,1.1],[-le+n.rim/2,0,2.2],[.52,-E+n.rim/2,.7],[-.52,-E+n.rim/2,2.6]];for(const[t,o,s]of Pt){const l=new e.Mesh(je,zt);l.position.set(t,qe,o),r.add(l);const p=new e.Mesh(St,At);p.position.set(t,qe+.0026,o),p.rotation.y=s,r.add(p)}const N=new e.MeshStandardMaterial({color:new e.Color("#8C7E70"),roughness:.95,envMap:x,envMapIntensity:.15});N.onBeforeCompile=t=>{t.vertexShader=t.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vWp;`).replace("#include <worldpos_vertex>",`#include <worldpos_vertex>
vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;`),t.fragmentShader=t.fragmentShader.replace("#include <common>",`#include <common>
varying vec3 vWp;
`+ve).replace("#include <map_fragment>","diffuseColor.rgb *= 0.92 + 0.12 * vn3(vWp * 7.0) + 0.05 * vn3(vWp * 41.0);")},N.customProgramCacheKey=()=>"lightdesk-plaster";const Ee=z(xe(ao(),{repeat:!0}));Ee.repeat.set(1.2,1.2);const ze=new e.Mesh(new e.PlaneGeometry(i.x1-i.x0,i.z1-i.z0),new e.MeshStandardMaterial({map:Ee,roughness:.5,envMap:x,envMapIntensity:.25}));ze.rotation.x=-Math.PI/2,ze.position.set((i.x0+i.x1)/2,0,(i.z0+i.z1)/2),r.add(ze);const Ne=new e.Shape().moveTo(i.x0,0).lineTo(i.x1,0).lineTo(i.x1,i.h).lineTo(i.x0,i.h).lineTo(i.x0,0);Ne.holes.push(new e.Path().moveTo(a.x0,a.y0).lineTo(a.x0,a.y1).lineTo(a.x1,a.y1).lineTo(a.x1,a.y0).lineTo(a.x0,a.y0));const Ye=new e.Mesh(new e.ShapeGeometry(Ne),N);Ye.position.z=i.z0,r.add(Ye);const Tt=N,_=.2,kt=[[a.x1-a.x0,.02,_,(a.x0+a.x1)/2,a.y1,i.z0-_/2],[.02,a.y1-a.y0,_,a.x0,(a.y0+a.y1)/2,i.z0-_/2],[.02,a.y1-a.y0,_,a.x1,(a.y0+a.y1)/2,i.z0-_/2]];for(const[t,o,s,l,p,y]of kt){const h=new e.Mesh(new e.BoxGeometry(t,o,s),Tt);h.position.set(l,p,y),r.add(h)}const Bt=new e.MeshStandardMaterial({color:new e.Color("#D8CDBD"),roughness:.6,envMap:x,envMapIntensity:.3}),Ke=new e.Mesh(new e.BoxGeometry(a.x1-a.x0+.12,.03,_+.06),Bt);Ke.position.set((a.x0+a.x1)/2,a.y0-.015,i.z0-_/2+.03),r.add(Ke);const Ze=new e.MeshStandardMaterial({color:new e.Color("#2A2622"),roughness:.6,envMap:x,envMapIntensity:.3}),He=i.z0-_+.04,Lt=[[a.x1-a.x0,.05,(a.x0+a.x1)/2,a.y0+.025],[a.x1-a.x0,.05,(a.x0+a.x1)/2,a.y1-.025],[.05,a.y1-a.y0,a.x0+.025,(a.y0+a.y1)/2],[.05,a.y1-a.y0,a.x1-.025,(a.y0+a.y1)/2],[.035,a.y1-a.y0,(a.x0+a.x1)/2,(a.y0+a.y1)/2],[a.x1-a.x0,.06,(a.x0+a.x1)/2,(a.y0+a.y1)/2+.05],[.018,a.y1-a.y0,a.x0+(a.x1-a.x0)*.25,(a.y0+a.y1)/2],[.018,a.y1-a.y0,a.x0+(a.x1-a.x0)*.75,(a.y0+a.y1)/2]];for(const[t,o,s,l]of Lt){const p=new e.Mesh(new e.BoxGeometry(t,o,.045),Ze);p.position.set(s,l,He),r.add(p)}const te=new e.ShaderMaterial({uniforms:{uLampOn:{value:1},uGz:{value:0},uDesk:{value:new e.Color},uMouth:{value:new e.Vector3},uLampCol:{value:new e.Color}},vertexShader:"varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",fragmentShader:`
      varying vec3 vW; uniform float uLampOn, uGz; uniform vec3 uDesk, uMouth, uLampCol;
      ${ve}
      void main() {
        float y = vW.y;
        vec3 top = vec3(0.012, 0.03, 0.085), hor = vec3(0.045, 0.085, 0.19);
        vec3 c = mix(hor, top, smoothstep(1.0, 3.6, y));
        // a far ridge of trees and roofs, darker than the sky
        float ridge = 1.12 + 0.07 * vn3(vec3(vW.x * 2.2, 0.0, 0.5)) + 0.035 * vn3(vec3(vW.x * 9.0, 2.0, 0.5)) + 0.08 * smoothstep(-0.5, -1.2, vW.x) * step(fract(vW.x * 1.3), 0.6);
        float below = 1.0 - smoothstep(ridge - 0.006, ridge + 0.006, y);
        c = mix(c, vec3(0.008, 0.011, 0.02), below);
        // far warm lights: two windows and a street lamp, small and steady
        vec3 warm = vec3(1.0, 0.62, 0.28);
        c += warm * 2.6 * smoothstep(0.012, 0.0, length((vW.xy - vec2(-1.05, 1.09)) * vec2(1.0, 1.4)));
        c += warm * 1.6 * smoothstep(0.009, 0.0, length((vW.xy - vec2(-0.93, 1.1)) * vec2(1.0, 1.4)));
        c += vec3(1.0, 0.72, 0.4) * 2.2 * smoothstep(0.01, 0.0, length(vW.xy - vec2(-0.12, 1.06)));
        // the glass mirrors the room faintly, as a window does at night: the sheet of light and the lamp
        vec3 rd = normalize(vW - cameraPosition);
        vec3 G = cameraPosition + rd * ((uGz - cameraPosition.z) / rd.z);
        vec3 R = vec3(rd.x, rd.y, -rd.z);
        float refl = 0.03 + 0.1 * pow(1.0 - abs(rd.z), 5.0);
        if (R.y < 0.0) {
          vec3 D = G + R * ((${n.y.toFixed(4)} - G.y) / R.y);
          vec2 e = vec2(${(n.w/2).toFixed(4)}, ${(n.d/2).toFixed(4)}) - abs(D.xz);
          c += uDesk * refl * 0.12 * smoothstep(-0.15, 0.3, min(e.x, e.y));
        }
        vec3 toM = uMouth - G; float tm = dot(toM, R);
        float dm = length(G + R * max(tm, 0.0) - uMouth);
        c += uLampCol * uLampOn * refl * (smoothstep(0.17, 0.12, dm) * 0.5 + smoothstep(0.06, 0.0, length(G + R * max(tm, 0.0) - uMouth - vec3(0.0, 0.045, 0.0))) * 6.0);
        gl_FragColor = vec4(c, 1.0);
      }`}),Qe=new e.Mesh(new e.PlaneGeometry(6,4),te);Qe.position.set((a.x0+a.x1)/2,1.5,i.z0-.9),r.add(Qe),te.uniforms.uGz.value=i.z0-_+.04-.01;const Xe=new e.Mesh(new e.PlaneGeometry(a.x1-a.x0,a.y1-a.y0),new e.MeshBasicMaterial({color:0,transparent:!0,opacity:.1,depthWrite:!1}));Xe.position.set((a.x0+a.x1)/2,(a.y0+a.y1)/2,He-.01),r.add(Xe);const Je=new e.PlaneGeometry(i.z1-i.z0,i.h),Ae=new e.Mesh(Je,N);Ae.rotation.y=Math.PI/2,Ae.position.set(i.x0,i.h/2,(i.z0+i.z1)/2),r.add(Ae);const Se=new e.Mesh(Je,N);Se.rotation.y=-Math.PI/2,Se.position.set(i.x1,i.h/2,(i.z0+i.z1)/2),r.add(Se);const Pe=new e.Mesh(new e.PlaneGeometry(i.x1-i.x0,i.z1-i.z0),N);Pe.rotation.x=Math.PI/2,Pe.position.set(0,i.h,(i.z0+i.z1)/2),r.add(Pe);const Te=new e.Mesh(new e.PlaneGeometry(i.x1-i.x0,i.h),N);Te.rotation.y=Math.PI,Te.position.set(0,i.h/2,i.z1),r.add(Te);const et=new e.Mesh(new e.BoxGeometry(i.x1-i.x0,.09,.015),Ze);et.position.set(0,.045,i.z0+.008),r.add(et);const H=ie(41),Ft=new e.MeshStandardMaterial({map:Me,color:9075312,roughness:.5,envMap:x,envMapIntensity:.35});function tt(t,o,s,l,p){const h=(M,g,B,O,D,J,K=Ft)=>{const re=new e.Mesh(new e.BoxGeometry(M,g,B),K);return re.position.set(O,D,J),r.add(re),re};h(o-t,.025,.32,(t+o)/2,l,s+.32/2),h(.025,l,.32,t,l/2,s+.32/2),h(.025,l,.32,o,l/2,s+.32/2);const v=["#5A2E24","#2E3A44","#6B5B3E","#3B4A3A","#7A6A55","#4A2F3A","#8A7F6A","#2B2A28"];for(let M=0;M<p;M++){const g=.06+M*(l-.06)/p;h(o-t,.02,.32,(t+o)/2,g,s+.32/2);let B=t+.03;for(;B<o-.06;){if(H()<.12){B+=.05+H()*.1;continue}const O=.018+H()*.03,D=l/p*(.55+H()*.3),J=new e.MeshStandardMaterial({color:new e.Color(v[Math.floor(H()*v.length)]),roughness:.75,envMap:x,envMapIntensity:.2}),K=h(O,D,.32*(.7+H()*.2),B+O/2,g+.01+D/2,s+.32*.45,J);H()<.1&&(K.rotation.z=.12),B+=O+.002}}}tt(-3.1,-1.75,i.z0,1.05,3),tt(.75,2.05,i.z0,.78,2);{const t=new e.Mesh(new e.CylinderGeometry(.045,.05,.14,24),new e.MeshPhysicalMaterial({color:10127984,roughness:.2,transmission:0,envMap:x,envMapIntensity:.5}));t.position.set(1.2,.79+.07+.0125,i.z0+.15),r.add(t);const o=new e.Mesh(new e.BoxGeometry(.22,.08,.16),new e.MeshStandardMaterial({color:3813416,roughness:.7,envMap:x,envMapIntensity:.2}));o.position.set(1.62,.79+.04+.0125,i.z0+.14),o.rotation.y=.1,r.add(o)}const U=new e.Group,ke=[];for(let t=0;t<=24;t++){const o=t/24,s=.018+(d.mouth-.018)*Math.pow(Math.sin(o*Math.PI/2),.8),l=.15*Math.pow(1-o,1.35);ke.push(new e.Vector2(s,l))}ke.push(new e.Vector2(d.mouth+.006,-.004));const ot=new e.LatheGeometry(ke,64),Rt=new e.MeshPhysicalMaterial({color:new e.Color("#203A2E"),roughness:.48,metalness:.15,clearcoat:.25,clearcoatRoughness:.4,envMap:x,envMapIntensity:.35,side:e.BackSide}),Be=new e.ShaderMaterial({uniforms:{uOn:{value:1},uCol:{value:new e.Color}},vertexShader:"varying vec3 vL; void main() { vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",fragmentShader:"varying vec3 vL; uniform float uOn; uniform vec3 uCol; void main() { float k = smoothstep(0.16, 0.02, vL.y); gl_FragColor = vec4(uCol * uOn * (0.6 + 3.0 * (1.0 - k) + 1.2 * k), 1.0); }",side:e.FrontSide});U.add(new e.Mesh(ot,Rt),new e.Mesh(ot,Be));const at=new e.MeshBasicMaterial({color:new e.Color(40,26,14)}),nt=new e.Mesh(new e.SphereGeometry(.034,24,16),at);nt.position.y=.045,U.add(nt);const rt=new e.MeshStandardMaterial({color:new e.Color("#8A6A3A"),metalness:.9,roughness:.5,envMap:x,envMapIntensity:.35}),it=new e.Mesh(new e.CylinderGeometry(.02,.024,.05,20),rt);it.position.y=.17,U.add(it);const st=i.h-d.p[1]-.19,lt=new e.Mesh(new e.CylinderGeometry(.0032,.0032,st,8),new e.MeshStandardMaterial({color:1380622,roughness:.6}));lt.position.y=.19+st/2,U.add(lt);const ct=new e.Mesh(new e.CylinderGeometry(.05,.06,.03,24),rt);ct.position.y=i.h-d.p[1]-.015,U.add(ct),U.position.fromArray(d.p),r.add(U);const S={uMouth:{value:new e.Vector3},uAxis:{value:new e.Vector3(0,-1,0)},uTanA:{value:Math.tan(d.half)},uR0:{value:d.mouth*.92},uCol:{value:new e.Color},uAmt:{value:1},uT:{value:0},uFloorY:{value:n.y},uBoxMin:{value:new e.Vector3},uBoxMax:{value:new e.Vector3},uSteps:{value:c?18:30}},ut=`
    varying vec3 vW;
    uniform vec3 uBoxMin, uBoxMax; uniform float uT, uSteps;
    ${ve}
    vec2 boxHit(vec3 ro, vec3 rd) {
      vec3 inv = 1.0 / rd; vec3 t0 = (uBoxMin - ro) * inv, t1 = (uBoxMax - ro) * inv;
      vec3 tmin = min(t0, t1), tmax = max(t0, t1);
      return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
    }
    float turb(vec3 p) {
      vec3 w = vec3(0.0, -uT * 0.018, uT * 0.011);
      vec3 q = p * 3.0 + w * 3.0;
      vec3 warp = vec3(vn3(q), vn3(q + 5.2), vn3(q + 9.7)) - 0.5;       // slow curling air
      p += warp * 0.09;
      return vn3(p * 9.0 + w * 9.0) * 0.5 + vn3(p * 23.0 + w * 17.0 + 3.1) * 0.32 + vn3(p * 57.0 + w * 29.0 + 7.7) * 0.18;
    }`,mt="varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",Gt=new e.ShaderMaterial({uniforms:S,vertexShader:mt,side:e.BackSide,transparent:!0,depthWrite:!1,depthTest:!0,blending:e.AdditiveBlending,fragmentShader:`
      ${ut}
      uniform vec3 uMouth, uAxis, uCol; uniform float uTanA, uR0, uAmt, uFloorY;
      void main() {
        vec3 ro = cameraPosition, rd = normalize(vW - ro);
        float tEnd = length(vW - ro);
        vec2 h = boxHit(ro, rd);
        float t0 = max(h.x, 0.0), t1 = min(h.y, tEnd);
        if (t1 <= t0) discard;
        float n = uSteps, dt = (t1 - t0) / n;
        float t = t0 + dt * ign(gl_FragCoord.xy);
        float acc = 0.0;
        for (int i = 0; i < 48; i++) {
          if (float(i) >= n) break;
          vec3 p = ro + rd * t;
          vec3 lp = p - uMouth;
          float along = dot(lp, uAxis);
          if (along > 0.0 && p.y > uFloorY) {
            float rad = length(lp - uAxis * along);
            float R = uR0 + along * uTanA;
            float e = rad / R;
            float edge = exp(-e * e * 2.4) * (1.0 - smoothstep(0.78, 1.04, e));
            float core = exp(-e * e * 1.2);
            float dist2 = along * along + rad * rad;
            float I = 1.0 / (dist2 * 6.0 + 0.35);
            float top = smoothstep(0.0, 0.05, along);
            float tb = turb(p);
            acc += edge * (0.55 + 0.45 * core) * I * top * (0.1 + 2.6 * tb * tb * tb) * dt;
          }
          t += dt;
        }
        // a little forward scattering: brighter looking toward the lamp
        float g = dot(rd, -uAxis);
        float gg = 0.5 + 0.5 * g;
        float phase = 0.06 + 2.2 * gg * gg * gg;         // dust scatters forward: bright looking up the beam, dim looking down it
        gl_FragColor = vec4(uCol * acc * uAmt * phase * 4.6, 1.0);
      }`}),oe=new e.Mesh(new e.BoxGeometry(1,1,1),Gt);oe.renderOrder=5,oe.frustumCulled=!1,r.add(oe);const ht=[];for(let t=0;t<$;t++){const o={uC:{value:new e.Vector4},uH:{value:.4},uAmt:{value:0},uCol:{value:new e.Color},uT:S.uT,uBoxMin:{value:new e.Vector3},uBoxMax:{value:new e.Vector3},uSteps:{value:c?16:28},uSeed:{value:t*3.7}},s=new e.ShaderMaterial({uniforms:o,vertexShader:mt,side:e.BackSide,transparent:!0,depthWrite:!1,blending:e.AdditiveBlending,fragmentShader:`
        ${ut}
        uniform vec4 uC; uniform float uH, uAmt, uSeed; uniform vec3 uCol;
        void main() {
          vec3 ro = cameraPosition, rd = normalize(vW - ro);
          float tEnd = length(vW - ro);
          vec2 h = boxHit(ro, rd);
          float t0 = max(h.x, 0.0), t1 = min(h.y, tEnd);
          if (t1 <= t0) discard;
          float n = uSteps, dt = (t1 - t0) / n;
          float t = t0 + dt * ign(gl_FragCoord.xy);
          float acc = 0.0;
          for (int i = 0; i < 40; i++) {
            if (float(i) >= n) break;
            vec3 p = ro + rd * t;
            float y = p.y - ${n.y.toFixed(4)};
            if (y > 0.0) {
              vec2 d = (p.xz - uC.xy) / uC.z;
              float r2 = dot(d, d);
              float hy = y / uH;
              float prof = exp(-r2 * (2.2 + hy * 1.2));
              float fall = exp(-hy * 2.3) * (1.0 - smoothstep(0.7, 1.0, hy));
              float tb = vn3(vec3(p.xz * 14.0, y * 9.0 - uT * 0.22) + uSeed) * 0.6 + vn3(vec3(p.xz * 37.0, y * 23.0 - uT * 0.5) + uSeed) * 0.4;
              acc += prof * fall * (0.12 + 2.4 * tb * tb * tb) * dt;
            }
            t += dt;
          }
          gl_FragColor = vec4(uCol * vec3(1.0, 0.96, 0.9) * acc * uAmt * 4.4 / max(uC.z, 0.02), 1.0);
        }`}),l=new e.Mesh(new e.BoxGeometry(1,1,1),s);l.visible=!1,l.renderOrder=6,l.frustumCulled=!1,r.add(l),ht.push(l)}const V=c?2200:4200,ae=c?300:640,F=[-1,n.y+.005,-.75,1,d.p[1]+.05,.75];let Q=new Float32Array(V*4),X=new Float32Array(V*4);{const t=ie(73);for(let o=0;o<V;o++){const s=o<V*.62;let l,p,y;if(s){p=F[1]+t()*(F[4]-F[1]);const h=d.p[1]-p,v=d.mouth+h*Math.tan(d.half),M=Math.sqrt(t())*v*1.15,g=t()*6.283;l=d.p[0]+Math.cos(g)*M,y=d.p[2]+Math.sin(g)*M}else l=F[0]+t()*(F[3]-F[0]),y=F[2]+t()*(F[5]-F[2]),p=F[1]+Math.pow(t(),1.6)*(F[4]-F[1]);Q[o*4]=l,Q[o*4+1]=p,Q[o*4+2]=y,Q[o*4+3]=8e-4+Math.pow(t(),3)*.0022,X[o*4]=t()*6.283,X[o*4+1]=t()*6.283,X[o*4+2]=.3+t()*1.1,X[o*4+3]=t()}}const dt=new e.Float32BufferAttribute(new Float32Array(V+ae).fill(-1),1);{const t=ie(91),o=new Float32Array((V+ae)*4),s=new Float32Array((V+ae)*4);o.set(Q),s.set(X);for(let l=V;l<V+ae;l++){const p=Math.sqrt(t())*1.15,y=t()*6.283;o[l*4]=Math.cos(y)*p,o[l*4+1]=t(),o[l*4+2]=Math.sin(y)*p,o[l*4+3]=8e-4+Math.pow(t(),3)*.0018,s[l*4]=t()*6.283,s[l*4+1]=t()*6.283,s[l*4+2]=.3+t()*1.1,s[l*4+3]=t(),dt.array[l]=(l-V)%$}Q=o,X=s}const ce=new e.BufferGeometry;ce.setAttribute("position",new e.BufferAttribute(new Float32Array((V+ae)*3),3)),ce.setAttribute("aSlot",dt),ce.setAttribute("aBase",new e.BufferAttribute(Q,4)),ce.setAttribute("aPh",new e.BufferAttribute(X,4));const ue={uT:S.uT,uScale:{value:800},uMouth:S.uMouth,uAxis:S.uAxis,uTanA:S.uTanA,uR0:S.uR0,uLamp:{value:new e.Color},uAmt:S.uAmt,uDesk:{value:new e.Color},uCols:k.uCols,uColAmt:k.uColAmt,uY0:{value:F[1]},uYH:{value:F[4]-F[1]},uMinDepth:{value:100}},Dt=new e.ShaderMaterial({uniforms:ue,transparent:!0,depthWrite:!0,blending:e.AdditiveBlending,vertexShader:`
      attribute vec4 aBase; attribute vec4 aPh; attribute float aSlot;
      uniform float uT, uScale, uTanA, uR0, uAmt, uY0, uYH, uMinDepth; uniform vec3 uMouth, uAxis, uLamp, uDesk; uniform vec4 uCols[${$}]; uniform float uColAmt[${$}];
      varying vec3 vC; varying float vZ;
      void main() {
        vec3 p = aBase.xyz;
        if (aSlot >= 0.0) {
          // a mote of a column: rising slowly through it, turning a little as it goes
          int k = int(aSlot + 0.5);
          vec4 C = uCols[k];
          if (uColAmt[k] <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vC = vec3(0.0); vZ = 1.0; return; }
          float hh = fract(aBase.y + uT * 0.025 * (0.5 + aPh.w));
          float sw = uT * 0.15 * aPh.z + aPh.x;
          p = vec3(C.x + (aBase.x + 0.12 * sin(sw)) * C.z, ${n.y.toFixed(4)} + hh * C.w, C.y + (aBase.z + 0.12 * cos(sw)) * C.z);
        } else {
        // slow air: a lazy wander and a very slow rise and fall
        p.x += sin(uT * 0.11 * aPh.z + aPh.x) * 0.035 + sin(uT * 0.05 + p.y * 3.0) * 0.02;
        p.z += cos(uT * 0.09 * aPh.z + aPh.y) * 0.03;
        p.y = uY0 + mod(p.y - uY0 + uT * 0.004 * (aPh.w - 0.35) + sin(uT * 0.07 + aPh.x) * 0.015, uYH);
        }
        // light reaching the mote: the lamp's cone, the desk below (strong close to the glass), the columns
        vec3 lp = p - uMouth; float along = dot(lp, uAxis); float rad = length(lp - uAxis * along);
        float e = rad / (uR0 + max(along, 0.0) * uTanA);
        float cone = along > 0.0 ? (1.0 - smoothstep(0.6, 1.0, e)) / (along * along * 6.0 + 0.35) : 0.0;
        float hy = p.y - ${n.y.toFixed(4)};
        float over = step(abs(p.x), ${(n.w/2).toFixed(3)}) * step(abs(p.z), ${(n.d/2).toFixed(3)});
        float desk = over * 0.5 / (1.0 + hy * hy * 160.0);
        float col = 0.0;
        for (int i = 0; i < ${$}; i++) {
          if (uColAmt[i] <= 0.0) continue;
          vec2 d = (p.xz - uCols[i].xy) / uCols[i].z;
          col += uColAmt[i] * exp(-dot(d, d) * 2.5) * exp(-hy / max(uCols[i].w, 0.05) * 2.0) * 1.6;
        }
        // flakes turn slowly and glint now and then
        float glint = pow(0.5 + 0.5 * sin(uT * aPh.z * 0.9 + aPh.x * 3.0), 10.0);
        float gm = 0.5 + 0.5 * dot(normalize(p - cameraPosition), -uAxis);   // the same forward scattering as the beam
        vC = (uLamp * cone * uAmt * (0.3 + 2.2 * glint) * (0.6 + 1.2 * gm * gm) + uDesk * (desk + col) * (0.4 + 1.6 * glint));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float px = aBase.w * uScale / max(-mv.z, 0.05);
        gl_PointSize = max(px, 1.5);
        vC *= clamp(px / 1.5, 0.15, 1.0) * clamp(px * px / 2.25, 0.0, 1.0) * 0.9 + 0.1 * clamp(px / 1.5, 0.0, 1.0);
        gl_Position = projectionMatrix * mv;
        // the depth a mote writes is never nearer than just behind the heroes (uMinDepth: the focus): so a
        // mote between the lens and the heroes never cuts a hole in them, and the lens keeps it crisp
        vec4 cz = projectionMatrix * vec4(0.0, 0.0, -max(-mv.z, uMinDepth), 1.0);
        vZ = cz.z / cz.w * 0.5 + 0.5;
      }`,fragmentShader:`
      varying vec3 vC; varying float vZ;
      void main() {
        vec2 q = gl_PointCoord - 0.5; float r = length(q); if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r);
        vec3 c = vC * a * 1.6;
        if (max(c.r, max(c.g, c.b)) < 0.004) discard;
        gl_FragColor = vec4(c, 1.0);
        gl_FragDepth = vZ;
      }`}),Le=new e.Points(ce,Dt);Le.frustumCulled=!1,Le.renderOrder=7,r.add(Le);const R=new e.Vector3,q=new e.Vector3;function de(){const t=A(),o=m.lampOn;U.rotation.z=m.lampAngle,U.updateMatrixWorld(!0),R.set(0,-.002,0).applyMatrix4(U.matrixWorld),q.set(0,-1,0).applyQuaternion(U.quaternion).normalize(),S.uMouth.value.copy(R),S.uAxis.value.copy(q),S.uCol.value.copy(t).multiplyScalar(1),S.uAmt.value=o,ue.uLamp.value.copy(t);const s=(R.y-n.y)/Math.max(.3,-q.y),l=R.clone().addScaledVector(q,s),p=d.mouth+s*Math.tan(d.half)*1.05;S.uBoxMin.value.set(Math.min(R.x,l.x)-p,n.y+.001,Math.min(R.z,l.z)-p),S.uBoxMax.value.set(Math.max(R.x,l.x)+p,R.y+.01,Math.max(R.z,l.z)+p),oe.position.copy(S.uBoxMin.value).add(S.uBoxMax.value).multiplyScalar(.5),oe.scale.copy(S.uBoxMax.value).sub(S.uBoxMin.value),oe.visible=o>.001,P.color.copy(t),P.intensity=5.5*o,P.position.copy(R).addScaledVector(q,-.03),P.target.position.copy(R).addScaledVector(q,2),P.target.updateMatrixWorld(),I.intensity=.08*o,I.color.copy(t),at.color.setRGB(40*o*t.r,40*o*t.g,40*o*t.b),Be.uniforms.uOn.value=o,Be.uniforms.uCol.value.copy(t),k.uLampP.value.copy(R),k.uLampAxis.value.copy(q),k.uLampCol.value.copy(t),k.uLampOn.value=o,te.uniforms.uMouth.value.copy(R),te.uniforms.uLampCol.value.copy(t),te.uniforms.uLampOn.value=o,te.uniforms.uDesk.value.copy(m.tint).multiplyScalar(1.9*m.bright),k.uBright.value=m.bright,k.uTint.value.copy(m.tint),T.color.copy(m.tint),T.intensity=2.3*m.bright,Ie.value.copy(m.tint).multiplyScalar(1.55*m.bright),ue.uDesk.value.copy(m.tint).multiplyScalar(m.bright);for(let y=0;y<$;y++){const h=m.columns[y],v=ht[y],M=h?Math.max(0,h.amount):0;if(k.uColAmt.value[y]=M,v.visible=M>.001,!h){k.uCols.value[y].set(0,0,.1,.3);continue}k.uCols.value[y].set(h.x,h.z,h.radius,h.height);const g=v.material.uniforms;g.uC.value.set(h.x,h.z,h.radius,h.height),g.uH.value=h.height,g.uAmt.value=M,g.uCol.value.copy(m.tint).multiplyScalar(m.bright);const B=h.radius*1.6;g.uBoxMin.value.set(h.x-B,n.y+.001,h.z-B),g.uBoxMax.value.set(h.x+B,n.y+h.height*1.05,h.z+B),v.position.copy(g.uBoxMin.value).add(g.uBoxMax.value).multiplyScalar(.5),v.scale.copy(g.uBoxMax.value).sub(g.uBoxMin.value)}}de();const no=new e.PerspectiveCamera,G={dir:new e.Vector3,key:new e.Color,shade:new e.Color,bounce:new e.Color,bamt:0,haze:0};function Wt(t,o,s){const l=u.scene;let p=!1;if(l.traverse(D=>{D.isMesh&&D.visible&&(p=!0)}),k.uMirrorOn.value=p?1:0,!p)return;const y=Math.max(16,Math.round(s.bw/(c?4:2))),h=Math.max(16,Math.round(s.bh/(c?4:2)));(se.width!==y||se.height!==h)&&se.setSize(y,h),k.uRes.value.set(s.bw,s.bh);const v=u.light;G.dir.copy(v.uKeyDir.value),G.key.copy(v.uKeyTint.value),G.shade.copy(v.uShadeTint.value),G.bounce.copy(v.uBounce.value),G.bamt=v.uBounceAmt.value,v.uKeyDir.value.set(.05,1,.05).normalize(),v.uKeyTint.value.copy(G.bounce).multiplyScalar(Math.min(1.1,G.bamt*1.05+.05)),v.uShadeTint.value.copy(G.shade).multiplyScalar(.55),v.uBounce.value.copy(G.key),v.uBounceAmt.value=.35;const M=t.autoClear,g=t.toneMapping,B=t.getClearColor(new e.Color),O=t.getClearAlpha();t.toneMapping=e.NoToneMapping,l.scale.y=-1,l.position.y=2*n.y,l.updateMatrixWorld(!0),t.setRenderTarget(se),t.setClearColor(0,0),t.clear(!0,!0,!0),t.render(l,o),l.scale.y=1,l.position.y=0,l.updateMatrixWorld(!0),v.uKeyDir.value.copy(G.dir),v.uKeyTint.value.copy(G.key),v.uShadeTint.value.copy(G.shade),v.uBounce.value.copy(G.bounce),v.uBounceAmt.value=G.bamt,t.setRenderTarget(null),t.setClearColor(B,O),t.autoClear=M,t.toneMapping=g}const ne=Jt([[.76,.93,.41],[.42,.914,.3],[.08,.905,.27],[-.34,.91,.19],[-.55,.925,-.06],[-.38,.95,-.25],[-.08,1,-.22],[.14,1.08,-.11],[.32,1.17,-.01],[.52,1.24,.07]],{bank:1,maxBank:.55}),Ot=ne.length,It=new e.Vector3(0,1,0),Vt=t=>t<.06?t*t/(2*.06)/(1-.06):t>1-.06?1-(1-t)*(1-t)/(2*.06)/(1-.06):(t-.06/2)/(1-.06),pt=t=>Math.atan2(t.x,-t.z),ro=new e.Quaternion,vt=new e.Quaternion,ft=new e.Euler,me={dist:2.8,fov:27};function Fe(t){const o=ne.tangent(t);return pt(o)}function xt(t,o){for(;t-o>Math.PI;)t-=2*Math.PI;for(;t-o<-Math.PI;)t+=2*Math.PI;return t}function $t(t){t=Math.max(0,Math.min(1,Number(t)||0));const o=Vt(t),s=o*Ot,l=ne.at(s),p=ne.tangent(s),y=ne.flight(o),h=new e.Quaternion().fromArray(y.hero.q);let v=0,M=0,g=Fe(s);for(let pe=0;pe<9;pe++){const Qt=s-pe/8*.45,Mt=1-pe/11;v+=xt(Fe(Qt),g)*Mt,M+=Mt}v/=M;const B=e.MathUtils.degToRad(e.MathUtils.lerp(39,-35,e.MathUtils.smootherstep(t,.3,.52))+11*e.MathUtils.smoothstep(t,.66,1)),O=v+B,D=e.MathUtils.degToRad(30+5*e.MathUtils.smoothstep(t,.04,.22)-4*e.MathUtils.smoothstep(t,.25,.45)-8*e.MathUtils.smoothstep(t,.55,.95)),J=new e.Vector3(Math.sin(O),0,-Math.cos(O)),K=l.clone().addScaledVector(J,-me.dist*Math.cos(D)).addScaledVector(It,me.dist*Math.sin(D)),re=l.clone().sub(K).normalize(),De=pt(re),Et=Math.asin(re.y),Nt=2*Math.atan(Math.tan(e.MathUtils.degToRad(me.fov/2))*16/9),Yt=Math.max(-1,Math.min(1,2.4*Math.sin(xt(Fe(s),De)-De))),Kt=De+Yt*Nt*.17,Zt=Et+e.MathUtils.degToRad(me.fov)*(.15+.1*(1-e.MathUtils.smoothstep(t,0,.25))),Ht=(y.bank||0)*.18;return ft.set(Zt,-Kt,-Ht,"YXZ"),vt.setFromEuler(ft),{hero:{p:l.toArray(),q:h.toArray()},camera:{p:K.toArray(),q:vt.toArray(),fov:me.fov},s,bank:y.bank}}function Ut(t){const o=Array.isArray(t)?t:t?[t.x,t.y,t.z]:[0,n.y+.12,0],s=Math.max(0,o[1]-n.y),l=Math.max(0,Math.abs(o[0])-n.w/2),p=Math.max(0,Math.abs(o[2])-n.d/2),y=Math.hypot(l,p),h=1/(1+s*1.6)*Math.exp(-y*6)*m.bright,v=new e.Vector3(...o).sub(R),M=v.dot(q),g=v.clone().addScaledVector(q,-M).length(),B=M>0?1-e.MathUtils.smoothstep(g/(d.mouth+M*Math.tan(d.half)),.7,1.05):0,O=m.lampOn*(.68+.3*B*Math.min(1.4,.5/Math.max(.12,M*M+.1))),D=A(),J=R.clone().sub(new e.Vector3(...o)).normalize();u.setSun({dir:J.toArray(),color:[D.r,D.g,D.b],ambient:[.3,.2,.14]},{key:Math.max(.3,O),rim:.9,hue:.4});const K=m.tint.clone();return u.setBounce(K,.95*h),u.setHaze("#120D0A",.02),{under:h,lamp:O}}const Y=[96,72],Re=[i.x0,i.z0],Ge=[i.x1-i.x0,i.z1-i.z0],yt=new Float32Array(Y[0]*Y[1]),gt=(t,o)=>Math.abs(t)<=n.w/2&&Math.abs(o)<=n.d/2?n.y:Math.abs(t)<=le&&Math.abs(o)<=E?n.y+n.rimUp:0;for(let t=0;t<Y[1];t++)for(let o=0;o<Y[0];o++)yt[t*Y[0]+o]=gt(Re[0]+o/(Y[0]-1)*Ge[0],Re[1]+t/(Y[1]-1)*Ge[1]);const _t={origin:Re,size:Ge,res:Y},jt={dir:[.124,.99,-.05],color:[1,.7,.42],ambient:[.3,.2,.14],bounce:["#FFF4E6",.95],haze:["#120D0A",.02],sunOpts:{key:.68,rim:.9,hue:.4}},qt={desk:[0,n.y,0],lamp:d.p.slice(),mouth:[d.p[0],d.p[1],d.p[2]],pool:[d.p[0],n.y,d.p[2]],near:[0,n.y,n.d/2],far:[0,n.y,-n.d/2],left:[-n.w/2,n.y,0],right:[n.w/2,n.y,0],window:[(a.x0+a.x1)/2,1.5,i.z0],start:[.76,.93,.41],end:[.52,1.24,.07]};return{scene:r,anchors:qt,light:jt,heightAt:gt,groundMeta:_t,heights:yt,desk:{...n,x0:-n.w/2,x1:n.w/2,z0:-n.d/2,z1:n.d/2,top:n.y},hooks:["desk","setDesk","setLamp","project","column","lightPlayers"],ready:Promise.resolve(),flight:$t,path:ne,lens:{focus:2.5,aperture:0,maxCoc:16,exposure:.92,veil:.09,vignette:.34,sat:1.04,lift:.006,tint:[1,.985,.96],clear:328707},focusFor(t,o=1){return ue.uMinDepth.value=Math.max(.1,t)+.22,{focus:Math.max(.1,t),aperture:26*o,maxCoc:16*Math.min(1.3,Math.max(.2,o))}},setTime(t){m.time=t,S.uT.value=t,k.uT.value=t},setDesk({brightness:t,tint:o}={}){t!=null&&(m.bright=Math.max(0,Number(t)||0)),o!=null&&m.tint.set(o),de()},setLamp({on:t,angle:o,warmth:s}={}){t!=null&&(m.lampOn=Math.max(0,Math.min(1,Number(t)||0))),o!=null&&(m.lampAngle=Math.max(-.6,Math.min(.6,Number(o)||0))),s!=null&&(m.warmth=Math.max(0,Math.min(1,Number(s)))),de()},project(t){ye.setTransform(1,0,0,1,0,0),ye.clearRect(0,0,ee.width,ee.height),typeof t=="function"?(t(ye,ee.width,ee.height),k.uProjOn.value=1):k.uProjOn.value=0,We.needsUpdate=!0},column(t,o){const s=t&&t.slot!=null?t.slot:o??0;s<0||s>=$||(!t||!(Number(t.amount??1)>0)?m.columns[s]=null:m.columns[s]={x:Number(t.x)||0,z:Number(t.z)||0,radius:Math.max(.02,Number(t.radius)||.08),height:Math.max(.05,Number(t.height)||.35),amount:Math.min(2,Number(t.amount??1))},de())},lightPlayers:Ut,onCamera(t,o){ue.uScale.value=o.bh/(2*Math.tan(t.fov*Math.PI/360))},beforeDraw:Wt,stats(){return{motes:V+ae,meshes:r.children.length,mirror:!0,columns:m.columns.filter(Boolean).length}},dispose(){r.traverse(t=>{if(t.geometry&&t.geometry.dispose(),t.material){const o=Array.isArray(t.material)?t.material:[t.material];for(const s of o)s.dispose()}});for(const t of L)t.dispose()}}}export{n as DESK,mo as createLightdesk};
