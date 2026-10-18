// Plain-node checks for the duo UI's pure modules (no browser): room-code normalization, the boss-fight unlock offer (intersection by
// default, union on the host's toggle), the endless record (clean, merge, save, blocked and corrupt storage), result and error copy.
//   node scripts/test-carrot-duo-ui.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const values = new Map()
let blocked = false
globalThis.localStorage = {
  getItem: k => { if (blocked) throw new Error('SecurityError'); return values.has(k) ? values.get(k) : null },
  setItem: (k, v) => { if (blocked) throw new Error('QuotaExceededError'); values.set(k, String(v)) },
  removeItem: k => { if (blocked) throw new Error('SecurityError'); values.delete(k) },
}
const { normalizeCode, isRoomCode, roomFromHash, roomLink, spokenCode, CODE_ALPHABET, AMBIGUOUS_MESSAGE, CHARSET_MESSAGE, LENGTH_MESSAGE } = await import('../src/minigames/carrot/duo/code.ts')
const { DUO_FIGHTS, unlockedFights, offerFights, readProfile, readName, saveName, displayName, NAME_KEY, FIGHTS } = await import('../src/minigames/carrot/duo/profile.ts')
const { ENDLESS_KEY, readEndless, cleanEndless, mergeEndless, saveEndless, recordEndlessRun, freshEndless, cleanName } = await import('../src/minigames/carrot/duo/endlessRecord.ts')
const { errorCopy, resultCopy, nextSpecial, specialLine, clockText, sideLine, rejectLine } = await import('../src/minigames/carrot/duo/copy.ts')
let checks = 0
const ok = (cond, msg) => { assert.ok(cond, msg); checks++ }
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++ }

// ---------------------------------------------------------------- room codes
eq(CODE_ALPHABET.length, 31, 'the room alphabet has 31 symbols')
for (const ch of '0O1IL') ok(!CODE_ALPHABET.includes(ch), `no ${ch} in the alphabet`)
eq(normalizeCode('k7m2q'), { code: 'K7M2Q', complete: true, error: null }, 'lowercase is uppercased')
eq(normalizeCode(' k7 - m2q '), { code: 'K7M2Q', complete: true, error: null }, 'spaces and dashes are stripped')
eq(normalizeCode('K7M-2Q').code, 'K7M2Q', 'a dash in the middle')
eq(normalizeCode('k7m.2q_').code, 'K7M2Q', 'dots and underscores are separators too')
eq(normalizeCode('K7M'), { code: 'K7M', complete: false, error: null }, 'partial codes are fine while typing')
eq(normalizeCode(''), { code: '', complete: false, error: null })
for (const bad of ['K7M0Q', 'KOM2Q', 'K1M2Q', 'KIM2Q', 'KLM2Q', 'k7m2l', 'abcdo']) eq(normalizeCode(bad).error, AMBIGUOUS_MESSAGE, `${bad} is rejected with the message`)
eq(AMBIGUOUS_MESSAGE, 'Codes never use 0, O, 1, I or L')
eq(normalizeCode('K7M0Q').code, 'K7MQ', 'the field keeps only valid characters')
eq(normalizeCode('K7M?Q').error, CHARSET_MESSAGE, 'symbols are rejected')
eq(normalizeCode('K7M2QR'), { code: 'K7M2Q', complete: false, error: LENGTH_MESSAGE }, 'too long')
ok(isRoomCode('K7M2Q') && !isRoomCode('K7M2') && !isRoomCode('K7M0Q') && !isRoomCode(5), 'isRoomCode')
eq(roomFromHash('#room=k7m2q'), 'K7M2Q', 'deep link, lowercase')
eq(roomFromHash('#x=1&room=K7M-2Q'), 'K7M2Q', 'deep link among other hash keys, with a dash')
eq(roomFromHash('#room=K7M0Q'), null, 'an invalid deep link opens nothing')
eq(roomFromHash(''), null)
eq(roomLink('https://cornellcgs.org/minigames/carrotDefense/?a=1#old', 'K7M2Q'), 'https://cornellcgs.org/minigames/carrotDefense/?a=1#room=K7M2Q', 'copy link keeps the query, replaces the hash')
eq(spokenCode('K7M2Q'), 'K, 7, M, 2, Q')

