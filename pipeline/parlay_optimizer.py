"""
Parlay optimizer foundation — sport-agnostic, calibration-aware,
correlation-suppressing.

The legacy `pipeline.snapshot_parlays._greedy_build` is a fine
foundation but it bakes a lot of rules into one function. This module
exposes the same logic split into composable scoring + constraint
primitives so that:

  * Tests can assert each penalty independently.
  * The Parlay Lab can call the optimizer on-demand with extra filters
    (sport / players / per-game caps) rather than only filtering an
    existing snapshot.
  * Future tuning (volatility, calibration overlay, correlation matrix)
    has a single dial to turn.

Inputs are already-normalized lean dicts — the same shape
`snapshot_parlays.load_nba_leans` and `load_mlb_leans` produce. The
optimizer does NOT do its own data loading. That keeps it pure and
trivially unit-testable.

Risk profile contract (locked by tests):

  conservative:
    legs = 2, exactly. High confidence only. Min edge 3pp.
    Strong-market preference (NBA REB, MLB hits). No anomalies. 1 leg
    per game. No same-team stacks. No volatile MLB markets.

  balanced:
    legs = 3, exactly. High or Medium. Min edge 2pp. Up to 2 legs per
    game. At most one volatile MLB market. No anomalies.

  high-variance (aggressive):
    legs = 4-5. Any confidence tier. Min edge 1pp. Up to 3 legs per
    game. At most one anomaly leg, at most three volatile MLB markets,
    at most one same-team-pair stack. Honestly labeled.

Correlation suppression:

  * same_game_cap — limits how many legs share a gameId
  * same_team_cap — limits how many legs share a team abbreviation
  * volatile_market_cap — limits high-variance MLB markets
  * anomaly_cap — limits R5-flagged extreme-edge legs

Honest framing:

  When the eligible pool is too small to satisfy the profile rules,
  the optimizer returns an empty list. We never fabricate a slip to
  fill a profile.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Iterable


# ---------------------------------------------------------------------------
# Profile rules — single source of truth.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ProfileRules:
    """Hard constraints + per-leg scoring weights for a risk profile."""

    profile: str
    confidence: tuple[str, ...]
    min_edge_pct: float
    min_legs: int
    max_legs: int
    require_recent10: bool
    require_valid_player_id: bool
    max_legs_per_game: int
    max_legs_per_team: int
    exclude_anomalies: bool
    max_anomaly_legs: int
    mlb_allowed_markets: tuple[str, ...] | None
    mlb_max_volatile_legs: int
    # Scoring multipliers — higher = "prefer this profile to weight X more"
    edge_weight: float = 0.30
    confidence_weight: float = 0.70
    recent10_bonus: float = 0.15
    pid_bonus: float = 0.10
    correlation_penalty_per_extra: float = 0.08
    # Strict star-only eligibility — when True, non-star legs are
    # rejected at the eligibility gate so the lane is composed only
    # of recognizable players. Set on Star Power.
    require_star: bool = False
    # PR #115 DNP guard — minimum recent-activity signal required for
    # a leg to enter this official lane. Independent of
    # `require_recent10` (which was the older NBA-only gate at 5).
    # The new gate runs on every profile:
    #   - NBA leg requires `recent10Count >= dnp_min_nba_recent10`.
    #   - MLB leg requires `len(recentSeries) >= dnp_min_mlb_series`.
    # Catches the 5/25 audit pattern where all 10 pending slips were
    # blocked by a single DNP player (Soto x4, Ruiz x3, Schroder x3,
    # Bauers x1). Custom Parlay Generator can still surface these
    # legs with a `risk` warning chip — only the official lanes
    # exclude them.
    dnp_min_nba_recent10: int = 7
    dnp_min_mlb_series: int = 5


CONSERVATIVE_RULES = ProfileRules(
    profile="conservative",
    confidence=("High",),
    min_edge_pct=3.0,
    min_legs=2,
    max_legs=2,
    require_recent10=True,
    require_valid_player_id=True,
    max_legs_per_game=1,
    max_legs_per_team=1,
    exclude_anomalies=True,
    max_anomaly_legs=0,
    # PR `fix/parlays-mlb-market-diversity`: open Conservative to
    # admit ONE batter_total_bases leg per 2-leg slip (still requires
    # at least one batter_hits leg via the volatile cap). Strikeouts
    # stay blocked at the eligibility gate (audit-weakest cohort at
    # 43.6%, well below the >=50% Conservative threshold). Net effect:
    # Conservative slips become "hits + total_bases" combos instead
    # of "hits + hits". H+R+RBI stays out of Conservative — too little
    # audit data and structurally noisier than singles-only hits.
    mlb_allowed_markets=(
        "batter_hits",
        "batter_total_bases",
    ),
    mlb_max_volatile_legs=1,
    correlation_penalty_per_extra=0.12,
)

BALANCED_RULES = ProfileRules(
    profile="balanced",
    confidence=("High", "Medium"),
    min_edge_pct=2.0,
    min_legs=3,
    max_legs=3,
    require_recent10=False,
    require_valid_player_id=True,
    max_legs_per_game=2,
    max_legs_per_team=2,
    exclude_anomalies=True,
    max_anomaly_legs=0,
    # PR `fix/parlays-mlb-market-diversity`: expand Balanced to a
    # four-market allowlist (hits + total_bases + H+R+RBI + pitcher
    # strikeouts). H+R+RBI was previously aggressive-only — adding
    # it here gives Balanced a legitimate third-leg variant beyond
    # repeated hits. Pitcher strikeouts re-admitted into Balanced
    # because:
    #   - `confidence=("High","Medium")` already filters out the
    #     low-conviction pitching props that drove the audit pain.
    #   - `mlb_max_volatile_legs=1` caps total volatile content per
    #     slip — at most one of {total_bases, strikeouts, H+R+RBI}
    #     can land in any visible Balanced slip.
    #   - Market stability weight (0.70) keeps strikeouts ranked
    #     below hits naturally, so it surfaces only when a Medium-
    #     confidence pitcher leg is genuinely the best alternative
    #     to a third hits leg.
    # Result: Balanced slips become richer ("hits + hits + total_bases"
    # or "hits + H+R+RBI + total_bases") instead of "hits + hits +
    # hits".
    mlb_allowed_markets=(
        "batter_hits",
        "batter_total_bases",
        "batter_hits_runs_rbis",
        "pitcher_strikeouts",
    ),
    mlb_max_volatile_legs=1,
    correlation_penalty_per_extra=0.08,
    # PR #115 DNP guard — Balanced relaxed vs Conservative/Star
    # Power. NBA leg needs >= 5 recent10 values (was implicitly 0).
    dnp_min_nba_recent10=5,
)

AGGRESSIVE_RULES = ProfileRules(
    profile="aggressive",
    confidence=("High", "Medium", "Low"),
    min_edge_pct=1.0,
    min_legs=4,
    # PR #110 safety filter: 5-leg slips went 0W-14L (0.0%) on
    # 2026-05-25. Cap visible aggressive slips at 4 legs so the
    # combinatorial slip-math doesn't keep building unwinnable 5-leg
    # builds. Users who explicitly want 5+ legs can still build them
    # in the custom-parlay builder.
    max_legs=4,
    require_recent10=False,
    require_valid_player_id=False,
    max_legs_per_game=3,
    max_legs_per_team=3,
    exclude_anomalies=False,
    max_anomaly_legs=1,
    mlb_allowed_markets=(
        "batter_hits",
        "batter_total_bases",
        "pitcher_strikeouts",
        "batter_hits_runs_rbis",
    ),
    mlb_max_volatile_legs=3,
    correlation_penalty_per_extra=0.05,
    # PR #115 DNP guard — Longshot tolerates more volatility but
    # still excludes pure no-data legs. NBA leg needs >= 3
    # recent10 values; MLB leg needs >= 3 series values.
    dnp_min_nba_recent10=3,
    dnp_min_mlb_series=3,
)

# Star Power lane — recognizable-stars-first composition. Not "safer"
# than Conservative; model-ranked among stars. Strict-star eligibility
# means a Star Power slip never contains a non-star leg; the lane
# returns empty when not enough stars pass the gate.
#
# Composition (updated PR #110 after 5/25 audit):
#   - 2-3 legs (the slate decides; 3 only when enough stars exist
#     across ≥2 games or NBA+MLB).
#   - High or Medium confidence only.
#   - Edge ≥ 3pp.
#   - MLB hits only (stable market — Star Power doesn't fish in
#     volatile MLB cohorts).
#   - Same-game cap **1** (was 2). PR #110 safety: same-game NBA
#     stacks on 5/25 went 1W-23L (4.2%). The Knicks blowout flattened
#     both teams' volume props simultaneously, and same-game stacks
#     in blowouts are structurally correlated losses. We do not have
#     pregame spread data wired in yet, so we default to the safer
#     cap=1 unconditionally. Once spread context is available we can
#     re-relax to 2 when the spread is small.
#   - Same-team cap 1 (different players; no same-team stacks).
#   - No anomalies.
STAR_POWER_RULES = ProfileRules(
    profile="star_power",
    confidence=("High", "Medium"),
    min_edge_pct=3.0,
    min_legs=2,
    max_legs=3,
    require_recent10=True,
    require_valid_player_id=True,
    max_legs_per_game=1,
    max_legs_per_team=1,
    exclude_anomalies=True,
    max_anomaly_legs=0,
    # PR `fix/parlays-mlb-market-diversity`: expand Star Power beyond
    # hits-only to surface star batters across hits / total_bases /
    # H+R+RBI. Pitcher strikeouts stay OUT of Star Power — the lane
    # exists for recognizable batters; pitcher props don't fit the
    # composition. `mlb_max_volatile_legs=1` caps total volatile
    # content per slip so a Star Power slip is always at least one
    # stable hits leg paired with at most one volatile partner.
    mlb_allowed_markets=(
        "batter_hits",
        "batter_total_bases",
        "batter_hits_runs_rbis",
    ),
    mlb_max_volatile_legs=1,
    correlation_penalty_per_extra=0.10,
    require_star=True,
)

PROFILE_RULES_BY_NAME: dict[str, ProfileRules] = {
    "conservative": CONSERVATIVE_RULES,
    "balanced": BALANCED_RULES,
    "aggressive": AGGRESSIVE_RULES,
    "star_power": STAR_POWER_RULES,
}


# MLB markets we treat as "high variance" for the volatile-leg cap.
# Aligns with the audit (batter_hits is the stable cohort; total_bases
# and strikeouts have meaningfully higher game-to-game variance).
MLB_VOLATILE_MARKETS: set[str] = {
    "batter_total_bases",
    "pitcher_strikeouts",
    "batter_hits_runs_rbis",
}


# Per (sport, market) strength weight. Used as a small ranking nudge so
# the optimizer prefers leans on markets the audit shows are stable.
# Values are NOT a hit rate — just a relative preference factor.
#
# Tuned 2026-05-25 against `model_audit.json` (8 NBA dates, 7 MLB
# dates settled):
#   - NBA REB hit rate 56.1% > PTS 52.2% > AST 51.3% on 800+ decisive.
#     Widened the spread to make the audit-strong market (REB) more
#     prominent in optimizer slips.
#   - MLB batter_hits 51.9% is the only positive MLB cohort. Total
#     bases (47.9%) and strikeouts (43.6%) are below coin-flip on the
#     last ~250 decisive picks each. Pulled their weights further.
MARKET_STABILITY_WEIGHT: dict[str, float] = {
    "nba:REB": 1.15,
    "nba:PTS": 0.95,
    "nba:AST": 0.80,
    "mlb:batter_hits": 1.15,
    "mlb:batter_total_bases": 0.85,
    "mlb:pitcher_strikeouts": 0.70,
    # batter_hits_runs_rbis stays at 0.80 — the audit has zero
    # decisive picks on this market yet, so we don't have data to
    # justify moving the weight. Re-tune once N ≥ ~100 settled rows.
    "mlb:batter_hits_runs_rbis": 0.80,
}


# Star Power-only market overrides. Restores audit-downweighted NBA
# markets (AST 0.80, PTS 0.95) to 1.00 for SUPERSTAR/CORE stars on
# High/Medium confidence leans inside the Star Power lane. This is
# how Donovan Mitchell / Brunson AST surfaces in Star Power without
# changing the global audit weighting that Conservative/Balanced rely
# on. We do NOT override MLB markets here — Star Power still respects
# the audit on the volatile MLB cohorts.
#
# This is a product lane preference, not a confidence claim. Star
# Power is "model-ranked recognizable stars", not "safer".
_STAR_POWER_MARKET_OVERRIDE: dict[str, float] = {
    "nba:AST": 1.00,
    "nba:PTS": 1.00,
    # nba:REB already at 1.15 — keep it; the override is only useful
    # where the audit penalty would suppress a star.
}


# ---------------------------------------------------------------------------
# Optimizer dataclasses
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class OptimizerLean:
    """Normalized lean shape the optimizer reads. Built by
    `normalize_lean`; downstream callers pass these around so they never
    have to remember the underlying NBA / MLB field differences."""

    sport: str
    leanId: str
    gameId: str | None
    playerId: int | None
    playerName: str
    team: str | None
    opponent: str | None
    market: str
    marketLabel: str | None
    side: str  # "Over" / "Under" / "Pass"
    line: float | None
    projection: float | None
    edgePct: float | None
    confidence: str | None
    bookmaker: str | None
    oddsForSide: int | None
    recent10Count: int
    # Up to 10 most-recent numeric stat values for the leg's market.
    # NBA reads `recent10`; MLB reads `recentSeries`. Snapshot writers
    # persist this so the UI can render an honest "last-N games" popup
    # without any new data fetch.
    recentSeries: tuple[float, ...] = ()
    # PR #116 — per-game metadata parallel to `recentSeries`. Each
    # entry: {"date": "YYYY-MM-DD", "opponent": "NYK"|None,
    # "isHome": bool|None, "value": float}. Same chronological order
    # (oldest → newest) and the same length as `recentSeries` when
    # populated. May be empty when the upstream source (NBA boards
    # for now) didn't attach the metadata. Never fabricated.
    recentGames: tuple[dict, ...] = ()
    isAnomaly: bool = False
    isVolatileMlb: bool = False
    # Star metadata — set by `normalize_lean` via `star_players.py`.
    # `starTier` ∈ {"none", "regular", "core", "superstar"}.
    starTier: str = "none"
    # Optional pre-computed calibration multiplier (1.0 = neutral).
    calibrationFactor: float = 1.0
    # Per-(sport, market) weight from the audit, defaults to 1.0.
    marketWeight: float = 1.0
    # PR `feature/leg-game-time-threading` — real game start time
    # threaded from the source board. `commenceTime` is an ISO UTC
    # string (preferred when present — MLB boards already write this;
    # NBA boards may add it in future). `gameTime` is a pre-formatted
    # display string for sports whose board only carries that (NBA
    # boards write `tipoff` as e.g. "8:30 PM ET"). Both default to
    # None; consumers render the date-only fallback when both are
    # missing. Never fabricated.
    commenceTime: str | None = None
    gameTime: str | None = None

    @property
    def isStar(self) -> bool:
        return self.starTier != "none"


@dataclass(frozen=True)
class OptimizedSlip:
    """An optimizer-produced slip. Parallel to `snapshot_parlays.SnapshotSlip`
    but richer — includes the per-leg score breakdown so the UI can
    explain why a slip ranked where it did."""

    slipId: str
    profile: str
    sport: str  # "nba" / "mlb" / "multi"
    legs: list[OptimizerLean]
    sameGame: bool
    hasAnomalyLeg: bool
    score: float  # Higher = stronger recommendation
    correlationPenalty: float
    rationale: str
    # PR `feature/nba-single-game-parlay-methodology` (2026-05-28) —
    # True only when generated by the explicit single-game-NBA path.
    # The UI renders a "Single-game · higher variance" chip when this
    # is set, so users always see the framing that all legs came from
    # one matchup and carry correlation risk. Default False keeps every
    # other slip path unchanged.
    singleGame: bool = False

    def as_dict(self) -> dict[str, Any]:
        out = asdict(self)
        # Frozen dataclasses serialize legs to nested dicts via asdict;
        # callers want plain JSON shape, which is what they get.
        return out


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------

def last_n_recent_values(series, n: int = 10) -> list:
    """Return the MOST-RECENT ``n`` entries of an OLDEST → NEWEST series.

    Both sports emit per-game values in oldest→newest order: NBA `recent10`
    (`recent10_extractor.extract_recent10`, already capped to the most-recent
    ``n`` via a tail slice) and MLB `recentSeries` (`mlb_model`, the FULL
    season series, untruncated). The persisted leg field must carry the
    player's MOST RECENT games, so we slice the TAIL (``series[-n:]``), never
    the head.

      - MLB (full season series) → this is the FIX: keeps the recent ``n``,
        not the oldest ``n`` (the prior ``series[:10]`` bug — see
        ``docs/SUGGESTED_PARLAY_METHODOLOGY_V2_2026-06-02.md``).
      - NBA (already ≤ ``n``, oldest→newest) → no-op (``x[-n:] == x``).
      - Series shorter than ``n`` or empty → returned unchanged.

    Order is PRESERVED (never reversed), so the i-th persisted value still
    lines up with the i-th ``recentGames`` entry. Pure; no I/O; no fabrication.
    """
    if n <= 0:
        return []
    return list(series or [])[-n:]


def normalize_lean(raw: dict[str, Any], *, sport: str | None = None) -> OptimizerLean:
    """Convert a board lean (NBA or MLB shape) into an OptimizerLean.

    The optimizer's other functions never touch raw dicts — that keeps
    sport-specific field-name handling in exactly one place.
    """
    s = sport or raw.get("_sport") or raw.get("sport") or "nba"
    s = s.lower()
    market = raw.get("market") or raw.get("marketKey") or "?"
    market_key = f"{s}:{market}"
    recent10 = raw.get("recent10") or raw.get("recentSeries") or []
    recent_count = 0
    recent_values: list[float] = []
    if isinstance(recent10, list):
        for v in recent10:
            if isinstance(v, (int, float)) and not isinstance(v, bool) and v == v:
                recent_count += 1
                recent_values.append(float(v))
    # PR #116 — pass through `recentGames` metadata when the upstream
    # board attached it. Each entry should already be a dict with
    # `{date, opponent, isHome, value}`; we sanity-coerce here so the
    # snapshot stays JSON-safe.
    raw_games = raw.get("recentGames") or []
    recent_games_tuple: tuple[dict, ...] = ()
    if isinstance(raw_games, list):
        cleaned: list[dict] = []
        for g in raw_games:
            if not isinstance(g, dict):
                continue
            value = g.get("value")
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                continue
            cleaned.append({
                "date": g.get("date") if isinstance(g.get("date"), str) else None,
                "opponent": g.get("opponent") if isinstance(g.get("opponent"), str) else None,
                "isHome": g.get("isHome") if isinstance(g.get("isHome"), bool) else None,
                "value": float(value),
            })
        recent_games_tuple = tuple(last_n_recent_values(cleaned, 10))
    side = raw.get("lean") or raw.get("side") or "Pass"
    odds = (
        raw.get("oddsOver")
        if side == "Over"
        else raw.get("oddsUnder")
        if side == "Under"
        else None
    )
    return OptimizerLean(
        sport=s,
        leanId=str(raw.get("id") or raw.get("leanId") or _fallback_lean_id(raw)),
        gameId=str(raw.get("gameId")) if raw.get("gameId") else None,
        playerId=raw.get("playerId"),
        playerName=raw.get("playerName") or "—",
        team=raw.get("team") or raw.get("playerTeamAbbr"),
        opponent=raw.get("opponent") or raw.get("opponentAbbr"),
        market=market,
        marketLabel=raw.get("marketLabel"),
        side=side,
        line=raw.get("line"),
        projection=raw.get("projection"),
        edgePct=raw.get("edgePct"),
        confidence=raw.get("confidence"),
        bookmaker=raw.get("bookmaker"),
        oddsForSide=odds,
        recent10Count=recent_count,
        recentSeries=tuple(last_n_recent_values(recent_values, 10)),
        recentGames=recent_games_tuple,
        starTier=_compute_star_tier(raw.get("playerName"), s),
        isAnomaly="suspicious_edge" in (raw.get("riskFlags") or []),
        isVolatileMlb=(s == "mlb" and market in MLB_VOLATILE_MARKETS),
        calibrationFactor=float(raw.get("calibrationFactor", 1.0)),
        marketWeight=MARKET_STABILITY_WEIGHT.get(market_key, 1.0),
        # PR `feature/leg-game-time-threading` — preserve the upstream
        # game-time fields when the loader attached them. Loaders fill
        # `commenceTime` from MLB's ISO UTC `commenceTime` and
        # `gameTime` from NBA's pre-formatted ET `tipoff`. We only
        # accept strings; anything else is treated as missing so the
        # frontend renders the honest date-only fallback.
        commenceTime=(
            raw.get("commenceTime")
            if isinstance(raw.get("commenceTime"), str)
            and raw.get("commenceTime").strip()
            else None
        ),
        gameTime=(
            raw.get("gameTime")
            if isinstance(raw.get("gameTime"), str)
            and raw.get("gameTime").strip()
            else None
        ),
    )


def _fallback_lean_id(raw: dict[str, Any]) -> str:
    name = raw.get("playerName") or "?"
    market = raw.get("market") or raw.get("marketKey") or "?"
    line = raw.get("line") or 0
    return f"{name}-{market}-{line}".replace(" ", "_")


def _compute_star_tier(name: str | None, sport: str) -> str:
    """Look up the player's star tier. Defensive import so test
    fixtures that monkeypatch the registry don't break."""
    try:
        from .star_players import star_tier
        return star_tier(name, sport)
    except Exception:
        return "none"


