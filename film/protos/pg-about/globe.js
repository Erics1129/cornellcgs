import*as t from"three";const J=Math.PI/180,f=56,wt=`
attribute float aSize;
attribute vec4 aCol;
varying vec4 vCol;
uniform float uPx;
void main() {
  vCol = aCol;
  gl_PointSize = aSize * uPx;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  if (aCol.a < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`,Mt=`
varying vec4 vCol;
void main() {
  float r = length(gl_PointCoord * 2.0 - 1.0);
  float core = exp(-r * r * 60.0);
  float glow = exp(-r * r * 7.0) * 0.42 + exp(-r * 3.2) * 0.12;
  float a = (core * 1.6 + glow) * vCol.a;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vCol.rgb * a, 1.0);
}`,gt=`
attribute vec4 aCol;
attribute float aEdge;
varying vec4 vCol;
varying float vEdge;
void main() { vCol = aCol; vEdge = aEdge; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,xt=`
varying vec4 vCol;
varying float vEdge;
void main() {
  float a = vCol.a * (1.0 - smoothstep(0.25, 1.0, abs(vEdge)));
  if (a < 0.002) discard;
  gl_FragColor = vec4(vCol.rgb * a, 1.0);
}`,Ct=(y,U)=>{const k=y*J,C=U*J;return new t.Vector3(Math.cos(k)*Math.cos(C),Math.cos(k)*Math.sin(C),Math.sin(k))};function At(y,{places:U,home:k}){const C=[...U,k],A=C.length,W=C.map(o=>Ct(o.lat,o.lon)),m=new t.BufferGeometry,w=new Float32Array(A*3),K=new Float32Array(A),X=new Float32Array(A*4);m.setAttribute("position",new t.BufferAttribute(w,3)),m.setAttribute("aSize",new t.BufferAttribute(K,1)),m.setAttribute("aCol",new t.BufferAttribute(X,4));const Y={uPx:{value:1}},Z=new t.ShaderMaterial({vertexShader:wt,fragmentShader:Mt,uniforms:Y,transparent:!0,depthWrite:!1,depthTest:!0,blending:t.AdditiveBlending}),M=new t.Points(m,Z);M.frustumCulled=!1,M.renderOrder=4;const z=U.length,h=new t.BufferGeometry,$=new Float32Array(z*f*4*3),D=new Float32Array(z*f*4*4),tt=new Float32Array(z*f*4),et=new Uint32Array(z*f*6);for(let o=0;o<z*f;o++){tt.set([-1,1,-1,1],o*4);const n=o*4;et.set([n,n+1,n+2,n+1,n+3,n+2],o*6)}h.setAttribute("position",new t.BufferAttribute($,3)),h.setAttribute("aCol",new t.BufferAttribute(D,4)),h.setAttribute("aEdge",new t.BufferAttribute(tt,1)),h.setIndex(new t.BufferAttribute(et,1));const ot=new t.ShaderMaterial({vertexShader:gt,fragmentShader:xt,transparent:!0,depthWrite:!1,depthTest:!0,blending:t.AdditiveBlending,side:t.DoubleSide}),g=new t.Mesh(h,ot);g.frustumCulled=!1,g.renderOrder=3,y.scene.add(g,M);const st=U.map((o,n)=>{const c=W[n],v=W[A-1],i=Math.acos(Math.max(-1,Math.min(1,c.dot(v)))),P=[];for(let l=0;l<=f;l++){const d=l/f,V=Math.sin((1-d)*i)/Math.sin(i),B=Math.sin(d*i)/Math.sin(i);P.push({u:c.clone().multiplyScalar(V).add(v.clone().multiplyScalar(B)).normalize(),h:.028*i*6371*Math.sin(Math.PI*d),s:d})}return P}),S=C.map(()=>({x:0,y:0,ok:!1})),nt=new t.Matrix3,N=new t.Vector3,it=new t.Vector3,_=new t.Vector3,at=new t.Vector3,ct=new t.Vector3,lt=new t.Vector3,dt=new t.Vector3;let I=6371;function Q(o,n,c){return c.copy(o).multiplyScalar(I+n).applyMatrix3(nt).add(_)}function H(o,n){const c=o.length(),v=at.copy(o).divideScalar(c),i=v.dot(_),P=_.lengthSq()-I*I,l=i*i-P;if(l<=0)return 1;const d=i-Math.sqrt(l);if(n){const V=it.copy(o).sub(_).normalize();return Math.max(0,Math.min(1,-V.dot(v)/(n===2?.32:.14)))}return d>0&&d<c-30?0:1}const q={on:!0};return{update({earth:o,lens:n,fov:c,H:v,dpr:i,lit:P,hot:l,arc:d,homeOn:V=0,vis:B=1,t:ut=0}){if(!o||B<=.001){M.visible=!1,g.visible=!1;for(const e of S)e.ok=!1;return}M.visible=q.on,g.visible=q.on,I=o.radius,nt.copy(o.frame.m).transpose(),_.copy(o.centre),ct.copy(n),Y.uPx.value=v/720*i;const L=y.camera;lt.set(1,0,0).applyQuaternion(L.quaternion),dt.set(0,1,0).applyQuaternion(L.quaternion);const pt=1e3*2*Math.tan(c*J/2)/Math.max(1,v);for(let e=0;e<A;e++){const b=e===A-1;Q(W[e],0,N);const u=H(N,!0),s=N.clone().normalize();w[e*3]=n.x+s.x*1e3,w[e*3+1]=n.y+s.y*1e3,w[e*3+2]=n.z+s.z*1e3;const j=b?V:P[e],R=b?V:l[e],a=u*j*B,E=b?[1,.93,.82]:[1,.8,.52];K[e]=(22+22*R)*(1+.07*Math.sin(ut*1.3+e*2.1)),X.set([E[0],E[1],E[2],a*(.75+.6*R)],e*4);const r=at.set(w[e*3],w[e*3+1],w[e*3+2]).project(L);S[e].x=(r.x*.5+.5)*(y.width||1),S[e].y=(-r.y*.5+.5)*(y.height||1),S[e].ok=u>.05&&r.z<1,S[e].k=u}const ft=1.4*pt;for(let e=0;e<z;e++){const b=d[e],u=st[e],s=new t.Vector3,j=new t.Vector3,R=new t.Vector3,a=new t.Vector3,E=(r,p)=>{Q(u[r].u,0,p);const G=H(p,2);Q(u[r].u,u[r].h,p);const T=Math.min(G,H(p,!1));return p.normalize().multiplyScalar(1e3).add(n),Math.min(1,T)};for(let r=0;r<f;r++){const p=(e*f+r)*4,G=u[r].s,T=u[r+1].s,rt=b<=0?0:Math.max(0,Math.min(1,(b-G)/(T-G)));if(rt<=0||B<=0){for(let x=0;x<4;x++)D[(p+x)*4+3]=0;continue}const mt=E(r,s),ht=E(r+1,j);a.copy(j).sub(s);const vt=R.copy(s).sub(n).normalize();a.cross(vt).normalize().multiplyScalar(ft);const F=j.clone().lerp(s,1-rt);$.set([s.x-a.x,s.y-a.y,s.z-a.z,s.x+a.x,s.y+a.y,s.z+a.z,F.x-a.x,F.y-a.y,F.z-a.z,F.x+a.x,F.y+a.y,F.z+a.z],p*3);const O=b<1?Math.exp(-((b-T)**2)/.004):0,bt=(.32+.5*l[e])*(.55+.45*Math.sin(Math.PI*G)),yt=Math.min(mt,ht)*B*(bt+1.2*O);for(let x=0;x<4;x++)D.set([1,.82+.1*O,.55+.25*O,yt],(p+x)*4)}}m.attributes.position.needsUpdate=!0,m.attributes.aSize.needsUpdate=!0,m.attributes.aCol.needsUpdate=!0,h.attributes.position.needsUpdate=!0,h.attributes.aCol.needsUpdate=!0},screen:o=>S[o],setVisible(o){q.on=!!o,M.visible=q.on,g.visible=q.on},dispose(){y.scene.remove(g,M),m.dispose(),Z.dispose(),h.dispose(),ot.dispose()}}}export{At as createGlobeMarks};
