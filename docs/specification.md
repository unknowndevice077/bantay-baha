# Specification

What Bantay Baha is required to do, and how each requirement is checked. [Architecture](architecture.md) says how it is built. This page says what it must do, so a change can be judged against it.

The thresholds below live in `src/config.ts`. Where a requirement has an automated test, the file is named.

## Scope

One barangay, one creek, one sensor node, one person on duty at the hall. Cheap enough for a barangay budget (about ₱2,000 to ₱8,000 for the node, no subscriptions), and built so that a failure is noticed and never silent.

Out of scope: a certified warning system, several sensors along a river, and anything that needs a cloud account to work.

## Requirements

### Measuring

| ID | Requirement | Checked by |
| --- | --- | --- |
| M-1 | Water level is the sensor's mounting height minus the measured distance: `level = SENSOR_HEIGHT - distance` | Simulator, Device tab |
| M-2 | The node publishes a reading every few seconds as JSON over MQTT or WebSocket, in the format in [architecture.md](architecture.md) | Live input path, by hand |
| M-3 | The rise rate is in cm per 10 minutes and is not reported until there is at least a minute of readings | `tests/status.test.ts` |

### Alert levels

| ID | Requirement | Checked by |
| --- | --- | --- |
| A-1 | Four levels: NORMAL, ADVISORY at 2.0 m, WARNING at 2.8 m, EVACUATE at 3.3 m | `tests/status.test.ts` |
| A-2 | A level steps down only after the water falls 8 cm below its threshold, so it doesn't flicker | `tests/status.test.ts` |
| A-3 | A rise of 30 cm per 10 minutes or more raises the alert one level above what the level alone says, never two | `tests/status.test.ts` |
| A-4 | Every alert level has an advisory in English, Tagalog, Cebuano and Waray, in the official and the "Lola" voice, with the level, rate and trend filled in | `tests/templates.test.ts` |
| A-5 | The dashboard sounds an alarm every time the alert level rises, until someone acknowledges it | Dashboard, by hand |

### Forecast (Bantay Baha+)

| ID | Requirement | Checked by |
| --- | --- | --- |
| F-1 | Predict the level 30 and 60 minutes ahead and say when the next alert level will be crossed | [forecast-results.md](forecast-results.md) |
| F-2 | The browser refuses a forecast model whose answers don't match the reference values shipped with it | `tests/forecast.test.ts` |
| F-3 | Features are computed the same way in Python and in the browser | `tests/forecast.test.ts`, model check values |
| F-4 | With the forecast off, or failing to load, the core warning runs unchanged | Simulator, by hand |

### Sensor fusion (Bantay Baha+)

| ID | Requirement | Checked by |
| --- | --- | --- |
| S-1 | With both sensors healthy, the level is their inverse-variance average | `tests/fusion.test.ts` |
| S-2 | A frozen ultrasonic reading (8 identical readings in a row) raises SENSOR FAULT, and the level follows the camera | `tests/fusion.test.ts` |
| S-3 | Erratic echoes (two jumps over 25 cm in a minute) raise SENSOR FAULT | `tests/fusion.test.ts` |
| S-4 | If the sensors disagree by more than 30 cm for 30 seconds, the higher reading is used. A faulty sensor may warn early, never late | `tests/fusion.test.ts` |
| S-5 | A camera that can only say "the water is below the gauge" is not treated as disagreement | `tests/fusion.test.ts` |
| S-6 | With no camera picture, the ultrasonic carries on and the fault is shown | `tests/fusion.test.ts` |

### Offline, replay and firmware

| ID | Requirement | Checked by |
| --- | --- | --- |
| O-1 | If the network is down, the node still flashes its beacon and texts the captain on every rise to WARNING or higher, in one plain 160-character SMS | `tests/offline.test.ts`, *Simulate network down* in the simulator |
| O-2 | Nothing reaches the dashboard while the network is down, so it shows stale data and says so | Simulator and dashboard, by hand |
| R-1 | A night's level and rain can be recorded as JSON, saved, loaded and replayed at 1–10x. A bad file is refused with a reason | `tests/replay.test.ts` |
| R-2 | The node firmware makes the same alert-level decisions as the simulator, on every threshold edge | `firmware/test/logic_test.cpp`, `tests/firmware.test.ts`, 408 shared cases |

### People

| ID | Requirement | Checked by |
| --- | --- | --- |
| P-1 | At WARNING, residents go to the hall and register at the table. North-bank families cross the bridge | Simulator, by hand |
| P-2 | The story game can be finished by reading the sensor, warning the barangay and bringing out the people who won't leave | Story game, by hand |
| P-3 | The dashboard works on a phone without the 3D pages open, given a live device | Dashboard, by hand |

### Cost and operation

| ID | Requirement | Checked by |
| --- | --- | --- |
| C-1 | No subscription or cloud account is needed to run the system | [sensor-node.md](sensor-node.md) |
| C-2 | The site builds to static files, so any host works, including a spare laptop | `npm run build`, Dockerfile |
| C-3 | Every change passes lint, formatting, tests and the build | `.github/workflows/ci.yml` |

## Not yet met

These are written down in [Limitations and next steps](limitations-and-next-steps.md): the node has not run for weeks in a real creek, the forecast has only seen synthetic storms, and the dashboard has not been used by a real captain in a drill.
