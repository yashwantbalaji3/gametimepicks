"""Build the IPL cricket board for a given date.

Single-sport, single-day pipeline. Cricket is projections-only today
— we never push cricket into the parlay optimizer / custom builder /
Results tracker. The board emitted here drives a small section on
`/projections` only.

Inputs (free, no paid APIs):
  1. ESPN cricket scoreboard (`site.api.espn.com/.../cricket/8048`)
     for schedule metadata — teams, venue, start time.
  2. The Odds API `cricket_ipl` sport key for h2h + totals odds, ONLY
     when `ODDS_API_KEY` is present. The cron has access; local runs
     fall back to an `oddsStatus: "pending"` board with the schedule
     populated and projections null.

Schema (locked by data-cricket.ts on the TS side):

  {
    "sport": "cricket",
    "league": "IPL",
    "date": "YYYY-MM-DD",
    "generatedAt": "<iso>",
    "scheduleSource": "site.api.espn.com (ESPN cricket scoreboard)",
    "oddsSource": "the-odds-api.com (cricket_ipl)" | null,
    "oddsStatus": "ok" | "pending" | "unavailable",
    "matches": [
      {
        "matchId": "<espn id>",
        "shortName": "RCB v GT",
        "longName": "Royal Challengers Bengaluru v Gujarat Titans",
        "startTimeUtc": "2026-05-26T14:00:00Z",
        "venue": "...",
        "home": { "name": "...", "abbr": "..." },
        "away": { "name": "...", "abbr": "..." },
        "stage": "Qualifier 1" | null,
        "markets": {
          "moneyline": null | {
            "books": [{ "book": "...", "home": <american>, "away": <american> }],
            "consensus": { "home": <american>, "away": <american>,
                           "homeImpliedProb": float, "awayImpliedProb": float,
                           "dispersion": float },
            "projection": "home" | "away",
            "edgePct": float,
            "confidence": "High" | "Medium" | "Low" | "insufficient"
          },
          "total": null | {
            "books": [{ "book": "...", "line": float,
                        "overOdds": <american>, "underOdds": <american> }],
            "consensus": { "line": float, "overOdds": <am>, "underOdds": <am>,
                           "overImpliedProb": float, "underImpliedProb": float,
                           "lineDispersion": float },
            "projection": <float total>,
            "edgePct": float,
            "confidence": "High" | "Medium" | "Low" | "insufficient"
          }
        }
      }
    ]
  }

We DO NOT model pitch/weather/toss/playing-XI. Projections here are
market-derived: consensus implied probability with vig removed.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any


ESPN_CRICKET_BASE = (
    "https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard"
)
ODDS_API_BASE = "https://api.the-odds-api.com/v4"
OUT_DIR = os.path.join("app", "public", "data", "cricket", "boards")


# ---------------------------------------------------------------------------
# ESPN cricket scoreboard
# ---------------------------------------------------------------------------

def fetch_espn_schedule(date_yyyy_mm_dd: str) -> list[dict[str, Any]]:
    """Return ESPN events for IPL league 8048 on a given date.

    Honest: returns [] if ESPN's free endpoint refuses or returns no
    matches. Never raises on transient network failure — caller can
    still write an empty board.
    """
    iso_date = date_yyyy_mm_dd.replace("-", "")
    url = f"{ESPN_CRICKET_BASE}?dates={iso_date}"
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            data = json.load(r)
    except Exception as ex:
        print(f"[fetch_ipl_board] ESPN error: {ex}", file=sys.stderr)
        return []
    out = []
    for e in data.get("events", []):
        comp = (e.get("competitions") or [{}])[0]
        competitors = comp.get("competitors", [])
        home = next((c for c in competitors if c.get("homeAway") == "home"), {})
        away = next((c for c in competitors if c.get("homeAway") == "away"), {})
        out.append({
            "matchId": str(e.get("id") or ""),
            "shortName": e.get("shortName"),
            "longName": e.get("name"),
            "startTimeUtc": e.get("date"),
            "venue": (comp.get("venue") or {}).get("fullName"),
            "stage": _extract_stage(e),
            "home": {
                "name": (home.get("team") or {}).get("displayName"),
                "abbr": (home.get("team") or {}).get("abbreviation"),
            },
            "away": {
                "name": (away.get("team") or {}).get("displayName"),
                "abbr": (away.get("team") or {}).get("abbreviation"),
            },
        })
    return out


def _extract_stage(event: dict[str, Any]) -> str | None:
    """ESPN sometimes puts stage in notes/headlines; pull a single
    short label if it looks like a playoff round."""
    for src in (event.get("notes") or []):
        h = (src.get("headline") or "").strip()
        if h:
            return h
    for src in ((event.get("competitions") or [{}])[0].get("headlines") or []):
        d = (src.get("description") or src.get("shortLinkText") or "").strip()
        if d:
            return d
    return None


# ---------------------------------------------------------------------------
# Odds API (cricket_ipl)
# ---------------------------------------------------------------------------

def fetch_cricket_odds(events: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Fetch h2h + totals odds for the given events from the-odds-api.

    Returns `{matchId: {h2h_books, totals_books}}` keyed by ESPN
    matchId. Match keying is by team-name fuzzy match against the
    odds-api event's `home_team`/`away_team` since ESPN and odds-api
    use independent IDs.

    Returns `{}` and writes a `[fetch_ipl_board] odds-pending` note
    when `ODDS_API_KEY` is not set or the call fails. We never raise.
    """
    api_key = os.environ.get("ODDS_API_KEY", "").strip()
    if not api_key:
        print("[fetch_ipl_board] ODDS_API_KEY not set — odds pending")
        return {}
    if not events:
        return {}
    sport_key = "cricket_ipl"
    # Single combined call — h2h + totals in one request.
    params = urllib.parse.urlencode({
        "apiKey": api_key,
        "regions": "uk,us,eu,au",
        "markets": "h2h,totals",
        "oddsFormat": "american",
    })
    url = f"{ODDS_API_BASE}/sports/{sport_key}/odds?{params}"
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            odds_events = json.load(r)
    except Exception as ex:
        print(f"[fetch_ipl_board] odds-api error: {ex}", file=sys.stderr)
        return {}
    # Diagnostic logging — helps debug team-name aliasing without
    # additional API calls. Never logs the API key or credentials.
    print(
        f"[fetch_ipl_board] odds-api returned {len(odds_events)} cricket_ipl events"
    )
    for o in odds_events[:5]:
        bm_count = len(o.get("bookmakers") or [])
        print(
            f"  · {o.get('away_team','?')} @ {o.get('home_team','?')}  "
            f"start={o.get('commence_time')}  books={bm_count}"
        )
    by_match: dict[str, dict[str, Any]] = {}
    for ev in events:
        match = _match_odds_event(ev, odds_events)
        if not match:
            espn_home = (ev.get("home") or {}).get("name")
            espn_away = (ev.get("away") or {}).get("name")
            print(
                f"[fetch_ipl_board] no odds-api match for ESPN event "
                f"{espn_away} @ {espn_home}  (normalized: "
                f"{_normalize_team(espn_away)} / {_normalize_team(espn_home)})"
            )
            continue
        by_match[ev["matchId"]] = _shape_match_odds(match, ev)
    return by_match


