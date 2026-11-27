import*as c from"three";import{loadTexture as P,GLSL_FINISH as xt,FULL_VERT as yt,fullScreenTriangle as St,noseQuat as rt}from"./common.js";import{createSky as wt,SKY_GLSL as Et,galDir as Q}from"./sky.js";import{flight as zt}from"./shots/deepsky.js";const s=Math.PI/180,L=23.4393*s,g=c.Vector3,At={sunLambda:185,earthLambda:305,earthBeta:-2.5,earthKm:372e3,moonKm:14950,moonR:1737.4,earthR:6371,subSolarLon:-28,moonElong:95,fov:40,gc:[3,14],bandTilt:-13};function st(n,r){const S=n*s,e=r*s,l=Math.cos(e)*Math.cos(S),b=Math.cos(e)*Math.sin(S),D=Math.sin(e);return new g(l,Math.cos(L)*b-Math.sin(L)*D,Math.sin(L)*b+Math.cos(L)*D)}const Rt=new g(0,-Math.sin(L),Math.cos(L));function kt(n,r,S,e){const l=(K,w)=>{const f=K.clone().normalize(),v=K.clone().cross(w).normalize(),E=f.clone().cross(v);return new c.Matrix3().set(f.x,v.x,E.x,f.y,v.y,E.y,f.z,v.z,E.z)},b=l(n,r);return l(S,e).multiply(b.transpose())}const Ft=n=>{const r=Math.max(0,Math.min(1,n));return r*r*(3-2*r)},Pt=n=>{const r=Math.max(0,Math.min(1,n));return r<.5?4*r*r*r:1-Math.pow(-2*r+2,3)/2};async function Gt(n,r,{quality:S}){const e=At,l=t=>new g(.42*Math.sin(2*Math.PI*(.55*t-.12)),.1*Math.sin(2*Math.PI*.7*t)+.02,-5*t);function b(t){const a=l(t+.001).add(l(t-.001)).sub(l(t).multiplyScalar(2)).divideScalar(1e-6);return Math.max(-.62,Math.min(.62,a.x*.12))}function D(t){const o=l(t),a=l(t+.001).sub(l(t-.001));return{p:o,q:rt(a,b(t))}}function K(t){const o=Pt(t),a=(15-29*o)*s,h=(30+5*Math.sin(Math.PI*t))*s,m=3.65,y=l(t-.035),V=new g(Math.sin(a)*Math.cos(h),Math.sin(h),Math.cos(a)*Math.cos(h)).multiplyScalar(m),q=y.clone().add(V),N=l(t).clone().sub(q).normalize(),nt=N.clone().cross(new g(0,1,0)).normalize(),vt=nt.clone().cross(N).normalize(),Mt=N.clone().applyAxisAngle(vt,-12.5*s).applyAxisAngle(nt,(7+4*(1-o))*s),gt=-b(t-.05)*.12,bt=rt(Mt,gt);return{p:q,q:bt}}const w=K(1),f=(t,o,a)=>new g(Math.sin(o*s)*Math.cos(a*s),Math.sin(a*s),-Math.cos(o*s)*Math.cos(a*s)).applyQuaternion(t.q),v=Q(0,0),E=st(e.earthLambda,e.earthBeta);let z=kt(v,E,f(w,e.gc[0],e.gc[1]),f(w,e.gc[0],e.gc[1]-20));{const t=v.clone().applyMatrix3(z),o=Q(4,0).sub(Q(-4,0)).applyMatrix3(z),a=w.q.clone().invert(),h=o.clone().applyQuaternion(a),m=Math.atan2(h.y,h.x);let y=e.bandTilt*s;Math.abs(m-y)>Math.PI/2&&(y+=Math.PI),z=new c.Matrix3().setFromMatrix4(new c.Matrix4().makeRotationAxis(t.normalize(),-(y-m)*Math.sign(t.clone().applyQuaternion(a).z<0?1:-1))).multiply(z)}const I=t=>t.clone().applyMatrix3(z).normalize(),M=I(st(e.sunLambda,0)),d=I(E),lt=I(new g(0,0,1)),U=I(Rt);let p=null,_=1e9;for(let t=-10;t<=4;t+=.25){const o=f(w,21,t),a=Math.abs(Math.acos(Math.max(-1,Math.min(1,o.dot(M))))/s-e.moonElong);a<_&&(_=a,p=o)}const A=Math.asin(e.moonR/e.moonKm),R=Math.asin(e.earthR/e.earthKm),k=d.clone().multiplyScalar(e.earthKm).sub(p.clone().multiplyScalar(e.moonKm)).normalize(),B=U.clone().sub(k.clone().multiplyScalar(U.dot(k))).normalize(),F=B.clone().cross(k),ct=new c.Matrix3().set(k.x,k.y,k.z,F.x,F.y,F.z,B.x,B.y,B.z),x=lt.clone(),C=M.clone().sub(x.clone().multiplyScalar(M.dot(x))).normalize().clone().applyAxisAngle(x,-e.subSolarLon*s),G=x.clone().cross(C),it=new c.Matrix3().set(C.x,C.y,C.z,G.x,G.y,G.z,x.x,x.y,x.z),i=await wt(n,r,{brightness:1,stars:1.15,knee:.013,crisp:.4,orientation:z}),W=()=>i.setOccluders([j?{dir:p,radius:A+.002}:null,{dir:d,radius:R+.0015}].filter(Boolean));let j=!0;W();const Y=St(),u={...i.uniforms,uInvProj:{value:new c.Matrix4},uCamRot:{value:new c.Matrix3},uPx:{value:6e-4},uSun:{value:M.clone()},uMoonDir:{value:p.clone()},uMoonSin:{value:Math.sin(A)},uMoonAng:{value:A},uMoonRot:{value:ct},uMoonOn:{value:1},uEarthDir:{value:d.clone()},uEarthSin:{value:Math.sin(R)},uEarthAng:{value:R},uEarthRot:{value:it},uMoonAlb:{value:null},uMoonSlope:{value:null},uEarthMap:{value:null},uEarthNight:{value:null},uExposure:{value:1},uShadow:{value:S==="low"?0:1},uRelief:{value:2.4}},$=new c.RawShaderMaterial({glslVersion:c.GLSL3,vertexShader:yt,fragmentShader:Lt,uniforms:u,depthTest:!1,depthWrite:!1,blending:c.NoBlending}),J=new c.Mesh(Y,$);J.frustumCulled=!1;const X=new c.Scene;X.add(J);const ut=new c.OrthographicCamera(-1,1,1,-1,0,1),O={dir:M.toArray(),color:[1,.975,.94],ambient:[.3,.36,.52],haze:null};n.setSun({dir:O.dir,color:O.color,ambient:O.ambient},{key:.93,rim:.55,hue:.22,shade:.2,shadeColor:[.15,.175,.24]}),n.setBounce([.05,.05,.055],.02),n.setHaze([0,0,0],0),n.setGround(null),n.groundY=-1e6;function ht(t,o,a){o.updateMatrixWorld(),i.prepare(o,a),u.uInvProj.value.copy(o.projectionMatrixInverse),u.uCamRot.value.setFromMatrix4(o.matrixWorld),u.uPx.value=2*Math.tan(o.fov*s/2)/Math.max(1,a.bh),t.render(X,ut),i.drawStars(t,o,a)}const T=[],[Z,tt,ot]=await Promise.all([P(r,"moon-albedo-512.jpg"),P(r,"moon-slope-512.jpg"),P(r,"earth-clouds-1024.jpg")]);T.push(Z,tt,ot),u.uMoonAlb.value=Z,u.uMoonSlope.value=tt,u.uEarthMap.value=ot;let H=!1;const mt=Promise.all([i.ready,P(r,"moon-albedo-2048.jpg"),P(r,"moon-slope-2048.jpg"),P(r,"earth-clouds-2048.jpg")]).then(([,t,o,a])=>{if(H){[t,o,a].forEach(h=>h.dispose());return}T.push(t,o,a),u.uMoonAlb.value=t,u.uMoonSlope.value=o,u.uEarthMap.value=a;for(const h of[t,o,a])n.renderer.initTexture(h)}).catch(t=>console.warn("galaxy deepsky: full-size textures failed",t));function dt(t,o=(n.width||16)/(n.height||9)){return zt(t,o)}const pt={start:l(0).toArray(),mid:l(.5).toArray(),end:l(1).toArray(),moon:p.clone().multiplyScalar(1e3).toArray(),earth:d.clone().multiplyScalar(1e3).toArray(),galacticCentre:I(v).multiplyScalar(1e3).toArray(),sun:M.clone().multiplyScalar(1e3).toArray()};function et(t,o){const a=n.camera,h=a.position.clone().addScaledVector(t,1e3),m=n.toScreen(h),y=t.clone().cross(new g(0,1,0)).normalize(),V=a.position.clone().addScaledVector(t.clone().multiplyScalar(Math.cos(o)).addScaledVector(y,Math.sin(o)).normalize(),1e3),q=n.toScreen(V);return{x:m.x,y:m.y,r:Math.hypot(q.x-m.x,q.y-m.y),behind:m.behind}}const at={get dir(){return p.clone()},angularRadius:A,km:e.moonKm,radiusKm:e.moonR,centre:p.clone().multiplyScalar(1e3),get visible(){return j},screen(){return et(p,A)},size(){return 2*A/((n.camera.fov||e.fov)*s)},elongation:Math.acos(p.dot(M))/s},ft={get dir(){return d.clone()},angularRadius:R,km:e.earthKm,radiusKm:e.earthR,position:d.clone().multiplyScalar(1e3),centre:d.clone().multiplyScalar(1e3),screen(){return et(d,R)},size(){return 2*R/((n.camera.fov||e.fov)*s)},elongation:Math.acos(d.dot(M))/s,date:"2026-09-28 (the clouds of that day: NASA GIBS, VIIRS on NOAA-20 and Suomi NPP)"};return{draw:ht,flight:dt,anchors:pt,ready:mt,light:O,starAt:t=>i.starAt(t),earth:ft,moon:at,sky:i,extend(t){Object.defineProperty(t,"moon",{get:()=>at,enumerable:!0}),t.setMoon=o=>{j=o!==!1,u.uMoonOn.value=j?1:0,W()},t.sky=i,t.setSkyBrightness=o=>i.setBrightness(o),Object.defineProperty(t,"skyBrightness",{get:()=>i.brightness,enumerable:!0}),t.setStarGain=o=>i.setStarGain(o)},setTime(){},setQuality(t){u.uShadow.value=t==="low"?0:1},dispose(){if(!H){H=!0;for(const t of T)t.dispose();Y.dispose(),$.dispose(),i.dispose()}}}}const Lt=`
precision highp float;
precision highp int;
in vec2 vNdc;
out vec4 outColor;
uniform mat4 uInvProj;
uniform mat3 uCamRot, uMoonRot, uEarthRot;
uniform vec3 uSun, uMoonDir, uEarthDir;
uniform float uPx, uMoonSin, uMoonAng, uMoonOn, uEarthSin, uEarthAng, uExposure, uShadow, uRelief;
uniform sampler2D uMoonAlb, uMoonSlope, uEarthMap;
const float PI = 3.14159265;
${xt}
${Et}
// a sphere at distance 1 in direction c with sin(angular radius) s: the unit normal where the ray meets it
// (on a miss, the nearest rim point), and the coverage of this pixel (antialiased limb)
vec3 sphereHit(vec3 rd, vec3 c, float s, float ang, out float cover) {
  float b = dot(rd, c);
  float a = acos(clamp(b, -1.0, 1.0));
  cover = clamp(0.5 + (ang - a) / uPx, 0.0, 1.0);
  float disc = b * b - (1.0 - s * s);
  float t = b - sqrt(max(disc, 0.0));
  vec3 p = rd * t - c;
  vec3 n = p / s;
  if (disc <= 0.0) { vec3 q = rd - c * b; n = normalize(q); }
  return normalize(n);
}
vec2 lonlatUV(vec3 b) {
  float lon = atan(b.y, b.x), lat = asin(clamp(b.z, -1.0, 1.0));
  return vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
}
vec3 moonShade(vec3 rd, vec3 n) {
  vec3 b = uMoonRot * n;
  vec2 uv = lonlatUV(b);
  // a mip level from the pixel's footprint on the map (the seam at lon 180 would spike a derivative)
  float lod = max(0.0, log2(uPx / uMoonSin * float(textureSize(uMoonAlb, 0).x) / (2.0 * PI) * 1.2));
  vec3 alb = fromSRGB(textureLod(uMoonAlb, uv, lod).rgb);
  vec3 sl = textureLod(uMoonSlope, uv, max(0.0, lod - 1.0)).rgb;
  float se = sl.r - 0.5, sn = sl.g - 0.5;
  // the WAC mosaic was shot under an afternoon sun from the west: take most of that baked shading back out
  alb /= max(0.45, 1.0 + 0.62 * se);
  // relief: LOLA's slopes (east, north) on the sphere's own frame, exaggerated a little for the 2.6 km grid
  vec3 up = b;
  vec3 east = normalize(cross(vec3(0.0, 0.0, 1.0), up) + vec3(1e-6, 0.0, 0.0));
  vec3 north = cross(up, east);
  vec3 nb = normalize(up - uRelief * (se * east + sn * north));
  vec3 ns = transpose(uMoonRot) * nb;
  float mu0 = dot(ns, uSun), mu0g = dot(n, uSun), mu = max(dot(n, -rd), 1e-3);
  float m = max(mu0, 0.0);
  // lunar-Lambert (McEwen): the regolith's flat look at full phase, Lambert-like at the terminator
  const float L = 0.35;
  float f = 2.0 * L * m / (m + mu) + (1.0 - L) * m;
  // where the sun stands low, LOLA's heights cast shadows along the ground toward the night (km; the
  // blue channel is the height, 19.9 km over 0..1) and the high ground beyond the terminator still catches
  // the sun: rims and peaks lit in the dark, long shadows behind them
  float day = smoothstep(-0.0046, 0.0046, mu0g);
  if (mu0g > -0.06 && mu0g < 0.3) {
    const float RM = 1737.4, HK = 19.9 * 1.4;
    float h0 = sl.b * HK;
    vec3 sb = uMoonRot * uSun;
    vec3 t = normalize(sb - b * dot(sb, b));
    float se0 = dot(sb, b);                               // sine of the sun's height over the mean surface
    // a point beyond the terminator is lit if it stands above the line of sight to the sun's edge
    float hm = textureLod(uMoonSlope, uv, lod + 3.0).b * HK;
    float need = RM * se0 * se0 * 0.5 * sign(-se0);       // height above the mean ground the grazing ray passes at
    float above = (h0 - hm) - max(need, 0.0);
    float edge = smoothstep(-0.25, 0.25, above);
    float occ = 1.0;
    if (uShadow > 0.5) {
      float d = 0.0;
      for (int i = 0; i < 9; i++) {
        d += 2.6 + float(i) * 3.4;                         // 2.6 .. 150 km toward the sun
        vec3 q = normalize(b + t * (d / RM));
        float hq = textureLod(uMoonSlope, lonlatUV(q), lod).b * HK;
        float ray = h0 + d * se0 - d * d / (2.0 * RM);     // the sun's line, over a curved Moon
        occ *= 1.0 - smoothstep(0.0, 0.35, hq - ray);
      }
    }
    float g = mu0g < 0.0 ? edge * step(0.0, mu0) : day;
    day = g * occ;
  }
  vec3 c = alb * f * day * vec3(1.0, 0.95, 0.88) * 7.5;
  // earthshine: Earth (three quarters lit, 44 degrees from the Moon in our sky) lights the part of the
  // night side that faces it, very faintly: a ghost of the limb toward Earth, the rest of the night black
  float es = max(dot(ns, uEarthDir), 0.0);
  c += alb * es * es * vec3(0.62, 0.74, 1.0) * 0.3 * (1.0 - day);
  return c;
}
vec3 earthShade(vec3 rd, vec3 n) {
  vec3 b = uEarthRot * n;
  vec2 uv = lonlatUV(b);
  float lod = max(0.0, log2(uPx / uEarthSin * float(textureSize(uEarthMap, 0).x) / (2.0 * PI)));
  vec3 alb = fromSRGB(textureLod(uEarthMap, uv, lod).rgb);
  float mu0 = dot(n, uSun), mu = max(dot(n, -rd), 1e-3);
  float m = max(mu0, 0.0);
  // the air: day colours a little blue and soft toward the limb, a thin bright blue edge on the lit side
  float lim = pow(1.0 - mu, 3.0);
  vec3 c = alb * m * 1.05;
  c = mix(c, vec3(0.20, 0.35, 0.80) * (0.15 + 0.85 * smoothstep(-0.1, 0.4, mu0)) * 0.55, lim * 0.55 * smoothstep(-0.12, 0.15, mu0));
  c *= smoothstep(-0.08, 0.02, mu0) * 0.85 + 0.15 * smoothstep(-0.02, 0.1, mu0);
  return c * 2.6;
}
void main() {
  vec4 v4 = uInvProj * vec4(vNdc, 1.0, 1.0);
  vec3 rd = normalize(uCamRot * (v4.xyz / v4.w));
  vec3 bg = skyPhoto(rd);                                  // display-linear
  // Earth (far) then the Moon (near) over the sky, each tone mapped as an exposed object
  float ce;
  vec3 ne = sphereHit(rd, uEarthDir, uEarthSin, uEarthAng, ce);
  if (ce > 0.0) {
    vec3 e = acesFit(earthShade(rd, ne) * uExposure / 0.6);
    bg = mix(bg, e, ce);
  }
  if (uMoonOn > 0.5) {
    float cm;
    vec3 nm = sphereHit(rd, uMoonDir, uMoonSin, uMoonAng, cm);
    if (cm > 0.0) {
      vec3 m = acesFit(moonShade(rd, nm) * uExposure / 0.6);
      bg = mix(bg, m, cm);
    }
  }
  // the lens: a gentle natural fall-off toward the corners (cos^4, a third of it), as a real wide prime shows
  vec3 fwd = normalize(uCamRot * vec3(0.0, 0.0, -1.0));
  float cv = max(dot(rd, fwd), 0.0);
  bg *= mix(1.0, cv * cv * cv * cv, 0.33);
  outColor = vec4(toSRGB(bg) + dither(gl_FragCoord.xy), 1.0);
}
`;export{At as DEEPSKY,Gt as createDeepsky};
