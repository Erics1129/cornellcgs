/*
 * Ink Maze level 26, an UNPRUNED brute force in C (tests only).
 *
 * c-naive.c without its one pruning rule: give up on a line only when the ink is
 * gone, never because the ink left is less than the blocks still uncolored.
 * No memo. Not shipped. It clears the visible map and the small hidden
 * boards (problem.ts PLAIN_SEARCH_BUDGET), but the larger hidden boards need
 * more than UNPRUNED_SEARCH_FLOOR calls in every move order, so a submission
 * must end in Time Limit Exceeded (scripts/test-inkmaze-code-flow.mjs checks it).
 */
#include <stdlib.h>
#include <string.h>

static const char LETTER[4] = {'U', 'D', 'L', 'R'};
static const int DR[4] = {-1, 1, 0, 0};
static const int DC[4] = {0, 0, -1, 1};

static char **board;
static int R, C, floors, colored;
static char painted[16][16];
static char moves[128];

static int dfs(int r, int c, int ink, int depth) {
  if (colored == floors) { moves[depth] = '\0'; return 1; }
  if (ink <= 0 || depth >= 120) return 0;
  for (int d = 0; d < 4; d++) {
    int nr = r + DR[d], nc = c + DC[d];
    if (nr < 0 || nc < 0 || nr >= R || nc >= C || board[nr][nc] == '#') continue;
    int newly[16], count = 0, spent = 0, er = r, ec = c;
    while (nr >= 0 && nc >= 0 && nr < R && nc < C && board[nr][nc] != '#' && spent < ink) {
      if (!painted[nr][nc]) { painted[nr][nc] = 1; colored++; newly[count++] = nr * 16 + nc; }
      spent++;
      er = nr; ec = nc;
      nr += DR[d]; nc += DC[d];
    }
    moves[depth] = LETTER[d];
    if (dfs(er, ec, ink - spent, depth + 1)) return 1;
    for (int i = 0; i < count; i++) painted[newly[i] / 16][newly[i] % 16] = 0;
    colored -= count;
  }
  return 0;
}

char *solve(char **grid, int rows, int cols, int ink) {
  board = grid; R = rows; C = cols; floors = 0; colored = 0;
  int br = 0, bc = 0;
  memset(painted, 0, sizeof painted);
  for (int r = 0; r < rows; r++)
    for (int c = 0; c < cols; c++) {
      if (grid[r][c] != '#') floors++;
      if (grid[r][c] == 'o') { br = r; bc = c; painted[r][c] = 1; colored = 1; }
    }
  if (!dfs(br, bc, ink, 0)) moves[0] = '\0';
  return moves;
}
