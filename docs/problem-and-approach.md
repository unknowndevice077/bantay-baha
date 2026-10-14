# Problem and approach

## The problem

Most people in the Philippines have lived through a flood, or know someone who has. The country gets around twenty tropical cyclones in a typical year, and the southwest monsoon adds weeks of heavy rain on top of that. National warnings from PAGASA are good and getting better. The trouble is the last step: getting from "heavy rainfall warning over the province" to "the creek behind *these* houses will be over the bank in forty minutes, so move Lola Cora now."

That step happens at the barangay. Under the Philippine DRRM Act (RA 10121), every barangay has a disaster risk reduction and management committee, and in practice the captain, a kagawad and a few tanods make the evacuation call. They usually make it by walking to the creek with a flashlight and looking at it, sometimes at a painted gauge if there is one. That works until it's dark, raining sideways, and the water is rising faster than anyone expected.

We wanted to build something a barangay could actually own and run:

- a sensor cheap enough to buy with barangay funds, and simple enough for a local technician to fix;
- a screen that tells the person on duty what the water is doing and what it will probably do next, in plain words;
- warnings that go out in the language people at home speak;
- and a way to show all of this to people who have never seen a flood sensor, without waiting for a typhoon.

## Who it's for

| Person | What they need from it |
| --- | --- |
| Barangay captain or the kagawad on duty | One screen with the status, how fast the water is rising, and when the next alert level is expected. Big buttons for the siren and the advisory |
| Tanods | A way to check the sensor against the painted gauge, and clear instructions when the node needs attention ("Battery low: check the solar panel for dirt or shading") |
| Residents | Warnings early enough to move. In Tagalog, Cebuano or Waray, not only English |
| The MDRRMO | Timestamped readings and a CSV they can file after the event |
| Students, LGU trainers, competition judges | A way to *see* the system work without a real flood. That's what the simulator and the story game are for |

## What we built

1. **A sensor node design**: an ESP32, a waterproof ultrasonic sensor, a small solar panel and two 18650 cells on a pole with an arm reaching over the creek. See [sensor-node.md](sensor-node.md).
2. **An operations dashboard** (`dashboard.html`). It's a plain web page that works on a phone or a laptop and can connect to the real sensor over MQTT. It shows the status, the trend, the forecast and the node's health, has siren and broadcast buttons, keeps an evacuation-center headcount, and exports CSV.
3. **A 3D simulator** (`index.html`): the barangay, the creek, the pole and the people, driven by the same alert logic as the dashboard. You can play a typhoon at 10x speed, break the sensor on purpose, or feed it a real ESP32.
4. **A story game** (`play.html`). You're the barangay captain on one flood night, starting at the hall office with the forecast on the laptop. It's the part people remember, and it shows *why* a 40-minute warning matters better than any chart.
5. **Two "Bantay Baha+" add-ons**, each behind its own on/off switch:
   - a 30/60-minute [water-level forecast](forecasting.md);
   - [sensor fusion with fault detection](sensor-fusion.md), using a camera that reads the staff gauge.

## Decisions that shaped it

**Ultrasonic, not a float switch or a pressure sensor.** Nothing touches the water, so there is nothing for debris to rip off or silt to bury. The trade-off is that rain, insects and waves can confuse the echo. We deal with that by taking the median of several pings, and with the camera cross-check described in the fusion doc.

**Four alert levels with fixed thresholds.** NORMAL, ADVISORY (200 cm), WARNING (280 cm), EVACUATE (330 cm). The thresholds come from the shape of *this* creek: bank top, road level, first floors. A real deployment would set them with the barangay, using marks from past floods. A fast rise (30 cm or more in 10 minutes) bumps the status up one level early, because flash floods don't wait for a threshold.

**Plain words over numbers.** The dashboard leads with "WARNING level (280 cm) in ~12 min", not a chart. The chart is there, just lower down. People under stress act on sentences.

**Minimum spending, maximum safety.** This is paid for from barangay funds, so every peso goes to what keeps people safe: a reading you can trust, power that lasts through a typhoon, and an alarm people can see. A node costs roughly ₱2,000–8,000. The gateway is a spare phone or old laptop the hall already has. There are no subscriptions, cloud services or paid SMS. The few optional extras are listed by what each one buys in safety, with the gauge camera first. See [what it costs](sensor-node.md#what-it-costs).

**Everything runs offline.** The dashboard, fonts and alert templates are all bundled. The barangay hall's internet is usually the first thing to go in a storm. The sensor talks to a gateway on the hall's own Wi-Fi, so the system keeps working without the internet.

**The warning should come early, not late.** When two sources disagree and we can't tell which is broken, we take the higher reading. A false alarm costs a cold night in the hall. A missed one costs far more.

**Every add-on can be turned off.** The forecast and the sensor fusion each sit behind a switch. If one fails to load, or gets switched off, the core system carries on exactly as before. Nothing in the basic warning path depends on machine learning.

## What we used and why

We kept to open-source tools and open models:

| Tool | Licence | Used for |
| --- | --- | --- |
| Three.js | MIT | The 3D simulator and the game |
| Vite and TypeScript | MIT, Apache-2.0 | Build and type-checking |
| IBM Plex | OFL | Fonts, bundled so the dashboard works offline |
| scikit-learn, NumPy | BSD | Training the forecast model. The trained trees are exported to JSON and run in the browser, so Python is only needed for training |
| Chatterbox (Resemble AI) | MIT, open weights | Recording the NPC voices offline. The recordings ship with the game; nothing calls a voice API at runtime |
| Quaternius character packs | CC0 | The people in the scene |
| Ollama (optional) | MIT, open-weight models | Writing advisories with a local LLM. Off by default; the built-in templates are always the fallback |

The terrain, houses, water, textures, sounds and sirens are all generated in code, so there are no image or audio files we would need a licence for.
