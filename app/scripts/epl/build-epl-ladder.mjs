/**
 * THE EPL RISK LADDER — one card per price band, from real posted prices and nothing else.
 *
 * ── WHY THIS SELECTS ON PRICE AND NOT ON THE MODEL ──────────────────────────────────────────────
 * The UFC ladder picks the side its model reads, and says so, because that model is the one on this
 * site that PASSED its preregistered bar. The MLB ladder does not, because those markets were
 * demoted to market-context after failing theirs three times. The UFC file warns in as many words
 * against copying the wrong precedent between sports, so: EPL follows MLB, not UFC.
 *
 * The EPL model has passed nothing. Its calibration stage is UNPROVEN, ZERO matches have ever been
 * compared against a no-vig price, and there is direct evidence it is uninformed where it matters
 * most — on 2026-08-21 it read Hull City at 42.2% at home to Manchester United against a market
 * price of 10.6%, because Hull are newly promoted and the fit had no history for them. A ladder
 * selecting on that model would have put a Hull City home win on a published card.
 *
 * So the side is THE MARKET'S OWN FAVOURITE at its posted median price. That is not a prediction and
 * is not dressed as one. The Lab's claim here is the same unglamorous claim it makes everywhere: it
 * quotes real posted prices and grades them against an official result.
 *
 * ── ONE LEG PER FIXTURE ─────────────────────────────────────────────────────────────────────────
 * Two legs from one match are one match twice, and correlated at that. The band builder keeps a used
 * set on eventId, so a fixture that appears on one card cannot appear on another.
 *
 * ── BANDS ARE PRICE RANGES ──────────────────────────────────────────────────────────────────────
 * Assigned through the canonical bucket function — the same one the MLB ladder, the UFC ladder and
 * the grader use. The cross-sport lane once labelled cards by LEG COUNT and published a +203 card as
 * "Low risk". A band this ladder cannot reach is reported as skipped, with the prices it actually
 * reached, and the thresholds are never widened to manufacture a card.
 *
 * ── SETTLEABLE BY CONSTRUCTION ──────────────────────────────────────────────────────────────────
 * Every leg is market `match_result`, which gradeEplLeg settles from an official full-time score. A
 * card that could not be graded would never enter the record, so it must not be published either.
 *
 * Writes public/data/parlays/risk-ladder-epl/<date>.json (+ latest.json), in the SAME shape the
 * multi-sport builder and the tier grid already consume.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getRiskBucketForCombinedOdds, INDIVIDUAL_LEG_ODDS_GUARDS } from "../../src/lib/parlays/risk-odds-bands.mjs";
import { RISK_ORDER } from "../../src/lib/prefs/bettor-tiers.mjs";
import { BAND_MAX_LEGS } from "../../src/lib/parlays/multi-sport.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(APP, "public", "data", "parlays", "risk-ladder-epl");
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const NOW = arg("--now", new Date().toISOString());
const etDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const odds = readJson(path.join(APP, "public", "data", "soccer", "epl", "odds", "latest.json"));

/*
 * THE SLATE DAY COMES FROM THE FIXTURES, NOT FROM THE CLOCK.
 *
 * Defaulting to the run's own ET day looks obviously right and is obviously wrong here. The
 * night-before slot fires at 21:00 UTC — 17:00 ET the previous day — to serve the next morning's
 * kickoffs. Scoped to its own ET day it found zero fixtures and published an empty ladder, so the
 * one slot that exists specifically to have the product ready in advance would have produced
 * nothing at all, every time.
 *
 * This is the same defect as an /nfl hub anchored to a stale index day: a slate day that no fixture
 * shares is not a slate day. So the ladder is built for the day of the EARLIEST UPCOMING FIXTURE,
 * which is the slate this run can actually serve. --date still overrides for a replay.
 */
const nextKickoff = (odds?.rows ?? [])
  .map((r) => Date.parse(r.kickoffIso ?? ""))
  .filter((t) => Number.isFinite(t) && t > Date.parse(NOW))
  .sort((a, b) => a - b)[0];
const DATE = arg("--date", nextKickoff ? etDay(new Date(nextKickoff).toISOString()) : etDay(NOW));

