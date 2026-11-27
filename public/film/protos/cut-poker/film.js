import*as e from"three";import{createFilmWorld as R}from"../../kit/worlds/filmlook.js";import{LEDS as T}from"./hallmap.js";const k=.0255,G=!1;async function I(o,l,{onChange:c,timeout:f=12e3}={}){try{if(l.film===!1||typeof location<"u"&&/[?&]film=0\b/.test(location.search)||!G&&!(typeof location<"u"&&/[?&]film=1\b/.test(location.search)))return null;const u=document.createElement("video");if(!(u.canPlayType&&(u.canPlayType('video/mp4; codecs="avc1.640028"')||u.canPlayType('video/mp4; codecs="avc1.4d401f"')||u.canPlayType('video/mp4; codecs="avc1.42e01e"'))))return null;const y=await l.asset("../../films/take-poker/track.json");if(!(await fetch(y)).ok)return null;const h=await Promise.race([R(o,l,{film:"take-poker",onChange:c,lens:!1,occlude:!0,live:!1}),new Promise((m,s)=>setTimeout(()=>s(new Error("film: took too long")),f))]);return h&&h.kind==="film"?h:null}catch(u){return console.warn("[cut-poker] the film cannot play here; the live hall plays instead",u),null}}function C(o){return o.shadows.object.parent}function j(o,l){const c=l.quad();return c.renderOrder=1e3,C(o).add(c),{dispose(){C(o).remove(c)}}}function B(o,{x:l=[-.9,.9],z:c=[-29.4,3.6],gain:f=1,max:u=.55,holdouts:g=[]}={}){const y=new e.Scene,d=new e.ShaderMaterial({vertexShader:"void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",fragmentShader:"void main() { gl_FragColor = vec4(0.0); }",depthTest:!1,depthWrite:!1,blending:e.CustomBlending,blendSrc:e.ZeroFactor,blendDst:e.ZeroFactor,blendSrcAlpha:e.ZeroFactor,blendDstAlpha:e.ZeroFactor}),h=[];for(const r of g){const v=new e.BoxGeometry(r.size[0],r.size[1],r.size[2]);h.push(v);const a=new e.Mesh(v,d);a.position.set(r.p[0],r.p[1],r.p[2]),a.rotation.y=r.yaw||0,a.frustumCulled=!1,y.add(a)}const m=new e.WebGLRenderTarget(16,16,{type:e.HalfFloatType,generateMipmaps:!0,minFilter:e.LinearMipmapLinearFilter,magFilter:e.LinearFilter}),s=new e.ShaderMaterial({glslVersion:e.GLSL3,uniforms:{uMirror:{value:m.texture},uRes:{value:new e.Vector2(1,1)},uX:{value:new e.Vector2(...l)},uZ:{value:new e.Vector2(...c)},uInvProj:{value:new e.Matrix4},uCamWorld:{value:new e.Matrix4},uGain:{value:f},uMax:{value:u},uOn:{value:0},uK:{value:1}},vertexShader:"out vec2 vNdc; void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }",fragmentShader:`
      precision highp float;
      in vec2 vNdc; out vec4 outColor;
      uniform sampler2D uMirror; uniform vec2 uRes, uX, uZ;
      uniform mat4 uInvProj, uCamWorld; uniform float uGain, uMax, uOn, uK;
      void main() {
        if (uOn < 0.5) discard;
        vec4 vp = uInvProj * vec4(vNdc, 1.0, 1.0); vp /= vp.w;
        vec3 ro = (uCamWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 rd = normalize((uCamWorld * vec4(vp.xyz, 0.0)).xyz);
        if (rd.y > -1e-4 || ro.y <= 0.0) discard;
        vec3 hit = ro + rd * (-ro.y / rd.y);
        float m = min(min(hit.x - uX.x, uX.y - hit.x), min(hit.z - uZ.x, uZ.y - hit.z));
        if (m < 0.0) discard;
        // the polish breaks a hair at each tile's seam (0.6 m tiles on the racks' lines): a reflection, not a picture
        vec2 tile = abs(fract((hit.xz + vec2(0.3, 0.3)) / 0.6) - 0.5);
        float seam = smoothstep(0.497, 0.4995, max(tile.x, tile.y));
        vec4 mr = texture(uMirror, gl_FragCoord.xy / uRes);
        if (mr.a < 0.003) discard;
        float F = 0.04 + 0.96 * pow(1.0 - clamp(-rd.y, 0.0, 1.0), 5.0);
        float w = mr.a * clamp(F * 2.2 + 0.06, 0.0, uMax) * smoothstep(0.0, 0.03, m) * (1.0 - 0.6 * seam) * uK;
        vec3 col = mr.rgb / max(mr.a, 1e-3) * uGain;
        outColor = linearToOutputTexel(vec4(col, w));
      }`,transparent:!0,depthTest:!1,depthWrite:!1,blending:e.NormalBlending}),w=new e.PlaneGeometry(2,2),M=new e.Mesh(w,s);M.frustumCulled=!1,M.renderOrder=-20,C(o).add(M);const t={dir:new e.Vector3,key:new e.Color,shade:new e.Color,bounce:new e.Color,bamt:0},n=new e.Vector2,x=new e.Color;return{set strength(r){s.uniforms.uK.value=Math.max(0,Math.min(1,r))},update(){const r=o.renderer,v=o.scene,a=o.camera;let p=!1;if(s.uniforms.uK.value>.002&&v.traverse(S=>{S.isMesh&&S.visible&&(p=!0)}),s.uniforms.uOn.value=p?1:0,!p)return;r.getDrawingBufferSize(n);const F=Math.max(16,Math.round(n.x/2)),b=Math.max(16,Math.round(n.y/2));(m.width!==F||m.height!==b)&&m.setSize(F,b),s.uniforms.uRes.value.set(n.x,n.y),a.updateMatrixWorld(),a.updateProjectionMatrix(),s.uniforms.uInvProj.value.copy(a.projectionMatrixInverse),s.uniforms.uCamWorld.value.copy(a.matrixWorld);const i=o.light;t.dir.copy(i.uKeyDir.value),t.key.copy(i.uKeyTint.value),t.shade.copy(i.uShadeTint.value),t.bounce.copy(i.uBounce.value),t.bamt=i.uBounceAmt.value,i.uKeyDir.value.set(.05,1,-.1).normalize(),i.uKeyTint.value.copy(t.key).multiplyScalar(.55),i.uShadeTint.value.copy(t.shade).multiplyScalar(.6);const L=r.getRenderTarget(),z=r.autoClear,A=r.toneMapping;r.getClearColor(x);const P=r.getClearAlpha();r.toneMapping=e.NoToneMapping,v.scale.y=-1,v.updateMatrixWorld(!0),r.setRenderTarget(m),r.setClearColor(0,0),r.clear(!0,!0,!0),r.render(v,a),v.scale.y=1,v.updateMatrixWorld(!0),y.children.length&&(r.autoClear=!1,r.render(y,a)),i.uKeyDir.value.copy(t.dir),i.uKeyTint.value.copy(t.key),i.uShadeTint.value.copy(t.shade),i.uBounce.value.copy(t.bounce),i.uBounceAmt.value=t.bamt,r.setRenderTarget(L),r.setClearColor(x,P),r.autoClear=z,r.toneMapping=A},dispose(){C(o).remove(M),w.dispose(),s.dispose(),m.dispose(),d.dispose();for(const r of h)r.dispose()}}}function K(o){const l=T.length,c=new e.PlaneGeometry(2,2),f=new e.InstancedBufferAttribute(new Float32Array(l*4),4);c.setAttribute("aLed",f);const u=t=>new e.Color(t).convertSRGBToLinear(),g={uCols:{value:[u("#46FF86"),u("#FFA43A"),u("#4EA6FF")]},uRes:{value:new e.Vector2(1280,720)},uGain:{value:1}},y=new e.ShaderMaterial({uniforms:g,transparent:!0,depthWrite:!1,blending:e.AdditiveBlending,vertexShader:`attribute vec4 aLed; uniform vec2 uRes; varying vec4 vL; varying vec2 vQ; varying float vCore; varying float vFace;
      void main() {
        vL = aLed;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xyz -= normalize(mv.xyz) * 0.01;
        vec3 nrm = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0));
        vFace = abs(dot(nrm, normalize(mv.xyz)));
        vec4 clip = projectionMatrix * mv;
        float pxm = projectionMatrix[1][1] * uRes.y * 0.5 / max(-mv.z, 0.02);
        vCore = 0.0028 * pxm;
        float rpx = max(vCore * 5.0, 4.5);
        vQ = position.xy * rpx;
        clip.xy += position.xy * rpx * 2.0 / uRes * clip.w;
        gl_Position = aLed.x > 0.002 ? clip : vec4(2.0, 2.0, 2.0, 1.0);
      }`,fragmentShader:`uniform vec3 uCols[3]; uniform float uGain; varying vec4 vL; varying vec2 vQ; varying float vCore; varying float vFace;
      void main() {
        float r = length(vQ);
        float sig = max(vCore * 0.75, 0.6);
        float core = exp(-r * r / (2.0 * sig * sig));
        float halo = exp(-r / max(vCore * 1.6, 1.3)) * 0.09;
        float energy = clamp(vCore / 1.1, 0.3, 1.0) * mix(0.35, 1.0, smoothstep(0.05, 0.5, vFace));
        gl_FragColor = vec4(uCols[int(vL.y + 0.5)] * (vL.x * 9.0 * uGain) * (core + halo) * energy, 1.0);
      }`}),d=new e.InstancedMesh(c,y,l),h=new e.Matrix4,m=new e.Quaternion,s=new e.Vector3,w=new e.Vector3(1,1,1),M=new e.Vector3(0,1,0);for(let t=0;t<l;t++){const n=T[t],x=n.p[0]<0?-1:1;m.setFromAxisAngle(M,x<0?Math.PI/2:-Math.PI/2),d.setMatrixAt(t,h.compose(s.set(n.p[0]-x*k,n.p[1],n.p[2]),m,w)),f.setXYZW(t,0,n.colour,0,0)}return d.frustumCulled=!1,d.renderOrder=4,d.instanceMatrix.needsUpdate=!0,o.scene.add(d),{mesh:d,set(t,n,x,r,v,a){for(let p=0;p<l;p++)f.setX(p,Math.max(0,t[p]-n(p)));f.needsUpdate=!0,g.uGain.value=x,g.uRes.value.set(Math.round(r*a),Math.round(v*a))},dispose(){o.scene.remove(d),c.dispose(),y.dispose()}}}export{k as FILM_DOOR_IN,B as createFloorMirror,K as createLedLayer,C as groundScene,j as seamOnGround,I as tryFilm};
