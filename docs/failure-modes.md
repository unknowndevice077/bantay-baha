# Failure modes

A warning system gets judged on its worst night, not its best. This page lists the ways Bantay Baha can fail, how it notices (when it does), and what the person on duty sees.

We've tried to follow one rule throughout: **when in doubt, warn early, and say plainly what's wrong.** A silent failure that keeps showing a calm green screen is the worst outcome. Everything else comes second to avoiding it.

## The sensor

| What fails | How it's noticed | What the user sees | What the system does |
| --- | --- | --- | --- |
| Ultrasonic frozen (hung firmware, failed driver board) | 8 identical readings in a row. Real echoes always jitter by a millimetre or so | SENSOR FAULT banner: "Ultrasonic reading frozen" | Uses the gauge camera's level. If the camera can't read either, keeps the ultrasonic but says so |
| Erratic echoes (heavy rain, insects, floating debris under the beam) | 2 or more jumps of over 25 cm within a minute | SENSOR FAULT: "Ultrasonic giving erratic echoes" | Uses the camera while it lasts. The firmware's median-of-pings already removes most single bad echoes before this point |
| Slow drift (the arm sagging, a loose bracket) | The ultrasonic and the camera differ by over 30 cm for 30 seconds | SENSOR FAULT: "Sensors disagree by N cm" | Uses the **higher** of the two readings. A drifting sensor can make a warning early, never late |
| Gauge camera blind (mud on the lens, fog, glare) | No waterline found in the picture | SENSOR FAULT: "Gauge camera unavailable" | Carries on with the ultrasonic alone, as the system did before the camera existed |
| Water too low for the camera to read | Expected, not a fault | The camera panel says the water is below what it can read | Treats the camera as "no higher than X". Only a disagreement if the ultrasonic says the water is higher |
| Both sensors wrong in the same direction | **Not detected.** Two sensors can't outvote each other | Nothing | This is why the staff gauge is painted, and why the story game has a task to check it by eye. People remain the last check |

Fusion is a Bantay Baha+ add-on. With it switched off, none of the faults above are detected, and the system trusts the ultrasonic as a single-sensor setup would.

## Power and network

| What fails | How it's noticed | What the user sees | What the system does |
| --- | --- | --- | --- |
| No readings arrive (node dead, Wi-Fi down, gateway off) | Nothing received for 15 seconds | The status strip on the card turns grey. "Last data: N s ago". Node health: "No recent data: visit the node, check power and Wi-Fi". An outage entry in the event log | The last known level stays on screen but clearly marked old. The dashboard never quietly shows an old reading as live |
| Battery running down (dirty panel, days of cloud) | Battery below 30 % | "Battery low: check the solar panel for dirt or shading." | The node firmware is designed to sleep longer between readings while the water is NORMAL |
| Weak Wi-Fi link to the hall | RSSI below −80 dBm | "Weak Wi-Fi signal: readings may drop out." | Nothing automatic. Someone needs to move the antenna or add a repeater |
| Enclosure overheating | Inside temperature over 55 °C | "Enclosure overheating: add shade or ventilation." | Nothing automatic |
| Internet down at the barangay hall | Not a failure for us | Nothing changes | The sensor, gateway and dashboard all run on the hall's local network. Fonts and alert templates are bundled. Only the optional Ollama advisories and the SMS copy-paste step need anything outside |
| Gateway itself down | The dashboard stops receiving (as above) | Stale data warning | The pole's own LED and beacon keep working, because the node works out the status itself. People on the bank still see amber or red |

**What's still missing:** a fallback channel for when the hall's Wi-Fi or the gateway fails completely during a flood, such as LoRa from the pole or SMS through a GSM module. It's planned as the next Bantay Baha+ feature. Today, the stale-data warning tells the person on duty to fall back on the staff gauge and the radio.

## The forecast

| What fails | How it's noticed | What the user sees | What the system does |
| --- | --- | --- | --- |
| Model file missing | It doesn't load | "Forecast unavailable: model file missing (run tools/forecast/train.py)" | Everything else works. Alert levels never depend on the forecast |
| The browser computes a different answer than Python did | The reference check on load fails | "Forecast unavailable: model output does not match its reference values" | Refuses to show numbers it can't trust |
| Not enough history yet | Under 10 minutes of readings | "Warming up: needs 10 minutes of readings" | Shows nothing rather than guessing |
| The forecast is just wrong (a storm unlike anything in training, a sudden upstream release) | It can't know | A wrong ETA | Status still comes only from the measured level and its rise rate. On the simulator chart the forecast is drawn inside its typical-error band (about ±20 cm at 30 min, ±30 cm at 60), so nobody reads it as certain |
| False alarms | Expected | "WARNING in ~40 min" that never happens. In testing, about a third of "WARNING within the hour" calls on storms that never got there | Accepted on purpose. See [forecast-results.md](forecast-results.md) |

## Advisories and alerts

| What fails | What happens |
| --- | --- |
| Ollama not running, too slow (8 s timeout), or blocked by CORS | The built-in templates are used, and the alert box says so. Ollama is off by default |
| The person on duty doesn't notice a status change | The dashboard keeps beeping until someone presses **Acknowledge**, and can show desktop notifications |
| Translations wrong or awkward | Not detected. The Tagalog, Cebuano and Waray templates were written by us, not by native-speaker reviewers. They need checking before real use |

## The demo pages

These don't affect a real deployment, but they matter on demo day:

| What fails | What happens |
| --- | --- |
| Dashboard opened without the simulator | It says it's waiting for the simulator, with a button to open it |
| A recorded voice line is missing | The game falls back to the browser's own speech. Subtitles always show |
| The browser refuses to capture the mouse (it does for a moment after Esc) | Moving the mouse over the view still looks around, "Click to look around" appears, and the next click captures it |
| No WebGL (very old machine, or blocked by policy) | The 3D pages don't load. The dashboard doesn't use WebGL and works fine. We haven't added a friendly message for this yet |
| A Bantay Baha+ add-on throws while starting | It's caught and logged. The other add-on and the core simulator carry on |
| Browser storage blocked (private mode) | Switches and headcounts aren't remembered between visits. Everything else works |
