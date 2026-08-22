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
/*
 * `--odds <path>` overrides the capture this reads.
 *
 * Added for the band-coverage guard, which needs a full ten-fixture slate: by mid-afternoon most
 * fixtures have kicked off, so the live artifact cannot answer "can four bands be built" either way.
 * The guard used to swap the live file and restore it, which is unsafe the moment test files run in
 * parallel — another test read the synthetic capture and reported a sport closed on a price dated
 * 2099. An input path costs nothing and touches no shared state.
 */
const odds = readJson(arg("--odds", null) ?? path.join(APP, "public", "data", "soccer", "epl", "odds", "latest.json"));

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
/*
 * ── CANDIDATES PER FIXTURE ─────────────────────────────────────────────────────────────────────
 *
 * This offered exactly one leg per fixture: the market's shortest price in the three-way. That is a
 * defensible selection and a terrible price range. Three-way favourites cluster short, so the
 * shortest two-leg card a matchday could build was already past the `low` band, and `medium` and
 * `longshot` were routinely unreachable — three of four bands reported as skipped on a full slate.
 *
 * The authorised capture pays for TOTALS as well as the three-way, and gradeEplLeg settles
 * total_goals from the same official score. Those prices sit either side of even money (+121 / -140
 * at line 3, -145 / +115 at 2.5 on today's card) where the favourites do not, so including them
 * widens what a ladder can build WITHOUT touching a single band threshold — the fix this repository
 * already rejected once, when a +203 card was published as "Low risk".
 *
 * Still ONE LEG PER FIXTURE. A match result and a total from the same match are one match twice, and
 * correlated at that; the `used` set keys on eventId and enforces it.
 *
 * None of these is a model read. A favourite is the market's own, and an over/under is the market's
 * own line at the market's own price.
 */
const decOf = (am) => (am > 0 ? 1 + am / 100 : 1 + 100 / Math.abs(am));
const inGuard = (am) => am >= INDIVIDUAL_LEG_ODDS_GUARDS.minFavoriteAmerican && am <= INDIVIDUAL_LEG_ODDS_GUARDS.maxUnderdogAmerican;

function candidatesFor(r) {
  const out = [];
  const base = { sport: "epl", eventId: r.eventId, player: null, matchup: `${r.home} v ${r.away}`, kickoffUtc: r.kickoffIso };

  const three = (r.matchResult ?? []).filter((o) => Number.isFinite(o?.american));
  if (three.length === 3) {
    const fav = three.reduce((best, o) => (o.american < best.american ? o : best));
    const side = fav.outcome === "Draw" ? "draw" : fav.outcome === r.home ? "home" : fav.outcome === r.away ? "away" : null;
    if (side && inGuard(fav.american)) {
      out.push({ ...base, team: side === "draw" ? null : fav.outcome, market: "match_result", marketLabel: "Match result",
        side, line: null, odds: fav.american, decimal: decOf(fav.american), books: fav.books ?? null });
    }
  }
  for (const t of r.totalGoals ?? []) {
    if (typeof t?.line !== "number") continue;
    for (const o of t.outcomes ?? []) {
      const side = String(o?.outcome ?? "").toLowerCase();
      if ((side !== "over" && side !== "under") || !Number.isFinite(o?.american) || !inGuard(o.american)) continue;
      out.push({ ...base, team: null, market: "total_goals", marketLabel: `Total goals ${t.line}`,
        side, line: t.line, odds: o.american, decimal: decOf(o.american), books: o.books ?? null });
    }
  }
  return out.sort((a, z) => a.decimal - z.decimal);   // shortest first
}

const byFixture = [];
const rejected = [];
for (const r of eligibleFixtures) {
  const c = candidatesFor(r);
  if (c.length === 0) { rejected.push({ eventId: r.eventId, reason: "no priced leg inside the canonical guard" }); continue; }
  byFixture.push({ eventId: r.eventId, kickoffIso: r.kickoffIso, candidates: c });
}
/*
 * SHORTEST-PRICED FIXTURE FIRST — the market's own ordering, and the only one that can reach `low`.
 *
 * Kickoff order looked neutral and quietly made a whole band unbuildable: a card only ever gets
 * LONGER as legs are upgraded, so the shortest achievable card is the two shortest fixtures. Taking
 * them in kickoff order gave +115 when the two shortest favourites give +82, and `low` was reported
 * skipped on a full ten-fixture slate that could comfortably build it.
 *
 * This makes no claim about any match. It is the order the books put them in.
 */
