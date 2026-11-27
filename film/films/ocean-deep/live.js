import*as e from"three";function C(s,h,v){return P(s,h,v,{count:520,size:5,radius:[.0012,.0036],drift:.035,seed:23})}function P(s,h,v,{count:u=700,size:g=6,radius:m=[.0012,.0034],drift:p=.05,seed:A=7}={}){let w=A>>>0;const o=()=>(w=w*1664525+1013904223>>>0)/4294967296,x=new Float32Array(u*4),b=new Float32Array(u*4),M=new Float32Array(u*3);for(let t=0;t<u;t++){x.set([o(),o(),o(),o()],t*4);const a=o()*Math.PI*2;b.set([.03+Math.cos(a)*p*(.2+.4*o()),-.008-.012*o(),.012+Math.sin(a)*p*(.2+.4*o()),m[0]+(m[1]-m[0])*o()**2],t*4)}const r=new e.BufferGeometry;r.setAttribute("position",new e.BufferAttribute(M,3)),r.setAttribute("aSeed",new e.BufferAttribute(x,4)),r.setAttribute("aMove",new e.BufferAttribute(b,4)),r.boundingSphere=new e.Sphere(new e.Vector3,1e9);const i=new e.ShaderMaterial({uniforms:{uTime:{value:0},uL:{value:g},uRes:s.light.uResolution,uSun:{value:new e.Vector3(0,1,0)},uSunCol:{value:new e.Color(1,1,1)},uAmb:{value:new e.Color(.4,.42,.48)}},vertexShader:`
      attribute vec4 aSeed; attribute vec4 aMove;
      uniform float uTime, uL; uniform vec2 uRes; uniform vec3 uSun;
      varying float vA; varying float vPhase; varying float vSoft;
      void main() {
        float ph = aSeed.w * 6.2832;
        vec3 q = aSeed.xyz * uL + aMove.xyz * uTime + 0.025 * vec3(sin(uTime * 0.61 + ph), sin(uTime * 0.47 + ph * 1.7), cos(uTime * 0.53 + ph * 2.3));
        // the cube that wraps is centred a little ahead of the lens, so it fills what the lens sees
        vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
        vec3 centre = cameraPosition + fwd * (0.42 * uL);
        vec3 rel = mod(q - centre + 0.5 * uL, uL) - 0.5 * uL;
        vec3 wp = centre + rel;
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        float d = max(1e-3, -mv.z);
        float px = 2.0 * aMove.w / d * projectionMatrix[1][1] * 0.5 * uRes.y;
        float edge = 1.0 - smoothstep(0.3, 0.48, max(abs(rel.x), max(abs(rel.y), abs(rel.z))) / uL);
        vA = edge * smoothstep(0.12, 0.45, d) * min(1.0, px * px / 2.25);   // a sub-pixel mote fades by its area
        vSoft = clamp((px - 2.0) / 10.0, 0.0, 1.0);
        vPhase = 0.7 + 1.6 * pow(max(dot(normalize(wp - cameraPosition), uSun), 0.0), 5.0);
        gl_PointSize = max(1.5, px) + 1.0;
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      uniform vec3 uSunCol, uAmb;
      varying float vA; varying float vPhase; varying float vSoft;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float disc = 1.0 - smoothstep(mix(0.45, 0.05, vSoft), 1.0, r);
        vec3 c = (uSunCol * vPhase * 0.55 + uAmb * 0.5) * vec3(0.75, 0.88, 1.0);
        float a = vA * disc * mix(0.6, 0.22, vSoft);
        if (a < 0.002) discard;
        gl_FragColor = vec4(c * a, a);
      }`,transparent:!0,depthWrite:!1,depthTest:!0,blending:e.CustomBlending,blendSrc:e.OneFactor,blendDst:e.OneMinusSrcAlphaFactor}),c=new e.Points(r,i);c.frustumCulled=!1,c.renderOrder=3;const y=s.add({object:c,dispose(){}});function S(){const t=v.light;i.uniforms.uSun.value.fromArray(t.dir).normalize();const a=t.color,l=Math.max(a[0],a[1],a[2],.001),f=Math.min(1,l);i.uniforms.uSunCol.value.setRGB(a[0]/l*f,a[1]/l*f,a[2]/l*f);const n=t.ambient,d=Math.max(n[0],n[1],n[2],.001);i.uniforms.uAmb.value.setRGB(n[0]/d,n[1]/d,n[2]/d)}return S(),{setTime(t){i.uniforms.uTime.value=t},setFrame(){S()},dispose(){s.remove(y),r.dispose(),i.dispose()}}}export{C as createLive};
