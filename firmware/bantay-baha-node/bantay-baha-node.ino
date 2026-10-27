// Bantay Baha sensor node: ESP32 + JSN-SR04T on a pole over the creek.
//
// Measures the water, works out the alert level itself, flashes the beacon, publishes
// JSON over MQTT, and texts the captain when the network is down. See docs/sensor-node.md
// for the wiring and the loop this implements, and firmware/README.md to build it.
//
// Libraries: PubSubClient (Nick O'Leary). Board: ESP32 Dev Module (Arduino core 2.x or 3.x).

#include <WiFi.h>
#include <PubSubClient.h>
#include <stdio.h>
#include "config.h"
#include "secrets.h"
#include "bantay_logic.h"

// Kept across deep sleep, so the rise rate and the clock survive it.
RTC_DATA_ATTR bb::History history = {};
RTC_DATA_ATTR uint32_t sleptSeconds = 0;
RTC_DATA_ATTR uint8_t savedStatus = NORMAL;
RTC_DATA_ATTR uint32_t lastHistoryPush = 0;

WiFiClient wifi;
PubSubClient mqtt(wifi);
HardwareSerial gsm(2);

volatile Status status = NORMAL;  // read by the indicator task as well
uint32_t seq = 0;
uint32_t lastReading = 0;
uint32_t lastConnectTry = 0;
uint32_t lastMqttOk = 0;
uint32_t lastSms = 0;
bool smsSentForStatus = false;
float lastLevelCm = 0;
float lastRate = 0;

// Seconds since first power-up, including time spent asleep.
uint32_t nowS() { return sleptSeconds + millis() / 1000; }

// ---- Measuring ---------------------------------------------------------------

// One ping: echo time in microseconds, or 0 when nothing came back.
uint32_t ping() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(4);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(12);
  digitalWrite(PIN_TRIG, LOW);
  return (uint32_t)pulseIn(PIN_ECHO, HIGH, PING_TIMEOUT_US);
}

// Distance in cm from the median of several pings. Rain and insects give single bad echoes,
// so ones that came back impossibly early, or never, are dropped first. Returns -1 if too few were good.
float measureCm() {
  const float tempC = constrain(temperatureRead(), 5.0f, 60.0f);  // the chip's own sensor: close enough for a few cm
  float good[PINGS_PER_READING];
  int n = 0;
  for (int i = 0; i < PINGS_PER_READING; i++) {
    uint32_t us = ping();
    if (us > 0) {
      float cm = bb::echoToCm((float)us, tempC);
      if (cm >= MIN_DISTANCE_CM) good[n++] = cm;
    }
    delay(PING_GAP_MS);
  }
  if (n < MIN_GOOD_PINGS) return -1.0f;
  return bb::median(good, n);
}

float batteryV() {
#if PIN_BATT_ADC >= 0
  return 2.0f * analogReadMilliVolts(PIN_BATT_ADC) / 1000.0f;
#else
  return 0.0f;
#endif
}

// ---- Beacon and LED ----------------------------------------------------------
// The beacon and LED follow the node's own reading, never the network, so the pole still warns when the hall is dark.
// They run in their own task, so a slow Wi-Fi connect or a modem call never makes the flash stutter.

void updateIndicators() {
  const uint32_t ms = millis();
  const Status now = status;
  bool beacon = false;
  uint32_t period = 0;  // LED blink period
  switch (now) {
    case NORMAL: period = 5000; break;
    case ADVISORY: period = 2000; break;
    case WARNING:
      beacon = (ms / 500) % 2 == 0;
      period = 1000;
      break;
    case EVACUATE:
      beacon = (ms / 200) % 2 == 0;
      period = 400;
      break;
  }
  digitalWrite(PIN_BEACON, beacon ? HIGH : LOW);
  // Short blink at the start of each period, longer as it gets more urgent.
  const uint32_t on = now == NORMAL ? 60 : period / 2;
  digitalWrite(PIN_LED, (ms % period) < on ? HIGH : LOW);
}

// ---- Network -------------------------------------------------------------------

void keepConnected() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastConnectTry > 10000 || lastConnectTry == 0) {
      lastConnectTry = millis();
      WiFi.begin(WIFI_SSID, WIFI_PASS);
    }
    return;
  }
  if (!mqtt.connected() && millis() - lastConnectTry > 5000) {
    lastConnectTry = millis();
    mqtt.setServer(MQTT_HOST, MQTT_PORT);
    mqtt.connect(DEVICE_ID);
  }
  if (mqtt.connected()) {
    mqtt.loop();
    lastMqttOk = nowS();
  }
}

bool online() { return mqtt.connected(); }