# ---------------------------------------------------------------------------
# Per-leg scoring
# ---------------------------------------------------------------------------

# Confidence-tier weights. NBA tier ordering matches priors. MLB is
# different: the audit shows the High tier is *inverted* (227-243 =
# 48.3%) while Medium / Low both clear 51%. We do not flip the labels
# (the calibration overlay does that on the UI side), but we DO use
# the audit-corrected weight here so the optimizer doesn't keep
# selecting MLB High legs as if they were strong picks.
#
# We can't easily set per-sport tier weights without a wider refactor,
# so we keep a single map and let the per-leg sport-aware adjustment
# inside `leg_score` flatten MLB High.
_CONFIDENCE_WEIGHT: dict[str, float] = {
    "High": 1.0,
    "Medium": 0.65,
    "Low": 0.30,
}

# Per-sport tier adjustments applied AFTER the base confidence
# weight. Multiplicative. Sourced from model_audit.json on 2026-05-25.
_TIER_ADJUST: dict[tuple[str, str], float] = {
    # MLB High is calibration-inverted (48.3% audit). Down-weight to
    # the level of Medium so it doesn't dominate the optimizer.
    ("mlb", "High"): 0.65,
}


def leg_score_breakdown(
    lean: OptimizerLean, rules: ProfileRules
) -> dict[str, float | str]:
    """Per-leg scoring components — exposed so the snapshot writer can
    attach an honest, auditable score breakdown to each leg in the
    optimizer JSON. The custom-parlay builder uses this on the client
    so the user sees the same scoring the optimizer used, with no
    duplicated formula in TypeScript.

    Returns a dict with:
      - `legScore`: the final `leg_score(lean, rules)` value.
      - `confidenceComponent`: the confidence × tier-adjust × profile
        confidence_weight term (before market weight).
      - `edgeComponent`: the edge × profile edge_weight term.
      - `recent10Bonus`, `pidBonus`: bonus values applied (or 0).
      - `starBoost`: star bonus for this (tier, profile) or 0.
      - `marketWeight`: effective market weight after Star Power
        override (when applicable).
      - `calibrationFactor`: 1.0 default.
    """
    cw = _CONFIDENCE_WEIGHT.get(lean.confidence or "", 0.10)
    tier_adjust = _TIER_ADJUST.get((lean.sport, lean.confidence or ""), 1.0)
    confidence_component = rules.confidence_weight * cw * tier_adjust
    # PR #110: edge clip 20 → 15 (see leg_score docstring)
    edge = max(0.0, min(15.0, float(lean.edgePct or 0)))
    edge_component = rules.edge_weight * (edge / 15.0)
    recent_bonus = rules.recent10_bonus if lean.recent10Count >= 5 else 0.0
    pid_bonus = rules.pid_bonus if (lean.playerId or 0) > 0 else 0.0
    star_bonus = 0.0
    if lean.starTier != "none" and (lean.confidence in ("High", "Medium")):
        from .star_players import star_boost
        star_bonus = star_boost(lean.playerName, lean.sport, rules.profile)
    market_weight = lean.marketWeight
    # PR #110: AST/PTS override now ALSO requires recent10Count ≥ 7
    if (
        rules.profile == "star_power"
        and lean.starTier in ("superstar", "core")
        and lean.confidence in ("High", "Medium")
        and lean.recent10Count >= 7
    ):
        market_key = f"{lean.sport}:{lean.market}"
        override = _STAR_POWER_MARKET_OVERRIDE.get(market_key)
        if override is not None and override > market_weight:
            market_weight = override
    return {
        "legScore": leg_score(lean, rules),
        "confidenceComponent": round(confidence_component, 4),
        "edgeComponent": round(edge_component, 4),
        "recent10Bonus": round(recent_bonus, 4),
        "pidBonus": round(pid_bonus, 4),
        "starBoost": round(star_bonus, 4),
        "marketWeight": round(market_weight, 4),
        "calibrationFactor": round(lean.calibrationFactor, 4),
    }


