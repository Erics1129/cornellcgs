/*
 * Ink Maze level 26: the hidden part of every C and C++ program, shared by
 * harness.c and harness.cpp (problem.ts H1-H6; the runtime is
 * src/minigames/inkmaze/code/runtimes/c.ts).
 *
 * The harness is compiled on its own, never in the player's translation unit,
 * so player macros cannot reach it and a stray backslash or a missing brace in
 * the player's file stays in the player's file. It talks to the game only
 * through the "ink" imports below and reads stdin through its own fd_read
 * import (not through stdio, which the player can reconfigure). Its own state
 * is static; c.ts refuses a player object that defines any symbol the harness
 * defines or uses (so `scanf`, `malloc`, `fflush`... cannot be hijacked).
 *
 * The deadline is not here: c.ts instruments the whole linked program (every
 * function entry and loop, the C library included) with a fuel counter that
 * calls ink.check, so no attribute or pragma in the player's code can opt out.
 */
#ifndef INK_HARNESS_H
#define INK_HARNESS_H

#include <errno.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
#define INK_C extern "C"
#else
#define INK_C
#endif

/* ---------------------------------------------------------------- imports */

#define INK_IMPORT(name) __attribute__((import_module("ink"), import_name(name)))

/* the deadline check (the fuel counter calls it too) */
INK_C INK_IMPORT("check") void __ink_check(void);
/* where the program is: c.ts classifies a failure by it (the player's solve() or the harness) */
INK_C INK_IMPORT("phase") void __ink_phase(int32_t phase, int32_t board);
/* one answer: length < 0 means a NUL-terminated string; c.ts escapes it (H3) and prints the answer line */
INK_C INK_IMPORT("answer") void __ink_answer(int32_t board, const char *moves, int32_t length);
/* stops the program with a reason (it throws in JavaScript and never returns) */
INK_C INK_IMPORT("fault") __attribute__((noreturn)) void __ink_fault(int32_t kind, const char *file, int32_t line, int32_t column, int64_t value, const char *detail);
/* stdin, read directly: the player's stdio cannot get in between */
INK_C __attribute__((import_module("wasi_snapshot_preview1"), import_name("fd_read"))) int32_t __ink_fd_read(int32_t fd, void *iovs, int32_t count, int32_t *nread);

enum { INK_PHASE_READ = 1, INK_PHASE_SOLVE = 2, INK_PHASE_AFTER = 3, INK_PHASE_DONE = 4 };
enum {
  INK_FAULT_NULL = 1, INK_FAULT_INDEX = 2, INK_FAULT_DIVIDE = 3, INK_FAULT_VLA = 4, INK_FAULT_RETURN = 5,
  INK_FAULT_UNREACHABLE = 6, INK_FAULT_MEMORY = 7, INK_FAULT_LIBCXX = 8, INK_FAULT_INPUT = 9, INK_FAULT_TAMPERED = 10,
};

/* ------------------------------------------------------------------ input */

#define INK_MAX_BOARDS 1000
#define INK_MAX_SIDE 64
#define INK_INPUT_MAX (1 << 20)

typedef struct { int32_t rows, cols, ink; uint32_t at; } __ink_board_t;

static char __ink_input[INK_INPUT_MAX + 1];
static uint32_t __ink_input_len;
static __ink_board_t __ink_boards[INK_MAX_BOARDS];
static int32_t __ink_count;
static uint32_t __ink_sum;

/* FNV-1a over the input and the parsed boards: checked before every board, so a
 * program that writes over the game's copy of the input is caught (H1) */
static uint32_t __ink_hash(void) {
  uint32_t h = 2166136261u;
  for (uint32_t i = 0; i < __ink_input_len; i++) { h ^= (unsigned char)__ink_input[i]; h *= 16777619u; }
  const unsigned char *b = (const unsigned char *)__ink_boards;
  for (size_t i = 0; i < sizeof(__ink_board_t) * (size_t)__ink_count; i++) { h ^= b[i]; h *= 16777619u; }
  h ^= (uint32_t)__ink_count;
  return h;
}

static __attribute__((noreturn)) void __ink_bad_input(const char *why) {
  __ink_fault(INK_FAULT_INPUT, 0, 0, 0, 0, why);
}

/* a positive decimal number followed by `end` */
static int32_t __ink_number(uint32_t *at, char end) {
  uint32_t i = *at;
  int32_t value = 0;
  if (i >= __ink_input_len || __ink_input[i] < '1' || __ink_input[i] > '9') __ink_bad_input("a number was expected");
  while (i < __ink_input_len && __ink_input[i] >= '0' && __ink_input[i] <= '9') {
    if (value > 100000000) __ink_bad_input("a number is too large");
    value = value * 10 + (__ink_input[i++] - '0');
  }
  if (i >= __ink_input_len || __ink_input[i] != end) __ink_bad_input("the input is not in the expected format");
  *at = i + 1;
  return value;
}

