import{clamp as b}from"../../kit/ease.js";const v={label:"AlphaGo",title:"Watch the stones land.",body:["DeepMind’s AlphaGo beat Lee Sedol in 2016, and it got that strong partly by playing against itself.","We train our card game AIs the same way."]},S=`
.ag-inst{position:absolute;left:5.6%;top:20.5%;width:33%;z-index:4;pointer-events:none;padding-left:.95em}
.ag-inst .ag-pool{position:absolute;left:-20%;top:-26%;width:150%;height:160%;z-index:-1;pointer-events:none;border-radius:50%;opacity:0;background:radial-gradient(closest-side,rgb(14 26 52 / .5),rgb(14 26 52 / .24) 55%,rgb(14 26 52 / 0))}
.ag-inst .ag-v{position:absolute;left:0;top:.2em;bottom:.25em;width:1px;background:currentColor;opacity:.5;transform-origin:50% 0}
.ag-inst .ag-h{height:1px;background:currentColor;opacity:.42;margin:.85em 0 .75em;transform-origin:0 50%}
.ag-inst .cgs-label{display:block;margin:0 0 .5em;color:inherit;opacity:.78}
.ag-inst .cgs-title,.ag-inst .cgs-body,.ag-read b{color:inherit;text-shadow:inherit}
.ag-inst .cgs-title{font-size:1.45em;line-height:1.15;margin:0;font-weight:540;max-width:14em}
.ag-inst .cgs-body{margin:.7em 0 0;max-width:24em;font-size:.94em;line-height:1.45}
.ag-read{display:grid;grid-template-columns:auto auto auto;justify-content:start;margin:0}
.ag-read > div{padding:0 1.0em;border-left:1px solid currentColor;border-left-color:color-mix(in srgb, currentColor 30%, transparent)}
.ag-read > div:first-child{padding-left:0;border-left:0}
.ag-read b{display:block;font:600 .72em/1.25 var(--cgs-sans, Figtree, system-ui, sans-serif);letter-spacing:.07em;text-transform:uppercase;white-space:nowrap;font-variant-numeric:tabular-nums}
.ag-read i{font-style:normal;display:inline-block;min-width:1.1em;text-align:right}
`,M=l=>(l=b(l),1-Math.pow(1-l,3)*(1+3*l));function z(l,x){const w=document.createElement("style");w.textContent=S,l.append(w);const e=document.createElement("div");e.className="ag-inst",e.innerHTML=`
    <div class="ag-pool"></div>
    <div class="ag-v"></div>
    <span class="cgs-label">${v.label}</span>
    <p class="cgs-title">${v.title}</p>
    <div class="ag-h"></div>
    <div class="ag-read" aria-live="off"><div><b>Black <i>0</i></b></div><div><b>White <i>0</i></b></div><div><b>9 × 9</b></div></div>
    <p class="cgs-body ag-b1">${v.body[0]}</p>
    <p class="cgs-body ag-b2">${v.body[1]}</p>`,l.append(e);const r=t=>e.querySelector(t),a={v:r(".ag-v"),h:r(".ag-h"),label:r(".cgs-label"),title:r(".cgs-title"),read:r(".ag-read"),b1:r(".ag-b1"),b2:r(".ag-b2"),pool:r(".ag-pool")},C=[...e.querySelectorAll(".ag-read > div")],F=[...e.querySelectorAll(".ag-read i")];function y(t,g,h,{dx:o=1.1,blur:d=.22}={}){const c=x.reduced?1:b(g),s=x.reduced?0:b(h);if(c>=1&&s<=0){t.style.transform="",t.style.opacity="",t.style.filter="";return}const i=M(c),p=(1-i)*o-s*s*o*.8,f=b(c*1.6-.1)*(1-s),n=(1-i)*d+s*d*.8;t.style.transform=Math.abs(p)>1e-4?`translate3d(${p.toFixed(4)}em,0,0)`:"",t.style.opacity=f.toFixed(3),t.style.filter=n>.002?`blur(${n.toFixed(3)}em)`:""}return{el:e,draw(t,{counts:g,dips:h=[0,0],out:o=0,dark:d=0,pool:c=0}){this.tone(d);const s=x.reduced,i=(m,u)=>s?1:b((t-m)/(u-m)),p=i(.295,.335),f=i(.325,.36);a.v.style.transform=p<1?`scaleY(${p.toFixed(4)})`:"",a.h.style.transform=f<1?`scaleX(${f.toFixed(4)})`:"",a.v.style.opacity=s?"":(.5*Math.min(1,p*3)*(1-o)).toFixed(3),a.h.style.opacity=s?"":(.42*Math.min(1,f*3)*(1-o)).toFixed(3);const n=m=>b((o-m)/.55);y(a.label,i(.3,.345),n(0)),y(a.title,i(.31,.375),n(.08),{dx:1.4}),y(a.read,i(.345,.4),n(.16)),y(a.b1,i(.43,.5),n(.24)),y(a.b2,i(.6,.665),n(.32)),a.pool.style.opacity=(c*(1-o)).toFixed(3),F[0].textContent=String(g.black),F[1].textContent=String(g.white),C.forEach((m,u)=>{const $=u<2?h[u]:0;m.style.translate=$>.001?`0 ${($*.28).toFixed(3)}em`:""})},tone(t){const g=[33,31,28],h=[251,248,241],o=g.map((d,c)=>Math.round(d+(h[c]-d)*t));e.style.color=`rgb(${o.join(",")})`,e.style.setProperty("--ag-sh",t.toFixed(3)),e.style.textShadow=t>.01?`0 0.03em 0.06em rgb(40 26 18 / ${(.55*t).toFixed(3)}), 0 0 0.42em rgb(40 26 18 / ${(.3*t).toFixed(3)})`:"none"},destroy(){e.remove(),w.remove()}}}export{v as COPY,z as createWords};
