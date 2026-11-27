import*as e from"three";import{mergeGeometries as ke}from"three/addons/utils/BufferGeometryUtils.js";import{createWorld as Ye,GLSL_FINISH as Ze,noseQuat as Re}from"../galaxy/index.js";import{orbitalShot as Ke}from"./shots/orbital.js";const ce=Math.PI/180,z={R:200,tube:14,hubR:24,hubL:36,coreR:8,coreL:48,truss:330,sunV:58,sunAz:90,tilt:-18,turnSeconds:90,passSeconds:8},l={panel:0,gold:1,solar:2,radiator:3,metal:4,dark:5,glazing:6,white:7,rim:8};function _(a,h,p=0,u=null){let t=a.index?a.toNonIndexed():a;if(t.getAttribute("uv")||t.setAttribute("uv",new e.BufferAttribute(new Float32Array(t.getAttribute("position").count*2),2)),u){const o=t.getAttribute("uv");for(let d=0;d<o.count;d++)o.setXY(d,o.getX(d)*u[0],o.getY(d)*u[1])}t.computeVertexNormals();const i=t.getAttribute("position").count;t.setAttribute("aMat",new e.BufferAttribute(new Float32Array(i).fill(h),1)),t.setAttribute("aSeed",new e.BufferAttribute(new Float32Array(i).fill(p),1));for(const o of Object.keys(t.attributes))["position","normal","uv","aMat","aSeed"].includes(o)||t.deleteAttribute(o);return t}function O(a,h,p,u=p,t=l.metal,i=0){const o=new e.Vector3(...a),d=new e.Vector3(...h),y=o.distanceTo(d),c=new e.BoxGeometry(p,y,u),s=d.clone().sub(o).normalize(),k=new e.Quaternion().setFromUnitVectors(new e.Vector3(0,1,0),s);return c.applyQuaternion(k),c.translate((o.x+d.x)/2,(o.y+d.y)/2,(o.z+d.z)/2),_(c,t,i)}function V(a,h,p,u=16,t=l.panel,i=0,o=!0){const d=new e.Vector3(...a),y=new e.Vector3(...h),c=d.distanceTo(y),s=new e.CylinderGeometry(p,p,c,u,1,!o),k=y.clone().sub(d).normalize();return s.applyQuaternion(new e.Quaternion().setFromUnitVectors(new e.Vector3(0,1,0),k)),s.translate((d.x+y.x)/2,(d.y+y.y)/2,(d.z+y.z)/2),_(s,t,i,[2*Math.PI*p,c])}function Fe(a,h,p,u,t,i,o=0){const d=new e.Vector3(...a),y=new e.Vector3(...h),c=new e.Vector3(...u),s=(E,x)=>d.clone().addScaledVector(y,E*p).addScaledVector(c,x*t),k=[s(-1,-1),s(1,-1),s(1,1),s(-1,-1),s(1,1),s(-1,1)],M=[[0,0],[2*p,0],[2*p,2*t],[0,0],[2*p,2*t],[0,2*t]],m=new e.BufferGeometry;return m.setAttribute("position",new e.BufferAttribute(new Float32Array(k.flatMap(E=>[E.x,E.y,E.z])),3)),m.setAttribute("uv",new e.BufferAttribute(new Float32Array(M.flat()),2)),_(m,i,o)}function Te(a,h,p=1,u=0,t=2*Math.PI,i=l.rim){const{R:o,tube:d}=z,y=.62,c=x=>Math.sign(x)*Math.pow(Math.abs(x),y),s=x=>[d*p*c(Math.cos(x))+(p-1)*0,d*p*c(Math.sin(x))],k=[],M=[],m=(x,U)=>{const[W,P]=s(U),Q=o+W;return[Q*Math.cos(x),Q*Math.sin(x),P]};for(let x=0;x<a;x++){const U=u+(t-u)*x/a,W=u+(t-u)*(x+1)/a;for(let P=0;P<h;P++){const Q=2*Math.PI*P/h,n=2*Math.PI*(P+1)/h,f=[[U,Q],[W,Q],[W,n],[U,Q],[W,n],[U,n]];for(const[v,R]of f)k.push(...m(v,R)),M.push(o*v,R)}}const E=new e.BufferGeometry;return E.setAttribute("position",new e.BufferAttribute(new Float32Array(k),3)),E.setAttribute("uv",new e.BufferAttribute(new Float32Array(M),2)),_(E,i)}function me(a,h,p,u,t,i=l.panel){const o=new e.RingGeometry(a,h,48,3),d=o.getAttribute("position"),y=o.getAttribute("uv");for(let c=0;c<d.count;c++){const s=d.getX(c),k=d.getY(c),M=Math.hypot(s,k);y.setXY(c,Math.atan2(k,s)*M,M),d.setZ(c,p)}return u<0&&o.index.array.reverse(),_(o,i,t)}function Ue(a,h,p,u,t=l.white,i=0){const o=[];for(let y=0;y<=8;y++){const c=p*y/8;o.push(new e.Vector2(c,u*(c/p)*(c/p)))}const d=new e.LatheGeometry(o,20);return d.applyQuaternion(new e.Quaternion().setFromUnitVectors(new e.Vector3(0,1,0),new e.Vector3(...h).normalize())),d.translate(...a),_(d,t,i,[p*6,p])}function $e(a,h){const{R:p,tube:u,hubR:t,hubL:i,coreR:o,coreL:d,truss:y}=z,c=[],s=[],k=h!=="low";c.push(Te(k?192:120,20));for(let n=0;n<24;n++){const f=n/24*2*Math.PI,v=1.6/p;c.push(Te(1,20,1.045,f-v,f+v,l.metal))}for(let n=0;n<6;n++){const f=n/6*2*Math.PI,v=Math.cos(f),R=Math.sin(f),g=(q,b=0)=>[q*v,q*R,b];c.push(V(g(t-1),g(p-u+2),2.8,16,l.panel,n+1)),c.push(V(g(t-1),g(t+4),4.2,16,l.metal,n)),c.push(V(g(p-u-4),g(p-u+1.5),4.4,16,l.metal,n)),c.push(V(g(104),g(110),3.6,16,l.gold,n));for(const q of[-1,1])c.push(V(g(t+2,q*15),g(p-u+1,q*9),.32,6,l.metal,n,!1));c.push(O(g(t+4,3.1),g(p-u-4,3.1),.9,.7,l.dark,n));for(const q of[52,78,136,162])c.push($(g(q,-2.6),[2.2,2.2,1.6],(q+n)%3?l.metal:l.gold,n*5+q))}c.push(V([0,0,-i/2],[0,0,i/2],t,24,l.panel,7,!1));for(const n of[-1,1]){c.push(me(o+3.2,13.5,n*i/2,n,7)),c.push(me(13.5,15.9,n*i/2,n,8,l.gold)),c.push(me(15.9,t,n*i/2,n,9));for(let f=0;f<30;f++){const v=(f+.5)/30*2*Math.PI;c.push(V([20.4*Math.cos(v),20.4*Math.sin(v),n*(i/2-.2)],[20.4*Math.cos(v),20.4*Math.sin(v),n*(i/2+.4)],.42,12,l.glazing,80+f+(n>0?0:20)))}c.push(V([0,0,n*(i/2)],[0,0,n*(i/2+1.1)],16.5,40,l.metal,70,!1)),c.push(V([0,0,n*(i/2)],[0,0,n*(i/2+1.1)],15.9,40,l.metal,70,!1));for(let f=0;f<6;f++){const v=f/6*2*Math.PI,R=Math.cos(v),g=Math.sin(v);c.push(O([(o+3.5)*R,(o+3.5)*g,n*(i/2+.5)],[(t-.3)*R,(t-.3)*g,n*(i/2+.5)],.8,1,l.metal,71));const q=v+Math.PI/6+(f%2?.12:-.1),b=f%3===0?20.5:13;c.push($([b*Math.cos(q),b*Math.sin(q),n*(i/2+.7)],[f%2?2.6:3.4,2,1.4],f%3===1?l.gold:l.white,72+f))}}c.push(V([0,0,-3],[0,0,3],t+.6,24,l.gold,8,!1));for(const n of[-1,1])c.push(V([0,0,n*(i/2-1)],[0,0,n*(i/2+.8)],t+.8,24,l.metal,9,!1));s.push(V([0,0,-d],[0,0,d],o,20,l.panel,11));for(const n of[-1,1])s.push(V([0,0,n*(i/2+1)],[0,0,n*(i/2+4)],o+3,20,l.dark,12)),s.push(V([0,0,n*30],[0,0,n*38],o+.4,20,l.gold,13,!1));const M=36;s.push(V([0,o-1,M],[0,o+6,M],3.4,16,l.panel,14)),s.push(V([0,o+6,M],[0,o+7.2,M],2.7,16,l.metal,15)),s.push(V([0,o+7.2,M],[0,o+7.6,M],1.7,16,l.dark,16)),s.push(O([0,o+6.4,M+3.7],[0,o+9.6,M+3.7],.18,.18,l.white,17)),s.push(V([0,o+9.6,M+3.7],[0,o+9.75,M+3.7],.55,10,l.white,17)),s.push(V([0,-o+1,-40],[0,-o-6,-40],.35,8,l.metal,18)),s.push(Ue([0,-o-6,-40],[.25,-1,.3],3.2,1,l.white,19)),s.push(V([2,o-.5,-26],[2,o+11,-26],.12,6,l.metal,20,!1)),s.push(V([-3,o-.5,42],[-3,o+5,42],.3,8,l.metal,21)),s.push(Ue([-3,o+5,42],[-.4,1,.5],1.6,.5,l.white,22));const m=3.5,E=7;for(const n of[-1,1]){const f=n*d,v=n*y,R=[[m,m],[-m,m],[-m,-m],[m,-m]];for(const[b,T]of R)s.push(O([b,T,f],[b,T,v],.55,.55,l.metal,30));const g=Math.round(Math.abs(v-f)/E);for(let b=0;b<=g;b++){const T=f+(v-f)*b/g;for(let F=0;F<4;F++){const[C,I]=R[F],[N,D]=R[(F+1)%4];if(s.push(O([C,I,T],[N,D,T],.32,.32,l.metal,31+(b*7+F*3)%11*.31)),b<g&&k){const X=f+(v-f)*(b+1)/g;s.push(O((b+F)%2?[C,I,T]:[N,D,T],(b+F)%2?[N,D,X]:[C,I,X],.22,.22,l.metal,32+(b*5+F)%13*.27))}}}s.push(O([.8,-.6,f],[.8,-.6,v],1.6,1.3,l.panel,34)),s.push(O([-1.6,1.4,f],[-1.6,1.4,v],.5,.5,l.dark,35));const q=[[90,0,l.gold,[5,2.2,6]],[118,1,l.white,[2.6,2.2,4]],[176,2,l.white,[3,2.4,9]],[205,0,l.metal,[4,1.8,3]],[272,3,l.gold,[2.4,2.4,5]],[300,1,l.white,[3,2,6]],[62,3,l.metal,[2.2,2.2,3]]];for(const[b,T,F,C]of q){const I=[[0,-m-C[1]/2-.3],[m+C[0]/2+.3,0],[0,m+C[1]/2+.3],[-m-C[0]/2-.3,0]][T];s.push($([I[0],I[1],n*b],C,F,33+b))}}const x=new e.Vector3(0,a.y,a.z);x.lengthSq()<1e-6&&x.set(0,1,0),x.normalize();const U=new e.Vector3(0,x.z,-x.y);for(const n of[130,250,-130,-250])for(const f of[-1,1]){const v=[f*(m+2),0,n];s.push($([f*(m+1.6),0,n],[3.2,3.2,3.2],l.dark,40)),s.push(V([f*(m+3),0,n],[f*(m+118),0,n],.42,6,l.metal,41));for(const R of[-1,1]){const g=U.clone().multiplyScalar(R*4.1),q=[f*(m+61),g.y,n+g.z],b=50+(n>0?1:2)*10+(f>0?1:0)*4+(R>0?1:0),T=Fe(q,[f,0,0],56,U.toArray(),3.6,l.solar,b),F=T.getAttribute("normal");new e.Vector3(F.getX(0),F.getY(0),F.getZ(0)).dot(x)<0&&Je(T),s.push(T),s.push($([f*(m+118.5),g.y,n+g.z],[1.2,.5,7.4].map((I,N)=>I),l.dark,42,U))}}const W=new e.Vector3(a.x,a.y,a.z).normalize();let P=new e.Vector3(1,0,0).cross(W);P.lengthSq()<1e-6&&P.set(0,1,0),P.normalize();const Q=new e.Vector3().crossVectors(P,new e.Vector3(1,0,0)).normalize();for(const n of[70,-70])for(const f of[-1,1]){s.push(O([f*m,0,n],[f*52,0,n],.5,.5,l.metal,60));for(let v=0;v<3;v++){const R=f*(m+8+v*14.6);s.push(Fe([R,-.4,n],[1,0,0],7,[0,0,1],4.2,l.radiator,61+v+(n>0?0:8)))}}return{spin:ke(c),fixed:ke(s),dockZ:M}}function $(a,h,p,u,t=null){const i=new e.BoxGeometry(h[0],h[1],h[2]);if(t){const o=new e.Matrix4().makeBasis(new e.Vector3(1,0,0),new e.Vector3(0,t.z,-t.y).normalize(),t.clone().normalize());i.applyMatrix4(o)}return i.translate(...a),_(i,p,u,h.slice(0,2))}function Je(a){const h=a.getAttribute("position"),p=a.getAttribute("uv");for(let u=0;u<h.count;u+=3)for(const t of[h,p]){const i=t.itemSize;for(let o=0;o<i;o++){const d=t.array[(u+1)*i+o];t.array[(u+1)*i+o]=t.array[(u+2)*i+o],t.array[(u+2)*i+o]=d}}return a.computeVertexNormals(),a}const et=`
precision highp float;
in vec3 position; in vec3 normal; in vec2 uv; in float aMat; in float aSeed;
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
out vec3 vW; out vec3 vN; out vec2 vUv; out float vMat; out float vSeed;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vMat = aMat; vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`,tt=`
precision highp float;
precision highp int;
in vec3 vW; in vec3 vN; in vec2 vUv; in float vMat; in float vSeed;
out vec4 outColor;
uniform vec3 uCam, uSun, uSunCol, uEarth, uUp;
uniform float uExposure, uWin, uSpinPhase;
uniform sampler2D uShadow;
uniform mat4 uShadowMat;
uniform vec2 uShadowTexel;
${Ze}
const float PI = 3.14159265;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
// an antialiased line pattern: 1 on a seam of width w (metres) every period
float seam(float x, float period, float w) {
  float d = abs(fract(x / period + 0.5) - 0.5) * period;
  float fw = max(fwidth(x), 1e-4);
  float s = 1.0 - smoothstep(w * 0.5 - fw, w * 0.5 + fw, d);
  return s * clamp(1.0 - fw / (w * 1.5 + 1e-4) * 0.35, 0.0, 1.0) + clamp(w / period, 0.0, 1.0) * smoothstep(w, w * 4.0, fw);
}
float shadowAt(vec3 p, vec3 n, float nl) {
  // normal offset grows at grazing light (no acne on surfaces the sun skims)
  vec3 q = p + n * (0.45 + 2.2 * (1.0 - nl)) + uSun * 0.3;
  vec4 s = uShadowMat * vec4(q, 1.0);
  vec3 c = s.xyz / s.w * 0.5 + 0.5;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0) return 1.0;
  float lit = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    float d = texture(uShadow, c.xy + vec2(float(i), float(j)) * uShadowTexel).r;
    lit += step(c.z - 0.0008, d);
  }
  return lit / 9.0;
}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(uCam - vW);
  bool back = !gl_FrontFacing;
  if (back) n = -n;
  int m = int(vMat + 0.5);
  float nl = dot(n, uSun);
  float sh = nl > 0.0 ? shadowAt(vW, n, nl) : 0.0;
  vec3 E = uSunCol * max(nl, 0.0) * sh;                    // sun irradiance (ESUN = 1)
  float down = clamp(0.5 - 0.5 * dot(n, uUp), 0.0, 1.0);
  vec3 Ee = uEarth * (0.15 + 0.85 * down * down);          // earthshine, from below
  vec3 h = normalize(v + uSun);
  float nh = max(dot(n, h), 0.0), nv = max(dot(n, v), 1e-3), vh = max(dot(v, h), 0.0);
  vec3 alb = vec3(0.78);
  vec3 spec = vec3(0.0), emit = vec3(0.0);
  float rough = 0.0;
  // panel coordinates in metres (the rim's second coordinate is its section angle: scale it to metres)
  vec2 pu = m == 8 ? vec2(vUv.x, vUv.y * 14.0) : vUv;
  vec2 cell = floor(pu / vec2(4.2, 4.6));
  float tone = 0.93 + 0.12 * h21(cell + vSeed * 7.1);
  if (m == 0 || m == 8) {
    // white beta-cloth blankets: panels 4.2 x 4.6 m, a darker seam, a faint quilting, a few cream panels
    alb = vec3(0.80, 0.80, 0.78) * tone;
    if (h21(cell * 1.7 + 3.0 + vSeed) > 0.86) alb *= vec3(1.0, 0.95, 0.86);
    if (h21(cell * 2.3 + 9.0 + vSeed) > 0.975) alb = vec3(0.66, 0.66, 0.66);
    float s = max(seam(pu.x, 4.2, 0.06), seam(pu.y, 4.6, 0.06));
    alb *= 1.0 - 0.38 * s;
    alb *= 0.96 + 0.08 * n2(pu * 2.7 + vSeed) - 0.03 * n2(pu * 9.0);   // the cloth: soft creases
    float quilt = seam(pu.x + pu.y, 1.1, 0.05) + seam(pu.x - pu.y, 1.1, 0.05);
    alb *= 1.0 - 0.08 * clamp(quilt, 0.0, 1.0);
    // small fittings: a hatch or vent near some panel corners, and a soft sag across each blanket
    vec2 pc = fract(pu / vec2(4.2, 4.6)) * vec2(4.2, 4.6);
    float hx = h21(cell * 3.1 + 1.7 + vSeed);
    float fwp = fwidth(pu.x) + fwidth(pu.y);
    float vent = (1.0 - smoothstep(0.24 - fwp, 0.24 + fwp, max(abs(pc.x - 0.9), abs(pc.y - 0.9)))) * step(0.86, hx);
    alb = mix(alb, vec3(0.30, 0.30, 0.31), vent);
    alb *= 0.97 + 0.06 * sin(pc.x / 4.2 * 3.14159) * sin(pc.y / 4.6 * 3.14159);
    // handrails (gold-yellow, 4 cm) along every other panel row, broken every 1.4 m at a standoff
    float rail = seam(pu.y - 0.45, 9.2, 0.045) * (1.0 - seam(pu.x, 1.4, 0.12) * 0.6) * step(0.5, h21(vec2(floor(pu.x / 12.0), floor(pu.y / 9.2)) + vSeed));
    alb = mix(alb, vec3(0.50, 0.38, 0.14), rail * 0.9);
    spec = vec3(0.02) * pow(nh, 8.0);
    {
      vec3 rf = reflect(-v, n);
      float Fs = 0.03 + 0.25 * pow(1.0 - nv, 4.0);
      emit += uEarth * 0.9 * Fs * smoothstep(0.1, -0.4, dot(rf, uUp));
    }
    if (m == 8) {
      // the rim: windows on both side walls (section angle near +-90 deg), the glazed walkway on the inner face (180)
      float a = vUv.y;                                    // section angle, radians (0 = outward)
      float along = vUv.x;
      // each of the 24 modules (between collars) has its own windows: none (stores, plant), one row or two,
      // its own spacing and width, and its own share of lit rooms
      float modL = 2.0 * PI * 200.0 / 24.0;
      float modId = floor(along / modL);
      float hm = h21(vec2(modId, 3.3)), hm2 = h21(vec2(modId, 8.1));
      float rows = hm < 0.18 ? 0.0 : (hm < 0.55 ? 1.0 : 2.0);
      float per = 3.4 + 2.2 * hm2;
      float hw = hm2 > 0.82 ? 1.1 : 0.5;                   // a few modules have wide (lounge) windows
      float lit = uWin * (0.35 + 1.3 * h21(vec2(modId, 5.7)));
      float inMod = fract(along / modL) * modL;
      float edge = step(3.0, inMod) * step(inMod, modL - 3.0);   // no windows under the collars
      for (int side = 0; side < 2; side++) {
        float ac = side == 0 ? 0.5 * PI : 1.5 * PI;
        for (int row = 0; row < 2; row++) {
          if (float(row) >= rows) break;
          float ar = ac + (rows < 1.5 ? 0.0 : (row == 0 ? -0.36 : 0.36)) * (side == 0 ? 1.0 : -1.0);
          float dy = (a - ar) * 14.0;                      // metres up the wall, roughly
          float id = floor(along / per);
          float dx = (fract(along / per) - 0.5) * per;
          float fw = fwidth(along) + fwidth(a) * 14.0;
          float win = (1.0 - smoothstep(hw - fw, hw + fw, abs(dx))) * (1.0 - smoothstep(0.75 - fw, 0.75 + fw, abs(dy))) * edge;
          float frame = (1.0 - smoothstep(hw + 0.18 - fw, hw + 0.18 + fw, abs(dx))) * (1.0 - smoothstep(0.93 - fw, 0.93 + fw, abs(dy))) * edge;
          if (frame > 0.0) {
            alb = mix(alb, vec3(0.30), frame);
            float k = h21(vec2(id, float(side * 2 + row) + 0.5));
            float k2 = h21(vec2(id * 1.37 + 5.0, float(side * 2 + row)));
            vec3 inside = vec3(0.0);
            if (k < lit) inside = k2 < 0.14 ? vec3(0.035, 0.075, 0.02) * (0.8 + 0.4 * h21(vec2(id, 3.0))) : vec3(0.12, 0.075, 0.036) * (0.6 + 0.6 * k2);
            // glass: black space and a hard sun glint
            float g = pow(max(dot(reflect(-v, n), uSun), 0.0), 900.0) * 30.0 * sh;
            alb = mix(alb, vec3(0.0), win);
            emit += (inside + vec3(g)) * win;
          }
        }
      }
      // the walkway: a glazed band 5 m wide on the inner face, gardens and warm light under it
      float dyw = (a - PI) * 14.0;
      float fw2 = fwidth(a) * 14.0;
      float band = 1.0 - smoothstep(2.5 - fw2, 2.5 + fw2, abs(dyw));
      if (band > 0.0) {
        float mull = max(seam(vUv.x, 3.0, 0.10), seam(dyw + 1.25, 2.5, 0.10));
        // through the skylight, from above: the walkway's floor, a pale path down the middle, small trees
        // (round canopies, darker at the edge), and warm lamps along the path every 6 m
        float path = 1.0 - smoothstep(0.55, 0.75, abs(dyw));
        vec3 garden = mix(vec3(0.006, 0.007, 0.005), vec3(0.016, 0.014, 0.010), path);
        vec2 gp = vec2(vUv.x, dyw * 1.45);
        float tree = 0.0, rimT = 0.0;
        for (int ix = -1; ix <= 1; ix++) for (int iy = -1; iy <= 1; iy++) {
          vec2 c = floor(gp / 2.2) + vec2(float(ix), float(iy));
          vec2 o = (c + vec2(h21(c + 2.0), h21(c + 9.0))) * 2.2;
          float r = 0.55 + 0.6 * h21(c + 5.0);
          vec2 dd = gp - o;
          float d = length(dd) / (r * (0.78 + 0.4 * n2(normalize(dd + 1e-4) * 2.3 + c * 1.7)));
          float on = step(0.32, h21(c + 13.0)) * step(0.9, abs(o.y));     // no trees on the path
          float t = (1.0 - smoothstep(0.85, 1.0, d)) * on;
          if (t > tree) { tree = t; rimT = smoothstep(0.3, 1.0, d); }
        }
        float clump = 0.55 + 0.45 * n2(gp * 4.5 + 3.0) * n2(gp * 1.7);
        vec3 leaf = mix(vec3(0.008, 0.014, 0.006), vec3(0.003, 0.006, 0.002), rimT) * clump;
        garden = mix(garden, leaf, tree);
        float lx = (fract(vUv.x / 6.0) - 0.5) * 6.0;
        float lampOn = step(h21(vec2(floor(vUv.x / 6.0), 7.0)), 0.35 + 0.6 * uWin);
        float lamp = (exp(-(lx * lx) / 0.03 - pow(abs(dyw) - 0.7, 2.0) / 0.03)) * lampOn;
        garden += vec3(0.5, 0.33, 0.15) * lamp + vec3(0.03, 0.022, 0.012) * lampOn * exp(-(lx * lx) / 2.0) * path;
        garden *= (0.6 + 0.4 * uWin);
        float g = pow(max(dot(reflect(-v, n), uSun), 0.0), 600.0) * 25.0 * sh;
        alb = mix(alb, vec3(0.32) * (1.0 - 0.0), band * mull);
        // the glass mirrors what it faces: the bright Earth below, black space above (Fresnel)
        vec3 rf = reflect(-v, n);
        float Fg = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
        vec3 mirror = mix(vec3(0.0015, 0.002, 0.003), vec3(0.05, 0.08, 0.14), smoothstep(0.05, -0.35, dot(rf, uUp)));
        vec3 glass = garden * (1.0 - Fg) + mirror * Fg * 0.9 + vec3(g);
        alb = mix(alb, vec3(0.0), band * (1.0 - mull));
        emit += glass * band * (1.0 - mull);
      }
    }
  } else if (m == 1) {
    // gold foil (MLI): crinkled, a mirror-like warm metal
    vec2 q = vUv * 2.4 + vSeed * 3.0;
    vec3 pn = vec3(n2(q) - 0.5, n2(q + 17.0) - 0.5, n2(q * 2.1 + 5.0) - 0.5);
    vec3 nn = normalize(n + pn * 0.55);
    float nh2 = max(dot(nn, h), 0.0);
    alb = vec3(0.32, 0.20, 0.07);
    spec = vec3(1.0, 0.70, 0.30) * (pow(nh2, 40.0) * 6.0 + pow(nh2, 6.0) * 0.6);
  } else if (m == 2) {
    if (!back) {
      // solar cells: blue-black, a fine grid of silver lines, glass that throws the sun back orange-gold
      alb = vec3(0.012, 0.016, 0.040) * (0.85 + 0.3 * h21(floor(vUv / vec2(1.8, 2.4)) + vSeed));
      float g = max(seam(vUv.x, 0.6, 0.03), seam(vUv.y, 0.6, 0.03)) * 0.45 + max(seam(vUv.x, 7.4, 0.16), seam(vUv.y, 7.2, 0.16)) * 0.8;
      alb = mix(alb, vec3(0.13, 0.135, 0.15), clamp(g, 0.0, 1.0));
      float F = 0.04 + 0.96 * pow(1.0 - vh, 5.0);
      vec2 ce = floor(vUv / vec2(1.8, 2.4)) + vSeed * 3.1;
      vec3 nj = normalize(n + 0.035 * vec3(h21(ce) - 0.5, h21(ce + 7.7) - 0.5, h21(ce + 3.3) - 0.5));
      nh = max(dot(nj, h), 0.0);
      spec = vec3(1.0, 0.52, 0.18) * (pow(nh, 90.0) * 2.2 + pow(nh, 1200.0) * 60.0 + pow(nh, 24.0) * 0.18) * (0.25 + F) + vec3(0.25, 0.3, 0.45) * F * 0.08;
    } else {
      alb = vec3(0.45, 0.27, 0.10) * (0.9 + 0.2 * h21(floor(vUv / vec2(3.0, 7.2)) + vSeed));   // kapton back
      spec = vec3(0.9, 0.55, 0.2) * pow(nh, 10.0) * 0.4;
    }
  } else if (m == 3) {
    alb = vec3(0.86) * (0.97 + 0.03 * h21(floor(vUv / 1.2) + vSeed));
    alb *= 1.0 - 0.25 * seam(vUv.x, 1.2, 0.05);
    spec = vec3(0.10) * pow(nh, 30.0);
  } else if (m == 4) {
    alb = vec3(0.50, 0.50, 0.49) * (0.9 + 0.14 * h21(vec2(vSeed, 1.0)));
    spec = vec3(0.25) * pow(nh, 24.0);
  } else if (m == 5) {
    alb = vec3(0.045);
    spec = vec3(0.12) * pow(nh, 40.0);
  } else if (m == 6) {
    // a viewport: dark glass, a warm room behind it when lit, a hard sun glint
    float k = h21(vec2(vSeed, 4.0));
    alb = vec3(0.02);
    if (k < 0.55 + 0.45 * uWin) emit += vec3(0.05, 0.032, 0.015) * (0.6 + 0.6 * h21(vec2(vSeed, 9.0)));
    vec3 rf6 = reflect(-v, n);
    float F6 = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
    emit += mix(vec3(0.0015, 0.002, 0.003), vec3(0.05, 0.08, 0.14), smoothstep(0.05, -0.35, dot(rf6, uUp))) * F6;
    emit += vec3(pow(max(dot(reflect(-v, n), uSun), 0.0), 900.0) * 30.0 * sh);
  } else if (m == 7) {
    alb = vec3(0.84);
    spec = vec3(0.05) * pow(nh, 12.0);
  }
  vec3 col = alb / PI * (E + Ee) + spec * E + emit;
  col += alb * vec3(0.0016, 0.0019, 0.0030);              // the faint floor of starlight
  outColor = vec4(finish(col * 7.0, uExposure, gl_FragCoord.xy), 1.0);
}
`,ot=`
precision highp float;
in vec3 position;
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
void main() { gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }
`,nt=`
precision highp float;
out vec4 outColor;
void main() { outColor = vec4(1.0); }
`;function qe(a){const h=a.length,p=a.map((u,t)=>{const i=a[Math.max(0,t-1)],o=a[Math.min(h-1,t+1)],d=o[0]-i[0]||1;return o[1].map((y,c)=>(y-i[1][c])/d)});return u=>{if(u<=a[0][0])return new e.Vector3(...a[0][1]).addScaledVector(new e.Vector3(...p[0]),u-a[0][0]);if(u>=a[h-1][0])return new e.Vector3(...a[h-1][1]).addScaledVector(new e.Vector3(...p[h-1]),u-a[h-1][0]);let t=0;for(;t<h-2&&u>a[t+1][0];)t++;const[i,o]=a[t],[d,y]=a[t+1],c=d-i,s=(u-i)/c,k=s*s,M=k*s,m=2*M-3*k+1,E=M-2*k+s,x=-2*M+3*k,U=M-k;return new e.Vector3(...[0,1,2].map(W=>m*o[W]+E*c*p[t][W]+x*y[W]+U*c*p[t+1][W]))}}const J=(a,h,p)=>{const u=Math.max(0,Math.min(1,(p-a)/(h-a)));return u*u*(3-2*u)},ee=qe([[0,[6,26,226]],[.14,[5,24,160]],[.28,[3,26,92]],[.4,[1,32,34]],[.5,[0,76,10]],[.58,[0,150,4]],[.655,[1,174,-16]],[.73,[6,180,-78]],[.84,[40,236,-226]],[1,[112,400,-500]]]),at=qe([[0,[0,-10,40]],[.2,[0,-12,0]],[.3,[0,10,-12]],[.38,[0,58,-10]],[.5,[0,205,-6]],[.58,[0,190,-4]],[.63,[0,186,-22]],[.7,[10,150,-220]]]),Ie=new e.Vector3(-8,22,0),rt=new e.Quaternion;function ie(a,h,p){const u=new e.Quaternion().setFromUnitVectors(a,h);return a.clone().applyQuaternion(rt.clone().slerp(u,p))}async function it(a,h,p={}){const u=p.quality==="low"?"low":"high",t=await Ye(a,h,{look:"orbit",quality:u});t.setSunAngle(z.sunV);const i=Math.max(0,Math.min(1,(z.sunV-3)/17)),d=(1-.68*(i*i*(3-2*i)))*3.4,y=a.backdrop,c=a.camera;c.near=.1,c.far=6e3,c.updateProjectionMatrix();const s=new e.Vector3(...t.light.dir).normalize(),M=Math.atan2(s.x,s.z)-z.sunAz*ce,m=new e.Quaternion().setFromEuler(new e.Euler(z.tilt*ce,M,0,"YXZ")),E=m.clone().invert(),x=new e.Vector3(0,0,0),U=r=>new e.Vector3(...Array.isArray(r)?r:r.toArray()).applyQuaternion(m).add(x),W=s.clone().applyQuaternion(E),P=$e(W,u),Q={uCam:{value:new e.Vector3},uSun:{value:s.clone()},uSunCol:{value:new e.Vector3(1,1,1)},uEarth:{value:new e.Vector3(.04,.058,.092)},uUp:{value:new e.Vector3(0,1,0)},uExposure:{value:d},uWin:{value:.4},uSpinPhase:{value:0},uShadow:{value:null},uShadowMat:{value:new e.Matrix4},uShadowTexel:{value:new e.Vector2}},n=new e.RawShaderMaterial({glslVersion:e.GLSL3,vertexShader:et,fragmentShader:tt,uniforms:Q,side:e.DoubleSide}),f=new e.RawShaderMaterial({glslVersion:e.GLSL3,vertexShader:ot,fragmentShader:nt,side:e.DoubleSide}),v=new e.Group;v.quaternion.copy(m),v.position.copy(x);const R=new e.Group,g=new e.Mesh(P.spin,n),q=new e.Mesh(P.fixed,n);g.frustumCulled=!1,q.frustumCulled=!1,R.add(g),v.add(R,q);const b=new e.Scene;b.add(v);const T=u==="low"?1024:2048,F=new e.WebGLRenderTarget(T,T,{depthBuffer:!0,depthTexture:new e.DepthTexture(T,T)});F.depthTexture.minFilter=F.depthTexture.magFilter=e.NearestFilter;const C=360,I=new e.OrthographicCamera(-C,C,C,-C,1,2*C+1);I.position.copy(x).addScaledVector(s,C+1),I.up.set(0,1,0),Math.abs(s.y)>.98&&I.up.set(0,0,1),I.lookAt(x),I.updateMatrixWorld(!0),I.updateProjectionMatrix(),Q.uShadow.value=F.depthTexture,Q.uShadowTexel.value.set(1/T,1/T),Q.uShadowMat.value.multiplyMatrices(I.projectionMatrix,I.matrixWorldInverse);let N=NaN,D=0,X=null,ue=null,ve=0;const pe=-(.655*z.passSeconds)/z.turnSeconds;function te(){return X??pe+D*z.passSeconds/z.turnSeconds}function oe(){R.rotation.set(0,0,te()*2*Math.PI),R.updateMatrixWorld(!0)}function we(r,S,w){oe(),v.updateMatrixWorld(!0);const A=te();if(A!==N){N=A;const j=r.getRenderTarget();b.overrideMaterial=f,r.setRenderTarget(F),r.setClearColor(0,0),r.clear(!0,!0,!0),r.render(b,I),b.overrideMaterial=null,r.setRenderTarget(j)}y&&y(r,S,w),r.setRenderTarget(null);const G=t.light;Q.uSun.value.fromArray(G.dir).normalize();const L=Math.max(G.color[0],G.color[1],G.color[2])>.05?G.color:[1,.985,.96];Q.uSunCol.value.set(L[0],L[1],L[2]),Q.uCam.value.copy(S.position),Q.uWin.value=ue??.4,r.render(b,S),r.setRenderTarget(null),r.autoClear=!1}a.setBackdrop(we);let xe=!1;function ge(r){const S=W;let w=1e9,A=0;for(let L=0;L<=520;L+=1.5){const j=r.x+S.x*L,H=r.y+S.y*L,B=r.z+S.z*L,Z=Math.hypot(j,H),re=Math.hypot(Z-z.R,B);re<w&&(w=re),Z<z.hubR&&Math.abs(B)<z.hubL/2&&(A=1)}const G=J(12.6,15,w);return Math.min(G,1-A)}const ne=new e.Vector3(0,1,0);function be(r){const w=ee(r),A=ee(r+.001).sub(ee(r-.001)).normalize(),G=ee(r+.001).add(ee(r-.001)).sub(w.clone().multiplyScalar(2)).divideScalar(.001*.001);let L=ne.clone().addScaledVector(A,-A.dot(ne));L.lengthSq()<1e-4&&L.set(0,0,1),L.normalize();const j=A.clone().cross(L).normalize(),H=Math.max(-.55,Math.min(.55,-G.dot(j)*12e-5));return{p:w,f:A,up:L,right:j,bank:H}}function Ee(r){const S=Math.max(0,Math.min(1,r)),w=be(S),A=w.f.clone().applyQuaternion(m),G=w.up.clone().applyQuaternion(m),L=Re(A,w.bank,G),j=U(w.p),H=be(Math.max(0,S-.012)),B=J(.6,.93,S),Z=H.f.clone().negate().multiplyScalar(2.5).addScaledVector(H.up,.62).addScaledVector(H.right,.42).normalize(),re=Ie.clone().sub(w.p).normalize(),ze=w.right.clone().negate(),Ae=re.clone().negate().addScaledVector(ze,-.42).addScaledVector(ne,.3).normalize(),se=w.up.clone().multiplyScalar(.5).addScaledVector(ze,-.87).normalize(),K=Z.angleTo(se),de=se.angleTo(Ae),he=B*(K+de),Ge=he<=K?ie(Z,se,K>1e-4?he/K:1):ie(se,Ae,de>1e-4?(he-K)/de:1),Be=Math.hypot(2.5,.62,.42)+1.2*B,le=w.p.clone().addScaledVector(Ge,Be),Oe=at(Math.min(S,.7)).sub(le).normalize(),Ve=w.p.clone().sub(le).normalize(),je=Ie.clone().sub(le).normalize(),Ne=Oe.multiplyScalar(.58).addScaledVector(Ve,.42).normalize(),De=ie(Ve,je,.78*J(.3,1,B)),He=ie(Ne,De,J(0,.3,B)),_e=w.up.clone().lerp(ne,J(0,.5,B)).normalize(),Xe=Re(He.applyQuaternion(m),w.bank*.25*(1-B),_e.applyQuaternion(m));return{hero:{p:j.toArray(),q:L.toArray()},camera:{p:U(le).toArray(),q:Xe.toArray(),fov:44-4*B,u:S},spin:pe+S*z.passSeconds/z.turnSeconds}}const Y=Ke({q:m.toArray(),centre:x.toArray()}),Pe=new e.Quaternion,Ce=new e.Vector3(0,0,-1);function ae(r){const S=Math.max(0,Math.min(1,r)),w=Y.shot(S),A=Y.station(S),G=new e.Quaternion().fromArray(w.hero.q).multiply(Pe.setFromAxisAngle(Ce,Y.heroRoll(S)*ce));return{hero:{p:w.hero.p,q:G.toArray()},camera:{p:w.p,q:w.q,fov:w.fov,u:A},spin:pe+A*z.passSeconds/z.turnSeconds,shot:w}}const Le=r=>new e.Vector3(...Y.shot(Y.tOf(r)).hero.p).sub(x).applyQuaternion(E),fe=(r,S,w)=>{const A=r*ce+te()*2*Math.PI;return U([S*Math.cos(A),S*Math.sin(A),w]).toArray()},Qe={get hub(){return U([0,0,0]).toArray()},get dock(){return U([0,z.coreR+7.6,P.dockZ]).toArray()},get window(){return fe(90,z.R,z.tube)},get walkway(){return fe(90,z.R-z.tube,0)},get spoke(){return fe(60,110,0)},get wing(){return U([z.coreR+60,0,130]).toArray()},get truss(){return U([0,0,200]).toArray()},get start(){return ae(0).hero.p},get mid(){return ae(.5).hero.p},get end(){return ae(1).hero.p}},We=r=>.1+.45*Math.max(0,Math.min(1,r));let ye=!1;const Me={world:"future",look:"orbital",kind:"live",ready:t.ready,get light(){return t.light},anchors:Qe,station:{root:v,quaternion:m.clone(),centre:x.clone(),R:z.R,tube:z.tube},flight:ae,heightAt(){return null},setCamera(r){if(!r)return;const S=typeof r.u=="number";if(t.setCamera({p:r.p,q:r.q,fov:r.fov,u:S?We(r.u):void 0}),S&&(D=Math.max(0,Math.min(1,r.u))),oe(),S){const w=ge(Le(D));if(w<.999||xe){const A=t.light;a.setSun({dir:A.dir,color:A.color,ambient:A.ambient},{key:.86*(.32+.68*w),rim:1.4*(.35+.65*w)})}xe=w<.999}},sunAt(r){return ge(new e.Vector3(...Array.isArray(r)?r:[r.x,r.y,r.z]).sub(x).applyQuaternion(E))},setView(){return null},setTime(r){ve=r||0,t.setTime(ve)},setFocus(){},setSpin(r){X=r==null?null:+r,oe()},setWindows(r){ue=r==null?null:Math.max(0,Math.min(1,+r))},get spin(){return te()},galaxy:t,dispose(){ye||(ye=!0,a.backdrop===we&&a.setBackdrop(y||null),t.dispose(),P.spin.dispose(),P.fixed.dispose(),n.dispose(),f.dispose(),F.depthTexture.dispose(),F.dispose())}},Se=a.destroy;return a.destroy=function(){return Me.dispose(),a.destroy=Se,Se.apply(a,arguments)},oe(),Me}const ut={id:"orbital",name:"A ring in orbit",kind:"live"};export{z as ORBITAL,it as createOrbital,ut as meta};