def leg_score(lean: OptimizerLean, rules: ProfileRules) -> float:
    """Higher = better fit for the profile.

    Components:
      - confidence_weight × tier weight × per-(sport, tier) adjust
      - edge_weight × (clipped edge / 15)  (clip tightened in PR #110;
        was 20pp — high-edge leans were noisy bench/value players)
      - recent10_bonus when recent10 has ≥5 numeric values
      - pid_bonus when playerId is real
      - star bonus (per-profile, bounded — see star_players.py)
      - market stability (1.0 = neutral; Star Power lane uses a
        bounded override for NBA AST/PTS so superstar/core stars on
        downweighted markets aren't suppressed — gated on recent10
        support post-PR #110 after AST went 0-5 on 5/25)
      - calibration factor (1.0 = neutral)
    """
    cw = _CONFIDENCE_WEIGHT.get(lean.confidence or "", 0.10)
    tier_adjust = _TIER_ADJUST.get((lean.sport, lean.confidence or ""), 1.0)
    cw *= tier_adjust
    # PR #110 safety: tighten edge clip from 20pp → 15pp. Edges above
    # 20pp were dominated by bench/value players whose 5/25 hit rate
    # was meaningfully below their model edge. Clipping at 15pp
    # caps the contribution of noisy outliers without crushing real
    # superstar edges (which usually sit in the 5-15pp range anyway).
    edge = max(0.0, min(15.0, float(lean.edgePct or 0)))
    base = (
        rules.confidence_weight * cw
        + rules.edge_weight * (edge / 15.0)
    )
    if lean.recent10Count >= 5:
        base += rules.recent10_bonus
    if (lean.playerId or 0) > 0:
        base += rules.pid_bonus
    # Star bonus — bounded, profile-aware. Only applied when the
    # lean is in a calibration-supported tier (High / Medium).
    # Bench/star-thin-data picks at Low tier don't get the boost so
    # the lane still respects the audit.
    if lean.starTier != "none" and (lean.confidence in ("High", "Medium")):
        from .star_players import star_boost
        base += star_boost(lean.playerName, lean.sport, rules.profile)
    # Per-lane market weight. Star Power lane restores audit-
    # downweighted NBA markets for superstar/core stars on High/Medium
    # confidence so Donovan Mitchell / Brunson AST etc. can surface.
    # PR #110 safety: AST market went 0W-5L on 5/25 (Mitchell AST
    # Over 4.5 sank 3 Star Power slips). The override now ALSO
    # requires recent10Count ≥ 7 — stars without recent stable
    # game-log support don't get the AST/PTS rescue.
    market_weight = lean.marketWeight
    if (
        rules.profile == "star_power"
        and lean.starTier in ("superstar", "core")
        and lean.confidence in ("High", "Medium")
        and lean.recent10Count >= 7
    ):
        market_key = f"{lean.sport}:{lean.market}"
        override = _STAR_POWER_MARKET_OVERRIDE.get(market_key)
        if override is not None and override > market_weight:
            market_weight = override
    base *= market_weight
    base *= max(0.0, min(2.0, lean.calibrationFactor))
    return base


# ---------------------------------------------------------------------------
# Eligibility
# ---------------------------------------------------------------------------

def is_eligible(
    lean: OptimizerLean,
    rules: ProfileRules,
    *,
    selected_player_names: set[str] | None = None,
    selected_sports: set[str] | None = None,
    selected_game_ids: set[str] | None = None,
) -> bool:
    """All-or-nothing predicate — must return True for the lean to
    enter the candidate pool."""
    if lean.side not in ("Over", "Under"):
        return False
    if lean.confidence not in rules.confidence:
        return False
    if (lean.edgePct or 0) < rules.min_edge_pct:
        return False
    if rules.require_recent10 and lean.recent10Count < 5:
        return False
    # PR #115 DNP guard — applies to every official lane. NBA legs
    # need `recent10Count >= dnp_min_nba_recent10`; MLB legs need
    # `len(recentSeries) >= dnp_min_mlb_series`. Excludes the 5/25
    # audit pattern where all 10 pending slips were blocked by a
    # single DNP player (Soto x4, Ruiz x3, Schroder x3, Bauers x1).
    if lean.sport == "nba":
        if lean.recent10Count < rules.dnp_min_nba_recent10:
            return False
    elif lean.sport == "mlb":
        series_len = len(lean.recentSeries) if lean.recentSeries else 0
        if series_len < rules.dnp_min_mlb_series:
            return False
    if rules.require_valid_player_id and (lean.playerId or 0) <= 0:
        return False
    if rules.exclude_anomalies and lean.isAnomaly:
        return False
    if rules.require_star and lean.starTier == "none":
        return False
    if lean.sport == "mlb" and rules.mlb_allowed_markets is not None:
        if lean.market not in rules.mlb_allowed_markets:
            return False
    if selected_sports is not None and lean.sport not in selected_sports:
        return False
    if selected_game_ids is not None and (
        lean.gameId is None or lean.gameId not in selected_game_ids
    ):
        return False
    if selected_player_names is not None and len(selected_player_names) > 0:
        if _normalize_player(lean.playerName) not in selected_player_names:
            return False
    return True


def _normalize_player(name: str) -> str:
    out = (name or "").lower()
    import re
    out = re.sub(r"[^a-z0-9]+", "_", out)
    return out.strip("_")


# ---------------------------------------------------------------------------
# Greedy build with correlation suppression
# ---------------------------------------------------------------------------

def _player_key(lean: OptimizerLean) -> str:
    if lean.playerId and lean.playerId > 0:
        return f"pid:{lean.playerId}"
    return f"name:{_normalize_player(lean.playerName)}"


def _greedy(
    pool: list[OptimizerLean],
    start: int,
    rules: ProfileRules,
    *,
    must_include_keys: set[str] | None = None,
) -> list[OptimizerLean] | None:
    """Walk the pool starting at `start`, greedily building a slip that
    satisfies every rule. Returns None when fewer than min_legs legs
    can be assembled.

    Caller may pass `must_include_keys` (player keys that should
    appear if the rules allow). This is honored as a *soft* preference
    — if a must-include key can't fit (e.g. they're an anomaly leg in a
    conservative profile), the slip still builds without them.

    PR `fix/parlays-mlb-market-diversity`: within-slip market diversity
    is applied during the walk via `_WITHIN_SLIP_MARKET_PENALTY`. Each
    candidate leg's effective score is reduced by
    `markets_used[market] * penalty` so a hits leg loses ranking
    against an equally-strong total_bases leg once a hits leg is
    already in the slip. Hard cap behavior (player/game/team/volatile)
    is unchanged — diversity only operates as a tiebreaker among
    legs that all pass the hard gates. When no alternative-market
    leg is eligible, the same-market leg still wins and the slip
    builds as before.
    """
    picked: list[OptimizerLean] = []
    used_players: set[str] = set()
    games_used: dict[str, int] = {}
    teams_used: dict[str, int] = {}
    markets_used: dict[str, int] = {}
    anomaly_count = 0
    volatile_count = 0

    # Re-order so must-include keys land at the front, preserving the
    # rest of the sort.
    if must_include_keys:
        ordered = sorted(
            pool,
            key=lambda l: (_player_key(l) not in must_include_keys),
        )
    else:
        ordered = pool

    order = ordered[start:] + ordered[:start]
    market_penalty = _WITHIN_SLIP_MARKET_PENALTY.get(rules.profile, 0.0)

    def _is_eligible_for_slip(lean: OptimizerLean) -> bool:
        """Hard-constraint check used during the walk. Mirrors the
        sequential filter that lived inline before market diversity
        was added — extracted so we can both walk in order AND look
        ahead for a higher-diversity alternative."""
        pkey = _player_key(lean)
        if pkey in used_players:
            return False
        if lean.isAnomaly and anomaly_count >= rules.max_anomaly_legs:
            return False
        gkey = str(lean.gameId or "")
        if gkey and games_used.get(gkey, 0) >= rules.max_legs_per_game:
            return False
        tkey = (lean.team or "").upper()
        if tkey and teams_used.get(tkey, 0) >= rules.max_legs_per_team:
            return False
        if lean.isVolatileMlb and volatile_count >= rules.mlb_max_volatile_legs:
            return False
        return True

    # Two-phase walk. Phase 1 picks the first eligible leg from the
    # rotation (preserves the existing seed behavior so the rotation
    # `start` parameter still drives the slip's "anchor" choice).
    # Phase 2+ uses market-aware re-ranking: among ALL remaining
    # eligible legs in the rotation, pick the one with the best
    # effective score = leg_score - markets_used[market] * penalty.
    # This gives diversity teeth without abandoning quality — when
    # only one market is eligible, the rotation-order leg still wins.
    for idx, lean in enumerate(order):
        if len(picked) >= rules.max_legs:
            break
        if not _is_eligible_for_slip(lean):
            continue
        if not picked or market_penalty <= 0:
            # Anchor leg (or no diversity penalty configured) —
            # preserve the existing rotation-based selection.
            chosen = lean
            chosen_idx = idx
        else:
            # Phase 2+: search the remaining rotation for the best
            # market-adjusted candidate. Stop once we've searched a
            # reasonable horizon — full-pool re-rank is O(N*max_legs)
            # which is fine for current pool sizes (~700) but bound it
            # explicitly so this can't pathologize on giant slates.
            best_lean = lean
            best_idx = idx
            best_adj = (
                # Approximate effective score: lean's leg_score adjusted
                # by repeat-market penalty.
                leg_score(lean, rules)
                - markets_used.get(lean.market or "", 0) * market_penalty
            )
            search_horizon = min(len(order), idx + 250)
            for j in range(idx + 1, search_horizon):
                cand = order[j]
                if not _is_eligible_for_slip(cand):
                    continue
                adj = (
                    leg_score(cand, rules)
                    - markets_used.get(cand.market or "", 0) * market_penalty
                )
                if adj > best_adj:
                    best_adj = adj
                    best_lean = cand
                    best_idx = j
            chosen = best_lean
            chosen_idx = best_idx
        # Commit the chosen leg + update all running counters.
        picked.append(chosen)
        used_players.add(_player_key(chosen))
        gkey = str(chosen.gameId or "")
        if gkey:
            games_used[gkey] = games_used.get(gkey, 0) + 1
        tkey = (chosen.team or "").upper()
        if tkey:
            teams_used[tkey] = teams_used.get(tkey, 0) + 1
        if (chosen.market or ""):
            mkey = chosen.market
            markets_used[mkey] = markets_used.get(mkey, 0) + 1
        if chosen.isVolatileMlb:
            volatile_count += 1
        if chosen.isAnomaly:
            anomaly_count += 1
        # When we re-ranked and ended up choosing a leg further into
        # the rotation, we still need to keep walking from the same
        # base idx. The for-loop's natural advance (idx+1) handles
        # this correctly — we never revisit `chosen_idx` because it
        # would be filtered by the duplicate-player check. The
        # variable is kept for clarity / future use.
        _ = chosen_idx
    if len(picked) < rules.min_legs:
        return None
    return picked


# Per-profile within-slip market diversity penalty (applied in _greedy
# during slip assembly). Larger values produce more aggressive market
# variety; values that exceed the typical market-stability-weight gap
# (~0.30) would over-diversify and force genuinely weaker legs into
# slips, so we keep these well under that threshold.
_WITHIN_SLIP_MARKET_PENALTY: dict[str, float] = {
    "conservative": 0.12,
    "balanced":     0.12,
    "star_power":   0.12,
    "aggressive":   0.10,
}


