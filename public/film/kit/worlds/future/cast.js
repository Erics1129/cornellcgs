import*as e from"three";import{RoundedBoxGeometry as Ie}from"three/addons/geometries/RoundedBoxGeometry.js";import{mergeGeometries as ke}from"three/addons/utils/BufferGeometryUtils.js";import{GLSL_COMMON as te,GLSL_FRAG as pe,PALETTE as oe,PLAYER_COLOURS as qe,PAPER as Q,INK as Ne,lin as $}from"../../actors/core.js";import{CELLS as fe,PITCH as he}from"../../actors/cube-layout.js";import{drawFace as De,parseFace as Le}from"../../props/cards.js";import{clamp as W,inOutSine as ce,outBack as xe,bounce as Ue,hash01 as ye,seeded as ve,smoothstep as ge}from"../../ease.js";const Z=(o,t=new e.Vector3)=>o?o.isVector3?t.copy(o):t.fromArray(o):t.set(0,0,0),Me=(o,t=new e.Quaternion)=>o?o.isQuaternion?t.copy(o):t.fromArray(o):t.identity(),J=new e.Vector3(0,1,0),we=9.81,ne=Object.freeze({light:"#FFE6BF",cable:"#5A534C",housing:"#2B2A2E",flap:"#1F1E21",glyph:"#F4ECDC",glassTint:"#9FB7C9",interior:"#F1E4CC"}),We=`
${te}
attribute vec3 aTint;      // albedo (linear); for glowing parts, the colour of the light
attribute vec4 aMat;       // x occlusion (1 open), y rim, z glow, w 1: take the instance colour
attribute vec3 iColour;    // per instance colour
attribute vec4 iState;     // x glow multiplier, y fade (1 shown), z, w
varying vec3 vWorld; varying vec3 vN; varying vec3 vTint; varying vec3 vInst; varying vec4 vMat; varying vec4 vState;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  mat3 m3 = mat3(m);
  vec3 sc = vec3(dot(m3[0], m3[0]), dot(m3[1], m3[1]), dot(m3[2], m3[2]));
  vN = normalize(m3 * (normal / max(sc, vec3(1e-12))));
  vWorld = wp.xyz; vTint = aTint; vInst = iColour; vMat = aMat; vState = iState;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,Oe=`
