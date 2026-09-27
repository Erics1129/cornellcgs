/** Each route loads a single native-rendered film, with a matching still fallback. */
export const PAGE_SCENES = {
  'who-we-are': { label: 'Interlock', description: 'Two ceramic ribbons interlock and unfold in a sunlit gallery.', duration: 8000, motif: 'fold', position: '50% 48%' },
  'what-we-do': { label: 'Your move', description: 'Lacquer Go stones play an exchange on a graphite board.', duration: 8000, motif: 'grid', position: '50% 54%' },
  'ml-process': { label: 'Signal', description: 'Light packets travel through glass fibres into an optical processor.', duration: 8000, motif: 'signal', position: '50% 50%' },
  events: { label: 'Chain reaction', description: 'A chain of amber and ivory dominoes falls across walnut.', duration: 8000, motif: 'wave', position: '50% 56%' },
  world: { label: 'Common ground', description: 'Earth rotates beneath sunlight, with NASA land and cloud imagery.', duration: 8000, motif: 'orbit', position: '50% 49%' },
  people: { label: 'Together', description: 'Navy and ochre fabric flexes in an over-and-under weave.', duration: 8000, motif: 'weave', position: '50% 48%' },
  advisors: { label: 'Connections', description: 'An articulated chrome network moves on machined bearings.', duration: 8000, motif: 'nodes', position: '50% 48%' },
  join: { label: 'Step in', description: 'Wooden doors open in a sunlit stone courtyard beside moving leaves.', duration: 8000, motif: 'door', position: '50% 53%' },
  contact: { label: 'Connect', description: 'Machined brass iris blades open and close around an optical lens.', duration: 8000, motif: 'rings', position: '50% 50%' },
} as const

export type PageSceneId = keyof typeof PAGE_SCENES
export const PAGE_ORDER = Object.keys(PAGE_SCENES) as PageSceneId[]
export const sceneFrames = (id: PageSceneId) => [0, 1, 2].map(frame => `/assets/page-scenes/${id}/${frame}.webp`)

export const sceneArtwork = (id: PageSceneId) => `/assets/page-scenes/${id}/motion-v3.webp`

export const sceneFilm = (id: PageSceneId, quality: 'mobile' | '1080' | '4k') => `/assets/page-scenes/${id}/motion-v3-${quality}.mp4`
