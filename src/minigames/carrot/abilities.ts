import { expansionAbilities, expansionHints } from './expansion.ts'

/**
 * Words for every telegraphed ability: its name, the counterplay hint under the boss bar, the first-encounter card (at most 12 words,
 * read while the game is paused) and the two-word verb shown with the glyph every time after that. `action` names the cast-row chip:
 * 'sell' (uproot: sell the marked tower), 'spend' (tithe), 'focus' (root knots), 'air' (flying adds), otherwise none.
 */
export type AbilityText={name:string;hint:string;card:string;verb:string;action?:'sell'|'spend'|'focus'|'air';icon?:string}
const base:Record<string,AbilityText>={
 blind:{name:'Blindness',hint:'Towers outside lantern light lose reach. Prism and Sun Blossom keep the dark lit.',card:'Unlit towers lose reach. Prism and Sun Blossom stay lit.',verb:'Light up',icon:'eye'},
 uproot:{name:'Uproot',hint:'A tower is being pulled up. Sell it before the cast ends to keep more coins.',card:'The marked tower will be uprooted. Sell it first to save coins.',verb:'Sell it',action:'sell',icon:'sell'},
 tithe:{name:'Tithe',hint:'The guardian claims a fifth of your coins. Spend before it lands.',card:'The guardian takes a fifth of your coins. Spend them first.',verb:'Spend coins',action:'spend',icon:'coin'},
 whiteout:{name:'Whiteout',hint:'A frost gust freezes every shot in the air for a moment.',card:'Whiteout: shots freeze in the air and unlit towers lose reach.',verb:'Wait out',icon:'bolt'},
 dusk:{name:'Dusk',hint:'It goes dark and crows join the path. Defeat every crow to win.',card:'Crows join in the dark. Defeat every crow to win.',verb:'Clear crows',action:'air',icon:'eye'},
 gust:{name:'Gust',hint:'Shots near the tornado hit for half. Mortar and Thunderhead ignore it.',card:'Near the funnel, shots hit for half. Mortar and Thunderhead ignore it.',verb:'Use mortar',icon:'bolt'},
 liftoff:{name:'Lift-off',hint:'The tornado lifts off: ground-only towers cannot reach it.',card:'The tornado flies. Ground-only towers cannot reach it for four seconds.',verb:'Hit air',action:'air',icon:'wing'},
 raise:{name:'Raise Dead',hint:'Fallen creatures rise again beside the Zombie.',card:'Fallen creatures rise beside the Zombie. Keep splash damage ready.',verb:'Splash ready',icon:'skull'},
 gaze:{name:'Gaze',hint:'Your strongest tower is stunned for five seconds. Lotus can cleanse it.',card:'The eye stuns your strongest tower. Sanctuary Lotus can cleanse it.',verb:'Cleanse stun',icon:'eye'},
 bark:{name:'Bark',hint:'For five seconds its bark blocks normal shots. Fire and lightning still hit.',card:'Bark blocks normal shots for 5 seconds. Fire and lightning still hit.',verb:'Switch damage',icon:'shield'},
 root:{name:'Roots',hint:'Roots slow up to two towers. Shoot the knot to free them.',card:'Roots slow two towers. Shoot the knot to free them.',verb:'Shoot knot',action:'focus',icon:'target'},
 mist:{name:'Mist',hint:'Creatures inside the mist take less damage. Hit them outside it.',card:'Mist shields nearby creatures for five seconds. Hit them outside it.',verb:'Hit outside',icon:'shield'},
 summon:{name:'Summon',hint:'More creatures join the path. Keep splash damage on the route.',card:'More creatures join the path. Keep splash damage on the route.',verb:'Splash adds',icon:'skull'},
 mantle:{name:'Ice mantle',hint:'A shield of ice. Burst it down before it melts back.',card:'An ice mantle shields the guardian. Break it quickly.',verb:'Break shield',icon:'hex'},
 breath:{name:'Frost breath',hint:'Towers in the cone fire at half speed for four seconds.',card:'Frost breath slows towers in a cone. Spread your towers out.',verb:'Spread out',icon:'bolt'},
 shatter:{name:'Shatter',hint:'Ice fragments break off and walk on.',card:'Ice fragments break off and walk on. Cover the route.',verb:'Cover route',icon:'skull'},
 rush:{name:'Harvest rush',hint:'The guardian sprints and speeds its escort.',card:'The guardian sprints and speeds its escort. Slow it down.',verb:'Slow it',icon:'arrow'},
 flock:{name:'Flock',hint:'Moths fly in. Air-capable towers must cover the route.',card:'Moths fly in. Air-capable towers must cover the route.',verb:'Cover air',action:'air',icon:'wing'},
 heap:{name:'Straw heap',hint:'It hides in straw and cannot be targeted for two seconds.',card:'It hides in straw for two seconds. Cover the path ahead.',verb:'Cover ahead',icon:'eye'},
 reincarnate:{name:'Rebirth',hint:'A weaker body returns with more dangerous abilities.',card:'A weaker body returns with stronger powers. Keep damage on it.',verb:'Hit again',icon:'skull'},
 heal:{name:'Heal',hint:'Shamans heal nearby creatures. Focus them first.',card:'Shamans heal nearby creatures. Focus them first.',verb:'Focus healer',action:'focus',icon:'cross'},
}
const verbs:Record<string,string>={prismDash:'Rebuild ahead',prismLances:'Cleanse stun',prismaticAegis:'Break shield',spectrumRain:'Spread out',mirrorRush:'Splash doubles',prismOverdrive:'Slow escort',
 rally:'Focus drummer',fieldFreeze:'Cleanse freeze',wither:'Wait out',stormLock:'Spread out',graveCall:'Splash adds',mirrorSplit:'Hit clones',riftBlink:'Cover ahead',mossShield:'Focus golem',emberCharge:'Slow boar',venomMist:'Hit outside',ironShell:'Strip armor',coinLeech:'Catch leech',chronoField:'Spread out',thornBind:'Spread out',sentinelRift:'Focus sentinel',
 brambleSurge:'Hold line',lanternFlood:'Break shields',glacierLance:'Cleanse marks',harvestMoon:'Splash adds',cycloneCall:'Focus miniboss',graveMarch:'Splash adds',eyeClones:'Hit clones',blackout:'Wait out',portalBlink:'Cover ahead',portalShift:'Cover ahead',portalStorm:'Cleanse stun',portalSummon:'Focus sentinels'}
