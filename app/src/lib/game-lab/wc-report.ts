/**
 * World Cup Game Lab report — a PURE derivation of one fixture's model-vs-market
 * rows into a scannable "what the model reads" view. No fetch, no fs, no money,
 * no settlement, no card-approval. It reshapes only the REAL fields the World
 * Cup projections artifact already carries (see `WcProjection` in
 * ../world-cup/projections). This mirrors the MLB Game Lab (./mlb-report) —
 * same view shape, same guards, same signal buckets, same product-mapping /
 * unavailable idiom — adapted to WC TEAM markets.
 *
 * HONESTY CONTRACT (enforced by the accompanying test):
 *   • WC is ODDS-ONLY / MARKET-IMPLIED. There is NO independent stat model and
 *     NO lineup layer — the "model" is a de-vigged read of the sportsbook price.
 *     Because model ≈ market, MANY rows carry edgePct ≈ 0 and therefore bucket
 *     honestly as neutral/opposed. That is CORRECT — this module NEVER inflates
 *     an edge, invents form, or manufactures conviction.
 *   • There is NO persisted per-game Monte-Carlo artifact. This module NEVER
 *     claims "10,000 simulations", "N runs", "simulated", or a per-game
 *     "distribution". The `unavailable[]` list names exactly the things we do
 *     NOT have (scoreline / margin / total histograms, corners, cards,
 *     first-goal-scorer, xG / shots, player-prop distributions, AND — since WC
 *     has no stat layer — a per-team recent-form model) and labels each
 *     "not yet simulated / no persisted artifact / odds-only".
 *   • Settlement support is `regulation_90`: 90-MINUTE markets only. Extra time
 *     and penalties DO NOT count. That caveat is carried in `whatBreaksIt[]`.
 *   • Product mapping is DESCRIPTIVE / LINK-ONLY — it links to a product page,
 *     it never approves, places, or implies a placed card.
 *
 * SIGNAL THRESHOLDS (reused verbatim from ./mlb-report so a test can pin one
 * source of truth):
 *   • supported ⇔ edgePct >= SUPPORTED_EDGE_MIN (5) AND confidence is NOT a
 *     low-conviction label. WC confidence labels are "Lean" / "Watchlist" /
 *     "High" (NOT MLB's Low / Medium / High). We treat BOTH "Watchlist" AND
 *     "Lean" as low-conviction — a Lean/Watchlist edge is a watch, not a read —
 *     so neither can ever be called "supported", exactly as MLB refuses to call
 *     a "Low" lean supported.
 *   • opposed   ⇔ edgePct <= OPPOSED_EDGE_MAX (0) — the model reads at or
 *     against the posted price (odds-only: this is the common case).
 *   • neutral   ⇔ everything in between (incl. a >=5 edge on a Lean/Watchlist,
 *     which we will NOT call supported). Bands are inclusive at both bounds and
 *     mutually exclusive: a 5%+ edge on a low-conviction row lands in neutral,
 *     never in two buckets at once.
 *
 * NOTE on edgePct units: the artifact stores edgePct as a PERCENTAGE number
 * already (e.g. 0.04 = 0.04%, 5 = 5%), so the SUPPORTED_EDGE_MIN / OPPOSED_EDGE_MAX
 * thresholds apply directly, same as MLB.
 */
import type { loadWorldCupProjections } from "../world-cup/projections";
import { SUPPORTED_EDGE_MIN, OPPOSED_EDGE_MAX } from "./mlb-report";

/** The projections payload this report consumes (return type of the loader). */
type WcProjectionsPayload = NonNullable<ReturnType<typeof loadWorldCupProjections>>;
/** One (game, market) row on that payload. */
type WcProjectionRow = WcProjectionsPayload["matches"][number];

/** A game whose best |edgePct| clears this is "strong" enough to note a DERIVED
 *  Top-10 link. Descriptive only — not an endorsement of a card. */
export const STRONG_EDGE_MIN = SUPPORTED_EDGE_MIN;
/** How many rows the "biggest leans" ladder shows. */
export const BIGGEST_LEANS_N = 8;
/** Confidence labels we will NEVER treat as "supported" — WC is odds-only, so a
 *  Lean/Watchlist read is a watch, not a conviction. */
export const WC_LOW_CONVICTION_CONFIDENCE = ["Lean", "Watchlist"] as const;

export type WcLeanSignal = "supported" | "neutral" | "opposed";

