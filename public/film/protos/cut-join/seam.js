import*as r from"three";import{lattice as Y,neighbours as H}from"../../kit/old/globe.js";const E=Y(144),N=H(E,3),U=1/Math.sqrt(1.9*1.9-.55*.55),J=900,M={glow:"#FC9C79",ring:"#E66628",mid:"#521002",deep:"#1D0A06",at:[.63,.2],size:.14},Q="void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",V=`
uniform vec2 uRes; uniform float uIn; uniform float uTime; uniform float uClear;
uniform vec3 uGlow; uniform vec3 uRing; uniform vec3 uMid; uniform vec3 uDeep; uniform vec2 uAt; uniform float uSize;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
// the light through liquid at a pixel: premultiplied sRGB colour and its share
vec4 amberAt(vec2 fc) {
  vec2 uv = fc / uRes;
  vec2 q = vec2(uv.x, 1.0 - uv.y);
  float asp = uRes.x / uRes.y;
  vec4 outc = vec4(0.0);
  {
    // the light through liquid: the low sun's window (a pale core uSize of the height across), its orange ring, the deep
    // red-amber body, the corners near black
    vec2 d = (q - uAt) * vec2(asp, 1.0);
    float r = length(d);
    float core = exp(-pow(r / uSize, 2.0) * 1.15);
    float halo = exp(-r / 0.17);
    float ang = atan(d.y, d.x);
    float rays = 0.5 + 0.5 * sin(ang * 23.0 + 1.3 * sin(ang * 7.0 + uTime * 0.21) + uTime * 0.07);
    rays = mix(1.0, 0.9 + 0.2 * rays * rays, smoothstep(0.1, 0.5, r) * (1.0 - smoothstep(0.9, 1.7, r)));
    float sh = vn(q * vec2(7.0 * asp, 7.0) + vec2(uTime * 0.05, -uTime * 0.11)) * 0.6 + vn(q * vec2(15.0 * asp, 15.0) - vec2(uTime * 0.07, uTime * 0.13)) * 0.4;
    float edge = length((q - vec2(0.55, 0.42)) * vec2(asp * 0.8, 1.0));
    vec3 c = mix(toLin(uMid), toLin(uDeep), smoothstep(0.2, 1.05, edge));
    c = mix(c, toLin(uRing), halo * 0.8 * rays);
    c = mix(c, toLin(uGlow), core);
    c *= 0.9 + 0.2 * sh;
    c *= 0.97 + 0.06 * h21(gl_FragCoord.xy * 0.37);
    // it clears from the lower left first, the glow at the upper right last (the real blades take it over there)
    float clearAt = mix(0.86, 0.55, smoothstep(0.0, 1.3, r));
    float a = uIn * (1.0 - smoothstep(clearAt - 0.45, clearAt, uClear));
    c = pow(c, vec3(1.0 / 2.2));
    outc = vec4(c * a, a);
  }
  return outc;
}
`,K=`
precision highp float;
uniform sampler2D uTex; uniform float uOut; uniform float uDim;
${V}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 outc = uIn > 0.0 ? amberAt(gl_FragCoord.xy) : vec4(0.0);
  if (uOut > 0.0 || uDim > 0.0) {
    // the forest's light goes first (it sinks toward a deep teal dark, never a grey), then the warm ground comes up
    // through it: premultiplied, so the world keeps (1 - out)(1 - 0.68 dim) of itself
    vec3 g = uOut > 0.0 ? texture2D(uTex, uv).rgb : vec3(0.0);
    float keep = (1.0 - uOut) * (1.0 - 0.68 * uDim);
    outc = vec4(g * uOut + outc.rgb * keep, 1.0 - keep * (1.0 - outc.a));
  }
  gl_FragColor = outc;
}`;function re(e,l={}){const u=document.createElement("canvas"),p=document.createElement("canvas"),n=document.createElement("canvas"),s=u.getContext("2d"),y=p.getContext("2d"),o=n.getContext("2d"),a=new r.CanvasTexture(u);a.colorSpace=r.NoColorSpace,a.generateMipmaps=!1,a.minFilter=r.LinearFilter,a.magFilter=r.LinearFilter;const c=t=>new r.Vector3(...new r.Color(t).toArray()),v=t=>{const f=parseInt(t.slice(1),16);return new r.Vector3((f>>16&255)/255,(f>>8&255)/255,(f&255)/255)},h={uTex:{value:a},uRes:{value:new r.Vector2(1,1)},uIn:{value:0},uOut:{value:0},uDim:{value:0},uTime:{value:0},uClear:{value:0},uGlow:{value:v(M.glow)},uRing:{value:v(M.ring)},uMid:{value:v(M.mid)},uDeep:{value:v(M.deep)},uAt:{value:new r.Vector2(...M.at)},uSize:{value:M.size}},C=new r.ShaderMaterial({vertexShader:Q,fragmentShader:K,uniforms:h,depthTest:!1,depthWrite:!1,transparent:!0,blending:r.CustomBlending,blendSrc:r.OneFactor,blendDst:r.OneMinusSrcAlphaFactor,blendSrcAlpha:r.OneFactor,blendDstAlpha:r.OneMinusSrcAlphaFactor}),w=new r.BufferGeometry;w.setAttribute("position",new r.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));const i=new r.Mesh(w,C);i.frustumCulled=!1;const x=new r.ShaderMaterial({vertexShader:"void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }",fragmentShader:"void main() { gl_FragColor = vec4(0.0); }",depthTest:!0,depthWrite:!0,depthFunc:r.AlwaysDepth,colorWrite:!1}),d=new r.Mesh(w,x);d.frustumCulled=!1;const g=new r.Scene;g.add(i),g.add(d);const R=new r.OrthographicCamera(-1,1,1,-1,0,1);let b=0,T=0,S={kIn:0,kOut:0,dim:0,clear:1,t:0,solid:!1},k=null,A=!1;const D=!!l.inScene,I=D?null:e.backdrop;let F=null;const L=(t,f)=>{(t!==b||f!==T)&&(_(t,f),A=!0),S.kOut>0&&A&&k&&G(k),h.uRes.value.set(t,f),h.uIn.value=S.kIn,h.uOut.value=S.kOut,h.uDim.value=S.dim||0,h.uTime.value=S.t,h.uClear.value=S.clear,d.visible=!!S.solid},P=()=>S.kIn>0||S.kOut>0||S.dim>0;if(D){C.transparent=!1,g.remove(i),g.remove(d);const t=new r.Group;t.renderOrder=-1e9,i.renderOrder=-1e9,d.renderOrder=-999999999,t.add(i,d);const f=new r.Vector2;i.onBeforeRender=m=>{m.getDrawingBufferSize(f),L(f.x,f.y)},i.visible=!1,d.visible=!1,F=e.add({object:t,update(){i.visible=P(),i.visible?d.visible=!!S.solid:d.visible=!1}})}else e.setBackdrop((t,f,m)=>{if(I&&I(t,f,m),!P()){(m.bw!==b||m.bh!==T)&&(_(m.bw,m.bh),A=!0),S.kOut>0&&A&&k&&G(k);return}L(m.bw,m.bh);const O=t.autoClear;t.autoClear=!1,t.render(g,R),t.autoClear=O});function _(t,f){b=t,T=f;for(const m of[u,p,n])m.width=t,m.height=f;a.dispose(),Z(y,t,f)}function G(t){if(A=!1,!b)return;const f=b/t.W;s.setTransform(1,0,0,1,0,0),s.globalAlpha=1,s.globalCompositeOperation="source-over",s.drawImage(p,0,0);const O=.3*t.H/(.8*U)*f,q=.5*t.W*f,W=.45*t.H*f,j=q-O/2,X=W-O/2;o.setTransform(1,0,0,1,0,0),o.globalCompositeOperation="source-over",o.globalAlpha=1,o.clearRect(0,0,b,T),o.translate(j,X);const B=O/J,$=ee(o,O,O,{rotY:t.rotY,rotX:t.rotX,weight:B,dots:t.dots,edges:t.edges});t.fish&&te(o,t.fish,$,B),o.setTransform(1,0,0,1,0,0),s.drawImage(n,0,0),a.needsUpdate=!0}return{canvas:u,set(t){S={...S,...t},D&&(i.visible=P(),d.visible=i.visible&&!!S.solid)},paintEnd(t){const f=JSON.stringify([t.rotY,t.rotX,t.edges,t.W,t.H,t.dots&&t.dots.map(m=>Math.round(m*400)).join(),t.fish&&t.fish.map(m=>Math.round(m.k*400)).join()]);k&&k._key===f&&!A||(k={...t,_key:f},b?G(k):A=!0)},dispose(){F?(e.remove(F),F=null):e.backdrop&&e.setBackdrop(I||null),a.dispose(),C.dispose(),x.dispose(),w.dispose();for(const t of[u,p,n])t.width=t.height=0}}}function ae(e){const l={uRes:{value:new r.Vector2(1,1)},uIn:{value:0},uTime:{value:0},uClear:{value:0},uGlow:{value:z(M.glow)},uRing:{value:z(M.ring)},uMid:{value:z(M.mid)},uDeep:{value:z(M.deep)},uAt:{value:new r.Vector2(...M.at)},uSize:{value:M.size}},u=new r.ShaderMaterial({vertexShader:"void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",fragmentShader:`precision highp float;
${V}
void main() { gl_FragColor = amberAt(gl_FragCoord.xy); }`,uniforms:l,transparent:!0,depthTest:!0,depthWrite:!1,blending:r.CustomBlending,blendSrc:r.OneFactor,blendDst:r.OneMinusSrcAlphaFactor,blendSrcAlpha:r.OneFactor,blendDstAlpha:r.OneMinusSrcAlphaFactor}),p=new r.PlaneGeometry(2,2),n=new r.Mesh(p,u);n.frustumCulled=!1,n.renderOrder=5;let s={k:0,clear:1,t:0,dist:6};const y=new r.Vector2;return{object:n,set(o){s={...s,...o}},update(){const o=e.camera;if(n.visible=s.k>.001&&s.clear<1,!n.visible)return;e.renderer.getDrawingBufferSize(y),l.uRes.value.copy(y),l.uIn.value=s.k,l.uTime.value=s.t,l.uClear.value=s.clear;const a=2*s.dist*Math.tan(o.fov*Math.PI/360)*1.05,c=a*o.aspect;n.position.set(0,0,-s.dist).applyQuaternion(o.quaternion).add(o.position),n.quaternion.copy(o.quaternion),n.scale.set(c/2,a/2,1)},dispose(){p.dispose(),u.dispose()}}}function z(e){const l=parseInt(e.slice(1),16);return new r.Vector3((l>>16&255)/255,(l>>8&255)/255,(l&255)/255)}function Z(e,l,u){e.fillStyle=(()=>{const a=e.createLinearGradient(0,0,0,u);return a.addColorStop(0,"rgb(40,34,12)"),a.addColorStop(1,"rgb(54,33,21)"),a})(),e.fillRect(0,0,l,u);const p=(a,c,v,h,C)=>{e.save(),e.translate(a,c),e.scale(v,h);const w=e.createRadialGradient(0,0,0,0,0,1);for(const[i,x]of C)w.addColorStop(i,x);e.fillStyle=w,e.fillRect(-a/v,-c/h,l/v,u/h),e.restore()};p(.46*l,.84*u,.61*l*1,1.05*u,[[0,"rgba(110,59,43,0.95)"],[1,"rgba(110,59,43,0)"]]),p(l,0,.45*l,1*u,[[0,"rgba(8,4,2,0.8)"],[1,"rgba(8,4,2,0)"]]);const n=e.createLinearGradient(0,0,0,u);n.addColorStop(.91,"rgba(10,6,3,0)"),n.addColorStop(.96,"rgba(10,6,3,0.7)"),n.addColorStop(1,"rgba(8,5,3,0.85)"),e.fillStyle=n,e.fillRect(0,0,l,u);const s=2600,y={v:7},o=()=>(y.v=y.v*16807%2147483647)/2147483647;for(let a=0;a<s;a++){const c=o()*l,v=o()*u,h=(.6+o()*2.2)*(u/720);e.fillStyle=o()<.5?`rgba(255,222,180,${(.012+o()*.018).toFixed(3)})`:`rgba(0,0,0,${(.02+o()*.025).toFixed(3)})`,e.beginPath(),e.arc(c,v,h,0,Math.PI*2),e.fill()}}function ee(e,l,u,p){const n=Math.cos(p.rotY),s=Math.sin(p.rotY),y=Math.cos(p.rotX),o=Math.sin(p.rotX),a=Math.min(l,u)*.8,c=p.weight??1,v=i=>{const x=i[0]*n-i[2]*s,d=i[0]*s+i[2]*n,g=i[1]*y-d*o,R=i[1]*o+d*y,b=1/(1.9-R*.55);return{x:l/2+x*a*b,y:u/2+g*a*b,z:R}},h=E.map(v),C=p.edges??1,w=p.dots;if(e.lineCap="butt",e.lineWidth=1*c,C>0)for(const[i,x]of N){const d=h[i],g=h[x],R=(d.z+g.z)/2,b=C>=1?1:Math.min(1,Math.max(0,C*1.6-(i*.618034+x*.3819)%1*.6));if(b<=0)continue;const T=w?Math.min(w[i],w[x]):1;T<=0||(e.strokeStyle=`rgba(222,190,140,${(.1+(R+1)*.16)*(T>=1?1:T)})`,e.beginPath(),e.moveTo(d.x,d.y),e.lineTo(b>=1?g.x:d.x+(g.x-d.x)*b,b>=1?g.y:d.y+(g.y-d.y)*b),e.stroke())}for(let i=0;i<h.length;i++){const x=h[i],d=w?w[i]:1;if(d<=0)continue;const g=.4+(x.z+1)*.3;e.fillStyle=`rgba(246,232,206,${d>=1?g:g*d})`,e.beginPath(),e.arc(x.x,x.y,(1.4+(x.z+1)*1.1)*c,0,Math.PI*2),e.fill()}return h}function te(e,l,u,p){for(const n of l){const s=u[n.i];if(!s||n.k<=0)continue;const y=n.k,o=(s.z+1)/2,a=n.a??1,c=(16+11*o)*p*(.28+.72*y),v=c*.4*(.45+.55*y);e.save(),e.translate(s.x,s.y),e.rotate(n.dir),e.globalAlpha=Math.min(1,y*1.4)*(.55+.45*o)*a,e.fillStyle="rgb(246,236,216)",e.beginPath(),e.moveTo(c*.55,0),e.lineTo(-c*.05,-v),e.lineTo(-c*.38,0),e.closePath(),e.fill(),e.fillStyle="rgb(206,186,156)",e.beginPath(),e.moveTo(c*.55,0),e.lineTo(-c*.05,v),e.lineTo(-c*.38,0),e.closePath(),e.fill(),e.fillStyle="rgb(232,218,192)",e.beginPath(),e.moveTo(-c*.34,0),e.lineTo(-c*.62,-v*.7),e.lineTo(-c*.54,0),e.lineTo(-c*.62,v*.7),e.closePath(),e.fill(),e.strokeStyle="rgba(150,120,90,0.55)",e.lineWidth=.6*p,e.beginPath(),e.moveTo(c*.55,0),e.lineTo(-c*.38,0),e.stroke(),e.restore()}e.globalAlpha=1}function ne(){const e=o=>{const a=Math.sin(o*127.1+311.7)*43758.5453;return a-Math.floor(a)},l=Math.cos(.4),u=Math.sin(.4),p=Math.cos(-.35),n=Math.sin(-.35),s=o=>{const a=o[0]*u+o[2]*l;return o[1]*n+a*p};return E.map((o,a)=>({i:a,z:s(o)})).filter(o=>o.z>.15).sort((o,a)=>e(o.i*3.1)-e(a.i*3.1)).slice(0,12).map(o=>({i:o.i,dir:Math.PI+(e(o.i*7.7)-.5)*.7}))}export{M as AMBER,N as EDGES,E as PTS,re as createSeamLayer,ae as createVeil,ee as drawGlobeParts,ne as seamFish};
