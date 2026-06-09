"""
Deterministic UFC fighter name matching. Conservative: exact first, then a
suffix-stripped/punctuation-normalized match ONLY when it resolves to a UNIQUE
fighter. Ambiguous matches are BLOCKED (never loose fuzzy mapping that could pick
the wrong fighter, e.g. Jon Jones != Jared Jones).
"""
from __future__ import annotations

import re
import unicodedata

_SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}


def normalize(name: str) -> str:
    """Lowercase, de-accent, normalize punctuation/spaces; KEEP suffix."""
    s = unicodedata.normalize("NFD", name or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().replace("'", "'").replace("`", "'")
    s = re.sub(r"[.’']", "", s)          # drop periods/apostrophes
    s = re.sub(r"[-]", " ", s)                 # hyphen → space
    return re.sub(r"\s+", " ", s).strip()


def match_key(name: str) -> str:
    """Normalized AND suffix-stripped key — for unique-match resolution only."""
    toks = [t for t in normalize(name).split(" ") if t and t not in _SUFFIXES]
    return " ".join(toks)


def build_index(items, name_of=lambda x: x):
    """Return a resolver index: {exact: {...}, bykey: {key: [items]}}."""
    exact, bykey = {}, {}
    for it in items:
        nm = name_of(it)
        exact[normalize(nm)] = it
        bykey.setdefault(match_key(nm), []).append(it)
    return {"exact": exact, "bykey": bykey}


def resolve(name: str, index: dict):
    """Return (item_or_None, match_type). match_type ∈ exact / suffix_stripped /
    normalized_unique / ambiguous / unmatched. Ambiguous → (None, 'ambiguous')."""
    n = normalize(name)
    if n in index["exact"]:
        return index["exact"][n], "exact"
    cands = index["bykey"].get(match_key(name), [])
    if len(cands) == 1:
        # distinguish a pure suffix difference from broader normalization
        return cands[0], ("suffix_stripped" if match_key(name) != n else "normalized_unique")
    if len(cands) > 1:
        return None, "ambiguous"
    return None, "unmatched"
