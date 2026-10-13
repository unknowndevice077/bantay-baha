# Testing

This page is about what we actually checked and how, and just as plainly, what we haven't been able to test.

## What runs on every build

`npm run build` type-checks the whole project with TypeScript in strict mode before Vite bundles it. A type error fails the build, so nothing ships that doesn't compile. There is no automated unit-test suite yet. That's the first gap on the list at the bottom of this page.

## The forecast

The forecast has the most rigorous testing of anything in the project, because it's the part most likely to look good while being wrong.

- **Held-out storms.** 180 storms the model never saw during training or model selection, split by storm, not by minute. The results are in [forecast-results.md](forecast-results.md), next to three baselines: no change, trend, and ridge regression.
- **Python and the browser agree.** `model.json` ships with reference inputs and the outputs Python computed for them. The browser re-runs them every time it loads the model, and refuses the model if any answer is off by more than a millimetre.
- **Lead time, not just error.** For every test storm that reached WARNING, we measured how long before the crossing the forecast first called it, and how often it called WARNING for storms that never got there. Average error alone hides both of those.
- **The story's storm.** The game's scripted flood levels were checked against the catchment model. They agree within about 10 cm, so the forecast in the game is running on a flood that obeys the same physics it was trained on.

## Sensor fusion

Tested by breaking things on purpose, using the same *Simulate sensor failure* control anyone can use in the simulator:

| Scenario | Expected | Result |
| --- | --- | --- |
| Ultrasonic frozen during a rising storm | SENSOR FAULT within about 40 simulated seconds, level follows the camera, status keeps rising | Passed after adding the frozen-reading rule (see below) |
| Erratic echoes at NORMAL | Fault raised, no false ADVISORY from the spikes | Passed |
| Drift during a storm | Fault once the gap passes 30 cm, the higher (true) level is used | Passed |
| Camera blocked | Fault on the camera, the ultrasonic carries on, alerts unchanged | Passed |
| No faults, full typhoon at 10x | No SENSOR FAULT at any point, including the low-water start when the camera can't read | Passed after the fixes below |
| Fusion switched off | The simulator behaves exactly as before the add-on existed | Passed |

Several of these failed the first time. Each failure taught us something, and they're written up in [sensor-fusion.md](sensor-fusion.md#things-that-went-wrong-while-we-built-it). The short version: a frozen sensor looks *very* precise, cameras mounted too low go underwater, and a slow camera looks like a broken one.

## The pages, by playing them

We played through the simulator, the dashboard and the story game in a browser over and over, and looked at what the code was doing while we played (the story clock, the water level, the sensor readings, what each NPC was doing). Every bug below was found that way and fixed:

- A dip in the street on the way to Lola Cora's house, where the drainage canal ran under the road. The road now crosses on culverts.
- The basketball hoop was inside the barangay hall.
- The radio bulletin said "orange" rainfall warning while the story was built around a red one.
- The "check the forecast" task could be marked late before the player had a fair chance to do it.
- The ending faded out while Lito was still mid-sentence.
- Pressing Esc to close the phone also opened the pause menu.
- Without the weather outlook, the forecast saw the flood too late to matter to the story. This was the most useful bug of the lot, because it's the real limitation of a forecast that only knows past rain.

We also checked:

- that the simulator and the dashboard find each other's tabs instead of opening duplicates;
- that a dashboard opened from the game follows the game, not the simulator;
- that pausing the game really freezes the water, the story clock and the dialogue.

## What we haven't tested

We'd rather say this plainly than let anyone assume otherwise:

- **No real hardware in a real creek.** The sensor node is a design, modelled in detail in the simulator. The firmware behaviour, the power budget and the mounting haven't been proven in the field. The live-input path (WebSocket and MQTT) accepts the documented payloads, but a weeks-long run on a real node is the test that matters.
- **No real flood data.** The forecast is trained and tested on synthetic storms from the same model that drives the simulator. That's the main reason its numbers look as good as they do. Retraining on recorded readings is the first thing a real deployment needs.
- **No user testing with a barangay.** We haven't sat a captain or a tanod down in front of the dashboard during a drill. Their feedback would change things.
- **Translations not reviewed.** The Tagalog, Cebuano and Waray advisories need native-speaker and DRRM-office review.
- **No automated tests.** The fusion rules, the status rules and the ETA wording are good candidates for unit tests, since they're plain functions. We checked them by hand and by playing, which doesn't scale.
- **Limited device coverage.** Mostly tested on desktop Chrome and Edge. The dashboard is built to work on phones, but the 3D pages are heavy for older ones.
