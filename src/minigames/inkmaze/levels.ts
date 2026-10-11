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
 * All twenty layouts are original: generated at random for this site, solved
 * exactly, and kept for how much planning they ask for. Levels 11 to 20 come
 * from scripts/inkmaze-generate.mjs (seed 1, 1500 boards each of 7 x 7, 8 x 8
 * and 9 x 9, then --pick). The comment above each of them gives its board id;
 *
 *   node scripts/inkmaze-generate.mjs --board s1-7-0038
 *
 * prints that board and its numbers again.
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
  // s1-7-0038
  {
    id: 'the-attic',
    name: 'The Attic',
    slack: 2,
    par: 60,
    ink: 62,
    grid: [
      '...####',
      '##.#.#.',
      '.......',
      '.....#.',
      '##...#.',
      '.......',
      '.#o.#..',
    ],
  },
  // s1-7-1181
  {
    id: 'back-stairs',
    name: 'Back Stairs',
    slack: 2,
    par: 60,
    ink: 62,
    grid: [
      '.#.....',
      '..###..',
      '#o.....',
      '.......',
      '#..##.#',
      '......#',
      '...##..',
    ],
  },
  // s1-8-1030
  {
    id: 'closets',
    name: 'Closets',
    slack: 1,
    par: 74,
    ink: 75,
    grid: [
      '.#.#..#.',
      '.#.##.#.',
      '.#......',
      '......##',
      '....#..#',
      '.......#',
      '#...#.##',
      '..#..o.#',
    ],
  },
  // s1-8-0691
  {
    id: 'pillars',
    name: 'Pillars',
    slack: 1,
    par: 67,
    ink: 68,
    grid: [
      '###..#..',
      '...#...#',
      '...##...',
      '........',
      '..##..##',
      '..##..#.',
      'o....##.',
      '..#.....',
    ],
  },
  // s1-8-0413
  {
    id: 'one-way',
    name: 'One Way',
    slack: 1,
    par: 74,
    ink: 75,
    grid: [
      '......#.',
      '.##o..#.',
      '.#......',
      '..###..#',
      '#..#....',
      '...#.#..',
      '.##.....',
      '.#.....#',
    ],
  },
  // s1-8-1119
  {
    id: 'the-porch',
    name: 'The Porch',
    slack: 0,
    par: 67,
    ink: 67,
    grid: [
      '...#...#',
      'o.#..###',
      '.......#',
      '....#...',
      '#.###...',
      '..#..#..',
      '.#......',
      '#..#...#',
    ],
  },
  // s1-9-0502
  {
    id: 'top-floor',
    name: 'Top Floor',
    slack: 1,
    par: 89,
    ink: 90,
    grid: [
      '.#.......',
      '.####....',
      '.###..###',
      '.....#...',
      '#.#.#..##',
      '....#....',
      '..#.##...',
      'o.#.#....',
      '......#..',
    ],
  },
  // s1-9-1304
  {
    id: 'stalls',
    name: 'Stalls',
    slack: 0,
    par: 94,
    ink: 94,
    grid: [
      '..o..#.#.',
      '.........',
      '#..#.#.##',
      '.....#.##',
      '..##.#.##',
      '##.......',
      '.........',
      '.#.#.#.#.',
      '.....#...',
    ],
  },
  // s1-9-0912
  {
    id: 'courtyard',
    name: 'Courtyard',
    slack: 0,
    par: 92,
    ink: 92,
    grid: [
      '....#....',
      '.....o##.',
      '.##.#.##.',
      '###.....#',
      '.........',
      '.##......',
      '.#.#..#.#',
      '...#.....',
      '####..#..',
    ],
  },
  // s1-9-0476
  {
    id: 'dead-end',
    name: 'Dead End',
    slack: 0,
    par: 119,
    ink: 119,
    grid: [
      '....o#..#',
      '.#.#.....',
      '#........',
      '#....#..#',
      '#....##..',
      '#.....#..',
      '##.......',
      '#....##.#',
      '....#....',
    ],
  },
]
