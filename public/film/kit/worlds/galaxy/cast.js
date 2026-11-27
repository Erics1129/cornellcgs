import*as e from"three";import{GLSL_COMMON as N,lin as Z,PALETTE as fe,PLAYER_COLOURS as be}from"../../actors/core.js";import{createCube as Ae}from"../../actors/cube.js";import{createCards as de}from"../../props/cards.js";import{createStones as Se,STONE as Me}from"../../props/stones.js";import{createBlocks as pe}from"../../props/blocks.js";import{clamp as E,lerp as ee,inOutSine as te,inOutCubic as ve,outCubic as me,outBack as re,spring as Fe,hash01 as q,smoothstep as K}from"../../ease.js";const R=Math.PI*2,H=(a,t=new e.Vector3)=>a?a.isVector3?t.copy(a):t.fromArray(a):t.set(0,0,0),he=(a,t=new e.Quaternion)=>a?a.isQuaternion?t.copy(a):t.fromArray(a):t.identity(),ne=new e.Vector3,oe=new e.Vector3,D=new e.Quaternion,we=new e.Quaternion,xe=new e.Matrix4,j=new e.Vector3(1,0,0),$=new e.Vector3(0,1,0),ae=new e.Vector3(0,0,1);function se(a,t=new e.Vector3){const o=q(a+":u"),n=q(a+":v"),u=o*2-1,d=n*R,c=Math.sqrt(1-u*u);return t.set(c*Math.cos(d),u,c*Math.sin(d))}function ke(a,{seed:t=1,rate:o=.05,wobble:n=.3,phase:u=0}={},d=new e.Quaternion){const c=se(t+"a",ne),p=se(t+"b",oe),r=q(t+"p");return d.setFromAxisAngle(c,R*(o*a+u+r)),D.setFromAxisAngle(p,n*Math.sin(R*(o*.61*a+r*3.1))),d.multiply(D)}function ye(a,{seed:t=1,amp:o=.05,rate:n=.08}={},u=new e.Vector3){const d=Array.isArray(o)?o:[o,o,o],c=[];for(let p=0;p<3;p++){const r=q(t+"d"+p),v=q(t+"e"+p),l=n*(.7+.6*r),s=n*(1.37+.5*v);c.push(d[p]*(.62*Math.sin(R*(l*a+r))+.38*Math.sin(R*(s*a+v*2.3))))}return u.set(c[0],c[1],c[2])}function Ye(a,{from:t=[0,0,0],to:o=[0,0,0],height:n=.5,turns:u=0}={},d={}){a=E(a);const c=H(t,new e.Vector3),p=H(o,new e.Vector3),r=d;r.position=r.position||new e.Vector3,r.dir=r.dir||new e.Vector3,r.dir.subVectors(p,c).setY(0),r.dir.lengthSq()<1e-10?r.dir.set(0,0,1):r.dir.normalize();let v=1,l=0,s=0;if(a<.16)v=1-.14*te(a/.16);else if(a<.24){const h=(a-.16)/.08;v=ee(.86,1.13,me(h))}a>.2&&a<.86?(s=(a-.2)/.66,l=1,a>=.24&&(v=ee(1.13,1,K(0,.35,s))*(1+.04*K(.8,1,s)))):a>=.86&&(s=1);const m=.5-.5*Math.cos(Math.PI*s),y=ee(s,m,.35),b=Math.sin(Math.PI*s),i=n*Math.pow(Math.max(0,b),.72);if(r.position.lerpVectors(c,p,y),r.position.y+=i,r.land=-1,a>=.86){const h=(a-.86)/.14;r.land=h,v=1-.07*Math.sin(Math.PI*Math.min(1,h*1.25))*(1-h*.4)}return r.sy=v,r.sxz=1/Math.sqrt(v),r.air=l*K(0,.08,s)*(1-K(.92,1,s)),r.spin=u*R*te(s),r}function Qe(a,t,o,{tilt:n=0,yaw:u=0,ecc:d=0,node:c=0}={},p=new e.Vector3){const r=R*o,v=t*Math.sqrt(1-d*d);let l=t*Math.cos(r)-t*d,s=-v*Math.sin(r);const m=Math.cos(c),y=Math.sin(c);return p.set(l*m-s*y,0,l*y+s*m),p.applyQuaternion(ge(n,u,we)),p.add(H(a,ne))}function ge(a=0,t=0,o=new e.Quaternion){return o.setFromAxisAngle($,t),o.multiply(D.setFromAxisAngle(j,a))}function ze(a,{distance:t=1,x:o=0,y:n=0,yaw:u=0,roll:d=0}={},c={}){a.updateMatrixWorld();const p=a.matrixWorld.elements,r=new e.Vector3(p[0],p[1],p[2]).normalize(),v=new e.Vector3(p[4],p[5],p[6]).normalize(),l=new e.Vector3(p[8],p[9],p[10]).normalize(),s=Math.tan(a.fov*Math.PI/360)/(a.zoom||1),m=a.aspect||16/9;c.position=(c.position||new e.Vector3).copy(a.position).addScaledVector(l,-t).addScaledVector(r,o*s*m*t).addScaledVector(v,n*s*t);const y=v.clone().negate();return xe.makeBasis(r,l,y),c.quaternion=(c.quaternion||new e.Quaternion).setFromRotationMatrix(xe),u&&c.quaternion.premultiply(D.setFromAxisAngle(v,u)),d&&c.quaternion.premultiply(D.setFromAxisAngle(l,d)),c}function Ce(a,t,o=.5){const n=Math.tan(a.fov*Math.PI/360)/(a.zoom||1);return t/(o*2*n)}const Ve=["AS","KH","QC","JD","10H","9S","AH","KS","QD","JC","10D","9H","JR","AD","KC","QS","JH","10S","AC","KD","QH","JS","10C","JB"];function Ne(a,t={}){const o=t.count||14,n={center:H(t.center,new e.Vector3),radius:t.radius||1,tilt:t.tilt??.35,yaw:t.yaw||0,phase:0,tumble:t.tumble??1,scatter:t.scatter??1,visible:!0,scale:1},u=t.width||n.radius*.16,d=t.back?Array.isArray(t.back)?t.back:[t.back]:be,c=t.faces||Ve,p=Array.from({length:o},(b,i)=>c[i%c.length]),r=a.add(de(a,{faces:p,count:o,width:u,back:Array.from({length:o},(b,i)=>d[i%d.length]),extra:t.extra}));for(let b=0;b<o;b++)r.set(b,{shadow:!1});const v=Array.from({length:o},(b,i)=>({a:q("ring-a"+i),r:q("ring-r"+i),y:q("ring-y"+i),t:q("ring-t"+i),w:q("ring-w"+i)})),l=new e.Quaternion,s={position:new e.Vector3,quaternion:new e.Quaternion};function m(b,i=n.phase,h={position:new e.Vector3,quaternion:new e.Quaternion}){const w=v[b],Q=R*(b/o+(w.a-.5)*.35/o+i),z=n.radius*(1+(w.r-.5)*.12*n.scatter),g=n.radius*(w.y-.5)*.05*n.scatter;ge(n.tilt,n.yaw,l),h.position.set(z*Math.cos(Q),g,-z*Math.sin(Q)).applyQuaternion(l).add(n.center),h.quaternion.copy(l).multiply(D.setFromAxisAngle($,Q+Math.PI));const A=R*(i*n.tumble*(.6+.8*w.t)+w.t)*(w.w>.5?1:-1);return h.quaternion.multiply(D.setFromAxisAngle(ae,A)),h.quaternion.multiply(D.setFromAxisAngle(j,.35*Math.sin(R*(i*.7+w.w)))),h}const y={cards:r,count:o,size:r.size,object:null,get state(){return n},slot:m,set(b={}){b.center&&H(b.center,n.center);for(const i of["phase","radius","tilt","yaw","tumble","scatter","visible","scale"])b[i]!==void 0&&(n[i]=b[i]);for(let i=0;i<o;i++)m(i,n.phase,s),r.set(i,{position:s.position,quaternion:s.quaternion,flip:0,visible:n.visible,scale:n.scale,shadow:!1});return y},swing(b,i,h,w={}){if(i=E(i),i<=0||i>=1&&w.back!==!1)return y;const Q=w.side??1,z=w.fill??.48,g=w.across??.4,A=w.y??-.05,O=w.scale??n.scale,T=m(b,n.phase,{position:new e.Vector3,quaternion:new e.Quaternion}),U=Ce(h,r.size.height*O,z),B=w.back===!1,k=B?.5:.36,C=B?1:.64,V=M=>ze(h,{distance:U,x:Q*g*(B?1-te(M):ee(1,-1,M)),y:A,yaw:Q*.32*(B?(1-re(M))*.8:ee(.9,-.9,M)),roll:Q*-.05*Math.sin(Math.PI*M)});let F,L;if(i<.08){const M=te(i/.08);F=T.position.clone().lerp(n.center,.06*M),L=T.quaternion.clone().multiply(D.setFromAxisAngle(j,-.25*M))}else if(i<k){const M=(i-.08)/(k-.08),P=me(M),I=V(0);F=T.position.clone().lerp(n.center,.06).lerp(I.position,P),h.updateMatrixWorld();const X=ne.setFromMatrixColumn(h.matrixWorld,1);F.addScaledVector(X,Math.sin(Math.PI*P)*U*.18),L=T.quaternion.clone().multiply(D.setFromAxisAngle(j,-.25)).slerp(I.quaternion,ve(M)),L.premultiply(D.setFromAxisAngle(oe.setFromMatrixColumn(h.matrixWorld,2),Q*.9*(1-re(M,1.4))*K(0,.25,M)))}else if(i<=C){const M=(i-k)/(C-k),P=V(M);F=P.position,L=P.quaternion}else{const M=(i-C)/(1-C),P=V(1),I=ve(M);F=P.position.clone().lerp(T.position,I),h.updateMatrixWorld(),F.addScaledVector(ne.setFromMatrixColumn(h.matrixWorld,1),Math.sin(Math.PI*I)*U*.12),L=P.quaternion.clone().slerp(T.quaternion,I)}return r.set(b,{position:F,quaternion:L,visible:!0,scale:O,shadow:!1,...w.face?{face:w.face}:{}}),y},dispose(){}};return y.set(),y}function Xe(a,t={}){const o=t.count||6,n=t.diameter||.1,u=t.colours||["white","black"],d=a.add(Se(a,{count:o,diameter:n})),c=[];for(let l=0;l<o;l++)c.push({position:new e.Vector3,t:0,spin:1,colour:u[l%u.length],visible:!0,shadow:!1}),d.set(l,{colour:c[l].colour,land:1,ring:!1,shadow:!1});const p=new e.Quaternion,r=new e.Vector3,v={stones:d,count:o,diameter:n,get(l){return c[l]},set(l,s={}){const m=c[l];if(!m)return v;s.center!==void 0?Qe(s.center,s.radius??1,s.phase??0,s,m.position):s.position&&H(s.position,m.position);for(const b of["t","spin","colour","visible","shadow"])s[b]!==void 0&&(m[b]=s[b]);const y=q("moon"+l);return p.setFromAxisAngle(se("moon-tilt"+l,ne).setY(0).normalize(),.5+.5*y+.25*m.spin*Math.sin(R*(.03*m.t+y))),p.multiply(D.setFromAxisAngle($,m.spin*R*(.05*(.7+.6*y)*m.t+y))),r.set(0,-Me.thickness*n*.5,0).applyQuaternion(p).add(m.position),d.set(l,{position:r,quaternion:p,colour:m.colour,visible:m.visible,shadow:m.shadow,land:1,ring:!1,floor:void 0}),v},hideAll(){for(let l=0;l<o;l++)c[l].visible=!1,d.set(l,{visible:!1});return v},dispose(){}};return v}function Ze(a,t={}){const o=t.count||8,n=a.add(pe(a,{count:o,size:t.size||(t.cubeSize?void 0:.1),cubeSize:t.cubeSize,colours:t.colours})),u=n.size,d=[];for(let v=0;v<o;v++)d.push({position:new e.Vector3,base:new e.Quaternion,t:0,drift:1,tumble:1,colour:t.colour??1,scale:1,visible:!0}),n.set(v,{shadow:!1,colour:d[v].colour});const c=new e.Vector3,p=new e.Quaternion,r={blocks:n,count:o,size:u,get(v){return d[v]},set(v,l={}){const s=d[v];if(!s)return r;l.position&&H(l.position,s.position),l.quaternion&&he(l.quaternion,s.base);for(const y of["t","drift","tumble","colour","scale","visible"])l[y]!==void 0&&(s[y]=l[y]);ye(s.t,{seed:"fl"+v,amp:u*.6*s.drift,rate:.07},c).add(s.position),ke(s.t,{seed:"fl"+v,rate:.045*s.tumble,wobble:.35*Math.min(1,s.tumble)},p).premultiply(s.base),s.tumble===0&&p.copy(s.base),c.y-=u*s.scale*.5;const m={position:c,quaternion:p,colour:s.colour,scale:s.scale,visible:s.visible,shadow:!1};return l.tint&&(m.tint=l.tint),l.pop!==void 0&&(m.pop=l.pop),n.set(v,m),r},hideAll(){n.hideAll();for(const v of d)v.visible=!1;return r},dispose(){}};return r}const Pe=`
${N}
attribute vec3 aA; attribute vec3 aB; attribute vec2 aQuad; attribute float aAmt;
uniform float uWidth; uniform float uGap;
varying float vAcross; varying float vAlong; varying float vLen; varying float vAmt; varying float vDist; varying float vHw;
void main() {
  vec4 ca = projectionMatrix * viewMatrix * vec4(aA, 1.0);
  vec4 cb = projectionMatrix * viewMatrix * vec4(aB, 1.0);
  vAmt = aAmt;
  if (ca.w <= 0.0 || cb.w <= 0.0 || aAmt <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 sa = ca.xy / ca.w * 0.5 * uResolution, sb = cb.xy / cb.w * 0.5 * uResolution;   // device px
  vec2 d = sb - sa; float L = max(length(d), 1e-3); vec2 t = d / L; vec2 n = vec2(-t.y, t.x);
  float px = uResolution.y / 720.0;                   // device px per 720p px
  float hw = (uWidth * 0.5 + 1.25) * px;              // half width plus the soft edge
  vec4 c = mix(ca, cb, aQuad.x);
  c.xy += n * aQuad.y * hw / (0.5 * uResolution) * c.w;
  gl_Position = c;
  vAcross = aQuad.y * hw; vAlong = aQuad.x * L; vLen = L; vHw = uWidth * 0.5 * px;
  vDist = length(cameraPosition - mix(aA, aB, aQuad.x));
}`,qe=`
${N}
uniform vec3 uColor; uniform float uOpacity; uniform float uGap;
varying float vAcross; varying float vAlong; varying float vLen; varying float vAmt; varying float vDist; varying float vHw;
void main() {
  float px = uResolution.y / 720.0;
  float gap = uGap * px;
  // the drawn part: from the start star's gap to the pen's head
  float usable = max(vLen - 2.0 * gap, 0.0);
  float head = gap + usable * vAmt;
  if (vAlong > head + 1.5 * px) discard;
  float across = abs(vAcross);
  float core = 1.0 - smoothstep(vHw - 0.6 * px, vHw + 1.1 * px, across);   // a fine line with a soft edge
  float a = core;
  a *= smoothstep(gap - 1.0 * px, gap + 2.0 * px, vAlong) * smoothstep(gap - 1.0 * px, gap + 2.0 * px, vLen - vAlong);
  a *= 1.0 - smoothstep(head - 1.0 * px, head + 1.5 * px, vAlong);           // the round, soft head
  // the pen: a touch brighter just behind the head while it is drawing
  float pen = (1.0 - step(0.999, vAmt)) * exp(-max(head - vAlong, 0.0) / (10.0 * px));
  vec3 col = uColor * (1.0 + 0.7 * pen);
  float hz = exp(-uHazeDensity * vDist);
  gl_FragColor = vec4(linearToOutputTexel(vec4(col, 1.0)).rgb, clamp(a * uOpacity * hz, 0.0, 1.0));
}`,De=`
${N}
attribute vec2 aQuad; attribute vec3 aPos; attribute vec4 aStar;   // light, size (m), dim, seed
uniform float uMinPx;
varying vec2 vQ; varying vec4 vStar; varying float vDist; varying float vR;
void main() {
  vec4 c = projectionMatrix * viewMatrix * vec4(aPos, 1.0);
  vStar = aStar; vQ = aQuad;
  if (c.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // radius in device px: the world size, never under uMinPx (720p px)
  float px720 = uResolution.y / 720.0;
  float rpx = aStar.y / (c.w * uPx * uLineScale) * px720;   // world radius -> device px (uPx: world per css px at d 1)
  rpx = max(rpx, uMinPx * px720);
  float ext = 4.0;                                           // the quad covers the halo
  vR = rpx;
  c.xy += aQuad * rpx * ext / (0.5 * uResolution) * c.w;
  gl_Position = c;
  vDist = length(cameraPosition - aPos);
}`,Be=`
${N}
uniform vec3 uCore; uniform vec3 uWarm; uniform vec3 uDimCol;
varying vec2 vQ; varying vec4 vStar; varying float vDist; varying float vR;
void main() {
  float r = length(vQ) * 4.0;                     // in star radii
  float light = vStar.x;
  float aa = 1.2 / max(vR, 1.0);
  float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);                 // the round star: a crisp soft-edged disc
  float halo = exp(-r * r / 2.2) * 0.55 + exp(-r * 1.15) * 0.25;        // its light in the air around it
  vec3 coreCol = mix(uDimCol, uCore, light);
  vec3 col = coreCol;
  float a = disc * mix(vStar.z, 1.0, light);
  float h = halo * light * (1.0 - disc);
  vec3 outc = col * a + uWarm * h;
  float alpha = max(a, h);
  float hz = exp(-uHazeDensity * vDist);
  gl_FragColor = vec4(linearToOutputTexel(vec4(outc / max(alpha, 1e-4), 1.0)).rgb, clamp(alpha * hz, 0.0, 1.0));
}`;function Re(a){const t=new Float32Array(a*8);for(let o=0;o<a;o++)t.set([0,-1,1,-1,1,1,0,1],o*8);return t}function Oe(a){const t=new(a*4>65535?Uint32Array:Uint16Array)(a*6);for(let o=0;o<a;o++)t.set([o*4,o*4+1,o*4+2,o*4,o*4+2,o*4+3],o*6);return t}function Je(a,t,o={}){const n=t.map(f=>H(f,new e.Vector3)),u=n.length,d=o.edges||Array.from({length:Math.max(0,u-1)},(f,S)=>[S,S+1]),c=d.length,p=new e.Box3().setFromPoints(n),r=Math.max(.001,p.getSize(new e.Vector3).length()),v=o.starSize||r*.012,l=new e.BufferGeometry,s=new e.BufferAttribute(new Float32Array(c*12),3),m=new e.BufferAttribute(new Float32Array(c*12),3),y=new e.BufferAttribute(new Float32Array(c*4),1);s.setUsage(e.DynamicDrawUsage),m.setUsage(e.DynamicDrawUsage),y.setUsage(e.DynamicDrawUsage),l.setAttribute("aA",s),l.setAttribute("aB",m),l.setAttribute("aAmt",y),l.setAttribute("aQuad",new e.BufferAttribute(Re(c),2)),l.setAttribute("position",new e.BufferAttribute(new Float32Array(c*12),3)),l.setIndex(new e.BufferAttribute(Oe(c),1)),l.boundingSphere=new e.Sphere(new e.Vector3,1e6);const b={...a.light,uColor:{value:Z(o.colour||"#F3E3C3")},uOpacity:{value:o.opacity??.85},uWidth:{value:o.width??1.4},uGap:{value:o.gap??7}},i=new e.ShaderMaterial({vertexShader:Pe,fragmentShader:qe,uniforms:b,transparent:!0,depthWrite:!1}),h=new e.Mesh(l,i);h.frustumCulled=!1,h.renderOrder=2;const w=new e.InstancedBufferGeometry;w.setAttribute("position",new e.BufferAttribute(new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),3)),w.setAttribute("aQuad",new e.BufferAttribute(new Float32Array([-1,-1,1,-1,1,1,-1,1]),2)),w.setIndex([0,1,2,0,2,3]);const Q=new e.InstancedBufferAttribute(new Float32Array(u*3),3),z=new e.InstancedBufferAttribute(new Float32Array(u*4),4);Q.setUsage(e.DynamicDrawUsage),z.setUsage(e.DynamicDrawUsage),w.setAttribute("aPos",Q),w.setAttribute("aStar",z),w.instanceCount=u,w.boundingSphere=new e.Sphere(new e.Vector3,1e6);const g={...a.light,uCore:{value:Z(o.star||"#FFF6E4")},uWarm:{value:Z(o.halo||"#FFD9A0")},uDimCol:{value:Z(o.dim||"#9FB0D6")},uMinPx:{value:o.minPx??2.6}},A=new e.ShaderMaterial({vertexShader:De,fragmentShader:Be,uniforms:g,transparent:!0,depthWrite:!1}),O=new e.Mesh(w,A);O.frustumCulled=!1,O.renderOrder=3;const T=new e.Group;T.add(h,O);const U=new Float32Array(c),B=new Float32Array(u),k=o.dimAlpha??.65;let C=!0,V="lit";const F=Z(o.ring||o.halo||"#FFD9A0"),L=o.labels||[],M=o.host||a.canvas&&a.canvas.parentElement,P=[];if(M&&L.some(Boolean))for(let f=0;f<u;f++){const S=L[f];if(!S){P.push(null);continue}const x=document.createElement("div");x.className=o.labelClass||"gx-label",x.textContent=S,Object.assign(x.style,{position:"absolute",left:"0",top:"0",pointerEvents:"none",whiteSpace:"nowrap",willChange:"transform, opacity",font:"600 13px/1.2 Figtree, system-ui, sans-serif",letterSpacing:"0.01em",color:"#F6F2EA",textShadow:"0 1px 2px rgba(8, 14, 34, 0.85), 0 0 10px rgba(8, 14, 34, 0.55)",opacity:"0",zIndex:"4"}),M.appendChild(x),P.push(x)}const I=o.labelOffset,Y=f=>Array.isArray(I)&&Array.isArray(I[0])?I[f]||[0,16]:I||[0,16],X=new e.Vector3,ie=new e.Vector3;function le(f){f=E(f);let S=1,x=0,_=-1;if(f<=0)return{s:1,lit:0,ring:_};if(f<.3)S=1-.18*te(f/.3);else if(f<.65){const W=(f-.3)/.35;S=ee(.82,1.2,re(W,3.2)),x=K(0,.35,W)}else S=1.2;return f>=.65&&(x=1),f>.32&&f<.85&&(_=(f-.32)/.53),{s:S,lit:x,ring:_}}const J={object:T,count:u,edges:d,points:n,starSize:v,labels:P,starShape:le,setPoint(f,S){return H(S,n[f]),J},setEdge(f,S){return U[f]=E(S),J},setStar(f,S){return B[f]=E(S),J},set(f={}){if(f.visible!==void 0&&(C=f.visible),f.draw!==void 0)for(let x=0;x<c;x++)U[x]=te(E((f.draw*(c+.25)-x)/(1+.25)));if(f.draws)for(let S=0;S<c;S++)U[S]=E(f.draws[S]??0);if(f.light!==void 0&&B.fill(E(f.light)),f.lights)for(let S=0;S<u;S++)B[S]=E(f.lights[S]??0);return f.labels!==void 0&&(V=f.labels),J},screenPoints(){return n.map(f=>a.toScreen(f))},setStyle(){},update(f){T.visible=C;for(let x=0;x<c;x++){const[_,W]=d[x];for(let G=0;G<4;G++)s.setXYZ(x*4+G,n[_].x,n[_].y,n[_].z),m.setXYZ(x*4+G,n[W].x,n[W].y,n[W].z),y.setX(x*4+G,C?U[x]:0)}s.needsUpdate=m.needsUpdate=y.needsUpdate=!0;const S=f.camera;for(let x=0;x<u;x++){const _=le(B[x]);Q.setXYZ(x,n[x].x,n[x].y,n[x].z),z.setXYZW(x,_.lit,v*_.s,k,q("st"+x)),C&&_.ring>0&&_.ring<1&&(ie.subVectors(S.position,n[x]).normalize(),f.fx.ring(n[x],ie,_.ring,{width:v*(o.ringSize??4.5),colour:F,dashes:o.ringDashes??0,seed:x+3}));const W=P[x];if(W){const G=f.toScreen(n[x]),ce=Y(x),ue=!C||G.behind?0:V==="lit"?K(.35,.8,B[x]):Number(V);W.style.opacity=ue.toFixed(3),W.style.transform=`translate(${(G.x+ce[0]).toFixed(1)}px, ${(G.y+ce[1]).toFixed(1)}px) translate(-50%, 0) translateY(${((1-ue)*4).toFixed(1)}px)`}}Q.needsUpdate=z.needsUpdate=!0},dispose(){l.dispose(),w.dispose(),i.dispose(),A.dispose();for(const f of P)f&&f.remove()}};return a.add(J),J}const Te=`
${N}
attribute vec2 aQuad; attribute vec4 aSeed; attribute float aKind;
uniform vec3 uHead; uniform vec3 uAway; uniform vec3 uBack; uniform vec3 uP1; uniform vec3 uP2;
uniform float uTime; uniform float uLen; uniform float uSpread; uniform float uSize; uniform float uAmount; uniform float uCurve;
varying vec2 vQ; varying float vAlpha; varying float vKind; varying float vSpark; varying float vDist;
void main() {
  // 0 dust grains (warm white, curved, broad), 1 ion (pale blue, straight, narrow), 2 the veil (a few
  // large faint puffs that join the grains into one soft tail)
  float kind = aKind;
  float ion = step(0.5, kind) * step(kind, 1.5), veil = step(1.5, kind);
  float rate = mix(0.26, 0.46, aSeed.y) * mix(1.0, 1.35, ion) * mix(1.0, 0.7, veil);
  float age = fract(uTime * rate + aSeed.x);
  float L = uLen * uAmount * mix(0.7, 1.15, aSeed.w) * mix(1.0, 1.25, ion) * mix(1.0, 0.8, veil);
  float a2 = age * age;
  vec3 p = uHead + uAway * (L * mix(age, a2 * 0.55 + age * 0.45, 0.5));
  p += uBack * (uCurve * L * a2 * (1.0 - ion));          // the dust bends back along the path; ions do not
  float th = aSeed.z * 6.2831853;
  float rr = sqrt(fract(aSeed.w * 7.13 + aSeed.z * 3.7));
  float spread = uSpread * uAmount * mix(1.0, 0.3, ion) * mix(1.0, 0.75, veil) * (0.1 + sqrt(age));
  p += (uP1 * cos(th) + uP2 * sin(th)) * rr * spread;
  vec4 c = projectionMatrix * viewMatrix * vec4(p, 1.0);
  float sz = uSize * mix(1.3, 0.6, age) * mix(0.6, 1.4, fract(aSeed.y * 5.3)) * mix(1.0, 0.8, ion);
  sz *= mix(1.0, 7.0 + 6.0 * age, veil);
  // a slow glint: a grain catches the sun now and then (gentle, never a strobe)
  float g = 0.5 + 0.5 * sin(6.2831853 * (uTime * mix(0.3, 0.8, aSeed.z) + aSeed.w * 4.0));
  vSpark = pow(g, 8.0) * step(0.72, fract(aSeed.x * 9.1)) * (1.0 - veil);
  sz *= 1.0 + 1.1 * vSpark;
  float px720 = uResolution.y / 720.0;
  float rpx0 = sz / (max(c.w, 1e-3) * uPx * uLineScale) * px720;
  float rpx = max(rpx0, 0.9 * px720);                      // never under a fine grain on screen
  c.xy += aQuad * rpx / (0.5 * uResolution) * c.w;
  gl_Position = c;
  vQ = aQuad; vKind = ion;
  vAlpha = smoothstep(0.0, 0.1, age) * pow(1.0 - age, 1.4) * uAmount * (0.6 + 0.4 * fract(aSeed.z * 13.7));
  // a tail pointing at the lens piles up on the plane: thin it out, and fade grains about to touch the lens
  float fore = abs(dot(uAway, normalize(uHead - cameraPosition)));
  vAlpha *= mix(1.0, 0.4, fore * fore);
  vAlpha *= smoothstep(0.25, 0.9, length(cameraPosition - p));
  vAlpha *= mix(1.0, 0.11, veil) * mix(1.0, 0.85, ion);
  vAlpha *= clamp(rpx0 / rpx, 0.35, 1.0);                  // a grain smaller than a pixel is fainter, not bigger
  vDist = length(cameraPosition - p);
}`,Le=`
${N}
uniform vec3 uDust; uniform vec3 uIon; uniform float uOpacity;
varying vec2 vQ; varying float vAlpha; varying float vKind; varying float vSpark; varying float vDist;
void main() {
  float r = length(vQ);
  if (r > 1.0) discard;
  float core = exp(-r * r * 4.5) * (1.0 - smoothstep(0.8, 1.0, r));
  // a glinting grain shows a tiny four-point catch-light (short and soft, along the screen axes)
  float cross = (exp(-abs(vQ.x) * 24.0) * exp(-vQ.y * vQ.y * 2.5) + exp(-abs(vQ.y) * 24.0) * exp(-vQ.x * vQ.x * 2.5)) * vSpark;
  vec3 col = mix(uDust, uIon, vKind) * uKeyTint;
  float a = (core + 0.7 * cross) * vAlpha * uOpacity * exp(-uHazeDensity * vDist) * 1.5;
  gl_FragColor = vec4(linearToOutputTexel(vec4(col * (1.0 + 0.8 * vSpark), 1.0)).rgb * a, 0.0);
}`,Ie=`
${N}
uniform vec3 uDust; uniform float uOpacity;
varying vec2 vQ; varying float vAlpha; varying float vKind; varying float vSpark; varying float vDist;
void main() {
  float r = length(vQ);
  float a = (exp(-r * r * 7.0) * 0.4 + exp(-r * 4.0) * 0.08) * vAlpha;
  a *= 1.0 - smoothstep(0.85, 1.0, r);
  gl_FragColor = vec4(linearToOutputTexel(vec4(uDust * uKeyTint, 1.0)).rgb * a * uOpacity, 0.0);
}`,_e=`
${N}
attribute vec2 aQuad;
uniform vec3 uHead; uniform vec3 uAway; uniform float uComa; uniform float uAmount;
varying vec2 vQ; varying float vAlpha; varying float vKind; varying float vSpark; varying float vDist;
void main() {
  vec4 c = projectionMatrix * viewMatrix * vec4(uHead, 1.0);
  float px720 = uResolution.y / 720.0;
  float rpx = uComa * uAmount / (max(c.w, 1e-3) * uPx * uLineScale) * px720;
  c.xy += aQuad * rpx / (0.5 * uResolution) * c.w;
  gl_Position = c; vQ = aQuad; vKind = 0.0; vSpark = 0.0; vDist = length(cameraPosition - uHead);
  float fore = abs(dot(uAway, normalize(uHead - cameraPosition)));
  vAlpha = mix(1.0, 0.35, fore);
}`;function et(a,t={}){const o=t.count||700,n=new e.InstancedBufferGeometry;n.setAttribute("position",new e.BufferAttribute(new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),3)),n.setAttribute("aQuad",new e.BufferAttribute(new Float32Array([-1,-1,1,-1,1,1,-1,1]),2)),n.setIndex([0,1,2,0,2,3]);const u=new Float32Array(o*4),d=new Float32Array(o),c=t.ionShare??.25,p=t.veil??.12;for(let g=0;g<o;g++){u.set([q("cx"+g),q("cy"+g),q("cz"+g),q("cw"+g)],g*4);const A=q("ck"+g);d[g]=A<c?1:A<c+p?2:0}n.setAttribute("aSeed",new e.InstancedBufferAttribute(u,4)),n.setAttribute("aKind",new e.InstancedBufferAttribute(d,1)),n.instanceCount=o,n.boundingSphere=new e.Sphere(new e.Vector3,1e6);const r={...a.light,uHead:{value:new e.Vector3},uAway:{value:new e.Vector3(1,0,0)},uBack:{value:new e.Vector3(0,0,-1)},uP1:{value:new e.Vector3(0,1,0)},uP2:{value:new e.Vector3(0,0,1)},uTime:{value:0},uLen:{value:t.length||1.6},uSpread:{value:t.spread??.22},uSize:{value:t.size||.009},uAmount:{value:1},uCurve:{value:t.curve??.35},uOpacity:{value:t.opacity??1},uDust:{value:Z(t.dust||"#FFF2DC")},uIon:{value:Z(t.ion||"#CFE4FF")},uComa:{value:t.coma??.05}},v={transparent:!0,depthWrite:!1,blending:e.CustomBlending,blendSrc:e.OneFactor,blendDst:e.OneFactor,blendSrcAlpha:e.ZeroFactor,blendDstAlpha:e.OneFactor},l=new e.ShaderMaterial({vertexShader:Te,fragmentShader:Le,uniforms:r,...v}),s=new e.Mesh(n,l);s.frustumCulled=!1,s.renderOrder=4;const m=new e.BufferGeometry;m.setAttribute("position",n.getAttribute("position")),m.setAttribute("aQuad",n.getAttribute("aQuad")),m.setIndex([0,1,2,0,2,3]);const y=new e.ShaderMaterial({vertexShader:_e,fragmentShader:Ie,uniforms:r,...v}),b=new e.Mesh(m,y);b.frustumCulled=!1,b.renderOrder=4;const i=new e.Group;i.add(s,b);const h={head:new e.Vector3,sun:null,velocity:new e.Vector3(0,0,1),time:0,amount:1,visible:!0},w=new e.Vector3,Q={object:i,count:o,set(g={}){g.head&&H(g.head,h.head),g.sun!==void 0&&(h.sun=g.sun?H(g.sun,new e.Vector3).normalize():null),g.velocity&&H(g.velocity,h.velocity);for(const A of["time","amount","visible"])g[A]!==void 0&&(h[A]=g[A]);return z(),Q},follow(g,A,O={}){const T=g.get(A);return w.set(0,0,1).applyQuaternion(T.quaternion),Q.set({head:g.tailPoint(A),velocity:w,...O})},setStyle(){},update(){z()},dispose(){n.dispose(),m.dispose(),l.dispose(),y.dispose()}};function z(){i.visible=h.visible&&h.amount>0;const g=h.sun||a.light.uKeyDir.value;r.uAway.value.copy(g).normalize().negate(),r.uHead.value.copy(h.head);const A=r.uBack.value.copy(h.velocity).negate();A.addScaledVector(r.uAway.value,-A.dot(r.uAway.value)),A.lengthSq()<1e-8?A.set(0,0,0):A.normalize();const O=r.uAway.value;r.uP1.value.copy(Math.abs(O.y)<.9?$:j).cross(O).normalize(),r.uP2.value.crossVectors(O,r.uP1.value).normalize(),r.uTime.value=h.time,r.uAmount.value=E(h.amount)}return a.add(Q),Q}function tt(a){return(t,o,n,u,d={})=>{a.follow(o.plane,0,{time:d.time??u*9,amount:d.amount??1,...d.sun?{sun:d.sun}:{}})}}function nt(a,t={}){const o=!t.cube,n=t.cube||a.add(Ae(a,{size:t.size||.3,colours:t.colours})),u=n.size;n.shadowOpacity=0;const d=Array.isArray(t.back)?t.back:[t.back||fe.blue,t.back||fe.blue],c=u*.68,p=a.add(de(a,{faces:["back","back","back","back"],count:4,width:c,back:[d[0],d[0],d[1],d[1]]}));for(let k=0;k<4;k++)p.set(k,{shadow:!1});const r=new e.Quaternion().setFromAxisAngle(ae,Math.PI),v=new e.Vector3,l=new e.Quaternion,s=p.size.height,m=p.size.thickness,y=t.knuckles===!1?null:a.add(pe(a,{count:2,size:u*.12,colours:[t.knuckle||"#EDB43C"]})),b=y?y.size:0,i={position:new e.Vector3,quaternion:new e.Quaternion,wings:0,time:0,drift:1,colour:1,breathe:.6,track:0,visible:!0},h=new e.Vector3,w=new e.Quaternion,Q=new e.Matrix4,z=new e.Vector3,g=new e.Quaternion,A=new e.Quaternion,O=new e.Quaternion().setFromRotationMatrix(new e.Matrix4().makeBasis($.clone(),j.clone().negate(),ae.clone())),T=new e.Quaternion().setFromRotationMatrix(new e.Matrix4().makeBasis($.clone().negate(),j.clone(),ae.clone()));function U(k){k=E(k);const C=k<.18?Math.sin(Math.PI*.5*(k/.18)):1,V=Math.max(0,(k-.18)/.82),F=V<=0?0:V>=1?1:Fe(V*1.6,{response:.55,dampingRatio:.5})*(1-K(.85,1,V))+K(.85,1,V);return{out:m*1.6*C+u*.09*K(.1,.7,V),angle:Math.PI/2*F,k:V}}const B={cube:n,cards:p,knuckles:y,size:u,span:u+2*(s+m*2),wingShape:U,get state(){return i},set(k={}){k.position&&H(k.position,i.position),k.quaternion&&he(k.quaternion,i.quaternion);for(const F of["wings","time","drift","colour","breathe","track","visible"])k[F]!==void 0&&(i[F]=k[F]);ye(i.time,{seed:"sat",amp:[u*.12*i.drift,u*.09*i.drift,u*.08*i.drift],rate:.06},h).add(i.position),w.copy(i.quaternion).multiply(D.setFromAxisAngle(j,.07*i.drift*Math.sin(R*.05*i.time+1.3))).multiply(D.setFromAxisAngle(ae,.09*i.drift*Math.sin(R*.037*i.time+.4))).multiply(D.setFromAxisAngle($,.12*i.drift*Math.sin(R*.029*i.time+2.1))),n.reset(),n.setAllColour(i.colour),i.breathe&&n.breathe(i.time,i.breathe);const C=U(i.wings);C.k>0&&C.k<1&&n.wobble(E(C.k*1.3),.35,[0,0,1]),n.object.position.set(0,-u/2,0).applyQuaternion(w).add(h),n.object.quaternion.copy(w),n.object.visible=i.visible,Q.compose(h,w,new e.Vector3(1,1,1));let V=0;if(i.track>0){const F=ne.copy(a.light.uKeyDir.value).applyQuaternion(D.copy(w).invert());V=Math.atan2(F.y,F.z)*E(i.track)*K(.6,1,i.wings)}for(const F of[1,-1]){const L=F>0?0:1,M=F*(u/2+m*1.6+C.out),P=u/2-m*.5,I=-F*C.angle;if(g.setFromAxisAngle($,I),z.set(0,0,-s/2).applyQuaternion(g).add(oe.set(M,0,P)),A.copy(g).multiply(F>0?O:T),V){const Y=D.setFromAxisAngle(j,-V);z.y=0;const X=z.clone().sub(oe.set(M,0,P));X.applyQuaternion(Y),z.copy(X).add(oe.set(M,0,P)),A.premultiply(Y)}if(z.applyMatrix4(Q),A.premultiply(w),p.set(L*2,{position:z,quaternion:A,visible:i.visible,shadow:!1}),v.set(0,m*.98,0).applyQuaternion(A).add(z),l.copy(A).multiply(r),p.set(L*2+1,{position:v,quaternion:l,visible:i.visible,shadow:!1}),y){const Y=oe.set(F*(u/2+Math.max(C.out*.55,b*.2)),0,u/2-b*.3).applyMatrix4(Q);Y.y-=b/2;const X=we.setFromAxisAngle($,I*.5).premultiply(w);y.set(L,{position:Y,quaternion:X,colour:i.knuckleColour??1,visible:i.visible,shadow:!1})}}return B},dispose(){}};return B.ownsCube=o,B.set(),B}const ot=Object.freeze(["createCardRing","createMoons","createFloaters","createConstellation","createCometTail","createSatellite"]);export{ot as GALAXY_CAST,tt as cometTrail,Ne as createCardRing,et as createCometTail,Je as createConstellation,Ze as createFloaters,Xe as createMoons,nt as createSatellite,ye as drift,ze as faceLens,Ce as lensDistance,Ye as lowHop,Qe as orbit,ge as orbitFrame,se as seedAxis,ke as tumble};
