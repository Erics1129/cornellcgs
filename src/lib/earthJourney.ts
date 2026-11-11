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

/** Only the destination (the last stop) has a name and caption; the stops on
 * the way show the photo alone. These same stops drive captions, keyboard
 * navigation, fallback photos and GPU motion.
 *
 * Timing is in fractions of the chapter's run, which is 560svh long (a 660svh
 * runway, --run-world in deck.css). It is set so that a reader can see every
 * picture: each photograph holds still for at least 30svh of scroll between
 * its dissolves, and the last frame, with every credit, for 71svh.
 *   intro (globe and words) 0 → .22, words fade .22 → .30, globe into the first photo .30 → .37
 *   each photo: start → arrival is its dissolve in, arrival → next start is its hold */
export const EARTH_PLACES: EarthPlace[] = [
  {
    id: 'bali', name: '', caption: '',
    image: 'bali-jatiluwih.webp', width: 1920, height: 1152,
    alt: 'Green rice terraces curve across a hillside, with tiled shelters and coconut palms.',
    photographer: 'Jorge Franganillo', license: 'CC BY 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Bali-_Jatiluwih_rice_terraces_-_50281829296.jpg',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
    start: .30, arrival: .37, stop: .40, anchor: [.57, .52], tint: [1.015, 1.025, .965], saturation: 1.07,
  },
  {
    id: 'hawaii', name: '', caption: '',
    image: 'hawaii-na-pali.webp', width: 1920, height: 1282,
    alt: 'Deeply folded green cliffs of the Nā Pali Coast fall into the Pacific Ocean on Kauaʻi, Hawaiʻi.',
    photographer: 'Andrew Baerst', license: 'CC BY 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Na_Pali_Coast_(28915675361).jpg',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
    start: .43, arrival: .475, stop: .505, anchor: [.52, .50], tint: [.96, 1.025, 1.04], saturation: 1.06,
  },
  { ...imported('dolomites'), name: '', caption: '',
    start: .533, arrival: .577, stop: .606, anchor: [.50, .20], tint: [1.045, 1.005, .965], saturation: 1.03 },
  { ...imported('iceland'), name: '', caption: '',
    start: .635, arrival: .677, stop: .706, anchor: [.65, .50], tint: [.95, 1.015, 1.055], saturation: .91 },
  {
    id: 'new-york', name: '', caption: '',
    image: 'liberty-island.webp', width: 1920, height: 1253,
    alt: 'The Statue of Liberty and its stone pedestal rise above Liberty Island, seen across New York Harbor.',
    photographer: 'National Park Service', license: 'Public domain',
    source: 'https://npgallery.nps.gov/AssetDetail/3454fd91-1dd8-b71b-0b21-a93398840c35', licenseUrl: '',
    start: .735, arrival: .775, stop: .804, anchor: [.48, .45], tint: [1.015, 1.0, .98], saturation: .98,
  },
  { ...imported('cornell-ithaca'), name: 'Cornell University', caption: 'Ithaca, New York',
    start: .833, arrival: .873, stop: .93, anchor: [.65, 0], tint: [1.025, 1.01, .985], saturation: 1.02 },
]

/** The opening: the title and lead fade out over this slice of the run (the strip of words above them stays). */
export const EARTH_INTRO = { fadeFrom: .22, fadeTo: .30 } as const

/**
 * Where the picture is between two compositions. One table, used by the
 * section (DOM) and by the travel canvas (GPU): at rest inside any of these
 * the deck settles on the nearer end, so a stop never shows a double exposure.
 */
