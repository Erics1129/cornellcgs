// Ink Maze: the held-out player panel that levels 20 to 25 are ordered by.
//
// An independent implementation of the rules (written for the review of the
// first picks for levels 21-25, separately from scripts/inkmaze-hardness.mjs):
// roll until a wall or the edge, every block rolled onto costs 1 ink and is
// colored, the ink running out mid-roll stops the ball there, the level is
// won when every floor block is colored (checked first) and lost when the ink
// is gone with blocks left. Everything is played at par ink.
//
//   cc -O2 -o /tmp/inkmaze-panel scripts/inkmaze-panel.c -lm
//   /tmp/inkmaze-panel <mode> <grid with / between rows> [args]
//     par                    the least ink (A*), checking that one drop less has no winning line
//     dp <ink>               exact: least-ink lines, careful players with lookahead L (L0 ... L30),
//                            heuristic careful players (soft1 and others), the first line and its traps
//     lines <ink>            exact: walks every least-ink line; counterFresh / counterEff are the fewest
//                            moves on any of them that color fewer new blocks (or fewer per ink) than
//                            the best careful move there
//     beam <ink> <scoring> <maxpow>   the smallest power-of-two beam width that clears it
//                            (scoring 0 gain-ink, 1 A*-f, 2 rare-first, 3 twice-colored-minus-ink)
//     dfs <ink> <seeds> <budget> <order>   careful depth-first search with a dead-state memo:
//                            median nodes to the first win over seeds (order 0 random, 1 greedy:
//                            most new blocks first)
//     nmcs <ink> <level> <seeds>          nested Monte Carlo search: wins out of seeds
//
// scripts/inkmaze-panel.mjs runs it on the levels and prints the rows of the
// curve table in scripts/test-inkmaze.mjs; the exact columns (dp, lines) are
// also recomputed in JavaScript by inkmaze-hardness.mjs panel(), and the test
// checks the two agree.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <math.h>
#include <time.h>

typedef unsigned __int128 u128;
static int W, H, N, start = -1, floors;
static char cl[128];
static u128 FL;
static int rlen[128][4];
static int rpath[128][4][16];
static u128 rpre[128][4][17];
static u128 cover[128];
static const int DX[4] = {0, 0, -1, 1}, DY[4] = {-1, 1, 0, 0};
static const char *LET = "UDLR";
#define BIT(i) (((u128)1) << (i))

static inline int pop(u128 m) { return __builtin_popcountll((uint64_t)m) + __builtin_popcountll((uint64_t)(m >> 64)); }

static void load(const char *g) {
  int x = 0;
  W = 0; H = 0; N = 0;
  for (const char *p = g;; p++) {
    if (*p == '/' || *p == 0) {
      if (!W) W = x; else if (x != W) { fprintf(stderr, "ragged row %d\n", H + 1); exit(2); }
      H++; x = 0;
      if (!*p) break;
      continue;
    }
    int i = N++;
    if (N > 128) { fprintf(stderr, "too big\n"); exit(2); }
    if (*p == 'o') { if (start >= 0) { fprintf(stderr, "two balls\n"); exit(2); } start = i; cl[i] = '.'; }
    else if (*p == '.' || *p == '#') cl[i] = *p;
    else { fprintf(stderr, "bad char %c\n", *p); exit(2); }
    x++;
  }
  if (start < 0) { fprintf(stderr, "no ball\n"); exit(2); }
  FL = 0; floors = 0;
  for (int i = 0; i < N; i++) if (cl[i] == '.') { FL |= BIT(i); floors++; }
  for (int i = 0; i < N; i++) for (int d = 0; d < 4; d++) {
    rlen[i][d] = 0; rpre[i][d][0] = 0;
    if (cl[i] != '.') continue;
    int cx = i % W, cy = i / W, k = 0;
    for (;;) {
      int nx = cx + DX[d], ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || cl[ny * W + nx] != '.') break;
      cx = nx; cy = ny;
      int j = cy * W + cx;
      rpath[i][d][k] = j;
      rpre[i][d][k + 1] = rpre[i][d][k] | BIT(j);
      k++;
    }
    rlen[i][d] = k;
  }
  for (int s = 0; s < N; s++) {
    cover[s] = 0;
    if (cl[s] != '.') continue;
    char seen[128] = {0};
    int q[128], qn = 0;
    q[qn++] = s; seen[s] = 1;
    for (int qi = 0; qi < qn; qi++) {
      int a = q[qi];
      for (int d = 0; d < 4; d++) {
        int L = rlen[a][d];
        if (!L) continue;
        cover[s] |= rpre[a][d][L];
        int b = rpath[a][d][L - 1];
        if (!seen[b]) { seen[b] = 1; q[qn++] = b; }
      }
    }
  }
}

