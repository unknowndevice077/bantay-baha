/** Catalog of clickable hardware on the smart pole and the data path, shown in the inspector card. */
import { SENSOR_HEIGHT } from '../config';
import { MQTT_TOPIC, type Telemetry } from './esp32';

export type ComponentId =
  | 'enclosure'
  | 'esp32'
  | 'driver'
  | 'battery'
  | 'charger'
  | 'boost'
  | 'switch'
  | 'wiring'
  | 'transducer'
  | 'beam'
  | 'solar'
  | 'antenna'
  | 'led'
  | 'beacon'
  | 'mast'
  | 'gateway'
  | 'dashboard'
  | 'gauge'
  | 'camera';

export interface ComponentInfo {
  title: string;
  kind: string;
  about: string;
  specs: [string, string][];
  /** Live values pulled from the node's telemetry. */
  live?: (t: Telemetry) => [string, string][];
}

export const COMPONENTS: Record<ComponentId, ComponentInfo> = {
  enclosure: {
    title: 'IP65 weatherproof enclosure',
    kind: 'Housing',
    about:
      'Gasketed ABS junction box that keeps rain and humidity off the electronics. Cables enter through glands at the bottom so water cannot run inside. Click it to open or close the lid; then click any part inside.',
    specs: [
      ['Rating', 'IP65 (dust-tight, water jets)'],
      ['Mounting', 'Stainless band clamps on the mast, ~2.3 m above ground'],
      ['Contents', 'ESP32, ultrasonic driver, 2× 18650 pack, solar charger, 5 V boost, beacon switch, ECHO divider, wiring'],
      ['Glands', 'Three at the bottom: solar in, transducer out, beacon out'],
    ],
    live: (t) => [['Inside temp', `${t.tempC.toFixed(1)} °C`]],
  },
  esp32: {
    title: 'ESP32-WROOM-32 dev board',
    kind: 'Microcontroller',
    about:
      'The brain of the node. Every cycle it fires the ultrasonic sensor, times the echo, takes a median of several pings to reject splashes and rain, converts distance to water level, and publishes JSON over Wi-Fi to the MQTT broker. Between readings it can deep-sleep to save the battery.',
    specs: [
      ['CPU', 'Dual-core Xtensa LX6 @ 240 MHz'],
      ['Radio', 'Wi-Fi 802.11 b/g/n + Bluetooth'],
      ['Pins used', 'GPIO5 → TRIG · GPIO18 ← ECHO (via divider) · GPIO25 → beacon switch · GPIO26 → status LED · VIN 5 V · GND'],
      ['Firmware', 'Arduino/ESP-IDF, PubSubClient MQTT, OTA updates'],
      ['Publishes to', MQTT_TOPIC],
    ],
    live: (t) => [
      ['Uptime', `${(t.uptimeS / 3600).toFixed(1)} h`],
      ['Free heap', `${t.heapKb.toFixed(0)} KB`],
      ['Packets sent', `#${t.seq}`],
    ],
  },
  driver: {
    title: 'JSN-SR04T driver board',
    kind: 'Ultrasonic module',
    about:
      'Drives the waterproof transducer: on a 10 µs TRIG pulse it emits a 40 kHz burst, then raises ECHO for as long as the sound takes to return. Distance = speed of sound × echo time ÷ 2.',
    specs: [
      ['Frequency', '40 kHz'],
      ['Supply', '5 V, ~30 mA while ranging'],
      ['Rated range', '≈ 25–450 cm'],
      [
        'Note',
        `This model pole is ${SENSOR_HEIGHT.toFixed(0)} m above the gauge zero. A budget build mounts the arm about 6 m up instead, so this module reads every level from 1.5 m to the top of the flood; below that the creek is low and safe anyway.`,
      ],
    ],
    live: (t) => [['Echo time', `${t.echoUs.toFixed(0)} µs`]],
  },
  battery: {
    title: '2× 18650 Li-ion pack',
    kind: 'Energy storage',
    about:
      'Two 3000 mAh cells in parallel keep the node running through the night and through days of typhoon cloud cover, recharged by the solar panel through a charge controller.',
    specs: [
      ['Nominal', '3.7 V, ~22 Wh'],
      ['Autonomy', '≈ 2 days with no sun at ~0.4 W average load'],
      ['Protection', 'BMS: over-charge / over-discharge / short'],
    ],
    live: (t) => [
      ['Voltage', `${t.batteryV.toFixed(2)} V`],
      ['Charge', `${t.batteryPct.toFixed(0)} %`],
      ['Net power', `${t.netW >= 0 ? '+' : ''}${t.netW.toFixed(2)} W`],
    ],
  },
  wiring: {
    title: 'Wiring harness',
    kind: 'Interconnect',
    about:
      'Colour-coded leads: red = power, black = ground, yellow = TRIG, green = ECHO, purple = beacon switch, blue = status LED. Three cables leave through glands at the bottom of the box so rain cannot run inside: the solar cable from the panel, the transducer cable out along the arm, and the beacon cable up the mast.',
    specs: [
      ['Power', 'Solar panel → charge controller → 18650 pack → 5 V boost → ESP32 VIN, driver VCC, beacon switch'],
      ['Ground', 'Common to every board'],
      ['Sensor', 'ESP32 GPIO5 → TRIG; driver ECHO → 10 kΩ / 20 kΩ divider → GPIO18 (5 V down to 3.3 V)'],
      ['Outputs', 'GPIO25 → beacon MOSFET gate; GPIO26 → status LED (through 220 Ω)'],
      ['Cables', 'Transducer: shielded 2-core ~2.5 m · solar: 2-core ~1.5 m · beacon: 2-core ~1.5 m'],
    ],
  },
  charger: {
    title: 'Solar charge controller',
    kind: 'Power',
    about:
      'Takes whatever the 5 W panel gives, from bright noon to typhoon cloud, and charges the 18650 pack safely: it stops at full charge and tracks the panel so grey days still count. The pack never connects to the panel directly.',
    specs: [
      ['Example', 'CN3791 solar Li-ion charger module (MPPT)'],
      ['In / out', '6 V panel in · 4.2 V charge out to the pack'],
      ['Rough cost', '₱150–250 (a TP4056 module works too, ₱40–80, without the panel tracking)'],
    ],
    live: (t) => [
      ['Panel now', `${t.solarW.toFixed(2)} W`],
      ['Pack', `${t.batteryPct.toFixed(0)} %`],
    ],
  },
  boost: {
    title: '5 V boost converter',
    kind: 'Power',
    about:
      'The pack gives 3.0–4.2 V depending on charge; the ultrasonic driver and the beacon want a steady 5 V. This little board steps it up and feeds the ESP32, the driver and the beacon switch from one 5 V rail.',
    specs: [
      ['Example', 'MT3608 boost module, set to 5.0 V'],
      ['Feeds', 'ESP32 VIN · JSN-SR04T VCC · beacon switch'],
      ['Rough cost', '₱40–80'],
    ],
    live: (t) => [['Pack voltage in', `${t.batteryV.toFixed(2)} V`]],
  },
  switch: {
    title: 'Beacon switch (MOSFET)',
    kind: 'Output',
    about:
      'The ESP32 can only give a few milliamps; the strobe on the mast top needs about 200. A logic-level MOSFET module lets one ESP32 pin turn the 5 V strobe on and off, so the pole flashes at WARNING and EVACUATE even when the gateway is down.',
    specs: [
      ['Example', 'IRLZ44N or AO3400 MOSFET module'],
      ['Driven by', 'ESP32 GPIO25'],
      ['Load', '5 V LED strobe on the mast top, about 1 W while flashing'],
      ['Rough cost', '₱50–100'],
    ],
    live: (t) => [['Beacon', t.status === 'WARNING' || t.status === 'EVACUATE' ? 'ON (flashing)' : 'off']],
  },
  transducer: {
    title: 'Waterproof ultrasonic transducer',
    kind: 'Sensor head',
    about:
      'Sealed probe on the end of the arm, pointing straight down at the water. It is both the speaker and the microphone: it sends the ping and hears the echo bounce off the surface.',
    specs: [
      ['Mount height', `${SENSOR_HEIGHT.toFixed(2)} m above gauge datum`],
      ['Formula', 'level = mount height − distance'],
      ['Housing', 'Sealed, IP67'],
    ],
    live: (t) => [
      ['Distance', `${t.distanceCm.toFixed(1)} cm`],
      ['Water level', `${t.levelCm.toFixed(0)} cm`],
    ],
  },
  beam: {
    title: 'Ultrasonic beam',
    kind: 'Measurement',
    about:
      'The translucent cone visualises the sound cone. Time-of-flight: d = v·t / 2, where v ≈ 331.3 + 0.606·T m/s. The firmware compensates for air temperature so hot afternoons do not read as lower water.',
    specs: [
      ['Beam width', '≈ 15° half-angle (visualised)'],
      ['Sample rate', 'Every 5 s of simulated time'],
    ],
    live: (t) => [
      ['Echo time', `${t.echoUs.toFixed(0)} µs`],
      ['Distance', `${t.distanceCm.toFixed(1)} cm`],
    ],
  },
  solar: {
    title: '5 W solar panel',
    kind: 'Power source',
    about:
      'Small monocrystalline panel tilted toward the southern sky. It recharges the 18650 pack by day; output collapses under thick storm clouds.',
    specs: [
      ['Rated', '6 V, 5 W peak'],
      ['Tilt', '≈ 17° (latitude of the Visayas)'],
    ],
    live: (t) => [['Output now', `${t.solarW.toFixed(2)} W`]],
  },
  antenna: {
    title: '2.4 GHz antenna',
    kind: 'Radio',
    about:
      'External whip antenna on the enclosure so the Wi-Fi link reaches the gateway on the barangay hall roof. Heavy rain slightly weakens the signal.',
    specs: [
      ['Band', '2.4 GHz Wi-Fi'],
      ['Link', 'Pole → hall gateway, line of sight'],
    ],
    live: (t) => [['RSSI', `${t.rssi.toFixed(0)} dBm`]],
  },
  led: {
    title: 'Status LED',
    kind: 'Indicator',
    about: 'Lets responders read the node at a glance: green heartbeat = normal, yellow = advisory, orange = warning, fast red = evacuate.',
    specs: [['Blink', 'Faster as the risk level rises']],
    live: (t) => [['Showing', t.status]],
  },
  beacon: {
    title: 'Warning beacon',
    kind: 'Local alarm',
    about:
      'Flashing light on the mast top (and a twin on the barangay hall). Amber at WARNING, fast red at EVACUATE, so people on the riverbank see the alarm even without a phone.',
    specs: [
      ['Triggers', 'WARNING and EVACUATE (set by the ESP32 itself, so it works without the gateway)'],
      ['Light', '5 V LED strobe, about 1 W while flashing'],
      ['Switched by', 'Beacon MOSFET on GPIO25, powered from the 5 V rail'],
      ['Rough cost', '₱150–300'],
    ],
    live: (t) => [['State', t.status === 'WARNING' || t.status === 'EVACUATE' ? 'FLASHING' : 'off']],
  },
  mast: {
    title: 'Galvanized steel mast & arm',
    kind: 'Structure',
    about:
      'Concrete-footed pole on the bank with a cantilever arm so the transducer hangs over open water, clear of the bank slope and floating debris.',
    specs: [
      ['Arm reach', '≈ 5.5 m over the creek'],
      ['Footing', 'Reinforced concrete, above normal water'],
    ],
  },
  gateway: {
    title: 'Gateway · MQTT broker',
    kind: 'Network',
    about:
      'Wi-Fi access point plus a small computer (e.g. Raspberry Pi running Mosquitto) on the barangay hall roof. The node publishes here; dashboards and alert services subscribe.',
    specs: [
      ['Topic', MQTT_TOPIC],
      ['Protocol', 'MQTT 3.1.1, QoS 0, also exposed over WebSocket'],
    ],
    live: (t) => [['Messages received', `${t.seq}`]],
  },
  gauge: {
    title: 'Staff gauge',
    kind: 'Manual reference',
    about:
      'Painted measuring board in the creek, zeroed at the same datum as the sensor. Tanods read it by eye to verify the ultrasonic reading and as a fallback if the node is offline. Each bar is 5 cm; colours alternate every metre.',
    specs: [
      ['Range', '0–6 m above the gauge datum'],
      ['Graduation', '"E" pattern, 5 cm bars, numbered every metre'],
    ],
    live: (t) => [['Reads', `${t.levelCm.toFixed(0)} cm`]],
  },
  camera: {
    title: 'Gauge camera (optional)',
    kind: 'Second sensor',
    about:
      'A small camera on the bank pointed at the staff gauge, with its own infrared lamp so it sees the board at night. It reads the waterline from the picture and checks the ultrasonic: a frozen, erratic or drifting sensor raises a SENSOR FAULT instead of quietly showing a calm creek. Optional: the system warns without it, but it is the cheapest way to catch a broken sensor. Turn on Sensor fusion in the Bantay Baha+ panel to see what it sees.',
    specs: [
      ['Board', 'ESP32-CAM (OV2640, no IR filter) + 850 nm IR LED'],
      ['Rough cost', 'about ₱450–800 with the IR LED and a weatherproof box'],
      ['Picture', 'A narrow strip of the gauge board, a few frames a second'],
      ['Mounting', 'Above the highest flood the barangay remembers, a few metres back from the bank'],
    ],
  },
  dashboard: {
    title: 'Barangay dashboard',
    kind: 'Display',
    about:
      'Outdoor screen at the evacuation center subscribed to the sensor topic. It shows the current level, status and the last 10 minutes so the BDRRMC can act early.',
    specs: [['Refresh', 'On every MQTT message']],
    live: (t) => [
      ['Level', `${t.levelCm.toFixed(0)} cm`],
      ['Status', t.status],
    ],
  },
};
