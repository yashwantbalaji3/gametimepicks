"""
Pipeline configuration.

All knobs live here so we don't sprinkle os.getenv() calls across the codebase.
Loads .env from the project root if present.

Phase 7B-2 hotfix: adds the odds-tuning constants the orchestrator and
provider rely on. They were previously assumed to exist; now they are
explicit, with safe defaults and robust env parsing so a malformed value
never crashes the pipeline.
"""
from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    # python-dotenv is in requirements.txt but if someone runs without it,
    # we still pick up env vars from the shell.
    pass


# ---------------------------------------------------------------------------
# Defensive parsers — keep the rest of the file declarative
# ---------------------------------------------------------------------------
def _parse_csv_list(env_name: str, default: list[str]) -> list[str]:
    """Read a comma-separated env var and return a clean list.
    Falls back to the default if the env var is missing or empty."""
    raw = os.getenv(env_name)
    if raw is None:
        return list(default)
    items = [x.strip() for x in raw.split(",")]
    items = [x for x in items if x]
    return items if items else list(default)


def _parse_int(
    env_name: str,
    default: int,
    *,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    """Read an int env var with bounds clamping. Falls back to default on
    missing, empty, or malformed values."""
    raw = os.getenv(env_name)
    if raw is None or not str(raw).strip():
        v = default
    else:
        try:
            v = int(str(raw).strip())
        except (ValueError, TypeError):
            v = default
    if minimum is not None and v < minimum:
        v = minimum
    if maximum is not None and v > maximum:
        v = maximum
    return v


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PIPELINE_DIR = Path(__file__).resolve().parent
ROOT_DIR = PIPELINE_DIR.parent
APP_PUBLIC_DATA = ROOT_DIR / "app" / "public" / "data"
DEMO_DATA_DIR = PIPELINE_DIR / "demo_data"
CACHE_DIR = PIPELINE_DIR / "cache"

# Allow override
DATA_OUT = Path(os.getenv("GTP_DATA_OUT", APP_PUBLIC_DATA)).resolve()


# ---------------------------------------------------------------------------
# Provider selection
# ---------------------------------------------------------------------------
# Tier 1 — primary
NBA_DATA_PROVIDER = os.getenv("NBA_DATA_PROVIDER", "nba_api")
ODDS_PROVIDER = os.getenv("ODDS_PROVIDER", "the_odds_api")
NEWS_PROVIDER = os.getenv("NEWS_PROVIDER", "manual")
INJURY_PROVIDER = os.getenv("INJURY_PROVIDER", "manual")

# Mode forcing — "demo" forces the demo provider for that data kind regardless
# of which Tier 1 provider is configured. "auto" lets the chain decide.
# "manual" (news/injury only) means we read manual_overrides/news_signals.json.
NBA_DATA_MODE = os.getenv("NBA_DATA_MODE", "auto").lower()
ODDS_DATA_MODE = os.getenv("ODDS_DATA_MODE", "auto").lower()
NEWS_DATA_MODE = os.getenv("NEWS_DATA_MODE", "manual").lower()
INJURY_DATA_MODE = os.getenv("INJURY_DATA_MODE", "manual").lower()

# Tier 2/3 — opt-in fallbacks
# Phase 7B-2.1: ESPN scoreboard defaults to ENABLED (free, no key, no scraping)
# because nba_api can be unreliable for current playoff dates with TBD opponents.
# Set ENABLE_ESPN_FALLBACK=false to disable.
ENABLE_ESPN_FALLBACK = os.getenv("ENABLE_ESPN_FALLBACK", "true").lower() == "true"
ENABLE_BALLDONTLIE_FALLBACK = os.getenv("ENABLE_BALLDONTLIE_FALLBACK", "false").lower() == "true"
ENABLE_OPTICODDS = os.getenv("ENABLE_OPTICODDS", "false").lower() == "true"
ENABLE_SPORTSDATA = os.getenv("ENABLE_SPORTSDATA", "false").lower() == "true"


# ---------------------------------------------------------------------------
# Slate window (Phase 7B-1)
# ---------------------------------------------------------------------------
# Number of days the slate covers, starting today.
# 4 = today + 3 future days.
SLATE_DAYS = _parse_int("SLATE_DAYS", 4, minimum=1, maximum=7)


# ---------------------------------------------------------------------------
# API keys
# ---------------------------------------------------------------------------
# Empty string means "not configured" — providers check `bool(C.ODDS_API_KEY)`.
ODDS_API_KEY = (os.getenv("ODDS_API_KEY") or "").strip()
BALLDONTLIE_API_KEY = (os.getenv("BALLDONTLIE_API_KEY") or "").strip() or None
OPTICODDS_API_KEY = (os.getenv("OPTICODDS_API_KEY") or "").strip() or None
SPORTSDATA_API_KEY = (os.getenv("SPORTSDATA_API_KEY") or "").strip() or None


# ---------------------------------------------------------------------------
# Behavior
# ---------------------------------------------------------------------------
TIMEZONE = os.getenv("TIMEZONE", "America/New_York")

# How many recent games we pull per player for the model
GAME_LOG_WINDOW = 12

# Markets we score (internal model labels — not Odds API keys)
MARKETS = ("PTS", "REB", "AST")

# Edge thresholds (percentage points) for confidence tiers
EDGE_THRESHOLD_HIGH = 5.0
EDGE_THRESHOLD_MEDIUM = 2.5
# Anything below MEDIUM becomes "No Play"

# Cache TTL — once a day's data is fetched, reuse it within the same day
CACHE_TTL_HOURS = 12

# Network retry settings
HTTP_TIMEOUT_SECONDS = _parse_int("HTTP_TIMEOUT_SECONDS", 12, minimum=1, maximum=120)
HTTP_MAX_RETRIES = _parse_int("HTTP_MAX_RETRIES", 3, minimum=0, maximum=10)
HTTP_BACKOFF_SECONDS = 1.0


# ---------------------------------------------------------------------------
# Phase 7B-2 — The Odds API config
# ---------------------------------------------------------------------------
# All env vars are comma-separated strings; config.py parses them into clean
# lists with whitespace trimmed and empty entries dropped. If any env var
# is missing or malformed, the safe default is used — the pipeline never
# crashes on a typo.

# Player-prop markets to request. Each market multiplies your per-event
# credit cost (markets × regions). The free tier covers all three of these.
ODDS_MARKETS = _parse_csv_list(
    "ODDS_MARKETS",
    default=["player_points", "player_rebounds", "player_assists"],
)

# Bookmaker regions. "us" only is standard for NBA props. Adding "us2"
# or "uk" multiplies your credit cost.
ODDS_REGIONS = _parse_csv_list("ODDS_REGIONS", default=["us"])

# Specific bookmaker keys. Keep narrow to keep response size down.
# Default is two major US books.
ODDS_BOOKMAKERS = _parse_csv_list(
    "ODDS_BOOKMAKERS",
    default=["draftkings", "fanduel"],
)

# Cap on per-event /odds calls per pipeline run. Free tier is 500 credits/mo;
# at 6 events × 3 markets × 1 region = 18 credits per run, that's ~27 runs/mo.
ODDS_MAX_EVENTS_PER_RUN = _parse_int(
    "ODDS_MAX_EVENTS_PER_RUN", default=6, minimum=1, maximum=50,
)

# Cache TTL specifically for odds data (separate from CACHE_TTL_HOURS used
# by the NBA stats provider).
ODDS_CACHE_TTL_MINUTES = _parse_int(
    "ODDS_CACHE_TTL_MINUTES", default=60, minimum=5, maximum=1440,
)


# ---------------------------------------------------------------------------
# Back-compat aliases — keep older code working without a wider refactor.
# These are derived from the canonical lists above, so changing the env
# vars affects both the new and old names consistently.
# ---------------------------------------------------------------------------
# Old name expected a single region string (e.g. "us"). Keep that available
# for any legacy reader.
ODDS_API_REGION = ODDS_REGIONS[0] if ODDS_REGIONS else "us"

# Old name expected a comma-separated string. Some legacy readers use
# `if C.ODDS_API_BOOKMAKERS:` — that still works because empty list
# joins to an empty string which is falsy.
ODDS_API_BOOKMAKERS = ",".join(ODDS_BOOKMAKERS)

# Old default tuple. Kept for any code that still imports it.
ODDS_API_MARKETS_DEFAULT = tuple(ODDS_MARKETS)
