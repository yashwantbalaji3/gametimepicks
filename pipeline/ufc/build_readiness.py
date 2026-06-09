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
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DEFAULT = REPO_ROOT / "app" / "public" / "data" / "ufc" / "readiness-latest.json"
ODDS_ARTIFACT = REPO_ROOT / "app" / "public" / "data" / "ufc" / "odds-latest.json"
ODDS_FRESH_HOURS = 48  # odds older than this are stale → oddsReady stays false

# The REAL current gate state. scheduleReady is static (free ESPN MMA); oddsReady
# is now DERIVED from the real odds artifact (see odds_gate). The rest stay false
# until their providers are genuinely connected — never optimistically.
CURRENT_GATES: dict[str, bool] = {
    "scheduleReady": True,       # free ESPN MMA schedule
    "oddsReady": False,          # DERIVED from odds-latest.json at build time
    "fighterStatsReady": False,  # no fighter-stat provider (paid decision pending)
    "gradingReady": False,       # no results-grading contract
    "backtestReady": False,      # no historical backtest
    "parlaySimReady": False,     # no parlay simulation yet
}


def odds_gate(path: Path = ODDS_ARTIFACT, now: datetime | None = None) -> tuple[bool, dict]:
    """Derive oddsReady from the REAL odds artifact: it must exist, report
    oddsReady=true, carry >=1 bout, and be fresh (<48h). Fail-closed on any
    problem. Returns (oddsReady, providerStatus)."""
    status = {"configured": True, "lastFetchAt": None, "eventCount": 0,
              "marketCount": 0, "oddsReady": False, "warnings": []}
    if not path.exists():
        status["warnings"].append("odds artifact missing")
        return False, status
    try:
        art = json.loads(path.read_text())
    except Exception:
        status["warnings"].append("odds artifact corrupt")
        return False, status
    status["lastFetchAt"] = art.get("generatedAt")
    status["eventCount"] = art.get("eventCount", 0)
    status["marketCount"] = art.get("marketCount", 0)
    fresh = True
    ts = art.get("generatedAt")
    if isinstance(ts, str):
        try:
            age_h = ((now or datetime.now(timezone.utc)) - datetime.fromisoformat(ts)).total_seconds() / 3600.0
            fresh = age_h <= ODDS_FRESH_HOURS
            if not fresh:
                status["warnings"].append(f"odds stale ({age_h:.0f}h)")
        except Exception:
            fresh = False
    ready = bool(art.get("oddsReady")) and (art.get("marketCount", 0) > 0) and fresh
    status["oddsReady"] = ready
    return ready, status


FIGHTERS_ARTIFACT = REPO_ROOT / "app" / "public" / "data" / "ufc" / "fighters-latest.json"
FIGHTER_MIN_COUNT = 200          # need a real fighter database, not a stub
FIGHTER_FRESH_DAYS = 120         # latest fight within ~4 months


def fighter_stats_gate(path: Path = FIGHTERS_ARTIFACT, now: datetime | None = None) -> tuple[bool, dict]:
    """Derive fighterStatsReady from the REAL derived fighter artifact: exists,
    has provider+license metadata, >= FIGHTER_MIN_COUNT fighters, fresh latest
    fight, and enough fighters carry usable rates. Fail-closed."""
    status = {"configured": True, "fighterCount": 0, "fightCount": 0,
              "latestFightDate": None, "fighterStatsReady": False, "warnings": []}
    if not path.exists():
        status["warnings"].append("fighters artifact missing")
        return False, status
    try:
        art = json.loads(path.read_text())
    except Exception:
        status["warnings"].append("fighters artifact corrupt")
        return False, status
    status["fighterCount"] = art.get("fighterCount", 0)
    status["fightCount"] = art.get("fightCount", 0)
    status["latestFightDate"] = art.get("latestFightDate")
    if not art.get("provider") or not art.get("sourceLicense"):
        status["warnings"].append("missing provider/license metadata")
        return False, status
    if status["fighterCount"] < FIGHTER_MIN_COUNT:
        status["warnings"].append(f"too few fighters ({status['fighterCount']})")
        return False, status
    fresh = False
    ld = art.get("latestFightDate")
    if isinstance(ld, str):
        try:
            fresh = ((now or datetime.now(timezone.utc)).date() - datetime.fromisoformat(ld).date()).days <= FIGHTER_FRESH_DAYS
        except Exception:
            fresh = False
    if not fresh:
        status["warnings"].append("fighter data stale")
        return False, status
    # require a reasonable share of fighters to carry strike/TD rates
    fighters = art.get("fighters") or []
    with_rates = sum(1 for f in fighters if (f.get("rates") or {}).get("statRounds"))
    if fighters and with_rates / len(fighters) < 0.5:
        status["warnings"].append("insufficient fighters with stat rates")
        return False, status
    status["fighterStatsReady"] = True
    return True, status


