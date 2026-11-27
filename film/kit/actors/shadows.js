import*as e from"three";const et=384,g=12,nt=`
attribute vec3 aCentre;
attribute vec3 aAxisA;
attribute vec3 aAxisB;
attribute vec4 aParam;   // softness (fraction of the half-size), opacity, shape (0 box, 1 dart), roundness
attribute vec4 aSweep;   // xy: the shadow of a tall thing, the footprint swept along this (half-axis units); z: far softness; w: far fade
attribute vec4 aH0;      // ground correction (metres, along y) at the 3 x 3 points of the patch: h00 h10 h20 h01
attribute vec4 aH1;      // h11 h21 h02 h12
attribute float aH2;     // h22
varying vec2 vQ;
varying vec4 vParam;
varying vec4 vSweep;
float q3(float a, float b, float c, float t) {
  // the quadratic through (0, a), (0.5, b), (1, c)
  return a * (2.0 * t - 1.0) * (t - 1.0) + b * 4.0 * t * (1.0 - t) + c * t * (2.0 * t - 1.0);
}
void main() {
  float pad = 1.0 + aParam.x * 1.6 + aSweep.z * 1.6;
  vec2 lo = min(vec2(0.0), aSweep.xy) - pad, hi = max(vec2(0.0), aSweep.xy) + pad;
  vec2 f = position.xy * 0.5 + 0.5;
  vQ = mix(lo, hi, f);
  vParam = aParam; vSweep = aSweep;
  vec3 p = aCentre + aAxisA * vQ.x + aAxisB * vQ.y;
  float r0 = q3(aH0.x, aH0.y, aH0.z, f.x), r1 = q3(aH0.w, aH1.x, aH1.y, f.x), r2 = q3(aH1.z, aH1.w, aH2, f.x);
  p.y += q3(r0, r1, r2, f.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,rt=`
