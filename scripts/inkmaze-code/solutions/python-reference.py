# Ink Maze level 26 (Python) REFERENCE solution. Not shipped in the sandbox
# bundle; used by scripts/inkmaze-code/test-runtime-python.mjs and as the
# worked answer. Memoized depth-first search over (ball position, colored-block
# bitmask, ink left), trying U, D, L, R in order. This is roughly the answer a
# strong player writes; it clears every hidden test well inside the limit.
class Solution:
    def solve(self, grid: list[str], ink: int) -> str:
        H, W = len(grid), len(grid[0])
        index = {}                      # (row, col) -> bit number of that floor block
        start = 0
        for r in range(H):
            for c in range(W):
                if grid[r][c] != '#':
                    if grid[r][c] == 'o':
                        start = len(index)
                    index[(r, c)] = len(index)
        n = len(index)
        full = (1 << n) - 1
        # rolls[b] = the moves that move the ball off block b, each as
        #   (letter, end block, cost, prefix) where prefix[k] = mask after k+1 blocks
        rolls = [None] * n
        for (r, c), b in index.items():
            options = []
            for letter, dr, dc in (('U', -1, 0), ('D', 1, 0), ('L', 0, -1), ('R', 0, 1)):
                prefix, m = [], 0
                rr, cc = r + dr, c + dc
                end = b
                while (rr, cc) in index:
                    end = index[(rr, cc)]
                    m |= 1 << end
                    prefix.append(m)
                    rr, cc = rr + dr, cc + dc
                if prefix:              # skip moves that do not move the ball
                    options.append((letter, end, len(prefix), prefix))
            rolls[b] = options

        best = {}                       # (mask, position) -> most ink left seen
        moves = []

        def dfs(pos, mask, left):
            if mask == full:
                return True
            if left < n - bin(mask).count('1'):   # every uncolored block needs 1 more ink
                return False
            key = (mask << 6) | pos
            if best.get(key, -1) >= left:
                return False
            best[key] = left
            for letter, end, cost, prefix in rolls[pos]:
                if cost <= left:
                    moves.append(letter)
                    if dfs(end, mask | prefix[-1], left - cost):
                        return True
                    moves.pop()
                elif mask | prefix[left - 1] == full:   # ink runs out mid-roll, on the last block
                    moves.append(letter)
                    return True
            return False

        return ''.join(moves) if dfs(start, 1 << start, ink) else ''
