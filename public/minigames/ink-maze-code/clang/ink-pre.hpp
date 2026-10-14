// Ink Maze level 26: put in front of the player's solution.cpp (-include).
//
// The harness (harness.cpp, its own translation unit) cannot see the player's
// class Solution, so the call lives here, in the player's unit, without adding
// a single line after the player's code: __ink_call is a template whose
// instantiation clang performs at the end of the translation unit, where
// Solution is complete. Nothing after the player's last line means a missing
// brace, a trailing backslash or an open comment stays the player's own error,
// at the player's own line.
#include <string>
#include <vector>

class Solution;

template <class __InkSolution = Solution>
inline void __ink_call(::std::vector<::std::string> &__ink_grid, int __ink_ink, ::std::string &__ink_moves) {
  __InkSolution __ink_solution;  // a new Solution per board (H2)
  ::std::string __ink_result = __ink_solution.solve(__ink_grid, __ink_ink);
  __ink_moves.swap(__ink_result);
}

extern "C" void __ink_call_solve(::std::vector<::std::string> *__ink_grid, int __ink_ink, ::std::string *__ink_moves) {
  __ink_call<>(*__ink_grid, __ink_ink, *__ink_moves);
}
