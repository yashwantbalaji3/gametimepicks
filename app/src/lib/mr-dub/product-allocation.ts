/**
 * Portfolio allocation — the unified, read-side view of Mr. Dub's FOUR daily products and how the
 * single Mr. Dub bankroll is allocated across them today:
 *
 *   1. Bank Builder        — the dual-lane $10K ladder (seed exposure from the activated daily portfolio)
 *   2. Moonshot            — the higher-volatility $25 → $3,000 ladder
 *   3. World Cup Specials   — 5 suggested WC longshots/day, $20 each → $100/day allocation
 *   4. Homer Nukes (MLB)    — top-5 daily home-run picks, $20 each → $100/day allocation
 *
 * SAFE BY DESIGN: a pure projection. It reads the protected portfolio.json (bankroll + crown, never
 * written) and the per-product artifacts, and computes today's allocation / open exposure / share of
 * bankroll. It NEVER mutates money state — realized P/L only ever changes through official settlement.
 * Products with no posted board (e.g. MLB before odds post) report $0 exposure and a data-gated note.
 */
import fs from "node:fs";
import path from "node:path";
import { buildDailyPortfolio } from "./daily-portfolio";
import { readCanonicalMoney } from "../daily-portfolio/accounting";
import { buildSpecialsLedger } from "../world-cup/specials-ledger";
import { loadWorldCupSpecials } from "../world-cup/world-cup-specials";
import { loadHomerNukes, HOMER_NUKES_STAKE, HOMER_NUKES_DAILY_ALLOCATION } from "../mlb/homer-nukes";

export const WC_SPECIALS_STAKE_PER_CARD = 20;
export const WC_SPECIALS_CARDS_PER_DAY = 5;
export const WC_SPECIALS_DAILY_ALLOCATION = WC_SPECIALS_STAKE_PER_CARD * WC_SPECIALS_CARDS_PER_DAY; // $100/day

export type ProductKey = "bank-builder" | "moonshot" | "world-cup-specials" | "homer-nukes";
export type ProductStatus = "active" | "candidate" | "pending" | "no-board";

export interface ProductAllocation {
  key: ProductKey;
  label: string;
  href: string;
  accent: string;
  dailyAllocation: number;          // notional $/day this product is allocated
  openExposure: number;             // open PAPER exposure currently at risk today
  pctOfBankroll: number;            // openExposure / activeBankroll (0..1)
  record: { wins: number; losses: number; pushes: number };
  realizedPnl: number;              // settled-only P/L contribution (0 until official settlement)
  roi: number | null;               // realizedPnl / staked, or null when nothing has settled
  winRate: number | null;           // wins / (wins + losses), or null when nothing has settled
  avgOdds: number | null;           // mean combined American odds of this product's live cards, or null
  legCount: number;                 // legs riding across this product's live cards
  rank: number;                     // 1..N performance rank (by win rate; unsettled products rank last)
  status: ProductStatus;
  statusLabel: string;
  note: string;
}

export interface PortfolioAllocation {
  date: string;
  activeBankroll: number;
  crownBankroll: number;
  totalDailyAllocation: number;
  totalOpenExposure: number;
  availableBankroll: number;        // activeBankroll − totalOpenExposure
  products: ProductAllocation[];
  note: string;
}

const round2 = (n: number) => Number(n.toFixed(2));
const STATUS_LABEL: Record<ProductStatus, string> = {
  active: "Active", candidate: "Candidate", pending: "Pending", "no-board": "Awaiting board",
};

type Rec = { wins: number; losses: number; pushes: number };
const toRec = (r: any): Rec => ({ wins: r?.wins ?? 0, losses: r?.losses ?? 0, pushes: r?.pushes ?? r?.voids ?? 0 });
const winRateOf = (r: Rec): number | null => (r.wins + r.losses > 0 ? Number((r.wins / (r.wins + r.losses)).toFixed(2)) : null);

/** Read the protected bankroll + crown + per-product records (never written). The core portfolio.json
 *  record is the Bank Builder lane record; Moonshot keeps its own record under `moonshot`. */
function loadCore(root: string): { activeBankroll: number; crownBankroll: number; bankBuilderRecord: Rec; moonshotRecord: Rec } {
  // Money: SINGLE canonical reader (portfolio.json → banked-ladders.json → THROW; no stale constant; Rule 2).
  const { activeBankroll, crownBankroll } = readCanonicalMoney(root);
  // Records come from the same canonical portfolio.json (an empty record, not a money value, is a safe
  // default if the records sub-object is absent — money is never defaulted).
  let bankBuilderRecord: Rec = { wins: 0, losses: 0, pushes: 0 };
  let moonshotRecord: Rec = { wins: 0, losses: 0, pushes: 0 };
  try {
    const p = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "portfolio.json"), "utf8"));
    if (p.record) bankBuilderRecord = toRec(p.record);
    if (p.moonshot?.record) moonshotRecord = toRec(p.moonshot.record);
  } catch { /* records default to empty; canonical money already resolved above */ }
  return { activeBankroll, crownBankroll, bankBuilderRecord, moonshotRecord };
}

/** Mean combined American odds across a product's live cards (null when none). */
function avgOddsOf(cards: { combinedOdds: number }[]): number | null {
  if (!cards.length) return null;
  return Math.round(cards.reduce((s, c) => s + (c.combinedOdds || 0), 0) / cards.length);
}

/**
 * Build the four-product allocation for the slate. All exposure figures are today's PAPER allocation;
 * realized P/L stays at 0 until official settlement writes it (this projection never does).
 */
