# Sensor node firmware

The Arduino sketch for the ESP32 node on the pole. It does what [docs/sensor-node.md](../docs/sensor-node.md) describes: measures the creek with a JSN-SR04T, works out the alert level itself, flashes the beacon, publishes JSON over MQTT, and texts the captain when the network is down.

**Honest status:** written against the wiring in the docs and the same rules as the simulator. The alert logic (`bantay_logic.h`) is separate from the Arduino code, compiles on a PC, and passes all 408 cases generated from the simulator's rules (CI runs this). The sketch around it has **not been compiled for an ESP32 and has not run on real hardware**. Treat it as a first draft that needs a bench test before it goes on a pole.

## What's here

| File | What it does |
| --- | --- |
| `bantay-baha-node/bantay-baha-node.ino` | The sketch: pings, publishing, beacon, SMS fallback, sleep |
| `bantay-baha-node/bantay_logic.h` | The decisions, with no Arduino code: alert level, median, rise rate, SMS text |
| `bantay-baha-node/config.h` | Pins, thresholds' companions, timings. Set `MOUNT_HEIGHT_M` here |
| `bantay-baha-node/secrets.example.h` | Copy to `secrets.h` for Wi-Fi, the gateway address and the captain's number |
| `test/logic_test.cpp` | Runs `bantay_logic.h` on a PC against 408 cases from the TypeScript |
| `test-vectors.json` | Those cases, generated from `classifyStatus()` in `src/sensor/status.ts` |

## What the node does

Every 5 seconds (every 2 while the water is at ADVISORY or above):

1. Fires 5 pings, 60 ms apart. It drops echoes that never came back or that came back closer than the sensor can see, and takes the **median** of the rest. If fewer than 3 are good, it throws the reading away and publishes `{"error":"no_echo"}` instead of guessing.
2. Corrects the distance for air temperature, from the chip's own temperature sensor.
3. Level is the mount height minus the distance. The rise rate is the change over the last 10 minutes.
4. Works out NORMAL, ADVISORY, WARNING or EVACUATE with the same thresholds, hysteresis and one-step fast-rise rule as the simulator and the dashboard.
5. Drives the beacon and the status LED from **its own** answer, in a separate task, so they never wait on Wi-Fi.
6. Publishes the JSON on `bantaybaha/sensor/01`, in the format the simulator publishes, so the dashboard reads either.

**Offline fallback.** If MQTT has been down for 30 seconds and the status is WARNING or higher, the node texts the captain through a GSM module on the second serial port: once when it rises, then every 15 minutes. The text is one plain 160-character SMS ("BANTAY BAHA bb-01 WARNING: 285cm, +32cm/10min. Low-lying homes go to the Barangay Hall now."). The simulator's *Simulate network down* switch shows the same thing.

**Sleep.** While NORMAL and the battery reads below 3.55 V, it deep-sleeps for a minute between readings. It never sleeps while the water is up. This needs the optional battery divider on `PIN_BATT_ADC`; without it the node stays awake. The level history and the clock are kept across sleep.

## Build it

1. Install the Arduino IDE (or arduino-cli) with the **ESP32** board package, and the **PubSubClient** library.
2. Copy `bantay-baha-node/secrets.example.h` to `secrets.h` and fill it in. It's in `.gitignore`.
3. Open `config.h`. Set `MOUNT_HEIGHT_M` to the height you measured from the transducer face to the gauge zero. The pins match the wiring diagram.
4. Board: *ESP32 Dev Module*. Upload.
5. Run Mosquitto on the gateway, and in the simulator's *Live ESP32 input* choose **MQTT over WebSocket** with the broker's WebSocket address and topic `bantaybaha/sensor/01`.

To try it against the simulator, set `MOUNT_HEIGHT_M` to `7.00` to match `SENSOR_HEIGHT` in `src/config.ts`, or change both to the same number. The budget build in the docs mounts at about 6 m.

### GSM module

Optional, about ₱250–450 plus a prepaid SIM. Many networks are switching 2G off, so a 4G module (SIM7600, A7670) is the safer buy than a SIM800L. The sketch only uses standard text-mode AT commands (`AT+CMGF`, `AT+CMGS`), which both understand. These modules pull short current spikes of up to 2 A, so give the module its own good supply and a large capacitor close to it, not the ESP32's pin. To switch the fallback off, set `CAPTAIN_COUNT` to 0 in `secrets.h`.

## Check the logic on a PC

```bash
g++ -std=c++11 -Wall -I firmware/bantay-baha-node firmware/test/logic_test.cpp -o logic_test
```

```bash
./logic_test
```

It should print that every case passed. The same vectors are checked from the TypeScript side by `npm test` (`tests/firmware.test.ts`), so if someone changes the alert rules in `src/sensor/status.ts`, the test fails until `test-vectors.json` and this port are brought into line.

## Known gaps

- Not tested on a real node, a real creek, or a real GSM module.
- CI runs the C++ logic test but doesn't compile the sketch for the ESP32. Adding `arduino-cli compile` is the obvious next step.
- Temperature comes from the ESP32's own chip sensor, which reads warm inside a box in the sun. A DS18B20 on the mast would be better, and the distance error from a few degrees is only a few centimetres at 6 m.
- No OTA update and no MQTT authentication. The broker should only be reachable on the hall's own network.
