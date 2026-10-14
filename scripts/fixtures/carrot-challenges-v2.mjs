// Frozen pre-Asuna v2 merger from 7522e5638. Do not update with new game rules.
// A v1 client strips Portal as an unknown boss. Version 2 triggers its newer-format
// freeze; v1 data still migrates with a full per-boss union in current clients.
const newerChallengeVersion=(a        ,b        )        =>{const v=(r        )=>r&&typeof r==='object'&&Number.isInteger((r                      ).version)?(r                    ).version:0;const va=v(a),vb=v(b);return va<=2&&vb<=2?null:va>=vb?a:b}
const challengeBosses                =['tornado','zombie','eyeball','portal']
const isBoss=(v        )                   =>typeof v==='string'&&(challengeBosses            ).includes(v)
const cleanRecord=(raw        )                     =>{
 if(!raw||typeof raw!=='object')return null
 const r=raw                            ;const health=Math.floor(Number(r.health)),seconds=Number(r.seconds),towers=Math.floor(Number(r.towers))
 if(r.cleared!==true||!Number.isInteger(health)||health<1||health>10||!Number.isFinite(seconds)||seconds<0)return null
 return {cleared:true,health,seconds:Math.round(seconds*10)/10,towers:Number.isFinite(towers)&&towers>=0?towers:0}
}
export function cleanChallenges(raw        )                    {
 if(!raw||typeof raw!=='object')return null
 const version=(raw                      ).version
 if(version!==1&&version!==2)return null
 const best                      ={};const source=(raw                 ).best
 if(source&&typeof source==='object')for(const [boss,record] of Object.entries(source)){const r=cleanRecord(record);if(isBoss(boss)&&r)best[boss]=r}
 return {version:2,best}
}
function combine(a                ,b                )                 {
 const faster=a.seconds<=b.seconds?a:b
 return {cleared:a.cleared||b.cleared,health:Math.max(a.health,b.health),seconds:faster.seconds,towers:faster.towers}
}
/** Pure merge for account sync: per boss, cleared OR, best health, the faster time (with its tower count); v1 migrates to v2 and formats above v2 pass through. */
export function mergeCarrotChallenges(a        ,b        )                    {
 const newer=newerChallengeVersion(a,b);if(newer)return newer
 const x=cleanChallenges(a),y=cleanChallenges(b)
 if(!x)return y;if(!y)return x
 const best                      ={}
 for(const boss of challengeBosses){const p=x.best[boss],q=y.best[boss];if(p&&q)best[boss]=combine(p,q);else if(p||q)best[boss]=(p||q)                   }
 return {version:2,best}
}
