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
  roi: number;       // %
  winRate: number;   // %
  units: number;
  exposure: number;  // current open paper exposure (0 when stale)
  freshness: Freshness;
  stale: boolean;
  lastSettledDate: string | null;
  history: SettledResult[];
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
    profit: number;     // overall P&L
    roi: number;        // overall ROI %
    winRate: number;    // overall win rate %
    exposure: number;   // overall open exposure (stale products excluded)
  };
}

/** Current paper exposure + the dated artifact that drives staleness, per product. */
function exposureAndArtifactDate(root: string, id: string, dp: any): { artifactDate: string | null; exposure: number } {
  if (id === "bank-builder") return { artifactDate: dp?.date ?? null, exposure: dp?.products?.bankBuilder?.exposure ?? 0 };
  if (id === "moonshot") {
    const m = readJson(path.join(root, "moonshot-lane", "active.json"));
    return { artifactDate: m?.generatedAt ?? m?.date ?? null, exposure: dp?.products?.moonshot?.exposure ?? 0 };
  }
  if (id === "wc-specials") {
    const s = readJson(path.join(root, "world-cup", "world-cup-specials.json"));
    return { artifactDate: s?.date ?? s?.generatedAt ?? null, exposure: 0 }; // paper history; no placed exposure
  }
  if (id === "homer-nukes") {
    const h = readJson(path.join(root, "mlb", "homer-nukes-active.json")) ?? readJson(path.join(root, "homer-nukes", "active.json"));
    const exposure = typeof h?.exposure === "number" ? h.exposure : (typeof h?.stake === "number" ? h.stake : 0);
    return { artifactDate: h?.date ?? h?.generatedAt ?? null, exposure };
  }
  return { artifactDate: null, exposure: 0 };
}

export function buildMasterLedger(root: string, nowIso: string, date: string): MasterLedger {
  const dp = readJson(path.join(root, "mr-dub", "daily-portfolio.json"));

  const products: ProductLedgerEntry[] = PRODUCTS.map(({ id, label }) => {
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
      bets: c.bets, stake: c.stake, profit: c.profit, roi: c.roi, winRate: c.winRate, units: c.units,
      exposure: freshness === "fresh" ? round2(exposure) : 0, // STALE products contribute NO exposure
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

  return {
    generatedAt: nowIso,
    date,
    products,
    aggregate: {
      ...agg,
      roi: agg.stake > 0 ? round2((agg.profit / agg.stake) * 100) : 0,
      winRate: agg.wins + agg.losses > 0 ? round2((agg.wins / (agg.wins + agg.losses)) * 100) : 0,
    },
  };
}
