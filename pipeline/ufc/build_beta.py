"""
build_beta — public UFC BETA artifacts from real-card internal projections. BETA =
real schedule + real sportsbook moneylines + fighter stats + a conservative model,
CLEARLY labeled unvalidated/experimental. Does NOT touch official gates
(projectionsReady/parlayReady stay false until backtestReady). Moneyline only —
no props (no prop odds). officiallyValidated is ALWAYS false while backtest is false.

Run: python -m pipeline.ufc.build_beta
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA = REPO_ROOT / "app" / "public" / "data" / "ufc"
PROJ_OUT = DATA / "beta-projections-latest.json"
PARLAY_OUT = DATA / "beta-suggested-parlays-latest.json"
MIN_DQ = 0.75
DISCLAIMER = ("Beta model output from real schedule + sportsbook moneylines + fighter "
              "stats. Experimental, not yet backtested, educational only — not betting "
              "advice and not an official validated pick.")


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
    backtest_ready = bool(readiness.get("backtestReady"))  # official validation

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
    proj_eligible = bool(rows) and bool(event_name)
    projections = {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "eventName": event_name,
        "eventDate": event_date,
        "beta": True, "officiallyValidated": False, "validationStatus": "collecting",
        "marketScope": "h2h_moneyline_only",
        "betaProjectionsEligible": proj_eligible,
        "sourceArtifacts": ["projections-internal-card-latest.json", "schedule-latest.json", "odds-latest.json"],
        "disclaimer": DISCLAIMER,
        "projections": rows,
    }

    # Conservative beta parlays — moneyline only, strongest model favorites, no
    # same-fight dupes, short cards. modelCombinedProbability shown (independence
    # approximation is defensible for cross-fight moneyline legs).
    favs = sorted(
        [{"fighter": r["fighter"] if r["modelProbability"] >= 0.5 else r["opponent"],
          "boutId": r["boutId"],
          "modelProbability": r["modelProbability"] if r["modelProbability"] >= 0.5 else round(1 - r["modelProbability"], 4),
          "oddsPrice": r["oddsPrice"]} for r in rows],
        key=lambda x: -x["modelProbability"])
    strong = [f for f in favs if f["modelProbability"] >= 0.65]
    cards = []
    if proj_eligible and len(strong) >= 2:
        def _card(label, legs):
            seen, picked = set(), []
            for l in legs:
                if l["boutId"] in seen:
                    continue
                seen.add(l["boutId"]); picked.append(l)
            mp = 1.0
            for l in picked:
                mp *= l["modelProbability"]
            return {"riskLabel": label, "beta": True, "officiallyValidated": False,
                    "legs": [{"fighter": l["fighter"], "boutId": l["boutId"], "modelProbability": l["modelProbability"]} for l in picked],
                    "modelCombinedProbability": round(mp, 4),
                    "rationale": "Strongest model favorites this card (moneyline only).",
                    "disclaimer": DISCLAIMER, "warnings": []}
        cards.append(_card("Conservative beta card", strong[:2]))
        if len(strong) >= 3:
            cards.append(_card("Balanced beta card", strong[1:3]))
    parlays = {
        "generatedAt": ref.isoformat(timespec="seconds"),
        "eventName": projections["eventName"],
        "beta": True, "officiallyValidated": False, "marketScope": "h2h_moneyline_only",
        "betaParlaysEligible": bool(cards),
        "publicReady": bool(cards),
        "disclaimer": DISCLAIMER,
        "blockers": [] if cards else ["not enough strong model favorites for a conservative beta card"],
        "cards": cards,
    }
    return projections, parlays


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(); ap.parse_args(argv)
    projections, parlays = build()
    PROJ_OUT.write_text(json.dumps(projections, indent=2) + "\n")
    PARLAY_OUT.write_text(json.dumps(parlays, indent=2) + "\n")
    print(f"wrote beta-projections ({len(projections['projections'])} rows, eligible="
          f"{projections['betaProjectionsEligible']}) + beta-parlays ({len(parlays['cards'])} cards)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
