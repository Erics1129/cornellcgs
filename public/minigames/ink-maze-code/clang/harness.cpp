/*
 * Ink Maze level 26: the hidden C++ harness (problem.ts H1-H6). Compiled on
 * its own and linked with the player's solution.o by
 * src/minigames/inkmaze/code/runtimes/c.ts. The player's class Solution is
 * only known inside the player's own translation unit, so ink-pre.hpp (put in
 * front of it with -include) defines __ink_call_solve there; this file calls it.
 *
 *   H1 every board is read from stdin before solve() runs (ink-harness.h)
 *   H2 per board, a fresh vector<string> and a new Solution (in __ink_call_solve)
 *   H3 after solve() returns: flush cout, cerr and stdout, then one answer line
 *   H4 a fault, trap or exit inside solve() stops the program (c.ts reports it)
 *   H5 nothing else is printed
 */
#include <cstdarg>
#include <cstdio>
#include <iostream>
#include <string>
#include <vector>

#include "ink-harness.h"

extern "C" void __ink_call_solve(std::vector<std::string> *grid, int ink, std::string *moves);

/* libc++ hardening (vector[] out of range, front() of an empty vector...) ends
 * here: the message goes to the game, which reports it as a runtime error. */
static char __ink_libcxx_message[512];
void std::__libcpp_verbose_abort(char const *format, ...) noexcept {
  va_list args;
  va_start(args, format);
  std::vsnprintf(__ink_libcxx_message, sizeof __ink_libcxx_message, format, args);
  va_end(args);
  __ink_fault(INK_FAULT_LIBCXX, 0, 0, 0, 0, __ink_libcxx_message);
}

int main() {
  __ink_read_input();
  for (int32_t t = 0; t < __ink_count; t++) {
    const __ink_board_t *b = __ink_board(t);
    std::vector<std::string> grid;
    grid.reserve((size_t)b->rows);
    for (int32_t r = 0; r < b->rows; r++)
      grid.emplace_back(__ink_input + b->at + (uint32_t)r * (uint32_t)(b->cols + 1), (size_t)b->cols);
    std::string moves;
    __ink_phase(INK_PHASE_SOLVE, t);
    __ink_call_solve(&grid, b->ink, &moves);
    __ink_phase(INK_PHASE_AFTER, t);
    std::cout.flush();
    std::cerr.flush();
    std::fflush(stdout);
    __ink_answer(t, moves.data(), (int32_t)moves.size());
  }
  __ink_phase(INK_PHASE_DONE, __ink_count);
  return 0;
}