// ---------------------------------------------------------------- unlocks: fresh, mid and complete saves
const campaign = (unlocked, medals = {}) => ({ version: 1, unlocked, medals, sound: true })
const challenges = (best = {}) => ({ version: 3, best })
const win = { cleared: true, health: 9, seconds: 200, towers: 8 }
eq(DUO_FIGHTS, [4, 8, 12, 16, 20, 24, 25, 26, 27, 28, 29], 'eleven boss fights')
eq(FIGHTS.map(f => f.id), [...DUO_FIGHTS], 'every fight has a fallback name')
// every boss fight is open from the start (no prerequisites), whatever the save holds
eq(unlockedFights(campaign(1), challenges()), [...DUO_FIGHTS], 'a fresh save has all eleven boss fights')
eq(unlockedFights(campaign(13), challenges({ tornado: win })), [...DUO_FIGHTS], 'a mid save has all eleven')
const late = unlockedFights(campaign(24, { 24: 1 }), challenges({ tornado: win, zombie: win, eyeball: win }))
eq(late, [4, 8, 12, 16, 20, 24, 25, 26, 27, 28, 29], 'a complete save has all eleven')
// offerFights still intersects the two lists (a partner on an older build may send fewer)
const fresh = [25], mid = [4, 8, 12, 25, 26, 29]
// intersection (default)
const offer = offerFights(fresh, mid, false, 0)
eq(offer.filter(o => o.open).map(o => o.id), [25], 'fresh + mid, intersection: only the Tornado')
eq(offer.find(o => o.id === 12).lockedFor, [0], 'L12 is locked for the fresh player (seat 0)')
eq(offer.find(o => o.id === 16).lockedFor, [0, 1], 'L16 is locked for both')
eq(offerFights(mid, fresh, false, 1).find(o => o.id === 12).lockedFor, [0], 'seen from seat 1, the partner (seat 0) lacks it')
// union toggle
eq(offerFights(fresh, mid, true, 0).filter(o => o.open).map(o => o.id), [4, 8, 12, 25, 26, 29], 'union: either player has it')
eq(offerFights(late, late, false).every(o => o.open && !o.lockedFor.length), true, 'two complete saves: everything open, no locks')
eq(offerFights(mid, null, false).filter(o => o.open).map(o => o.id), mid, 'before the partner arrives only my unlocks count')

// ---------------------------------------------------------------- profile and name
values.clear()
eq(readName(), '', 'no name yet')
eq(saveName('  Mia\u0000  the\tGardener  '), 'Mia the Gardener', 'names are cleaned')
eq(values.get(NAME_KEY), 'Mia the Gardener')
eq(saveName('x'.repeat(40)).length, 24, 'at most 24 characters')
eq(cleanName('😀'.repeat(30)).length, 48, 'emoji count as one character each (24 code points)')
eq(displayName('', 1), 'Player 2', 'an unnamed seat')
eq(displayName(' Ana ', 0), 'Ana')
values.set('cgs-carrot-defense-v1', JSON.stringify(campaign(9, { 1: 7 })))
values.set('cgs-carrot-challenges-v1', JSON.stringify(challenges({ tornado: win })))
values.set(ENDLESS_KEY, JSON.stringify({ version: 1, best: { waves: 17, seconds: 900, kills: 400, partner: 'Ana', solo: false, at: '2026-10-01T10:00:00.000Z' }, runs: 3 }))
eq(readProfile('Mia'), { name: 'Mia', unlocked: [...DUO_FIGHTS], best: 17 }, 'the room profile reads the saves (read-only); every boss fight is open')
eq(JSON.parse(values.get('cgs-carrot-defense-v1')).unlocked, 9, 'reading the profile writes nothing to the campaign save')

// ---------------------------------------------------------------- endless record
values.clear()
eq(readEndless(), freshEndless(), 'no record: fresh')
values.set(ENDLESS_KEY, '{corrupt')
eq(readEndless(), freshEndless(), 'corrupt JSON: fresh')
values.set(ENDLESS_KEY, JSON.stringify({ version: 2, best: { waves: 99 } }))
eq(readEndless(), freshEndless(), 'an unknown version is not read')
eq(cleanEndless({ version: 1, best: { waves: 12.7, seconds: -5, kills: 'x', partner: 'A'.repeat(50), solo: 'yes', at: 'not a date' }, runs: -2 }),
  { version: 1, best: { waves: 12, seconds: 0, kills: 0, partner: 'A'.repeat(24), solo: false, at: '' }, runs: 0 }, 'clean: floors, bounds and drops junk')
