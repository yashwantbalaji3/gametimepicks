/**
 * UFC → MultiSportGameReport adapter. Turns one fight's REAL sportsbook moneyline (two-sided, de-vigged)
 * into the shared FreeSim report contract so `/ufc` renders the same spine every sport does.
 *
 * HONESTY (the entire reason this routes through the contract):
 *   • sourceMode is ALWAYS `market_implied_simulation`. UFC has NO independent fight model live, NO
 *     persisted Monte-Carlo artifact, NO run count. `publicClaims` are all false — the report can never
 *     claim an independent sim, a 10,000-run count, positive EV, or a model edge (validator-enforced).
 *   • The read is the DE-VIGGED sportsbook moneyline only. It NEVER surfaces the internal model's
 *     probability / edge as a public pick — those stay gated until `moneylineValidated` is truly true.
 *     This adapter does not even read the model fields.
 *   • Method / round / distance / KO-TKO / submission / decision are `provider_needed` — the connected
 *     Odds API MMA feed is h2h (moneyline) only. They are shown as roadmap, never as leans, never faked.
 *   • Settlement is the official fight result (win/loss). Model-adjusted picks require validation + founder
 *     approval before any public release.
 *
 * Pure: no fetch, no fs, no money, no settlement. Extensionless imports.
 */
import type { MultiSportGameReport, ReportMarket, ReportLean } from "./schema";
import { defaultClaimsFor } from "./schema";

export const UFC_SOURCE_LABEL = "Market-implied simulation";
export const UFC_SIM_NOTE =
  "This is a market-implied fight simulation from real moneyline odds, not an independent 10,000-run UFC model.";
/** A clear market favorite (de-vigged) must clear this to surface as a market-implied lean. */
export const UFC_LEAN_MIN_PROB = 0.58;
/** Within this of a coin-flip ⇒ "near pick'em", no favorite claimed. */
const PICKEM_BAND = 0.06;

export interface UfcOddsSide { name: string; price: number; impliedProbability: number }
export interface UfcOddsBout { eventId?: string; commenceTime?: string; fighters?: string[]; sides?: UfcOddsSide[] }
export interface UfcOddsArtifact { bouts?: UfcOddsBout[] }
export interface UfcProjectionRow {
  boutId?: string; fighter: string; opponent: string; oddsPrice?: number; marketImpliedProbability?: number;
}
export interface UfcProjectionsArtifact {
  eventName?: string; eventDate?: string; moneylineValidated?: boolean; projections?: UfcProjectionRow[];
}

const norm = (s: unknown): string => String(s ?? "").toLowerCase().replace(/[^a-z ]/g, "").trim();
const boutKey = (a: unknown, b: unknown): string => [norm(a), norm(b)].sort().join("|");
const american = (p: number): string => (p > 0 ? `+${p}` : `${p}`);
const pctOf = (v: number): string => `${Math.round(v * 100)}%`;
function inUnit(v: unknown): v is number { return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1; }

/** Index an odds artifact's bouts by their normalized two-fighter key for a clean projection join. */
export function indexOddsBouts(odds: UfcOddsArtifact | null | undefined): Map<string, UfcOddsBout> {
  const idx = new Map<string, UfcOddsBout>();
  for (const b of odds?.bouts ?? []) {
    const names = (b.sides ? b.sides.map((s) => s.name) : b.fighters ?? []).filter(Boolean);
    if (names.length >= 2) idx.set(boutKey(names[0], names[1]), b);
  }
  return idx;
}

/** Two-way no-vig normalization: pA/(pA+pB). Honest de-vig for a moneyline. */
function deVig(pA: number, pB: number): [number, number] {
  const s = pA + pB;
  return s > 0 ? [pA / s, pB / s] : [0.5, 0.5];
}

/**
 * Build a market-implied report for ONE fight. `bout` (its matched two-sided odds) yields the de-vigged
 * read; without it we fall back to the projection's single implied probability (opponent = complement).
 */
