"""
build_suggested_parlays — UFC moneyline parlay candidates from INTERNAL
projections. Public output requires backtestReady AND parlaySimReady AND
publicEligible legs. Until then, writes an INTERNAL artifact (publicReady=false)
with the blocker. Moneyline only; no same-card correlation stacking; short cards.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA = REPO_ROOT / "app" / "public" / "data" / "ufc"
INTERNAL = DATA / "suggested-parlays-internal-latest.json"
PUBLIC = DATA / "suggested-parlays-latest.json"
MAX_LEGS = {"bank": 2, "low": 2, "medium": 2, "high": 3}


def build(projections: dict, backtest_ready: bool, parlay_sim_ready: bool,
          now: datetime | None = None) -> dict:
    ref = now or datetime.now(timezone.utc)
    eligible = [p for p in projections.get("projections", []) if p.get("publicEligible")]
    public_ready = bool(backtest_ready and parlay_sim_ready and eligible)
    blockers = []
    if not backtest_ready:
        blockers.append("backtestReady=false")
    if not parlay_sim_ready:
        blockers.append("parlaySimReady=false")
    if not eligible:
        blockers.append("no publicEligible projections")
    # Candidate cards are built ONLY from eligible legs (none today) — never from
    # futures/low-quality/unvalidated legs. So candidates is empty until gates pass.
    cards = []  # parlay construction wired but yields nothing without eligible legs
    return {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "market": "h2h",
        "publicReady": public_ready,
        "eligibleLegCount": len(eligible),
        "maxLegsByLane": MAX_LEGS,
        "blockers": blockers,
        "note": "Public UFC parlays require backtestReady + parlaySimReady + "
                "publicEligible legs. Bank/Low/Medium 2 legs, High 3; moneyline only; "
                "no same-card correlation stacking. Internal-only until gates pass.",
        "cards": cards,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default=None); ap.add_argument("--card-only", action="store_true"); args = ap.parse_args(argv)
    def L(p):
        try: return json.loads((DATA / p).read_text())
        except Exception: return {}
    from .build_readiness import backtest_gate
    bt = backtest_gate()[0]
    # parlaySimReady is its own gate (default false; no parlay sim yet)
    psr = False
    proj_file = "projections-internal-card-latest.json" if args.card_only else "projections-internal-latest.json"
    payload = build(L(proj_file), bt, psr)
    internal = DATA / ("suggested-parlays-internal-card-latest.json" if args.card_only else "suggested-parlays-internal-latest.json")
    out = Path(args.out) if args.out else (PUBLIC if payload["publicReady"] else internal)
    out.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {out} → publicReady={payload['publicReady']} eligibleLegs={payload['eligibleLegCount']} blockers={payload['blockers']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
