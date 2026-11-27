import*as t from"three";import{RoundedBoxGeometry as W}from"three/addons/geometries/RoundedBoxGeometry.js";import{GLSL_COMMON as j,GLSL_FRAG as _,lin as I}from"../../kit/actors/core.js";import{clamp as k,smootherstep as H,hash01 as D}from"../../kit/ease.js";const U={transparent:!0,depthWrite:!1,blending:t.CustomBlending,blendEquation:t.AddEquation,blendSrc:t.OneFactor,blendDst:t.OneFactor,blendSrcAlpha:t.ZeroFactor,blendDstAlpha:t.OneFactor},K=`
${j}
attribute vec3 aColour; attribute float aHeat;
varying vec3 vWorld; varying vec3 vN; varying vec3 vColour; varying float vHeat; varying vec3 vLocal;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  vN = normalize(mat3(m) * normal);
  vWorld = wp.xyz; vColour = aColour; vHeat = aHeat; vLocal = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,X=`
${j}
${_}
uniform vec3 uLamp; uniform vec3 uLampP; uniform float uLampK; uniform float uGrain;
varying vec3 vWorld; varying vec3 vN; varying vec3 vColour; varying float vHeat; varying vec3 vLocal;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  float grain = fbm(vLocal * uGrain);
  vec3 base = vColour * (0.95 + 0.08 * (grain - 0.5));
  // the water's light, softened (a toy carried in a lamp is lit by the lamp)
  vec3 col = lightPlayer(base, N, V, 1.0, 0.0, grain, 0.55) * 0.55;
  // the lamp: from the bell's upper middle, wrapped, warm-white tinted by the lantern
  vec3 L = normalize(uLampP - vWorld);
  float w = clamp((dot(N, L) + 0.45) / 1.45, 0.0, 1.0);
  col += base * uLamp * uLampK * (0.32 + 0.9 * w * w * (3.0 - 2.0 * w));
  // hot metal glows (bar: yellow-white at the end, orange, then the dull iron)
  vec3 hot = mix(vec3(0.95, 0.16, 0.03), vec3(1.0, 0.55, 0.08), smoothstep(0.35, 0.8, vHeat));
  hot = mix(hot, vec3(1.0, 0.92, 0.6), smoothstep(0.88, 1.0, vHeat));
  col = mix(col, hot * (0.8 + 1.1 * vHeat), smoothstep(0.05, 0.45, vHeat));
  float dist = length(cameraPosition - vWorld);
  col = haze(shoulder(col), dist);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}`;function Z(){const l=[];for(let o=0;o<=26;o++){const u=o/26,h=-.5+u*.92,y=.155*Math.pow(u,.72)*(1-.06*Math.sin(u*22));l.push(new t.Vector2(Math.max(.002,y),h))}for(let o=1;o<=8;o++){const u=o/8*Math.PI/2;l.push(new t.Vector2(.155*Math.cos(u)*.98,.42+.07*Math.sin(u)))}const s=new t.LatheGeometry(l,28);return s.computeVertexNormals(),s}function Y(){const l=[];for(let s=0;s<=14;s++){const o=s/14;l.push(new t.Vector2(Math.max(.002,.12*Math.sin(Math.PI*Math.pow(o,.8))*(1-.35*o)),o))}const a=new t.LatheGeometry(l,12);return a.scale(1,1,.38),a.computeVertexNormals(),a}function R(){const l=new t.Shape;l.moveTo(-.5,.2),l.quadraticCurveTo(-.22,.3,-.12,.3),l.lineTo(.42,.3),l.lineTo(.47,.27),l.lineTo(.47,.18),l.quadraticCurveTo(.2,.15,.13,.05),l.lineTo(.14,-.12),l.quadraticCurveTo(.2,-.2,.32,-.24),l.lineTo(.32,-.3),l.lineTo(-.3,-.3),l.lineTo(-.3,-.24),l.quadraticCurveTo(-.18,-.2,-.13,-.12),l.lineTo(-.13,.05),l.quadraticCurveTo(-.2,.15,-.5,.2);const a=new t.ExtrudeGeometry(l,{depth:.22,bevelEnabled:!0,bevelThickness:.035,bevelSize:.03,bevelSegments:4,curveSegments:10});return a.translate(0,0,-.11),a.computeVertexNormals(),a}const B={coral:"#E8674C",green:"#4C9B63",leaf2:"#5FAE6E",clay:"#9A948C",iron:"#4A4744",wood:"#9C6B45",head:"#55524F",tile:"#EFE6D3",teal:"#1E9E86",tile0:"#F6EAD2",ball:"#FFC21F",base:"#B9AE9C"};function ce(l){const a={carrot:Z(),leaf:Y(),anvil:R(),box:new W(1,1,1,3,.18),tile:new W(1,.3,1,3,.1),ball:new t.SphereGeometry(.5,24,16),rod:new t.CylinderGeometry(.5,.5,1,12,1)},s=new t.Group,o={},u=[];function h(n,e){const i={...l.light,uLamp:{value:new t.Color(1,1,1)},uLampP:{value:new t.Vector3},uLampK:{value:1},uGrain:{value:40}},v=new t.ShaderMaterial({vertexShader:K,fragmentShader:X,uniforms:i,side:t.DoubleSide});u.push(v);const d={};for(const[A,S,m]of e){const x=S.clone(),F=new t.InstancedBufferAttribute(new Float32Array(m*3),3),V=new t.InstancedBufferAttribute(new Float32Array(m),1);F.setUsage(t.DynamicDrawUsage),V.setUsage(t.DynamicDrawUsage),x.setAttribute("aColour",F),x.setAttribute("aHeat",V);const b=new t.InstancedMesh(x,v,m);b.frustumCulled=!1,b.instanceMatrix.setUsage(t.DynamicDrawUsage),s.add(b),d[A]={m:b,col:F,heat:V,g:x}}o[n]={uniforms:i,meshes:d}}h("carrot",[["body",a.carrot,1],["leaf",a.leaf,3]]),h("forge",[["anvil",a.anvil,1],["bar",a.box,8],["rod",a.rod,1],["head",a.box,1]]),h("ink",[["base",a.box,1],["tile",a.tile,16],["wall",a.box,3],["ball",a.ball,1],["drop",a.ball,M.ink]]);const y=new t.Matrix4,p=new t.Quaternion,g=new t.Quaternion,c=new t.Vector3,r=new t.Vector3,z=new t.Euler,C=(n,e,i)=>{const v=I(i);n.col.setXYZ(e,v.r,v.g,v.b),n.col.needsUpdate=!0},w=(n,e,i,v,d,A,S=0)=>{y.compose(i,v,d),n.m.setMatrixAt(e,y),n.m.instanceMatrix.needsUpdate=!0,A&&C(n,e,A),n.heat.setX(e,S),n.heat.needsUpdate=!0},f=(n,e,i,v,d=new t.Vector3)=>d.set(e,i,v).multiplyScalar(n.s).applyQuaternion(n.q).add(n.p),T=(n,e,i,v,d=new t.Quaternion)=>d.copy(n.q).multiply(g.setFromEuler(z.set(e,i,v)));function q(n,e){const i=o[n].uniforms;i.uLamp.value.copy(I(e.lamp||"#ffffff")).lerp(new t.Color(1,.96,.88),.86),i.uLampP.value.copy(e.lampP||e.p),i.uLampK.value=e.lampK??1}return{object:s,at:f,place(n,e){q(n,e);const i=o[n].meshes,v=e.state||{};if(n==="carrot"){const d=T(e,0,0,-.5),S={p:f(e,0,.05+.08*(v.hop||0),0),q:d,s:e.s};w(i.body,0,f(S,0,0,0),d,r.setScalar(e.s*.92),B.coral);for(let m=0;m<3;m++){const x=(m-1)*.42+.06*Math.sin((v.t||0)*1.3+m*2.1),F=new t.Quaternion().copy(d).multiply(g.setFromEuler(z.set(.1*(m-1),(m-1)*.9,x)));w(i.leaf,m,f(S,0,.44*.92,0),F,r.set(e.s*.62,e.s*(.36+.06*(m===1)),e.s*.62),m===1?B.green:B.leaf2)}}else if(n==="forge"){w(i.anvil,0,f(e,0,-.1,0),e.q,r.setScalar(e.s*.86),B.clay);const d=v.glow??1;for(let x=0;x<8;x++){const F=0+x*.082,V=k((x-2.2)/5)*d,b=.006*(v.flash||0)*Math.sin(x*2.1+(v.flash||0)*9);w(i.bar,x,f(e,F,.158+.045+b,0),e.q,r.set(e.s*.086,e.s*.09,e.s*.095),B.iron,V*(.9+.1*(v.flash||0)))}const A=T(e,0,0,-.42+.05*(v.rattle||0)),m={p:f(e,-.4,-.1,.15),q:A,s:e.s};w(i.rod,0,f(m,0,.13,0),A,r.set(e.s*.036,e.s*.32,e.s*.036),B.wood),w(i.head,0,f(m,0,.3,0),A,r.set(e.s*.17,e.s*.08,e.s*.085),B.head)}else if(n==="ink"){const d=v.maze||J(0),A=M.size,S=.2,m=(A-1)/2;w(i.base,0,f(e,0,-.06,0),e.q,r.set(e.s*.86,e.s*.06,e.s*.98),B.base);let x=0;for(let b=0;b<A;b++)for(let L=0;L<A;L++){const E=b*A+L,Q=d.tint[E],O=(L-m)*S,N=(b-m)*S-.06;if(M.grid[b][L]==="#"){w(i.tile,E,f(e,O,-.03,N),e.q,r.set(0,0,0),B.tile0),w(i.wall,x++,f(e,O,.07,N),e.q,r.set(e.s*.19,e.s*.2,e.s*.19),"#8C7B6A");continue}w(i.tile,E,f(e,O,0,N),e.q,r.set(e.s*.182,e.s*.182,e.s*.182),null);const G=I(B.tile0).lerp(I(B.teal),Q);i.tile.col.setXYZ(E,G.r,G.g,G.b),i.tile.col.needsUpdate=!0}const F=(d.ball[1]-m)*S,V=(d.ball[0]-m)*S-.06;w(i.ball,0,f(e,F,.03+.07,V),e.q,r.set(e.s*.14*(1+.05*d.speed),e.s*.14*(1-.06*d.speed),e.s*.14),B.ball);for(let b=0;b<M.ink;b++){const L=k(d.ink-b),E=(b-(M.ink-1)/2)*.052,Q=e.s*.036*(.25+.75*L);w(i.drop,b,f(e,E,-.01+.012*L,.43),e.q,r.set(Q,Q*(.8+.2*L),Q),B.teal)}}},hide(n){for(const e of Object.values(o[n].meshes))e.m.visible=!1},show(n){for(const e of Object.values(o[n].meshes))e.m.visible=!0},update(){},dispose(){for(const n of Object.values(a))n.dispose();for(const n of Object.values(o))for(const e of Object.values(n.meshes))e.g.dispose();for(const n of u)n.dispose()}}}const M={size:4,grid:["o...","....",".###","...."],ink:15,par:12,start:[0,0],line:[[0,1],[1,0],[0,-1],[1,0],[0,1]]},$=(l,a)=>l<0||a<0||l>=M.size||a>=M.size||M.grid[l][a]==="#";function J(l){const a=M.size,s=new Array(a*a).fill(0);s[M.start[0]*a+M.start[1]]=1;let o=M.start.slice(),u=0,h=0,y=M.ink,p=M.start[0],g=M.start[1];for(let c=0;c<M.line.length;c++){const[r,z]=M.line[c],C=[];let w=p,f=g;for(;!$(w+r,f+z);)w+=r,f+=z,C.push([w,f]);const T=k(l-c);if(T<=0)break;const q=T<.1?0:H(0,1,(T-.1)/.9),P=C.length,n=q*P+(T>.85?.04*Math.sin(Math.PI*(T-.85)/.15):0);o=[p+r*n,g+z*n];for(let e=0;e<P;e++){const i=k((n-(e+.35))/.4),v=C[e][0]*a+C[e][1];s[v]=Math.max(s[v],i),y-=i}u=T>.1&&T<1?Math.sin(Math.PI*k((T-.1)/.9)):0,T>=1&&(p=w,g=f,h=c+1)}return{ball:o,tint:s,speed:u,ink:y,rolls:h}}const ee=`
