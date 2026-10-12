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
  const previous=lifetime;lifetime=new Promise(resolve=>{this.release=resolve})
  void(async()=>{try{await previous;if(this.dead){this.release();return}const create=await factory();if(this.dead){this.release();return}
   const instance=await create(this.canvas,{dataUrl:`/unity/carrot/Build/carrot.data.unityweb?v=${build.version}`,frameworkUrl:`/unity/carrot/Build/carrot.framework.js.unityweb?v=${build.version}`,codeUrl:`/unity/carrot/Build/carrot.wasm.unityweb?v=${build.version}`,streamingAssetsUrl:'/unity/carrot/StreamingAssets',companyName:'Cornell Computational Game Society',productName:'Carrot Defense 3D',productVersion:'1.0',devicePixelRatio:Math.min(devicePixelRatio,innerWidth<700?1.25:1.75),showBanner:(message:string,type:string)=>{if(type==='error')hooks.error(message)}},hooks.progress)
   if(this.dead){await instance.Quit();this.release();return}this.instance=instance;this.loaded=true;this.send({type:'load',level});this.send({type:'mute',value:muted?1:0});hooks.ready()
  }catch(error){if(!this.dead)hooks.error(error instanceof Error?error.message:'The garden could not open.');this.release()}})()
 }
 private receive=(event:Event)=>{if(this.dead||!this.loaded)return;const s=(event as CustomEvent<GameState>).detail;if(s&&typeof s.level==='number')this.onState(s)}
 send(command:Command){this.instance?.SendMessage('CarrotGame','Command',JSON.stringify(command))}
 uiSound(kind='click'){this.instance?.SendMessage('CarrotGame','UiSound',kind)}
 dispose(){this.dead=true;window.removeEventListener('carrot-state',this.receive);if(this.instance){const instance=this.instance;this.instance=undefined;void instance.Quit().finally(this.release)}this.canvas.remove()}
}
