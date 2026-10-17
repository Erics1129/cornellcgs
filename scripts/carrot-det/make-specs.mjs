// 1) runs every scenario's bot on the standalone .NET simulation, 2) writes the recorded command list as a replay spec,
// 3) replays it on .NET and checks the replay reproduces the bot run's hashes exactly.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
//   node scripts/carrot-det/make-specs.mjs <workDir>   writes <workDir>/specs/{bot,replay}-<id>.txt and <workDir>/results/dotnet/*.json
const here = dirname(fileURLToPath(import.meta.url)), wt = resolve(here, '../..'), D = resolve(process.argv[2] || join(wt, 'output/carrot-det-work'))
const scen = JSON.parse(readFileSync(join(here, 'scenarios.json'), 'utf8'))
mkdirSync(join(D, 'specs'), { recursive: true }); mkdirSync(join(D, 'results/dotnet'), { recursive: true })
const sim = (args) => { const r = spawnSync(process.execPath, ['scripts/carrot-sim.mjs', '--method', 'DetRun', ...args], { cwd: wt, encoding: 'utf8' }); if (r.status) throw new Error(r.stdout + r.stderr); return r.stdout }
const keys = ['ticks', 'phase', 'wave', 'health', 'coins', 'kills', 'finalDigest', 'finalDeep', 'chainDigest', 'chainDiscrete', 'chainDeep']
for (const s of scen) {
  const head = `level=${s.level} mode=normal ticks=27000 every=30`
  writeFileSync(join(D, 'specs', `bot-${s.id}.txt`), `${head} bot=1 coins=${s.coins}\n`)
  sim([join(D, 'specs', `bot-${s.id}.txt`), join(D, 'results/dotnet', `bot-${s.id}.json`)])
  const bot = JSON.parse(readFileSync(join(D, 'results/dotnet', `bot-${s.id}.json`), 'utf8'))
  writeFileSync(join(D, 'specs', `replay-${s.id}.txt`), `${head} bot=0\n${bot.script}`)
  sim([join(D, 'specs', `replay-${s.id}.txt`), join(D, 'results/dotnet', `replay-${s.id}.json`)])
  const rep = JSON.parse(readFileSync(join(D, 'results/dotnet', `replay-${s.id}.json`), 'utf8'))
  const same = keys.every(k => bot[k] === rep[k]) && bot.perTick === rep.perTick && bot.deepLog === rep.deepLog
  console.log(s.id.padEnd(5), `cmds=${String(bot.commands).padStart(4)} ticks=${String(bot.ticks).padStart(5)} ${bot.phase.padEnd(4)} wave=${bot.wave} hp=${bot.health} towers=${bot.towers} kills=${bot.kills} chain=${bot.chainDigest} deep=${bot.chainDeep} nan=${bot.nanFloats} replay==bot:${same}`)
}
