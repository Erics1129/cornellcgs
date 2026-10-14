import { CHARMS, EVOLUTIONS, FAMILIES, ITEMS, METALS, RULES, START_ITEMS, TITLES } from './config.ts'
import type { Charm, Item, Metal, Outcome } from './config.ts'
export type Place = 'crate' | 'rack' | 'furnace' | 'anvil'
export type Knife = { id: number; metal: Metal; family: number; level: number; heated: boolean; pips: number; flow: number; guard: boolean; sharpened: boolean; place: Place }
export type Offer = { knifeId: number; multiplier: number; remaining: number }
export type Hit = { knife: Knife; stamina: number; outcome: Outcome }
export type Run = {
  version: number; seed: number; rng: number; day: number; gold: number; stamina: number;
  knives: Knife[]; nextId: number; charms: Charm[]; items: Record<Item, number>;
  market: Record<Metal, number>; previousMarket: Record<Metal, number>;
  stock: Record<string, number>; hitsToday: number; totalHits: number; seconds: number;
  offer: Offer | null; lastHit: Hit | null; ended: boolean; clockMs?: number; nextHitAt?: number;
}
export type Action = { type: 'move'; id: number; to: Place } | { type: 'heat' | 'hit' | 'flow' | 'sell' | 'offer'; id: number } | { type: 'use'; item: Item; id?: number } | { type: 'buy'; key: string } | { type: 'wait'; seconds: number } | { type: 'end' | 'upgrade' } | { type: 'tick'; ms: number }
export type GameEvent = { kind: string; text: string; id?: number; outcome?: Outcome; before?: Knife; after?: Knife; amount?: number; evolution?: boolean; flowStarted?: boolean }
export type Transition = { state: Run; event: GameEvent; ok: boolean }
const metals = Object.keys(METALS) as Metal[]
const charms = Object.keys(CHARMS) as Charm[]
const items = Object.keys(ITEMS) as Item[]
export function bonus(s: Run, key: string): number { return s.charms.reduce((n, c) => n + ((CHARMS[c] as Record<string, unknown>)[key] as number || 0), 0) }
function random(s: Run): number { let t = s.rng += 0x6D2B79F5; s.rng >>>= 0; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
function addKnife(s: Run, metal: Metal) { const k: Knife = { id: s.nextId++, metal, family: Math.floor(random(s) * FAMILIES.length), level: 0, heated: false, pips: 0, flow: 0, guard: false, sharpened: false, place: 'crate' }; s.knives.push(k); return k }
export function stage(k: Knife) { return EVOLUTIONS.filter(l => k.level >= l).length - 1 }
export function knifeName(k: Knife) { return `${TITLES[stage(k)]} ${METALS[k.metal].name} ${FAMILIES[k.family]}` }
export function value(k: Knife, s?: Run): number { return Math.round(METALS[k.metal].base * RULES.levelFactor ** k.level * (k.sharpened ? 1 + RULES.sharpenBonus : 1) * (s ? 1 + bonus(s, 'value') : 1)) }
/** The run's length: ten days from rules version 3, seven for a run still replaying under versions 1 and 2. */
export function runDays(s: Pick<Run, 'version'>) { return s.version >= 3 ? RULES.days : RULES.legacyDays }
export function flowDuration(s: Run) { return RULES.flowSeconds + bonus(s, 'flow') }
export function flowNeed(s: Run) { return RULES.flowPips + bonus(s, 'pips') }
export function odds(k: Knife, s: Run): Record<Outcome, number> {
  let shatter = Math.max(0, Math.min(RULES.shatterCap, RULES.shatterPerLevel * k.level) + bonus(s, 'shatter'))
  let chip = Math.max(0, RULES.chip + bonus(s, 'chip'))
  let dull = Math.max(0, RULES.dull + bonus(s, 'dull'))
  const perfect = Math.max(RULES.perfectFloor, RULES.perfect - RULES.perfectDecay * k.level) + bonus(s, 'perfect')
  let good = 1 - shatter - chip - dull - perfect
  if (k.flow > 0 || (s.version>=2 && k.pips>=flowNeed(s))) { good += shatter; shatter = 0 }
  else if (k.guard) { chip += shatter; shatter = 0 }
  if (k.level === 0) { dull += chip; chip = 0 }
  return { perfect, good, dull, chip, shatter }
}
export function expectedValue(k: Knife, s: Run): number { const p = odds(k, s); return p.perfect * value({ ...k, level: k.level + 2 }, s) + p.good * value({ ...k, level: k.level + 1 }, s) + p.dull * value(k, s) + p.chip * value({ ...k, level: Math.max(0, k.level - 1) }, s) }
export function bestKnife(s: Run): Knife | undefined { return s.knives.reduce<Knife | undefined>((best, k) => !best || value(k, s) > value(best, s) ? k : best, undefined) }
export function price(s: Run, key: string) { const base = key.startsWith('metal:') ? METALS[key.slice(6) as Metal]?.price : key.startsWith('charm:') ? CHARMS[key.slice(6) as Charm]?.price : ITEMS[key as Item]?.price; return base == null ? Infinity : Math.ceil(base * (1 - bonus(s, 'discount'))) }
export function saleValue(s: Run, k: Knife) { return Math.round(value(k, s) * s.market[k.metal] * (1 + bonus(s, 'sale'))) }
function morning(s: Run) {
  s.stamina = RULES.stamina + bonus(s, 'stamina'); s.hitsToday = 0; s.offer = null; s.lastHit = null
  s.previousMarket = { ...s.market }; s.stock = {}
  for (const metal of metals) {
    s.market[metal] = Math.round(Math.max(RULES.marketMin, Math.min(RULES.marketMax, (s.market[metal] || 1) + (random(s) - .5) * RULES.marketDrift * 2)) * 100) / 100
    if (random(s) < METALS[metal].chance) s.stock[`metal:${metal}`] = metal === 'iron' || metal === 'bronze' ? 3 : 1
  }
  for (const item of items) if(s.version<2 || item!=='stamina') s.stock[item] = ITEMS[item].stock
  const available = charms.filter(c => !s.charms.includes(c) && (s.version<2 || c!=='lungs'))
  for (let i = 0; i < 3 && available.length; i++) s.stock[`charm:${available.splice(Math.floor(random(s) * available.length), 1)[0]}`] = 1
  for (let i = 0; i < RULES.dailyBlanks + bonus(s, 'blanks'); i++) addKnife(s, 'iron')
}
export function createRun(seed: number, version: number = RULES.version): Run {
  const s: Run = { version, seed: seed >>> 0, rng: seed >>> 0, day: 1, gold: RULES.initialGold, stamina: 0, knives: [], nextId: 1, charms: [], items: { ...START_ITEMS }, market: Object.fromEntries(metals.map(m => [m, 1])) as Record<Metal, number>, previousMarket: {} as Record<Metal, number>, stock: {}, hitsToday: 0, totalHits: 0, seconds: 0, offer: null, lastHit: null, ended: false }
  morning(s); return s
}
/** Pure transition: no drawing, browser, timers or ambient randomness. Invalid actions never mutate state. */
export function act(state: Run, action: Action): Transition {
  const fail = (text: string): Transition => ({ state, ok: false, event: { kind: 'notice', text } })
  if (state.ended) return fail('This run is finished.')
  const s = structuredClone(state)
  const k = 'id' in action ? s.knives.find(k => k.id === action.id) : undefined
  let event: GameEvent = { kind: action.type, text: '' }
  if (action.type === 'move') {
    if (!k || !['crate', 'rack', 'furnace', 'anvil'].includes(action.to)) return fail('Choose a knife first.')
    if (k.place === action.to) return fail('Already there.')
    if ((action.to === 'rack' && s.knives.filter(k => k.place === 'rack').length >= RULES.rackSlots) || (['furnace', 'anvil'].includes(action.to) && s.knives.some(k => k.place === action.to))) return fail('That spot is full.')
    k.place = action.to; s.lastHit = null; event = { kind: 'move', id: k.id, text: action.to === 'furnace' ? 'Heating. Give it two seconds.' : action.to === 'rack' ? 'Safe on the rack for tomorrow.' : 'Ready when you are.' }
  } else if (action.type === 'heat') {
    if (!k || k.place !== 'furnace' || k.heated) return fail('Put a cold blank in the furnace.')
    k.heated = true; s.lastHit = null; event = { kind: 'heat', id: k.id, text: 'White hot. Move it to the anvil.' }
  } else if (action.type === 'hit') {
    if (!k || k.place !== 'anvil' || !k.heated) return fail('Heat a blank, then place it on the anvil.')
    if (s.version<2 && s.stamina <= 0) return fail('Out of stamina. Drink Ember tea or end the day.')
    if(s.version>=2 && (s.clockMs||0)<(s.nextHitAt||0))return fail('The hammer is returning.')
    const before = { ...k }, previousStamina = s.stamina
    const flowStarted=s.version>=2 && !k.flow && k.pips>=flowNeed(s)
    if(flowStarted){k.flow=flowDuration(s);k.pips=0}
    // Roll the raw distribution so a guard only gets consumed when it actually catches a shatter.
    const p = odds({ ...k, guard: false }, s); const roll = random(s)
    let acc = 0, result: Outcome = 'shatter'
    for (const outcome of Object.keys(p) as Outcome[]) { acc += p[outcome]; if (roll < acc) { result = outcome; break } }
    let guarded = false
    if (result === 'shatter' && k.guard) { result = k.level ? 'chip' : 'dull'; k.guard = false; guarded = true }
    if(k.flow){if(s.version<2)k.flow--}else k.pips=Math.min(flowNeed(s),k.pips+1)
    if (result === 'perfect') k.level += 2
    if (result === 'good') k.level++
    if (result === 'chip') k.level = Math.max(0, k.level - 1)
    if (result === 'shatter') s.knives = s.knives.filter(n => n.id !== k.id)
    if(s.version<2)s.stamina--;else s.nextHitAt=(s.clockMs||0)+RULES.replayMinHitMs; s.hitsToday++; s.totalHits++
    s.lastHit = { knife: before, stamina: previousStamina, outcome: result }
    const messages = { perfect: 'Perfect. Two levels, one strike.', good: 'Good. Worth a little more.', dull: 'Dull. Nothing gained. Nothing lost.', chip: 'Chipped. One level lost.', shatter: 'Gone. The forge keeps no promises.' }
    event = { kind: 'hit', flowStarted, outcome: result, id: k.id, before, after: result === 'shatter' ? undefined : { ...k }, text: guarded ? 'Guard spent. A shatter became a chip.' : messages[result], evolution: result !== 'shatter' && stage(k) > stage(before) }
    if ((RULES.buyerAt as readonly number[]).includes(s.hitsToday) && result !== 'shatter') s.offer = { knifeId: k.id, multiplier: Math.round((RULES.buyerMin + random(s) * (RULES.buyerMax - RULES.buyerMin)) * 100) / 100, remaining: RULES.buyerSeconds }
  } else if (action.type === 'flow') {
    if (!k || k.pips < flowNeed(s) || k.flow || (s.version>=2 && (!k.heated || k.place!=='anvil'))) return fail('Fill this knife’s Flow pips first.')
    k.flow = s.version>=2?flowDuration(s):RULES.flowHits+bonus(s,'flow'); k.pips=0; s.lastHit=null; event={kind:'flow',id:k.id,text:s.version>=2?`Flow · ${k.flow}s · No shatter`:`Flow. The next ${k.flow} strikes cannot shatter.`}
  } else if (action.type === 'sell' || action.type === 'offer') {
    if (!k) return fail('Choose a knife to sell.')
    if (action.type === 'offer' && (!s.offer || s.offer.knifeId !== k.id || k.place !== 'anvil' || s.offer.remaining <= 0)) return fail('That offer has passed.')
    const amount = action.type === 'offer' ? Math.round(value(k, s) * s.offer!.multiplier * (1 + bonus(s, 'buyer'))) : saleValue(s, k)
    s.gold += amount; s.knives = s.knives.filter(n => n.id !== k.id); s.lastHit = null; if (s.offer?.knifeId === k.id) s.offer = null
    event = { kind: 'sell', id: k.id, before: k, amount, text: `Sold for ${amount.toLocaleString('en-US')} gold.` }
  } else if (action.type === 'buy') {
    if (!(s.stock[action.key] > 0)) return fail('Sold out until tomorrow.')
    const cost = price(s, action.key)
    if (s.gold < cost) return fail('Not enough gold.')
    if (action.key.startsWith('charm:')) {
      const c = action.key.slice(6) as Charm
      if (!(c in CHARMS) || s.charms.includes(c) || s.charms.length >= RULES.charmSlots) return fail('You can hold five different charms.')
      s.charms.push(c)
    } else if (action.key.startsWith('metal:')) { const metal = action.key.slice(6) as Metal; if (!(metal in METALS)) return fail('Unknown metal.'); event.id = addKnife(s, metal).id }
    else { if (!(action.key in ITEMS)) return fail('Unknown item.'); s.items[action.key as Item]++ }
    s.gold -= cost; s.stock[action.key]--; event.text = 'Yours. Put it to good use.'
  } else if (action.type === 'use') {
    if (!(action.item in ITEMS) || s.items[action.item] <= 0) return fail('Buy that item at the stall first.')
    if (action.item === 'stamina') { s.stamina += ITEMS.stamina.amount; event.text = 'Five more strikes.' }
    else if (action.item === 'rewind') {
      if (!s.lastHit) return fail('There is no hit to rewind.')
      const snap = s.lastHit
      const remainingFlow=s.knives.find(n=>n.id===snap.knife.id)?.flow||0
      s.knives = s.knives.filter(n => n.id !== snap.knife.id); s.knives.push({ ...snap.knife, flow:s.version>=2?Math.min(snap.knife.flow,remainingFlow):snap.knife.flow }); s.knives.sort((a, b) => a.id - b.id)
      s.stamina = snap.stamina; event.id = snap.knife.id; event.text = 'Hit undone. The next roll is fresh.'
    } else {
      if (!k) return fail('Select a knife first.')
      if (action.item === 'guard') { if (k.guard) return fail('Already guarded.'); k.guard = true; event.text = 'One shatter insurance. Not a guarantee.' }
      if (action.item === 'whetstone') { if (k.sharpened) return fail('Already honed.'); k.sharpened = true; event.text = 'Honed. Permanently worth 15% more.' }
      event.id = k.id
    }
    s.items[action.item]--; s.lastHit = null
  } else if(action.type==='upgrade') {
    // One rules version per action, so an old log that already holds a v1 -> v2 upgrade replays byte for byte.
    if(s.version===1){
      s.version=2;s.clockMs=Math.round(s.seconds*1000);s.nextHitAt=0;s.lastHit=null
      for(const knife of s.knives)if(knife.flow)knife.flow=flowDuration(s)
      s.gold+=s.items.stamina*ITEMS.stamina.price;s.items.stamina=0
      if(s.charms.includes('lungs')){s.charms=s.charms.filter(c=>c!=='lungs');s.gold+=CHARMS.lungs.price}
      delete s.stock.stamina;delete s.stock['charm:lungs']
    } else if(s.version===2){
      // Version 3 changes only the run length: the knives, market, clock and the last hit (for Undo) carry over.
      s.version=3;event.text=`This run now lasts ${RULES.days} days.`
    } else return fail('This run already uses current rules.')
  } else if(action.type==='tick') {
    if(s.version<2 || !Number.isSafeInteger(action.ms) || action.ms<1 || action.ms>RULES.maxWait*1000)return fail('Invalid clock step.')
    s.clockMs=(s.clockMs??Math.round(s.seconds*1000))+action.ms;s.seconds=s.clockMs/1000
    for(const knife of s.knives)knife.flow=Math.max(0,(Math.round(knife.flow*1000)-action.ms)/1000)
    if(s.offer){s.offer.remaining=Math.max(0,(Math.round(s.offer.remaining*1000)-action.ms)/1000);if(!s.offer.remaining)s.offer=null}
  } else if (action.type === 'wait') {
    if (!Number.isInteger(action.seconds) || action.seconds < 1 || action.seconds > RULES.maxWait) return fail('Invalid clock step.')
    if(s.version>=2)return act(state,{type:'tick',ms:action.seconds*1000})
    s.seconds += action.seconds
    if (s.offer) { s.offer.remaining -= action.seconds; if (s.offer.remaining <= 0) s.offer = null }
  } else if (action.type === 'end') {
    if (s.day >= runDays(s)) { s.ended = true; s.offer = null; event.text = `${s.day === RULES.legacyDays ? 'Seven' : 'Ten'} days. One knife. Yours.` }
    else { s.knives = s.knives.filter(k => k.place === 'rack'); s.day++; morning(s); event.text = `Day ${s.day}. Fresh iron, fresh odds.` }
  } else return fail('Unknown action.')
  return { state: s, event, ok: true }
}
export function replay(seed: number, actions: Action[], version: number = RULES.version): Run {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Array.isArray(actions) || actions.length > RULES.maxActions) throw new Error('Invalid replay')
  if(version!==1&&version!==2&&version!==RULES.version)throw new Error('Unsupported rules version')
  let s = createRun(seed,version)
  for (const a of actions) { const t = act(s, a); if (!t.ok) throw new Error(t.event.text); s = t.state }
  return s
}
