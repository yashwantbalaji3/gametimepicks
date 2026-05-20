"""Model audit framework.

Reads the settled-lean JSONL files for NBA + MLB and emits a structured
JSON artifact (`app/public/data/audit/model_audit.json`) that captures
every angle the audit notes + the new `/results/model-audit` page
consume. The artifact is the single source of truth for:

  * per-market W-L + projection-error stats
  * per-side W-L (Over / Under)
  * per-side × per-market W-L (e.g. NBA REB Over)
  * per-confidence-tier W-L
  * per-edge-band W-L (fixed cutoffs)
  * per-edge-quartile W-L (data-derived cutoffs)
  * per-game hit-rate dispersion
  * per-date W-L timeline
  * per-bookmaker W-L
  * weak / strong cohorts (ranked by hit rate at sufficient sample)

The module is pure: same input → same output. No paid API calls. Safe
to run on every nightly settlement.

Honesty rules carried over from §10 of the handoff:

  * pushes excluded from the denominator
  * pending / insufficient_data rows never counted
  * sample-size weights stamped on every cohort
  * never claims a future hit rate or learning trend

Usage:

    python -m pipeline.model_audit
    python -m pipeline.model_audit --out custom/path.json
    python -m pipeline.model_audit --nba-jsonl path/to/nba.jsonl \
                                   --mlb-jsonl path/to/mlb.jsonl
"""
from __future__ import annotations

import argparse
import json
import math
import os
import statistics
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable

from . import game_context as GC

NBA_DEFAULT_JSONL = os.path.join(
    "pipeline", "validation", "settled_leans.jsonl"
)
MLB_DEFAULT_JSONL = os.path.join(
    "pipeline", "validation", "mlb_settled_leans.jsonl"
)
DEFAULT_OUT = os.path.join(
    "app", "public", "data", "audit", "model_audit.json"
)

EDGE_BANDS = [
    ("0–5pp", 0.0, 5.0),
    ("5–10pp", 5.0, 10.0),
    ("10–15pp", 10.0, 15.0),
    ("15–25pp", 15.0, 25.0),
    ("25pp+", 25.0, float("inf")),
]


# ─────────────────────────────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────────────────────────────


@dataclass
class Bucket:
    label: str
    wins: int
    losses: int

    @property
    def decisive(self) -> int:
        return self.wins + self.losses

    @property
    def hit_rate(self) -> float | None:
        d = self.decisive
        return (self.wins / d) if d > 0 else None

    def to_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "wins": self.wins,
            "losses": self.losses,
            "decisive": self.decisive,
            "hitRate": self.hit_rate,
        }


@dataclass
class MarketStats:
    label: str
    wins: int
    losses: int
    avg_abs_err: float | None
    median_abs_err: float | None
    stdev_err: float | None
    bias: float | None
    n_err: int

    @property
    def decisive(self) -> int:
        return self.wins + self.losses

    @property
    def hit_rate(self) -> float | None:
        d = self.decisive
        return (self.wins / d) if d > 0 else None

    def to_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "wins": self.wins,
            "losses": self.losses,
            "decisive": self.decisive,
            "hitRate": self.hit_rate,
            "avgAbsErr": self.avg_abs_err,
            "medianAbsErr": self.median_abs_err,
            "stdevErr": self.stdev_err,
            "bias": self.bias,
            "nErr": self.n_err,
        }


@dataclass
class EdgeQuartile:
    quartile: int
    lo: float
    hi: float
    wins: int
    losses: int

    @property
    def decisive(self) -> int:
        return self.wins + self.losses

    @property
    def hit_rate(self) -> float | None:
        d = self.decisive
        return (self.wins / d) if d > 0 else None

    def to_dict(self) -> dict[str, Any]:
        return {
            "quartile": self.quartile,
            "lo": self.lo,
            "hi": self.hi,
            "wins": self.wins,
            "losses": self.losses,
            "decisive": self.decisive,
            "hitRate": self.hit_rate,
        }


@dataclass
class GameDispersion:
    n_games: int
    min_hit: float | None
    max_hit: float | None
    stdev: float | None
    median: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "nGames": self.n_games,
            "minHit": self.min_hit,
            "maxHit": self.max_hit,
            "stdev": self.stdev,
            "median": self.median,
        }