def _correlation_penalty(legs: list[OptimizerLean], rules: ProfileRules) -> float:
    """Quantifies how much same-game / same-team / same-market / volatile
    exposure a slip carries. Subtracted from the raw score.

    PR `fix/parlays-mlb-market-diversity`: same-market penalty added.
    Before this PR, _greedy + raw scoring produced 100% batter_hits
    visible slips on MLB-only slates even though the leg pool spanned
    four markets. The within-slip same-market penalty makes a mixed-
    market candidate slip score competitively against an all-hits
    slip when raw leg scores are close, so the candidate pool itself
    contains varied builds for the cross-card diversifier to choose
    from. The penalty is small enough that when no alternatives exist,
    the all-hits slip still wins on quality.
    """
    if not legs:
        return 0.0
    game_counts: dict[str, int] = {}
    team_counts: dict[str, int] = {}
    market_counts: dict[str, int] = {}
    volatile = 0
    for lean in legs:
        if lean.gameId:
            game_counts[lean.gameId] = game_counts.get(lean.gameId, 0) + 1
        if lean.team:
            team_counts[lean.team] = team_counts.get(lean.team, 0) + 1
        if lean.market:
            market_counts[lean.market] = market_counts.get(lean.market, 0) + 1
        if lean.isVolatileMlb:
            volatile += 1
    penalty = 0.0
    for count in game_counts.values():
        if count > 1:
            penalty += (count - 1) * rules.correlation_penalty_per_extra
    for count in team_counts.values():
        if count > 1:
            penalty += (count - 1) * (rules.correlation_penalty_per_extra * 0.5)
    # Same-market within-slip penalty. 0.10 per extra leg of the same
    # market is large enough to flip the candidate ranking when leg
    # scores are close (e.g. one hits leg + one total_bases star vs
    # two hits legs of similar quality) but small enough that a hits-
    # only slip with markedly stronger raw scores still wins.
    for count in market_counts.values():
        if count > 1:
            penalty += (count - 1) * 0.10
    if volatile > 1:
        penalty += (volatile - 1) * 0.04
    return penalty


def _rationale(legs: list[OptimizerLean], rules: ProfileRules) -> str:
    """Plain-English explanation of the slip. Honest framing only."""
    if not legs:
        return ""
    sports = {l.sport for l in legs}
    sport_label = "Mixed" if len(sports) > 1 else next(iter(sports)).upper()
    games = {l.gameId for l in legs if l.gameId}
    same_game = len(games) < len(legs)
    anomaly = any(l.isAnomaly for l in legs)
    pieces = [
        f"{sport_label} · {len(legs)} legs · {rules.profile}",
    ]
    if rules.profile == "aggressive":
        pieces.append("high-variance build")
    if same_game:
        pieces.append("includes same-game legs")
    if anomaly:
        pieces.append("includes one anomaly-flagged leg")
    avg_edge = sum((l.edgePct or 0) for l in legs) / max(len(legs), 1)
    pieces.append(f"avg edge {avg_edge:.1f}pp")
    return " · ".join(pieces)


# ---------------------------------------------------------------------------
# Slip scoring
# ---------------------------------------------------------------------------

def slip_score(legs: list[OptimizerLean], rules: ProfileRules) -> tuple[float, float]:
    """Returns (raw_average_leg_score, correlation_penalty).

    Final score = raw - penalty. Average instead of sum so that
    multi-leg slips don't auto-dominate; conservative-vs-aggressive
    ranking is driven by the per-leg signal, not by leg-count
    inflation.
    """
    if not legs:
        return (0.0, 0.0)
    raw = sum(leg_score(l, rules) for l in legs) / len(legs)
    penalty = _correlation_penalty(legs, rules)
    return (raw, penalty)


# ---------------------------------------------------------------------------
# Top-level optimizer
# ---------------------------------------------------------------------------

# Recurrence penalty per profile — applied AFTER raw scoring, during
# the diversified final-selection pass. Each time a player appears in
# an already-selected visible slip, every remaining candidate that
# includes that same player loses this much score. Encourages variety
# across visible cards without sacrificing slip quality.
_RECURRENCE_PENALTY: dict[str, float] = {
    "conservative": 0.50,
    "balanced":     0.30,
    "aggressive":   0.15,
}

# PR `fix/parlays-mlb-market-diversity`: parallel penalty for repeated
# *markets* across visible cards. The original `_select_diverse` only
# penalized repeated players, which let a slate with one strong market
# (e.g. batter_hits dominating MLB-only days) ship 5 visible cards all
# composed of hits legs — across different players, but cosmetically
# identical.
#
# The market penalty is calibrated SMALLER than the player penalty so
# diversity never ships an inferior slip — when an alternative leg
# scores within ~0.3 of the top hits leg, the diversifier prefers a
# slip that mixes markets; otherwise it still ships the highest-scoring
# slip. Tuned per profile:
#   - conservative: 0.20 — willing to nudge but still hits-first
#   - balanced:     0.18 — wider allowlist, more room to vary
#   - star_power:   0.20 — strict but visibly diversifying
#   - aggressive:   0.08 — already diverse; small nudge only
_MARKET_RECURRENCE_PENALTY: dict[str, float] = {
    "conservative": 0.20,
    "balanced":     0.18,
    "star_power":   0.20,
    "aggressive":   0.08,
}


def _select_diverse(
    candidates: list["OptimizedSlip"],
    *,
    profile: str,
    limit: int,
) -> list["OptimizedSlip"]:
    """Final visible-slip selection pass.

    Walks the candidate pool greedily, but penalizes slips containing
    players AND markets already chosen across the visible set.
    Quality (slip.score) still drives the decision — diversity is a
    tiebreaker, not a way to ship junk.

    Honest behavior:
      - When fewer candidates exist than `limit`, returns them all.
      - When recurrence dominates the pool (e.g. only one MLB star is
        eligible, or only batter_hits is allowed for the profile),
        the same player/market can still repeat — we don't drop the
        slip just to hit a diversity target. We just rank-down.
      - Market diversity penalty is calibrated smaller than the
        player penalty so the diversifier never trades meaningful
        quality for cosmetic variety (`_MARKET_RECURRENCE_PENALTY`).
    """
    if limit <= 0 or not candidates:
        return []
    player_penalty = _RECURRENCE_PENALTY.get(profile, 0.20)
    market_penalty = _MARKET_RECURRENCE_PENALTY.get(profile, 0.10)
    chosen: list[OptimizedSlip] = []
    used_player_counts: dict[str, int] = {}
    used_market_counts: dict[str, int] = {}
    remaining = list(candidates)
    while remaining and len(chosen) < limit:
        # Score each remaining candidate with cumulative recurrence
        # penalty based on already-chosen slips. Players and markets
        # are tracked separately so a slip can repeat a market without
        # paying the player penalty (and vice versa).
        best_idx = 0
        best_adj = float("-inf")
        for i, c in enumerate(remaining):
            player_repeat = 0
            market_repeat = 0
            for leg in c.legs:
                pkey = (leg.playerName or "").lower().strip()
                if pkey and pkey in used_player_counts:
                    player_repeat += used_player_counts[pkey]
                mkey = (leg.market or "").lower().strip()
                if mkey and mkey in used_market_counts:
                    market_repeat += used_market_counts[mkey]
            adj_score = (
                c.score
                - player_repeat * player_penalty
                - market_repeat * market_penalty
            )
            if adj_score > best_adj:
                best_adj = adj_score
                best_idx = i
        pick = remaining.pop(best_idx)
        chosen.append(pick)
        for leg in pick.legs:
            pkey = (leg.playerName or "").lower().strip()
            if pkey:
                used_player_counts[pkey] = used_player_counts.get(pkey, 0) + 1
            mkey = (leg.market or "").lower().strip()
            if mkey:
                used_market_counts[mkey] = used_market_counts.get(mkey, 0) + 1
    return chosen


def optimize(
    raw_leans: Iterable[dict[str, Any]],
    *,
    profile: str,
    sport: str | None = None,
    player_names: Iterable[str] | None = None,
    game_ids: Iterable[str] | None = None,
    num_candidates: int = 3,
    must_include_player_names: Iterable[str] | None = None,
    date: str | None = None,
) -> list[OptimizedSlip]:
    """Generate up to `num_candidates` ranked slips for the requested
    profile.

    Honest behavior:
      - When the eligible pool is too small to satisfy the profile's
        constraints, returns an empty list.
      - Never invents legs. The leans iterable is the entire universe.

    Inputs that don't carry the `_sport` field default to NBA. Caller
    should pre-tag with `_sport` for accuracy when mixing.
    """
    rules = PROFILE_RULES_BY_NAME[profile]
    leans = [normalize_lean(r) for r in raw_leans]
    selected_player_set = {
        _normalize_player(n) for n in (player_names or []) if n
    } or None
    must_include_set = {
        _normalize_player(n) for n in (must_include_player_names or []) if n
    } or None
    selected_sport_set = {sport.lower()} if sport and sport != "all" else None
    selected_game_ids = set(game_ids) if game_ids else None

    eligible = [
        l for l in leans
        if is_eligible(
            l, rules,
            selected_player_names=selected_player_set,
            selected_sports=selected_sport_set,
            selected_game_ids=selected_game_ids,
        )
    ]
    if len(eligible) < rules.min_legs:
        return []

    # Dedupe by player+market — pick highest-scoring row per pair.
    best_per_key: dict[str, OptimizerLean] = {}
    for lean in eligible:
        key = f"{_player_key(lean)}|{lean.market}"
        if key not in best_per_key or leg_score(lean, rules) > leg_score(best_per_key[key], rules):
            best_per_key[key] = lean
    pool = sorted(
        best_per_key.values(),
        key=lambda l: leg_score(l, rules),
        reverse=True,
    )
    if len(pool) < rules.min_legs:
        return []

    # Generate a larger candidate pool than what we'll display, so the
    # diversity selector has room to pick varied slips without
    # sacrificing too much quality. 4x the visible target is enough for
    # typical slates; tighter slates still cap out earlier.
    candidate_target = max(num_candidates * 4, num_candidates + 6)
    seen_sigs: set[tuple[Any, ...]] = set()
    candidates: list[OptimizedSlip] = []
    for start in range(min(len(pool), candidate_target * 2)):
        if len(candidates) >= candidate_target:
            break
        picked = _greedy(pool, start, rules, must_include_keys=must_include_set)
        if picked is None:
            continue
        sig = tuple(sorted(
            (l.playerId or 0, l.market, l.side, l.line or 0)
            for l in picked
        ))
        if sig in seen_sigs:
            continue
        seen_sigs.add(sig)
        raw, penalty = slip_score(picked, rules)
        score = raw - penalty
        sports = {l.sport for l in picked}
        slip_sport = "multi" if len(sports) > 1 else next(iter(sports))
        sid = _stable_slip_id(date or "", profile, picked)
        candidates.append(OptimizedSlip(
            slipId=sid,
            profile=profile,
            sport=slip_sport,
            legs=picked,
            sameGame=len({l.gameId for l in picked if l.gameId}) < len(picked),
            hasAnomalyLeg=any(l.isAnomaly for l in picked),
            score=score,
            correlationPenalty=penalty,
            rationale=_rationale(picked, rules),
        ))
    # Pre-sort candidates by raw score so the diversity selector starts
    # from the best slips.
    candidates.sort(key=lambda s: s.score, reverse=True)
    # Final visible selection — diversify across players when alts exist.
    return _select_diverse(candidates, profile=profile, limit=num_candidates)


# ---------------------------------------------------------------------------
# NBA single-game (SGP) generation — PR `feature/nba-single-game-parlay-methodology`
# ---------------------------------------------------------------------------
# Background: when the slate has exactly one NBA game, the per-profile
# `max_legs_per_game` cap blocks every NBA-only build (Anchor 1/game vs
# min_legs=2, Balanced 2/game vs min_legs=3, etc.). Mixed slips work
# because they reach across the MLB pool, but the user explicitly wants
# the NBA tab populated when honest single-game builds are possible.
# This generator is the explicit, transparent, opt-in path:
#
#   - Triggers ONLY when callers pass `singleGame=True` to
#     `generate_nba_sgp_slips`. The standard `optimize()` path is
#     unchanged.
#   - Caps every slip at 2 or 3 legs total (vs. 4 for Aggressive in
#     normal multi-game mode) because all legs share one game and the
#     correlation risk compounds with leg count.
#   - One leg per unique player; no doubling on a single star.
#   - Stricter edge floor (default 5pp) and confidence whitelist
#     (default High + Medium) than the source profile would normally
#     require.
#   - Output slips carry `singleGame=True` + `sameGame=True` so every
#     consumer downstream renders them honestly. UI renders the
#     "Single-game · higher variance" chip; banner updates copy.
#
# CONSERVATIVE / Anchor is intentionally NOT in the calling profile
# whitelist — its user-facing identity is "Lower-variance builds" and
# stacking two legs from one game would directly contradict that
# framing. SGP slips can populate Balanced (Core), Star Power
# (Spotlight), and Aggressive (Swing) only.