attribute vec4 aS;   // xyz, size
attribute vec4 aV;   // velocity dir xyz (for the streak), alpha
varying vec2 vQ; varying float vA;
void main() {
  vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  // stretch along the velocity as seen on screen
  vec3 vd = aV.xyz;
  vec2 sv = vec2(dot(vd, r), dot(vd, u));
  float L = length(sv);
  vec2 dirS = L > 1e-5 ? sv / L : vec2(1.0, 0.0);
  vec2 q = position.xy;
  vec2 along = dirS * q.x * (1.0 + 2.2 * min(L, 1.0)), across = vec2(-dirS.y, dirS.x) * q.y;
  vec3 wp = aS.xyz + (r * (along.x + across.x) + u * (along.y + across.y)) * aS.w;
  vQ = q; vA = aV.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,te=`
varying vec2 vQ; varying float vA;
void main() {
  float d = length(vQ);
  float f = exp(-d * d * 5.0);
  vec3 c = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.92, 0.6), exp(-d * d * 14.0)) * f * vA;
  gl_FragColor = vec4(linearToOutputTexel(vec4(c, 1.0)).rgb, 0.0);
}`;function ue(l,a=24){const s=new t.InstancedBufferGeometry;s.setAttribute("position",new t.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3)),s.setIndex([0,1,2,0,2,3]);const o=new t.InstancedBufferAttribute(new Float32Array(a*4),4),u=new t.InstancedBufferAttribute(new Float32Array(a*4),4);o.setUsage(t.DynamicDrawUsage),u.setUsage(t.DynamicDrawUsage),s.setAttribute("aS",o),s.setAttribute("aV",u),s.boundingSphere=new t.Sphere(new t.Vector3,1e5);const h=new t.ShaderMaterial({vertexShader:ee,fragmentShader:te,...U}),y=new t.Mesh(s,h);y.frustumCulled=!1,y.renderOrder=7;let p=0;const g={object:y,clear(){p=0},burst(c,r,{count:z=3,dir:C,spread:w=.9,speed:f=.55,size:T=.012,seed:q=1,gravity:P=.9,life:n=.5}={}){if(r<=0||r>=1)return g;const e=r*n;for(let i=0;i<z&&p<a;i++){const v=D(q*17+i),d=D(q*31+i*7),A=D(q*5+i*13),S=new t.Vector3(C.x+(v-.5)*w,C.y+.4+d*.6,C.z+(A-.5)*w).normalize().multiplyScalar(f*(.7+.6*d)),m=(1-Math.exp(-e*6))/6,x=c.clone().addScaledVector(S,m).add(new t.Vector3(0,-.5*P*e*e,0)),F=S.clone().multiplyScalar(Math.exp(-e*6)).add(new t.Vector3(0,-P*e,0)),V=(1-H(.35,1,r))*Math.min(1,r*14);o.setXYZW(p,x.x,x.y,x.z,T*(1-.4*r)),u.setXYZW(p,F.x,F.y,F.z,V),p++}return g},glow(c,r,z){return p>=a||z<=.01||(o.setXYZW(p,c.x,c.y,c.z,r),u.setXYZW(p,0,0,0,z),p++),g},update(){s.instanceCount=p,o.needsUpdate=!0,u.needsUpdate=!0},dispose(){s.dispose(),h.dispose()}};return g}const oe=`
attribute vec4 aM;   // xyz (base), seed
uniform float uTime; uniform vec3 uBoxMin; uniform vec3 uBoxSize; uniform float uFocus; uniform float uPx;
varying vec2 vQ; varying float vA; varying float vSharp;
void main() {
  vec3 p = aM.xyz + vec3(0.03 * sin(uTime * 0.21 + aM.w * 40.0), -0.022 * uTime, 0.03 * cos(uTime * 0.17 + aM.w * 23.0));
  p = uBoxMin + mod(p - uBoxMin, uBoxSize);
  vec4 vp = viewMatrix * vec4(p, 1.0);
  float z = -vp.z;
  // the circle of confusion: wide when near the lens, small near the focus distance
  float coc = clamp(abs(1.0 / max(z, 0.05) - 1.0 / uFocus) * 0.02, 0.0, 0.011);
  float r = 0.0016 + coc * z;          // world radius: the speck plus its blur
  vSharp = clamp(1.0 - coc / 0.03, 0.0, 1.0);
  float fade = smoothstep(0.45, 0.9, z) * (1.0 - smoothstep(2.6, 4.2, z));
  vA = fade * (0.22 + 0.5 * vSharp) * (0.0016 * 0.0016) / (r * r) * 40.0;
  vA = min(vA, 0.3 * min(1.0, pow(0.005 / (r / z), 1.5))) * (0.45 + 0.55 * fract(aM.w * 91.0));   // a disc big on screen is a faint one
  vec3 rr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 uu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vQ = position.xy;
  gl_Position = projectionMatrix * viewMatrix * vec4(p + (rr * position.x + uu * position.y) * r, 1.0);
}`,ae=`
uniform vec3 uTint;
varying vec2 vQ; varying float vA; varying float vSharp;
void main() {
  float d = length(vQ);
  if (d > 1.0) discard;
  // a soft disc with a faintly brighter rim (a lens's bokeh), a bright point when sharp
  float disc = smoothstep(1.0, 0.55, d) * (0.7 + 0.3 * smoothstep(0.4, 0.9, d));
  float point = exp(-d * d * 9.0);
  float f = mix(disc, point, vSharp);
  gl_FragColor = vec4(linearToOutputTexel(vec4(uTint * f * vA, 1.0)).rgb, 0.0);
}`;function ve(l,{count:a=140,min:s,max:o,seed:u=3}={}){const h=new t.InstancedBufferGeometry;h.setAttribute("position",new t.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3)),h.setIndex([0,1,2,0,2,3]);const y=new t.InstancedBufferAttribute(new Float32Array(a*4),4);for(let r=0;r<a;r++)y.setXYZW(r,s[0]+D(u*7+r)*(o[0]-s[0]),s[1]+D(u*13+r*3)*(o[1]-s[1]),s[2]+D(u*19+r*5)*(o[2]-s[2]),D(u*23+r*11));h.setAttribute("aM",y),h.instanceCount=a,h.boundingSphere=new t.Sphere(new t.Vector3,1e5);const p={uTime:{value:0},uBoxMin:{value:new t.Vector3(...s)},uBoxSize:{value:new t.Vector3(o[0]-s[0],o[1]-s[1],o[2]-s[2])},uFocus:{value:3},uTint:{value:new t.Color(.62,.78,.95)},uPx:{value:1}},g=new t.ShaderMaterial({vertexShader:oe,fragmentShader:ae,uniforms:p,...U,depthTest:!0}),c=new t.Mesh(h,g);return c.frustumCulled=!1,c.renderOrder=9,{object:c,set({t:r,focus:z,tint:C}){r!==void 0&&(p.uTime.value=r),z&&(p.uFocus.value=z),C&&p.uTint.value.copy(I(C))},update(){},dispose(){h.dispose(),g.dispose()}}}const ne=`
attribute vec4 aA;    // top xyz, width
attribute vec4 aB;    // bottom xyz, strength
uniform float uTime;
varying vec2 vQ; varying float vK; varying float vD;
void main() {
  float sway = 0.6 * sin(uTime * 0.07 + aA.x * 0.3) ;
  vec3 A = aA.xyz + vec3(sway, 0.0, 0.4 * cos(uTime * 0.05 + aA.z));
  vec3 B = aB.xyz;
  vec3 ax = normalize(A - B);
  vec3 mid = mix(B, A, position.y * 0.5 + 0.5);
  vec3 toCam = normalize(cameraPosition - mid);
  vec3 side = normalize(cross(ax, toCam));
  float w = aA.w * (0.55 + 0.45 * (position.y * 0.5 + 0.5));   // wider toward the top
  vec3 wp = mid + side * position.x * w;
  vQ = position.xy; vK = aB.w; vD = length(cameraPosition - mid);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,re=`
