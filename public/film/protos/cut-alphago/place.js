import*as e from"three";import{RoundedBoxGeometry as N}from"three/addons/geometries/RoundedBoxGeometry.js";import{GLSL_COMMON as L,GLSL_FRAG as g,lin as x}from"../../kit/actors/core.js";const z=`
${L}
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vLN;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz; vLocal = position; vLN = normal;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,V=`
${L}
${g}
uniform vec3 uBase; uniform float uPart; uniform float uTopY;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vLN;
// a fine salt-and-pepper grain: soft round flecks a few millimetres across (smooth noise, thresholded softly)
float fleck(vec3 p, float k, float lo) { return smoothstep(lo, lo + 0.12, vnoise(p * k)); }
void main() {
  vec3 p = vLocal;
  float big = fbm(p * 5.0);                                   // slow clouding in the stone
  vec3 base = uBase * (0.93 + 0.1 * big);
  base = mix(base, vec3(0.30, 0.275, 0.25), fleck(p + 3.1, 420.0, 0.76) * 0.45);  // pale feldspar, fine
  base = mix(base, vec3(0.05, 0.047, 0.045), fleck(p + 7.7, 520.0, 0.72) * 0.55); // dark mica
  base = mix(base, vec3(0.22, 0.16, 0.12), fleck(p + 1.3, 180.0, 0.82) * 0.3);    // a warm grain here and there
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vWorld);
  float top = step(0.7, vLN.y);
  // worn arrises: where the normal turns between faces (the rounded edge), a little paler
  float arris = 1.0 - smoothstep(0.55, 0.95, max(max(abs(vLN.x), abs(vLN.y)), abs(vLN.z)));
  base = mix(base, base * 1.35 + 0.015, arris * 0.6);
  float occl = 1.0;
  if (uPart > 0.5) occl = mix(0.55, 1.0, smoothstep(-0.06, 0.0, vLocal.y));   // the pedestal darkens under the slab
  vec3 col = lightPlayer(base, N, V, occl, 0.0, 0.5, 0.55);
  // the honed top: a broad soft sheen of the low sun, and quartz glints that move with the eye
  vec3 H = normalize(uKeyDir + V);
  float sp = pow(max(dot(N, H), 0.0), 36.0) * smoothstep(-0.05, 0.3, dot(N, uKeyDir));
  float glint = smoothstep(0.93, 0.99, vnoise(p * 420.0 + 11.0));
  col += uKeyTint * sp * (0.09 + 0.6 * glint) * mix(0.4, 1.0, top);
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`,b=`
${L}
${g}
uniform vec3 uBase; uniform float uInside;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying vec3 vLN;
void main() {
  float r = length(vLocal.xz);
  float g = sin((vLocal.y * 1.0 + r * 0.35) * 420.0 + 6.0 * fbm(vLocal * 30.0));
  float g2 = sin(vLocal.y * 1500.0 + fbm(vLocal * 80.0) * 4.0);
  vec3 base = uBase * (0.92 + 0.1 * fbm(vLocal * 12.0));
  base *= 1.0 - 0.16 * smoothstep(0.2, 1.0, g) - 0.05 * smoothstep(0.5, 1.0, g2);
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < -0.1) N = -N;
  float occl = mix(1.0, mix(0.55, 1.0, smoothstep(0.0, 0.05, vLocal.y)), uInside);
  vec3 col = lightPlayer(base, N, V, occl, 0.0, 0.5, 0.8);
  vec3 H = normalize(uKeyDir + V);
  float sp = pow(max(dot(N, H), 0.0), 28.0) * smoothstep(-0.05, 0.3, dot(N, uKeyDir));
  col += uKeyTint * sp * 0.22;
  col = haze(shoulder(col), length(cameraPosition - vWorld));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function M(s,r,l){return new e.ShaderMaterial({vertexShader:z,fragmentShader:r,uniforms:{...s.light,...l}})}function k(s,{width:r=.98,depth:l=1,height:t=.42,slab:n=.075}={}){const a=new e.Group,u=new N(r,n,l,4,.012);u.translate(0,t-n/2,0);const i=new N(r*.62,t-n,l*.64,3,.02);i.translate(0,(t-n)/2,0);const m=new N(r*.7,.03,l*.72,2,.008);m.translate(0,.015,0);const w=M(s,V,{uBase:{value:x("#5d5752")},uPart:{value:0},uTopY:{value:t}}),p=M(s,V,{uBase:{value:x("#4f4a46")},uPart:{value:1},uTopY:{value:t}});i.translate(0,-(t-n),0);const v=new e.Mesh(i,p);v.position.y=t-n,a.add(new e.Mesh(u,w),v,new e.Mesh(m,p)),a.traverse(o=>{o.frustumCulled=!1}),s.scene.add(a);const d=new e.Vector3,h=new e.Vector3,y=new e.Vector3,f=new e.Quaternion;return{object:a,topY:t,size:{width:r,depth:l,height:t},castShadow(o=1){a.updateMatrixWorld(),f.setFromRotationMatrix(a.matrixWorld),d.setFromMatrixPosition(a.matrixWorld),h.set(r/2,0,0).applyQuaternion(f),y.set(0,0,l/2).applyQuaternion(f),s.shadows.cast(d,h,y,{opacity:o,shape:0,round:.05,size:Math.max(r,l),extent:t})},dispose(){s.scene.remove(a),u.dispose(),i.dispose(),m.dispose(),w.dispose(),p.dispose()}}}function B(s,{radius:r=.1,colour:l="#7a4a2c"}={}){const t=r,n=r*.78,a=[],u=24;a.push(new e.Vector2(0,.004)),a.push(new e.Vector2(t*.55,0)),a.push(new e.Vector2(t*.6,.006));for(let o=0;o<=u;o++){const c=o/u*Math.PI,P=.008+(n-.008)*(o/u),T=t*(.62+.38*Math.sin(c*.78+.3))*(1-.06*(o/u)**3);a.push(new e.Vector2(T,P))}const i=a[a.length-1].x;a.push(new e.Vector2(i-.006,n+.002)),a.push(new e.Vector2(i-.012,n-.004));for(let o=1;o<=10;o++){const c=o/10;a.push(new e.Vector2((i-.012)*Math.cos(c*Math.PI/2)*(1+.12*Math.sin(c*Math.PI)),n-.004-n*.62*Math.sin(c*Math.PI/2)))}const m=new e.LatheGeometry(a,48);m.computeVertexNormals();const w=M(s,b,{uBase:{value:x(l)},uInside:{value:1}}),p=new e.Mesh(m,w),v=[],d=i*1.04;v.push(new e.Vector2(0,0));for(let o=0;o<=12;o++){const c=o/12*(Math.PI/2);v.push(new e.Vector2(d*Math.sin(c),t*.32*(1-Math.cos(c))))}v.push(new e.Vector2(d-.005,t*.32+.004)),v.push(new e.Vector2(d-.009,t*.3));for(let o=12;o>=0;o--){const c=o/12*(Math.PI/2);v.push(new e.Vector2((d-.009)*Math.sin(c),.006+(t*.3-.006)*(1-Math.cos(c))))}const h=new e.LatheGeometry(v,48);h.computeVertexNormals();const y=M(s,b,{uBase:{value:x(l)},uInside:{value:0}}),f=new e.Mesh(h,y);for(const o of[p,f])o.frustumCulled=!1,s.scene.add(o);return{bowl:p,lid:f,radius:t,height:n,mouth:i-.012,dispose(){s.scene.remove(p),s.scene.remove(f),m.dispose(),w.dispose(),h.dispose(),y.dispose()}}}export{B as createBowl,k as createGoTable};
