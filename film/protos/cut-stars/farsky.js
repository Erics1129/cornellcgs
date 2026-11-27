import*as e from"three";import{createSky as X,SKY_GLSL as tt}from"../../kit/worlds/galaxy/sky.js";import{DISCS as q,DISC_GROUND as et,drawSeam as at}from"../../kit/seams.js";const v=Math.PI/180,_=`
in vec3 position;
out vec2 vNdc;
void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,ot=`
precision highp float;
precision highp int;
in vec2 vNdc;
out vec4 outColor;
uniform mat4 uInvProj;
uniform mat3 uCamRot;
uniform vec3 uEarthDir;
uniform float uEarthAng, uPxAng, uFade;
${tt}
vec3 toSRGBs(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec4 v4 = uInvProj * vec4(vNdc, 1.0, 1.0);
  vec3 rd = normalize(uCamRot * (v4.xyz / v4.w));
  // outside the Earth's disc only (the solid Earth; its thin air stays orbit's, over the stars as it is in life)
  float ang = acos(clamp(dot(rd, uEarthDir), -1.0, 1.0));
  float m = smoothstep(uEarthAng - uPxAng, uEarthAng + 1.5 * uPxAng, ang);
  vec3 c = skyPhoto(rd) * m * uFade;
  uvec2 fc = uvec2(gl_FragCoord.xy);
  uint h = skyH(fc.x + skyH(fc.y + 557u));
  float d = (float(h & 65535u) / 65535.0 + float(h >> 16u) / 65535.0 - 1.0) / 255.0;
  outColor = vec4(toSRGBs(c) + d * step(0.0005, c.r + c.g + c.b), 1.0);
}
`,rt=`
precision highp float;
in vec2 vNdc;
out vec4 outColor;
uniform sampler2D uMap;
void main() { outColor = texture(uMap, vNdc * 0.5 + 0.5); }
`;async function it(M,V,E,{table:f}={}){const H=M.backdrop,y=(t,a)=>new e.Vector3(Math.cos(a*v)*Math.cos(t*v),Math.cos(a*v)*Math.sin(t*v),Math.sin(a*v)),W=(t,a,o,l)=>{const S=(h,n)=>{const u=h.clone().normalize(),m=h.clone().cross(n).normalize(),p=u.clone().cross(m);return new e.Matrix3().set(u.x,m.x,p.x,u.y,m.y,p.y,u.z,m.z,p.z)};return S(o,l).multiply(S(t,a).transpose())},U=E.starAt(0),Y=E.starAt(1),b=W(y(f[0][0],f[0][1]),y(f[1][0],f[1][1]),U.dir.clone(),Y.dir.clone()),d=await X(M,V,{brightness:1,stars:1.15,knee:.013,crisp:.4,floor:[0,0,0],orientation:b}),K=f.map((t,a)=>({i:a,ra:t[0],dec:t[1],mag:t[2],d:y(t[0],t[1]).applyMatrix3(b).normalize().toArray()})),g=new e.BufferGeometry;g.setAttribute("position",new e.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));const c={...d.uniforms,uInvProj:{value:new e.Matrix4},uCamRot:{value:new e.Matrix3},uEarthDir:{value:new e.Vector3(0,-1,0)},uEarthAng:{value:.5},uPxAng:{value:.001},uFade:{value:1}},R=new e.RawShaderMaterial({glslVersion:e.GLSL3,vertexShader:_,fragmentShader:ot,uniforms:c,depthTest:!1,depthWrite:!1,transparent:!0,blending:e.CustomBlending,blendEquation:e.AddEquation,blendSrc:e.OneFactor,blendDst:e.OneFactor,blendSrcAlpha:e.ZeroFactor,blendDstAlpha:e.OneFactor}),D=new e.Mesh(g,R);D.frustumCulled=!1;const O=new e.Scene;O.add(D);const s=document.createElement("canvas");s.width=s.height=2;const Z=s.getContext("2d"),i=new e.CanvasTexture(s);i.colorSpace=e.NoColorSpace,i.premultiplyAlpha=!0,i.generateMipmaps=!1,i.minFilter=e.LinearFilter,i.magFilter=e.LinearFilter,i.flipY=!0;const G=new e.RawShaderMaterial({glslVersion:e.GLSL3,vertexShader:_,fragmentShader:rt,uniforms:{uMap:{value:i}},depthTest:!1,depthWrite:!1,transparent:!0,blending:e.CustomBlending,blendEquation:e.AddEquation,blendSrc:e.OneFactor,blendDst:e.OneMinusSrcAlphaFactor,blendSrcAlpha:e.OneFactor,blendDstAlpha:e.OneMinusSrcAlphaFactor}),P=new e.Mesh(g,G);P.frustumCulled=!1;const k=new e.Scene;k.add(P);const I=new e.OrthographicCamera(-1,1,1,-1,0,1),r={alt:900,gain:0,starGain:0,blur:0,fade:1,discs:null};let L=!1;function $(t,a,o){H(t,a,o),a.updateMatrixWorld();const l=Math.asin(6371/(6371+r.alt));c.uEarthAng.value=l,c.uPxAng.value=2*Math.tan(a.fov*v/2)/Math.max(1,o.bh),r.gain*r.fade>5e-4&&(d.prepare(a,o),c.uSkyLod.value+=r.blur,c.uSkyGain.value=r.gain,c.uFade.value=r.fade,c.uInvProj.value.copy(a.projectionMatrixInverse),c.uCamRot.value.setFromMatrix4(a.matrixWorld),t.render(O,I)),r.starGain>.002&&(d.setStarGain(r.starGain),d.setOccluders([{dir:c.uEarthDir.value,radius:l+.0015}]),d.drawStars(t,a,o)),L&&((s.width!==o.bw||s.height!==o.bh)&&(s.width=o.bw,s.height=o.bh,i.dispose()),J(Z,o.bw,o.bh,r.discs,o.dpr),i.needsUpdate=!0,t.render(k,I)),t.setRenderTarget(null)}M.setBackdrop($);function J(t,a,o,l,S){if(t.setTransform(1,0,0,1,0,0),t.globalCompositeOperation="source-over",t.globalAlpha=1,t.clearRect(0,0,a,o),l.hold){at(t,a,o,"discs",{k:1,soft:1});return}t.save(),t.globalAlpha=l.ground,t.fillStyle=et,t.fillRect(0,0,a,o),t.globalCompositeOperation="lighter";for(let h=0;h<q.length;h++){const n=q[h],u=l.sources[h],m=h%7*.025,p=Math.max(0,Math.min(1,(l.t-m)/(1-.15))),Q=A(p/.3),F=A((p-.12)/.7),T=A((p-.08)/.8),z=u?u.x*S:n.x*a,N=u?u.y*S:n.y*o,w=z+(n.x*a-z)*T,C=N+(n.y*o-N)*T,B=Math.max(.6,n.r*o*(.08+.92*F)),j=n.a*Q*(F+(1-F)*Math.min(1,9*n.r/.034));if(j<=.002)continue;const x=t.createRadialGradient(w,C,0,w,C,B);x.addColorStop(0,n.c),x.addColorStop(.78,n.c),x.addColorStop(.9,"#FFFFFF"),x.addColorStop(1,"rgba(255,255,255,0)"),t.globalAlpha=Math.min(1,j),t.fillStyle=x,t.beginPath(),t.arc(w,C,B,0,Math.PI*2),t.fill()}t.restore()}const A=t=>{const a=Math.max(0,Math.min(1,t));return a*a*(3-2*a)};return{ready:d.ready,sky:d,eqToStage:b,starList:K,setState(t){Object.assign(r,t),L=!!r.discs},dispose(){g.dispose(),R.dispose(),G.dispose(),i.dispose(),s.width=s.height=0,d.dispose()}}}export{it as createFarSky};