// move: returns cells rolled onto (0: no move)
static inline int mv(u128 m, int ball, int ink, int d, u128 *nm, int *nb) {
  if (ink <= 0) return 0;
  int L = rlen[ball][d];
  if (!L) return 0;
  int k = L < ink ? L : ink;
  *nm = m | rpre[ball][d][k];
  *nb = rpath[ball][d][k - 1];
  return k;
}
static inline int leftOf(u128 m) { return floors - pop(m & FL); }
// visibly losing: not won, and (more left than ink, or some uncolored block not coverable from ball)
static inline int vlose(u128 m, int ball, int ink) {
  int lf = leftOf(m);
  if (lf == 0) return 0;
  if (lf > ink) return 1;
  if ((FL & ~m & ~cover[ball]) != 0) return 1;
  return 0;
}

// ---------------------------------------------------------------- hash table
typedef struct { u128 m; uint16_t ball, ink; uint32_t used; } Key;
static Key *keys; static uint32_t *idx; static size_t cap, cnt;
static inline uint64_t hh(u128 m, int ball, int ink) {
  uint64_t a = (uint64_t)m, b = (uint64_t)(m >> 64);
  uint64_t h = a * 0x9E3779B97F4A7C15ULL ^ (b + 0x632BE59BD9B4E019ULL) * 0xC2B2AE3D27D4EB4FULL ^ ((uint64_t)ball << 20 | ink) * 0x165667B19E3779F9ULL;
  h ^= h >> 31; h *= 0xBF58476D1CE4E5B9ULL; h ^= h >> 29;
  return h;
}
static void tinit(size_t c) { cap = c; cnt = 0; keys = calloc(cap, sizeof(Key)); idx = malloc(cap * sizeof(uint32_t)); }
static void tfree(void) { free(keys); free(idx); keys = 0; idx = 0; }
static long tfind(u128 m, int ball, int ink) {
  size_t mask = cap - 1;
  for (size_t i = hh(m, ball, ink) & mask;; i = (i + 1) & mask) {
    if (!keys[i].used) return -1;
    if (keys[i].m == m && keys[i].ball == ball && keys[i].ink == ink) return idx[i];
  }
}
static void tgrow(void);
static void tadd(u128 m, int ball, int ink, uint32_t v) {
  if ((cnt + 1) * 2 > cap) tgrow();
  size_t mask = cap - 1, i = hh(m, ball, ink) & mask;
  while (keys[i].used) i = (i + 1) & mask;
  keys[i].used = 1; keys[i].m = m; keys[i].ball = ball; keys[i].ink = ink; idx[i] = v; cnt++;
}
static void tgrow(void) {
  Key *ok = keys; uint32_t *oi = idx; size_t oc = cap;
  tinit(oc * 2);
  for (size_t i = 0; i < oc; i++) if (ok[i].used) tadd(ok[i].m, ok[i].ball, ok[i].ink, oi[i]);
  free(ok); free(oi);
}

