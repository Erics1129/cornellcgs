import{WORK as B,ML as D,THREADS as I,STEPS as K,END as u,SITE as _}from"./lib.js";import{smoothstep as b,clamp as G}from"../../kit/ease.js";const t=i=>String(i).replace(/[&<>"]/g,h=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[h]),q=i=>t(i).replace(/ (\S+)$/," $1"),Y=`
.pw-words{position:absolute;inset:0;z-index:4;pointer-events:none;color:var(--cgs-fg);font-size:.86em}
.pw-words a,.pw-words button{pointer-events:none}
.pw-words .pw-live a,.pw-words .pw-live button{pointer-events:auto}
.pw-ground{position:absolute;inset:0;z-index:3;pointer-events:none}
/* the feel kit's '.cgs [data-feel]{position:relative}' outranks its own '.feel-proxy{position:absolute}' (KIT-CHANGES.md) */
.cgs .feel-proxies > .feel-proxy{position:absolute}
.pw-head{position:absolute;left:5.6%;top:11%;width:24em}
.pw-crumb{display:flex;align-items:center;gap:.55em;margin:0 0 .9em;font-family:var(--cgs-sans);font-weight:600;font-size:max(.68em,11px);letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}
.pw-crumb .cgs-link{font-weight:650;letter-spacing:.12em;padding:.35em 0}
.pw-crumb .pw-here{opacity:.72}
.pw-crumb .pw-slash{opacity:.45;font-weight:500}
.pw-crumb .pw-snd{margin-left:.9em;pointer-events:auto;text-transform:none;letter-spacing:.02em}
.pw-title{position:absolute;left:0;top:2.3em;width:100%}
.pw-title h1,.pw-title h2{margin:0;font-size:2.3em;line-height:1.02}
.pw-title .cgs-lead{margin:.45em 0 0;max-width:none;color:var(--cgs-fg-soft, var(--cgs-fg))}
.pw-ln{display:block;white-space:nowrap}
.pw-reel{position:absolute;left:5.6%;top:35%;width:22em}
.pw-bar{display:flex;align-items:baseline;gap:.9em;margin:0 0 1.05em;padding:0 0 .55em;border-bottom:1px solid rgba(251,248,241,.22)}
.pw-reelname{margin:0;font-family:var(--cgs-serif);font-weight:540;font-size:1.06em;line-height:1.1;letter-spacing:-.003em;font-variation-settings:'opsz' 36;text-shadow:var(--cgs-ts);white-space:nowrap}
.pw-ticks{display:flex;gap:.18em;margin:0 0 0 auto;padding:0;list-style:none;font-family:var(--cgs-sans);font-weight:650;font-size:max(.66em,10.5px);letter-spacing:.06em;font-variant-numeric:tabular-nums lining-nums}
.pw-ticks li{min-width:2.1em;padding:.22em .1em;text-align:center;border-radius:.3em;opacity:.42;transition:opacity .24s cubic-bezier(.2,.8,.2,1),background-color .24s}
.pw-ticks li.on{opacity:1;background:rgba(251,248,241,.12)}
.pw-ticks li.done{opacity:.7}
.pw-frames{position:relative;margin:0;padding:0;list-style:none}
.pw-frame{position:absolute;left:0;top:0;width:100%}
.pw-tag{display:flex;align-items:center;gap:.6em;margin:0 0 .5em;font-family:var(--cgs-sans);font-weight:650;font-size:max(.68em,11px);letter-spacing:.13em;text-transform:uppercase;text-shadow:var(--cgs-ts)}
.pw-card{display:inline-flex;align-items:center;justify-content:center;gap:.08em;min-width:2.35em;height:1.75em;padding:0 .3em;border-radius:.28em;background:#FBF8F1;color:#211F1C;font-family:var(--cgs-serif);font-weight:640;font-size:1.12em;letter-spacing:0;text-transform:none;text-shadow:none;box-shadow:0 .06em .18em rgba(20,10,4,.5),inset 0 0 0 .06em rgba(33,26,20,.25);font-variant-numeric:lining-nums}
.pw-card .pw-suit{font-family:var(--cgs-sans);font-size:.92em;transform:translateY(-.02em)}
.pw-card.pw-num{background:transparent;color:inherit;box-shadow:inset 0 0 0 .07em rgba(251,248,241,.55);font-variant-numeric:tabular-nums lining-nums}
.pw-sep{width:1.1em;height:1px;background:currentColor;opacity:.5}
.pw-name{margin:0;font-family:var(--cgs-serif);font-weight:560;font-size:1.78em;line-height:1.02;letter-spacing:-.012em;font-variation-settings:'opsz' 72;font-optical-sizing:none;text-shadow:var(--cgs-ts-big)}
.pw-line{margin:.4em 0 0;font-family:var(--cgs-serif);font-weight:430;font-size:1.08em;line-height:1.36;font-variation-settings:'opsz' 24;text-wrap:pretty;text-shadow:var(--cgs-ts)}
.pw-page{margin:.75em 0 0;padding:.7em 0 0;border-top:1px solid rgba(251,248,241,.18)}
.pw-page .cgs-label{display:block;margin:0 0 .4em;font-size:max(.64em,10.5px);opacity:.8}
.pw-page .cgs-body{margin:0;max-width:none;font-size:max(.92em,11px);line-height:1.5;text-wrap:pretty;opacity:.9}
.pw-honest{display:flex;align-items:center;gap:.55em;margin:.5em 0 0;font-family:var(--cgs-sans);font-weight:580;font-size:max(.84em,11px);letter-spacing:.012em;text-shadow:var(--cgs-ts)}
.pw-ring{flex:none;width:.72em;height:.72em;border-radius:50%;box-sizing:border-box;border:.11em solid currentColor;opacity:.85}
.pw-go{display:flex;align-items:center;flex-wrap:wrap;gap:.2em .75em;margin:.75em 0 0;font-size:max(.9em,11px)}
.pw-go .cgs-label{margin:0;font-size:max(.64em,10.5px);opacity:.7}
.pw-go .cgs-link{padding:.3em 0}
.pw-go .cgs-btn{font-size:.92em}
.pw-filmmark{display:inline-block;width:.95em;height:.72em;margin-right:.35em;vertical-align:-.04em;border-radius:.12em;box-shadow:inset 0 0 0 .1em currentColor;background:radial-gradient(circle,currentColor 0 .07em,transparent .08em) 0 .12em/.24em .48em repeat-x;opacity:.8}
.pw-in{font-weight:620}
.pw-end{position:absolute;left:5.6%;top:21%;width:22em}
.pw-end h2{margin:0;font-size:2.3em;line-height:1.02}
.pw-end .cgs-lead{margin:.5em 0 0;max-width:20em}
.pw-end .cgs-actions{margin-top:1.15em}
.pw-more{display:flex;flex-wrap:wrap;align-items:center;gap:.3em 1em;margin:1.1em 0 0;font-size:max(.9em,11px)}
.pw-more .cgs-link{padding:.3em 0}
.pw-more .pw-dot{opacity:.45}
.pw-words.pw-phone .pw-head{left:5%;top:9.5%;width:90%}
.pw-words.pw-phone .pw-reel,.pw-words.pw-phone .pw-end{left:5%;top:auto;bottom:6%;width:90%}
.pw-words.pw-phone .pw-frames{height:var(--pw-cap-h,14em)}
.pw-words.pw-phone .pw-frame{top:auto;bottom:0}
`,P=i=>i.map(h=>`<span class="pw-ln">${t(h)}</span>`).join(" "),J=["What we are building,","and what the club does each week."],Q=["How we turn a game’s rules","into an agent that plays it."];function X(i,{href:h,sound:f=null}){const E=document.createElement("style");E.textContent=Y;const c=document.createElement("div");c.className="pw-ground",c.style.background="radial-gradient(70% 62% at 0% 0%, rgba(12,8,6,.86) 0%, rgba(12,8,6,.72) 36%, rgba(12,8,6,.36) 66%, rgba(12,8,6,0) 100%), radial-gradient(62% 78% at 0% 70%, rgba(12,8,6,.84) 0%, rgba(12,8,6,.68) 34%, rgba(12,8,6,.3) 64%, rgba(12,8,6,0) 100%)";const p=document.createElement("div");p.className="pw-ground",p.style.cssText="opacity:0;background:linear-gradient(90deg, rgba(10,7,5,.62) 0%, rgba(10,7,5,.52) 24%, rgba(10,7,5,.28) 38%, rgba(10,7,5,0) 50%)";const n=document.createElement("div");n.className="cgs-words pw-words cgs-photo";const r=(e,a,o="cgs-link",l="")=>`<a class="${o}" href="${t(h(e))}" data-route="${t(e)}"${l}>${a}</a>`,L=e=>e?`<p class="pw-go"><span class="cgs-label">In the film</span> ${r("/film/"+e.slot,`<span class="pw-filmmark" aria-hidden="true"></span>${t(e.title)}`,"cgs-link pw-in",` aria-label="${t(e.title)}, in the film"`)}</p>`:"",W=(e,a)=>{const o=e.body.length?`<div class="pw-page">${e.page&&e.page!==e.title?`<p class="cgs-label">${t(e.page)}</p>`:""}<p class="cgs-body">${e.games?e.body.map(g=>g===e.shared?e.games.map((k,s)=>(s===e.games.length-1?"and ":"")+r(k.path,t(k.name))+(s<e.games.length-1?", ":"")).join("")+".":q(g)).join(" "):e.body.map(q).join(" ")}</p>${e.honest?`<p class="pw-honest"><span class="pw-ring" aria-hidden="true"></span>${t(e.honest)}</p>`:""}</div>`:"",l=e.play?`<p class="pw-go">${r(e.play.route,`${t(e.play.label)} <span class="cgs-arrow" aria-hidden="true">→</span>`,"cgs-btn cgs-btn-secondary")}</p>`:L(e.film);return`<li class="pw-frame" data-k="0" data-i="${a}">
      <p class="pw-tag"><span class="pw-card" aria-label="${t(e.rank)} of spades">${t(e.rank)}<span class="pw-suit" aria-hidden="true">${e.suit}</span></span>${e.alt?` <span class="pw-sep" aria-hidden="true"></span> <span>${t(e.alt)}</span>`:""}</p>
      <h3 class="pw-name">${t(e.title)}</h3>
      <p class="pw-line">${e.line.map(q).join(" ")}</p>
      ${o}${l}</li>`},j=(e,a)=>{const o=e.body.length?`<div class="pw-page">${e.page!==e.title?`<p class="cgs-label">${t(e.page)}</p>`:""}<p class="cgs-body">${e.body.map(q).join(" ")}</p>${e.honest?`<p class="pw-honest"><span class="pw-ring" aria-hidden="true"></span>${t(e.honest)}</p>`:""}</div>`:"";return`<li class="pw-frame" data-k="1" data-i="${a}">
      <p class="pw-tag"><span class="pw-card pw-num">${t(e.n)}</span> <span class="pw-sep" aria-hidden="true"></span> <span>${t(e.alt)}</span></p>
      <h3 class="pw-name">${t(e.title)}</h3>
      <p class="pw-line">${e.line.map(q).join(" ")}</p>
      ${o}${L(e.film)}</li>`};n.innerHTML=`
  <header class="pw-head">
    <nav class="pw-crumb" aria-label="Where you are">${r("/",t(_.name),"cgs-link pw-home")} <span class="pw-slash" aria-hidden="true">/</span> <span class="pw-here" aria-current="page">${t(B.title)}</span> <span class="pw-snd"></span></nav>
    <div class="pw-title pw-t0"><h1 class="cgs-heading">${t(B.title)}</h1><p class="cgs-lead">${P(J)}</p></div>
  </header>
  <section class="pw-reel pw-r0" aria-labelledby="pw-h-work">
    <div class="pw-bar"><h2 class="pw-reelname" id="pw-h-work">${t(B.heading)}</h2><ol class="pw-ticks" aria-hidden="true">${I.map(e=>`<li>${t(e.rank)}${e.suit}</li>`).join("")}</ol></div>
    <ol class="pw-frames">${I.map(W).join("")}</ol>
  </section>
  <section class="pw-reel pw-r1" aria-labelledby="pw-h-ml">
    <div class="pw-title pw-t1 pw-tml"><h2 class="cgs-heading" id="pw-h-ml">${t(D.title)}</h2><p class="cgs-lead">${P(Q)}</p></div>
    <div class="pw-bar"><p class="pw-reelname">${t(D.heading)}</p><ol class="pw-ticks" aria-hidden="true">${K.map(e=>`<li>${t(e.n)}</li>`).join("")}</ol></div>
    <ol class="pw-frames">${K.map(j).join("")}</ol>
  </section>
  <footer class="pw-end">
    <h2 class="cgs-heading">${t(u.heading)}</h2>
    <p class="cgs-lead">${q(u.text)}</p>
    <div class="cgs-actions">${r(u.join.route,`${t(u.join.label)} <span class="cgs-arrow" aria-hidden="true">→</span>`,"cgs-btn cgs-btn-primary")} ${r(u.home.route,t(u.home.label),"cgs-btn cgs-btn-secondary")}</div>
    <p class="pw-more">${r(u.code.route,`<span class="pw-filmmark" aria-hidden="true"></span>${t(u.code.label)}`)} <span class="pw-dot" aria-hidden="true">·</span> ${r(u.games.route,t(u.games.label))}</p>
  </footer>`,i.append(E,c,p,n),f&&n.querySelector(".pw-snd").append(f);const A=n.querySelector(".pw-head"),O=n.querySelector(".pw-t0"),y=n.querySelector(".pw-t1"),w=[n.querySelector(".pw-r0"),n.querySelector(".pw-r1")],R=w.map(e=>e.querySelector(".pw-bar")),N=w.map(e=>[...e.querySelectorAll(".pw-ticks li")]),m=[[...w[0].querySelectorAll(".pw-frame")],[...w[1].querySelectorAll(".pw-frame")]],F=n.querySelector(".pw-end"),C=[...n.querySelectorAll("a, button")];let x=!1;function H(){const e=A.getBoundingClientRect(),a=w[1].getBoundingClientRect(),o=O.getBoundingClientRect(),l=parseFloat(getComputedStyle(n).fontSize)||20;y.style.position="absolute",y.style.left=((e.left-a.left)/l).toFixed(3)+"em",y.style.top=((o.top-a.top)/l).toFixed(3)+"em",y.style.width=(e.width/l).toFixed(3)+"em"}const T=new WeakMap;function $(e,a,o,l){const g=T.get(e),k=a>.5;if(!(g&&g.amt===a&&g.rise===o)&&(T.set(e,{amt:a,rise:o}),a>=.999?(e.style.opacity="",e.style.transform=""):(e.style.opacity=Math.max(0,a).toFixed(3),e.style.transform=l||a<=.001?"":`translate3d(0,${o.toFixed(3)}em,0)`),!g||g.amt>.5!==k)){e.classList.toggle("pw-live",k);for(const s of e.querySelectorAll("a, button"))k?s.removeAttribute("tabindex"):s.setAttribute("tabindex","-1")}}const v=[-2,-2];return{el:n,frames:m,links:C,end:F,set(e,a){$(O,e.head[0],e.head[0]<1?e.headLeaving===0?-.25*(1-e.head[0]):.4*(1-e.head[0]):0,a),$(y,e.head[1],e.head[1]<1?e.headLeaving===1?-.25*(1-e.head[1]):.4*(1-e.head[1]):0,a);for(let s=0;s<2;s++)$(R[s],e.reel[s],.3*(1-e.reel[s]),a);const o=new Map(e.cap.map(([s,d,z,S])=>[s*10+d,[z,S]]));let l=[-1,-1],g=[0,0];m.forEach((s,d)=>s.forEach((z,S)=>{const M=o.get(d*10+S);if(!M){$(z,0,0,a);return}$(z,M[0],M[1]<0?-.3*(1-M[0]):.45*(1-M[0]),a),M[0]>g[d]&&(g[d]=M[0],l[d]=S)}));for(let s=0;s<2;s++){const d=l[s]>=0?l[s]:e.lastOn[s];d!==v[s]&&(v[s]=d,N[s].forEach((z,S)=>{z.classList.toggle("on",S===d),z.classList.toggle("done",d>=0&&S<d)}))}$(F,e.end,.45*(1-e.end),a);const k=x?"0":(e.shade||0).toFixed(3);p.style.opacity!==k&&(p.style.opacity=k)},resize(e,a){if(x=e/Math.max(1,a)<.9,n.classList.toggle("pw-phone",x),n.style.fontSize=x?Math.max(13,Math.min(16,e/26)).toFixed(2)+"px":"",c.style.background=x?"linear-gradient(rgba(12,8,6,.78), rgba(12,8,6,.35) 26%, rgba(12,8,6,0) 40%, rgba(12,8,6,0) 52%, rgba(12,8,6,.62) 68%, rgba(12,8,6,.86))":"radial-gradient(70% 62% at 0% 0%, rgba(12,8,6,.86) 0%, rgba(12,8,6,.72) 36%, rgba(12,8,6,.36) 66%, rgba(12,8,6,0) 100%), radial-gradient(62% 78% at 0% 70%, rgba(12,8,6,.84) 0%, rgba(12,8,6,.68) 34%, rgba(12,8,6,.3) 64%, rgba(12,8,6,0) 100%)",x){let o=0;for(const l of m)for(const g of l)o=Math.max(o,g.offsetHeight);n.style.setProperty("--pw-cap-h",o+"px")}H()},destroy(){E.remove(),c.remove(),p.remove(),n.remove()}}}function Z(i,h,f=null,E=0){const c=h.work,p=h.ml,n=h.title,r=h.end,L=e=>1-b(e-.012,e-.003,i),W=e=>b(e,e+.009,i),j=1-b(n-.014,n-.004,i),A=b(n+.002,n+.014,i),O=b(r,r+.012,i),y=1-b(r-.013,r-.003,i),w=[];for(let e=0;e<c.length;e++){let a=e===0?1:W(c[e]);a=Math.min(a,e<c.length-1?L(c[e+1]):j),a>0&&w.push([0,e,a,e<c.length-1&&i>c[e+1]-.013||e===c.length-1&&i>n-.015?-1:1])}for(let e=0;e<p.length;e++){let a=e===0?A:W(p[e]);a=Math.min(a,e<p.length-1?L(p[e+1]):y),a>0&&w.push([1,e,a,e<p.length-1&&i>p[e+1]-.013||e===p.length-1&&i>r-.014?-1:1])}const R=[c.reduce((e,a,o)=>i>=a?o:e,0),p.reduce((e,a,o)=>i>=a?o:e,-1)],N=b(n+.03,n+.1,i)*(1-b(r-.03,r+.03,i)),m={head:[j,Math.min(A,y)],headLeaving:i<n?0:1,reel:[j,Math.min(A,y)],cap:w,end:O,lastOn:R,shade:N};if(!f||E<=0)return m;const F=G(E),C=1-b(0,.45,F),x=b(.55,1,F),H=(e,a)=>e===f.k&&a===f.i,T=w.filter(([e,a])=>!H(e,a)).map(([e,a,o])=>[e,a,o*C,-1]),$=w.find(([e,a])=>H(e,a));T.push([f.k,f.i,Math.max(x,$?$[2]:0),1]);const v=(e,a)=>f.k===e?Math.max(a,x):a*C;return{head:[v(0,m.head[0]),v(1,m.head[1])],headLeaving:f.k===0?1:0,reel:[v(0,m.reel[0]),v(1,m.reel[1])],cap:T,end:m.end*C,lastOn:m.lastOn,shade:m.shade}}export{X as createWords,Z as wordsFor};
