import*as o from"three";import{RoundedBoxGeometry as ie}from"three/addons/geometries/RoundedBoxGeometry.js";import{GLSL_COMMON as oe,GLSL_FRAG as ce,PLAYER_COLOURS as se,lin as T}from"../actors/core.js";import{CUBE as B,popShape as le,hopShape as te}from"../actors/cube.js";import{clamp as D,inOutSine as ue,seeded as me,hash01 as ve}from"../ease.js";import{contactShadows as fe}from"./contact.js";const b=B.block,pe="#F7F2E8",ye=`
${oe}
attribute vec3 aColour;
attribute vec4 aState;   // colour mix, flash, touch (0 in the air .. 1 resting on something), seed
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vLocalN; varying vec3 vColour; varying vec4 vState; varying vec3 vFaceN;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  mat3 m3 = mat3(m);
  vec3 sc = vec3(dot(m3[0], m3[0]), dot(m3[1], m3[1]), dot(m3[2], m3[2]));
  vN = normalize(m3 * (normal / max(sc, vec3(1e-12))));
  vec3 an = abs(normal);
  vec3 face = an.x >= an.y && an.x >= an.z ? vec3(sign(normal.x), 0.0, 0.0) : an.y >= an.z ? vec3(0.0, sign(normal.y), 0.0) : vec3(0.0, 0.0, sign(normal.z));
  vFaceN = normalize(m3 * (face / max(sc, vec3(1e-12))));
  vWorld = wp.xyz; vLocal = position; vLocalN = normal; vColour = aColour; vState = aState;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,de=`