// ---------------------------------------------------------------- par by A*
typedef struct { int f, g; u128 m; int ball; int goal; } PQ;
static PQ *heap; static size_t hn, hc;
static void hpush(PQ x) {
  if (hn == hc) { hc = hc ? hc * 2 : 1 << 16; heap = realloc(heap, hc * sizeof(PQ)); }
  size_t i = hn++;
  while (i) { size_t p = (i - 1) / 2; if (heap[p].f < x.f || (heap[p].f == x.f && heap[p].g >= x.g)) break; heap[i] = heap[p]; i = p; }
  heap[i] = x;
}
static PQ hpop(void) {
  PQ top = heap[0], x = heap[--hn];
  size_t i = 0;
  for (;;) {
    size_t c = 2 * i + 1;
    if (c >= hn) break;
    if (c + 1 < hn && (heap[c + 1].f < heap[c].f || (heap[c + 1].f == heap[c].f && heap[c + 1].g > heap[c].g))) c++;
    if (x.f < heap[c].f || (x.f == heap[c].f && x.g >= heap[c].g)) break;
    heap[i] = heap[c]; i = c;
  }
  heap[i] = x;
  return top;
}
static int gbest[1 << 0];
static int parAstar(long *expanded) {
  // key (mask, ball) with ink slot 0 storing best g in a side array
  tinit(1 << 20);
  int *best = malloc(sizeof(int) * (1 << 24)); size_t bn = 0, bc = 1 << 24;
  (void)gbest;
  hn = 0;
  u128 m0 = BIT(start);
  if (leftOf(m0) == 0) return 0;
  PQ s = {leftOf(m0), 0, m0, start, 0};
  tadd(m0, start, 0, bn); best[bn++] = 0;
  hpush(s);
  long ex = 0;
  while (hn) {
    PQ c = hpop();
    if (c.goal) { *expanded = ex; tfree(); free(best); return c.g; }
    long id = tfind(c.m, c.ball, 0);
    if (best[id] < c.g) continue;
    ex++;
    int lf = leftOf(c.m);
    for (int d = 0; d < 4; d++) {
      int L = rlen[c.ball][d];
      if (!L) continue;
      u128 full = c.m | rpre[c.ball][d][L];
      if (leftOf(full) == 0) {
        // the roll finishes the board: it only needs ink up to the last fresh block
        int need = 0;
        for (int k = 0; k < L; k++) if (!((c.m >> rpath[c.ball][d][k]) & 1)) need = k + 1;
        PQ gq = {c.g + need, c.g + need, 0, 0, 1};
        hpush(gq);
        continue;
      }
      int nb = rpath[c.ball][d][L - 1];
      int g = c.g + L;
      if ((FL & ~full & ~cover[nb]) != 0) continue; // stranded: never wins
      long j = tfind(full, nb, 0);
      if (j >= 0 && best[j] <= g) continue;
      if (j < 0) {
        if (bn == bc) { bc *= 2; best = realloc(best, sizeof(int) * bc); }
        tadd(full, nb, 0, bn); j = bn; best[bn++] = g;
      } else best[j] = g;
      PQ nq = {g + leftOf(full), g, full, nb, 0};
      hpush(nq);
    }
    (void)lf;
  }
  *expanded = ex; tfree(); free(best);
  return -1;
}

// ---------------------------------------------------------------- exact DP
#define NLA 12
static const int LA[NLA] = {0, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 30};
#define NHP 8
// heuristic careful players (all reject visibly losing moves first; *2 variants use lookahead 2 instead)
//  0 maxfresh   : uniform among careful moves with the most fresh blocks
//  1 newfirst   : uniform among careful moves that color something new (else all careful)
//  2 soft1      : weight exp(fresh - cost)
//  3 eff        : uniform among careful moves with the best fresh/cost
//  4 maxfresh-L3: maxfresh over lookahead-3 safe moves
//  5 newfirst-L3
//  6 soft1-L3
//  7 shortfirst : uniform among careful moves with the least cost that color something new (else all)
#define HINF 100000
typedef struct { double lines, pc, pu; int h; double pl[NLA]; double ph[NHP]; } Val;
static Val *vals; static size_t vn, vc;
static Val VWIN, VLOSE;
static long dpStates;

