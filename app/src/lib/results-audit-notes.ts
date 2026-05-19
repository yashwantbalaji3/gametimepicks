/**
 * Honest model-audit breakdowns sourced ONLY from already-settled data.
 *
 * Every number returned by this module is computed at build time from
 * the same `settled_leans.jsonl` files that power `/results`. There is
 * no live API call, no projected number, no inferred trend. Sample
 * sizes are surfaced alongside every percentage so the UI can grade
 * its own copy honestly.
 *
 * What we DO surface:
 *   - per-sport, per-side (Over/Under), per-market, per-edge-band W-L
 *   - lifetime + most-recent settled slate framing
 *
 * What we DO NOT surface (by design):
 *   - per-confidence-tier hit rate beyond what the existing comparison
 *     reports already publish (the lifetime tier breakdown isn't
 *     stable enough at this sample size to call out a "tier signal"
 *     publicly — `/results/{nba,mlb}` already shows it where it lives)
 *   - "improvement" claims based on a 3-date NBA timeline (not enough)
 *   - any retraining / future-accuracy projection
 */
import fs from "node:fs";
import path from "node:path";

import {
  getAvailableSettlementDates,
  getLifetimeSummary,
  type SettledLean,
} from "./settlement-data";
import {
  getMlbAvailableResultDates,
  getMlbLifetimeSummary,
  getMlbSettledLeans,
} from "./data-mlb-results";

const NBA_SETTLED_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "results",
  "settled_leans.jsonl",
);

function readNbaSettledLeans(): SettledLean[] {
  if (!fs.existsSync(NBA_SETTLED_PATH)) return [];
  try {
    const out: SettledLean[] = [];
    const raw = fs.readFileSync(NBA_SETTLED_PATH, "utf-8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t) as SettledLean);
      } catch {
        // skip malformed
      }
    }
    return out;
  } catch {
    return [];
  }
}

export interface BucketRow {
  /** Display label, e.g. "Over", "Under", "PTS", "10–15pp". */
  label: string;
  wins: number;
  losses: number;
  total: number;
  /** Decisive total = wins + losses (pushes excluded). */
  decisive: number;
  /** wins / decisive — null when decisive=0. */
  hitRate: number | null;
}

function bucket(label: string, wins: number, losses: number): BucketRow {
  const decisive = wins + losses;
  return {
    label,
    wins,
    losses,
    total: decisive,
    decisive,
    hitRate: decisive > 0 ? wins / decisive : null,
  };
}

function summariseNba(): {
  totalDecisive: number;
  hitRate: number | null;
  bySide: BucketRow[];
  byMarket: BucketRow[];
  byEdgeBand: BucketRow[];
} {
  const rows = readNbaSettledLeans();
  const dec = rows.filter((r) => r.result === "win" || r.result === "loss");

  const totalWins = dec.filter((r) => r.result === "win").length;
  const totalLosses = dec.length - totalWins;

  const sideWL: Record<string, { w: number; l: number }> = {};
  const marketWL: Record<string, { w: number; l: number }> = {};
  const bandWL: Record<string, { w: number; l: number }> = {};

  for (const r of dec) {
    const w = r.result === "win" ? 1 : 0;
    const l = 1 - w;

    const side = r.side ?? "Other";
    sideWL[side] = sideWL[side] ?? { w: 0, l: 0 };
    sideWL[side].w += w;
    sideWL[side].l += l;

    const market = r.market ?? "Other";
    marketWL[market] = marketWL[market] ?? { w: 0, l: 0 };
    marketWL[market].w += w;
    marketWL[market].l += l;

    const e = r.edgePct;
    const band = edgeBandLabel(e);
    bandWL[band] = bandWL[band] ?? { w: 0, l: 0 };
    bandWL[band].w += w;
    bandWL[band].l += l;
  }

  const bySide = (["Over", "Under"] as const)
    .filter((k) => k in sideWL)
    .map((k) => bucket(k, sideWL[k].w, sideWL[k].l));
  const byMarket = (["PTS", "REB", "AST"] as const)
    .filter((k) => k in marketWL)
    .map((k) => bucket(k, marketWL[k].w, marketWL[k].l));
  const byEdgeBand = EDGE_BAND_ORDER.filter((k) => k in bandWL).map((k) =>
    bucket(k, bandWL[k].w, bandWL[k].l),
  );

  return {
    totalDecisive: dec.length,
    hitRate: dec.length > 0 ? totalWins / dec.length : null,
    bySide,
    byMarket,
    byEdgeBand,
  };
}

