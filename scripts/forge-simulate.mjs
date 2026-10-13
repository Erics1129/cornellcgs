import { act, createRun, odds, expectedValue, value, bestKnife, flowNeed, price, runDays } from '../src/minigames/forge/engine.ts'
const count=Number(process.argv[2]||2000)
const demo=createRun(1), blank=demo.knives[0]
console.log('Level | Perfect Good Dull Chip Shatter | value | next-hit EV | change')
for(let level=0;level<=20;level++){const k={...blank,level};console.log(level,String(Object.values(odds(k,demo)).map(p=>(p*100).toFixed(1)).join(' / ')),value(k),expectedValue(k,demo).toFixed(1),((expectedValue(k,demo)/value(k)-1)*100).toFixed(1)+'%')}
for(const [name,target] of [['careful',9],['balanced',11],['bold',18]]){
 const scores=[],levels=[],metalCounts={}
 for(let seed=1;seed<=count;seed++){
  let s=createRun(seed),focus=null
  const doA=a=>{if(a.type==='hit')s=act(s,{type:'tick',ms:s.knives.find(k=>k.id===a.id)?.flow?560:850}).state;const t=act(s,a);s=t.state;return t.ok}
  const knife=id=>s.knives.find(k=>k.id===id)
  const buy=key=>s.stock[key]>0&&s.gold>=price(s,key)&&doA({type:'buy',key})
  const heat=id=>{doA({type:'move',id,to:'furnace'});doA({type:'heat',id});doA({type:'move',id,to:'anvil'})}
  const days=runDays(s)
  for(let day=1;day<=days;day++){
   // Income: stop at level three on free iron, sell it, then invest in a persistent masterwork.
   // Strategy attention budgets bound a simulation; the game itself has unlimited energy.
   const incomeBudget=day===1?18:focus?8:11,start=s.hitsToday
   for(const id of s.knives.filter(k=>k.place==='crate'&&k.id!==focus).map(k=>k.id)){
    if(s.hitsToday-start>=incomeBudget){doA({type:'sell',id});continue}
    heat(id)
    while(knife(id)&&knife(id).level<3&&s.hitsToday-start<incomeBudget)doA({type:'hit',id})
    if(knife(id))doA({type:'sell',id})
   }
   // Mid-metal focus, with enough gold reserved for recovery. No hidden luck or odds changes.
   if(!knife(focus)){
    for(const metal of ['silver','steel','bronze','iron'])if(s.stock['metal:'+metal]&&s.gold>=price(s,'metal:'+metal)+280){doA({type:'buy',key:'metal:'+metal});focus=s.knives.at(-1).id;break}
   }
   if(knife(focus)){
    for(const key of ['guard','rewind'])while(s.items[key]<2&&buy(key)){}
    // Charms pay back over several days, so none in the last three.
    if(day<days-2)for(const key of ['rhythm','patience','shelter','steady','tide'])if(s.charms.length<5&&s.gold>price(s,'charm:'+key)+400)buy('charm:'+key)
    heat(focus)
    let safety=0
    while(knife(focus)&&knife(focus).level<target&&safety++<60){
     let k=knife(focus)
     if(k.pips>=flowNeed(s)&&!k.flow)doA({type:'flow',id:focus})
     k=knife(focus)
     if(!k.flow&&!k.guard&&k.level>=3&&s.items.guard)doA({type:'use',item:'guard',id:focus})
     k=knife(focus)
     // The cautious smith keeps the knife overnight when recovery is exhausted.
     if(name==='careful'&&k.level>=4&&!k.flow&&!k.guard&&!s.items.rewind)break
     doA({type:'hit',id:focus})
     if(!knife(focus)&&s.items.rewind)doA({type:'use',item:'rewind'})
    }
    if(knife(focus)){
     if(day===days&&s.gold>=price(s,'whetstone')){buy('whetstone');doA({type:'use',item:'whetstone',id:focus})}
     doA({type:'move',id:focus,to:'rack'})
    }
   }
   doA({type:'end'})
  }
  const best=bestKnife(s);scores.push(best?value(best,s):0);levels.push(best?.level||0);metalCounts[best?.metal||'none']=(metalCounts[best?.metal||'none']||0)+1
 }
 scores.sort((a,b)=>a-b);levels.sort((a,b)=>a-b)
 const q=(arr,p)=>arr[Math.floor((arr.length-1)*p)]
 console.log(JSON.stringify({strategy:name,runs:count,score:{p10:q(scores,.1),median:q(scores,.5),p90:q(scores,.9),p99:q(scores,.99),max:scores.at(-1)},level:{p10:q(levels,.1),median:q(levels,.5),p90:q(levels,.9)},metals:metalCounts}))
}
