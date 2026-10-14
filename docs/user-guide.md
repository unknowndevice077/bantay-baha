# User guide

There are three pages, and they're meant to be used together:

| Page | For | Open it to |
| --- | --- | --- |
| Simulator (`/`) | Seeing the whole system work | Play a storm, watch the sensor, break things on purpose |
| Dashboard (`/dashboard.html`) | The person on duty at the barangay hall | Watch the level, sound the siren, send advisories |
| Story game (`/play.html`) | Anyone who wants to feel the hour before a flood | Be the barangay captain for one night |

The live copy is at [embeddedbantaybaha.vercel.app](https://embeddedbantaybaha.vercel.app). To run it locally, use `npm i` and `npm run dev`, then open the address Vite prints.

## The simulator

On your first visit a short guide offers three ways in. **Start the storm** is the quickest way to see everything.

### Watching a storm

1. Choose **Start the storm** from the guide. If you've closed the guide, press **Play storm** in the panel and set **Speed** to 5x or 10x.
2. Watch the left side of the screen: the water level, how fast it's rising, and the status. The chart shows the last 10 minutes against the alert bands.
3. As rain builds, the status climbs from NORMAL to ADVISORY. When the rise gets fast, it jumps to WARNING early, before the level alone would. Advisories appear at the bottom in the language you've picked.
4. At WARNING the beacons flash and the residents run to the barangay hall. North-bank families cross the bridge.
5. At EVACUATE the siren wails and the main road goes under. Debris piles up against the bridge until the water tops the deck.

The **Overview**, **Sensor**, **Street**, **Bridge** and **Fly-through** buttons jump the camera to useful spots. To move around yourself: drag with the left mouse button to look, use WASD to move, Q or C to go down, and E or Space to go up.

### Looking inside the sensor

Click **Sensor**, then click the grey box on the pole. It opens. Click any part (the ESP32, the battery, the transducer, the solar panel and so on) for a card explaining what it does, with live readings. The HUD's **Device** tab shows the node's own telemetry and the JSON messages it's publishing.

### Bantay Baha+ (forecast and fusion)

These are in the **Bantay Baha+** section of the panel, each with its own tick box.

- **Forecast** (*Forecast 30 and 60 minutes ahead*): the badge on the HUD gives the expected level in 30 and 60 minutes and when the next alert level will be crossed. It needs 10 simulated minutes of readings before it says anything.
- **Sensor fusion** (*Sensor fusion: ultrasonic + gauge camera*): a second sensor, a camera reading the painted gauge. Its picture is shown in the panel. Pick a failure under *Failure to simulate* and press **Simulate sensor failure** to break the ultrasonic or blind the camera, and watch the SENSOR FAULT banner catch it. [Sensor fusion](sensor-fusion.md) explains each failure.

Untick either one and the simulator runs without it.

### Other things to try

- **Language:** English, Tagalog, Cebuano or Waray, for every advisory.
- **Lola mode** (turn Sound on): every advisory delivered by a scolding grandmother.
- **Live ESP32 input:** connect a real sensor over WebSocket or MQTT-over-WebSocket. The main README lists the accepted formats.
- **Clock:** drag it or pick Dawn, Noon, Dusk or Night. Storms at night are much harder to watch, which is rather the point.

## The dashboard

Open it from the simulator's **Dashboard** button, so it opens in a second tab and follows the simulator live. Keep both tabs open. If you open the dashboard on its own, it tells you it's waiting for the simulator and gives you a button to open it.

Reading it from top to bottom:

1. **The status card.** The big status word, the level, how fast it's rising, and the sentence that matters most: when the next alert level is expected ("WARNING level (280 cm) in ~12 min"). If the forecast is on, it shows here too.
2. **Siren.** On and off. It acts on the simulator (or the game).
3. **Advisory.** A ready-written message in the chosen language, which you can edit before sending. **Broadcast** plays it over the PA; **Copy** puts it on the clipboard for an SMS blast or the barangay Facebook page.
4. **Alarms.** When the status rises, the dashboard beeps until someone presses **Acknowledge**. It's annoying on purpose.
5. **Chart.** 10 minutes, 1 hour, 6 hours or 24 hours, with the alert bands shaded.
6. **Evacuation center.** Count families and persons in as they arrive, with a capacity bar. With the simulator feed, it also shows how many residents are inside.
7. **Sensor node health.** Battery, solar, Wi-Fi, temperature. Problems are written as instructions ("Battery low: check the solar panel for dirt or shading").
8. **Event log.** Everything that happened, with times. **Download CSV** saves all readings for the MDRRMO.

The source selector at the top switches between the simulator feed and a **live device**: a real node, over MQTT-over-WebSocket or WebSocket.

## The story game

*One night by the creek.* It's 6:20 in the evening, with a red rainfall warning over the province. You're the barangay captain, still at the hall office with Kagawad Lito. The night lasts about 12 minutes.

### Controls

| Input | Action |
| --- | --- |
| Mouse | Look around (it's captured when you press Begin) |
| W A S D | Walk; hold Shift to run |
| Space | Jump |
| C (hold) | Crouch; in deep water, sink to chin height |
| E | Use what the on-screen prompt points at: the laptop, the mats, the gauge, the siren switch, people |
| P | Phone |
| M | Mute or unmute |
| Enter or click | Skip a line of dialogue |
| Esc or the Menu button | Pause: resume, sound settings (volume, voices, effects), open the dashboard in a tab, restart, or go back to the simulator |

### How the night goes (light spoilers)

1. **Prologue.** A radio bulletin and Lito set the scene. Go to the laptop on the office desk. The forecast already sees WARNING coming in about 40 minutes, while the creek outside still looks calm.
2. **Part one: Advisory.** Send an early advisory from the dashboard. Lay out the sleeping mats in the hall. Walk down to the creek and check the sensor against the staff gauge.
3. **Part two: Over the bank.** Sound the siren, from the switch by the hall door or from the dashboard. Then three people need you in person:
   - **Toto**, a boy watching the canal by the main road. His mother, Aling Nena, is waiting for him at the hall stairs. Send him running and he goes straight into her arms.
   - **Mang Ben**, who won't leave his house across the creek. Once convinced, he goes back in for the family's bags.
   - **Lola Cora**, in her riverside house. She takes your hand and walks beside you. Walk, don't run, or her hand slips and you have to wait for her to catch up.

   Once you send the advisory, households pack go-bags and come out wearing them. Everyone who reaches the hall stops at the registration table to be counted.
4. **Part three: Evacuate.** Get everyone into the hall, then report the headcount to the MDRRMO with Lito.
5. **Epilogue.** The after-action report: who was safe, how much warning the forecast gave, when each warning went out, and how high the water got.

**Graphics.** The title screen and the Esc menu have a Graphics setting: Auto (the default) starts at High and steps down through Balanced to Fast if the game runs below about 45 frames a second; Fast, Balanced, High and Ultra fix it. Ultra adds ambient occlusion and bloom. On a slow laptop, Fast drops the shadows and renders at a lower resolution.

The current task is highlighted in the objectives panel with a line telling you exactly how to do it, and on the phone and laptop the button you need pulses. The SMS button on the in-game dashboard sends the SMS blast itself.

If you finish everything before the water reaches the next alert level, the night runs faster until it does, so you are never left standing around. The objectives panel tells you when that is happening.

Your phone (P) runs the real dashboard, fed by the game's sensor, and new forecast warnings arrive as notifications. If you wade into fast water for too long, the tanods pull you out, and that goes in the report.

The voices were recorded with Chatterbox, an open-source text-to-speech model, and each line carries the mood the script asks for: urgent, scared, stubborn, relieved. Untick *Sound and voices* on the title screen to play silently.

## Getting around

The pages link to each other, so you shouldn't need to type an address:

- **From the simulator:** the guide, plus the *Play the story* and *Dashboard* buttons in the bottom bar.
- **From the dashboard:** the *3D simulator* and *Story game* links in the header.
- **From the game:** the pause menu (Esc). It can open a dashboard tab that follows the game, restart the night, or take you back to the simulator.

The simulator and the dashboard find each other's tabs. Clicking between them switches tabs instead of piling up new ones.
