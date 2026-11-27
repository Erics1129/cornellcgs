import*as a from"three";const k=`
attribute vec3 aCentre;   // on the floor
attribute vec4 aAxis;     // xz of the first half-axis (unit), xz of the second (unit)
attribute vec4 aSize;     // half lengths a, b (m), corner radius (m), softness (m)
attribute vec2 aOp;       // opacity, lift above the floor (m)
varying vec2 vP; varying vec4 vSize; varying float vOp;
void main() {
  float pad = aSize.w * 1.8;
  vec2 q = position.xy * (aSize.xy + pad);
  vP = q; vSize = aSize; vOp = aOp.x;
  vec3 p = aCentre + vec3(aAxis.x, 0.0, aAxis.y) * q.x + vec3(aAxis.z, 0.0, aAxis.w) * q.y;
  p.y += aOp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,B=`
uniform vec3 uGround; uniform vec3 uTint; uniform float uStrength; uniform float uMultiply; uniform float uPass;
varying vec2 vP; varying vec4 vSize; varying float vOp;
float sdRound(vec2 p, vec2 b, float r) { r = min(r, min(b.x, b.y)); vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  float d = sdRound(vP, vSize.xy, vSize.z);
  float s = max(vSize.w, 1e-5);
  float a = 1.0 - smoothstep(-s, s, d);
  a = a * a * (3.0 - 2.0 * a) * vOp * uStrength;
  if (a < 0.002) discard;
  vec3 m = max(mix(vec3(1.0), uTint, a), vec3(0.06));
  if (uPass < 0.5) { gl_FragColor = vec4(m, 1.0); return; }
  float lo = min(m.r, min(m.g, m.b));
  if (uMultiply > 0.5) gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0 - dot(m, vec3(0.3333)));
  else gl_FragColor = vec4(uGround * (m - lo), 1.0 - lo);
}`,T=new WeakMap,m=new a.Vector3,p=new a.Vector3,d=new a.Vector3,S=new a.Vector3;function E(y){let c=T.get(y);if(c)return c;let z=0,u=0;const l=new a.InstancedBufferGeometry;l.setAttribute("position",new a.BufferAttribute(new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),3)),l.setIndex([0,1,2,0,2,3]),l.instanceCount=0;let h,x,v,b;function C(n){z=Math.max(64,n);const t=i=>{const o=new a.InstancedBufferAttribute(new Float32Array(z*i),i);return o.setUsage(a.DynamicDrawUsage),o},e=h;h=t(3),x=t(4),v=t(4),b=t(2),e&&l.dispose(),l.setAttribute("aCentre",h),l.setAttribute("aAxis",x),l.setAttribute("aSize",v),l.setAttribute("aOp",b)}C(64);const A=y.shadows.object.material.uniforms,j=n=>new a.ShaderMaterial({vertexShader:k,fragmentShader:B,uniforms:{uGround:A.uGround,uTint:A.uTint,uStrength:A.uStrength,uMultiply:A.uMultiply,uPass:{value:n}},transparent:!0,depthTest:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-1,polygonOffsetUnits:-2,blending:a.CustomBlending,...n===0?{blendSrc:a.DstColorFactor,blendDst:a.ZeroFactor,blendSrcAlpha:a.ZeroFactor,blendDstAlpha:a.OneFactor}:{blendSrc:a.OneMinusDstAlphaFactor,blendDst:a.OneFactor,blendSrcAlpha:a.OneMinusDstAlphaFactor,blendDstAlpha:a.OneFactor}}),Y=[j(0),j(1)].map((n,t)=>{const e=new a.Mesh(l,n);return e.frustumCulled=!1,e.renderOrder=-2+t,e}),D=new a.Group;D.add(...Y);let P=0;c={object:D,reserve(n){P+=n,P>z&&C(Math.ceil(P*1.25))},begin(){u=0,l.instanceCount=0},add(n,t,e,i={}){if(i.opacity<=.002)return;u>=z&&C(z*2);const o=Math.hypot(t.x,t.z),s=Math.hypot(e.x,e.z);if(o<1e-6&&s<1e-6)return;const f=o>1e-6?t.x/o:1,O=o>1e-6?t.z/o:0;let w=s>1e-6?e.x/s:-O,g=s>1e-6?e.z/s:f;h.setXYZ(u,n.x,i.floor??n.y,n.z),x.setXYZW(u,f,O,w,g),v.setXYZW(u,Math.max(o,1e-5),Math.max(s,1e-5),i.round??0,Math.max(1e-5,i.soft??.002)),b.setXY(u,i.opacity??.5,i.lift??5e-4),u++,l.instanceCount=u;for(const r of[h,x,v,b])r.needsUpdate=!0,r.clearUpdateRanges&&r.clearUpdateRanges(),r.addUpdateRange&&r.addUpdateRange(0,u*r.itemSize)},cast(n,t,e,i,o={}){const s=o.size||2*Math.max(t.length(),e.length()),f=o.floor??y.groundHeight(n.x,n.z),O=n.y-Math.abs(t.y)-Math.abs(e.y)-Math.abs(i.y),w=Math.max(0,O-f),g=w/s;m.copy(y.light.uKeyDir.value);const r=Math.max(.12,m.y),W=n.y-f;S.set(n.x-m.x/r*W,f,n.z-m.z/r*W),p.set(t.x-m.x/r*t.y,0,t.z-m.z/r*t.y),d.set(e.x-m.x/r*e.y,0,e.z-m.z/r*e.y);const F=Math.hypot(i.x-m.x/r*i.y,i.z-m.z/r*i.y);p.length()<F&&p.setLength(F),d.length()<F&&d.setLength(F);for(const M of[p,d]){const X=M.length();X>5*s&&M.multiplyScalar(5*s/X)}const q=1+g*.15;p.multiplyScalar(q),d.multiplyScalar(q);const I=Math.hypot(t.x,t.z)+Math.hypot(e.x,e.z)+1e-6,Z=Math.max(0,p.length()+d.length()-I),L=(.02+.35*g)*s+.06*Z,U=(o.opacity??1)/(1+1.5*g)/(1+1.2*Z/s),R=o.round??0,V=o.lift??Math.max(2e-4,s*.004);o.main!==!1&&c.add(S,p,d,{soft:L,opacity:U*.9,round:R*q,floor:f,lift:V});const G=1-Math.min(1,w/(.08*s));if(G>0){const M=G*G;S.set(n.x,f,n.z),p.set(t.x,0,t.z),d.set(e.x,0,e.z),c.add(S,p.multiplyScalar(1.06),d.multiplyScalar(1.06),{soft:.06*s,opacity:.34*M*Math.min(1,U),round:R*1.06,floor:f,lift:V}),p.set(t.x,0,t.z),d.set(e.x,0,e.z),c.add(S,p.multiplyScalar(.985),d.multiplyScalar(.985),{soft:.014*s,opacity:(o.coreOpacity??Math.min(1.1,.7*U))*M,round:R,floor:f,lift:V})}},dispose(){T.delete(y)}};const _={object:D,update(){c.begin()},dispose(){c.dispose()}};return y.add(_),T.set(y,c),c}function H(y,c,z,u=0,l=new a.Vector3){const h=y.camera;h.updateMatrixWorld();const x=h.position,v=new a.Vector3(c,z,.5).unproject(h).sub(x).normalize();if(Math.abs(v.y)<1e-6)return null;const b=(u-x.y)/v.y;return b<0?null:l.copy(x).addScaledVector(v,b)}export{E as contactShadows,H as pointerOnPlane};