#: Per-profile defaults for the SGP path. Conservative is absent on
#: purpose. Tuneable + clearly named so a future audit can adjust
#: without changing the generator's structure.
NBA_SGP_PROFILE_DEFAULTS: dict[str, dict[str, Any]] = {
    "balanced": {
        "max_legs": 2,
        "min_edge_pct": 4.0,
        "confidence_whitelist": ("High", "Medium"),
        "num_candidates": 4,
    },
    "star_power": {
        "max_legs": 2,
        "min_edge_pct": 5.0,
        "confidence_whitelist": ("High", "Medium"),
        "num_candidates": 4,
    },
    "aggressive": {
        "max_legs": 3,
        "min_edge_pct": 3.0,
        "confidence_whitelist": ("High", "Medium", "Low"),
        "num_candidates": 4,
    },
}


# Market-reliability ranking nudge (PR overnight-research-learning). A small,
# bounded tiebreaker that prefers markets which have historically graded better
# (e.g. MLB batter_hits ~53%, NBA REB ~56%) over weak ones (MLB
# batter_total_bases ~43%, NBA AST ~45%) on SETTLED data. Sourced from the
# read-only `market-reliability.json` artifact, which is already shrunk toward a
# 0.5 prior (k=60) and sample-floored — so a thin/streaky market never moves the
# score. Bounded to ±_RELIABILITY_MAX_DELTA so it only breaks ties between
# similar-edge legs; it never overrides a genuinely stronger projection. Absent
# artifact ⇒ zero adjustment (current behaviour preserved).
_RELIABILITY_WEIGHT: float = 12.0
_RELIABILITY_MAX_DELTA: float = 0.10  # clamp |shrunkHitRate − 0.5|
_RELIABILITY_PATH = (
    Path(__file__).resolve().parents[1]
    / "app" / "public" / "data" / "audit" / "market-reliability.json"
)
_reliability_cache: dict[str, dict[str, float]] | None = None


def _load_market_reliability() -> dict[str, dict[str, float]]:
    """{sport: {market: shrunkHitRate}} for sample-confident markets only.
    Cached; returns {} on any error so generation never depends on it."""
    global _reliability_cache
    if _reliability_cache is not None:
        return _reliability_cache
    out: dict[str, dict[str, float]] = {}
    try:
        raw = json.loads(_RELIABILITY_PATH.read_text())
        for sport in ("mlb", "nba"):
            block = raw.get(sport) or {}
            out[sport] = {
                mkt: float(v["shrunkHitRate"])
                for mkt, v in block.items()
                if isinstance(v, dict) and v.get("enoughSample") and "shrunkHitRate" in v
            }
    except Exception:
        out = {}
    _reliability_cache = out
    return out


def _market_reliability_delta(leg: OptimizerLean) -> float:
    """Bounded (shrunkHitRate − 0.5) for the leg's sport+market, or 0."""
    rel = _load_market_reliability()
    sport = (leg.sport or "").lower()
    mkt = leg.market or ""
    hit = (rel.get(sport) or {}).get(mkt)
    if hit is None:
        return 0.0
    d = hit - 0.5
    return max(-_RELIABILITY_MAX_DELTA, min(_RELIABILITY_MAX_DELTA, d))


def _sgp_leg_quality(leg: OptimizerLean) -> float:
    """Compact quality score for SGP eligibility ranking. Higher is
    better. Pure: edge × confidence × recent10 fullness, plus a small
    bounded market-reliability tiebreaker from settled history."""
    conf_weight = (
        1.0 if leg.confidence == "High"
        else 0.7 if leg.confidence == "Medium"
        else 0.4 if leg.confidence == "Low"
        else 0.0
    )
    edge = max(0.0, leg.edgePct or 0.0)
    recent = min(10, leg.recent10Count or 0) / 10.0
    reliability = _RELIABILITY_WEIGHT * _market_reliability_delta(leg)
    return edge * conf_weight + 5.0 * recent + reliability


def generate_nba_sgp_slips(
    nba_leans: Iterable[OptimizerLean] | Iterable[dict[str, Any]],
    *,
    profile: str,
    date: str | None = None,
    max_legs: int | None = None,
    min_edge_pct: float | None = None,
    confidence_whitelist: tuple[str, ...] | None = None,
    num_candidates: int | None = None,
    require_star: bool | None = None,
) -> list[OptimizedSlip]:
    """Generate honest NBA-only single-game slips.

    Intended caller: ``snapshot_optimizer.build_optimizer_snapshot``
    when the standard NBA-only bucket comes back empty AND the NBA
    pool has exactly one unique game on the slate.

    All slips carry ``singleGame=True`` and ``sameGame=True`` so
    consumers can label them honestly.
    """
    if profile not in NBA_SGP_PROFILE_DEFAULTS:
        return []
    defaults = NBA_SGP_PROFILE_DEFAULTS[profile]
    eff_max_legs = max_legs if max_legs is not None else defaults["max_legs"]
    eff_min_edge = min_edge_pct if min_edge_pct is not None else defaults["min_edge_pct"]
    eff_conf = confidence_whitelist if confidence_whitelist is not None else defaults["confidence_whitelist"]
    eff_num = num_candidates if num_candidates is not None else defaults["num_candidates"]
    # Star Power borrows its `require_star=True` from the source profile
    # unless the caller overrides; this keeps "Spotlight" honest about
    # recognizable players even in the SGP variant.
    eff_require_star = (
        require_star
        if require_star is not None
        else (profile == "star_power")
    )

    # Accept either raw dicts (matching the snapshot caller) or
    # OptimizerLean instances (matching test fixtures). Normalise both
    # to OptimizerLean before any logic.
    normed: list[OptimizerLean] = []
    for item in nba_leans:
        normed.append(item if isinstance(item, OptimizerLean) else normalize_lean(item, sport="nba"))

    eligible: list[OptimizerLean] = []
    for l in normed:
        if l.sport != "nba":
            continue
        if l.side not in ("Over", "Under"):
            continue
        if l.confidence not in eff_conf:
            continue
        if (l.edgePct or 0.0) < eff_min_edge:
            continue
        # Match the existing DNP guard — every official path requires
        # at least 7 recent10 values to pass the gate.
        if l.recent10Count < 7:
            continue
        if (l.playerId or 0) <= 0:
            continue
        if l.isAnomaly:
            continue
        if eff_require_star and l.starTier == "none":
            continue
        eligible.append(l)

    if len(eligible) < 2:
        return []
    # All eligible legs must share one game — if the slate is
    # multi-game we should NOT be in this path at all.
    games_in_pool = {l.gameId for l in eligible if l.gameId}
    if len(games_in_pool) > 1:
        return []

    # Dedup per (player, market) so we don't combine the same prop
    # against itself across books — pick the highest-quality leg.
    best_per_key: dict[str, OptimizerLean] = {}
    for l in eligible:
        key = f"{_player_key(l)}|{l.market}"
        if key not in best_per_key or _sgp_leg_quality(l) > _sgp_leg_quality(best_per_key[key]):
            best_per_key[key] = l
    pool = sorted(best_per_key.values(), key=_sgp_leg_quality, reverse=True)
    if len(pool) < 2:
        return []

    candidates: list[OptimizedSlip] = []
    seen_sigs: set[tuple[Any, ...]] = set()
    # PR `fix/nba-sgp-diversity` (2026-05-28) — bumped the candidate
    # target from `eff_num*3` to `eff_num*12` AND split the budget so
    # 2-leg vs 3-leg phases each get their own quota. Two bugs the old
    # caps caused:
    #
    #   1. With a small target, the i=0 row in the leg pool produced
    #      every candidate (the leg-pool sort by `_sgp_leg_quality`
    #      put the dominator's three best legs at indices 0/1/2, so
    #      pairings with i=0 filled the budget before i=1 even
    #      started). The diversity selector then never saw a non-
    #      dominator candidate to pick from.
    #   2. Aggressive's 3-leg pass was guarded by
    #      `if eff_max_legs >= 3 and len(candidates) < target`, so it
    #      never ran once the 2-leg pass filled the target.
    #
    # Splitting the target gives 2-leg a generous quota AND guarantees
    # 3-leg gets its own room when the profile allows it. Practical
    # pool sizes (10-30 unique legs) keep this well under the order-of-
    # 1000 ceiling for either combinatoric loop, so memory/CPU stays
    # negligible.
    # When the pool is sorted by `_sgp_leg_quality`, a single dominant
    # player's three market legs cluster at indices 0/1/2 and produce
    # ~3 × (len(pool) − 1) candidates before any non-dominator pairing
    # appears. Live OKC@SAS slate has ~48 unique (player, market) legs
    # → ~141 dominator candidates before the first alt-alt pair. The
    # selector can't pick a non-dominator if no alt-alt candidate
    # exists in the candidate list at all, so the target is generous:
    # eff_num × 50, floor 200. Memory/CPU cost is negligible —
    # candidates are tiny dataclasses, and the live slate's 2-leg
    # combo space caps at ~1100.
    target_total = max(eff_num * 50, 200)
    two_leg_target = (
        target_total // 2 if eff_max_legs >= 3 else target_total
    )

    # Generate 2-leg combos first; if profile allows 3, then 3-leg too.
    for i in range(len(pool)):
        for j in range(i + 1, len(pool)):
            if len(candidates) >= two_leg_target:
                break
            leg_i, leg_j = pool[i], pool[j]
            if _player_key(leg_i) == _player_key(leg_j):
                continue
            picked = [leg_i, leg_j]
            slip = _make_sgp_slip(picked, profile, date)
            if slip and slip.score not in (None, float("-inf")):
                sig = _sgp_signature(picked)
                if sig in seen_sigs:
                    continue
                seen_sigs.add(sig)
                candidates.append(slip)
        if len(candidates) >= two_leg_target:
            break

    if eff_max_legs >= 3:
        for i in range(len(pool)):
            for j in range(i + 1, len(pool)):
                for k in range(j + 1, len(pool)):
                    if len(candidates) >= target_total:
                        break
                    legs = [pool[i], pool[j], pool[k]]
                    keys = [_player_key(l) for l in legs]
                    if len(set(keys)) != 3:
                        continue
                    slip = _make_sgp_slip(legs, profile, date)
                    if slip:
                        sig = _sgp_signature(legs)
                        if sig in seen_sigs:
                            continue
                        seen_sigs.add(sig)
                        candidates.append(slip)
                if len(candidates) >= target_total:
                    break
            if len(candidates) >= target_total:
                break

    candidates.sort(key=lambda s: s.score, reverse=True)
    return _select_diverse_sgp(candidates, eff_num)


# PR `fix/nba-sgp-diversity` (2026-05-28) — diversity-aware selector.
# Penalties below are linear in player exposure so over-used players
# eventually drop out of contention when ANY alternative beats their
# penalised score, but stay in the running when alternatives are
# genuinely weaker (so we never select a worse leg just to spread
# names). Numbers were chosen empirically against the live OKC@SAS
# slate where Keldon Johnson's +24.5pp REB edge dominates: a 1-prior-
# exposure penalty of 0.20 means a 0.245-base Keldon combo drops to
# 0.045 while a clean 0.22 partner pair holds its score — and a
# 2-prior penalty of 0.40 puts Keldon out of reach unless the next-
# best alt is below 0. The pair penalty is heavier because re-picking
# the exact same player pair adds zero new information; the market
# bonus is small because market choice is constrained (PTS/REB/AST)
# and we don't want it to outweigh edge quality.
#: Per-prior-exposure penalty on the heaviest-used player in the slip.
_SGP_PLAYER_EXPOSURE_PENALTY: float = 0.20
#: Flat penalty when an exact player pair was already selected.
_SGP_DUPLICATE_PAIR_PENALTY: float = 0.30
#: Bonus per "fresh" market (not yet used by any chosen slip).
_SGP_FRESH_MARKET_BONUS: float = 0.05
#: Escalating penalty for MARKET concentration — mirrors the player-exposure
#: penalty so deeper buckets (target raised 4→6) don't all cluster on the single
#: highest-scored market. PR `feature/generation-curation-public-risk-depth`
#: (2026-06-05). Diversity tiebreaker among already-eligible slips only; it never
#: ships an ineligible slip (the least-negative fallback below still wins).
_SGP_MARKET_EXPOSURE_PENALTY: float = 0.08

