import newPlaces from '../../public/assets/earth-journey/journey-v2-credits.json'

export type EarthPlace = {
  id: string; name: string; caption: string; image: string; width: number; height: number
  alt: string; photographer: string; license: string; source: string; licenseUrl: string
  start: number; arrival: number; stop: number
  anchor: [number, number]; tint: [number, number, number]; saturation: number
}

const imported = (id: string) => {
  const place = newPlaces.find(p => p.id === id)!
  return { ...place, image: place.image.split('/').pop()! }
}

/** Each interval gets shorter; the final tenth is a quiet arrival. These same
 * stops drive captions, keyboard navigation, fallback photos and GPU motion. */
export const EARTH_PLACES: EarthPlace[] = [
  {
    id: 'bali', name: 'Bali', caption: 'Jatiluwih · Indonesia',
    image: 'bali-jatiluwih.webp', width: 1920, height: 1152,
    alt: 'Green rice terraces curve across a hillside in Jatiluwih, Bali, with tiled shelters and coconut palms.',
    photographer: 'Jorge Franganillo', license: 'CC BY 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Bali-_Jatiluwih_rice_terraces_-_50281829296.jpg',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
    start: .30, arrival: .37, stop: .43, anchor: [.57, .52], tint: [1.015, 1.025, .965], saturation: 1.07,
  },
  {
    id: 'hawaii', name: 'Hawaiʻi', caption: 'Nā Pali Coast · Kauaʻi',
    image: 'hawaii-na-pali.webp', width: 1920, height: 1282,
    alt: 'Deeply folded green cliffs of the Nā Pali Coast fall into the Pacific Ocean on Kauaʻi, Hawaiʻi.',
    photographer: 'Andrew Baerst', license: 'CC BY 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Na_Pali_Coast_(28915675361).jpg',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
    start: .51, arrival: .57, stop: .61, anchor: [.52, .50], tint: [.96, 1.025, 1.04], saturation: 1.06,
  },
  { ...imported('dolomites'), name: 'The Dolomites', caption: 'Tre Cime di Lavaredo · Italy',
    start: .67, arrival: .714, stop: .744, anchor: [.50, .20], tint: [1.045, 1.005, .965], saturation: 1.03 },
  { ...imported('iceland'), name: 'Iceland', caption: 'Skógafoss · Southern Iceland',
    start: .78, arrival: .810, stop: .828, anchor: [.65, .50], tint: [.95, 1.015, 1.055], saturation: .91 },
  {
    id: 'new-york', name: 'New York', caption: 'Statue of Liberty · New York Harbor',
    image: 'liberty-island.webp', width: 1920, height: 1253,
    alt: 'The Statue of Liberty and its stone pedestal rise above Liberty Island, seen across New York Harbor.',
    photographer: 'National Park Service', license: 'Public domain',
    source: 'https://npgallery.nps.gov/AssetDetail/3454fd91-1dd8-b71b-0b21-a93398840c35', licenseUrl: '',
    start: .85, arrival: .874, stop: .886, anchor: [.48, .45], tint: [1.015, 1.0, .98], saturation: .98,
  },
  { ...imported('cornell-ithaca'), name: 'Cornell University', caption: 'Ithaca, New York',
    start: .90, arrival: .922, stop: .964, anchor: [.65, 0], tint: [1.025, 1.01, .985], saturation: 1.02 },
]

export const unit = (v: number) => Math.max(0, Math.min(1, v))
export const smooth = (v: number) => { const t = unit(v); return t * t * (3 - 2 * t) }
export function earthFrame(progress: number) {
  let to = 0
  for (let i = 1; i < EARTH_PLACES.length; i++) if (progress >= EARTH_PLACES[i].start) to = i
  const place = EARTH_PLACES[to]
  const mix = smooth((progress - place.start) / (place.arrival - place.start))
  return { from: Math.max(0, to - 1), to, mix, envelope: Math.sin(mix * Math.PI) }
}

export function earthPhotoPose(index: number, progress: number) {
  const place = EARTH_PLACES[index], next = EARTH_PLACES[index + 1]
  const hold = unit((progress - place.arrival) / ((next?.start ?? 1) - place.arrival))
  const enter = 1 - smooth((progress - place.start) / (place.arrival - place.start))
  const exit = next ? smooth((progress - next.start) / (next.arrival - next.start)) : 0
  const home = index === EARTH_PLACES.length - 1
  return { scale: (home ? 1.004 + hold * .008 : 1.025 + hold * .04) + enter * .17 + exit * .24, pan: (hold - .5) * (home ? .003 : .012) }
}