/* H1: all of stdin, before any board; then the boards, checked strictly */
static void __ink_read_input(void) {
  __ink_check(); /* also keeps the ink.check import, which the fuel counter calls */
  __ink_phase(INK_PHASE_READ, -1);
  for (;;) {
    struct { void *buf; size_t len; } iov = { __ink_input + __ink_input_len, (size_t)(INK_INPUT_MAX - __ink_input_len) };
    int32_t got = 0;
    if (iov.len == 0) __ink_bad_input("the input is too large");
    if (__ink_fd_read(0, &iov, 1, &got) != 0) __ink_bad_input("stdin could not be read");
    if (got <= 0) break;
    __ink_input_len += (uint32_t)got;
  }
  uint32_t at = 0;
  int32_t count = __ink_number(&at, '\n');
  if (count > INK_MAX_BOARDS) __ink_bad_input("too many boards");
  for (int32_t t = 0; t < count; t++) {
    __ink_board_t b;
    b.rows = __ink_number(&at, ' ');
    b.cols = __ink_number(&at, ' ');
    b.ink = __ink_number(&at, '\n');
    if (b.rows > INK_MAX_SIDE || b.cols > INK_MAX_SIDE) __ink_bad_input("a board is too large");
    b.at = at;
    int32_t balls = 0;
    for (int32_t r = 0; r < b.rows; r++) {
      for (int32_t c = 0; c < b.cols; c++, at++) {
        char ch = at < __ink_input_len ? __ink_input[at] : 0;
        if (ch == 'o') balls++;
        else if (ch != '#' && ch != '.') __ink_bad_input("a board row is not in the expected format");
      }
      if (at >= __ink_input_len || __ink_input[at] != '\n') __ink_bad_input("a board row has the wrong length");
      at++;
    }
    if (balls != 1) __ink_bad_input("a board must have exactly one ball");
    __ink_boards[t] = b;
  }
  if (at != __ink_input_len) __ink_bad_input("there is more input after the last board");
  __ink_count = count;
  __ink_sum = __ink_hash();
}

/* board t, after checking that nothing wrote over the input */
static const __ink_board_t *__ink_board(int32_t t) {
  if (__ink_hash() != __ink_sum) __ink_fault(INK_FAULT_TAMPERED, 0, 0, 0, t, "the game's copy of the input was changed");
  return &__ink_boards[t];
}

/* --------------------------------------------- undefined-behaviour checks */
/* -fsanitize=null,array-bounds,vla-bound,integer-divide-by-zero,unreachable
 * (and return in C++) call these instead of trapping, so the game learns the
 * player's line in every browser. The data layouts are clang's (ubsan_handlers.h). */

typedef struct { const char *file; uint32_t line; uint32_t column; } __ink_loc_t;
typedef struct { uint16_t kind; uint16_t info; char name[1]; } __ink_type_t;
typedef struct { __ink_loc_t loc; const __ink_type_t *type; unsigned char log_alignment; unsigned char check_kind; } __ink_mismatch_t;
typedef struct { __ink_loc_t loc; const __ink_type_t *array; const __ink_type_t *index; } __ink_bounds_t;
typedef struct { __ink_loc_t loc; const __ink_type_t *type; } __ink_typed_t;

static const char *const __ink_access[] = {
  "read through", "write through", "reference to", "member access through", "member call through",
  "constructor call on", "cast of", "cast of", "cast of", "cast of", "binding of", "dynamic operation on",
};

/* the value of a ubsan ValueHandle: inline when it fits in a pointer, else behind it */
static int64_t __ink_value(const __ink_type_t *type, uintptr_t handle) {
  if (!type || type->kind != 0) return 0;
  unsigned bits = 1u << (type->info >> 1);
  int is_signed = type->info & 1;
  if (bits <= 32) return is_signed ? (int64_t)(int32_t)handle : (int64_t)(uint32_t)handle;
  if (bits == 64) return *(const int64_t *)handle;
  return 0;
}

INK_C __attribute__((noreturn)) void __ubsan_handle_type_mismatch_v1(void *data, uintptr_t pointer) {
  const __ink_mismatch_t *d = (const __ink_mismatch_t *)data;
  __ink_fault(INK_FAULT_NULL, d->loc.file, (int32_t)d->loc.line, (int32_t)d->loc.column, (int64_t)pointer,
              d->check_kind < 12 ? __ink_access[d->check_kind] : "access through");
}
INK_C __attribute__((noreturn)) void __ubsan_handle_type_mismatch_v1_abort(void *data, uintptr_t pointer) { __ubsan_handle_type_mismatch_v1(data, pointer); }

