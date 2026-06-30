/**
 * Open exposure — the ONE cross-product source of "money currently at risk on today's pending paper cards."
 *
 * Mr. Dub runs FOUR paper products off one bankroll; open exposure is the sum of the stake riding on each
 * product's currently-pending (today's, pre-settlement) cards — Bank Builder lanes + Moonshot + World Cup
 * Specials + Homer Nukes. A product whose live artifact is from a PRIOR slate contributes $0 (its cards
 * already settled — they're realized history, not open risk). This is presentation-only: it never touches
 * the canonical realized bankroll/crown. Every consumer (Mr. Dub hero, master ledger, status bar) reads
 * THIS so the figure is identical everywhere.
 */
import fs from "node:fs";
import path from "node:path";

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;
const readJson = (p: string): any => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const slate = (d?: string | null) => (typeof d === "string" ? d.slice(0, 10) : null);
const fresh = (artifactDate: string | null | undefined, date: string) => !!artifactDate && slate(artifactDate) === slate(date);

export interface ProductExposure {
  productId: "bank-builder" | "moonshot" | "wc-specials" | "homer-nukes";
  label: string;
  glyph: string;
  amount: number;   // paper $ at risk on this product's pending cards today (0 when stale / no card)
  cards: number;    // number of pending cards/lanes contributing
  note: string;     // short human explanation of the figure
}

export interface OpenExposure {
  total: number;            // Σ byProduct.amount — the cross-product open exposure
  asOf: string;             // the slate date this reflects
  byProduct: ProductExposure[];
}

/** Compute today's cross-product open exposure from each product's live artifact. Pure + deterministic. */
export function computeOpenExposure(root: string, date: string): OpenExposure {
  const dp = readJson(path.join(root, "mr-dub", "daily-portfolio.json"));
  const homer = readJson(path.join(root, "mlb", "homer-nukes-active.json")) ?? readJson(path.join(root, "homer-nukes", "active.json"));
  const wc = readJson(path.join(root, "world-cup", "world-cup-specials.json"));

  // Bank Builder — the two live dual lanes' committed paper stakes (from the daily portfolio).
  const dpFresh = fresh(dp?.date, date);
  const bbAmount = dpFresh ? round2(Number(dp?.products?.bankBuilder?.exposure ?? 0)) : 0;
  const bbLanes = (dp?.products?.bankBuilder?.lanes ?? []).filter((l: any) => l?.status !== "settled").length || (bbAmount > 0 ? 2 : 0);

  // Moonshot — today's active longshot lane stake (0 when no lane is live today).
  const msAmount = dpFresh ? round2(Number(dp?.products?.moonshot?.exposure ?? 0)) : 0;
  const msLanes = (dp?.products?.moonshot?.lanes ?? []).length || (msAmount > 0 ? 1 : 0);

  // World Cup Specials — the box of paper longshots (count × per-card stake).
  const wcFresh = fresh(wc?.date ?? wc?.generatedAt, date);
  const wcCards = (wc?.cards ?? wc?.specials ?? []) as any[];
  const wcStake = Number(wc?.config?.stakePreview ?? wc?.config?.stake ?? 10) || 10;
  const wcAmount = wcFresh ? round2(wcCards.length * wcStake) : 0;

  // Homer Nukes — today's HR parlays (Σ lane stakes).
  const homerFresh = fresh(homer?.date ?? homer?.generatedAt, date);
  const homerLanes = (homer?.lanes ?? []) as any[];
  const homerStake = round2(homerLanes.reduce((s, l) => s + (Number(l?.stake) || 0), 0) || Number(homer?.exposure ?? homer?.stake ?? 0));
  const homerAmount = homerFresh ? homerStake : 0;

  const byProduct: ProductExposure[] = [
    { productId: "bank-builder", label: "Bank Builder", glyph: "🏦", amount: bbAmount, cards: bbLanes,
      note: bbAmount > 0 ? `${bbLanes} live dual-ladder lane${bbLanes === 1 ? "" : "s"}` : (dpFresh ? "no live lane today" : "no current-slate card") },
    { productId: "moonshot", label: "Moonshot", glyph: "🌙", amount: msAmount, cards: msLanes,
      note: msAmount > 0 ? `${msLanes} active longshot lane${msLanes === 1 ? "" : "s"}` : "no active lane today" },
    { productId: "wc-specials", label: "WC Specials", glyph: "⚽", amount: wcAmount, cards: wcCards.length,
      note: wcAmount > 0 ? `${wcCards.length} specials × $${wcStake}` : "no current-slate specials" },
    // Homer Nukes retired 2026-06-30 — dropped from the active open-exposure breakdown (data-gated, $0).
  ];
  const total = round2(byProduct.reduce((s, p) => s + p.amount, 0));
  return { total, asOf: slate(date) ?? date, byProduct };
}
