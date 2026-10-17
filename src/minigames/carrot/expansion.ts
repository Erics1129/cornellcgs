// Portrait order is a shared contract with the generated plates and Blender exports.
export const expansionTowers=['bamboo','chili','lotus','magnet','orchid','mushroom','cactus','clockflower','dragonfruit','moonflower']
export const towerTraits:Record<string,string>={
 seed:'Fires rapid seeds at one target. Hits flying creatures.',frost:'Slows its target. Later tiers slow nearby creatures too.',mortar:'Shells burst on the ground in a blast.',prism:'Precise beam that cuts through shields.',storm:'Lightning chains through three to five creatures.',blossom:'Hits every creature in its ring.',starfruit:'Stars strike several creatures, then return.',gravity:'Pulls creatures back along the path.',book:'Runes rewind a creature for one second.',thunder:'Charges, then strikes up to three creatures.',
 bamboo:'Pierces creatures in a line.',chili:'Leaves a burning trail. Exposes creatures to more damage.',lotus:'Removes stuns, slows and weakness from nearby towers.',magnet:'Chains pulses. Strips armor and shields.',orchid:'Stacks venom on tough targets.',mushroom:'Puts ground creatures to sleep. Slows guardians and minibosses.',cactus:'Ricocheting thorns cause bleeding.',clockflower:'Speeds up nearby towers. Slows creatures.',dragonfruit:'Calls down explosive meteors.',moonflower:'Breaks shields. Extra damage to clones.',
}
export const miniBosses=[
 {id:'warDrummer',name:'War Drummer',power:'Rally',detail:'Speeds up nearby creatures, and once more when it dies.'},
 {id:'frostHerald',name:'Frost Herald',power:'Deep freeze',detail:'Warns, then briefly freezes every tower.'},
 {id:'witherPriest',name:'Wither Priest',power:'Wither',detail:'Weakens every tower for a few seconds.'},
 {id:'stormWarden',name:'Storm Warden',power:'Storm lock',detail:'Stuns a few nearby towers with lightning.'},
 {id:'graveCaller',name:'Grave Caller',power:'Grave call',detail:'Raises a pack of tiny zombies.'},
 {id:'mirrorKnight',name:'Mirror Knight',power:'Mirror split',detail:'Creates fragile decoys that absorb attacks.'},
 {id:'riftStalker',name:'Rift Stalker',power:'Rift step',detail:'Blinks a short distance forward along its path.'},
 {id:'mossGolem',name:'Moss Golem',power:'Living shield',detail:'Shields nearby creatures. Break its escort.'},
 {id:'emberBoar',name:'Ember Boar',power:'Cinder charge',detail:'Charges forward and slows nearby towers.'},
 {id:'venomQueen',name:'Venom Queen',power:'Venom veil',detail:'Its toxic mist weakens nearby attacks.'},
 {id:'ironSnail',name:'Iron Snail',power:'Iron shell',detail:'Switches between heavy armor and no armor.'},
 {id:'lanternLeech',name:'Lantern Leech',power:'Stolen light',detail:'Steals a few coins. Defeat it to get them back.'},
 {id:'chronoMoth',name:'Chrono Moth',power:'Time distortion',detail:'Makes nearby towers fire unevenly.'},
 {id:'thornBeast',name:'Thorn Beast',power:'Bramble bind',detail:'Thorns briefly slow a few nearby towers.'},
 {id:'portalSentinel',name:'Portal Sentinel',power:'Sentinel rift',detail:'Blinks, shields itself and calls riftlings.'},
]
export const regularMobs=[
 {id:'mite',name:'Dew Mite',power:'A small, fast path runner.'},
 {id:'beetle',name:'Acorn Beetle',power:'A sturdy armored scout.'},
 {id:'slug',name:'Moss Slug',power:'Slow and sturdy. Regenerates lost health.'},
 {id:'wisp',name:'Willow Wisp',power:'A flying spirit that renews its shield.'},
 {id:'bat',name:'Velvet Bat',power:'Flies over ground-only towers.'},
 {id:'scarab',name:'Sun Scarab',power:'Protected by armor and a strong shield.'},
 {id:'firefly',name:'Lantern Firefly',power:'Flies over the path and heals nearby creatures.'},
 {id:'sporeling',name:'Sporeling',power:'When it dies, its spores weaken nearby towers.'},
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
 prismDash:'She outruns fixed defenses. Sell the towers she has passed and rebuild ahead of her, even while paused.',prismLances:'Marked towers will be stunned. Lotus can cleanse them.',prismaticAegis:'Asuna gains a short-lived shield. Magnet Clover and Eclipse Lily break through.',spectrumRain:'Light beams weaken marked towers.',mirrorRush:'Fragile doubles rush the path. Keep splash coverage.',prismOverdrive:'Her escort speeds up. Keep slows and area damage ready.',
 rally:'Nearby creatures speed up, and again when the drummer dies.',fieldFreeze:'Every tower freezes briefly. Lotus can cleanse them.',wither:'Tower damage drops for a few seconds.',stormLock:'Nearby towers are marked for lightning.',graveCall:'Rootling zombies are rising. Keep splash coverage.',mirrorSplit:'Fragile clones appear. Eclipse Lily is strong against clones.',riftBlink:'A short forward blink. Cover the path ahead.',mossShield:'The escort gains shields. Focus the golem.',emberCharge:'It charges forward and nearby towers fire more slowly.',venomMist:'Attacks inside the venom cloud are weaker.',ironShell:'Wait for the shell to open or strip its armor.',coinLeech:'Defeat the leech to recover stolen coins.',chronoField:'Nearby towers fire slower. Spread them out.',thornBind:'Roots slow nearby towers.',sentinelRift:'A shielded sentinel calls reinforcements.',
 brambleSurge:'Roots slow nearby towers while beetles arrive and creatures speed up.',lanternFlood:'Nearby creatures gain shields as wisps join the path.',glacierLance:'Ice lances mark towers. Keep a Lotus nearby to cleanse them.',harvestMoon:'Mimics join the path and nearby creatures speed up.',cycloneCall:'The storm pulls in another miniboss.',graveMarch:'Rootling zombies rise and the rest speed up.',eyeClones:'Decoy eyes split away. Keep multi-target coverage.',reincarnate:'A weaker body returns with more dangerous abilities.',blackout:'The board goes fully dark for a moment. Towers keep firing.',portalBlink:'The gate blinks forward. Cover the next stretch.',portalShift:'Several creatures jump forward along their paths.',portalStorm:'Rift lightning stuns marked towers.',portalSummon:'Portal Sentinels cross the gate.',
}
