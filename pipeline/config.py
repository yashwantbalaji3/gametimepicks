"""
Pipeline configuration.

All knobs live here so we don't sprinkle os.getenv() calls across the codebase.
Loads .env from the project root if present.
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
ENABLE_ESPN_FALLBACK = os.getenv("ENABLE_ESPN_FALLBACK", "false").lower() == "true"
ENABLE_BALLDONTLIE_FALLBACK = os.getenv("ENABLE_BALLDONTLIE_FALLBACK", "false").lower() == "true"
ENABLE_OPTICODDS = os.getenv("ENABLE_OPTICODDS", "false").lower() == "true"
ENABLE_SPORTSDATA = os.getenv("ENABLE_SPORTSDATA", "false").lower() == "true"


# ---------------------------------------------------------------------------
# Slate window (Phase 7B-1)
# ---------------------------------------------------------------------------
# Number of days the slate covers, starting today.
# 4 = today + 3 future days.
SLATE_DAYS = max(1, min(7, int(os.getenv("SLATE_DAYS", "4"))))


# ---------------------------------------------------------------------------
# API keys (None when missing — providers handle the absence)
# ---------------------------------------------------------------------------
ODDS_API_KEY = os.getenv("ODDS_API_KEY") or None
BALLDONTLIE_API_KEY = os.getenv("BALLDONTLIE_API_KEY") or None
OPTICODDS_API_KEY = os.getenv("OPTICODDS_API_KEY") or None
SPORTSDATA_API_KEY = os.getenv("SPORTSDATA_API_KEY") or None


# ---------------------------------------------------------------------------
# Behavior
# ---------------------------------------------------------------------------
TIMEZONE = os.getenv("TIMEZONE", "America/New_York")

# How many recent games we pull per player for the model
GAME_LOG_WINDOW = 12

# Markets we score
MARKETS = ("PTS", "REB", "AST")

# Edge thresholds (percentage points) for confidence tiers
EDGE_THRESHOLD_HIGH = 5.0
EDGE_THRESHOLD_MEDIUM = 2.5
# Anything below MEDIUM becomes "No Play"

# Cache TTL — once a day's data is fetched, reuse it within the same day
CACHE_TTL_HOURS = 12

# Network retry settings
HTTP_TIMEOUT_SECONDS = 12
HTTP_MAX_RETRIES = 3
HTTP_BACKOFF_SECONDS = 1.0

# The Odds API config
ODDS_API_REGION = "us"
ODDS_API_BOOKMAKERS = os.getenv("ODDS_BOOKMAKERS", "").strip()
ODDS_API_MARKETS_DEFAULT = ("player_points", "player_rebounds", "player_assists")
