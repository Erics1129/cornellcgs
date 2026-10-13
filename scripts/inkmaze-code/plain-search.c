/*
 * Ink Maze level 26: the plain brute force behind the hidden tests' claims,
 * natively. The same search as problem.ts plainSearch(): depth-first, the
 * four moves in a fixed order (all 24 orders), rolls exactly as the engine
 * does (the ink can run dry mid-roll), stop at the first win, give up on a
 * line when the ink is gone, no memo; with PRUNE also when the ink left is
 * less than the blocks still uncolored.
 *
 *   cc -O2 -o /tmp/plain-search scripts/inkmaze-code/plain-search.c
 *   /tmp/plain-search one GRID INK ORDER PRUNE CAP     calls until the first win (-1: none within CAP)
 *   /tmp/plain-search check GRID INK PMAX UMIN         the pruned search wins within PMAX calls in every
 *                                                      order and the plain one needs more than UMIN in every order
 *   /tmp/plain-search measure GRID INK [UCAP] [PCAP]   both searches, every order
 *
 * GRID has '/' between rows. problem.ts UNPRUNED_SEARCH_FLOOR (2,000,000,000)
 * comes from `check` on each larger hidden board (7 x 7 to 8 x 8) with UMIN
 * 2000000000: no move order wins within two billion calls, which is over 20 s
 * of compiled C per order (about 90 million calls a second on an M5 Max),
 * while PRUNED_SEARCH_BUDGET calls are enough with the pruning.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <time.h>
static int W, H, NF, START;
static int id[256];
static int RL[128][4], RP[128][4][16];
static const int DX[4] = {0, 0, -1, 1}, DY[4] = {-1, 1, 0, 0};
static unsigned char col[128];
static int cnt; static long nodes, cap; static int prune;
static int ord[4];
static int go(int at, int left) {
  if (++nodes > cap) return 0;
  if (cnt == NF) return 1;
  if (left <= 0) return 0;
  if (prune && left < NF - cnt) return 0;
  for (int i = 0; i < 4; i++) {
    int d = ord[i], L = RL[at][d];
    if (!L) continue;
    int k = L < left ? L : left, fr[16], nfr = 0;
    for (int j = 0; j < k; j++) { int b = RP[at][d][j]; if (!col[b]) { col[b] = 1; fr[nfr++] = b; } }
    cnt += nfr;
    if (go(RP[at][d][k - 1], left - k)) return 1;
    cnt -= nfr;
    for (int j = 0; j < nfr; j++) col[fr[j]] = 0;
    if (nodes > cap) return 0;
  }
  return 0;
}
static int setup(char *g) {
  char rows[16][32]; int nr = 0, x = 0;
  for (char *p = g;; p++) { if (*p == '/' || !*p) { rows[nr][x] = 0; nr++; x = 0; if (!*p) break; continue; } rows[nr][x++] = *p; }
  H = nr; W = strlen(rows[0]); NF = 0; START = -1;
  for (int y = 0; y < H; y++) for (int xx = 0; xx < W; xx++) { char c = rows[y][xx]; int i = y * W + xx; id[i] = -1; if (c != '#') { if (c == 'o') START = NF; id[i] = NF++; } }
  for (int y = 0; y < H; y++) for (int xx = 0; xx < W; xx++) {
    int i = y * W + xx; if (id[i] < 0) continue;
    for (int d = 0; d < 4; d++) {
      int cx = xx, cy = y, k = 0;
      for (;;) { cx += DX[d]; cy += DY[d]; if (cx < 0 || cy < 0 || cx >= W || cy >= H || id[cy * W + cx] < 0) break; RP[id[i]][d][k++] = id[cy * W + cx]; }
      RL[id[i]][d] = k;
    }
  }
  return 0;
}
static int ORD[24][4];
static void orders(void) { int n = 0; for (int a = 0; a < 4; a++) for (int b = 0; b < 4; b++) for (int c = 0; c < 4; c++) for (int d = 0; d < 4; d++) if (a != b && a != c && a != d && b != c && b != d && c != d) { ORD[n][0] = a; ORD[n][1] = b; ORD[n][2] = c; ORD[n][3] = d; n++; } }
static long run1(int ink, int o, int pr, long cp) {
  memset(col, 0, sizeof col); col[START] = 1; cnt = 1; nodes = 0; cap = cp; prune = pr; memcpy(ord, ORD[o], sizeof ord);
  int r = go(START, ink);
  return r ? nodes : -1;
}
int main(int argc, char **argv) {
  orders();


  if (!strcmp(argv[1], "one")) { // one GRID INK ORDER PRUNE CAP
    setup(argv[2]); printf("%ld\n", run1(atoi(argv[3]), atoi(argv[4]), atoi(argv[5]), atol(argv[6]))); return 0;
  }
  if (!strcmp(argv[1], "check")) { // check GRID INK pmax umin: pruned max over orders <= pmax and every unpruned order > umin
    setup(argv[2]); int ink = atoi(argv[3]); long pmax = atol(argv[4]), umin = atol(argv[5]);
    long worst = 0, sum = 0;
    for (int o = 0; o < 24; o++) { long p = run1(ink, o, 1, pmax); if (p < 0) { printf("reject pruned order %d\n", o); return 0; } if (p > worst) worst = p; sum += p; }
    long ufirst = run1(ink, 0, 0, umin);
    if (ufirst >= 0) { printf("reject unpruned order 0 %ld\n", ufirst); return 0; }
    for (int o = 1; o < 24; o++) { long u = run1(ink, o, 0, umin); if (u >= 0) { printf("reject unpruned order %d %ld\n", o, u); return 0; } }
    printf("ok floors %d prunedMax %ld prunedMean %ld\n", NF, worst, sum / 24);
    return 0;
  }
  if (!strcmp(argv[1], "measure")) {
    setup(argv[2]); int ink = atoi(argv[3]);
    long ucap = argc > 4 ? atol(argv[4]) : 100000000L, pcap = argc > 5 ? atol(argv[5]) : 100000000L;
    long umin = -2, pmax = 0; int uf = 0;
    for (int o = 0; o < 24; o++) {
      long u = run1(ink, o, 0, ucap), p = run1(ink, o, 1, pcap);
      printf("order %c%c%c%c unpruned %ld pruned %ld\n", "UDLR"[ORD[o][0]], "UDLR"[ORD[o][1]], "UDLR"[ORD[o][2]], "UDLR"[ORD[o][3]], u, p);
      if (u >= 0) { uf++; if (umin == -2 || u < umin) umin = u; }
      if (p < 0) pmax = -1; else if (pmax >= 0 && p > pmax) pmax = p;
    }
    printf("summary floors %d unprunedSolved %d/24 unprunedMin %ld prunedMax %ld\n", NF, uf, umin, pmax);
    return 0;
  }
  return 0;
}
