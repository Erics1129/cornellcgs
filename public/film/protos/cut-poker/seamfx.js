import*as o from"three";import{GREEN as k}from"../../kit/seams.js";const E=e=>{const f=parseInt(e.slice(1),16);return[(f>>16&255)/255,(f>>8&255)/255,(f&255)/255]},D="varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }",x=`
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;                 // device px
uniform float uKG;                 // the green ground's alpha (seams.js k)
uniform vec3 uGround, uCore, uMid;
uniform vec2 uC; uniform float uR; // the disc: centre and radius, device px (y down)
uniform float uKD;                 // the disc and halo's alpha
uniform float uKE;                 // the end ground's alpha
uniform sampler2D uEnd;            // the end ground (low frequency, 32 x 18)
uniform sampler2D uStreak; uniform float uKS; uniform vec4 uSBox;  // the streak canvas over the frame
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  // premultiplied layer, built front to back as source-over in sRGB values (as the 2D canvas composites)
  vec3 c = vec3(0.0); float a = 0.0;
  // the ground (seams.js: fillRect GREEN.ground at alpha k)
  c = uGround * uKG; a = uKG;
  // the halo: radial gradient 0 .. 4.2 R, alpha 0.34 -> 0.10 at 0.35 -> 0, colour (61,227,138)
  float d = length(px - uC);
  if (uR > 0.0 && uKD > 0.0) {
    float s = d / (uR * 4.2);
    float ha = s < 0.35 ? mix(0.34, 0.10, s / 0.35) : s < 1.0 ? mix(0.10, 0.0, (s - 0.35) / 0.65) : 0.0;
    ha *= uKD;
    c = uMid * ha + c * (1.0 - ha); a = ha + a * (1.0 - ha);
    // the disc: 0 core -> 0.62 mid -> 0.92 mid at 0.85 -> 1 mid at 0
    float r = d / uR;
    vec3 dc; float da;
    if (r < 0.62) { dc = mix(uCore, uMid, r / 0.62); da = 1.0; }
    else if (r < 0.92) { dc = uMid; da = mix(1.0, 0.85, (r - 0.62) / 0.30); }
    else if (r < 1.0) { dc = uMid; da = mix(0.85, 0.0, (r - 0.92) / 0.08); }
    else { dc = uMid; da = 0.0; }
    da *= uKD;
    c = dc * da + c * (1.0 - da); a = da + a * (1.0 - da);
  }
  // the end: the dark the lens closes into
  if (uKE > 0.0) { vec3 e = texture2D(uEnd, vUv).rgb; c = e * uKE + c * (1.0 - uKE); a = uKE + a * (1.0 - uKE); }
  // the streak: light, added
  if (uKS > 0.0) {
    vec2 q = (px - uSBox.xy) / uSBox.zw;
    if (q.x >= 0.0 && q.y >= 0.0 && q.x <= 1.0 && q.y <= 1.0) c += texture2D(uStreak, vec2(q.x, 1.0 - q.y)).rgb * uKS;
  }
  c += (ign(gl_FragCoord.xy) - 0.5) / 255.0 * a;
  gl_FragColor = vec4(c, a);
}`;function G(e,f,n,h,{scale:i=1}={}){if(h<=.002||!f)return;const[l,c,t]=f,K=2*c[0]-(l[0]+t[0])/2,m=2*c[1]-(l[1]+t[1])/2,g=(a=0)=>{e.beginPath(),e.moveTo(l[0]+a,l[1]),e.quadraticCurveTo(K+a,m,t[0]+a,t[1])},b=(a=0)=>{const r=e.createLinearGradient(l[0]+a,l[1],t[0]+a,t[1]);return r.addColorStop(0,"rgba(255,255,255,0)"),r.addColorStop(.12,"rgba(255,255,255,.7)"),r.addColorStop(.5,"rgba(255,255,255,1)"),r.addColorStop(.88,"rgba(255,255,255,.7)"),r.addColorStop(1,"rgba(255,255,255,0)"),r};e.save(),e.lineCap="round",e.globalCompositeOperation="lighter";const S=2e4,w=(a,r,p,u)=>{e.shadowColor=`rgba(${p},${(h*u).toFixed(4)})`,e.shadowBlur=r*i,e.shadowOffsetX=S*i,e.lineWidth=Math.max(.5,a),e.strokeStyle=b(-S),g(-S),e.stroke()};{const a=c[0],r=(l[1]+t[1])/2*.5+c[1]*.5,p=Math.hypot(t[0]-l[0],t[1]-l[1])/2;e.save(),e.translate(a,r),e.rotate(Math.atan2(t[1]-l[1],t[0]-l[0])),e.scale(p*.82,n*5.2);const u=e.createRadialGradient(0,0,0,0,0,1),s=v=>`rgba(150,190,255,${(h*.32*v).toFixed(4)})`;u.addColorStop(0,s(1)),u.addColorStop(.35,s(.55)),u.addColorStop(.7,s(.16)),u.addColorStop(1,s(0)),e.fillStyle=u,e.beginPath(),e.arc(0,0,1,0,Math.PI*2),e.fill(),e.restore()}w(n*2,n*2.6,"180,212,255",.42),w(n*1.1,n*1.1,"236,244,255",.7),w(n*.55,n*.35,"255,250,242",.95),e.shadowColor="rgba(0,0,0,0)",e.shadowBlur=0,e.shadowOffsetX=0,e.globalAlpha=h*.85,e.lineWidth=Math.max(.5,n*.32),e.strokeStyle=b(0),g(0),e.stroke(),e.restore()}import{END_GROUND as q}from"./endground.js";function B(e){const f=new o.BufferGeometry;f.setAttribute("position",new o.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));const n=new Uint8Array(576*4);for(let a=0;a<18;a++)for(let r=0;r<32;r++){const p=q[a].slice(r*6,r*6+6),u=((17-a)*32+r)*4;n[u]=parseInt(p.slice(0,2),16),n[u+1]=parseInt(p.slice(2,4),16),n[u+2]=parseInt(p.slice(4,6),16),n[u+3]=255}const h=new o.DataTexture(n,32,18,o.RGBAFormat);h.magFilter=h.minFilter=o.LinearFilter,h.needsUpdate=!0;const i=document.createElement("canvas");i.width=4,i.height=4;const l=()=>{const a=new o.CanvasTexture(i);return a.minFilter=a.magFilter=o.LinearFilter,a.generateMipmaps=!1,a};let c=l();const t={uRes:{value:new o.Vector2(1280,720)},uKG:{value:0},uGround:{value:new o.Vector3(...E(k.ground))},uCore:{value:new o.Vector3(...E(k.core))},uMid:{value:new o.Vector3(...E(k.mid))},uC:{value:new o.Vector2},uR:{value:0},uKD:{value:0},uKE:{value:0},uEnd:{value:h},uStreak:{value:c},uKS:{value:0},uSBox:{value:new o.Vector4(0,0,1280,720)}},K=new o.ShaderMaterial({vertexShader:D,fragmentShader:x,uniforms:t,depthTest:!1,depthWrite:!1,transparent:!0,blending:o.CustomBlending,blendEquation:o.AddEquation,blendSrc:o.OneFactor,blendDst:o.OneMinusSrcAlphaFactor,blendSrcAlpha:o.ZeroFactor,blendDstAlpha:o.OneFactor});K.toneMapped=!1;const m=new o.Mesh(f,K);m.frustumCulled=!1;const g=new o.Scene;g.add(m);const b=new o.OrthographicCamera(-1,1,1,-1,0,1);let S="";const w={set({W:a,H:r,dpr:p,green:u=null,end:s=null}){const v=p;if(t.uRes.value.set(Math.round(a*v),Math.round(r*v)),t.uKG.value=u?u.k:0,t.uKD.value=u&&u.r>0?u.kd:0,u&&(t.uC.value.set(u.c[0]*v,u.c[1]*v),t.uR.value=u.r*v),t.uKE.value=s?s.ke:0,t.uKS.value=s&&s.ks>.001?1:0,s&&s.ks>.001){const C=Math.min(1,1280/a),F=Math.round(a*C),R=Math.round(r*C),M=[F,R,s.ks.toFixed(4),s.thick.toFixed(3),...s.spine.flat().map(d=>d.toFixed(2)),...(s.far||[]).map(d=>d.spine.flat().map(y=>y.toFixed(2)).join(",")+d.a.toFixed(3))].join("|");if(M!==S){S=M,(i.width!==F||i.height!==R)&&(i.width=F,i.height=R,c.dispose(),c=l(),t.uStreak.value=c);const d=i.getContext("2d");d.setTransform(1,0,0,1,0,0),d.globalCompositeOperation="source-over",d.fillStyle="#000",d.fillRect(0,0,F,R),d.setTransform(C,0,0,C,0,0),G(d,s.spine,s.thick,s.ks,{scale:C});for(const y of s.far||[])G(d,y.spine,y.thick,y.a*s.ks,{scale:C});c.needsUpdate=!0}t.uSBox.value.set(0,0,a*v,r*v)}},active(){return t.uKG.value>0||t.uKD.value>0||t.uKE.value>0||t.uKS.value>0},quad(){return g.remove(m),m},draw(a){if(!w.active())return;const r=a.autoClear;a.autoClear=!1,a.setRenderTarget(null),a.render(g,b),a.autoClear=r},dispose(){f.dispose(),K.dispose(),h.dispose(),c.dispose(),i.width=i.height=1}};return w}export{B as createSeamFX,G as drawStreak};
