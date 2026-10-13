// Ink Maze level 26, an UNPRUNED brute force in C++ (tests only).
//
// cpp-naive.cpp without its one pruning rule: give up on a line only when the ink is
// gone, never because the ink left is less than the blocks still uncolored.
// No memo. Not shipped. It clears the visible map and the small hidden
// boards (problem.ts PLAIN_SEARCH_BUDGET), but the larger hidden boards need
// more than UNPRUNED_SEARCH_FLOOR calls in every move order, so a submission
// must end in Time Limit Exceeded (scripts/test-inkmaze-code-flow.mjs checks it).
#include <string>
#include <vector>
using namespace std;

class Solution {
    vector<string> g;
    int rows = 0, cols = 0, floors = 0, colored = 0;
    string moves;

    bool dfs(int r, int c, int ink) {
        if (colored == floors) return true;
        if (ink <= 0) return false;
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
