# Testing

This page is about what we actually checked and how, and just as plainly, what we haven't been able to test.

## What runs on every change

`npm run check` does four things, and GitHub Actions runs the same four on every push and pull request (Node 20 and 22), then builds the Docker image:

1. **ESLint** over `src` and `tests`.
2. **Prettier** in check mode.
3. **Vitest unit tests** (`npm test`, 51 tests in `tests/`).
4. **`npm run build`**, which type-checks the whole project with TypeScript in strict mode before Vite bundles it. A type error fails the build.

The unit tests cover the plain functions that decide whether someone gets warned. They are the parts where a quiet mistake costs the most:

| Test file | What it pins down |
| --- | --- |
| `status.test.ts` | Alert thresholds, the 8 cm hysteresis, the one-step fast-rise rule (including the two-step bug found in a 10x storm), rise rate |
| `fusion.test.ts` | Inverse-variance fusion, frozen and erratic detection, the fail-safe "use the higher reading" rule, the camera's "too low to read" case, and the fault injector |
| `forecast.test.ts` | Feature maths, and the model loader refusing a model that doesn't match its reference values or an HTML page served in its place |
| `templates.test.ts` | Every status in all four languages, in both voices, with no placeholder left over |
| `replay.test.ts` | Recording and playback: interpolation, the file checks, the recorder's spacing, and the sample typhoon's shape |
| `offline.test.ts` | The offline SMS: plain ASCII, one 160-character message, the right wording |
| `firmware.test.ts` | 408 alert-level cases that the C++ firmware logic must also pass |
| `util.test.ts` | The maths helpers and the seeded random generator that keeps the barangay layout identical on every load |

The firmware's alert logic also runs on a PC (`firmware/test/logic_test.cpp`, built with `g++` in CI) against the same 408 cases. The ESP32 sketch around it has not been compiled for the board or run on hardware.

The 3D scene, the story game and the dashboard are checked by playing them (below). There are no browser tests yet.

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
- The forecast wasn't ready when you first opened the laptop. Readings taken behind the title screen got mixed in ahead of the afternoon's history, so it thought it only had three minutes of data.
- The fast-rise rule could raise the alert two steps instead of one: a WARNING that was itself caused by a fast rise got raised again to EVACUATE at 275 cm. Found by reading the dashboard's event log during a 10x storm.
- Residents walked home from the evacuation center mid-story, because the simulator's all-clear timer also ran in the game.
- The north-bank evacuation lane ran through the bamboo steps of three houses, and through Mang Ben's house itself.
- E prompts vanished for things at your feet or overhead (the sleeping mats, Lola Cora on her porch) unless you looked straight at them.
- P opened the phone over the pause menu, and "Return to the evacuation center" ticked itself off if you happened to be inside the hall when Part three began.
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
- **No browser tests.** The alert rules, fusion, forecast loader and advisory text have unit tests. The 3D scene, the story game and the dashboard are still checked by hand and by playing, which doesn't scale. Playwright smoke tests for the three pages are the next step.
- **Limited device coverage.** Mostly tested on desktop Chrome and Edge. The dashboard is built to work on phones, but the 3D pages are heavy for older ones.
