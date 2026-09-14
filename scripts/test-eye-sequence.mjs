import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Requires a running DEV server. Optional CGS_EYE_ISOLATED=1 mounts the real
// FutureEye without unrelated app sections while other owners are editing.
const { chromium } = await import(process.env.CGS_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.CGS_TEST_URL || 'http://127.0.0.1:5190'
const browser = await chromium.launch({headless:true,executablePath:process.env.CGS_BROWSER_EXECUTABLE})
const results = []
async function prepare(page) {
  await page.routeWebSocket('**',()=>{})
  if (process.env.CGS_EYE_ISOLATED === '1') {
    await page.route(base+'/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#000"><div style="height:200vh"></div><div id="root"></div><div style="height:100vh"></div><script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
      const {default:React}=await import('/node_modules/.vite/deps/react.js');
      const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');
      const {default:FutureEye}=await import('/src/components/FutureEye.tsx');
      await import('/src/styles/global.css');
      window.__eyeTestRoot=ReactDOM.createRoot(document.getElementById('root'));
      window.__eyeTestRoot.render(React.createElement(React.StrictMode,null,React.createElement(FutureEye)));
    </script></body></html>`}))
  }
}
try {
  for (const [device,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
    const page = await browser.newPage({viewport:{width,height},isMobile:device==='mobile',hasTouch:device==='mobile'})
    const errors = [], warnings = [], eyeRequests = []
    page.on('pageerror',error=>errors.push(error.message))
    page.on('console',message=>{
      if (message.type()==='warning' && !message.text().includes('GPU stall due to ReadPixels')) warnings.push(message.text())
    })
    page.on('request',request=>{if(request.url().includes('/assets/sequences/eye-v5/'))eyeRequests.push(request.url())})
    await prepare(page)
    await page.goto(base,{waitUntil:'domcontentloaded'})
    await page.waitForSelector('#vision')
    await page.waitForTimeout(300)
    assert.equal(eyeRequests.length,0,'pose assets are not fetched on initial page load')
    const eye = page.locator('.scene-canvas--eye'), canvas = page.locator('canvas[data-scene="eye"]')
    const canvasShot=()=>canvas.screenshot({style:'.vision-pause,.film-grain,.cgs-nav,aside[aria-label="Chapters"]{visibility:hidden!important}'})
    if(process.env.CGS_EYE_ISOLATED!=='1')await page.waitForFunction(()=>window.__cgsShown===true)
    await eye.scrollIntoViewIfNeeded()
    await page.waitForFunction(()=>window.__eyeSequence?.snapshot().ready)
    const snapshot = ()=>page.evaluate(()=>window.__eyeSequence.snapshot())
    const first = await snapshot()
    assert.equal(first.playback,'playing','automatic playback needs no click')
    assert.ok(Object.values(first.assets).every(status=>status==='ready'),'all nine generated poses decoded')
    assert.ok(first.textureBytes<35_000_000,'texture budget under 35MB')
    await page.waitForTimeout(250)
    assert.ok((await snapshot()).clock>first.clock,'automatic clock advances')
    await page.waitForFunction(()=>Number(document.querySelector('canvas[data-scene="eye"]').dataset.blink)>.1,{},{timeout:7000})

    // Compare pixels rendered by the actual shader, without CSS/screenshot noise.
    const visual = await page.evaluate(async()=>{
      const canvas=document.querySelector('canvas[data-scene="eye"]'), gl=canvas.getContext('webgl2'), dev=window.__eyeSequence
      const w=canvas.width,h=canvas.height
      const compact=matchMedia('(max-width:1023px), (orientation:portrait)').matches
      const artWidth=compact?w*1.31:Math.min(w*1.10,h*2.45),artHeight=artWidth/1.5
      const render=(time,gaze,blink)=>{
        dev.renderAt(time,gaze,blink)
        const p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);return p
      }
      const difference=(a,b,outer=false)=>{
        let sum=0,count=0
        for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){
          const sourceY=(h*.5-y)/artHeight+.48
          if(outer&&(sourceY<.80||sourceY>.90))continue
          const i=(y*w+x)*4
          sum+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);count+=3
        }
        return sum/count
      }
      const ink=(p,later)=>{
        let xsum=0,ysum=0,count=0
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const i=(y*w+x)*4
          // Isolate changing code, excluding the blue iris and wet highlight.
          if(Math.abs(p[i]-later[i])+Math.abs(p[i+1]-later[i+1])+Math.abs(p[i+2]-later[i+2])>60){xsum+=x;ysum+=h-y;count++}
        }
        return {x:xsum/Math.max(1,count),y:ysum/Math.max(1,count),count}
      }
      const center=render(1.8,[0,0],0),later=render(3.2,[0,0],0),left=render(1.8,[-1,0],0),right=render(1.8,[1,0],0)
      const down=render(1.8,[0,-1],0),up=render(1.8,[0,1],0)
      const closed=render(1.8,[0,0],1),closedLater=render(4,[1,0],1),half=render(1.8,[0,0],.5)
      const reference=document.createElement('canvas');reference.width=w;reference.height=h
      const context=reference.getContext('2d')
      const source=await createImageBitmap(await(await fetch('/assets/sequences/eye-v5/left.webp')).blob())
      context.drawImage(source,w*.5-artWidth*.52,h*.5-artHeight*.48,artWidth,artHeight);source.close()
      const expected=context.getImageData(0,0,w,h).data
      let remnantError=0,remnantSamples=0
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const qx=(x-w*.5)/artWidth+.52,qy=(h*.5-y)/artHeight+.48
        if(qx<.69||qx>.76||!((qy>.30&&qy<.36)||(qy>.60&&qy<.64)))continue
        const actualIndex=(y*w+x)*4,expectedIndex=((h-1-y)*w+x)*4
        for(let c=0;c<3;c++){remnantError+=Math.abs(left[actualIndex+c]-expected[expectedIndex+c]);remnantSamples++}
      }
      const sweep=[];let previous=render(1.8,[-1,0],0)
      for(let i=1;i<=40;i++){const next=render(1.8,[-1+i/20,0],0);sweep.push(difference(previous,next));previous=next}
      const blinkSteps=[];previous=render(1.8,[0,0],0)
      for(let i=1;i<=20;i++){const next=render(1.8,[0,0],i/20);blinkSteps.push(difference(previous,next));previous=next}
      return {typing:difference(center,later),leftRight:difference(left,right),fixedSurround:difference(left,right,true),
        closedOcclusion:difference(closed,closedLater),deterministic:difference(center,render(1.8,[0,0],0)),
        leftSourceMatch:remnantError/remnantSamples,
        ink:{center:ink(center,later),left:ink(left,render(3.2,[-1,0],0)),right:ink(right,render(3.2,[1,0],0)),
          up:ink(up,render(3.2,[0,1],0)),down:ink(down,render(3.2,[0,-1],0)),half:ink(half,render(3.2,[0,0],.5)),closed:ink(closed,closedLater)},
        gazeSteps:{min:Math.min(...sweep),max:Math.max(...sweep)},blinkSteps:{min:Math.min(...blinkSteps),max:Math.max(...blinkSteps)},glError:gl.getError()}
    })
    console.log(`${device} pixel checks`,JSON.stringify(visual))
    assert.equal(visual.deterministic,0,'seeking the same frame is byte-identical')
    assert.ok(visual.typing>.02,'real code typing changes visible pixels')
    assert.ok(visual.leftRight>1,'different gaze keyframes change the eye')
    assert.equal(visual.fixedSurround,0,'face and surrounding lashes stay fixed during gaze')
    assert.ok(visual.leftSourceMatch<3,'turned-eye sclera matches generated left pose without center-iris remnants')
    assert.equal(visual.closedOcclusion,0,'closed lid fully occludes code and gaze at every time')
    assert.ok(visual.ink.right.x-visual.ink.left.x>width*.10,'code reflection follows the pupil horizontally')
    assert.ok(visual.ink.down.y-visual.ink.up.y>width*.07,'vertical poses and reflection move together')
    assert.ok(visual.ink.closed.count<visual.ink.center.count*.1,'closed lid hides bright code glyphs')
    assert.ok(visual.ink.half.count<visual.ink.center.count*.9,'half blink occludes code')
    assert.ok(visual.gazeSteps.min>.015&&visual.gazeSteps.max<4,'intermediate gaze frames move smoothly')
    assert.ok(visual.blinkSteps.min>.03&&visual.blinkSteps.max<8,'intermediate blink frames move smoothly')
    assert.equal(visual.glError,0)
    await page.evaluate(()=>window.__eyeSequence.resume())
    await page.getByRole('button',{name:'Pause eye animation'}).click()
    await page.waitForTimeout(80)
    const paused=await snapshot(),still=await canvasShot()
    await page.mouse.move(width*.15,height*.4)
    await page.waitForTimeout(250)
    assert.equal((await snapshot()).frames,paused.frames,'pause halts every animation frame')
    assert.ok(still.equals(await canvasShot()),'pause freezes image, gaze, blink and typing pixels')
    await page.getByRole('button',{name:'Resume eye animation'}).click()
    await page.waitForTimeout(200)
    assert.ok((await snapshot()).clock>paused.clock,'resume restores automatic playback')
    if(device==='desktop'){
      const r=await eye.boundingBox()
      await page.mouse.move(r.x+r.width*.10,r.y+r.height*.5);await page.waitForTimeout(400)
      const left=(await snapshot()).frame.gaze.x
      await page.mouse.move(r.x+r.width*.92,r.y+r.height*.5);await page.waitForTimeout(400)
      assert.ok(left<-.4&&(await snapshot()).frame.gaze.x>.4,'spring gaze tracks mouse left and right')
    }
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(120)
    const offscreen=await snapshot();await page.waitForTimeout(250)
    assert.equal((await snapshot()).frames,offscreen.frames,'offscreen renderer stops drawing')
    assert.equal((await snapshot()).playback,'offscreen')
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('eye-on')),false)
    await eye.scrollIntoViewIfNeeded();await page.waitForTimeout(100)
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('eye-on')),true)
    // Dispatch the same browser lifecycle event with a controlled hidden value.
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))})
    const hidden=await snapshot();await page.waitForTimeout(180)
    assert.equal((await snapshot()).frames,hidden.frames,'hidden document stops all drawing')
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))})
    await page.waitForTimeout(100)
    assert.ok((await snapshot()).frames>hidden.frames)
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(150)
    const reducedImage=await canvasShot(),reduced=await snapshot()
    await page.mouse.move(width*.8,height*.4);await page.waitForTimeout(200)
    assert.equal((await snapshot()).frames,reduced.frames,'reduced motion has no animation loop')
    assert.ok(reducedImage.equals(await canvasShot()),'reduced motion image is static')
    assert.equal((await snapshot()).frame.blink,0)
    assert.deepEqual((await snapshot()).frame.gaze,{x:0,y:0})
    await page.emulateMedia({reducedMotion:'no-preference'})
    const restored=await page.evaluate(()=>{
      const gl=document.querySelector('canvas[data-scene="eye"]').getContext('webgl2')
      const ext=gl.getExtension('WEBGL_lose_context');if(!ext)return false
      ext.loseContext();setTimeout(()=>ext.restoreContext(),150);return true
    })
    assert.ok(restored,'context loss extension available')
    await page.waitForFunction(()=>document.querySelector('.eye-sequence').dataset.renderer==='lost')
    await page.waitForFunction(()=>window.__eyeSequence.snapshot().ready,{},{timeout:15000})
    await page.waitForTimeout(200)
    assert.equal((await snapshot()).playback,'playing','context restoration rebuilds textures and resumes')
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no mobile overflow')
    assert.equal(await eye.evaluate(el=>{for(let e=el;e;e=e.parentElement)if(getComputedStyle(e).filter.includes('blur('))return true;return false}),false,'no full-page CSS blur')
    if(process.env.CGS_EYE_ISOLATED==='1'){
      await page.evaluate(()=>window.__eyeTestRoot.unmount())
      assert.equal(await page.evaluate(()=>window.__eyeSequence),undefined,'unmount removes the development hook')
      assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('eye-on')),false)
    }
    assert.deepEqual(errors,[]);assert.deepEqual(warnings,[])
    results.push({device,visual,autoplay:true,blink:true,mouse:device==='desktop',pause:true,offscreen:true,visibilityEvent:true,reduced:true,contextRestoration:true,errors,warnings})
    console.log(`PASS ${device}`,JSON.stringify(visual))
    await page.close()
  }
  // A missing directional pose is still a usable, correctly aligned center pose.
  const page=await browser.newPage({viewport:{width:1200,height:900}})
  await prepare(page)
  await page.route('**/assets/sequences/eye-v5/down.webp',route=>route.abort())
  await page.goto(base);await page.locator('.scene-canvas--eye').scrollIntoViewIfNeeded()
  await page.waitForFunction(()=>window.__eyeSequence?.snapshot().ready)
  assert.equal(await page.evaluate(()=>window.__eyeSequence.snapshot().assets.down),'center-fallback')
  const fallback=await page.evaluate(()=>{
    const canvas=document.querySelector('canvas[data-scene="eye"]'),dev=window.__eyeSequence
    dev.renderAt(1.8,[0,0],0);const center=canvas.toDataURL()
    dev.renderAt(1.8,[0,-1],0);return center===canvas.toDataURL()
  })
  assert.ok(fallback,'missing down pose renders center with aligned reflection')
  await page.close()
  await mkdir(resolve('output/eye-sequence'),{recursive:true})
  await writeFile(resolve('output/eye-sequence/test-results.json'),JSON.stringify({scope:process.env.CGS_EYE_ISOLATED==='1'?'isolated FutureEye':'full application',results,missingPoseFallback:fallback},null,2)+'\n')
  console.log('PASS eye sequence: desktop, mobile, lifecycle, deterministic frames, missing pose fallback')
} finally { await browser.close() }
