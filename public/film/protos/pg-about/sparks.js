import*as l from"three";const j=`
uniform vec3 uSun, uCol, uLens;
uniform float uVis, uGain, uFocus, uK, uPx, uMaxPx, uTime;
attribute vec4 aN;          // facet normal (xyz), brightness (w)
attribute vec3 aSpin;       // tumble axis (xyz, length = rate)
varying vec3 vCol;
varying float vR;
vec3 rot(vec3 v, vec3 ax, float a) { float c = cos(a), s = sin(a); return v * c + cross(ax, v) * s + ax * dot(ax, v) * (1.0 - c); }
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  vec3 v = normalize(position - uLens);                 // from the lens to the crystal
  float c = max(dot(v, uSun), 0.0);                     // 1: the crystal is in front of the sun (forward scatter)
  float phase = 0.8 + 0.9 * c * c * c + 7.0 * pow(c, 18.0);
  float sl = length(aSpin);
  vec3 n = sl > 0.0 ? rot(aN.xyz, aSpin / sl, sl * uTime) : aN.xyz;
  vec3 h = normalize(uSun - v);
  float glint = 6.0 * pow(abs(dot(n, h)), 40.0);         // the facet catching the sun for this view
  float flux = aN.w * (phase + glint) * uVis * uGain / max(d * d, 0.06);
  float r = clamp(uK * abs(1.0 / max(d, 0.05) - 1.0 / uFocus), 0.75, uMaxPx / uPx) * uPx;   // the circle of confusion, px
  float near = smoothstep(0.22, 0.45, d);               // nothing sits on the glass
  float far = 1.0 - smoothstep(4.0, 6.5, d);
  vR = r;
  float I = flux * near * far / (3.14159 * max(pow(r, 1.6), 1.0));
  vCol = uCol * 1.25 * (1.0 - exp(-I));                 // saturates gold, never to a flat white
  gl_PointSize = 2.0 * r + 3.0;
  gl_Position = projectionMatrix * mv;
  if (d < 0.05 || flux * near * far < 1e-5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`,U=`
varying vec3 vCol;
varying float vR;
void main() {
  float s = vR + 1.5;
  float rr = length(gl_PointCoord * 2.0 - 1.0) * s;     // px from the centre
  float a;
  if (vR < 2.5) a = exp(-rr * rr / max(0.6, 0.55 * vR * vR));
  else {
    float e = max(1.0, 0.22 * vR);
    float disc = 1.0 - smoothstep(vR - e, vR + 0.6 * e, rr);
    float rim = 0.72 + 0.4 * smoothstep(0.45 * vR, 0.95 * vR, rr);   // a bokeh disc: a touch brighter toward its rim
    a = disc * rim;
  }
  if (a < 0.002) discard;
  gl_FragColor = vec4(vCol * a, 1.0);
}`;function W(g){let d=g>>>0;return()=>{d=d+1831565813>>>0;let r=Math.imul(d^d>>>15,1|d);return r=r+Math.imul(r^r>>>7,61|r)^r,((r^r>>>14)>>>0)/4294967296}}function Z(g,d){const{cams:r,heroes:w,count:x=600,seed:_=1962,radius:P=2.2,round:I=100,close:N=160,minLens:B=.36,minHero:E=.45,sight:L=.4,box:R=null}=d,s=[1e9,1e9,1e9],c=[-1e9,-1e9,-1e9];for(const t of r)for(let e=0;e<3;e++)s[e]=Math.min(s[e],t[e]-P),c[e]=Math.max(c[e],t[e]+P);for(const t of w)for(let e=0;e<3;e++)s[e]=Math.min(s[e],t[e]-1.5),c[e]=Math.max(c[e],t[e]+1.5);if(R)for(let t=0;t<3;t++)s[t]=Math.max(s[t],R[0][t]),c[t]=Math.min(c[t],R[1][t]);const k=(t,e)=>(t[0]-e[0])**2+(t[1]-e[1])**2+(t[2]-e[2])**2,A=(t,e)=>{let o=1e18;for(const a of e)o=Math.min(o,k(t,a));return Math.sqrt(o)},q=Math.min(r.length,w.length),K=t=>{let e=1e18;for(let o=0;o<q;o++){const a=r[o],h=w[o],n=[h[0]-a[0],h[1]-a[1],h[2]-a[2]],u=[t[0]-a[0],t[1]-a[1],t[2]-a[2]],m=Math.max(0,Math.min(1,(n[0]*u[0]+n[1]*u[1]+n[2]*u[2])/(n[0]**2+n[1]**2+n[2]**2)));e=Math.min(e,(u[0]-n[0]*m)**2+(u[1]-n[1]*m)**2+(u[2]-n[2]*m)**2)}return Math.sqrt(e)},f=W(_),C=new Float32Array(x*3),z=new Float32Array(x*4),F=new Float32Array(x*3);let i=0,H=0;for(;i<x&&H++<x*400;){const t=[s[0]+f()*(c[0]-s[0]),s[1]+f()*(c[1]-s[1]),s[2]+f()*(c[2]-s[2])],e=A(t,r),o=A(t,w);if(e<B||o<E||(i<N?e>1.3:i<x-I?e>P:o>1.5)||K(t)<L)continue;C.set(t,i*3);const a=f()*2-1,h=f()*Math.PI*2,n=Math.sqrt(1-a*a),u=.25+1.75*Math.pow(f(),3);z.set([n*Math.cos(h),n*Math.sin(h),a,u],i*4);const m=f()*2-1,b=f()*Math.PI*2,T=Math.sqrt(1-m*m),S=.15+.5*f();F.set([T*Math.cos(b)*S,T*Math.sin(b)*S,m*S],i*3),i++}const M=new l.BufferGeometry;M.setAttribute("position",new l.BufferAttribute(C.subarray(0,i*3),3)),M.setAttribute("aN",new l.BufferAttribute(z.subarray(0,i*4),4)),M.setAttribute("aSpin",new l.BufferAttribute(F.subarray(0,i*3),3));const V=g.renderer.getContext(),O=Math.min(120,(V.getParameter(V.ALIASED_POINT_SIZE_RANGE)||[1,64])[1]||64),v={uSun:{value:new l.Vector3(0,0,-1)},uCol:{value:new l.Color(1,.8,.6)},uLens:{value:new l.Vector3},uVis:{value:0},uGain:{value:1},uFocus:{value:3},uK:{value:34},uPx:{value:1},uMaxPx:{value:(O-4)/2},uTime:{value:0}},G=new l.ShaderMaterial({vertexShader:j,fragmentShader:U,uniforms:v,transparent:!0,depthWrite:!1,depthTest:!0,blending:l.AdditiveBlending}),p=new l.Points(M,G);p.frustumCulled=!1,p.renderOrder=5,g.scene.add(p);let y=!0;return{count:i,update({lens:t,focus:e,sunDir:o,colour:a,vis:h=1,gain:n=40,time:u=0,height:m=720,dpr:b=1}){v.uLens.value.set(t[0],t[1],t[2]),v.uSun.value.set(o[0],o[1],o[2]).normalize(),v.uCol.value.setRGB(a[0],a[1],a[2]),v.uVis.value=h,v.uGain.value=n,v.uFocus.value=Math.max(.5,e),v.uPx.value=m/720*b,v.uTime.value=u,p.visible=y&&h>1e-4},setVisible(t){y=!!t,y||(p.visible=!1)},dispose(){g.scene.remove(p),M.dispose(),G.dispose()}}}export{Z as createSparks};
