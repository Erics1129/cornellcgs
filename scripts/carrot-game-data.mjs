// Single source of truth for the website's level data: parses CarrotData.cs and writes (or checks) game-data.json.
// Grid coordinates are world + (7,5); routes, pads, blockers, waves and gold are read straight from the C# literals.
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
const source=resolve('unity/CarrotDefense/Assets/Scripts/CarrotData.cs')
const target=resolve('public/assets/minigames/carrot/game-data.json')
const cs=readFileSync(source,'utf8')
const num=s=>Number(s.replace(/f$/,''))
const movementScale=Number(cs.match(/const float MovementScale=([\d.]+)f/)?.[1])
if(!Number.isFinite(movementScale)||movementScale<=0)throw new Error('missing movement scale')
const points=body=>{const n=body.split(',').map(s=>num(s.trim()));const out=[];for(let i=0;i<n.length;i+=2)out.push([n[i],n[i+1]]);return out}
const towers=[...cs.matchAll(/new TowerDef \{id="(\w+)",name="([^"]+)",role="(\w+)",unlock=(\d+),air=(true|false),superName="([^"]+)",superTrait="([^"]+)",cost=new int\[\]\{([^}]+)\},damage=new float\[\]\{([^}]+)\},interval=new float\[\]\{([^}]+)\},range=new float\[\]\{([^}]+)\}\}/g)]
 .map(m=>({id:m[1],name:m[2],role:m[3],unlock:Number(m[4]),air:m[5]==='true',superName:m[6],superTrait:m[7],cost:m[8].split(',').map(num),damage:m[9].split(',').map(num),interval:m[10].split(',').map(num),range:m[11].split(',').map(num)}))
// Tier 5 (Super) is never bought: four paid entries, five stat entries.
for(const t of towers)if(!(t.damage.length===5&&t.interval.length===5&&t.range.length===5&&t.cost.length===4))throw new Error('expected five stat entries and four costs on '+t.id)
const bossNames=Object.fromEntries([...cs.matchAll(/case "(\w+)":return "([^"]+)";/g)].map(m=>[m[1],m[2]]))
const waves=[...cs.matchAll(/^new string\[\]\{([^\n]*)$/gm)].map(m=>[...m[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]))
const levels=[...cs.matchAll(/new LevelDef\{id=(\d+),name="([^"]+)",biome="(\w+)",boss="(\w*)",startingGold=(\d+),waves=(\d+),routes=new Vector3\[\]\[\]\{((?:P\([^)]*\),?)+)\},pads=P\(([^)]*)\),blockers=new BlockerSeed\[\]\{([^\n]*?)\}\}/g)]
 .map(m=>{const id=Number(m[1]);return {id,name:m[2],biome:m[3],boss:m[4],startingGold:Number(m[5]),waves:Number(m[6]),
  routes:[...m[7].matchAll(/P\(([^)]*)\)/g)].map(r=>points(r[1])),pads:points(m[8]),
  blockers:[...m[9].matchAll(/pad=(\d+),kind="(\w+)"/g)].map(b=>({pad:Number(b[1]),kind:b[2]})),waveCompositions:waves[id-1],
  // Challenge levels (ids >= 25) are the lobby's boss fights: they carry a difficulty and the boss's display name.
  ...(id>=25?{challenge:id===25?'easy':id===26?'hard':id===27||id===29?'insane':'????',bossName:bossNames[m[4]]}:{})}})
if(towers.length!==20)throw new Error('expected twenty towers, parsed '+towers.length)
if(levels.length!==waves.length)throw new Error(`parsed ${levels.length} levels but ${waves.length} wave arrays`)
for(const l of levels)if(!l.waveCompositions||l.waveCompositions.length!==l.waves)throw new Error('wave count mismatch on level '+l.id)
// wavePlan: CarrotData.PlanWave in single precision (Math.fround after every operation, as the C# float code runs),
// grouped into runs of one kind on one route: {kind, n, route, at, span} with at/span in game seconds from the wave start.
const f32=Math.fround
const tableOf=name=>{const m=cs.match(new RegExp('static readonly float\\[\\] '+name+'=\\{([^}]*)\\}'));if(!m)throw new Error('missing table '+name);return m[1].split(',').map(x=>f32(num(x.trim())))}
const gapTable=tableOf('GapScaleTable'),overlapTable=tableOf('PacketOverlapTable')
function planWave(level,w){
 const gapScale=gapTable[level.id-1],overlap=overlapTable[level.id-1],routes=level.routes.length,units=[]
 let at=f32(.65),packetIndex=0
 for(const packet of level.waveCompositions[w-1].split(',')){
  const [kind,countText]=packet.split(':'),count=Number(countText)
  for(let i=0;i<count;i++){
   const route=kind==='boss'?0:(w+packetIndex+Math.trunc(i/Math.max(2,Math.trunc(count/routes))))%routes
   const gap=kind==='swarm'?f32(f32(.24)*gapScale):kind==='boss'?f32(1.8):f32(f32(.78)*gapScale)
   units.push({kind,route,at:f32(at+f32(i*gap))})
  }
  const base=kind==='swarm'?f32(.24):kind==='boss'?f32(1.8):f32(.78),factor=kind==='boss'?1:f32(gapScale*overlap)
  at=f32(f32(at+Math.max(2,f32(f32(count*base)*factor)))+f32(.8));packetIndex++
 }
 const groups=[]
 for(const u of units){const last=groups[groups.length-1];if(last&&last.raw===u.kind&&last.route===u.route){last.n++;last.end=u.at}else groups.push({raw:u.kind,n:1,route:u.route,start:u.at,end:u.at})}
 const r3=x=>Math.round(x*1000)/1000
 return groups.map(g=>({kind:g.raw==='boss'?level.boss:g.raw,n:g.n,route:g.route,at:r3(g.start),span:r3(g.end-g.start),...(g.raw==='boss'?{boss:true}:{})}))
}
// par: the expert bot's median clear time x 1.10, read from the committed difficulty bands when they exist.
const bandsPath=resolve('docs/carrot-defense/giant-update/difficulty-bands.json')
const bands=existsSync(bandsPath)?JSON.parse(readFileSync(bandsPath,'utf8')):null
const veteranShipped=/public static readonly bool VeteranShipped=true;/.test(cs)
for(const l of levels){
 l.wavePlan=Array.from({length:l.waves},(_,w)=>planWave(l,w+1))
 const r0=bands?.levels?.find(x=>x.level===l.id)?.r0
 if(r0&&Number.isFinite(r0.medianSeconds))l.par=Math.round(r0.medianSeconds*1.1)
 l.modes=veteranShipped&&l.id<=24?['normal','veteran']:['normal']
}
const enemies=[...cs.matchAll(/new EnemyDef\{id="(\w+)",name="([^"]+)",trait="([^"]+)",intro=(\d+),hp=([\d.]+)f,speed=([\d.]+)f,armor=([\d.]+)f,shield=([\d.]+)f,reward=(\d+),air=(true|false),mini=(true|false)/g)].map(m=>({id:m[1],name:m[2],trait:m[3],intro:Number(m[4]),hp:Number(m[5]),speed:Number(m[6])*movementScale,armor:Number(m[7]),shield:Number(m[8]),reward:Number(m[9]),air:m[10]==='true',mini:m[11]==='true'}));
if(enemies.filter(e=>e.mini).length!==15||enemies.filter(e=>!e.mini).length!==12)throw new Error('expected fifteen minibosses and twelve added regular enemies')
const data={version:1,enemies,coordinates:'grid x0..14 (Prism x0..40),z0..10; Unity world x-7,z-5',towers,levels}
// Pretty-printed except the wave plans, which stay one compact line per level (they are most of the data).
const json=JSON.stringify(data,(key,value)=>key==='wavePlan'?'__WAVEPLAN__'+JSON.stringify(value):value,2).replace(/"__WAVEPLAN__(.*)"/g,(_,text)=>JSON.parse('"'+text+'"'))+'\n'
if(process.argv.includes('--write')){writeFileSync(target,json);console.log(`game-data.json written: ${levels.length} levels, ${levels.reduce((n,l)=>n+l.waves,0)} waves`)}
else{let current='';try{current=readFileSync(target,'utf8')}catch{/* missing file is a drift */}
 const same=current.trim()===json.trim()||JSON.stringify(JSON.parse(current||'{}'))===JSON.stringify(data)
 if(!same){console.error('game-data.json differs from CarrotData.cs; run: node scripts/carrot-game-data.mjs --write');process.exit(1)}
 console.log(`game-data.json matches CarrotData.cs (${levels.length} levels).`)}
