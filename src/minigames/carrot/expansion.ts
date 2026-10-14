// Portrait order is a shared contract with the generated plates and Blender exports.
export const expansionTowers=['bamboo','chili','lotus','magnet','orchid','mushroom','cactus','clockflower','dragonfruit','moonflower']
export const towerTraits:Record<string,string>={
 bamboo:'Pierces enemies in a line.',chili:'Leaves a burning trail. Exposes enemies.',lotus:'Cleanses nearby stuns, slows and weakness.',magnet:'Chains pulses. Strips armor and shields.',orchid:'Stacks venom on tough targets.',mushroom:'Sleeps ground mobs. Slows bosses.',cactus:'Ricocheting thorns cause bleeding.',clockflower:'Quickens allies. Slows enemies.',dragonfruit:'Calls down explosive meteors.',moonflower:'Breaks shields. Punishes clones.',
}
export const miniBosses=[
 {id:'warDrummer',name:'War Drummer',power:'Rally',detail:'Speeds nearby enemies, including a final rally on death.'},
 {id:'frostHerald',name:'Frost Herald',power:'Deep freeze',detail:'Warns, then briefly freezes every defense.'},
 {id:'witherPriest',name:'Wither Priest',power:'Wither',detail:'Temporarily weakens all plant attacks.'},
 {id:'stormWarden',name:'Storm Warden',power:'Storm lock',detail:'Stuns a few nearby defenses with lightning.'},
 {id:'graveCaller',name:'Grave Caller',power:'Grave call',detail:'Raises a pack of tiny zombies.'},
 {id:'mirrorKnight',name:'Mirror Knight',power:'Mirror split',detail:'Creates fragile decoys that absorb attacks.'},
 {id:'riftStalker',name:'Rift Stalker',power:'Rift step',detail:'Blinks a short distance forward along its path.'},
 {id:'mossGolem',name:'Moss Golem',power:'Living shield',detail:'Shields nearby creatures. Break its escort.'},
 {id:'emberBoar',name:'Ember Boar',power:'Cinder charge',detail:'Charges forward and slows nearby defenses.'},
 {id:'venomQueen',name:'Venom Queen',power:'Venom veil',detail:'Its toxic mist weakens nearby attacks.'},
 {id:'ironSnail',name:'Iron Snail',power:'Iron shell',detail:'Alternates between heavy armor and vulnerability.'},
 {id:'lanternLeech',name:'Lantern Leech',power:'Stolen light',detail:'Steals a few coins. Defeat it to reclaim them.'},
 {id:'chronoMoth',name:'Chrono Moth',power:'Time distortion',detail:'Distorts the firing rhythm of nearby towers.'},
 {id:'thornBeast',name:'Thorn Beast',power:'Bramble bind',detail:'Thorns briefly slow a few nearby defenses.'},
 {id:'portalSentinel',name:'Portal Sentinel',power:'Sentinel rift',detail:'Blinks, shields itself and calls riftlings.'},
]
export const regularMobs=[
 {id:'mite',name:'Dew Mite',power:'A small, fast path runner.'},
 {id:'beetle',name:'Acorn Beetle',power:'A sturdy armored scout.'},
 {id:'slug',name:'Moss Slug',power:'Slow and sturdy. Regenerates lost health.'},
 {id:'wisp',name:'Willow Wisp',power:'A flying spirit that renews its shield.'},
 {id:'bat',name:'Velvet Bat',power:'Flies above ground-only defenses.'},
 {id:'scarab',name:'Sun Scarab',power:'Protected by armor and a strong shield.'},
 {id:'firefly',name:'Lantern Firefly',power:'Flies above the path and heals nearby allies.'},
 {id:'sporeling',name:'Sporeling',power:'Its death spores weaken nearby defenses.'},
 {id:'tinyZombie',name:'Rootling Zombie',power:'Rises once after defeat, unless summoned.'},
 {id:'riftling',name:'Riftling',power:'Blinks forward twice along its path.'},
 {id:'shardling',name:'Glass Shardling',power:'Splits into two mites when defeated, unless summoned.'},
 {id:'mimic',name:'Chest Mimic',power:'An armored chest with one sudden charge.'},
]
export const expansionAbilities:Record<string,string>={
 prismDash:'Rainbow dash',prismLances:'Chromatic lances',prismaticAegis:'Prismatic aegis',spectrumRain:'Spectrum rain',mirrorRush:'Mirror rush',prismOverdrive:'Solar overdrive',
 rally:'Rally',fieldFreeze:'Deep freeze',wither:'Wither',stormLock:'Storm lock',graveCall:'Grave call',mirrorSplit:'Mirror split',riftBlink:'Rift step',mossShield:'Living shield',emberCharge:'Cinder charge',venomMist:'Venom veil',ironShell:'Iron shell',coinLeech:'Stolen light',chronoField:'Time distortion',thornBind:'Bramble bind',sentinelRift:'Sentinel rift',
 brambleSurge:'Bramble surge',lanternFlood:'Lantern flood',glacierLance:'Glacier lances',harvestMoon:'Harvest moon',cycloneCall:'Eye of the storm',graveMarch:'Dead march',eyeClones:'Mirror eyes',reincarnate:'Rebirth',blackout:'Total eclipse',portalBlink:'Rift step',portalShift:'Reality shift',portalStorm:'Rift lightning',portalSummon:'Gatekeepers',
}
export const expansionHints:Record<string,string>={
 prismDash:'A short forward dash. Cover the next stretch.',prismLances:'Marked plants will be stunned. Lotus can cleanse them.',prismaticAegis:'Asuna gains a short-lived shield. Magnet and Moonflower break through.',spectrumRain:'A radiant barrage weakens marked defenses.',mirrorRush:'Fragile doubles rush the path. Keep splash coverage.',prismOverdrive:'The escort accelerates. Keep slowing and area damage ready.',
 rally:'Nearby enemies surge. The drummer also rallies them on death.',fieldFreeze:'A brief field-wide freeze. Lotus can cleanse defenses.',wither:'Plant damage is weakened for a few seconds.',stormLock:'Nearby towers are marked for lightning.',graveCall:'Rootling zombies are rising. Keep splash coverage.',mirrorSplit:'Fragile doubles incoming. Eclipse Lily excels against clones.',riftBlink:'A short forward blink. Cover the path ahead.',mossShield:'The escort gains shields. Focus the golem.',emberCharge:'Charging forward; nearby towers fire more slowly.',venomMist:'Local attacks weaken inside the venom cloud.',ironShell:'Wait for the shell to open or strip its armor.',coinLeech:'Defeat the leech to recover stolen coins.',chronoField:'Nearby firing slows. Spread your defenses.',thornBind:'Binding roots slow nearby defenses.',sentinelRift:'A shielded sentinel calls reinforcements.',
 brambleSurge:'Roots slow nearby defenses; beetles arrive and enemies accelerate.',lanternFlood:'Nearby enemies gain shields as wisps join the path.',glacierLance:'Ice lances mark defenses. Keep a cleansing Lotus nearby.',harvestMoon:'Mimics join the path while nearby enemies accelerate.',cycloneCall:'The moving storm is pulling in another miniboss.',graveMarch:'Rootling zombies rise and the horde accelerates.',eyeClones:'Decoy eyes split away. Keep multi-target coverage.',reincarnate:'A weaker body returns with more dangerous abilities.',blackout:'The battlefield goes completely dark, briefly. Defenses keep fighting.',portalBlink:'The gate blinks forward. Cover the next stretch.',portalShift:'Several enemies will jump forward along their paths.',portalStorm:'Rift lightning stuns marked plants.',portalSummon:'Portal Sentinels are crossing the gate.',
}
