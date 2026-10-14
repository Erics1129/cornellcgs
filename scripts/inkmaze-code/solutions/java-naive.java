/*
 * Ink Maze level 26, the naive Java brute force: a plain depth-first search
 * that colors the board in place and undoes each roll, trying U, D, L, R, with
 * only one pruning rule (give up when the ink left is less than the blocks
 * still uncolored). No memo. Not shipped: scripts/inkmaze-code/test-runtime-java.mjs
 * runs it on a full submission to show a simple correct search is fast enough.
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
        if (ink < left) return -1;
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