function summariseMlb(): {
  totalDecisive: number;
  hitRate: number | null;
  bySide: BucketRow[];
  byMarket: BucketRow[];
  byEdgeBand: BucketRow[];
} {
  const rows = getMlbSettledLeans();
  const dec = rows.filter((r) => r.outcome === "Win" || r.outcome === "Loss");

  const totalWins = dec.filter((r) => r.outcome === "Win").length;

  const sideWL: Record<string, { w: number; l: number }> = {};
  const marketWL: Record<string, { w: number; l: number }> = {};
  const bandWL: Record<string, { w: number; l: number }> = {};

  for (const r of dec) {
    const w = r.outcome === "Win" ? 1 : 0;
    const l = 1 - w;

    const side = r.lean ?? "Other";
    sideWL[side] = sideWL[side] ?? { w: 0, l: 0 };
    sideWL[side].w += w;
    sideWL[side].l += l;

    const market = MLB_MARKET_LABEL[r.marketKey ?? ""] ?? r.marketKey ?? "Other";
    marketWL[market] = marketWL[market] ?? { w: 0, l: 0 };
    marketWL[market].w += w;
    marketWL[market].l += l;

    const e = typeof r.edgePct === "number" ? r.edgePct : null;
    const band = edgeBandLabel(e);
    bandWL[band] = bandWL[band] ?? { w: 0, l: 0 };
    bandWL[band].w += w;
    bandWL[band].l += l;
  }

  const bySide = (["Over", "Under"] as const)
    .filter((k) => k in sideWL)
    .map((k) => bucket(k, sideWL[k].w, sideWL[k].l));
  const byMarket = Object.keys(marketWL)
    .sort()
    .map((k) => bucket(k, marketWL[k].w, marketWL[k].l));
  const byEdgeBand = EDGE_BAND_ORDER.filter((k) => k in bandWL).map((k) =>
    bucket(k, bandWL[k].w, bandWL[k].l),
  );

  return {
    totalDecisive: dec.length,
    hitRate: dec.length > 0 ? totalWins / dec.length : null,
    bySide,
    byMarket,
    byEdgeBand,
  };
}

const MLB_MARKET_LABEL: Record<string, string> = {
  batter_hits: "Hits",
  batter_total_bases: "Total bases",
  batter_hits_runs_rbis: "H+R+RBI",
  pitcher_strikeouts: "Strikeouts",
};

const EDGE_BAND_ORDER = [
  "0–5pp",
  "5–10pp",
  "10–15pp",
  "15–25pp",
  "25pp+",
] as const;

function edgeBandLabel(e: number | null | undefined): string {
  if (typeof e !== "number" || Number.isNaN(e)) return "unknown";
  const a = Math.abs(e);
  if (a < 5) return "0–5pp";
  if (a < 10) return "5–10pp";
  if (a < 15) return "10–15pp";
  if (a < 25) return "15–25pp";
  return "25pp+";
}

export interface AuditNote {
  /** Strength of evidence relative to current sample size. */
  weight: "signal" | "lean" | "small-sample";
  /** Short headline, e.g. "PTS strongest market on the NBA model". */
  headline: string;
  /** One-sentence honest framing — never claims future accuracy. */
  body: string;
}

/**
 * Sample-size labels chosen conservatively. Anything under 60 decisive
 * picks is "small-sample"; 60–200 is a "lean"; 200+ is a "signal".
 * These thresholds are deliberate and applied uniformly so the UI
 * doesn't have to invent its own confidence framing.
 */
function weightFor(decisive: number): AuditNote["weight"] {
  if (decisive < 60) return "small-sample";
  if (decisive < 200) return "lean";
  return "signal";
}

