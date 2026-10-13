# Sensor node

The node is a pole on the creek bank with an arm reaching out over the water. At the end of the arm, a waterproof ultrasonic transducer points straight down. An ESP32 in a sealed box on the pole times the echo, works out the water level and sends it to the gateway at the barangay hall. A small solar panel and two lithium cells keep it running without mains power.

Everything below is also modelled in the simulator. Click the box on the pole to open it, then click any part to see what it does and its live readings.

## How it measures

The transducer sends a 40 kHz ping and listens for the echo off the water surface.

```
distance = speed of sound × echo time ÷ 2
speed of sound ≈ 331.3 + 0.606 × air temperature (°C)  m/s
water level = mount height − distance
```

The transducer face sits **7.00 m above the gauge zero**, which is the bottom of the painted staff gauge in the creek. So a 412 cm echo means the water is at 288 cm, which is WARNING. The temperature term matters more than you'd think: between a cool night and a hot afternoon, an uncorrected reading drifts by a few centimetres.

## Parts list

Prices are rough Philippine online-shop prices, to show the order of magnitude a barangay would be looking at. They are not quotes. Check local suppliers before budgeting.

| Part | Example | Why this one | Rough price (PHP) |
| --- | --- | --- | ---: |
| Microcontroller | ESP32-WROOM-32 dev board | Wi-Fi built in, deep sleep, cheap, huge Arduino community | 250–450 |
| Ultrasonic sensor | JSN-SR04T (waterproof probe and driver board) | Sealed probe, made for outdoor use | 250–450 |
| Long-range alternative | MaxBotix MB7389 (up to 10 m) | Needed if the arm is as high as in our model (see the note below) | 6,000–8,000 |
| Battery | 2 × 18650 Li-ion, 3000 mAh, with BMS | About 22 Wh, enough for roughly two days with no sun | 300–600 |
| Solar | 6 V, 5 W panel and a solar charge module | Recharges the pack even on grey days | 450–800 |
| Enclosure | IP65 ABS junction box with cable glands | Keeps out rain and humidity | 200–400 |
| Status LED and beacon | RGB LED, 12 V amber/red strobe | Lets people on the bank see the alarm without a phone | 150–500 |
| Mast and arm | Galvanized pipe, clamps, small concrete footing | Holds the sensor over open water, clear of the bank | 2,000–4,000 |
| Staff gauge | Painted board, 0–6 m, 5 cm bars | Manual check and fallback; also what the camera reads | 500–1,500 |
| **Node total** | with the JSN-SR04T | | **about 4,000–8,500** |
| Gateway (one per barangay) | Raspberry Pi 4 with Mosquitto, Wi-Fi access point | Runs the broker at the hall. Doesn't need the internet | 4,000–6,000 |

**A note we had to be honest with ourselves about:** the JSN-SR04T is rated to about 4.5 m. Our model puts the transducer 7 m above the gauge zero, so that the highest flood (5.5 m) still leaves a safe gap below the sensor. At low water, the cheap sensor wouldn't reach. A real build either uses a long-range sensor like the MB7389, or mounts the arm lower and accepts a smaller margin at the top. The right answer depends on the creek, and we'd decide it on site.

## Wiring

```
18650 pack (via BMS) ──► 5 V boost ──► ESP32 VIN
                                └────► JSN-SR04T 5 V
ESP32 GPIO5  ─────────────────────────► TRIG
JSN-SR04T ECHO ──► 5 V→3.3 V divider ──► ESP32 GPIO18
ESP32 GPIO for LED / beacon relay
Solar panel ──► charge module ──► pack
GND common to all
```

The ECHO line needs the divider (or a level shifter): the driver board outputs 5 V and the ESP32's pins are 3.3 V. The transducer cable runs up the mast and along the arm through a cable gland at the bottom of the box. Glands always go at the bottom, so water can't run down the cable into the box.

## Firmware loop

The firmware isn't in this repo; this is the behaviour the simulator models (`src/sensor/monitor.ts`, `src/sensor/esp32.ts`), written out as the loop a real node would run:

```
every 5 seconds (more often when the water is rising):
    take 5 pings, drop the ones that came back impossibly early or never came back
    distance = median of the rest            # rain and insects make single bad echoes
    correct for air temperature
    level = MOUNT_HEIGHT − distance
    rate  = rise over the last 10 minutes
    status = classify(level, rate, previous status)   # same rules as src/sensor/status.ts
    set LED colour and beacon
    publish JSON to bantaybaha/sensor/01
    if NORMAL and the battery is low: deep-sleep until the next reading
```

The node works out the status itself, as well as sending the raw distance, so the beacon on the pole still works when the gateway is down. The dashboard works out the status again from the distance and doesn't rely on the node's answer.

## Power budget

- Average draw is about 0.4 W, with the Wi-Fi radio taking most of it.
- 22 Wh of battery ÷ 0.4 W ≈ 55 hours, a bit over two days with no sun at all.
- Under typhoon cloud the 5 W panel still gives a fraction of a watt by day, which stretches that further.
- The node reports battery voltage, solar watts and net power. When the pack is running down, the dashboard says so in plain words.

## Installing it

1. **Pick the spot:** a straight stretch, away from the bridge (debris piles up there), where the arm can reach open water at low tide or in the dry season.
2. **Set the gauge first.** The painted staff gauge defines zero. Every number in the system is "cm above the bottom of the gauge".
3. **Measure the mount height** from the transducer face down to gauge zero, using a tape and a level on a calm day. Put that number in the firmware (and in `SENSOR_HEIGHT` in `src/config.ts` for the simulator).
4. **Check it against the gauge.** Read the gauge by eye and compare with the node over a few days. They should agree within a couple of centimetres. The story game has a task for exactly this ("check the sensor against the staff gauge").
5. **Agree on the thresholds with the barangay.** Ask the older residents where the water reached in past floods, and mark the bank top, the road and the first floor of the lowest house. The numbers in this repo fit our model creek, not yours.