export const EARTH_REST_GAPS: [number, number][] = [
  [EARTH_INTRO.fadeFrom, EARTH_INTRO.fadeTo],
  ...EARTH_PLACES.map((place): [number, number] => [place.start, place.arrival]),
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

// lqip:start (generated by scripts/cinema/lqip.mjs; do not edit by hand)
export const EARTH_LQIP: Record<string, string> = {
  'bali-jatiluwih.webp': 'data:image/webp;base64,UklGRrwCAABXRUJQVlA4WAoAAAAwAAAALwAAHAAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZBTFBIJAAAAAEXoBBAAMTfudGIiBhgJmASaGYJaEbl3Z4R/Z+ABs6C9zcNHFZQOCCiAAAA0AUAnQEqMAAdAD7RXKZNqCUjojAVWAEAGglkAMvgLmcTTrlzX0nQf2TI/SWAlApLWHs28zKvHAD+8AFE5Udn5Ou+iduLS/fmqmflS5NPld7Jop7iRUBOymj5cKfu7ROGBPLSnC2ZKQGK0XlbmC4phaqOoEAb+zneWc3c8PET931SysyZBTsqrCCuW8uNhSNGoOzrpBJVvekWuI/keCf0AAAA',
  'hawaii-na-pali.webp': 'data:image/webp;base64,UklGRgQDAABXRUJQVlA4WAoAAAAwAAAALwAAHwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZBTFBIJAAAAAEXoBBAAMTfudGIiBhgJmASaGYJaEbl3Z4R/Z+ABs6C91sNHFZQOCDqAAAAUAgAnQEqMAAgAD7JTJ9Lp6QiobVYDADwGQloAJ0yhIPnunG9WTTyHYXJH30UMkRF079S9I7hmwN/7+aWIxcMsL1Wu0V3vMSiRtLAAPyPSEBuW/GOH9VPWlQRFH1aQVl3UE/9meSGH+gj0xDTd9bhPT8fyS0DeADmVSoVr4m3aVGnhkNvXOUd6a+hLK+hEufEcy/TaKDZy0hmDWOE5V9P7SCWcepF2d2rUs5hRNMyC7ixV+vL0ysy9OPgi4l+iWLgA7k32KWVmQ6rP4rZNgsqDcdCI9Txd1+z9kFNYjlZkiSGHC7nO/U86SAA',
  'liberty-island.webp': 'data:image/webp;base64,UklGRqwCAABXRUJQVlA4WAoAAAAwAAAALwAAHgAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZBTFBIJAAAAAEXoBBAAMTfudGIiBhgJmASaGYJaEbl3Z4R/Z+ABs6C908NHFZQOCCSAAAAUAUAnQEqMAAfAD7FTqBLp7+jJTVb+APwGIlAFcntGSJGbeEeMwtMeSY01LNTO31qWG6gAPv3/XaH0kv0f6k81gf/QrlVp2ohCD5cQXfjmIYzjDRvWH38o1VMTdDjq4Xpa+9UhFY614ggEFx8f4K6gSMEJy8dzPEWki/JgM4HVsfSjW1IyEHmLHpMGeX1v8YAAAA=',
  'dolomites.webp': 'data:image/webp;base64,UklGRgoDAABXRUJQVlA4WAoAAAAwAAAALwAAHwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZBTFBIJAAAAAEXoBBAAMTfudGIiBhgJmASaGYJaEbl3Z4R/Z+ABs6C91sNHFZQOCDwAAAAUAgAnQEqMAAgAD7RUKRLqCSjobAVXVEAGglsAJ0zbT43QDkoaw5IQGRoUye4VLKhwgod5rIO9RbHasYMlmaMBSAze6n37Hm5RdMAAP3dQxt+79xXVY3nt4j0kf/C8J0IFI51pM2fmndk0LzKch9a1K1Lvz8DjxxxnJax99y7PmCg+Th3ZXrTFLxkBiYfAmOGWU2427Y3Ks5Dois2Ik63s3Fu67aXUYtZMO4frQPitr0eGoep1ggdeVL/0vp2VMut0gVErjg9rKILireGX9+kl1OKl2eN3sfEu5Bhlu94v4T4MJB6Sd3/0Nau4almAAAA',
  'iceland.webp': 'data:image/webp;base64,UklGRrACAABXRUJQVlA4WAoAAAAwAAAALwAAGQAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZBTFBIJAAAAAEXoBBAAMTfudGIiBhgJmASaGYJaEbl3Z4R/Z+ABs6C9xMNHFZQOCCWAAAAsAYAnQEqMAAaAD7FUqBLp6SjIbVb+ADwGIljANBUIV7z6FVrC0yPm6Lu4SHhkf0JFeWPiHuoVPOwJZSRkAAA/up6oo9ke6htBNu5AbrUegcB8E3UpqGZAfdr0WxpzdRGYHhZU2Xs5PWTEDbXMQ46mCQbS96Yq3p5hBBK4NZs0iIrACVW+6MPmhvYMK37/wOHWLPb4AAA',
  'cornell-ithaca.webp': 'data:image/webp;base64,UklGRtACAABXRUJQVlA4WAoAAAAwAAAALwAAHwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZBTFBIJAAAAAEXoBBAAMTfudGIiBhgJmASaGYJaEbl3Z4R/Z+ABs6C91sNHFZQOCC2AAAAcAYAnQEqMAAgAD7NVp9Lp6SiobAKqPAZiWwArlWNvV/mfFQFAWbYfIcACLuqW0Ux0F1LInl4rSaUrhuAANZ5YeGr97/bV/43jArXdGNmNku6NZJXx2rh3v53323doNiv1tGRefSLaC4dsbyZMZNWB4P64pR4UDUF7aQu7sUDMP3pllkLd4IhQpbyy8R/7q2QTGodDginNMcumAH/hvMHsJ46MGiSsLmvQ2mQWIKMhEc8xtu1cAA=',
}
// lqip:end
