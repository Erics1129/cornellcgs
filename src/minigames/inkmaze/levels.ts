/**
 * Ink Maze: the levels, as text grids.
 *
 *   #  wall
 *   .  floor
 *   o  the ball's starting block (floor)
 *
 * Rows must be the same length; the board edge acts as a wall. To add a
 * level, append an entry with a fresh id, a name, a grid and the slack you
 * want (extra ink above the least possible), then run
 *
 *   npm run inkmaze:solve -- --write
 *
 * which searches for the least ink that clears each level (par) and writes
 * `par` and `ink` (= par + slack) back into this file. `npm test` fails if
 * any level cannot be cleared with its ink.
 *
 * All ten layouts are original: generated at random for this site, solved
 * exactly, and kept for how much planning they ask for.
 */
import type { Level } from './engine.ts'

export const LEVELS: Level[] = [
  {
    id: 'first-roll',
    name: 'First Roll',
    slack: 3,
    par: 12,
    ink: 15,
    grid: [
      'o...',
      '....',
      '.###',
      '....',
    ],
  },
  {
    id: 'doubling-back',
    name: 'Doubling Back',
    slack: 3,
    par: 16,
    ink: 19,
    grid: [
      '....',
      '#o..',
      '#.#.',
      '....',
    ],
  },
  {
    id: 'the-island',
    name: 'The Island',
    slack: 2,
    par: 22,
    ink: 24,
    grid: [
      '#....',
      '..##.',
      '..##.',
      '....o',
      '.....',
    ],
  },
  {
    id: 'side-door',
    name: 'Side Door',
    slack: 2,
    par: 26,
    ink: 28,
    grid: [
      '#..##',
      '..o..',
      '#..#.',
      '.....',
      '...#.',
    ],
  },
  {
    id: 'corner-pocket',
    name: 'Corner Pocket',
    slack: 1,
    par: 29,
    ink: 30,
    grid: [
      '#..#.',
      '...#.',
      '#.##.',
      '#.o..',
      '.....',
    ],
  },
  {
    id: 'workshop',
    name: 'Workshop',
    slack: 1,
    par: 40,
    ink: 41,
    grid: [
      '##...#',
      '#.o#..',
      '......',
      '...#..',
      '......',
      '.#....',
    ],
  },
  {
    id: 'two-rooms',
    name: 'Two Rooms',
    slack: 1,
    par: 39,
    ink: 40,
    grid: [
      '......',
      '.#o...',
      '.#.#..',
      '....##',
      '......',
      '.##...',
    ],
  },
  {
    id: 'long-way-round',
    name: 'Long Way Round',
    slack: 0,
    par: 43,
    ink: 43,
    grid: [
      '.#...#',
      '.#....',
      '...#..',
      'o..#..',
      '#.....',
      '...##.',
    ],
  },
  {
    id: 'the-cellar',
    name: 'The Cellar',
    slack: 0,
    par: 48,
    ink: 48,
    grid: [
      '.#...#.',
      '..#..#.',
      'o.#....',
      '.......',
      '...#...',
      '#.##...',
      '#.....#',
    ],
  },
  {
    id: 'last-drop',
    name: 'Last Drop',
    slack: 0,
    par: 63,
    ink: 63,
    grid: [
      '....#..',
      '...##..',
      '.o.....',
      '#...#..',
      '.....#.',
      '##....#',
      '....###',
    ],
  },
]
