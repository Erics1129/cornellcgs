import{HREF as vt}from"../../kit/page.js";import{COPY as D,FIRST_ROLL as A}from"./lib.js";const wt=25,Ft=13,$t=`
.cg-quiet{position:absolute;left:-6%;top:-4%;width:58%;height:76%;z-index:3;pointer-events:none;
  background:radial-gradient(ellipse 60% 58% at 36% 42%, rgb(3 30 44 / .6), rgb(3 30 44 / .44) 40%, rgb(3 30 44 / .15) 66%, transparent 86%)}
.cg-blk{position:absolute;left:5.6%;top:9.5%;width:21.5em;padding-left:.95em;z-index:4;pointer-events:none;--cgs-shade:4 30 42}
.cg-blk a, .cg-blk button{pointer-events:auto}
.cg-spine{position:absolute;left:0;top:.18em;bottom:.12em;width:1px;background:currentColor;opacity:.55;transform-origin:50% 0}
.cg-blk .cgs-label{display:block}
.cg-sent{margin:.34em 0 0;font-size:1.28em;line-height:1.2;font-weight:540;letter-spacing:-.007em;font-variation-settings:"opsz" 30}
.cg-ln{display:block;width:max-content}
.cg-w{display:inline-block;white-space:nowrap}
.cg-level{display:block;margin:.95em 0 0;font:620 max(9px,.62em)/1.2 var(--cgs-sans);letter-spacing:.105em;text-transform:uppercase;color:var(--cgs-fg-soft);text-shadow:var(--cgs-ts)}
.cg-scale{position:relative;margin:.55em 0 0;padding-bottom:.6em}
.cg-base{position:absolute;left:-.95em;right:0;bottom:0;height:1px;background:currentColor;opacity:.5;transform-origin:0 50%}
.cg-tick{position:absolute;bottom:0;width:1px;height:.62em;margin-left:-.5px;background:currentColor;opacity:.5;transform-origin:50% 100%}
.cg-gauge{position:absolute;left:0;bottom:-1px;height:3px;background:currentColor;opacity:.92;transform-origin:0 50%;border-radius:1px}
.cg-gauge i{position:absolute;inset:0;background:#8FE3C9;transform-origin:0 50%;opacity:0}
.cg-reads{display:flex;justify-content:space-between;align-items:flex-end}
.cg-r b{display:block;font:620 max(9px,.66em)/1.15 var(--cgs-sans);letter-spacing:.105em;text-transform:uppercase;white-space:nowrap;
  font-variant-numeric:tabular-nums lining-nums;text-shadow:var(--cgs-ts);padding:0 .02em}
.cg-r b em{font-style:normal;display:inline-block;transform-origin:50% 80%}
.cg-r{position:relative;pointer-events:auto;cursor:default}
.cg-r .cg-seg{position:absolute;left:-.2em;right:-.2em;bottom:-.6em;height:calc(1px + 1.6px * var(--hk, 0));background:currentColor;opacity:calc(.95 * var(--hk, 0));border-radius:0 0 .5px .5px;transition:height .12s, opacity .12s}
.cg-r:hover{--hk:1}
.cg-say{display:grid;margin:.85em 0 0}
.cg-say > *{grid-area:1/1}
.cg-blk .cg-rule{margin:0;color:var(--cgs-fg-soft);line-height:1.38;max-width:none;font-size:max(.86em,11px);text-wrap:balance}
.cg-res{opacity:0}
.cg-res .cgs-label{margin:0 0 .3em;color:#BFF5DF}
.cg-res p{margin:0;font-size:max(.86em,11px);line-height:1.38;min-height:2.76em;color:var(--cgs-fg);text-shadow:var(--cgs-ts);text-wrap:balance}
.cg-acts{display:flex;align-items:center;justify-content:space-between;gap:.6em;margin-top:.8em}
.cg-acts .cgs-btn{padding-left:1.05em;padding-right:1.05em}
.cg-keys{display:inline-flex;gap:.22em;font:650 max(.62em,9px)/1 var(--cgs-sans);color:var(--cgs-fg-soft)}
.cg-keys b{display:inline-grid;place-items:center;width:1.85em;height:1.85em;border-radius:.38em;box-shadow:inset 0 0 0 1px rgb(251 248 241 / .55);text-shadow:var(--cgs-ts)}
.cg-keys b.on{background:#FBF8F1;color:#0B3A4A;box-shadow:none;translate:0 1px;text-shadow:none}
.cg-small .cg-keys{display:none}
.cg-small.cg-blk{width:24em;left:3.5%;top:6%}
.cg-sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`,Mt=[["We","make","our","own","games."],["Ink","Maze,","Forge","or","Fold,"],["and","Carrot","Defense","3D."]],O=(r,F=0,$=1)=>r<F?F:r>$?$:r,b=(r,F,$)=>{const L=O(($-r)/(F-r));return L*L*(3-2*L)},rt=r=>1-(1-O(r))**3,lt=r=>O(r)**2;function Lt(r,F,{seconds:$=10,arrive:L=.06,leave:gt=.742}={}){const B=document.createElement("style");B.textContent=$t;const S=document.createElement("div");S.className="cg-quiet",S.setAttribute("aria-hidden","true");const f=document.createElement("div");f.className="cg-blk cgs-photo";const R=t=>`<span class="cg-w">${t}</span>`;f.innerHTML=`
    <i class="cg-spine" aria-hidden="true"></i>
    <span class="cgs-label cg-label">${R("Mini")} ${R("games")}</span>
    <p class="cgs-title cg-sent">${Mt.map(t=>`<span class="cg-ln">${t.map(R).join(" ")}</span>`).join(" ")}</p>
    <span class="cg-level">${D.games[0]} <span aria-hidden="true">·</span> Level 1 of ${wt} <span aria-hidden="true">·</span> ${A.name}</span>
    <div class="cg-scale" aria-hidden="true">
      <i class="cg-base"></i><i class="cg-tick"></i><i class="cg-tick"></i><i class="cg-tick"></i>
      <i class="cg-gauge"><i></i></i>
      <div class="cg-reads">
        <div class="cg-r"><b>Ink <em class="cg-ink">${A.ink}</em>&#8202;/&#8202;${A.ink}</b><i class="cg-seg"></i></div>
        <div class="cg-r"><b>Moves <em class="cg-moves">0</em></b><i class="cg-seg"></i></div>
        <div class="cg-r"><b>Blocks left <em class="cg-left">12</em></b><i class="cg-seg"></i></div>
      </div>
    </div>
    <div class="cg-say">
      <p class="cgs-body cg-rule">${D.inkLead.replace(/ ink\.$/,"&nbsp;ink.")}</p>
      <div class="cg-res" aria-hidden="true"><span class="cgs-label cg-res-k">Level cleared</span><p class="cg-res-t"></p></div>
    </div>
    <div class="cg-acts"><a class="cgs-btn cgs-btn-secondary cg-play" href="${vt.games}">${D.cta} <span class="cgs-arrow">→</span></a><span class="cg-keys" aria-hidden="true"><b data-k="left">←</b><b data-k="up">↑</b><b data-k="down">↓</b><b data-k="right">→</b></span></div>
    <p class="cg-sr" role="status" aria-live="polite"></p>`,r.append(B,S,f);const o=t=>f.querySelector(t),W=t=>[...f.querySelectorAll(t)],K=o(".cg-spine"),N=W(".cg-label .cg-w"),G=W(".cg-sent .cg-w"),Q=o(".cg-level"),dt=o(".cg-scale"),pt=o(".cg-base"),V=W(".cg-tick"),_=o(".cg-gauge"),T=o(".cg-gauge i"),J=W(".cg-r b"),j=o(".cg-ink"),mt=o(".cg-moves"),ft=o(".cg-left"),U=o(".cg-say"),Z=o(".cg-rule"),tt=o(".cg-res"),et=o(".cg-res-k"),xt=o(".cg-res-t"),st=o(".cg-acts"),at=o(".cg-play"),ht=W(".cg-keys b"),ut=o(".cg-sr");let l=null,nt=new Map,M=null;function H(){const t=parseFloat(getComputedStyle(f).fontSize)||20,a=J.map(n=>({x:n.parentElement.offsetLeft,w:n.parentElement.offsetWidth})),p=dt.offsetWidth,g=[(a[0].x+a[0].w+a[1].x)/2,(a[1].x+a[1].w+a[2].x)/2,p];V.forEach((n,u)=>{n.style.left=g[u].toFixed(1)+"px"}),_.style.width=Math.max(4,g[0]-.35*t).toFixed(1)+"px",l={fs:t,m:p,tx:g,reads:a,x0:-.95*t};const v=f.offsetParent||r,x=n=>{let u=0,s=0,e=n;for(;e&&e!==v;)u+=e.offsetLeft,s+=e.offsetTop,e=e.offsetParent;return[u+n.offsetWidth/2,s+n.offsetHeight/2]};nt=new Map([...N,...G,Q,U,st].map(n=>[n,x(n)]))}function bt(t){f.classList.toggle("cg-small",t<900),H()}const ot=$,k=F.reduced;function yt(t,a=null){M=a&&a.k>.002?{x:(a.x+1)/2*a.W,y:(a.y+1)/2*a.H,W:a.W,k:a.k}:null;const p=(t-L)*ot,g=(t-gt)*ot,v=k?p>0&&g<.9?1:0:rt(p/.5)*(1-lt((g-.55)/.35));K.style.transform=v<.999?`scaleY(${v.toFixed(4)})`:"",K.style.opacity=v>.001?"":"0";const x=(s,e,h,E,d,i=1)=>{const m=p-e,w=g-E;if(m<=0||w>=.62){s.style.opacity="0",s.style.transform=k?"":`translate3d(0,${h}em,0)`;return}let C=Math.min(1,m/.25),y=0,I=0,q=0;if(!k){const c=1-b(.95,1.3,m);I=h*Math.exp(-6*m)*Math.cos(9*m)*c,y=.11*i*Math.sin(2*Math.PI*1.4*m+d)*Math.exp(-3*m)*c,q=2*i*Math.sin(2*Math.PI*1.4*m+d+.6)*Math.exp(-3.4*m)*c}if(w>0){const c=O(w/.62);C*=1-b(.15,1,c),k||(I-=1.5*c*c+.25*c,y+=.08*i*Math.sin(c*9+d),q+=3*i*Math.sin(c*5+d*1.3)*c)}if(M&&!k){const c=nt.get(s);if(c){const X=c[0]-M.x,it=c[1]-M.y,P=Math.hypot(X,it)||1,Y=M.k*Math.exp(-((P/(.2*M.W))**2))*b(.2,1,m-1.2)*(w>0?0:1)*i;y+=X/P*.09*Y,I+=it/P*.063*Y,q+=X/P*1.6*Y}}s.style.opacity=C<.999?C.toFixed(3):"",s.style.transform=Math.abs(y)+Math.abs(I)+Math.abs(q)>1e-4?`translate3d(${y.toFixed(4)}em,${I.toFixed(4)}em,0) rotate(${q.toFixed(3)}deg)`:""};N.forEach((s,e)=>x(s,.12+e*.06,.7,.42-e*.04,e,.6)),G.forEach((s,e)=>x(s,.3+e*.07,1.6,.3-e*.012,e)),x(Q,1.05,.9,.16,3,.4);const n=k?p>1.1&&g<.4?1:0:rt((p-1.1)/.55)*(1-lt((g-.1)/.32));if(pt.style.transform=n<.999?`scaleX(${n.toFixed(4)})`:"",ct=n,l){const s=l.x0+(l.m-l.x0)*n;V.forEach((e,h)=>{const E=b(l.tx[h]-.4*l.fs,l.tx[h]+.2*l.fs,s);e.style.transform=E<.999?`scaleY(${E.toFixed(3)})`:""}),J.forEach((e,h)=>{const d=1-b(l.reads[h].x-.6*l.fs,l.reads[h].x+1.2*l.fs,s);e.style.opacity=d>.001?(1-d).toFixed(3):"",e.style.transform=!k&&d>.001?`translate3d(0, ${(-.34*d).toFixed(3)}em, 0)`:""})}x(U,1.5,.9,.06,5,.3),x(st,1.7,.9,0,6,.3);const u=p>0&&g<.95;S.style.opacity=(b(0,.9,p)*(1-b(.1,.9,g))).toFixed(3),f.style.visibility=u?"":"hidden",at.tabIndex=u?0:-1}let z={ink:-1,at:-1e9,prev:-1},ct=1;function kt({ink:t,moves:a,left:p,inkChangedAt:g,T:v,cost:x=0,nowMs:n=0,status:u=0,result:s=null,key:e=null,drop:h=null}){t!==z.ink&&(z={ink:t,at:g,prev:z.ink});const d=z.prev>t?O((v-z.at)/.32):1,i=d<1?Math.sin(Math.PI*Math.min(1,d*1.6))*(1-d):0;j.textContent=String(t),mt.textContent=String(a),ft.textContent=String(p),j.style.transform=i>.001?`translateY(${(-.08*i).toFixed(3)}em) scale(${(1+.14*i).toFixed(3)})`:"",j.style.color=i>.001?`color-mix(in srgb, #8FE3C9 ${(i*80).toFixed(0)}%, currentColor)`:"";const m=t/A.ink;_.style.transform=`scaleX(${(m*ct).toFixed(4)})`,T.style.background=i>.001&&h?h:"",T.style.opacity=i>.001?(.9*i).toFixed(3):x>0?(.35+.3*Math.sin(n/140)).toFixed(3):"0",T.style.transform=x>0&&t>0?`scaleX(1) translateX(${((t-x)/t*100).toFixed(2)}%)`:"";const w=b(.45,1,u),C=1-b(0,.45,u);tt.style.opacity=w.toFixed(3),tt.style.translate=`0 ${((1-w)*.3).toFixed(3)}em`,Z.style.opacity=C.toFixed(3),Z.style.translate=`0 ${((C-1)*.3).toFixed(3)}em`,s&&(et.textContent=s.k,xt.textContent=s.t,et.style.color=s.k==="Out of ink"?"#FFC2B0":""),ht.forEach(y=>y.classList.toggle("on",!!e&&y.dataset.k===e))}return H(),{el:f,play:at,resize:bt,layout:H,words:yt,readings:kt,FLOORS:Ft,announce(t){ut.textContent=t},destroy(){B.remove(),S.remove(),f.remove()}}}export{Lt as mountWords};
