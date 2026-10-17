import build from './unity-build.json'
import type {Command,GameState} from './types'
import { errors } from './copy'
type Instance={SendMessage:(object:string,method:string,value:string)=>void;Quit:()=>Promise<void>}
type Factory=(canvas:HTMLCanvasElement,config:Record<string,unknown>,progress:(value:number)=>void)=>Promise<Instance>
// Local review builds never replace the published player. Production ignores this query.
const reviewBuild=import.meta.env.DEV&&new URLSearchParams(location.search).has('carrot-qa')
const playerRoot=reviewBuild?'/output/carrot-qa':'/unity/carrot'
const playerName=reviewBuild?'carrot-qa':'carrot'
const playerVersion=reviewBuild?'prism-review':build.version
let factoryPromise:Promise<Factory>|undefined
let lifetime:Promise<void>=Promise.resolve()
function factory():Promise<Factory>{
 if(!factoryPromise)factoryPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script')
  script.src=`${playerRoot}/Build/${playerName}.loader.js?v=${playerVersion}`
  script.onload=()=>{const f=window.createUnityInstance as Factory|undefined;if(f)resolve(f);else reject(new Error(errors.start))}
  script.onerror=()=>{factoryPromise=undefined;script.remove();reject(new Error(errors.download))}
  // Always load this game's own factory; another Unity game may have set the global.
  document.head.append(script)
 });return factoryPromise
}
export class CarrotUnity {
 private instance?:Instance
 private dead=false
 private release!:()=>void
 private loaded=false
 private motion=matchMedia('(prefers-reduced-motion: reduce)')
 /** The page's "Reduced effects" toggle: on, the game runs reduced motion even when the OS setting is off. */
 private reducedEffects=false
 private syncMotion=()=>this.instance?.SendMessage('CarrotGame','SetReducedMotion',this.motion.matches||this.reducedEffects?'1':'0')
 readonly canvas=document.createElement('canvas')
 private onState:(state:GameState)=>void
 constructor(root:HTMLElement,hooks:{state:(state:GameState)=>void;progress:(value:number)=>void;ready:()=>void;error:(message:string)=>void;bytes?:(done:number,total:number)=>void},level:number,muted:boolean,options:{reducedEffects?:boolean;mode?:string}={}){
  this.reducedEffects=!!options.reducedEffects
  this.onState=hooks.state;this.canvas.id='carrot-unity-canvas';this.canvas.className='ct-canvas';this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','Carrot Defense 3D battlefield. Tap a clearing to build.');root.replaceChildren(this.canvas)
  window.addEventListener('carrot-state',this.receive)
  this.motion.addEventListener('change',this.syncMotion)
  measureDisplayPeriod()
  const previous=lifetime;lifetime=new Promise(resolve=>{this.release=resolve})
  const files_:Record<string,[number,number]>={}
  void(async()=>{try{await previous;if(this.dead){this.release();return}const create=await factory();if(this.dead){this.release();return}
   lightenFences(this.canvas)
   // Download progress is reported here (0 to 0.8); the loader's own 0-1 then only ever moves the bar forward.
   let best=0;const progress=(value:number)=>{if(value>best){best=value;hooks.progress(value)}}
   const files=await Promise.all([['data','application/octet-stream'],['framework.js','text/javascript'],['wasm','application/wasm']].map(([ext,type])=>prepare(`${playerRoot}/Build/${playerName}.${ext}.unityweb?v=${playerVersion}`,type,(done,total)=>{files_[ext]=[done,total];let d=0,t=0;for(const [a,b] of Object.values(files_)){d+=a;t+=b}if(t>0){progress(.8*d/t);hooks.bytes?.(d,t)}})))
   if(this.dead){files.forEach(revoke);this.release();return}
   const instance=await create(this.canvas,{webglContextAttributes:{alpha:false,antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:false},dataUrl:files[0],frameworkUrl:files[1],codeUrl:files[2],streamingAssetsUrl:`${playerRoot}/StreamingAssets`,companyName:'Cornell Computational Game Society',productName:'Carrot Defense 3D',productVersion:'1.0',devicePixelRatio:Math.min(devicePixelRatio,innerWidth<700?1.25:1.75),showBanner:(message:string,type:string)=>{if(type==='error')hooks.error(message)}},value=>progress(.8+.2*value))
   files.forEach(revoke)
   if(this.dead){await instance.Quit();this.release();return}this.instance=instance;this.loaded=true;this.syncMotion();this.send(options.mode&&options.mode!=='normal'?{type:'load',level,mode:options.mode}:{type:'load',level});this.send({type:'mute',value:muted?1:0});hooks.ready()
  }catch(error){if(!this.dead)hooks.error(error instanceof Error?error.message:errors.start);this.release()}})()
 }
 private receive=(event:Event)=>{if(this.dead||!this.loaded)return;const s=(event as CustomEvent<GameState>).detail;if(s&&typeof s.level==='number')this.onState(s)}
 send(command:Command){this.instance?.SendMessage('CarrotGame','Command',JSON.stringify(command))}
 /** Additive debug entry (never called by the page): forces a tier ("high", "medium", "low") or toggles one feature for A/B captures. */
 quality(setting:string){this.instance?.SendMessage('CarrotGame','Quality',setting)}
 uiSound(kind='click'){this.instance?.SendMessage('CarrotGame','UiSound',kind)}
 // ---- view messages, bridge contract v2. The page sends these only to a build whose snapshot reports v>=2 (an older player has no receivers). ----
 /** Music, SFX and UI volumes, 0..1 each (CarrotAudio.SetVolumes). */
 setVolumes(volumes:{music:number;sfx:number;ui:number}){this.instance?.SendMessage('CarrotGame','SetVolumes',JSON.stringify(volumes))}
 /** The screen fractions the HUD and an open panel cover ({top,bottom,left,right}, 0..1), so the camera keeps the selected pad and the carrot clear of them. */
 setSafeArea(area:{top:number;bottom:number;left:number;right:number}){this.instance?.SendMessage('CarrotGame','SetSafeArea',JSON.stringify(area))}
 /** Centres the camera on the current boss (the only automatic framing the player asks for). */
 focusBoss(){this.instance?.SendMessage('CarrotGame','FocusBoss','')}
 /** Forces reduced motion in the game (no shake, hit-stop, FOV punch or camera moves) on top of the OS setting. */
 setReducedEffects(on:boolean){this.reducedEffects=on;this.syncMotion()}
 dispose(){this.dead=true;this.motion.removeEventListener('change',this.syncMotion);window.removeEventListener('carrot-state',this.receive);if(this.instance){const instance=this.instance;this.instance=undefined;void instance.Quit().finally(this.release)}this.canvas.remove()}
}

