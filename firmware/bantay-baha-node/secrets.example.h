// Copy this file to secrets.h and fill it in. secrets.h is in .gitignore.
#pragma once

#define WIFI_SSID "barangay-hall"
#define WIFI_PASS "change-me"
// The gateway at the hall (the phone, laptop or Pi running Mosquitto).
#define MQTT_HOST "192.168.1.10"
// Who gets the offline SMS. Set CAPTAIN_COUNT to 0 to switch the fallback off.
static const char* const CAPTAIN_NUMBERS[] = {"+639170000000"};
#define CAPTAIN_COUNT 1
