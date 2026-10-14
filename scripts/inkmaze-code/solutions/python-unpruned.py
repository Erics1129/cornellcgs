# Ink Maze level 26, an UNPRUNED brute force in Python (tests only).
#
# python-naive.py without its one pruning rule: give up on a line only when the ink is
# gone, never because the ink left is less than the blocks still uncolored.
# No memo. Not shipped. It clears the visible map and the small hidden
# boards (problem.ts PLAIN_SEARCH_BUDGET), but the larger hidden boards need
# more than UNPRUNED_SEARCH_FLOOR calls in every move order, so a submission
# must end in Time Limit Exceeded (scripts/test-inkmaze-code-flow.mjs checks it).
class Solution:
    def solve(self, grid: list[str], ink: int) -> str:
        H, W = len(grid), len(grid[0])
        wall = [[grid[r][c] == '#' for c in range(W)] for r in range(H)]
        start = next((r, c) for r in range(H) for c in range(W) if grid[r][c] == 'o')
        floors = sum(not wall[r][c] for r in range(H) for c in range(W))
        colored = [[not wall[r][c] and False for c in range(W)] for r in range(H)]
        colored[start[0]][start[1]] = True
        DIRS = (('U', -1, 0), ('D', 1, 0), ('L', 0, -1), ('R', 0, 1))
        moves = []

        def dfs(r, c, count, left):
            if count == floors:
                return True
            if left <= 0:
                return False
            for letter, dr, dc in DIRS:
                nr, nc = r + dr, c + dc
                if nr < 0 or nc < 0 or nr >= H or nc >= W or wall[nr][nc]:
                    continue            # a move that does not move the ball
                painted = []
                spent = 0
                er, ec = r, c
                while 0 <= nr < H and 0 <= nc < W and not wall[nr][nc] and spent < left:
                    if not colored[nr][nc]:
                        colored[nr][nc] = True
                        painted.append((nr, nc))
                    spent += 1
                    er, ec = nr, nc
                    nr += dr
                    nc += dc
                moves.append(letter)
                if dfs(er, ec, count + len(painted), left - spent):
                    return True
                moves.pop()
                for (pr, pc) in painted:
                    colored[pr][pc] = False
            return False

        return ''.join(moves) if dfs(start[0], start[1], 1, ink) else ''