#: HARD cross-board exposure caps (applied across all risk sections of a sport,
#: via shared counters). Keeps one player / one exact leg from anchoring most of
#: the published board — the operator's "don't let one player ruin the slate"
#: ask. A leg/player may still repeat (value carries over), just not dominate.
#: With ~13-15 displayed cards these map to roughly 25-30% / 20% max share.
_PUBLIC_MAX_PLAYER_EXPOSURE: int = 4
_PUBLIC_MAX_LEG_EXPOSURE: int = 3


def _select_diverse_sgp(
    candidates: list[OptimizedSlip],
    target: int,
    *,
    player_count: dict[str, int] | None = None,
    pair_count: dict[tuple[str, ...], int] | None = None,
    market_count: dict[str, int] | None = None,
    leg_count: dict[tuple, int] | None = None,
    max_player_exposure: int | None = None,
    max_leg_exposure: int | None = None,
) -> list[OptimizedSlip]:
    """Greedy diversity selector for NBA single-game slips.

    Repeatedly re-ranks the remaining candidates by:
      base score
        − ``_SGP_PLAYER_EXPOSURE_PENALTY`` × max prior exposure across
          the slip's legs (linear so a 2x-used player loses twice the
          score)
        − ``_SGP_DUPLICATE_PAIR_PENALTY`` if this exact player pair
          (player set, ignoring order) was already picked
        + ``_SGP_FRESH_MARKET_BONUS`` × number of markets in this slip
          that haven't appeared in any picked slip yet

    Then picks the top remaining candidate, updates exposure counters,
    and repeats until ``target`` is reached or the candidate pool is
    empty.

    Honest fallback: when penalised scores all go negative, the slip
    with the LEAST-negative adjusted score still wins — we never
    select a weaker leg purely for diversity, but we also never spin
    indefinitely. Pre-existing eligibility (edge, confidence, recent10,
    no anomalies, no thin pids, no duplicate players in one slip) is
    enforced by the caller; this selector only re-orders the already-
    eligible candidates.
    """
    if not candidates or target <= 0:
        return []
    chosen: list[OptimizedSlip] = []
    # When the caller passes shared counters they persist ACROSS section calls so
    # exposure is spread over the whole published board (Low+Medium+High+Longshot
    # for a sport), not just within one section — prevents one player/leg from
    # backing most cards. Soft penalty with a least-negative fallback, so a
    # section is never starved (it always fills `target` if candidates exist).
    if player_count is None:
        player_count = {}
    if pair_count is None:
        pair_count = {}
    if market_count is None:
        market_count = {}
    if leg_count is None:
        leg_count = {}
    remaining = list(candidates)

    def _slip_player_keys(slip: OptimizedSlip) -> list[str]:
        return [_player_key(l) for l in slip.legs]

    def _slip_leg_sigs(slip: OptimizedSlip) -> list[tuple]:
        return [(l.playerId or 0, l.market, l.side, l.line or 0) for l in slip.legs]

    def _within_hard_caps(slip: OptimizedSlip) -> bool:
        """A hard cross-board cap so no one player or exact leg can back more
        than ``max_*`` published cards. Returns False if picking this slip would
        breach a cap (the caller then prefers a within-cap candidate)."""
        if max_player_exposure is not None:
            for k in _slip_player_keys(slip):
                if player_count.get(k, 0) + 1 > max_player_exposure:
                    return False
        if max_leg_exposure is not None:
            for sig in _slip_leg_sigs(slip):
                if leg_count.get(sig, 0) + 1 > max_leg_exposure:
                    return False
        return True

    def _adjusted_score(slip: OptimizedSlip) -> float:
        keys = _slip_player_keys(slip)
        max_exposure = max((player_count.get(k, 0) for k in keys), default=0)
        player_penalty = _SGP_PLAYER_EXPOSURE_PENALTY * max_exposure
        pair_key: tuple[str, ...] = tuple(sorted(keys))
        pair_penalty = (
            _SGP_DUPLICATE_PAIR_PENALTY if pair_count.get(pair_key, 0) > 0 else 0.0
        )
        slip_markets = {l.market for l in slip.legs}
        market_bonus = _SGP_FRESH_MARKET_BONUS * sum(
            1 for m in slip_markets if market_count.get(m, 0) == 0
        )
        # Escalating penalty for reusing an already-published market, scaled by
        # the most-used market on this slip — spreads the (now deeper) slots
        # across markets instead of repeating the top-scored one.
        market_penalty = _SGP_MARKET_EXPOSURE_PENALTY * max(
            (market_count.get(m, 0) for m in slip_markets), default=0
        )
        return (
            slip.score
            - player_penalty
            - pair_penalty
            - market_penalty
            + market_bonus
        )

    while remaining and len(chosen) < target:
        remaining.sort(key=_adjusted_score, reverse=True)
        # Prefer the highest adjusted-score candidate that stays within the hard
        # player/leg caps. Only when EVERY remaining candidate would breach a cap
        # (a genuinely thin pool) do we fall back to the best available — the
        # documented exception so a section is never starved.
        idx = next(
            (i for i, c in enumerate(remaining) if _within_hard_caps(c)),
            None,
        )
        winner = remaining.pop(idx if idx is not None else 0)
        chosen.append(winner)
        for k in _slip_player_keys(winner):
            player_count[k] = player_count.get(k, 0) + 1
        pair_key = tuple(sorted(_slip_player_keys(winner)))
        pair_count[pair_key] = pair_count.get(pair_key, 0) + 1
        for leg in winner.legs:
            market_count[leg.market] = market_count.get(leg.market, 0) + 1
        for sig in _slip_leg_sigs(winner):
            leg_count[sig] = leg_count.get(sig, 0) + 1

    return chosen


def _sgp_signature(legs: list[OptimizerLean]) -> tuple[Any, ...]:
    return tuple(sorted(
        (l.playerId or 0, l.market, l.side, l.line or 0)
        for l in legs
    ))


def _make_sgp_slip(
    legs: list[OptimizerLean],
    profile: str,
    date: str | None,
) -> OptimizedSlip | None:
    """Build an OptimizedSlip from the chosen legs and stamp single-game
    metadata. Score = sum(edge%/100) − market-overlap correlation
    penalty (deeper penalty when legs share a market vs. mixed-market
    builds). Returns None when the slip degenerates."""
    if len(legs) < 2:
        return None
    raw_score = sum((l.edgePct or 0.0) for l in legs) / 100.0
    # Correlation penalty: per-extra-leg + extra for market overlap
    # (e.g. two PTS legs from same game are MORE correlated than one
    # PTS + one REB).
    markets = [l.market for l in legs]
    overlap = len(markets) - len(set(markets))
    penalty = 0.08 * (len(legs) - 1) + 0.05 * overlap
    score = raw_score - penalty
    sid = _stable_slip_id((date or "") + "_sgp", profile, legs)
    return OptimizedSlip(
        slipId=sid,
        profile=profile,
        sport="nba",
        legs=legs,
        sameGame=True,
        hasAnomalyLeg=any(l.isAnomaly for l in legs),
        score=score,
        correlationPenalty=penalty,
        rationale=_nba_sgp_rationale(legs),
        singleGame=True,
    )


def _nba_sgp_rationale(legs: list[OptimizerLean]) -> str:
    """Human-readable rationale for a single-game NBA slip. Uses the
    same neutral framing as the standard rationale generator."""
    if not legs:
        return ""
    game_id = legs[0].gameId or "single game"
    teams = sorted({l.team for l in legs if l.team})
    matchup = " vs ".join(teams) if teams else game_id
    legs_summary = ", ".join(
        f"{l.playerName} {l.side} {l.line if l.line is not None else '—'} {l.market}"
        for l in legs
    )
    return (
        f"Single-game NBA build from {matchup}: {legs_summary}. "
        "All legs share one matchup — variance compounds, treated as "
        "higher-variance suggestion."
    )


def _stable_slip_id(date: str, profile: str, picked: list[OptimizerLean]) -> str:
    parts: list[str] = [date, profile]
    for l in picked:
        parts.append(str(l.playerId or l.playerName))
        parts.append(str(l.market))
        parts.append(str(l.side))
        parts.append(f"{(l.line or 0):.2f}")
    h = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"opt_{date}_{profile}_{h}"


# ---------------------------------------------------------------------------
# Public risk-section generator — PR `fix/public-risk-range-leg-counts`
# ---------------------------------------------------------------------------
# The internal optimizer profiles (Conservative / Balanced / Star Power /
# Aggressive) cap individual slips at 4 legs, so no profile produces the
# 5–6 leg combos required for the user's public Longshot section. This
# layer sits ABOVE the optimizer and builds 2-3 / 3-4 / 4-5 / 5-6 leg
# slips directly from the already-qualified legPool that
# `pipeline.snapshot_optimizer._build_leg_pool` emits (every leg in the
# pool has already passed the Aggressive eligibility gate — `is_eligible`
# enforces side, confidence, edge floor, DNP guard, anomalies, valid
# player id). The new layer:
#
#   * Generates section-specific candidates by combining legs with the
#     required leg-count target,
#   * Filters out any slip whose combined American odds fall outside
#     the section's odds window,
#   * Enforces no-duplicate-player-in-slip (matches every existing
#     official path),
#   * Caps same-game stacking at 2 legs per game by default to avoid
#     over-correlated single-game NBA Longshots (the user's "do not
#     generate obviously over-correlated 5-6 leg single-game NBA
#     Longshots unless explicitly opt-in" requirement),
#   * Applies the same diversity selector pattern as PR #150 so no
#     single player monopolises a section's visible slips,
#   * Returns slips bucketed by sport (all / nba / mlb / multi) for
#     the UI's per-sport tabs.

#: User-spec for the four public sections. The odds bounds are half-
#: open at the top (`max_am_exclusive`) so a slip at +600 never lands
#: in both Medium and High. The leg ranges are inclusive.
PUBLIC_RISK_SECTION_SPECS: dict[str, dict[str, Any]] = {
    "low": {
        "min_legs": 2,
        "max_legs": 3,
        "min_am_inclusive": float("-inf"),
        "max_am_exclusive": 300.0,
    },
    "medium": {
        "min_legs": 3,
        "max_legs": 4,
        "min_am_inclusive": 300.0,
        "max_am_exclusive": 600.0,
    },
    "high": {
        "min_legs": 4,
        "max_legs": 5,
        "min_am_inclusive": 600.0,
        "max_am_exclusive": 1000.0,
    },
    "longshot": {
        "min_legs": 5,
        "max_legs": 6,
        "min_am_inclusive": 1000.0,
        "max_am_exclusive": float("inf"),
    },
}

PUBLIC_RISK_SECTION_ORDER: tuple[str, ...] = ("low", "medium", "high", "longshot")

#: Default cap on same-game legs in a public-section slip. The internal
#: Balanced rule uses 2 — matching that here avoids dishonest single-
#: game stacking on a one-NBA-game slate (PR #110 audit found 1W-23L on
#: same-game NBA stacks 5/25).
_PUBLIC_SECTION_MAX_LEGS_PER_GAME: int = 2

#: Default ceiling on candidate generation per section. The diversity
#: selector picks `target_per_section` slips from this pool.
_PUBLIC_SECTION_CANDIDATE_CEILING: int = 1500

#: Default visible-slip target per section per sport bucket. Raised 4→6
#: (PR `feature/generation-curation-public-risk-depth`, 2026-06-05) so a
#: supply-rich slate can surface a deeper, more diverse published set
#: (e.g. ~10-15 MLB across sections after the display-layer diversity caps).
#: This is a CURATION depth knob, not a scoring/projection change: the
#: diversity selector still only re-orders already-eligible candidates and
#: returns ONLY real slips (no padding — a thin section yields fewer). NBA
#: stays supply-limited automatically (the selector returns what exists).
PUBLIC_RISK_SECTION_TARGET_PER_BUCKET: int = 6


def _combined_american_odds(legs: list[OptimizerLean]) -> float | None:
    """Compute combined American odds from a slip's legs. Returns None
    when any leg lacks a price (so the caller can drop the slip
    rather than render a fabricated payout)."""
    decimal = 1.0
    for leg in legs:
        o = leg.oddsForSide
        if o is None or not isinstance(o, (int, float)) or o == 0:
            return None
        decimal *= 1 + o / 100 if o > 0 else 1 + 100 / abs(o)
    if decimal >= 2:
        return float(round((decimal - 1) * 100))
    if decimal > 1:
        return float(-round(100 / (decimal - 1)))
    return 0.0


