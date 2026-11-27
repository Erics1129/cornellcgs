import*as o from"three";import{GLSL_COMMON as C,GLSL_FRAG as X,PAPER as ne,lin as Z}from"../actors/core.js";import{clamp as D,smoothstep as le}from"../ease.js";const h=Object.freeze({bottomR:.029,topR:.045,height:.112,sleeve:[.03,.079],sleeveT:.0019,lidTop:.0128,lidR:.0482,total:.112+.0128}),$={r:.0414,half:.3,w:.0034},ce=`
${C}
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz; vLocal = position;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,de=`
${C}
${X}
uniform vec3 uBase;
uniform float uPart;      // 0 body, 1 sleeve, 2 lid
uniform float uScale;
uniform float uH;         // body height (local, scale 1)
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal;
void main() {
  vec3 base = uBase;
  vec3 p = vLocal;
  float r = length(p.xz);
  float occl = 1.0;
  float rimK = 0.3;
  if (uPart < 0.5) {
    // the body: a soft occlusion at the foot and under the sleeve and the lid's skirt
    occl *= mix(0.78, 1.0, smoothstep(0.0, 0.012, p.y));
    occl *= mix(0.86, 1.0, smoothstep(0.0, 0.004, abs(p.y - ${h.sleeve[0].toFixed(4)})));
    occl *= mix(0.84, 1.0, smoothstep(0.0, 0.005, uH - 0.006 - p.y));
  } else if (uPart < 1.5) {
    // the sleeve: a faint corrugation and slightly darker rolled edges
    float a = atan(p.z, p.x);
    base *= 0.97 + 0.03 * sin(a * 90.0);
    float e = min(p.y - ${h.sleeve[0].toFixed(4)}, ${h.sleeve[1].toFixed(4)} - p.y);
    base *= mix(0.9, 1.0, smoothstep(0.0, 0.003, e));
  } else {
    // the lid: the sip slot (a dark little mouth) and a soft recess
    float a = atan(p.z, p.x);
    float slot = (1.0 - smoothstep(${$.half.toFixed(3)} - 0.04, ${$.half.toFixed(3)}, abs(a))) * (1.0 - smoothstep(${($.w*.5).toFixed(4)} - 0.0006, ${($.w*.5).toFixed(4)}, abs(r - ${$.r.toFixed(4)})));
    slot *= step(uH + ${(h.lidTop-.0015).toFixed(4)}, p.y);
    base = mix(base, vec3(0.045, 0.035, 0.03), slot);
    occl *= mix(0.86, 1.0, smoothstep(0.0, 0.004, ${(h.topR-.006).toFixed(4)} - r + 0.002 * step(p.y, uH + 0.0105)));
    rimK = 0.18 * (1.0 - slot);
  }
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 col = lightPlayer(base, N, V, occl, 0.15, 0.5, rimK);
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`,ue=`
${C}
${X}
uniform vec3 uSteam;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal;   // vLocal: x across (-1..1), y alpha
void main() {
  float across = abs(vLocal.x);
  float a = (1.0 - smoothstep(0.1, 1.0, across)) * vLocal.y;
  if (a <= 0.003) discard;
  // a warm white body with a faintly deeper edge, so a wisp reads on light paper as well as on a film
  vec3 c = mix(uSteam, uSteam * vec3(0.74, 0.72, 0.70), smoothstep(0.25, 0.9, across));
  vec3 col = haze(c * mix(vec3(1.0), uKeyTint, 0.5), length(cameraPosition - vWorld));
  vec4 o = linearToOutputTexel(vec4(col, 1.0));          // to the output space first, then premultiply
  gl_FragColor = vec4(o.rgb * a, a);
}`;function pe(m,l,t,c=4){const a=m[l],i=m[l-1],w=m[l+1],S=i.clone().sub(a).normalize(),T=w.clone().sub(a).normalize(),A=[];for(let P=0;P<=c;P++){const d=P/c;A.push(new o.Vector2((1-d)*(1-d)*(a.x+S.x*t)+2*d*(1-d)*a.x+d*d*(a.x+T.x*t),(1-d)*(1-d)*(a.y+S.y*t)+2*d*(1-d)*a.y+d*d*(a.y+T.y*t)))}return[...m.slice(0,l),...A,...m.slice(l+1)]}function I(m,l){let t=m.map(([c,a])=>new o.Vector2(c,a));for(const[c,a]of l.sort((i,w)=>w[0]-i[0]))t=pe(t,c,a);return new o.LatheGeometry(t,72)}function he(m,l={}){const t=l.scale||1,{bottomR:c,topR:a,height:i,sleeve:[w,S],sleeveT:T,lidTop:A,lidR:P}=h,d=e=>c+(a-c)*(e/i),p=new o.Group,F=new o.Group;p.add(F);const _=[],B=(e,s,n)=>{const v=new o.ShaderMaterial({vertexShader:ce,fragmentShader:de,uniforms:{...m.light,uBase:{value:Z(s)},uPart:{value:n},uScale:{value:t},uH:{value:i}}});_.push(v);const r=new o.Mesh(e,v);return r.frustumCulled=!1,F.add(r),r};if(B(I([[0,0],[c,0],[a,i],[a-.002,i+.001]],[[1,.0035]]),l.body||ne,0),l.sleeve!==!1){const e=d(w),s=d(S);B(I([[e-4e-4,w],[e+T,w],[s+T,S],[s-4e-4,S]],[[1,.0016],[2,.0016]]),l.sleeve||"#D3A777",1)}B(I([[a-.001,i-.0075],[P,i-.0075],[P+4e-4,i+.0045],[a-5e-4,A+i],[a-.0065,A+i],[a-.0085,i+.0095],[0,i+.0095]],[[1,.002],[2,.004],[3,.0035],[4,.0016],[5,.0016]]),l.lid||"#F1ECE2",2),F.scale.setScalar(t);const z=3,y=40,x=new o.BufferGeometry,O=new Float32Array(z*y*2*3),me=new Float32Array(z*y*2*3),j=[];for(let e=0;e<z;e++)for(let s=0;s<y-1;s++){const n=(e*y+s)*2;j.push(n,n+2,n+1,n+1,n+2,n+3)}x.setAttribute("position",new o.BufferAttribute(O,3).setUsage(o.DynamicDrawUsage)),x.setAttribute("normal",new o.BufferAttribute(new Float32Array(O.length).map((e,s)=>s%3===1?1:0),3)),x.setIndex(j);const K=new o.ShaderMaterial({vertexShader:`
${C}
attribute vec2 aSteam;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal;
void main() { vWorld = position; vN = vec3(0.0, 1.0, 0.0); vLocal = vec3(aSteam, 0.0); gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,fragmentShader:ue,uniforms:{...m.light,uSteam:{value:Z(l.steamColour||"#FFFDF7")}},transparent:!0,premultipliedAlpha:!0,depthWrite:!1,side:o.DoubleSide}),E=new Float32Array(z*y*2*2);x.setAttribute("aSteam",new o.BufferAttribute(E,2).setUsage(o.DynamicDrawUsage));const R=new o.Mesh(x,K);R.frustumCulled=!1,R.renderOrder=3,R.matrixAutoUpdate=!1;const L=new o.Group;L.add(R);const q=()=>({visible:!0,steam:l.steam===!1?0:1,time:0,drop:1,shadow:!0,shadowOpacity:1});let u=q();const b=new o.Vector3,Y=new o.Vector3(0,1,0),W={object:p,steamObject:L,scale:t,height:h.total*t,radius:a*t,reset(){return u=q(),W},set(e){e.position&&(Array.isArray(e.position)?p.position.fromArray(e.position):p.position.copy(e.position)),e.rotationY!==void 0&&(p.rotation.y=e.rotationY);for(const s in e)s in u&&(u[s]=e[s]);return W},pose(e={}){return W.reset(),W.set(e)},sipPoint(e=new o.Vector3){return p.updateMatrixWorld(!0),e.set($.r,i+A+.001,0).applyMatrix4(F.matrixWorld)},setStyle(){},update(e){p.visible=u.visible,L.visible=u.visible&&u.steam>0;const s=D(u.drop);let n=0,v=1;if(s<1){const r=D(s/.45);n=(1-r*r)*.22;const f=D((s-.45)/.55);if(s>=.45){const g=Math.exp(-5*f)*Math.sin(Math.PI*3*f);v=1-.14*Math.exp(-6*f)*Math.cos(Math.PI*2.6*f)*(1-f),n=Math.max(0,g*.012)}else v=1+.06*r}if(F.position.y=n*t,F.scale.set(t/Math.sqrt(v),t*v,t/Math.sqrt(v)),p.updateMatrixWorld(!0),u.shadow&&u.shadowOpacity>0&&u.visible){const r=new o.Vector3(0,0,0).applyMatrix4(p.matrixWorld);r.y+=n*t;const f=.5*(c+a)*t,g=!!e.plate||e.light.uPlateOn.value>.5;e.shadows.cast(r,new o.Vector3(f,0,0),new o.Vector3(0,0,f),{opacity:u.shadowOpacity*(g?.72:.8),size:h.total*t,round:1,extent:h.total*t*.92,core:[c/(.5*(c+a)),c/(.5*(c+a))],coreOpacity:g?.75:.5})}u.steam>0&&u.visible&&ee(e)},dispose(){p.traverse(e=>{e.geometry&&e.geometry.dispose()});for(const e of _)e.dispose();x.dispose(),K.dispose()}};function ee(e){const s=u.time,n=W.sipPoint(new o.Vector3),v=e.camera.position,r=new o.Vector3().subVectors(n,v).cross(Y).normalize(),f=3.4,g=.1*t,J=.011*t,te=.0062*t;for(let M=0;M<z;M++){const G=((s/f+M/z)%1+1)%1,oe=Math.sin(Math.PI*G)**1.3*u.steam,ae=G*.05*t+.004*t,se=g*(.55+.45*le(0,.5,G)),re=(M-1)*.008*t;for(let N=0;N<y;N++){const H=N/(y-1),k=ae+H*se,ie=re+J*Math.sin(k/t*70-s*1.1+M*2.1)*(.35+k/g)+J*.4*Math.sin(s*.7+M),V=te*Math.sin(Math.PI*H)**.45*(.85+.3*G),Q=oe*Math.sin(Math.PI*H)**.9*.8;b.copy(n).addScaledVector(Y,k).addScaledVector(r,ie);const U=(M*y+N)*2;O.set([b.x-r.x*V,b.y-r.y*V,b.z-r.z*V],U*3),O.set([b.x+r.x*V,b.y+r.y*V,b.z+r.z*V],(U+1)*3),E.set([-1,Q],U*2),E.set([1,Q],(U+1)*2)}}x.attributes.position.needsUpdate=!0,x.attributes.aSteam.needsUpdate=!0}return p.add(L),L.matrixAutoUpdate=!1,L.matrixWorldAutoUpdate=!1,W}export{h as CUP,he as createCup};
