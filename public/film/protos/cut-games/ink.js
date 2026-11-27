import*as e from"three";import{GLSL_COMMON as fe,GLSL_FRAG as Ue,lin as he}from"../../kit/actors/core.js";import{CAUSTIC_GLSL as Pe,surgeAt as pe}from"./caustics.js";import{h01 as l}from"./lib.js";const x=[.93,0,.37],Be=.13,qe=`
attribute vec4 aPuff;     // centre xyz, radius
attribute vec4 aCol;      // linear rgb, alpha
attribute vec4 aSeed;     // seed, age, angle, erosion
uniform vec3 uCur;        // the current's direction (a puff is drawn out along it as it ages)
varying vec2 vUv; varying vec4 vCol; varying vec4 vSeed; varying vec3 vW;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float c = cos(aSeed.z), s = sin(aSeed.z);
  vec2 o = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
  vec2 sd = vec2(dot(uCur, right), dot(uCur, up));
  float sl = length(sd);
  if (sl > 0.05) { sd /= sl; o += sd * dot(o, sd) * min(0.9, aSeed.y * 0.28) * sl; }
  vec3 w = aPuff.xyz + (right * o.x + up * o.y) * aPuff.w;
  vUv = position.xy; vCol = aCol; vSeed = aSeed; vW = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`,De=`
${fe}
${Ue}
${Pe}
uniform float uTop; uniform vec3 uWallMin[3]; uniform vec3 uWallMax[3]; uniform float uFocusK;
varying vec2 vUv; varying vec4 vCol; varying vec4 vSeed; varying vec3 vW;
float sdBox(vec3 p, vec3 lo, vec3 hi) { vec3 c = (lo + hi) * 0.5, h = (hi - lo) * 0.5; vec3 q = abs(p - c) - h; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  if (vSeed.w < -0.5) {
    // a fine thread of the ring: a small soft dot
    float a0 = vCol.a * exp(-r * r * 3.2) * (1.0 - smoothstep(0.7, 1.0, r));
    a0 *= smoothstep(uTop + 0.004, uTop + 0.05, vW.y);
    if (a0 < 0.003) discard;
    float l0 = dot(vCol.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 c0 = mix(max(mix(vec3(l0), vCol.rgb, 1.45), 0.0) * 1.05, vec3(1.0), 0.02 + 0.12 * vSeed.x);
    c0 *= mix(vec3(0.9), uKeyTint / uFocusK, 0.35) * 1.1;
    c0 = haze(c0, length(cameraPosition - vW) * 0.7);
    gl_FragColor = vec4(c0 * a0, a0);
    return;
  }
  // a billow: a warped, layered noise with a radial falloff and a soft eroding threshold, so each puff is a soft lobe
  // with a clean but feathered edge that thins into wisps as it ages; deeper where it is thick
  vec3 np = vec3(vUv * 0.95 + vSeed.x * 3.7, vSeed.y * 0.18 + vSeed.x);
  vec2 wq = vec2(vnoise(np * 1.2 + 4.1), vnoise(np * 1.2 + 9.3)) - 0.5;
  vec3 p2 = np + vec3(wq * 1.5, 0.0);
  float n = 0.66 * vnoise(p2) + 0.26 * vnoise(p2 * 2.05 + 3.3) + 0.08 * vnoise(p2 * 4.2 + 7.7);
  float shape = n + 0.6 - 1.0 * r * r;
  float erode = 0.36 + 0.42 * vSeed.w;
  float body = smoothstep(erode, erode + 0.26, shape);
  float dens = body * (0.55 + 0.5 * smoothstep(erode + 0.1, erode + 0.55, shape));
  float a = vCol.a * dens;
  // never cut by the board: fade into the tops and the walls instead
  a *= smoothstep(uTop + 0.002, uTop + 0.055, vW.y);
  float sd = 1e3;
  for (int i = 0; i < 3; i++) sd = min(sd, sdBox(vW, uWallMin[i], uWallMax[i]));
  a *= smoothstep(0.0, 0.035, sd);
  if (a < 0.003) discard;
  // dye: richer and deeper where it is thick, clear and bright where it thins; lit by the place, hazed with distance
  float l = dot(vCol.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 dye = max(mix(vec3(l), vCol.rgb, 1.3), 0.0);
  vec3 c = mix(dye * (1.25 - 0.35 * smoothstep(0.62, 1.1, dens)), vec3(1.0), 0.1 * (1.0 - dens));
  float net = causticNet(vW, 2.0);
  c *= mix(vec3(0.82), uKeyTint * (0.85 + 0.3 * net) / uFocusK, 0.4 + 0.25 * clamp(vUv.y, -1.0, 1.0)) * 1.12;
  c = haze(c, length(cameraPosition - vW) * 0.7);
  gl_FragColor = vec4(c * a, a);
}`,Ie=`
uniform sampler2D uInk; uniform vec2 uTexel; uniform float uTime;
varying vec2 vUv;
float h2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
void main() {
  // the edge wanders a little, so a cloud's rim is torn rather than round
  vec2 q = vUv / uTexel;
  vec2 off = (vec2(n2(q * 0.06 + uTime * 0.05), n2(q * 0.06 + 17.0 - uTime * 0.04)) - 0.5) * 6.0 * uTexel;
  vec4 s = texture2D(uInk, vUv + off);
  float d = s.a;
  if (d < 0.004) discard;
  vec3 col = s.rgb / d;
  float body = smoothstep(0.035, 0.22, d);
  float a = (1.0 - exp(-1.9 * d)) * body;
  // ink is deeper and richer where it is thick, with a faint darker skin at its edge
  float rim = body * (1.0 - smoothstep(0.22, 0.5, d));
  col *= mix(1.12, 0.72, smoothstep(0.25, 1.4, d)) * (1.0 - 0.16 * rim);
  a = min(a, 0.8);
  gl_FragColor = vec4(linearToOutputTexel(vec4(col, 1.0)).rgb * a, a);
}`,Oe=`
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,Le=`
${fe}
uniform vec4 uStain[16]; uniform vec3 uStainCol[16]; uniform int uStainN; uniform vec2 uCur;
varying vec3 vW;
void main() {
  vec3 tint = vec3(1.0);
  vec2 side = vec2(-uCur.y, uCur.x);
  float n = 0.6 * vnoise(vec3(vW.xz * 9.0, 1.0)) + 0.4 * vnoise(vec3(vW.xz * 27.0, 3.0));
  for (int i = 0; i < 16; i++) {
    if (i >= uStainN) break;
    vec4 s = uStain[i];
    if (s.w <= 0.001) continue;
    vec2 d = vW.xz - s.xy;
    float along = dot(d, uCur), across = dot(d, side);
    float L = s.z;
    float g = exp(-pow(max(0.0, abs(along - L * 0.5) - L * 0.5) / 0.07, 2.0) - pow(across / (0.075 + 0.12 * clamp(along / 0.5, 0.0, 1.0)), 2.0));
    g *= 0.55 + 0.9 * n;
    tint *= 1.0 - clamp(g * s.w, 0.0, 0.8) * (1.0 - uStainCol[i]);
  }
  gl_FragColor = vec4(tint, 1.0);
}`;function je(P,H,{max:q=1100,colours:O,layout:me,region:ge,occluders:xe=[],scene:Me=null}){const D=Me||P.scene,b=me,g=new e.InstancedBufferGeometry;g.setAttribute("position",new e.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3)),g.setIndex([0,1,2,0,2,3]);const K=new e.InstancedBufferAttribute(new Float32Array(q*4),4),X=new e.InstancedBufferAttribute(new Float32Array(q*4),4),Z=new e.InstancedBufferAttribute(new Float32Array(q*4),4);for(const a of[K,X,Z])a.setUsage(e.DynamicDrawUsage);g.setAttribute("aPuff",K),g.setAttribute("aCol",X),g.setAttribute("aSeed",Z),g.instanceCount=0,g.boundingSphere=new e.Sphere(new e.Vector3,1e5);const we=b.walls.map(a=>new e.Vector3(...a.min)),ye=b.walls.map(a=>new e.Vector3(...a.max)),J=new e.ShaderMaterial({vertexShader:qe,fragmentShader:De,uniforms:{...P.light,...H.uniforms,uCur:{value:new e.Vector3(x[0],x[1],x[2]).normalize()},uTop:{value:b.top},uWallMin:{value:we},uWallMax:{value:ye},uFocusK:{value:1}},transparent:!0,depthWrite:!1,depthTest:!0,blending:e.CustomBlending,blendEquation:e.AddEquation,blendSrc:e.OneFactor,blendDst:e.OneFactor,blendSrcAlpha:e.OneFactor,blendDstAlpha:e.OneFactor}),Q=new e.Mesh(g,J);Q.frustumCulled=!1;const te=new e.Scene;te.add(Q);let p=null;const oe=new e.MeshBasicMaterial({colorWrite:!1}),ne=5;for(const a of xe)a.layers.enable(ne);const Y={uInk:{value:null},uTexel:{value:new e.Vector2(1,1)},uTime:{value:0}},A=new e.Mesh(new e.BufferGeometry().setAttribute("position",new e.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3)),new e.ShaderMaterial({vertexShader:"varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }",fragmentShader:Ie,uniforms:Y,transparent:!0,depthTest:!1,depthWrite:!1,blending:e.CustomBlending,blendSrc:e.OneFactor,blendDst:e.OneMinusSrcAlphaFactor,blendSrcAlpha:e.OneFactor,blendDstAlpha:e.OneMinusSrcAlphaFactor}));A.frustumCulled=!1,A.renderOrder=30;const[ae,re,se,ie]=ge,be=56,Se=40,L=new e.PlaneGeometry(se-ae,ie-re,be,Se);L.rotateX(-Math.PI/2);{const a=L.getAttribute("position");for(let o=0;o<a.count;o++){const i=a.getX(o)+(ae+se)/2,u=a.getZ(o)+(re+ie)/2;a.setXYZ(o,i,b.heightAt(i,u)+.004,u)}L.computeBoundingSphere()}const V={uStain:{value:Array.from({length:16},()=>new e.Vector4)},uStainCol:{value:Array.from({length:16},()=>new e.Vector3(1,1,1))},uStainN:{value:0},uCur:{value:new e.Vector2(x[0],x[2]).normalize()}},ce=new e.ShaderMaterial({vertexShader:Oe,fragmentShader:Le,uniforms:V,transparent:!0,depthWrite:!1,depthTest:!0,blending:e.CustomBlending,blendEquation:e.AddEquation,blendSrc:e.DstColorFactor,blendDst:e.ZeroFactor}),R=new e.Mesh(L,ce);R.frustumCulled=!1,R.renderOrder=1,D.add(R,A);const Ce=O.map(a=>he(a)),Ae=he("#D8CCAE"),$=[],Ve=new e.Vector3,Re=new e.Vector3,le=[x[0]/Math.hypot(x[0],x[2]),x[2]/Math.hypot(x[0],x[2])];function _(a,o,i,u,S,w,f,h=0){u<=.004||o<=.001||$.push({x:a[0],y:a[1],z:a[2],r:o,c:i,a:u,seed:S,age:w,angle:f,dens:h})}function E(a,o,i,u,S,w,f){const h=i*(1-Math.exp(-u/i)),F=pe(w),t=pe(w-u),d=Be*Math.max(0,u-.25);return f[0]=a[0]+o[0]*h+le[0]*d+(F[0]-t[0])*.8,f[1]=a[1]+o[1]*h+S*u,f[2]=a[2]+o[2]*h+le[1]*d+(F[1]-t[1])*.8,f}const m=[0,0,0];return{mesh:Q,stain:R,set(a,o,i,u,S,w=1){$.length=0,J.uniforms.uFocusK.value=w;const f=b.S;let h=0;for(const t of a){const d=u(t.cell),C=Ce[d],W=S(t.cell);if(t.kind==="soak"){const r=t.dir,z=[-r[1],r[0]],s=[W[0]+r[0]*.05*f,b.top+.01,W[2]+r[1]*.05*f],n=o-t.at,c=2.2+.4*l(t.seed*3.3);if(n>=0&&n<=c+.3){const v=.26*(1-Math.exp(-n/.6))+.02*n;E([s[0],s[1]+v,s[2]],[r[0]*.08,0,r[1]*.08],.5,n,0,i,m);const I=m[0],G=m[1],ee=m[2],de=Math.min(1,n/.1)*(1-M(c*.4,c,n)),B=M(0,c,n),Fe=.025+.075*(1-Math.exp(-n/.75))+.012*n,ue=.014+.03*(1-Math.exp(-n/.55)),We=7*.9*(1-Math.exp(-n/.9)),ze=.25*Math.sin(t.seed*1.7),ve=44;for(let y=0;y<ve;y++){const k=t.seed*17.3+y*3.1,T=y/ve*Math.PI*2+(l(k)-.5)*.3,U=l(k+1)*Math.PI*2+We,N=1+.25*(l(k+2)-.5)+.35*B,j=Fe+ue*Math.cos(U)*N,ke=[I+Math.cos(T)*j,G+ue*Math.sin(U)*N+Math.cos(T)*j*ze,ee+Math.sin(T)*j],Te=.03+.012*l(k+3)+.03*B;_(ke,Te,C,.24*de*(1-.5*B),B,n,0,-1)}for(let y=0;y<12;y++){const k=t.seed*9.1+y*1.9,T=(y+.5)/12,U=n-.02*y;if(U<0)continue;const N=.006*Math.sin(T*9+t.seed+U*2),j=T+(1-T)*M(.25,1.6,U);E([s[0]+N+(l(k)-.5)*.006,s[1]+.01+v*j*.92,s[2]+N*.7+(l(k+1)-.5)*.006],[r[0]*.05,0,r[1]*.05],.5,U,.003,i,m),_(m.slice(),.018+.02*B+.006*l(k+4),C,.24*de*(.5+.5*T)*(1-.45*B),B,U,0,-1)}}if(h<16){const v=o-t.at;V.uStain.value[h].set(W[0],W[2],.08+.42*M(0,3.5,v),.42*M(.1,1.4,v)*(1-(t.washAmt||0))),V.uStainCol.value[h].set(C.r,C.g,C.b),h++}}else if(t.kind==="splash"){const r=t.dir;for(let z=0;z<5;z++){const s=t.seed*31.7+z*5.3,n=o-t.at;if(n<0||n>1.1)continue;const c=Math.atan2(r[1],r[0])+(l(s)-.5)*2.4,v=.2+.25*l(s+1),I=[t.p[0]+Math.cos(c)*.03,b.top+.02+.03*l(s+2),t.p[2]+Math.sin(c)*.03];E(I,[Math.cos(c)*v,.06+.1*l(s+3),Math.sin(c)*v],.22,n,.02,i,m);const G=.006+.006*l(s+4)+.012*(1-Math.exp(-n/.5));_(m.slice(),G,C,.55*Math.min(1,n/.05)*(1-M(.25,1.1,n)),M(0,1.1,n),n,0,-1)}}else if(t.kind==="wash"){const r=o-t.at;if(r>=0&&r<=2.2){const z=Math.min(1,r/.45)*(1-M(.7,2.2,r));for(let s=0;s<5;s++){const n=t.seed*13.7+s*2.9,c=(.14+.06*s)*(1-Math.exp(-r/.7))+(.07+.03*s)*r;E([W[0]+(l(n)-.5)*.5*f,b.top+.015+c,W[2]+(l(n+1)-.5)*.5*f],[0,0,0],.6,r,0,i,m);const v=.07+.05*(1-Math.exp(-r/.8))+.014*r;_(m.slice(),v,C,(.17-.02*s)*z,l(n+5)*10,r,l(n+6)*6.28,M(0,2.2,r)*.8+.1)}}}else if(t.kind==="sand")for(const[r,z]of[[0,0],[1,.47]])for(let s=0;s<5;s++){const n=t.seed*7.9+s*1.7+r*11,c=o-(t.at+z);if(c<0||c>1)continue;const v=s/5*6.283+l(n)*.9,I=.55*f,G=[W[0]+Math.cos(v)*I,b.top-.005,W[2]+Math.sin(v)*I];E(G,[Math.cos(v)*.12,.05,Math.sin(v)*.12],.2,c,0,i,m);const ee=.012+.03*(1-Math.exp(-c/.3));_(m.slice(),ee,Ae,.5*Math.min(1,c/.06)*(1-M(.2,1,c)),l(n+2)*10,c,l(n+3)*6.28,M(0,1,c))}}V.uStainN.value=h;for(let t=h;t<16;t++)V.uStain.value[t].set(0,0,0,0);const F=Math.min(q,$.length);for(let t=0;t<F;t++){const d=$[t];K.setXYZW(t,d.x,d.y,d.z,d.r),X.setXYZW(t,d.c.r,d.c.g,d.c.b,d.a),Z.setXYZW(t,d.seed,d.age,d.angle,d.dens)}return g.instanceCount=F,K.needsUpdate=!0,X.needsUpdate=!0,Z.needsUpdate=!0,F},renderLayer(a){const o=P.renderer,i=P.camera,u=o.getDrawingBufferSize(new e.Vector2),S=Math.max(2,Math.round(u.x/2)),w=Math.max(2,Math.round(u.y/2));if((!p||p.width!==S||p.height!==w)&&(p&&p.dispose(),p=new e.WebGLRenderTarget(S,w,{type:e.HalfFloatType,depthBuffer:!0}),p.texture.minFilter=p.texture.magFilter=e.LinearFilter),Y.uInk.value=p.texture,Y.uTexel.value.set(1/S,1/w),Y.uTime.value=a,A.visible=g.instanceCount>0,!A.visible)return;const f=o.getRenderTarget(),h=o.autoClear,F=o.getClearColor(new e.Color),t=o.getClearAlpha();i.updateMatrixWorld(),o.setRenderTarget(p),o.setClearColor(0,0),o.clear(!0,!0,!1);const d=i.layers.mask,C=D.overrideMaterial;i.layers.set(ne),D.overrideMaterial=oe,o.render(D,i),D.overrideMaterial=C,i.layers.mask=d,o.render(te,i),o.setRenderTarget(f),o.setClearColor(F,t),o.autoClear=h},dispose(){D.remove(R,A),g.dispose(),J.dispose(),L.dispose(),ce.dispose(),A.geometry.dispose(),A.material.dispose(),oe.dispose(),p&&p.dispose()}}}const M=(P,H,q)=>{const O=Math.min(1,Math.max(0,(q-P)/(H-P)));return O*O*(3-2*O)};export{x as CURRENT,je as createInk};
