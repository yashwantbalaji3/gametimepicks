/**
 * MarketTicker — premium "market data strip" content generator.
 *
 * Pure functions only. Input shapes are plain objects taken from
 * existing loaders (`optimizer-summary.json`, NBA/MLB boards,
 * cricket boards). No new API calls. Server pages compose the
 * inputs once at request time and pass the result to
 * `<MarketTicker>`.
 *
 * Honesty rules (hard requirements from PR spec):
 *   - No banned betting copy ever. The `hasBannedTickerCopy` guard
 *     runs both during construction and over each final label.
 *   - Pending/empty settlement state → emit a "tracked publicly"
 *     note, never a fake hit rate.
 *   - Pre-toss cricket boards → "pre-toss · XI not final" caveat,
 *     not phantom totals.
 *   - Hit rate only surfaces when `decisive > 0`. We never
 *     substitute 0% when nothing decisive has settled.
 *   - Public parlay tracking starts 2026-05-27. Pre-era rows in any
 *     supplied summary are filtered out and the lifetime aggregate
 *     is recomputed from the remaining rows so we cannot leak a
 *     pre-era hit rate even if the caller passes the raw JSON.
 */
import {
  PUBLIC_PARLAY_RESULTS_START_DATE,
  isInPublicParlayEra,
  aggregateBuckets,
} from "./public-parlay-era";

export type MarketTickerTone =
  | "neutral"
  | "positive"
  | "warning"
  | "info";

export interface MarketTickerItem {
  id: string;
  icon?: string;
  label: string;
  value?: string;
  tone?: MarketTickerTone;
  href?: string;
}

// ---------------------------------------------------------------------------
// Banned-copy guard
// ---------------------------------------------------------------------------

/** Exact phrases the ticker must never surface, case-insensitive. The
 *  list is curated to the existing project-wide banned-copy contract
 *  surfaced in PR #110 / #111 review notes. */
export const BANNED_TICKER_PHRASES: readonly string[] = [
  "lock",
  "guaranteed",
  "free money",
  "can't miss",
  "cant miss",
  "risk-free",
  "risk free",
  "sharp money",
  "easy win",
  "easy money",
  "sure thing",
  "no-brainer",
  "no brainer",
];

/**
 * Returns true when the given string contains any banned phrase.
 * Used both as a runtime guard inside `buildMarketTickerItems` and
 * exported so tests can lock the contract.
 */
export function hasBannedTickerCopy(text: string): boolean {
  if (!text) return false;
  const haystack = text.toLowerCase();
  for (const needle of BANNED_TICKER_PHRASES) {
    // Word-aware check: avoid false positives ("lock" inside "block").
    const pattern = new RegExp(
      `(?:^|[^a-z])${needle.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(?:[^a-z]|$)`,
      "i",
    );
    if (pattern.test(haystack)) return true;
  }
  return false;
}

/** Trim whitespace + collapse internal runs. No HTML stripping —
 *  we never accept HTML into the ticker. */
export function normalizeTickerLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Input shapes (subset of the JSON files on disk)
// ---------------------------------------------------------------------------

export interface TickerSummaryBucket {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  decisive: number;
  hitRate: number | null;
}

export interface TickerOptimizerSummary {
  lifetime?: TickerSummaryBucket;
  bySport?: Record<string, TickerSummaryBucket>;
  byDate?: ReadonlyArray<{ date: string } & TickerSummaryBucket>;
}

export interface TickerNbaBoard {
  date?: string | null;
  leans?: ReadonlyArray<{ projection?: number | null }>;
  games?: ReadonlyArray<unknown>;
}

export interface TickerMlbBoard {
  date?: string | null;
  games?: ReadonlyArray<unknown>;
}

export interface TickerCricketMatch {
  shortName?: string | null;
  status?: string | null;
  home?: { name?: string | null; abbr?: string | null } | null;
  away?: { name?: string | null; abbr?: string | null } | null;
  markets?: {
    moneyline?: {
      projection?: "home" | "away" | null;
      confidence?: string | null;
      consensus?: {
        home?: number | null;
        away?: number | null;
        homeImpliedProb?: number | null;
        awayImpliedProb?: number | null;
      } | null;
    } | null;
  } | null;
}

export interface TickerCricketBoard {
  date?: string;
  matches?: ReadonlyArray<TickerCricketMatch>;
}

export interface BuildMarketTickerInput {
  /** Surface variant — different pages want different priorities. */
  surface: "home" | "projections" | "parlay_lab" | "results";
  optimizerSummary?: TickerOptimizerSummary | null;
  nba?: TickerNbaBoard | null;
  mlb?: TickerMlbBoard | null;
  cricket?: TickerCricketBoard | null;
}

