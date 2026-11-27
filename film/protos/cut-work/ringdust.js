import*as e from"three";import{CUBE_SHADOW_GLSL as I}from"./cubeshade.js";const _=()=>`
uniform float uPhase, uR0, uPx, uGain, uTime;
uniform vec3 uSun, uLens;
uniform mat4 uFrame;          // ring frame -> world
uniform vec3 uKeyDir; uniform mat4 uCubeInv; uniform float uCubeHalf; uniform float uCubeOn;
${I}
attribute vec4 aG;            // r (m), angle (turns), height (m), brightness
attribute vec4 aN;            // facet normal (ring frame), size
varying vec3 vCol;
varying float vA;
void main() {
  float r = aG.x;
  float a = 6.2831853 * (aG.y + uPhase * pow(uR0 / r, 1.5));
  vec3 lp = vec3(r * cos(a), aG.z, -r * sin(a));
  vec4 wp = uFrame * vec4(lp, 1.0);
  vec3 n = normalize(mat3(uFrame) * aN.xyz);
  vec3 v = normalize(wp.xyz - uLens);
  float fwd = max(dot(v, uSun), 0.0);
  vec3 h = normalize(uSun - v);
  float glint = pow(abs(dot(n, h)), 60.0);
  float sh = uCubeOn * cubeShadow(wp.xyz, uKeyDir, uCubeInv, uCubeHalf);   // in the cube's shadow the dust goes dark
  float I = aG.w * uGain * (0.22 + 1.6 * pow(fwd, 6.0) + 7.0 * glint) * (1.0 - 0.94 * sh);
  vCol = vec3(1.0, 0.97, 0.92) * I;
  vec4 mv = viewMatrix * wp;
  float d = -mv.z;
  vA = 1.0 - smoothstep(0.08, 0.25, 0.4 - d);   // nothing on the glass
  gl_PointSize = max(1.0, aN.w * uPx);
  gl_Position = projectionMatrix * mv;
}`,O=`
varying vec3 vCol;
varying float vA;
void main() {
  float rr = length(gl_PointCoord * 2.0 - 1.0);
  float a = exp(-rr * rr * 3.2) * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol * a, 1.0);
}`,B=`
varying vec3 vWorld;
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,H=()=>`
uniform vec3 uSun, uLens;
uniform float uGain;
uniform vec3 uKeyDir; uniform mat4 uCubeInv; uniform float uCubeHalf; uniform float uCubeOn;
${I}
varying vec3 vWorld;
varying vec2 vLocal;
float band(float r) {
  // inner faint ring, the bright ring, the gap, the outer ring (metres)
  float c = 0.25 * smoothstep(0.27, 0.30, r) * (1.0 - smoothstep(0.31, 0.32, r));
  float b = 1.0 * smoothstep(0.315, 0.33, r) * (1.0 - smoothstep(0.385, 0.396, r));
  float a = 0.55 * smoothstep(0.407, 0.416, r) * (1.0 - smoothstep(0.44, 0.465, r));
  float ripple = 0.85 + 0.15 * sin(r * 900.0) * sin(r * 377.0);
  return (c + b + a) * ripple;
}
void main() {
  float r = length(vLocal);
  float d = band(r);
  if (d <= 0.001) discard;
  vec3 v = normalize(vWorld - uLens);
  float fwd = max(dot(v, uSun), 0.0);
  float sh = uCubeOn * cubeShadow(vWorld, uKeyDir, uCubeInv, uCubeHalf);
  float I = uGain * d * (0.35 + 1.4 * pow(fwd, 4.0)) * (1.0 - 0.9 * sh);
  gl_FragColor = vec4(vec3(1.0, 0.975, 0.94) * I, 1.0);
}`;function N(v){let a=v>>>0;return()=>{a=a+1831565813>>>0;let n=Math.imul(a^a>>>15,1|a);return n=n+Math.imul(n^n>>>7,61|n)^n,((n^n>>>14)>>>0)/4294967296}}function K(v,{count:a=2600,r0:n=.36,seed:P=1610,shade:o=null}={}){const r=N(P),C=new Float32Array(a*4),x=new Float32Array(a*4),F=new Float32Array(a*3);for(let l=0;l<a;l++){let u=0;for(let p=0;p<40;p++){u=.27+r()*.2;const g=u<.32?.25:u<.396?1:u<.407?.04:u<.465?.55:0;if(r()<g)break}const h=(r()+r()+r()-1.5)*.004,w=.3+1.7*Math.pow(r(),3);C.set([u,r(),h,w],l*4);const m=r()*2-1,d=r()*Math.PI*2,s=Math.sqrt(1-m*m);x.set([s*Math.cos(d),s*Math.sin(d),m,1.1+1.6*Math.pow(r(),2)],l*4)}const f=new e.BufferGeometry;f.setAttribute("position",new e.BufferAttribute(F,3)),f.setAttribute("aG",new e.BufferAttribute(C,4)),f.setAttribute("aN",new e.BufferAttribute(x,4));const t={uPhase:{value:0},uR0:{value:n},uPx:{value:1},uGain:{value:1},uTime:{value:0},uSun:{value:new e.Vector3(0,0,-1)},uLens:{value:new e.Vector3},uFrame:{value:new e.Matrix4},uKeyDir:v.light.uKeyDir,uCubeInv:o?o.uCubeInv:{value:new e.Matrix4},uCubeHalf:o?o.uCubeHalf:{value:.08},uCubeOn:o?o.uCubeOn:{value:0}},y=new e.ShaderMaterial({vertexShader:_(),fragmentShader:O,uniforms:t,transparent:!0,depthWrite:!1,depthTest:!0,blending:e.AdditiveBlending}),b=new e.Points(f,y);b.frustumCulled=!1,b.renderOrder=6;const A=new e.RingGeometry(.26,.47,160,3),G={uSun:t.uSun,uLens:t.uLens,uGain:{value:.1},uKeyDir:t.uKeyDir,uCubeInv:t.uCubeInv,uCubeHalf:t.uCubeHalf,uCubeOn:t.uCubeOn},M=new e.ShaderMaterial({vertexShader:B,fragmentShader:H(),uniforms:G,transparent:!0,depthWrite:!1,depthTest:!0,blending:e.AdditiveBlending,side:e.DoubleSide}),i=new e.Mesh(A,M);i.matrixAutoUpdate=!1,i.frustumCulled=!1,i.renderOrder=5;const c=new e.Group;c.add(b,i),v.scene.add(c);const S=new e.Quaternion,z=new e.Quaternion,L=new e.Vector3(0,1,0),R=new e.Vector3(1,0,0),D=new e.Matrix4().makeRotationX(-Math.PI/2);return{update({centre:l,tilt:u,yaw:h,phase:w,lens:m,sun:d,amount:s=1,height:p=720,dpr:g=1}){S.setFromAxisAngle(L,h).multiply(z.setFromAxisAngle(R,u)),t.uFrame.value.compose(l,S,new e.Vector3(1,1,1)),i.matrix.copy(t.uFrame.value).multiply(D),i.matrixWorldNeedsUpdate=!0,t.uPhase.value=w,t.uLens.value.copy(m),t.uSun.value.copy(d).normalize(),t.uPx.value=p/720*g,t.uGain.value=1*s,G.uGain.value=.16*s,c.visible=s>.001},dispose(){v.scene.remove(c),f.dispose(),y.dispose(),A.dispose(),M.dispose()}}}export{K as createRingDust};
