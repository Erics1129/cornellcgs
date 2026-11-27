import*as a from"three";import{GLSL_COMMON as _,GLSL_FRAG as ee,PAPER as te,INK as ae,lin as D}from"../../kit/actors/core.js";import{NAME_FONT as q}from"../../kit/actors/labels.js";const W=-.165,$=.325,V=-.045,K=.128,ie=640,X=250;function oe(){const k=[],C=[],c=[],v=[],T=[],m=(i,l,r,n,u,h=[0,0,0])=>{k.push(...i,...l,...r),C.push(n,n,n),c.push(u,u,u),v.push(1,0,0,0,1,0,0,0,1);for(let F=0;F<3;F++)T.push(...h)},S=[0,0,.5],y=[0,.17,.375],b=[0,.255,.04],x=[0,.07,-.25],p=[0,-.06,-.25],A=[0,-.185,.06];for(const i of[1,-1]){const l=(B,f,w,M,z)=>i>0?m(B,f,w,M,i,z):m(B,w,f,M,i,[z[0],z[2],z[1]]),r=[.05*i,-.052,.345],n=[.088*i,-.072,.05],u=[.05*i,-.06,-.2];l(S,y,r,0,[1,1,0]),l(r,y,b,0,[0,1,1]),l(r,b,n,0,[1,1,1]),l(n,b,u,0,[1,1,1]),l(u,b,x,0,[0,1,1]),l(S,r,A,1,[1,0,1]),l(r,n,A,1,[1,1,1]),l(n,u,A,1,[1,1,1]),l(u,p,A,1,[0,1,1]),l(u,x,p,1,[0,1,1]);const h=[.012*i,.215,-.5],F=[.022*i,.005,-.405],U=[.012*i,-.19,-.48],N=(B,f,w,M)=>i>0?m(B,f,w,M,i):m(B,w,f,M,i);N(x,h,F,1),N(x,F,p,1),N(p,F,U,1),N([.07*i,-.075,.12],[.06*i,-.08,-.02],[.17*i,-.135,0],1)}m([0,.245,-.01],[.007,.305,-.11],[0,.135,-.19],0,0),m([0,.245,-.01],[0,.135,-.19],[-.007,.305,-.11],0,0);const d=new a.BufferGeometry,R=new Float32Array(k),P=new Float32Array(R.length/3);for(let i=0;i<P.length;i++)P[i]=Math.min(1,Math.max(0,(.5-R[i*3+2])/1));return d.setAttribute("position",new a.BufferAttribute(R,3)),d.setAttribute("aPart",new a.BufferAttribute(new Float32Array(C),1)),d.setAttribute("aSide",new a.BufferAttribute(new Float32Array(c),1)),d.setAttribute("aBack",new a.BufferAttribute(P,1)),d.setAttribute("aBary",new a.BufferAttribute(new Float32Array(v),3)),d.setAttribute("aFold",new a.BufferAttribute(new Float32Array(T),3)),d}const re=`
${_}
attribute float aPart; attribute float aSide; attribute float aBack; attribute vec3 aBary; attribute vec3 aFold;
varying vec3 vBary; varying vec3 vFold;
attribute vec3 aColour; attribute vec4 aSwim; attribute vec4 aCell; attribute vec4 aLight;
varying vec3 vWorld; varying float vPart; varying float vSide; varying vec3 vColour; varying vec3 vLocal;
varying float vFlash; varying vec4 vCell; varying vec4 vLight;
void main() {
  vec3 p = position;
  float b = aBack;
  // the swimming wave: nose to tail, growing toward the tail (the name's panel barely moves)
  float wv = sin(aSwim.x + p.z * 6.0);
  p.x += aSwim.y * (0.018 * b + 0.32 * b * b * b) * wv;
  // the pectoral flaps paddle
  if (abs(p.x) > 0.09 && p.y < -0.1) p.y += 0.05 * aSwim.y * sin(aSwim.x * 1.3 + aSwim.w * 6.0) * (abs(p.x) - 0.09) * 9.0;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = wp.xyz; vPart = aPart; vSide = aSide; vColour = aColour; vLocal = position; vFlash = aSwim.z;
  vCell = aCell; vLight = aLight; vBary = aBary; vFold = aFold;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,ne=`
