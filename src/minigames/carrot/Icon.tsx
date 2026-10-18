// 24 px stroke glyphs, drawn for this page. Every colour cue in the HUD carries one of these as its shape twin.
const paths:Record<string,string>={
 back:'m14 5-7 7 7 7M7 12h14',close:'m6 6 12 12M18 6 6 18',play:'m8 5 11 7-11 7Z',pause:'M8 5v14M16 5v14',full:'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5',
 sound:'m11 5-5 4H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',mute:'m11 5-5 4H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6',lock:'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
 arrow:'M4 12h16m-6-6 6 6-6 6',upgrade:'m6 12 6-6 6 6M12 6v14M5 3h14',sell:'M4 7h16l-2 13H6L4 7Zm4 0V4h8v3m-8 4h8',
 target:'M12 2v4m0 12v4M2 12h4m12 0h4M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z',bolt:'m13 2-9 12h7l-1 8 10-13h-7l1-7Z',heart:'M12 20 4 12C0 7 7-1 12 5c5-6 12 2 8 7l-8 8Z',
 coin:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3 5h-4a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-4M12 5v15',leaf:'M20 3C9 1 2 6 4 15s14 7 16-12ZM5 19 16 8',
 help:'M9 8a3 3 0 1 1 5 3c-2 1-2 2-2 3m0 3v1M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',levels:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
 restart:'M4 11a8 8 0 1 1 1 6M4 4v7h7',check:'m5 12 4 4 10-10',warning:'m12 3 10 18H2L12 3Zm0 6v5m0 3v1',
 merge:'M5 5h5v5H5zm9 9h5v5h-5zM10 7.5h3a3 3 0 0 1 3 3V14m-6-3 2 2 2-2',undo:'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
 star:'m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z',crown:'m3 8 5 4 4-7 4 7 5-4-2 11H5L3 8Z',
 // two blades crossing at the centre, each with a guard and a pommel
 swords:'M4 3h3l10 10M14.5 15.5l4-4M17 14l3.5 3.5-2 2L15 16M20 3h-3L7 13M9.5 15.5l-4-4M7 14l-3.5 3.5 2 2L9 16',
 eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
 sliders:'M4 6h9m4 0h3M4 12h3m4 0h9M4 18h11m4 0h1M15 4v4M9 10v4M17 16v4',
 skull:'M12 3a8 8 0 0 0-6 13v4h12v-4a8 8 0 0 0-6-13ZM9 11.5h.01M15 11.5h.01M10 20v-3m4 3v-3',
 wing:'M2 15c5 0 9-3 11-9 1 5 4 9 9 9-4 3-9 4-13 2-2 1-5 0-7-2Z',shield:'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z',
 hex:'M12 2l8.5 5v10L12 22l-8.5-5V7Z',cross:'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6Z',flag:'M5 21V4h12l-3 4 3 4H5',
 focus:'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M12 9v6M9 12h6',splash:'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l3 3m6 6 3 3m0-12-3 3m-6 6-3 3',
 dot:'M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',grid:'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z',
 // HUD additions: two links of a chain, a stopwatch, a four-point spark, a finger tapping, a fast-forward pair
 chain:'M10 13.5a3.6 3.6 0 0 0 5.1.4l3-3a3.6 3.6 0 0 0-5.1-5.1l-1.2 1.2M14 10.5a3.6 3.6 0 0 0-5.1-.4l-3 3a3.6 3.6 0 0 0 5.1 5.1l1.2-1.2',
 timer:'M12 9v4.5l2.5 1.5M10 2.5h4M12 21.5a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z',
 spark:'M12 3.5c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7Z',
 tap:'M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1a1.5 1.5 0 0 1 3 0v1m0 0a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4-2l-3-4a1.5 1.5 0 0 1 2.3-1.9L9 14',
 fast:'m4 6 7 6-7 6V6Zm9 0 7 6-7 6V6Z',
}
export default function Icon({name}:{name:string}){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.leaf}/></svg>}
