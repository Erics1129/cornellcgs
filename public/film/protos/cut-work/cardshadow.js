import*as e from"three";const o=6,C=`
uniform vec3 uKeyDir;
uniform vec3 uKeyTint;
uniform vec3 uShadeTint;
uniform vec3 uCC[${o}];      // card centres
uniform vec3 uCU[${o}];      // half width along the card's short side (vector)
uniform vec3 uCV[${o}];      // half height along the card's long side (vector)
uniform float uCOn[${o}];
uniform float uRad;             // corner radius (m)
uniform float uAmount;
uniform vec3 uFloor;
varying vec3 vWorld;
varying vec3 vN;
float sdRound(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec3 L = normalize(uKeyDir);
  vec3 N = normalize(vN);
  float ndl = dot(N, L);
  float lit = smoothstep(0.0, 0.25, ndl);           // only the faces the sun reaches (the shaded side is shade already)
  if (lit <= 0.0) discard;
  float sh = 0.0;
  for (int i = 0; i < ${o}; i++) {
    if (uCOn[i] < 0.5) continue;
    vec3 U = uCU[i], V = uCV[i];
    float lu = length(U), lv = length(V);
    vec3 n = normalize(cross(U, V));
    float dn = dot(L, n);
    if (abs(dn) < 1e-4) continue;
    float t = dot(uCC[i] - vWorld, n) / dn;          // along the ray toward the sun
    if (t <= 0.002) continue;
    vec3 h = vWorld + L * t - uCC[i];
    vec2 q = vec2(dot(h, U) / lu, dot(h, V) / lv);
    float d = sdRound(q, vec2(lu, lv), uRad);
    float pen = 0.0047 * t + 0.0006;                  // the sun's half width at that distance, plus a hair for the pixel
    // a card edge-on to the sun throws only a hairline: let it go rather than draw a crack across the cube
    float broad = smoothstep(0.16, 0.42, abs(dn));
    sh = max(sh, (1.0 - smoothstep(-pen, pen, d)) * broad);
  }
  sh *= lit * uAmount;
  if (sh <= 0.002) discard;
  // the shade the cube's own lightBox gives a face out of the sun, lifted by the sunlit Earth below (in day
  // orbit the earthshine on a side face is a third of the sun or more): cool, never black
  vec3 ratio = clamp(uShadeTint * 0.64 / max(uKeyTint, vec3(1e-3)), 0.0, 1.0);
  ratio = max(ratio, uFloor);
  gl_FragColor = vec4(mix(vec3(1.0), ratio, sh), 1.0);
}`;function b(y,h,{radius:v=.009}={}){let t=null;if(h.object.traverse(l=>{!t&&l.isInstancedMesh&&l.material&&l.material.side!==e.BackSide&&(t=l)}),!t)return{set(){},dispose(){}};const s=t.material,i={...s.uniforms,uCC:{value:Array.from({length:o},()=>new e.Vector3)},uCU:{value:Array.from({length:o},()=>new e.Vector3)},uCV:{value:Array.from({length:o},()=>new e.Vector3)},uCOn:{value:new Array(o).fill(0)},uRad:{value:v},uAmount:{value:1},uFloor:{value:new e.Vector3(.4,.45,.6)}},u=new e.ShaderMaterial({vertexShader:s.vertexShader,fragmentShader:C,uniforms:i,depthWrite:!1,depthFunc:e.LessEqualDepth,transparent:!1,blending:e.CustomBlending,blendEquation:e.AddEquation,blendSrc:e.DstColorFactor,blendDst:e.ZeroFactor,blendSrcAlpha:e.ZeroFactor,blendDstAlpha:e.OneFactor}),a=new e.InstancedMesh(t.geometry,u,t.count);a.instanceMatrix=t.instanceMatrix,a.frustumCulled=!1,a.renderOrder=(t.renderOrder||0)+.5,t.parent.add(a);const f=new e.Vector3,m=new e.Vector3;return{mesh:a,set(l,p=1){i.uAmount.value=p,a.count=t.count,a.visible=t.visible&&t.parent.visible!==!1;for(let n=0;n<o;n++){const r=l[n];if(!r||!r.visible||r.noShadow){i.uCOn.value[n]=0;continue}i.uCOn.value[n]=1;const c=r.quaternion,d=r.scale??1;i.uCC.value[n].copy(r.position),i.uCU.value[n].copy(f.set(1,0,0).applyQuaternion(c).multiplyScalar(r.width*d/2)),i.uCV.value[n].copy(m.set(0,0,1).applyQuaternion(c).multiplyScalar(r.height*d/2))}},dispose(){a.parent&&a.parent.remove(a),u.dispose()}}}export{b as createCardShadow};
