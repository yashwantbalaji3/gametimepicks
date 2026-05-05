"""
Phase 7B-3 — Inspect or clear pipeline/cache/.

Usage:
    python -m pipeline.cache_inspect            # list all cache entries
    python -m pipeline.cache_inspect --show KEY # print one entry's metadata
    python -m pipeline.cache_inspect --clear    # delete all cache entries
    python -m pipeline.cache_inspect --clear --kind odds_api  # delete subset

Useful when:
    - You want to know if the next pipeline run will hit the network or use cache
    - You modified ODDS_BOOKMAKERS / ODDS_MARKETS and want fresh fetches
    - You see odd diagnostic output and want to understand cache state

Read-only by default. Cache files are JSON of shape:
    {"cached_at": "<ISO>", "data": <provider response>}
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def _ok(msg: str) -> None:
    print(f"  \033[0;32m✓\033[0m {msg}")


def _info(msg: str) -> None:
    print(f"  \033[0;34m·\033[0m {msg}")


def _warn(msg: str) -> None:
    print(f"  \033[0;33m!\033[0m {msg}")


def _err(msg: str) -> None:
    print(f"  \033[0;31m✗\033[0m {msg}", file=sys.stderr)


def _format_age(iso: str) -> str:
    try:
        cached_at = datetime.fromisoformat(iso)
        delta = datetime.now(timezone.utc) - cached_at
        secs = delta.total_seconds()
        if secs < 60:
            return f"{int(secs)}s ago"
        if secs < 3600:
            return f"{int(secs / 60)}m ago"
        if secs < 86400:
            return f"{secs / 3600:.1f}h ago"
        return f"{secs / 86400:.1f}d ago"
    except Exception:
        return iso


def _classify(name: str) -> str:
    """Return a coarse 'kind' label for a cache filename."""
    if name.startswith("odds_api_"):
        return "odds_api"
    if name.startswith("espn_"):
        return "espn"
    return "other"


def list_cache(cache_dir: Path) -> int:
    if not cache_dir.exists():
        _info(f"Cache directory does not exist: {cache_dir}")
        _info("Nothing to inspect. Pipeline hasn't been run yet, or cache was")
        _info("never used (e.g. ODDS_API_KEY unset).")
        return 0

    files = sorted(cache_dir.glob("*.json"))
    if not files:
        _info(f"Cache directory is empty: {cache_dir}")
        return 0

    print(f"\n  \033[0;34m═══ {len(files)} cache entries in {cache_dir} ═══\033[0m\n")

    by_kind: dict[str, int] = {}
    total_bytes = 0

    print(f"    {'KIND':10s} {'KEY':45s} {'SIZE':>8s}  AGE")
    print(f"    {'-'*10} {'-'*45} {'-'*8}  {'-'*10}")

    for f in files:
        kind = _classify(f.name)
        size = f.stat().st_size
        total_bytes += size
        by_kind[kind] = by_kind.get(kind, 0) + 1

        try:
            payload = json.loads(f.read_text())
            cached_at = payload.get("cached_at", "?")
            age = _format_age(cached_at)
        except Exception:
            age = "?"

        # Strip the file extension and "odds_api_" / "espn_" prefix for readability
        short = f.stem
        for prefix in ("odds_api_", "espn_"):
            if short.startswith(prefix):
                short = short[len(prefix):]
                break

        size_human = f"{size/1024:.1f}K" if size >= 1024 else f"{size}B"
        truncated = (short[:42] + "...") if len(short) > 45 else short
        print(f"    {kind:10s} {truncated:45s} {size_human:>8s}  {age}")

    print()
    print(f"  Total: {len(files)} files, {total_bytes/1024:.1f} KB")
    if by_kind:
        breakdown = ", ".join(f"{k}={v}" for k, v in sorted(by_kind.items()))
        print(f"  By kind: {breakdown}")
    print()
    print("  Tip: pass --clear to delete all cache entries (forces fresh fetches)")
    print("       pass --clear --kind odds_api to delete only odds caches")
    print()
    return 0


def show_entry(cache_dir: Path, key: str) -> int:
    target = cache_dir / f"{key}.json"
    if not target.exists():
        # Try common prefixes
        for prefix in ("odds_api_", "espn_"):
            candidate = cache_dir / f"{prefix}{key}.json"
            if candidate.exists():
                target = candidate
                break
    if not target.exists():
        _err(f"No cache entry matching '{key}' found in {cache_dir}")
        return 1

    try:
        payload = json.loads(target.read_text())
    except Exception as e:
        _err(f"Could not parse {target.name}: {e}")
        return 1

    print(f"\n  \033[0;34m═══ {target.name} ═══\033[0m\n")
    cached_at = payload.get("cached_at")
    if cached_at:
        _info(f"cached at: {cached_at} ({_format_age(cached_at)})")
    data = payload.get("data")
    if isinstance(data, list):
        _info(f"data: list with {len(data)} entries")
    elif isinstance(data, dict):
        _info(f"data: dict with keys {sorted(data.keys())[:8]}{'...' if len(data) > 8 else ''}")
    else:
        _info(f"data type: {type(data).__name__}")
    print()
    return 0


def clear_cache(cache_dir: Path, kind_filter: str | None) -> int:
    if not cache_dir.exists():
        _info(f"Cache directory does not exist: {cache_dir}. Nothing to clear.")
        return 0

    files = sorted(cache_dir.glob("*.json"))
    if not files:
        _info(f"Cache directory is empty: {cache_dir}. Nothing to clear.")
        return 0

    targets = files
    if kind_filter:
        targets = [f for f in files if _classify(f.name) == kind_filter]

    if not targets:
        _info(f"No cache files match kind={kind_filter!r}.")
        return 0

    print(f"\n  About to delete {len(targets)} cache file(s):")
    for f in targets[:20]:
        print(f"    {f.name}")
    if len(targets) > 20:
        print(f"    ... and {len(targets) - 20} more")
    print()

    try:
        ans = input("  Proceed? [y/N] ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        _warn("Aborted.")
        return 0
    if ans != "y":
        _warn("Aborted.")
        return 0

    deleted = 0
    for f in targets:
        try:
            f.unlink()
            deleted += 1
        except Exception as e:
            _err(f"could not delete {f.name}: {e}")

    _ok(f"Deleted {deleted} cache file(s).")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Inspect or clear pipeline/cache/.",
    )
    parser.add_argument(
        "--clear", action="store_true",
        help="Delete cache files (will prompt for confirmation).",
    )
    parser.add_argument(
        "--kind", choices=["odds_api", "espn", "other"],
        help="When used with --clear, only delete this kind.",
    )
    parser.add_argument(
        "--show", metavar="KEY",
        help="Show metadata for a specific cache entry.",
    )
    args = parser.parse_args(argv)

    try:
        from . import config as C
    except Exception as e:
        _err(f"Could not import pipeline.config: {e}")
        return 2

    cache_dir: Path = C.CACHE_DIR

    if args.show:
        return show_entry(cache_dir, args.show)
    if args.clear:
        return clear_cache(cache_dir, args.kind)
    return list_cache(cache_dir)


if __name__ == "__main__":
    sys.exit(main())
