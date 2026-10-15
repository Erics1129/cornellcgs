// Carrot Defense wave generator: the one source of truth for the campaign's difficulty pass.
// Deterministic from the pre-retune strings in carrot-waves.baseline.json; writes the Waves arrays and the
// HPScale / GapScale / Breather / PacketOverlap tables between the WAVES:BEGIN / WAVES:END markers of CarrotData.cs.
//   node scripts/carrot-waves.mjs             checks that CarrotData.cs holds exactly the generated block
//   node scripts/carrot-waves.mjs --write     rewrites the block
//   node scripts/carrot-waves.mjs --baseline  prints the frozen pre-retune pressure and stream arrays (the Geometry invariants)
//   node scripts/carrot-waves.mjs --pressure  prints the per-level table (counts, stream seconds, pressure, ratio) for balance-results.md
//   --step=K (default 6) applies difficulty pass 2 up to step K (K<2 reproduces pass 1 exactly; see PASS 2 below)
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
const stepArg=process.argv.find(a=>a.startsWith('--step='))
const STEP=stepArg?Number(stepArg.split('=')[1]):6
// The shipped curve is "relief" (balance-results.md records the rejected "threat per coin" variants A-B and C-D):
// the first 60% of the waves ease from m0 to 1, the rest climb to 1 + a, all times the chapter factor c:
// m0 = 1 / .7 / .7 / .65 / .8, a = .1 / .8 / .7 / .28 / .15, c = 1 / 1.1 / 1.2 / 1 / 1 for L1-4 / L5-8 / L9-12 / L13-24 / L25-28
// (the dial fit showed chapters 1-2 needed more to sit inside the dial range; chapter 1 also walks 1.2x faster,
// CarrotData.ChapterPace, so its levels do not run long). CARROT_CURVE overrides for experiments.
const CURVE={mode:'relief',m:[1,.7,.7,.65,.8],a:[.1,.8,.7,.28,.15],c:[1,1.1,1.2,1,1],f0:.45,k:1.6,lo:.55,hi:1.7,power:1,smooth:0,from:1,early:0,...(process.env.CARROT_CURVE?JSON.parse(process.env.CARROT_CURVE):{})}
const source=resolve('unity/CarrotDefense/Assets/Scripts/CarrotData.cs')
const baseline=JSON.parse(readFileSync(resolve('scripts/carrot-waves.baseline.json'),'utf8'))

// Sanctioned fallback knobs (recorded in balance-results.md): drop a level's count-multiplier slot, or add to its gap scale.
const tuning={slotDrop:{},gapBonus:{9:0.1},challengeScale:{26:1,27:0.9}}

