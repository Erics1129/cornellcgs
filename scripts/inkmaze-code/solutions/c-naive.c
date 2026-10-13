/*
 * Ink Maze level 26, a naive solution in C (not shipped: tests only).
 *
 * The brute force a player is likely to write first: try U, D, L, R in
 * order, roll on the grid itself (coloring blocks, undoing them on the way
 * back), and give up on a line only when the ink left is less than the blocks
 * still uncolored. No memo. problem.ts promises the visible map and the small
 * hidden boards yield even to a search without that pruning within
 * PLAIN_SEARCH_BUDGET calls, and the larger hidden boards (7 x 7 to 8 x 8) to
 * one with it within PRUNED_SEARCH_BUDGET calls, in any move order.
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
  if (ink < floors - colored || depth >= 120) return 0;
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
