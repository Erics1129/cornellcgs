import*as e from"three";import{RoundedBoxGeometry as b}from"three/addons/geometries/RoundedBoxGeometry.js";import{mergeGeometries as M}from"three/addons/utils/BufferGeometryUtils.js";import{GLSL_COMMON as G,GLSL_FRAG as S,lin as q}from"../../kit/actors/core.js";const h=`
${G}
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vWorld = wp.xyz; vLocal = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,C=`
${G}
${S}
uniform vec3 uBase; uniform float uKind; uniform float uGloss; uniform float uScale;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 base = uBase;
  float occl = 1.0;
  if (uKind < 0.5) {
    // walnut: long figure along x, fine pores, a few darker streaks
    vec3 q = vLocal * uScale;
    float fig = fbm(vec3(q.x * 2.0, q.y * 40.0, q.z * 40.0));
    float streak = smoothstep(0.55, 0.75, fbm(vec3(q.x * 0.8, q.y * 90.0 + 3.0, q.z * 90.0)));
    float pore = smoothstep(0.82, 0.95, vnoise(vec3(q.x * 30.0, q.y * 700.0, q.z * 700.0)));
    base *= 0.78 + 0.36 * fig;
    base *= 1.0 - 0.28 * streak - 0.18 * pore;
  } else {
    float grit = vnoise(vWorld * 2600.0);
    base *= 0.92 + 0.12 * grit;
  }
  vec3 col = lightPlayer(base, N, V, occl, 0.0, 0.5, 0.8);
  vec3 H = normalize(uKeyDir + V);
  float sp = pow(max(dot(N, H), 0.0), uKind < 0.5 ? 26.0 : 12.0) * smoothstep(-0.05, 0.35, dot(N, uKeyDir));
  col += uKeyTint * sp * uGloss;
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function g(v,{colour:r,kind:s,gloss:a,scale:l=1}){const c=q(r);return new e.ShaderMaterial({vertexShader:h,fragmentShader:C,uniforms:{...v.light,uBase:{value:new e.Vector3(c.r,c.g,c.b)},uKind:{value:s},uGloss:{value:a},uScale:{value:l}}})}const V="#7A5236",k="#2A1D14",A="#2B2C30",L="#8C8A86";function N(v,r=4,{length:s=.115,depth:a=.034,height:l=.03}={}){const c=new e.Group,u=g(v,{colour:V,kind:0,gloss:.12,scale:9}),i=g(v,{colour:k,kind:0,gloss:0,scale:9}),n=new b(s,l,a,3,Math.min(l,a)*.32);n.translate(0,l/2,0);const o=new e.BoxGeometry(s*.9,.0016,.0034);o.translate(0,l+2e-4,-a*.12);const d=[];for(let f=0;f<r;f++){const t=new e.Group;t.add(new e.Mesh(n,u),new e.Mesh(o,i)),c.add(t),d.push({g:t,visible:!0})}const p=new e.Vector3,m=new e.Vector3,w=new e.Vector3;return{object:c,size:{length:s,depth:a,height:l},set(f,t){const y=d[f];t.position&&y.g.position.copy(t.position),t.quaternion&&y.g.quaternion.copy(t.quaternion),t.visible!==void 0&&(y.visible=t.visible,y.g.visible=t.visible)},update(f){for(const t of d)t.visible&&(t.g.updateMatrixWorld(),p.set(s/2,0,0).applyQuaternion(t.g.quaternion),m.set(0,0,a/2).applyQuaternion(t.g.quaternion),w.copy(t.g.position),f.shadows.cast(w,p,m,{opacity:.55,round:.6,size:s,extent:l*.6}))},setStyle(){},dispose(){n.dispose(),o.dispose(),u.dispose(),i.dispose()}}}function T(v,{size:r=.15,height:s=.026}={}){const a=new e.Group,l=g(v,{colour:A,kind:1,gloss:.28}),c=g(v,{colour:L,kind:1,gloss:.6}),u=new b(r,s,r,3,.004);u.translate(0,s/2,0);const i=new e.TorusGeometry(r*.39,.0016,6,48);i.rotateX(Math.PI/2),i.translate(0,s+3e-4,0);const n=[];for(const[t,y]of[[-1,-1],[1,-1],[-1,1],[1,1]]){const x=new e.CylinderGeometry(.0055,.0055,.0035,18);x.translate(t*r*.4,s+.0017,y*r*.4),n.push(x)}const o=M(n);for(const t of n)t.dispose();const d=[];for(const[t,y]of[[-1,-1],[1,-1],[-1,1],[1,1]]){const x=new e.CylinderGeometry(.0027,.0027,.0012,6);x.translate(t*r*.4,s+.0035,y*r*.4),d.push(x)}const p=M(d);for(const t of d)t.dispose();const m=g(v,{colour:"#121214",kind:1,gloss:0});a.add(new e.Mesh(u,l),new e.Mesh(i,m),new e.Mesh(o,c),new e.Mesh(p,m));const w=new e.Vector3,f=new e.Vector3;return{object:a,top:s,size:r,update(t){a.updateMatrixWorld(),w.set(r/2,0,0).applyQuaternion(a.quaternion),f.set(0,0,r/2).applyQuaternion(a.quaternion),t.shadows.cast(a.position,w,f,{opacity:.7,round:.15,size:r,extent:s})},setStyle(){},dispose(){u.dispose(),i.dispose(),o.dispose(),p.dispose(),l.dispose(),c.dispose(),m.dispose()}}}function B(v,r,{radius:s=.0028}={}){const a=new e.CatmullRomCurve3(r.map(d=>new e.Vector3(...d)),!1,"centripetal"),l=new e.TubeGeometry(a,96,s,10,!1),c=g(v,{colour:"#1E1C1B",kind:1,gloss:.18}),u=new e.Mesh(l,c),i=a.getSpacedPoints(24),n=new e.Vector3,o=new e.Vector3;return{object:u,update(d){for(let p=0;p<i.length-1;p++){const m=i[p],w=i[p+1];m.y>.83||w.y>.83||m.y<.79||(o.subVectors(w,m).multiplyScalar(.5),n.set(-o.z,0,o.x).setLength(s*1.6),d.shadows.cast(m.clone().add(o),n,o,{opacity:.35,round:1,size:o.length()*2}))}},setStyle(){},dispose(){l.dispose(),c.dispose()}}}function z(v,r=4,{y:s=.8068,colour:a=[1,.95,.86]}={}){const l=new e.Group,c=new e.PlaneGeometry(1,1);c.rotateX(-Math.PI/2);const u=[];for(let i=0;i<r;i++){const n=new e.ShaderMaterial({uniforms:{uAmp:{value:0},uCol:{value:new e.Vector3(...a)}},vertexShader:"varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",fragmentShader:`uniform float uAmp; uniform vec3 uCol; varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;                 // 0 centre .. 1 the edge of the quad (= 2 x the rim)
          float disc = exp(-d * d * 9.0);
          float rim = exp(-pow((d - 0.5) / 0.16, 2.0));
          float g = uAmp * (0.4 * disc + 0.6 * rim) * smoothstep(1.0, 0.8, d);
          gl_FragColor = vec4(uCol * g, 1.0);         // additive: src x alpha + dst
        }`,transparent:!1,depthTest:!1,depthWrite:!1,blending:e.AdditiveBlending}),o=new e.Mesh(c,n);o.visible=!1,o.renderOrder=-10,o.frustumCulled=!1,o.onBeforeRender=(d,p)=>{n.uniforms.uAmp.value=p.scale.y<0?0:o.userData.amp||0},o.position.y=s,l.add(o),u.push(o)}return{object:l,set(i,n){const o=u[i];if(!n||!(n.amp>5e-4)){o.visible=!1;return}o.visible=!0,o.position.x=n.x,o.position.z=n.z,o.scale.setScalar(n.r*2),o.userData.amp=n.amp},update(){},setStyle(){},dispose(){c.dispose();for(const i of u)i.material.dispose()}}}export{B as createCable,N as createHolders,T as createPlinth,z as createRipples};
