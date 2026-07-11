/**
 * WORLD CUP → MultiSportGameReport adapter. Reshapes the PURE, already-honest World Cup Game Lab view
 * (../game-lab/wc-report — a de-vigged read of the sportsbook price, NOT an independent model) into the
 * shared FreeSim report contract so the WC game page renders the same spine every sport does.
 *
 * HONESTY (the whole point of routing through the contract):
 *   • sourceMode is ALWAYS `market_implied_simulation` — soccer has no independent stat model, no lineup
 *     layer, no persisted Monte-Carlo artifact. The report can NEVER claim an independent sim, a
 *     10,000-run count, positive EV, or a model edge (`defaultClaimsFor` returns all-false and the
 *     validator rejects any over-claim).
 *   • Every market/lean traces to a real projection row; nothing is fabricated. Scorers / corners /
 *     cards / xG stay in `details.unavailableMarkets` as roadmap, never as leans.
 *   • Settlement is 90-minute regulation only (ET/PENs don't count) — carried in `settlementNotes`.
 *
 * Pure: no fetch, no fs, no money, no settlement. Extensionless imports.
 */
import type { WcGameLabView, WcLeanRow } from "../game-lab/wc-report";
import type { MultiSportGameReport, ReportMarket, ReportLean } from "./schema";
import { defaultClaimsFor } from "./schema";

export const WC_SOURCE_LABEL = "Market-implied simulation";

/** The honest note that must ride on every soccer simulation output — no run count, no independent model. */
export const WC_SIM_NOTE =
  "This is a market-implied simulation — a de-vigged read of the sportsbook price, not an independent 10,000-run soccer model.";
const WC_REG_NOTE =
  "90-minute regulation only — extra time and penalties do not count toward these markets.";

function pct(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `${Math.round(v * 100)}%` : "—";
}
function inUnit(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

/** One projection row → a snapshot market (always available — it's a real, odds-backed row). */
function rowToMarket(r: WcLeanRow): ReportMarket {
  return {
    key: r.market ?? r.id,
    label: r.marketLabel ?? r.market ?? "Market",
    available: true,
    status: "available",
    source: "odds",
    oddsAmerican: r.americanOdds ?? undefined,
    impliedProbability: inUnit(r.marketProbability) ? r.marketProbability : undefined,
    noVigProbability: inUnit(r.marketProbability) ? r.marketProbability : undefined,
  };
}

/** A `supported` row → a settlement-supported lean (WC 90' markets settle on the regulation score). */
function rowToLean(r: WcLeanRow): ReportLean {
  return {
    market: r.market ?? r.id,
    selection: r.pickLabel ?? r.marketLabel ?? "—",
    rationale:
      `De-vigged read${r.marketProbability != null ? ` ${pct(r.marketProbability)}` : ""}` +
      `${r.edgePct != null ? ` · edge ${r.edgePct >= 0 ? "+" : ""}${r.edgePct.toFixed(1)}%` : ""}`,
    confidence: r.confidence ?? undefined,
    oddsAmerican: r.americanOdds ?? undefined,
    settlementSupported: (r.settlementSupport ?? "regulation_90") === "regulation_90",
    sourceMode: "market_implied_simulation",
  };
}

/**
 * Build a validated-shape MultiSportGameReport for one World Cup fixture from its Game Lab view.
 * `status` defaults to "scheduled" (WC is display-only — there is no committed live/final score, and this
 * adapter NEVER fabricates one). Pass a real status only when a committed source provides it.
 */
export function wcGameLabViewToReport(
  view: WcGameLabView,
  opts: { slateDate: string; status?: MultiSportGameReport["status"] },
): MultiSportGameReport {
  const markets = view.rows.map(rowToMarket);

  // The market-implied win/draw/loss read comes from the moneyline row's de-vigged outcomes.
  const moneyline = view.rows.find((r) => r.market === "moneyline_90");
  const winProbabilities = (moneyline?.outcomes ?? [])
    .filter((o) => o.label != null && inUnit(o.marketProb))
    .map((o) => ({ label: o.label as string, probability: o.marketProb as number }));

  // Main read: the strongest supported lean, else an honest "sits on the price" pass.
  const topLeanRows = view.supported;
  const lead = topLeanRows[0];
  const mainRead = lead
    ? {
        label: `${lead.pickLabel ?? lead.marketLabel ?? "Lean"}${lead.marketLabel ? ` · ${lead.marketLabel}` : ""}`,
        confidence: lead.confidence ?? undefined,
        explanation: view.whatModelLikes[0] ?? "Market-implied lean.",
        paperOnly: true as const,
      }
    : {
        label: "No strong lean — the market-implied read sits on the posted price",
        explanation:
          view.whatModelLikes[0] ??
          "No market cleared the supported bar. WC is odds-only, so the read passes rather than forcing a weak play.",
        paperOnly: true as const,
      };

  // Key takeaways: what the market implies · what breaks it · the data gap · paper-only.
  const fav = [...winProbabilities].sort((a, b) => b.probability - a.probability)[0];
  const keyTakeaways = [
    fav
      ? `Market implies ${fav.label} at ${pct(fav.probability)} (de-vigged, 90 minutes).`
      : "Market-implied read of the posted 90-minute prices.",
    WC_REG_NOTE,
    view.whatBreaksIt[0] ??
      "Odds-only read — no independent xG / lineup / form model, so most edges sit near zero by construction.",
    "Paper-only · educational · not betting advice.",
  ].filter(Boolean);

  return {
    schemaVersion: "1.0.0",
    sport: "soccer",
    slateDate: opts.slateDate,
    eventId: view.matchId,
    eventName: `${view.homeTeam ?? "Home"} vs ${view.awayTeam ?? "Away"}`,
    status: opts.status ?? "scheduled",
    sourceMode: "market_implied_simulation",
    sourceLabel: WC_SOURCE_LABEL,
    publicClaims: defaultClaimsFor("market_implied_simulation"),
    marketSnapshot: { markets },
    simulationOutput: {
      headline: "Market-implied read",
      sourceMode: "market_implied_simulation",
      winProbabilities: winProbabilities.length > 0 ? winProbabilities : undefined,
      notes: [WC_SIM_NOTE, WC_REG_NOTE],
    },
    mainRead,
    topLeans: topLeanRows.map(rowToLean),
    keyTakeaways,
    details: {
      methodology: [
        "Market-implied read: de-vigged sportsbook prices, not an independent simulation.",
        "A market is only a lean at edge ≥ 5% above Watchlist confidence — otherwise the read sits on the price.",
      ],
      unavailableMarkets: view.unavailable.map((u) => u.label),
      dataGaps: [
        "No independent soccer simulator is live yet — this read is odds-only.",
        "Scorers, shots, corners, cards and xG are provider-gated and shown as roadmap only.",
      ],
      settlementNotes: [
        WC_REG_NOTE,
        "Settlement depends on the official final regulation score and each market's rules.",
      ],
    },
  };
}
