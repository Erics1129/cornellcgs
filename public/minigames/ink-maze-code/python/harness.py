# Ink Maze level 26 (Python): the hidden harness. Not shown to the player.
#
# It follows problem.ts H1-H6. stdin is problem.formatStdin(tests):
#   line 1: T          the number of boards
#   per board: "H W INK" then H rows of the grid
# For each board, in order, it builds a fresh private copy of the grid, makes a
# new Solution() and calls its solve(grid, ink), then prints exactly one line
#   @@ANSWER@@ <moves>
# where <moves> is escape_answer(returned). The page (problem.parseStdout) reads
# the answer after the last marker on the line; escape_answer keeps '@', line
# breaks and every control character out of the answer, so a player's own prints
# can never forge or cut an answer line.
#
# Everything here runs under the driver (driver.py), which compiles the player's
# code alone as solution.py (so error lines are the player's), restores the
# interpreter between runs and enforces the cooperative deadline. The harness
# only drives the player's function and formats answers.

ANSWER_MARKER = '@@ANSWER@@'
_ANSWER_CHARS_DEFAULT = 10000


def _utf16_len(ch):
    # problem.ts counts answer length in UTF-16 code units (JS string length).
    return 2 if ord(ch) > 0xFFFF else 1


def escape_answer(moves, max_units=_ANSWER_CHARS_DEFAULT):
    """problem.ts escapeAnswer, matched exactly (UTF-16 code-unit semantics):
    U+0000-U+001F -> U+2400-U+241F, U+007F -> U+2421, '@' -> U+FF20, lone
    surrogates / invalid code points -> U+FFFD, cut to max_units UTF-16 units."""
    out = []
    units = 0
    for ch in moves:
        if units >= max_units:
            break
        code = ord(ch)
        if code < 0x20:
            piece = chr(0x2400 + code)
        elif code == 0x7F:
            piece = '␡'
        elif code == 0x40:
            piece = '＠'
        elif 0xD800 <= code <= 0xDFFF:
            piece = '�'
        else:
            piece = ch
        w = _utf16_len(piece)
        if units + w > max_units:
            break
        out.append(piece)
        units += w
    return ''.join(out)


def _ink_harness(solution_class, stdin_text, write, progress, answer_chars=_ANSWER_CHARS_DEFAULT):
    # H1: read every board before any player code runs on it.
    data = stdin_text.split('\n')
    tests = int(data[0])
    boards = []
    at = 1
    for _ in range(tests):
        h, w, ink = (int(x) for x in data[at].split())
        # a fresh, private copy of the grid (H2); trim each row to width
        grid = [data[at + 1 + y][:w] for y in range(h)]
        boards.append((grid, ink))
        at += 1 + h

    for i, (grid, ink) in enumerate(boards):
        progress[0] = i                       # the board index, for error reporting (H4)
        solution = solution_class()           # a new Solution per board (H2)
        moves = solution.solve(grid, ink)      # the player's code
        if moves is None:                      # H3: None prints an empty answer
            moves = ''
        elif not isinstance(moves, str):       # H3: any other non-string is a TypeError
            raise TypeError('solve() must return a string, not ' + type(moves).__name__)
        write(ANSWER_MARKER + ' ' + escape_answer(moves, answer_chars) + '\n')