# IPL franchise rename aliases. The Bangalore→Bengaluru rename
# happened ahead of the 2024 season but some book/data feeds still
# emit the old name. Mapping is bidirectional: both alias and
# canonical normalize to the same key. New aliases added when we
# observe a real source using a different form.
_IPL_TEAM_ALIASES: dict[str, str] = {
    # franchise stem (normalized) → canonical key
    "royalchallengersbangalore": "royalchallengersbengaluru",
    "royalchallengersbengaluru": "royalchallengersbengaluru",
    # Other common short forms used by some books. Mapped to the
    # full canonical name above so substring matches catch them.
    "rcb": "royalchallengersbengaluru",
    "gt": "gujarattitans",
    "gujarattitans": "gujarattitans",
    "kolkataknightriders": "kolkataknightriders",
    "kkr": "kolkataknightriders",
    "chennaisuperkings": "chennaisuperkings",
    "csk": "chennaisuperkings",
    "mumbaiindians": "mumbaiindians",
    "mi": "mumbaiindians",
    "delhicapitals": "delhicapitals",
    "dc": "delhicapitals",
    "rajasthanroyals": "rajasthanroyals",
    "rr": "rajasthanroyals",
    "punjabkings": "punjabkings",
    "pbks": "punjabkings",
    "sunrisershyderabad": "sunrisershyderabad",
    "srh": "sunrisershyderabad",
    "lucknowsupergiants": "lucknowsupergiants",
    "lsg": "lucknowsupergiants",
}


def _normalize_team(name: str | None) -> str:
    out = (name or "").lower()
    normalized = "".join(ch for ch in out if ch.isalnum())
    # Resolve through the alias map so Bangalore→Bengaluru variants
    # all map to one canonical key for matching purposes.
    return _IPL_TEAM_ALIASES.get(normalized, normalized)


