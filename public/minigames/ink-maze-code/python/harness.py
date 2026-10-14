# Ink Maze level 26 (Python): the hidden harness. Not shown to the player.
#
# It follows problem.ts H1-H6. stdin is problem.formatStdin(tests):
#   line 1: T          the number of boards
#   per board: "H W INK" then H rows of the grid
# _ink_parse(stdin) reads every board BEFORE the player's code runs (H1). Then,
# for each board, in order, _ink_harness builds a fresh private copy of the
# grid, makes a new Solution() and calls its solve(grid, ink), then prints
# exactly one line
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
#
# This file is compiled once, at startup, before any player code exists, and
# binds the builtins it uses to private names here, so a player who replaces
# builtins.int / ord / chr / isinstance ... changes nothing the harness reads or
# writes (the driver also restores builtins before every run).

ANSWER_MARKER = '@@ANSWER@@'
_ANSWER_CHARS_DEFAULT = 10000

_int, _ord, _chr, _isinstance, _type, _str, _range, _enumerate, _list, _tuple = int, ord, chr, isinstance, type, str, range, enumerate, list, tuple
_TypeError = TypeError
_join = ''.join


def escape_answer(moves, max_units=_ANSWER_CHARS_DEFAULT):
    """problem.ts escapeAnswer, matched exactly (UTF-16 code-unit semantics):
    U+0000-U+001F -> U+2400-U+241F, U+007F -> U+2421, '@' -> U+FF20, lone
    surrogates / invalid code points -> U+FFFD, cut to max_units UTF-16 units."""
    out = []
    units = 0
    for ch in moves:
        if units >= max_units:
            break
        code = _ord(ch)
        if code < 0x20:
            piece = _chr(0x2400 + code)
        elif code == 0x7F:
            piece = '␡'
        elif code == 0x40:
            piece = '＠'
        elif 0xD800 <= code <= 0xDFFF:
            piece = '�'
        else:
            piece = ch
        w = 2 if _ord(piece) > 0xFFFF else 1   # problem.ts counts UTF-16 code units
        if units + w > max_units:
            break
        out.append(piece)
        units += w
    return _join(out)


def _ink_parse(stdin_text):
    """H1: every board, read before any player code runs, as (rows, ink) with
    rows an immutable tuple the player never sees."""
    data = stdin_text.split('\n')
    tests = _int(data[0])
    boards = []
    at = 1
    for _ in _range(tests):
        h, w, ink = (_int(x) for x in data[at].split())
        boards.append((_tuple(data[at + 1 + y][:w] for y in _range(h)), ink))
        at += 1 + h
    return boards


def _ink_harness(solution_class, boards, write, progress, answer_chars=_ANSWER_CHARS_DEFAULT):
    for i, (rows, ink) in _enumerate(boards):
        progress[0] = i                       # the board index, for error reporting (H4)
        grid = _list(rows)                    # a fresh, private copy of the grid (H2)
        solution = solution_class()           # a new Solution per board (H2)
        moves = solution.solve(grid, ink)      # the player's code
        if moves is None:                      # H3: None prints an empty answer
            moves = ''
        elif _type(moves) is not _str:         # H3: any other non-string (or str subclass) is a TypeError
            if _isinstance(moves, _str):
                moves = _str.__str__(moves)    # a str subclass: its plain string value, no player __iter__/__str__
            else:
                raise _TypeError('solve() must return a string, not ' + _type(moves).__name__)
        write(ANSWER_MARKER + ' ' + escape_answer(moves, answer_chars) + '\n')
