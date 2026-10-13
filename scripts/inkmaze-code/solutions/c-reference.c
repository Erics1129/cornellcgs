/*
 * Ink Maze level 26, reference solution in C (not shipped: tests only).
 *
 * A depth-first search over (ball, colored blocks, ink left). Rolls are
 * precomputed per floor block and direction, the ink pruning drops a line
 * when the ink left is less than the blocks still uncolored, and a memo
 * remembers the most ink seen at each (ball, colored) so a position reached
 * again with no more ink is skipped. Floors are numbered, so the colored
 * blocks fit in one 64-bit mask (boards are at most 6 x 6 here).
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define MAX_FLOOR 64
#define MAX_MOVES 128

static const char LETTER[4] = {'U', 'D', 'L', 'R'};
static const int DR[4] = {-1, 1, 0, 0};
static const int DC[4] = {0, 0, -1, 1};

static int roll_length[MAX_FLOOR][4];               /* blocks a full roll passes */
static int roll_stop[MAX_FLOOR][4][MAX_FLOOR + 1];   /* the floor the ball is on after k blocks */
static uint64_t roll_paint[MAX_FLOOR][4][MAX_FLOOR + 1]; /* the blocks colored by those k blocks */
static uint64_t all_floor;
static char path[MAX_MOVES];

typedef struct { uint64_t mask; int ball; int ink; } Seen; /* ink < 0: an empty slot */
static Seen *seen;
static size_t seen_cap, seen_used;

static Seen *lookup(uint64_t mask, int ball) {
  uint64_t h = (mask ^ ((uint64_t)ball * 0x9E3779B97F4A7C15ull)) * 0xBF58476D1CE4E5B9ull;
  size_t i = (size_t)(h ^ (h >> 31)) & (seen_cap - 1);
  while (seen[i].ink >= 0 && (seen[i].mask != mask || seen[i].ball != ball)) i = (i + 1) & (seen_cap - 1);
  return &seen[i];
}

static void grow(void) {
  Seen *old = seen;
  size_t old_cap = seen_cap;
  seen_cap *= 2;
  seen = (Seen *)malloc(seen_cap * sizeof(Seen));
  for (size_t i = 0; i < seen_cap; i++) seen[i].ink = -1;
  for (size_t i = 0; i < old_cap; i++)
    if (old[i].ink >= 0) *lookup(old[i].mask, old[i].ball) = old[i];
  free(old);
}

static int search(int ball, uint64_t mask, int ink, int depth) {
  if (mask == all_floor) { path[depth] = '\0'; return 1; }
  if (ink < __builtin_popcountll(all_floor & ~mask) || depth + 1 >= MAX_MOVES) return 0;
  Seen *s = lookup(mask, ball);
  if (s->ink >= ink) return 0;
  if (s->ink < 0) {
    s->mask = mask; s->ball = ball; s->ink = ink;
    if (++seen_used * 2 > seen_cap) grow();
  } else {
    s->ink = ink;
  }
  for (int d = 0; d < 4; d++) {
    int n = roll_length[ball][d];
    if (n == 0) continue;            /* this move would not move the ball */
    int k = n < ink ? n : ink;       /* the ink can run out in the middle of a roll */
    path[depth] = LETTER[d];
    if (search(roll_stop[ball][d][k], mask | roll_paint[ball][d][k], ink - k, depth + 1)) return 1;
  }
  return 0;
}

char *solve(char **grid, int rows, int cols, int ink) {
  int *id = (int *)malloc(sizeof(int) * (size_t)(rows * cols));
  int floors = 0, start = 0;
  for (int r = 0; r < rows; r++)
    for (int c = 0; c < cols; c++) {
      id[r * cols + c] = grid[r][c] == '#' ? -1 : floors++;
      if (grid[r][c] == 'o') start = id[r * cols + c];
    }
  if (floors > MAX_FLOOR) { free(id); return ""; }
  all_floor = floors == 64 ? ~0ull : (1ull << floors) - 1;
  for (int r = 0; r < rows; r++)
    for (int c = 0; c < cols; c++) {
      int f = id[r * cols + c];
      if (f < 0) continue;
      for (int d = 0; d < 4; d++) {
        int rr = r, cc = c, k = 0;
        uint64_t painted = 0;
        for (;;) {
          int nr = rr + DR[d], nc = cc + DC[d];
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || id[nr * cols + nc] < 0) break;
          rr = nr; cc = nc; k++;
          painted |= 1ull << id[rr * cols + cc];
          roll_stop[f][d][k] = id[rr * cols + cc];
          roll_paint[f][d][k] = painted;
        }
        roll_length[f][d] = k;
      }
    }
  free(id);
  seen_cap = 1 << 12;
  seen_used = 0;
  seen = (Seen *)malloc(seen_cap * sizeof(Seen));
  for (size_t i = 0; i < seen_cap; i++) seen[i].ink = -1;
  int found = search(start, 1ull << start, ink, 0);
  free(seen);
  if (!found) path[0] = '\0';
  char *moves = (char *)malloc(strlen(path) + 1);
  strcpy(moves, path);
  return moves;
}
