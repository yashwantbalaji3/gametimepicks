"""Alias-aware team-name normalization (FIFA vs Odds-API vs API-Football naming)."""
from __future__ import annotations

ALIASES = {
    "czechrepublic": "czechia", "korearepublic": "southkorea",
    "bosniaherzegovina": "bosniaandherzegovina", "unitedstates": "usa", "us": "usa",
    "ivorycoast": "cotedivoire", "iranislamicrepublic": "iran",
}


def norm(name: str | None) -> str:
    base = "".join(c for c in (name or "").lower() if c.isalpha())
    return ALIASES.get(base, base)


def pair_key(a: str | None, b: str | None) -> str:
    return "|".join(sorted([norm(a), norm(b)]))
