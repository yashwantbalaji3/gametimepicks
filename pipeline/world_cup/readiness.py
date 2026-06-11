"""World Cup stats readiness — fail-closed gating (Phases 5/6/7).

Pure `compute_readiness()` + a `main()` that selects the configured provider (or the
sample/unconfigured default), writes the readiness artifact, and NEVER produces
projections without real stats. No provider key → everything stats-dependent is False.
"""
from __future__ import annotations

import argparse, json, os
from datetime import datetime, timezone
from pathlib import Path

from .providers.base import SoccerStatsProvider
from .providers.sample import SampleProvider

REPO = Path(__file__).resolve().parents[2]
STATS_DIR = REPO / "app" / "public" / "data" / "world-cup" / "stats"
OUTLOOK_PATH = REPO / "app" / "public" / "data" / "world-cup" / "market-outlook-latest.json"

# Registry of known provider classes. A real provider is added here once its
# concrete adapter + env key exist; until then only the unconfigured sample is wired.
PROVIDERS: dict[str, type[SoccerStatsProvider]] = {"sample": SampleProvider}


def _odds_ready() -> bool:
    try:
        return (json.loads(OUTLOOK_PATH.read_text()).get("readyCount", 0) or 0) > 0
    except Exception:
        return False


def compute_readiness(provider: SoccerStatsProvider, *, odds_ready: bool) -> dict:
    configured = provider.is_configured()
    team_stats = configured and provider.supports_team_stats
    xg = configured and provider.supports_xg
    lineups = configured and provider.supports_lineups
    player_stats = configured and provider.supports_player_stats
    # Independent team-level projections need a real team baseline AND odds.
    projections_allowed = bool(odds_ready and team_stats)
    # Player props additionally need lineups (minutes/role) + player stats.
    player_props_allowed = bool(odds_ready and lineups and player_stats)
    parlay_allowed = projections_allowed

    reasons = []
    if not configured:
        reasons.append(f"no soccer stats provider configured (env {provider.env_key or '<none>'} unset) → fail closed")
    if configured and not team_stats:
        reasons.append("provider does not expose team match stats")
    if not lineups:
        reasons.append("no lineups/minutes source → player props disabled")
    if not xg:
        reasons.append("no xG source → xG-dependent confidence stays Low/limited")
    if odds_ready and not projections_allowed:
        reasons.append("odds present but no independent team baseline → market outlook only, no projection edge")

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "provider": provider.name, "providerConfigured": configured,
        "oddsReady": odds_ready,
        "teamStatsReady": team_stats, "xgReady": xg, "lineupsReady": lineups,
        "playerStatsReady": player_stats,
        "marketOutlookReady": odds_ready,
        "projectionsAllowed": projections_allowed,
        "playerPropsAllowed": player_props_allowed,
        "parlayAllowed": parlay_allowed,
        "perMarket": {
            "moneyline90": "projection" if projections_allowed else ("market_outlook_only" if odds_ready else "unavailable_no_odds"),
            "matchTotal": "projection" if projections_allowed else ("market_outlook_only" if odds_ready else "unavailable_no_odds"),
            "teamTotals": "unavailable_no_market_or_stats",
            "corners": "unavailable_no_market_or_stats",
            "anytimeGoalscorer": "unavailable_no_lineups_or_odds" if not player_props_allowed else "candidate",
            "playerShots": "unavailable_no_lineups_or_odds" if not player_props_allowed else "candidate",
            "playerSOT": "unavailable_no_lineups_or_odds" if not player_props_allowed else "candidate",
            "assists": "unavailable_no_lineups_or_odds" if not player_props_allowed else "candidate",
        },
        "failClosedReasons": reasons,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", default=os.environ.get("WC_STATS_PROVIDER", "sample"))
    ap.add_argument("--date", default=datetime.now(timezone.utc).date().isoformat())
    args = ap.parse_args(argv)
    cls = PROVIDERS.get(args.provider, SampleProvider)
    provider = cls()
    readiness = compute_readiness(provider, odds_ready=_odds_ready())
    discovery = {
        "generatedAt": readiness["generatedAt"], "date": args.date,
        "provider": provider.name, "configured": provider.is_configured(),
        "note": "No concrete soccer stats provider is connected. Add a provider adapter + env key, "
                "register it in readiness.PROVIDERS, then re-run. Until then projections fail closed.",
    }
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    (STATS_DIR / "readiness-latest.json").write_text(json.dumps(readiness, indent=2) + "\n")
    (STATS_DIR / f"{provider.name}-{args.date}.json").write_text(json.dumps(discovery, indent=2) + "\n")
    print(f"[wc-stats] provider={provider.name} configured={provider.is_configured()} "
          f"projectionsAllowed={readiness['projectionsAllowed']} parlayAllowed={readiness['parlayAllowed']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
