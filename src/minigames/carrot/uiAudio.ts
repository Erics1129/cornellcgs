let voice:HTMLAudioElement|undefined
let last=0
/** One quiet voice covers the illustrated menus before Unity is loaded. */
export function menuSound(kind='click') {
 if(performance.now()-last<90)return
 last=performance.now()
 if(!voice)voice=new Audio()
 voice.pause();voice.src=`/assets/minigames/carrot/ui-${kind==='open'?'open':'click'}.ogg`
 voice.volume=.12
 void voice.play().catch(()=>{})
}
export function stopMenuSound(){voice?.pause()}