static const Val *dp(u128 m, int ball, int ink) {
  int lf = leftOf(m);
  if (lf == 0) return &VWIN;
  if (lf > ink || (FL & ~m & ~cover[ball]) != 0) return &VLOSE;
  long f = tfind(m, ball, ink);
  if (f >= 0) return &vals[f];
  Val kid[4]; int ok[4] = {0}, cost[4] = {0}, fresh[4] = {0};
  int legal = 0;
  for (int d = 0; d < 4; d++) {
    u128 nm; int nb;
    int k = mv(m, ball, ink, d, &nm, &nb);
    if (!k) continue;
    ok[d] = 1; legal++; cost[d] = k; fresh[d] = pop(nm & FL) - pop(m & FL);
    kid[d] = *dp(nm, nb, ink - k); // copy: vals may move
  }
  Val r; memset(&r, 0, sizeof r);
  int most = 0; int nsafe = 0;
  for (int d = 0; d < 4; d++) if (ok[d]) { r.lines += kid[d].lines; r.pu += kid[d].pu / legal; if (kid[d].h > most) most = kid[d].h; if (kid[d].h > 0) nsafe++; }
  r.h = most >= HINF ? HINF : most + 1;
  for (int d = 0; d < 4; d++) if (ok[d] && kid[d].h > 0) r.pc += kid[d].pc / nsafe;
  for (int l = 0; l < NLA; l++) {
    int c = 0; double s = 0;
    for (int d = 0; d < 4; d++) if (ok[d] && kid[d].h > LA[l]) { c++; s += kid[d].pl[l]; }
    r.pl[l] = c ? s / c : 0;
  }
  for (int g = 0; g < NHP; g++) {
    int look = (g >= 4 && g <= 6) ? 3 : 0;
    int type = g >= 4 && g <= 6 ? g - 4 : g;
    double w[4] = {0}, ws = 0, s = 0;
    int bestF = -1, anyNew = 0; double bestE = -1; int bestC = 1000;
    for (int d = 0; d < 4; d++) if (ok[d] && kid[d].h > look) {
      if (fresh[d] > bestF) bestF = fresh[d];
      if (fresh[d] > 0) { anyNew = 1; if (cost[d] < bestC) bestC = cost[d]; }
      double e = (double)fresh[d] / cost[d]; if (e > bestE) bestE = e;
    }
    for (int d = 0; d < 4; d++) if (ok[d] && kid[d].h > look) {
      if (type == 0) w[d] = fresh[d] == bestF;
      else if (type == 1) w[d] = !anyNew || fresh[d] > 0;
      else if (type == 2) w[d] = exp(fresh[d] - cost[d]);
      else if (type == 3) w[d] = fabs((double)fresh[d] / cost[d] - bestE) < 1e-12;
      else w[d] = !anyNew || (fresh[d] > 0 && cost[d] == bestC);
      ws += w[d]; s += w[d] * kid[d].ph[g];
    }
    r.ph[g] = ws > 0 ? s / ws : 0;
  }
  if (vn == vc) { vc = vc ? vc * 2 : 1 << 16; vals = realloc(vals, vc * sizeof(Val)); }
  vals[vn] = r; tadd(m, ball, ink, vn); vn++;
  dpStates++;
  return &vals[vn - 1];
}

static void dpMode(int ink) {
  VWIN.lines = 1; VWIN.pc = 1; VWIN.pu = 1; VWIN.h = HINF;
  for (int l = 0; l < NLA; l++) VWIN.pl[l] = 1;
  for (int g = 0; g < NHP; g++) VWIN.ph[g] = 1;
  memset(&VLOSE, 0, sizeof VLOSE);
  tinit(1 << 20); vn = 0;
  u128 m = BIT(start);
  Val root = *dp(m, start, ink);
  printf("lines %.0f careful0 %.4e uniform %.4e hroot %d states %ld\n", root.lines, root.pc, root.pu, root.h, dpStates);
  printf("lookahead");
  for (int l = 0; l < NLA; l++) printf(" L%d=%.4e", LA[l], root.pl[l]);
  printf("\nheur maxfresh=%.4e newfirst=%.4e soft1=%.4e eff=%.4e maxfreshL3=%.4e newfirstL3=%.4e soft1L3=%.4e shortfirst=%.4e\n",
         root.ph[0], root.ph[1], root.ph[2], root.ph[3], root.ph[4], root.ph[5], root.ph[6], root.ph[7]);
  // winnable fraction of careful-reachable positions
  long win = 0;
  for (size_t i = 0; i < vn; i++) if (vals[i].lines > 0) win++;
  printf("winnable %ld of %zu nonlosing positions reached (%.4f)\n", win, vn, (double)win / vn);
  // walk the first winning line in U, D, L, R order
  int ball = start; char line[512]; int ln = 0;
  int decisions = 0, wrong = 0, safeWrong = 0, hard = 0, hmax = 0; double hsum = 0;
  int left = ink;
  while (leftOf(m)) {
    int legal = 0, good = 0, safe = 0, worst = 0, next = -1;
    u128 nmN = 0; int nbN = 0, kN = 0;
    for (int d = 0; d < 4; d++) {
      u128 nm; int nb;
      int k = mv(m, ball, left, d, &nm, &nb);
      if (!k) continue;
      legal++;
      const Val *v = dp(nm, nb, left - k);
      int wins = v->lines > 0;
      if (wins) { good++; if (next < 0) { next = d; nmN = nm; nbN = nb; kN = k; } }
      if (!vlose(nm, nb, left - k)) {
        safe++;
        if (!wins) { safeWrong++; if (v->h > worst) worst = v->h; }
      }
    }
    if (next < 0) { printf("lost the line\n"); exit(1); }
    if (legal >= 2 && good == 1) decisions++;
    wrong += legal - good;
    if (safe >= 2 && good == 1) { hard++; hsum += worst; if (worst > hmax) hmax = worst; }
    m = nmN; ball = nbN; left -= kN; line[ln++] = LET[next];
  }
  line[ln] = 0;
  printf("line %s moves %d decisions %d wrong %d safeWrong %d hard %d horizon %.2f horizonMax %d inkPerFloor %.3f floors %d\n",
         line, ln, decisions, wrong, safeWrong, hard, hard ? hsum / hard : 0, hmax, (double)ink / floors, floors);
  tfree(); free(vals); vals = 0; vc = 0;
}

