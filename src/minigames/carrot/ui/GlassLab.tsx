import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Glass, Jelly, glass, useGlassTier, usePointerLight } from './Glass'
import type { GlassTier } from './Glass'
import { Grade, Medals, Pips } from './kit'
import { TowerPortrait, chapterArt } from '../art'
import Icon from '../Icon'

/**
 * Development only (?carrot-glass-lab; never in production). Every glass primitive over a chosen backdrop, for contrast and look
 * checks and as the reference for the surfaces. Query: bg=<image url> (default: the biome's key art), biome=garden|marsh|frost|orchard|
 * arena|prism, glass=real|lite|solid (default: what this device gets on a still backdrop), pos=<object-position>, motion=reduce.
 * Every [data-probe] block is read by the contrast probe (text hidden, pixels under each text run compared with its colour).
 */
const css = `
.ct-lab{overflow:auto;}
.ct-lab__bg{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1}
.ct-lab__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:28px;padding:28px;align-items:start;max-width:1500px}
.ct-lab__col{display:grid;gap:16px;align-content:start}
.ct-lab h4{font:700 11px/1 var(--f-ui);letter-spacing:.06em;text-transform:uppercase;color:#fff;text-shadow:0 1px 2px #000}
.ct-lab__status{display:grid;grid-template-columns:auto auto;align-items:center;gap:8px 16px;padding:12px 18px;justify-self:start}
.ct-lab__status .gl-num{font-size:20px}
.ct-lab__coins{color:var(--coin)}
.ct-lab__wave{display:grid;gap:8px;padding:12px 20px}
.ct-lab__wave header{display:flex;align-items:baseline;gap:10px}
.ct-lab__wave strong{flex:1;font:800 15px/1.1 var(--f-disp)}
.ct-lab__controls{display:flex;gap:8px;flex-wrap:wrap}
.ct-lab__speed{gap:6px;padding:0 14px}
.ct-lab__speed b{font:700 14px/1 var(--f-num)}.ct-lab__speed small{font:800 11px/1 var(--f-ui);letter-spacing:.06em;text-transform:uppercase}
.ct-lab__build{display:grid;gap:10px;padding:10px;width:min(340px,100%);--gl-pad:10px}
.ct-lab__tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.ct-lab__tile{aspect-ratio:1;overflow:hidden;display:grid}
.ct-lab__tile .ct-portrait{width:100%;height:100%}
.ct-lab__info{display:grid;gap:4px;padding:0 4px}
.ct-lab__info b{font:800 15px/1.1 var(--f-disp)}
.ct-lab__info p{font-size:13px;color:var(--ink-2)}
.ct-lab__dps{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;padding:0 4px}
.ct-lab__actions{display:flex;gap:8px}.ct-lab__actions .gl-jelly{flex:1}
.ct-lab__sheet{display:grid;gap:14px;padding:20px 22px 22px}
.ct-lab__sheet header{display:flex;align-items:center;gap:12px}.ct-lab__sheet h2{flex:1;font:800 26px/1.05 var(--f-disp)}
.ct-lab__sheet p{font-size:14px;line-height:1.45;color:var(--ink-2)}
.ct-lab__row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.ct-lab__entry{display:grid;gap:14px;justify-items:start}
.ct-lab__next{display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:center;padding:10px;width:min(340px,100%);text-align:left;--gl-pad:10px}
.ct-lab__next .gl-thumb{aspect-ratio:16/9}
.ct-lab__next b{display:flex;gap:8px;align-items:baseline;font:800 16px/1.1 var(--f-disp)}.ct-lab__next b i{font:700 13px var(--f-num);font-style:normal;color:var(--accent-text)}
.ct-lab__toast{display:flex;align-items:center;gap:12px;padding:10px 12px 10px 16px}
.ct-lab__toast div{display:grid;gap:2px;flex:1}.ct-lab__toast b{font:800 14px/1.2 var(--f-ui)}.ct-lab__toast span{font-size:13px;color:var(--ink-2)}
`
export default function GlassLab() {
 const q = new URLSearchParams(location.search)
 const biome = q.get('biome') || 'frost'
 const auto = useGlassTier({ reducedEffects: false, live: false, still: true })
 const tier = (q.get('glass') as GlassTier | null) || auto
 const root = useRef<HTMLDivElement>(null)
 usePointerLight(root)
 const [seg, setSeg] = useState(1), [on, setOn] = useState(true), [vol, setVol] = useState(60), [pick, setPick] = useState(1)
 const towers = ['seed', 'frost', 'mortar', 'prism', 'storm']
 return <div ref={root} className="ct-page ct-lab" data-glass={tier} data-biome={biome} data-motion={q.get('motion') === 'reduce' ? 'reduce' : 'full'}>
  <style>{css}</style>
  <img className="ct-lab__bg" src={q.get('bg') || chapterArt(biome)} alt="" style={{ objectPosition: q.get('pos') || '50% 50%' }} />
  <div className="ct-lab__grid">
   <div className="ct-lab__col">
    <h4>Depth 1: HUD chips and controls ({tier})</h4>
    <Glass depth={1} className="ct-lab__status" data-probe="hud">
     <span className="gl-label">Coins</span><span className="gl-num ct-lab__coins">0520</span>
     <span className="gl-label">Carrot</span><span className="gl-num">10</span>
     <span className="gl-label">Chain</span><span className="gl-num" style={{ color: 'var(--ink-2)' }}>3×</span>
    </Glass>
    <Glass depth={1} className="ct-lab__wave" data-probe="hud">
     <header><strong>Lantern Causeway</strong><span className="gl-num">04<small style={{ color: 'var(--ink-2)' }}> / 08</small></span></header>
     <span className="gl-meter"><i style={{ '--v': .45 } as CSSProperties} /></span>
     <span className="gl-label">6 on the path · next in 4s</span>
    </Glass>
    <div className="ct-lab__controls" data-probe="hud">
     <button className={glass({ depth: 1, pill: true, interactive: true }, 'gl-btn ct-lab__speed')} aria-label="Speed held"><b>1×</b><small>Held</small></button>
     <button className="ct-icon-btn" aria-label="Pause"><Icon name="pause" /></button>
     <button className={glass({ depth: 1, pill: true, interactive: true, clear: true }, 'gl-icon')} aria-label="Settings"><Icon name="sliders" /></button>
     <button className="ct-ghost">Send now <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--coin-mark)' }}><Icon name="coin" /></span><b className="gl-num">+6</b><Icon name="arrow" /></button>
     <Jelly>Start wave<Icon name="play" /></Jelly>
    </div>
    <h4>Toasts and tones (depth 2)</h4>
    <Glass tone="threat" wash className="ct-lab__toast" data-probe="panel"><Icon name="warning" /><div><b style={{ color: 'var(--threat-text)' }}>Guardian incoming</b><span>Brambleback</span></div></Glass>
    <Glass tone="super" className="ct-lab__toast" data-probe="panel"><Icon name="merge" /><div><b>Super forged</b><span>Harvest Cannon</span></div><button className="ct-ghost"><Icon name="undo" />Undo 4s</button></Glass>
    <Glass tone="ally" className="ct-lab__toast" data-probe="panel"><Icon name="wing" /><div><b style={{ color: 'var(--ally-text)' }}>Flying creatures next wave</b><span>Ground-only towers can’t reach them.</span></div><button className="ct-icon-btn" aria-label="Dismiss"><Icon name="close" /></button></Glass>
   </div>
   <div className="ct-lab__col">
    <h4>Depth 2: panel (build menu)</h4>
    <Glass className="ct-lab__build" data-probe="panel">
     <div className="ct-lab__tiles" role="listbox" aria-label="Towers">{towers.map((t, i) => <button key={t} role="option" aria-selected={pick === i} className={glass({ interactive: true, selected: pick === i }, 'gl-fill ct-lab__tile')} onClick={() => setPick(i)}><TowerPortrait kind={t} /></button>)}</div>
     <div className="ct-lab__info"><b>Frost Fern</b><p>Slows its target. Later tiers slow nearby creatures too.</p></div>
     <div className="ct-lab__dps"><span className="gl-label">DPS</span><span className="gl-meter"><i style={{ '--v': .6 } as CSSProperties} /></span><span className="gl-num" style={{ fontSize: 12, color: 'var(--ink-2)' }}>3.2</span></div>
     <div className="ct-lab__row"><span className="ct-badge is-air"><Icon name="wing" />Air</span><span className="ct-badge"><Icon name="target" />Single</span><span className="ct-tag">Tier II</span><span className="ct-band is-hard">Hard</span></div>
     <div className="ct-lab__actions"><Jelly size="sm">Build <span className="ct-cta__cost"><Icon name="coin" />50</span></Jelly><button className="ct-icon-btn" aria-label="Close"><Icon name="close" /></button></div>
    </Glass>
    <h4>Entry page: jelly, clear pills, Up next (blur)</h4>
    <div className="ct-lab__entry" data-probe="entry">
     <Jelly size="lg" idle>Continue<Icon name="play" /></Jelly>
     <div className="ct-lab__row"><button className="ct-ghost gl--blur"><Icon name="levels" />Stages</button><button className="ct-ghost gl--blur"><Icon name="swords" />Challenges</button></div>
     <Glass as="button" blur interactive className="ct-lab__next">
      <span className="gl-thumb"><img src={chapterArt('garden')} alt="" /></span>
      <span style={{ display: 'grid', gap: 6 }}><span className="gl-label">Up next</span><b><i>05</i>Lantern Causeway</b><span className="ct-lab__row"><span className="ct-band">Normal</span><Pips value={2} /><Grade value={4} size="sm" /></span></span>
     </Glass>
    </div>
   </div>
   <div className="ct-lab__col">
    <h4>Depth 3: sheet (blur)</h4>
    <Glass depth={3} blur pop="sheet" className="ct-lab__sheet" data-probe="sheet" role="group" aria-label="Sample sheet">
     <header><h2>Settings</h2><button className="ct-icon-btn" aria-label="Close settings"><Icon name="close" /></button></header>
     <div className="ct-segment" role="group" aria-label="HUD size">{[90, 100, 115].map((v, i) => <button key={v} aria-pressed={seg === i} onClick={() => setSeg(i)}>{v}%</button>)}</div>
     <label className="ct-switch"><input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} /><span>Reduced effects</span><small>No shake, flashes, camera moves or see-through panels</small></label>
     <label className="ct-slider" style={{ display: 'grid', gridTemplateColumns: '96px 1fr 40px', alignItems: 'center', gap: 12 }}><span style={{ fontWeight: 700 }}>Music</span><input type="range" min={0} max={100} step={5} value={vol} style={{ '--v': `${vol}%` } as CSSProperties} onChange={e => setVol(Number(e.target.value))} /><b className="gl-num">{vol}</b></label>
     <p>Each lane is a route. Creatures slide toward the bright line and appear when they reach it.</p>
     <div className="ct-lab__row"><Medals value={5} /><Pips value={3} /><Grade value={0} size="sm" /><Grade value={5} size="md" /><span className="ct-tag is-best">New best</span></div>
     <div className="ct-lab__row"><button className="ct-ghost"><Icon name="restart" />Restart stage</button><button className="ct-ghost" disabled>Disabled</button><Jelly tone="threat">Restart</Jelly><Jelly disabled>Need 20 more</Jelly></div>
    </Glass>
   </div>
  </div>
 </div>
}
