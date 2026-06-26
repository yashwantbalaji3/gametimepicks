/**
 * Mr. Dub MASTER LEDGER — the authoritative cross-product portfolio track record. Mr. Dub is the
 * simulated bettor: this aggregates every product's settled paper history (Bank Builder, Moonshot, World
 * Cup Specials, Homer Nukes) into per-product record / ROI / P&L / exposure + overall totals.
 *
 * Pure + deterministic. NEVER mutates money: it READS each product's persisted ledger (real settled
 * results only) and the daily portfolio (current paper exposure). STALE products (artifact older than the
 * current slate) contribute NO open exposure (staleness guard). Canonical Bank Builder bankroll/crown are
 * untouched — this is a reporting layer.
 */
import fs from "node:fs";
import path from "node:path";
import { computeProductPerformance, type SettledResult } from "../products/performance";
import { freshnessFor, type Freshness } from "../products/staleness";

const round2 = (n: number) => Number(n.toFixed(2));
const readJson = (p: string): any => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const PRODUCTS = [
  { id: "bank-builder", label: "Bank Builder" },
  { id: "moonshot", label: "Moonshot" },
  { id: "wc-specials", label: "World Cup Specials" },
  { id: "homer-nukes", label: "Homer Nukes" },
] as const;

export interface ProductLedgerEntry {
  productId: string;
  label: string;
  record: { wins: number; losses: number; pushes: number; voids: number };
  bets: number;
  stake: number;
  profit: number;
  pnl: number;       // alias of profit — the product's paper P&L
  roi: number;       // % on deployed capital
  roiMultiple?: number; // for compounding products (Bank Builder): return as a multiple of deployed $100
  winRate: number;   // %
  units: number;
  exposure: number;     // current open paper exposure (0 when stale)
  openExposure: number; // alias of exposure
  freshness: Freshness;
  stale: boolean;
  lastSettledDate: string | null;
  history: SettledResult[];
  /** True for the compounding cumulative-crown product (Bank Builder), whose P&L is the canonical bankroll
   *  growth (NOT a flat Σ(payout−stake) per-bet sum). Its truth is portfolio.json, not a parallel ledger. */
  canonical?: boolean;
}

export interface MasterLedger {
  generatedAt: string;
  date: string;
  products: ProductLedgerEntry[];
  aggregate: {
    bets: number;
    wins: number;
    losses: number;
    stake: number;
    profit: number;         // overall P&L across all products (== bankBuilderProfit + sideLaneNet)
    lifetimeProfit: number; // cumulative all-time realized P&L (== profit; every paper card is settled
                            //   from official results, so there is no open/unrealized component)
    bankBuilderProfit: number; // the canonical Bank Builder realized profit (== portfolio.settledProfit)
    sideLaneNet: number;       // net of the side lanes (Moonshot + WC Specials + Homer Nukes)
    roi: number;            // overall ROI %
    winRate: number;        // overall win rate %
    exposure: number;       // overall open exposure (stale products excluded)
    openExposure: number;   // alias of exposure — Mr. Dub's authoritative "open exposure" metric
  };
}

/**
 * Bank Builder's master-ledger entry, sourced from the CANONICAL cumulative-crown bankroll (portfolio.json +
 * the per-event ledger.json) — never a parallel product-ledger. BB compounds (rolled stakes telescope and a
 * single $100 was ever deposited), so its realized P&L is the bankroll growth `settledProfit`, NOT a flat
 * Σ(payout−stake). This is the ONE source of truth for BB; the master ledger must agree with the hero.
 */
function bankBuilderCanonicalEntry(root: string, dp: any, date: string): ProductLedgerEntry {
  const pf = readJson(path.join(root, "mr-dub", "portfolio.json"));
  const led = readJson(path.join(root, "mr-dub", "ledger.json"));
  if (!pf) throw new Error("[master-ledger] portfolio.json is required for the canonical Bank Builder entry");
  const start = Number(pf.startingBankroll ?? 100) || 100;
  const settledProfit = round2(Number(pf.settledProfit ?? 0));
  const rec = pf.record ?? { wins: 0, losses: 0, voids: 0 };
  const roiMultiple = round2(Number(pf.roiMultiple ?? (start > 0 ? settledProfit / start : 0)));
  // History = the canonical settled events (each carries its own paperProfit). Outcomes drive only the
  // ISO-date/traceability checks; BB's profit + record come from the canonical totals, not a per-bet sum.
  const history: SettledResult[] = (led?.events ?? [])
    .filter((e: any) => e && e.date && e.status === "settled")
    .map((e: any) => ({
      productId: "bank-builder",
      date: e.date,
      outcome: (e.result === "win" || e.result === "won") ? "won" : e.result === "lost" ? "lost" : "void",
      stake: Number(e.paperStake) || 0,
      payout: Number(e.paperReturn) || 0,
    }));
  const { artifactDate } = exposureAndArtifactDate(root, "bank-builder", dp);
  const freshness = freshnessFor(artifactDate, date);
  const dates = history.map((r) => r.date).sort();
  const wins = Number(rec.wins ?? 0), losses = Number(rec.losses ?? 0), voids = Number(rec.voids ?? 0);
  // Open exposure = canonical PLACED exposure (portfolio.json), not the daily candidate notional — so the
  // master ledger never claims money is at risk that the hero (and the single source of truth) says is $0.
  const placedExposure = round2(Number(pf.openExposure ?? 0));
  return {
    productId: "bank-builder", label: "Bank Builder",
    record: { wins, losses, pushes: 0, voids },
    bets: wins + losses,
    stake: round2(start),
    profit: settledProfit, pnl: settledProfit,
    roi: start > 0 ? round2((settledProfit / start) * 100) : 0,
    roiMultiple,
    winRate: wins + losses > 0 ? round2((wins / (wins + losses)) * 100) : 0,
    units: 0,
    exposure: placedExposure,
    openExposure: placedExposure,
    freshness, stale: freshness !== "fresh",
    lastSettledDate: dates.length ? dates[dates.length - 1] : null,
    history,
    canonical: true,
  };
}

