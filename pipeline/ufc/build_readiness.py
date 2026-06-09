"""
build_readiness — emit the UFC public readiness artifact (FAIL-CLOSED).

Mirrors the launch-gate ladder in app/src/lib/ufc-types.ts (ufcPublicLevel):
  schedule + odds          → odds-internal (still NO public picks)
  + fighter stats          → projections-internal
  + results grading + backtest → parlays-public
Anything missing keeps projections/parlays locked. This script NEVER invents data;
each gate must be backed by a real, connected provider. Today only the free ESPN
MMA schedule exists, so the artifact reports schedule-only with everything else
pending.

Run: python -m pipeline.ufc.build_readiness [--date YYYY-MM-DD] [--out PATH]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DEFAULT = REPO_ROOT / "app" / "public" / "data" / "ufc" / "readiness-latest.json"

# The REAL current gate state. Update a flag ONLY when its provider is genuinely
# connected + validated — never optimistically. (Matches UFC_CURRENT_GATES in
# ufc-types.ts.)
CURRENT_GATES: dict[str, bool] = {
    "scheduleReady": True,       # free ESPN MMA schedule
    "oddsReady": False,          # Odds API MMA not connected
    "fighterStatsReady": False,  # no fighter-stat provider
    "gradingReady": False,       # no results-grading contract
    "backtestReady": False,      # no historical backtest
}


def derive_readiness(gates: dict[str, bool]) -> dict[str, object]:
    """Fail-closed derivation. projections require schedule+odds+stats+grading;
    parlays additionally require a backtest. Each derived flag is the AND of its
    real prerequisites — there is no way to flip picks on without the data."""
    schedule = bool(gates.get("scheduleReady"))
    odds = bool(gates.get("oddsReady"))
    stats = bool(gates.get("fighterStatsReady"))
    grading = bool(gates.get("gradingReady"))
    backtest = bool(gates.get("backtestReady"))

    projections_ready = schedule and odds and stats and grading
    parlay_ready = projections_ready and backtest

    blockers: list[str] = []
    if not odds:
        blockers.append("odds provider not connected (Odds API MMA)")
    if not stats:
        blockers.append("fighter-stat provider not connected")
    if not grading:
        blockers.append("results grading not implemented")
    if not backtest:
        blockers.append("no historical backtest yet")

    if parlay_ready:
        public_level = "parlays-public"
    elif projections_ready:
        public_level = "projections-public"
    elif schedule and odds and stats:
        public_level = "projections-internal"
    elif schedule and odds:
        public_level = "odds-internal"
    else:
        public_level = "schedule-only"

    if public_level == "schedule-only":
        public_message = "UFC coverage is being built — schedule available; predictions publish only after odds, fighter stats, results grading, and backtesting are connected."
    elif public_level in ("odds-internal", "projections-internal"):
        public_message = "UFC odds/stats are being connected. Model picks publish only after results grading and a backtest pass."
    else:
        public_message = "UFC model picks are live."

    return {
        "scheduleReady": schedule,
        "oddsReady": odds,
        "fighterStatsReady": stats,
        "gradingReady": grading,
        "backtestReady": backtest,
        "projectionsReady": projections_ready,
        "parlayReady": parlay_ready,
        "publicLevel": public_level,
        "blockers": blockers,
        "providerStatus": {
            "schedule": "espn_mma" if schedule else "none",
            "odds": "the_odds_api_mma" if odds else "not_connected",
            "fighterStats": "connected" if stats else "not_connected",
            "grading": "connected" if grading else "not_connected",
        },
        "publicMessage": public_message,
        "internalMessage": f"fail-closed: projectionsReady={projections_ready} parlayReady={parlay_ready}; blockers={blockers}",
    }


def build(date: str | None, gates: dict[str, bool] | None = None) -> dict[str, object]:
    payload = {"generatedFor": date, "nextEventDate": None}
    payload.update(derive_readiness(gates if gates is not None else CURRENT_GATES))
    return payload


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=None)
    ap.add_argument("--out", default=str(OUT_DEFAULT))
    args = ap.parse_args(argv)
    payload = build(args.date)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {out} → publicLevel={payload['publicLevel']} parlayReady={payload['parlayReady']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
