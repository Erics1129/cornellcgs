import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

// Requires a running DEV server. Optional CGS_EYE_ISOLATED=1 mounts the real
// FutureEye without unrelated app sections while other owners are editing.
const { chromium, webkit } = await import(process.env.CGS_PLAYWRIGHT_MODULE || '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')
const base = process.env.CGS_TEST_URL || 'http://127.0.0.1:5190'
const engine = process.env.CGS_EYE_BROWSER === 'webkit' ? webkit : chromium
const browser = await engine.launch({headless:true,executablePath:process.env.CGS_BROWSER_EXECUTABLE})
const output = resolve(process.env.CGS_EYE_OUTPUT || resolve(tmpdir(),'cgs-eye-sequence-tests'))
await mkdir(output,{recursive:true})
const results = []
const directions = [[0,1,'N'],[Math.SQRT1_2,Math.SQRT1_2,'NE'],[1,0,'E'],[Math.SQRT1_2,-Math.SQRT1_2,'SE'],
  [0,-1,'S'],[-Math.SQRT1_2,-Math.SQRT1_2,'SW'],[-1,0,'W'],[-Math.SQRT1_2,Math.SQRT1_2,'NW']]
async function gallery(items,name) {
  const sheet = await browser.newPage({viewport:{width:1440,height:900}})
  await sheet.setContent('<body style="margin:0;background:#060a10;color:#ddeaff;font:15px system-ui"><main style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px"></main></body>')
  await sheet.evaluate(items=>{
    for(const item of items){
      const figure=document.createElement('figure');figure.style.margin='0'
      const img=document.createElement('img');img.src=item.image;img.style.cssText='width:100%;display:block'
      const caption=document.createElement('figcaption');caption.textContent=item.name;caption.style.padding='8px'
      figure.append(img,caption);document.querySelector('main').append(figure)
    }
  },items)
  await sheet.evaluate(()=>Promise.all(Array.from(document.images,image=>image.decode())))
  await sheet.screenshot({path:resolve(output,`${name}.png`),fullPage:true})
  await sheet.close()
}
async function proofFrames(page,device) {
  const poses=[]
  for(const radius of [.25,.55,1])for(const [x,y,name] of directions)poses.push([`${name}-${radius}`,x*radius,y*radius,0])
  for(const blink of [.125,.375,.625,.875,1])for(const [x,y,name] of directions.filter((_,i)=>i%2))poses.push([`${name}-blink-${blink}`,x*.85,y*.85,blink])
  const items=[]
  for(const [name,x,y,blink] of poses){
    const image=await page.evaluate(({x,y,blink})=>{
      window.__eyeSequence.renderAt(1.8,[x,y],blink)
      return document.querySelector('canvas[data-scene="eye"]').toDataURL()
    },{x,y,blink})
    await writeFile(resolve(output,`${device}-${name}.png`),Buffer.from(image.split(',')[1],'base64'))
    items.push({name,image})
  }
  await gallery(items.slice(0,24),`${device}-gaze-grid`)
  await gallery(items.slice(24),`${device}-blink-grid`)
  return poses.length
}
async function pointerChecks(page,eye,device) {
  const snapshot=()=>page.evaluate(()=>window.__eyeSequence.snapshot())
  await page.evaluate(()=>window.__eyeSequence.resume())
  // Observe the real RAF loop. No renderAt, synthetic pointer dispatch or
  // accelerated clock is used for these sweeps, handoffs or repeat checks.
  await page.evaluate(()=>{
    window.__eyeSamples=[];window.__eyeSampling=true
    const sample=()=>{
      if(!window.__eyeSampling)return
      const s=window.__eyeSequence.snapshot()
      window.__eyeSamples.push({time:s.clock,gaze:s.frame.gaze,blink:s.frame.blink,fixation:s.fixation,target:s.target})
      requestAnimationFrame(sample)
    };requestAnimationFrame(sample)
  })
  const r=await eye.boundingBox(),view=page.viewportSize()
  const compact=await page.evaluate(()=>matchMedia('(max-width:1023px), (orientation:portrait)').matches)
  const artWidth=compact?r.width*1.31:Math.min(r.width*1.10,r.height*2.45)
  const iris={x:r.x+r.width*.5+(.577-.52)*artWidth,y:r.y+r.height*.5+(.425-.48)*artWidth/1.5}
  const position=(x,y)=>({x:Math.max(r.x+2,Math.min(r.x+r.width-2,iris.x+x*artWidth*.32)),
    y:Math.max(Math.max(2,r.y+2),Math.min(Math.min(view.height-2,r.y+r.height-2),iris.y-y*artWidth/1.5*.30))})
  const move=async(x,y,wait=360)=>{
    const p=position(x,y);await page.mouse.move(p.x,p.y)
    if(wait)await page.waitForTimeout(wait)
    return snapshot()
  }
  const items=[];let maxSettledError=0
  for(const radius of [.25,.55,1])for(const [x,y,name] of directions){
    const s=await move(x*radius,y*radius)
    assert.equal(s.tracking,true,`${device} ${name}: real pointer owns gaze`)
    const error=Math.hypot(s.frame.gaze.x-s.target.x,s.frame.gaze.y-s.target.y)
    maxSettledError=Math.max(maxSettledError,error)
    assert.ok(error<.035,`${device} ${name}: gaze settles at actual pointer (${error})`)
    if(x)assert.equal(Math.sign(s.frame.gaze.x),Math.sign(x),`${name} horizontal direction`)
    if(y)assert.equal(Math.sign(s.frame.gaze.y),Math.sign(y),`${name} vertical direction`)
    if(device==='desktop'){
      const bytes=await eye.locator('canvas').screenshot()
      const label=`pointer-${name}-${radius}`
      await writeFile(resolve(output,`${device}-${label}.png`),bytes)
      items.push({name:`${label}; gaze ${s.frame.gaze.x.toFixed(2)}, ${s.frame.gaze.y.toFixed(2)}`,image:`data:image/png;base64,${bytes.toString('base64')}`})
    }
  }
  // Force the cursor to all four geometric corners beyond the normalized range.
  for(const [x,y] of [[r.x+2,r.y+2],[r.x+r.width-2,r.y+2],[r.x+2,r.y+r.height-2],[r.x+r.width-2,r.y+r.height-2]]){
    await page.mouse.move(x,Math.max(2,Math.min(view.height-2,y)));await page.waitForTimeout(280)
    const s=await snapshot();assert.ok(Math.hypot(s.frame.gaze.x,s.frame.gaze.y)<=1.00001,'corners stay within anatomical range')
  }
  for(let i=0;i<32;i++){
    const [x,y]=directions[(i*3)%8];await move(x,y,35)
  }
  const settled=await move(.35,-.3,500)
  assert.ok(Math.hypot(settled.frame.gaze.x-settled.target.x,settled.frame.gaze.y-settled.target.y)<.01,'rapid reversals settle without bounce')
  // Keep moving through an entire blink interval, including full closure.
  const blinkStart=(await snapshot()).clock,blinkDeadline=Date.now()+20000;let pointerBlink=0
  while((await snapshot()).clock-blinkStart<5.2){
    assert.ok(Date.now()<blinkDeadline,'pointer blink loop keeps advancing in real time')
    const s=await snapshot(),phase=(s.clock-blinkStart)*3
    await move(Math.cos(phase)*.8,Math.sin(phase)*.8,35)
    const next=await snapshot()
    if(next.frame.blink>.05&&pointerBlink<4){
      const bytes=await eye.locator('canvas').screenshot()
      await writeFile(resolve(output,`${device}-pointer-blink-${pointerBlink++}.png`),bytes)
    }
  }
  assert.ok(pointerBlink>0,'automatic blink continues during active mouse gaze')
  // Crossing the boundary must hand over from the displayed gaze, then allow
  // immediate reacquisition. Repeat to catch retained enter/leave state.
  for(let i=0;i<4;i++){
    await move(i%2?-.7:.7,.2,150)
    await page.mouse.move(1,1);await page.waitForTimeout(70)
    assert.equal((await snapshot()).tracking,false,'pointerleave releases gaze')
    assert.equal((await snapshot()).fixation,'handoff','leave starts smooth handoff')
  }
  await move(.7,-.25,350)
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')))
  await page.waitForTimeout(80)
  assert.equal((await snapshot()).tracking,false,'window blur releases stale pointer')
  await move(-.65,.2,350)
  await page.waitForFunction(()=>window.__eyeSequence.snapshot().fixation==='autonomous',null,{timeout:8000})
  assert.equal((await snapshot()).fixation,'autonomous','parked mouse returns to continuous idle')
  await move(.6,.1,300)
  assert.equal((await snapshot()).tracking,true,'fresh movement immediately reacquires gaze')
  await page.mouse.move(1,1);await page.waitForTimeout(1000)
  const idleStart=(await snapshot()).clock,period=(await snapshot()).idlePeriod
  if(device==='desktop'&&process.env.CGS_EYE_SHORT!=='1'){
    const loopItems=[],idleDeadline=Date.now()+75000
    while((await snapshot()).clock-idleStart<period*2+.5){
      assert.ok(Date.now()<idleDeadline,'autonomous loop keeps advancing in real time')
      await page.waitForTimeout(2050)
      const s=await snapshot(),bytes=await eye.locator('canvas').screenshot()
      loopItems.push({name:`Autonomous ${s.clock.toFixed(2)}s; ${s.frame.gaze.x.toFixed(2)}, ${s.frame.gaze.y.toFixed(2)}`,image:`data:image/png;base64,${bytes.toString('base64')}`})
      console.log(`Live eye idle ${(s.clock-idleStart).toFixed(1)} / ${(period*2).toFixed(1)}s`)
    }
    await gallery(loopItems,'desktop-live-idle-loops')
  }
  const samples=await page.evaluate(()=>{window.__eyeSampling=false;return window.__eyeSamples})
  let maxSpeed=0,maxStep=0,closed=0,blinkRuns=0,previousBlink=0
  for(let i=1;i<samples.length;i++){
    const s=samples[i],p=samples[i-1],dt=s.time-p.time
    if(dt<=0)continue
    assert.ok(Number.isFinite(s.gaze.x)&&Number.isFinite(s.gaze.y),'all real RAF gaze samples finite')
    assert.ok(Math.hypot(s.gaze.x,s.gaze.y)<=1.00001,'real reversals never leave range')
    const distance=Math.hypot(s.gaze.x-p.gaze.x,s.gaze.y-p.gaze.y)
    maxStep=Math.max(maxStep,distance);maxSpeed=Math.max(maxSpeed,distance/dt)
    if(s.blink>.99)closed++
    if(s.blink>.05&&previousBlink<=.05)blinkRuns++
    previousBlink=s.blink
    if(s.fixation==='handoff'&&p.fixation==='pointer')assert.ok(distance<.10,'mouse-to-idle handoff has no jump')
  }
  assert.ok(maxSpeed<25,'bounded speed through rapid reversals')
  assert.ok(closed>0,'live playback reaches fully closed blink')
  if(device==='desktop'&&process.env.CGS_EYE_SHORT!=='1')assert.ok(blinkRuns>=8,'blinks repeat over multiple idle cycles')
  await writeFile(resolve(output,`${device}-pointer-telemetry.json`),JSON.stringify(samples))
  if(items.length)await gallery(items,`${device}-actual-pointer-grid`)
  return {positions:24,corners:4,reversals:32,pointerBlink,enterLeave:4,inactivity:true,blur:true,maxSettledError,maxStep,maxSpeed,blinkRuns,closedSamples:closed,samples:samples.length,idleSeconds:(await snapshot()).clock-idleStart}
}
async function prepare(page) {
  await page.routeWebSocket('**',()=>{})
  if (process.env.CGS_EYE_ISOLATED === '1') {
    await page.route(base+'/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><title>Eye sequence QA</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#000"><div style="height:200vh"></div><div id="root"></div><div style="height:100vh"></div><script type="module">
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
      if (message.type()==='error') errors.push(message.text())
      if (message.type()==='warning' && !message.text().includes('GPU stall due to ReadPixels')) warnings.push(message.text())
    })
    page.on('request',request=>{if(request.url().includes('/assets/sequences/eye-v5/'))eyeRequests.push(request.url())})
    await prepare(page)
    await page.goto(base,{waitUntil:'domcontentloaded'})
    await page.waitForSelector('#vision')
    assert.ok((await page.title()).length>0,'page has the intended document title')
    assert.equal(new URL(page.url()).origin,new URL(base).origin,'page identity matches requested preview')
    assert.equal(await page.locator('vite-error-overlay').count(),0,'no framework overlay')
    assert.ok(await page.locator('#vision').innerText(),'eye chapter contains meaningful content')
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
      const paths=[],diagonalBlink=[],diagonalOuterMotion=[];let closedAcrossDirections=0
      for(const [dx,dy] of [[0,1],[Math.SQRT1_2,Math.SQRT1_2],[Math.SQRT1_2,-Math.SQRT1_2]]){
        let prior=render(1.8,[-dx,-dy],0),maximum=0
        for(let i=1;i<=40;i++){
          const t=-1+i/20,next=render(1.8,[dx*t,dy*t],0)
          maximum=Math.max(maximum,difference(prior,next));prior=next
        }
        paths.push(maximum)
      }
      for(let angle=0;angle<8;angle++){
        const gaze=[Math.cos(angle*Math.PI/4),Math.sin(angle*Math.PI/4)]
        closedAcrossDirections=Math.max(closedAcrossDirections,difference(closed,render(6+angle,gaze,1)))
        let prior=render(1.8,gaze,0),maximum=0
        for(let i=1;i<=20;i++){
          const next=render(1.8,gaze,i/20);maximum=Math.max(maximum,difference(prior,next));prior=next
        }
        diagonalBlink.push(maximum)
        if(angle%2)diagonalOuterMotion.push(difference(render(1.8,gaze.map(v=>v*.8),0),render(1.8,gaze,0)))
      }
      // Catchlight topology in the rendered image, excluding the code panel.
      // Misregistration used to split the single source light into two blobs.
      const catchlights=[]
      for(const [gx,gy] of [[-.5,-.5],[-.5,.5],[.5,-.5],[.5,.5],[0,-.5],[-.5,0]]){
        const p=render(0,[gx,gy],0)
        const centers=[[.53568,.36540],[.43559,.38707],[.58435,.36399],[.53636,.32197],[.52966,.45954]]
        const hx=gx<0?1:2,vy=gy>0?3:4,wx=Math.abs(gx),wy=Math.abs(gy)
        const light=centers[0].map((v,i)=>v*(1-wx-wy)+centers[hx][i]*wx+centers[vy][i]*wy)
        const mask=new Uint8Array(w*h),components=[]
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const qx=(x-w*.5)/artWidth+.52,qy=(h*.5-y)/artHeight+.48
          // The compact editor's first line is only .03 source units below
          // the light. Exclude those letters from the bright-blob count.
          if(Math.hypot((qx-light[0])/.018,(qy-light[1])/.024)>1)continue
          const i=(y*w+x)*4
          if(p[i]*.21+p[i+1]*.72+p[i+2]*.07>135)mask[y*w+x]=1
        }
        for(let start=0;start<mask.length;start++)if(mask[start]){
          let size=0;const stack=[start];mask[start]=0
          while(stack.length){const i=stack.pop();size++;for(const n of [i-1,i+1,i-w,i+w])if(n>=0&&n<mask.length&&mask[n]){mask[n]=0;stack.push(n)}}
          if(size>3)components.push(size)
        }
        catchlights.push(components.length)
      }
      return {typing:difference(center,later),leftRight:difference(left,right),fixedSurround:difference(left,right,true),
        closedOcclusion:difference(closed,closedLater),deterministic:difference(center,render(1.8,[0,0],0)),
        allDirectionClosedOcclusion:closedAcrossDirections,verticalDiagonalSteps:paths,allDirectionBlinkSteps:diagonalBlink,diagonalOuterMotion,catchlights,
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
    assert.equal(visual.allDirectionClosedOcclusion,0,'fully closed eye is identical in all eight gaze directions')
    assert.ok(visual.verticalDiagonalSteps.every(max=>max<5),'vertical and diagonal intermediate frames have no abrupt seams')
    assert.ok(visual.allDirectionBlinkSteps.every(max=>max<8),'blinks stay continuous in every gaze direction')
    assert.ok(visual.diagonalOuterMotion.every(difference=>difference>.3),'outer diagonal range still moves; no triangular-weight dead zone')
    assert.ok(visual.catchlights.every(count=>count===1),'intermediate blends keep one catchlight without ghosts')
    assert.ok(visual.ink.right.x-visual.ink.left.x>width*.10,'code reflection follows the pupil horizontally')
    assert.ok(visual.ink.down.y-visual.ink.up.y>width*.07,'vertical poses and reflection move together')
    assert.ok(visual.ink.closed.count<visual.ink.center.count*.1,'closed lid hides bright code glyphs')
    assert.ok(visual.ink.half.count<visual.ink.center.count*.9,'half blink occludes code')
    assert.ok(visual.gazeSteps.min>.015&&visual.gazeSteps.max<4,'intermediate gaze frames move smoothly')
    assert.ok(visual.blinkSteps.min>.03&&visual.blinkSteps.max<8,'intermediate blink frames move smoothly')
    assert.equal(visual.glError,0)
    const screenshots=await proofFrames(page,device)
    const pointer=await pointerChecks(page,eye,device)
    console.log(`${device} actual pointer checks`,JSON.stringify(pointer))
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
    results.push({device,visual,pointer,screenshots,autoplay:true,blink:true,mouse:true,pause:true,offscreen:true,visibilityEvent:true,reduced:true,contextRestoration:true,errors,warnings})
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
  await writeFile(resolve(output,'test-results.json'),JSON.stringify({url:base,browser:process.env.CGS_EYE_BROWSER||'chromium',scope:process.env.CGS_EYE_ISOLATED==='1'?'isolated FutureEye':'full application',results,missingPoseFallback:fallback},null,2)+'\n')
  console.log('PASS eye sequence: desktop, mobile, lifecycle, deterministic frames, missing pose fallback')
} finally { await browser.close() }
