/**
 * THE DATED CARD ROWS — Program 234 · Release E.
 *
 * P233's read model projects the five ledgers into a common shape, and every one of those ledgers is
 * an AGGREGATE: `lab-ledger.json` carries one record per stream and one per tier, with no card in
 * it. A date filter over an all-time aggregate is not a filter, it is a decoration — so the first
 * question this release had to answer was whether dated detail exists at all.
 *
 * For suggested parlays it does. `public/data/parlays/lab-settled/<date>.json` carries every card
 * that settled on that date with its slip id, tier, sport(s), result and price. Summed, those files
 * reproduce the aggregate ledger EXACTLY — 6-31 for MLB and every one of its four tiers, 0-2 UFC,
 * 1-2 EPL — which is what makes it safe to filter them and still show a number the rest of the site
 * agrees with. The reconciliation is a test, not a note.
 *
 * FOR EVERY OTHER POPULATION IT DOES NOT. `graded-picks.json` counts 37,958 decided model picks and
 * publishes 60 of them. A date control over that would answer a question about the sample while
 * appearing to answer one about the record. Those populations therefore get NO date filter and a
 * stated reason — the charter's instruction is to disable an unsupported breakdown explicitly, and
 * an absent control with an explanation beats a present control that quietly lies.
 *
 * DATE ATTRIBUTION. A card belongs to the day its settlement file is named for — the day the card
 * was published and graded as a cohort, not the day whichever leg happened to settle first. A card
 * whose legs span midnight stays in one cohort, which is the only way its record can be counted once.
 */
import fs from "node:fs";
import path from "node:path";

/** Populations with per-row dated detail. Everything else is aggregate-only, by evidence. */
export const DATE_FILTERABLE = Object.freeze(["suggested-parlay"]);

export const DATE_BASIS_NOTE =
  "Dates are the day the card was published and graded as a cohort — not the day an individual leg settled. A card whose legs cross midnight stays in one day.";

const isDateFile = (f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f);

/** A settled card, flattened. `sport` is the population it counts toward. */
function toRow(card, date) {
  const sports = Array.isArray(card.sports) && card.sports.length ? card.sports : [card.sport].filter(Boolean);
  /*
   * A CARD WITH LEGS IN TWO SPORTS IS ITS OWN POPULATION. Counting it under each constituent sport
   * would count one card twice, and counting it under the first leg's sport would put a
   * mixed-sport result inside a single-sport record.
   */
  const population = sports.length > 1 ? "multi" : (sports[0] ?? "unknown");
  const result = String(card.result ?? "pending").toLowerCase();
  return Object.freeze({
    date,
    slipId: String(card.slipId ?? ""),
    sport: population,
    sports: Object.freeze([...sports]),
    tier: card.tier ?? null,
    result,
    decided: result === "win" || result === "loss",
    won: result === "win",
    lost: result === "loss",
    pushed: result === "push" || result === "void",
    pending: !(result === "win" || result === "loss" || result === "push" || result === "void"),
    combinedDecimal: Number.isFinite(card.combinedDecimal) ? card.combinedDecimal : null,
    legs: Object.freeze([...(card.legs ?? [])].map(String)),
    legCount: (card.legs ?? []).length,
  });
}

/**
 * Every settled card this repository has committed, newest date last.
 * @param {string} dataRoot absolute path to `public/data`
 */
export function loadSettledCards(dataRoot) {
  const dir = path.join(dataRoot, "parlays", "lab-settled");
  let files = [];
  try { files = fs.readdirSync(dir).filter(isDateFile).sort(); } catch { return []; }
  const rows = [];
  for (const f of files) {
    let doc;
    try { doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    /* The file's OWN `date` where it has one; the filename is the fallback, never the other way
       round — a settlement file that disagrees with its name is a lineage problem, not a rename. */
    const date = typeof doc.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(doc.date) ? doc.date : f.slice(0, 10);
    for (const c of doc.cards ?? []) rows.push(toRow(c, date));
  }
  return rows;
}

/* The pure operations live in a filesystem-free module so a client component can import them
   without pulling `node:fs` into the browser bundle. Re-exported here so loader-side callers keep
   one import. */
export { coveredDates, filterCards, poolCards, cardGrid, dailySeries } from "./card-math.mjs";
