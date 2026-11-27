import{clamp as u,cubicBezier as B}from"./ease.js";const T=`:where(.cgs) {
--cgs-paper: #F6F2EA;
--cgs-plane: #FBF8F1;
--cgs-ink: #211F1C;
--cgs-ink-soft: #5C5850;
--cgs-blue: #3F78D0;
--cgs-violet: #6F5FC7;
--cgs-teal: #2FA6A0;
--cgs-green: #4C9B63;
--cgs-yellow: #EDB43C;
--cgs-coral: #E8674C;
--cgs-carnelian: #B8372C;
--cgs-clay: #EFE9DC;
--cgs-shade: 58 40 22;
--cgs-serif: Fraunces, "Iowan Old Style", Georgia, serif;
--cgs-sans: Figtree, system-ui, -apple-system, "Segoe UI", sans-serif;
--cgs-hand: "Playpen Sans", "Bradley Hand", "Segoe Print", cursive;
--cgs-calm: cubic-bezier(.2, .8, .2, 1);
font-family: var(--cgs-sans);
font-kerning: normal;
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
text-rendering: optimizeLegibility;
}
:where(.cgs), :where(.cgs) .cgs-paper, :where(.cgs) .cgs-card {
--cgs-fg: var(--cgs-ink);
--cgs-fg-soft: var(--cgs-ink-soft);
--cgs-line: rgb(33 31 28 / .15);
--cgs-line-strong: rgb(33 31 28 / .38);
--cgs-focus: var(--cgs-blue);
--cgs-note-ink: #2C5597;
--cgs-ts: none;
--cgs-ts-big: none;
--cgs-btn2-ring: rgb(33 31 28 / .28);
--cgs-btn2-hover: rgb(33 31 28 / .05);
--cgs-btn2-ts: none;
--cgs-chip-bg: #ECE5D8;
--cgs-chip-fg: #4A463F;
--cgs-chip-shadow: none;
color: var(--cgs-fg);
}
:where(.cgs .cgs-photo, .cgs.cgs-photo) {
--cgs-fg: #FBF8F1;
--cgs-fg-soft: rgb(251 248 241 / .9);
--cgs-line: rgb(251 248 241 / .42);
--cgs-line-strong: rgb(251 248 241 / .72);
--cgs-focus: #FBF8F1;
--cgs-note-ink: #FBF8F1;
--cgs-ts: 0 .03em .06em rgb(var(--cgs-shade) / .55), 0 .06em .42em rgb(var(--cgs-shade) / .3);
--cgs-ts-big: 0 .015em .04em rgb(var(--cgs-shade) / .38), 0 .03em .22em rgb(var(--cgs-shade) / .22);
--cgs-btn2-ring: rgb(251 248 241 / .8);
--cgs-btn2-hover: rgb(251 248 241 / .14);
--cgs-btn2-ts: var(--cgs-ts);
--cgs-chip-bg: var(--cgs-plane);
--cgs-chip-fg: var(--cgs-ink);
--cgs-chip-shadow: 0 .1em .4em -.1em rgb(var(--cgs-shade) / .35);
color: var(--cgs-fg);
}
:where(.cgs .cgs-sky, .cgs.cgs-sky) {
--cgs-fg: var(--cgs-ink);
--cgs-fg-soft: #37332D;
--cgs-line: rgb(33 31 28 / .22);
--cgs-line-strong: rgb(33 31 28 / .5);
--cgs-focus: var(--cgs-blue);
--cgs-note-ink: #234A8A;
--cgs-ts: none;
--cgs-ts-big: none;
--cgs-btn2-ring: rgb(33 31 28 / .42);
--cgs-btn2-hover: rgb(251 248 241 / .3);
--cgs-btn2-ts: none;
--cgs-chip-bg: var(--cgs-plane);
--cgs-chip-fg: var(--cgs-ink);
--cgs-chip-shadow: 0 .08em .3em -.08em rgb(var(--cgs-shade) / .28);
color: var(--cgs-fg);
}
:where(.cgs .cgs-dusk, .cgs.cgs-dusk) { --cgs-shade: 20 26 60; }
:where(.cgs) .cgs-display {
margin: 0;
font-family: var(--cgs-serif);
font-weight: 500;
font-size: 3.5em;
line-height: .98;
letter-spacing: -.022em;
font-variation-settings: "opsz" 144;
font-optical-sizing: none;
text-wrap: balance;
text-shadow: var(--cgs-ts-big);
}
:where(.cgs) .cgs-heading {
margin: 0;
font-family: var(--cgs-serif);
font-weight: 560;
font-size: 2.05em;
line-height: 1.04;
letter-spacing: -.014em;
font-variation-settings: "opsz" 72;
font-optical-sizing: none;
text-wrap: balance;
text-shadow: var(--cgs-ts-big);
}
:where(.cgs) .cgs-title {
margin: 0;
font-family: var(--cgs-serif);
font-weight: 600;
font-size: 1.3em;
line-height: 1.12;
letter-spacing: -.006em;
font-variation-settings: "opsz" 36;
font-optical-sizing: none;
text-shadow: var(--cgs-ts);
}
:where(.cgs) .cgs-lead {
margin: 0;
font-family: var(--cgs-sans);
font-weight: 450;
font-size: 1.15em;
line-height: 1.38;
letter-spacing: -.003em;
color: var(--cgs-fg-soft);
max-width: 26em;
text-wrap: pretty;
text-shadow: var(--cgs-ts);
}
:where(.cgs) .cgs-body {
margin: 0;
font-family: var(--cgs-sans);
font-weight: 420;
font-size: max(.95em, 10.5px);
line-height: 1.5;
color: var(--cgs-fg);
max-width: 30em;
text-wrap: pretty;
text-shadow: var(--cgs-ts);
}
:where(.cgs) .cgs-body + .cgs-body { margin-top: .7em; }
:where(.cgs) .cgs-caption { display: block; margin: 0; }
:where(.cgs) .cgs-label {
display: block;
font-family: var(--cgs-sans);
font-weight: 650;
font-size: max(.68em, 8.5px);
line-height: 1.2;
letter-spacing: .12em;
text-transform: uppercase;
color: var(--cgs-fg-soft);
text-shadow: var(--cgs-ts);
}
:where(.cgs) .cgs-name {
display: block;
margin-top: .22em;
font-family: var(--cgs-serif);
font-weight: 560;
font-size: 1.85em;
line-height: 1.04;
letter-spacing: -.008em;
font-variation-settings: "opsz" 60;
font-optical-sizing: none;
color: var(--cgs-fg);
text-shadow: var(--cgs-ts);
}
:where(.cgs) .cgs-label + .cgs-display,
:where(.cgs) .cgs-label + .cgs-heading { margin-top: .32em; }
:where(.cgs) .cgs-note {
display: inline-block;
margin: 0;
font-family: var(--cgs-hand);
font-weight: 600;
font-size: 1.1em;
line-height: 1.3;
letter-spacing: .005em;
color: var(--cgs-note-ink);
rotate: -2deg;
text-shadow: var(--cgs-ts);
}
:where(.cgs) .cgs-btn {
-webkit-appearance: none;
appearance: none;
display: inline-flex;
align-items: center;
justify-content: center;
gap: .45em;
box-sizing: border-box;
margin: 0;
border: 0;
border-radius: 999px;
padding: .92em 1.45em .95em;
font-family: var(--cgs-sans);
font-weight: 620;
font-size: max(.88em, 10.5px);
line-height: 1;
letter-spacing: .005em;
white-space: nowrap;
text-decoration: none;
cursor: pointer;
user-select: none;
-webkit-tap-highlight-color: transparent;
translate: 0 0;
transition: translate .18s var(--cgs-calm), box-shadow .18s var(--cgs-calm), background-color .18s var(--cgs-calm), color .18s var(--cgs-calm);
}
:where(.cgs) .cgs-btn-primary {
text-shadow: none;
background: var(--cgs-plane);
color: var(--cgs-ink);
box-shadow:
inset 0 0 0 1px rgb(33 31 28 / .07),
0 .06em .12em rgb(var(--cgs-shade) / .16),
0 .45em 1.1em -.35em rgb(var(--cgs-shade) / .38);
}
:where(.cgs) .cgs-btn-secondary {
background: transparent;
color: var(--cgs-fg);
box-shadow: inset 0 0 0 max(1px, .075em) var(--cgs-btn2-ring);
text-shadow: var(--cgs-btn2-ts);
}
:where(.cgs) .cgs-btn .cgs-arrow { display: inline-block; translate: 0 0; transition: translate .2s var(--cgs-calm); }
:where(.cgs) .cgs-btn-primary:hover, :where(.cgs) .cgs-btn-primary[data-state~="hover"] {
background: #FFFDF8;
translate: 0 -.07em;
box-shadow:
inset 0 0 0 1px rgb(33 31 28 / .07),
0 .1em .18em rgb(var(--cgs-shade) / .16),
0 .7em 1.4em -.4em rgb(var(--cgs-shade) / .42);
}
:where(.cgs) .cgs-btn-secondary:hover, :where(.cgs) .cgs-btn-secondary[data-state~="hover"] {
background: var(--cgs-btn2-hover);
box-shadow: inset 0 0 0 max(1.25px, .09em) var(--cgs-fg);
}
:where(.cgs) .cgs-btn:hover .cgs-arrow, :where(.cgs) .cgs-btn[data-state~="hover"] .cgs-arrow { translate: .16em 0; }
:where(.cgs) .cgs-btn-primary:active, :where(.cgs) .cgs-btn-primary[data-state~="press"] {
background: #F7F3EB;
translate: 0 .06em;
transition-duration: .06s;
box-shadow:
inset 0 0 0 1px rgb(33 31 28 / .1),
inset 0 .1em .18em rgb(var(--cgs-shade) / .16),
0 .02em .05em rgb(var(--cgs-shade) / .22);
}
:where(.cgs) .cgs-btn-secondary:active, :where(.cgs) .cgs-btn-secondary[data-state~="press"] {
translate: 0 .05em;
transition-duration: .06s;
background: var(--cgs-btn2-hover);
}
:where(.cgs) .cgs-btn:focus { outline: none; }
:where(.cgs) .cgs-btn:focus-visible, :where(.cgs) .cgs-btn[data-state~="focus"] {
outline: max(2px, .1em) solid var(--cgs-focus);
outline-offset: max(2px, .16em);
}
:where(.cgs) .cgs-btn[disabled], :where(.cgs) .cgs-btn[aria-disabled="true"] { opacity: .5; cursor: default; translate: 0 0; }
:where(.cgs) .cgs-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .6em; }
:where(.cgs) .cgs-link {
--cgs-u: var(--cgs-line-strong);
color: inherit;
font-weight: 560;
text-decoration: none;
background-image: linear-gradient(var(--cgs-u), var(--cgs-u));
background-repeat: no-repeat;
background-size: 100% max(1px, .07em);
background-position: 0 calc(100% - .05em);
-webkit-box-decoration-break: clone;
box-decoration-break: clone;
border-radius: .15em;
cursor: pointer;
}
:where(.cgs) .cgs-link:hover, :where(.cgs) .cgs-link[data-state~="hover"] { --cgs-u: currentColor; }
:where(.cgs) .cgs-link:focus { outline: none; }
:where(.cgs) .cgs-link:focus-visible, :where(.cgs) .cgs-link[data-state~="focus"] {
--cgs-u: currentColor;
outline: max(2px, .1em) solid var(--cgs-focus);
outline-offset: .15em;
}
:where(.cgs) .cgs-card {
position: relative;
box-sizing: border-box;
max-width: 21em;
padding: 1.25em 1.4em 1.35em;
border-radius: .8em;
background: var(--cgs-plane);
text-shadow: none;
box-shadow:
inset 0 0 0 1px rgb(33 31 28 / .05),
0 .05em .1em rgb(var(--cgs-shade) / .1),
0 .5em 1.3em -.35em rgb(var(--cgs-shade) / .22),
0 1.6em 3em -1.4em rgb(var(--cgs-shade) / .26);
}
:where(.cgs) .cgs-card > :first-child { margin-top: 0; }
:where(.cgs) .cgs-card .cgs-title + .cgs-body { margin-top: .45em; }
:where(.cgs) .cgs-card .cgs-chip + .cgs-title { margin-top: .7em; }
:where(.cgs) .cgs-chip {
display: inline-flex;
align-items: center;
gap: .5em;
box-sizing: border-box;
padding: .42em .8em .44em;
border-radius: 999px;
font-family: var(--cgs-sans);
font-weight: 620;
font-size: max(.7em, 9px);
line-height: 1;
letter-spacing: .02em;
white-space: nowrap;
background: var(--cgs-chip-bg, #ECE5D8);
color: var(--cgs-chip-fg, #4A463F);
box-shadow: var(--cgs-chip-shadow, none);
text-shadow: none;
}
:where(.cgs) .cgs-chip[style*="--c"]::before {
content: "";
flex: none;
width: .78em;
height: .78em;
border-radius: .2em;
background: var(--c);
box-shadow: inset 0 -.12em 0 rgb(0 0 0 / .12), inset 0 .1em 0 rgb(255 255 255 / .25);
}
:where(.cgs) .cgs-chips { display: flex; flex-wrap: wrap; gap: .45em; }
:where(.cgs) .cgs-rule {
display: block;
height: 0;
margin: 1em 0;
border: 0;
border-top: 1px solid var(--cgs-line);
}
:where(.cgs) .cgs-line {
display: block;
padding: .16em .12em .42em;
margin: -.16em -.12em -.42em;
-webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - .24em), transparent);
mask-image: linear-gradient(to bottom, #000 calc(100% - .24em), transparent);
-webkit-mask-repeat: no-repeat;
mask-repeat: no-repeat;
-webkit-mask-size: 100% 100%;
mask-size: 100% 100%;
}
:where(.cgs) .cgs-line-in { display: inline-block; }
:where(.cgs:not(.cgs-ready)) .cgs-hold { visibility: hidden; }
:where(.cgs) .cgs-sr {
position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
:where(.cgs) .cgs-toast {
position: absolute;
left: 50%;
bottom: 5.5%;
z-index: 60;
display: flex;
align-items: center;
gap: .55em;
max-width: 86%;
box-sizing: border-box;
padding: .62em 1.05em .64em .85em;
border-radius: 999px;
background: var(--cgs-plane);
color: var(--cgs-ink);
font-family: var(--cgs-sans);
font-weight: 560;
font-size: max(.78em, 10px);
line-height: 1.15;
letter-spacing: .005em;
white-space: nowrap;
text-shadow: none;
pointer-events: none;
box-shadow: inset 0 0 0 1px rgb(33 31 28 / .06), 0 .5em 1.4em -.4em rgb(var(--cgs-shade) / .4), 0 .08em .16em rgb(var(--cgs-shade) / .12);
opacity: 0;
translate: -50% .6em;
transition: opacity .2s var(--cgs-calm), translate .26s var(--cgs-calm);
}
:where(.cgs) .cgs-toast.is-on { opacity: 1; translate: -50% 0; transition-duration: .16s, .22s; }
:where(.cgs) .cgs-toast svg { flex: none; width: 1.05em; height: 1.05em; color: var(--cgs-ink-soft); }
:where(.cgs) .cgs-toast span { overflow: hidden; text-overflow: ellipsis; }
:where(.cgs.cgs-reduced) .cgs-btn, :where(.cgs.cgs-reduced) .cgs-btn .cgs-arrow, :where(.cgs.cgs-reduced) .cgs-toast { transition-property: box-shadow, background-color, color, opacity; }
:where(.cgs.cgs-reduced) .cgs-btn:hover, :where(.cgs.cgs-reduced) .cgs-btn:active, :where(.cgs.cgs-reduced) .cgs-btn[data-state] { translate: 0 0; }`,M=Object.freeze({coffee:"https://docs.google.com/forms/d/e/1FAIpQLSfCJEW9kdTEYV41YZZCt4MQRg8c9KdNSbrw9IGmSgCRF9eglw/viewform",games:"/minigames/",apply:"mailto:recruitment@cornellcgs.org",inkMaze:"/minigames/inkMaze/",forgeOrFold:"/minigames/forgeOrFold/",carrotDefense:"/minigames/carrotDefense/",about:"/whoWeAre/",work:"/whatWeDo/",ml:"/mlProcess/",events:"/events/",world:"/world/",team:"/ourTeam/",advisors:"/advisors/",join:"/join/",contact:"/contact/",privacy:"/privacy/",terms:"/terms/"}),O=["Fraunces:opsz,wght@9..144,400..700","Figtree:wght@400..700","Playpen Sans:wght@600"],A=(s,t)=>Math.max(s,t*16/9)/64;function R(s){const t=String(s||"").trim();if(!t)return"";if(t===M.coffee)return"Opens the coffee chat form";if(t.startsWith("mailto:"))return"Opens an email to "+t.slice(7).split("?")[0];if(t.startsWith("#")||t.startsWith("/"))return"Goes to "+t;try{const a=new URL(t);return"Opens "+a.host.replace(/^www\./,"")+(a.pathname.length>1?a.pathname.replace(/\/$/,""):"")}catch{return"Goes to "+t}}const _='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 14 14 6M7.5 6H14v6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',E="data-cgs-page";function j(s,t={}){let a=s.querySelector(`:scope > style[${E}]`);const l=!a;a||(a=document.createElement("style"),a.setAttribute(E,""),a.textContent=T),s.prepend(a);const i=s.classList.contains("cgs");s.classList.add("cgs"),t.reduced&&s.classList.add("cgs-reduced");let c=!1,n=null,d=0,b=0,p=0;const w=t.site&&typeof t.site.go=="function"?t.site:null,v=[],f=(e,o,m,h=!1)=>{e.addEventListener(o,m,h),v.push([e,o,m,h])},L=typeof t.font=="function"?t.font:()=>Promise.resolve(),S=Promise.all(O.map(e=>Promise.resolve(L(e)).catch(()=>{}))).then(()=>{c||s.classList.add("cgs-ready")});function F(e,o){c||(a.isConnected||s.prepend(a),b=e||s.clientWidth||1280,p=o||s.clientHeight||720,s.style.fontSize=A(b,p).toFixed(2)+"px")}F();function y(e,{hold:o=!1}={}){c||!e||(n||(n=document.createElement("div"),n.className="cgs-toast",n.setAttribute("role","status"),n.setAttribute("aria-live","polite"),n.innerHTML=_+"<span></span>"),n.isConnected||s.append(n),n.lastChild.textContent=e,o?(n.style.transition="none",n.classList.add("is-on"),n.offsetWidth,n.style.transition=""):n.classList.add("is-on"),clearTimeout(d),o||(d=setTimeout(()=>{d=0,n&&n.classList.remove("is-on")},2200)))}function z(e,o){if(!e||e.__cgsLink)return e;if(w)return D(e);const m=()=>o||e.dataset.goes||R(e.getAttribute("href")||e.dataset.href),h=g=>{g.preventDefault(),g.stopPropagation(),y(m())},x=g=>{(g.key==="Enter"||g.key===" ")&&(g.stopPropagation(),g.key===" "&&e.tagName==="A"&&(g.preventDefault(),y(m())))},r=g=>g.preventDefault();return f(e,"click",h),f(e,"auxclick",h),f(e,"keydown",x),f(e,"dragstart",r),e.__cgsLink=!0,e}function D(e){const o=()=>e.dataset.href||e.getAttribute("href")||"",m=r=>!!r&&(!r.startsWith("#")||r.startsWith("#/"));if(e.__cgsLink=!0,!m(o()))return e;if(e.tagName==="A"){const r=o();let g=r;try{g=w.href?w.href(r):r}catch{g=r}g&&g!==e.getAttribute("href")&&e.setAttribute("href",g),/^https?:/i.test(g)&&!e.hasAttribute("target")&&e.setAttribute("rel","noopener")}const h=r=>{r.type==="click"&&(r.metaKey||r.ctrlKey||r.shiftKey||r.altKey||r.button)||(r.preventDefault(),r.stopPropagation(),w.go(o()))},x=r=>{(r.key==="Enter"||r.key===" ")&&(r.stopPropagation(),r.key===" "&&e.tagName==="A"&&(r.preventDefault(),w.go(o())))};return f(e,"click",h),f(e,"keydown",x),f(e,"dragstart",r=>r.preventDefault()),e}function P(e=s){for(const o of e.querySelectorAll("a[href], button, [data-goes]"))z(o);return e}function W(){if(!c){c=!0,clearTimeout(d);for(const[e,o,m,h]of v)e.removeEventListener(o,m,h),delete e.__cgsLink;v.length=0,n&&n.remove(),n=null,l&&a.remove(),i||s.classList.remove("cgs"),s.classList.remove("cgs-ready","cgs-reduced"),s.style.fontSize=""}}return{ready:S,resize:F,destroy:W,link:z,wire:P,toast:y,base:()=>A(b,p)}}const k=B(.2,.75,.25,1);function G(s,t){const a=Array.isArray(t)?t:String(t).split(`
`);s.textContent="";for(const l of a){const i=document.createElement("span");i.className="cgs-line";const c=document.createElement("span");c.className="cgs-line-in",c.textContent=l,i.append(c),s.append(i)}return s}function C(s,t,a,l=.14){const i=1-l*Math.max(0,a-1);return u((s-l*t)/Math.max(1e-4,i))}function K(s,t,{spread:a=.14,ease:l=k,reduced:i=!1}={}){const c=s.classList&&s.classList.contains("cgs-line-in")?[s]:[...s.querySelectorAll(".cgs-line-in")],n=c.length;c.forEach((d,b)=>{const p=l(C(t,b,n,a));if(p>=1){d.style.transform="",d.style.opacity="";return}d.style.transform=i?"":`translate3d(0,${((1-p)*150).toFixed(2)}%,0)`,d.style.opacity=u(i?p:p*1.6).toFixed(3)})}function N(s,t,{rise:a=.5,ease:l=k,reduced:i=!1}={}){const c=l(u(t));if(c>=1){s.style.transform="",s.style.opacity="";return}s.style.transform=i?"":`translate3d(0,${((1-c)*a).toFixed(3)}em,0)`,s.style.opacity=c.toFixed(3)}function $(s,t,{spread:a=.12,...l}={}){const i=[...s];i.forEach((c,n)=>N(c,C(t,n,i.length,a),l))}function I(s,t,{rise:a=.35,ease:l=k,reduced:i=!1}={}){const c=l(u(t));if(c<=0){s.style.transform="",s.style.opacity="";return}s.style.transform=i?"":`translate3d(0,${(-c*a).toFixed(3)}em,0)`,s.style.opacity=(1-c).toFixed(3)}export{O as FONTS,M as HREF,A as baseSize,I as fadeAway,N as fadeRise,$ as fadeRiseEach,j as mountPage,K as riseLines,G as setLines,k as settleEase,C as staggered,R as whereFor};