/**
 * Fetches one build file and, when it is still gzip (the host serves the .unityweb files as they are, with no Content-Encoding),
 * inflates it with the browser's own DecompressionStream, off the main thread, instead of the loader's JavaScript inflater
 * (22 MB of wasm and 36 MB of data inflated on the main thread before the first frame). Returns a blob: URL for the loader, or
 * the original URL when there is nothing to gain. `report(done,total)` follows the download in bytes.
 */
async function prepare(url:string,type:string,report:(done:number,total:number)=>void):Promise<string>{
 if(typeof DecompressionStream!=='function'||typeof Blob.prototype.stream!=='function')return url
 const response=await fetch(url)
 if(!response.ok)throw new Error(errors.download)
 const total=Number(response.headers.get('Content-Length'))||0;let done=0
 const chunks:Uint8Array[]=[];const reader=response.body?.getReader()
 if(reader){for(;;){const {value,done:end}=await reader.read();if(end)break;if(value){chunks.push(value);done+=value.length;report(done,Math.max(total,done))}}}
 else{const bytes=new Uint8Array(await response.arrayBuffer());chunks.push(bytes);done=bytes.length;report(done,done)}
 if(done===0)return url
 const gzip=chunks[0].length>2&&chunks[0][0]===0x1f&&chunks[0][1]===0x8b
 const raw=new Blob(chunks as BlobPart[])
 const body=gzip?await new Response(raw.stream().pipeThrough(new DecompressionStream('gzip'))).blob():raw
 return URL.createObjectURL(new Blob([body],{type}))
}
function revoke(url:string){if(url.startsWith('blob:'))URL.revokeObjectURL(url)}

/**
 * The display's own frame period (8.3 ms on a 120 Hz panel, 16.7 on 60 Hz), sampled from requestAnimationFrame while the loader
 * downloads and nothing heavy runs; the game's frame-time watcher reads it (window.__carrotDisplayPeriod) so a GPU-bound start is
 * not mistaken for a slow panel. Median of 40 intervals, long gaps (tab switches) dropped, snapped to the nearest standard
 * period (120, 90, 60, 30 Hz) within 20%: a headless browser can sample 6.0 ms while loading and then hold a steady 8.3.
 */
