import*as c from"three";import{GLSL_COMMON as k,GLSL_FRAG as L}from"../../kit/actors/core.js";const M=Math.PI*2,b=[[0,.004,.006,-.012],[.02,.022,.026,-.012],[.06,.042,.05,-.012],[.12,.062,.07,-.012],[.2,.082,.086,-.01],[.3,.1,.099,-.006],[.4,.109,.107,0],[.5,.105,.1,.002],[.6,.092,.084,.004],[.7,.074,.058,.006],[.8,.054,.034,.006],[.9,.034,.018,.006],[.96,.02,.012,.006],[1,.014,.01,.006]];function P(d){let l=0;for(;l<b.length-2&&d>b[l+1][0];)l++;const m=b[Math.max(0,l-1)],v=b[l],f=b[l+1],u=b[Math.min(b.length-1,l+2)],o=(d-v[0])/(f[0]-v[0]),s=t=>{const n=m[t],e=v[t],r=f[t],a=u[t];return .5*(2*e+(-n+r)*o+(2*n-5*e+4*r-a)*o*o+(-n+3*e-3*r+a)*o*o*o)};return{h:s(1),w:s(2),y:s(3)}}function N(){const d=[],l=[],m=[];let v=0;const f=(o,s,t,n)=>{for(let e=0;e<=s;e++)for(let r=0;r<=o;r++){const a=t(r/o,e/s);d.push(a.p[0],a.p[1],a.p[2]),l.push(n,a.s,a.u,a.w)}for(let e=0;e<s;e++)for(let r=0;r<o;r++){const a=v+e*(o+1)+r,h=a+1,i=a+o+1,p=i+1;m.push(a,i,h,h,i,p)}v+=(o+1)*(s+1)};f(48,120,(o,s)=>{const t=Math.pow(s,1.15),n=o*M,e=P(t),r=Math.cos(n),a=Math.sin(n),h=1-.35*Math.max(0,1-t/.32),i=a>0?Math.sign(a)*Math.pow(Math.abs(a),h):a,p=a<0?1+.12*Math.max(0,1-t/.3):1;let w=e.w*r*(a<0?1+.06*Math.max(0,1-t/.3):1),x=e.y+e.h*i*p;return a>.6&&(x+=.0035*Math.pow(a,6)*Math.max(0,Math.sin((t-.7)*160))*(t>.7&&t<.93?1:0)),x+=.012*Math.exp(-Math.pow((t-.645)/.04,2))*Math.max(0,a)**4,{p:[w,x,.5-t],s:t,u:n/M,w:0}},0);for(const o of[-1,1]){const s=[o*.075,-.05,.19],t=[o*Math.cos(35*Math.PI/180),-Math.sin(35*Math.PI/180),-.36],n=Math.hypot(...t),e=t.map(a=>a/n),r=.32;f(12,40,(a,h)=>{const i=h,p=a*M,w=(.062*(1-i)+.012*i)*(1-.6*i*i)+.01*Math.sin(Math.PI*i),x=1+.07*Math.max(0,Math.sin(i*Math.PI*11))*(i>.08?1:0),q=w*.17,g=Math.cos(p),S=Math.sin(p),V=g>0?g*w*.32*x:g*w*.68,z=S*q*(g>0?1:.6+.4*(1+g)),y=[s[0]+e[0]*r*i,s[1]+e[1]*r*i,s[2]+e[2]*r*i],B=o*Math.sin(35*Math.PI/180),D=Math.cos(35*Math.PI/180);return{p:[y[0]+z*B,y[1]+z*D,y[2]+V],s:.31,u:i,w:o}},o<0?1:2)}f(80,6,(o,s)=>{const t=(o-.5)*2*.165,n=Math.abs(t)/.165,e=.5-.965-.2*Math.pow(n,1.6)*.165,r=.075*Math.sqrt(Math.max(0,1-Math.pow(n,2.2)))+.008;let a=e-r;a+=.022*Math.exp(-Math.pow(t/.014,2)),a+=.003*Math.sin(t*260)+.002*Math.sin(t*610+1);const h=s/6,i=e+(a-e)*h,p=.006*(1-n)*Math.sin(Math.PI*h);return{p:[t,.006+p,i],s:.985+.015*h,u:t/.165,w:0}},3),f(80,6,(o,s)=>{const t=(.5-o)*2*.165,n=Math.abs(t)/.165,e=.5-.965-.2*Math.pow(n,1.6)*.165,r=.075*Math.sqrt(Math.max(0,1-Math.pow(n,2.2)))+.008;let a=e-r;a+=.022*Math.exp(-Math.pow(t/.014,2)),a+=.003*Math.sin(t*260)+.002*Math.sin(t*610+1);const h=s/6,i=e+(a-e)*h,p=.006*(1-n)*Math.sin(Math.PI*h);return{p:[t,.006-p,i],s:.985+.015*h,u:t/.165,w:-1}},3),f(10,10,(o,s)=>{const t=s,n=o*M,e=.5-.62,r=.05*(1-t)+.008,a=e-.03*t*t-r*.5+Math.cos(n)*r*.5,h=P(.645).y+P(.645).h+.008+.026*t;return{p:[Math.sin(n)*.006*(1-t),h,a],s:.62,u:t,w:0}},4);const u=new c.BufferGeometry;return u.setAttribute("position",new c.Float32BufferAttribute(d,3)),u.setAttribute("aPart",new c.Float32BufferAttribute(l,4)),u.setIndex(m),u.computeVertexNormals(),u.boundingSphere=new c.Sphere(new c.Vector3,1e5),u}const F=`
${k}
attribute vec4 aPart;
uniform vec4 uBeat;    // phase (rad), amount, flipper phase, -
varying vec3 vWorld; varying vec3 vN; varying vec4 vPart; varying vec3 vLocal;
// the tail beat: a wave that grows toward the flukes, the body following through to the head with a small pitch
float bendY(float s) {
  float k = smoothstep(0.25, 1.0, s);
  return uBeat.y * (0.045 * k * k * sin(uBeat.x - 2.6 * s) + 0.006 * sin(uBeat.x - 2.6 * s + 0.8) * (1.0 - s));
}
void main() {
  vec3 p = position;
  vec3 n = normal;
  float s = aPart.y;
  float dy = bendY(s);
  float slope = (bendY(s + 0.01) - bendY(s - 0.01)) / 0.02;
  if (aPart.x > 2.5 && aPart.x < 3.5) {
    // the flukes pitch with the stroke
    float z0 = 0.5 - 0.985;
    float pitch = -slope * 1.4;
    float dz = p.z - z0;
    p.y += dz * pitch;
  }
  if (aPart.x > 0.5 && aPart.x < 2.5) {
    // the flippers trim slowly, a few degrees
    float side = aPart.w;
    float trim = 0.05 * sin(uBeat.z) * aPart.z;
    p.y += trim * 0.32;
  }
  p.y += dy;
  n = normalize(n + vec3(0.0, -slope * n.z, 0.0));
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * n); vPart = aPart; vLocal = p;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,I=`
${k}
${L}
uniform float uFade; uniform float uHazeScale; uniform vec3 uDark; uniform vec3 uPale; uniform float uSeed;
varying vec3 vWorld; varying vec3 vN; varying vec4 vPart; varying vec3 vLocal;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  float part = vPart.x, s = vPart.y;
  vec3 q = vLocal;
  // countershading: charcoal back and flanks, the throat and belly pale and marbled, the border ragged
  float mar = fbm(vec3(q.z * 40.0, q.y * 40.0, q.x * 40.0 + uSeed * 9.0));
  float under = smoothstep(0.05, -0.35, N.y + 0.25 * (mar - 0.5));
  float throat = under * (1.0 - smoothstep(0.45, 0.62, s));
  float belly = under * (0.35 + 0.65 * (1.0 - smoothstep(0.3, 0.8, s))) * (0.55 + 0.45 * mar);
  vec3 base = mix(uDark * (0.85 + 0.3 * mar), uPale * (0.75 + 0.25 * mar), clamp(max(throat, belly), 0.0, 1.0));
  // the throat pleats: long grooves from the chin to the navel, dark lines between pale ridges
  float ang = atan(q.y + 0.01, q.x);
  float pl = abs(fract(ang * 22.0 / 6.2831853) - 0.5);
  float fw = fwidth(ang * 22.0 / 6.2831853) + 1e-4;
  float pleat = (1.0 - smoothstep(0.06, 0.06 + fw * 1.5, pl)) * throat * (1.0 - smoothstep(0.5, 0.56, s)) * smoothstep(0.03, 0.08, s);
  base *= 1.0 - 0.45 * pleat;
  // the flippers: white on both faces, their leading edges crusted with barnacles; the flukes' underside pale with dark patches
  if (part > 0.5 && part < 2.5) base = mix(uPale * 0.95, uDark, 0.12 * smoothstep(0.0, 0.12, vPart.z) * (1.0 - smoothstep(0.1, 0.3, vPart.z)));
  if (part > 2.5 && part < 3.5) base = vPart.w < -0.5 ? mix(uPale, uDark, smoothstep(0.55, 0.7, fbm(vec3(vPart.z * 6.0, q.z * 30.0, uSeed)))) : uDark * 0.9;
  if (part > 3.5) base = uDark;
  // barnacles: pale specks crowded on the chin and along the jaw, and on the flipper tips
  float bn = vnoise(vec3(q * 260.0 + uSeed * 3.0));
  float zone = (1.0 - smoothstep(0.02, 0.09, s)) + (part > 0.5 && part < 2.5 ? smoothstep(0.7, 0.95, vPart.z) : 0.0);
  float barn = smoothstep(0.72, 0.86, bn) * zone * (1.0 - smoothstep(0.3, 0.8, fwidth(q.x * 260.0)));
  // knobs: rows on the rostrum's top and along the jaw (fist-sized bumps, each a soft highlight)
  float kn = 0.0;
  if (part < 0.5 && s < 0.28) {
    vec2 g = vec2(s * 90.0, (q.x / max(0.02, prof_w(s))) * 3.0);
    vec2 f = fract(g) - 0.5;
    kn = exp(-dot(f, f) * 22.0) * smoothstep(0.2, 0.7, N.y) * (1.0 - smoothstep(0.4, 0.9, fwidth(g.x)));
  }
  // rake scars: pale parallel strokes on the flanks and the tail stock
  float rk = smoothstep(0.93, 0.985, sin(q.z * 900.0 + q.y * 300.0 + 2.0 * fbm(q * 30.0))) * smoothstep(0.5, 0.85, fbm(q * 18.0 + uSeed)) * (1.0 - under) * (1.0 - smoothstep(0.3, 0.8, fwidth(q.z * 900.0)));
  base = mix(base, uPale * 0.9, clamp(barn * 0.8 + rk * 0.35, 0.0, 1.0));
  vec3 col = lightPlayer(base, N, V, 1.0, 0.0, mar, 0.3);
  col += uKeyTint * kn * 0.06;
  // a wet sheen from the light far above
  vec3 H = normalize(V + uKeyDir);
  col += uKeyTint * pow(max(dot(N, H), 0.0), 40.0) * 0.12;
  float dist = length(cameraPosition - vWorld);
  float k = 1.0 - exp(-uHazeDensity * uHazeScale * dist);
  k = clamp(k + uFade * (1.0 - k), 0.0, 1.0);
  // she hazes toward a slightly darker water than the haze itself: far off she holds as a silhouette
  col = mix(shoulder(col), uHazeColor * 0.82, k);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function H(d,l,m=.004){const v=d(l-m),f=d(l+m),u=d(l),o=new c.Vector3().subVectors(f,v).normalize(),s=new c.Vector3().crossVectors(new c.Vector3(0,1,0),o).normalize(),t=new c.Vector3().crossVectors(o,s).normalize(),n=new c.Matrix4().makeBasis(s,t,o);return{p:u,q:new c.Quaternion().setFromRotationMatrix(n)}}function C(d,l={}){const m=N(),v=a=>new c.ShaderMaterial({vertexShader:F,fragmentShader:I.replace("prof_w(s)","(0.006 + 0.32 * s)"),uniforms:{...d.light,uBeat:{value:new c.Vector4(0,1,0,0)},uFade:{value:0},uHazeScale:{value:l.hazeScale??.5},uDark:{value:new c.Color(l.dark||"#1A2028").convertSRGBToLinear()},uPale:{value:new c.Color(l.pale||"#D9DDDA").convertSRGBToLinear()},uSeed:{value:a}},side:c.DoubleSide}),f=[v(.3),v(1.7)],u=new c.Mesh(m,f[0]),o=new c.Mesh(m,f[1]);u.frustumCulled=o.frustumCulled=!1;const s=new c.Group;s.add(u,o);const t=l.length||14,n=l.calf||4.7,e={p:new c.Vector3,q:new c.Quaternion,t:0,fade:0,visible:!0},r={object:s,along(a,h,i,p={}){const w=H(a,h);return e.p.copy(w.p),e.q.copy(w.q),e.t=i,p.fade!==void 0&&(e.fade=p.fade),p.visible!==void 0&&(e.visible=p.visible),r},update(){s.visible=e.visible;const a=e.t/6.5*M;u.position.copy(e.p),u.quaternion.copy(e.q),u.scale.setScalar(t),u.position.y+=.012*t*Math.sin(a-.6),f[0].uniforms.uBeat.value.set(a,1,e.t/11*M,0);const h=new c.Vector3(.5*Math.sin(e.t/19),.3*Math.sin(e.t/23+1),.4*Math.sin(e.t/17+2)),i=new c.Vector3(-.2*t,-.15*t,.04*t).add(h).applyQuaternion(e.q);o.position.copy(e.p).add(i),o.quaternion.copy(e.q),o.scale.setScalar(n);const p=e.t/4*M+1.3;o.position.y+=.012*n*Math.sin(p-.6),f[1].uniforms.uBeat.value.set(p,1,e.t/7*M,0);for(const w of f)w.uniforms.uFade.value=e.fade},dispose(){m.dispose();for(const a of f)a.dispose()}};return r}export{C as createHumpbacks};
