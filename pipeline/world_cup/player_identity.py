"""
Map sportsbook player names to API-Football squad players (pure matcher).

Token-set matching (accent-insensitive, order-independent → handles 'Heung-Min Son' vs
'Son Heung-Min'), with a last-name+first-initial fallback, constrained to the player's team.
Never invents a mapping: an unmatched player stays visible in the market list but is not projected.
"""
from __future__ import annotations

import unicodedata
from .player_aliases import PLAYER_ALIASES


def _toks(name: str | None) -> list[str]:
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    out, cur = [], []
    for c in s:
        if c.isalnum():
            cur.append(c)
        elif cur:
            out.append("".join(cur)); cur = []
    if cur:
        out.append("".join(cur))
    return [t for t in out if t]


def norm_join(name: str | None) -> str:
    return "".join(_toks(name))


def match_player(sb_name: str, squad: list[dict]) -> dict | None:
    """squad = [{id,name,photo,position}]. Returns the matched squad entry + matchConfidence,
    or None. `squad` is the team's squad only (team constraint applied by the caller)."""
    alias = PLAYER_ALIASES.get(norm_join(sb_name))
    target = alias or norm_join(sb_name)
    sb = set(_toks(alias) if alias else _toks(sb_name))
    if not sb:
        return None
    # 1) exact normalized join
    for s in squad:
        if norm_join(s["name"]) == target:
            return {**s, "matchConfidence": "exact", "matchReason": "exact normalized name"}
    # 2) token-set equality (order independent)
    for s in squad:
        if set(_toks(s["name"])) == sb:
            return {**s, "matchConfidence": "high", "matchReason": "token-set match"}
    # 3) subset (sportsbook gives more tokens, e.g. full name vs short)
    best = None
    for s in squad:
        st = set(_toks(s["name"]))
        if st and (st <= sb or sb <= st):
            overlap = len(st & sb)
            if best is None or overlap > best[1]:
                best = (s, overlap)
    if best and best[1] >= 2:
        return {**best[0], "matchConfidence": "medium", "matchReason": "token subset overlap"}
    # 4) last token + first initial
    for s in squad:
        st = _toks(s["name"])
        if st and _toks(sb_name) and st[-1] == _toks(sb_name)[-1] and st[0][:1] == _toks(sb_name)[0][:1]:
            return {**s, "matchConfidence": "low", "matchReason": "surname + first initial"}
    return None