// ---------------------------------------------------------------- RNG
static uint64_t rs;
static inline uint64_t rnd(void) { rs ^= rs << 13; rs ^= rs >> 7; rs ^= rs << 17; return rs; }
static inline int rndn(int n) { return (int)(rnd() % (uint64_t)n); }

// ---------------------------------------------------------------- careful DFS with dead memo
static long nodes, budget;
static char dpath[512]; static int dlen;
static int usememo = 1;
static int order; // 0 random, 1 greedy fresh desc / cost asc with random ties, 2 fixed UDLR
static int dfs(u128 m, int ball, int ink) {
  if (++nodes > budget) return -1;
  if (leftOf(m) == 0) return 1;
  if (usememo && tfind(m, ball, ink) >= 0) return 0;
  int dirs[4], n = 0; u128 nms[4]; int nbs[4], ks[4]; double key[4];
  for (int d = 0; d < 4; d++) {
    u128 nm; int nb;
    int k = mv(m, ball, ink, d, &nm, &nb);
    if (!k) continue;
    if (vlose(nm, nb, ink - k)) continue;
    dirs[n] = d; nms[n] = nm; nbs[n] = nb; ks[n] = k;
    int fr = pop(nm & FL) - pop(m & FL);
    key[n] = order == 1 ? -(fr * 100.0 - k) + (rnd() % 1000) * 1e-6 : order == 0 ? (double)(rnd() % 1000000) : d;
    n++;
  }
  // sort by key ascending
  for (int a = 1; a < n; a++) for (int b = a; b > 0 && key[b] < key[b - 1]; b--) {
    double tk = key[b]; key[b] = key[b - 1]; key[b - 1] = tk;
    int t = dirs[b]; dirs[b] = dirs[b - 1]; dirs[b - 1] = t;
    u128 tm = nms[b]; nms[b] = nms[b - 1]; nms[b - 1] = tm;
    t = nbs[b]; nbs[b] = nbs[b - 1]; nbs[b - 1] = t;
    t = ks[b]; ks[b] = ks[b - 1]; ks[b - 1] = t;
  }
  for (int i = 0; i < n; i++) {
    dpath[dlen++] = LET[dirs[i]];
    int r = dfs(nms[i], nbs[i], ink - ks[i]);
    if (r != 0) return r;
    dlen--;
  }
  if (usememo) tadd(m, ball, ink, 0);
  return 0;
}
static int cmpl(const void *a, const void *b) { long x = *(long *)a, y = *(long *)b; return x < y ? -1 : x > y; }
static void dfsMode(int ink, int seeds, long bud, int ord) {
  order = ord; budget = bud;
  long *res = malloc(sizeof(long) * seeds);
  int solved = 0; double lsum = 0;
  for (int s = 0; s < seeds; s++) {
    rs = 0x9E3779B97F4A7C15ULL * (s + 1) + 12345;
    tinit(1 << 16); nodes = 0; dlen = 0;
    int r = dfs(BIT(start), start, ink);
    if (s == 0 && r == 1) { dpath[dlen] = 0; printf("seed0 line %s nodes %ld\n", dpath, nodes); }
    res[s] = r == 1 ? nodes : bud * 10; // unsolved counted as huge
    if (r == 1) solved++;
    lsum += log((double)(r == 1 ? nodes : bud));
    tfree();
  }
  qsort(res, seeds, sizeof(long), cmpl);
  printf("dfs order %d seeds %d solved %d median %ld p25 %ld p75 %ld geomean(capped) %.0f\n", ord, seeds, solved, res[seeds / 2], res[seeds / 4], res[(3 * seeds) / 4], exp(lsum / seeds));
  free(res);
}