/** Current paper exposure + the dated artifact that drives staleness, per product. */
function exposureAndArtifactDate(root: string, id: string, dp: any): { artifactDate: string | null; exposure: number } {
  if (id === "bank-builder") return { artifactDate: dp?.date ?? null, exposure: dp?.products?.bankBuilder?.exposure ?? 0 };
  if (id === "moonshot") {
    // Open Moonshot exposure is today's ACTIVE daily lanes (the live portfolio), not the frozen standalone
    // run artifact — so an activated lane's $25 stake reaches Mr. Dub. Keyed off dp.date like Bank Builder;
    // settled history still comes from product-ledger/moonshot.json.
    return { artifactDate: dp?.date ?? null, exposure: dp?.products?.moonshot?.exposure ?? 0 };
  }
  if (id === "wc-specials") {
    const s = readJson(path.join(root, "world-cup", "world-cup-specials.json"));
    return { artifactDate: s?.date ?? s?.generatedAt ?? null, exposure: 0 }; // paper history; no placed exposure
  }
  if (id === "homer-nukes") {
    const h = readJson(path.join(root, "mlb", "homer-nukes-active.json")) ?? readJson(path.join(root, "homer-nukes", "active.json"));
    // Open exposure counts only for genuinely PLACED/ACTIVE lanes — a candidate card (status not "active")
    // is a recommendation, not money at risk. Otherwise an unplaced artifact reads as phantom exposure.
    const placed = (h?.lanes ?? []).filter((l: any) => l?.status === "active" || l?.placed === true || l?.status === "placed");
    const exposure = placed.reduce((s: number, l: any) => s + (Number(l?.stake) || 0), 0);
    return { artifactDate: h?.date ?? h?.generatedAt ?? null, exposure };
  }
  return { artifactDate: null, exposure: 0 };
}

export function buildMasterLedger(root: string, nowIso: string, date: string): MasterLedger {
  const dp = readJson(path.join(root, "mr-dub", "daily-portfolio.json"));

  const products: ProductLedgerEntry[] = PRODUCTS.map(({ id, label }) => {
    // Bank Builder is the canonical compounding bankroll — sourced from portfolio.json, not a parallel
    // product-ledger (which would only hold recent flat-stake settlements and contradict the hero).
    if (id === "bank-builder") return bankBuilderCanonicalEntry(root, dp, date);

    const ledger = readJson(path.join(root, "product-ledger", `${id}.json`));
    const results: SettledResult[] = (ledger?.results ?? [])
      .filter((r: any) => r && r.date && r.outcome)
      .map((r: any) => ({ productId: r.productId ?? id, date: r.date, outcome: r.outcome, stake: Number(r.stake) || 0, payout: Number(r.payout) || 0 }));
    const c = computeProductPerformance(id, results).cumulative;
    const { artifactDate, exposure } = exposureAndArtifactDate(root, id, dp);
    const freshness = freshnessFor(artifactDate, date);
    const dates = results.map((r) => r.date).sort();
    return {
      productId: id, label,
      record: { wins: c.wins, losses: c.losses, pushes: c.pushes, voids: c.voids },
      bets: c.bets, stake: c.stake, profit: c.profit, pnl: c.profit, roi: c.roi, winRate: c.winRate, units: c.units,
      exposure: freshness === "fresh" ? round2(exposure) : 0, // STALE products contribute NO exposure
      openExposure: freshness === "fresh" ? round2(exposure) : 0,
      freshness, stale: freshness !== "fresh",
      lastSettledDate: dates.length ? dates[dates.length - 1] : null,
      history: results,
    };
  });

  const agg = products.reduce(
    (a, p) => ({
      bets: a.bets + p.bets,
      wins: a.wins + p.record.wins,
      losses: a.losses + p.record.losses,
      stake: round2(a.stake + p.stake),
      profit: round2(a.profit + p.profit),
      exposure: round2(a.exposure + p.exposure),
    }),
    { bets: 0, wins: 0, losses: 0, stake: 0, profit: 0, exposure: 0 },
  );

  const bankBuilderProfit = round2(products.find((p) => p.canonical)?.profit ?? 0);
  const sideLaneNet = round2(agg.profit - bankBuilderProfit);

  return {
    generatedAt: nowIso,
    date,
    products,
    aggregate: {
      ...agg,
      lifetimeProfit: agg.profit, // cumulative all-time realized P&L (all paper cards settle officially)
      bankBuilderProfit,          // canonical BB realized profit (== portfolio.settledProfit) — reconciles
      sideLaneNet,                // Moonshot + WC Specials + Homer Nukes net
      openExposure: agg.exposure,
      roi: agg.stake > 0 ? round2((agg.profit / agg.stake) * 100) : 0,
      winRate: agg.wins + agg.losses > 0 ? round2((agg.wins / (agg.wins + agg.losses)) * 100) : 0,
    },
  };
}
