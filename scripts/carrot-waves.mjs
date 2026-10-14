// Carrot Defense wave generator: the one source of truth for the campaign's difficulty pass.
// Deterministic from the pre-retune strings in carrot-waves.baseline.json; writes the Waves arrays and the
// HPScale / GapScale / Breather / PacketOverlap tables between the WAVES:BEGIN / WAVES:END markers of CarrotData.cs.
//   node scripts/carrot-waves.mjs             checks that CarrotData.cs holds exactly the generated block
//   node scripts/carrot-waves.mjs --write     rewrites the block
//   node scripts/carrot-waves.mjs --baseline  prints the frozen pre-retune pressure and stream arrays (the Geometry invariants)
//   node scripts/carrot-waves.mjs --pressure  prints the per-level table (counts, stream seconds, pressure, ratio) for balance-results.md
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
const source=resolve('unity/CarrotDefense/Assets/Scripts/CarrotData.cs')
const baseline=JSON.parse(readFileSync(resolve('scripts/carrot-waves.baseline.json'),'utf8'))

// Sanctioned fallback knobs (recorded in balance-results.md): drop a level's count-multiplier slot, or add to its gap scale.
const tuning={slotDrop:{},gapBonus:{9:0.1},challengeScale:{26:1,27:0.9}}

const BaseHp={nibble:55,dash:38,shell:125,swarm:24,moth:65,shaman:130,burrow:80,crystal:180} // crystal counts its 70 shield
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
function generate(L){
 const old=baseline.waves[L-1].map(parse),W=old.length,p=(L-1)%4,c=Math.floor((L-1)/4),C=multiplier(L)
 const boss=old[W-1].some(x=>x.kind==='boss')
 let introSeen=false
 // Opening ramp (chapters 1-5): the pass phases in with the player's income; wave 1 keeps its baseline counts, wave 2 takes half the multiplier.
 const waves=old.map((wave,w)=>{const Cw=L>=5&&w===0?100:L>=5&&w===1?Math.round(100+(C-100)/2):C;return wave.map(x=>{
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
const gapScale=L=>L>=25?[.95,.85,.8][L-25]:round2(gapByChapter[Math.floor((L-1)/4)]+(tuning.gapBonus[L]||0))
const breather=L=>L>=25?[5,4,3][L-25]:(Math.floor((L-1)/4)<2?5:Math.floor((L-1)/4)===2?4:3)
const overlap=L=>L>=25?1:((L-1)%4>=2&&L>=5?.85:1)

// Challenge waves (25-27) are authored, not generated: the boss arrives mid-level and the remaining waves spawn as adds.
const challengeWaves=[
 ['shell:5,nibble:12','nibble:14,dash:8','swarm:22,moth:8','boss:1,nibble:14,shell:4','swarm:24,moth:10,dash:10','shell:10,dash:14,crystal:6'],
 ['shell:6,nibble:12','nibble:14,moth:8','shell:8,dash:10','swarm:28,shaman:3','crystal:9,burrow:10,moth:12','boss:1,shell:10,nibble:16','swarm:36,dash:16,shaman:4','moth:18,crystal:12,shell:10','crystal:14,dash:22,shell:14,shaman:5'],
 ['shell:8,nibble:14','nibble:16,moth:10','shell:10,dash:12','swarm:32,shaman:4','crystal:12,burrow:12,moth:14','shell:14,dash:20,shaman:5','boss:1,moth:14,shell:12','swarm:32,crystal:12,dash:18','moth:22,shell:16,shaman:6','crystal:18,burrow:14,dash:24,shaman:6','nibble:36,shell:18,crystal:14,moth:16'],
]
// Challenge count scale (the plan's second challenge knob): waves 2+ of the authored arrays, boss packets untouched.
const scaledChallenge=challengeWaves.map((lvl,k)=>{const f=tuning.challengeScale[25+k]||1;return lvl.map((w,i)=>i===0||f===1?w:format(parse(w).map(x=>x.kind==='boss'?x:{kind:x.kind,n:Math.max(1,Math.round(x.n*f))})))})
const waves=[...Array.from({length:24},(_,i)=>generate(i+1)),...scaledChallenge]
const allHp=[...hpScale,...challengeHp]
// Wave-1 health grace: 1 / (new HPScale / pre-pass HPScale) from chapter 1 on; the challenge anchors' pre-pass values are levels 8, 20 and 24 x 1.15 of the old table.
const oldAnchors=[baseline.hpScale[7],baseline.hpScale[19],round2(baseline.hpScale[23]*1.15)]
const opening=allHp.map((hp,i)=>i<4?1:Math.round(10000*(i<24?baseline.hpScale[i]:oldAnchors[i-24])/hp)/10000)

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
