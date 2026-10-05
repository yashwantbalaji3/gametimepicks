"""
build_readiness — emit the UFC public readiness artifact (FAIL-CLOSED).

Mirrors the launch-gate ladder in app/src/lib/ufc-types.ts (ufcPublicLevel):
  schedule + odds          → odds-internal (still NO public picks)
  + fighter stats          → projections-internal
  + results grading + backtest → parlays-public
    (grading = results corpus + our winner forecasts settled in the Forecast Ledger;
     never a market-price grade)
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
    "resultsCorpusReady": False,       # DERIVED from results-latest.json (factual finals input)
    "forecastSettlementReady": False,  # DERIVED from Forecast Ledger ufc_winner rows
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
GRADING_MIN_FINAL = 100          # need a real results corpus
GRADING_FRESH_DAYS = 120

# WHAT "GRADING" MEANS (Results, 2026-10-05). The old gate also required the legacy moneyline grader
# (graded-moneylines-latest.json) to have graded >=1 bout. That file graded MARKET PRICES, not a
# GameTimePicks forecast, and it is retired. Grading is now three separate facts, never one word:
#   forecastSettlementReady  our model's winner forecasts are settled against canonical finals
#                            (Forecast Ledger ufc_winner rows) — the only one the ladder's grading step uses
#   marketCaptureReady       the market price was captured beside the forecast (comparison input only)
#   productSettlementReady   a published UFC product pick has a settlement owner (none: UFC is out of products)
# A market-price settlement is never evidence that our model is graded.
FORECAST_LEDGER = REPO_ROOT / "data" / "internal" / "forecast-ledger" / "v1" / "ufc.jsonl"
WINNER_SUMMARY = REPO_ROOT / "data" / "internal" / "research" / "ufc" / "model-vs-market" / "summary.json"
WINNER_FAMILY = "ufc_winner"
STALE_PENDING_DAYS = 7           # a frozen bout still unsettled a week after its card is named, not hidden


def results_corpus_gate(results_path: Path = RESULTS_ARTIFACT,
                        now: datetime | None = None) -> tuple[bool, dict]:
    """resultsCorpusReady: a real, licensed, fresh results corpus (>=100 final bouts, latest event
    within 120 days). A factual input, owned by UFC. It says finals exist, not that anything is
    graded. Fail-closed."""
    status = {"configured": True, "eventCount": 0, "finalBoutCount": 0,
              "latestEventDate": None, "resultsCorpusReady": False, "warnings": []}
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
    try:
        fresh = isinstance(ld, str) and (((now or datetime.now(timezone.utc)).date() - datetime.fromisoformat(ld).date()).days <= GRADING_FRESH_DAYS)
    except Exception:
        fresh = False
    if not fresh:
        status["warnings"].append("results stale")
        return False, status
    status["resultsCorpusReady"] = True
    return True, status


def _parse_ts(v) -> datetime | None:
    if not isinstance(v, str):
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except Exception:
        return None


def forecast_settlement_gate(ledger_path: Path = FORECAST_LEDGER, summary_path: Path = WINNER_SUMMARY,
                             now: datetime | None = None) -> tuple[bool, dict]:
    """forecastSettlementReady: our model's winner forecasts are being settled, read from the Forecast
    Ledger's ufc_winner rows (the same rows /results/forecasts shows). A row counts only when it is
    SETTLED with CANONICAL finality, carries a MODEL probability, and was published before it settled.
    Ready = >=1 such row, the newest settled within GRADING_FRESH_DAYS, and every frozen card in the
    owner's reconciliation adding up (frozen = graded + void + pending). PENDING and VOID are never
    misses and never block readiness; a bout pending longer than STALE_PENDING_DAYS is reported as a
    warning by id. Method and round are not graded and do not count. Fail-closed."""
    ref = now or datetime.now(timezone.utc)
    status = {"configured": True, "source": "forecast-ledger/v1/ufc.jsonl#ufc_winner",
              "settledCount": 0, "voidCount": 0, "pendingCount": 0, "latestSettledAt": None,
              "cardsReconciled": None, "stalePendingBoutIds": [],
              "forecastSettlementReady": False, "warnings": []}
    if not ledger_path.exists():
        status["warnings"].append("forecast ledger UFC file missing")
        return False, status
    settled: list[dict] = []
    try:
        for line in ledger_path.read_text().splitlines():
            if not line.strip():
                continue
            r = json.loads(line)
            if r.get("family") != WINNER_FAMILY:
                continue
            st = (r.get("settlement") or {}).get("state")
            if st == "VOID":
                status["voidCount"] += 1
            elif st == "PENDING":
                status["pendingCount"] += 1
            elif st == "SETTLED":
                settled.append(r)
    except Exception:
        status["warnings"].append("forecast ledger UFC file corrupt")
        return False, status

    def counts(r: dict) -> bool:
        s = r.get("settlement") or {}
        pub, at = _parse_ts(r.get("publishedAt")), _parse_ts(s.get("settledAt"))
        return (s.get("finality") == "CANONICAL" and r.get("probabilityType") == "MODEL"
                and isinstance(r.get("probability"), (int, float))
                and pub is not None and at is not None and pub < at)

    good = [r for r in settled if counts(r)]
    if len(good) != len(settled):
        status["warnings"].append(f"{len(settled) - len(good)} settled row(s) not counted (not canonical, not a model probability, or not published before settlement)")
    status["settledCount"] = len(good)
    if not good:
        status["warnings"].append("no settled model winner forecasts in the Forecast Ledger")
        return False, status
    latest = max(_parse_ts(r["settlement"]["settledAt"]) for r in good)
    status["latestSettledAt"] = latest.strftime("%Y-%m-%dT%H:%M:%SZ")
    if (ref - latest).days > GRADING_FRESH_DAYS:
        status["warnings"].append("winner settlement stale")
        return False, status

    try:
        summary = json.loads(summary_path.read_text())
        recon = summary.get("reconciliation")
    except Exception:
        recon = None
    if not isinstance(recon, list):
        status["warnings"].append("winner reconciliation missing")
        return False, status
    status["cardsReconciled"] = all(bool(c.get("reconciles")) for c in recon)
    if not status["cardsReconciled"]:
        status["warnings"].append("a card's frozen bouts do not equal graded + void + pending")
        return False, status
    for c in recon:
        d = _parse_ts(f"{c.get('slateDate')}T00:00:00+00:00")
        if c.get("pending") and d is not None and (ref - d).days > STALE_PENDING_DAYS:
            status["stalePendingBoutIds"].extend(c.get("pendingBoutIds") or [])
    if status["stalePendingBoutIds"]:
        status["warnings"].append(f"{len(status['stalePendingBoutIds'])} bout(s) still pending more than {STALE_PENDING_DAYS} days after the card (likely replaced or cancelled; PENDING, never a miss)")
    status["forecastSettlementReady"] = True
    return True, status


def market_capture_gate(ledger_path: Path = FORECAST_LEDGER) -> tuple[bool, dict]:
    """marketCaptureReady: the newest settled card's winner forecasts carry the market's implied
    probability captured in the same pregame snapshot. A comparison input for the backtest. It never
    feeds the grading step: a market price settling is a fact about the book, not about our model."""
    status = {"latestCard": None, "rows": 0, "withMarket": 0, "marketCaptureReady": False, "warnings": []}
    try:
        rows = [json.loads(l) for l in ledger_path.read_text().splitlines() if l.strip()]
    except Exception:
        status["warnings"].append("forecast ledger UFC file missing or corrupt")
        return False, status
    rows = [r for r in rows if r.get("family") == WINNER_FAMILY and (r.get("settlement") or {}).get("state") == "SETTLED"]
    if not rows:
        status["warnings"].append("no settled winner forecasts")
        return False, status
    newest = max(rows, key=lambda r: (r.get("settlement") or {}).get("settledAt") or "")
    card = [r for r in rows if r.get("competition") == newest.get("competition")]
    m = lambda r: r.get("market") or {}
    status["latestCard"] = newest.get("competition")
    status["rows"] = len(card)
    status["withMarket"] = sum(1 for r in card if isinstance(m(r).get("impliedProbability"), (int, float))
                               and m(r).get("capturedAt") == r.get("publishedAt"))
    ready = status["withMarket"] == status["rows"] > 0
    if not ready:
        status["warnings"].append(f"{status['rows'] - status['withMarket']} of {status['rows']} rows lack a same-snapshot market price")
    status["marketCaptureReady"] = ready
    return ready, status


# No UFC product (pick card, parlay, ladder) is published, so nothing has a product settlement owner.
# This flips only when a product engine settles UFC picks from its own receipts — never from this file.
PRODUCT_SETTLEMENT_READY = False
PRODUCT_SETTLEMENT_REASON = "UFC is out of products; no product settlement owner"


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
    # The ladder's grading step = finals exist AND our model's forecasts are settled against them.
    # A caller may still pass the legacy single "gradingReady" (it then stands for both).
    corpus = bool(gates.get("resultsCorpusReady", gates.get("gradingReady")))
    settlement = bool(gates.get("forecastSettlementReady", gates.get("gradingReady")))
    grading = corpus and settlement
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
    if not corpus:
        blockers.append("results corpus not ready (finals missing, unlicensed, too few or stale)")
    if not settlement:
        blockers.append("model winner forecasts not settled in the Forecast Ledger")
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

    # Name only what is actually missing: a sentence listing a connected gate as pending is false.
    def _join(items: list[str]) -> str:
        return ", ".join(items[:-1]) + " and " + items[-1] if len(items) > 1 else "".join(items)
    missing = [name for name, ok in (("odds", odds), ("fighter stats", stats), ("results grading", grading),
                                     ("backtesting", backtest)) if not ok]
    connecting = [m for m in missing if m != "backtesting"]
    if public_level == "schedule-only":
        public_message = f"UFC coverage is being built — schedule available; predictions publish only after {_join(missing)} are connected."
    elif public_level in ("odds-internal", "projections-internal", "grading-internal"):
        public_message = (f"UFC {_join(connecting)} {'is' if len(connecting) == 1 else 'are'} being connected. " if connecting else "") \
            + "Model picks publish only after a backtest passes."
    else:
        public_message = "UFC model picks are live."

    return {
        "scheduleReady": schedule,
        "oddsReady": odds,
        "fighterStatsReady": stats,
        # Legacy single flag, kept so existing readers keep working. It now means exactly
        # resultsCorpusReady AND forecastSettlementReady, and nothing about market prices.
        "gradingReady": grading,
        "resultsCorpusReady": corpus,
        "forecastSettlementReady": settlement,
        "marketCaptureReady": bool(gates.get("marketCaptureReady")),
        "productSettlementReady": bool(gates.get("productSettlementReady", PRODUCT_SETTLEMENT_READY)),
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
            "grading": "forecast_ledger" if grading else "not_connected",
        },
        "publicMessage": public_message,
        "internalMessage": f"fail-closed: projectionsReady={projections_ready} parlayReady={parlay_ready}; blockers={blockers}",
    }


def build(date: str | None, gates: dict[str, bool] | None = None) -> dict[str, object]:
    base = dict(gates if gates is not None else CURRENT_GATES)
    # Derive oddsReady + fighterStatsReady from the REAL artifacts (fail-closed)
    # unless the caller supplied explicit gates (tests pass exact gates).
    odds_status = stats_status = corpus_status = settlement_status = market_status = None
    if gates is None:
        odds_ready, odds_status = odds_gate()
        base["oddsReady"] = odds_ready
        stats_ready, stats_status = fighter_stats_gate()
        base["fighterStatsReady"] = stats_ready
        base["resultsCorpusReady"], corpus_status = results_corpus_gate()
        base["forecastSettlementReady"], settlement_status = forecast_settlement_gate()
        base["marketCaptureReady"], market_status = market_capture_gate()
        base["productSettlementReady"] = PRODUCT_SETTLEMENT_READY
        backtest_ready, backtest_status = backtest_gate()
        base["backtestReady"] = backtest_ready
    else:
        backtest_status = None
    payload = {"generatedFor": date, "nextEventDate": None}
    payload.update(derive_readiness(base))
    if odds_status or stats_status or corpus_status or settlement_status or backtest_status:
        payload.setdefault("providerStatus", {})
        if odds_status is not None:
            payload["providerStatus"]["oddsapi"] = odds_status
        if stats_status is not None:
            payload["providerStatus"]["greco1899_ufcstats_csv"] = stats_status
        if corpus_status is not None:
            payload["providerStatus"]["greco1899_results"] = corpus_status
        if settlement_status is not None:
            payload["providerStatus"]["forecastSettlement"] = settlement_status
        if market_status is not None:
            payload["providerStatus"]["marketCapture"] = market_status
        if gates is None:
            payload["providerStatus"]["productSettlement"] = {"productSettlementReady": PRODUCT_SETTLEMENT_READY,
                                                              "reason": PRODUCT_SETTLEMENT_REASON}
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
