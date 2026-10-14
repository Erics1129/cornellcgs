/** Balance data shared by the browser, simulations and leaderboard verifier. */
export const RULES = {
  // Version 3 lengthens the run to ten days; runs that started under versions 1 and 2 kept seven (`runDays`).
  version: 3, days: 10, legacyDays: 7, dailyBlanks: 3, stamina: 20, rackSlots: 4, charmSlots: 5,
  initialGold: 180, levelFactor: 1.5, shatterPerLevel: .04, shatterCap: .6,
  chip: .1, dull: .15, perfect: .12, perfectDecay: .01, perfectFloor: .02,
  flowPips: 10, flowHits: 3, flowSeconds: 4, flowSpeed: 1.5, sharpenBonus: .15, heatSeconds: 2,
  marketMin: .7, marketMax: 1.4, marketDrift: .24,
  buyerAt: [6, 14], buyerSeconds: 24, buyerMin: .7, buyerMax: 1.7,
  maxActions: 12000, maxWait: 60, maxRunSeconds: 864000,
  replayMinHitMs: 350, apiTimeoutMs: 8000, leaderboardRefreshMs: 30000,
} as const
export const METALS = {
  iron: { name: 'Iron', base: 100, price: 85, chance: 1, color: '#a0acb8', roughness: .38, glow: '#ffa263' },
  bronze: { name: 'Bronze', base: 230, price: 210, chance: 1, color: '#c88b54', roughness: .28, glow: '#ffc85f' },
  steel: { name: 'Steel', base: 510, price: 450, chance: .85, color: '#dce8ee', roughness: .18, glow: '#aedbff' },
  silver: { name: 'Silver', base: 1050, price: 950, chance: .6, color: '#f4f3e8', roughness: .08, glow: '#cdf5ff' },
  damascus: { name: 'Damascus', base: 1600, price: 1350, chance: .45, color: '#8694ac', roughness: .22, glow: '#9dc4ff' },
  obsidian: { name: 'Obsidian', base: 2350, price: 1900, chance: .3, color: '#30304c', roughness: .055, glow: '#c790ff' },
  meteor: { name: 'Meteor iron', base: 3800, price: 3100, chance: .17, color: '#708ca4', roughness: .2, glow: '#5ce8d7' },
  auricite: { name: 'Auricite', base: 6400, price: 4800, chance: .07, color: '#a2ffe0', roughness: .12, glow: '#ffb3e9' },
} as const
export type Metal = keyof typeof METALS
export const FAMILIES = ['Paring', 'Chef', 'Cleaver', 'Hunter', 'Dagger', 'Tanto', 'Kukri', 'Karambit'] as const
export const EVOLUTIONS = [0, 3, 6, 9, 12, 15] as const
export const TITLES = ['Unwritten', 'Kindled', 'Tempered', 'Starbound', 'Sovereign', 'Everliving'] as const
export const ITEMS = {
  guard: { name: 'Quench guard', price: 140, stock: 2, description: 'Next Shatter becomes Chip.' },
  rewind: { name: 'Echo glass', price: 230, stock: 2, description: 'Undo the last hit. Next roll is fresh.' },
  whetstone: { name: 'Hone stone', price: 180, stock: 2, description: '+15% value, once per knife.' },
  stamina: { name: 'Ember tea', price: 190, stock: 2, amount: 5, description: 'Restore 5 hammer strikes.' },
} as const
export type Item = keyof typeof ITEMS
export const CHARMS = {
  steady: { name: 'Steady hand', price: 380, description: 'Chip −4 percentage points.', chip: -.04 },
  ember: { name: 'Ember eye', price: 550, description: 'Perfect +3 percentage points.', perfect: .03 },
  shelter: { name: 'Ash shelter', price: 700, description: 'Shatter −3 percentage points.', shatter: -.03 },
  rhythm: { name: 'Copper rhythm', price: 600, description: 'Flow charges in 8 strikes.', pips: -2 },
  tide: { name: 'Quiet tide', price: 800, description: 'Flow lasts one extra second.', flow: 1 },
  merchant: { name: 'Merchant seal', price: 380, description: 'Selling pays 12% more.', sale: .12 },
  apprentice: { name: 'Apprentice knot', price: 300, description: 'One extra iron blank each morning.', blanks: 1 },
  lungs: { name: 'Bellows heart', price: 420, description: '4 extra strikes each morning.', stamina: 4 },
  barter: { name: 'Barter tooth', price: 370, description: 'Shop costs 12% less.', discount: .12 },
  patience: { name: 'Patient spark', price: 440, description: 'Dull −5 percentage points.', dull: -.05 },
  polish: { name: 'Mirror moth', price: 750, description: 'All held knives worth 10% more.', value: .1 },
  visitor: { name: 'Open gate', price: 360, description: 'Traveling offers pay 15% more.', buyer: .15 },
} as const
export type Charm = keyof typeof CHARMS
export const START_ITEMS: Record<Item, number> = { guard: 1, rewind: 1, whetstone: 0, stamina: 0 }
export const RESULT_LABELS = { perfect: 'Perfect', good: 'Good', dull: 'Dull', chip: 'Chip', shatter: 'Shatter' } as const
export type Outcome = keyof typeof RESULT_LABELS
export const WORLD = { maxName: 20, top: 50, startCooldown: 60, submitCooldown: 60, maxBodyBytes: 600000 } as const