def _match_odds_event(
    espn_event: dict[str, Any], odds_events: list[dict[str, Any]]
) -> dict[str, Any] | None:
    home = _normalize_team((espn_event.get("home") or {}).get("name"))
    away = _normalize_team((espn_event.get("away") or {}).get("name"))
    if not home or not away:
        return None
    for o in odds_events:
        oh = _normalize_team(o.get("home_team"))
        oa = _normalize_team(o.get("away_team"))
        if not oh or not oa:
            continue
        # Fuzzy: substring either direction tolerates short/long forms
        # (e.g. "Royal Challengers Bengaluru" vs "Royal Challengers").
        if (home in oh or oh in home) and (away in oa or oa in away):
            return o
        if (home in oa or oa in home) and (away in oh or oh in away):
            # Sides swapped at the book; still valid, caller realigns.
            return o
    return None


def _shape_match_odds(
    odds_event: dict[str, Any], espn_event: dict[str, Any]
) -> dict[str, Any]:
    """Pull h2h + totals book rows. Aligns sides to the ESPN home/away."""
    home_name = _normalize_team((espn_event.get("home") or {}).get("name"))
    h2h_books: list[dict[str, Any]] = []
    totals_books: list[dict[str, Any]] = []
    for bm in odds_event.get("bookmakers", []):
        book_key = bm.get("key")
        for mk in bm.get("markets", []):
            mtype = mk.get("key")
            outcomes = mk.get("outcomes", [])
            if mtype == "h2h":
                home_odds = away_odds = None
                for o in outcomes:
                    side = _normalize_team(o.get("name"))
                    price = o.get("price")
                    if side and (side in home_name or home_name in side):
                        home_odds = price
                    else:
                        away_odds = price
                if home_odds is not None and away_odds is not None:
                    h2h_books.append({
                        "book": book_key,
                        "home": int(home_odds),
                        "away": int(away_odds),
                    })
            elif mtype == "totals":
                over = under = None
                line = None
                for o in outcomes:
                    if str(o.get("name", "")).lower() == "over":
                        over = o.get("price"); line = o.get("point")
                    elif str(o.get("name", "")).lower() == "under":
                        under = o.get("price"); line = o.get("point") if line is None else line
                if over is not None and under is not None and line is not None:
                    totals_books.append({
                        "book": book_key,
                        "line": float(line),
                        "overOdds": int(over),
                        "underOdds": int(under),
                    })
    return {"h2h_books": h2h_books, "totals_books": totals_books}


# ---------------------------------------------------------------------------
# Projection / consensus math (mirrored in app/src/lib/cricket-projection.ts;
# duplicated here so the pipeline output is self-contained and the UI doesn't
# need to recompute).
# ---------------------------------------------------------------------------

def american_to_decimal(odds: int | None) -> float | None:
    if odds is None:
        return None
    if odds >= 100:
        return 1.0 + odds / 100.0
    if odds <= -100:
        return 1.0 + 100.0 / abs(odds)
    return 2.0


def implied_prob(odds: int | None) -> float | None:
    d = american_to_decimal(odds)
    if d is None or d <= 0:
        return None
    return 1.0 / d


def remove_vig_two_way(p_a: float, p_b: float) -> tuple[float, float]:
    """Normalize two implied probabilities so they sum to 1.0."""
    s = p_a + p_b
    if s <= 0:
        return (0.5, 0.5)
    return (p_a / s, p_b / s)


def _mean(xs: list[float]) -> float:
    return sum(xs) / max(1, len(xs))