RESULTS_ARTIFACT = REPO_ROOT / "app" / "public" / "data" / "ufc" / "results-latest.json"
GRADED_ARTIFACT = REPO_ROOT / "app" / "public" / "data" / "ufc" / "graded-moneylines-latest.json"
GRADING_MIN_FINAL = 100          # need a real results corpus
GRADING_FRESH_DAYS = 120


def grading_gate(results_path: Path = RESULTS_ARTIFACT, graded_path: Path = GRADED_ARTIFACT,
                 now: datetime | None = None) -> tuple[bool, dict]:
    """Derive gradingReady: a real results artifact (>=100 final bouts, fresh,
    licensed) AND a working moneyline grader (graded artifact present + has graded
    >=1 decisive result, proving the grader functions). Fail-closed."""
    status = {"configured": True, "eventCount": 0, "finalBoutCount": 0,
              "latestEventDate": None, "gradingReady": False, "warnings": []}
    if not results_path.exists():
        status["warnings"].append("results artifact missing")
        return False, status
    try:
        res = json.loads(results_path.read_text())
    except Exception:
        status["warnings"].append("results artifact corrupt")
        return False, status
    status["eventCount"] = res.get("eventCount", 0)
    status["finalBoutCount"] = res.get("finalBoutCount", 0)
    status["latestEventDate"] = res.get("latestEventDate")
    if not res.get("provider") or not res.get("sourceLicense"):
        status["warnings"].append("missing provider/license metadata")
        return False, status
    if status["finalBoutCount"] < GRADING_MIN_FINAL:
        status["warnings"].append(f"too few final bouts ({status['finalBoutCount']})")
        return False, status
    ld = res.get("latestEventDate")
    fresh = isinstance(ld, str) and (((now or datetime.now(timezone.utc)).date() - datetime.fromisoformat(ld).date()).days <= GRADING_FRESH_DAYS)
    if not fresh:
        status["warnings"].append("results stale")
        return False, status
    # grader must function: a graded artifact exists with >=1 decisive grade
    if not graded_path.exists():
        status["warnings"].append("moneyline grader has not run")
        return False, status
    try:
        gr = json.loads(graded_path.read_text())
        decisive = (gr.get("tally", {}).get("win", 0) + gr.get("tally", {}).get("loss", 0))
    except Exception:
        decisive = 0
    if decisive < 1:
        status["warnings"].append("grader produced no decisive grades to validate")
        return False, status
    status["gradingReady"] = True
    return True, status


BACKTEST_SUMMARY = REPO_ROOT / "app" / "public" / "data" / "ufc" / "backtest-summary-latest.json"
BACKTEST_MIN_ROWS = 150          # public projections need a real out-of-sample sample


def backtest_gate(summary_path: Path = BACKTEST_SUMMARY) -> tuple[bool, dict]:
    """Derive backtestReady: a leakage-safe backtest summary with >= 150 clean
    rows, no leakage failures, and launchDecision == 'pass'. Fail-closed."""
    status = {"configured": True, "rowCount": 0, "marketImpliedBrier": None,
              "launchDecision": "hold", "backtestReady": False, "warnings": []}
    if not summary_path.exists():
        status["warnings"].append("backtest summary missing (collecting odds snapshots)")
        return False, status
    try:
        s = json.loads(summary_path.read_text())
    except Exception:
        status["warnings"].append("backtest summary corrupt")
        return False, status
    status["rowCount"] = s.get("rowCount", 0)
    status["marketImpliedBrier"] = s.get("marketImpliedBrier")
    status["launchDecision"] = s.get("launchDecision", "hold")
    if status["rowCount"] < BACKTEST_MIN_ROWS:
        status["warnings"].append(f"insufficient clean rows ({status['rowCount']}/{BACKTEST_MIN_ROWS})")
        return False, status
    if s.get("launchDecision") != "pass":
        status["warnings"].append("launch decision not pass")
        return False, status
    status["backtestReady"] = True
    return True, status


