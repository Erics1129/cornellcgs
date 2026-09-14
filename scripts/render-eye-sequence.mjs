import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Uses an existing Playwright installation; no runtime dependency is added.
// CGS_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/render-eye-sequence.mjs
// A Vite DEV server is required for the deterministic, production-stripped hook.
const { chromium } = await import(process.env.CGS_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.CGS_TEST_URL || 'http://127.0.0.1:5190'
const output = resolve(process.env.CGS_EYE_OUTPUT || 'output/eye-sequence')
const count = Math.min(180,Math.max(0,Number(process.env.CGS_EYE_FRAMES ?? 120)))
const fps = Math.max(1,Number(process.env.CGS_EYE_FPS || 30))
const mobile = process.env.CGS_EYE_MOBILE === '1'
const browser = await chromium.launch({headless:true,executablePath:process.env.CGS_BROWSER_EXECUTABLE})
try {
  const page = await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:1})
  // Output PNGs and concurrent source edits must not trigger Vite reloads.
  await page.routeWebSocket('**',()=>{})
  if (process.env.CGS_EYE_ISOLATED === '1') {
    await page.route(base+'/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#000"><div style="height:200vh"></div><div id="root"></div><div style="height:100vh"></div><script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
      const React = await import('/node_modules/.vite/deps/react.js');
      const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js');
      const {default:FutureEye} = await import('/src/components/FutureEye.tsx');
      await import('/src/styles/global.css');
      ReactDOM.default.createRoot(document.getElementById('root')).render(React.default.createElement(React.default.StrictMode,null,React.default.createElement(FutureEye)));
    </script></body></html>`}))
  }
  const errors = [], failedResponses = []
  page.on('response',response=>{if(response.status()>=400)failedResponses.push({url:response.url(),status:response.status()})})
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)})
  page.on('console',message=>{if (message.type()==='error' || message.type()==='warning') console.error(message.text())})
  await page.goto(base,{waitUntil:'domcontentloaded'})
  if (process.env.CGS_EYE_ISOLATED !== '1') await page.waitForFunction(()=>window.__cgsShown===true)
  await page.locator('.scene-canvas--eye').scrollIntoViewIfNeeded()
  await page.waitForFunction(()=>window.__eyeSequence?.snapshot().ready,{},{timeout:30000})
  await page.evaluate(()=>document.fonts.ready)
  await mkdir(resolve(output,'frames'),{recursive:true})
  await mkdir(resolve(output,'poses'),{recursive:true})
  const capture = async (path,time,gaze,blink) => {
    const data = await page.evaluate(({time,gaze,blink})=>{
      window.__eyeSequence.renderAt(time,gaze,blink)
      return document.querySelector('canvas[data-scene="eye"]').toDataURL('image/png').split(',')[1]
    },{time,gaze,blink})
    await writeFile(path,Buffer.from(data,'base64'))
  }
  const poses = [
    ['center',0,0,0],['left',-1,0,0],['left-mid',-.5,0,0],['right',1,0,0],['right-mid',.5,0,0],
    ['up',0,1,0],['down',0,-1,0],['quarter',0,0,.25],['half',0,0,.5],
    ['threequarter',0,0,.75],['closed',0,0,1],
  ]
  for (const [name,x,y,blink] of poses) await capture(resolve(output,'poses',`${name}.png`),1.8,[x,y],blink)
  const manifest = {source:'generated eye-v5 poses, motion-compensated WebGL2 intermediate frames',fps,count,frames:[],poses:poses.map(p=>p[0])}
  for (let i=0;i<count;i++) {
    const time = i/fps
    const gaze = [Math.sin(time*2.05)*.88,Math.sin(time*1.25)*.30]
    const file = `frames/${String(i).padStart(4,'0')}.png`
    // Omitted blink uses the same deterministic automatic blink schedule.
    await capture(resolve(output,file),time,gaze,undefined)
    manifest.frames.push({file,time,gaze})
    if ((i+1)%30 === 0) console.log(`Exported ${i+1}/${count} eye frames`)
  }
  manifest.renderer = await page.evaluate(()=>window.__eyeSequence.snapshot())
  manifest.errors = errors
  manifest.failedResponses = failedResponses
  await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(`Eye frames and pose proofs saved to ${output}`)
} finally { await browser.close() }
