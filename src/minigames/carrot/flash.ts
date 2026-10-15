/**
 * The page's flash governor (WCAG 2.3.1): every DOM flash (coin flash, heart pip, the red edge vignette, the judgement's chromatic split)
 * asks here first. A source that is still lit is extended instead of retriggered, so a burst of bites holds one glow rather than
 * strobing, and at most three large flashes start in any rolling second. Under reduced motion only opacity changes are used.
 */
type Source={until:number}
const sources=new Map<string,Source>()
const largeStarts:number[]=[]
export const MaxLargePerSecond=3
/** Returns 'start' when the caller may run its flash, 'extend' when it should only hold the current one (and for how long). */
export function requestFlash(id:string,ms:number,large=false):'start'|'extend'{
 const now=performance.now(),s=sources.get(id)
 if(s&&s.until>now){s.until=Math.max(s.until,now+ms);return 'extend'}
 if(large){while(largeStarts.length&&now-largeStarts[0]>1000)largeStarts.shift();if(largeStarts.length>=MaxLargePerSecond){sources.set(id,{until:now+ms});return 'extend'}largeStarts.push(now)}
 sources.set(id,{until:now+ms});return 'start'
}
export function flashActiveUntil(id:string){return sources.get(id)?.until||0}
/** Test hook: how many large flashes started in the last second. */
export function largeFlashesInLastSecond(){const now=performance.now();return largeStarts.filter(t=>now-t<=1000).length}