INK_C __attribute__((noreturn)) void __ubsan_handle_out_of_bounds(void *data, uintptr_t index) {
  const __ink_bounds_t *d = (const __ink_bounds_t *)data;
  __ink_fault(INK_FAULT_INDEX, d->loc.file, (int32_t)d->loc.line, (int32_t)d->loc.column, __ink_value(d->index, index), d->array ? d->array->name : "");
}
INK_C __attribute__((noreturn)) void __ubsan_handle_out_of_bounds_abort(void *data, uintptr_t index) { __ubsan_handle_out_of_bounds(data, index); }

INK_C __attribute__((noreturn)) void __ubsan_handle_local_out_of_bounds(void *data) {
  const __ink_loc_t *loc = (const __ink_loc_t *)data;
  __ink_fault(INK_FAULT_INDEX, loc ? loc->file : 0, loc ? (int32_t)loc->line : 0, loc ? (int32_t)loc->column : 0, 0, "");
}
INK_C __attribute__((noreturn)) void __ubsan_handle_local_out_of_bounds_abort(void *data) { __ubsan_handle_local_out_of_bounds(data); }

INK_C __attribute__((noreturn)) void __ubsan_handle_vla_bound_not_positive(void *data, uintptr_t bound) {
  const __ink_typed_t *d = (const __ink_typed_t *)data;
  __ink_fault(INK_FAULT_VLA, d->loc.file, (int32_t)d->loc.line, (int32_t)d->loc.column, __ink_value(d->type, bound), "");
}
INK_C __attribute__((noreturn)) void __ubsan_handle_vla_bound_not_positive_abort(void *data, uintptr_t bound) { __ubsan_handle_vla_bound_not_positive(data, bound); }

INK_C __attribute__((noreturn)) void __ubsan_handle_divrem_overflow(void *data, uintptr_t lhs, uintptr_t rhs) {
  const __ink_typed_t *d = (const __ink_typed_t *)data;
  (void)lhs;
  int64_t divisor = __ink_value(d->type, rhs);
  __ink_fault(INK_FAULT_DIVIDE, d->loc.file, (int32_t)d->loc.line, (int32_t)d->loc.column, divisor, divisor == 0 ? "by zero" : "overflow");
}
INK_C __attribute__((noreturn)) void __ubsan_handle_divrem_overflow_abort(void *data, uintptr_t lhs, uintptr_t rhs) { __ubsan_handle_divrem_overflow(data, lhs, rhs); }

INK_C __attribute__((noreturn)) void __ubsan_handle_missing_return(void *data) {
  const __ink_loc_t *loc = (const __ink_loc_t *)data;
  __ink_fault(INK_FAULT_RETURN, loc->file, (int32_t)loc->line, (int32_t)loc->column, 0, "");
}

INK_C __attribute__((noreturn)) void __ubsan_handle_builtin_unreachable(void *data) {
  const __ink_loc_t *loc = (const __ink_loc_t *)data;
  __ink_fault(INK_FAULT_UNREACHABLE, loc->file, (int32_t)loc->line, (int32_t)loc->column, 0, "");
}

/* --------------------------------------------------------------- the heap */
/* Linked with --wrap for these: an allocation the 256 MiB cap refuses is
 * reported as memory_limit at once (C++ operator new goes through malloc). */

INK_C void *__real_malloc(size_t size);
INK_C void *__real_calloc(size_t count, size_t size);
INK_C void *__real_realloc(void *pointer, size_t size);
INK_C void *__real_aligned_alloc(size_t alignment, size_t size);
INK_C int __real_posix_memalign(void **out, size_t alignment, size_t size);

static __attribute__((noreturn)) void __ink_out_of_memory(size_t size, const char *what) {
  __ink_fault(INK_FAULT_MEMORY, 0, 0, 0, (int64_t)size, what);
}

INK_C void *__wrap_malloc(size_t size) {
  void *p = __real_malloc(size);
  if (!p && size) __ink_out_of_memory(size, "malloc");
  return p;
}
INK_C void *__wrap_calloc(size_t count, size_t size) {
  void *p = __real_calloc(count, size);
  if (!p && count && size) __ink_out_of_memory(size > SIZE_MAX / count ? SIZE_MAX : count * size, "calloc");
  return p;
}
INK_C void *__wrap_realloc(void *pointer, size_t size) {
  void *p = __real_realloc(pointer, size);
  if (!p && size) __ink_out_of_memory(size, "realloc");
  return p;
}
INK_C void *__wrap_aligned_alloc(size_t alignment, size_t size) {
  void *p = __real_aligned_alloc(alignment, size);
  if (!p && size) __ink_out_of_memory(size, "aligned_alloc");
  return p;
}
INK_C int __wrap_posix_memalign(void **out, size_t alignment, size_t size) {
  int r = __real_posix_memalign(out, alignment, size);
  if (r == ENOMEM && size) __ink_out_of_memory(size, "posix_memalign");
  return r;
}

#endif