uniform vec3 uGround; uniform vec3 uTint; uniform float uStrength; uniform float uMultiply;
varying vec2 vQ;
varying vec4 vParam;
varying vec4 vSweep;
float sdBox(vec2 p, float r) { vec2 q = abs(p) - vec2(1.0 - r); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sdDart(vec2 p) {
  // nose at (0, 1), tail corners at (+-1, -1)
  vec2 a = vec2(0.0, 1.0), b = vec2(1.0, -1.0), c = vec2(-1.0, -1.0);
  vec2 e0 = b - a, e1 = c - b, e2 = a - c;
  vec2 v0 = p - a, v1 = p - b, v2 = p - c;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
float sd(vec2 q) { return mix(sdBox(q, clamp(vParam.w, 0.0, 1.0)), sdDart(q) * 0.8, vParam.z); }
float cover(float d, float soft) {
  float a = 1.0 - smoothstep(-soft, soft, d);
  return a * a * (3.0 - 2.0 * a);
}
void main() {
  float soft = max(vParam.x, 0.015);
  float a;
  if (dot(vSweep.xy, vSweep.xy) > 1e-6) {
    // a tall caster: the footprint swept away from the sun. Distance to the swept shape is the least
    // distance over the sweep (convex in t: a ternary search finds it); the penumbra widens and the
    // shadow lightens toward the far end, where the light passed the caster's top
    float t0 = 0.0, t1 = 1.0;
    for (int k = 0; k < 14; k++) {
      float m0 = mix(t0, t1, 0.382), m1 = mix(t0, t1, 0.618);
      if (sd(vQ - vSweep.xy * m0) < sd(vQ - vSweep.xy * m1)) t1 = m1; else t0 = m0;
    }
    float t = 0.5 * (t0 + t1);
    float d = sd(vQ - vSweep.xy * t);
    float s = mix(soft, vSweep.z, t);
    a = cover(d + 0.35 * (s - soft), s) * mix(1.0, vSweep.w, t);
  } else {
    a = cover(sd(vQ), soft);
  }
  a *= vParam.y * uStrength;
  if (a < 0.002) discard;
  if (uMultiply > 0.5) gl_FragColor = vec4(max(mix(vec3(1.0), uTint, a), vec3(0.06)), 1.0);
  else gl_FragColor = vec4(uGround * uTint * min(a, 1.0), min(a, 1.0));
}`;function ct(H){const b=new e.InstancedBufferGeometry;{const t=[],c=[];for(let o=0;o<=g;o++)for(let a=0;a<=g;a++)t.push(a/g*2-1,o/g*2-1,0);for(let o=0;o<g;o++)for(let a=0;a<g;a++){const h=o*(g+1)+a,w=h+1,y=h+g+1,r=y+1;c.push(h,w,r,h,r,y)}b.setAttribute("position",new e.BufferAttribute(new Float32Array(t),3)),b.setIndex(c)}const m=t=>{const c=new e.InstancedBufferAttribute(new Float32Array(et*t),t);return c.setUsage(e.DynamicDrawUsage),c},W=m(3),k=m(3),_=m(3),G=m(4),E=m(4),I=m(4),N=m(4),L=m(1),R={aCentre:W,aAxisA:k,aAxisB:_,aParam:G,aSweep:E,aH0:I,aH1:N,aH2:L};for(const t in R)b.setAttribute(t,R[t]);b.instanceCount=0;const p={uGround:{value:new e.Color(.965,.949,.918)},uTint:{value:new e.Color(.725,.659,.561)},uStrength:{value:.5},uMultiply:{value:0}},v=new e.ShaderMaterial({vertexShader:nt,fragmentShader:rt,uniforms:p,transparent:!0,depthWrite:!1,depthTest:!1,blending:e.CustomBlending,blendSrc:e.OneFactor,blendDst:e.OneMinusSrcAlphaFactor,side:e.DoubleSide}),K=new e.Mesh(b,v);K.frustumCulled=!1;let l=0;const F=new e.Vector3,M=new e.Vector3,n=new e.Vector3,J=new e.Vector3,i=new e.Vector3,d=new e.Vector3,at=new e.Vector3,O=new e.Vector3,Q=new e.Vector3,$=t=>t.clone().convertLinearToSRGB(),u=new Float32Array(9),X={object:K,begin(){l=0},get count(){return l},scale(t,c,o){if(o!==1)for(let a=Math.max(0,t);a<Math.min(l,c);a++)G.setY(a,G.getY(a)*o)},end(){b.instanceCount=l;for(const t of Object.values(R))t.needsUpdate=!0,t.clearUpdateRanges&&t.clearUpdateRanges(),t.addUpdateRange&&t.addUpdateRange(0,l*t.itemSize)},setTone(t){t.mode==="multiply"?(p.uMultiply.value=1,p.uStrength.value=1,p.uTint.value.setRGB(t.tint[0],t.tint[1],t.tint[2]),v.blendSrc=e.DstColorFactor,v.blendDst=e.ZeroFactor,v.blendSrcAlpha=e.ZeroFactor,v.blendDstAlpha=e.OneFactor):(p.uMultiply.value=0,p.uStrength.value=t.strength??.5,p.uGround.value.copy($(t.ground)),p.uTint.value.copy($(t.tint)),v.blendSrc=e.OneFactor,v.blendDst=e.OneMinusSrcAlphaFactor,v.blendSrcAlpha=e.OneFactor,v.blendDstAlpha=e.OneMinusSrcAlphaFactor)},add(t,c,o,a=.2,h=.5,w=0,y=.35,r=null,A={}){if(l>=et||h<=.002)return;const s=r?Array.isArray(r)?r[0]:r.x:0,x=r?Array.isArray(r)?r[1]:r.y:0,D=Math.hypot(s,x),C=r&&!Array.isArray(r)&&r.soft!==void 0?r.soft:a*(1+1.6)+.04*Math.min(1,D),P=r&&!Array.isArray(r)&&r.fade!==void 0?r.fade:.65;if(E.setXYZW(l,s,x,D>.001?C:a,P),W.setXYZ(l,t.x,t.y,t.z),k.setXYZ(l,c.x,c.y,c.z),_.setXYZ(l,o.x,o.y,o.z),G.setXYZW(l,a,h,w,y),u.fill(0),!A.flat){const q=1+a*1.6+(D>.001?C:a)*1.6,T=Math.min(0,s)-q,Y=Math.max(0,s)+q,B=Math.min(0,x)-q,U=Math.max(0,x)+q,Z=A.lift??0;for(let S=0;S<3;S++)for(let f=0;f<3;f++){const V=T+(Y-T)*f/2,z=B+(U-B)*S/2;Q.copy(t).addScaledVector(c,V).addScaledVector(o,z),u[S*3+f]=H.groundHeight(Q.x,Q.z)+Z-Q.y}}I.setXYZW(l,u[0],u[1],u[2],u[3]),N.setXYZW(l,u[4],u[5],u[6],u[7]),L.setX(l,u[8]),l++},cast(t,c,o,a={}){const{opacity:h=1,shape:w=0,round:y=.35,base:r=0,core:A=[1,1]}=a,s=a.size||2*Math.max(c.length(),o.length(),.001),{point:x,height:D}=H.dropToGround(t,at),C=Math.max(0,D-r),P=C/s;H.groundNormal(x.x,x.z,n),M.copy(H.light.uKeyDir.value);const q=Math.max(.15,M.dot(n));i.copy(c).addScaledVector(M,-c.dot(n)/q),d.copy(o).addScaledVector(M,-o.dot(n)/q),i.addScaledVector(n,-i.dot(n)),d.addScaledVector(n,-d.dot(n));const T=Math.max(1e-4,Math.min(i.length(),d.length())),Y=1+P*.15;i.multiplyScalar(Y),d.multiplyScalar(Y);const B=(.02+.35*P)*s,U=h/(1+1.5*P);let Z=null;if(a.extent){const f=Math.max(.12,M.dot(n)),V=Math.min(5,Math.sqrt(1-f*f)/f)*a.extent;if(F.copy(M).addScaledVector(n,-M.dot(n)),F.lengthSq()>1e-6){F.normalize().multiplyScalar(-V);const z=i.lengthSq(),j=d.lengthSq(),tt=[F.dot(i)/z,F.dot(d)/j],ot=B+.045*V+.03*a.extent;Z={x:tt[0],y:tt[1],soft:Math.min(1.6,ot/T),fade:.62}}}J.copy(x).addScaledVector(n,.002*s),X.add(J,i,d,Math.min(1.4,B/T),U*.9,w,y,Z);const S=1-Math.min(1,C/(.08*s));if(S>0){const f=H.groundHeight(t.x,t.z);O.set(t.x,f,t.z),H.groundNormal(t.x,t.z,n),O.addScaledVector(n,.003*s);const V=S*S;i.copy(c).addScaledVector(n,-c.dot(n)).multiplyScalar(A[0]*1.1),d.copy(o).addScaledVector(n,-o.dot(n)).multiplyScalar(A[1]*1.1);let z=Math.max(1e-4,Math.min(i.length(),d.length()));X.add(O,i,d,Math.min(1.2,.1*s/z),.22*V*Math.min(1,h),w,Math.min(1,y+.15)),i.copy(c).addScaledVector(n,-c.dot(n)).multiplyScalar(A[0]*.97),d.copy(o).addScaledVector(n,-o.dot(n)).multiplyScalar(A[1]*.97),z=Math.max(1e-4,Math.min(i.length(),d.length()));const j=a.coreOpacity??Math.min(1.1,.5*h);X.add(O,i,d,Math.min(1.2,.018*s/z),j*V,w,Math.min(1,y+.05))}},dispose(){b.dispose(),v.dispose()}};return X}export{ct as createShadows};