/**
 * Compose the public audit notes for a sport. Returns at most 4 notes
 * so the surface stays scannable. Every note cites the underlying
 * sample size and uses approved educational copy.
 */
function notesForSport(
  sport: "NBA" | "MLB",
  summary: ReturnType<typeof summariseNba>,
): AuditNote[] {
  const notes: AuditNote[] = [];

  // ─── side skew ───────────────────────────────────────────────────────
  const over = summary.bySide.find((b) => b.label === "Over");
  const under = summary.bySide.find((b) => b.label === "Under");
  if (
    over &&
    under &&
    over.hitRate !== null &&
    under.hitRate !== null &&
    over.decisive + under.decisive >= 60
  ) {
    const diff = (under.hitRate - over.hitRate) * 100;
    const total = over.decisive + under.decisive;
    if (Math.abs(diff) >= 4) {
      const stronger = diff > 0 ? "Under" : "Over";
      const weaker = diff > 0 ? "Over" : "Under";
      notes.push({
        weight: weightFor(total),
        headline: `${stronger} leans outperform ${weaker}`,
        body: `${sport} ${stronger} settled at ${pct(stronger === "Under" ? under.hitRate : over.hitRate)} vs ${pct(stronger === "Under" ? over.hitRate : under.hitRate)} for ${weaker} on ${total} decisive picks. Treat as a lean — not a guarantee.`,
      });
    }
  }

  // ─── market ranking ─────────────────────────────────────────────────
  const ranked = summary.byMarket
    .filter((b) => b.hitRate !== null)
    .sort((a, b) => (b.hitRate ?? 0) - (a.hitRate ?? 0));
  if (ranked.length >= 2) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    const gap = (best.hitRate! - worst.hitRate!) * 100;
    if (gap >= 5 && best.decisive >= 30 && worst.decisive >= 30) {
      notes.push({
        weight: weightFor(best.decisive + worst.decisive),
        headline: `${best.label} strongest, ${worst.label} weakest`,
        body: `${sport} ${best.label} hit at ${pct(best.hitRate)} on ${best.decisive} picks; ${worst.label} hit at ${pct(worst.hitRate)} on ${worst.decisive}. Markets to keep auditing in the next slates.`,
      });
    }
  }

  // ─── edge band — only call out when the spread is striking ──────────
  if (summary.byEdgeBand.length >= 3) {
    const ranked = [...summary.byEdgeBand].sort(
      (a, b) => (b.hitRate ?? 0) - (a.hitRate ?? 0),
    );
    const top = ranked[0];
    const bottom = ranked[ranked.length - 1];
    const gap = (top.hitRate ?? 0) - (bottom.hitRate ?? 0);
    if (
      top.hitRate !== null &&
      bottom.hitRate !== null &&
      gap * 100 >= 10 &&
      top.decisive >= 25 &&
      bottom.decisive >= 25
    ) {
      notes.push({
        weight: weightFor(top.decisive + bottom.decisive),
        headline: `Edge-band ${top.label} band strongest so far`,
        body: `${sport} picks in the ${top.label} edge band hit at ${pct(top.hitRate)} on ${top.decisive}; the ${bottom.label} band sits at ${pct(bottom.hitRate)} on ${bottom.decisive}. Calibration check, not a recommendation.`,
      });
    }
  }

  // ─── lifetime framing — always emit one ─────────────────────────────
  if (summary.hitRate !== null && summary.totalDecisive > 0) {
    notes.push({
      weight: weightFor(summary.totalDecisive),
      headline: `Lifetime ${sport} settled hit rate`,
      body: `${pct(summary.hitRate)} on ${summary.totalDecisive} decisive picks. Pushes excluded; pending and insufficient-data rows never counted. The audit is still on an early sample — every new settled slate widens the denominator.`,
    });
  }

  return notes.slice(0, 4);
}

function pct(v: number | null | undefined): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export interface SportAuditSummary {
  sport: "NBA" | "MLB";
  totalDecisive: number;
  hitRate: number | null;
  newestDate: string | null;
  bySide: BucketRow[];
  byMarket: BucketRow[];
  byEdgeBand: BucketRow[];
  notes: AuditNote[];
}

