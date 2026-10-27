// Everything you set for your own node. Wi-Fi and phone numbers live in secrets.h, which is not committed.
#pragma once

// ---- Mounting -------------------------------------------------------------
// Height of the transducer face above the gauge zero, in metres, measured with a tape and a level on a calm day.
// docs/sensor-node.md recommends about 6 m for the cheap JSN-SR04T. The simulator uses 7.00, so to try this
// node against the simulator, set both to the same number (SENSOR_HEIGHT in src/config.ts).
#define MOUNT_HEIGHT_M 6.00f

// ---- Pins (match the wiring diagram in docs/sensor-node.md) ----------------
#define PIN_TRIG 5
#define PIN_ECHO 18   // behind the 20k/10k divider
#define PIN_BEACON 25 // MOSFET gate, switches the 5 V strobe
#define PIN_LED 26    // status LED on the lid, through 220 ohm
// Optional: battery voltage through two equal resistors (100k + 100k) to this pin. -1 = not fitted.
#define PIN_BATT_ADC -1
// Optional GSM module for the offline fallback (SIM7600 or A7670 for 4G, SIM800L where 2G is still on).
#define GSM_RX 16 // ESP32 RX2, to the module's TX
#define GSM_TX 17 // ESP32 TX2, to the module's RX

// ---- Measuring -------------------------------------------------------------
#define PINGS_PER_READING 5      // the median of these is the reading
#define PING_GAP_MS 60
#define PING_TIMEOUT_US 38000UL  // about 6.5 m, longer than any real echo
#define MIN_DISTANCE_CM 25.0f    // the JSN-SR04T cannot see closer than this
#define MIN_GOOD_PINGS 3         // fewer good echoes than this and the reading is thrown away
#define SAMPLE_EVERY_S 5         // history for the rise rate is always one sample per 5 s
#define FAST_EVERY_S 2           // publish this often while the water is at ADVISORY or above

// ---- Network ---------------------------------------------------------------
#define MQTT_TOPIC "bantaybaha/sensor/01"
#define DEVICE_ID "bb-01"
#define MQTT_PORT 1883

// ---- Power -----------------------------------------------------------------
#define BATT_LOW_V 3.55f         // while NORMAL and below this, sleep between readings
#define SLEEP_S 60

// ---- Offline fallback ------------------------------------------------------
#define OFFLINE_AFTER_S 30       // no MQTT for this long counts as offline
#define SMS_REPEAT_S 900         // while offline and at WARNING or above, text again every 15 min