// ---------------------------------------------------------------- beam
typedef struct { u128 m; int ball, ink; double v; uint64_t tie; } BS;
static int cmpbs(const void *a, const void *b) {
  const BS *x = a, *y = b;
  if (x->v != y->v) return x->v > y->v ? -1 : 1;
  return x->tie < y->tie ? -1 : x->tie > y->tie;
}
static double rarew[128];
static int beamTry(int ink0, int width, int sc, uint64_t seed) {
  BS *cur = malloc(sizeof(BS)), *nxt; int cn = 1;
  cur[0].m = BIT(start); cur[0].ball = start; cur[0].ink = ink0;
  rs = seed;
  for (int step = 0; step < 400 && cn; step++) {
    nxt = malloc(sizeof(BS) * cn * 4); int nn = 0;
    tinit(1 << 12);
    for (int i = 0; i < cn; i++) for (int d = 0; d < 4; d++) {
      u128 nm; int nb;
      int k = mv(cur[i].m, cur[i].ball, cur[i].ink, d, &nm, &nb);
      if (!k) continue;
      if (leftOf(nm) == 0) { tfree(); free(cur); free(nxt); return 1; }
      int ink = cur[i].ink - k;
      if (vlose(nm, nb, ink)) continue;
      if (tfind(nm, nb, ink) >= 0) continue;
      tadd(nm, nb, ink, 0);
      int col = pop(nm & FL) - 1, spent = ink0 - ink, lf = leftOf(nm);
      double v;
      if (sc == 0) v = col - spent;
      else if (sc == 1) v = -(spent + lf) * 1000.0 + col;
      else if (sc == 2) { double s = 0; for (int j = 0; j < N; j++) if (((nm & FL) >> j) & 1) s += rarew[j]; v = 6 * s + 0.5 * col - spent; }
      else v = 2.0 * col - spent; // sc 3
      nxt[nn].m = nm; nxt[nn].ball = nb; nxt[nn].ink = ink; nxt[nn].v = v; nxt[nn].tie = seed ? rnd() : (uint64_t)nn;
      nn++;
    }
    tfree();
    qsort(nxt, nn, sizeof(BS), cmpbs);
    if (nn > width) nn = width;
    free(cur); cur = nxt; cn = nn;
  }
  free(cur);
  return 0;
}
static void beamMode(int ink, int sc, int maxpow, int seeds) {
  // rarity weights: 1 / number of rolls (from stops reachable from the start) passing over the block
  int ways[128] = {0}; char seen[128] = {0}; int q[128], qn = 0; q[qn++] = start; seen[start] = 1;
  for (int qi = 0; qi < qn; qi++) { int a = q[qi]; for (int d = 0; d < 4; d++) { int L = rlen[a][d]; if (!L) continue; for (int k = 0; k < L; k++) ways[rpath[a][d][k]]++; int b = rpath[a][d][L - 1]; if (!seen[b]) { seen[b] = 1; q[qn++] = b; } } }
  for (int i = 0; i < N; i++) rarew[i] = ways[i] ? 1.0 / ways[i] : 1;
  rarew[start] = 0;
  printf("beam scoring %d:", sc);
  for (int s = 0; s < seeds; s++) {
    uint64_t seed = s == 0 ? 0 : 0x1234567ULL * s + 99;
    int found = -1;
    for (int p = 0; p <= maxpow; p++) if (beamTry(ink, 1 << p, sc, seed)) { found = 1 << p; break; }
    printf(" %d", found);
  }
  printf("\n");
}

