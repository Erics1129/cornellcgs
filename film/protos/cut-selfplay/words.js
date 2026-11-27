import{clamp as u}from"../../kit/ease.js";const A="Self-play",g=[{n:"01",title:"Frame",text:"Turn the rules of the game into code."},{n:"02",title:"Simulate",text:"Build a fast table where bots can play each other."},{n:"03",title:"Train",text:"Let them play game after game and learn from every win and loss."},{n:"04",title:"Evaluate",text:"Put the new bot against the old one to see if it got better."},{n:"05",title:"Ship",text:"Share it once it holds up."}],R=[["Turn the rules of the game into code."],["Build a fast table where bots","can play each other."],["Let them play game after game","and learn from every win and loss."],["Put the new bot against the old one","to see if it got better."],["Share it once it holds up."]],P=`
.spw{position:absolute;left:5.4%;top:8.6%;width:23.5em;padding-left:.95em;z-index:4;pointer-events:none}
.spw .spw-spine{position:absolute;left:0;top:.16em;bottom:.1em;width:1px;background:currentColor;opacity:.52;transform-origin:50% 0}
.spw .cgs-title{margin:0;font-size:1.5em;line-height:1.05;font-weight:560;letter-spacing:-.006em;font-variation-settings:"opsz" 48}
.spw-scale{position:relative;margin:.8em 0 0;padding-bottom:.62em}
.spw-scale .spw-base{position:absolute;left:-.95em;right:0;bottom:0;height:1px;background:currentColor;opacity:.5;transform-origin:0 50%}
.spw-scale .spw-tick{position:absolute;bottom:0;width:1px;height:.58em;margin-left:-.5px;background:currentColor;opacity:.5;transform-origin:50% 100%}
.spw-reads{display:flex;justify-content:space-between;align-items:flex-end;gap:.55em}
.spw.spw-tight{width:max(23.5em,318px)}
.spw.spw-tight .spw-r b{letter-spacing:.04em}
.spw.spw-tight .spw-r b i{margin-right:.28em}
.spw-r{position:relative}
.spw-r b{display:block;font:620 max(9px,.62em)/1.15 var(--cgs-sans);letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;
  font-variant-numeric:tabular-nums lining-nums;text-shadow:var(--cgs-ts);padding:0 .02em}
.spw-r b i{font-style:normal;opacity:.7;margin-right:.42em}
.spw-r .spw-seg{position:absolute;left:-.15em;right:-.15em;bottom:-.62em;height:1px;background:currentColor;border-radius:0 0 .5px .5px;opacity:0}
.spw-lines{position:relative;margin:.95em 0 0;height:2.9em}
.spw-line{position:absolute;left:0;top:0;width:100%;margin:0}
.spw-line .cgs-body{margin:0;max-width:none;line-height:1.4}
.spw-line span{display:block;width:max-content}
.spw-list{display:none;margin:.9em 0 0;padding:0;list-style:none}
.spw-list li{display:grid;grid-template-columns:2.2em 1fr;align-items:baseline;margin:0 0 .45em}
.spw-list .cgs-label{margin:0;font-variant-numeric:tabular-nums}
.spw-list .cgs-body{margin:0;max-width:none;font-size:.8em;line-height:1.3}
.spw-list .cgs-body span{display:block;width:max-content}
.spw.spw-reduced .spw-lines{display:none}
.spw.spw-reduced .spw-list{display:block}
@media (max-width: 760px){ .spw{width:21em} }
`,H=r=>(r=u(r),1-Math.pow(1-r,4)),N=r=>(r=u(r),r*r);function D(r,x){const v=document.createElement("style");v.textContent=P,r.append(v);const c=document.createElement("div");c.className="spw cgs-photo cgs-dusk"+(x.reduced?" spw-reduced":""),c.innerHTML=`
    <i class="spw-spine"></i>
    <h2 class="cgs-title">${A}</h2>
    <div class="spw-scale" aria-label="The five steps">
      <i class="spw-base"></i>${g.map(()=>'<i class="spw-tick"></i>').join("")}
      <div class="spw-reads">${g.map(s=>`<div class="spw-r"><b><i>${s.n}</i>${s.title}</b><i class="spw-seg"></i></div>`).join("")}</div>
    </div>
    <div class="spw-lines">${g.map((s,e)=>`<div class="spw-line" data-step="${s.n}"><p class="cgs-body">${R[e].map(i=>`<span>${i}</span>`).join("")}</p></div>`).join("")}</div>
    <ol class="spw-list">${g.map((s,e)=>`<li><span class="cgs-label">${s.n}</span><p class="cgs-body">${R[e].map(i=>`<span>${i}</span>`).join("")}</p></li>`).join("")}</ol>`,r.append(c);const w=s=>c.querySelector(s),b=s=>[...c.querySelectorAll(s)],S=w(".spw-spine"),T=w(".cgs-title"),C=w(".spw-base"),E=b(".spw-tick"),$=b(".spw-r"),B=b(".spw-seg"),q=b(".spw-line");function L(){c.classList.remove("spw-tight");const s=$.reduce((l,n)=>l+n.getBoundingClientRect().width,0),e=w(".spw-reads").getBoundingClientRect().width;e&&s>e*.86&&c.classList.add("spw-tight");const i=w(".spw-reads").getBoundingClientRect(),a=w(".spw-scale").getBoundingClientRect().left;i.width&&$.forEach((l,n)=>{const h=l.getBoundingClientRect();E[n].style.left=(h.left+h.width/2-a).toFixed(1)+"px"})}function k(s,e,i,{dx:a=.7,dy:l=.42,rot:n=-1.1,up:h=1.1}={}){if(x.reduced){s.style.transform="",s.style.opacity="",s.style.visibility="";return}const p=H(e),d=N(i),y=(1-p)*a-d*.25,f=(1-p)*l-d*h,o=(1-p)*n+d*.6,t=u(e*1.4-.05)*(1-u(i*1.15));s.style.visibility=t<.003?"hidden":"visible",s.style.opacity=t.toFixed(3),s.style.transform=t<.003||p>=1&&d<=0?"":`translate3d(${y.toFixed(3)}em,${f.toFixed(3)}em,0) rotate(${o.toFixed(3)}deg)`}return{el:c,layout:L,draw(s,e){const i=x.reduced,a=(o,t)=>i?1:u((s-o)/(t-o)),l=i?0:a(e.out[0],e.out[1]),[n,h]=e.in,p=h-n,d=a(n,n+p*.25),y=a(n+p*.15,n+p*.45);S.style.transform=d<1?`scaleY(${d.toFixed(4)})`:"",C.style.transform=y<1?`scaleX(${y.toFixed(4)})`:"",S.style.opacity=i?"":(.52*Math.min(1,d*3)*(1-l)).toFixed(3),C.style.opacity=i?"":(.5*Math.min(1,y*3)*(1-l)).toFixed(3),k(T,a(n+p*.05,n+p*.55),l,{dx:.9,dy:.5,rot:-1.6,up:1.6}),E.forEach((o,t)=>{const m=a(n+p*(.3+.05*t),n+p*(.45+.05*t));o.style.transform=m<1?`scaleY(${m.toFixed(3)})`:"",o.style.opacity=i?"":(.5*m*(1-l)).toFixed(3)});let f=0;for(let o=0;o<g.length;o++)s>=e.steps[o]&&(f=o);$.forEach((o,t)=>{const m=a(n+p*(.38+.07*t),n+p*(.7+.06*t));k(o,m,l,{dx:.5,dy:.32,rot:0,up:1.2+.08*t});const F=i?0:a(e.steps[t],e.steps[t]+.012),M=t<g.length-1?a(e.steps[t+1],e.steps[t+1]+.012):0,j=i?0:u(F-M)*(1-l);B[t].style.opacity=(.95*j).toFixed(3),B[t].style.height=`${(1+1.7*j).toFixed(2)}px`;const z=t<f?1:0;o.querySelector("b").style.opacity=i?"":(t===f?1:z?.78:.6).toFixed(2)}),q.forEach((o,t)=>{const m=i?1:t===0?a(e.steps[0],e.steps[0]+.05):a(e.steps[t]+.004,e.steps[t]+.048),F=t<g.length-1?a(e.steps[t+1]-.014,e.steps[t+1]+.004):l;k(o,m,Math.max(F,l),{dx:.55,dy:.5,rot:-.8,up:.9})})},destroy(){c.remove(),v.remove()}}}export{A as HEADING,g as STEPS,D as createWords};