${_}
${ee}
uniform vec3 uPaper; uniform vec3 uInk; uniform sampler2D uNames;
varying vec3 vWorld; varying float vPart; varying float vSide; varying vec3 vColour; varying vec3 vLocal;
varying float vFlash; varying vec4 vCell; varying vec4 vLight; varying vec3 vBary; varying vec3 vFold;
vec3 facetNormal(vec3 w, vec3 V) { vec3 n = normalize(cross(dFdx(w), dFdy(w))); return dot(n, V) < 0.0 ? -n : n; }
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = facetNormal(vWorld, V);
  vec3 base = vPart > 0.5 ? vColour : uPaper;
  // paper: a fine fibre and a faint mottle (the folded sheet is never perfectly even)
  float grain = fbm(vLocal * vec3(70.0, 70.0, 26.0));
  float mott = fbm(vLocal * 9.0 + vCell.xyx * 31.0);
  base *= 0.955 + 0.06 * grain + 0.03 * (mott - 0.5);
  // the name, on the white flank panel, reading left to right from this side
  float ink = 0.0;
  if (vPart < 0.5 && abs(vSide) > 0.5) {
    float u = vSide > 0.0 ? (${$.toFixed(3)} - vLocal.z) / ${($-W).toFixed(3)} : (vLocal.z - ${W.toFixed(3)}) / ${($-W).toFixed(3)};
    float v = (vLocal.y - ${V.toFixed(3)}) / ${(K-V).toFixed(3)};
    if (u > 0.0 && u < 1.0 && v > 0.0 && v < 1.0) {
      vec2 uv = vec2(mix(vCell.x, vCell.z, u), mix(vCell.w, vCell.y, v));
      ink = texture2D(uNames, uv).r;
      // ink on paper soaks a little into the fibre
      ink *= (0.9 + 0.1 * grain) * vLight.w;
    }
  }
  base = mix(base, uInk, ink * 0.93);
  // the folds: a hairline where two facets meet (a little shadow in the crease), never on the tail's fine fans
  vec3 bw = fwidth(vBary);
  vec3 bd = vBary / max(bw, vec3(1e-5)) + (1.0 - vFold) * 1e4;
  float fold = 1.0 - smoothstep(0.35, 1.3, min(bd.x, min(bd.y, bd.z)));
  base *= 1.0 - 0.12 * fold;
  // the centre crease along the back and the ridge where the white meets the colour: a hairline in shade
  float crest = smoothstep(0.012, 0.0, abs(vLocal.x)) * step(0.0, vLocal.y) * (1.0 - step(0.5, vPart));
  vec3 col = lightPlayer(base, N, V, 1.0 - 0.18 * crest, 0.85, grain, 1.0);
  // backlit paper glows: the sun through one sheet, warm; the ink and the folds stop it (the name stays dark)
  float back = max(-dot(N, uKeyDir), 0.0);
  col += base * uKeyTint * back * 0.34 * (1.0 - ink * 0.95) * (vPart > 0.5 ? 0.55 : 1.0);
  // where this fish swims: the dancing light of the surface, the boat's shadow
  col *= mix(1.0, vLight.x, 0.8);
  // the flash of a turn: the flank catches the light for a moment
  col = mix(col, max(col, vec3(1.0, 0.98, 0.93) * uKeyTint * 1.08), vFlash * 0.42 * smoothstep(0.1, 0.9, dot(N, uKeyDir) * 0.5 + 0.5));
  // the pointer's pick: a thin bright cut edge of paper round it
  float edge = smoothstep(0.55, 0.95, 1.0 - abs(dot(N, V)));
  col += vLight.z * (0.12 + 0.55 * edge) * vec3(1.0, 0.97, 0.9) * uKeyTint;
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  // the finder: a fish outside the chosen group sinks into the water's colour
  col = mix(col, uHazeColor, vLight.y * 0.62);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function ce(k,C={}){const c=C.names||[],v=Math.min(C.count||c.length,c.length),T=c.map(()=>[0,0,0,0]),m=Array.from({length:v},(t,e)=>e),S=C.size||.5,y=oe(),b=new a.InstancedBufferAttribute(new Float32Array(v*3),3),x=new a.InstancedBufferAttribute(new Float32Array(v*4),4),p=new a.InstancedBufferAttribute(new Float32Array(v*4),4),A=new a.InstancedBufferAttribute(new Float32Array(v*4),4);for(const t of[x,A])t.setUsage(a.DynamicDrawUsage);y.setAttribute("aColour",b),y.setAttribute("aSwim",x),y.setAttribute("aCell",p),y.setAttribute("aLight",A),(C.colours||[]).forEach((t,e)=>{const s=D(t);b.setXYZ(e,s.r,s.g,s.b)});const d=2,R=Math.max(1,Math.ceil(c.length/d)),P=c.length>18?.7:1,i=Math.round(ie*P),l=Math.round(X*P),r=document.createElement("canvas");r.width=d*i,r.height=R*l;const n=r.getContext("2d",{willReadFrequently:!0}),u=new Uint8Array(r.width*r.height),h=new a.DataTexture(u,r.width,r.height,a.RedFormat,a.UnsignedByteType);h.flipY=!1,h.colorSpace=a.NoColorSpace,h.generateMipmaps=!0,h.minFilter=a.LinearMipmapLinearFilter,h.magFilter=a.LinearFilter,h.anisotropy=k.renderer?k.renderer.capabilities.getMaxAnisotropy():8,h.unpackAlignment=1;const F=($-W)/(K-V);function U(){n.clearRect(0,0,r.width,r.height);const t=i-24,e=Math.min(l-24,t/F);n.font=`600 100px ${q}`;let s=1e9;const g=c.map(o=>{const L=n.measureText(o);return(L.actualBoundingBoxLeft+L.actualBoundingBoxRight)/100}),I=g.slice().sort((o,L)=>o-L),H=I[c.length>9?Math.floor(I.length*.8):I.length-1];for(let o=0;o<c.length;o++){const L=Math.min(g[o],H);s=Math.min(s,t*.96/Math.max(L,.001),e*.94/1.28)}for(let o=0;o<c.length;o++){const L=o%d*i,j=Math.floor(o/d)*l,E=L+12,Y=j+(X-e)/2;n.save();const Q=Math.min(s,t*.96/Math.max(g[o],.001));n.font=`600 ${Q.toFixed(1)}px ${q}`,n.fillStyle="#ffffff",n.textAlign="center",n.textBaseline="alphabetic";const Z=n.measureText(c[o]),J=n.measureText("x").actualBoundingBoxAscent;n.fillText(c[o],E+t/2+(Z.actualBoundingBoxLeft-Z.actualBoundingBoxRight)/2,Y+e/2+J/2+s*.04),n.restore(),T[o]=[E/r.width,Y/r.height,(E+t)/r.width,(Y+e)/r.height]}for(let o=0;o<v;o++)p.setXYZW(o,...T[m[o]]);const O=n.getImageData(0,0,r.width,r.height).data;for(let o=0;o<u.length;o++)u[o]=O[o*4+3];h.needsUpdate=!0,p.needsUpdate=!0}U();const N={...k.light,uPaper:{value:D(te)},uInk:{value:D(ae)},uNames:{value:h}},B=new a.ShaderMaterial({vertexShader:re,fragmentShader:ne,uniforms:N,side:a.DoubleSide}),f=new a.InstancedMesh(y,B,v);f.instanceMatrix.setUsage(a.DynamicDrawUsage),f.frustumCulled=!1;const w=m.map(()=>({p:new a.Vector3,q:new a.Quaternion,phase:0,amp:.6,flash:0,light:1,dim:0,glow:0,visible:!0,seed:Math.random()}));w.forEach((t,e)=>{t.seed=e*.6180339%1,t.ink=1});const M=new a.Matrix4,z=new a.Vector3(S,S,S),G=new a.Matrix4().makeScale(0,0,0);return{object:f,count:v,size:S,canvas:r,redraw:U,fish(t){return w[t]},show(t,e,s){if(!(t>=v||m[t]===e)&&(m[t]=e,p.setXYZW(t,...T[e]),p.needsUpdate=!0,s)){const g=D(s);b.setXYZ(t,g.r,g.g,g.b),b.needsUpdate=!0}},set(t,e){const s=w[t];if(s){e.p&&(Array.isArray(e.p)?s.p.fromArray(e.p):s.p.copy(e.p)),e.q&&s.q.copy(e.q);for(const g of["phase","amp","flash","light","dim","glow","ink","visible"])e[g]!==void 0&&(s[g]=e[g])}},update(){for(let t=0;t<v;t++){const e=w[t];if(!e.visible){f.setMatrixAt(t,G);continue}M.compose(e.p,e.q,z),f.setMatrixAt(t,M),x.setXYZW(t,e.phase,e.amp,e.flash,e.seed),A.setXYZW(t,e.light,e.dim,e.glow,e.ink)}f.instanceMatrix.needsUpdate=!0,x.needsUpdate=!0,A.needsUpdate=!0},dispose(){y.dispose(),B.dispose(),h.dispose()}}}export{ce as createNamedFish};