@dataclass
class Cohort:
    name: str
    wins: int
    losses: int
    weight: str  # "signal" | "lean" | "small-sample"

    @property
    def decisive(self) -> int:
        return self.wins + self.losses

    @property
    def hit_rate(self) -> float | None:
        d = self.decisive
        return (self.wins / d) if d > 0 else None

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "wins": self.wins,
            "losses": self.losses,
            "decisive": self.decisive,
            "hitRate": self.hit_rate,
            "weight": self.weight,
        }


@dataclass
class SportAudit:
    sport: str
    sample_size: dict[str, Any]
    lifetime: dict[str, Any]
    by_date: list[dict[str, Any]]
    by_market: list[dict[str, Any]]
    by_side: list[dict[str, Any]]
    by_market_side: list[dict[str, Any]]
    by_confidence: list[dict[str, Any]]
    by_edge_band: list[dict[str, Any]]
    by_edge_quartile: list[dict[str, Any]]
    by_bookmaker: list[dict[str, Any]]
    per_game_dispersion: dict[str, Any]
    weak_cohorts: list[dict[str, Any]]
    strong_cohorts: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "sport": self.sport,
            "sampleSize": self.sample_size,
            "lifetime": self.lifetime,
            "byDate": self.by_date,
            "byMarket": self.by_market,
            "bySide": self.by_side,
            "byMarketSide": self.by_market_side,
            "byConfidence": self.by_confidence,
            "byEdgeBand": self.by_edge_band,
            "byEdgeQuartile": self.by_edge_quartile,
            "byBookmaker": self.by_bookmaker,
            "perGameDispersion": self.per_game_dispersion,
            "weakCohorts": self.weak_cohorts,
            "strongCohorts": self.strong_cohorts,
        }


# ─────────────────────────────────────────────────────────────────────
# IO + row normalisation
# ─────────────────────────────────────────────────────────────────────


def _load_jsonl(path: str) -> list[dict[str, Any]]:
    if not os.path.exists(path):
        return []
    out: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                # silently skip malformed; pipelines write strict JSON
                continue
    return out


