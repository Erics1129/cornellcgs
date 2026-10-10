/**
 * Ink Maze: the art, in one list.
 *
 * Every image the game uses is named here and lives in public/assets/minigames/ink-maze/.
 * Replace a file with the same name to change the look; nothing else needs
 * to change. A file that is missing or fails to load is simply left out, and
 * the renderer draws that part with plain colors instead (see COLORS), so the
 * game is fully playable with no images at all.
 */

export const ART_BASE = '/assets/minigames/ink-maze/'

export const ART_FILES = {
  /** seamless tile: an uncolored floor block */
  floor: 'floor.png',
  /** a raised wall block */
  wall: 'wall.png',
  /** seamless tile: a colored floor block */
  ink: 'ink.png',
  /** the ball, on a transparent background */
  ball: 'ball.png',
  /** seamless tile: the wooden frame around the board */
  rim: 'rim.png',
  /** seamless tile: the table the board sits on */
  table: 'table.png',
  /** preview image for the link card (not used on the board) */
  cover: 'cover.png',
} as const

export type ArtName = keyof typeof ART_FILES
export type Art = Partial<Record<ArtName, HTMLImageElement>>

export const artUrl = (name: ArtName) => `${ART_BASE}${ART_FILES[name]}`

/** The plain-color look, used for any image that is not available. */
export const COLORS = {
  table: '#3b2416',
  tableGrain: '#2f1c11',
  rim: '#b98a52',
  rimShade: '#7f5a31',
  floor: '#e8cf9f',
  floorLine: '#d3b680',
  wall: '#8a5a33',
  wallTop: '#a46d40',
  wallShade: '#5e3a1f',
  ink: '#1f49c9',
  inkDeep: '#163596',
  ball: '#2b5fe8',
  ballShine: '#bcd3ff',
  ballShade: '#0d2a86',
} as const

/** The board's art (cover excluded). Resolves when every file has loaded or failed; never rejects. */
export function loadArt(names: readonly ArtName[] = ['floor', 'wall', 'ink', 'ball', 'rim', 'table']): Promise<Art> {
  return Promise.all(names.map((name) => new Promise<[ArtName, HTMLImageElement | undefined]>((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve([name, image.naturalWidth ? image : undefined])
    image.onerror = () => resolve([name, undefined])
    image.src = artUrl(name)
  }))).then((entries) => Object.fromEntries(entries.filter(([, image]) => image)) as Art)
}