// Same JSON the simulator publishes (src/sensor/esp32.ts), so the dashboard reads either one.
void publishReading(float distanceCm) {
  char buf[256];
  snprintf(buf, sizeof buf,
           "{\"id\":\"%s\",\"seq\":%lu,\"distance_cm\":%.1f,\"level_cm\":%.1f,\"rate_cm10\":%.1f,\"status\":\"%s\","
           "\"batt_v\":%.2f,\"rssi\":%d,\"temp_c\":%.1f,\"heap_kb\":%lu,\"uptime_s\":%lu}",
           DEVICE_ID, (unsigned long)++seq, distanceCm, lastLevelCm, lastRate, bb::statusName(status), batteryV(),
           WiFi.RSSI(), temperatureRead(), (unsigned long)(ESP.getFreeHeap() / 1024), (unsigned long)nowS());
  mqtt.publish(MQTT_TOPIC, buf);
}

void publishFault() {
  char buf[96];
  snprintf(buf, sizeof buf, "{\"id\":\"%s\",\"seq\":%lu,\"error\":\"no_echo\"}", DEVICE_ID, (unsigned long)++seq);
  mqtt.publish(MQTT_TOPIC, buf);
}

// ---- Offline fallback: SMS to the captain ------------------------------------------

// Sends one AT command and waits for the module to answer (or give up).
bool at(const char* cmd, const char* expect, uint32_t timeoutMs) {
  while (gsm.available()) gsm.read();
  gsm.println(cmd);
  uint32_t until = millis() + timeoutMs;
  String got;
  while (millis() < until) {
    while (gsm.available()) got += (char)gsm.read();
    if (got.indexOf(expect) >= 0) return true;
    if (got.indexOf("ERROR") >= 0) return false;
  }
  return false;
}

void sendSms(const char* number, const char* text) {
  if (!at("AT+CMGF=1", "OK", 2000)) return;
  char cmd[40];
  snprintf(cmd, sizeof cmd, "AT+CMGS=\"%s\"", number);
  if (!at(cmd, ">", 4000)) return;
  gsm.print(text);
  gsm.write(0x1A);  // Ctrl-Z ends the message
  uint32_t until = millis() + 15000;
  String got;
  while (millis() < until) {
    while (gsm.available()) got += (char)gsm.read();
    if (got.indexOf("OK") >= 0 || got.indexOf("ERROR") >= 0) break;
  }
}

// While the network is down: text on every rise to WARNING or above, and again every SMS_REPEAT_S.
void offlineFallback() {
  if (CAPTAIN_COUNT == 0 || status < WARNING) {
    smsSentForStatus = false;
    return;
  }
  const bool offline = !online() && nowS() - lastMqttOk > OFFLINE_AFTER_S;
  if (!offline) return;
  const bool due = !smsSentForStatus || nowS() - lastSms >= SMS_REPEAT_S;
  if (!due) return;
  char text[161];
  bb::smsText(text, sizeof text, status, lastLevelCm, lastRate);
  for (int i = 0; i < CAPTAIN_COUNT; i++) sendSms(CAPTAIN_NUMBERS[i], text);
  smsSentForStatus = true;
  lastSms = nowS();
}

// ---- Main loop -----------------------------------------------------------------------

void takeReading() {
  const float cm = measureCm();
  if (cm < 0) {  // no usable echo: say so, change nothing
    if (online()) publishFault();
    return;
  }
  const uint32_t t = nowS();
  lastLevelCm = MOUNT_HEIGHT_M * 100.0f - cm;
  const float level = lastLevelCm / 100.0f;
  lastRate = history.rate(t, level);
  const Status next = bb::classify(level, lastRate, status);
  if (next != status) smsSentForStatus = false;
  status = next;
  savedStatus = status;
  if (t - lastHistoryPush >= SAMPLE_EVERY_S || history.count == 0) {
    history.push(t, level);
    lastHistoryPush = t;
  }
  if (online()) publishReading(cm);
}

void indicatorTask(void*) {
  for (;;) {
    updateIndicators();
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void setup() {
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_BEACON, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_BEACON, LOW);
  status = (Status)savedStatus;
  gsm.begin(115200, SERIAL_8N1, GSM_RX, GSM_TX);
  WiFi.mode(WIFI_STA);
  mqtt.setSocketTimeout(2);
  lastMqttOk = nowS();
  xTaskCreate(indicatorTask, "indicators", 2048, NULL, 1, NULL);
}

void loop() {
  keepConnected();

  const uint32_t every = status >= ADVISORY ? FAST_EVERY_S : SAMPLE_EVERY_S;
  if (lastReading == 0 || nowS() - lastReading >= every) {
    lastReading = nowS();
    takeReading();
    offlineFallback();
  }

  // Quiet creek, flat battery: sleep between readings. Never while the water is up.
  if (status == NORMAL && PIN_BATT_ADC >= 0 && batteryV() > 0 && batteryV() < BATT_LOW_V) {
    digitalWrite(PIN_BEACON, LOW);
    digitalWrite(PIN_LED, LOW);
    sleptSeconds += millis() / 1000 + SLEEP_S;
    esp_sleep_enable_timer_wakeup((uint64_t)SLEEP_S * 1000000ULL);
    esp_deep_sleep_start();
  }
}