eq(cleanEndless({ version: 1, best: { waves: 0 }, runs: 4 }), { version: 1, best: null, runs: 4 }, 'zero waves is no best')
const A = { version: 1, best: { waves: 20, seconds: 1000, kills: 500, partner: 'Ana', solo: false, at: '2026-10-02T00:00:00.000Z' }, runs: 5 }
const B = { version: 1, best: { waves: 24, seconds: 1300, kills: 700, partner: 'Bo', solo: false, at: '2026-10-05T00:00:00.000Z' }, runs: 2 }
const Tearly = { version: 1, best: { waves: 20, seconds: 1100, kills: 520, partner: 'Cy', solo: true, at: '2026-09-01T00:00:00.000Z' }, runs: 1 }
eq(mergeEndless(A, B).best.partner, 'Bo', 'more waves wins')
eq(mergeEndless(B, A).best.partner, 'Bo', 'merge is order independent on waves')
eq(mergeEndless(A, B).runs, 5, 'runs: max')
eq(mergeEndless(A, Tearly).best.partner, 'Cy', 'a tie keeps the earlier record')
eq(mergeEndless(Tearly, A).best.partner, 'Cy', 'a tie keeps the earlier record (either order)')
eq(mergeEndless(A, null), cleanEndless(A))
eq(mergeEndless('junk', B), cleanEndless(B))
values.clear()
let rec = recordEndlessRun(readEndless(), { waves: 9, seconds: 400.04, kills: 120, partner: 'Ana', solo: false }, new Date('2026-10-10T12:00:00Z'))
eq(rec.newBest, true, 'the first run is a best')
eq(rec.record, { version: 1, best: { waves: 9, seconds: 400, kills: 120, partner: 'Ana', solo: false, at: '2026-10-10T12:00:00.000Z' }, runs: 1 })
eq(JSON.parse(values.get(ENDLESS_KEY)), rec.record, 'saved')
rec = recordEndlessRun(rec.record, { waves: 9, seconds: 300, kills: 99, partner: 'Bo' }, new Date('2026-10-11T12:00:00Z'))
eq([rec.newBest, rec.record.best.partner, rec.record.runs], [false, 'Ana', 2], 'a tie keeps the first record; runs still count')
rec = recordEndlessRun(rec.record, { waves: 3 })
eq([rec.newBest, rec.record.best.waves, rec.record.runs], [false, 9, 3], 'a worse run keeps the best')
rec = recordEndlessRun(rec.record, { waves: 0 })
eq([rec.newBest, rec.record.best.waves, rec.record.runs], [false, 9, 4], 'zero waves still counts as a run')
// another tab wrote a better best: a stale copy never lowers it
values.set(ENDLESS_KEY, JSON.stringify({ ...rec.record, best: { ...rec.record.best, waves: 30, partner: 'Tab2' }, runs: 10 }))
rec = recordEndlessRun(freshEndless(), { waves: 12, partner: 'Stale' })
eq([rec.newBest, rec.record.best.waves, rec.record.best.partner, rec.record.runs], [false, 30, 'Tab2', 11], 'stored best and runs are unioned in first')
eq(saveEndless(freshEndless()).best.waves, 30, 'saving a fresh copy keeps the stored best')
// blocked storage: reads are fresh, writes are swallowed, the run is still reported
blocked = true
eq(readEndless(), freshEndless(), 'blocked storage reads fresh')
rec = recordEndlessRun(freshEndless(), { waves: 5, partner: 'Ana' })
eq([rec.newBest, rec.record.best.waves, rec.record.runs], [true, 5, 1], 'blocked storage: the run is still reported')
eq(readName(), '', 'blocked storage: no name')
eq(saveName('Mia'), 'Mia', 'blocked storage: the name lives for the visit')
blocked = false
// existing keys keep their formats: the duo UI writes only its own two keys
values.clear()
recordEndlessRun(freshEndless(), { waves: 4 }); saveName('Mia')
eq([...values.keys()].sort(), [ENDLESS_KEY, NAME_KEY].sort(), 'only cgs-carrot-endless2p-v1 and cgs-carrot-duo-name are written')

