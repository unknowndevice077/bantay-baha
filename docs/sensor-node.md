# Sensor node

The node is a pole on the creek bank with an arm reaching out over the water. At the end of the arm, a waterproof ultrasonic transducer points straight down. An ESP32 in a sealed box on the pole times the echo, works out the water level and sends it to the gateway at the barangay hall. A small solar panel and two lithium cells keep it running without mains power. An optional camera on the bank watches the painted gauge as a second opinion.

Everything below is also modelled in the simulator. Click the box on the pole to open it, then click any part to see what it does and its live readings.

## How it measures

The transducer sends a 40 kHz ping and listens for the echo off the water surface.

```
distance = speed of sound × echo time ÷ 2
speed of sound ≈ 331.3 + 0.606 × air temperature (°C)  m/s
water level = mount height − distance
```

In the simulator the transducer face sits **7.00 m above the gauge zero**, which is the bottom of the painted staff gauge in the creek (a budget build uses about 6 m; see [what it costs](#what-it-costs)). So a 412 cm echo means the water is at 288 cm, which is WARNING. The temperature term matters more than you'd think: between a cool night and a hot afternoon, an uncorrected reading drifts by a few centimetres.

## What it costs

This is for one barangay, paid from barangay funds, so the rule is: **spend on what keeps people safe, and nothing else.** That means a reading you can trust, power that lasts through a typhoon, and an alarm people on the bank can see. It doesn't mean nicer sensors, cloud services or subscriptions.

Prices are rough Philippine online-shop prices, to show the order of magnitude. They are not quotes. Check local suppliers before budgeting.

### The minimum build (what we recommend)

| Part | Example | Why this one | Rough price (PHP) |
| --- | --- | --- | ---: |
| Microcontroller | ESP32-WROOM-32 dev board | Wi-Fi built in, deep sleep, cheap, huge Arduino community | 250–450 |
| Ultrasonic sensor | JSN-SR04T (waterproof probe and driver board) | Sealed probe made for outdoor use, and cheap enough to keep a spare | 250–450 |
| Battery | 2 × 18650 Li-ion, 3000 mAh, with BMS | About 22 Wh, roughly two days with no sun | 300–600 |
| Solar panel | 6 V, 5 W | Recharges the pack even on grey days | 300–500 |
| Solar charge controller | CN3791 module (or a TP4056 for ₱40–80) | Charges the pack safely from the panel and stops when full | 150–250 |
| 5 V boost converter | MT3608 module, set to 5.0 V | The pack gives 3.0–4.2 V; the sensor driver and beacon need a steady 5 V | 40–80 |
| Beacon switch | Logic-level MOSFET module (IRLZ44N or AO3400) | Lets one ESP32 pin switch the strobe | 50–100 |
| Beacon | 5 V LED strobe, amber | People on the bank see the alarm without a phone | 150–300 |
| Small parts | 10 kΩ and 20 kΩ resistors (ECHO divider), RGB status LED with a 220 Ω resistor, hookup wire, 3 cable glands | | 100–200 |
| Enclosure | IP65 ABS junction box | Keeps out rain and humidity | 200–400 |
| Mast and arm | GI pipe and clamps, or bolted to an existing post or bridge railing | Holds the sensor over open water. Reusing a post the barangay already has is the biggest saving | 0–4,000 |
| Staff gauge | Marine plywood, painted by the tanods: 0–6 m, 5 cm bars | Manual check and fallback when everything else fails | 300–800 |
| **Node total** | | | **about ₱2,000–8,000** |

Things the barangay most likely already has, so they cost nothing:

- **The gateway.** Any spare Android phone or old laptop at the hall can run the MQTT broker (Mosquitto) and the dashboard on the hall's Wi-Fi. If there's nothing spare, a Raspberry Pi Zero 2 W (about ₱1,800–2,500) is plenty; it doesn't need a Pi 4.
- **The siren and PA.** The dashboard tells the person on duty *when* to sound them. It doesn't replace them.
- **SMS.** The advisory is copied into the barangay's existing SMS group or Facebook page. No paid SMS gateway.
- **Internet.** Not needed. Everything runs on the hall's own network.

### Optional, if there's budget left

| Part | What it buys you | Rough price (PHP) |
| --- | --- | ---: |
| A spare JSN-SR04T and ESP32 | The cheapest insurance there is: if the sensor dies mid-season, swap it in ten minutes | 500–900 |
| **Gauge camera:** ESP32-CAM with an 850 nm IR LED, in its own small box | A second, independent reading of the painted gauge, so a frozen, erratic or drifting ultrasonic gets caught instead of quietly showing a calm creek. See [sensor-fusion.md](sensor-fusion.md) | 450–800 |
| A GSM module (SIM7600 or A7670, or a SIM800L where 2G is still on) and a prepaid SIM | The offline fallback: when the hall's Wi-Fi or the gateway fails, the node texts the captain the level and what to do. See [firmware](../firmware/README.md) | 250–450 |
| A pair of LoRa modules | Another fallback, to a receiver at the hall, for creeks with no mobile signal. Not built | 800–1,500 |

The camera is the one we'd add first. The system warns without it, but it's the cheapest way we know to make a single broken sensor visible. In the simulator it's the small white box on a post on the village bank, looking at the gauge. Turn on *Sensor fusion* in the Bantay Baha+ panel and click it.

### What we left out on purpose

- **A long-range ultrasonic** (MaxBotix MB7389, about ₱6,000–8,000). The cheap JSN-SR04T reads up to about 4.5 m. Our simulator mounts the transducer 7 m above the gauge zero, which would need the expensive sensor. A budget build mounts the arm **about 6 m** above the gauge zero instead. The cheap sensor then reads every level from 1.5 m up to the top of the worst flood, and that's the whole range that matters for warnings. Below 1.5 m the creek is low, there's nothing to warn about, and the node simply reports "below 150 cm".
- **Cloud dashboards, paid SMS gateways and commercial weather stations.** They all cost money every month and stop working when the internet does.

## Wiring

This is exactly what you see when you open the enclosure in the simulator. Every wire in the drawing is a wire in the 3D model, in the same colour.

```
POWER (red +, black −)
  Solar panel 6 V ──[gland]──► charge controller IN
  charge controller BAT ─────► 18650 pack (with BMS)
  18650 pack ────────────────► 5 V boost IN
  5 V boost OUT ──┬──────────► ESP32 VIN
                  ├──────────► JSN-SR04T driver VCC
                  └──────────► beacon MOSFET module V+
  GND common to every board

SIGNALS
  ESP32 GPIO5  (yellow) ─────► driver TRIG
  driver ECHO  (green)  ─────► 20 kΩ / 10 kΩ divider ───► ESP32 GPIO18
  ESP32 GPIO25 (purple) ─────► MOSFET gate
  ESP32 GPIO26 (blue)   ─────► 220 Ω ─► status LED on the lid

OUT OF THE BOX (three glands, all at the bottom)
  driver ──── transducer cable (orange) ── up the mast, along the arm ──► transducer
  MOSFET OUT ── beacon cable ── up the mast ──► 5 V LED strobe
  (solar cable comes down the mast into the first gland)
```

Why each piece is there:

- **The divider** brings the driver's 5 V ECHO down to the 3.3 V the ESP32 can take. Without it the ESP32's pin slowly dies.
- **The boost converter** is needed because the pack's voltage sags from 4.2 V to about 3.0 V as it empties. The ultrasonic driver gets unreliable below 5 V, which is exactly when you'd least want it to: late in a long storm.
- **The MOSFET** is needed because an ESP32 pin can give a few milliamps and the strobe needs about 200. The ESP32 switches the beacon itself, from its own reading, so the pole still flashes when the gateway is down.
- **The glands go at the bottom**, so water running down a cable drips off instead of into the box.

## Firmware loop

The firmware is in [`firmware/`](../firmware/README.md) (an Arduino sketch, a first draft, not yet run on a real node). This is the loop it implements, which is also the behaviour the simulator models (`src/sensor/monitor.ts`, `src/sensor/esp32.ts`):

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
    if the network has been down for 30 s and the status is WARNING or higher: text the captain (GSM)
    if NORMAL and the battery is low: deep-sleep until the next reading
```

The node works out the status itself, as well as sending the raw distance, so the beacon on the pole still works when the gateway is down. The dashboard works out the status again from the distance and doesn't rely on the node's answer.

## Power budget

- Average draw is about 0.4 W, with the Wi-Fi radio taking most of it.
- 22 Wh of battery ÷ 0.4 W ≈ 55 hours, a bit over two days with no sun at all.
- The beacon adds about 1 W, but only while it flashes at WARNING or EVACUATE: a few hours in a bad storm, which the pack covers.
- The boost converter wastes roughly 10–15 % of what passes through it. That's already counted in the 0.4 W.
- Under typhoon cloud the 5 W panel still gives a fraction of a watt by day, which stretches that further.
- The node reports battery voltage, solar watts and net power. When the pack is running down, the dashboard says so in plain words.

## Installing it

1. **Pick the spot:** a straight stretch, away from the bridge (debris piles up there), where the arm can reach open water at low tide or in the dry season.
2. **Set the gauge first.** The painted staff gauge defines zero. Every number in the system is "cm above the bottom of the gauge".
3. **Measure the mount height** from the transducer face down to gauge zero, using a tape and a level on a calm day. Put that number in the firmware (and in `SENSOR_HEIGHT` in `src/config.ts` for the simulator).
4. **Check it against the gauge.** Read the gauge by eye and compare with the node over a few days. They should agree within a couple of centimetres. The story game has a task for exactly this ("check the sensor against the staff gauge").
5. **Agree on the thresholds with the barangay.** Ask the older residents where the water reached in past floods, and mark the bank top, the road and the first floor of the lowest house. The numbers in this repo fit our model creek, not yours.