export function buildPortfolioAllocation(root: string, nowIso: string, date: string): PortfolioAllocation {
  const { activeBankroll, crownBankroll, bankBuilderRecord, moonshotRecord } = loadCore(root);
  const daily = buildDailyPortfolio(root, nowIso, date);
  const specialsLedger = buildSpecialsLedger(root, date);

  // 1 + 2 — Bank Builder + Moonshot: seed exposure from the activated daily portfolio.
  const bbExposure = round2(daily.exposure.core);
  const moonExposure = round2(daily.exposure.moonshot);
  const bbCards = daily.cards.filter((c) => c.product === "bank-builder");
  const moonCards = daily.cards.filter((c) => c.product === "moonshot");
  const bbActive = bbCards.some((c) => c.status === "active");
  const moonActive = moonCards.some((c) => c.status === "active");

  // 3 — World Cup Specials: 5 suggested cards/day × $20 = $100/day. Open exposure only when today's
  // pre-event cards are posted; realized P/L comes from official settlement (0 here, pending).
  const specials = loadWorldCupSpecials();
  const specialsLive = !!specials && specials.date === date && (specials.cards?.length ?? 0) > 0;
  const specialsCards = specialsLive ? Math.min(WC_SPECIALS_CARDS_PER_DAY, specials!.cards.length) : 0;
  const specialsExposure = round2(specialsCards * WC_SPECIALS_STAKE_PER_CARD);

  // 4 — Homer Nukes (MLB): ONE daily 5-leg HR parlay, flat $20/day. Data-gated — $0 until HR props post.
  const homer = loadHomerNukes(root, date);
  const homerExposure = homer.available && homer.parlay ? HOMER_NUKES_STAKE : 0;

  const pct = (x: number) => (activeBankroll > 0 ? round2(x / activeBankroll) : 0);
  const specialsRecord: Rec = { ...specialsLedger.record };
  const homerRecord: Rec = { wins: 0, losses: 0, pushes: 0 };
  const products: Omit<ProductAllocation, "rank">[] = [
    {
      key: "bank-builder", label: "Bank Builder", href: "/bank-builder", accent: "var(--vault-gold-bright)",
      dailyAllocation: bbExposure, openExposure: bbExposure, pctOfBankroll: pct(bbExposure),
      record: bankBuilderRecord, realizedPnl: 0, roi: null, winRate: winRateOf(bankBuilderRecord),
      avgOdds: avgOddsOf(bbCards), legCount: bbCards.reduce((s, c) => s + c.legs.length, 0),
      status: bbActive ? "active" : "candidate", statusLabel: STATUS_LABEL[bbActive ? "active" : "candidate"],
      note: "Dual-lane ladder toward $10K — settled P/L rolls the ladder; the seed is the open exposure.",
    },
    {
      key: "moonshot", label: "Moonshot", href: "/moonshot", accent: "#8b7bf0",
      dailyAllocation: moonExposure, openExposure: moonExposure, pctOfBankroll: pct(moonExposure),
      record: moonshotRecord, realizedPnl: 0, roi: null, winRate: winRateOf(moonshotRecord),
      avgOdds: avgOddsOf(moonCards), legCount: moonCards.reduce((s, c) => s + c.legs.length, 0),
      status: moonActive ? "active" : "candidate", statusLabel: STATUS_LABEL[moonActive ? "active" : "candidate"],
      note: "Higher-volatility $25 → $3,000 ladder — kept apart from the core lanes.",
    },
    {
      key: "world-cup-specials", label: "World Cup Specials", href: "/world-cup-specials", accent: "#e7b15a",
      dailyAllocation: WC_SPECIALS_DAILY_ALLOCATION, openExposure: specialsExposure, pctOfBankroll: pct(specialsExposure),
      record: specialsRecord, realizedPnl: specialsLedger.pnl, roi: specialsLedger.roi, winRate: specialsLedger.winRate,
      avgOdds: null, legCount: specialsCards,
      status: specialsLive ? "active" : "pending", statusLabel: STATUS_LABEL[specialsLive ? "active" : "pending"],
      note: specialsLive
        ? `${specialsCards} suggested World Cup parlays today · $${WC_SPECIALS_STAKE_PER_CARD} each · settled P/L from official results.`
        : "No World Cup Specials posted for this slate yet.",
    },
    // Homer Nukes (MLB) retired 2026-06-30 — removed from the active portfolio allocation (registry status
    // "retired"). Its loader/ledger stay for history; it is no longer surfaced as an active product.
  ];

  // Performance ranking — by win rate; products with nothing settled rank last (ties keep input order).
  const ranked = products
    .map((p, i) => ({ p, i, wr: p.winRate ?? -1 }))
    .sort((a, b) => (b.wr - a.wr) || (a.i - b.i));
  const rankByKey = new Map<string, number>();
  ranked.forEach((r, idx) => rankByKey.set(r.p.key, idx + 1));
  const withRank: ProductAllocation[] = products.map((p) => ({ ...p, rank: rankByKey.get(p.key) ?? 0 }));

  const totalOpenExposure = round2(withRank.reduce((s, p) => s + p.openExposure, 0));
  const totalDailyAllocation = round2(withRank.reduce((s, p) => s + p.dailyAllocation, 0));
  return {
    products: withRank,
    date, activeBankroll, crownBankroll, totalDailyAllocation, totalOpenExposure,
    availableBankroll: round2(activeBankroll - totalOpenExposure),
    note: "Today's paper allocation across all four products, drawn from the single Mr. Dub bankroll. Realized P/L and records update only on official settlement; the crown ladder is historical and separate.",
  };
}
