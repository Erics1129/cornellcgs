// Golden cases for the three pre-existing Carrot records (campaign v1, Super v1, challenges v3). `node scripts/fixtures/carrot-saves-cases.mjs <src root>`
// prints the outputs of those code paths as JSON; carrot-saves-golden.json holds the output of the pre-giant-update code (48d1336), and
// scripts/test-carrot-progress.mjs asserts the current code still produces it byte for byte.
export const storedCampaigns=['null','{corrupt','{"version":1,"unlocked":2.9,"medals":{"1":19,"2":-2,"13":7,"25":7},"sound":false}','{"version":1,"unlocked":12,"medals":{},"sound":true}','{"version":1,"unlocked":30,"medals":{"24":7,"__proto__":3,"x":1},"sound":"no"}','{"version":2,"unlocked":5,"medals":{},"sound":true}','{"version":1,"unlocked":"7","medals":{"3":3.7,"4":"5"}}']
export const storedSupers=['null','{corrupt','{"version":1,"taught":"yes","merges":-4,"kinds":{"seed":2.7,"bad key":3,"frost":"x"}}','{"version":1,"taught":true,"merges":9,"kinds":{"thunder":2}}','{"version":2,"taught":true,"merges":9,"kinds":{}}']
export const storedChallenges=['null','{corrupt','{"version":1,"best":{"tornado":{"cleared":true,"health":12,"seconds":10,"towers":1},"eyeball":{"cleared":true,"health":3.9,"seconds":"77.26","towers":-2},"dragon":{"cleared":true,"health":5,"seconds":5,"towers":1}}}','{"version":2,"best":{"portal":{"cleared":true,"health":8,"seconds":700,"towers":16}}}','{"version":3,"best":{"asuna":{"cleared":true,"health":8,"seconds":350,"towers":12}}}','{"version":4,"best":{}}']
export const campaignPairs=[[{version:1,unlocked:4,medals:{1:7,2:1,3:3},sound:false},{version:1,unlocked:6,medals:{2:6,3:4,5:1},sound:true}],[{version:1,unlocked:25,medals:{24:7,25:7},sound:true},{version:1,unlocked:13,medals:{13:1,24:1},sound:true}],[{version:1,unlocked:2,medals:'nope',sound:true},{version:1,unlocked:1,medals:{1:1},sound:true}],[{version:1,unlocked:3,medals:{1:1}},{version:2,unlocked:1,medals:{}}],[null,{version:1,unlocked:1,medals:{},sound:true}]]
export const superPairs=[[{version:1,taught:true,merges:2,kinds:{seed:2}},{version:1,taught:false,merges:5,kinds:{seed:1,storm:3}}],[{version:1,taught:true,merges:2,kinds:{}},{version:3,taught:false,merges:0,kinds:{}}],[{corrupt:true},{version:1,taught:false,merges:1,kinds:{book:1}}],[null,null]]
export const challengePairs=[[{version:1,best:{tornado:{cleared:true,health:6,seconds:300,towers:7}}},{version:3,best:{tornado:{cleared:true,health:10,seconds:280,towers:4},asuna:{cleared:true,health:8,seconds:350,towers:12}}}],[{version:2,best:{portal:{cleared:true,health:4,seconds:719.8,towers:20}}},{version:4,best:{}}],[{garbage:1},{version:3,best:{zombie:{cleared:true,health:9,seconds:355,towers:8}}}]]
export async function run(root){
 const values=new Map()
 globalThis.localStorage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}
 const progress=await import(root+'/minigames/carrot/progress.ts')
 const challenges=await import(root+'/minigames/carrot/challenges.ts')
 const merges=await import(root+'/lib/account/merges.ts')
 const out=[]
 for(const s of storedCampaigns){values.clear();if(s!=='null')values.set('cgs-carrot-defense-v1',s);out.push(['readCampaign',s,JSON.stringify(progress.readCampaign()),JSON.stringify(progress.rawCampaign())])}
 values.clear();let c=progress.readCampaign()
 for(const [level,health,cleared] of [[1,7,false],[1,10,true],[1,2,false],[2,0,false],[25,10,false],[12,10,false],[13,9,true],[24,10,true],[2,NaN,false]]){c=progress.awardCampaign(c,level,health,cleared);out.push(['awardCampaign',`${level},${health},${cleared}`,JSON.stringify(c),values.get('cgs-carrot-defense-v1')])}
 out.push(['saveCampaign','sound off',JSON.stringify(progress.saveCampaign({...c,sound:false})),values.get('cgs-carrot-defense-v1')])
 for(const s of storedSupers){values.clear();if(s!=='null')values.set('cgs-carrot-super-v1',s);out.push(['readSuper',s,JSON.stringify(progress.readSuper())])}
 values.clear();let sup=progress.readSuper();for(const k of ['seed','seed','frost','Bad Kind'])sup=progress.recordSuper(sup,k);sup=progress.teachSuper(sup);out.push(['recordSuper','seed,seed,frost,bad+teach',JSON.stringify(sup),values.get('cgs-carrot-super-v1')])
 for(const s of storedChallenges){values.clear();if(s!=='null')values.set('cgs-carrot-challenges-v1',s);out.push(['readChallenges',s,JSON.stringify(challenges.readChallenges()),JSON.stringify(challenges.rawChallenges())])}
 values.clear();let ch=challenges.readChallenges()
 for(const [boss,h,sec,t] of [['tornado',7,232.44,5],['tornado',10,300,9],['tornado',4,200,3],['zombie',9,355,8],['asuna',8,350,12],['dragon',7,1,1],['eyeball',0,1,1]]){ch=challenges.awardChallenge(ch,boss,h,sec,t);out.push(['awardChallenge',`${boss},${h},${sec},${t}`,JSON.stringify(ch),values.get('cgs-carrot-challenges-v1')])}
 const meta={localUpdated:1,remoteUpdated:2}
 for(const [a,b] of campaignPairs){out.push(['mergeCarrot',JSON.stringify([a,b]),JSON.stringify(merges.mergeCarrot(a,b,meta)),JSON.stringify(merges.mergeCarrot(b,a,meta))])}
 for(const [a,b] of superPairs){out.push(['mergeCarrotSuper',JSON.stringify([a,b]),JSON.stringify(progress.mergeCarrotSuper(a,b)),JSON.stringify(merges.mergeCarrotSuper(b,a))])}
 for(const [a,b] of challengePairs){out.push(['mergeCarrotChallenges',JSON.stringify([a,b]),JSON.stringify(challenges.mergeCarrotChallenges(a,b)),JSON.stringify(merges.mergeCarrotChallenges(b,a))])}
 for(const id of ['carrot:campaign','carrot:super','carrot:challenges'])out.push(['KNOWN_KEYS',id,JSON.stringify(merges.KNOWN_KEYS[id])])
 return out
}
if(import.meta.url===`file://${process.argv[1]}`)console.log(JSON.stringify(await run(process.argv[2]),null,1))
