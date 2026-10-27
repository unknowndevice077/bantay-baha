// Host test for the node's logic. No Arduino needed:
//   g++ -std=c++11 -Wall -I firmware/bantay-baha-node firmware/test/logic_test.cpp -o logic_test && ./logic_test
#include <math.h>
#include <stdio.h>
#include <string.h>
#include "bantay_logic.h"

struct Case {
  float level, rate;
  int current, expect;
};

// Generated from classifyStatus() in src/sensor/status.ts (see firmware/test-vectors.json).
static const Case CASES[] = {
#include "vectors.inc"
};

static int failures = 0;
#define CHECK(cond, ...)             \
  do {                               \
    if (!(cond)) {                   \
      failures++;                    \
      printf("FAIL: " __VA_ARGS__);  \
      printf("\n");                  \
    }                                \
  } while (0)

int main() {
  const int n = sizeof(CASES) / sizeof(CASES[0]);
  for (int i = 0; i < n; i++) {
    const Case& c = CASES[i];
    Status got = bb::classify(c.level, c.rate, (Status)c.current);
    CHECK(got == c.expect, "classify(%.2f m, %.1f cm/10min, from %d) = %d, TypeScript says %d", c.level, c.rate, c.current, got, c.expect);
  }

  // median
  float a[5] = {5, 1, 4, 2, 3};
  CHECK(bb::median(a, 5) == 3.0f, "median of five");
  float b[4] = {4, 1, 3, 2};
  CHECK(fabsf(bb::median(b, 4) - 2.5f) < 1e-6f, "median of four");
  float one[1] = {7};
  CHECK(bb::median(one, 1) == 7.0f, "median of one");
  CHECK(bb::median(one, 0) < 0, "median of none");

  // echo time: 6 m away at 28 C is about 35 ms
  float cm = bb::echoToCm(35000.0f, 28.0f);
  CHECK(cm > 595 && cm < 610, "echoToCm gave %.1f", cm);

  // rise rate, same cases as tests/status.test.ts
  static bb::History h = {};
  h.push(0, 1.0f);
  CHECK(fabsf(h.rate(600, 1.5f) - 50.0f) < 0.01f, "10 minute rise");
  CHECK(fabsf(h.rate(300, 1.25f) - 50.0f) < 0.01f, "5 minute rise scaled to 10");
  CHECK(h.rate(30, 2.0f) == 0.0f, "no rate before a minute of data");
  bb::History empty = {};
  CHECK(empty.rate(600, 1.5f) == 0.0f, "no rate with no history");

  // SMS: same text as smsText() in src/net/offline.ts, and one message long
  char sms[161];
  bb::smsText(sms, sizeof sms, WARNING, 285.4f, 31.6f);
  CHECK(strcmp(sms, "BANTAY BAHA bb-01 WARNING: 285cm, +32cm/10min. Low-lying homes go to the Barangay Hall now.") == 0, "sms text: %s", sms);
  CHECK(strlen(sms) <= 160, "sms length");

  printf(failures ? "%d FAILED\n" : "all %d cases and checks passed\n", failures ? failures : n);
  return failures ? 1 : 0;
}