uniform vec3 uTint; uniform float uHazeDensity;
varying vec2 vQ; varying float vK; varying float vD;
void main() {
  float x = vQ.x, t = vQ.y * 0.5 + 0.5;     // 0 at the bottom, 1 at the top
  float across = exp(-x * x * 3.2);
  float along = smoothstep(0.0, 0.55, t) * (1.0 - smoothstep(0.9, 1.0, t));
  float k = across * along * vK * exp(-0.012 * vD);
  gl_FragColor = vec4(linearToOutputTexel(vec4(uTint * k, 1.0)).rgb, 0.0);
}`;function de(l,a){const s=a.length,o=new t.InstancedBufferGeometry;o.setAttribute("position",new t.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3)),o.setIndex([0,1,2,0,2,3]);const u=new t.InstancedBufferAttribute(new Float32Array(s*4),4),h=new t.InstancedBufferAttribute(new Float32Array(s*4),4);a.forEach((c,r)=>{u.setXYZW(r,c.top[0],c.top[1],c.top[2],c.width),h.setXYZW(r,c.bottom[0],c.bottom[1],c.bottom[2],c.strength)}),o.setAttribute("aA",u),o.setAttribute("aB",h),o.instanceCount=s,o.boundingSphere=new t.Sphere(new t.Vector3,1e5);const y={uTime:{value:0},uTint:{value:new t.Color(.5,.72,1)},uHazeDensity:l.light.uHazeDensity},p=new t.ShaderMaterial({vertexShader:ne,fragmentShader:re,uniforms:y,...U,side:t.DoubleSide}),g=new t.Mesh(o,p);return g.frustumCulled=!1,g.renderOrder=-1,{object:g,set({t:c}){y.uTime.value=c},update(){},dispose(){o.dispose(),p.dispose()}}}export{M as INK,ve as createMotes,de as createShafts,ue as createSparks,ce as createToys,J as inkMaze};
