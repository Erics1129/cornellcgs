/** Each route requests only its own generated master. Older keyframes remain as fallbacks. */
export const PAGE_SCENES = {
  'who-we-are': { label: 'Interlock', description: 'Cinematic ivory and navy sculpture in a sunlit gallery.', duration: 11000, motif: 'fold', position: '50% 48%' },
  'what-we-do': { label: 'At the table', description: 'Polished Go stones on a graphite game table in warm light.', duration: 10000, motif: 'grid', position: '50% 54%' },
  'ml-process': { label: 'Signal / response', description: 'Luminous glass fibres surrounding a dark optical processor.', duration: 9000, motif: 'signal', position: '50% 50%' },
  events: { label: 'Chain reaction', description: 'Amber dominoes and Go stones on a walnut table at golden hour.', duration: 10000, motif: 'wave', position: '50% 56%' },
  world: { label: 'Common ground', description: 'Earth from orbit, with detailed clouds and a gold and blue atmospheric rim.', duration: 12000, motif: 'orbit', position: '50% 49%' },
  people: { label: 'Woven together', description: 'Navy and ochre ribbons weave together against warm white.', duration: 12000, motif: 'weave', position: '50% 48%' },
  advisors: { label: 'Connections', description: 'A finely machined chrome network sculpture in an ivory gallery.', duration: 11000, motif: 'nodes', position: '50% 48%' },
  join: { label: 'An open door', description: 'Light moves through an open architectural doorway in cream and green.', duration: 11500, motif: 'door', position: '50% 53%' },
  contact: { label: 'Send a signal', description: 'An amber signal shines through precisely engineered brass and glass optics.', duration: 9500, motif: 'rings', position: '50% 50%' },
} as const

export type PageSceneId = keyof typeof PAGE_SCENES
export const PAGE_ORDER = Object.keys(PAGE_SCENES) as PageSceneId[]
export const sceneFrames = (id: PageSceneId) => [0, 1, 2].map(frame => `/assets/page-scenes/${id}/${frame}.webp`)

export const sceneArtwork = (id: PageSceneId) => `/assets/page-scenes/${id}/cinematic-v2.webp`
