/**
 * THE UFC RISK LADDER — one card per price band, from real posted prices and the model's own read.
 *
 * ── Why UFC may select on its model where MLB may not ───────────────────────────────────────────
 * MLB's markets were demoted to market-context after failing their bar three times, and this
 * stream's backtest showed model edge does not predict leg outcomes there at all. So MLB's ladder
 * selects on the optimizer's score, never on edge.
 *
 * UFC is the one model on this site that PASSED its preregistered bar — winner accuracy 60.6%,
 * gain 0.0317, max calibration z 1.375 against a bar of 2. Selecting the side it reads is therefore
 * defensible in a way it is not for MLB, and the difference is recorded here so nobody copies the
 * wrong precedent between sports.
 *
 * What that does NOT mean: that the model beats the price. No comparison against a no-vig UFC line
 * has ever been run — the prices to run it against arrived today. The Lab's claim is unchanged and
 * unglamorous: it quotes real posted prices and grades them.
 *
 * ── Bands are PRICE ranges ──────────────────────────────────────────────────────────────────────
 * Assigned through the canonical bucket function, the same one the MLB ladder and the grader use.
 * The cross-sport lane briefly labelled cards by leg count instead and published a +203 card as
 * "Low risk"; that is the mistake this file must not repeat.
 *
 * Writes public/data/parlays/risk-ladder-ufc/<date>.json (+ latest.json), in the SAME shape the
 * multi-sport builder and the tier grid already consume.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRiskBucketForCombinedOdds } from "../../src/lib/parlays/risk-odds-bands.mjs";
import { RISK_ORDER } from "../../src/lib/prefs/bettor-tiers.mjs";
import { BAND_MAX_LEGS } from "../../src/lib/parlays/multi-sport.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(APP, "public", "data", "parlays", "risk-ladder-ufc");
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const NOW = arg("--now", new Date().toISOString());
const etDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const DATE = arg("--date", etDay(NOW));

const odds = readJson(path.join(APP, "public", "data", "ufc", "odds-latest.json"));
const card = readJson(path.join(APP, "public", "data", "ufc", "card-latest.json"));

const write = (payload) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${DATE}.json`), JSON.stringify(payload, null, 1) + "\n");
  fs.writeFileSync(path.join(OUT, "latest.json"), JSON.stringify(payload, null, 1) + "\n");
};
const base = { schemaVersion: 1, artifact: "ufc-risk-ladder", dataClass: "PUBLIC_DERIVED", moneyClass: "NON_MONEY", sport: "ufc", date: DATE, generatedAt: NOW };

if (card?.state !== "SCHEDULED_CARD") {
  write({ ...base, state: "NO_CARD", reason: `no scheduled UFC card to build from (state ${card?.state ?? "absent"})`, cards: [], skipped: [] });
  console.log("ufc ladder: no scheduled card"); process.exit(0);
}

/*
 * REFUSE ON PRICES THAT DO NOT BELONG TO THIS CARD.
 *
 * odds-latest.json is a snapshot of one event. Building a ladder from a snapshot captured for a
 * DIFFERENT card would quote last month's prices under this week's fighters — which is exactly the
 * shape of the stale-artifact failures this repo keeps finding, and it would grade against bouts
 * that never happened.
 */
if (!odds || odds.event?.providerEventId !== card.event.providerEventId) {
  write({ ...base, state: "NO_PRICES", reason: `no price capture for this card (${card.event.name}); the newest snapshot covers a different event`, cards: [], skipped: [] });
  console.log(`ufc ladder: no prices for ${card.event.name}`); process.exit(0);
}

/* One leg per bout: the side the model reads, at the median posted price for that side. */
const readByBout = new Map((card.bouts ?? []).filter((b) => b.prediction?.winner).map((b) => [b.boutId, b]));
const legs = [];
for (const b of odds.bouts ?? []) {
  const read = readByBout.get(b.boutId);
  if (!read) continue;                                    // no model read — the bout is not offered
  const name = read.prediction.winner.name;
  const side = [b.red, b.blue].find((c) => c?.name === name);
  if (!side?.price?.american) continue;                   // the book posts no price for that side
  legs.push({
    sport: "ufc", eventId: b.boutId, player: name,
    market: "fight_winner", marketLabel: "Fight winner", side: "win", line: null,
    odds: side.price.american,
    decimal: side.price.american > 0 ? 1 + side.price.american / 100 : 1 + 100 / Math.abs(side.price.american),
    modelProbability: read.prediction.winner.probability,
    opponent: (read.red?.name === name ? read.blue?.name : read.red?.name) ?? null,
  });
}

/* Strongest read first — the model passed on separating fights, so its confidence is the ordering
   it earned the right to supply. */
legs.sort((a, z) => (z.modelProbability ?? 0) - (a.modelProbability ?? 0));

const cards = [], skipped = [], used = new Set();
for (const band of RISK_ORDER) {
  const cap = BAND_MAX_LEGS[band] ?? 5;
  let built = null; const reached = [];
  for (let n = 2; n <= cap; n++) {
    const pick = legs.filter((l) => !used.has(l.eventId)).slice(0, n);
    if (pick.length < n) break;                            // not enough distinct bouts left
    const d = pick.reduce((p, l) => p * l.decimal, 1);
    const american = d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
    const bucket = getRiskBucketForCombinedOdds(american);
    reached.push(`${n} legs → ${american > 0 ? "+" : ""}${american} (${bucket ?? "shorter than the low floor"})`);
    if (bucket === band) { built = { legs: pick, american, decimal: Number(d.toFixed(3)) }; break; }
  }
  if (!built) {
    skipped.push({ tier: band, reason: reached.length ? `no card priced into this band — ${reached.join("; ")}` : "not enough priced bouts with a model read to build a card" });
    continue;
  }
  for (const l of built.legs) used.add(l.eventId);
  cards.push({
    tier: band, slipId: `ufc-${band}-${DATE}`,
    combinedAmerican: built.american, combinedDecimal: built.decimal,
    legs: built.legs.map((l) => ({ ...l, team: null })),
    status: "pending",
    /* Null, never 0-0: this stream has settled nothing, and a zeroed record reads as a measured
       result rather than an absent one. */
    tierRecord: null,
  });
}

write({
  ...base, state: "PUBLISHED",
  event: { name: card.event.name, slateDate: card.event.slateDate, providerEventId: card.event.providerEventId },
  pricedBouts: (odds.bouts ?? []).length, modelReads: readByBout.size, eligibleLegs: legs.length,
  cards, skipped,
  note: "Prices are real and posted; the side is the model's own read — the one model here that passed its preregistered bar. No comparison against a no-vig UFC line has been run. Paper-only.",
});
console.log(`ufc ladder ${DATE}: ${legs.length} eligible legs -> ${cards.length}/4 bands carded${skipped.length ? ` (skipped ${skipped.map((s) => s.tier).join(", ")})` : ""}`);
for (const c of cards) console.log(`  ${c.tier.padEnd(9)} ${c.combinedAmerican > 0 ? "+" : ""}${c.combinedAmerican} · ${c.legs.length} legs`);
