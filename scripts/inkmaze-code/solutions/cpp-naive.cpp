// Ink Maze level 26, a naive solution in C++ (not shipped: tests only).
//
// The first brute force a player writes: try U, D, L, R, roll on a copy of
// the grid ('*' marks colored blocks), undo on the way back, and give up on a
// line only when the ink left is less than the blocks still uncolored. No memo:
// that pruning is what the larger hidden boards (7 x 7 to 8 x 8) need.
#include <string>
#include <vector>
using namespace std;

class Solution {
    vector<string> g;
    int rows = 0, cols = 0, floors = 0, colored = 0;
    string moves;

    bool dfs(int r, int c, int ink) {
        if (colored == floors) return true;
        if (ink < floors - colored) return false;
        const string LETTER = "UDLR";
        const int DR[4] = {-1, 1, 0, 0}, DC[4] = {0, 0, -1, 1};
        for (int d = 0; d < 4; d++) {
            int nr = r + DR[d], nc = c + DC[d];
            if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || g[nr][nc] == '#') continue;
            vector<pair<int, int>> newly;
            int spent = 0, er = r, ec = c;
            while (nr >= 0 && nc >= 0 && nr < rows && nc < cols && g[nr][nc] != '#' && spent < ink) {
                if (g[nr][nc] != '*') { g[nr][nc] = '*'; colored++; newly.push_back({nr, nc}); }
                spent++;
                er = nr; ec = nc;
                nr += DR[d]; nc += DC[d];
            }
            moves.push_back(LETTER[d]);
            if (dfs(er, ec, ink - spent)) return true;
            moves.pop_back();
            for (auto [y, x] : newly) g[y][x] = '.';
            colored -= newly.size();
        }
        return false;
    }

public:
    string solve(vector<string>& grid, int ink) {
        g = grid;
        rows = g.size();
        cols = g[0].size();
        int br = 0, bc = 0;
        for (int r = 0; r < rows; r++)
            for (int c = 0; c < cols; c++) {
                if (g[r][c] != '#') floors++;
                if (g[r][c] == 'o') { br = r; bc = c; g[r][c] = '*'; colored = 1; }
            }
        return dfs(br, bc, ink) ? moves : "";
    }
};
