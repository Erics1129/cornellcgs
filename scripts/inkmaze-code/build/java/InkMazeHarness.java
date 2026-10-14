/*
 * Ink Maze level 26: the hidden Java harness (problem.ts H1-H6).
 *
 * Compiled ahead of time with a real javac (scripts/inkmaze-code/build/java/build.sh)
 * and handed to TeaVM as a class file next to the player's classes, so the
 * player's javac run never sees it (no name to call, nothing to extend) and it
 * may use TeaVM's @Import, which the player's code may not. It talks to the
 * runtime (public/minigames/ink-maze-code/java/runtime.js) only through the
 * private "inkHarness" imports, never through System.out, so a player who
 * replaces System.out / System.err cannot touch the answers.
 *
 *   H1  input(i) hands over the whole stdin before solve() runs; the player
 *       gets copies (fresh String objects in a fresh array) and nothing else.
 *   H2  per board: board(t), then new Solution().solve(grid, ink).
 *   H3  the returned string goes to answer(): its first answerChars + 2 UTF-16
 *       code units, then answerEnd(). The runtime escapes it exactly like
 *       problem.ts escapeAnswer() and prints '@@ANSWER@@ <moves>\n' itself,
 *       after the player's prints of that board. null is an empty answer.
 *   H4  an exception from solve(): fail(...) reports it and the harness stops
 *       (no answer for that board or any later one). Traps (null, bounds, / by
 *       zero), stack overflows, System.exit and the deadline are JavaScript
 *       exceptions: they never reach this code and the runtime reports them.
 *   H5  nothing is printed by the harness at all.
 *   H6  the runtime's clock covers every board together.
 *
 * Licensed like the rest of the Cornell CGS site's own code.
 */
import org.teavm.interop.Import;

public final class InkMazeHarness {
    /** the most of one answer the runtime needs (LIMITS.answerChars + 2: it cuts and escapes) */
    private static final int ANSWER_CHARS = 10002;

    private InkMazeHarness() {
    }

    public static void main(String[] args) {
        int length = inputLength();
        char[] input = new char[length > 0 ? length : 0];
        for (int i = 0; i < input.length; i++) {
            input[i] = (char) input(i);
        }
        int[] at = {0};
        int tests = number(input, at);
        // H1: every board is read before any player code runs
        String[][] grids = new String[tests][];
        int[] inks = new int[tests];
        for (int t = 0; t < tests; t++) {
            int rows = number(input, at);
            int cols = number(input, at);
            inks[t] = number(input, at);
            String[] grid = new String[rows];
            for (int r = 0; r < rows; r++) {
                skipSpace(input, at);
                grid[r] = new String(input, at[0], cols);
                at[0] += cols;
            }
            grids[t] = grid;
        }
        for (int t = 0; t < tests; t++) {
            String[] source = grids[t];
            String[] grid = new String[source.length];
            for (int r = 0; r < source.length; r++) {
                // a private copy per board: new String objects, not shared with the harness
                grid[r] = new String(source[r].toCharArray());
            }
            board(t);
            String moves;
            try {
                moves = new Solution().solve(grid, inks[t]);
            } catch (Throwable e) {
                fail(e);
                return;
            }
            if (moves != null) {
                int n = moves.length();
                if (n > ANSWER_CHARS) {
                    n = ANSWER_CHARS;
                }
                for (int i = 0; i < n; i++) {
                    answer(moves.charAt(i));
                }
            }
            answerEnd();
        }
        done(org.teavm.javac.guard.Guard.allocatedBytes());
    }

    /** H4: what the exception was, and where (the runtime keeps the player's frames) */
    private static void fail(Throwable e) {
        send(0, e.getClass().getName());
        String message;
        try {
            message = e.getMessage();
        } catch (Throwable inner) {
            message = null;
        }
        if (message != null) {
            send(1, message);
        }
        StackTraceElement[] stack;
        try {
            stack = e.getStackTrace();
        } catch (Throwable inner) {
            stack = null;
        }
        if (stack != null) {
            for (int i = 0; i < stack.length && i < 64; i++) {
                StackTraceElement frame = stack[i];
                if (frame == null) {
                    continue;
                }
                StringBuilder sb = new StringBuilder();
                sb.append(frame.getClassName()).append('\t').append(frame.getMethodName()).append('\t');
                String file = frame.getFileName();
                sb.append(file != null ? file : "").append('\t').append(frame.getLineNumber());
                send(2, sb.toString());
            }
        }
        failed();
    }

    private static void send(int kind, String text) {
        int n = text.length();
        if (n > 2000) {
            n = 2000;
        }
        for (int i = 0; i < n; i++) {
            failChar(text.charAt(i));
        }
        failEnd(kind);
    }

    private static void skipSpace(char[] input, int[] at) {
        while (at[0] < input.length && input[at[0]] <= ' ') {
            at[0]++;
        }
    }

    private static int number(char[] input, int[] at) {
        skipSpace(input, at);
        int value = 0;
        while (at[0] < input.length && input[at[0]] >= '0' && input[at[0]] <= '9') {
            value = value * 10 + (input[at[0]] - '0');
            at[0]++;
        }
        return value;
    }

    @Import(module = "inkHarness", name = "inputLength")
    private static native int inputLength();

    @Import(module = "inkHarness", name = "input")
    private static native int input(int index);

    @Import(module = "inkHarness", name = "board")
    private static native void board(int index);

    @Import(module = "inkHarness", name = "answer")
    private static native void answer(int code);

    @Import(module = "inkHarness", name = "answerEnd")
    private static native void answerEnd();

    @Import(module = "inkHarness", name = "failChar")
    private static native void failChar(int code);

    @Import(module = "inkHarness", name = "failEnd")
    private static native void failEnd(int kind);

    @Import(module = "inkHarness", name = "failed")
    private static native void failed();

    /** every board answered; how many bytes the program allocated (the runtime's footprint) */
    @Import(module = "inkHarness", name = "done")
    private static native void done(double allocatedBytes);
}