const write = (payload) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${DATE}.json`), JSON.stringify(payload, null, 1) + "\n");
  fs.writeFileSync(path.join(OUT, "latest.json"), JSON.stringify(payload, null, 1) + "\n");
};
const base = { schemaVersion: 1, artifact: "epl-risk-ladder", dataClass: "PUBLIC_DERIVED", moneyClass: "NON_MONEY", sport: "epl", date: DATE, generatedAt: NOW };

if (!odds?.rows?.length) {
  write({ ...base, state: "NO_PRICES", reason: "no EPL price capture is available to build from", cards: [], skipped: [] });
  console.log("epl ladder: no prices"); process.exit(0);
}

/*
 * ONLY FIXTURES ON THIS SLATE DAY THAT HAVE NOT KICKED OFF.
 *
 * Both halves matter. A capture is a snapshot of a moment and EPL clusters are hours apart, so a
 * Saturday capture legitimately describes matches that have since started — quoting those would be
 * offering a price on a match in progress. And a fixture on a LATER day is not part of today's
 * ladder, however fresh its price is.
 */
const nowMs = Date.parse(NOW);
const eligibleFixtures = (odds.rows ?? []).filter((r) => {
  const k = Date.parse(r.kickoffIso ?? "");
  return Number.isFinite(k) && k > nowMs && etDay(r.kickoffIso) === DATE;
});

/* One leg per fixture: the market's shortest price in the three-way, i.e. its own favourite. */
const legs = [];
const rejected = [];
for (const r of eligibleFixtures) {
  const three = (r.matchResult ?? []).filter((o) => Number.isFinite(o?.american));
  if (three.length !== 3) { rejected.push({ eventId: r.eventId, reason: "incomplete three-way price" }); continue; }
  const fav = three.reduce((best, o) => (o.american < best.american ? o : best));

  // Which of home/draw/away the favourite is — the side gradeEplLeg will be asked to settle.
  const side = fav.outcome === "Draw" ? "draw" : fav.outcome === r.home ? "home" : fav.outcome === r.away ? "away" : null;
  if (!side) { rejected.push({ eventId: r.eventId, reason: `favourite "${fav.outcome}" matches neither club nor Draw — refusing to guess which side to grade` }); continue; }

  /*
   * THE CANONICAL LEG-PRICE FLOOR.
   *
   * An extreme favourite barely moves the payout while still being able to lose the whole card — it
   * is filler that buys nothing. This is where EPL differs sharply from the other sports in
   * practice: a three-way market makes heavy favourites common, and many of this slate's shortest
   * prices sit inside the floor. Those fixtures simply do not produce a leg, and the bands they
   * would have filled are reported as skipped rather than filled with something weaker.
   */
  if (fav.american < INDIVIDUAL_LEG_ODDS_GUARDS.minFavoriteAmerican || fav.american > INDIVIDUAL_LEG_ODDS_GUARDS.maxUnderdogAmerican) {
    rejected.push({ eventId: r.eventId, reason: `favourite priced ${fav.american}, outside the canonical leg guard` });
    continue;
  }

  legs.push({
    sport: "epl", eventId: r.eventId,
    player: null, team: side === "draw" ? null : fav.outcome,
    matchup: `${r.home} v ${r.away}`,
    market: "match_result", marketLabel: "Match result", side, line: null,
    odds: fav.american,
    decimal: fav.american > 0 ? 1 + fav.american / 100 : 1 + 100 / Math.abs(fav.american),
    books: fav.books ?? null,
    kickoffUtc: r.kickoffIso,
    /* Deliberately absent: any model probability. This ladder makes no model claim — see the header. */
  });
}

/*
 * Shortest price first — the MARKET'S ordering, not ours.
 *
 * The UFC ladder sorts by model confidence because its model earned the right to supply an ordering.
 * Sorting by price here makes no claim at all: it is simply the order the books put these matches
 * in, and it keeps the shortest cards genuinely short.
 */
legs.sort((a, z) => a.odds - z.odds);

const cards = [], skipped = [], used = new Set();
for (const band of RISK_ORDER) {
  const cap = BAND_MAX_LEGS[band] ?? 5;
  let built = null; const reached = [];
  for (let n = 2; n <= cap; n++) {
    const pick = legs.filter((l) => !used.has(l.eventId)).slice(0, n);
    if (pick.length < n) break;                              // not enough distinct fixtures left
    const d = pick.reduce((p, l) => p * l.decimal, 1);
    const american = d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
    const bucket = getRiskBucketForCombinedOdds(american);
    reached.push(`${n} legs → ${american > 0 ? "+" : ""}${american} (${bucket ?? "shorter than the low floor"})`);
    if (bucket === band) { built = { legs: pick, american, decimal: Number(d.toFixed(3)) }; break; }
  }
  if (!built) {
    skipped.push({ tier: band, reason: reached.length ? `no card priced into this band — ${reached.join("; ")}` : "not enough eligible priced fixtures to build a card" });
    continue;
  }
  for (const l of built.legs) used.add(l.eventId);
  cards.push({
    tier: band, slipId: `epl-${band}-${DATE}`,
    combinedAmerican: built.american, combinedDecimal: built.decimal,
    legs: built.legs,
    status: "pending",
    /* Null, never 0-0: this stream has settled nothing, and a zeroed record reads as a measured
       result rather than an absent one. */
    tierRecord: null,
  });
}

write({
  ...base, state: "PUBLISHED",
  pricedFixtures: eligibleFixtures.length, eligibleLegs: legs.length, rejectedLegs: rejected,
  cards, skipped,
  note: "Prices are real, posted and de-vigged for display only; the side is THE MARKET'S OWN FAVOURITE, " +
        "never this model's read — the EPL model has passed no preregistered bar and has never been compared " +
        "against a no-vig price. Every leg settles from an official full-time score. Paper-only, educational.",
});
console.log(`epl ladder ${DATE}: ${eligibleFixtures.length} priced fixtures · ${legs.length} eligible legs -> ${cards.length}/4 bands carded${skipped.length ? ` (skipped ${skipped.map((s) => s.tier).join(", ")})` : ""}`);
for (const c of cards) console.log(`  ${c.tier.padEnd(9)} ${c.combinedAmerican > 0 ? "+" : ""}${c.combinedAmerican} · ${c.legs.length} legs · ${c.legs.map((l) => l.side === "draw" ? `${l.matchup} draw` : l.team).join(" + ")}`);
for (const s of skipped) console.log(`  ${s.tier.padEnd(9)} SKIPPED — ${s.reason}`);
