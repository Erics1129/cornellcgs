import*as e from"three";const m={cam119:{p:[-16.8302,36.31,6.5],q:[.153157,.631749,-.129211,.748826],fov:35.1154}};function p(a){return Promise.resolve(a.asset("seam-sky.jpg")).then(n=>new Promise(o=>{const t=new Image;t.onload=()=>(t.decode?t.decode().catch(()=>{}):Promise.resolve()).then(()=>o(t)),t.onerror=()=>o(null),t.src=n})).catch(()=>null)}const v=`
varying vec2 vNdc;
void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,d=`
uniform sampler2D uSky; uniform mat4 uInvProj; uniform mat3 uCamRot; uniform mat3 uToSeam;
uniform vec2 uTan; uniform vec2 uElev; uniform float uMix; uniform float uFade;
varying vec2 vNdc;
vec3 srgbToLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() {
  vec4 r = uInvProj * vec4(vNdc, 1.0, 1.0);
  vec3 dw = normalize(uCamRot * (r.xyz / r.w));          // this pixel's ray in the world
  vec3 c = uToSeam * dw;                                 // ... seen from the seam camera (track 119)
  float z = max(-c.z, 1e-4);
  vec2 uv = vec2(0.5 + c.x / z / (2.0 * uTan.x), 0.5 + c.y / z / (2.0 * uTan.y));
  // past the frame's edge the sky is carried out softly (a wider mip the farther out: a tone, never streaks)
  vec2 o = max(max(-uv, uv - 1.0), 0.0) * vec2(1280.0, 720.0);
  vec3 col = textureLod(uSky, clamp(uv, 0.0, 1.0), min(6.0, log2(1.0 + max(o.x, o.y) * 0.25))).rgb;
  // low down the west film's own sky takes over (uElev: the sines of 9.5 and 17 degrees)
  float a = mix(1.0, smoothstep(uElev.x, uElev.y, dw.y), uMix) * uFade;
  if (c.z > -1e-4) a = 0.0;
  vec4 o4 = linearToOutputTexel(vec4(srgbToLin(col), 1.0));
  gl_FragColor = vec4(o4.rgb * a, a);
}`;function f(){const a=new e.Texture;a.colorSpace=e.NoColorSpace,a.generateMipmaps=!0,a.minFilter=e.LinearMipmapLinearFilter,a.magFilter=e.LinearFilter,a.wrapS=a.wrapT=e.ClampToEdgeWrapping;const n=new e.Matrix3().setFromMatrix4(new e.Matrix4().makeRotationFromQuaternion(new e.Quaternion().fromArray(m.cam119.q))).transpose(),o=Math.tan(m.cam119.fov*Math.PI/360),t={uSky:{value:a},uInvProj:{value:new e.Matrix4},uCamRot:{value:new e.Matrix3},uToSeam:{value:n},uTan:{value:new e.Vector2(o*(16/9),o)},uElev:{value:new e.Vector2(Math.sin(9.5*Math.PI/180),Math.sin(17*Math.PI/180))},uMix:{value:0},uFade:{value:1}},i=new e.BufferGeometry;i.setAttribute("position",new e.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));const u=new e.ShaderMaterial({vertexShader:v,fragmentShader:d,uniforms:t,depthTest:!0,depthWrite:!0,transparent:!1,blending:e.CustomBlending,blendSrc:e.OneFactor,blendDst:e.OneMinusSrcAlphaFactor,blendSrcAlpha:e.OneFactor,blendDstAlpha:e.OneMinusSrcAlphaFactor}),r=new e.Mesh(i,u);r.frustumCulled=!1,r.renderOrder=-1e9,r.visible=!1;let c=!1;return{mesh:r,uniforms:t,get loaded(){return c},setImage(s){a.image=s,a.needsUpdate=!0,c=!0},actor:{object:r,update(s){if(!r.visible)return;const l=s.camera;t.uInvProj.value.copy(l.projectionMatrixInverse),t.uCamRot.value.setFromMatrix4(l.matrixWorld)},dispose(){i.dispose(),u.dispose(),a.dispose()}}}}export{m as PC,f as createSky,p as loadSky};
