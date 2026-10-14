/*
 * Ink Maze level 26: the hidden C harness (problem.ts H1-H6). Compiled on its
 * own and linked with the player's solution.o by
 * src/minigames/inkmaze/code/runtimes/c.ts.
 *
 *   H1 every board is read from stdin before solve() runs (ink-harness.h)
 *   H2 per board, a fresh private copy: `rows` malloc'd NUL-terminated rows
 *   H3 after solve() returns: flush the player's prints, then one answer line
 *      (ink.answer escapes it and prints "@@ANSWER@@ <moves>\n")
 *   H4 a fault, trap or exit inside solve() stops the program (c.ts reports it)
 *   H5 nothing else is printed
 */
#include <stdio.h>
#include <stdlib.h>

#include "ink-harness.h"

char *solve(char **grid, int rows, int cols, int ink);

int main(void) {
  __ink_read_input();
  for (int32_t t = 0; t < __ink_count; t++) {
    const __ink_board_t *b = __ink_board(t);
    char **grid = (char **)malloc(sizeof(char *) * (size_t)(b->rows + 1));
    for (int32_t r = 0; r < b->rows; r++) {
      char *row = (char *)malloc((size_t)b->cols + 1);
      const char *from = __ink_input + b->at + (uint32_t)r * (uint32_t)(b->cols + 1);
      for (int32_t c = 0; c < b->cols; c++) row[c] = from[c];
      row[b->cols] = '\0';
      grid[r] = row;
    }
    grid[b->rows] = NULL;
    __ink_phase(INK_PHASE_SOLVE, t);
    char *moves = solve(grid, b->rows, b->cols, b->ink);
    __ink_phase(INK_PHASE_AFTER, t);
    fflush(stdout);
    __ink_answer(t, moves, -1);
  }
  __ink_phase(INK_PHASE_DONE, __ink_count);
  return 0;
}
