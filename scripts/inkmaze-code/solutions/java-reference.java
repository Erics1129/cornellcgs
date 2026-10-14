import java.util.HashMap;

/*
 * Ink Maze level 26, the Java reference: a depth-first search over (ball,
 * colored blocks, ink left) that tries U, D, L, R in order, skips moves that do
 * not move the ball, stops a roll where the ink runs out, gives up on a line when
 * the ink left is less than the blocks still uncolored, and remembers every
 * (ball, colored) position it has searched with the most ink it had there, so a
 * position reached again with no more ink is not searched twice.
 * Not shipped: scripts/inkmaze-code/test-runtime-java.mjs runs it.
 */
class Solution {
    private static final char[] NAMES = {'U', 'D', 'L', 'R'};
    private static final int[] DR = {-1, 1, 0, 0};
    private static final int[] DC = {0, 0, -1, 1};

    private long full;
    private int[][] stop;       // [block][move] -> the block a full roll stops on
    private int[][][] rolled;   // [block][move] -> the floor bits rolled onto, in order
    private long[][] painted;   // [block][move] -> every bit a full roll colors
    private final HashMap<Long, Integer> best = new HashMap<>();
    private final StringBuilder path = new StringBuilder();

    public String solve(String[] grid, int ink) {
        int rows = grid.length, cols = grid[0].length(), cells = rows * cols;
        int[] bit = new int[cells];
        int floors = 0, start = 0;
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                char ch = grid[r].charAt(c);
                bit[r * cols + c] = ch == '#' ? -1 : floors++;
                if (ch == 'o') start = r * cols + c;
            }
        }
        full = floors == 64 ? -1L : (1L << floors) - 1;
        stop = new int[cells][4];
        rolled = new int[cells][4][];
        painted = new long[cells][4];
        for (int i = 0; i < cells; i++) {
            if (bit[i] < 0) continue;
            for (int d = 0; d < 4; d++) {
                int r = i / cols, c = i % cols, n = 0;
                int[] seen = new int[rows + cols];
                long mask = 0;
                while (true) {
                    int nr = r + DR[d], nc = c + DC[d];
                    if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || bit[nr * cols + nc] < 0) break;
                    r = nr;
                    c = nc;
                    seen[n++] = bit[r * cols + c];
                    mask |= 1L << bit[r * cols + c];
                }
                stop[i][d] = r * cols + c;
                rolled[i][d] = java.util.Arrays.copyOf(seen, n);
                painted[i][d] = mask;
            }
        }
        best.clear();
        path.setLength(0);
        return dfs(start, 1L << bit[start], ink) ? path.toString() : "";
    }

    private boolean dfs(int at, long colored, int ink) {
        if (colored == full) return true;
        if (ink < Long.bitCount(full & ~colored)) return false;
        Long key = colored * 64 + at;
        Integer seen = best.get(key);
        if (seen != null && seen >= ink) return false;
        best.put(key, ink);
        for (int d = 0; d < 4; d++) {
            int[] blocks = rolled[at][d];
            if (blocks.length == 0) continue; // a wall or the edge: the ball would not move
            path.append(NAMES[d]);
            if (ink >= blocks.length) {
                if (dfs(stop[at][d], colored | painted[at][d], ink - blocks.length)) return true;
            } else {
                // the ink runs out mid-roll: the ball stops after `ink` blocks
                long partial = colored;
                for (int k = 0; k < ink; k++) partial |= 1L << blocks[k];
                if (partial == full) return true;
            }
            path.setLength(path.length() - 1);
        }
        return false;
    }
}