// ---------------------------------------------------------------- NMCS
static int careful(u128 m, int ball, int ink, int *dirs, u128 *nms, int *nbs, int *ks) {
  int n = 0;
  for (int d = 0; d < 4; d++) {
    u128 nm; int nb;
    int k = mv(m, ball, ink, d, &nm, &nb);
    if (!k) continue;
    if (vlose(nm, nb, ink - k)) continue;
    dirs[n] = d; nms[n] = nm; nbs[n] = nb; ks[n] = k; n++;
  }
  return n;
}
static long playouts;
static int playout(u128 m, int ball, int ink, int *seq, int *sn) {
  playouts++;
  for (;;) {
    if (leftOf(m) == 0) return 1000;
    int dirs[4], nbs[4], ks[4]; u128 nms[4];
    int n = careful(m, ball, ink, dirs, nms, nbs, ks);
    if (!n) return pop(m & FL);
    int p = rndn(n);
    seq[(*sn)++] = dirs[p]; m = nms[p]; ball = nbs[p]; ink -= ks[p];
  }
}
static int nested(u128 m, int ball, int ink, int lvl, int *outSeq, int *outN) {
  if (lvl == 0) return playout(m, ball, ink, outSeq, outN);
  int best = -1, bestSeq[256], bn = 0, line[256], ln = 0;
  for (;;) {
    if (leftOf(m) == 0) { memcpy(outSeq + *outN, line, ln * sizeof(int)); *outN += ln; return 1000; }
    int dirs[4], nbs[4], ks[4]; u128 nms[4];
    int n = careful(m, ball, ink, dirs, nms, nbs, ks);
    if (!n) break;
    for (int i = 0; i < n; i++) {
      int seq[256], sn = 0;
      int sc = nested(nms[i], nbs[i], ink - ks[i], lvl - 1, seq, &sn);
      if (sc > best) { best = sc; memcpy(bestSeq, line, ln * sizeof(int)); bestSeq[ln] = dirs[i]; memcpy(bestSeq + ln + 1, seq, sn * sizeof(int)); bn = ln + 1 + sn; }
      if (best == 1000) break;
    }
    if (bn <= ln) break;
    int d = bestSeq[ln];
    u128 nm; int nb;
    int k = mv(m, ball, ink, d, &nm, &nb);
    m = nm; ball = nb; ink -= k; line[ln++] = d;
  }
  memcpy(outSeq + *outN, bestSeq, bn * sizeof(int)); *outN += bn;
  return best < 0 ? pop(m & FL) : best;
}
static int seedOff = 0;
static void nmcsMode(int ink, int lvl, int seeds) {
  int wins = 0; long totalPlay = 0;
  for (int s = seedOff; s < seedOff + seeds; s++) {
    rs = 0xABCDEF12345ULL + 7919ULL * s; playouts = 0;
    int seq[512], sn = 0;
    if (nested(BIT(start), start, ink, lvl, seq, &sn) == 1000) wins++;
    totalPlay += playouts;
  }
  printf("nmcs level %d wins %d of %d (playouts per run %.0f)\n", lvl, wins, seeds, (double)totalPlay / seeds);
}

// ---------------------------------------------------------------- heuristic Monte Carlo with restarts
// softmax(beta * (fresh - cost)) over careful moves; playouts until first win (capped)
static void mcMode(int ink, double beta, long maxPlay, int seeds) {
  long *res = malloc(sizeof(long) * seeds); int solved = 0;
  for (int s = 0; s < seeds; s++) {
    rs = 0x5555ULL + 104729ULL * s;
    long p;
    for (p = 1; p <= maxPlay; p++) {
      u128 m = BIT(start); int ball = start, left = ink; int won = 0;
      for (;;) {
        if (leftOf(m) == 0) { won = 1; break; }
        int dirs[4], nbs[4], ks[4]; u128 nms[4];
        int n = careful(m, ball, left, dirs, nms, nbs, ks);
        if (!n) break;
        double w[4], ws = 0;
        for (int i = 0; i < n; i++) { int fr = pop(nms[i] & FL) - pop(m & FL); w[i] = exp(beta * (fr - ks[i])); ws += w[i]; }
        double r = (rnd() >> 11) * (1.0 / 9007199254740992.0) * ws;
        int pick = n - 1;
        for (int i = 0; i < n; i++) { if (r < w[i]) { pick = i; break; } r -= w[i]; }
        m = nms[pick]; ball = nbs[pick]; left -= ks[pick];
      }
      if (won) break;
    }
    res[s] = p; if (p <= maxPlay) solved++;
  }
  qsort(res, seeds, sizeof(long), cmpl);
  printf("mc beta %.2f solved %d of %d, median playouts %ld\n", beta, solved, seeds, res[seeds / 2]);
  free(res);
}


