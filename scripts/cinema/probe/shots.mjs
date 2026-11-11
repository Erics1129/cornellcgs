// SHOTS: teleport to every named resting composition of every runway (scripts/cinema/shots.md) and to the
// middle of every rest gap; save a JPEG of each and report where the deck settled the picture (vrun).
// usage: node shots.mjs <url> <outdir> [desktop|phone|touch]
// A gap middle must settle on one of the gap's two ends: "run" is where the page is, "vrun" is what is drawn.
import fs from 'node:fs'
import { open, auditFn } from './lib.mjs'
const [url, out, kind = 'desktop'] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
export const SHOTS = {
  alphago: [[0, 'board and words, stage just stuck'], [0.9, 'board and words, stones played']],
  'what-we-do': [[0, 'heading and the deck'], [0.3, 'two cards dealt'], [0.95, 'the whole hand']],
  code: [[0, 'words and the laptop, file dim'], [0.5, 'file typed'], [0.97, 'run finished']],
  'ml-process': [[0, 'disc'], [0.33, 'symbols leaving'], [0.66, 'field'], [1, 'last frame']],
  world: [[0.1, 'globe and words'], [0.26, 'GAP words fading'], [0.3, 'globe alone'], [0.335, 'GAP globe to Bali'], [0.4, 'Bali'], [0.4525, 'GAP Bali to Hawaii'],
    [0.505, 'Hawaii'], [0.555, 'GAP Hawaii to Dolomites'], [0.606, 'Dolomites'], [0.656, 'GAP Dolomites to Iceland'], [0.706, 'Iceland'], [0.755, 'GAP Iceland to New York'],
    [0.804, 'New York'], [0.853, 'GAP New York to Cornell'], [0.93, 'Cornell and the credits']],
  universe: [[0.15, 'leg 1'], [0.33, 'GAP title swap 1'], [0.5, 'leg 2'], [0.69, 'GAP title swap 2'], [0.9, 'leg 3']],
  anyone: [[0, 'ice above the glass'], [0.5, 'the plunge'], [0.9, 'ice afloat and the invitation']],
}
const { browser, page, errors } = await open(kind, url)
const lines = [`SHOTS ${kind} ${url}`]
let n = 0
for (const [id, list] of Object.entries(SHOTS)) {
  for (const [run, name] of list) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await page.waitForTimeout(150)
    const y = await page.evaluate(([id, run]) => { const s = window.__film.state().chapters.find(c => c.id === id); return s.top + (s.height - s.stageHeight) * run }, [id, run])
    await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), y); await page.waitForTimeout(900)
    const f = await page.evaluate(id => { const s = window.__film.state(); const c = s.chapters.find(c => c.id === id); return { run: c.run, vrun: c.vrun, sticky: c.stageHeight > 0 && c.height > c.stageHeight * 1.2 } }, id)
    const a = await page.evaluate(auditFn); const own = a.chapters.find(c => c.id === id)
    const texts = own ? own.texts.filter(t => t.score >= 0.9).length : 0
    const file = `${String(n++).padStart(2, '0')}-${id}-${String(run).replace('.', '_')}.jpg`
    await page.screenshot({ path: `${out}/${file}`, type: 'jpeg', quality: 62 })
    const gap = name.startsWith('GAP')
    const settled = gap && Math.abs(f.vrun - f.run) > 0.004
    lines.push(`${file.padEnd(34)} run ${f.run.toFixed(3)} vrun ${f.vrun.toFixed(3)} ${gap ? (settled ? 'settled out of the gap' : 'NOT SETTLED (owner has not declared this gap)') : ''}  texts ${texts}  ${name}`)
  }
}
lines.push(`errors ${errors.length}`)
fs.writeFileSync(`${out}/shots.txt`, lines.join('\n') + '\n'); console.log(lines.join('\n'))
await browser.close()