${te}
${pe}
varying vec3 vWorld; varying vec3 vN; varying vec3 vTint; varying vec3 vInst; varying vec4 vMat; varying vec4 vState;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 base = mix(vTint, vInst, step(0.5, vMat.w));
  vec3 col = lightPlayer(base, N, V, vMat.x, 0.0, 0.5, vMat.y);
  float glow = clamp(vMat.z * vState.x, 0.0, 1.0);
  col = mix(col, vTint, glow);
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function le(o,t={}){return new e.ShaderMaterial({vertexShader:We,fragmentShader:Oe,uniforms:{...o.light},...t})}function F(o,t={},a){let n=o.index?o.toNonIndexed():o.clone();o.dispose(),a&&n.applyMatrix4(a);for(const c of Object.keys(n.attributes))c!=="position"&&c!=="normal"&&n.deleteAttribute(c);const r=n.attributes.position.count,i=$(t.tint||Q),u=new Float32Array(r*3),s=new Float32Array(r*4);for(let c=0;c<r;c++)u[c*3]=i.r,u[c*3+1]=i.g,u[c*3+2]=i.b,s[c*4]=t.occl??1,s[c*4+1]=t.rim??1,s[c*4+2]=t.glow??0,s[c*4+3]=t.inst?1:0;return n.setAttribute("aTint",new e.BufferAttribute(u,3)),n.setAttribute("aMat",new e.BufferAttribute(s,4)),n}const Be=(o,t,a=1)=>new e.Matrix4().compose(new e.Vector3(...o),t,new e.Vector3(a,a,a)),C=(o=[0,0,0],t=[0,0,0],a=[1,1,1])=>new e.Matrix4().compose(new e.Vector3(...o),new e.Quaternion().setFromEuler(new e.Euler(...t)),new e.Vector3(...Array.isArray(a)?a:[a,a,a]));function ee(o,t){const a=ke(o);for(const i of o)i.dispose();const n=new e.InstancedBufferAttribute(new Float32Array(t*3),3),r=new e.InstancedBufferAttribute(new Float32Array(t*4).fill(1),4);return n.setUsage(e.DynamicDrawUsage),r.setUsage(e.DynamicDrawUsage),a.setAttribute("iColour",n),a.setAttribute("iState",r),a.boundingSphere=new e.Sphere(new e.Vector3,1e5),a}function ue(o,t,a){const n=new e.InstancedMesh(o,t,a);return n.instanceMatrix.setUsage(e.DynamicDrawUsage),n.frustumCulled=!1,n}const de=new e.Matrix4().makeScale(0,0,0),R=(o,t,a,n,r=4)=>new Ie(o,t,a,r,Math.min(n,Math.min(o,t,a)/2-1e-4));function be(o,t,a,n){const i=o(Math.max(0,Math.min(1,t-.004))),u=o(Math.max(0,Math.min(1,t))),s=o(Math.max(0,Math.min(1,t+.004))),c=1/(.004*a)**2;return n.set((i.x-2*u.x+s.x)*c,(i.y-2*u.y+s.y)*c,(i.z-2*u.z+s.z)*c)}function Ae(o,t,{seconds:a=6,length:n=.4,damping:r=.22,window:i=2.4,out:u=new e.Vector3}={}){const s=Math.max(.35,n),c=Math.sqrt(we/s),m=c*Math.sqrt(1-r*r),p=28,v=i/p;u.set(0,0,0);const g=new e.Vector3;for(let z=0;z<=p;z++){const V=z*v,S=Math.exp(-r*c*V)*Math.sin(m*V)/m,T=(z===0||z===p?.5:1)*v*S*c*c;be(o,t-V/a,a,g),u.x-=g.x*T/we,u.z-=g.z*T/we}u.y=0;const A=u.length();return A>.75&&u.multiplyScalar(.75/A),u}const Se=[[.33,.33],[-.33,.33],[-.33,-.33],[.33,-.33]],re=Object.freeze({rotorY:.075,rotorR:.15,hookY:-.115,footY:-.19});function Re(){const o=[],t={tint:Q};o.push(F(R(.42,.17,.42,.08,5),{inst:!0})),o.push(F(new e.SphereGeometry(.135,24,12,0,Math.PI*2,0,Math.PI/2),t,C([0,.07,0],[0,0,0],[1,.55,1]))),o.push(F(new e.SphereGeometry(.07,16,10),{tint:Q,occl:.9},C([0,-.085,0],[0,0,0],[1,.45,1])));for(const[a,n]of Se){const r=Math.hypot(a,n),i=new e.CapsuleGeometry(.026,r-.1,4,10);o.push(F(i,t,Be([a/2,.01,n/2],new e.Quaternion().setFromUnitVectors(J,new e.Vector3(a,0,n).normalize())))),o.push(F(new e.CylinderGeometry(.048,.054,.07,20),{inst:!0,occl:.95},C([a,.03,n]))),o.push(F(new e.SphereGeometry(.048,16,8,0,Math.PI*2,0,Math.PI/2),{inst:!0},C([a,.065,n],[0,0,0],[1,.5,1]))),o.push(F(new e.TorusGeometry(.162,.021,10,40),t,C([a,.06,n],[Math.PI/2,0,0])))}for(const a of[-1,1]){o.push(F(new e.CapsuleGeometry(.02,.26,4,10),t,C([a*.13,re.footY+.02,0],[Math.PI/2,0,0])));for(const n of[-1,1])o.push(F(new e.CapsuleGeometry(.014,.08,4,8),{tint:Q,occl:.85},C([a*.115,-.13,n*.08],[0,0,a*.25])))}return o}const Ee=`
${te}
attribute vec4 iRotor;   // x spin angle, y power 0..1, z fade
varying vec2 vP; varying vec4 vR; varying vec3 vWorld;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  vP = position.xz / ${re.rotorR.toFixed(3)}; vR = iRotor; vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,Qe=`
${te}
${pe}
varying vec2 vP; varying vec4 vR; varying vec3 vWorld;
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float a = atan(vP.y, vP.x) - vR.x;
  float pw = clamp(vR.y, 0.0, 1.0);
  // two blades; with power they smear into a pale disc with faint rings
  float w = mix(0.11, 1.05, smoothstep(0.15, 0.85, pw)) * mix(1.0, 0.75, r);
  float s = abs(sin(a));
  float aa = fwidth(s) * 1.5 + 0.01;
  float blade = 1.0 - smoothstep(w - aa, w + aa, s);
  float hub = 1.0 - smoothstep(0.18, 0.22, r);
  float edge = 1.0 - smoothstep(0.93, 1.0, r);
  float spinA = mix(1.0, 0.16 + 0.08 * smoothstep(0.75, 0.97, r) + 0.03 * sin(r * 38.0), smoothstep(0.15, 0.85, pw));
  float alpha = max(blade * spinA * step(0.2, r), hub * 0.0) * edge * vR.z;
  if (alpha < 0.003) discard;
  vec3 N = vec3(0.0, 1.0, 0.0);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 col = lightPlayer(vec3(0.9, 0.89, 0.87), N, V, 1.0, 0.0, 0.5, 0.0);
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col * alpha, alpha));
}`;function ze(o,t,a={}){const{t:n=0,seconds:r=6,bob:i=.015,yaw:u=0,lean:s=1,line:c=.35,seed:m=0}=a,p=.004,v=o(W(t-p)),A=o(W(t+p)).clone().sub(v).divideScalar((Math.min(1,t+p)-Math.max(0,t-p)||p)*r),z=be(o,t,r,new e.Vector3),V=ye("drone"+m)*6.283,S=o(W(t)).clone();S.y+=i*(Math.sin(n*2.1+V)*.7+Math.sin(n*3.3+V*1.7)*.3);const T=new e.Vector3(z.x*.9+A.x*1.6,we,z.z*.9+A.z*1.6);T.x*=s,T.z*=s,T.x+=Math.sin(n*1.3+V)*.18,T.z+=Math.sin(n*1.1+V*2.3)*.18;const I=T.normalize(),U=.5;if(Math.acos(W(I.y,-1,1))>U){const P=new e.Vector3(I.x,0,I.z).normalize();I.copy(P.multiplyScalar(Math.sin(U))).setY(Math.cos(U))}const N=new e.Quaternion().setFromUnitVectors(J,I).multiply(new e.Quaternion().setFromAxisAngle(J,u)),f=Ae(o,t,{seconds:r,length:c}),B=new e.Vector3(f.x,-1,f.z).normalize();return{position:S,quaternion:N,velocity:A,swing:B,rotor:1,spin:n*38+V,path:o}}function _e(o,t,{shape:a="V",spacing:n=1}={}){if(a==="line")return new e.Vector3((o-(t-1)/2)*n,0,0);if(a==="column")return new e.Vector3(0,o*n*.08,-o*n);if(a==="arc"){const u=(o-(t-1)/2)*.5;return new e.Vector3(Math.sin(u)*n*1.8,0,(Math.cos(u)-1)*n*1.8)}const r=Math.ceil(o/2),i=o%2?1:-1;return new e.Vector3(i*r*n*.85,r*n*.06,-r*n*.7)}function gt(o,t,a,n={}){const{shape:r="V",spacing:i=1,lag:u=.02}=n,s=m=>{const p=o(W(m-.01)),g=o(W(m+.01)).sub(p);return g.y=0,g.lengthSq()>1e-10?Math.atan2(g.x,g.z):0},c=[];for(let m=0;m<a;m++){const p=_e(m,a,{shape:r,spacing:i}),v=m===0?0:u*(r==="line"?.3:Math.ceil(m/2)),A=ze(z=>{const V=z-v,S=s(V);return o(W(V)).add(p.clone().applyAxisAngle(J,S))},t,{...n,seed:(n.seed||0)*31+m});A.index=m,c.push(A)}return c}function wt(o,t={}){const a=t.count||3,n=t.size||.5,r=t.colours||qe,i=le(o),u=ue(ee(Re(),a),i,a),s=ee([F(new e.CylinderGeometry(1,1,1,8,1),{tint:ne.cable,rim:.3},C([0,-.5,0]))],a),c=ue(s,i,a),m=ee([F(R(.06,.03,.06,.012,2),{tint:Ne,occl:.9})],a),p=ue(m,i,a),v=new e.CircleGeometry(re.rotorR,48).rotateX(-Math.PI/2),g=new e.InstancedBufferAttribute(new Float32Array(a*4*4),4);g.setUsage(e.DynamicDrawUsage),v.setAttribute("iRotor",g);const A=new e.ShaderMaterial({vertexShader:Ee,fragmentShader:Qe,uniforms:{...o.light},transparent:!0,depthWrite:!1,side:e.DoubleSide,premultipliedAlpha:!0,blending:e.CustomBlending,blendSrc:e.OneFactor,blendDst:e.OneMinusSrcAlphaFactor});A.extensions={derivatives:!0};const z=ue(v,A,a*4);z.renderOrder=2;const V=new e.Group;V.add(u,c,p,z);const S=u.geometry.getAttribute("iColour"),T=[];for(let M=0;M<a;M++){const d=$(r[M%r.length]);S.setXYZ(M,d.r,d.g,d.b),T.push({position:new e.Vector3,quaternion:new e.Quaternion,rotor:1,spin:0,swing:new e.Vector3(0,-1,0),line:0,visible:!1,shadow:!0,shadowOpacity:.8,hex:r[M%r.length]})}const I=new e.Matrix4,U=new e.Quaternion,G=new e.Vector3,N=new e.Vector3,f=new e.Vector3,B=(M,d=new e.Vector3)=>d.set(0,re.hookY*n,0).applyQuaternion(M.quaternion).add(M.position),P={object:V,count:a,size:{span:n,foot:-re.footY*n,hook:-re.hookY*n,height:.3*n},get(M){return T[M]},set(M,d){const h=T[M];if(!h)return P;d.position&&Z(d.position,h.position),d.quaternion&&Me(d.quaternion,h.quaternion),d.swing&&Z(d.swing,h.swing);for(const b of["rotor","spin","line","visible","shadow","shadowOpacity"])d[b]!==void 0&&(h[b]=d[b]);if(d.colour&&d.colour!==h.hex){h.hex=d.colour;const b=$(d.colour);S.setXYZ(M,b.r,b.g,b.b),S.needsUpdate=!0}return d.visible===void 0&&d.position&&(h.visible=!0),P},hideAll(){for(const M of T)M.visible=!1;return P},hookPoint(M,d){return B(T[M],d)},lineEnd(M,d=new e.Vector3){const h=T[M];return B(h,d).addScaledVector(h.swing,h.line)},hang(M,d="card",h={}){return $e(T[M],P.lineEnd(M),d,h)},deliver(M,d,h={}){const b=Ye(d,{...h,span:n});P.set(M,{...b.drone,line:b.line});const l=h.kind||"card";if(l==="card-up"&&(b.payload.free||b.payload.onGround&&d>=.5))return{...Fe(Z(h.to||h.from),h.size||{},h.yaw||0,b.tip),free:b.payload.free};if(b.payload.free)return{...b.payload.rest,free:!0};const w=P.hang(M,l,h.size||{});if(b.payload.rest){const y=b.payload.rest.position.y;if(w.position.y<=y+1e-4||b.payload.onGround)return{...b.payload.rest,free:!1}}return w},setStyle(){},update(M){for(let d=0;d<a;d++){const h=T[d];if(!h.visible){u.setMatrixAt(d,de),c.setMatrixAt(d,de),p.setMatrixAt(d,de);for(let b=0;b<4;b++)z.setMatrixAt(d*4+b,de);continue}I.compose(h.position,h.quaternion,f.set(n,n,n)),u.setMatrixAt(d,I);for(let b=0;b<4;b++){const[l,w]=Se[b];G.set(l*n,re.rotorY*n,w*n).applyQuaternion(h.quaternion).add(h.position);const y=new e.Matrix4().compose(G,h.quaternion,f.set(n,n,n));z.setMatrixAt(d*4+b,y);const q=b%2?-1:1;g.setXYZW(d*4+b,q*h.spin*(.4+.6*h.rotor)+b*.9,h.rotor,1,0)}if(h.line>.002){B(h,G),U.setFromUnitVectors(new e.Vector3(0,-1,0),h.swing);const b=.0055*n/.5;c.setMatrixAt(d,I.compose(G,U,f.set(b,h.line,b))),N.copy(G).addScaledVector(h.swing,h.line),p.setMatrixAt(d,I.compose(N,U,f.set(n*.5,n*.5,n*.5)))}else c.setMatrixAt(d,de),p.setMatrixAt(d,de);if(h.shadow&&h.shadowOpacity>0){const b=new e.Vector3(n*.42,0,0).applyQuaternion(h.quaternion);b.y=0;const l=new e.Vector3(0,0,n*.42).applyQuaternion(h.quaternion);l.y=0,M.shadows.cast(h.position,b,l,{opacity:h.shadowOpacity,shape:0,round:.9,size:n,base:-re.footY*n})}}u.instanceMatrix.needsUpdate=!0,c.instanceMatrix.needsUpdate=!0,p.instanceMatrix.needsUpdate=!0,z.instanceMatrix.needsUpdate=!0,g.needsUpdate=!0},dispose(){u.geometry.dispose(),s.dispose(),m.dispose(),v.dispose(),i.dispose(),A.dispose()}};return P}function $e(o,t,a,n){const r=Math.atan2(2*(o.quaternion.w*o.quaternion.y+o.quaternion.x*o.quaternion.z),1-2*(o.quaternion.y*o.quaternion.y+o.quaternion.z*o.quaternion.z)),i=new e.Quaternion().setFromUnitVectors(new e.Vector3(0,-1,0),o.swing),u=new e.Quaternion().setFromAxisAngle(J,r),s=o.swing.clone();if(a==="block"){const m=typeof n=="number"?n:n.edge||n.size||.1;return{position:t.clone().addScaledVector(s,m),quaternion:i.multiply(u)}}if(a==="card-up"){const m=n.height||.088,p=i.multiply(u).multiply(new e.Quaternion().setFromAxisAngle(new e.Vector3(1,0,0),Math.PI/2));return{position:t.clone().addScaledVector(s,m/2+.002),quaternion:p}}const c=n.thickness||.0023;return{position:t.clone().addScaledVector(s,c/2+.001),quaternion:i.multiply(u)}}function je(o,t){return o==="block"?typeof t=="number"?t:t.edge||t.size||.1:o==="card-up"?(t.height||.088)+.002:(t.thickness||.0023)+.001}function Ye(o,t={}){const a=t.span||.5,n=Z(t.from,new e.Vector3),r=Z(t.to||t.from,new e.Vector3),i=t.kind||"card",u=je(i,t.size||{}),s=t.line??.35,c=t.seconds||7,m=t.cruise??1.2,p=-re.hookY*a,v=Z(t.away||[0,1.2,-1.5],new e.Vector3),g=n.y+u+s+p,A=r.y+u+s+p,z=Math.max(g,A)+m,S=ze(P=>{const M=new e.Vector3;if(P<.1){const d=P/.1;M.set(n.x,g-.12*s*Math.sin(Math.PI*d)*.5,n.z)}else if(P<.28){const d=ce((P-.1)/.18);M.set(n.x,g+(z-g)*d,n.z)}else if(P<.7){const d=ce((P-.28)/.42);M.lerpVectors(n,r,d),M.y=z+Math.sin(Math.PI*d)*m*.18}else if(P<.84){const d=ce((P-.7)/.14);M.set(r.x,z+(A-.35*s-z)*d,r.z)}else if(P<.9)M.set(r.x,A-.35*s,r.z);else{const d=ce((P-.9)/.1);M.set(r.x,A-.35*s,r.z).addScaledVector(v,d)}return M},W(o),{t:t.t||0,seconds:c,yaw:t.yaw||0,line:s,seed:t.seed||0,bob:o<.1||o>.7&&o<.9?.004:.012}),T=ge(.86,.96,o);let I=s*(1-.8*T);const U=.55+.45*ge(0,.08,o),G=Ve(n,i,t.size||{},t.yaw||0),N=Ve(r,i,t.size||{},t.yaw||0);let f;if(o>=.86)f={free:!0,rest:N};else if(o<.5){const P=S.position.y-p-s;f={rest:G,onGround:P-u<=n.y+1e-4},f.onGround&&(I=Math.max(.02,Math.min(s,S.position.y-p-(n.y+u))))}else{const P=S.position.y-p-s;f={rest:N,onGround:P-u<=r.y+1e-4},f.onGround&&(I=Math.max(.02,Math.min(s,S.position.y-p-(r.y+u))))}(f.onGround||f.free)&&S.swing.set(0,-1,0);const B=1-Ue(W((o-.79)/.09),2,.22);return{drone:{position:S.position,quaternion:S.quaternion,swing:S.swing,rotor:U,spin:S.spin},line:I,payload:f,tip:B}}function Fe(o,t,a,n){const r=t.height||.088,i=t.thickness||.0023,u=new e.Quaternion().setFromAxisAngle(J,a),s=Math.PI/2*(1-n),c=new e.Quaternion().setFromAxisAngle(new e.Vector3(1,0,0),s),p=new e.Vector3(0,i/2,r/2).clone().sub(new e.Vector3(0,0,r/2).applyQuaternion(c));return p.y=Math.max(p.y,i/2),{position:o.clone().add(p.applyQuaternion(u)),quaternion:u.clone().multiply(c),floor:o.y}}function Ve(o,t,a,n){const r=new e.Quaternion().setFromAxisAngle(J,n);if(t==="block")return{position:o.clone(),quaternion:r,floor:void 0};if(t==="card-up")return Fe(o,a,n,0);const i=a.thickness||.0023;return{position:o.clone().setY(o.y+i/2),quaternion:r,floor:o.y}}const Y=Object.freeze({w:1,h:.66,d:.56,r:.15,drop:.62}),He=`
// windows of the cabin (local cabin coords, centre of the cabin at 0): returns 1 inside a window
float rrect(vec2 p, vec2 c, vec2 hs, float r) { vec2 q = abs(p - c) - hs + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float winMask(vec3 p, vec3 n, float aa) {
  float m = 0.0;
  if (abs(n.z) > 0.45) {
    float d = rrect(p.xy, vec2(-0.03, 0.055), vec2(0.36, 0.125), 0.06);
    if (n.z > 0.0) d = max(d, -rrect(p.xy, vec2(0.205, -0.03), vec2(0.15, 0.25), 0.05));   // the door's opening is cut on its own
    m = max(m, 1.0 - smoothstep(-aa, aa, d));
  }
  if (abs(n.x) > 0.45) {
    float d = rrect(p.zy, vec2(0.0, 0.055), vec2(0.17, 0.125), 0.06);
    m = max(m, 1.0 - smoothstep(-aa, aa, d));
  }
  return m;
}
float doorHole(vec3 p, vec3 n) {
  if (n.z < 0.3) return 0.0;
  return step(rrect(p.xy, vec2(0.205, -0.03), vec2(0.15, 0.25), 0.05), 0.0);
}`,Ze=`
${te}
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vLocalN;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vLocal = position; vLocalN = normal; vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,Xe=`
${te}
${pe}
${He}
uniform vec3 uBody; uniform vec3 uBand; uniform float uMode;   // 0 shell, 1 glass, 2 door panel, 3 door glass
uniform vec3 uSky;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vLocalN;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  if (uMode < 0.5) {
    if (winMask(vLocal, normalize(vLocalN), 0.0001) > 0.5 || doorHole(vLocal, normalize(vLocalN)) > 0.5) discard;
    // paper body, the line's colour as a soft band low on the cabin, a thin pinstripe above the windows
    float band = 1.0 - smoothstep(-0.186, -0.180, vLocal.y);
    float stripe = (1.0 - smoothstep(0.004, 0.007, abs(vLocal.y - 0.205))) * step(0.5, abs(vLocalN.z) + abs(vLocalN.x));
    vec3 base = mix(uBody, uBand, max(band, stripe * 0.85));
    float occl = mix(0.86, 1.0, smoothstep(-0.33, -0.2, vLocal.y));
    vec3 col = lightPlayer(base, N, V, occl, 0.0, 0.5, 1.0);
    gl_FragColor = linearToOutputTexel(vec4(haze(shoulder(col), dist), 1.0));
    return;
  }
  if (uMode > 1.5 && uMode < 2.5) {
    // the door panel: paper with its own window cut out (the door glass fills it)
    float d = rrect(vLocal.xy, vec2(0.0, 0.07), vec2(0.105, 0.12), 0.045);
    if (d < 0.0 && abs(vLocalN.z) > 0.5) discard;
    vec3 col = lightPlayer(uBody, N, V, 1.0, 0.0, 0.5, 1.0);
    gl_FragColor = linearToOutputTexel(vec4(haze(shoulder(col), dist), 1.0));
    return;
  }
  float m = uMode < 1.5 ? winMask(vLocal, normalize(vLocalN), fwidth(vLocal.x) * 1.5) : 1.0;
  if (m < 0.01) discard;
  // glass: a clear pane that mirrors the sky at grazing angles, a soft broad highlight from the sun
  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uSky * 0.85, uSky * 1.1 + 0.05, smoothstep(-0.2, 0.6, R.y));
  float sun = pow(max(dot(R, uKeyDir), 0.0), 40.0) * 0.6;
  float a = clamp(0.16 + 0.8 * fres + sun, 0.0, 0.92) * m;
  vec3 col = (sky * (0.35 + 0.65 * fres) + uRimColor * sun) ;
  col = haze(col, dist);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0)) * a;
}`;function me(o,t,a){const n=new e.ShaderMaterial({vertexShader:Ze,fragmentShader:Xe,uniforms:{...o.light,...a,uMode:{value:t}}});return n.extensions={derivatives:!0},(t===1||t===3)&&(n.transparent=!0,n.depthWrite=!1,n.premultipliedAlpha=!0,n.blending=e.CustomBlending,n.blendSrc=e.OneFactor,n.blendDst=e.OneMinusSrcAlphaFactor),n}function Ke(o,t,a){const n=Z(o,new e.Vector3),r=Z(t,new e.Vector3),i=n.distanceTo(r);return u=>{const s=new e.Vector3().lerpVectors(n,r,u);return s.y-=4*a*i*u*(1-u),s}}function yt(o,t={}){const{from:a=.2,to:n=.6,start:r=0,seconds:i=6,length:u=30,hang:s=1.2}=t,c=i+12,m=S=>{const T=S*c+r-2,I=ce((T-r)/i);return new e.Vector3((a+(n-a)*I)*u,0,0)},p=(o-r+2)/c,v=a+(n-a)*ce((o-r)/i),g=Ae(m,W(p),{seconds:c,length:s,damping:.16,window:4}),A=W(Math.sin(Math.PI*W((o-r)/i))*3),z=ge(r+i,r+i+1.5,o),V=.012*Math.sin(o*.9)+.006*Math.sin(o*2.3+1);return{at:v,swing:Math.atan(g.x),sway:V,moving:A,arrived:z}}function xt(o,t={}){const a=t.length||2.2,n=t.colour||oe.carnelian,r=new e.Group,i=new e.Group,u=new e.Group,s=new e.Group;r.add(i),i.add(u),u.add(s),s.position.set(0,-Y.drop,0),u.scale.setScalar(a);const c={value:$("#C9D6E2")},m={uBody:{value:$(Q)},uBand:{value:$(n)},uSky:c},p=R(Y.w,Y.h,Y.d,Y.r,8),v=new e.Mesh(p,me(o,0,m)),g=new e.Mesh(p,me(o,1,m));g.scale.setScalar(1.001),g.renderOrder=3;const A=le(o,{side:e.BackSide}),z=le(o),V=new e.InstancedMesh(ee([F(R(Y.w-.04,Y.h-.04,Y.d-.04,Y.r-.02,6),{tint:ne.interior,occl:.85,glow:.22,rim:0})],1),A,1),S=t.seatColour||n,T=[];T.push(F(R(.7,.02,.38,.01,2),{tint:"#CDBFAA",occl:.7,rim:0,glow:.08},C([0,-.268,0]))),T.push(F(R(.34,.06,.13,.025,3),{tint:S,occl:.9,rim:.3,glow:.1},C([-.2,-.17,-.18]))),T.push(F(R(.34,.16,.04,.018,3),{tint:S,occl:.85,rim:.3,glow:.1},C([-.2,-.07,-.245]))),T.push(F(R(.3,.012,.02,.005,2),{tint:"#FFF4DE",glow:1,rim:0},C([0,.27,0])));const I=new e.InstancedMesh(ee(T,1),z,1),U=ee([F(R(.13,.035,.12,.016,3),{tint:S,occl:.95,rim:.5,glow:.1},C([0,0,.06]))],1),G=new e.InstancedMesh(U,z,1),N=new e.InstancedMesh(ee([F(R(.13,.15,.03,.014,3),{tint:S,occl:.9,rim:.3,glow:.1},C([.205,-.08,-.255]))],1),z,1),f=new e.Group;f.position.set(.205,-.17,-.24),f.add(G);for(const x of[V,I,G,N])x.setMatrixAt(0,new e.Matrix4),x.frustumCulled=!1;const B=new e.Group,P=R(.3,.5,.018,.05,4),M=new e.Mesh(P,me(o,2,m)),d=new e.PlaneGeometry(.22,.25).translate(0,.07,.0095),h=new e.Mesh(d,me(o,3,m));h.renderOrder=3,B.add(M,h);const b=new e.InstancedMesh(ee([F(new e.CapsuleGeometry(.018,Y.drop-Y.h/2-.05,4,12),{tint:"#D9D4CB",rim:.6},C([0,-(Y.drop-Y.h/2)/2-.01,0])),F(R(.16,.03,.1,.014,3),{tint:"#D9D4CB",occl:.9},C([0,-(Y.drop-Y.h/2)+.005,0])),F(new e.CapsuleGeometry(.045,.2,6,16),{tint:Q},C([0,.012,0],[0,0,Math.PI/2],[1,1,.8])),F(new e.CapsuleGeometry(.047,.07,6,16),{inst:!0},C([0,.012,0],[0,0,Math.PI/2],[1,1,.82]))],1),z,1);b.setMatrixAt(0,new e.Matrix4),b.frustumCulled=!1;{const x=$(n);b.geometry.getAttribute("iColour").setXYZ(0,x.r,x.g,x.b)}u.add(b),s.add(V,I,f,N,v,g,B);for(const x of[v,g,M,h])x.frustumCulled=!1;let l=null,w=null,y=null,q=0;const L=64;if(t.line){l=Ke(t.line.from,t.line.to,t.line.sag??.015),q=Z(t.line.from).distanceTo(Z(t.line.to)),y=ee([F(new e.CylinderGeometry(1,1,1,8,1),{tint:ne.cable,rim:.5})],L),w=ue(y,z,L);const x=t.line.radius||.012*a/2.2,D=new e.Vector3,_=new e.Vector3,X=new e.Vector3,ie=new e.Quaternion,H=new e.Matrix4;for(let O=0;O<L;O++)D.copy(l(O/L)),_.copy(l((O+1)/L)),X.addVectors(D,_).multiplyScalar(.5),ie.setFromUnitVectors(J,_.clone().sub(D).normalize()),H.compose(X,ie,new e.Vector3(x,D.distanceTo(_)*1.02,x)),w.setMatrixAt(O,H);r.add(w)}const k={at:0,swing:0,sway:0,door:0,seat:1,lights:1,visible:!0,position:null,quaternion:null},E={object:r,length:a,lineLength:q,lineAt(x){return l?l(W(x)):new e.Vector3},set(x){return Object.assign(k,x),E},cabinPoint(x=[0,0,0]){return r.updateMatrixWorld(!0),s.localToWorld(new e.Vector3().fromArray(x))},seatPoint(){return E.cabinPoint([.205,-.15,-.18])},setStyle(){},update(x){if(r.visible=k.visible,!k.visible)return;if(k.position||!l)i.position.copy(Z(k.position)),i.quaternion.copy(Me(k.quaternion));else{const H=l(W(k.at)),O=l(W(k.at+.002)),j=l(W(k.at-.002));i.position.copy(H);const K=O.sub(j);K.y=0,K.normalize(),i.quaternion.setFromUnitVectors(new e.Vector3(1,0,0),K.lengthSq()>0?K:new e.Vector3(1,0,0))}u.rotation.set(k.sway,0,k.swing);const D=W(k.door),_=ge(0,.25,D),X=D<=.25?0:xe((D-.25)/.75,.9);B.position.set(.205-X*.29,-.03,Y.d/2-.006+_*.022);const ie=W(k.seat);if(f.rotation.x=-(Math.PI/2)*(1-(ie<=0?0:xe(ie,2.2))),V.geometry.getAttribute("iState").setX(0,k.lights),V.geometry.getAttribute("iState").needsUpdate=!0,I.geometry.getAttribute("iState").setX(0,k.lights),I.geometry.getAttribute("iState").needsUpdate=!0,c.value.copy(x.light.uHazeColor.value).lerp(x.light.uKeyTint.value,.25),k.shadow){r.updateMatrixWorld(!0);const H=s.localToWorld(new e.Vector3),O=new e.Vector3(.5*a,0,0).applyQuaternion(i.quaternion),j=new e.Vector3(0,0,.28*a).applyQuaternion(i.quaternion);x.shadows.cast(H,O,j,{opacity:k.shadowOpacity??.6,size:a,base:.33*a,round:.5,extent:.66*a})}},dispose(){p.dispose(),P.dispose(),d.dispose(),y&&y.dispose();for(const x of[V,I,G,N,b])x.geometry.dispose();for(const x of[v,g,M,h])x.material.dispose();A.dispose(),z.dispose()}};return E}const ae=" ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.,-'&/?!",Je=`
${te}
attribute vec4 iFlap;   // x glyph (front), y glyph (back), z kind (0 static top, 1 static bottom, 2 flap), w angle (rad)
attribute float iShade; // the falling flap's shadow on the static bottom 0..1
varying vec2 vUv; varying vec4 vF; varying vec3 vWorld; varying vec3 vN; varying float vShade;
void main() {
  vF = iFlap; vShade = iShade;
  vec3 p = position;   // a half-cell quad: x -0.5..0.5, y 0..1 (top half) in cell units (cells are scaled)
  vUv = vec2(position.x + 0.5, position.y);
  vec3 n = vec3(0.0, 0.0, 1.0);
  if (iFlap.z > 0.5 && iFlap.z < 1.5) { p.y = -p.y; n = vec3(0.0, 0.0, 1.0); }
  if (iFlap.z > 1.5) {
    float a = iFlap.w;
    float c = cos(a), s = sin(a);
    p = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
    n = vec3(0.0, -s, c);
  }
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(p, 1.0);
  vN = normalize(mat3(m) * n);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,et=`
${te}
${pe}
uniform sampler2D uAtlas; uniform vec2 uGrid; uniform vec3 uFlapCol; uniform vec3 uGlyphCol; uniform float uAspect;
varying vec2 vUv; varying vec4 vF; varying vec3 vWorld; varying vec3 vN; varying float vShade;
float glyphAt(float g, vec2 uv) {
  float gx = mod(g, uGrid.x), gy = floor(g / uGrid.x);
  vec2 a = (vec2(gx, gy) + vec2(uv.x, 1.0 - uv.y)) / uGrid;
  return texture2D(uAtlas, vec2(a.x, 1.0 - a.y)).a;
}
void main() {
  vec3 N = normalize(vN);
  bool back = !gl_FrontFacing && vF.z > 1.5;
  if (back) N = -N;
  // which glyph and which half: front of a top piece = the glyph's top half (v 0.5..1)
  float g; float gv;
  if (vF.z < 0.5) { g = vF.x; gv = 0.5 + 0.5 * vUv.y; }
  else if (vF.z < 1.5) { g = vF.x; gv = 0.5 - 0.5 * vUv.y; }
  else if (!back) { g = vF.x; gv = 0.5 + 0.5 * vUv.y; }
  else { g = vF.y; gv = 0.5 - 0.5 * vUv.y; }
  // rounded corners on the outer edge of each half, a hairline gap at the hinge
  vec2 q = vec2(abs(vUv.x - 0.5) * uAspect, 1.0 - vUv.y);
  float rr = 0.09;
  vec2 cq = vec2(q.x - (0.5 * uAspect - rr), rr - q.y);
  if (cq.x > 0.0 && cq.y > 0.0 && length(cq) > rr) discard;
  float ink = glyphAt(g, vec2(vUv.x, gv));
  vec3 base = mix(uFlapCol, uGlyphCol, ink);
  // the flap is a little convex: lighter in the middle of each half, darker toward the hinge
  float hinge = smoothstep(0.0, 0.12, vUv.y);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 col = lightPlayer(base, N, V, mix(0.55, 1.0, hinge), 0.0, 0.5, 0.25);
  col *= 1.0 - 0.45 * vShade * step(0.5, vF.z) * step(vF.z, 1.5);
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function tt(o){const a=Math.ceil(ae.length/8),n=128,r=176,i=document.createElement("canvas");i.width=8*n,i.height=a*r;const u=i.getContext("2d");u.fillStyle="#fff",u.textAlign="center",u.textBaseline="alphabetic",u.font=`700 ${Math.round(r*.74)}px ${o}`;for(let c=0;c<ae.length;c++){const m=ae[c];if(m===" ")continue;const p=c%8,v=Math.floor(c/8),g=r*.74;u.fillText(m,p*n+n/2,v*r+r/2+g*.35)}const s=new e.CanvasTexture(i);return s.colorSpace=e.NoColorSpace,s.generateMipmaps=!0,s.minFilter=e.LinearMipmapLinearFilter,s.anisotropy=8,{tex:s,grid:[8,a]}}const Pe=o=>{const t=ae.indexOf(String(o||" ").toUpperCase());return t<0?0:t};function ot(o){if(o=W(o),o<.72){const a=o/.72;return Math.PI*(a*a*(.35+.65*a))}const t=(o-.72)/.28;return Math.PI-.16*Math.sin(Math.PI*t)*(1-t*.3)}function Ce(o,t,a,n,r,i={}){const u=i.stagger??.6,s=i.rowDelay??1.5,c=[];let m=0;for(let v=0;v<n;v++)for(let g=0;g<r;g++){const A=Pe((o[v]||"")[g]),V=(Pe((t[v]||"")[g])-A+ae.length)%ae.length,S=g*u+v*s+ye("flap"+v+":"+g)*.8;c.push({a:A,steps:V,delay:S}),m=Math.max(m,S+V)}const p=W(a)*(i.speed?i.speed:m+.001);for(const v of c)v.f=W(p-v.delay,0,v.steps);return c}function Mt(o,t={}){const a=t.rows||2,n=t.cols||13,r=t.cell||.09,i=r*.7,u=t.gap??.12,s=tt(t.font||'Figtree, "Helvetica Neue", Arial, sans-serif'),c=a*n*3,m=new e.PlaneGeometry(1,1,1,1).translate(0,.5,0),p=new e.InstancedBufferGeometry;p.setAttribute("position",m.getAttribute("position")),p.setIndex(m.getIndex());const v=new e.InstancedBufferAttribute(new Float32Array(c*4),4);v.setUsage(e.DynamicDrawUsage);const g=new e.InstancedBufferAttribute(new Float32Array(c),1);g.setUsage(e.DynamicDrawUsage),p.setAttribute("iFlap",v),p.setAttribute("iShade",g),p.boundingSphere=new e.Sphere(new e.Vector3,1e5);const A=r*(1-u)/2,z=i*(1-u*.8),V=new e.ShaderMaterial({vertexShader:Je,fragmentShader:et,side:e.DoubleSide,uniforms:{...o.light,uAtlas:{value:s.tex},uGrid:{value:new e.Vector2(...s.grid)},uFlapCol:{value:$(t.flap||ne.flap)},uGlyphCol:{value:$(t.glyph||ne.glyph)},uAspect:{value:z/A}}});V.extensions={derivatives:!0};const S=ue(p,V,c),T=new e.Group,I=n*i,U=a*r,G=r*.32,N=ee([F(R(I+G*2,U+G*2,r*.5,r*.22,5),{tint:t.housing||ne.housing,occl:.95,rim:.8},C([0,0,-r*.25-.002])),...t.frame===!1?[]:[F(R(I+G*2.5,r*.2,r*.62,r*.09,4),{tint:t.trim||Q,rim:1},C([0,U/2+G*.95,-r*.24]))]],1),f=new e.InstancedMesh(N,le(o),1);f.setMatrixAt(0,new e.Matrix4),f.frustumCulled=!1,T.add(f,S);const B=new e.Matrix4,P=new e.Vector3,M=new e.Vector3(z,A,A),d=new e.Quaternion;for(let l=0;l<a;l++)for(let w=0;w<n;w++){const y=(l*n+w)*3;P.set(-I/2+(w+.5)*i,U/2-(l+.5)*r,0),B.compose(P,d,M),S.setMatrixAt(y,B),S.setMatrixAt(y+1,B),P.z+=8e-4,B.compose(P,d,M),S.setMatrixAt(y+2,B)}let h={from:[],to:[],amount:1};const b={object:T,rows:a,cols:n,size:{width:I+G*2,height:U+G*2,cell:r},flip(l,w,y,q={}){return h={from:l.map(L=>String(L).toUpperCase()),to:w.map(L=>String(L).toUpperCase()),amount:y,o:q},b},show(l){return b.flip(l,l,1)},text(){const l=Ce(h.from,h.to,h.amount,a,n,h.o),w=[];for(let y=0;y<a;y++){let q="";for(let L=0;L<n;L++){const k=l[y*n+L];q+=ae[(k.a+Math.floor(k.f+1e-6))%ae.length]}w.push(q)}return w},cellPoint(l,w){return T.updateMatrixWorld(!0),T.localToWorld(new e.Vector3(-I/2+(w+.5)*i,U/2-(l+.5)*r,0))},setStyle(){},update(){const l=Ce(h.from,h.to,h.amount,a,n,h.o),w=ae.length;for(let y=0;y<l.length;y++){const q=l[y],L=Math.floor(q.f+1e-6),k=q.f-L,E=(q.a+L)%w,x=(E+1)%w,D=L<q.steps&&k>1e-6,_=D?ot(k):0,X=D?Math.sin(Math.min(_,Math.PI/2))*(_<Math.PI*.92?1:.3):0;v.setXYZW(y*3,x,0,0,0),v.setXYZW(y*3+1,E,0,1,0),v.setXYZW(y*3+2,E,x,2,_),g.setX(y*3+1,_>Math.PI*.5?0:X)}v.needsUpdate=!0,g.needsUpdate=!0},dispose(){m.dispose(),p.dispose(),V.dispose(),s.tex.dispose(),N.dispose(),f.material.dispose()}};return b}const nt=`
${te}
attribute vec3 aTarget;   // the point in the shape's own frame (metres)
attribute vec4 aDust;     // where it drifts as loose dust in the beam: x along 0..1, y radius 0..1, z angle, w seed
attribute vec3 aTint;
uniform vec3 uLamp; uniform mat3 uAim; uniform float uLen; uniform float uTan;
uniform mat4 uShape; uniform float uAmount; uniform float uTime; uniform float uOn; uniform float uSize; uniform float uDpr; uniform float uIsShape;
varying vec3 vCol; varying float vI;
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
void main() {
  float seed = aDust.w;
  // loose dust: a point in the cone, drifting slowly (pure in time)
  float al = aDust.x;
  float rr = aDust.y * uTan * al * uLen;
  float an = aDust.z + uTime * (0.05 + 0.08 * h1(seed));
  vec3 loose = vec3(cos(an) * rr, sin(an) * rr, al * uLen);
  loose += vec3(sin(uTime * 0.31 + seed * 6.0), sin(uTime * 0.23 + seed * 9.0), sin(uTime * 0.17 + seed * 3.0)) * 0.025 * uLen;
  loose = uLamp + uAim * loose;
  vec3 P = loose;
  float k = 0.0;
  if (uIsShape > 0.5) {
    // gather: each mote comes in on its own time and settles with a soft overshoot
    float d0 = h1(seed + 1.7) * 0.45;
    k = clamp((uAmount - d0) / 0.55, 0.0, 1.0);
    k = 1.0 - pow(1.0 - k, 3.0);
    vec3 tgt = (uShape * vec4(aTarget, 1.0)).xyz;
    // formed motes still breathe a little, like dust in still air
    tgt += vec3(sin(uTime * 0.7 + seed * 11.0), sin(uTime * 0.53 + seed * 7.0), sin(uTime * 0.61 + seed * 5.0)) * 0.0035 * uLen;
    P = mix(loose, tgt, k);
  }
  vec4 mv = viewMatrix * vec4(P, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  // brightness: inside the beam (soft edge), falling with distance from the lamp
  vec3 rel = transpose(uAim) * (P - uLamp);
  float along = rel.z / uLen;
  float rad = length(rel.xy) / max(1e-4, uTan * max(rel.z, 0.02));
  float inBeam = smoothstep(1.15, 0.7, rad) * smoothstep(0.0, 0.05, along) * (1.0 - smoothstep(0.8, 1.1, along));
  float glint = 0.55 + 0.45 * sin(uTime * (0.6 + 0.9 * h1(seed + 3.1)) + seed * 40.0);
  // forward scatter: dust shines brightest looking back into the light
  vec3 toEye = normalize(cameraPosition - P), beamDir = uAim[2];
  float fwd = 0.6 + 0.9 * pow(max(dot(toEye, beamDir), 0.0), 3.0);
  float shapeI = uIsShape > 0.5 ? mix(inBeam * 0.6, 1.5, k) : inBeam;
  vI = uOn * shapeI * mix(glint, 0.85 + 0.15 * glint, k) * fwd;
  vI *= 1.0 - (1.0 - exp(-uHazeDensity * dist));
  vCol = aTint;
  float px = uSize / max(dist, 0.05) / uPx * uDpr * mix(0.8, 1.15, h1(seed + 7.7));
  gl_PointSize = clamp(px, 1.0, 24.0);
  if (vI < 0.004) gl_PointSize = 0.0;
}`,rt=`
varying vec3 vCol; varying float vI;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d) * 4.0;
  float a = exp(-r2 * 3.2) * (1.0 - smoothstep(0.85, 1.0, r2));
  gl_FragColor = vec4(vCol * vI * a, 1.0);
}`,at=`
varying vec3 vWorld; varying vec3 vN; varying float vAlong;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vAlong = position.z;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,it=`
${te}
uniform vec3 uBeam; uniform float uI; uniform float uTime;
varying vec3 vWorld; varying vec3 vN; varying float vAlong;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float facing = abs(dot(normalize(vN), V));
  float body = pow(facing, 2.2);
  float n = fbm(vWorld * 4.0 + vec3(0.0, uTime * 0.05, uTime * 0.03));
  float along = smoothstep(0.0, 0.06, vAlong) * (1.0 - smoothstep(0.55, 1.0, vAlong)) * (1.0 - 0.5 * vAlong);
  float dist = length(cameraPosition - vWorld);
  float I = uI * body * along * (0.65 + 0.7 * n) * exp(-uHazeDensity * dist);
  gl_FragColor = vec4(uBeam * I, 1.0);
}`;function Te(o,t,a,{weight:n=(i,u,s,c)=>c/255,width:r=1}={}){const i=o.getContext("2d",{willReadFrequently:!0}),{data:u}=i.getImageData(0,0,o.width,o.height),s=ve(a),c=[];let m=0;const p=r/o.width;for(;c.length<t&&m<t*60;){m++;const v=Math.floor(s()*o.width),g=Math.floor(s()*o.height),A=(g*o.width+v)*4,z=n(u[A],u[A+1],u[A+2],u[A+3]);z<=0||s()>z||c.push([(v+s()-o.width/2)*p,(o.height/2-g-s())*p,(s()-.5)*r*.012,z])}return c}function st(o,t,a,n){const r=ve(a),i=fe.length/6,u=Math.max(4,Math.floor(t/i)),s=7*he,c=o/s,m=he*.42,p=[],v=[oe.teal,oe.green,oe.yellow,oe.coral,oe.carnelian,oe.violet,oe.blue].map(A=>$(A)),g=$(ne.light);for(let A=0;A<i;A++){const z=fe[A*6],V=fe[A*6+1],S=fe[A*6+2],T=W((-z+V-S+9)/18)*6.999,I=v[Math.floor(T)].clone().lerp(g,n==="logo"?.42:1),U=[z,V,S],G=[];for(let N=0;N<3;N++)Math.abs(U[N])===3&&G.push([N,Math.sign(U[N])]);if(G.length)for(let N=0;N<u*1.6;N++){const[f,B]=G[Math.floor(r()*G.length)],P=[r()*2-1,r()*2-1,r()*2-1];P[f]=B;const M=Math.max(...P.map((d,h)=>h===f?0:Math.abs(d)));p.push([(z*he+P[0]*m)*c,(V*he+P[1]*m)*c,(S*he+P[2]*m)*c,.75+.5*M*M,I])}}return p}function bt(o,t={}){const a=t.size||.16,n=t.beam&&t.beam.length||1.2,r=t.beam&&t.beam.angle||.32,i=t.light||ne.light,u=t.gain??1,s=new e.Group,c=le(o),m=new e.InstancedMesh(ee([F(new e.CylinderGeometry(.33,.33,.62,40),{tint:Q},C([0,0,0],[Math.PI/2,0,0])),F(new e.SphereGeometry(.33,32,12,0,Math.PI*2,0,Math.PI/2),{tint:Q},C([0,0,-.31],[-Math.PI/2,0,0],[1,.55,1])),F(new e.TorusGeometry(.31,.06,14,40),{inst:!0},C([0,0,.31])),F(new e.CylinderGeometry(.27,.27,.03,40),{tint:ne.light,glow:1,rim:0},C([0,0,.32],[Math.PI/2,0,0])),F(new e.TorusGeometry(.335,.03,10,40),{inst:!0},C([0,0,-.12]))],1),c,1),p=new e.InstancedMesh(ee([F(new e.CylinderGeometry(.42,.48,.12,36),{inst:!0,occl:.9},C([0,.06,0])),F(new e.SphereGeometry(.42,28,10,0,Math.PI*2,0,Math.PI/2),{tint:Q},C([0,.12,0],[0,0,0],[1,.25,1])),F(new e.CapsuleGeometry(.06,.32,4,12),{tint:Q},C([0,.36,0])),F(R(.86,.09,.14,.04,3),{tint:Q},C([0,.55,0])),F(R(.08,.32,.14,.04,3),{tint:Q},C([.41,.7,0])),F(R(.08,.32,.14,.04,3),{tint:Q},C([-.41,.7,0]))],1),c,1),v=$(t.colour||oe.blue);for(const l of[m,p])l.geometry.getAttribute("iColour").setXYZ(0,v.r,v.g,v.b),l.frustumCulled=!1;s.add(p,m);const g=new e.CylinderGeometry(1,1,1,48,1,!0).translate(0,.5,0).rotateX(Math.PI/2);{const l=g.getAttribute("position");for(let w=0;w<l.count;w++){const y=l.getZ(w),q=Math.max(.06,y);l.setX(w,l.getX(w)*q),l.setY(w,l.getY(w)*q)}g.computeVertexNormals()}const A={uBeam:{value:$(i)},uI:{value:.07},uTime:{value:0}},z=new e.ShaderMaterial({vertexShader:at,fragmentShader:it,uniforms:{...o.light,...A},transparent:!0,depthWrite:!1,side:e.DoubleSide,blending:e.AdditiveBlending}),V=new e.Mesh(g,z);V.frustumCulled=!1,V.renderOrder=4,s.add(V);const S={uLamp:{value:new e.Vector3},uAim:{value:new e.Matrix3},uLen:{value:n},uTan:{value:Math.tan(r)},uTime:{value:0},uOn:{value:1},uDpr:{value:1}},T={},I=(l,w,y)=>{const q=l.length,L=new e.BufferGeometry,k=new Float32Array(q*3),E=new Float32Array(q*4),x=new Float32Array(q*3),D=ve(ye(w)*1e6),_=$(i);for(let O=0;O<q;O++){const j=l[O];k[O*3]=j[0],k[O*3+1]=j[1],k[O*3+2]=j[2],E[O*4]=.15+.8*Math.sqrt(D()),E[O*4+1]=Math.sqrt(D()),E[O*4+2]=D()*6.283,E[O*4+3]=D()*100;const K=j[4]||_,se=j[3]??1;x[O*3]=K.r*se,x[O*3+1]=K.g*se,x[O*3+2]=K.b*se}L.setAttribute("position",new e.BufferAttribute(k.slice(),3)),L.setAttribute("aTarget",new e.BufferAttribute(k,3)),L.setAttribute("aDust",new e.BufferAttribute(E,4)),L.setAttribute("aTint",new e.BufferAttribute(x,3)),L.boundingSphere=new e.Sphere(new e.Vector3,1e5);const X={...o.light,...S,uShape:{value:new e.Matrix4},uAmount:{value:0},uSize:{value:y},uIsShape:{value:w==="dust"?0:1}},ie=new e.ShaderMaterial({vertexShader:nt,fragmentShader:rt,uniforms:X,transparent:!0,depthWrite:!1,blending:e.AdditiveBlending}),H=new e.Points(L,ie);H.frustumCulled=!1,H.renderOrder=5,s.add(H),T[w]={points:H,u:X,n:q}},U=t.density??1;{const l=ve(7),w=[],y=Math.round((t.dust??900)*U);for(let q=0;q<y;q++)w.push([0,0,0,.45+.55*l()]);I(w,"dust",n*.0042)}const G=t.shapes||{cube:{}},N={};if(G.cube){const l=G.cube.size||n*.34;N.cube=l,I(st(l,Math.round(3200*U),11,G.cube.tint||"logo"),"cube",l*.02)}if(G.card){const l=G.card.size||n*.26;N.card=l;const w=document.createElement("canvas");w.width=252,w.height=352;const y=w.getContext("2d");y.fillStyle="#FBF8F1";const q=22;y.beginPath(),y.roundRect?y.roundRect(0,0,252,352,q):y.rect(0,0,252,352),y.fill(),De(y,Le(G.card.face||"AS"),0,0,252,352);const L=Te(w,Math.round(5600*U),23,{width:l,weight:(x,D,_,X)=>X<128?0:(x+D+_)/3>200?1:x>120&&D<110?.5:.02}),k=$(i),E=$(oe.coral).lerp(k,.3);for(const x of L){const D=x[3]<.9;x[4]=D?E:k,x[3]=D?1.1:.9}I(L,"card",l*.009)}if(G.text){const l=G.text.size||n*.6;N.text=l;const w=String(G.text.text||""),y=document.createElement("canvas"),q=120,L=`${G.text.weight||700} ${q}px ${G.text.font||'Figtree, "Helvetica Neue", Arial, sans-serif'}`,k=y.getContext("2d");k.font=L;const E=Math.ceil(k.measureText(w).width)+40;y.width=E,y.height=Math.round(q*1.5);const x=y.getContext("2d");x.font=L,x.fillStyle="#fff",x.textAlign="center",x.textBaseline="middle",x.fillText(w,E/2,y.height/2+q*.05);const D=Math.round(Math.min(7e3,26*w.length*14)*U);I(Te(y,D,31,{width:l}),"text",l*.0065)}const f={position:new e.Vector3,aim:new e.Vector3(0,.4,1),on:1,t:0,shapes:{},at:null,face:null,spin:0,visible:!0,shadow:!0},B=new e.Matrix4,P=new e.Quaternion,M=new e.Vector3,d=new e.Vector3,h={object:s,size:a,beam:{length:n,angle:r},shapeSize:N,set(l){l.position&&Z(l.position,f.position),l.aim&&Z(l.aim,f.aim);for(const w of["on","t","spin","visible","shadow"])l[w]!==void 0&&(f[w]=l[w]);return l.shapes&&(f.shapes={...l.shapes}),"at"in l&&(f.at=l.at?Z(l.at):null),"face"in l&&(f.face=l.face?Z(l.face):null),h},lens(){return b()},setStyle(){},update(l){if(s.visible=f.visible,!f.visible)return;const w=M.copy(f.position).add(new e.Vector3(0,.7*a,0)),y=f.aim.clone().sub(w).normalize(),q=Math.atan2(y.x,y.z),L=Math.asin(W(y.y,-1,1));P.setFromAxisAngle(J,q),p.setMatrixAt(0,B.compose(f.position,P,d.set(a,a,a)));const k=new e.Quaternion().setFromEuler(new e.Euler(-L,q,0,"YXZ"));m.setMatrixAt(0,B.compose(w,k,d.set(a*.62,a*.62,a*.62))),p.instanceMatrix.needsUpdate=!0,m.instanceMatrix.needsUpdate=!0,m.geometry.getAttribute("iState").setX(0,W(f.on)),m.geometry.getAttribute("iState").needsUpdate=!0;const E=w.clone().addScaledVector(y,.21*a),x=y,D=new e.Vector3().crossVectors(J,x);D.lengthSq()<1e-6&&D.set(1,0,0),D.normalize();const _=new e.Vector3().crossVectors(x,D);S.uLamp.value.copy(E),S.uAim.value.set(D.x,_.x,x.x,D.y,_.y,x.y,D.z,_.z,x.z),S.uTime.value=f.t,S.uOn.value=W(f.on)*u,S.uDpr.value=l.light.uResolution.value.y/Math.max(1,l.height),V.position.copy(E),V.quaternion.setFromRotationMatrix(new e.Matrix4().makeBasis(D,_,x)),V.scale.set(Math.tan(r)*n,Math.tan(r)*n,n),A.uTime.value=f.t,A.uI.value=.07*W(f.on)*Math.sqrt(u);const X=f.at?f.at.clone():E.clone().addScaledVector(y,n*.62),H=(f.face||l.camera.position).clone().sub(X);H.y=0;const O=Math.atan2(H.x,H.z);for(const j of Object.keys(T)){if(j==="dust")continue;const K=T[j],se=W(f.shapes[j]||0);K.u.uAmount.value=se,K.points.visible=se>0;const Ge=j==="cube"?new e.Quaternion().setFromAxisAngle(J,O).multiply(new e.Quaternion().setFromAxisAngle(new e.Vector3(1,0,0),.36)).multiply(new e.Quaternion().setFromAxisAngle(J,.785+f.spin)):new e.Quaternion().setFromAxisAngle(J,O);K.u.uShape.value.compose(X,Ge,d.set(1,1,1))}if(f.shadow){const j=new e.Vector3(.45*a,0,0),K=new e.Vector3(0,0,.45*a);l.shadows.cast(f.position.clone().add(new e.Vector3(0,.02,0)),j,K,{opacity:.7,size:a,round:.9,extent:.9*a})}},dispose(){for(const l of[m,p])l.geometry.dispose();c.dispose(),g.dispose(),z.dispose();for(const l of Object.values(T))l.points.geometry.dispose(),l.points.material.dispose()}};function b(){const l=f.position.clone().add(new e.Vector3(0,.7*a,0));return l.addScaledVector(f.aim.clone().sub(l).normalize(),.21*a)}return h}function ct(o,t,a){const n=document.createElement("canvas");n.width=256,n.height=t?340:256;const r=n.getContext("2d");r.fillStyle=o,r.beginPath(),r.arc(128,128,124,0,Math.PI*2),r.fill(),r.strokeStyle="#FBF8F1",r.lineCap="round",r.lineWidth=9,r.beginPath(),r.moveTo(30,62),r.lineTo(226,50),r.stroke(),r.lineWidth=7,r.beginPath(),r.moveTo(128,56),r.lineTo(128,92),r.stroke(),r.fillStyle="#FBF8F1";const i=(s,c,m,p,v)=>{r.beginPath(),r.moveTo(s+v,c),r.arcTo(s+m,c,s+m,c+p,v),r.arcTo(s+m,c+p,s,c+p,v),r.arcTo(s,c+p,s,c,v),r.arcTo(s,c,s+m,c,v),r.fill()};if(i(58,92,140,104,34),r.fillStyle=o,i(74,112,30,30,9),i(113,112,30,30,9),i(152,112,30,30,9),t){r.fillStyle="#FBF8F1",i(8,270,240,62,18),r.fillStyle="#211F1C",r.font=`600 40px ${a}`,r.textAlign="center",r.textBaseline="middle";let s=40;for(;r.measureText(t).width>220&&s>18;)s-=2,r.font=`600 ${s}px ${a}`;r.fillText(t,128,302)}const u=new e.CanvasTexture(n);return u.colorSpace=e.NoColorSpace,u.anisotropy=8,u}const lt=`
${te}
${pe}
uniform sampler2D uMap;
varying vec2 vUv; varying vec3 vWorld; varying vec3 vN;
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 col = lightPlayer(pow(t.rgb, vec3(2.2)), N, V, 1.0, 0.0, 0.5, 0.4);
  gl_FragColor = linearToOutputTexel(vec4(haze(shoulder(col), length(cameraPosition - vWorld)), 1.0));
}`,ut=`
varying vec2 vUv; varying vec3 vWorld; varying vec3 vN;
void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`;function At(o,t={}){const a=t.width||2.4,n=a/2.4,r=t.colour||oe.carnelian,i=new e.Group,u=le(o),s=(t.depth||1.1)/n,c=(1.1-s)/2,m=[F(R(2.4,.14,s,.05,3),{tint:"#E9E3D8",occl:.92},C([0,.07,-c])),F(R(2.36,.025,.07,.012,2),{tint:r,rim:.6},C([0,.142,.5-2*c])),F(new e.CapsuleGeometry(.035,2.05,4,12),{tint:Q},C([-1.05,1.18,-.38])),F(new e.CapsuleGeometry(.035,2.05,4,12),{tint:Q},C([1.05,1.18,-.38])),F(R(2.6,.1,1.25,.05,4),{tint:Q},C([0,2.3,-.05],[-.07,0,0])),F(R(2.62,.045,1.27,.022,3),{inst:!0,occl:.95},C([0,2.235,-.05],[-.07,0,0])),F(R(1.3,.06,.34,.03,3),{inst:!0},C([0,.52,-.25])),F(R(.06,.36,.06,.02,2),{tint:Q,occl:.85},C([-.55,.32,-.25])),F(R(.06,.36,.06,.02,2),{tint:Q,occl:.85},C([.55,.32,-.25])),F(new e.CapsuleGeometry(.03,1.8,4,12),{tint:Q},C([1.5,1.06,.35])),F(new e.CylinderGeometry(.27,.27,.04,40),{tint:Q,rim:1},C([1.5,2.05,.35],[Math.PI/2,0,0])),F(R(.3,.06,.3,.03,3),{tint:"#E9E3D8",occl:.9},C([1.5,.03,.35]))],p=ee(m,1),v=new e.InstancedMesh(p,u,1),g=$(r);p.getAttribute("iColour").setXYZ(0,g.r,g.g,g.b),v.setMatrixAt(0,new e.Matrix4),v.frustumCulled=!1;const A={uBody:{value:$(Q)},uBand:{value:$(r)},uSky:{value:$("#C9D6E2")}},z=new e.PlaneGeometry(2,1.75).translate(0,1.2,-.4),V=new e.Mesh(z,me(o,3,A));V.renderOrder=3,V.frustumCulled=!1;const S=ct(r,t.name,t.font||'Figtree, "Helvetica Neue", Arial, sans-serif'),T=t.name?.54*340/256:.54,I=new e.PlaneGeometry(.54,T).translate(0,(.54-T)/2,0),U=new e.ShaderMaterial({vertexShader:ut,fragmentShader:lt,uniforms:{...o.light,uMap:{value:S}}}),G=new e.Mesh(I,U);G.position.set(1.5,2.05,.375),G.frustumCulled=!1;const N=new e.Mesh(I,U);N.position.set(1.5,2.05,.325),N.rotation.y=Math.PI,N.frustumCulled=!1;const f=new e.Group;f.scale.setScalar(n),f.add(v,V,G,N),i.add(f);const B={board:[new e.Vector3(0,1.93,.42),new e.Quaternion],sign:[new e.Vector3(1.5,2.05,.4),new e.Quaternion],bench:[new e.Vector3(0,.55,-.25),new e.Quaternion],edge:[new e.Vector3(0,.14,.55-2*c),new e.Quaternion]},P={object:i,width:a,anchor(M){i.updateMatrixWorld(!0);const d=B[M]||B.board,h=f.localToWorld(d[0].clone()),b=i.getWorldQuaternion(new e.Quaternion).multiply(d[1]);return{position:h,quaternion:b}},shadow:!0,shadowOpacity:.9,setStyle(){},update(M){if(!P.shadow||!i.visible)return;i.updateMatrixWorld(!0);const d=i.getWorldQuaternion(new e.Quaternion),h=f.localToWorld(new e.Vector3(0,0,-.05));M.shadows.cast(h,new e.Vector3(1.3*a/2.4*1,0,0).applyQuaternion(d),new e.Vector3(0,0,.6*n).applyQuaternion(d),{opacity:P.shadowOpacity,size:a,round:.2,extent:2.3*n})},dispose(){p.dispose(),u.dispose(),z.dispose(),V.material.dispose(),I.dispose(),U.dispose(),S.dispose()}};return P}export{ae as FLAP_DRUM,ne as FUTURE,wt as createDrones,Mt as createFlapBoard,bt as createProjector,xt as createTram,At as createTramStop,Ye as deliverPose,ze as droneFly,ot as flapAngle,Ce as flapTiming,gt as flyFormation,_e as formationOffset,Ae as pendulum,yt as tramRide};
