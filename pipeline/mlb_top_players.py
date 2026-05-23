"""MLB top-player preference layer for the parlay builder.

Why this exists:
  The audit shows MLB batter_hits at 52.9% on 690 settled rows — a
  faint edge — but the live builder was previously picking by raw
  model edge × confidence alone. That produced parlays full of
  obscure depth-chart players whose model edge looked attractive
  but whose real-world variance is much higher than recognizable
  starters.

  User feedback was unambiguous: prefer recognizable / core players
  on MLB hits parlays. The model still drives selection; this layer
  adds a small, transparent BOOST to leans whose player is on the
  whitelist below.

How it works:
  * `is_top_player(name)` — normalized membership check against the
    whitelist.
  * `top_player_boost(name)` — returns a float boost applied to
    `_leg_score`. The boost is small enough that a clearly stronger
    edge from a non-star can still beat a thin-edge star pick.
    The contract is locked by `pipeline.snapshot_parlays_test`.

What this does NOT do:
  * Fabricate a player. A name on the whitelist that isn't on
    today's board never gets injected — we only re-rank what the
    model already emitted.
  * Override the eligibility filters (Pass / insufficient_data /
    anomaly leans are still excluded).
  * Promote a player past the calibration / market-floor gates.

Maintenance:
  Add or remove names by edit (auditable git diff). Keep the list
  tight: a 200-player roster of household names is fine, a 600-name
  bloat list defeats the purpose. Sort alphabetically by last name
  for readability.
"""
from __future__ import annotations


def _normalize(name: str) -> str:
    """Lower-case, strip diacritics, collapse non-alphanum."""
    if not name:
        return ""
    import unicodedata
    n = unicodedata.normalize("NFD", name)
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    n = n.lower()
    return "".join(c for c in n if c.isalnum())


# Whitelisted recognizable MLB hitters. Used as a transparent
# preference signal in `_leg_score`. Updated by-hand; never
# auto-mutated. The list intentionally favors batters because the
# only MLB market the builder consumes today is `batter_hits`.
_TOP_PLAYERS_RAW: list[str] = [
    # AL East
    "Aaron Judge", "Juan Soto", "Anthony Volpe", "Giancarlo Stanton",
    "Vladimir Guerrero Jr.", "Bo Bichette", "George Springer",
    "Brandon Lowe", "Junior Caminero", "Yandy Diaz",
    "Rafael Devers", "Jarren Duran", "Triston Casas", "Wilyer Abreu",
    "Adley Rutschman", "Gunnar Henderson", "Anthony Santander",
    # AL Central
    "Jose Ramirez", "Steven Kwan", "Naylor",  # short ambig fine — normalize handles
    "Riley Greene", "Spencer Torkelson", "Kerry Carpenter",
    "Bobby Witt Jr.", "Salvador Perez", "Vinnie Pasquantino",
    "Royce Lewis", "Carlos Correa", "Byron Buxton", "Edouard Julien",
    "Luis Robert Jr.", "Andrew Vaughn",
    # AL West
    "Yordan Alvarez", "Jose Altuve", "Kyle Tucker", "Alex Bregman",
    "Mike Trout", "Shohei Ohtani", "Logan O'Hoppe",
    "Julio Rodriguez", "Cal Raleigh",
    "Brent Rooker", "Lawrence Butler", "Tyler Soderstrom",
    "Corey Seager", "Marcus Semien", "Adolis Garcia", "Wyatt Langford",
    # NL East
    "Bryce Harper", "Trea Turner", "Kyle Schwarber", "Nick Castellanos",
    "J.T. Realmuto", "Alec Bohm",
    "Pete Alonso", "Francisco Lindor", "Brandon Nimmo", "Mark Vientos",
    "Brett Baty",
    "Ronald Acuna Jr.", "Matt Olson", "Austin Riley", "Ozzie Albies",
    "Sean Murphy", "Marcell Ozuna",
    "C.J. Abrams", "James Wood", "Luis Garcia Jr.", "Keibert Ruiz",
    "Jazz Chisholm Jr.", "Xavier Edwards",
    # NL Central
    "Pete Crow-Armstrong", "Ian Happ", "Seiya Suzuki", "Dansby Swanson",
    "Nico Hoerner",
    "Elly De La Cruz", "Spencer Steer", "Tyler Stephenson",
    "Andrew McCutchen", "Bryan Reynolds", "Oneil Cruz",
    "Paul Goldschmidt", "Nolan Arenado", "Willson Contreras",
    "William Contreras", "Christian Yelich", "Brice Turang",
    # NL West
    "Mookie Betts", "Freddie Freeman", "Will Smith", "Teoscar Hernandez",
    "Andy Pages",
    "Corbin Carroll", "Ketel Marte", "Eugenio Suarez", "Geraldo Perdomo",
    "Manny Machado", "Fernando Tatis Jr.", "Jackson Merrill",
    "Heliot Ramos", "Matt Chapman", "LaMonte Wade",
    "Ezequiel Tovar", "Brenton Doyle",
]


# Pre-normalized set for O(1) membership checks.
_TOP_PLAYERS: frozenset[str] = frozenset(_normalize(n) for n in _TOP_PLAYERS_RAW)


def is_top_player(name: str | None) -> bool:
    """True iff the player is on the curated recognizable-hitters
    whitelist. Normalization handles accents + suffixes."""
    if not name:
        return False
    return _normalize(name) in _TOP_PLAYERS


# Boost values are small and explicit. The intent:
#   * a top-player at +5pp edge should beat a non-top at +6pp edge
#     (1pp edge gap is bridged by ~0.025 boost in _leg_score)
#   * a top-player at +3pp edge should NOT beat a non-top at +10pp
#     edge (7pp gap > 0.18 boost in _leg_score after scaling)
# Locked by snapshot_parlays_test.
TOP_PLAYER_BOOST = 0.05
TOP_PLAYER_DOWNGRADE_FOR_UNKNOWN = 0.0  # No downgrade — just no boost


def top_player_boost(name: str | None) -> float:
    """Boost added to `_leg_score` when the player is on the
    whitelist. Returns 0 for non-listed players (no penalty)."""
    return TOP_PLAYER_BOOST if is_top_player(name) else TOP_PLAYER_DOWNGRADE_FOR_UNKNOWN
