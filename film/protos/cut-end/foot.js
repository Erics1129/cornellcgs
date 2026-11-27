import{clamp as W,smoothstep as g,beat as w}from"../../kit/ease.js";import{NAME as ie,FULL as re,EYEBROW as le,LINKS as pe,INBOXES as me,CREDIT as de,COPY as ge,FLY as fe,CREDITS as ue,LABELS as S,GAUGE as v,esc as s}from"./words.js";const be=`
.ce-foot{position:absolute;left:6.25%;right:6.25%;top:64.5%;bottom:0;box-sizing:border-box;color:var(--cgs-plane);pointer-events:none;font-variant-numeric:lining-nums;
  --ce-warm:0;--ce-fg:color-mix(in srgb,#FFE6BF calc(var(--ce-warm)*42%),var(--cgs-plane));--ce-soft:color-mix(in srgb,#F0D3A6 calc(var(--ce-warm)*45%),rgb(251 248 241 / .66))}
.ce-foot a,.ce-foot button{pointer-events:auto}
.ce-foot p{margin:0}
.ce-scale{position:absolute;left:0;right:0;top:0;height:1px}
.ce-scale .ce-base{position:absolute;left:0;right:0;top:0;height:1px;background:currentColor;opacity:.46;transform-origin:0 50%}
.ce-scale .ce-tick{position:absolute;top:0;width:1px;height:.62em;margin-left:-.5px;background:currentColor;opacity:.46;transform-origin:50% 0}
.ce-scale .ce-front{position:absolute;top:0;left:0;width:.42em;height:.42em;margin:-.21em 0 0 -.21em;border-radius:50%;background:#F4E2BE;
  box-shadow:0 0 .5em .12em rgb(230 168 106 / .45);opacity:0;will-change:transform,opacity}
.ce-head{position:absolute;left:0;right:0;bottom:calc(100% + .62em);display:flex;align-items:flex-end;justify-content:space-between;gap:2em}
.ce-brand{display:flex;align-items:baseline;gap:.85em;min-width:0;color:var(--ce-fg)}
.ce-name{font-family:var(--cgs-serif);font-weight:540;font-size:1.12em;line-height:1;letter-spacing:-.006em;font-variation-settings:"opsz" 30;white-space:nowrap}
.ce-eyebrow{font:620 max(.62em,8.5px)/1.1 var(--cgs-sans);letter-spacing:.11em;text-transform:uppercase;color:var(--ce-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ce-fly{flex:none;position:relative}
.ce-fly.cgs-btn{font-size:.86em;padding:.62em 1.15em .62em 1.25em}
.ce-cols{position:absolute;left:0;right:0;top:.95em;display:grid;grid-template-columns:31% 1fr;column-gap:4%}
.ce-col{min-width:0}
.ce-col > .cgs-label{display:block;margin:0 0 .72em;color:var(--ce-soft);font-size:max(.6em,8.5px);letter-spacing:.13em}
.ce-pages{display:grid;grid-template-columns:repeat(3,auto);grid-auto-flow:column;grid-template-rows:repeat(4,auto);column-gap:1.55em;row-gap:.16em;justify-content:start;justify-items:start;font-size:max(.76em,9.5px)}
.ce-pages .cgs-link{line-height:1.28;padding:.05em 0;color:var(--ce-fg);white-space:nowrap;--cgs-line-strong:rgb(251 248 241 / .28)}
.ce-mail{display:grid;grid-template-columns:repeat(2,auto);grid-auto-flow:column;grid-template-rows:repeat(3,auto);column-gap:2.6em;row-gap:.52em;justify-content:start}
.ce-ib{display:grid;grid-template-columns:auto auto;grid-template-rows:auto auto;column-gap:.7em;row-gap:.2em;align-items:center;justify-content:start}
.ce-ib .cgs-label{grid-column:1 / 3}
.ce-ib .cgs-label{font-size:max(.54em,8.5px);letter-spacing:.13em;color:var(--ce-soft);white-space:nowrap}
.ce-ad{font-size:max(.74em,9px);font-weight:500;color:var(--ce-fg);text-decoration:none;white-space:nowrap;border-radius:.2em;outline:none;
  background-image:linear-gradient(currentColor,currentColor);background-repeat:no-repeat;background-size:0% max(1px,.07em);background-position:0 100%;transition:background-size .22s var(--cgs-calm)}
.ce-ad:hover,.ce-ad:focus-visible{background-size:100% max(1px,.07em)}
.ce-ad:focus-visible{outline:max(2px,.1em) solid var(--cgs-plane);outline-offset:.25em}
.ce-copy{all:unset;box-sizing:border-box;position:relative;display:inline-flex;align-items:center;justify-content:center;gap:.35em;min-width:4.4em;height:1.55em;padding:0 .62em;border-radius:99em;cursor:pointer;
  font:640 max(.5em,8.5px)/1 var(--cgs-sans);letter-spacing:.13em;text-transform:uppercase;color:var(--ce-fg);box-shadow:inset 0 0 0 1px rgb(251 248 241 / .34);
  transition:box-shadow .18s,background-color .18s,color .18s,translate .12s}
.ce-copy::after{content:"";position:absolute;left:-.3em;right:-.3em;top:50%;height:max(100%,44px);translate:0 -50%}
.ce-copy:hover{box-shadow:inset 0 0 0 1px rgb(251 248 241 / .8);background:rgb(251 248 241 / .07)}
.ce-copy:active{translate:0 .05em;background:rgb(251 248 241 / .13)}
.ce-copy:focus-visible{outline:max(2px,.1em) solid var(--cgs-plane);outline-offset:.2em}
.ce-copy[data-done]{color:#F4E2BE;box-shadow:inset 0 0 0 1px rgb(244 226 190 / .7)}
.ce-copy svg{width:1.05em;height:1.05em;display:none}
.ce-copy[data-done] svg{display:block}
.ce-base{position:absolute;left:0;right:0;bottom:3.2%;display:flex;flex-direction:column;gap:.34em}
.ce-line{display:flex;gap:1.7em;font-size:max(.64em,9px);color:var(--ce-soft);white-space:nowrap}
.ce-credits{font-size:max(.5em,8.5px);line-height:1.45;color:rgb(251 248 241 / .5);letter-spacing:.006em;text-wrap:pretty;border-radius:.2em;outline:none;pointer-events:auto}
.ce-credits b{font-weight:640;color:rgb(251 248 241 / .7)}
.ce-credits:focus-visible{outline:max(2px,.1em) solid var(--cgs-plane);outline-offset:.2em}
.ce-gauge{position:absolute;left:6.25%;top:7.5%;padding-left:.8em;color:var(--cgs-plane);pointer-events:none}
.ce-gauge .ce-spine{position:absolute;left:0;top:.15em;bottom:.1em;width:1px;background:currentColor;opacity:.46;transform-origin:50% 0}
.ce-gauge .cgs-label{display:block;color:rgb(251 248 241 / .66);font-size:max(.58em,8.5px);letter-spacing:.13em;margin-bottom:.38em}
.ce-gauge .ce-read{display:flex;align-items:baseline;gap:.4em;font:560 1.34em/1 var(--cgs-sans);font-variant-numeric:tabular-nums lining-nums;letter-spacing:-.01em}
.ce-gauge .ce-unit{font:620 max(.46em,8.5px)/1 var(--cgs-sans);letter-spacing:.13em;text-transform:uppercase;color:rgb(251 248 241 / .66)}
.ce-foot:not(.ce-live) .ce-copy,.ce-foot:not(.ce-live) .ce-ad{transition:none}
.ce-foot.narrow{top:60.5%}
.ce-foot.narrow .ce-eyebrow{display:none}
.ce-foot.narrow .ce-cols{grid-template-columns:1fr;row-gap:.55em;top:.7em}
.ce-foot.narrow .ce-pages{grid-template-columns:repeat(6,auto);grid-template-rows:repeat(2,auto);grid-auto-flow:row;column-gap:1.1em}
.ce-foot.narrow .ce-col > .cgs-label{margin-bottom:.4em}
.ce-foot.narrow .ce-mail{grid-template-columns:repeat(3,auto);grid-auto-flow:row;grid-template-rows:auto auto;column-gap:1.4em;row-gap:.3em}
.ce-foot.narrow .ce-ib .cgs-label{display:none}
.ce-foot.narrow .ce-copy{height:1.5em;min-width:0;margin:0;padding:0 .55em}
.ce-foot.narrow .ce-credits{white-space:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,#000 88%,transparent);mask-image:linear-gradient(90deg,#000 88%,transparent)}
.ce-foot.narrow .ce-credits::-webkit-scrollbar{display:none}
`,ye='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8.4l3 3 6.6-7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';function we(T,L,{onFly:M}={}){const z=document.createElement("style");z.textContent=be;const c=document.createElement("footer");c.className="ce-foot cgs-photo";const X=pe.map(([e,t])=>`<a class="cgs-link" href="${s(t)}">${s(e)}</a>`).join(""),J=me.map(([e,t])=>`<div class="ce-ib"><span class="cgs-label">${s(e)}</span><a class="ce-ad" href="mailto:${s(t)}">${s(t)}</a><button type="button" class="ce-copy" data-copy="${s(t)}" aria-label="Copy ${s(t)}">${ye}<span>Copy</span></button></div>`).join(""),Q=ue.map(([e,t])=>`<span><b>${s(e)}:</b> ${s(t)}</span>`).join(" ");c.innerHTML=`
    <div class="ce-head">
      <p class="ce-brand"><span class="ce-name">${s(re)}</span><span class="ce-eyebrow">${s(le)}</span></p>
      <button type="button" class="cgs-btn cgs-btn-secondary ce-fly">${s(fe)} <span class="cgs-arrow" aria-hidden="true">→</span></button>
    </div>
    <div class="ce-scale" aria-hidden="true"><i class="ce-base"></i><i class="ce-tick"></i><i class="ce-tick"></i><i class="ce-tick"></i><i class="ce-front"></i></div>
    <div class="ce-cols">
      <nav class="ce-col" aria-label="${s(ie)} pages"><span class="cgs-label">${s(S.site)}</span><div class="ce-pages">${X}</div></nav>
      <div class="ce-col" aria-label="${s(S.write)}"><span class="cgs-label">${s(S.write)}</span><div class="ce-mail">${J}</div></div>
    </div>
    <div class="ce-base">
      <p class="ce-line"><span>${s(de)}</span><span>${s(ge)}</span></p>
      <p class="ce-credits" tabindex="0" aria-label="${s(S.credits)}">${Q}</p>
    </div>`;const p=document.createElement("div");p.className="ce-gauge cgs-photo",p.innerHTML=`<i class="ce-spine"></i><span class="cgs-label">${s(v.label)}</span><span class="ce-read"><span class="ce-num">0</span><span class="ce-unit">${s(v.unit)}</span></span><span class="cgs-sr ce-sr"></span>`,T.append(z,c,p);const f=e=>c.querySelector(e),V=f(".ce-base"),D=[...c.querySelectorAll(".ce-tick")],N=f(".ce-front"),Z=f(".ce-head"),P=f(".ce-brand"),b=f(".ce-fly"),k=[...c.querySelectorAll(".ce-col")],_=k.map(e=>e.querySelector(".cgs-label")),R=[...c.querySelectorAll(".ce-pages .cgs-link")],Y=[...c.querySelectorAll(".ce-ib")].map(e=>[...e.children]),ee=f(".ce-line"),te=f(".ce-credits"),I=p.querySelector(".ce-num"),oe=p.querySelector(".ce-unit"),ae=p.querySelector(".ce-sr"),se=p.querySelector(".ce-spine");for(const e of c.querySelectorAll("a.cgs-link, a.ce-ad"))L.link(e);L.link(b,"Back to the top: the plane takes off");const $=new Set,q=async e=>{const t=e.target.closest(".ce-copy");if(!t)return;e.preventDefault(),e.stopPropagation();const o=t.dataset.copy;let i=!1;try{navigator.clipboard&&navigator.clipboard.writeText&&(await navigator.clipboard.writeText(o),i=!0)}catch{i=!1}if(!i)try{const a=document.createElement("textarea");a.value=o,a.setAttribute("readonly",""),a.style.cssText="position:fixed;left:-9999px;top:0;opacity:0",T.append(a),a.select(),i=document.execCommand&&document.execCommand("copy"),a.remove()}catch{i=!1}if(L.toast(i?`Copied ${o}`:`Select and copy: ${o}`),i){t.dataset.done="",t.lastElementChild.textContent="Copied";const a=setTimeout(()=>{$.delete(a),delete t.dataset.done,t.lastElementChild.textContent="Copy"},1600);$.add(a)}};c.addEventListener("click",q);const G=e=>{(e.key==="Enter"||e.key===" ")&&e.target.closest(".ce-copy")&&(e.stopPropagation(),e.key===" "&&(e.preventDefault(),q(e)))};c.addEventListener("keydown",G);const H=()=>M&&M();b.addEventListener("click",H);let l=null;const y=e=>{let t=0,o=e;for(;o&&o!==c;)t+=o.offsetLeft,o=o.offsetParent;return t};function K(){const e=c.offsetWidth||1;l={w:e,name:y(P)/e,fly:(y(b)+b.offsetWidth*.5)/e,cols:k.map(o=>y(o)/e),pages:R.map(o=>y(o)/e),ib:Y.map(o=>y(o[1])/e)};const t=[l.cols[0],l.cols[1],1];D.forEach((o,i)=>{o.style.left=(t[i]*100).toFixed(3)+"%"}),l.ticks=t}const O=e=>1-(1-W(e))**3,E=(e,t,o=.32)=>{if(t>=.999){e.style.opacity="",e.style.transform="";return}e.style.opacity=t.toFixed(3),e.style.transform=`translate3d(0, ${(o*(1-O(t))).toFixed(3)}em, 0)`},A=(e,t)=>{if(t>=.999){e.style.opacity="",e.style.color="",e.style.textShadow="";return}e.style.opacity=g(0,.35,t).toFixed(3);const o=1-g(.35,1,t);e.style.color=o>.01?`color-mix(in srgb, #F4E2BE ${(o*100).toFixed(1)}%, currentColor)`:"",e.style.textShadow=o>.01?`0 0 .6em rgb(230 168 106 / ${(.5*o).toFixed(3)})`:""},n={line:[.8,.9],rows:[.835,.96],base:[.91,.97],gauge:[.27,.33]};return{el:c,gauge:p,layout:K,get geom(){return l},draw(e,{reduced:t=!1,blocks:o=0,live:i=!1}={}){l||K();const a=t,j=a?1:g(n.line[0]-.01,n.line[0]+.005,e);c.style.visibility=j>0?"visible":"hidden",c.classList.toggle("ce-live",i);const u=a?1:w(e,n.line[0],n.line[1]),m=1-Math.pow(1-u,3);f(".ce-base").style.transform=m<.999?`scaleX(${m.toFixed(4)})`:"";const B=a?0:g(0,.08,u)*(1-g(.85,1,u));N.style.opacity=B.toFixed(3),N.style.transform=`translate3d(${(m*l.w).toFixed(1)}px, 0, 0)`;const x=r=>a?1:g(r-.015,r+.05,m);D.forEach((r,d)=>{const h=x(l.ticks[d]);r.style.transform=h<.999?`scaleY(${h.toFixed(3)})`:""}),A(P,x(l.name)),A(b,a?1:g(.96,1,m)*g(n.line[1]-.03,n.line[1]+.01,e)),b.style.visibility=m>.9||a?"visible":"hidden",_.forEach((r,d)=>A(r,x(l.cols[d])));const U=(r,d,h)=>a?1:w(e,Math.max(n.rows[0],n.line[0]+(n.line[1]-n.line[0])*r*.75)+d*.012,Math.max(n.rows[0],n.line[0]+(n.line[1]-n.line[0])*r*.75)+d*.012+.06);R.forEach((r,d)=>E(r,U(l.cols[0],d%4,4),.28)),Y.forEach((r,d)=>{const h=U(l.cols[1],d,5);for(const ce of r)E(ce,h,.28)});const ne=a?1:w(e,n.base[0],n.base[1]);E(ee,ne,.2),E(te,a?1:w(e,n.base[0]+.02,n.base[1]+.02),.2);const C=a?1:w(e,n.gauge[0],n.gauge[1]);p.style.visibility=C>0?"visible":"hidden",p.style.opacity=g(0,.5,C).toFixed(3),se.style.transform=C<.999?`scaleY(${O(C).toFixed(3)})`:"";const F=String(Math.round(o));I.textContent!==F&&(I.textContent=F,oe.textContent=F==="1"?v.unit.replace(/s$/,""):v.unit,ae.textContent=`${F} of the cube’s ${v.of} blocks in place`)},lamp(e,t,o,i,a){if(!a)return;const j=u=>{const m=u.getBoundingClientRect(),B=m.left-a.left+m.width/2,x=m.top-a.top+m.height/2;return W(i)*(1-g(o*.35,o*1.4,Math.hypot(B-e,x-t)))};for(const u of[Z,k[0],k[1],V])u.style.setProperty("--ce-warm",j(u).toFixed(3))},destroy(){for(const e of $)clearTimeout(e);$.clear(),c.removeEventListener("click",q),c.removeEventListener("keydown",G),b.removeEventListener("click",H),c.remove(),p.remove(),z.remove()}}}export{we as createFooter};
