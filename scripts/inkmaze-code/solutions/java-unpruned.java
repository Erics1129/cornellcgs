/*
 * Ink Maze level 26, an UNPRUNED brute force in Java (tests only).
 *
 * java-naive.java without its one pruning rule: give up on a line only when the ink is
 * gone, never because the ink left is less than the blocks still uncolored.
 * No memo. Not shipped. It clears the visible map and the small hidden
 * boards (problem.ts PLAIN_SEARCH_BUDGET), but the larger hidden boards need
 * more than UNPRUNED_SEARCH_FLOOR calls in every move order, so a submission
 * must end in Time Limit Exceeded (scripts/test-inkmaze-code-flow.mjs checks it).
 */
class Solution {
    static final char[] MOVES = {'U', 'D', 'L', 'R'};
    static final int[] DR = {-1, 1, 0, 0};
    static final int[] DC = {0, 0, -1, 1};

    int rows, cols, left;
    char[][] board;
    char[] path = new char[64];
    int[] undoR = new int[64 * 12], undoC = new int[64 * 12];

    public String solve(String[] grid, int ink) {
        rows = grid.length;
        cols = grid[0].length();
        board = new char[rows][];
        int ballRow = 0, ballCol = 0;
        left = 0;
        for (int r = 0; r < rows; r++) {
            board[r] = grid[r].toCharArray();
            for (int c = 0; c < cols; c++) {
                if (board[r][c] == '.') left++;
                if (board[r][c] == 'o') { ballRow = r; ballCol = c; board[r][c] = '*'; }
            }
        }
        int n = dfs(ballRow, ballCol, ink, 0, 0);
        return n < 0 ? "" : new String(path, 0, n);
    }

    /** returns the length of a winning line, or -1 */
    int dfs(int r, int c, int ink, int depth, int undoTop) {
        if (left == 0) return depth;
        if (ink <= 0) return -1;
        for (int d = 0; d < 4; d++) {
            int nr = r + DR[d], nc = c + DC[d];
            if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || board[nr][nc] == '#') continue;
            int top = undoTop, spent = 0, er = r, ec = c;
            while (nr >= 0 && nc >= 0 && nr < rows && nc < cols && board[nr][nc] != '#' && spent < ink) {
                if (board[nr][nc] == '.') { board[nr][nc] = '*'; left--; undoR[top] = nr; undoC[top] = nc; top++; }
                spent++;
                er = nr;
                ec = nc;
                nr += DR[d];
                nc += DC[d];
            }
            path[depth] = MOVES[d];
            int found = dfs(er, ec, ink - spent, depth + 1, top);
            if (found >= 0) return found;
            for (int k = undoTop; k < top; k++) { board[undoR[k]][undoC[k]] = '.'; left++; }
        }
        return -1;
    }
}
