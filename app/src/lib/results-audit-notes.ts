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

const MODEL_AUDIT_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "audit",
  "model_audit.json",
);

export interface ModelAuditCohort {
  name: string;
  wins: number;
  losses: number;
  decisive: number;
  hitRate: number | null;
  weight: "signal" | "lean" | "small-sample";
}

export interface ModelAuditDispersion {
  nGames: number;
  minHit: number | null;
  maxHit: number | null;
  stdev: number | null;
  median: number | null;
}

export interface ModelAuditQuartile {
  quartile: number;
  lo: number;
  hi: number;
  wins: number;
  losses: number;
  decisive: number;
  hitRate: number | null;
}

export interface ModelAuditMarket {
  label: string;
  wins: number;
  losses: number;
  decisive: number;
  hitRate: number | null;
  avgAbsErr: number | null;
  medianAbsErr: number | null;
  stdevErr: number | null;
  bias: number | null;
  nErr: number;
}

export interface ModelAuditDateRow {
  date: string;
  wins: number;
  losses: number;
  decisive: number;
  hitRate: number | null;
  gameContext: {
    dateIso: string;
    month: number;
    dayOfWeek: number;
    isPlayoff: boolean;
    seasonPhase: string;
    seriesState: string | null;
    eliminationFlag: boolean | null;
    paceProjection: number | null;
    parkFactor: number | null;
  } | null;
}

export interface ModelAuditSport {
  sport: "nba" | "mlb";
  sampleSize: {
    decisive: number;
    dates: number;
    newestDate: string | null;
    oldestDate: string | null;
  };
  lifetime: { wins: number; losses: number; hitRate: number | null };
  byDate: ModelAuditDateRow[];
  byMarket: ModelAuditMarket[];
  bySide: BucketRow[];
  byMarketSide: Array<{
    market: string;
    side: string;
    wins: number;
    losses: number;
    decisive: number;
    hitRate: number | null;
  }>;
  byConfidence: BucketRow[];
  byEdgeBand: BucketRow[];
  byEdgeQuartile: ModelAuditQuartile[];
  byBookmaker: BucketRow[];
  perGameDispersion: ModelAuditDispersion;
  weakCohorts: ModelAuditCohort[];
  strongCohorts: ModelAuditCohort[];
}

export interface ModelAuditArtifact {
  generatedAt: string;
  sports: {
    nba: ModelAuditSport;
    mlb: ModelAuditSport;
    cross: {
      wins: number;
      losses: number;
      decisive: number;
      hitRate: number | null;
      newestDate: string | null;
    };
  };
}

let _modelAuditCache: ModelAuditArtifact | null | undefined;

