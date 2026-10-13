# Bantay Baha documentation

Bantay Baha ("flood watch") is a flood early-warning system for one barangay beside one creek. It has a solar-powered water-level sensor, a dashboard for whoever is on duty at the barangay hall, and a 3D simulator and story game that show what happens in the hour before a flood.

The main [README](../README.md) covers installing and running the project. These pages explain what we built, why we built it this way, and where it still falls short.

## Reading order

If you only have five minutes, read the first two and the last one.

| Document | What's in it |
| --- | --- |
| [Problem and approach](problem-and-approach.md) | The problem we picked, who the system is for, and the decisions that shaped it |
| [System architecture](architecture.md) | How the sensor, gateway, dashboard and simulator fit together, with diagrams and message formats |
| [Sensor node](sensor-node.md) | The hardware: parts list, wiring, firmware loop, mounting and calibration |
| [Water-level forecast](forecasting.md) | How the 30/60-minute forecast is trained, exported and run in the browser |
| [Forecast results](forecast-results.md) | Accuracy numbers on held-out storms, compared against simple baselines |
| [Sensor fusion and fault detection](sensor-fusion.md) | The second sensor (a camera reading the staff gauge) and how bad readings get caught |
| [User guide](user-guide.md) | Walkthroughs of the simulator, the dashboard and the story game |
| [Failure modes](failure-modes.md) | What breaks, how the system notices, and what the user sees when it does |
| [Testing](testing.md) | How we checked each part and what we haven't been able to test yet |
| [Limitations and next steps](limitations-and-next-steps.md) | The plain list of what this is not, and what we would do next |

## In one paragraph

An ultrasonic sensor on a pole over the creek measures the distance down to the water every few seconds. An ESP32 turns that into a water level and publishes it over MQTT to a small gateway at the barangay hall. The dashboard shows the level and the rise rate and gives one of four alert levels: NORMAL, ADVISORY, WARNING or EVACUATE. A forecast model estimates where the level will be in 30 and 60 minutes. A camera watching the painted staff gauge gives a second opinion, so a stuck or drifting sensor gets caught instead of silently holding back a warning. Because we couldn't flood a real barangay to demonstrate any of this, the 3D simulator runs the same logic against a simulated creek. The story game puts you in the barangay captain's shoes for one bad night.

## Licences

- The project is MIT licensed.
- The people in the scene are Quaternius CC0 models.
- The NPC voices were recorded with Chatterbox (MIT, open weights).
- The forecast model was trained with scikit-learn (BSD).
- No paid or closed services are needed to run any of it.

Details are in [`public/models/CREDITS.md`](../public/models/CREDITS.md) and in the [problem and approach](problem-and-approach.md#what-we-used-and-why) page.
