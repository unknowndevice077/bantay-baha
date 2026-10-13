/** Catalog of clickable hardware on the smart pole and the data path, shown in the inspector card. */
import { SENSOR_HEIGHT } from '../config';
import { MQTT_TOPIC, type Telemetry } from './esp32';

export type ComponentId =
  | 'enclosure'
  | 'esp32'
  | 'driver'
  | 'battery'
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
  | 'gauge';

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
      ['Contents', 'ESP32, ultrasonic driver, 2× 18650 pack, wiring'],
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
      ['Pins used', 'GPIO5 → TRIG, GPIO18 ← ECHO (via divider), VIN, GND'],
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
        `This pole mounts the sensor ${SENSOR_HEIGHT.toFixed(0)} m above the gauge zero; a real build at that height would swap in a long-range module (e.g. MaxBotix MB7389, up to 10 m).`,
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
      'Colour-coded leads: red = power (VIN/5 V), black = ground, yellow = TRIG, green = ECHO, and the orange shielded cable that runs up the mast and along the arm to the transducer.',
    specs: [
      ['Power', 'Battery → ESP32 VIN, battery → driver 5 V'],
      ['Signals', 'ESP32 GPIO5 → TRIG, driver ECHO → GPIO18 (5 V→3.3 V divider)'],
      ['Transducer lead', 'Shielded 2-core, ~2.5 m, through a cable gland'],
    ],
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
    about: 'Small monocrystalline panel tilted toward the southern sky. It recharges the 18650 pack by day; output collapses under thick storm clouds.',
    specs: [
      ['Rated', '6 V, 5 W peak'],
      ['Tilt', '≈ 17° (latitude of the Visayas)'],
    ],
    live: (t) => [['Output now', `${t.solarW.toFixed(2)} W`]],
  },
  antenna: {
    title: '2.4 GHz antenna',
    kind: 'Radio',
    about: 'External whip antenna on the enclosure so the Wi-Fi link reaches the gateway on the barangay hall roof. Heavy rain slightly weakens the signal.',
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
    about: 'Flashing light on the mast top (and a twin on the barangay hall). Amber at WARNING, fast red at EVACUATE, so people on the riverbank see the alarm even without a phone.',
    specs: [['Triggers', 'WARNING and EVACUATE']],
    live: (t) => [['State', t.status === 'WARNING' || t.status === 'EVACUATE' ? 'FLASHING' : 'off']],
  },
  mast: {
    title: 'Galvanized steel mast & arm',
    kind: 'Structure',
    about: 'Concrete-footed pole on the bank with a cantilever arm so the transducer hangs over open water, clear of the bank slope and floating debris.',
    specs: [
      ['Arm reach', '≈ 5.5 m over the creek'],
      ['Footing', 'Reinforced concrete, above normal water'],
    ],
  },
  gateway: {
    title: 'Gateway · MQTT broker',
    kind: 'Network',
    about: 'Wi-Fi access point plus a small computer (e.g. Raspberry Pi running Mosquitto) on the barangay hall roof. The node publishes here; dashboards and alert services subscribe.',
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
  dashboard: {
    title: 'Barangay dashboard',
    kind: 'Display',
    about: 'Outdoor screen at the evacuation center subscribed to the sensor topic. It shows the current level, status and the last 10 minutes so the BDRRMC can act early.',
    specs: [['Refresh', 'On every MQTT message']],
    live: (t) => [
      ['Level', `${t.levelCm.toFixed(0)} cm`],
      ['Status', t.status],
    ],
  },
};
