# Water-level forecast

The forecast answers the question the barangay captain actually asks: *how long do we have?* Every half minute it predicts the water level 30 and 60 minutes ahead, then turns that into a sentence such as:

> ADVISORY level (200 cm) in ~5 min, then WARNING (280 cm) in ~40 min

That sentence is what you see on the dashboard, on the simulator's HUD, and on the phone and laptop in the story game.

The forecast is a Bantay Baha+ add-on. It can be switched off in the simulator's panel, and nothing else depends on it. The alert levels themselves always come from the measured water, never from the forecast.

## Why a model at all

The simplest forecast is "the water keeps rising at the rate it's rising now". We tried that first. It's fine for ten minutes. Over an hour it's badly wrong in both directions: it overshoots as a storm eases off and undershoots as a new rain band arrives. In our tests, its average error at +60 minutes was worse than not predicting any change at all. The [results page](forecast-results.md) has the numbers.

The creek's behaviour depends on how much rain has fallen recently and how high it already is. A wet creek with heavy rain rises much faster than a dry one with the same rain. A small model that looks at both does far better than a straight line.

## Training data

We don't have years of sensor readings from a real creek; nobody does yet for this spot. So we trained on synthetic storms, run through the same catchment model the simulator uses:

```
dL/dt = 4e-5 × rain(mm/hr) − (L − 0.9) / 900
```

This is a "linear reservoir": rain fills the creek, and the creek drains back toward its normal level of 0.9 m. `tools/forecast/generate_dataset.py` makes 900 storms from a fixed seed:

- the simulator's typhoon band, plus stretched and scaled copies of it;
- storms with two rain bands;
- short flash-flood bursts;
- long drizzles.

The rain wobbles at random, the creek starts wet or dry, and every reading gets the same few millimetres of jitter as the simulated sensor.

The storms are split **by storm, not by minute**: 540 for training, 180 for choosing the model, 180 kept aside for the final test. Splitting by minute would let the model "see" the same storm in training and testing, and it would look much better than it really is.

## Features

From the last 30 minutes of readings (`tools/forecast/features.py`, mirrored in `src/forecast/model.ts`):

| Feature | Meaning |
| --- | --- |
| `level_m` | The level now |
| `excess_m` | How far above the creek's normal level it is |
| `d5_m`, `d10_m`, `d20_m`, `d30_m` | How much it rose over the last 5, 10, 20 and 30 minutes |
| `rain_mmhr` | Rain now |
| `rain10_mmhr`, `rain30_mmhr` | Average rain over the last 10 and 30 minutes |
| `rain_trend_mmhr` | Whether the rain is getting heavier or easing |

The model predicts the *change* in level, not the level itself. That keeps it honest at different starting heights.

## The model

`tools/forecast/train.py` compares:

- **Persistence:** no change. The baseline to beat.
- **Trend:** the last 10 minutes continue.
- **Ridge regression:** a linear model on the features above.
- **Gradient-boosted trees** (scikit-learn, 250 trees, depth 3).

The boosted trees won on the validation storms and were exported. On the test storms they cut the error of the "no change" forecast roughly in half: about 20 cm average error at +30 minutes and 30 cm at +60.

### Running it in the browser

We didn't want the dashboard to need a Python server. So `train.py` writes the trees out as plain JSON (`public/forecast/model.json`, about 200 KB), and `src/forecast/model.ts` walks them in TypeScript.

To make sure the browser computes exactly what Python computed, the JSON carries a set of reference inputs and the outputs Python got for them. When the page loads the model, it re-runs those inputs. If any answer is off by more than a millimetre, it refuses to use the model and says "Forecast unavailable" rather than show numbers we can't trust. It also refuses a model trained on a different list of features. The two copies of the feature code, Python and TypeScript, are the easiest place for a silent mistake to creep in.

## Using the weather outlook

The trained model only knows rain that has already fallen. That's its biggest weakness. At the start of a storm, the creek is still rising slowly, so the model calmly predicts a slow rise, even when the next band of heavy rain is already on the radar.

When a rainfall outlook is available (in the story game, PAGASA's bulletin for the next few hours), the forecaster switches to a different method: it runs the catchment model forward a minute at a time under the expected rain. That's how, in the game, the laptop can say WARNING is about 40 minutes away while the creek looks almost calm. We learned this by playing our own game: without the outlook, the forecast spotted the flood far too late to be any use to the story, which is exactly the real-world problem.

In a real deployment, the outlook would come from PAGASA's rainfall forecasts or a local rain gauge upstream. Wiring that in is on the [next-steps list](limitations-and-next-steps.md).

## From numbers to a sentence

`src/forecast/forecaster.ts` draws a line through now, +30 and +60 minutes and looks for the first alert line it crosses. If a higher line is crossed within the hour as well, it names that one too: that's the one the captain really needs to hear about. Times are rounded to the nearest 5 minutes ("in ~25 min"). A forecast that claims to be accurate to the minute is overselling itself. Under 2 minutes, it says "within minutes".

It needs 10 minutes of readings before it says anything ("Warming up"). The game hands it the afternoon's readings at the start, so it can speak straight away.

## Reproducing it

```bash
pip install -r tools/forecast/requirements.txt
```

```bash
python tools/forecast/generate_dataset.py
```

```bash
python tools/forecast/train.py
```

```bash
python tools/forecast/evaluate.py
```

Everything is seeded, so you should get the same model and the same numbers as [forecast-results.md](forecast-results.md).