export function buildNbaAudit(): SportAuditSummary {
  const summary = summariseNba();
  const lifetime = getLifetimeSummary();
  return {
    sport: "NBA",
    totalDecisive: summary.totalDecisive,
    hitRate: summary.hitRate,
    newestDate: lifetime?.newestDate ?? null,
    bySide: summary.bySide,
    byMarket: summary.byMarket,
    byEdgeBand: summary.byEdgeBand,
    notes: notesForSport("NBA", summary),
  };
}

export function buildMlbAudit(): SportAuditSummary {
  const summary = summariseMlb();
  const lifetime = getMlbLifetimeSummary();
  return {
    sport: "MLB",
    totalDecisive: summary.totalDecisive,
    hitRate: summary.hitRate,
    newestDate: lifetime?.newestDate ?? null,
    bySide: summary.bySide,
    byMarket: summary.byMarket,
    byEdgeBand: summary.byEdgeBand,
    notes: notesForSport("MLB", summary),
  };
}

/**
 * Cross-sport "where the model is strong / where it needs review"
 * framing. Returns 3-4 sentences total, all derived from the buckets
 * above. Lives on /results above the per-sport scorecards.
 */
export function buildCrossSportFraming(): {
  strongerSport: "NBA" | "MLB" | null;
  diffPp: number | null;
  totalDecisive: number;
  newestDate: string | null;
  notes: AuditNote[];
} {
  const nba = buildNbaAudit();
  const mlb = buildMlbAudit();
  const total = nba.totalDecisive + mlb.totalDecisive;

  const notes: AuditNote[] = [];
  let stronger: "NBA" | "MLB" | null = null;
  let diffPp: number | null = null;

  if (
    nba.hitRate !== null &&
    mlb.hitRate !== null &&
    Math.min(nba.totalDecisive, mlb.totalDecisive) >= 60
  ) {
    const d = (nba.hitRate - mlb.hitRate) * 100;
    if (Math.abs(d) >= 5) {
      stronger = d > 0 ? "NBA" : "MLB";
      diffPp = d;
      notes.push({
        weight: weightFor(Math.min(nba.totalDecisive, mlb.totalDecisive)),
        headline: `${stronger} model leading on settled audit`,
        body: `${stronger} settled at ${pct(stronger === "NBA" ? nba.hitRate : mlb.hitRate)} on ${stronger === "NBA" ? nba.totalDecisive : mlb.totalDecisive} picks; the other sport sits at ${pct(stronger === "NBA" ? mlb.hitRate : nba.hitRate)} on ${stronger === "NBA" ? mlb.totalDecisive : nba.totalDecisive}. Treat the gap as a calibration lean — the denominator is still small.`,
      });
    }
  }

  // Pending honesty
  notes.push({
    weight: "signal",
    headline: "Pending games never affect the record",
    body: `Settlement only counts games whose final box scores are verified. In-progress games are refused at the source layer; pushes and insufficient-data rows are excluded from the denominator.`,
  });

  // Sample size honesty
  if (total > 0 && total < 1000) {
    notes.push({
      weight: "signal",
      headline: "Calibration tracking on an early sample",
      body: `Settled audit currently covers ${total} decisive picks across both sports. We track calibration after every slate but make no claims about future accuracy.`,
    });
  }

  return {
    strongerSport: stronger,
    diffPp,
    totalDecisive: total,
    newestDate: latestNewestDate(nba.newestDate, mlb.newestDate),
    notes,
  };
}

function latestNewestDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Honest list of dates that contributed to the lifetime. Used so the
 * Results page can show exactly which slates have been settled and
 * which haven't — no fabricated "trend" line, just real anchor points.
 */
export function settledDateRoster(): {
  nba: string[];
  mlb: string[];
  combined: string[];
} {
  const nba = getAvailableSettlementDates();
  const mlb = getMlbAvailableResultDates().dates ?? [];
  const combined = Array.from(new Set([...nba, ...mlb])).sort();
  return { nba, mlb, combined };
}