def _legs_compatible(legs: list[OptimizerLean]) -> bool:
    """Reject combos with duplicate players, duplicate (player, market),
    or any over-cap same-game stack."""
    players: set[str] = set()
    pid_market: set[tuple[str, str]] = set()
    games: dict[str, int] = {}
    for leg in legs:
        key = _player_key(leg)
        if key in players:
            return False
        players.add(key)
        pm = (key, leg.market or "")
        if pm in pid_market:
            return False
        pid_market.add(pm)
        gkey = leg.gameId or ""
        if gkey:
            games[gkey] = games.get(gkey, 0) + 1
            if games[gkey] > _PUBLIC_SECTION_MAX_LEGS_PER_GAME:
                return False
    return True


def _lean_from_payload(d: dict[str, Any]) -> OptimizerLean:
    """Reconstruct an OptimizerLean from a legPool payload dict
    (the shape `snapshot_optimizer` writes). The payload is already in
    canonical form — `oddsForSide` is the resolved per-side price, and
    `side` is the canonical "Over"/"Under" — so we skip the raw-board
    path that would silently drop the price."""
    raw_games = d.get("recentGames") or []
    cleaned_games: list[dict] = []
    if isinstance(raw_games, list):
        for g in raw_games:
            if not isinstance(g, dict):
                continue
            value = g.get("value")
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                continue
            cleaned_games.append({
                "date": g.get("date") if isinstance(g.get("date"), str) else None,
                "opponent": g.get("opponent") if isinstance(g.get("opponent"), str) else None,
                "isHome": g.get("isHome") if isinstance(g.get("isHome"), bool) else None,
                "value": float(value),
            })
    series = d.get("recentSeries") or []
    series_vals: list[float] = []
    if isinstance(series, list):
        for v in series:
            if isinstance(v, (int, float)) and not isinstance(v, bool) and v == v:
                series_vals.append(float(v))
    sport = (d.get("sport") or "nba").lower()
    market = d.get("market") or "?"
    market_key = f"{sport}:{market}"
    return OptimizerLean(
        sport=sport,
        leanId=str(d.get("leanId") or d.get("id") or _fallback_lean_id(d)),
        gameId=str(d.get("gameId")) if d.get("gameId") else None,
        playerId=d.get("playerId"),
        playerName=d.get("playerName") or "—",
        team=d.get("team"),
        opponent=d.get("opponent"),
        market=market,
        marketLabel=d.get("marketLabel"),
        side=d.get("side") or "Pass",
        line=d.get("line"),
        projection=d.get("projection"),
        edgePct=d.get("edgePct"),
        confidence=d.get("confidence"),
        bookmaker=d.get("bookmaker"),
        oddsForSide=d.get("oddsForSide"),
        recent10Count=int(d.get("recent10Count") or 0),
        recentSeries=tuple(last_n_recent_values(series_vals, 10)),
        recentGames=tuple(last_n_recent_values(cleaned_games, 10)),
        starTier=d.get("starTier") or _compute_star_tier(d.get("playerName"), sport),
        isAnomaly=bool(d.get("isAnomaly")),
        isVolatileMlb=bool(d.get("isVolatileMlb")) or (
            sport == "mlb" and market in MLB_VOLATILE_MARKETS
        ),
        calibrationFactor=1.0,
        marketWeight=MARKET_STABILITY_WEIGHT.get(market_key, 1.0),
        # Round-trip the game-time fields so the public-section selector
        # carries the same provenance the standard buckets do.
        commenceTime=d.get("commenceTime") if isinstance(d.get("commenceTime"), str) else None,
        gameTime=d.get("gameTime") if isinstance(d.get("gameTime"), str) else None,
    )


def _slip_sport(legs: list[OptimizerLean]) -> str:
    sports = {l.sport for l in legs if l.sport}
    if len(sports) == 0:
        return "nba"
    if len(sports) == 1:
        return next(iter(sports))
    return "multi"


#: Cap on the per-section DFS pool size. The combined legPool today is
#: ~250 legs; C(250,6) is astronomical. Capping to the top-K-by-quality
#: keeps DFS tractable while leaving plenty of headroom for the
#: diversity selector to pick visibly distinct slips.
_PUBLIC_SECTION_POOL_CAP: int = 50


