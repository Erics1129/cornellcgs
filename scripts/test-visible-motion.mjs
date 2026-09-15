import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium,webkit,installGLProbe,difference,pixels} from './test-subpages.mjs'
const ids=['whoWeAre','whatWeDo','mlProcess','events','world','ourTeam','advisors','join','contact'];const results=[]
await mkdir('/tmp/cgs-visible-motion',{recursive:true})
for(const [name,engine,width,height]of [['Chromium',chromium,1440,1200],['WebKit',webkit,390,844]]){
 const b=await engine.launch({headless:true});const p=await b.newPage({viewport:{width,height},isMobile:width<500,hasTouch:width<500});await p.addInitScript(installGLProbe)
 await p.route(/(?:raw\.githubusercontent\.com|cdn\.jsdelivr\.net).*cornellcgs-content.*content\.json/,r=>r.fulfill({status:200,body:'{}'}));const errors=[];p.on('pageerror',e=>errors.push(e.message))
 for(const id of ids){
  await p.goto('http://127.0.0.1:5190/'+id+'/');await p.locator('.page-scene').scrollIntoViewIfNeeded();await p.waitForFunction(()=>window.__pageScene?.snapshot().ready)
  const capture=async t=>p.evaluate(t=>{window.__pageScene.renderAt(t);const c=document.querySelector('.page-scene__canvas'),gl=window.__pageSceneTest();return {image:c.toDataURL('image/png').split(',')[1],crop:gl.crop,source:gl.image,error:gl.error}},t)
  const first=await capture(0),next=await capture(1);const delta=difference(pixels(Buffer.from(first.image,'base64')),pixels(Buffer.from(next.image,'base64')))
  assert.ok(delta.mean>8&&delta.changed>.4,`${name}/${id} visible first-second motion ${JSON.stringify(delta)}`)
  for(const t of [0,2,5,10,15,19.999,20])for(const [x,y]of [[-1,-1],[1,1]]){const s=await p.evaluate(({t,x,y})=>{window.__pageScene.renderAt(t,x,y);return window.__pageSceneTest()},{t,x,y});const [sx,sy,cx,cy]=s.crop;assert.ok(cx-sx/2>0&&1-cx-sx/2>0&&cy-sy/2>0&&1-cy-sy/2>0,`${id} edge coverage`);assert.equal(s.error,0)}
  const end=await capture(20);assert.ok(difference(pixels(Buffer.from(first.image,'base64')),pixels(Buffer.from(end.image,'base64'))).mean<.01,'seam')
  await p.evaluate(()=>window.__pageScene.resume());const before=await p.evaluate(()=>window.__pageScene.snapshot().time);await p.waitForTimeout(600);assert.ok(await p.evaluate(t=>window.__pageScene.snapshot().time>t+.25,before),'automatic advancement')
  if(['mlProcess','join','events'].includes(id)){await writeFile('/tmp/cgs-visible-motion/'+name+'-'+id+'-0.png',Buffer.from(first.image,'base64'));await writeFile('/tmp/cgs-visible-motion/'+name+'-'+id+'-1.png',Buffer.from(next.image,'base64'))}
  results.push({browser:name,id,firstSecond:delta,coverage:true,loop:true,automatic:true});console.log('PASS',name,id,delta.mean.toFixed(2),Math.round(delta.changed*100)+'% pixels changed')
 }
 assert.deepEqual(errors,[]);await b.close()
}
await writeFile('/tmp/cgs-visible-motion/results.json',JSON.stringify(results,null,2))
