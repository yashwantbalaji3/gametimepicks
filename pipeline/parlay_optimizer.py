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
    mlb_allowed_markets=("batter_hits",),
    mlb_max_volatile_legs=0,
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
    # Audit 2026-05-25: pitcher_strikeouts is the worst MLB cohort
    # (43.6% on 94 decisive). Pulled out of Balanced — Aggressive
    # still allows it.
    mlb_allowed_markets=(
        "batter_hits",
        "batter_total_bases",
    ),
    mlb_max_volatile_legs=1,
    correlation_penalty_per_extra=0.08,
)

AGGRESSIVE_RULES = ProfileRules(
    profile="aggressive",
    confidence=("High", "Medium", "Low"),
    min_edge_pct=1.0,
    min_legs=4,
    max_legs=5,
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
)

PROFILE_RULES_BY_NAME: dict[str, ProfileRules] = {
    "conservative": CONSERVATIVE_RULES,
    "balanced": BALANCED_RULES,
    "aggressive": AGGRESSIVE_RULES,
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
    isAnomaly: bool = False
    isVolatileMlb: bool = False
    # Optional pre-computed calibration multiplier (1.0 = neutral).
    calibrationFactor: float = 1.0
    # Per-(sport, market) weight from the audit, defaults to 1.0.
    marketWeight: float = 1.0


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


def leg_score(lean: OptimizerLean, rules: ProfileRules) -> float:
    """Higher = better fit for the profile.

    Components:
      - confidence_weight × tier weight × per-(sport, tier) adjust
      - edge_weight × (clipped edge / 20)
      - recent10_bonus when recent10 has ≥5 numeric values
      - pid_bonus when playerId is real
      - market stability (1.0 = neutral)
      - calibration factor (1.0 = neutral)
    """
    cw = _CONFIDENCE_WEIGHT.get(lean.confidence or "", 0.10)
    tier_adjust = _TIER_ADJUST.get((lean.sport, lean.confidence or ""), 1.0)
    cw *= tier_adjust
    edge = max(0.0, min(20.0, float(lean.edgePct or 0)))
    base = (
        rules.confidence_weight * cw
        + rules.edge_weight * (edge / 20.0)
    )
    if lean.recent10Count >= 5:
        base += rules.recent10_bonus
    if (lean.playerId or 0) > 0:
        base += rules.pid_bonus
    base *= lean.marketWeight
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
    if rules.require_valid_player_id and (lean.playerId or 0) <= 0:
        return False
    if rules.exclude_anomalies and lean.isAnomaly:
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
    """
    picked: list[OptimizerLean] = []
    used_players: set[str] = set()
    games_used: dict[str, int] = {}
    teams_used: dict[str, int] = {}
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
    for lean in order:
        if len(picked) >= rules.max_legs:
            break
        pkey = _player_key(lean)
        if pkey in used_players:
            continue
        if lean.isAnomaly and anomaly_count >= rules.max_anomaly_legs:
            continue
        gkey = str(lean.gameId or "")
        if gkey:
            if games_used.get(gkey, 0) >= rules.max_legs_per_game:
                continue
        tkey = (lean.team or "").upper()
        if tkey:
            if teams_used.get(tkey, 0) >= rules.max_legs_per_team:
                continue
        if lean.isVolatileMlb:
            if volatile_count >= rules.mlb_max_volatile_legs:
                continue
            volatile_count += 1
        picked.append(lean)
        used_players.add(pkey)
        if gkey:
            games_used[gkey] = games_used.get(gkey, 0) + 1
        if tkey:
            teams_used[tkey] = teams_used.get(tkey, 0) + 1
        if lean.isAnomaly:
            anomaly_count += 1
    if len(picked) < rules.min_legs:
        return None
    return picked


def _correlation_penalty(legs: list[OptimizerLean], rules: ProfileRules) -> float:
    """Quantifies how much same-game / same-team / volatile exposure a
    slip carries. Subtracted from the raw score.
    """
    if not legs:
        return 0.0
    game_counts: dict[str, int] = {}
    team_counts: dict[str, int] = {}
    volatile = 0
    for lean in legs:
        if lean.gameId:
            game_counts[lean.gameId] = game_counts.get(lean.gameId, 0) + 1
        if lean.team:
            team_counts[lean.team] = team_counts.get(lean.team, 0) + 1
        if lean.isVolatileMlb:
            volatile += 1
    penalty = 0.0
    for count in game_counts.values():
        if count > 1:
            penalty += (count - 1) * rules.correlation_penalty_per_extra
    for count in team_counts.values():
        if count > 1:
            penalty += (count - 1) * (rules.correlation_penalty_per_extra * 0.5)
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

    seen_sigs: set[tuple[Any, ...]] = set()
    out: list[OptimizedSlip] = []
    for start in range(min(len(pool), num_candidates * 3)):
        if len(out) >= num_candidates:
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
        out.append(OptimizedSlip(
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
    # Sort by score desc to guarantee best-first.
    out.sort(key=lambda s: s.score, reverse=True)
    return out


def _stable_slip_id(date: str, profile: str, picked: list[OptimizerLean]) -> str:
    parts: list[str] = [date, profile]
    for l in picked:
        parts.append(str(l.playerId or l.playerName))
        parts.append(str(l.market))
        parts.append(str(l.side))
        parts.append(f"{(l.line or 0):.2f}")
    h = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"opt_{date}_{profile}_{h}"
