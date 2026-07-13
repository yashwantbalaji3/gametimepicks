"""
model_moneyline — transparent, conservative UFC moneyline model. Starts from the
market-implied probability and applies a SMALL, capped stats adjustment (shrunk
toward market), only when data quality is sufficient. Produces INTERNAL
projections; publicEligible is NEVER true unless every readiness gate passes
(backtest + model validation). No leakage, no overclaim.

Run: python -m pipeline.ufc.model_moneyline
"""
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA = REPO_ROOT / "app" / "public" / "data" / "ufc"
# Internal (non-public) UFC artifacts live OUTSIDE app/public so they are never web-served.
INTERNAL = REPO_ROOT / "data" / "internal" / "ufc"
OUT = INTERNAL / "projections-internal-latest.json"

# Conservative weights on normalized deltas; total adjustment hard-capped.
W = {"recentWinRate": 0.06, "winRate": 0.05, "finishRate": 0.03,
     "sigStrPerRound": 0.004, "takedownsPerRound": 0.02, "reachInches": 0.002,
     "experience": 0.001}
MAX_ADJ = 0.04           # ±4 percentage points until a backtest proves more
SHRINK = 0.5             # blend stats adjustment 50% toward market until validated
MIN_DATA_QUALITY = 0.75  # below this, shrink almost fully to market


def _logistic_cap(x: float, cap: float) -> float:
    return cap * (2.0 / (1.0 + math.exp(-x)) - 1.0)  # maps R → (-cap, cap)


def project(feat: dict, validated: bool = False) -> dict:
    d = feat.get("deltas", {})
    score = 0.0
    for k, w in W.items():
        v = d.get(k)
        if v is not None:
            score += w * v
    adj = _logistic_cap(score, MAX_ADJ)
    dq = feat.get("dataQuality", 0)
    eff_shrink = SHRINK if dq >= MIN_DATA_QUALITY else 0.85  # low quality → toward market
    adj *= (1 - eff_shrink)
    mia = feat.get("marketImpliedA")
    if mia is None:
        return {"blocked": True, "reason": "no market probability"}
    model_a = min(0.97, max(0.03, mia + adj))
    model_b = 1 - model_a
    edge_a = round(model_a - mia, 4)
    futures = feat.get("isFutures")
    blockers = []
    if futures:
        blockers.append("futures/hypothetical matchup — not a real scheduled bout")
    if dq < MIN_DATA_QUALITY:
        blockers.append("low data quality")
    # publicEligible requires validation AND a clean, real, high-quality bout
    public_eligible = bool(validated and not futures and dq >= MIN_DATA_QUALITY)
    label = "No-play" if (futures or abs(edge_a) < 0.02) else ("Model lean" if validated else "Watchlist")
    return {
        "fighter": feat["fighterA"], "opponent": feat["fighterB"],
        "oddsPrice": feat["oddsA"],
        "marketImpliedProbability": mia,
        "modelProbability": round(model_a, 4),
        "modelAdjustment": round(adj, 4),
        "edge": edge_a,
        "confidenceLabel": label,
        "dataQuality": dq,
        "isFutures": futures,
        "publicEligible": public_eligible,
        "blockers": blockers,
    }


def build(features: dict, validated: bool = False, now: datetime | None = None) -> dict:
    ref = now or datetime.now(timezone.utc)
    rows = []
    for feat in features.get("features", []):
        p = project(feat, validated)
        if p.get("blocked"):
            continue
        p["boutId"] = feat.get("boutId")
        p["commenceTime"] = feat.get("commenceTime")
        rows.append(p)
    pub = sum(1 for r in rows if r["publicEligible"])
    return {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "market": "h2h",
        "modelVersion": 1,
        "validated": validated,
        "boutCount": len(rows),
        "publicEligibleCount": pub,
        "note": "INTERNAL projections. Market-implied baseline + capped (<=4pp) shrunk "
                "stats adjustment. publicEligible requires a passing backtest + a real, "
                "high-quality, non-futures bout. Not picks.",
        "projections": rows,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default=None); ap.add_argument("--card-only", action="store_true"); args = ap.parse_args(argv)
    feat_file = "features-card-latest.json" if args.card_only else "features-latest.json"
    try:
        feats = json.loads((DATA / feat_file).read_text())
    except Exception:
        feats = {"features": []}
    # validated comes from the backtest gate — false today.
    try:
        from .build_readiness import backtest_gate
        validated = backtest_gate()[0]
    except Exception:
        validated = False
    payload = build(feats, validated=validated)
    out = Path(args.out) if args.out else (INTERNAL / ("projections-internal-card-latest.json" if args.card_only else "projections-internal-latest.json"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {out} → bouts={payload['boutCount']} publicEligible={payload['publicEligibleCount']} validated={validated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
