"""Star / featured-player registry — drives the parlay optimizer's
ranking bonus and the UI's ⭐ Featured badge.

This module is NOT a confidence model. It's a transparent product
preference: when two legs project similarly, the optimizer should
prefer the recognizable starter over the bench/role player. Bench
players with thin sample sizes can land high model edges purely
because the bookmaker hasn't priced them sharply — that's not a
real edge.

How it's used (locked by tests):
  * `is_star(name, sport)` — normalized membership check.
  * `star_tier(name, sport)` — "superstar" / "core" / "regular".
  * `star_boost(name, sport, profile)` — float added to leg_score.
    Larger boost for Conservative / Balanced; smaller for Aggressive
    so high variance can still surface a value player when the
    model genuinely loves the matchup.

What this does NOT do:
  * Fabricate a player. A name on the list that isn't on the board
    never gets injected.
  * Override eligibility gates (confidence tier / edge floor /
    anomaly flags still apply).
  * Make a clearly bad projection look good. A non-star at +10pp
    edge still outscores a star at +3pp edge (the boost is bounded).

Maintenance:
  Add / remove names by edit (auditable git diff). Keep the list
  tight. Names normalized via `_normalize` so "Schroder" matches
  "Schröder" and suffixes don't matter.
"""
from __future__ import annotations

import unicodedata


def _normalize(name: str) -> str:
    """Strip accents, lowercase, collapse to alnum. Same shape as
    `mlb_top_players._normalize` so cross-sport behavior is identical."""
    out = unicodedata.normalize("NFKD", name or "")
    out = "".join(c for c in out if not unicodedata.combining(c))
    return "".join(ch for ch in out.lower() if ch.isalnum())


# ---------------------------------------------------------------------------
# NBA star registry — playoff-relevant 2025-26 names. Curated tight:
# household-name starters + clear role stars (Schroder etc. are
# excluded here even though their edge looks attractive — they're the
# value-player problem this whole module exists to fix).
#
# Superstar tier: All-NBA / All-Star tier names. Get the biggest boost.
# Core tier:      reliable starters. Standard boost.
# Regular tier:   recognizable rotation. Smaller boost.
# ---------------------------------------------------------------------------

_NBA_SUPERSTAR_RAW: list[str] = [
    "Donovan Mitchell",
    "Jalen Brunson",
    "Karl-Anthony Towns",
    "Evan Mobley",
    "Darius Garland",
    # West conference finals starters
    "Shai Gilgeous-Alexander",
    "Chet Holmgren",
    "Jalen Williams",
    "Victor Wembanyama",
    "Devin Vassell",
    # Cross-conference stars that may appear in late playoff rounds
    "Luka Doncic",
    "Anthony Edwards",
    "Nikola Jokic",
    "LeBron James",
    "Stephen Curry",
    "Jayson Tatum",
    "Jaylen Brown",
    "Giannis Antetokounmpo",
]

_NBA_CORE_RAW: list[str] = [
    # NYK
    "OG Anunoby",
    "Mikal Bridges",
    "Josh Hart",
    "Jarrett Allen",
    # CLE
    "James Harden",
    "Max Strus",
    "De'Andre Hunter",
    "Sam Merrill",
    # OKC
    "Luguentz Dort",
    "Isaiah Hartenstein",
    "Aaron Wiggins",
    "Cason Wallace",
    # SAS
    "Stephon Castle",
    "Devin Vassell",
    "Keldon Johnson",
    "Harrison Barnes",
]

_NBA_REGULAR_RAW: list[str] = [
    # Useful rotation pieces — small boost only.
    "Mitchell Robinson",
    "Miles McBride",
    "Donte DiVincenzo",
    "Landry Shamet",
    "Dennis Schroder",  # high-volume rotation guard
    "Sam Hauser",
    "Tyrese Maxey",
]

_MLB_SUPERSTAR_RAW: list[str] = [
    # The very biggest names; bigger boost than the existing list.
    "Aaron Judge",
    "Juan Soto",
    "Mookie Betts",
    "Shohei Ohtani",
    "Bryce Harper",
    "Vladimir Guerrero Jr.",
    "Yordan Alvarez",
    "Mike Trout",
    "Ronald Acuna Jr.",
    "Freddie Freeman",
    "Manny Machado",
    "Fernando Tatis Jr.",
    "Corey Seager",
    "Jose Ramirez",
    "Bobby Witt Jr.",
    "Elly De La Cruz",
    "Julio Rodriguez",
    "Kyle Tucker",
    "Francisco Lindor",
    "Jose Altuve",
    "Pete Alonso",
    "Trea Turner",
    "Corbin Carroll",
]