const BaseHp={nibble:55,dash:38,shell:125,swarm:24,moth:65,shaman:130,burrow:80,crystal:180} // crystal counts its 70 shield
// Expansion registry shares its health profiles with the runtime; minibosses count as pressure work.
const dataSource=readFileSync(source,'utf8')
const added=[...dataSource.matchAll(/new EnemyDef\{id="(\w+)",name="[^"]+",trait="[^"]+",intro=(\d+),hp=([\d.]+)f,speed=[\d.]+f,armor=[\d.]+f,shield=([\d.]+)f,reward=\d+,air=(?:true|false),mini=(true|false)/g)].map(m=>({id:m[1],intro:Number(m[2]),hp:Number(m[3])+Number(m[4]),mini:m[5]==='true'}))
for(const e of added)BaseHp[e.id]=e.hp
const Intro={3:'shell',5:'moth',7:'shaman',9:'crystal',11:'burrow'}
const parse=wave=>wave.split(',').map(p=>{const [kind,n]=p.split(':');return {kind,n:Number(n)}})
const format=packets=>packets.map(p=>`${p.kind}:${p.n}`).join(',')
const round2=x=>Math.round(x*100+1e-6)/100

// Count multiplier C (percent) by chapter and position; chapters 1-5 add 2 % per chapter up to chapter 3.
function multiplier(L){
 const p=(L-1)%4,c=Math.floor((L-1)/4),slot=Math.max(0,p-(tuning.slotDrop[L]||0))
 return c===0?[110,115,125,135][slot]:[115,120,130,140][slot]+2*Math.min(c,3)
}
const scale=(n,C)=>Math.max(n+1,Math.floor((n*C+50)/100))
function inject(wave,kind,n){const p=wave.find(x=>x.kind===kind);if(p)p.n+=n;else wave.push({kind,n})}

// The generator rules: moderate counts (introduction packets verbatim), elite injections by position, a swarm surge and a bigger escort on boss levels.
function generate(L,openingFrom=5){
 const old=baseline.waves[L-1].map(parse),W=old.length,p=(L-1)%4,c=Math.floor((L-1)/4),C=multiplier(L)
 const boss=old[W-1].some(x=>x.kind==='boss')
 let introSeen=false
 // Opening ramp (chapters 1-5): the pass phases in with the player's income; wave 1 keeps its baseline counts, wave 2 takes half the multiplier.
 const waves=old.map((wave,w)=>{const Cw=L>=openingFrom&&w===0?100:L>=openingFrom&&w===1?Math.round(100+(C-100)/2):C;return wave.map(x=>{
  if(x.kind==='boss')return {kind:'boss',n:1}
  if(Intro[L]===x.kind&&!introSeen){introSeen=true;return {kind:x.kind,n:x.n}}
  return {kind:x.kind,n:Cw===100?x.n:scale(x.n,Cw)}
 })})
 const E=boss?W-2:W-1 // the last ordinary wave that takes elite injections (1-indexed)
 if(L>=5)inject(waves[Math.floor(W/2)-1],'shell',2+c)
 if(L>=7&&p>=2){inject(waves[E-2],'shaman',1+Math.floor(c/2));inject(waves[E-1],'shaman',1+Math.floor(c/2))}
 if(L>=9&&p>=2)inject(waves[E-1],'crystal',2+c)
 if(L>=11&&p>=1)inject(waves[W-4],'burrow',2+c)
 if(boss){
  inject(waves[W-3],'swarm',8+2*c)
  inject(waves[W-1],'shell',3+c);inject(waves[W-1],'dash',4+c)
  if(L>=8)inject(waves[W-1],'moth',3+c)
  if(L>=12)inject(waves[W-1],'crystal',2+c)
 }
 return waves.map(format)
}

// Per-enemy HP: old HPScale x (1 + .02(L-1) + .08 on boss levels + .05 on levels 1-2); challenge entries anchor to levels 8, 20 and 24 x 1.15.
const bossLevels=new Set([4,8,12,16,20,24])
const hpScale=baseline.hpScale.map((old,i)=>{const L=i+1;return round2(old*(1+.02*(L-1)+(bossLevels.has(L)?.08:0)+(L<=2?.05:0)))})
const expectedHp=[1.05,1.23,1.35,1.65,1.67,1.93,2.18,2.62,2.67,3.01,3.36,4.03,4.03,4.28,4.54,5.11,5.08,5.36,5.64,6.28,6.23,6.53,6.84,7.55]
if(hpScale.join()!==expectedHp.join())throw new Error('HPScale formula drifted from the frozen table: '+hpScale.join())
const challengeHp=[hpScale[7],hpScale[19],round2(hpScale[23]*1.15)]
const gapByChapter=[1,.95,.9,.85,.8,.78]
const gapScale=L=>L>=25?[.95,.85,.8,.82,.88][L-25]:round2(gapByChapter[Math.floor((L-1)/4)]+(tuning.gapBonus[L]||0))
const breather=L=>L>=25?[5,4,3,4,4][L-25]:(Math.floor((L-1)/4)<2?5:Math.floor((L-1)/4)===2?4:3)
const overlap=L=>L>=25?1:((L-1)%4>=2&&L>=5?.85:1)

// Challenge waves (25-27) are authored, not generated: the boss arrives mid-level and the remaining waves spawn as adds.
const challengeWaves=[
 ['shell:5,nibble:12','nibble:14,dash:8','swarm:22,moth:8','boss:1,nibble:14,shell:4','swarm:24,moth:10,dash:10','shell:10,dash:14,crystal:6'],
 ['shell:6,nibble:12','nibble:14,moth:8','shell:8,dash:10','swarm:28,shaman:3','crystal:9,burrow:10,moth:12','boss:1,shell:10,nibble:16','swarm:36,dash:16,shaman:4','moth:18,crystal:12,shell:10','crystal:14,dash:22,shell:14,shaman:5'],
 ['shell:8,nibble:14','nibble:16,moth:10','shell:10,dash:12','swarm:32,shaman:4','crystal:12,burrow:12,moth:14','shell:14,dash:20,shaman:5','boss:1,moth:14,shell:12','swarm:32,crystal:12,dash:18','moth:22,shell:16,shaman:6','crystal:18,burrow:14,dash:24,shaman:6','nibble:36,shell:18,crystal:14,moth:16'],
]
// Challenge count scale (the plan's second challenge knob): waves 2+ of the authored arrays, boss packets untouched.
const scaledChallenge=challengeWaves.map((lvl,k)=>{const f=tuning.challengeScale[25+k]||1;return lvl.map((w,i)=>i===0||f===1?w:format(parse(w).map(x=>x.kind==='boss'?x:{kind:x.kind,n:Math.max(1,Math.round(x.n*f))})))})
// New creatures replace small pieces of existing packets; the first two waves remain an economy lesson.
function expand(waves,L){
 const out=waves.map(parse)
 const pool=added.filter(e=>!e.mini&&e.intro<=L)
 for(let w=2;w<out.length;w++){
  const def=pool[(L+w-3)%pool.length],packet=out[w].find(p=>p.kind!=='boss'&&p.n>=5)
  if(packet){const n=Math.min(L<5?2:3,packet.n-2);packet.n-=n;inject(out[w],def.id,n)}
 }
 // Teach the newest ordinary creature in a small, late opening packet; keep original first introductions untouched.
 const introduced=added.find(e=>!e.mini&&e.intro===L)
 if(introduced)inject(out[Math.min(2,out.length-1)],introduced.id,2)
 const firstMini=added.find(e=>e.mini&&e.intro===L)
 const minis=added.filter(e=>e.mini&&e.intro<L)
 if(firstMini)inject(out[Math.max(2,out.length-3)],firstMini.id,1)
 if(L>=17){inject(out[Math.max(3,out.length-4)],minis[(L-17)%minis.length].id,1);if(L>=21)inject(out[out.length-2],minis[(L-10)%minis.length].id,1)}
 return out.map(format)
}
const portalWaves=[
 'shell:8,nibble:14','scarab:8,bat:10','crystal:8,riftling:10,firefly:4','boss:1,swarm:24,shaman:3,mite:10',
 'portalSentinel:1,beetle:10,wisp:10','scarab:10,riftling:12','mirrorKnight:1,bat:14,mimic:8',
 'tinyZombie:14,sporeling:10,crystal:12','stormWarden:1,riftling:14,shardling:12','chronoMoth:1,scarab:14,moth:16',
 'portalSentinel:1,graveCaller:1,bat:14,crystal:12','ironSnail:1,warDrummer:1,riftling:18,mimic:12,firefly:5'
]
const pass1=[...Array.from({length:24},(_,i)=>expand(generate(i+1),i+1)),...scaledChallenge,portalWaves,['boss:1,nibble:6,beetle:2']]

// ---------------------------------------------------------------------------------------------------------------
// PASS 2 (difficulty pass 2; pass 1 above and carrot-waves.baseline.json stay frozen). Waves 1-2 teach, waves 3..N
// squeeze, and nothing a pass removes is lost: it moves later.
//  step 2  opening: L2-L4 join the opening ramp (wave 1 at baseline counts, wave 2 at half the multiplier); waves 1-2
//          cap swarm packets at 8 (L1-L4) / 12 (L5+) and every air packet at 10 (L1-L12, challenges) / 5 (L13-L24);
//          the first 60% of every campaign level's waves is smoothed so no wave from 3 on exceeds 1.35x the previous
//          wave's work. Removed units spread over the later ordinary waves in proportion to that kind's counts there
//          (or to wave size), never past 110 units a wave (any excess becomes that wave's health).
//  step 4  late pressure: the last three ordinary waves of L5-L24 carry 1.10x counts (cap 110, excess as health), and
//          WaveRampTable multiplies ordinary health from wave 3: 1 + a min(1, (w-2)/(E-2)), E the last ordinary wave,
//          a = .10 (L1-4), .18 (L5-8), .22 (L9-12), .26 (L13-24), .12 (L25-28), 0 (Asuna); minibosses take half the rise.
const PASS2=STEP>=2,LATE=STEP>=4
const AIR=new Set(['moth',...added.filter(e=>e.air&&!e.mini).map(e=>e.id)])
const MINI=new Set(added.filter(e=>e.mini).map(e=>e.id))
const units=wave=>wave.reduce((s,p)=>s+(p.kind==='boss'?0:p.n),0)
const workOf=wave=>wave.reduce((s,p)=>s+(p.kind==='boss'?0:BaseHp[p.kind]*p.n),0)
const rampA=L=>{const t=CURVE.a;return L<=4?t[0]:L<=8?t[1]:L<=12?t[2]:L<=24?t[3]:L<=28?t[4]:0}
const isBossLevel=lvl=>lvl[lvl.length-1].some(p=>p.kind==='boss')
function addUnits(wave,kind,n){const p=wave.find(x=>x.kind===kind&&!x.locked);if(p)p.n+=n;else wave.push({kind,n})}
// Largest-remainder spread of n units of kind over waves lo..hi (0-based), weighted by that kind's counts (else wave size).
function spread(lvl,lo,hi,kind,n,overflow,asHealth=false){
 if(n<=0)return;const idx=[];for(let w=lo;w<=hi;w++)if(w>=0&&w<lvl.length)idx.push(w)
 // Chapter 0's short levels take moved units back as health (by wave size), so their streams stay within 1.32x.
 if(asHealth&&idx.length){const sizes=idx.map(w=>Math.max(1,workOf(lvl[w]))),total=sizes.reduce((a,b)=>a+b,0);idx.forEach((w,i)=>overflow[w]+=n*BaseHp[kind]*sizes[i]/total);return}
 if(!idx.length){overflow[Math.min(lvl.length-1,Math.max(0,hi))]+=n*BaseHp[kind];return}
 let weights=idx.map(w=>lvl[w].filter(p=>p.kind===kind).reduce((s,p)=>s+p.n,0));if(weights.every(x=>x===0))weights=idx.map(w=>Math.max(1,units(lvl[w])))
 const total=weights.reduce((a,b)=>a+b,0),raw=weights.map(x=>n*x/total),take=raw.map(Math.floor);let left=n-take.reduce((a,b)=>a+b,0)
 const order=raw.map((x,i)=>[x-take[i],i]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]);for(let k=0;k<left;k++)take[order[k%order.length][1]]++
 idx.forEach((w,i)=>{const room=Math.max(0,110-units(lvl[w])),put=Math.min(room,take[i]);if(put>0)addUnits(lvl[w],kind,put);if(take[i]>put)overflow[w]+=(take[i]-put)*BaseHp[kind]})
}
const overflowWork=[]
function pass2(L){
 const lvl=pass1[L-1].map(w=>parse(w)),W=lvl.length,overflow=new Array(W).fill(0);overflowWork[L-1]=overflow
 if(L===29||!PASS2)return lvl
 const E=isBossLevel(lvl)?W-1:W  // the last ordinary wave (1-based)
 // Lock what must stay verbatim: the level's introduction packet, minibosses and the boss.
 const intro=Intro[L];let introLocked=false
 for(const wave of lvl)for(const p of wave){if(p.kind==='boss'||MINI.has(p.kind))p.locked=true;if(intro&&p.kind===intro&&!introLocked){p.locked=true;introLocked=true}}
 const later=(kind,n)=>spread(lvl,2,E-1,kind,n,overflow,L<=4)
 if(L>=2&&L<=4){ // the opening ramp now starts on level 2
  // On these short levels the units leave as health (spread over waves 3..E by size), so the stream stays within 1.32x.
  const ramped=generate(L,2).map(parse),lateWork=[];for(let w=2;w<E;w++)lateWork.push([w,workOf(lvl[w])]);const lateTotal=lateWork.reduce((x,y)=>x+y[1],0)
  for(let w=0;w<2;w++)for(const p of lvl[w]){const target=ramped[w].find(x=>x.kind===p.kind);if(target&&target.n<p.n&&!p.locked){const moved=(p.n-target.n)*BaseHp[p.kind];for(const [v,work] of lateWork)overflow[v]+=moved*work/Math.max(1,lateTotal);p.n=target.n}}
 }
 for(let w=0;w<2;w++)for(const p of lvl[w]){if(p.locked)continue
  const cap=p.kind==='swarm'?(L<=4?8:12):AIR.has(p.kind)?(L>=13&&L<=24?5:10):Infinity
  if(p.n>cap){later(p.kind,p.n-cap);p.n=cap}}
 if(L<=24){ // smoothing of the first 60% (campaign only; the challenge arenas are authored around their guardian)
  const S=Math.min(E,Math.ceil(.6*W))
  for(let w=2;w<S;w++){const allowed=1.35*workOf(lvl[w-1]),now=workOf(lvl[w]);if(now<=allowed)continue
   const locked=lvl[w].filter(p=>p.locked).reduce((s,p)=>s+(p.kind==='boss'?0:BaseHp[p.kind]*p.n),0),free=now-locked;if(free<=0)continue
   const keep=Math.max(0,allowed-locked)/free
   for(const p of lvl[w]){if(p.locked||p.kind==='boss')continue;const n=Math.max(1,Math.round(p.n*keep));if(n<p.n){spread(lvl,S,E-1,p.kind,p.n-n,overflow,L<=4);p.n=n}}
   // Rounding can leave the wave a little over: shed single units from its heaviest packet until it fits.
   for(let guard=0;guard<200&&workOf(lvl[w])>allowed;guard++){let best=null;for(const p of lvl[w])if(!p.locked&&p.kind!=='boss'&&p.n>1&&(!best||BaseHp[p.kind]*p.n>BaseHp[best.kind]*best.n))best=p;if(!best)break;best.n--;spread(lvl,S,E-1,best.kind,1,overflow,L<=4)}}
 }
 if(LATE&&L>=5&&L<=24)for(let w=Math.max(2,E-3);w<E;w++){ // the last three ordinary waves: 1.10x counts (stream budget below)
  for(const p of lvl[w]){if(p.locked||p.kind==='boss')continue;const want=Math.round(p.n*1.1),room=Math.max(0,110-units(lvl[w])),add=Math.min(room,want-p.n);if(want-p.n>add)overflow[w]+=(want-p.n-add)*BaseHp[p.kind];p.n+=add}}
 // Stream budget: the whole level streams within 1.32x its frozen baseline; any excess leaves the biggest late packets as health.
 if(L<=24){const budget=1.32*stream(baseline.waves[L-1],0,1,1,5)-.05,sec=()=>stream(lvl.map(format),L,gapScale(L),overlap(L),breather(L))
  for(let guard=0;guard<400&&sec()>budget;guard++){let best=null,bw=-1;for(let w=Math.ceil(.6*W)-1;w<E;w++)for(const p of lvl[w]){if(p.locked||p.kind==='boss'||p.n<=2)continue;if(!best||p.n>best.n){best=p;bw=w}}if(!best)break;best.n--;overflow[bw]+=BaseHp[best.kind]}}
 return lvl
}
const shaped=Array.from({length:29},(_,i)=>pass2(i+1))
const waves=shaped.map(lvl=>lvl.map(w=>format(w)))
const allHp=[...hpScale,...challengeHp,9.25,5.6]
// Wave-1 health grace: 1 / (new HPScale / pre-pass HPScale) from chapter 1 on; the challenge anchors' pre-pass values are levels 8, 20 and 24 x 1.15 of the old table. Asuna uses its full authored health from the opening.
const oldAnchors=[baseline.hpScale[7],baseline.hpScale[19],round2(baseline.hpScale[23]*1.15),6.2,5.6]
const opening=allHp.map((hp,i)=>i<4?1:Math.round(10000*(i<24?baseline.hpScale[i]:oldAnchors[i-24])/hp)/10000)

