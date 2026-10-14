// Fixture snapshots for the mock player (QA only). Each fixture is a function of the mock (window.__qa) returning a whole snapshot.
// v2 fixtures carry the bridge-contract fields; `v1(name)` strips them to check the page against today's shipped player.
(()=>{
 const pads=[[.18,.3],[.5,.3],[.82,.3],[.18,.55],[.5,.55],[.82,.55],[.18,.8],[.5,.8],[.82,.8]].map(([x,y])=>({x,y}))
 window.__qaPads=pads
 const carrot={carrotX:.62,carrotY:.42},spawns={spawnPoints:[{x:.06,y:.32},{x:.08,y:.74}]}
 const v2=(extra={})=>({v:2,runId:1,timeScale:undefined,caps:[],waveElapsed:0,incoming:[],speedHold:false,speedHoldReason:'',
  stats:{kills:0,leaks:0,earned:0,streak:0,bestStreak:0,perfectWaves:0,waveLeaks:[],leakKinds:[],leakCounts:[],dmgKinds:[],dmgValues:[]},
  judgement:{seq:0,kind:'',wave:0,value:0},lossCauses:[],mode:'normal',...carrot,...spawns,...extra})
 const pkt=(kind,count,route,at,span,t={})=>({kind,count,route,air:!!t.air,armor:!!t.armor,shield:!!t.shield,heal:!!t.heal,mini:!!t.mini,at,span,wave:t.wave})
 const sel=(type,id,extra={})=>({type,id,kind:'',tier:0,hp:0,maxHp:0,refund:0,x:.5,y:.5,partners:0,superName:'',spent:0,...extra})
 const f=window.__qaFixtures={
  ready:qa=>qa.base(5,v2()),
  pad:qa=>{const i=qa.padIndex||0,p=pads[i];return qa.base(5,v2({selection:sel('pad',i,{kind:'pad',x:p.x,y:p.y})}))},
  tower:qa=>{qa.towers=[{id:101,kind:'seed',tier:2,spent:145,x:.42,y:.52}];return qa.base(5,v2({coins:520,towerCount:1,selection:sel('tower',101,{kind:'seed',tier:2,refund:101,spent:145,x:.42,y:.52})}))},
  waveAir:qa=>qa.base(6,v2({phase:'playing',wave:3,elapsed:61,waveElapsed:1.2,coins:410,health:9,progress:.21,enemyCount:14,
   incoming:[pkt('moth',8,0,.65,5.5,{air:true}),pkt('shell',7,1,1.4,4.7,{armor:true}),pkt('scarab',5,0,9.2,3.1,{armor:true,shield:true}),pkt('dash',12,1,16,8,{wave:4}),pkt('swarm',24,0,18,5.5,{wave:4})]})),
  bossUproot:qa=>{qa.towers=[{id:101,kind:'seed',tier:3,spent:265,x:.44,y:.5},{id:102,kind:'mortar',tier:5,spent:1250,x:.6,y:.62}]
   return qa.base(4,v2({phase:'playing',wave:8,elapsed:212,waveElapsed:14,coins:385,health:7,progress:.86,enemyCount:9,speedHold:true,speedHoldReason:'uproot',speed:2,timeScale:1,
    boss:{id:77,kind:'garden',name:'Brambleback',hp:1640,maxHp:2600,shield:0,maxShield:0,phase:2,ability:'uproot',castRemaining:2.2,abilityTarget:101,stage:1,remaining:9.5,eta:26,routeFraction:.62,contactFatal:false,windup:2.5,actionable:true},
    minibosses:[{id:81,kind:'warDrummer',name:'War Drummer',hp:180,maxHp:230,shield:0,maxShield:0,phase:1,ability:'',castRemaining:0,x:.33,y:.58,visible:true,castTotal:0}],
    monsters:[{id:90,kind:'nibble',hp:20,maxHp:60,shield:0,maxShield:0,x:.3,y:.66,visible:true},{id:91,kind:'shell',hp:90,maxHp:125,shield:0,maxShield:0,x:.36,y:.7,visible:true}],
    incoming:[pkt('boss',1,0,.65,0),pkt('nibble',14,1,2,10),pkt('dash',11,2,6,8)],judgement:{seq:4,kind:'flawless',wave:7,value:0}}))},
  challengeDeadline:qa=>qa.base(25,v2({phase:'playing',wave:5,elapsed:150,waveElapsed:6,coins:640,health:10,progress:.55,enemyCount:6,
   boss:{id:5,kind:'tornado',name:'Giant Tornado',hp:2900,maxHp:4200,shield:0,maxShield:0,phase:2,ability:'gust',castRemaining:.9,abilityTarget:-1,stage:1,remaining:6.4,eta:21,routeFraction:.79,contactFatal:true,windup:1.2,actionable:false},
   incoming:[pkt('swarm',4,0,.2,1),pkt('swarm',4,1,.3,1)]})),
  won:qa=>qa.base(5,v2({phase:'won',wave:8,elapsed:388,coins:245,health:9,progress:1,blockersRemaining:0,
   stats:{kills:131,leaks:1,earned:1400,streak:5,bestStreak:5,perfectWaves:7,waveLeaks:[0,0,0,0,0,1,0,0],leakKinds:['moth'],leakCounts:[1],dmgKinds:['seed','frost','prism','mortar','storm','bamboo'],dmgValues:[14200,5200,9100,8800,4100,2600]}})),
  lost:qa=>qa.base(8,v2({phase:'lost',wave:9,elapsed:402,coins:120,health:0,progress:.74,
   lossCauses:[{kind:'moth',route:1,wave:7,count:4,airUncovered:true,counter:'starfruit'},{kind:'shell',route:0,wave:9,count:3,airUncovered:false,counter:'prism'}]})),
 }
 // the same scenes as a v1 build sends them (none of the contract fields)
 const strip=['v','runId','timeScale','caps','waveElapsed','incoming','speedHold','speedHoldReason','stats','judgement','lossCauses','mode','carrotX','carrotY','spawnPoints']
 for(const name of Object.keys(f))f['v1-'+name]=qa=>{const s=f[name](qa);for(const k of strip)delete s[k];if(s.boss)for(const k of ['remaining','eta','routeFraction','contactFatal','windup','actionable','abilityTarget'])delete s.boss[k];for(const m of s.minibosses||[])delete m.castTotal;return s}
})()
