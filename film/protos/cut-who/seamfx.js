import*as e from"three";import{DISCS as M,DISC_GROUND as V,WHITE as D}from"../../kit/seams.js";const _=i=>{const a=new e.Color(i);return[a.r,a.g,a.b]};function C(i){const a=parseInt(i.slice(1),16);return[(a>>16&255)/255,(a>>8&255)/255,(a&255)/255]}const F=`
attribute vec2 corner;
varying vec2 vQ;
void main() { vQ = corner; gl_Position = vec4(corner, 0.0, 1.0); }`;function I(){const i=new e.Scene,a=new e.OrthographicCamera(-1,1,1,-1,0,1),w={side:e.DoubleSide,blending:e.CustomBlending,blendEquation:e.AddEquation,blendSrcAlpha:e.ZeroFactor,blendDstAlpha:e.OneFactor,depthTest:!1,depthWrite:!1,transparent:!0},o=new e.BufferGeometry;o.setAttribute("corner",new e.Float32BufferAttribute([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1],2)),o.setAttribute("position",new e.Float32BufferAttribute(new Array(18).fill(0),3));const x=new e.ShaderMaterial({vertexShader:F,fragmentShader:"uniform vec3 uC; uniform float uA; void main() { gl_FragColor = vec4(uC, uA); }",uniforms:{uC:{value:new e.Vector3(...C(V))},uA:{value:0}},...w,blendSrc:e.SrcAlphaFactor,blendDst:e.OneMinusSrcAlphaFactor}),c=new e.Mesh(o,x);c.frustumCulled=!1,c.renderOrder=0;const h=M.length,n=new e.InstancedBufferGeometry;n.setAttribute("corner",o.getAttribute("corner")),n.setAttribute("position",o.getAttribute("position"));const l=new e.InstancedBufferAttribute(new Float32Array(h*3),3),v=new e.InstancedBufferAttribute(new Float32Array(h*4),4);l.setUsage(e.DynamicDrawUsage),v.setUsage(e.DynamicDrawUsage),n.setAttribute("aC",l),n.setAttribute("aCol",v),n.instanceCount=h;const y=new e.ShaderMaterial({vertexShader:`
      attribute vec2 corner; attribute vec3 aC; attribute vec4 aCol;
      uniform vec2 uRes;
      varying vec2 vP; varying vec4 vCol; varying float vR;
      void main() {
        float R = aC.z + 1.5;                                   // a pixel of room for the edge
        vec2 px = aC.xy + corner * R;
        vP = corner * R; vR = aC.z; vCol = aCol;
        gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
      }`,fragmentShader:`
      varying vec2 vP; varying vec4 vCol; varying float vR;
      void main() {
        // drawSeam's radial gradient: colour to 0.78, toward white by 0.90, white fading out by 1.0
        float d = length(vP);
        float t = d / max(vR, 1e-3);
        vec3 c = t < 0.78 ? vCol.rgb : mix(vCol.rgb, vec3(1.0), clamp((t - 0.78) / 0.12, 0.0, 1.0));
        float a = t < 0.9 ? 1.0 : clamp(1.0 - (t - 0.9) / 0.1, 0.0, 1.0);
        // coverage at the rim (the canvas antialiases its arc): about one pixel
        a *= clamp(vR - d + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(c * a * vCol.a, 0.0);
      }`,uniforms:{uRes:{value:new e.Vector2(1280,720)}},...w,blendSrc:e.OneFactor,blendDst:e.OneFactor}),s=new e.Mesh(n,y);s.frustumCulled=!1,s.renderOrder=1;const d=new e.ShaderMaterial({vertexShader:F,fragmentShader:`
      uniform vec2 uRes; uniform vec3 uAt; uniform float uA; varying vec2 vQ;
      void main() {
        vec2 px = vec2((vQ.x * 0.5 + 0.5) * uRes.x, (0.5 - vQ.y * 0.5) * uRes.y);
        float r = length(px - uAt.xy) / max(uAt.z, 1.0);
        float g = exp(-r * r * 2.2) * 0.85 + 0.35 / (1.0 + r * r * 9.0);          // a hot core and a long soft skirt
        vec3 c = mix(vec3(1.0, 0.86, 0.62), vec3(1.0, 0.97, 0.9), exp(-r * r * 6.0));
        gl_FragColor = vec4(c * g * uA, 0.0);
      }`,uniforms:{uRes:{value:new e.Vector2(1280,720)},uAt:{value:new e.Vector3(640,360,10)},uA:{value:0}},...w,blendSrc:e.OneFactor,blendDst:e.OneFactor}),f=new e.Mesh(o,d);f.frustumCulled=!1,f.renderOrder=2;const A=new e.ShaderMaterial({vertexShader:F,fragmentShader:`
      uniform vec2 uRes; uniform vec3 uT; uniform vec3 uE; uniform float uA; varying vec2 vQ;
      void main() {
        vec2 px = vec2((vQ.x * 0.5 + 0.5) * uRes.x, (0.5 - vQ.y * 0.5) * uRes.y);
        float r = length(px - vec2(0.5 * uRes.x, 0.46 * uRes.y)) / (length(uRes) * 0.62);
        gl_FragColor = vec4(mix(uT, uE, clamp(r, 0.0, 1.0)), uA);
      }`,uniforms:{uRes:{value:new e.Vector2(1280,720)},uT:{value:new e.Vector3(...C(D.tone))},uE:{value:new e.Vector3(...C(D.edge))},uA:{value:0}},...w,blendSrc:e.SrcAlphaFactor,blendDst:e.OneMinusSrcAlphaFactor}),g=new e.Mesh(o,A);g.frustumCulled=!1,g.renderOrder=3,i.add(c,s,f,g);const r={ground:0,discsOn:!1,glow:0,white:0};return{set(t,R,O){if(x.uniforms.uA.value=t.ground||0,r.ground=t.ground||0,r.discsOn=!!(t.discs&&t.k>0),r.discsOn){const m=t.soft,Q=t.k;for(let u=0;u<h;u++){const b=M[u],p=t.discs[u],E=Math.max(.6,b.r*O*(.08+.92*m)),U=Math.min(1,b.a*Q*(m+(1-m)*Math.min(1,9*b.r/.034)));l.setXYZ(u,p.x,p.y,p.hidden?0:E);const S=C(b.c);v.setXYZW(u,S[0],S[1],S[2],p.hidden?0:U)}l.needsUpdate=!0,v.needsUpdate=!0}r.glow=t.glow?t.glow.a:0,t.glow&&(d.uniforms.uAt.value.set(t.glow.x,t.glow.y,t.glow.r),d.uniforms.uA.value=t.glow.a),r.white=t.white||0,A.uniforms.uA.value=r.white;for(const m of[y,d,A])m.uniforms.uRes.value.set(R,O)},meshes:{ground:c,discs:s,glow:f,white:g,scene:i,cam:a},debug:()=>({state:r,n:n.instanceCount,aC:Array.from(l.array.slice(0,9)),aCol:Array.from(v.array.slice(0,8)),vis:s.visible}),get active(){return r.ground>0||r.discsOn||r.glow>0||r.white>0},draw(t){c.visible=r.ground>0,s.visible=r.discsOn,f.visible=r.glow>0,g.visible=r.white>0;const R=t.autoClear;t.autoClear=!1,t.setRenderTarget(null),t.render(i,a),t.autoClear=R},dispose(){o.dispose(),n.dispose();for(const t of[x,y,d,A])t.dispose()}}}export{I as createSeamFx};