${oe}
${ce}
uniform vec3 uClay; uniform float uBlock; uniform float uReal; uniform float uFootAO; uniform vec3 uFootTint;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vLocalN; varying vec3 vColour; varying vec4 vState; varying vec3 vFaceN;
void main() {
  float hs = uBlock * 0.5;
  vec3 a = abs(vLocal) / hs;
  float mx = max(a.x, max(a.y, a.z)), mn = min(a.x, min(a.y, a.z));
  float mid = a.x + a.y + a.z - mx - mn;
  float mixc = vState.x;
  vec3 colour = vColour;
  if (uStyle > 1.5) colour = desat(colour, 0.09);
  vec3 base = mix(uClay, colour, mixc);
  if (uStyle > 1.5) {
    vec3 n = abs(vLocalN);
    vec2 f = n.x > 0.5 ? vLocal.yz : n.y > 0.5 ? vLocal.xz : vLocal.xy;
    float dir = step(0.5, fract(vState.w * 7.0));
    vec2 g = dir > 0.5 ? f.yx : f;
    float streak = fbm(vec3(g.x * 7.0, g.y * 95.0, vState.w * 31.0));
    float grain = fbm(vec3(g.x * 3.0 + streak, g.y * 40.0, vState.w * 11.0));
    base *= 0.93 + 0.11 * streak + 0.04 * (grain - 0.5);
    float wear = smoothstep(0.82, 0.97, mid) * smoothstep(0.35, 0.75, fbm(vLocal * 60.0 + vState.w * 5.0));
    base = mix(base, mix(base, vec3(0.93, 0.89, 0.80), 0.45), wear * mixc);
  }
  base = mix(base, vec3(1.0, 0.985, 0.95), vState.y * 0.6);
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  gShade = mix(vec3(1.06, 1.02, 0.93), vec3(1.0), mixc);
  gSat = mix(1.0, 1.2, mixc);
  float footH = clamp(vLocal.y / uBlock + 0.5, 0.0, 1.0);
  float touch = vState.z;
  vec3 col;
  if (uReal > 0.5) {
    // on a plate: the plate's sun face by face, like the cube's blocks; the rim on the block's own edges
    vec3 an = abs(normalize(vLocalN));
    vec3 NL = normalize(mix(N, normalize(vFaceN), 0.85));
    float bevel = 1.0 - smoothstep(0.9, 0.995, max(an.x, max(an.y, an.z)));
    col = lightBox(base, N, NL, V, 1.0, 0.5, mix(0.35, 1.0, bevel), exp(-footH / 0.2) * touch);
    float k = uFootAO * touch * (1.0 - smoothstep(0.0, 0.11, footH));
    col *= mix(vec3(1.0), uFootTint, k * (1.3 - 0.3 * smoothstep(0.0, 0.05, footH)));
  } else {
    col = lightPlayer(base, N, V, 1.0, 0.0, 0.5, 1.0);
  }
  gShade = vec3(1.0); gSat = 1.2;
  if (uStyle > 1.5) col *= 1.0 - 0.10 * smoothstep(0.85, 0.99, mid);
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function he(y){const d=new o.Vector3(0,1,0),u=r=>r?r.isVector3?r.clone():new o.Vector3().fromArray(r):new o.Vector3,h=r=>r?r.isQuaternion?r.clone():new o.Quaternion().fromArray(r):new o.Quaternion;return{stackPose(r,n={}){const l=u(n.at),m=n.frame?h(n.frame):new o.Quaternion().setFromAxisAngle(d,n.yaw||0),v=me((n.seed||1)*613+r*37),f=n.jitter??1,p=m.clone().multiply(new o.Quaternion().setFromAxisAngle(d,(v()-.5)*.16*f));return{position:l.clone().add(new o.Vector3((v()-.5)*.06*y*f,r*y,(v()-.5)*.06*y*f).applyQuaternion(m)),quaternion:p,sy:1,sxz:1,floor:r>0?l.y+r*y:void 0}},rowPose(r,n={}){const l=u(n.at),m=h(n.frame);return{position:l.clone().add(new o.Vector3((n.dir||1)*r*(1+(n.gap??.3))*y,0,0).applyQuaternion(m)),quaternion:m,sy:1,sxz:1}},carry(r,n={}){const l=n.from&&n.from.position?n.from:{position:n.from},m=n.to&&n.to.position?n.to:{position:n.to},v=u(l.position),f=u(m.position),p=h(l.quaternion),L=h(m.quaternion||l.quaternion),g=te(r,n.arc??1.2),w=D((r-.22)/.52),S=ue(w),A=v.clone().lerp(f,S);A.y=v.y+(f.y-v.y)*S+g.y*y;const z=f.clone().sub(v);z.y=0;const F=z.lengthSq()>1e-12?new o.Vector3().crossVectors(d,z).normalize():new o.Vector3(1,0,0),E=p.clone().slerp(L,S).premultiply(new o.Quaternion().setFromAxisAngle(F,-(n.turns??1)*(Math.PI/2)*S));return{position:A,quaternion:E,sy:g.sy,sxz:g.sxz,floor:m.floor,air:g.y>.001?1:0}}}}function Ae(y,d={}){const u=d.count||1,h=d.size||(d.cubeSize?d.cubeSize:.9)*(b/B.edge),V=h/b,r={},n=new o.InstancedBufferAttribute(new Float32Array(u*3),3),l=new o.InstancedBufferAttribute(new Float32Array(u*4),4);l.setUsage(o.DynamicDrawUsage),n.setUsage(o.DynamicDrawUsage);const m=i=>{const t=B.radius[i]||B.radius.soft;if(!r[t]){const a=new ie(b,b,b,3,b*t),e=new o.InstancedBufferGeometry;for(const c of["position","normal","uv"])e.setAttribute(c,a.getAttribute(c));a.getIndex()&&e.setIndex(a.getIndex()),e.setAttribute("aColour",n),e.setAttribute("aState",l),e.boundingSphere=new o.Sphere(new o.Vector3,1e5),r[t]=e}return r[t]},v={...y.light,uClay:{value:T(pe)},uBlock:{value:b},uReal:{value:0},uFootAO:{value:.32},uFootTint:{value:new o.Color(.5,.56,.5)}},f=new o.ShaderMaterial({vertexShader:ye,fragmentShader:de,uniforms:v});f.extensions={derivatives:!0};const p=new o.InstancedMesh(m(y.style),f,u);p.instanceMatrix.setUsage(o.DynamicDrawUsage),p.frustumCulled=!1;const L=fe(y);L.reserve(u*2);const g=d.colours||se,w=[];for(let i=0;i<u;i++){const t=g[i%g.length];w.push({position:new o.Vector3,quaternion:new o.Quaternion,scale:1,colour:1,pop:-1,hop:0,hopHeight:.6,sy:1,sxz:1,floor:void 0,visible:!0,shadow:!0,shadowOpacity:1,seed:ve("block"+i),hex:t});const a=T(t);n.setXYZ(i,a.r,a.g,a.b)}const S=he(h),A=new o.Matrix4,z=new o.Matrix4,F=new o.Matrix4,E=new o.Matrix4,C=new o.Vector3,G=new o.Vector3(0,1,0),W=new o.Vector3,j=new o.Vector3,N=new o.Vector3,k=new o.Vector3,R=new o.Vector3,P=new o.Vector3,M=new o.Quaternion,ne=new o.Matrix4().makeScale(0,0,0),_=new o.Color,q={object:p,count:u,size:h,...S,get(i){return w[i]},set(i,t){const a=w[i];if(!a)return q;t.position&&(Array.isArray(t.position)?a.position.fromArray(t.position):a.position.copy(t.position)),t.quaternion&&(Array.isArray(t.quaternion)?a.quaternion.fromArray(t.quaternion):a.quaternion.copy(t.quaternion));for(const e of["scale","colour","hop","hopHeight","sy","sxz","visible","shadow","shadowOpacity"])t[e]!==void 0&&(a[e]=t[e]);if(a.pop=t.pop!==void 0?t.pop:a.pop,"floor"in t&&(a.floor=t.floor),t.tint&&t.tint!==a.hex){a.hex=t.tint;const e=T(t.tint);n.setXYZ(i,e.r,e.g,e.b),n.needsUpdate=!0}return t.visible===void 0&&(t.position||t.quaternion)&&(a.visible=!0),q},hideAll(){for(const i of w)i.visible=!1;return q},setStyle(i){p.geometry=m(i)},update(i){const t=!!(i.plate||i.plateEngine);v.uReal.value=t?1:0;for(let a=0;a<u;a++){const e=w[a];if(!e.visible){p.setMatrixAt(a,ne);continue}const c=h*e.scale;let U=0,X=1,Z=1,H=0,$=e.colour,K=0;if(e.pop>=0){const x=D(e.pop),s=le(x);U=s.lift*(c/.925),X=s.sn,Z=s.st,H=s.spin,$=x<=0?0:s.colour,K=s.flash,s.ring>0&&s.ring<1&&(_.setRGB(n.getX(a),n.getY(a),n.getZ(a)),i.fx.ring(e.position,G,s.ring,{width:c*1.25,colour:_,seed:a+1}))}let I=0,J=1,ee=1;if(e.hop>0&&e.hop<1){const x=te(e.hop,e.hopHeight);I=x.y*c,J=x.sy,ee=x.sxz}const Y=e.sy*J*X,Q=e.sxz*ee*Z;W.copy(G),C.copy(e.position).addScaledVector(W,c/2*Y+I+U),M.copy(e.quaternion),H&&(j.set(1,0,0),M.multiply(new o.Quaternion().setFromAxisAngle(j,H))),z.makeRotationFromQuaternion(M),F.makeScale(Q*V*e.scale,Y*V*e.scale,Q*V*e.scale),A.multiplyMatrices(F,z),A.setPosition(C),p.setMatrixAt(a,A);const ae=I+Math.max(0,U),re=1-D(ae/(.06*c));if(l.setXYZW(a,$,K,re,e.seed),e.shadow&&e.shadowOpacity>0){N.set(c/2,0,0).applyQuaternion(M).multiplyScalar(Q),k.set(0,0,c/2).applyQuaternion(M).multiplyScalar(Q),R.set(0,c/2,0).applyQuaternion(M).multiplyScalar(Y);const x=Math.abs(N.y)+Math.abs(k.y)+Math.abs(R.y);P.copy(C),P.y-=x;const s=k.clone(),O=N.clone();O.y=0,s.y=0,O.lengthSq()<1e-10&&O.set(c/2,0,0),s.lengthSq()<1e-10&&s.set(0,0,c/2),i.shadows.cast(P,O,s,{opacity:e.shadowOpacity*(t?1.5:1),shape:0,round:.22,size:c,extent:2*x*.92}),e.floor!==void 0&&e.floor>i.groundHeight(e.position.x,e.position.z)+c*.05&&L.cast(C,N,k,R,{floor:e.floor,size:c,opacity:e.shadowOpacity*(t?1.3:1),round:c*.22,main:!1,lift:c*.004})}}p.instanceMatrix.needsUpdate=!0,l.needsUpdate=!0},dispose(){for(const i of Object.values(r))i.dispose();f.dispose()}};return q}export{he as blockMoves,Ae as createBlocks};