byFixture.sort((a, b) => a.candidates[0].decimal - b.candidates[0].decimal
  || Date.parse(a.kickoffIso) - Date.parse(b.kickoffIso));
const legs = byFixture.map((f) => f.candidates[0]);

/*
 * ── BUILDING A CARD FOR A BAND ─────────────────────────────────────────────────────────────────
 *
 * Each fixture starts on its SHORTEST candidate. If the combined price falls short of the band, one
 * leg at a time is upgraded to that fixture's next-longer candidate — always the fixture where the
 * step up is smallest — until the band is reached or every candidate is exhausted.
 *
 * This is the ladder doing its job, assembling a card at a target price, not a view being expressed:
 * every candidate is a market price on a settleable market, and swapping a match result for an over
 * makes neither one a prediction. What it must never do is move the band, which is the fix this
 * repository rejected when a +203 card was published as "Low risk".
 */
const combinedOf = (pick) => {
  const d = pick.reduce((p, l) => p * l.decimal, 1);
  return { decimal: d, american: d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)) };
};

function buildForBand(band, n, available) {
  const chosen = available.slice(0, n).map((f) => ({ fixture: f, idx: 0 }));
  if (chosen.length < n) return null;
  const reached = [];
  const maxSteps = chosen.reduce((t, c) => t + c.fixture.candidates.length, 0);   // always terminates
  for (let step = 0; step <= maxSteps; step += 1) {
    const pick = chosen.map((c) => c.fixture.candidates[c.idx]);
    const { american, decimal } = combinedOf(pick);
    const bucket = getRiskBucketForCombinedOdds(american);
    reached.push(`${american > 0 ? "+" : ""}${american} (${bucket ?? "shorter than the low floor"})`);
    if (bucket === band) return { legs: pick, american, decimal: Number(decimal.toFixed(3)), reached };
    let best = -1, bestRatio = Infinity;
    for (let i = 0; i < chosen.length; i += 1) {
      const next = chosen[i].fixture.candidates[chosen[i].idx + 1];
      if (!next) continue;
      const ratio = next.decimal / chosen[i].fixture.candidates[chosen[i].idx].decimal;
      if (ratio < bestRatio) { bestRatio = ratio; best = i; }
    }
    if (best < 0) break;
    chosen[best].idx += 1;
  }
  return { legs: null, reached };
}

const cards = [], skipped = [], used = new Set();
for (const band of RISK_ORDER) {
  const cap = BAND_MAX_LEGS[band] ?? 5;
  let built = null; const tried = [];
  for (let n = 2; n <= cap; n++) {
    const available = byFixture.filter((f) => !used.has(f.eventId));
    if (available.length < n) break;
    const attempt = buildForBand(band, n, available);
    if (!attempt) break;
    tried.push(`${n} legs → ${attempt.reached[0]}${attempt.reached.length > 1 ? ` … ${attempt.reached.at(-1)}` : ""}`);
    if (attempt.legs) { built = attempt; break; }
  }
  if (!built) {
    skipped.push({ tier: band, reason: tried.length ? `no combination of today's prices lands in this band — ${tried.join("; ")}` : "not enough eligible priced fixtures to build a card" });
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
  /* How the side was chosen, carried WITH the cards — see the UFC ladder for why this is per-sport. */
  selection: "a market price on a settleable market — the three-way favourite, or an over/under at the book's own line. Never this model's read: the EPL model has cleared no bar and has never been scored against a no-vig line",
  note: "Prices are real, posted and de-vigged for display only; the side is THE MARKET'S OWN FAVOURITE, " +
        "never this model's read — the EPL model has passed no preregistered bar and has never been compared " +
        "against a no-vig price. Every leg settles from an official full-time score. Paper-only, educational.",
});
console.log(`epl ladder ${DATE}: ${eligibleFixtures.length} priced fixtures · ${legs.length} eligible legs -> ${cards.length}/4 bands carded${skipped.length ? ` (skipped ${skipped.map((s) => s.tier).join(", ")})` : ""}`);
/* A totals leg has neither a team nor a player, so describing it by team prints an empty slot. */
const legDesc = (l) => l.market === "total_goals" ? `${l.matchup} ${l.side} ${l.line}` : l.side === "draw" ? `${l.matchup} draw` : (l.team ?? l.matchup);
for (const c of cards) console.log(`  ${c.tier.padEnd(9)} ${c.combinedAmerican > 0 ? "+" : ""}${c.combinedAmerican} · ${c.legs.length} legs · ${c.legs.map(legDesc).join(" + ")}`);
for (const s of skipped) console.log(`  ${s.tier.padEnd(9)} SKIPPED — ${s.reason}`);
