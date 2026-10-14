/**
 * Ink Maze level 26: the C and C++ programs the clang runtime is tested with
 * (scripts/inkmaze-code/test-runtime-c.mjs runs them in Chromium and WebKit;
 * the Node check in the same folder runs them against runtimes/c.ts directly).
 *
 * Each case: { name, lang, source, expect, tests?, timeLimitMs?, compileLimitMs?, runaway? }
 *   expect.status            the RunStatus the page must show
 *   expect.line / .test      error or first diagnostic line, board index (null = must be null)
 *   expect.message / .type   regexes for the message and the error type
 *   expect.accepted          every board's answer is accepted by the judge
 *   runaway                  measure the browser's CPU after it (D9)
 * Lines are 1-based in the player's file; keep them in mind when editing.
 */

const SOLVE_C = 'char *solve(char **grid, int rows, int cols, int ink)'
const CLASS_CPP = (body) => `#include <string>\n#include <vector>\nusing namespace std;\nclass Solution {\npublic:\n    string solve(vector<string>& grid, int ink) {\n${body}\n    }\n};\n`

export const CASES = [
  // ------------------------------------------------------------ compile errors
  {
    name: 'compile error (C): missing semicolon',
    lang: 'c',
    source: `${SOLVE_C} {\n    int x = 1\n    return "";\n}\n`,
    expect: { status: 'compile_error', line: 2, message: /expected ';'/ },
  },
  {
    name: 'compile error (C++): wrong type',
    lang: 'cpp',
    source: CLASS_CPP('        int moves = "RDLU";\n        return "";'),
    expect: { status: 'compile_error', line: 7, message: /cannot initialize a variable of type 'int'/ },
  },
  {
    name: 'compile error (C++): missing closing brace is at the player\'s last line',
    lang: 'cpp',
    source: CLASS_CPP('        return "";').replace(/};\n$/, '\n'),
    expect: { status: 'compile_error', line: 9, message: /expected/ },
  },
  {
    name: 'compile error (C): wrong solve() signature at the player\'s line',
    lang: 'c',
    source: 'char *solve(char **grid, int ink) {\n    return "";\n}\n',
    expect: { status: 'compile_error', line: 1, message: /conflicting types for 'solve'/ },
  },
  {
    name: 'compile error (C++): no class Solution',
    lang: 'cpp',
    source: '#include <string>\n#include <vector>\nstd::string solve(std::vector<std::string>& grid, int ink) { return ""; }\n',
    expect: { status: 'compile_error', message: /must define class Solution/ },
  },
  {
    name: 'compile error (C++): solve() is private',
    lang: 'cpp',
    source: CLASS_CPP('        return "";').replace('public:\n', ''),
    expect: { status: 'compile_error', message: /must be public/ },
  },
  {
    name: 'compile error (C): defines main()',
    lang: 'c',
    source: `int main(void) { return 0; }\n${SOLVE_C} { return ""; }\n`,
    expect: { status: 'compile_error', message: /defines main\(\)/ },
  },
  {
    name: 'compile error (C++): throw (no exceptions here)',
    lang: 'cpp',
    source: CLASS_CPP('        if (ink < 0) throw 1;\n        return "";'),
    expect: { status: 'compile_error', line: 7, message: /exceptions disabled/ },
  },
  {
    name: 'compile error (C): hijacks a function the harness uses (fflush)',
    lang: 'c',
    source: `#include <stdio.h>\nint fflush(FILE *f) { return 0; }\n${SOLVE_C} { return ""; }\n`,
    expect: { status: 'compile_error', message: /defines `fflush`/ },
  },
  {
    name: 'compile error (C): defines a harness import (__ink_answer)',
    lang: 'c',
    source: `void __ink_answer(int b, const char *m, int n) {}\n${SOLVE_C} { return ""; }\n`,
    expect: { status: 'compile_error', message: /__ink_answer/ },
  },
  {
    name: 'compile error (C): imports a function the sandbox does not have',
    lang: 'c',
    source: `__attribute__((import_module("env"), import_name("evil"))) void evil(void);\n${SOLVE_C} { evil(); return ""; }\n`,
    expect: { status: 'compile_error', message: /imports env\.evil/ },
  },
  {
    name: 'compile error (C): static arrays too big to compile (100 MB)',
    lang: 'c',
    source: `static char big[100u << 20];\n${SOLVE_C} { big[ink] = 1; return big[ink + 1] ? "R" : ""; }\n`,
    expect: { status: 'compile_error', message: /too large to compile/ },
  },
  {
    name: 'compiler memory bomb (C): a 600 MB static initializer',
    lang: 'c',
    source: `static char big[600u << 20] = {1};\n${SOLVE_C} { big[ink] = 2; return big[ink * 3] ? "R" : ""; }\n`,
    expect: { status: 'memory_limit', phase: 'compile', message: /compiler/ },
    runaway: true,
  },
  {
    name: 'compile bomb (C): a macro that expands to 16 million tokens',
    lang: 'c',
    source: [
      '#define A x x x x', '#define B A A A A', '#define C B B B B', '#define D C C C C', '#define E D D D D', '#define F E E E E',
      '#define G F F F F', '#define H G G G G', '#define I H H H H', '#define J I I I I', '#define K J J J J', '#define L K K K K', '#define M L L L L',
      'int v = 1; M', `${SOLVE_C} { return ""; }`, '',
    ].join('\n'),
    compileLimitMs: 2000,
    expect: { status: ['time_limit', 'memory_limit'], phase: 'compile' },
    runaway: true,
  },
  {
    name: 'compile bomb (C++): a macro that expands to 16 million tokens',
    lang: 'cpp',
    source: [
      '#define A x x x x', '#define B A A A A', '#define C B B B B', '#define D C C C C', '#define E D D D D', '#define F E E E E',
      '#define G F F F F', '#define H G G G G', '#define I H H H H', '#define J I I I I', '#define K J J J J', '#define L K K K K', '#define M L L L L',
      'int v = 1; M', CLASS_CPP('        return "";'),
    ].join('\n'),
    compileLimitMs: 6000,
    expect: { status: ['time_limit', 'memory_limit'], phase: 'compile' },
    runaway: true,
  },
  {
    name: 'macros cannot reach the harness (#define scanf, malloc, fflush)',
    lang: 'c',
    source: `#define scanf(...) 0\n#define fflush(f) 0\n#define malloc(n) 0\n#include <string.h>\n${SOLVE_C} { return ""; } // ends with a backslash \\`,
    expect: { status: 'ok' },
  },

  // ------------------------------------------------------------ runtime errors
  {
    name: 'runtime error (C): null pointer',
    lang: 'c',
    source: `${SOLVE_C} {\n    int *p = 0;\n    if (ink > 0) *p = ink;\n    return "";\n}\n`,
    expect: { status: 'runtime_error', type: /Null pointer/, line: 3, test: 0, message: /in solve\(\)/ },
  },
  {
    name: 'runtime error (C): array index out of bounds',
    lang: 'c',
    source: `${SOLVE_C} {\n    int a[8];\n    a[ink % 8] = 1;\n    a[ink + 10] = 2;\n    return a[3] ? "R" : "";\n}\n`,
    expect: { status: 'runtime_error', type: /Index out of bounds/, line: 4, test: 0 },
  },
  {
    name: 'runtime error (C): division by zero',
    lang: 'c',
    source: `${SOLVE_C} {\n    int zero = rows - rows;\n    return ink / zero ? "R" : "";\n}\n`,
    expect: { status: 'runtime_error', type: /Division by zero/, line: 3, test: 0 },
  },
  {
    name: 'runtime error (C++): missing return',
    lang: 'cpp',
    source: CLASS_CPP('        if (ink < 0) return "";'),
    expect: { status: 'runtime_error', type: /Missing return/, line: 6, test: 0 },
  },
  {
    name: 'runtime error (C++): vector index out of range (libc++ hardening)',
    lang: 'cpp',
    source: CLASS_CPP('        vector<int> v(3);\n        v[ink] = 1;\n        return "";'),
    expect: { status: 'runtime_error', type: /libc\+\+/, message: /(out of bounds|out_of_range).* in Solution::solve\(\)/, test: 0 },
  },
  {
    name: 'runtime error (C): abort()',
    lang: 'c',
    source: `#include <stdlib.h>\n${SOLVE_C} {\n    if (ink > 0) abort();\n    return "";\n}\n`,
    expect: { status: 'runtime_error', type: /Aborted/, test: 0 },
  },
  {
    name: 'runtime error (C): wild pointer write',
    lang: 'c',
    source: `#include <string.h>\n${SOLVE_C} {\n    char *p = (char *)0x7ffffff0;\n    memset(p, 1, 4096);\n    return "";\n}\n`,
    expect: { status: 'runtime_error', type: /Segmentation fault/, test: 0 },
  },
  {
    name: 'runtime error (C): exit(3) inside solve()',
    lang: 'c',
    source: `#include <stdlib.h>\n${SOLVE_C} {\n    exit(3);\n}\n`,
    expect: { status: 'runtime_error', message: /must return; it called exit\(3\)/, test: 0 },
  },
  {
    name: 'runtime error (C): returns a pointer outside memory',
    lang: 'c',
    source: `${SOLVE_C} {\n    return (char *)0xfffffff0u;\n}\n`,
    expect: { status: 'runtime_error', message: /outside memory/, test: 0 },
  },
  {
    name: 'runtime error (C): unbounded recursion (stack overflow)',
    lang: 'c',
    source: `static int dive(int n) { volatile int keep = n; return dive(n + 1) + keep; }\n${SOLVE_C} {\n    return dive(0) ? "R" : "";\n}\n`,
    expect: { status: 'runtime_error', type: /Stack overflow/, message: /in dive\(\)/, test: 0 },
  },
  {
    name: 'runtime error (C): recursion with big frames (the C stack overflows)',
    lang: 'c',
    source: `#include <string.h>\nstatic int dive(int n) { char buf[100000]; memset(buf, n, sizeof buf); return dive(n + 1) + buf[n % 100000]; }\n${SOLVE_C} {\n    return dive(0) ? "R" : "";\n}\n`,
    expect: { status: 'runtime_error', type: /Stack overflow/, message: /in dive\(\)/, test: 0 },
  },
  {
    name: 'recursion 200 deep works (C++, a DFS-like frame)',
    lang: 'cpp',
    source: CLASS_CPP('        return go(grid, ink, 0) ? "" : "";\n    }\n    bool go(vector<string>& g, int ink, int depth) {\n        string here(g[depth % g.size()]);\n        if (depth == 200) return here.size() > 0;\n        return go(g, ink, depth + 1) && here.size() > 0;'),
    expect: { status: 'ok' },
  },

  // ------------------------------------------------------------ runaways (D2-D9)
  {
    name: 'infinite loop (C)',
    lang: 'c',
    source: `${SOLVE_C} {\n    volatile unsigned n = 0;\n    for (;;) n++;\n}\n`,
    timeLimitMs: 1200,
    expect: { status: 'time_limit', stoppedBy: 'runtime', test: 0 },
    runaway: true,
  },
  {
    name: 'infinite loop with no memory access (C, registers only)',
    lang: 'c',
    source: `#include <stdint.h>\n${SOLVE_C} {\n    uint64_t x = (uint64_t)ink;\n    for (;;) { x = x * 6364136223846793005ull + 1442695040888963407ull; if (x == 0x123456789abcdef1ull) break; }\n    return x ? "R" : "";\n}\n`,
    timeLimitMs: 1200,
    expect: { status: 'time_limit', stoppedBy: 'runtime' },
    runaway: true,
  },
  {
    name: 'infinite loop inside deep recursion (C)',
    lang: 'c',
    source: `#include <stdint.h>\n__attribute__((noinline)) static uint64_t spin(uint64_t x) { for (;;) { x = x * 6364136223846793005ull + 1; if (x == 7) return x; } }\n__attribute__((noinline)) static uint64_t nest(int d, uint64_t s) { volatile char pad[32]; pad[d & 31] = (char)d; if (d == 0) return spin(s); return nest(d - 1, s ^ (uint64_t)pad[(d * 7) & 31]) + 1; }\n${SOLVE_C} {\n    return nest(150, (uint64_t)ink) ? "R" : "";\n}\n`,
    timeLimitMs: 1200,
    expect: { status: 'time_limit', stoppedBy: 'runtime' },
    runaway: true,
  },
  {
    name: 'exponential recursion without loops (C)',
    lang: 'c',
    source: `static volatile int sink;\n__attribute__((noinline)) static unsigned long f(int n) { if (n == 0) { sink++; return 1; } return f(n - 1) + f(n - 1); }\n${SOLVE_C} {\n    return f(60) ? "R" : "";\n}\n`,
    timeLimitMs: 1200,
    expect: { status: 'time_limit', stoppedBy: 'runtime' },
    runaway: true,
  },
  {
    name: 'infinite loop in a destructor during cleanup (C++, the "finally" case)',
    lang: 'cpp',
    source: CLASS_CPP('        struct Cleanup { ~Cleanup() { volatile int n = 0; for (;;) n++; } } guard;\n        return "R";'),
    timeLimitMs: 1200,
    expect: { status: 'time_limit', stoppedBy: 'runtime' },
    runaway: true,
  },
  {
    name: 'infinite loop in an atexit handler after the last board (C)',
    lang: 'c',
    source: `#include <stdlib.h>\nstatic void forever(void) { volatile int n = 0; for (;;) n++; }\n${SOLVE_C} {\n    static int once;\n    if (!once++) atexit(forever);\n    return "";\n}\n`,
    timeLimitMs: 1200,
    expect: { status: 'time_limit', stoppedBy: 'runtime' },
    runaway: true,
  },
  {
    name: 'opting out of instrumentation does not work (no_sanitize, disable_sanitizer_instrumentation, pragma)',
    lang: 'c',
    source: `#pragma clang attribute push (__attribute__((no_sanitize("coverage", "undefined"))), apply_to = function)\n__attribute__((disable_sanitizer_instrumentation, no_sanitize("coverage")))\nstatic void hide(volatile int *n) { for (;;) (*n)++; }\n#pragma clang attribute pop\n${SOLVE_C} {\n    volatile int n = 0;\n    hide(&n);\n    return "";\n}\n`,
    timeLimitMs: 1200,
    expect: { status: 'time_limit', stoppedBy: 'runtime' },
    runaway: true,
  },
  {
    name: 'an infinite loop written in WebAssembly inline assembly',
    lang: 'c',
    source: `${SOLVE_C} {\n    __asm__ volatile("loop\\n  br 0\\nend_loop");\n    return "";\n}\n`,
    timeLimitMs: 1200,
    expect: { status: 'time_limit', stoppedBy: 'runtime' },
    runaway: true,
    maybeCompileError: true,
  },
  {
    name: 'infinite loop before main (C++ static initializer)',
    lang: 'cpp',
    source: `struct Spin { Spin() { volatile unsigned n = 0; for (;;) n++; } };\nstatic Spin spin;\n${CLASS_CPP('        return "";')}`,
    timeLimitMs: 1200,
    expect: { status: 'time_limit', stoppedBy: 'runtime', test: null },
    runaway: true,
  },
  {
    name: 'infinite loop of indirect calls (C, a function pointer)',
    lang: 'c',
    source: `static void nop(void) {}\nstatic void (*volatile fp)(void) = nop;\n${SOLVE_C} {\n    for (;;) fp();\n}\n`,
    timeLimitMs: 1200,
    expect: { status: 'time_limit', stoppedBy: 'runtime', test: 0 },
    runaway: true,
  },
  {
    name: 'infinite loop in a std::sort comparator (C++, library code calls it)',
    lang: 'cpp',
    source: `#include <algorithm>\n${CLASS_CPP('        vector<int> v(64, 0);\n        sort(v.begin(), v.end(), [](int, int) { volatile unsigned n = 0; for (;;) n++; return true; });\n        return "";')}`,
    timeLimitMs: 1200,
    expect: { status: 'time_limit', stoppedBy: 'runtime', test: 0 },
    runaway: true,
  },
  {
    name: 'bulk-memory bomb: memset of 200 MB in a loop (C)',
    lang: 'c',
    source: `#include <stdlib.h>\n#include <string.h>\n${SOLVE_C} {\n    char *p = malloc(200u << 20);\n    for (;;) memset(p, ink, 200u << 20);\n}\n`,
    timeLimitMs: 1200,
    expect: { status: 'time_limit', stoppedBy: 'runtime', test: 0 },
    runaway: true,
  },
  {
    name: 'printf with a two-billion-character field width (C)',
    lang: 'c',
    source: `#include <stdio.h>\n${SOLVE_C} {\n    printf("%2000000000d", 1);\n    return "";\n}\n`,
    expect: { status: 'output_limit', stoppedBy: 'runtime', test: 0 },
    runaway: true,
  },
  {
    name: 'sleep() past the limit (C)',
    lang: 'c',
    source: `#include <unistd.h>\n${SOLVE_C} {\n    sleep(30);\n    return "";\n}\n`,
    timeLimitMs: 1200,
    expect: { status: 'time_limit', stoppedBy: 'runtime' },
    runaway: true,
  },
  {
    name: 'allocation bomb (C, malloc and touch)',
    lang: 'c',
    source: `#include <stdlib.h>\nstatic volatile char sink;\n${SOLVE_C} {\n    for (;;) { char *p = malloc(1 << 20); p[ink & 1023] = sink; sink = p[0]; }\n}\n`,
    expect: { status: 'memory_limit', stoppedBy: 'runtime', test: 0 },
    runaway: true,
  },
  {
    name: 'allocation bomb (C++, vector push_back)',
    lang: 'cpp',
    source: CLASS_CPP('        vector<long long> v;\n        for (;;) v.push_back((long long)v.size());'),
    expect: { status: 'memory_limit', stoppedBy: 'runtime', test: 0 },
    runaway: true,
  },
  {
    name: 'one huge allocation (C, 2 GB)',
    lang: 'c',
    source: `#include <stdlib.h>\nstatic char *volatile p;\n${SOLVE_C} {\n    p = malloc(2000000000u);\n    return p ? "R" : "";\n}\n`,
    expect: { status: 'memory_limit', test: 0 },
  },
  {
    name: 'output flood (C, printf lines)',
    lang: 'c',
    source: `#include <stdio.h>\n${SOLVE_C} {\n    for (long i = 0;; i++) printf("line %ld of a flood\\n", i);\n}\n`,
    expect: { status: 'output_limit', stoppedBy: 'runtime' },
    runaway: true,
  },
  {
    name: 'output flood (C++, cout without line breaks)',
    lang: 'cpp',
    source: `#include <iostream>\n${CLASS_CPP('        for (;;) cout << "flood ";').replace('#include <string>\n', '#include <string>\n#include <iostream>\n')}`,
    expect: { status: 'output_limit', stoppedBy: 'runtime' },
    runaway: true,
  },
  {
    name: 'one 200 MB write to stdout (C)',
    lang: 'c',
    source: `#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n${SOLVE_C} {\n    size_t n = 200u << 20;\n    char *p = malloc(n);\n    memset(p, 'x', n);\n    fwrite(p, 1, n, stdout);\n    return "";\n}\n`,
    expect: { status: 'output_limit' },
  },

  // ------------------------------------------------------------ harness tampering
  {
    name: 'tampering: a constructor reads the input first',
    lang: 'c',
    source: `#include <stdio.h>\n__attribute__((constructor)) static void steal(void) { while (getchar() != EOF) {} }\n${SOLVE_C} { return ""; }\n`,
    expect: { status: 'crashed', message: /input could not be read/ },
  },
  {
    name: 'tampering: calling the harness\'s answer import directly',
    lang: 'c',
    source: `__attribute__((import_module("ink"), import_name("answer"))) void cheat(int board, const char *moves, int length);\n${SOLVE_C} {\n    cheat(0, "RDLU", 4);\n    return "";\n}\n`,
    expect: { status: 'crashed', message: /hidden harness/ },
  },
  {
    name: 'tampering: scribbling over a wide span of memory',
    lang: 'c',
    tests: 'two',
    source: `#include <stdlib.h>\n#include <string.h>\nstatic char *volatile sink;\n${SOLVE_C} {\n    char *base = (char *)malloc(1);\n    sink = base;\n    memset(base - (12 << 20), 0x5a, 20 << 20); /* over the data, bss (the input) and stack */\n    return "";\n}\n`,
    expect: { status: ['crashed', 'runtime_error', 'memory_limit'] },
  },
  {
    name: 'tampering: printing the answer marker (the page sees too many answers)',
    lang: 'c',
    source: `#include <stdio.h>\n${SOLVE_C} {\n    printf("@@ANSWER@@ RDLU\\n");\n    return "";\n}\n`,
    expect: { status: 'crashed', message: /answer marker/ },
  },
  {
    name: 'tampering: corrupting the heap the harness uses next',
    lang: 'c',
    tests: 'two',
    source: `#include <stdlib.h>\n#include <string.h>\n${SOLVE_C} {\n    char *p = malloc(16);\n    memset(p - 64, 0xff, 4096);\n    return "";\n}\n`,
    expect: { status: ['crashed', 'runtime_error', 'ok'] },
  },
  {
    name: 'fclose(stdout) and stdin reads are harmless',
    lang: 'c',
    source: `#include <stdio.h>\n${SOLVE_C} {\n    int c = getchar();\n    printf("stdin gave %d\\n", c);\n    fclose(stdout);\n    return "";\n}\n`,
    expect: { status: 'ok', stdout: /stdin gave -1/ },
  },

  // ------------------------------------------------------------ prints and answers
  {
    name: 'prints, stderr and a NUL-free answer (C)',
    lang: 'c',
    source: `#include <stdio.h>\n${SOLVE_C} {\n    printf("thinking about %d rows", rows);\n    fprintf(stderr, "careful\\n");\n    return "R@D";\n}\n`,
    expect: { status: 'ok', stdout: /^thinking about \d rows\n$/, stderr: /^careful\n$/, answer0: 'R\uff20D' },
  },
  {
    name: 'C++ cout with sync_with_stdio(false) is flushed before the answer',
    lang: 'cpp',
    source: `#include <iostream>\n${CLASS_CPP('        ios::sync_with_stdio(false);\n        cout << "rows " << grid.size() << "\\n";\n        return "";').replace('#include <string>\n', '#include <string>\n#include <iostream>\n')}`,
    expect: { status: 'ok', stdout: /^rows \d\n$/ },
  },
]