def _stddev(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    m = _mean(xs)
    return (sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) ** 0.5


def consensus_moneyline(books: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not books:
        return None
    home_probs, away_probs = [], []
    for b in books:
        hp = implied_prob(b.get("home"))
        ap = implied_prob(b.get("away"))
        if hp is None or ap is None:
            continue
        hp_n, ap_n = remove_vig_two_way(hp, ap)
        home_probs.append(hp_n)
        away_probs.append(ap_n)
    if not home_probs:
        return None
    home_p = _mean(home_probs)
    away_p = _mean(away_probs)
    dispersion = _stddev(home_probs)
    return {
        "home": int(books[0]["home"]),
        "away": int(books[0]["away"]),
        "homeImpliedProb": round(home_p, 4),
        "awayImpliedProb": round(away_p, 4),
        "dispersion": round(dispersion, 4),
    }


def consensus_total(books: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not books:
        return None
    lines = [float(b["line"]) for b in books if b.get("line") is not None]
    over_probs, under_probs = [], []
    for b in books:
        op = implied_prob(b.get("overOdds"))
        up = implied_prob(b.get("underOdds"))
        if op is None or up is None:
            continue
        op_n, up_n = remove_vig_two_way(op, up)
        over_probs.append(op_n)
        under_probs.append(up_n)
    if not lines or not over_probs:
        return None
    return {
        "line": round(_mean(lines), 1),
        "overOdds": int(books[0]["overOdds"]),
        "underOdds": int(books[0]["underOdds"]),
        "overImpliedProb": round(_mean(over_probs), 4),
        "underImpliedProb": round(_mean(under_probs), 4),
        "lineDispersion": round(_stddev(lines), 2),
    }


def confidence_from_dispersion(books_count: int, dispersion: float) -> str:
    """Lightweight confidence tag from book count + price/line spread.

    No injury/weather/toss/lineup signal. This is honest market-only
    confidence."""
    if books_count == 0:
        return "insufficient"
    if books_count >= 4 and dispersion < 0.035:
        return "High"
    if books_count >= 2 and dispersion < 0.06:
        return "Medium"
    return "Low"


def shape_moneyline_market(books: list[dict[str, Any]]) -> dict[str, Any] | None:
    cons = consensus_moneyline(books)
    if cons is None:
        return None
    conf = confidence_from_dispersion(len(books), float(cons["dispersion"]))
    proj_side = "home" if cons["homeImpliedProb"] >= cons["awayImpliedProb"] else "away"
    # Edge here is 0 by construction (market-derived). We surface it
    # explicitly so the UI doesn't have to assume.
    return {
        "books": books,
        "consensus": cons,
        "projection": proj_side,
        "edgePct": 0.0,
        "confidence": conf,
    }


def shape_total_market(books: list[dict[str, Any]]) -> dict[str, Any] | None:
    cons = consensus_total(books)
    if cons is None:
        return None
    # Market-based: projection equals consensus line. Edge 0; we don't
    # claim a sharper number than the books.
    conf = confidence_from_dispersion(len(books), float(cons["lineDispersion"]) / 10.0)
    return {
        "books": books,
        "consensus": cons,
        "projection": cons["line"],
        "edgePct": 0.0,
        "confidence": conf,
    }


# ---------------------------------------------------------------------------
# Top-level orchestrator
# ---------------------------------------------------------------------------

def build_board(date_yyyy_mm_dd: str) -> dict[str, Any]:
    events = fetch_espn_schedule(date_yyyy_mm_dd)
    odds_by_match = fetch_cricket_odds(events)
    odds_status: str
    if events and odds_by_match:
        odds_status = "ok"
    elif events and not os.environ.get("ODDS_API_KEY"):
        odds_status = "pending"
    elif events:
        odds_status = "unavailable"
    else:
        odds_status = "unavailable"

    matches = []
    for ev in events:
        match_odds = odds_by_match.get(ev["matchId"])
        markets: dict[str, Any] = {"moneyline": None, "total": None}
        if match_odds:
            markets["moneyline"] = shape_moneyline_market(match_odds.get("h2h_books") or [])
            markets["total"] = shape_total_market(match_odds.get("totals_books") or [])
        ev_out = {**ev, "markets": markets}
        matches.append(ev_out)

    payload = {
        "sport": "cricket",
        "league": "IPL",
        "date": date_yyyy_mm_dd,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "scheduleSource": "site.api.espn.com (ESPN cricket scoreboard, league 8048)",
        "oddsSource": "the-odds-api.com (cricket_ipl)" if odds_by_match else None,
        "oddsStatus": odds_status,
        "matches": matches,
        # Honest framing — UI quotes this directly.
        "preTossNote": (
            "Cricket projections are market-based pre-toss. Toss outcome and "
            "playing XI announcements (typically ~30 minutes before start) "
            "can materially change the read. We do not model toss, pitch, "
            "weather, or lineup."
        ),
    }
    return payload


def write_board(date_yyyy_mm_dd: str, payload: dict[str, Any]) -> str:
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{date_yyyy_mm_dd}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    return path


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--date", required=True, help="YYYY-MM-DD (UTC date of the IPL match)")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args(argv)

    payload = build_board(args.date)
    n_matches = len(payload["matches"])
    odds_status = payload["oddsStatus"]
    if args.dry_run:
        print(f"[fetch_ipl_board] {args.date} dry-run · {n_matches} matches · oddsStatus={odds_status}")
        print(json.dumps(payload, indent=2)[:2000])
        return 0
    path = write_board(args.date, payload)
    print(f"[fetch_ipl_board] {args.date} · {n_matches} matches · oddsStatus={odds_status} → {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
