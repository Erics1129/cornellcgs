import build from './unity-build.json'
import type {Command,GameState} from './types'
type Instance={SendMessage:(object:string,method:string,value:string)=>void;Quit:()=>Promise<void>}
type Factory=(canvas:HTMLCanvasElement,config:Record<string,unknown>,progress:(value:number)=>void)=>Promise<Instance>
let factoryPromise:Promise<Factory>|undefined
let lifetime:Promise<void>=Promise.resolve()
function factory():Promise<Factory>{
 if(!factoryPromise)factoryPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script')
  script.src=`/unity/carrot/Build/carrot.loader.js?v=${build.version}`
  script.onload=()=>{const f=window.createUnityInstance as Factory|undefined;if(f)resolve(f);else reject(new Error('The garden could not open.'))}
  script.onerror=()=>{factoryPromise=undefined;script.remove();reject(new Error('The garden could not download. Check your connection and retry.'))}
  // Always load this game's own factory; another Unity game may have set the global.
  document.head.append(script)
 });return factoryPromise
}
export class CarrotUnity {
 private instance?:Instance
 private dead=false
 private release!:()=>void
 private loaded=false
 readonly canvas=document.createElement('canvas')
 private onState:(state:GameState)=>void
 constructor(root:HTMLElement,hooks:{state:(state:GameState)=>void;progress:(value:number)=>void;ready:()=>void;error:(message:string)=>void},level:number,muted:boolean){
  this.onState=hooks.state;this.canvas.id='carrot-unity-canvas';this.canvas.className='ct-canvas';this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','Carrot Defense 3D battlefield. Tap a clearing to build.');root.replaceChildren(this.canvas)
  window.addEventListener('carrot-state',this.receive)
  measureDisplayPeriod()
  const previous=lifetime;lifetime=new Promise(resolve=>{this.release=resolve})
  void(async()=>{try{await previous;if(this.dead){this.release();return}const create=await factory();if(this.dead){this.release();return}
   lightenFences(this.canvas)
   const instance=await create(this.canvas,{webglContextAttributes:{alpha:false,antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:false},dataUrl:`/unity/carrot/Build/carrot.data.unityweb?v=${build.version}`,frameworkUrl:`/unity/carrot/Build/carrot.framework.js.unityweb?v=${build.version}`,codeUrl:`/unity/carrot/Build/carrot.wasm.unityweb?v=${build.version}`,streamingAssetsUrl:'/unity/carrot/StreamingAssets',companyName:'Cornell Computational Game Society',productName:'Carrot Defense 3D',productVersion:'1.0',devicePixelRatio:Math.min(devicePixelRatio,innerWidth<700?1.25:1.75),showBanner:(message:string,type:string)=>{if(type==='error')hooks.error(message)}},hooks.progress)
   if(this.dead){await instance.Quit();this.release();return}this.instance=instance;this.loaded=true;this.send({type:'load',level});this.send({type:'mute',value:muted?1:0});hooks.ready()
  }catch(error){if(!this.dead)hooks.error(error instanceof Error?error.message:'The garden could not open.');this.release()}})()
 }
 private receive=(event:Event)=>{if(this.dead||!this.loaded)return;const s=(event as CustomEvent<GameState>).detail;if(s&&typeof s.level==='number')this.onState(s)}
 send(command:Command){this.instance?.SendMessage('CarrotGame','Command',JSON.stringify(command))}
 /** Additive debug entry (never called by the page): forces a tier ("high", "medium", "low") or toggles one feature for A/B captures. */
 quality(setting:string){this.instance?.SendMessage('CarrotGame','Quality',setting)}
 uiSound(kind='click'){this.instance?.SendMessage('CarrotGame','UiSound',kind)}
 dispose(){this.dead=true;window.removeEventListener('carrot-state',this.receive);if(this.instance){const instance=this.instance;this.instance=undefined;void instance.Quit().finally(this.release)}this.canvas.remove()}
}

/**
 * The display's own frame period (8.3 ms on a 120 Hz panel, 16.7 on 60 Hz), sampled from requestAnimationFrame while the loader
 * downloads and nothing heavy runs; the game's frame-time watcher reads it (window.__carrotDisplayPeriod) so a GPU-bound start is
 * not mistaken for a slow panel. Median of 40 intervals, long gaps (tab switches) dropped.
 */
function measureDisplayPeriod(){
 const w=window as Window&{__carrotDisplayPeriod?:number}
 if(w.__carrotDisplayPeriod)return
 const gaps:number[]=[];let last=0
 const tick=(now:number)=>{if(last&&now-last<60)gaps.push(now-last);last=now;if(gaps.length<40){requestAnimationFrame(tick);return}
  const sorted=[...gaps].sort((a,b)=>a-b);w.__carrotDisplayPeriod=Math.round(sorted[sorted.length>>1]*100)/100}
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
