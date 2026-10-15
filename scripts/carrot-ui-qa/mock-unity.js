// Mock Unity player for the Carrot Defense page (QA only; never shipped). Injected with page.addInitScript before the page loads; the
// harness routes /unity/carrot/Build/carrot.loader.js to `window.__qaLoader` (see qa.mjs) and the three .unityweb files to tiny bodies.
// It stands in for CarrotGame: it records every SendMessage, answers the page's commands the way the real simulation would for the
// purposes of the HUD (load, start, pause/setPaused, speed, select/clear, buy/upgrade/sell, next), advances the game clock at the
// selected speed and publishes the state at 10 Hz like CarrotGame.Update. Fixtures (window.__qaFixtures) are whole snapshots.
(()=>{
 const qa=window.__qa={commands:[],messages:[],state:null,publishes:0,clockPaused:false,reactions:true,
  log(kind,value){this.messages.push({t:performance.now(),kind,value})},
 }
 const levelOf=id=>(window.__qaGameData?.levels||[]).find(l=>l.id===id)
 const towersOf=()=>window.__qaGameData?.towers||[]
 const clone=v=>JSON.parse(JSON.stringify(v))
 qa.base=(level=5,extra={})=>{const l=levelOf(level)||{id:level,name:'Level '+level,biome:'garden',waves:8,startingGold:300}
  return {level:l.id,name:l.name,biome:l.biome,wave:0,waves:l.waves,coins:l.startingGold,health:10,progress:0,phase:'ready',paused:false,speed:1,nextWave:0,enemyCount:0,
   selection:{type:'',id:-1,kind:'',tier:0,hp:0,maxHp:0,refund:0,x:.5,y:.5,partners:0,superName:'',spent:0},boss:null,monsters:[],minibosses:[],notice:'',cleared:0,blockersRemaining:3,towerCount:0,
   blind:0,blindTint:0,blindAlpha:0,elapsed:0,reinforcements:0,reinforcementTier:0,reinforcementIn:0,superPairs:0,mergeUndo:0,mergeArmed:0,muted:false,...extra}}
 qa.set=(state)=>{qa.state=clone(state);qa.publish()}
 qa.patch=(patch)=>{qa.state={...qa.state,...clone(patch)};qa.publish()}
 qa.publish=()=>{if(!qa.state)return;qa.publishes++;window.dispatchEvent(new CustomEvent('carrot-state',{detail:clone(qa.state)}))}
 qa.fixture=(name)=>{const f=window.__qaFixtures?.[name];if(!f)throw new Error('no fixture '+name);qa.set(typeof f==='function'?f(qa):f)}
 let last=performance.now(),acc=0
 const loop=()=>{const now=performance.now(),dt=Math.min(.1,(now-last)/1000);last=now;const s=qa.state
  if(s&&!qa.clockPaused&&s.phase==='playing'&&!s.paused){const rate=typeof s.timeScale==='number'?s.timeScale:s.speed;s.elapsed=(s.elapsed||0)+dt*rate;if(typeof s.waveElapsed==='number')s.waveElapsed+=dt*rate;if(s.nextWave>0)s.nextWave=Math.max(0,s.nextWave-dt*rate);if(s.boss&&s.boss.castRemaining>0)s.boss.castRemaining=Math.max(0,s.boss.castRemaining-dt*rate)}
  acc+=dt;if(acc>=.1){acc=0;qa.publish()}
  setTimeout(loop,16)}
 setTimeout(loop,16)
 const pad=(id)=>{const pads=window.__qaPads||[];return pads[id%Math.max(1,pads.length)]||{x:.5,y:.5}}
 function command(c){
  qa.commands.push(c);const s=qa.state;if(!qa.reactions||!s)return
  const sel=(type,id,extra={})=>({type,id,kind:'',tier:0,hp:0,maxHp:0,refund:0,x:.5,y:.5,partners:0,superName:'',spent:0,...extra})
  switch(c.type){
   case 'load':{const run=(s.runId||0)+1;const keepV2=qa.v2||typeof s.v==='number';qa.state=qa.base(c.level,keepV2?{v:2,runId:run,caps:s.caps||[],mode:c.mode||'normal',waveElapsed:0,incoming:[],stats:null,judgement:{seq:0,kind:'',wave:0,value:0}}:{});break}
   case 'start':if(s.phase==='ready'){s.phase='playing';s.wave=1;if(typeof s.v==='number')s.waveElapsed=0}break
   case 'pause':if(s.phase==='playing')s.paused=!s.paused;break
   case 'setPaused':if(s.phase==='playing'||s.phase==='ready')s.paused=!!c.value;break
   case 'speed':s.speed=c.value>=1.5?2:1;break
   case 'select':{if(c.selectionType==='pad'){const p=pad(c.id);s.selection=sel('pad',c.id,{kind:'pad',x:p.x,y:p.y})}else if(c.selectionType==='tower'){const t=(qa.towers||[]).find(x=>x.id===c.id)||{kind:'seed',tier:1,x:.5,y:.5,spent:80};s.selection=sel('tower',c.id,{kind:t.kind,tier:t.tier,refund:Math.floor(t.spent*.7),spent:t.spent,x:t.x,y:t.y})}else if(c.selectionType==='enemy'){const m=(s.minibosses||[]).find(x=>x.id===c.id);s.selection=sel('enemy',c.id,{kind:m?.kind||'nibble',hp:m?.hp||10,maxHp:m?.maxHp||10,x:m?.x||.5,y:m?.y||.5})}else s.selection=sel('',-1);break}
   case 'clear':s.selection=sel('',-1);break
   case 'preview':break
   case 'buy':{const d=towersOf().find(t=>t.id===c.kind);if(!d||s.selection?.type!=='pad'||s.coins<d.cost[0])break;s.coins-=d.cost[0];s.towerCount=(s.towerCount||0)+1;const id=100+s.towerCount;(qa.towers=qa.towers||[]).push({id,kind:c.kind,tier:1,spent:d.cost[0],x:s.selection.x,y:s.selection.y});s.selection=sel('tower',id,{kind:c.kind,tier:1,refund:Math.floor(d.cost[0]*.7),spent:d.cost[0],x:s.selection.x,y:s.selection.y});break}
   case 'upgrade':{const t=(qa.towers||[]).find(x=>x.id===s.selection?.id);const d=t&&towersOf().find(x=>x.id===t.kind);if(!t||!d||t.tier>=4||s.coins<d.cost[t.tier])break;s.coins-=d.cost[t.tier];t.spent+=d.cost[t.tier];t.tier++;s.selection={...s.selection,tier:t.tier,refund:Math.floor(t.spent*.7),spent:t.spent};break}
   case 'sell':{const t=(qa.towers||[]).find(x=>x.id===s.selection?.id);if(t){s.coins+=Math.floor(t.spent*.7);qa.towers=qa.towers.filter(x=>x!==t);s.towerCount=Math.max(0,(s.towerCount||1)-1)}s.selection=sel('',-1);break}
   case 'next':if(s.nextWave>0){s.wave++;s.nextWave=0;if(typeof s.waveElapsed==='number')s.waveElapsed=0}break
   case 'mute':s.muted=!!c.value;break
  }
  qa.publish()
 }
 qa.onMessage=(object,method,value)=>{qa.log(method,value);if(method==='Command'){try{command(JSON.parse(value))}catch(e){qa.log('error',String(e))}}}
 window.__qaLoader=()=>{window.createUnityInstance=async(canvas,config,progress)=>{progress(.4);await new Promise(r=>setTimeout(r,20));progress(1);
  const ctx=canvas.getContext('2d');const paint=()=>{if(!ctx)return;canvas.width=canvas.clientWidth;canvas.height=canvas.clientHeight;const g=ctx.createLinearGradient(0,0,0,canvas.height);g.addColorStop(0,'#3b5a37');g.addColorStop(1,'#1d2f1c');ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);
   for(const p of window.__qaPads||[]){ctx.fillStyle='#c9a26d';ctx.beginPath();ctx.ellipse(p.x*canvas.width,p.y*canvas.height,22,14,0,0,7);ctx.fill()}}
  paint();new ResizeObserver(paint).observe(canvas)
  if(!qa.state)qa.state=qa.base(1)
  return {SendMessage:(o,m,v)=>qa.onMessage(o,m,v),Quit:async()=>{}}}}
})()
