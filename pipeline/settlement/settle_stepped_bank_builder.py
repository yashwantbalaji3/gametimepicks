"""
Stepped Bank Builder settlement engine (current artifact shape).

The legacy `pipeline/settle_active_dual_bank_builder.py` grades only WC double-chance + MLB strikeouts
on the OLD top-level `run.laneX.legs` and cannot settle the current STEPPED cards
(`run.laneX.steps[].legs`) which use plain WC moneyline + WC totals. This engine grades the stepped
cards from OFFICIAL results only (API-Football FT scores) and is lane-targetable + dry-run-first.

It NEVER computes the bankroll itself — after writing graded leg/step results into the non-protected
`dual-bank-builder-active.json`, the portfolio is rebuilt by the existing, tested
`app/scripts/build-mr-dub-ledger.mjs` (the single accounting convention: a WON step ROLLS — $0
realized; a LOST step realizes -$100; openExposure = $100 per pending step). It NEVER touches the
protected crown (`public/data/bank-builder/*`) or the Moonshot / Specials artifacts.

Usage:
  python -m pipeline.settlement.settle_stepped_bank_builder --dry-run --date 2026-06-22 --lane lane-b
  python -m pipeline.settlement.settle_stepped_bank_builder --apply   --date 2026-06-22 --lane lane-b
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "app" / "public" / "data" / "methodology" / "launch" / "dual-bank-builder-active.json"


def _norm(s: str) -> str:
    return "".join(c for c in (s or "").lower() if c.isalpha())


# ── Pure grading rules (unit-tested; no I/O) ──────────────────────────────────────────────────────
def grade_moneyline(participant: str, home: str, away: str, hs: int, as_: int) -> str:
    """WC 90-minute moneyline: the selected team must WIN in regulation. Draw or loss = lost."""
    p = _norm(participant)
    if p == _norm(home):
        return "won" if hs > as_ else "lost"
    if p == _norm(away):
        return "won" if as_ > hs else "lost"
    return "needs_review"


def grade_total(side: str, line: float, total_goals: int) -> str:
    """Over L wins if total > L; Under L wins if total < L; push (void) only on an exact integer line."""
    s = (side or "").lower()
    if s == "over":
        if total_goals == line:
            return "void"
        return "won" if total_goals > line else "lost"
    if s == "under":
        if total_goals == line:
            return "void"
        return "won" if total_goals < line else "lost"
    return "needs_review"


def grade_double_chance(participant: str, home: str, away: str, hs: int, as_: int) -> str:
    """'X or Draw' wins if team X wins OR the match is a draw (regulation FT)."""
    label = _norm(participant)  # e.g. "ghanaordraw"
    if hs == as_:
        return "won"  # any "X or Draw" hits on a draw
    winner = home if hs > as_ else away
    return "won" if _norm(winner) in label else "lost"


def grade_dnb(participant: str, home: str, away: str, hs: int, as_: int) -> str:
    """Draw-no-bet: selected team win = won; draw = void (no action); loss = lost."""
    if hs == as_:
        return "void"
    return grade_moneyline(participant, home, away, hs, as_)


def grade_leg(leg: dict, scores: dict) -> dict:
    """Grade one stepped-card leg from the official FT score map (keyed by normalized matchup)."""
    market = (leg.get("marketType") or "").lower()
    home, away = leg.get("homeTeam"), leg.get("awayTeam")
    key = f"{_norm(home)}|{_norm(away)}"
    match = scores.get(key)
    if not match:
        return {"result": "needs_review", "official": f"no official fixture found for {home} vs {away}", "source": "api_football"}
    if not match["final"]:
        return {"result": "pending", "official": f"{home} {match['hs']}-{match['as']} {away} ({match['status']})", "source": "api_football"}
    hs, as_ = match["hs"], match["as"]
    ft = f"{home} {hs}-{as_} {away} (FT, API-Football)"
    if market == "moneyline_90":
        res = grade_moneyline(leg.get("participantName"), home, away, hs, as_)
    elif market == "match_total_goals":
        res = grade_total(leg.get("side"), float(leg.get("line")), hs + as_)
    elif market == "double_chance":
        res = grade_double_chance(leg.get("participantName"), home, away, hs, as_)
    elif market == "draw_no_bet":
        res = grade_dnb(leg.get("participantName"), home, away, hs, as_)
    else:
        return {"result": "needs_review", "official": f"no settlement rule for WC {market}", "source": "none"}
    return {"result": res, "official": ft, "source": "api_football"}


def card_result(leg_results: list[str]) -> str:
    """all won (void allowed) → won; any lost → lost; any pending/needs_review → pending."""
    if any(r == "lost" for r in leg_results):
        return "lost"
    if any(r in ("pending", "needs_review") for r in leg_results):
        return "pending"
    nonvoid = [r for r in leg_results if r != "void"]
    if nonvoid and all(r == "won" for r in nonvoid):
        return "won"
    if leg_results and all(r == "void" for r in leg_results):
        return "push"
    return "pending"


# ── Official results (API-Football, FT only) ──────────────────────────────────────────────────────
def fetch_official_scores(dates: list[str]) -> dict:
    """Return {normalized 'home|away': {hs, as, final, status}} for the given ET dates (API-Football)."""
    import os
    import requests

    key = os.environ.get("API_FOOTBALL_KEY")
    if not key:
        for line in (ROOT / ".env").read_text().splitlines():
            if line.startswith("API_FOOTBALL_KEY="):
                key = line.split("=", 1)[1].strip()
    out: dict = {}
    FINAL = {"FT", "AET", "PEN"}
    for d in dates:
        r = requests.get(
            "https://v3.football.api-sports.io/fixtures",
            params={"league": 1, "season": 2026, "date": d, "timezone": "America/New_York"},
            headers={"x-apisports-key": key}, timeout=25,
        )
        for f in (r.json().get("response") or []):
            home = f["teams"]["home"]["name"]
            away = f["teams"]["away"]["name"]
            st = f["fixture"]["status"]["short"]
            out[f"{_norm(home)}|{_norm(away)}"] = {
                "hs": f["goals"]["home"] if f["goals"]["home"] is not None else 0,
                "as": f["goals"]["away"] if f["goals"]["away"] is not None else 0,
                "final": st in FINAL, "status": st,
            }
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Stepped Bank Builder settlement (official only).")
    ap.add_argument("--date", required=True, help="ET slate date YYYY-MM-DD")
    ap.add_argument("--lane", choices=["lane-a", "lane-b", "all"], default="all")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--dry-run", action="store_true", default=True)
    g.add_argument("--apply", action="store_true")
    args = ap.parse_args(argv)
    apply = bool(args.apply)

    doc = json.loads(ARTIFACT.read_text())
    run = doc["run"]
    # Grade against the slate date and the day before/after (cross-slate legs).
    base = args.date
    y, m, dd = (int(x) for x in base.split("-"))
    dates = sorted({f"{y:04d}-{m:02d}-{dd-1:02d}", base, f"{y:04d}-{m:02d}-{dd+1:02d}"})
    scores = fetch_official_scores(dates)
    now = datetime.now(timezone.utc).isoformat()

    target = {"lane-a": ["laneA"], "lane-b": ["laneB"], "all": ["laneA", "laneB"]}[args.lane]
    print(f"=== Stepped Bank Builder settlement · {'APPLY' if apply else 'DRY-RUN'} · lane={args.lane} · dates={dates} ===")
    changed = False
    for lk in target:
        lane = run.get(lk)
        if not lane:
            continue
        step = next((s for s in (lane.get("steps") or []) if s.get("status") in ("pending", "active")), None)
        if not step:
            print(f"  {lk}: no open step (status={lane.get('status')}) — nothing to settle.")
            continue
        graded = [grade_leg(leg, scores) for leg in step["legs"]]
        cres = card_result([g["result"] for g in graded])
        print(f"  {lk} Step {step['step']} (${step.get('stake')} → ${step.get('payout')}, +{step.get('combinedOdds')}): CARD {cres.upper()}")
        for leg, g in zip(step["legs"], graded):
            print(f"     - {leg.get('participantName')} {leg.get('marketLabel')}: {g['result'].upper()} · {g['official']}")
        impact = ("WON → rolls (unrealized, +$0 realized); releases $100 exposure; record +1 win"
                  if cres == "won" else "LOST → realizes -$100; releases exposure; record +1 loss"
                  if cres == "lost" else "PENDING → no change (a leg is not yet final)")
        print(f"     bankroll impact: {impact}")
        if apply and cres in ("won", "lost", "push"):
            for leg, g in zip(step["legs"], graded):
                leg["settlement"] = g
                leg["settlementStatus"] = "hit" if g["result"] == "won" else "miss" if g["result"] == "lost" else g["result"]
                leg["currentGameStatus"] = "final"
            step["status"] = "settled"
            step["result"] = cres
            step["settledAt"] = now
            if cres == "won":
                lane["laneStatus"] = "advanced"
                lane["awaitingNote"] = (f"Lane {lk[-1].upper()} Step {step['step']} cleared (official) — "
                                        f"${step.get('stake')} rolls to ${step.get('payout')}, awaiting the next qualified card.")
            changed = True

    if apply and changed:
        run.setdefault("settlement", {})
        run["settlement"]["steppedSettledAt"] = now
        run["settlement"]["steppedSource"] = "api_football"
        ARTIFACT.write_text(json.dumps(doc, indent=2) + "\n")
        print("APPLIED. Now rebuild the portfolio: node app/scripts/build-mr-dub-ledger.mjs")
    elif apply:
        print("APPLY requested but nothing was settleable (all open cards still pending). No write.")
    else:
        print("DRY-RUN only — no files written.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
