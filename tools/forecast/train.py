"""Train the +30 / +60 minute water-level forecaster and export it for the browser.

Candidates, both predicting the level change at each horizon from the
features in features.py:
  * ridge  - standardised ridge regression (the baseline)
  * gbr    - scikit-learn gradient-boosted trees (depth 3)
Storms are split by id (never by minute, so no storm leaks across sets):
id % 5 == 0 -> test (left for evaluate.py), id % 5 == 1 -> validation, rest -> train.
Whichever candidate has the lower mean validation MAE over both horizons is
written to public/forecast/model.json, with a few reference input/output pairs
the browser re-checks on load.

    python tools/forecast/train.py
"""
import json
from pathlib import Path

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

from features import FEATURES, HORIZONS_MIN, build
from generate_dataset import load

ROOT = Path(__file__).resolve().parents[2]
MODEL_OUT = ROOT / "public" / "forecast" / "model.json"
METRICS_OUT = Path(__file__).parent / "data" / "train_metrics.json"
SEED = 2026


def split(ids):
    test = ids % 5 == 0
    val = ids % 5 == 1
    return ~(test | val), val, test


def fit_ridge(x, y):
    scaler = StandardScaler().fit(x)
    model = Ridge(alpha=1.0).fit(scaler.transform(x), y)
    return scaler, model


def fit_gbr(x, y):
    return [
        GradientBoostingRegressor(n_estimators=250, max_depth=3, learning_rate=0.06, subsample=0.8, random_state=SEED).fit(x, y[:, k])
        for k in range(y.shape[1])
    ]


def r(v, digits=6):
    return float(f"{float(v):.{digits}g}")


def export_ridge(scaler, model):
    return {
        "type": "ridge",
        "mean": [r(v) for v in scaler.mean_],
        "scale": [r(v) for v in scaler.scale_],
        "coef": [[r(c) for c in row] for row in model.coef_],
        "intercept": [r(v) for v in model.intercept_],
    }


def export_gbr(models):
    out = []
    for m in models:
        trees = []
        for est in m.estimators_[:, 0]:
            t = est.tree_
            trees.append({
                "f": t.feature.tolist(),
                "t": [r(v) for v in t.threshold],
                "l": t.children_left.tolist(),
                "r": t.children_right.tolist(),
                "v": [r(v) for v in t.value[:, 0, 0]],
            })
        out.append({"init": r(m.init_.constant_[0][0]), "lr": m.learning_rate, "trees": trees})
    return {"type": "gbr", "horizons": out}


def main():
    storms = load()
    x, y, ids = build(storms)
    tr, va, _ = split(ids)
    print(f"{len(x):,} samples: train {tr.sum():,}, validation {va.sum():,}")

    # The trees don't need every minute of every storm; every 2nd sample keeps training quick.
    sub = np.where(tr)[0][::2]
    scaler, ridge = fit_ridge(x[tr], y[tr])
    gbr = fit_gbr(x[sub], y[sub])

    pred = {
        "ridge": ridge.predict(scaler.transform(x[va])),
        "gbr": np.column_stack([m.predict(x[va]) for m in gbr]),
    }
    mae = {name: [float(np.mean(np.abs(p[:, k] - y[va][:, k]))) for k in range(len(HORIZONS_MIN))] for name, p in pred.items()}
    for name, errs in mae.items():
        print(f"{name:6s} validation MAE: " + ", ".join(f"+{h} min {e * 100:.1f} cm" for h, e in zip(HORIZONS_MIN, errs)))
    best = min(mae, key=lambda n: np.mean(mae[n]))
    print(f"-> exporting {best}")

    model = export_ridge(scaler, ridge) if best == "ridge" else export_gbr(gbr)
    # Reference vectors for the browser's parity check.
    pick = np.where(va)[0][:: max(1, va.sum() // 6)][:6]
    check_y = pred[best][np.searchsorted(np.where(va)[0], pick)]
    MODEL_OUT.parent.mkdir(parents=True, exist_ok=True)
    MODEL_OUT.write_text(json.dumps({
        "version": 1,
        "features": FEATURES,
        "horizonsMin": list(HORIZONS_MIN),
        "validationMaeM": [r(v, 4) for v in mae[best]],
        "model": model,
        "check": {"x": [[r(v) for v in row] for row in x[pick]], "y": [[r(v) for v in row] for row in check_y]},
    }, separators=(",", ":")))
    METRICS_OUT.write_text(json.dumps({"validation_mae_m": mae, "chosen": best}, indent=2))
    print(f"wrote {MODEL_OUT.relative_to(ROOT)} ({MODEL_OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