// ---------------------------------------------------------------------------
// Item builders (small + pure)
// ---------------------------------------------------------------------------

function _nbaProjectionsItem(nba?: TickerNbaBoard | null): MarketTickerItem | null {
  const scored = (nba?.leans ?? []).filter(
    (l) => typeof l?.projection === "number",
  ).length;
  if (scored <= 0) return null;
  return {
    id: "nba-projections-count",
    icon: "🏀",
    label: `${scored} NBA projection${scored === 1 ? "" : "s"} live`,
    tone: "neutral",
    href: "/projections",
  };
}

function _mlbBoardItem(mlb?: TickerMlbBoard | null): MarketTickerItem | null {
  const games = (mlb?.games ?? []).length;
  if (games <= 0) return null;
  return {
    id: "mlb-board-active",
    icon: "⚾",
    label: `MLB board active · ${games} game${games === 1 ? "" : "s"}`,
    tone: "neutral",
    href: "/projections",
  };
}

function _cricketItems(
  cricket?: TickerCricketBoard | null,
): MarketTickerItem[] {
  const out: MarketTickerItem[] = [];
  for (const m of cricket?.matches ?? []) {
    const ml = m?.markets?.moneyline;
    const consensus = ml?.consensus;
    const projection = ml?.projection;
    // Pre-toss caveat is always emitted alongside the match — IPL
    // boards are pre-toss until the toss reveals the XI.
    const matchLabel = m?.shortName ?? "IPL match";
    const isPreToss = (m?.status ?? "").toLowerCase() !== "post_toss";
    if (
      projection &&
      consensus &&
      typeof consensus[projection === "home" ? "homeImpliedProb" : "awayImpliedProb"] === "number"
    ) {
      const teamObj = projection === "home" ? m?.home : m?.away;
      const teamAbbr = (teamObj?.abbr ?? teamObj?.name ?? "") as string;
      const odds = consensus[projection === "home" ? "home" : "away"];
      const impliedRaw = consensus[
        projection === "home" ? "homeImpliedProb" : "awayImpliedProb"
      ] as number;
      const oddsStr = typeof odds === "number"
        ? odds > 0
          ? `+${Math.round(odds)}`
          : `${Math.round(odds)}`
        : "—";
      const pct = `${(impliedRaw * 100).toFixed(1)}%`;
      out.push({
        id: `cricket-ml-${matchLabel}`,
        icon: "🏏",
        label: `IPL · ${matchLabel} · ${teamAbbr} ${oddsStr}`,
        value: `${pct} consensus`,
        tone: "info",
        href: "/projections",
      });
    } else {
      out.push({
        id: `cricket-pre-toss-${matchLabel}`,
        icon: "🏏",
        label: `IPL · ${matchLabel} · pre-toss · XI not final`,
        tone: "warning",
        href: "/projections",
      });
    }
  }
  return out;
}

function _settledItems(
  summary?: TickerOptimizerSummary | null,
): MarketTickerItem[] {
  const out: MarketTickerItem[] = [];
  // Only emit anything when the caller actually supplied a summary
  // payload. Truly empty input must produce zero items so the
  // ticker can hide gracefully when no data has loaded.
  if (!summary) return out;
  // Filter byDate to the public era and recompute lifetime from the
  // surviving rows so pre-era numbers can never reach the ticker even
  // when the caller passes the raw summary JSON.
  const postEraByDate = (summary.byDate ?? []).filter((d) =>
    isInPublicParlayEra(d.date),
  );
  const lifetime = aggregateBuckets(postEraByDate);
  if (lifetime.decisive <= 0) {
    // No decisive slips in the new tracking era yet — emit an honest
    // fresh-era note instead of a fake rate or a pre-era leak.
    out.push({
      id: "results-tracked",
      icon: "🧪",
      label: `Public parlay tracking starts ${PUBLIC_PARLAY_RESULTS_START_DATE}`,
      tone: "info",
      href: "/results",
    });
    return out;
  }
  const rate = lifetime.hitRate;
  const ratePct =
    typeof rate === "number" ? `${(rate * 100).toFixed(1)}%` : null;
  if (ratePct) {
    out.push({
      id: "results-hitrate",
      icon: "📊",
      label: "Suggested parlays · decisive hit rate",
      value: ratePct,
      tone: rate != null && rate >= 0.25 ? "positive" : "warning",
      href: "/results",
    });
  }
  // Most recent post-era date with at least one decisive slip.
  const recent = postEraByDate
    .slice()
    .filter((d) => (d.decisive ?? 0) > 0)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
  if (recent) {
    out.push({
      id: `results-date-${recent.date}`,
      icon: recent.wins > 0 ? "✅" : "📉",
      label: `${recent.date} · ${recent.wins}W · ${recent.losses}L`,
      tone: recent.wins > recent.losses ? "positive" : "warning",
      href: "/results",
    });
  }
  return out;
}

