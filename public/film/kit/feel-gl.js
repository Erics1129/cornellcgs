import*as n from"three";const P=`
attribute vec3 aPos;     // world centre
attribute vec4 aSize;    // half width, half height (m), rotation (rad), facing (0 camera, 1 fixed normal)
attribute vec4 aCol;     // linear rgb, alpha
attribute vec4 aShape;   // kind (0 glow, 1 ring, 2 pane, 3 mote), ring radius (0..1 of the half size), ring width, softness
attribute vec3 aNrm;     // the normal for facing = 1
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vShape;
void main() {
  vUv = position.xy;
  vCol = aCol; vShape = aShape;
  float c = cos(aSize.z), s = sin(aSize.z);
  vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * aSize.xy;
  vec4 mv;
  if (aSize.w > 0.5) {
    vec3 n = normalize(aNrm);
    vec3 t = normalize(abs(n.y) > 0.95 ? cross(n, vec3(1.0, 0.0, 0.0)) : cross(vec3(0.0, 1.0, 0.0), n));
    vec3 b = cross(n, t);
    mv = viewMatrix * vec4(aPos + t * q.x + b * q.y, 1.0);
  } else {
    mv = viewMatrix * vec4(aPos, 1.0);
    mv.xy += q;
  }
  gl_Position = projectionMatrix * mv;
}`,X=`
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vShape;
void main() {
  float r = length(vUv);
  float a = 0.0;
  float k = vShape.x;
  if (k < 0.5) {                       // a glow: a soft core and a long faint skirt
    float soft = max(0.05, vShape.w);
    a = exp(-r * r / (soft * soft)) * 0.85 + 0.15 * max(0.0, 1.0 - r) * max(0.0, 1.0 - r);
  } else if (k < 1.5) {                // a ring: a band at radius R, width W, its edges anti-aliased
    float R = vShape.y, W = max(0.002, vShape.z);
    float d = abs(r - R);
    if (vShape.w > 0.0) {              // a soft band (a pressure wave in water): no edge at all
      a = exp(-d * d / (W * W * 0.5)) * 0.8 + 0.2 * exp(-d * d / (W * W * 6.0));
    } else {                           // a crisp band (light in a vacuum, an instrument's line)
      float aa = fwidth(r) * 1.2;
      a = 1.0 - smoothstep(W * 0.5 - aa, W * 0.5 + aa, d);
      a += 0.25 * exp(-d * d / (W * W * 4.0));     // a faint scatter round the band
    }
  } else if (k < 2.5) {                // a pane: a soft rounded rectangle, brighter in the middle
    vec2 d = abs(vUv) - vec2(0.72);
    float e = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    a = (1.0 - smoothstep(-0.1, 0.28, e)) * (0.75 + 0.25 * (1.0 - r));
  } else {                             // a mote: a tiny crisp point
    a = exp(-r * r * 9.0);
  }
  if (r > 1.0) a *= max(0.0, 1.0 - (r - 1.0) * 8.0);
  a *= vCol.a;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vCol.rgb * a, a);
}`;function Y(s,{max:g=64}={}){const a=new n.InstancedBufferGeometry;a.setAttribute("position",new n.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3)),a.setIndex([0,1,2,0,2,3]);const c=t=>{const e=new n.InstancedBufferAttribute(new Float32Array(g*t),t);return e.setUsage(n.DynamicDrawUsage),e},l=c(3),v=c(4),b=c(4),S=c(4),w=c(3);a.setAttribute("aPos",l),a.setAttribute("aSize",v),a.setAttribute("aCol",b),a.setAttribute("aShape",S),a.setAttribute("aNrm",w),a.instanceCount=0,a.boundingSphere=new n.Sphere(new n.Vector3,1e9);const C=new n.ShaderMaterial({vertexShader:P,fragmentShader:X,transparent:!0,depthWrite:!1,depthTest:!0,blending:n.CustomBlending,blendSrc:n.OneFactor,blendDst:n.OneFactor,blendSrcAlpha:n.ZeroFactor,blendDstAlpha:n.OneFactor,toneMapped:!1}),d=new n.Mesh(a,C);d.frustumCulled=!1,d.renderOrder=40,d.visible=!1,s.scene.add(d);const A=t=>{const e=String(t).replace("#",""),r=parseInt(e.length===3?e.split("").map(i=>i+i).join(""):e,16);return[(r>>16&255)/255,(r>>8&255)/255,(r&255)/255]},W=new Map,U=t=>{let e=W.get(t);return e||(e=A(t),W.set(t,e)),e};let o=0,F=0;const x=(t,e,r,i,u,f,h,m,k,M,Z,y)=>{if(o>=g||h<=.002)return;l.setXYZ(o,t.x,t.y,t.z),v.setXYZW(o,e,r,i,u);const z=U(f);b.setXYZW(o,z[0],z[1],z[2],h),S.setXYZW(o,m,k,M,Z),y?w.setXYZ(o,y.x,y.y,y.z):w.setXYZ(o,0,0,1),o++},p={mesh:d,get count(){return F},clear(){return o=0,p},glow(t,{size:e=.2,colour:r="#FFE2B8",alpha:i=1,soft:u=.38}={}){return x(t,e,e,0,0,r,i,0,0,0,u,null),p},ring(t,{radius:e=.2,width:r=.01,colour:i="#FFFFFF",alpha:u=1,normal:f=null,soft:h=!1}={}){const m=e+r*(h?3.5:2.5);return x(t,m,m,0,f?1:0,i,u,1,e/m,r/m,h?1:0,f),p},pane(t,{w:e=1,h:r=1.4,colour:i="#FFE9C4",alpha:u=1,normal:f=null,rot:h=0}={}){return x(t,e,r,h,f?1:0,i,u,2,0,0,0,f),p},mote(t,{size:e=.01,colour:r="#FFFFFF",alpha:i=1}={}){return x(t,e,e,0,0,r,i,3,0,0,0,null),p},commit(){if(a.instanceCount=o,d.visible=o>0,o>0||F>0)for(const t of[l,v,b,S,w])t.needsUpdate=!0;return F=o,p},dispose(){s.scene.remove(d),a.dispose(),C.dispose()}};return p}function B(s,g,a,c,l,v,b=new n.Vector3){const S=new n.Vector3(g/c*2-1,-(a/l)*2+1,.5).unproject(s).sub(s.position).normalize();return b.copy(s.position).addScaledVector(S,v)}function D(s,g,a,c,l,v=new n.Vector3){return v.set(g/c*2-1,-(a/l)*2+1,.5).unproject(s).sub(s.position).normalize()}export{Y as createSprites,B as rayAt,D as rayDir};
