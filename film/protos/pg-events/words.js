import{HREF as p}from"../../kit/page.js";const a={site:{name:"Cornell CGS",fullName:"Cornell Computational Game Society",credit:"Website developed by Eric Shi",footerLine:n=>`© ${n} Cornell CGS · cornellcgs.org`},page:{title:"Events",lead:"Dates go up here once they are set."},calendar:"On the calendar",items:[{title:"Club meetings",date:"Time TBA",blurb:"We play, build, and have fun. Times go up here once they are set."}],contact:{title:"Contact",lead:"Email the team that fits your question.",inboxes:[{label:"Recruitment",address:"recruitment@cornellcgs.org"},{label:"Tech",address:"tech@cornellcgs.org"},{label:"Finance & Sponsors",address:"finance@cornellcgs.org"},{label:"Marketing",address:"marketing@cornellcgs.org"},{label:"Social",address:"social@cornellcgs.org"}]},join:{heading:"Pull up a chair",text:"We take new members every semester. Any major, no experience needed.",cta:{label:"Apply to CGS",href:"mailto:recruitment@cornellcgs.org"},page:"Join CGS"}},e=n=>String(n).replace(/&/g,"&amp;").replace(/</g,"&lt;"),g=`
.ev-words{position:absolute;inset:0;z-index:3;pointer-events:none}
.ev-sec,.ev-list{position:absolute;inset:0;margin:0;padding:0;list-style:none;pointer-events:none}
.ev-b{position:absolute;left:0;top:0;width:17.5em;transform-origin:0 0;will-change:transform,opacity;opacity:0;pointer-events:none;margin:0}
.ev-b.ev-on{pointer-events:auto}
.ev-b .ev-in{position:relative}
.ev-b .ev-in::before{content:'';position:absolute;inset:var(--gi,-1.6em -2.2em -1.4em -1.8em);z-index:-1;pointer-events:none;background:radial-gradient(closest-side,rgba(var(--gr,12,14,22),var(--ga,.42)),rgba(var(--gr,12,14,22),calc(var(--ga,.42) * .55)) 55%,rgba(var(--gr,12,14,22),0));opacity:var(--go,1)}
.ev-b .cgs-label{display:block;letter-spacing:.13em;font-variant-numeric:tabular-nums lining-nums}
.ev-b h1{margin:.12em 0 0;letter-spacing:-.024em}
.ev-b h2{margin:.12em 0 .16em;font-size:1.86em;line-height:1.04;letter-spacing:-.012em}
.ev-b h3{margin:.1em 0 .22em;font:560 2.05em/1.02 var(--cgs-serif,Fraunces,Georgia,serif);font-variation-settings:'opsz' 72;letter-spacing:-.014em}
.ev-b p{margin:0}
.ev-title{width:22em}
.ev-title .cgs-lead{margin-top:.5em;max-width:18em}
.ev-crumb{display:flex;align-items:center;gap:.5em;margin:0 0 .3em}
.ev-crumb a{color:inherit}
.ev-cube{display:inline-grid;grid-template-columns:repeat(2,.42em);gap:.07em;transform:rotate(-8deg);margin-right:.1em}
.ev-cube i{display:block;width:.42em;height:.42em;border-radius:.09em}
.ev-event{width:18em;height:25.2em;transform-origin:0 0;will-change:auto;color:#211F1C;text-shadow:none}
.ev-card{position:absolute;inset:0;box-sizing:border-box;padding:1.55em 1.5em}
.ev-mark{display:grid;grid-template-columns:repeat(2,.5em);gap:.08em;width:max-content}
.ev-mark i{display:block;width:.5em;height:.5em;border-radius:.08em}
.ev-rule{display:block;height:max(1px,.07em);background:rgba(33,31,28,.5);margin:.55em 0 1.35em}
.ev-card h3{margin:0 0 .45em;font:560 2.45em/1.0 Fraunces,Georgia,serif;letter-spacing:-.018em;color:#211F1C}
.ev-blurb{margin:0;font:450 .98em/1.5 Figtree,system-ui,sans-serif;color:#37342e;max-width:14.6em}
.ev-when{position:absolute;left:1.5em;right:1.5em;bottom:1.5em;margin:0!important;display:block}
.ev-slot{display:block;height:3.3em;border-radius:.1em;outline:none}
.ev-whenl{display:block;margin-top:.7em;font:650 .72em/1 Figtree,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#B8372C}
.ev-contact{width:max-content;max-width:30em}
.ev-contact .cgs-lead{margin:.2em 0 .7em;max-width:20em}
.ev-mail{list-style:none;margin:0;padding:0;display:grid;gap:.18em}
.ev-mail{grid-template-columns:max-content max-content auto;column-gap:.9em}
.ev-mail li{display:grid;grid-template-columns:subgrid;grid-column:1/-1;align-items:center;min-height:2.2em}
.ev-mail .ev-il{white-space:nowrap;font:650 max(.66em,8.5px)/1.1 var(--cgs-sans,Figtree,system-ui,sans-serif);letter-spacing:.11em;text-transform:uppercase;opacity:.82}
.ev-mail a{font-size:max(.92em,10.5px);font-weight:540;white-space:nowrap}
.ev-mail .ev-copy{all:unset;font-size:max(.92em,10.5px);display:inline-flex;align-items:center;justify-content:flex-start;min-height:2.2em;min-width:2.2em;border-radius:999px;cursor:pointer}
.ev-join{width:20em}
.ev-join .cgs-lead{margin:.3em 0 1em;max-width:18em}
.ev-colo{width:auto;white-space:nowrap;display:flex;flex-direction:column;gap:.35em;font:480 max(.6em,8.5px)/1.3 var(--cgs-sans,Figtree,system-ui,sans-serif);letter-spacing:.02em}
.ev-colo p{opacity:.86}
.cgs .ev-sound.ev-sound{position:absolute;right:1.6em;bottom:1.3em;z-index:4;pointer-events:auto;font-size:max(.8em,10.5px)}
.ev-phone .ev-b{max-width:none}
.ev-phone .ev-event{height:auto;background:#F4EDE0;border-radius:.35em;box-shadow:0 .1em .3em rgba(74,56,34,.25),0 .8em 2em rgba(40,30,20,.3)}
.ev-phone .ev-card{position:relative;inset:auto}
.ev-phone .ev-slot{box-shadow:inset 0 0 0 1px rgba(33,31,28,.55);background:repeating-linear-gradient(90deg,transparent 0 .5em,rgba(244,237,224,1) .5em .85em) top/100% 1px no-repeat,repeating-linear-gradient(90deg,transparent 0 .5em,rgba(244,237,224,1) .5em .85em) bottom/100% 1px no-repeat}
.ev-phone .ev-when{position:relative;left:auto;right:auto;bottom:auto;margin-top:1.2em!important}
.ev-phone .ev-contact{max-width:none}
.ev-phone .ev-mail{grid-template-columns:1fr auto;column-gap:.6em}
.ev-phone .ev-mail .ev-il{grid-column:1/-1;min-height:0;margin-top:.5em}
.ev-phone .ev-mail a{white-space:normal;overflow-wrap:anywhere}
.ev-phone .ev-title{width:auto}
.cgs-reduced .ev-b{will-change:auto}
`;function b(n,v,{home:c="/",joinHref:m=p.join}={}){const s=document.createElement("style");s.textContent=g;const i=document.createElement("div");i.className="cgs-words ev-words";const o=a.items[0],d=new Date().getFullYear(),r=["#3F78D0","#EDB43C","#2FA6A0","#E8674C"].map(t=>`<i style="background:${t}"></i>`).join("");i.innerHTML=`<header class="ev-b ev-title" data-b="title"><div class="ev-in"><p class="cgs-label ev-crumb"><span class="ev-cube" aria-hidden="true">${r}</span><a class="cgs-link" href="${c}">${e(a.site.name)}</a></p><h1 class="cgs-display">${e(a.page.title)}</h1><p class="cgs-lead">${e(a.page.lead)}</p></div></header><section class="ev-sec" aria-labelledby="ev-h-cal"><div class="ev-b ev-board" data-b="board"><div class="ev-in"><h2 class="cgs-heading" id="ev-h-cal">${e(a.calendar)}</h2></div></div><ul class="ev-list"><li class="ev-b ev-event" data-b="card"><article class="ev-card" aria-labelledby="ev-h-ev0"><span class="ev-mark" aria-hidden="true">${r.replace(/<i /g,"<i data-g ")}</span><span class="ev-rule" aria-hidden="true" data-g></span><h3 id="ev-h-ev0">${e(o.title)}</h3><p class="ev-blurb">${e(o.blurb)}</p><p class="ev-when"><span class="ev-slot" aria-hidden="true" data-g="dash"></span><span class="ev-whenl">${e(o.date)}</span></p></article></li></ul></section><section class="ev-b ev-contact" data-b="contact" aria-labelledby="ev-h-contact"><div class="ev-in"><h2 class="cgs-heading" id="ev-h-contact">${e(a.contact.title)}</h2><p class="cgs-lead">${e(a.contact.lead)}</p><ul class="ev-mail">${a.contact.inboxes.map(t=>`<li><span class="ev-il">${e(t.label)}</span><a class="cgs-link" href="mailto:${t.address}">${t.address}</a><button class="ev-copy" type="button" aria-label="Copy ${t.address}" data-copy="${t.address}"></button></li>`).join("")}</ul></div></section><section class="ev-b ev-join" data-b="join" aria-labelledby="ev-h-join"><div class="ev-in"><h2 class="cgs-heading" id="ev-h-join">${e(a.join.heading)}</h2><p class="cgs-lead">${e(a.join.text)}</p><div class="cgs-actions"><a class="cgs-btn cgs-btn-primary" href="${a.join.cta.href}">${e(a.join.cta.label)} <span class="cgs-arrow" aria-hidden="true">→</span></a><a class="cgs-btn cgs-btn-secondary" href="${m}">${e(a.join.page)}</a></div></div></section><footer class="ev-b ev-colo" data-b="colo"><p>${e(a.site.footerLine(d))}</p><p>${e(a.site.credit)}</p></footer>`,n.append(s,i);const l={};for(const t of i.querySelectorAll("[data-b]"))l[t.dataset.b]=t;return{root:i,style:s,blocks:l,copies:[...i.querySelectorAll("[data-copy]")],focusables:t=>[...t.querySelectorAll("a,button")],destroy(){s.remove(),i.remove()}}}export{a as C,b as createWords};
