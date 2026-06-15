"""
build_expanded_projections — MODEL-ONLY UFC fight projections (method of victory,
goes-the-distance, total rounds) derived from REAL fighter stats.

These markets have NO sportsbook odds in the connected feed (The Odds API MMA = h2h
only), so they are explicitly MODEL-ONLY and NOT parlay-eligible. They exist for fight
breakdown / insight, never as priced legs. No fabricated odds, ever.

Inputs (all real artifacts already produced by the pipeline):
  - projections-latest.json   (moneyline: each fighter's model win probability)
  - fighters-latest.json      (per-fighter career method splits + finish rate)
  - schedule-latest.json      (card order → main-event 5-round heuristic)

Method: for a fight with model win probs pA / pB, the fight method distribution blends
each fighter's career win-method shares weighted by their win probability:
  P(KO)  = pA·koShareA  + pB·koShareB
  P(SUB) = pA·subShareA + pB·subShareB
  P(DEC) = pA·decShareA + pB·decShareB   (≈ goes-the-distance probability)
Total rounds is the expected bout length given the finish/decision split. Conservative,
documented, and degrades to "limited data" when a fighter's record is too thin.

Run: python -m pipeline.ufc.build_expanded_projections
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from .name_matching import build_index, resolve

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA = REPO_ROOT / "app" / "public" / "data" / "ufc"
OUT = DATA / "expanded-projections-latest.json"

DISCLAIMER = ("Model-only fight projections (method of victory, goes-the-distance, total "
              "rounds) derived from real fighter stats. The connected MMA odds feed is "
              "moneyline-only, so these markets carry NO sportsbook odds — they are for "
              "fight breakdown only and are NOT parlay-eligible. Educational, paper-only.")


def _load(name: str) -> dict:
    try:
        return json.loads((DATA / name).read_text())
    except Exception:
        return {}


def _method_shares(f: dict) -> tuple[dict | None, int]:
    """Career win-method shares (ko/sub/dec) for a fighter, or None if too thin."""
    fin = f.get("finishes", {}) or {}
    ko = fin.get("koWins") or 0
    sub = fin.get("subWins") or 0
    dec = fin.get("decisionWins") or 0
    wins = ko + sub + dec
    if wins < 3:  # too few wins to characterize how they finish
        return None, wins
    return {"ko": ko / wins, "sub": sub / wins, "dec": dec / wins}, wins


def _round(x, n=3):
    return round(float(x), n)


def _confidence(dq: float, decisiveness: float) -> str:
    if dq >= 0.9 and decisiveness >= 0.45:
        return "high"
    if dq >= 0.6:
        return "medium"
    return "low"


def _fighter_stats(f: dict | None) -> dict | None:
    """Real per-fighter comparison stats from the DB (None when unmatched).
    Detailed bout-by-bout history (opponent/method/date) is NOT in the source, so we
    expose the last-5 W-L summary only — the UI labels detailed history unavailable."""
    if not f:
        return None
    rec = f.get("record", {}) or {}
    phys = f.get("physicals", {}) or {}
    rates = f.get("rates", {}) or {}
    fin = f.get("finishes", {}) or {}
    rf = f.get("recentForm", {}) or {}
    draws = rec.get("draws") or 0
    return {
        "record": f"{rec.get('wins', 0)}-{rec.get('losses', 0)}" + (f"-{draws}" if draws else ""),
        "last5": rf.get("last5"),
        "last5FightCount": rf.get("fightCount"),
        "finishRate": fin.get("finishRate"),
        "heightInches": phys.get("heightInches"),
        "reachInches": phys.get("reachInches"),
        "stance": phys.get("stance"),
        "ageYears": phys.get("ageYears"),
        "sigStrPerRound": rates.get("avgSigStrLandedPerRound"),
        "takedownsPerRound": rates.get("avgTakedownsPerRound"),
        "dataCompleteness": f.get("dataCompleteness"),
    }


def build(now: datetime | None = None) -> dict:
    ref = now or datetime.now(timezone.utc)
    proj = _load("projections-latest.json")
    fighters_art = _load("fighters-latest.json")
    sched = _load("schedule-latest.json")
    idx = build_index(fighters_art.get("fighters", []), name_of=lambda f: f.get("canonicalName", ""))

    # Main-event heuristic: ESPN lists the headliner last in the fights array → 5 rounds.
    sched_fights = sched.get("fights", []) or []
    main_bout_id = (sched_fights[-1].get("boutId") if sched_fights else None)

    rows = []
    for p in proj.get("projections", []):
        a_name, b_name = p.get("fighter"), p.get("opponent")
        pA = p.get("modelProbability")
        if not a_name or not b_name or pA is None:
            continue
        pB = 1.0 - pA
        fa, mta = resolve(a_name, idx)
        fb, mtb = resolve(b_name, idx)
        bout_id = p.get("boutId")
        scheduled_rounds = 5 if (main_bout_id and bout_id == main_bout_id) else 3

        sharesA, winsA = (_method_shares(fa) if fa else (None, 0))
        sharesB, winsB = (_method_shares(fb) if fb else (None, 0))

        # Real per-fighter comparison stats + the odds-backed moneyline leg — shown for EVERY
        # fight (incl. limited-data bouts like Ruffy vs Chandler), so the card never disappears.
        fstats = {a_name: _fighter_stats(fa), b_name: _fighter_stats(fb)}
        ml = {"pick": a_name if pA >= 0.5 else b_name, "modelProbability": _round(max(pA, pB)),
              "oddsPrice": p.get("oddsPrice"), "marketProbability": _round(p.get("marketImpliedProbability") or 0),
              "edge": _round(p.get("edge") or 0), "marketState": "odds-backed"}

        if not sharesA or not sharesB:
            rows.append({
                "boutId": bout_id, "fighters": [a_name, b_name],
                "scheduledRounds": scheduled_rounds, "dataQuality": "low",
                "moneyline": ml, "fighterStats": fstats,
                "marketState": "model-only", "parlayEligible": False,
                "note": "Limited fighter finish-history from the connected source — method / distance / rounds projection withheld for this bout. Moneyline + records shown.",
            })
            continue

        # Fight method distribution (win-prob-weighted blend of career method shares).
        p_ko = pA * sharesA["ko"] + pB * sharesB["ko"]
        p_sub = pA * sharesA["sub"] + pB * sharesB["sub"]
        p_dec = pA * sharesA["dec"] + pB * sharesB["dec"]
        tot = p_ko + p_sub + p_dec or 1.0
        p_ko, p_sub, p_dec = p_ko / tot, p_sub / tot, p_dec / tot
        finish_p = p_ko + p_sub
        method_top = max((("KO/TKO", p_ko), ("Submission", p_sub), ("Decision", p_dec)), key=lambda t: t[1])[0]

        # Expected rounds: a decision uses all scheduled rounds; a finish averages ~round 1.8.
        avg_finish_round = 1.8
        projected_rounds = p_dec * scheduled_rounds + finish_p * avg_finish_round
        ref_line = 2.5 if scheduled_rounds == 3 else 4.5
        # P(bout lasts past the reference line) ≈ decision prob + part of finishes that go late.
        p_over = p_dec + finish_p * (0.25 if scheduled_rounds == 3 else 0.4)
        rounds_lean = "over" if p_over > 0.55 else "under" if p_over < 0.45 else "neutral"

        dq = min(fa.get("dataCompleteness", 0) or 0, fb.get("dataCompleteness", 0) or 0)
        decisiveness = max(p_ko, p_sub, p_dec) - min(p_ko, p_sub, p_dec)
        conf = _confidence(dq, decisiveness)

        rows.append({
            "boutId": bout_id, "fighters": [a_name, b_name],
            "scheduledRounds": scheduled_rounds,
            "moneyline": ml,
            "fighterStats": fstats,
            "goesDistance": {"yesProbability": _round(p_dec), "noProbability": _round(finish_p),
                             "lean": "yes" if p_dec > 0.5 else "no", "confidence": conf,
                             "marketState": "model-only", "parlayEligible": False},
            "totalRounds": {"projectedRounds": _round(projected_rounds, 1), "referenceLine": ref_line,
                            "lean": rounds_lean, "confidence": conf,
                            "marketState": "model-only", "parlayEligible": False},
            "method": {"koTkoProbability": _round(p_ko), "submissionProbability": _round(p_sub),
                       "decisionProbability": _round(p_dec), "topMethod": method_top,
                       "perFighter": {
                           a_name: {"koTko": _round(pA * sharesA["ko"]), "submission": _round(pA * sharesA["sub"]), "decision": _round(pA * sharesA["dec"])},
                           b_name: {"koTko": _round(pB * sharesB["ko"]), "submission": _round(pB * sharesB["sub"]), "decision": _round(pB * sharesB["dec"])},
                       },
                       "confidence": conf, "marketState": "model-only", "parlayEligible": False},
            "rationale": [
                f"{a_name}: {int(round(sharesA['ko']*100))}% KO / {int(round(sharesA['sub']*100))}% sub / {int(round(sharesA['dec']*100))}% dec across {winsA} career wins.",
                f"{b_name}: {int(round(sharesB['ko']*100))}% KO / {int(round(sharesB['sub']*100))}% sub / {int(round(sharesB['dec']*100))}% dec across {winsB} career wins.",
                f"Model lean: {method_top} ({int(round(max(p_ko,p_sub,p_dec)*100))}%); {'goes the distance' if p_dec>0.5 else 'finish inside the distance'} more likely.",
            ],
            "dataQuality": conf,
            "marketState": "model-only",
            "parlayEligible": False,
        })

    return {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "eventName": proj.get("eventName") or sched.get("eventName"),
        "eventDate": proj.get("eventDate") or sched.get("eventDate"),
        "marketScope": "model_only_expanded",
        "parlayEligible": False,
        "disclaimer": DISCLAIMER,
        "boutCount": len(rows),
        "projections": rows,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--date", default=None)  # accepted for parity; artifacts are event-scoped
    args = ap.parse_args(argv)
    payload = build()
    Path(args.out).write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {args.out} → {payload['boutCount']} expanded model-only fight projections "
          f"(event={payload.get('eventName')})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
