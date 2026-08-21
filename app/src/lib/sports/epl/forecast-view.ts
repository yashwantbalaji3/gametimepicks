/**
 * EPL FORECAST VIEW — the ONE reader for the public EPL forecast artifact (P188).
 *
 * /epl (the fixture list) and /epl/match/[slug] (the per-fixture report) both need the same rows.
 * Two loaders would be two chances to disagree about the same fixture, which is the shape of defect
 * this codebase keeps finding: a number built for one scope reused for a broader claim, or two
 * surfaces deriving the same quantity apart. So the parsing, the slug lookup and the "is this
 * fixture actually forecast" question are answered exactly once, here.
 *
 * Nothing in this module computes a probability. Every figure is read from the artifact that
 * `scripts/epl/build-epl-forecasts.mjs` wrote, which in turn read them off ONE exact score matrix —
 * so a page cannot print a total that disagrees with the 1X2 block beside it.
 *
 * WHAT THIS DELIBERATELY DOES NOT EXPOSE: any pick, rating, confidence score, or comparison against
 * a price. The artifact's market block is private (paid capture) and never reaches the public row.
 * The distribution IS the product.
 */
import fs from "node:fs";
import path from "node:path";

/** One over/under rung. Half lines only, so `over + under` is exactly 1 — no push is reachable. */
export interface EplLadderRung {
  line: number;
  over: number;
  under: number;
}

export interface EplScoreline {
  score: string;
  p: number;
}

export interface EplForecastRow {
  eventId: string;
  matchup: string;
  homeClub: string | null;
  awayClub: string | null;
  /** URL-safe id derived from the same fields as the canonical event id. */
  slug: string | null;
  kickoffUtc: string;
  matchweek: number | null;
  /** Qualification-ladder state. Only CURRENT_PRE_EVENT carries probabilities, by policy. */
  state: string;
  unavailableReason: string | null;
  probs: { home: number; draw: number; away: number } | null;
  expectedGoals: number | null;
  over25: number | null;
  coldStart: { home: boolean; away: boolean } | null;
  lambdas: { home: number; away: number } | null;
  totals: {
    expected: number;
    over25: number;
    under25: number;
    quantiles: { p10: number; p25: number; p50: number; p75: number; p90: number };
    distribution: number[];
    ladder: EplLadderRung[];
  } | null;
  teamGoals: {
    home: { expected: number; distribution: number[] };
    away: { expected: number; distribution: number[] };
  } | null;
  btts: { yes: number; no: number } | null;
  cleanSheet: { home: number; away: number } | null;
  doubleChance: { homeOrDraw: number; drawOrAway: number; homeOrAway: number } | null;
  margin: { expected: number; distribution: Array<{ margin: number; p: number }> } | null;
  topScorelines: EplScoreline[] | null;
  /** How much of the distribution the scoreline list accounts for — so the page can say what it omits. */
  topScorelinesMass: number | null;
  modelId: string | null;
}

export interface EplForecastSet {
  generatedAt: string;
  validation: string;
  trackRecord: string;
  note: string;
  counts: Record<string, number>;
  rows: EplForecastRow[];
}

const ARTIFACT = "public/data/soccer/epl/forecasts/latest.json";

/**
 * Read the committed public forecast set. Unreadable is ABSENT (null), never an empty-but-confident
 * page — a surface that cannot find its artifact must say so rather than render zero fixtures as
 * though the slate were empty.
 */
export function loadEplForecasts(): EplForecastSet | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), ARTIFACT), "utf8"));
    if (!raw || !Array.isArray(raw.rows)) return null;
    return raw as EplForecastSet;
  } catch {
    return null;
  }
}

/**
 * The rows that genuinely carry a distribution. A fixture the ladder could not price is NOT here —
 * it stays in `set.rows` with its reason so the fixture list can name it rather than drop it.
 */
export function forecastRows(set: EplForecastSet | null): EplForecastRow[] {
  return (set?.rows ?? []).filter((r) => r.state === "CURRENT_PRE_EVENT" && r.probs != null);
}

/** Rows the ladder declined to price, each carrying the reason it declined. Never silently dropped. */
export function unpricedRows(set: EplForecastSet | null): EplForecastRow[] {
  return (set?.rows ?? []).filter((r) => !(r.state === "CURRENT_PRE_EVENT" && r.probs != null));
}

/**
 * Only a fixture with a distribution AND a usable slug gets a page. A row without a slug is not
 * given a generated URL — a page that cannot identify its own fixture should not exist.
 */
export function reportableRows(set: EplForecastSet | null): EplForecastRow[] {
  return forecastRows(set).filter((r) => typeof r.slug === "string" && r.slug.length > 0);
}

export function findEplForecast(set: EplForecastSet | null, slug: string): EplForecastRow | null {
  return reportableRows(set).find((r) => r.slug === slug) ?? null;
}

export const eplMatchHref = (slug: string) => `/epl/match/${slug}/`;

/**
 * True when either side is running on the league-average baseline. Surfaced beside the numbers it
 * affects rather than in a footnote: a newly promoted club with no top-flight history has no fitted
 * strength, and a reader comparing two fixtures deserves to know which one rests on a stand-in.
 */
export const hasColdStart = (r: EplForecastRow) => Boolean(r.coldStart?.home || r.coldStart?.away);