const cards:Record<string,string>={
 prismDash:'She outruns fixed defenses. Sell towers behind her, rebuild ahead.',prismLances:'Marked towers will be stunned. Lotus can cleanse them.',prismaticAegis:'A short-lived shield. Magnet Clover and Eclipse Lily break through.',spectrumRain:'Light beams weaken marked towers. Spread them out.',mirrorRush:'Fragile doubles rush the path. Keep splash coverage.',prismOverdrive:'Her escort speeds up. Keep slows and area damage ready.',
 rally:'Nearby creatures speed up, and again when the drummer dies.',fieldFreeze:'Every tower freezes briefly. Lotus can cleanse them.',wither:'Tower damage drops for a few seconds.',stormLock:'Nearby towers are marked for lightning stuns.',graveCall:'Rootling zombies are rising. Keep splash coverage.',mirrorSplit:'Fragile clones appear. Eclipse Lily is strong against clones.',riftBlink:'A short forward blink. Cover the path ahead.',mossShield:'The escort gains shields. Focus the golem.',emberCharge:'It charges; nearby towers fire more slowly.',venomMist:'Attacks inside the venom cloud are weakened.',ironShell:'Wait for the shell to open, or strip its armor.',coinLeech:'It steals coins. Defeat it to get them back.',chronoField:'Nearby towers fire slower. Spread them out.',thornBind:'Roots slow nearby towers.',sentinelRift:'A shielded sentinel calls reinforcements.',
 brambleSurge:'Roots slow towers while beetles arrive and creatures speed up.',lanternFlood:'Nearby creatures gain shields as wisps join the path.',glacierLance:'Ice lances mark towers. Keep a Lotus nearby to cleanse them.',harvestMoon:'Mimics join the path and nearby creatures speed up.',cycloneCall:'The storm pulls in another miniboss.',graveMarch:'Rootling zombies rise and the rest speed up.',eyeClones:'Decoy eyes split away. Keep multi-target coverage.',blackout:'It goes fully dark for a moment. Your towers keep firing.',portalBlink:'The gate blinks forward. Cover the next stretch.',portalShift:'Several creatures jump forward along their paths.',portalStorm:'Rift lightning stuns marked towers. Lotus can cleanse them.',portalSummon:'Portal Sentinels cross the gate. Focus them down.'}
export function abilityText(id:string):AbilityText{
 const b=base[id];if(b)return b
 const name=expansionAbilities[id]||id.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ')
 return {name,hint:expansionHints[id]||'',card:cards[id]||expansionHints[id]||'',verb:verbs[id]||'',icon:'warning'}
}
/** Every id with a first-encounter card (tests check the 12-word limit on all of them). */
export const abilityIds=[...Object.keys(base),...Object.keys(cards)]
export const words=(s:string)=>s.trim().split(/\s+/).filter(Boolean).length