# Normalized sets for fast lookup.
_NBA_SUPERSTAR = frozenset(_normalize(n) for n in _NBA_SUPERSTAR_RAW)
_NBA_CORE = frozenset(_normalize(n) for n in _NBA_CORE_RAW)
_NBA_REGULAR = frozenset(_normalize(n) for n in _NBA_REGULAR_RAW)
_MLB_SUPERSTAR = frozenset(_normalize(n) for n in _MLB_SUPERSTAR_RAW)


# ---------------------------------------------------------------------------
# Star detection
# ---------------------------------------------------------------------------

# Tier ordering — higher value = bigger boost.
STAR_TIER_NONE = "none"
STAR_TIER_REGULAR = "regular"
STAR_TIER_CORE = "core"
STAR_TIER_SUPERSTAR = "superstar"


def star_tier(name: str | None, sport: str | None) -> str:
    """Return the player's star tier for the given sport.

    Returns `"none"` for unrecognized players. Pure function.
    """
    if not name:
        return STAR_TIER_NONE
    norm = _normalize(name)
    s = (sport or "").lower()
    if s == "nba":
        if norm in _NBA_SUPERSTAR:
            return STAR_TIER_SUPERSTAR
        if norm in _NBA_CORE:
            return STAR_TIER_CORE
        if norm in _NBA_REGULAR:
            return STAR_TIER_REGULAR
        return STAR_TIER_NONE
    if s == "mlb":
        if norm in _MLB_SUPERSTAR:
            return STAR_TIER_SUPERSTAR
        # Anyone else on the existing recognizable-hitters whitelist
        # counts as Core for boost purposes.
        try:
            from .mlb_top_players import is_top_player
            if is_top_player(name):
                return STAR_TIER_CORE
        except Exception:
            pass
        return STAR_TIER_NONE
    return STAR_TIER_NONE


def is_star(name: str | None, sport: str | None) -> bool:
    """True iff the player has any star tier other than `none`."""
    return star_tier(name, sport) != STAR_TIER_NONE


# ---------------------------------------------------------------------------
# Star boost by (tier, risk profile).
#
# Conservative gets the biggest boost — we want star exposure even at
# slight edge cost. Aggressive gets a small boost so the high-variance
# lane can still surface a value player when the model genuinely loves
# the matchup.
#
# Scale reference: leg_score base lives roughly in [0.5, 1.5]. A boost
# of 0.30 will reliably promote a tier-1 star over a non-star at the
# same edge, but a non-star at +10pp edge over a star at +3pp will
# still win (the 7pp gap is worth ~0.105 in the edge-weight term).
# ---------------------------------------------------------------------------

_BOOST_TABLE: dict[tuple[str, str], float] = {
    # (tier, profile) → boost
    #
    # Tuned so:
    #   * a star at edge E beats a non-star at edge E (clear preference).
    #   * a non-star at +10pp more edge than a star still wins (the
    #     boost is bounded, not a guarantee — see star_players_test.py).
    # The edge_weight contribution per pp is ~0.015 in `leg_score`, so
    # a 10pp gap is worth ~0.15. Conservative's 0.20 superstar boost
    # sits just below that gap.
    ("superstar", "conservative"): 0.20,
    ("core",      "conservative"): 0.12,
    ("regular",   "conservative"): 0.05,

    ("superstar", "balanced"):     0.15,
    ("core",      "balanced"):     0.09,
    ("regular",   "balanced"):     0.04,

    ("superstar", "aggressive"):   0.08,
    ("core",      "aggressive"):   0.05,
    ("regular",   "aggressive"):   0.02,
}


def star_boost(name: str | None, sport: str | None, profile: str) -> float:
    """Return the additive star bonus for `leg_score`. Bounded and
    profile-aware so the boost never overpowers a clearly bad lean.

    Returns 0 for unrecognized players (no penalty).
    """
    tier = star_tier(name, sport)
    if tier == STAR_TIER_NONE:
        return 0.0
    return _BOOST_TABLE.get((tier, profile), 0.0)