def _normalise_nba(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in rows:
        result = r.get("result")
        if result not in ("win", "loss"):
            continue
        out.append(
            {
                "date": r.get("date"),
                "gameId": r.get("gameId"),
                "market": r.get("market"),
                "side": r.get("side"),
                "line": r.get("line"),
                "confidence": r.get("confidence"),
                "edge": r.get("edgePct"),
                "bookmaker": r.get("bookmaker"),
                "projection": r.get("modelProjection"),
                "actual": r.get("finalStat"),
                "abs_err": r.get("absoluteProjectionError"),
                "signed_err": r.get("projectionError"),
                "is_win": result == "win",
            }
        )
    return out


def _normalise_mlb(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in rows:
        outcome = r.get("outcome")
        if outcome not in ("Win", "Loss"):
            continue
        proj = r.get("projection")
        actual = r.get("actual")
        if (
            isinstance(proj, (int, float))
            and isinstance(actual, (int, float))
        ):
            signed = actual - proj
            abs_err = abs(signed)
        else:
            signed = None
            abs_err = None
        out.append(
            {
                "date": r.get("date"),
                "gameId": r.get("gamePk"),
                "market": r.get("marketKey"),
                "side": r.get("lean"),
                "line": r.get("line"),
                "confidence": r.get("confidence"),
                "edge": r.get("edgePct"),
                "bookmaker": None,  # MLB rows don't carry per-book
                "projection": proj,
                "actual": actual,
                "abs_err": abs_err,
                "signed_err": signed,
                "is_win": outcome == "Win",
            }
        )
    return out


# ─────────────────────────────────────────────────────────────────────
# Audit primitives
# ─────────────────────────────────────────────────────────────────────


def _weight_for(decisive: int) -> str:
    """Sample-size weight label.

    Same thresholds the TS audit-notes helper uses so the JSON and the
    UI agree without a translation step.
    """
    if decisive < 60:
        return "small-sample"
    if decisive < 200:
        return "lean"
    return "signal"


def _bucket_by(
    rows: list[dict[str, Any]],
    key: str,
    label_fn=None,
) -> list[Bucket]:
    counts: dict[Any, dict[str, int]] = defaultdict(lambda: {"w": 0, "l": 0})
    for r in rows:
        k = r.get(key)
        if k is None:
            continue
        bucket = counts[k]
        if r["is_win"]:
            bucket["w"] += 1
        else:
            bucket["l"] += 1
    out: list[Bucket] = []
    for k, v in sorted(counts.items(), key=lambda kv: str(kv[0])):
        label = label_fn(k) if label_fn else str(k)
        out.append(Bucket(label=label, wins=v["w"], losses=v["l"]))
    return out


def _market_stats(rows: list[dict[str, Any]]) -> list[MarketStats]:
    by_mkt: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        m = r.get("market")
        if m is None:
            continue
        by_mkt[m].append(r)

    out: list[MarketStats] = []
    for m in sorted(by_mkt.keys()):
        sub = by_mkt[m]
        wins = sum(1 for r in sub if r["is_win"])
        losses = len(sub) - wins
        errs = [r["abs_err"] for r in sub if isinstance(r["abs_err"], (int, float))]
        signed = [
            r["signed_err"] for r in sub if isinstance(r["signed_err"], (int, float))
        ]
        avg_abs = statistics.mean(errs) if errs else None
        med_abs = statistics.median(errs) if errs else None
        stdev_err = statistics.pstdev(errs) if len(errs) >= 2 else None
        bias = statistics.mean(signed) if signed else None
        out.append(
            MarketStats(
                label=str(m),
                wins=wins,
                losses=losses,
                avg_abs_err=avg_abs,
                median_abs_err=med_abs,
                stdev_err=stdev_err,
                bias=bias,
                n_err=len(errs),
            )
        )
    return out


def _by_market_side(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[tuple[str, str], dict[str, int]] = defaultdict(
        lambda: {"w": 0, "l": 0}
    )
    for r in rows:
        m = r.get("market")
        s = r.get("side")
        if m is None or s is None:
            continue
        c = counts[(m, s)]
        if r["is_win"]:
            c["w"] += 1
        else:
            c["l"] += 1
    out: list[dict[str, Any]] = []
    for (m, s), v in sorted(counts.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        d = v["w"] + v["l"]
        out.append(
            {
                "market": m,
                "side": s,
                "wins": v["w"],
                "losses": v["l"],
                "decisive": d,
                "hitRate": (v["w"] / d) if d > 0 else None,
            }
        )
    return out


def _edge_band(edge: Any) -> str | None:
    if not isinstance(edge, (int, float)) or math.isnan(edge):
        return None
    a = abs(edge)
    for lbl, lo, hi in EDGE_BANDS:
        if lo <= a < hi:
            return lbl
    return None


def _by_edge_band(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, dict[str, int]] = defaultdict(lambda: {"w": 0, "l": 0})
    for r in rows:
        b = _edge_band(r.get("edge"))
        if b is None:
            continue
        c = counts[b]
        if r["is_win"]:
            c["w"] += 1
        else:
            c["l"] += 1
    out: list[dict[str, Any]] = []
    for label, lo, hi in EDGE_BANDS:
        c = counts.get(label)
        if not c:
            continue
        d = c["w"] + c["l"]
        out.append(
            {
                "label": label,
                "lo": lo,
                "hi": hi if hi != float("inf") else None,
                "wins": c["w"],
                "losses": c["l"],
                "decisive": d,
                "hitRate": (c["w"] / d) if d > 0 else None,
            }
        )
    return out


def _by_edge_quartile(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Data-derived edge quartiles.

    This is the most discriminating split the audit currently has — it
    captured the May 19 non-monotonic edge → outcome relationship that
    fixed-cutoff bands missed.
    """
    pairs = [
        (abs(r["edge"]), 1 if r["is_win"] else 0)
        for r in rows
        if isinstance(r.get("edge"), (int, float))
    ]
    pairs.sort(key=lambda x: x[0])
    n = len(pairs)
    if n < 8:
        return []
    out: list[dict[str, Any]] = []
    for q in range(4):
        lo_idx = q * n // 4
        hi_idx = (q + 1) * n // 4 if q < 3 else n
        sub = pairs[lo_idx:hi_idx]
        if not sub:
            continue
        w = sum(x[1] for x in sub)
        l = len(sub) - w
        out.append(
            {
                "quartile": q + 1,
                "lo": sub[0][0],
                "hi": sub[-1][0],
                "wins": w,
                "losses": l,
                "decisive": w + l,
                "hitRate": (w / (w + l)) if (w + l) > 0 else None,
            }
        )
    return out


def _per_game_dispersion(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[Any, dict[str, int]] = defaultdict(lambda: {"w": 0, "l": 0})
    for r in rows:
        g = r.get("gameId")
        if g is None:
            continue
        c = counts[g]
        if r["is_win"]:
            c["w"] += 1
        else:
            c["l"] += 1
    rates: list[float] = []
    for c in counts.values():
        d = c["w"] + c["l"]
        if d >= 15:  # noise floor — exclude tiny per-game samples
            rates.append(c["w"] / d)
    if not rates:
        return GameDispersion(
            n_games=0, min_hit=None, max_hit=None, stdev=None, median=None
        ).to_dict()
    return GameDispersion(
        n_games=len(rates),
        min_hit=min(rates),
        max_hit=max(rates),
        stdev=statistics.pstdev(rates) if len(rates) >= 2 else 0.0,
        median=statistics.median(rates),
    ).to_dict()


def _weak_strong_cohorts(
    by_market_side: list[dict[str, Any]],
    by_edge_band: list[dict[str, Any]],
    min_decisive: int = 30,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Surface notable strong / weak named cohorts at usable sample.

    Returns (weak, strong) — each list ranked by distance from 0.500
    and capped at 4 items. A cohort qualifies if it has at least
    `min_decisive` decisive picks AND deviates from coin flip by
    at least 5pp.
    """
    qualified: list[Cohort] = []
    for row in by_market_side:
        d = row["decisive"]
        hr = row["hitRate"]
        if hr is None or d < min_decisive:
            continue
        if abs(hr - 0.5) < 0.05:
            continue
        qualified.append(
            Cohort(
                name=f"{row['market']} {row['side']}",
                wins=row["wins"],
                losses=row["losses"],
                weight=_weight_for(d),
            )
        )
    for row in by_edge_band:
        d = row["decisive"]
        hr = row["hitRate"]
        if hr is None or d < min_decisive:
            continue
        if abs(hr - 0.5) < 0.05:
            continue
        qualified.append(
            Cohort(
                name=f"Edge {row['label']}",
                wins=row["wins"],
                losses=row["losses"],
                weight=_weight_for(d),
            )
        )
    weak = sorted(
        [c for c in qualified if (c.hit_rate or 0) < 0.5],
        key=lambda c: c.hit_rate or 0,
    )
    strong = sorted(
        [c for c in qualified if (c.hit_rate or 0) >= 0.5],
        key=lambda c: -(c.hit_rate or 0),
    )
    return [c.to_dict() for c in weak[:4]], [c.to_dict() for c in strong[:4]]


# ─────────────────────────────────────────────────────────────────────
# Sport assembly
# ─────────────────────────────────────────────────────────────────────


def audit_sport(sport: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    dec = rows  # rows are already win/loss-filtered

    wins = sum(1 for r in dec if r["is_win"])
    losses = len(dec) - wins
    dates = sorted({r["date"] for r in dec if r.get("date")})

    by_date = []
    by_date_counts: dict[str, dict[str, int]] = defaultdict(
        lambda: {"w": 0, "l": 0}
    )
    for r in dec:
        d = r.get("date")
        if not d:
            continue
        c = by_date_counts[d]
        if r["is_win"]:
            c["w"] += 1
        else:
            c["l"] += 1
    context_fn = (
        GC.derive_nba_context if sport == "nba" else GC.derive_mlb_context
    )
    for d in dates:
        c = by_date_counts[d]
        total = c["w"] + c["l"]
        try:
            ctx = context_fn(d).to_dict()
        except ValueError:
            ctx = None
        by_date.append(
            {
                "date": d,
                "wins": c["w"],
                "losses": c["l"],
                "decisive": total,
                "hitRate": (c["w"] / total) if total > 0 else None,
                "gameContext": ctx,
            }
        )

    by_side = [b.to_dict() for b in _bucket_by(dec, "side")]
    by_market = [m.to_dict() for m in _market_stats(dec)]
    by_confidence = [b.to_dict() for b in _bucket_by(dec, "confidence")]
    by_market_side = _by_market_side(dec)
    by_edge_band = _by_edge_band(dec)
    by_edge_quartile = _by_edge_quartile(dec)
    by_bookmaker = [b.to_dict() for b in _bucket_by(dec, "bookmaker")]
    dispersion = _per_game_dispersion(dec)
    weak, strong = _weak_strong_cohorts(by_market_side, by_edge_band)

    return SportAudit(
        sport=sport,
        sample_size={
            "decisive": len(dec),
            "dates": len(dates),
            "newestDate": dates[-1] if dates else None,
            "oldestDate": dates[0] if dates else None,
        },
        lifetime={
            "wins": wins,
            "losses": losses,
            "hitRate": (wins / len(dec)) if dec else None,
        },
        by_date=by_date,
        by_market=by_market,
        by_side=by_side,
        by_market_side=by_market_side,
        by_confidence=by_confidence,
        by_edge_band=by_edge_band,
        by_edge_quartile=by_edge_quartile,
        by_bookmaker=by_bookmaker,
        per_game_dispersion=dispersion,
        weak_cohorts=weak,
        strong_cohorts=strong,
    ).to_dict()


def cross_sport(
    nba_audit: dict[str, Any], mlb_audit: dict[str, Any]
) -> dict[str, Any]:
    nba_wins = nba_audit["lifetime"]["wins"]
    nba_losses = nba_audit["lifetime"]["losses"]
    mlb_wins = mlb_audit["lifetime"]["wins"]
    mlb_losses = mlb_audit["lifetime"]["losses"]
    total_wins = nba_wins + mlb_wins
    total_losses = nba_losses + mlb_losses
    total = total_wins + total_losses
    return {
        "wins": total_wins,
        "losses": total_losses,
        "decisive": total,
        "hitRate": (total_wins / total) if total > 0 else None,
        "newestDate": max(
            [
                d
                for d in (
                    nba_audit["sampleSize"]["newestDate"],
                    mlb_audit["sampleSize"]["newestDate"],
                )
                if d
            ],
            default=None,
        ),
    }


def build_audit(
    nba_rows: list[dict[str, Any]],
    mlb_rows: list[dict[str, Any]],
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Pure function — returns the full audit dict for a given pair of rows."""
    generated_at = generated_at or datetime.now(timezone.utc).isoformat(
        timespec="seconds"
    )
    nba_audit = audit_sport("nba", _normalise_nba(nba_rows))
    mlb_audit = audit_sport("mlb", _normalise_mlb(mlb_rows))
    cross = cross_sport(nba_audit, mlb_audit)
    return {
        "_disclaimer": (
            "Settled-data audit. Pushes excluded. Pending and "
            "insufficient_data rows not counted. Educational use only — "
            "not betting advice."
        ),
        "generatedAt": generated_at,
        "sports": {
            "nba": nba_audit,
            "mlb": mlb_audit,
            "cross": cross,
        },
    }


# ─────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────


def _atomic_write_json(path: str, payload: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=False)
    os.replace(tmp, path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the model audit JSON.")
    parser.add_argument("--nba-jsonl", default=NBA_DEFAULT_JSONL)
    parser.add_argument("--mlb-jsonl", default=MLB_DEFAULT_JSONL)
    parser.add_argument("--out", default=DEFAULT_OUT)
    args = parser.parse_args(argv)

    nba_rows = _load_jsonl(args.nba_jsonl)
    mlb_rows = _load_jsonl(args.mlb_jsonl)
    payload = build_audit(nba_rows, mlb_rows)
    _atomic_write_json(args.out, payload)

    nba = payload["sports"]["nba"]
    mlb = payload["sports"]["mlb"]
    cross = payload["sports"]["cross"]
    print(
        f"[model_audit] NBA {nba['lifetime']['wins']}-"
        f"{nba['lifetime']['losses']} on {nba['sampleSize']['decisive']} · "
        f"MLB {mlb['lifetime']['wins']}-{mlb['lifetime']['losses']} on "
        f"{mlb['sampleSize']['decisive']} · cross "
        f"{cross['wins']}-{cross['losses']} on {cross['decisive']}"
    )
    print(f"[model_audit] wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
