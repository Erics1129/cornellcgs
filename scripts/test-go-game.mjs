import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/effects/goGame.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { GO_STEPS, GO_SEED, GO_PERIOD, GO_TIMES, GO_DROP, goFrame, playGo } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const idx = (x,y) => (y+9)*19+x+9
const states = new Set()
let captures=0
GO_STEPS.forEach((step,i)=>{
  assert.equal(step.color,i%2?2:1)
  assert.equal(step.board[step.at],step.color)
  const position=step.board.join('')
  assert.ok(!states.has(position),'the game never repeats a board position')
  states.add(position)
  captures+=step.captured.length
  const before=goFrame(GO_TIMES[i-GO_SEED]+GO_DROP-.001)
  const after=goFrame(GO_TIMES[i-GO_SEED]+GO_DROP+.001)
  if(i>=GO_SEED){assert.equal(before.last,i-1);assert.equal(after.last,i);assert.ok(after.contact<.002)}
})
assert.ok(captures>0,'the scene includes an actual capture')
const setup=new Uint8Array(361)
setup[idx(0,0)]=2
for(const [x,y] of [[-1,0],[1,0],[0,1]])setup[idx(x,y)]=1
const result=playGo(setup,[0,-1],1)
assert.deepEqual(result.captured,[idx(0,0)])
assert.equal(setup[idx(0,0)],2,'source board remains unchanged')
assert.throws(()=>playGo(setup,[0,0],1),/occupied/)
assert.throws(()=>playGo(setup,[10,0],1),/outside/)
const suicide=new Uint8Array(361)
for(const [x,y] of [[-1,0],[1,0],[0,1],[0,-1]])suicide[idx(x,y)]=2
assert.throws(()=>playGo(suicide,[0,0],1),/liberties/)
for(let t=0;t<GO_PERIOD*2;t+=1/120){
  const f=goFrame(t)
  assert.ok(f.last>=GO_SEED-1&&f.last<GO_STEPS.length)
  assert.ok(f.drop>=0&&f.drop<=1&&f.alpha>=0&&f.alpha<=1)
  if(f.falling)assert.equal(f.pending,f.last+1)
}
assert.equal(goFrame(0,true).last,GO_STEPS.length-1)
assert.equal(goFrame(GO_PERIOD+.1).last,GO_SEED-1)
assert.ok(goFrame(GO_PERIOD-.001).alpha<.001 && goFrame(GO_PERIOD+.001).alpha<.001,'repeat fades through an empty board without popping')
console.log(`Go sequence: ${GO_STEPS.length} legal alternating moves, ${captures} capture(s), exact contact timing, safe repeat, reduced-motion final board.`)
