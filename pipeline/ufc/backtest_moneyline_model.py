"""
backtest_moneyline_model — leakage-safe calibration on the backtest dataset.
Today only the MARKET-IMPLIED baseline is valid (odds are pregame, no leakage). A
fighter-stat model is NOT validated yet because we lack POINT-IN-TIME pre-fight
feature snapshots (current fighter stats include the fight being predicted →
leakage). So we report the market baseline + an explicit leakage warning; we do
NOT claim a model edge.

Run: python -m pipeline.ufc.backtest_moneyline_model
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA = REPO_ROOT / "app" / "public" / "data" / "ufc"
OUT = DATA / "backtest-summary-latest.json"
PUBLIC_MIN_ROWS = 150  # public projections require a real out-of-sample sample


def evaluate(dataset: dict, now: datetime | None = None) -> dict:
    ref = now or datetime.now(timezone.utc)
    rows = dataset.get("rows", [])
    n = len(rows)
    brier = None
    buckets = {}
    if n:
        s = 0.0
        for r in rows:
            p = r.get("impliedProbability")
            if p is None:
                continue
            y = 1 if r["result"] == "win" else 0
            s += (p - y) ** 2
            b = f"{int(p * 10) * 10}-{int(p * 10) * 10 + 10}%"
            buckets.setdefault(b, [0, 0])
            buckets[b][0] += y
            buckets[b][1] += 1
        brier = round(s / n, 4)
    launch_pass = (n >= PUBLIC_MIN_ROWS and dataset.get("leakageFailures", 1) == 0 and brier is not None)
    return {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "rowCount": n,
        "marketImpliedBrier": brier,
        "calibrationBuckets": {k: {"wins": v[0], "n": v[1]} for k, v in buckets.items()},
        "modelValidated": False,
        "modelLeakageWarning": "fighter-stat model NOT validated: no point-in-time "
                               "pre-fight feature snapshots yet (current stats leak the "
                               "predicted fight). Only the market-implied baseline is leakage-safe.",
        "publicMinRows": PUBLIC_MIN_ROWS,
        "launchDecision": "pass" if launch_pass else "hold",
        "launchReason": ("market-implied baseline validated on >=150 clean rows" if launch_pass
                         else f"insufficient clean rows ({n}/{PUBLIC_MIN_ROWS}) or no validated model"),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default=str(DATA / "backtest-dataset-latest.json"))
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args(argv)
    try:
        ds = json.loads(Path(args.dataset).read_text())
    except Exception:
        ds = {"rows": [], "leakageFailures": 1}
    summary = evaluate(ds)
    Path(args.out).write_text(json.dumps(summary, indent=2) + "\n")
    print(f"wrote {args.out} → rows={summary['rowCount']} brier={summary['marketImpliedBrier']} "
          f"decision={summary['launchDecision']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