// ---------------------------------------------------------------- counter-intuitive moves on each winning line
// at each position of a winning line, among the careful moves: is the winning move below the best
// (a) fresh blocks, (b) fresh/cost, (c) fresh-cost?  rank = how many careful moves strictly beat it on fresh
static int bestA = 1 << 30, bestB = 1 << 30, bestC = 1 << 30, bestR = 1 << 30, nlines;
static void walkLines(u128 m, int ball, int ink, int a, int b, int c, int r) {
  if (leftOf(m) == 0) { nlines++; if (a < bestA) bestA = a; if (b < bestB) bestB = b; if (c < bestC) bestC = c; if (r < bestR) bestR = r; return; }
  int dirs[4], nbs[4], ks[4]; u128 nms[4];
  int n = careful(m, ball, ink, dirs, nms, nbs, ks);
  int fr[4]; double ef[4]; int fc[4]; int maxF = -1; double maxE = -1; int maxC = -1000;
  for (int i = 0; i < n; i++) { fr[i] = pop(nms[i] & FL) - pop(m & FL); ef[i] = (double)fr[i] / ks[i]; fc[i] = fr[i] - ks[i];
    if (fr[i] > maxF) maxF = fr[i]; if (ef[i] > maxE) maxE = ef[i]; if (fc[i] > maxC) maxC = fc[i]; }
  for (int i = 0; i < n; i++) {
    const Val *v = dp(nms[i], nbs[i], ink - ks[i]);
    if (v->lines <= 0) continue;
    int rank = 0; for (int j = 0; j < n; j++) if (fr[j] > fr[i]) rank++;
    walkLines(nms[i], nbs[i], ink - ks[i], a + (fr[i] < maxF), b + (ef[i] < maxE - 1e-12), c + (fc[i] < maxC), r + rank);
  }
}
static void linesMode(int ink) {
  VWIN.lines = 1; VWIN.pc = 1; VWIN.pu = 1; VWIN.h = HINF;
  for (int l = 0; l < NLA; l++) VWIN.pl[l] = 1;
  for (int g = 0; g < NHP; g++) VWIN.ph[g] = 1;
  memset(&VLOSE, 0, sizeof VLOSE);
  tinit(1 << 20); vn = 0;
  dp(BIT(start), start, ink);
  walkLines(BIT(start), start, ink, 0, 0, 0, 0);
  printf("lines %d counterFresh %d counterEff %d counterGain %d freshRankSum %d\n", nlines, bestA, bestB, bestC, bestR);
}

int main(int argc, char **argv) {
  if (argc < 3) { fprintf(stderr, "usage\n"); return 2; }
  load(argv[2]);
  const char *mode = argv[1];
  if (!strcmp(mode, "par")) {
    long ex = 0;
    clock_t t0 = clock();
    int p = parAstar(&ex);
    printf("size %dx%d floors %d par %d expanded %ld time %.2fs\n", W, H, floors, p, ex, (double)(clock() - t0) / CLOCKS_PER_SEC);
    // max roll
    int mx = 0; for (int i = 0; i < N; i++) for (int d = 0; d < 4; d++) if (rlen[i][d] > mx) mx = rlen[i][d];
    // all floor reachable as a roll target?
    printf("maxroll %d coverAllFromStart %d\n", mx, (FL & ~cover[start] & ~BIT(start)) == 0);
  } else if (!strcmp(mode, "dp")) dpMode(atoi(argv[3]));
  else if (!strcmp(mode, "dfs")) (usememo = argc > 7 ? atoi(argv[7]) : 1), dfsMode(atoi(argv[3]), atoi(argv[4]), atol(argv[5]), atoi(argv[6]));
  else if (!strcmp(mode, "beam")) beamMode(atoi(argv[3]), atoi(argv[4]), atoi(argv[5]), argc > 6 ? atoi(argv[6]) : 1);
  else if (!strcmp(mode, "nmcs")) (seedOff = argc > 6 ? atoi(argv[6]) : 0), nmcsMode(atoi(argv[3]), atoi(argv[4]), atoi(argv[5]));
  else if (!strcmp(mode, "lines")) linesMode(atoi(argv[3]));
  else if (!strcmp(mode, "mc")) mcMode(atoi(argv[3]), atof(argv[4]), atol(argv[5]), atoi(argv[6]));
  return 0;
}