export function loadModelAudit(): ModelAuditArtifact | null {
  if (_modelAuditCache !== undefined) return _modelAuditCache;
  if (!fs.existsSync(MODEL_AUDIT_PATH)) {
    _modelAuditCache = null;
    return null;
  }
  try {
    const raw = fs.readFileSync(MODEL_AUDIT_PATH, "utf-8");
    _modelAuditCache = JSON.parse(raw) as ModelAuditArtifact;
  } catch {
    _modelAuditCache = null;
  }
  return _modelAuditCache;
}

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
      const strongerRate = stronger === "NBA" ? nba.hitRate : mlb.hitRate;
      const otherRate = stronger === "NBA" ? mlb.hitRate : nba.hitRate;
      const strongerN =
        stronger === "NBA" ? nba.totalDecisive : mlb.totalDecisive;
      const otherN = stronger === "NBA" ? mlb.totalDecisive : nba.totalDecisive;
      // Re-tune the wording once the gap collapses to "marginal". The
      // old "model leading" headline implied a confident edge that the
      // current 53.7% / 50.3% split does not support.
      const marginal = Math.abs(d) < 8;
      notes.push({
        weight: weightFor(Math.min(nba.totalDecisive, mlb.totalDecisive)),
        headline: marginal
          ? `${stronger} marginally above coin flip; ${stronger === "NBA" ? "MLB" : "NBA"} essentially flat`
          : `${stronger} model leading on settled audit`,
        body: marginal
          ? `${stronger} sits at ${pct(strongerRate)} on ${strongerN} decisive; the other sport at ${pct(otherRate)} on ${otherN}. The gap is real but small — treat as a calibration lean only, not a quality claim.`
          : `${stronger} settled at ${pct(strongerRate)} on ${strongerN} picks; the other sport sits at ${pct(otherRate)} on ${otherN}. Treat the gap as a calibration lean — the denominator is still small.`,
      });
    } else if (
      nba.totalDecisive >= 200 &&
      mlb.totalDecisive >= 200
    ) {
      // Both sports near coin flip on real samples — surface the
      // honest framing so readers don't infer an edge that isn't there.
      notes.push({
        weight: "signal",
        headline: "Both sports near coin flip on settled audit",
        body: `NBA at ${pct(nba.hitRate)} on ${nba.totalDecisive} decisive; MLB at ${pct(mlb.hitRate)} on ${mlb.totalDecisive}. Neither sport is statistically ahead at this sample size.`,
      });
    }
  }

  // ─── single-game dispersion alert ───────────────────────────────
  // Use the JSON audit artifact when available. The dispersion stat
  // (stdev of per-game hit rate) is the most decision-relevant number
  // we publish — it tells readers a coin-flip-looking lifetime might
  // hide huge per-game swings. May 19's 33.8% collapse is exactly the
  // signal this note exists to surface.
  const audit = loadModelAudit();
  if (audit) {
    const nbaDisp = audit.sports.nba.perGameDispersion;
    if (
      nbaDisp.nGames >= 3 &&
      nbaDisp.stdev !== null &&
      nbaDisp.stdev >= 0.08 &&
      nbaDisp.minHit !== null &&
      nbaDisp.maxHit !== null
    ) {
      // Find the worst settled date inside byDate so we can name it
      // honestly. We name the date and rate, never claim a fix.
      const worstDate = audit.sports.nba.byDate.reduce<
        ModelAuditDateRow | null
      >(
        (acc, row) =>
          row.hitRate !== null &&
          (acc === null ||
            row.hitRate < (acc.hitRate ?? Number.POSITIVE_INFINITY))
            ? row
            : acc,
        null,
      );
      const stdevPp = (nbaDisp.stdev * 100).toFixed(1);
      const worstStr = worstDate?.hitRate
        ? ` Worst day: ${worstDate.date} at ${pct(worstDate.hitRate)} on ${worstDate.decisive} decisive picks.`
        : "";
      notes.push({
        weight: weightFor(audit.sports.nba.sampleSize.decisive),
        headline: "Single-game NBA hit-rate stdev is high",
        body: `Per-game NBA hit rate ranges from ${pct(nbaDisp.minHit)} to ${pct(nbaDisp.maxHit)} across ${nbaDisp.nGames} settled games — stdev ${stdevPp}pp.${worstStr} The model has no game-leverage / OT-pace input yet, so single-game swings stay this wide.`,
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

  // Path-forward note — honest review pointers grounded ONLY in
  // patterns the settled rows already show. No tuning recommendation;
  // no projected accuracy. The wording deliberately uses "audit"
  // and "review" verbs — not "improve" or "fix" — to keep the surface
  // descriptive, not predictive.
  const reviewLines: string[] = [];
  if (
    nba.hitRate !== null &&
    mlb.hitRate !== null &&
    nba.hitRate - mlb.hitRate >= 0.05 &&
    Math.min(nba.totalDecisive, mlb.totalDecisive) >= 60
  ) {
    reviewLines.push(
      "MLB model output reviewed against NBA's stronger settled performance",
    );
  }
  if (mlb.byMarket.length >= 2) {
    const weakestMlb = [...mlb.byMarket]
      .filter((b) => b.decisive >= 30 && b.hitRate !== null)
      .sort((a, b) => (a.hitRate ?? 0) - (b.hitRate ?? 0))[0];
    if (weakestMlb && (weakestMlb.hitRate ?? 0) < 0.5) {
      reviewLines.push(
        `${weakestMlb.label.toLowerCase()} market audited (${pct(weakestMlb.hitRate)} on ${weakestMlb.decisive})`,
      );
    }
  }
  // Edge-band review when the band the model normally trusts is
  // underperforming. Mid-edge bands flagged across either sport.
  const midBandUnder = (s: ReturnType<typeof summariseNba>) =>
    s.byEdgeBand.find(
      (b) =>
        b.label === "15–25pp" &&
        b.decisive >= 30 &&
        b.hitRate !== null &&
        b.hitRate < 0.5,
    );
  const midUnderMlb = midBandUnder(
    summariseMlbDirect(),
  );
  if (midUnderMlb) {
    reviewLines.push("15–25pp edge band on MLB watched for regression");
  }
  if (reviewLines.length > 0) {
    notes.push({
      weight: weightFor(total),
      headline: "What the audit is watching next",
      body: `${reviewLines.join(" · ")}. Calibration only — no model logic changes are made retroactively to chase past settled rows.`,
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

// Direct accessor used by buildCrossSportFraming's review-pointer
// helper. Kept inline so the helper doesn't expose an extra public
// API for the same data the cross-sport call already loads.
function summariseMlbDirect(): ReturnType<typeof summariseNba> {
  return summariseMlb();
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
