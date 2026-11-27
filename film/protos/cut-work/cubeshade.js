import*as t from"three";const p=`
float cubeShadow(vec3 p, vec3 L, mat4 inv, float hs) {
  vec3 ro = (inv * vec4(p, 1.0)).xyz;
  vec3 rd = normalize(mat3(inv) * L);
  vec3 iv = 1.0 / (rd + sign(rd) * 1e-6 + vec3(1e-7));
  vec3 t0 = (vec3(-hs) - ro) * iv, t1 = (vec3(hs) - ro) * iv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), tn.z), b = min(min(tf.x, tf.y), tf.z);
  return b > 0.0 ? smoothstep(0.0, hs * 0.55, b - max(a, 0.0)) : 0.0;
}`;function x(l,a,c){const r={uCubeInv:{value:new t.Matrix4},uCubeHalf:{value:a.size/2*.96},uCubeOn:{value:0},uEarthDir:{value:new t.Vector3(0,-1,0)},uGlint:{value:.6}},e=c.object&&c.object.material,o="uniform sampler2D uFaces;",u="vec3 col = lightPlayer(base, N, V, 1.0, 0.35, grain, mix(0.22, 1.0, edge));";let i=!1;e&&e.fragmentShader&&e.fragmentShader.includes(o)&&e.fragmentShader.includes(u)?(Object.assign(e.uniforms,r),e.fragmentShader=e.fragmentShader.replace(o,`${o}
uniform mat4 uCubeInv; uniform float uCubeHalf; uniform float uCubeOn; uniform vec3 uEarthDir; uniform float uGlint;
${p}`).replace(u,`${u}
  float shd = uCubeOn * cubeShadow(vWorld, uKeyDir, uCubeInv, uCubeHalf);
  vec3 inShade = base * uShadeTint * 0.9 + base * vec3(0.05, 0.075, 0.14) * max(dot(N, uEarthDir), 0.0);
  col = mix(col, inShade, shd);
  vec3 Hh = normalize(uKeyDir + V);
  float gl = pow(max(dot(N, Hh), 0.0), 140.0) + 0.18 * pow(max(dot(N, Hh), 0.0), 22.0);
  float far = smoothstep(0.8, 1.5, length(vWorld - cameraPosition));   // a card held up at the lens keeps its print: no glare there
  col += uKeyTint * gl * uGlint * cap * far * (1.0 - shd) * smoothstep(0.0, 0.25, dot(N, uKeyDir));`),e.needsUpdate=!0,i=!0):console.warn("cut-work: the cards shader changed; no cube shadow or glint on the cards");let n=null;try{n=a.object.children[0].children[0].children[0]}catch{n=null}const s=new t.Vector3,d=new t.Quaternion,m=new t.Vector3,v=new t.Matrix4,f=new t.Vector3(1,1,1),h={object:null,update(){n&&(n.updateMatrixWorld(!0),n.matrixWorld.decompose(s,d,m),r.uCubeInv.value.copy(v.compose(s,d,f)).invert(),r.uCubeHalf.value=a.size/2*.96*Math.cbrt(Math.abs(a.object.scale.x*a.object.scale.y*a.object.scale.z)||1))}};return l.add(h),{uniforms:r,patched:i,set(b){r.uCubeOn.value=b},dispose(){l.remove(h)}}}export{p as CUBE_SHADOW_GLSL,x as createCubeShade};
