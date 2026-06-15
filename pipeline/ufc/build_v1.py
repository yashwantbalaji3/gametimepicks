"""
build_v1 — OFFICIAL UFC V1 moneyline artifacts from real-card internal projections.
V1 = real ESPN schedule + real sportsbook moneylines + fighter stats + a conservative
model. It is LIVE (not "beta"), with validation shown SEPARATELY: `moneylineValidated`
stays false until the leakage-safe backtest reaches threshold — validation is a quality
badge, not a launch blocker. Moneyline only (The Odds API MMA = h2h). No props, no fake
data, no method/distance/round.

Run: python -m pipeline.ufc.build_v1
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA = REPO_ROOT / "app" / "public" / "data" / "ufc"
PROJ_OUT = DATA / "projections-latest.json"
PARLAY_OUT = DATA / "suggested-parlays-latest.json"
MIN_DQ = 0.75
DISCLAIMER = ("Official V1 moneyline model — real schedule + sportsbook lines + fighter "
              "stats. Validation is in progress: results are tracked after each card and "
              "the validated badge unlocks once the model reaches the backtest threshold. "
              "Educational only — not betting advice.")


def _load(name):
    try:
        return json.loads((DATA / name).read_text())
    except Exception:
        return {}


def _label(edge: float) -> str:
    a = abs(edge)
    if a >= 0.03:
        return "Model lean"
    if a >= 0.015:
        return "Slight lean"
    return "No clear edge"


def build(now: datetime | None = None) -> tuple[dict, dict]:
    ref = now or datetime.now(timezone.utc)
    proj = _load("projections-internal-card-latest.json")
    sched = _load("schedule-latest.json")
    event_name = proj.get("eventName") or sched.get("eventName")
    event_date = proj.get("eventDate") or sched.get("eventDate")
    readiness = _load("readiness-latest.json")
    moneyline_validated = bool(readiness.get("backtestReady"))      # backtest threshold met
    parlay_validated = bool(readiness.get("parlaySimReady"))        # parlay simulation passed

    rows = []
    for p in proj.get("projections", []):
        if p.get("isFutures") or p.get("blockers"):
            continue
        if (p.get("dataQuality") or 0) < MIN_DQ:
            continue
        edge = p.get("edge") or 0.0
        rows.append({
            "boutId": p.get("boutId"),
            "fighter": p.get("fighter"), "opponent": p.get("opponent"),
            "oddsPrice": p.get("oddsPrice"),
            "marketImpliedProbability": p.get("marketImpliedProbability"),
            "modelProbability": p.get("modelProbability"),
            "modelAdjustment": p.get("modelAdjustment"),
            "edge": edge,
            "label": _label(edge),
            "dataQuality": p.get("dataQuality"),
            "explanation": "Model probability vs sportsbook implied; conservative "
                           "(shrunk toward market, capped at 4pp).",
            "disclaimer": DISCLAIMER,
            "warnings": p.get("warnings") or [],
        })
    moneyline_v1_ready = bool(rows) and bool(event_name)
    projections = {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "version": "v1", "productStage": "official_v1_moneyline",
        "eventName": event_name, "eventDate": event_date,
        "moneylineV1Ready": moneyline_v1_ready,
        "moneylineValidated": moneyline_validated,
        "validationStatus": "validated" if moneyline_validated else "in_progress",
        "marketScope": "h2h_moneyline_only",
        "propsProviderReady": False,
        "methodPropsReady": False, "distancePropsReady": False, "roundPropsReady": False,
        "sourceArtifacts": ["projections-internal-card-latest.json", "schedule-latest.json", "odds-latest.json"],
        "disclaimer": DISCLAIMER,
        "projections": rows,
    }

    # Conservative V1 parlays — moneyline only, strongest model favorites, no same-fight
    # dupes, short cards. modelCombinedProbability uses a cross-fight independence approx.
    favs = sorted(
        [{"fighter": r["fighter"] if r["modelProbability"] >= 0.5 else r["opponent"],
          "boutId": r["boutId"],
          "modelProbability": r["modelProbability"] if r["modelProbability"] >= 0.5 else round(1 - r["modelProbability"], 4),
          "oddsPrice": r["oddsPrice"]} for r in rows],
        key=lambda x: -x["modelProbability"])
    strong = [f for f in favs if f["modelProbability"] >= 0.65]
    cards = []
    if moneyline_v1_ready and len(strong) >= 2:
        def _card(label, legs, rationale):
            seen, picked = set(), []
            for l in legs:
                if l["boutId"] in seen:
                    continue
                seen.add(l["boutId"]); picked.append(l)
            mp = 1.0
            for l in picked:
                mp *= l["modelProbability"]
            return {"riskLabel": label,
                    "legs": [{"fighter": l["fighter"], "boutId": l["boutId"], "modelProbability": l["modelProbability"]} for l in picked],
                    "modelCombinedProbability": round(mp, 4),
                    "rationale": rationale,
                    "disclaimer": DISCLAIMER, "warnings": []}
        cards.append(_card("Conservative card", strong[:2], "Two strongest model favorites this card (moneyline only)."))
        if len(strong) >= 3:
            cards.append(_card("Balanced card", strong[1:3], "Strong model favorites, one step out from the safest pair (moneyline only)."))
        # Higher-variance lanes — real odds-backed moneyline favorites only. The model
        # mirrors the market on this card (no edge), so the risk comes from leg COUNT, not
        # from underdog edge picks. Labeled high-variance; never an underdog edge claim.
        mlfavs = [f for f in favs if f["modelProbability"] >= 0.5]
        if len(mlfavs) >= 4:
            cards.append(_card("High-risk card", mlfavs[:4],
                               "Four model-favorite moneylines stacked — high variance (every leg must hit). No model edge; the risk is the leg count."))
        if len(mlfavs) >= 5:
            cards.append(_card("Longshot card", mlfavs[:5],
                               "Five-leg moneyline stack — longshot variance for a larger paper payout. No model edge; all legs are real sportsbook moneylines."))
    parlays = {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "version": "v1", "eventName": event_name,
        "moneylineV1Ready": moneyline_v1_ready,
        "parlayV1Ready": bool(cards),
        "parlayValidated": parlay_validated,
        "marketScope": "h2h_moneyline_only",
        "publicReady": bool(cards),
        "disclaimer": DISCLAIMER,
        "blockers": [] if cards else ["not enough strong model favorites for a conservative card"],
        "cards": cards,
    }
    return projections, parlays


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(); ap.parse_args(argv)
    projections, parlays = build()
    PROJ_OUT.write_text(json.dumps(projections, indent=2) + "\n")
    PARLAY_OUT.write_text(json.dumps(parlays, indent=2) + "\n")
    print(f"wrote projections-latest ({len(projections['projections'])} rows, "
          f"moneylineV1Ready={projections['moneylineV1Ready']}, "
          f"validated={projections['moneylineValidated']}) + suggested-parlays "
          f"({len(parlays['cards'])} cards, parlayV1Ready={parlays['parlayV1Ready']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
