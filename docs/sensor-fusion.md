# Sensor fusion and fault detection

A single sensor can fail without making a sound. If the ultrasonic gets stuck on yesterday's reading, the dashboard keeps showing a calm green NORMAL while the creek comes over the bank. That's the failure we were most afraid of, so this add-on gives the system a second, independent pair of eyes and a set of rules for noticing when one of them is lying.

Like the forecast, it's a Bantay Baha+ add-on with its own switch. Turn it off and the simulator goes back to trusting the ultrasonic alone.

## The second sensor: a camera on the staff gauge

Many LGUs already put a painted staff gauge in their creeks, and some add a CCTV camera pointed at it. We use the same idea. In the simulator, a small camera on the village bank looks at the gauge board, lit only by its own infrared lamp, so it works the same day and night.

Every time the ultrasonic takes a reading, the camera takes a tiny picture: 24 × 256 pixels, enough to see the board. `src/fusion/cameraGauge.ts` then finds the waterline *from the pixels alone*. It doesn't peek at the simulator's water level.

- The board is painted white with dark bars. Above the water, a large share of each row's pixels is bright white.
- Below the surface, the water darkens the board.
- The first row from the top where the share of white pixels drops is the waterline. That row is projected back onto the board to give a level.
- Waves slap the board, so the camera reports the median of its last three readings, as real gauge cameras do.

The camera you see in the panel ("Bantay Baha+" section) is that actual picture, with the detected waterline drawn on it.

**What the camera can't do:** at low water, the bottom of the board is above the creek, or the water at its foot is too shallow to darken the paint. Then the camera only knows "the water is *no higher than* this". It reports that as `low`, and the fusion treats it as an upper limit, not a reading.

## Combining the two

When both sensors are healthy, they're combined by **inverse-variance weighting**: each one counts in proportion to how precise it is.

| Sensor | Typical noise | Weight in practice |
| --- | --- | --- |
| Ultrasonic | about ±3 mm | dominates |
| Gauge camera | about ±6 cm (measured, waves included) | small nudge |

So in normal operation the fused level is essentially the ultrasonic reading. The camera's real job is to be there to disagree.

## Spotting a fault

`src/fusion/fusion.ts` raises a **SENSOR FAULT** in any of these cases:

| Rule | Catches | Why this threshold |
| --- | --- | --- |
| The ultrasonic gives the same value 8 times running | A frozen sensor or a hung firmware loop | A real echo always jitters by a millimetre or so. At one reading every 5 seconds, eight identical ones is 40 seconds of "impossible" |
| 2 or more jumps over 25 cm within a minute | Erratic echoes off rain, insects or debris | Real water doesn't jump 25 cm and back in 5 seconds |
| The two sensors differ by more than 30 cm for 30 simulated seconds | Drift, such as a sagging bracket, or anything else neither rule recognises | Short splashes are ignored; a sustained gap isn't |
| No waterline found in the picture | A blocked or fogged lens, or glare | The camera says when it's blind |

When a fault is raised:

1. The SENSOR FAULT banner appears with a plain description ("Sensor fault · Ultrasonic reading frozen · using gauge camera").
2. The level comes from the healthier source alone, until they agree again.
3. If neither rule explains the disagreement, **the higher reading wins**. A broken sensor can make a warning come early, but never late.

### Things that went wrong while we built it

Each of these made the fusion pick the wrong answer before we fixed it:

- **We first mounted the camera too low.** In a big flood the water reached the camera's own field of view and it read nonsense. It now sits above the highest flood the model allows, a few metres back from the bank.
- **At 10x speed the camera fell behind.** It was only taking pictures every so often, so during a fast rise it was always a step behind the ultrasonic, and that looked like a disagreement. Now it takes a picture with every reading, and uses the median of three.
- **A frozen sensor fooled the fusion.** Early on, a stuck ultrasonic reading still looked "precise" (zero noise!), so inverse-variance weighting trusted it *more*. That's how the "8 identical readings" rule came about.
- **Shallow water read as no water.** With only a few centimetres at the foot of the board, the camera couldn't see the line and confidently reported the bottom of the gauge. That's why it now reports `low` below about 35 cm above the foot.

## Trying it yourself

In the simulator, open the panel and find **Bantay Baha+**. Make sure *Sensor fusion* is ticked, pick one under *Failure to simulate* and press **Simulate sensor failure**:

| Failure | What happens to the sensor | What you should see |
| --- | --- | --- |
| Ultrasonic stuck | The reading freezes | SENSOR FAULT within about 40 simulated seconds; the level follows the camera |
| Erratic echoes | 3 in 10 readings come back early, off "raindrops" | SENSOR FAULT; the spikes don't trigger an alert |
| Drifting | Reads 5 cm further every simulated minute, like a bracket sagging | SENSOR FAULT once the gap passes 30 cm; the higher (correct) reading is used |
| Camera lens blocked | The camera sees nothing | SENSOR FAULT on the camera; the ultrasonic carries on alone |

Press **Repair the sensor** to put it back. The banner clears once the two sensors agree again.
