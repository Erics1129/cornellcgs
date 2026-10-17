/**
 * Shared wording: the names and messages that more than one surface (entry page, HUD, menus) or module shows, so every place says
 * the same thing. Surface-only text stays in its component. The voice rules and the vocabulary are in docs/carrot-defense/glass-ui.md
 * (section "Copy"); this UI pass also has a per-string table (COPY.md) handed to each surface.
 *
 * Voice: say what it is or what it does, in the player's words. No hype, no drama, no filler, no exclamation marks, no em or en
 * dashes (use a colon, a comma, a period or " · " between facts). Sentence case in the source; CSS uppercases 11 px overlines.
 * Apostrophes are typographic (’), as in the rest of the UI.
 * One name per thing: tower (not plant or defense), creature (not enemy, foe, mob or minion), guardian (a stage's boss), miniboss,
 * clearing (where a tower goes), stage (not level or landscape).
 */

/** Screens and the buttons that open them. CarrotPage's click-sound rule and the QA scripts match some of these. */
export const names = {
 stageSelect: 'Stage select',       // the screen, its title, and the full-size button that opens it
 stages: 'Stages',                  // the same, as a compact button (results)
 challenges: 'Boss challenges',     // the challenge list, and the full-size button
 challengesShort: 'Challenges',     // compact button, chapter tab
 fieldGuide: 'Field guide',
 howToPlay: 'How to play',
 settings: 'Settings',
 allGames: 'All games',
} as const

/** Verbs on buttons. */
export const actions = {
 play: 'Play', continue: 'Continue', startWave: 'Start wave', startFight: 'Start fight', sendNow: 'Send now',
 pause: 'Pause', resume: 'Resume', retry: 'Retry', playAgain: 'Play again', nextStage: 'Next stage', tryAgain: 'Try again',
 back: 'Back', close: 'Close', gotIt: 'Got it', dismiss: 'Dismiss', undo: 'Undo', skipTutorial: 'Skip tutorial',
 build: 'Build', upgrade: 'Upgrade', merge: 'Merge', sell: 'Sell', restart: 'Restart', keepPlaying: 'Keep playing',
} as const

/** Errors (unity.ts, CarrotPage, Loading). Each says what failed and what to do. */
export const errors = {
 gameData: 'Couldn’t load the game data. Try again.',
 start: 'The game couldn’t start. Try again.',
 download: 'The game didn’t download. Check your connection and try again.',
} as const

/** Loading screen. */
export const loading = {
 stage: 'Loading stage',
 challenge: 'Loading boss challenge',
 failed: 'Loading failed',
 failedTitle: 'The game didn’t load',
 bar: 'Loading',
 preparing: 'Preparing',
} as const

/** Shown where a record is empty (fastest time, best chain). Visually a muted dot; this is the accessible name. */
export const noneYet = 'None yet'

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 22nd... */
export function ordinal(n: number): string {
 const k = Math.abs(Math.trunc(n)), t = k % 100
 if (t >= 11 && t <= 13) return `${n}th`
 return `${n}${['th', 'st', 'nd', 'rd'][k % 10] || 'th'}`
}

/** "1 creature", "3 creatures" (pass the plural when it is not just +s). */
export function count(n: number, one: string, many = `${one}s`): string {
 return `${n} ${n === 1 ? one : many}`
}
