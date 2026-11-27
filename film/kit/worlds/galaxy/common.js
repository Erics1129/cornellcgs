import*as t from"three";const v="../../kit/worlds/galaxy/assets/";async function x(n,r,{mips:a=!0}={}){const c=await n.asset(v+r),o=new Image;o.decoding="async",o.src=c,await o.decode();const e=new t.Texture(o);return e.colorSpace=t.NoColorSpace,e.wrapS=t.RepeatWrapping,e.wrapT=t.ClampToEdgeWrapping,e.generateMipmaps=a,e.minFilter=a?t.LinearMipmapLinearFilter:t.LinearFilter,e.magFilter=t.LinearFilter,e.anisotropy=8,e.needsUpdate=!0,e}const w=`
vec3 acesFit(vec3 c) {
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c = IN * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  return clamp(OUT * (a / b), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 fromSRGB(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
uint pcgH(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
vec3 dither(vec2 fc) {
  uvec2 c = uvec2(fc);
  uint h = pcgH(c.x + pcgH(c.y + 913u));
  float a = float(h & 65535u) / 65535.0, b = float(h >> 16u) / 65535.0;
  return vec3((a + b - 1.0) / 255.0);
}
vec3 finish(vec3 hdr, float exposure, vec2 fc) {
  vec3 c = acesFit(hdr * exposure / 0.6);
  return toSRGB(c) + dither(fc);
}
`,h=`
in vec3 position;
out vec2 vNdc;
void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;function g(){const n=new t.BufferGeometry;return n.setAttribute("position",new t.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3)),n}function f(n,r=0,a=new t.Vector3(0,1,0)){const c=n.clone().normalize(),o=new t.Matrix4().lookAt(new t.Vector3,c,a),e=new t.Quaternion().setFromRotationMatrix(o);return r&&e.multiply(new t.Quaternion().setFromAxisAngle(new t.Vector3(0,0,-1),r)),e}function M(n,r,a=0){return f(r.clone().sub(n),a)}function d(n){const r=Math.max(-.4,Math.min(2,n??.6)),c=4600*(1/(.92*r+1.7)+1/(.92*r+.62))/100;let o,e,u;c<=66?o=1:o=Math.min(1,1.2929*Math.pow(c-60,-.1332)),c<=66?e=Math.max(0,Math.min(1,.3901*Math.log(c)-.6318)):e=Math.min(1,1.1299*Math.pow(c-60,-.0755)),c>=66?u=1:c<=19?u=0:u=Math.max(0,Math.min(1,.5432*Math.log(c-10)-1.1963));const p=s=>s<=.04045?s/12.92:Math.pow((s+.055)/1.055,2.4);let i=[p(o),p(e),p(u)];const m=Math.max(...i);i=i.map(s=>s/m);const l=.2126*i[0]+.7152*i[1]+.0722*i[2];return i.map(s=>(.5*s+.5*l)/Math.max(.2,l)*.85)}export{v as BASE,h as FULL_VERT,w as GLSL_FINISH,d as bvToRGB,g as fullScreenTriangle,x as loadTexture,M as lookQuat,f as noseQuat};