// Step 4, the late ramp, measured against the economy. The plan's linear ramp (1 + a min(1, (w-2)/(E-2))) kept the
// mid-level cliffs (waves 5-6 of L16-L24 carried 8-10 threat per coin, almost the finale's 10-15), so the table is
// derived instead: threat(w) = sum over units of (hp + 1.3 shield) / (1 - .6 armor) x speed/.9 (x1.25 air, x1.3 healers,
// x1.25 crystal, x1.15 burrow) x HPScale x the opening grace; coins(w) = starting gold + every earlier wave's bounties
// and stipends. Each wave's ordinary health is scaled so threat per coin follows R(w) = Rend (f0 + (1 - f0) x^k),
// x = (w - 1)/(E - 1), Rend = the last three ordinary waves' mean x (1 + a): waves 1-2 teach, the middle eases, the
// last 40% squeeze. Multipliers are clamped to [.55, 1.7]; the boss wave takes the last ordinary wave's multiplier.
const startGold=Object.fromEntries([...dataSource.matchAll(/new LevelDef\{id=(\d+),name="[^"]+",biome="(\w+)",boss="\w*",startingGold=(\d+)/g)].map(m=>[Number(m[1]),{gold:Number(m[3]),biome:m[2]}]))
const Profile={nibble:{hp:55,sp:.9,r:8},dash:{hp:38,sp:1.65,r:9},shell:{hp:125,sp:.62,r:15,ar:.4},swarm:{hp:24,sp:1.08,r:4},moth:{hp:65,sp:1.1,r:11,air:true},shaman:{hp:130,sp:.7,r:18,heal:true},burrow:{hp:80,sp:.9,r:12},crystal:{hp:110,sh:70,sp:.7,r:17}}
for(const m of dataSource.matchAll(/new EnemyDef\{id="(\w+)",name="[^"]+",trait="[^"]+",intro=\d+,hp=([\d.]+)f,speed=([\d.]+)f,armor=([\d.]+)f,shield=([\d.]+)f,reward=(\d+),air=(true|false)/g))Profile[m[1]]={hp:Number(m[2]),sp:Number(m[3]),ar:Number(m[4]),sh:Number(m[5]),r:Number(m[6]),air:m[7]==='true',heal:m[1]==='firefly'||m[1]==='slug'}
const threatOf=k=>{const t=Profile[k];if(!t)return 0;let x=(t.hp+1.3*(t.sh||0))/(1-.6*(t.ar||0))*(t.sp/.9);if(t.air)x*=1.25;if(t.heal)x*=1.3;if(k==='crystal')x*=1.25;if(k==='burrow')x*=1.15;return x}
const tierOf=b=>b==='garden'?0:b==='marsh'?1:b==='frost'?2:3
const stipendOf=L=>L>=25?30:L<=8?15+5*tierOf(startGold[L].biome):10+4*tierOf(startGold[L].biome)
function relief(L){
 // Mode "relief": the first 60% of the waves (S) ease from m0 to 1, the rest rise linearly to 1 + a at the last ordinary wave.
 const lvl=shaped[L-1],W=lvl.length,E=isBossLevel(lvl)?W-1:W,a=rampA(L),S=Math.min(E,Math.ceil(.6*W))
 const chapter=L<=4?0:L<=8?1:L<=12?2:L<=24?3:4,m0=CURVE.m[chapter],c=(CURVE.c||[1,1,1,1,1])[chapter]
 const out=lvl.map((wave,w)=>{if(w>=E)return c*(1+a);if(w<S-1)return c*(m0+(1-m0)*(S<=1?1:w/(S-1)));return c*(E-S<=0?1+a:1+a*(w-(S-1))/(E-S))})
 // Waves 1-2 teach: with the level's Pressure dial they never exceed the pass-1 health.
 const dial=pressureDials[L-1]||1
 return out.map((x,w)=>{const extra=overflowWork[L-1][w],work=workOf(lvl[w]);if(extra>0&&work>0)x*=(work+extra)/work;if(w<2)x=Math.min(x,1/dial);return Math.round(x*1000)/1000})
}
const pressureDials=(dataSource.match(/float\[\] Pressure=\{([^}]*)\}/)||[,''])[1].split(',').map(x=>Number(x.replace('f','')))
function curve(L){
 const lvl=shaped[L-1],W=lvl.length,E=isBossLevel(lvl)?W-1:W,a=rampA(L),grace=opening[L-1]
 if(!LATE||L===29||L<CURVE.from)return lvl.map(()=>1)
 if(CURVE.mode==='relief')return relief(L)
 let coins=startGold[L].gold;const raw=[]
 lvl.forEach((wave,w)=>{let threat=0,bounty=0;for(const p of wave){if(p.kind==='boss')continue;threat+=threatOf(p.kind)*p.n;bounty+=(Profile[p.kind]?Profile[p.kind].r:0)*p.n}
  threat*=allHp[L-1]*(w===0?grace:w===1?Math.sqrt(grace):1);const extra=overflowWork[L-1][w],work=workOf(wave);if(extra>0&&work>0)threat*=(work+extra)/work
  raw.push(threat/Math.pow(coins,CURVE.power));coins+=bounty+stipendOf(L)})
 // The trend: a centred moving average over 2*smooth+1 ordinary waves (the light/heavy rhythm of the authored waves stays).
 const trend=raw.map((r,w)=>{if(w>=E)return r;let s=0,n=0;for(let v=Math.max(0,w-CURVE.smooth);v<=Math.min(E-1,w+CURVE.smooth);v++){s+=raw[v];n++}return s/n})
 const last=trend.slice(Math.max(0,E-3),E),end=last.reduce((x,y)=>x+y,0)/Math.max(1,last.length)*(1+a)
 const out=trend.map((r,w)=>{const x=E<=1?1:Math.min(1,w/(E-1)),target=end*(CURVE.f0+(1-CURVE.f0)*Math.pow(x,CURVE.k));let m=r>0?Math.min(CURVE.hi,Math.max(CURVE.lo,target/r)):1;if(w<2&&CURVE.early)m=Math.max(m,CURVE.early);return m})
 if(E<W)out[W-1]=out[E-1]
 return out.map(x=>Math.round(x*1000)/1000)
}
const rampTable=Array.from({length:29},(_,i)=>curve(i+1))

// Pressure = HP-weighted spawn work per stream second (ordinary enemies only; the boss is a separate spike).
function stream(wavesOf,L,gap,ov,br){
 let seconds=0
 for(const wave of wavesOf)for(const {kind,n} of parse(wave))seconds+=Math.max(2,kind==='boss'?1.8*n:n*(kind==='swarm'?.24:.78)*gap*ov)+.8
 return seconds+(wavesOf.length-1)*br
}
function work(wavesOf,hp){let sum=0;for(const wave of wavesOf)for(const {kind,n} of parse(wave))if(kind!=='boss')sum+=BaseHp[kind]*n*hp;return sum}
const count=wavesOf=>wavesOf.reduce((s,w)=>s+parse(w).reduce((t,p)=>t+(p.kind==='boss'?0:p.n),0),0)
const baselineStream=baseline.waves.map(w=>stream(w,0,1,1,5))
const baselinePressure=baseline.waves.map((w,i)=>work(w,baseline.hpScale[i])/baselineStream[i])
const newStream=waves.map((w,i)=>stream(w,i+1,gapScale(i+1),overlap(i+1),breather(i+1)))
const newPressure=waves.map((w,i)=>work(w,allHp[i])/newStream[i])

const cs=n=>{const s=String(Math.round(n*1000)/1000);return (s.startsWith('0.')?s.slice(1):s)+'f'}
const block=[
 ' public static readonly string[][] Waves = {',
 ...waves.map((w,i)=>'new string[]{'+w.map(x=>`"${x}"`).join(',')+'}'+(i===waves.length-1?'};':',')),
 ' // Per-enemy HP multiplier by level (challenge entries 25-27 anchor to levels 8, 20 and 24 x 1.15).',
 ' static readonly float[] HPScaleTable={'+allHp.map(cs).join(',')+'};',
 ' // Spawn-gap scale by level (applied to the .78 s / .24 s gaps; the boss gap stays 1.8 s).',
 ' static readonly float[] GapScaleTable={'+waves.map((_,i)=>cs(gapScale(i+1))).join(',')+'};',
 ' // Breather between waves in seconds.',
 ' static readonly float[] BreatherTable={'+waves.map((_,i)=>cs(breather(i+1))).join(',')+'};',
 ' // Packet overlap factor on the stream advance between packets.',
 ' static readonly float[] PacketOverlapTable={'+waves.map((_,i)=>cs(overlap(i+1))).join(',')+'};',
 ' // Wave-1 health grace per level (1 / the pass multiplier; wave 2 takes its square root); written by the generator.',
 ' static readonly float[] OpeningTable={'+opening.map(x=>x===1?'1f':String(Math.round(x*10000)/10000).replace(/^0/,'')+'f').join(',')+'};',
 ' // Pass 2 late ramp: ordinary-enemy health by level and wave (1-based), from wave 3; minibosses take half the rise.',
 ' static readonly float[][] WaveRampTable={',
 ...rampTable.map((r,i)=>'  new float[]{'+r.map(x=>x===1?'1f':cs(x)).join(',')+'}'+(i===rampTable.length-1?'};':',')),
 ' // Pass-2 step this block was generated at (2 opening caps and smoothing, 4 late ramp and counts).',
 ' public const int GeneratedStep='+STEP+';',
].join('\n')+'\n'

const file=readFileSync(source,'utf8')
const begin=file.indexOf('\n',file.indexOf('// WAVES:BEGIN'))+1,end=file.indexOf(' // WAVES:END')
if(begin<=0||end<0)throw new Error('CarrotData.cs is missing the WAVES:BEGIN / WAVES:END markers')
const args=process.argv.slice(2)
if(args.includes('--baseline')){
 console.log('BaselinePressure {'+baselinePressure.map(x=>Math.round(x)).join(',')+'}')
 console.log('BaselineStream {'+baselineStream.map(x=>Math.round(x)).join(',')+'}')
}else if(args.includes('--pressure')){
 console.log('| Level | C | gap | overlap | breather | HP old->new | count old->new | stream s old->new | pressure old->new | ratio |')
 for(let i=0;i<waves.length;i++){const L=i+1,old=i<24?baseline.waves[i]:null
  console.log(`| ${L} | ${i<24?(multiplier(L)/100).toFixed(2):'authored'} | ${gapScale(L)} | ${overlap(L)} | ${breather(L)} | ${old?baseline.hpScale[i]:'-'}->${allHp[i]} | ${old?count(old):'-'}->${count(waves[i])} | ${old?Math.round(baselineStream[i]):'-'}->${Math.round(newStream[i])} | ${old?Math.round(baselinePressure[i]):'-'}->${Math.round(newPressure[i])} | ${old?(newPressure[i]/baselinePressure[i]).toFixed(2):'-'} |`)}
}else if(args.includes('--write')){
 writeFileSync(source,file.slice(0,begin)+block+file.slice(end))
 console.log(`CarrotData.cs waves block written: ${waves.length} levels, ${waves.reduce((n,w)=>n+w.length,0)} waves`)
}else{
 const current=file.slice(begin,end)
 if(current!==block){console.error('CarrotData.cs waves block differs from the generator; run: node scripts/carrot-waves.mjs --write');process.exit(1)}
 console.log(`carrot-waves.mjs: CarrotData.cs holds the generated block (${waves.length} levels).`)
}
