/**
 * RESULTS V2 · SUGGESTED PARLAYS FOR ONE DAY (Session 9 overnight · F2 — Session 7 backlog 1).
 *
 * `/results/date/[date]` showed Bank Builder and Moonshot receipts only. The Suggested Parlays a day PUBLISHED
 * are the frozen ladder cards (`parlays/risk-ladder/<date>.json`, written once at publication), and their grades
 * are the lab's settled receipts (`parlays/lab-settled/<date>.json`, joined by `slipId`) — the same population
 * the published-card record counts (founder decision D1). This joins the two; nothing is regenerated, graded or
 * recomputed. A card with no settled receipt yet is PENDING, never a loss; a tier with no card shows the
 * ladder's own reason. MLB ladder only (the product's live population).
 */
import fs from "node:fs";
import path from "node:path";
/* D2 · one risk taxonomy: tier labels come from their single owner, never a second table here. */
import { publicRiskLabel } from "../../parlays/risk-odds-bands.mjs";
const RESULT = Object.freeze({ win: "won", won: "won", loss: "lost", lost: "lost", push: "push", void: "void" });
const TIERS = ["low", "medium", "high", "longshot"];
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/**
 * @param {string} date
 * @param {string} [dataRoot]  public/data
 * @returns {null | { date: string, generatedAt: string|null, settledAt: string|null,
 *   cards: Array<{tier:string, tierLabel:string, combinedAmerican:number|null, result:string,
 *     legs: Array<{player:string|null, team:string|null, market:string|null, side:string|null, line:number|null, odds:number|null, result:string}>}>,
 *   skipped: Array<{tier:string, tierLabel:string, reason:string|null}> }}
 */
export function suggestedCardsFor(date, dataRoot = path.join(process.cwd(), "public", "data")) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return null;
  const ladder = read(path.join(dataRoot, "parlays", "risk-ladder", `${date}.json`));
  if (!ladder || !Array.isArray(ladder.cards)) return null;
  const settled = read(path.join(dataRoot, "parlays", "lab-settled", `${date}.json`));
  const bySlip = new Map((settled?.cards ?? []).filter((c) => (c.sport ?? "mlb") === "mlb" && c.slipId).map((c) => [c.slipId, c]));
  const cards = ladder.cards
    .slice()
    .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier))
    .map((c) => {
      const s = c.slipId ? bySlip.get(c.slipId) : null;
      const legGrades = Array.isArray(s?.legs) && s.legs.length === (c.legs ?? []).length ? s.legs : null;
      return {
        tier: c.tier, tierLabel: publicRiskLabel(c.tier) ?? c.tier, combinedAmerican: c.combinedAmerican ?? null,
        result: RESULT[String(s?.result ?? "").toLowerCase()] ?? "pending",
        legs: (c.legs ?? []).map((g, i) => ({
          player: g.player ?? null, team: g.team ?? null, market: g.marketLabel ?? g.market ?? null, side: g.side ?? null,
          line: typeof g.line === "number" ? g.line : null, odds: typeof g.odds === "number" ? g.odds : null,
          result: RESULT[String(legGrades?.[i] ?? "").toLowerCase()] ?? "pending",
        })),
      };
    });
  const skipped = (ladder.skipped ?? []).map((x) => ({ tier: x.tier, tierLabel: publicRiskLabel(x.tier) ?? x.tier, reason: x.reason ?? null }));
  if (!cards.length && !skipped.length) return null;
  return { date, generatedAt: ladder.generatedAt ?? null, settledAt: settled?.settledAt ?? null, cards, skipped };
}

/** Days with a published MLB Suggested Parlays ladder — the day pages they add to /results/date/[date]. */
export function suggestedCardDates(dataRoot = path.join(process.cwd(), "public", "data")) {
  const dir = path.join(dataRoot, "parlays", "risk-ladder");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { return []; }
  return files.map((f) => f.slice(0, 10)).sort().reverse();
}