function measureDisplayPeriod(){
 const w=window as Window&{__carrotDisplayPeriod?:number}
 if(w.__carrotDisplayPeriod)return
 const gaps:number[]=[];let last=0
 const tick=(now:number)=>{if(last&&now-last<60)gaps.push(now-last);last=now;if(gaps.length<40){requestAnimationFrame(tick);return}
  const sorted=[...gaps].sort((a,b)=>a-b);const median=sorted[sorted.length>>1];const standard=[1000/120,1000/90,1000/60,1000/30].find(p=>Math.abs(median-p)<p*.2)
  w.__carrotDisplayPeriod=Math.round((standard??median)*100)/100}
 requestAnimationFrame(tick)
}

/**
 * Unity's WebGL player asks the GPU about a fence twice a frame (to limit the frames in flight). In Safari every fence call is a
 * synchronous trip to its GPU process that waits for the whole frame to run there: measured 40 ms of main thread per frame in the
 * High path on an Apple GPU, 2-3 ms with the fences answered at once. WebGL has no mapped buffers, so the fences guard nothing a
 * frame could overwrite, and the browser paces frames itself. Applied on WebKit (Safari and every iOS browser) by default and on
 * Unity's canvas only; ?carrotfences=all turns it on everywhere, ?carrotfences keeps Unity's real fences (for comparing).
 */
function lightenFences(canvas:HTMLCanvasElement){
 const own=canvas as HTMLCanvasElement&{__carrotFences?:boolean}
 if(own.__carrotFences)return
 own.__carrotFences=true
 let mode=''
 try{const params=new URLSearchParams(location.search);if(params.has('carrotfences'))mode=params.get('carrotfences')||'keep'}catch{/* no URL: go on */}
 const webkit=/Apple/.test(navigator.vendor||'')
 if(mode==='keep'||(mode!=='all'&&!webkit))return
 const getContext=canvas.getContext.bind(canvas) as (type:string,attributes?:unknown)=>unknown
 ;(canvas as unknown as {getContext:(type:string,attributes?:unknown)=>unknown}).getContext=(type:string,attributes?:unknown)=>{
  const context=getContext(type,attributes)
  if(type==='webgl2'&&context&&typeof WebGL2RenderingContext!=='undefined'&&context instanceof WebGL2RenderingContext)fakeFences(context)
  return context
 }
}
function fakeFences(gl:WebGL2RenderingContext&{__carrotFences?:boolean}){
 if(gl.__carrotFences)return
 gl.__carrotFences=true
 // Unity turns on every extension it is offered; Safari warns in the console about one it never needs (wireframes).
 const getExtension=gl.getExtension.bind(gl)
 const getSupportedExtensions=gl.getSupportedExtensions.bind(gl)
 Object.assign(gl,{
  getExtension:(name:string)=>(name==='WEBGL_polygon_mode'?null:getExtension(name)),
  getSupportedExtensions:()=>getSupportedExtensions()?.filter((name)=>name!=='WEBGL_polygon_mode')??null,
 })
 const fake=new WeakSet<object>()
 const real={clientWaitSync:gl.clientWaitSync.bind(gl),waitSync:gl.waitSync.bind(gl),deleteSync:gl.deleteSync.bind(gl),isSync:gl.isSync.bind(gl),getSyncParameter:gl.getSyncParameter.bind(gl)}
 const isFake=(sync:unknown)=>typeof sync==='object'&&sync!==null&&fake.has(sync)
 Object.assign(gl,{
  fenceSync:()=>{const sync={};fake.add(sync);return sync as WebGLSync},
  clientWaitSync:(sync:WebGLSync,flags:number,timeout:number)=>(isFake(sync)?gl.ALREADY_SIGNALED:real.clientWaitSync(sync,flags,timeout)),
  waitSync:(sync:WebGLSync,flags:number,timeout:number)=>(isFake(sync)?undefined:real.waitSync(sync,flags,timeout)),
  deleteSync:(sync:WebGLSync|null)=>(isFake(sync)?undefined:real.deleteSync(sync)),
  isSync:(sync:WebGLSync|null)=>(isFake(sync)?true:real.isSync(sync)),
  getSyncParameter:(sync:WebGLSync,name:number)=>{
   if(!isFake(sync))return real.getSyncParameter(sync,name)
   if(name===gl.SYNC_STATUS)return gl.SIGNALED
   if(name===gl.OBJECT_TYPE)return gl.SYNC_FENCE
   if(name===gl.SYNC_CONDITION)return gl.SYNC_GPU_COMMANDS_COMPLETE
   return 0
  },
 })
}
