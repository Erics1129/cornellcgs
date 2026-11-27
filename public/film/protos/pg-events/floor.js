import*as e from"three";import{GLSL_COMMON as l}from"../../kit/actors/core.js";const d=`
varying vec3 vWorld;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,c=`
${l}
uniform vec3 uCentre; uniform vec2 uHalf; uniform vec3 uBoard;
varying vec3 vWorld;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 q = vWorld.xz;
  vec2 e = abs(q - uCentre.xz) / uHalf;
  float fade = (1.0 - smoothstep(0.7, 1.0, e.x)) * (1.0 - smoothstep(0.6, 1.0, e.y));
  float grain = vnoise(vec3(q * 160.0, 0.0)) * 0.55 + vnoise(vec3(q * 620.0, 3.0)) * 0.45;
  float cloud = fbm(vec3(q * 0.75, 1.0));
  float d = 1.0 - 0.07 * grain - 0.09 * (cloud - 0.45);
  // a film of old rain from the planter, thinning toward us, broken up
  float runoff = smoothstep(1.9, 0.0, q.y - (uBoard.z - 1.6)) * smoothstep(0.42, 0.75, fbm(vec3(q * vec2(1.6, 4.0), 5.0)));
  d -= 0.07 * runoff;
  // where people stand to read: a broad, faintly polished scuff in front of the board
  float sc = exp(-pow((q.x - uBoard.x) / 1.9, 2.0) - pow((q.y - (uBoard.z + 0.9)) / 0.55, 2.0));
  d -= 0.035 * sc * (0.6 + 0.4 * vnoise(vec3(q * 9.0, 2.0)));
  // dark grit in the pores, a few small stains
  d -= 0.08 * smoothstep(0.93, 0.99, vnoise(vec3(q * 240.0, 9.0)));
  d -= 0.05 * smoothstep(0.82, 0.92, fbm(vec3(q * 3.1, 7.0))) * (1.0 - smoothstep(0.0, 0.3, sc));
  // quartz grains catching the sun (for this eye): tiny, sharp, they slide as the lens moves
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 H = normalize(V + uKeyDir);
  vec2 cell = floor(q * 420.0);
  float g = step(0.992, h21(cell)) * pow(max(H.y, 0.0), 600.0 * (0.4 + h21(cell + 7.0)));
  // honed stone in the low sun: a long bright path where it mirrors the sun, its own warm tone elsewhere (the
  // world's floor is lit evenly; this takes it down away from that path, more toward us, never in the joints' place)
  float path = pow(max(H.y, 0.0), 26.0);
  float near = smoothstep(9.0, 2.0, length(cameraPosition.xz - vWorld.xz));
  float tone = mix(0.8 - 0.06 * near, 1.0, path);
  vec3 add = uKeyTint * (g * 1.6 + pow(max(H.y, 0.0), 140.0) * 0.04) * fade;
  gl_FragColor = vec4(add, mix(1.0, d * tone, fade));
}`;function p(r,{centre:t,half:a=[9,5],board:i}){const n=new e.PlaneGeometry(a[0]*2,a[1]*2);n.rotateX(-Math.PI/2);const s=new e.ShaderMaterial({vertexShader:d,fragmentShader:c,uniforms:{...r.light,uCentre:{value:new e.Vector3(...t)},uHalf:{value:new e.Vector2(...a)},uBoard:{value:new e.Vector3(...i)}},transparent:!0,depthWrite:!1,depthTest:!0,blending:e.CustomBlending,blendEquation:e.AddEquation,blendSrc:e.OneFactor,blendDst:e.SrcAlphaFactor,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-4}),o=new e.Mesh(n,s);return o.position.set(t[0],t[1]+.002,t[2]),o.renderOrder=-5,o.frustumCulled=!1,r.scene.add(o),{mesh:o,dispose(){r.scene.remove(o),n.dispose(),s.dispose()}}}export{p as createFloor};
