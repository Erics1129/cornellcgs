// Ink Maze level 26, reference solution in C++ (not shipped: tests only).
//
// Depth-first search over (ball, colored blocks, ink left) with the ink
// pruning and a memo of the most ink seen at each (ball, colored blocks).
// Floors are numbered so the colored blocks are one 64-bit mask.
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>
using namespace std;

class Solution {
    static constexpr char LETTER[4] = {'U', 'D', 'L', 'R'};
    int floors = 0;
    uint64_t all = 0;
    // per floor and direction: the floor after k blocks, and the blocks those k color
    vector<vector<vector<int>>> stop;
    vector<vector<vector<uint64_t>>> paint;
    unordered_map<uint64_t, int> seen;  // (mask << 6 | ball) -> most ink seen
    string path;

    bool search(int ball, uint64_t mask, int ink) {
        if (mask == all) return true;
        if (ink < __builtin_popcountll(all & ~mask)) return false;
        auto [it, fresh] = seen.try_emplace(mask << 6 | (uint64_t)ball, ink);
        if (!fresh) {
            if (it->second >= ink) return false;
            it->second = ink;
        }
        for (int d = 0; d < 4; d++) {
            int n = (int)stop[ball][d].size() - 1;
            if (n == 0) continue;           // the ball would not move
            int k = min(n, ink);            // the ink can run out mid-roll
            path.push_back(LETTER[d]);
            if (search(stop[ball][d][k], mask | paint[ball][d][k], ink - k)) return true;
            path.pop_back();
        }
        return false;
    }

public:
    string solve(vector<string>& grid, int ink) {
        static const int DR[4] = {-1, 1, 0, 0}, DC[4] = {0, 0, -1, 1};
        int rows = grid.size(), cols = grid[0].size(), start = 0;
        vector<int> id(rows * cols, -1);
        for (int r = 0; r < rows; r++)
            for (int c = 0; c < cols; c++)
                if (grid[r][c] != '#') {
                    if (grid[r][c] == 'o') start = floors;
                    id[r * cols + c] = floors++;
                }
        if (floors > 58) return "";
        all = (1ull << floors) - 1;
        stop.assign(floors, vector<vector<int>>(4));
        paint.assign(floors, vector<vector<uint64_t>>(4));
        for (int r = 0; r < rows; r++)
            for (int c = 0; c < cols; c++) {
                int f = id[r * cols + c];
                if (f < 0) continue;
                for (int d = 0; d < 4; d++) {
                    stop[f][d] = {f};
                    paint[f][d] = {0};
                    int rr = r + DR[d], cc = c + DC[d];
                    uint64_t m = 0;
                    while (rr >= 0 && cc >= 0 && rr < rows && cc < cols && id[rr * cols + cc] >= 0) {
                        m |= 1ull << id[rr * cols + cc];
                        stop[f][d].push_back(id[rr * cols + cc]);
                        paint[f][d].push_back(m);
                        rr += DR[d];
                        cc += DC[d];
                    }
                }
            }
        return search(start, 1ull << start, ink) ? path : "";
    }
};
