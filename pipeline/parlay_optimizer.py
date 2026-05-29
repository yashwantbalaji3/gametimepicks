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
from dataclasses import dataclass, field, asdict
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
        recent_games_tuple = tuple(cleaned[:10])
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
        recentSeries=tuple(recent_values[:10]),
        recentGames=recent_games_tuple,
        starTier=_compute_star_tier(raw.get("playerName"), s),
        isAnomaly="suspicious_edge" in (raw.get("riskFlags") or []),
        isVolatileMlb=(s == "mlb" and market in MLB_VOLATILE_MARKETS),
        calibrationFactor=float(raw.get("calibrationFactor", 1.0)),
        marketWeight=MARKET_STABILITY_WEIGHT.get(market_key, 1.0),
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


def _sgp_leg_quality(leg: OptimizerLean) -> float:
    """Compact quality score for SGP eligibility ranking. Higher is
    better. Pure: edge × confidence × recent10 fullness."""
    conf_weight = (
        1.0 if leg.confidence == "High"
        else 0.7 if leg.confidence == "Medium"
        else 0.4 if leg.confidence == "Low"
        else 0.0
    )
    edge = max(0.0, leg.edgePct or 0.0)
    recent = min(10, leg.recent10Count or 0) / 10.0
    return edge * conf_weight + 5.0 * recent


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
    target = max(eff_num * 3, eff_num + 4)

    # Generate 2-leg combos first; if profile allows 3, then 3-leg too.
    for i in range(len(pool)):
        for j in range(i + 1, len(pool)):
            if len(candidates) >= target:
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
        if len(candidates) >= target:
            break

    if eff_max_legs >= 3 and len(candidates) < target:
        for i in range(len(pool)):
            for j in range(i + 1, len(pool)):
                for k in range(j + 1, len(pool)):
                    if len(candidates) >= target:
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
                if len(candidates) >= target:
                    break
            if len(candidates) >= target:
                break

    candidates.sort(key=lambda s: s.score, reverse=True)
    return candidates[:eff_num]


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