/** One three-way / two-way market outcome, verbatim from the row's `outcomes[]`. */
export interface WcOutcome {
  label: string | null;
  modelProb: number | null;
  marketProb: number | null;
  americanOdds: number | null;
}

/** One (game, market) row, reshaped for the Game Lab view. Every field traces to
 *  a real projection key; nothing is fabricated. */
export interface WcLeanRow {
  id: string;
  market: string | null;
  /** Friendly market name ("Moneyline (90')", "Double chance", …). */
  marketLabel: string | null;
  /** The pick code, verbatim ("home" | "away" | "1X" | "under" | "no" | …). */
  pick: string | null;
  /** Human-readable pick ("Argentina or Draw", "Under 2.5", …). */
  pickLabel: string | null;
  line: number | null;
  americanOdds: number | null;
  modelProbability: number | null;
  marketProbability: number | null;
  edgePct: number | null;
  confidence: string | null;
  /** Always "regulation_90" for WC — 90-minute grading; ET/PENs don't count. */
  settlementSupport: string | null;
  outcomes: WcOutcome[];
  bankBuilderEligible: boolean;
  parlayEligible: boolean;
  riskTier: string | null;
  caveats: string[];
  /** Derived from edgePct + confidence (see thresholds above). */
  signal: WcLeanSignal;
}

export interface WcGameLabProductLink {
  label: string;
  href: string;
  note: string;
}

export interface WcGameLabUnavailable {
  label: string;
  reason: string;
}

export interface WcGameLabView {
  // ── game meta ──
  matchId: string;
  homeTeam: string | null;
  awayTeam: string | null;
  homeCode: string | null;
  awayCode: string | null;
  venue: string | null;
  stage: string | null;
  group: string | null;
  kickoffUtc: string | null;
  /** Always true — this report is built purely from odds-implied projections. */
  oddsOnly: true;

  marketCount: number;
  rows: WcLeanRow[];
  /** Rows sorted by descending |edgePct|, capped to BIGGEST_LEANS_N. */
  biggestLeans: WcLeanRow[];
  supported: WcLeanRow[];
  neutral: WcLeanRow[];
  opposed: WcLeanRow[];

  /** Plain-language reads. Honest: usually "model sits on the price". */
  whatModelLikes: string[];
  /** The honest downside — MUST include the odds-only disclaimer AND the
   *  "90-minute regulation only — extra time / penalties do not count" caveat. */
  whatBreaksIt: string[];

  /** LINK-ONLY, artifact-proven. Never a placed card. */
  productMapping: WcGameLabProductLink[];
  /** The honest "not yet simulated / odds-only" placeholders. */
  unavailable: WcGameLabUnavailable[];
}

// ── number / value guards (never NaN, never undefined leaking through) ──
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function boolFlag(v: unknown): boolean {
  return v === true;
}
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
/** |edgePct| for sorting/ranking — null edges sort last. */
function absEdge(r: WcLeanRow): number {
  return r.edgePct == null ? -1 : Math.abs(r.edgePct);
}
/** True when the confidence label is a WC low-conviction watch (never "supported"). */
function isLowConviction(confidence: string | null): boolean {
  return confidence == null || (WC_LOW_CONVICTION_CONFIDENCE as readonly string[]).includes(confidence);
}

/** Friendly market label for a WC market key. Unknown keys pass through. */
const MARKET_LABEL: Record<string, string> = {
  moneyline_90: "Moneyline (90')",
  double_chance: "Double chance",
  draw_no_bet: "Draw no bet",
  match_total_goals: "Match total goals",
  btts: "Both teams to score",
};
export function wcMarketLabel(key: string | null): string | null {
  if (key == null) return null;
  return MARKET_LABEL[key] ?? key;
}

/** Classify a row into supported / neutral / opposed from the documented thresholds.
 *  A low-conviction confidence ("Lean"/"Watchlist") can never be "supported". */
export function classifyWcLeanSignal(
  edgePct: number | null,
  confidence: string | null,
): WcLeanSignal {
  if (edgePct == null) return "neutral";
  if (edgePct <= OPPOSED_EDGE_MAX) return "opposed";
  if (edgePct >= SUPPORTED_EDGE_MIN && !isLowConviction(confidence)) return "supported";
  return "neutral";
}

