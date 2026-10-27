// The node's decisions, with no Arduino in them so they can be tested on a PC.
// Every rule here mirrors the TypeScript the simulator and dashboard run:
//   classify()  <->  classifyStatus() in src/sensor/status.ts
//   History     <->  riseRate()       in src/sensor/status.ts
// firmware/test-vectors.json holds cases generated from the TypeScript; the
// host test (firmware/test/logic_test.cpp) checks this file against all of them.
#pragma once
#include <stdint.h>
#include <stdio.h>

enum Status : uint8_t { NORMAL = 0, ADVISORY = 1, WARNING = 2, EVACUATE = 3 };

namespace bb {

// Same numbers as THRESHOLDS, RATE_ESCALATE_CM in src/config.ts (m above the gauge zero).
const float TH_ADVISORY = 2.0f;
const float TH_WARNING = 2.8f;
const float TH_EVACUATE = 3.3f;
const float RATE_ESCALATE_CM = 30.0f;
// The level must fall this far under a threshold before the status steps down.
const float HYSTERESIS = 0.08f;

inline const char* statusName(Status s) {
  static const char* const names[] = {"NORMAL", "ADVISORY", "WARNING", "EVACUATE"};
  return names[s];
}

// level in m, rate in cm per 10 min, cur = status before this reading.
inline Status classify(float level, float rate, Status cur) {
  const float limits[3] = {TH_ADVISORY, TH_WARNING, TH_EVACUATE};
  int idx = 0;
  int byLevel = 0;
  for (int i = 0; i < 3; i++) {
    if (level >= limits[i] - ((int)cur > i ? HYSTERESIS : 0.0f)) idx = i + 1;
    if (level >= limits[i]) byLevel++;
  }
  // A fast rise counts one step above what the plain level says, never more, so a status
  // that a fast rise already raised is not raised again.
  bool fast = rate >= RATE_ESCALATE_CM || ((int)cur > byLevel && rate >= RATE_ESCALATE_CM * 0.6f);
  if (fast && level >= TH_ADVISORY - 0.5f) {
    int up = byLevel + 1 > 3 ? 3 : byLevel + 1;
    if (up > idx) idx = up;
  }
  return (Status)idx;
}

// Median of n values (sorts them in place). Returns -1 when there are none.
inline float median(float* v, int n) {
  if (n <= 0) return -1.0f;
  for (int i = 1; i < n; i++) {
    float x = v[i];
    int j = i - 1;
    while (j >= 0 && v[j] > x) {
      v[j + 1] = v[j];
      j--;
    }
    v[j + 1] = x;
  }
  return (n & 1) ? v[n / 2] : 0.5f * (v[n / 2 - 1] + v[n / 2]);
}

// Echo time to distance in cm, corrected for the air temperature in degrees C.
inline float echoToCm(float echoUs, float tempC) {
  const float speed = 331.3f + 0.606f * tempC;  // m/s
  return echoUs * 1e-6f * speed * 50.0f;         // there and back, m to cm
}

// The last ten minutes of levels, one sample every 5 s, for the rise rate.
// A plain struct with no constructor, so it can live in RTC memory (`= {}` is all the setup it needs).
struct History {
  static const int N = 140;
  uint32_t t[N];
  float level[N];
  int head;
  int count;

  void push(uint32_t seconds, float lv) {
    t[head] = seconds;
    level[head] = lv;
    head = (head + 1) % N;
    if (count < N) count++;
  }

  // cm per 10 min from the oldest sample inside the last 10 minutes. Zero until there is a minute of data.
  float rate(uint32_t now, float lv) const {
    for (int i = 0; i < count; i++) {
      int idx = (head - count + i + N) % N;
      if (t[idx] + 600 >= now) {
        uint32_t dt = now - t[idx];
        if (dt < 60) return 0.0f;
        return (lv - level[idx]) * 100.0f * 600.0f / (float)dt;
      }
    }
    return 0.0f;
  }
};

// The text the captain gets when the network is down. Plain ASCII, one 160-character SMS.
// Same wording as smsText() in src/net/offline.ts.
inline int smsText(char* out, int size, Status s, float levelCm, float rateCm) {
  static const char* const action[] = {"Water is falling. Stay alert.", "Prepare go-bags.", "Low-lying homes go to the Barangay Hall now.",
                                       "EVERYONE to the Barangay Hall now!"};
  int r = (int)(rateCm >= 0 ? rateCm + 0.5f : rateCm - 0.5f);
  int l = (int)(levelCm + 0.5f);
  return snprintf(out, size, "BANTAY BAHA bb-01 %s: %dcm, %s%dcm/10min. %s", statusName(s), l, r >= 0 ? "+" : "", r, action[s]);
}

}  // namespace bb