function _safetyNoteItems(surface: string): MarketTickerItem[] {
  // Surface-aware safety notes. Each page only sees the notes it
  // can honestly act on.
  const out: MarketTickerItem[] = [];
  if (surface === "home" || surface === "parlay_lab") {
    // PR `fix/ui-final-polish-pass` — replaced legacy lane jargon
    // (Anchor / Core / Swing) with the public risk-section names the
    // user actually sees today (Low / Medium / High / Longshot).
    out.push({
      id: "lane-variance-anchor-core",
      icon: "🛡",
      label: "Low & Medium Risk sections filtered for lower variance",
      tone: "info",
    });
    out.push({
      id: "lane-swing-hidden",
      icon: "⚠",
      label: "Longshot section labeled higher variance",
      tone: "warning",
    });
  }
  if (surface === "parlay_lab") {
    out.push({
      id: "lab-custom-not-tracked",
      icon: "🧪",
      label: "Custom Builder slips are not officially tracked",
      tone: "info",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the ordered list of ticker items for the given surface from
 * the supplied data sources. Order is curated per surface (priority
 * roughly: live data → safety → results-tracked note).
 */
export function buildMarketTickerItems(
  input: BuildMarketTickerInput,
): MarketTickerItem[] {
  const items: MarketTickerItem[] = [];
  // PR #113: `cricket` input is intentionally destructured but never
  // consumed. The cricket loader stays in the codebase and the type
  // is preserved so a future PR can re-enable cricket without a
  // schema migration — but the build pipeline emits zero cricket
  // items in this version. The helper preserves dead-code-friendly
  // shape for forward compatibility.
  const { surface, nba, mlb, optimizerSummary } = input;
  void input.cricket;

  // Surface-specific ordering.
  if (surface === "projections") {
    const nbaItem = _nbaProjectionsItem(nba);
    if (nbaItem) items.push(nbaItem);
    const mlbItem = _mlbBoardItem(mlb);
    if (mlbItem) items.push(mlbItem);
    // Cricket items intentionally omitted (PR #113).
    // Skip lifetime hit-rate here — projections are pregame focus.
    // Only show the "fresh tracking era" honest note when the caller
    // actually supplied a summary AND nothing decisive has settled
    // in the public era yet.
    if (optimizerSummary) {
      const postEraDecisive = aggregateBuckets(
        (optimizerSummary.byDate ?? []).filter((d) =>
          isInPublicParlayEra(d.date),
        ),
      ).decisive;
      if (postEraDecisive === 0) {
        items.push({
          id: "results-tracked",
          icon: "🧪",
          label: `Public parlay tracking starts ${PUBLIC_PARLAY_RESULTS_START_DATE}`,
          tone: "info",
          href: "/results",
        });
      }
    }
  } else if (surface === "home") {
    items.push(..._settledItems(optimizerSummary));
    const nbaItem = _nbaProjectionsItem(nba);
    if (nbaItem) items.push(nbaItem);
    const mlbItem = _mlbBoardItem(mlb);
    if (mlbItem) items.push(mlbItem);
    // Cricket items intentionally omitted (PR #113).
    items.push(..._safetyNoteItems("home"));
  } else if (surface === "parlay_lab") {
    items.push(..._safetyNoteItems("parlay_lab"));
    items.push(..._settledItems(optimizerSummary));
    const nbaItem = _nbaProjectionsItem(nba);
    if (nbaItem) items.push(nbaItem);
    const mlbItem = _mlbBoardItem(mlb);
    if (mlbItem) items.push(mlbItem);
  } else if (surface === "results") {
    items.push(..._settledItems(optimizerSummary));
  }

  // Normalize + ban-check + dedupe.
  const cleaned: MarketTickerItem[] = [];
  const seenIds = new Set<string>();
  for (const it of items) {
    const label = normalizeTickerLabel(it.label);
    const value = it.value ? normalizeTickerLabel(it.value) : undefined;
    if (!label) continue;
    if (hasBannedTickerCopy(label) || (value && hasBannedTickerCopy(value))) {
      // Defensive — should never trigger from our own generators, but
      // future code paths can't sneak banned phrasing past this gate.
      continue;
    }
    if (seenIds.has(it.id)) continue;
    seenIds.add(it.id);
    cleaned.push({ ...it, label, ...(value ? { value } : {}) });
  }
  return cleaned;
}

/**
 * Drop duplicate ids from a pre-built list. Stable — keeps the
 * first occurrence.
 */
export function dedupeTickerItems(
  items: ReadonlyArray<MarketTickerItem>,
): MarketTickerItem[] {
  const seen = new Set<string>();
  const out: MarketTickerItem[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}