def derive_readiness(gates: dict[str, bool]) -> dict[str, object]:
    """Fail-closed derivation. PUBLIC projections require
    schedule+odds+stats+grading+BACKTEST (no out-of-sample validation → no publish).
    PUBLIC parlays require all of the above PLUS a separate parlay simulation
    (parlaySimReady) — a passing single-fight backtest never auto-enables parlays."""
    schedule = bool(gates.get("scheduleReady"))
    odds = bool(gates.get("oddsReady"))
    stats = bool(gates.get("fighterStatsReady"))
    grading = bool(gates.get("gradingReady"))
    backtest = bool(gates.get("backtestReady"))
    parlay_sim = bool(gates.get("parlaySimReady"))

    # Public picks require the FULL ladder including a backtest. Grading alone only
    # advances the INTERNAL level. Parlays additionally require a parlay simulation.
    projections_ready = schedule and odds and stats and grading and backtest
    parlay_ready = projections_ready and parlay_sim

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
    elif schedule and odds and stats and grading:
        public_level = "grading-internal"
    elif schedule and odds and stats:
        public_level = "projections-internal"
    elif schedule and odds:
        public_level = "odds-internal"
    else:
        public_level = "schedule-only"

    if public_level == "schedule-only":
        public_message = "UFC coverage is being built — schedule available; predictions publish only after odds, fighter stats, results grading, and backtesting are connected."
    elif public_level in ("odds-internal", "projections-internal", "grading-internal"):
        public_message = "UFC odds, fighter stats, and results grading are being connected. Model picks publish only after a backtest passes."
    else:
        public_message = "UFC model picks are live."

    return {
        "scheduleReady": schedule,
        "oddsReady": odds,
        "fighterStatsReady": stats,
        "gradingReady": grading,
        "backtestReady": backtest,
        "parlaySimReady": parlay_sim,
        # Prop markets (method/distance/round) require their OWN OddsAPI markets,
        # which The Odds API MMA does NOT expose (h2h only, confirmed by the
        # discovery probe). So these are hard-false — no odds to anchor a model.
        "distancePropsReady": False,
        "methodPropsReady": False,
        "roundPropsReady": False,
        "propMarketsAvailable": {"h2h": True, "method": False, "distance": False, "rounds": False},
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
    base = dict(gates if gates is not None else CURRENT_GATES)
    # Derive oddsReady + fighterStatsReady from the REAL artifacts (fail-closed)
    # unless the caller supplied explicit gates (tests pass exact gates).
    odds_status = stats_status = grading_status = None
    if gates is None:
        odds_ready, odds_status = odds_gate()
        base["oddsReady"] = odds_ready
        stats_ready, stats_status = fighter_stats_gate()
        base["fighterStatsReady"] = stats_ready
        grading_ready, grading_status = grading_gate()
        base["gradingReady"] = grading_ready
        backtest_ready, backtest_status = backtest_gate()
        base["backtestReady"] = backtest_ready
    else:
        backtest_status = None
    payload = {"generatedFor": date, "nextEventDate": None}
    payload.update(derive_readiness(base))
    if odds_status or stats_status or grading_status or backtest_status:
        payload.setdefault("providerStatus", {})
        if odds_status is not None:
            payload["providerStatus"]["oddsapi"] = odds_status
        if stats_status is not None:
            payload["providerStatus"]["greco1899_ufcstats_csv"] = stats_status
        if grading_status is not None:
            payload["providerStatus"]["greco1899_results"] = grading_status
        if backtest_status is not None:
            payload["providerStatus"]["backtest"] = backtest_status
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
