"""
UFCStats CSV provider — consumes the Greco1899/scrape_ufc_stats committed CSVs
(GPL-3.0, daily-refreshed, source ufcstats.com). We do NOT scrape ufcstats.com
directly and do NOT republish the raw CSVs — only DERIVED features (see
build_fighter_stats). Attribution kept in the artifact + docs.

`requests` is only imported inside fetch_csvs (CI). Local/tests read from a dir.
"""
from __future__ import annotations

import csv
import io
from pathlib import Path

RAW_BASE = "https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main"
SOURCE_REPO = "https://github.com/Greco1899/scrape_ufc_stats"
SOURCE_LICENSE = "GPL-3.0"
SOURCE_ATTRIBUTION = (
    "UFC fighter/fight data derived from Greco1899/scrape_ufc_stats (GPL-3.0), "
    "which compiles public stats from ufcstats.com. Derived features only; raw "
    "CSVs are not redistributed."
)
CSV_FILES = (
    "ufc_event_details", "ufc_fighter_details", "ufc_fighter_tott",
    "ufc_fight_results", "ufc_fight_stats",
)


def fetch_csvs() -> dict[str, list[dict]]:
    """Download the committed CSVs (CI). One GET each — no scraping."""
    import requests
    out: dict[str, list[dict]] = {}
    for name in CSV_FILES:
        r = requests.get(f"{RAW_BASE}/{name}.csv", timeout=60)
        r.raise_for_status()
        out[name] = list(csv.DictReader(io.StringIO(r.text)))
    return out


def read_csvs(csv_dir: str | Path) -> dict[str, list[dict]]:
    """Read pre-downloaded CSVs from a directory (local builds + tests)."""
    d = Path(csv_dir)
    out: dict[str, list[dict]] = {}
    for name in CSV_FILES:
        p = d / f"{name}.csv"
        out[name] = list(csv.DictReader(p.open(encoding="utf-8"))) if p.exists() else []
    return out
