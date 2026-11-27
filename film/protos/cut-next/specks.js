import*as o from"three";import{SPECKS as C}from"../../kit/seams.js";import{worldView as st}from"./backdrop.js";const x={D0:150,width:340,aspect:14575/8441,stars:82},rt=40,nt=`
in vec3 position;
in vec4 aA;      // from x, y (ndc), to x, y (ndc)
in vec4 aB;      // radius from, radius to (px of a 720 frame), alpha from, alpha to
in vec4 aC;      // colour from (rgb), seed
in vec3 aD;      // colour to (rgb)
in float aKind;  // 1: a star that becomes a speck; 0: a speck that comes up where it rests
uniform float uU;        // 0..1 through the match out
uniform float uFade;     // the sprites give way to the exact match frame
uniform vec2 uRes;       // buffer px
uniform float uK;        // buffer px per 720p px
out vec2 vQ; out vec3 vCol; out float vA;
float S5(float x) { x = clamp(x, 0.0, 1.0); return x * x * x * (x * (x * 6.0 - 15.0) + 10.0); }
void main() {
  float u = uU, s = aC.w;
  float e, al, r; vec2 p; vec3 col;
  if (aKind > 0.5) {
    // drift: a slow wander that the current gives, strongest midway, gone where it starts and where it rests
    e = S5((u - 0.08) / 0.9);
    float w = sin(3.14159 * clamp(u * 1.05, 0.0, 1.0));
    vec2 wob = vec2(sin(u * 9.0 + s * 40.0) + 0.5 * sin(u * 17.0 + s * 13.0), cos(u * 7.0 + s * 23.0) - 0.4 * sin(u * 13.0 + s * 7.0)) * 0.018 * w;
    p = mix(aA.xy, aA.zw, e) + wob * vec2(1.0, uRes.x / uRes.y);
    r = mix(aB.x, aB.y, e);
    al = mix(aB.z, aB.w, e) * smoothstep(0.0, 0.12, u);
    col = mix(aC.rgb, aD, e);
  } else {
    // a speck that was not a star: it comes up where it rests, sinking the last little way into place
    float a = clamp((u - 0.25 - s * 0.35) / 0.4, 0.0, 1.0);
    e = S5(a);
    p = aA.zw + vec2(0.0, 0.012 * (1.0 - e));
    r = aB.y; al = aB.w * e; col = aD;
  }
  vA = al * (1.0 - uFade);
  vCol = col;
  vQ = position.xy;
  float R = max(0.7, r * uK) * 2.4;
  gl_Position = vec4(p + position.xy * R * 2.0 / uRes, 0.0, 1.0);
}`,ct=`
precision highp float;
in vec2 vQ; in vec3 vCol; in float vA;
out vec4 outColor;
void main() {
  float d = length(vQ);
  if (d > 1.0) discard;
  // as kit/seams.js draws one: a full core, half at 0.4 of the way out, nothing at the rim
  float g = d < 0.4 ? mix(1.0, 0.5, d / 0.4) : mix(0.5, 0.0, (d - 0.4) / 0.6);
  outColor = vec4(vCol * g * vA, 1.0);
}`;function ft(it,_,O,{endPose:B,eye:J,mag:X,about:Y}={}){const c=new o.InstancedBufferGeometry;c.setAttribute("position",new o.BufferAttribute(new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),3)),c.setIndex([0,1,2,0,2,3]);const p=C.length,y=new Float32Array(p*4),k=new Float32Array(p*4),R=new Float32Array(p*4),P=new Float32Array(p*3),F=new Float32Array(p);c.setAttribute("aA",new o.InstancedBufferAttribute(y,4)),c.setAttribute("aB",new o.InstancedBufferAttribute(k,4)),c.setAttribute("aC",new o.InstancedBufferAttribute(R,4)),c.setAttribute("aD",new o.InstancedBufferAttribute(P,3)),c.setAttribute("aKind",new o.InstancedBufferAttribute(F,1)),c.instanceCount=p;const g={uU:{value:0},uFade:{value:0},uRes:{value:new o.Vector2(1280,720)},uK:{value:1}},U=new o.RawShaderMaterial({glslVersion:o.GLSL3,vertexShader:nt,fragmentShader:ct,uniforms:g,transparent:!0,depthTest:!1,depthWrite:!1,blending:o.AdditiveBlending}),V=new o.Mesh(c,U);V.frustumCulled=!1;const j=new o.Scene;j.add(V);const Z=new o.OrthographicCamera(-1,1,1,-1,0,1);let S=!1,z=!1;const I=[],K=new o.Vector3,$=[1,236/255,200/255],tt=[236/255,250/255,1];C.forEach((s,n)=>{y.set([s.x*2-1,1-s.y*2,s.x*2-1,1-s.y*2],n*4),k.set([s.r*720,s.r*720,s.a,s.a],n*4);const r=s.warm?$:tt;R.set([r[0],r[1],r[2],n*.6180339887%1],n*4),P.set(r,n*3),F[n]=0});const et=(async()=>{try{const s=await O.asset("../../kit/worlds/galaxy/assets/cosmic-cliffs-1024.jpg"),n=new Image;if(n.src=s,await n.decode(),z)return;const r=n.naturalWidth,f=n.naturalHeight,b=document.createElement("canvas");b.width=r,b.height=f;const H=b.getContext("2d",{willReadFrequently:!0});H.drawImage(n,0,0);const m=H.getImageData(0,0,r,f).data;b.width=b.height=1;const D=(e,t)=>{const a=(t*r+e)*4;return .3*m[a]+.55*m[a+1]+.15*m[a+2]},Q=[];for(let e=3;e<f-3;e++)for(let t=3;t<r-3;t++){const a=D(t,e);if(a<150)continue;let w=!0,d=0;for(let i=-2;i<=2&&w;i++)for(let u=-2;u<=2;u++){if(!u&&!i)continue;const A=D(t+u,e+i);if(A>a||A===a&&(i<0||i===0&&u<0)){w=!1;break}}if(!w)continue;for(const[i,u]of[[-3,0],[3,0],[0,-3],[0,3],[-3,-3],[3,3],[-3,3],[3,-3]])d+=D(t+i,e+u);if(d/=8,a-d<60)continue;const v=(e*r+t)*4;Q.push({u:(t+.5)/r,v:1-(e+.5)/f,l:a,c:[m[v]/255,m[v+1]/255,m[v+2]/255]})}const l=new o.PerspectiveCamera,T=new o.PerspectiveCamera;l.position.fromArray(B.p),l.quaternion.fromArray(B.q),l.fov=B.fov,l.aspect=16/9,l.near=.05,l.far=4e3,l.updateProjectionMatrix(),l.updateMatrixWorld(!0),st(l,T,{eye:J,mag:X,about:Y,aspect:16/9});const h=new o.Vector3,at=x.width/x.aspect,M=x.stars/x.D0,E=[];for(const e of Q){const t=new o.Vector3((e.u-.5)*x.width*M,(e.v-.5)*at*M,-x.D0*M);h.copy(t).project(T),!(h.z>1||Math.abs(h.x)>.97||Math.abs(h.y)>.95)&&E.push({x:h.x,y:h.y,l:e.l,c:e.c,P:t})}E.sort((e,t)=>t.l-e.l);const ot=C.map((e,t)=>[e.a*e.r,t]).sort((e,t)=>t[0]-e[0]).map(e=>e[1]),q=new Set,G=E.slice(0,rt);for(let e=0;e<G.length;e++){const t=G[e];let a=-1,w=1/0;for(const u of ot.slice(0,75)){if(q.has(u))continue;const A=C[u],L=(A.x*2-1-t.x)*(16/9),W=1-A.y*2-t.y,N=L*L+W*W;N<w&&(w=N,a=u)}if(a<0)break;q.add(a);const d=C[a];y.set([t.x,t.y,d.x*2-1,1-d.y*2],a*4);const v=Math.min(1,(t.l-120)/120);k.set([1.1+1.8*v,d.r*720,.55+.45*v,d.a],a*4);const i=Math.max(t.c[0],t.c[1],t.c[2],.001);R.set([t.c[0]/i,t.c[1]/i,t.c[2]/i],a*4),F[a]=1,I.push({i:a,P:t.P})}for(const e of[c.attributes.aA,c.attributes.aB,c.attributes.aC,c.attributes.aKind])e.needsUpdate=!0}catch(s){console.warn("cut-next specks: stars not read",s)}})();return _.add((s,n,r)=>{S&&(g.uRes.value.set(r.bw,r.bh),g.uK.value=r.bh/720,s.render(j,Z))}),{ready:et,set({u:s=0,fade:n=0,view:r=null}={}){if(S=s>0&&n<1,g.uU.value=s,g.uFade.value=n,S&&r&&I.length){for(const f of I)K.copy(f.P).project(r),y[f.i*4]=K.x,y[f.i*4+1]=K.y;c.attributes.aA.needsUpdate=!0}},dispose(){z=!0,c.dispose(),U.dispose()}}}export{ft as createSpecks};
