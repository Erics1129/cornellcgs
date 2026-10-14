// Single source of truth for the website's level data: parses CarrotData.cs and writes (or checks) game-data.json.
// Grid coordinates are world + (7,5); routes, pads, blockers, waves and gold are read straight from the C# literals.
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
const source=resolve('unity/CarrotDefense/Assets/Scripts/CarrotData.cs')
const target=resolve('public/assets/minigames/carrot/game-data.json')
const cs=readFileSync(source,'utf8')
const num=s=>Number(s.replace(/f$/,''))
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
  ...(id>=25?{challenge:id===25?'easy':id===26?'hard':'insane',bossName:bossNames[m[4]]}:{})}})
if(towers.length!==10)throw new Error('expected ten towers, parsed '+towers.length)
if(levels.length!==waves.length)throw new Error(`parsed ${levels.length} levels but ${waves.length} wave arrays`)
for(const l of levels)if(!l.waveCompositions||l.waveCompositions.length!==l.waves)throw new Error('wave count mismatch on level '+l.id)
const data={version:1,coordinates:'grid x0..14,z0..10; Unity world x-7,z-5',towers,levels}
const json=JSON.stringify(data,null,2)+'\n'
if(process.argv.includes('--write')){writeFileSync(target,json);console.log(`game-data.json written: ${levels.length} levels, ${levels.reduce((n,l)=>n+l.waves,0)} waves`)}
else{let current='';try{current=readFileSync(target,'utf8')}catch{/* missing file is a drift */}
 const same=current.trim()===json.trim()||JSON.stringify(JSON.parse(current||'{}'))===JSON.stringify(data)
 if(!same){console.error('game-data.json differs from CarrotData.cs; run: node scripts/carrot-game-data.mjs --write');process.exit(1)}
 console.log(`game-data.json matches CarrotData.cs (${levels.length} levels).`)}
