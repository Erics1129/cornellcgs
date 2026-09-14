/** Only URLs live here: mounting a page requests that page's three frames. */
export const PAGE_SCENES = {
  'who-we-are': { label: 'Interlock', description: 'Ivory and navy sculptural folds approach and interlock.', duration: 11000, motif: 'fold', position: '50% 48%' },
  'what-we-do': { label: 'At the table', description: 'Go pieces assemble on a graphite and coral workshop table.', duration: 10000, motif: 'grid', position: '50% 54%' },
  'ml-process': { label: 'Signal / response', description: 'Ice blue glass signals travel through layers in a deep navy space.', duration: 9000, motif: 'signal', position: '50% 50%' },
  events: { label: 'Chain reaction', description: 'Orange dominoes form a kinetic wave against ivory.', duration: 10000, motif: 'wave', position: '50% 56%' },
  world: { label: 'Common ground', description: 'A small topographic globe and cyan orbits in a dark petrol space.', duration: 12000, motif: 'orbit', position: '50% 49%' },
  people: { label: 'Woven together', description: 'Navy and ochre ribbons weave together against warm white.', duration: 12000, motif: 'weave', position: '50% 48%' },
  advisors: { label: 'Connections', description: 'A chrome and navy node structure on white.', duration: 11000, motif: 'nodes', position: '50% 48%' },
  join: { label: 'An open door', description: 'Light moves through an open architectural doorway in cream and green.', duration: 11500, motif: 'door', position: '50% 53%' },
  contact: { label: 'Send a signal', description: 'Amber concentric signal rings expand against ink.', duration: 9500, motif: 'rings', position: '50% 50%' },
} as const

export type PageSceneId = keyof typeof PAGE_SCENES
export const PAGE_ORDER = Object.keys(PAGE_SCENES) as PageSceneId[]
export const sceneFrames = (id: PageSceneId) => [0, 1, 2].map(frame => `/assets/page-scenes/${id}/${frame}.webp`)