// ---------------------------------------------------------------- copy: results and errors (protocol shapes)
const names = ['Mia', 'Ana']
const win2 = resultCopy({ kind: 'duoWin', level: 25, tick: 900, health: 9, partnerHealth: 7 }, names, 0)
eq([win2.title, win2.recorded, win2.tone], ['Both gardens held', 'Win recorded for both players', 'win'])
ok(win2.line.includes('Ana'), 'the win names the partner')
const loss = (fell, wave = 7) => resultCopy({ kind: 'duoLoss', level: 26, tick: 4000, fell, fellName: names[fell], wave }, names, 0)
eq(loss(1).title, "Ana's carrot fell", "the partner's carrot fell")
eq(loss(0).title, 'Your carrot fell', 'your own carrot fell')
ok(loss(0).line.includes('wave 7'), 'the wave it fell on')
eq(loss(0).tone, 'loss')
eq(loss(-1).title, 'Both carrots fell', 'fell -1: both fell together')
for (const reason of ['left', 'grace', 'desync', 'error']) eq(resultCopy({ kind: 'unfinished', level: 4, reason, by: 1 }, names, 0).recorded, 'Nothing was recorded', `unfinished (${reason}) records nothing`)
ok(resultCopy({ kind: 'unfinished', level: 4, reason: 'desync', by: -1 }, names, 0).line.includes("can't continue"))
eq(resultCopy({ kind: 'unfinished', level: 4, reason: 'left', by: 0 }, names, 0).line, 'You left the match.')
eq(resultCopy({ kind: 'unfinished', level: 4, reason: 'left', by: 1 }, names, 0).line, 'Ana left the match.')
ok(resultCopy({ kind: 'unfinished', level: 4, reason: 'grace', by: 0 }, names, 1).line.startsWith('Mia'), 'seat 1 sees seat 0 as the partner')
const endless = (waves, extra = {}) => ({ kind: 'endless', waves, tick: 9000, solo: false, endedBy: 'carrot', ...extra })
eq(resultCopy(endless(14), names, 0, { newBest: true }).title, '14 waves survived')
eq(resultCopy(endless(1), names, 0).title, '1 wave survived')
eq(resultCopy(endless(14), names, 0, { newBest: true }).recorded, 'New best on this device')
eq(resultCopy(endless(4), names, 0, { best: 22 }).recorded, 'Best on this device: 22 waves')
ok(resultCopy(endless(4, { solo: true }), names, 0).line.includes('solo'))
ok(resultCopy(endless(4, { endedBy: 'connection' }), names, 0).line.includes('connection'))
for (const code of ['room-not-found', 'room-full', 'in-progress', 'version-mismatch', 'network', 'busy', 'partner-left', 'desync', 'origin', 'bad-code', 'not-ready', 'not-host', 'bad-config', 'pause-cooldown', 'unavailable', 'something-new']) {
  const c = errorCopy({ code }); ok(c.title && c.body && typeof c.retry === 'boolean', `error copy for ${code}`)
}
eq(errorCopy({ code: 'desync' }).body, "Connection problem: this match can't continue. Nothing was recorded.", 'the protocol copy is used')
eq(errorCopy({ code: 'room-full', message: 'Custom from the session', retry: true }), { title: 'Room full', body: 'Custom from the session', retry: true }, "the session's own message and retry win")
for (const code of ['room-not-found', 'room-full', 'in-progress', 'version-mismatch', 'network', 'busy', 'partner-left', 'desync']) { const c = errorCopy({ code }); ok(!c.body.toLowerCase().startsWith(c.title.toLowerCase()), `${code}: the headline does not repeat the body`) }
ok(/reload/i.test(errorCopy({ code: 'version-mismatch' }).body), 'version mismatch tells the player to reload')
eq(errorCopy(null).title, "Can't reach the server", 'no error object: network copy')
eq(errorCopy({ code: 'network' }).retry, true); eq(errorCopy({ code: 'room-not-found' }).retry, false)
// the busy copy names the next 00:00 UTC in the player's own clock (Eastern: 8 pm in summer time, 7 pm after Nov 1)
{
  const { busyCopy } = await import('../src/minigames/carrot/net/protocol.ts')
  const tz = process.env.TZ
  process.env.TZ = 'America/New_York'
  ok(/\b8:00\b|\b20:00\b/.test(busyCopy(Date.parse('2026-10-17T15:00:00Z'))), `EDT: ${busyCopy(Date.parse('2026-10-17T15:00:00Z'))}`)
  ok(/\b7:00\b|\b19:00\b/.test(busyCopy(Date.parse('2026-11-17T15:00:00Z'))), `EST: ${busyCopy(Date.parse('2026-11-17T15:00:00Z'))}`)
  if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz
}
eq(rejectLine('pad', 'Ana'), 'Pad taken by Ana'); eq(rejectLine('coins', 'Ana'), 'More coins needed'); ok(rejectLine('???', 'Ana').length > 0)
eq(sideLine('x', 0), 'You defend the WEST garden'); eq(sideLine('x', 1), 'You defend the EAST garden'); eq(sideLine('z', 0), 'You defend the NORTH garden'); eq(sideLine('z', 1), 'You defend the SOUTH garden')
eq(nextSpecial(4), { kind: 'miniboss', in: 1, wave: 5 }); eq(nextSpecial(5), { kind: 'boss', in: 5, wave: 10 }); eq(nextSpecial(0), { kind: 'miniboss', in: 5, wave: 5 }); eq(nextSpecial(29), { kind: 'boss', in: 1, wave: 30 })
eq(specialLine({ kind: 'boss', in: 1 }), 'Boss next wave'); eq(specialLine({ kind: 'miniboss', in: 3 }), 'Miniboss in 3 waves')
eq(clockText(42000), '0:42'); eq(clockText(60000), '1:00'); eq(clockText(-5), '0:00'); eq(clockText(41001), '0:42')

// ---------------------------------------------------------------- the page hook stays small
const page = readFileSync(new URL('../src/minigames/carrot/CarrotPage.tsx', import.meta.url), 'utf8')
ok(/from '\.\/duo'/.test(page), 'CarrotPage imports the duo layer')
console.log(`test-carrot-duo-ui: ${checks} checks passed`)