/** Round to one decimal for copy; guards null. */
function edge1(v: number | null): string {
  if (v == null) return "—";
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(1)}%`;
}
/** 0..1 probability → integer percent string; guards null. */
function prob0(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

/** Build the Game Lab view for one WC fixture, or null when no rows exist for
 *  the given matchId. LINK-ONLY product mapping; `opts.inWcSpecials` is proven
 *  by the caller from world-cup-specials.json (this module never reads it). */
export function buildWcGameLabReport(
  projections: WcProjectionsPayload | null | undefined,
  matchId: string,
  opts?: { inWcSpecials?: boolean },
): WcGameLabView | null {
  if (!projections) return null;
  const wanted = String(matchId);
  const matchRows = arr<WcProjectionRow>(projections.matches).filter(
    (m) => m != null && String((m as { matchId?: unknown }).matchId) === wanted,
  );
  if (matchRows.length === 0) return null;

  const rows: WcLeanRow[] = matchRows.map((m, idx) => {
    // Cast via unknown: the artifact carries fields (settlementSupport,
    // bankBuilderEligible, stage, venue, homeCode/awayCode) beyond the typed
    // WcProjection, and every read below is null-safe through the guards.
    const rec = m as unknown as Record<string, unknown>;
    const edgePct = num(rec.edgePct);
    const confidence = str(rec.confidence);
    const market = str(rec.market);
    const outcomes: WcOutcome[] = arr<Record<string, unknown>>(rec.outcomes).map((o) => ({
      label: str(o.label),
      modelProb: num(o.modelProbability),
      marketProb: num(o.marketProbability),
      americanOdds: num(o.americanOdds),
    }));
    return {
      id: str(rec.id) ?? `${wanted}-${market ?? "market"}-${idx}`,
      market,
      marketLabel: wcMarketLabel(market),
      pick: str(rec.pick),
      pickLabel: str(rec.pickLabel),
      line: num(rec.line),
      americanOdds: num(rec.americanOdds),
      modelProbability: num(rec.modelProbability),
      marketProbability: num(rec.marketProbability),
      edgePct,
      confidence,
      settlementSupport: str(rec.settlementSupport) ?? "regulation_90",
      outcomes,
      bankBuilderEligible: boolFlag(rec.bankBuilderEligible),
      parlayEligible: boolFlag(rec.parlayEligible),
      riskTier: str(rec.riskTier),
      caveats: arr<unknown>(rec.caveats).filter((c): c is string => typeof c === "string"),
      signal: classifyWcLeanSignal(edgePct, confidence),
    };
  });

  const biggestLeans = [...rows]
    .sort((a, b) => absEdge(b) - absEdge(a))
    .slice(0, BIGGEST_LEANS_N);

  const supported = rows.filter((r) => r.signal === "supported");
  const neutral = rows.filter((r) => r.signal === "neutral");
  const opposed = rows.filter((r) => r.signal === "opposed");

  // Rank supported by |edge| for the plain-language bullets.
  const topSupported = [...supported].sort((a, b) => absEdge(b) - absEdge(a));

  // ── whatModelLikes: pick, model vs market prob, edge, confidence ──
  const whatModelLikes: string[] = topSupported.slice(0, 5).map((r) => {
    const side = r.pickLabel ?? r.marketLabel ?? "the market side";
    const mkt = r.marketLabel ?? "market";
    const conf = r.confidence ?? "—";
    return [
      `${side} (${mkt}): ${prob0(r.marketProbability)} de-vigged`,
      `edge ${edge1(r.edgePct)} at ${conf} confidence`,
    ].join(" · ");
  });
  if (whatModelLikes.length === 0) {
    whatModelLikes.push(
      "No market cleared the supported bar for this game (edge ≥ 5% at above-Watchlist confidence). This is expected: WC is odds-only, so the de-vigged read sits on the posted prices rather than beating them.",
    );
  }

  // ── whatBreaksIt: honest downside — odds-only + 90' regulation ALWAYS ──
  const whatBreaksIt: string[] = [];
  whatBreaksIt.push(
    "Odds-only: this read is the de-vigged sportsbook price, NOT an independent stat model — there is no lineup, form, or xG layer, so most edges sit near zero by construction.",
  );
  whatBreaksIt.push(
    "90-minute regulation only — extra time and penalties do NOT count. In a knockout, a tie after 90' can still eliminate a team the market favored while these markets settle on the 90' score.",
  );
  if (opposed.length > 0) {
    const oppNames = opposed
      .slice(0, 3)
      .map((r) => r.pickLabel ?? r.marketLabel ?? "market")
      .join(", ");
    whatBreaksIt.push(
      `The de-vigged read sits at or against the posted price on ${opposed.length} market(s) (edge ≤ 0%): ${oppNames}.`,
    );
  }
  const flagged = rows.filter((r) => r.riskTier != null && r.riskTier !== "Low");
  if (flagged.length > 0) {
    const tiers = [...new Set(flagged.map((r) => r.riskTier).filter((t): t is string => t != null))];
    whatBreaksIt.push(
      `Elevated risk tier on ${flagged.length} market(s): ${tiers.join(", ")} — thinner / higher-variance markets.`,
    );
  }
  // Surface any row-level caveats verbatim (de-duplicated), so nothing hides.
  const rowCaveats = [...new Set(rows.flatMap((r) => r.caveats))].slice(0, 3);
  for (const c of rowCaveats) whatBreaksIt.push(c);
  whatBreaksIt.push(
    "Odds and lines move; a market-implied probability is a central read, not an outcome.",
  );

  // ── productMapping: LINK-ONLY, artifact-proven. Never approves a card. ──
  const bestEdge = biggestLeans.length > 0 ? absEdge(biggestLeans[0]) : -1;
  const anyBankBuilder = rows.some((r) => r.bankBuilderEligible === true);
  const productMapping: WcGameLabProductLink[] = [
    {
      label: "Parlay Lab",
      href: "/picks",
      note:
        rows.some((r) => r.parlayEligible)
          ? "Explore and build paper parlays from this slate's eligible legs. Link only — nothing is placed."
          : "No parlay-eligible market for this game yet — the Parlay Lab shows the rest of the slate. Link only.",
    },
    {
      label: "Track Record",
      href: "/results",
      note: "See the official paper-card track record. This market read is not itself part of that record — soccer market results are tracked separately once a soccer ledger exists.",
    },
  ];
  if (opts?.inWcSpecials === true) {
    productMapping.push({
      label: "World Cup Specials",
      href: "/world-cup-specials",
      note: "This fixture contributes a leg to today's paper World Cup Specials. Explore link only — the Specials card is a paper study, not a placed bet.",
    });
  }
  if (anyBankBuilder) {
    productMapping.push({
      label: "Bank Builder",
      href: "/bank-builder",
      note: "A market on this game is Bank-Builder-eligible today. Explore link only — eligibility is not approval, and no card is placed here.",
    });
  }
  if (bestEdge >= STRONG_EDGE_MIN) {
    productMapping.push({
      label: "Top 10",
      href: "/picks",
      note: `Derived: this game's strongest de-vigged read carries a ${edge1(biggestLeans[0].edgePct)} gap vs the raw price, high enough to surface among the day's Top 10. Descriptive ranking, not an endorsement.`,
    });
  }

  // ── unavailable: honest "not yet simulated / odds-only" placeholders ──
  const NOT_SIMMED = "Coming soon — requires a sampled simulation artifact.";
  const ODDS_ONLY = "Coming soon — requires a player / stats provider; not available from odds alone.";
  const unavailable: WcGameLabUnavailable[] = [
    { label: "Scoreline distribution", reason: NOT_SIMMED },
    { label: "Goal-margin histogram", reason: NOT_SIMMED },
    { label: "Total-goals histogram", reason: NOT_SIMMED },
    { label: "Corners", reason: NOT_SIMMED },
    { label: "Cards", reason: NOT_SIMMED },
    { label: "First goal scorer", reason: NOT_SIMMED },
    { label: "xG / shots", reason: ODDS_ONLY },
    { label: "Player-prop distribution", reason: NOT_SIMMED },
    { label: "Per-team recent-form model", reason: ODDS_ONLY },
  ];

  const first = matchRows[0] as unknown as Record<string, unknown>;
  return {
    matchId: wanted,
    homeTeam: str(first.homeTeam),
    awayTeam: str(first.awayTeam),
    homeCode: str(first.homeCode),
    awayCode: str(first.awayCode),
    venue: str(first.venue),
    stage: str(first.stage),
    group: str(first.group),
    kickoffUtc: str(first.kickoffUtc),
    oddsOnly: true,
    marketCount: rows.length,
    rows,
    biggestLeans,
    supported,
    neutral,
    opposed,
    whatModelLikes,
    whatBreaksIt,
    productMapping,
    unavailable,
  };
}
