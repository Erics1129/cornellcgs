/**
 * Ink Maze: the coding level's place in the level list.
 *
 * No imports, so the game page can show the coding level's tile (and read
 * whether it was cleared) without loading the coding level itself. Its number
 * is always one past the last board level (LEVELS.length + 1), so it stays
 * right when levels are added.
 */
export const CODE_LEVEL = {
  /** the key its clear is saved under in progress.ts */
  id: 'code-paint-the-floor',
  /** problem.ts PROBLEM.title (scripts/test-inkmaze-code-page.mjs checks they match) */
  name: 'Paint the Floor',
} as const

/** ?level=code opens the coding level too, whatever its number */
export const CODE_LEVEL_PARAM = 'code'