export function ufcFightToReport(
  proj: UfcProjectionRow,
  bout: UfcOddsBout | null | undefined,
  opts: { eventName: string; eventDate?: string; status?: MultiSportGameReport["status"]; moneylineValidated?: boolean },
): MultiSportGameReport {
  const fighter = proj.fighter;
  const opponent = proj.opponent;

  // Prefer the two-sided odds (real prices for both fighters) → a proper de-vig.
  const sideFor = (name: string): UfcOddsSide | undefined =>
    bout?.sides?.find((s) => norm(s.name) === norm(name));
  const sF = sideFor(fighter);
  const sO = sideFor(opponent);
  let probFighter: number;
  let probOpponent: number;
  let priceFighter: number | undefined = sF?.price ?? proj.oddsPrice;
  let priceOpponent: number | undefined = sO?.price;
  let deVigged = false;
  if (sF && sO && inUnit(sF.impliedProbability) && inUnit(sO.impliedProbability)) {
    [probFighter, probOpponent] = deVig(sF.impliedProbability, sO.impliedProbability);
    deVigged = true;
  } else {
    const p = inUnit(proj.marketImpliedProbability) ? (proj.marketImpliedProbability as number) : 0.5;
    probFighter = p;
    probOpponent = 1 - p;
  }

  const favIsFighter = probFighter >= probOpponent;
  const favName = favIsFighter ? fighter : opponent;
  const dogName = favIsFighter ? opponent : fighter;
  const favProb = favIsFighter ? probFighter : probOpponent;
  const favPrice = favIsFighter ? priceFighter : priceOpponent;
  const dogPrice = favIsFighter ? priceOpponent : priceFighter;
  const nearPickem = Math.abs(favProb - 0.5) < PICKEM_BAND;

  const markets: ReportMarket[] = [
    {
      key: "moneyline", label: "Moneyline (h2h)", available: true, status: "available", source: "the_odds_api_mma",
      oddsAmerican: favPrice ?? undefined,
      impliedProbability: deVigged ? undefined : (inUnit(proj.marketImpliedProbability) ? proj.marketImpliedProbability : undefined),
      noVigProbability: deVigged ? favProb : undefined,
    },
    { key: "method", label: "Method of victory", available: false, status: "provider_needed" },
    { key: "rounds", label: "Round betting / total rounds", available: false, status: "provider_needed" },
    { key: "distance", label: "Goes the distance", available: false, status: "provider_needed" },
  ];

  const winProbabilities = [
    { label: fighter, probability: probFighter },
    { label: opponent, probability: probOpponent },
  ];

  const mainRead = nearPickem
    ? {
        label: "Near pick'em — no clear market favorite",
        explanation: `The de-vigged moneyline sits close: ${fighter} ${pctOf(probFighter)}${priceFighter != null ? ` (${american(priceFighter)})` : ""} vs ${opponent} ${pctOf(probOpponent)}${priceOpponent != null ? ` (${american(priceOpponent)})` : ""}. Market-implied read · paper-only.`,
        paperOnly: true as const,
      }
    : {
        label: `Market-implied favorite: ${favName}${favPrice != null ? ` (${american(favPrice)})` : ""}`,
        confidence: deVigged ? "De-vigged market read" : "Market read",
        explanation: `The moneyline prices ${favName} at ${pctOf(favProb)} de-vigged${favPrice != null ? ` (${american(favPrice)})` : ""}; ${dogName} is the underdog${dogPrice != null ? ` at ${american(dogPrice)}` : ""}. Market-implied read · paper-only.`,
        paperOnly: true as const,
      };

  // A market-implied lean ONLY for a clear favorite — never a model pick, never method/round/distance.
  const topLeans: ReportLean[] =
    !nearPickem && favProb >= UFC_LEAN_MIN_PROB
      ? [{
          market: "moneyline",
          selection: `${favName} moneyline`,
          rationale: `Market-implied favorite · ${pctOf(favProb)} de-vigged · paper-only.`,
          confidence: "Market-implied",
          oddsAmerican: favPrice ?? undefined,
          settlementSupported: true,
          sourceMode: "market_implied_simulation",
        }]
      : [];

  const validated = opts.moneylineValidated === true;
  const keyTakeaways = [
    nearPickem
      ? `Market is near a coin-flip: ${fighter} ${pctOf(probFighter)} vs ${opponent} ${pctOf(probOpponent)} (de-vigged).`
      : `Market favors ${favName} — ${pctOf(favProb)} de-vigged${favPrice != null ? `, ${american(favPrice)}` : ""}.`,
    "Moneyline is the only market offered by the current feed — method / round / distance aren't offered yet.",
    validated
      ? "Model-adjusted pick is validated and available separately."
      : "Model-adjusted picks: validation in progress — showing the market-implied read only.",
    "Paper-only · educational · not betting advice.",
  ];

  return {
    schemaVersion: "1.0.0",
    sport: "ufc",
    slateDate: opts.eventDate ?? "",
    eventId: proj.boutId ?? boutKey(fighter, opponent),
    eventName: `${fighter} vs ${opponent}`,
    status: opts.status ?? "scheduled",
    sourceMode: "market_implied_simulation",
    sourceLabel: UFC_SOURCE_LABEL,
    publicClaims: defaultClaimsFor("market_implied_simulation"),
    marketSnapshot: { markets },
    simulationOutput: {
      headline: "Market-implied read",
      sourceMode: "market_implied_simulation",
      winProbabilities,
      notes: [
        UFC_SIM_NOTE,
        validated ? "" : "Model-adjusted picks: validation in progress.",
      ].filter(Boolean),
    },
    mainRead,
    topLeans,
    keyTakeaways,
    details: {
      methodology: [
        "Market-implied read: the de-vigged two-sided sportsbook moneyline, not an independent fight simulation.",
        "Model-adjusted pick stays internal until a no-leakage backtest threshold is met and founder-approved.",
      ],
      unavailableMarkets: ["Method of victory (KO/TKO · submission · decision)", "Round betting", "Goes the distance", "Exact round"],
      dataGaps: [
        `The Odds API MMA feed is moneyline (h2h) only for ${opts.eventName}.`,
        "No independent UFC simulator is live — this is a market read, not a model pick.",
      ],
      settlementNotes: [
        "Settles on the official fight result (win / loss).",
        "Model-adjusted picks require validation + founder approval before any public release.",
      ],
    },
  };
}

/**
 * Build one market-implied report per fight that has real moneyline odds, joining each projection to its
 * two-sided odds bout for a de-vig. Fights without odds are skipped (never faked).
 */
export function ufcEventToReports(
  v1Proj: UfcProjectionsArtifact | null | undefined,
  odds: UfcOddsArtifact | null | undefined,
  opts?: { status?: MultiSportGameReport["status"] },
): MultiSportGameReport[] {
  const rows = v1Proj?.projections ?? [];
  if (rows.length === 0) return [];
  const idx = indexOddsBouts(odds);
  const eventName = v1Proj?.eventName ?? "UFC";
  const eventDate = v1Proj?.eventDate;
  const validated = v1Proj?.moneylineValidated === true;
  return rows.map((p) =>
    ufcFightToReport(p, idx.get(boutKey(p.fighter, p.opponent)) ?? null, {
      eventName, eventDate, status: opts?.status, moneylineValidated: validated,
    }),
  );
}
