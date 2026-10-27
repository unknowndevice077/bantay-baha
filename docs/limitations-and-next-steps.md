# Limitations and next steps

## What this is not

**It isn't a certified early-warning system.** It's a working prototype of one, and a training and demonstration tool. A barangay shouldn't rely on it in place of PAGASA bulletins, the MDRRMO, or someone walking down to look at the creek. Not yet.

**It's one sensor on one creek.** Real floods come from upstream rain the sensor can't see, from dam releases, from the sea backing up a river at high tide, and from drainage that clogs in the middle of town. A single point on a single creek catches the local rise. It doesn't catch the whole story.

**Its numbers come from a model of a creek, not a real one.** The thresholds fit our 3D creek's banks and road. The forecast is trained on synthetic storms from the same model that drives the simulator, which flatters its accuracy. Both need real data from a real site.

**The translations are ours.** We wrote the Tagalog, Cebuano and Waray advisories ourselves. They're readable, but they need review by native speakers and the local DRRM office before anyone acts on them.

## What we'd do next

Roughly in order of how much they'd matter to an actual barangay:

1. **Put a node in a real creek.** Build one, run it for a rainy season next to the painted gauge, and compare. Everything else in this list gets better with that data.
2. **Prove the offline fallback and add LoRa.** The SMS fallback through a GSM module is written into the firmware and shown by the simulator's *Simulate network down* switch, but it hasn't been tried with a real module or SIM. Add LoRa to a receiver at the hall for creeks with no mobile signal, and put the ETA in the message.
3. **Replay real nights.** The simulator can record a storm as JSON and play it back at 1–10x (*Replay a night* in the panel). Still to do: import a real node's log, and draw the forecast's predicted flood area over the barangay for training and the after-action review.
4. **Retrain the forecast on recorded data** and feed it real rainfall outlooks (PAGASA forecasts, or a rain gauge upstream). Then measure the false-alarm rate with the barangay and agree what's acceptable.
5. **Wire the dashboard's siren button to the real siren** through a command topic on the broker, with a confirmation step so it can't be triggered by accident.
6. **Browser tests.** The status rules, fusion, forecast loader and advisory text now have unit tests and run in CI. A Playwright smoke test that opens the simulator, the dashboard and the game and checks they load and talk to each other is next, followed by a test of the ETA wording.
7. **Sit with a barangay during a drill.** Watch a captain and a tanod use the dashboard, and change whatever confuses them.
8. **Translation review**, and add Hiligaynon, Ilocano and Bikol.

## Things we'd do differently

- **We'd write the firmware alongside the simulator, not after it.** We wrote it last, and it has only been checked on a PC, not on a bench. A model of firmware isn't firmware.
- **We'd set up unit tests on day one.** Several bugs we found by playing the game, like the fusion trusting a frozen sensor, would have been caught in seconds by a ten-line test.
- **We'd gather flood marks before setting thresholds.** We picked ours to fit the 3D creek. Doing it properly means asking the people who've lived there longest where the water came up to last time. That conversation is probably the most valuable part of any real deployment, and it can't be simulated.