def _build_section_slips_for_pool(
    pool: list[OptimizerLean],
    *,
    spec: dict[str, Any],
    section_key: str,
    date: str,
    candidate_ceiling: int,
) -> list[OptimizedSlip]:
    """Generate candidate slips for one (section, pool). Uses the
    `_sgp_leg_quality` ranking so the seeded order surfaces the
    highest-quality legs first; the diversity selector down-stream
    then prunes player monopolisation.

    Performance: this is a bounded DFS over the top-K legs by quality,
    with two pruning rules in decimal-odds space:

      1. **Upper-bound prune** — multiplying by any leg's decimal odds
         (always > 1) only grows the running product. So once the prefix
         product reaches or exceeds the section's upper decimal bound,
         no extension can land back inside the window; abort.
      2. **Lower-bound prune** — multiply the prefix by the largest
         `remaining` decimals in the pool. If that ceiling still falls
         short of the section's lower bound, no extension can reach it;
         abort.

    Together these keep generation under ~50ms per section on a
    250-leg pool — without them the recursion ran several minutes."""
    if len(pool) < spec["min_legs"]:
        return []

    # Dedup the pool per (player, market) so we never seed two of the
    # same prop into the same slip.
    best_per_key: dict[tuple[str, str], OptimizerLean] = {}
    for leg in pool:
        k = (_player_key(leg), leg.market or "")
        if (
            k not in best_per_key
            or _sgp_leg_quality(leg) > _sgp_leg_quality(best_per_key[k])
        ):
            best_per_key[k] = leg
    deduped_all = sorted(
        best_per_key.values(),
        key=_sgp_leg_quality,
        reverse=True,
    )
    # Cap to a manageable DFS pool. The downstream diversity selector
    # picks the visible slips; this only bounds search work.
    deduped = deduped_all[:_PUBLIC_SECTION_POOL_CAP]
    if len(deduped) < spec["min_legs"]:
        return []

    # Pre-compute decimal odds per leg. Drop legs with no usable price
    # — we never want to emit a slip we can't price.
    legs_with_dec: list[tuple[OptimizerLean, float]] = []
    for leg in deduped:
        o = leg.oddsForSide
        if o is None or not isinstance(o, (int, float)) or o == 0:
            continue
        d = 1.0 + o / 100.0 if o > 0 else 1.0 + 100.0 / abs(o)
        legs_with_dec.append((leg, d))
    if len(legs_with_dec) < spec["min_legs"]:
        return []

    leg_arr: list[OptimizerLean] = [x[0] for x in legs_with_dec]
    dec_arr: list[float] = [x[1] for x in legs_with_dec]
    n = len(leg_arr)
    # Largest decimals first — used for the lower-bound projection in
    # `_extend` (max achievable when adding `remaining` more legs).
    dec_sorted_desc = sorted(dec_arr, reverse=True)

    # Convert section's American bounds to decimal-space bounds for
    # fast prefix checks.
    def _am_to_decimal(am: float) -> float:
        if am == float("-inf"):
            return 0.0
        if am == float("inf"):
            return float("inf")
        if am >= 0:
            return 1.0 + am / 100.0
        return 1.0 + 100.0 / abs(am)

    min_dec_inclusive = _am_to_decimal(spec["min_am_inclusive"])
    max_dec_exclusive = _am_to_decimal(spec["max_am_exclusive"])

    candidates: list[OptimizedSlip] = []
    seen_sigs: set[tuple[Any, ...]] = set()

    target_size_min: int = spec["min_legs"]
    target_size_max: int = spec["max_legs"]

    def _emit(prefix: list[OptimizerLean], prefix_dec: float) -> None:
        # Final compatibility check (same-game / dup-player are
        # enforced incrementally; this catches anything residual).
        if not _legs_compatible(prefix):
            return
        if (
            prefix_dec < min_dec_inclusive
            or prefix_dec >= max_dec_exclusive
        ):
            return
        sig = tuple(sorted(
            (l.playerId or 0, l.market, l.side, l.line or 0)
            for l in prefix
        ))
        if sig in seen_sigs:
            return
        seen_sigs.add(sig)
        sport = _slip_sport(prefix)
        single_game = len({l.gameId for l in prefix if l.gameId}) == 1
        sid = _stable_slip_id(
            date + "_public_" + section_key, sport, prefix
        )
        penalty = 0.05 * (len(prefix) - 2)
        raw = sum((l.edgePct or 0.0) for l in prefix) / 100.0
        slip = OptimizedSlip(
            slipId=sid,
            profile=section_key,
            sport=sport,
            legs=list(prefix),
            sameGame=single_game and len(prefix) > 1,
            hasAnomalyLeg=any(l.isAnomaly for l in prefix),
            score=raw - penalty,
            correlationPenalty=penalty,
            rationale=_public_rationale(prefix, section_key),
            # NBA single-game flag: every leg shares one game AND the
            # slip is NBA-only. The UI uses this to render the
            # "Single-game · higher variance" chip.
            singleGame=(sport == "nba" and single_game and len(prefix) > 1),
        )
        candidates.append(slip)

    def _extend(
        prefix: list[OptimizerLean],
        prefix_dec: float,
        start_idx: int,
        size: int,
        stop_at: int,
    ) -> None:
        if len(candidates) >= candidate_ceiling or len(candidates) >= stop_at:
            return
        # Upper-bound prune: any extension only grows prefix_dec.
        if prefix_dec >= max_dec_exclusive and len(prefix) > 0:
            return
        remaining = size - len(prefix)
        if remaining == 0:
            _emit(prefix, prefix_dec)
            return
        # Lower-bound prune: best case is multiplying by the top
        # `remaining` decimals in the pool. If that still can't reach
        # the section's lower bound, no extension can rescue it.
        max_achievable = prefix_dec
        for d in dec_sorted_desc[:remaining]:
            max_achievable *= d
        if max_achievable < min_dec_inclusive:
            return
        for i in range(start_idx, n):
            if len(candidates) >= candidate_ceiling or len(candidates) >= stop_at:
                return
            cand = leg_arr[i]
            cand_d = dec_arr[i]
            # Dup-player short-circuit.
            ck = _player_key(cand)
            if any(_player_key(p) == ck for p in prefix):
                continue
            # Same-game cap.
            if cand.gameId:
                same_game = sum(
                    1 for p in prefix if p.gameId == cand.gameId
                )
                if same_game >= _PUBLIC_SECTION_MAX_LEGS_PER_GAME:
                    continue
            prefix.append(cand)
            _extend(prefix, prefix_dec * cand_d, i + 1, size, stop_at)
            prefix.pop()

    # Per-start cap: bound how many candidates any single STARTING leg may
    # contribute, so the ceiling isn't consumed by combos that all begin with
    # (and therefore contain) the few highest-quality legs. Because _extend only
    # adds legs of higher index, combos that start AFTER a dominant leg never
    # contain it — so spreading generation across starts guarantees the pool also
    # holds slips that exclude the top player. This is what lets the downstream
    # diversity selector + exposure caps avoid one player anchoring every card.
    per_start_cap = max(12, candidate_ceiling // max(1, min(n, 50)))
    for size in range(target_size_min, target_size_max + 1):
        # Try every starting leg so the search isn't monopolised by
        # the absolute-highest-quality leg (matches PR #150's
        # diversity goal).
        for start in range(n):
            if len(candidates) >= candidate_ceiling:
                break
            _extend(
                [leg_arr[start]],
                dec_arr[start],
                start + 1,
                size,
                len(candidates) + per_start_cap,
            )
        if len(candidates) >= candidate_ceiling:
            break

    return candidates


def _public_rationale(legs: list[OptimizerLean], section_key: str) -> str:
    n = len(legs)
    label = section_key.capitalize()
    if section_key == "longshot":
        label = "Longshot"
    games = {l.gameId for l in legs if l.gameId}
    same_game_note = " (single-game build)" if len(games) == 1 else ""
    return (
        f"Public {label} build · {n} legs · combined model edge "
        f"{sum((l.edgePct or 0.0) for l in legs):.1f}pp{same_game_note}."
    )


# --- Low-Risk per-leg eligibility (methodology guard, future-slate) ---------
# A leg may anchor a LOW-risk public card only with strong, TRUSTED, non-stale
# recent form AND a conservative price. This is a CURATION/classification guard
# — NOT a projection/scoring/grading change: it only restricts which legs feed
# the LOW section's candidate pool. Higher-variance legs still flow to Medium /
# High / Longshot unchanged. Fail-closed on missing/stale form. No padding: if
# few legs qualify, Low simply has fewer real cards.
# PR `fix/june5-risk-methodology-and-form` (2026-06-05).
_LOW_RISK_MIN_L10_HITRATE: float = 0.80      # >= 80% (8/10) last-10 for the chosen side
_LOW_RISK_STRICT_L10_HITRATE: float = 0.90   # >= 90% for the favorite/near-even bands
_LOW_RISK_ODDS_FLOOR: int = -150             # <= -150: heavy favorite, only needs >=80% L10
_LOW_RISK_NEAR_EVEN_FLOOR: int = -105        # -150..-105: negative favorites, need >=90% L10
#: Low Risk is negative-odds/favorites by design. Plus-money (> +100) is NEVER
#: Low. A near-even price (-104..+100) is allowed ONLY as a documented fallback:
#: PERFECT last-5 (5/5) recent form AND >=90% L10. This keeps Low conservative
#: and shareable (the operator wants stable favorites, not +100 swings) while
#: still admitting an even-money leg with flawless recent form.
_LOW_RISK_PLUS_MONEY_MAX: int = 100          # odds > +100 are never Low (reserve for High/Longshot)
_LOW_RISK_MAX_FORM_STALE_DAYS: int = 21      # latest recent game must be within N days of slate


def _l10_hit_rate(leg: OptimizerLean) -> float | None:
    """Strict last-10 hit rate for the leg's chosen side vs its line, from
    ``recentSeries``. Returns None (fail-closed) when the line is unknown, the
    side is not Over/Under, or fewer than 10 values exist. Pushes (value == line)
    are excluded from the denominator."""
    series = list(leg.recentSeries or ())
    line = leg.line
    side = (leg.side or "").lower()
    if line is None or len(series) < 10 or side not in ("over", "under"):
        return None
    window = series[-10:]
    decided = 0
    hits = 0
    for v in window:
        if v == line:
            continue  # push — excluded from denominator
        decided += 1
        if (v > line) if side == "over" else (v < line):
            hits += 1
    if decided == 0:
        return None
    return hits / decided


def _l5_hit_rate(leg: OptimizerLean) -> float | None:
    """Last-5 hit rate for the leg's chosen side vs its line, from
    ``recentSeries``. Returns None when the line is unknown, the side is not
    Over/Under, or fewer than 5 values exist. Pushes (value == line) are excluded
    from the denominator. Used for the Low-Risk near-even fallback (a near-even
    price is only Low-eligible with PERFECT recent form)."""
    series = list(leg.recentSeries or ())
    line = leg.line
    side = (leg.side or "").lower()
    if line is None or len(series) < 5 or side not in ("over", "under"):
        return None
    window = series[-5:]
    decided = 0
    hits = 0
    for v in window:
        if v == line:
            continue
        decided += 1
        if (v > line) if side == "over" else (v < line):
            hits += 1
    if decided == 0:
        return None
    return hits / decided


def _form_is_stale(leg: OptimizerLean, date: str | None) -> bool:
    """True when the leg's DATED recent-game provenance shows the most-recent
    game is too old relative to the slate (e.g., NBA regular-season logs
    surfaced during the playoffs — the season_type provider bug). When
    ``recentGames`` dated provenance is ABSENT (e.g. MLB legs carry only
    ``recentSeries`` values from a reliable daily source), staleness cannot be
    determined here; we return False and let the ``recentSeries`` >= 10 + L10
    checks in ``low_risk_leg_eligible`` govern trust instead. A malformed date
    is treated as stale (fail-closed)."""
    games = list(leg.recentGames or ())
    if not games:
        return False  # no dated provenance → defer to recentSeries checks
    if not date:
        return True
    try:
        latest = max(str(g.get("date") or "") for g in games)
        if not latest:
            return True
        d_latest = datetime.strptime(latest, "%Y-%m-%d")
        d_slate = datetime.strptime(date, "%Y-%m-%d")
    except (ValueError, TypeError):
        return True
    return (d_slate - d_latest).days > _LOW_RISK_MAX_FORM_STALE_DAYS


def low_risk_leg_eligible(leg: OptimizerLean, date: str | None) -> bool:
    """Whether a leg may appear in a LOW-risk public card. Requires a supported
    Over/Under prop with a known line, TRUSTED non-stale recent form, last-10 hit
    rate >= 80%, and a conservative NEGATIVE-ODDS price:
      - odds <= -150 (heavy favorite): >= 80% L10.
      - -150 < odds <= -105 (favorite): >= 90% L10.
      - -104 <= odds <= +100 (near-even): documented FALLBACK only — needs
        PERFECT 5/5 last-5 AND >= 90% L10.
      - odds > +100 (plus-money): NEVER Low (reserved for High/Longshot).
    Pure; restricts only the LOW pool."""
    side = (leg.side or "").lower()
    if side not in ("over", "under") or leg.line is None:
        return False
    if _form_is_stale(leg, date):
        return False
    hr = _l10_hit_rate(leg)
    if hr is None or hr < _LOW_RISK_MIN_L10_HITRATE:
        return False
    odds = leg.oddsForSide
    if odds is None:
        return False
    if odds > _LOW_RISK_PLUS_MONEY_MAX:
        return False  # plus-money is never Low — reserve for High/Longshot
    if odds <= _LOW_RISK_ODDS_FLOOR:
        return True  # heavy favorite (<= -150) + >= 80% L10
    if odds <= _LOW_RISK_NEAR_EVEN_FLOOR:
        return hr >= _LOW_RISK_STRICT_L10_HITRATE  # negative favorite needs strict L10
    # near-even (-104..+100): fallback only with PERFECT recent form + strict L10
    l5 = _l5_hit_rate(leg)
    return (
        l5 is not None
        and l5 >= 1.0 - 1e-9
        and hr >= _LOW_RISK_STRICT_L10_HITRATE
    )


def generate_public_risk_sections(
    leg_pool_raw: Iterable[dict[str, Any]] | Iterable[OptimizerLean],
    *,
    date: str,
    target_per_bucket: int = PUBLIC_RISK_SECTION_TARGET_PER_BUCKET,
    candidate_ceiling: int = _PUBLIC_SECTION_CANDIDATE_CEILING,
) -> dict[str, dict[str, list[OptimizedSlip]]]:
    """Build the public-section buckets from the already-qualified
    legPool. Returns a `{section: {sport: [OptimizedSlip]}}` mapping
    in canonical section order (low → medium → high → longshot).

    Each (section, sport) bucket caps at ``target_per_bucket`` visible
    slips and applies the PR #150 diversity selector pattern to spread
    player exposure. The slips are tagged with ``profile = section_key``
    + ``singleGame = True`` when NBA-only and all legs share one game.
    """
    # Normalize input. Three accepted shapes:
    #   1. ``OptimizerLean`` instances (tests pass these directly).
    #   2. Already-serialized legPool dicts (what `snapshot_optimizer`
    #      passes — these have `oddsForSide` already resolved per side).
    #   3. Raw board dicts (have `oddsOver`/`oddsUnder` per market side).
    # We detect shape (2) by the presence of `oddsForSide` and bypass
    # `normalize_lean` so we don't lose the price (the raw-path picks
    # odds from `oddsOver`/`oddsUnder`, which the legPool dict lacks).
    normed: list[OptimizerLean] = []
    for item in leg_pool_raw:
        if isinstance(item, OptimizerLean):
            normed.append(item)
        elif isinstance(item, dict) and "oddsForSide" in item:
            normed.append(_lean_from_payload(item))
        else:
            normed.append(normalize_lean(item))

    nba_pool = [l for l in normed if l.sport == "nba"]
    mlb_pool = [l for l in normed if l.sport == "mlb"]

    output: dict[str, dict[str, list[OptimizedSlip]]] = {}
    # Shared exposure counters PER SPORT BUCKET, persisting across the section
    # loop (low → medium → high → longshot) so a popular player/leg/market is
    # spread over the whole published board instead of anchoring every risk tier.
    # Soft penalty + least-negative fallback in _select_diverse_sgp means no
    # section is starved — it just prefers fresher names in the deeper tiers.
    shared: dict[str, dict[str, dict]] = {
        sport: {"player": {}, "pair": {}, "market": {}, "leg": {}}
        for sport in ("all", "nba", "mlb", "multi")
    }
    for section_key in PUBLIC_RISK_SECTION_ORDER:
        spec = PUBLIC_RISK_SECTION_SPECS[section_key]
        by_sport: dict[str, list[OptimizedSlip]] = {
            "all": [], "nba": [], "mlb": [], "multi": [],
        }

        # LOW risk uses a stricter leg pool (trusted recent form + >=80% L10 +
        # conservative price — see low_risk_leg_eligible). Medium/High/Longshot
        # keep the full pool so higher-variance legs remain available. No
        # padding: a thin eligible pool simply yields fewer Low cards.
        if section_key == "low":
            sec_all = [l for l in normed if low_risk_leg_eligible(l, date)]
            sec_nba = [l for l in nba_pool if low_risk_leg_eligible(l, date)]
            sec_mlb = [l for l in mlb_pool if low_risk_leg_eligible(l, date)]
        else:
            sec_all, sec_nba, sec_mlb = normed, nba_pool, mlb_pool

        # Combined pool → feeds the "all" tab and surfaces the natural
        # mix of sport-pure and cross-sport slips.
        combined_candidates = _build_section_slips_for_pool(
            sec_all,
            spec=spec,
            section_key=section_key,
            date=date,
            candidate_ceiling=candidate_ceiling,
        )
        combined_candidates.sort(key=lambda s: s.score, reverse=True)
        by_sport["all"] = _select_diverse_sgp(
            combined_candidates,
            target_per_bucket,
            player_count=shared["all"]["player"],
            pair_count=shared["all"]["pair"],
            market_count=shared["all"]["market"],
            leg_count=shared["all"]["leg"],
            max_player_exposure=_PUBLIC_MAX_PLAYER_EXPOSURE,
            max_leg_exposure=_PUBLIC_MAX_LEG_EXPOSURE,
        )
        # "multi" — only cross-sport slips that survived combined gen.
        multi_subset = [c for c in combined_candidates if c.sport == "multi"]
        by_sport["multi"] = _select_diverse_sgp(
            multi_subset,
            target_per_bucket,
            player_count=shared["multi"]["player"],
            pair_count=shared["multi"]["pair"],
            market_count=shared["multi"]["market"],
            leg_count=shared["multi"]["leg"],
            max_player_exposure=_PUBLIC_MAX_PLAYER_EXPOSURE,
            max_leg_exposure=_PUBLIC_MAX_LEG_EXPOSURE,
        )

        # Sport-pure buckets are generated from sport-restricted pools so
        # the NBA / MLB tabs aren't starved by combined-pool diversity
        # preferring cross-sport candidates.
        if len(sec_nba) >= spec["min_legs"]:
            nba_cands = _build_section_slips_for_pool(
                sec_nba,
                spec=spec,
                section_key=section_key,
                date=date,
                candidate_ceiling=candidate_ceiling,
            )
            nba_cands.sort(key=lambda s: s.score, reverse=True)
            by_sport["nba"] = _select_diverse_sgp(
                nba_cands,
                target_per_bucket,
                player_count=shared["nba"]["player"],
                pair_count=shared["nba"]["pair"],
                market_count=shared["nba"]["market"],
                leg_count=shared["nba"]["leg"],
                max_player_exposure=_PUBLIC_MAX_PLAYER_EXPOSURE,
                max_leg_exposure=_PUBLIC_MAX_LEG_EXPOSURE,
            )
        if len(sec_mlb) >= spec["min_legs"]:
            mlb_cands = _build_section_slips_for_pool(
                sec_mlb,
                spec=spec,
                section_key=section_key,
                date=date,
                candidate_ceiling=candidate_ceiling,
            )
            mlb_cands.sort(key=lambda s: s.score, reverse=True)
            by_sport["mlb"] = _select_diverse_sgp(
                mlb_cands,
                target_per_bucket,
                player_count=shared["mlb"]["player"],
                pair_count=shared["mlb"]["pair"],
                market_count=shared["mlb"]["market"],
                leg_count=shared["mlb"]["leg"],
                max_player_exposure=_PUBLIC_MAX_PLAYER_EXPOSURE,
                max_leg_exposure=_PUBLIC_MAX_LEG_EXPOSURE,
            )

        output[section_key] = by_sport

    return output
