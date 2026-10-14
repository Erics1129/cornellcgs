import { expansionAbilities, expansionHints } from './expansion'

/**
 * Words for every telegraphed ability: its name, the counterplay hint under the boss bar, the first-encounter card (at most 12 words,
 * read while the game is paused) and the two-word verb shown with the glyph every time after that. `action` names the cast-row chip:
 * 'sell' (uproot: sell the marked tower), 'spend' (tithe), 'focus' (root knots), 'air' (flying adds), otherwise none.
 */
export type AbilityText={name:string;hint:string;card:string;verb:string;action?:'sell'|'spend'|'focus'|'air';icon?:string}
const base:Record<string,AbilityText>={
 blind:{name:'Blindness',hint:'Towers outside lantern light lose reach. Prism and Sun Blossom keep the dark lit.',card:'Darkness falls. Unlit towers lose reach; Prism and Sun Blossom stay lit.',verb:'Light up',icon:'eye'},
 uproot:{name:'Uproot',hint:'A tower is being pulled up. Sell it before the roots close to keep more of its coins.',card:'A marked tower will be torn out. Sell it first for more coins.',verb:'Sell it',action:'sell',icon:'sell'},
 tithe:{name:'Tithe',hint:'The guardian claims a fifth of your coins. Spend before it lands.',card:'The guardian takes a fifth of your coins. Spend them first.',verb:'Spend coins',action:'spend',icon:'coin'},
 whiteout:{name:'Whiteout',hint:'A frost gust freezes every shot in the air for a moment.',card:'Whiteout: shots freeze in the air and unlit towers lose reach.',verb:'Hold steady',icon:'bolt'},
 dusk:{name:'Dusk',hint:'Full dark, and crows. Clear the crows to win.',card:'Full dark, and crows join the path. Clear every crow to win.',verb:'Clear crows',action:'air',icon:'eye'},
 gust:{name:'Gust',hint:'Shots near the tornado hit for half. Mortar and Thunderhead ignore it.',card:'Near the funnel shots hit for half. Mortar and Thunderhead ignore it.',verb:'Use mortar',icon:'bolt'},
 liftoff:{name:'Lift-off',hint:'The tornado lifts off: ground-only towers cannot reach it.',card:'The tornado flies. Ground-only towers cannot reach it for four seconds.',verb:'Hit air',action:'air',icon:'wing'},
 raise:{name:'Raise Dead',hint:'Fallen creatures rise again beside the Zombie.',card:'Fallen creatures rise beside the Zombie. Keep splash damage ready.',verb:'Splash ready',icon:'skull'},
 gaze:{name:'Gaze',hint:'Your strongest tower is stunned for five seconds. Lotus can cleanse it.',card:'The eye stuns your strongest tower. Sanctuary Lotus can cleanse it.',verb:'Cleanse stun',icon:'eye'},
 bark:{name:'Bark',hint:'Its bark turns kinetic shots for five seconds. Fire and lightning still bite.',card:'Bark hardens for five seconds. Fire and lightning still bite.',verb:'Switch damage',icon:'shield'},
 root:{name:'Roots',hint:'Roots slow up to two towers. Shoot the knot to free them.',card:'Roots slow two towers. Shoot the knot to free them.',verb:'Shoot knot',action:'focus',icon:'target'},
 mist:{name:'Mist',hint:'Creatures inside the mist take less damage. Hit them outside it.',card:'Mist shields nearby creatures for five seconds. Hit them outside it.',verb:'Hit outside',icon:'shield'},
 summon:{name:'Summon',hint:'Minions join the path. Keep splash damage on the route.',card:'Minions join the path. Keep splash damage on the route.',verb:'Splash adds',icon:'skull'},
 mantle:{name:'Ice mantle',hint:'A shield of ice. Burst it down before it melts back.',card:'An ice mantle shields the boss. Burst it down quickly.',verb:'Break shield',icon:'hex'},
 breath:{name:'Frost breath',hint:'Towers in the cone fire at half speed for four seconds.',card:'Frost breath slows towers in a cone. Spread your defenses.',verb:'Spread out',icon:'bolt'},
 shatter:{name:'Shatter',hint:'Ice fragments break off and walk on.',card:'Ice fragments break off and walk on. Cover the route.',verb:'Cover route',icon:'skull'},
 rush:{name:'Harvest rush',hint:'The guardian sprints and speeds its escort.',card:'The guardian sprints and speeds its escort. Slow it down.',verb:'Slow it',icon:'arrow'},
 flock:{name:'Flock',hint:'Moths fly in. Air-capable towers must cover the route.',card:'Moths fly in. Air-capable towers must cover the route.',verb:'Cover air',action:'air',icon:'wing'},
 heap:{name:'Straw heap',hint:'It hides in straw and cannot be targeted for two seconds.',card:'It hides in straw, untargetable for two seconds. Keep reach ahead.',verb:'Reach ahead',icon:'eye'},
 reincarnate:{name:'Rebirth',hint:'A weaker body returns with more dangerous abilities.',card:'A weaker body returns with stronger powers. Stay ready.',verb:'Stay ready',icon:'skull'},
 heal:{name:'Heal',hint:'Shamans heal nearby creatures. Focus them first.',card:'Shamans heal nearby creatures. Focus them first.',verb:'Focus healer',action:'focus',icon:'cross'},
}
const verbs:Record<string,string>={prismDash:'Cover ahead',prismLances:'Cleanse stun',prismaticAegis:'Break shield',spectrumRain:'Spread out',mirrorRush:'Splash doubles',prismOverdrive:'Slow escort',
 rally:'Focus drummer',fieldFreeze:'Cleanse freeze',wither:'Wait out',stormLock:'Spread out',graveCall:'Splash adds',mirrorSplit:'Hit clones',riftBlink:'Cover ahead',mossShield:'Focus golem',emberCharge:'Slow boar',venomMist:'Hit outside',ironShell:'Strip armor',coinLeech:'Catch leech',chronoField:'Spread out',thornBind:'Spread out',sentinelRift:'Focus sentinel',
 brambleSurge:'Hold line',lanternFlood:'Break shields',glacierLance:'Cleanse marks',harvestMoon:'Splash adds',cycloneCall:'Ready focus',graveMarch:'Splash adds',eyeClones:'Hit clones',blackout:'Hold steady',portalBlink:'Cover ahead',portalShift:'Cover ahead',portalStorm:'Cleanse stun',portalSummon:'Focus sentinels'}
