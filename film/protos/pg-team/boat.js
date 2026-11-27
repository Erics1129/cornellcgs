import*as e from"three";import{GLSL_COMMON as k,GLSL_FRAG as D}from"../../kit/actors/core.js";const f=1.05,h=.32,B=.15;function C(){const x=[],b=[],w=f/2,s=f*.31,v=(a,l,d,t)=>{x.push(...a,...l,...d),b.push(t,t,t)},c=[0,-B,-s],n=[0,-B,s],L=[0,.02,w],y=[0,.02,-w];for(const a of[1,-1]){const l=[a*h/2,.02,-s*.92],d=[a*h/2,.02,s*.92],t=(S,g,A,M)=>a>0?v(S,g,A,M):v(S,A,g,M),i=[a*h*.36,-B*.32,-s*.94],p=[a*h*.36,-B*.32,s*.94];t(c,n,p,1),t(c,p,i,1),t(i,p,d,2),t(i,d,l,2),t(n,L,d,3),t(n,p,d,3),t(c,l,y,3),t(c,i,l,3)}const r=[[-0,.02,-f*.34],[0,.02,f*.34],[0,.4,0]];for(const a of[.012,-.012])v([a,r[0][1],r[0][2]],[a,r[1][1],r[1][2]],[a*.5,r[2][1],r[2][2]],4);const u=new e.BufferGeometry;u.setAttribute("position",new e.Float32BufferAttribute(x,3)),u.setAttribute("aLayer",new e.Float32BufferAttribute(b,1));const o=[];for(let a=0;a<x.length/9;a++)o.push(1,0,0,0,1,0,0,0,1);return u.setAttribute("aBary",new e.Float32BufferAttribute(o,3)),u}const F=`
attribute float aLayer; attribute vec3 aBary;
varying vec3 vWorld; varying vec3 vLocal; varying float vLayer; varying vec3 vBary;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz; vLocal = position; vLayer = aLayer; vBary = aBary;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,V=`
${k}
${D}
uniform vec3 uGlow; uniform vec3 uDark; uniform float uDim; uniform float uSee;
varying vec3 vWorld; varying vec3 vLocal; varying float vLayer; varying vec3 vBary;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld))); if (dot(N, V) < 0.0) N = -N;
  float grain = fbm(vLocal * vec3(60.0, 60.0, 60.0));
  // light through wet paper: one sheet glows, two and three sheets are darker; wetter (darker) low down
  float sheets = vLayer < 1.5 ? 1.0 : vLayer < 2.5 ? 2.0 : vLayer < 3.5 ? 2.6 : 2.0;
  float wet = smoothstep(-0.02, -0.14, vLocal.y);
  float through = exp(-0.95 * sheets) * (0.82 + 0.25 * wet) * (0.9 + 0.2 * grain);
  vec3 col = mix(uDark, uGlow, clamp(through * 1.15, 0.0, 1.0));
  // the edges of each facet catch the window's light (a paper edge, a crease)
  float rim = smoothstep(0.5, 0.95, 1.0 - abs(dot(N, V)));
  col += uGlow * 0.6 * rim;
  // the folds: a hairline where the sheets meet
  vec3 bw = fwidth(vBary), bd = vBary / max(bw, vec3(1e-5));
  col *= 1.0 - 0.22 * (1.0 - smoothstep(0.4, 1.4, min(bd.x, min(bd.y, bd.z))));
  // the waterline: the water climbs the paper and glints along it
  col += uGlow * 0.9 * (1.0 - smoothstep(0.0, 0.012, abs(vLocal.y - 0.004))) * step(vLayer, 3.5);
  // the peak stands above the water: seen through the surface, pale and soft
  if (vLayer > 3.5) col = mix(col, uGlow * 1.05, 0.55);
  col = mix(col, uHazeColor, uDim);
  float a = vLayer > 3.5 ? 0.55 * uSee : uSee;
  gl_FragColor = linearToOutputTexel(vec4(col, a));
}`,E=`
uniform vec3 uTop; uniform vec3 uAxis; uniform float uLen; uniform float uW0; uniform float uW1;
varying vec2 vAB; varying float vS;
void main() {
  // position.x: across -1..1, position.y: along 0..1
  vec3 P = uTop + uAxis * (position.y * uLen);
  vec3 toCam = normalize(cameraPosition - P);
  vec3 side = normalize(cross(uAxis, toCam));
  float w = mix(uW0, uW1, position.y);
  vec3 wp = P + side * position.x * w * 2.2;
  vAB = vec2(position.x * 2.2, position.y); vS = position.y * uLen;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,P=`
uniform float uK;
varying vec2 vAB; varying float vS;
void main() {
  float across = exp(-vAB.x * vAB.x * 1.1);
  float along = smoothstep(0.0, 0.6, vS) * exp(-vS / 6.5);
  float d = uK * across * along;
  gl_FragColor = vec4(vec3(1.0 - d), 1.0);
}`;function z(x,b={}){const m=new e.Group,w={...x.light,uGlow:{value:new e.Color(b.glow||"#E9D9A6")},uDark:{value:new e.Color(b.dark||"#1E3A2E")},uDim:{value:0},uSee:{value:1}},s=new e.Mesh(C(),new e.ShaderMaterial({vertexShader:F,fragmentShader:V,uniforms:w,side:e.DoubleSide,transparent:!0,depthWrite:!1}));s.renderOrder=3,m.add(s);const v=new e.RingGeometry(.98,1.08,48,1);v.rotateX(-Math.PI/2);const c=new e.MeshBasicMaterial({color:new e.Color(1,.98,.9),transparent:!0,opacity:.35,blending:e.AdditiveBlending,depthWrite:!1,side:e.DoubleSide}),n=new e.Mesh(v,c);n.scale.set(h*.62,1,f*.5),n.position.y=-.004,n.renderOrder=4,n.visible=!1,m.add(n);const L=new e.PlaneGeometry(2,1,1,24);L.translate(0,.5,0);const y={uTop:{value:new e.Vector3},uAxis:{value:new e.Vector3(0,-1,0)},uLen:{value:11},uW0:{value:.2},uW1:{value:.9},uK:{value:.2}},r=new e.Mesh(L,new e.ShaderMaterial({vertexShader:E,fragmentShader:P,uniforms:y,transparent:!0,depthWrite:!1,depthTest:!0,blending:e.CustomBlending,blendEquation:e.AddEquation,blendSrc:e.DstColorFactor,blendDst:e.ZeroFactor,side:e.DoubleSide}));r.frustumCulled=!1,r.renderOrder=2;const u=new e.Group;u.add(m),u.add(r);const o={p:new e.Vector3,yaw:0,axis:new e.Vector3(0,-1,0),k:.2},a=new e.Vector3,l=new e.Vector3;return{object:u,length:f,beam:h,set(t){t.p&&o.p.fromArray(t.p),m.position.copy(o.p),o.yaw=t.yaw??o.yaw;const i=t.rock||[0,0];m.rotation.set(i[0],o.yaw,i[1],"YXZ"),t.sun&&o.axis.fromArray(t.sun).multiplyScalar(-1).normalize(),w.uDim.value=t.dim??0,w.uSee.value=t.see??1,c.opacity=.35*(t.see??1)*(1-(t.dim??0)),o.k=(t.shadow??1)*.55,y.uTop.value.copy(o.p).addScaledVector(o.axis,.12),y.uAxis.value.copy(o.axis),y.uK.value=o.k,r.visible=o.k>.002},shadowAt(t){a.copy(t).sub(o.p);const i=a.dot(o.axis);if(i<=0)return 0;l.copy(o.axis).multiplyScalar(i);const p=a.sub(l),S=l.set(Math.sin(o.yaw),0,Math.cos(o.yaw)),g=p.dot(S),A=Math.sqrt(Math.max(0,p.lengthSq()-g*g)),M=.12+.07*i,G=1/(1+Math.exp((Math.abs(g)-f*.42)/M)),W=1/(1+Math.exp((A-h*.55)/M));return G*W*Math.exp(-i/14)*(o.k/.55)},update(){},dispose(){s.geometry.dispose(),s.material.dispose(),v.dispose(),c.dispose(),L.dispose(),r.material.dispose()}}}export{z as createBoat};
