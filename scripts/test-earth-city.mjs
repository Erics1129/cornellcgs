import assert from 'node:assert/strict'
// Set CGS_PLAYWRIGHT_MODULE to your Playwright module URL/path if it is not installed locally.
const {chromium,webkit} = await import(process.env.CGS_PLAYWRIGHT_MODULE || 'playwright')
const base=process.env.CGS_TEST_URL||'http://127.0.0.1:5193',results=[]
const stops=[['bali',.43],['hawaii',.61],['dolomites',.744],['iceland',.828],['new-york',.886],['cornell-ithaca',.964]]
for(const [engine,type] of [['Chromium',chromium],['WebKit',webkit]]){
 const b=await type.launch({headless:true})
 for(const [device,w,h] of [['desktop',1440,900],['phone',390,844]]){
  if(process.env.CGS_TEST_CASE && !`${engine}-${device}`.match(process.env.CGS_TEST_CASE))continue
  const p=await b.newPage({viewport:{width:w,height:h},isMobile:w<500,hasTouch:w<500}),errors=[],missing=[]
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().startsWith(base+'/assets/')&&r.status()>=400)missing.push(r.url())})
  try{
   await p.goto(base);await p.waitForTimeout(2400)
   const city=p.locator('.code-city'),travel=p.locator('.earth-travel')
   const goto=async(t)=>{await p.locator('#world').evaluate((e,p)=>scrollTo(0,e.getBoundingClientRect().top+scrollY+(e.clientHeight-innerHeight)*p),t);await p.waitForTimeout(900)}
   assert.equal(await city.getAttribute('data-renderer'),'ready');assert.ok(await city.locator('img').evaluate(e=>e.complete&&e.naturalWidth===1536))
   const cityMask='#top>:not(.code-city),#top>:not(.code-city) *,main>:not(#top),canvas:not(.code-city__canvas),.cgs-nav,aside,.film-grain,footer{visibility:hidden!important;opacity:0!important;transition:none!important}';const cityShot=()=>city.screenshot({style:cityMask});const a=await cityShot();await p.waitForTimeout(300);assert.ok(!a.equals(await cityShot()),'city travels automatically')
   await p.screenshot({path:`/tmp/cgs-final-${engine}-${device}-city.png`})
   for(const theme of ['sky','lilac']){await p.evaluate(theme=>{document.documentElement.dataset.theme=theme;window.dispatchEvent(new CustomEvent('cgs:theme',{detail:{theme}}))},theme);await p.waitForTimeout(1350);assert.equal(await p.locator('.code-city__mist').count(),0);assert.deepEqual(await city.locator('canvas').evaluate(e=>{const gl=e.getContext('webgl'),program=gl.getParameter(gl.CURRENT_PROGRAM);return Array.from(gl.getUniform(program,gl.getUniformLocation(program,'u_tint'))).map(x=>Number(x.toFixed(2)))}),[.08,.48,1]);await p.screenshot({path:`/tmp/cgs-final-${engine}-${device}-${theme}.png`})}
   await p.evaluate(()=>{document.documentElement.dataset.theme='blue';window.dispatchEvent(new CustomEvent('cgs:theme',{detail:{theme:'blue'}}))})
   await goto(.06);await p.screenshot({path:`/tmp/cgs-final-${engine}-${device}-globe.png`});assert.equal(await city.getAttribute('data-playback'),'offscreen')
   for(const [id,t] of stops){await goto(t);assert.equal(await p.locator('#world').getAttribute('data-earth-renderer'),'webgl2');assert.equal(await p.locator('#world [data-active=true]').getAttribute('data-earth-place'),id);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0)}
   await p.screenshot({path:`/tmp/cgs-final-${engine}-${device}-cornell.png`})
   assert.equal(await p.locator('#world .earth-photo').count(),6);assert.ok(await p.locator('#world .earth-photo').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)))
   const snap=()=>travel.screenshot({style:'.cgs-nav,aside[aria-label="Chapters"],.film-grain{visibility:hidden!important}'})
   await goto(.70);const forward=await snap();await goto(.94);await goto(.70);assert.ok(forward.equals(await snap()),'reverse scroll returns same photo composition')
   await p.waitForTimeout(400);assert.ok(forward.equals(await snap()),'photos stop when scrolling stops')
   for(const [id] of [...stops].reverse()){await p.locator(`[data-earth-place="${id}"] .earth-photo-credit a`).first().focus();await p.waitForTimeout(200);assert.equal(await p.locator('#world [data-active=true]').getAttribute('data-earth-place'),id,'keyboard finds exact short stop');assert.ok(await p.locator(`[data-earth-place="${id}"] figcaption`).evaluate(e=>Number(getComputedStyle(e).opacity)>.99),`${id} caption visible after keyboard focus`)}
   await goto(.48)
   const frame=await p.evaluate(()=>new Promise(resolve=>{let n=0,last=0;const ds=[];function tick(t){if(last&&n>12)ds.push(t-last);last=t;scrollBy(0,14);if(++n<100)requestAnimationFrame(tick);else{ds.sort((a,b)=>a-b);resolve({median:ds[Math.floor(ds.length*.5)],p95:ds[Math.floor(ds.length*.95)],over50:ds.filter(x=>x>50).length})}}requestAnimationFrame(tick)}))
   const max=await p.evaluate(()=>document.documentElement.scrollHeight-innerHeight);for(const y of [max,0,max*.3,max*.8,0]){await p.evaluate(y=>scrollTo(0,y),y);await p.waitForTimeout(80)}await goto(.964);assert.equal(await p.locator('#world [data-active=true]').getAttribute('data-earth-place'),'cornell-ithaca')
   await goto(.12);await p.locator('.earth-intro-copy .scene-link').focus();await p.waitForTimeout(200);await p.evaluate(()=>window.addEventListener('pagehide',()=>sessionStorage.setItem('cgs-test-exit',String(scrollY)),{once:true}));await p.locator('.earth-intro-copy .scene-link').click();await p.waitForTimeout(600);assert.ok(p.url().includes('/world/'));assert.equal(await p.locator('.code-city').count(),0,'subpage has no city');const before=Number(await p.evaluate(()=>sessionStorage.getItem('cgs-test-exit')));await p.goBack();await p.waitForFunction(()=>window.__cgsShown===true);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);const after=await p.evaluate(()=>scrollY);assert.ok(Math.abs(before-after)<3,`return retains exact position: ${before} → ${after}`)
   await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(250);await p.emulateMedia({reducedMotion:'reduce'});await p.waitForTimeout(450);assert.equal(await p.locator('.code-city').getAttribute('data-playback'),'reduced');assert.equal(await travel.isVisible(),false);assert.equal(await p.locator('#world').getAttribute('data-earth-motion'),null)
   const mask=await p.addStyleTag({content:cityMask});await p.waitForTimeout(200);const staticA=await city.screenshot();await p.waitForTimeout(200);assert.ok(staticA.equals(await city.screenshot()),'reduced city static');await mask.evaluate(e=>e.remove())
   await p.emulateMedia({reducedMotion:'no-preference'});await p.waitForTimeout(400);await goto(.964);assert.equal(await p.locator('#world').getAttribute('data-earth-renderer'),'webgl2');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0)
   assert.deepEqual(errors,[]);assert.deepEqual(missing,[])
   const result={engine,device,frame,destinations:6,reversible:true,keyboard:true,reduced:true,subpageIsolated:true,errors,missing};results.push(result);console.log(JSON.stringify(result))
  }finally{await p.close()}
 }
 await b.close()
}
console.log('PASS',results.length,'production viewport/engine cases')