const cards:Record<string,string>={
 prismDash:'Asuna dashes forward. Cover the next stretch of road.',prismLances:'Marked plants will be stunned. Lotus can cleanse them.',prismaticAegis:'A short-lived shield. Magnet Clover and Eclipse Lily break through.',spectrumRain:'A radiant barrage weakens marked defenses. Spread them out.',mirrorRush:'Fragile doubles rush the path. Keep splash coverage.',prismOverdrive:'The escort accelerates. Keep slowing and area damage ready.',
 rally:'Nearby enemies surge, again when the drummer falls.',fieldFreeze:'A brief field-wide freeze. Lotus can cleanse defenses.',wither:'Plant damage is weakened for a few seconds.',stormLock:'Nearby towers are marked for lightning stuns.',graveCall:'Rootling zombies are rising. Keep splash coverage.',mirrorSplit:'Fragile doubles incoming. Eclipse Lily excels against clones.',riftBlink:'A short forward blink. Cover the path ahead.',mossShield:'The escort gains shields. Focus the golem.',emberCharge:'It charges; nearby towers fire more slowly.',venomMist:'Attacks inside the venom cloud are weakened.',ironShell:'Wait for the shell to open, or strip its armor.',coinLeech:'It steals coins. Defeat it to get them back.',chronoField:'Nearby firing slows. Spread your defenses.',thornBind:'Binding roots slow nearby defenses.',sentinelRift:'A shielded sentinel calls reinforcements.',
 brambleSurge:'Roots slow defenses while beetles arrive and enemies accelerate.',lanternFlood:'Nearby enemies gain shields as wisps join the path.',glacierLance:'Ice lances mark defenses. Keep a cleansing Lotus nearby.',harvestMoon:'Mimics join the path while nearby enemies accelerate.',cycloneCall:'The storm pulls in another miniboss.',graveMarch:'Rootling zombies rise and the horde accelerates.',eyeClones:'Decoy eyes split away. Keep multi-target coverage.',blackout:'Total darkness, briefly. Your defenses keep fighting.',portalBlink:'The gate blinks forward. Cover the next stretch.',portalShift:'Several enemies jump forward along their paths.',portalStorm:'Rift lightning stuns marked plants. Lotus can cleanse them.',portalSummon:'Portal Sentinels cross the gate. Focus them down.'}
export function abilityText(id:string):AbilityText{
 const b=base[id];if(b)return b
 const name=expansionAbilities[id]||id.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ')
 return {name,hint:expansionHints[id]||'',card:cards[id]||expansionHints[id]||'',verb:verbs[id]||'Watch out',icon:'warning'}
}
/** Every id with a first-encounter card (tests check the 12-word limit on all of them). */
export const abilityIds=[...Object.keys(base),...Object.keys(cards)]
export const words=(s:string)=>s.trim().split(/\s+/).filter(Boolean).length
