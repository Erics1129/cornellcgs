import*as e from"three";const w="void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",x=`
uniform vec2 uSun;      // the star on screen, buffer px from the bottom left
uniform float uVis;     // 0..1 of its disc uncovered
uniform float uK;       // buffer px per 720p px
uniform vec3 uCol;
uniform float uLimb;    // 0..1 how close a limb is to the star (a bead of light on the edge as it clears)
float spike(vec2 d, float ang, float len, float w) {
  vec2 a = vec2(cos(ang), sin(ang));
  float along = abs(dot(d, a)), across = abs(dot(d, vec2(-a.y, a.x)));
  return exp(-across / w) * exp(-pow(along / len, 1.5)) * smoothstep(0.0, 6.0, along);
}
void main() {
  vec2 d = (gl_FragCoord.xy - uSun) / uK;
  float r = length(d);
  float v = uVis;
  float core = exp(-pow(r / 2.6, 2.0)) * 1.6;
  float glow = exp(-r / 20.0) * 0.34 + exp(-r / 95.0) * 0.07;
  float sp = 0.0;
  float L = 22.0 + 70.0 * v;             // the spikes lengthen as more of the disc shows
  for (int i = 0; i < 6; i++) sp += spike(d, 1.5708 + float(i) * 1.0472, L, 0.75);
  sp += 0.55 * spike(d, 0.0, L * 0.45, 0.6);
  vec3 c = uCol * (core * (0.4 + 0.6 * v) + glow * v + sp * 0.55 * v * v);
  // the bead: as the star clears a limb, the first sliver flashes a touch brighter than its share
  c += uCol * uLimb * exp(-pow(r / 4.0, 2.0)) * 0.9;
  gl_FragColor = vec4(c, 1.0);
}`;function M(l){const u=new e.BufferGeometry;u.setAttribute("position",new e.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));const t={uSun:{value:new e.Vector2},uVis:{value:0},uK:{value:1},uLimb:{value:0},uCol:{value:new e.Color(1,.94,.86)}},d=new e.ShaderMaterial({vertexShader:w,fragmentShader:x,uniforms:t,transparent:!0,depthTest:!1,depthWrite:!1,blending:e.AdditiveBlending}),a=new e.Mesh(u,d);a.frustumCulled=!1,a.renderOrder=50;const n=l.add({object:a,dispose(){u.dispose(),d.dispose()}});return{set({at:o,vis:i,limb:c=0,W:f,H:s,dpr:r}){t.uSun.value.set(o.x*r,(s-o.y)*r),t.uVis.value=i,t.uLimb.value=c,t.uK.value=s/720*r,a.visible=!o.behind&&(i>.001||c>.001)},dispose(){l.remove(n),n.dispose()}}}function V(l,u,t,d=.0065){const a=new e.Vector3().subVectors(u,l).normalize(),n=new e.Vector3;let o=1,i=0,c=-1;for(let f=0;f<t.length;f++){const s=t[f];n.subVectors(s.centre,l);const r=n.dot(a);if(r<=0)continue;const p=n.length();if(p<=s.radius)continue;const b=Math.acos(Math.min(1,r/p)),g=Math.asin(Math.min(1,s.radius/p)),h=(b-g)/d,v=h<=-1?0:h>=1?1:.5+.5*Math.sin(h*Math.PI/2);v<o&&(o=v,c=f);const m=Math.exp(-Math.pow((h-1.2)/1.1,2));m>i&&(i=m*(s.beadK??1))}return{vis:o,limb:i*o,who:c}}export{M as createGlare,V as sunVisibility};
