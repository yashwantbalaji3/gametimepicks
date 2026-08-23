#!/usr/bin/env node
/**
 * SETTLE THE PARLAY LAB — grade the day's published ladder from official results.
 *
 * The ladder publishes one card per tier before first pitch. This grades those exact cards, writes
 * a DATED, WRITE-ONCE receipt, and stops. The ledger is rebuilt from the receipts separately, so a
 * bad run here can never silently rewrite the record.
 *
 * RULES, deliberately conservative — the same ones the MLB player-prop settler uses:
 *   · a game that is not FINAL leaves its leg PENDING, never a loss
 *   · a player absent from the official box score is PENDING — a scratch is not a losing bet
 *   · a card is LOST the moment any leg loses, WON only when every leg wins
 *   · a settled day is written ONCE; an identical re-run is a no-op, a differing one refuses
 *
 *   node app/scripts/parlays/settle-lab-cards.mjs --now <ISO> [--date YYYY-MM-DD] [--apply]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradeEplLeg } from "../../src/lib/sports/epl/settlement-contract.mjs";
import { loadCurrentEplResults } from "../../src/lib/soccer/epl-current-results.mjs";
import { loadOfficialUfcResults, fighterIndexForDate } from "../../src/lib/sports/ufc/official-results.mjs";
import { classifyReceiptChange, RECEIPT_CHANGE } from "../../src/lib/parlays/receipt-completion.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LADDER = path.join(APP, "public", "data", "parlays", "risk-ladder");
const RECEIPTS = path.join(APP, "public", "data", "parlays", "lab-settled");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const apply = process.argv.includes("--apply");

/**
 * Default to YESTERDAY IN ET, not the UTC day. Settlement runs after midnight ET when UTC has
 * already rolled over, so slicing an ISO instant names a slate that has not been played — the exact
 * trap that made the first automated MLB settlement a silent no-op.
 */
const etYesterday = () => {
  const et = new Date(new Date(NOW).toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setDate(et.getDate() - 1);
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, "0")}-${String(et.getDate()).padStart(2, "0")}`;
};
const DATE = arg("--date", etYesterday());

const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * UFC BOUT OUTCOMES, from the official results capture.
 *
 * A fight-winner leg does not settle on a stat line — it settles on who won — so it needs its own
 * path rather than a special case bolted into the box-score reader. Until this existed the settler
 * could only grade MLB, which meant a cross-sport card was publishable and ungradeable: it would
 * have sat pending forever and never entered the record, quietly computing the published hit rate
 * over only the cards that happened to be settleable.
 *
 * Matching is on the FOLDED fighter name, both sides. The results capture writes "Kaue Fernandes"
 * where a card may carry "Kauê Fernandes", and an unfolded compare silently reads a real result as
 * "no result yet" — which grades as pending, i.e. as if the fight had not happened.
 */
function loadUfcResults() {
  /*
   * ── BOTH OFFICIAL SOURCES, NOT JUST THE SLOW ONE ───────────────────────────────────────────────
   *
   * This read only the ufcstats corpus, which is published by a third party and runs days behind.
   * On 2026-08-23 it reported no result for the 2026-08-22 card while our OWN ESPN capture held
   * seven of its bouts marked FINAL with named winners — so every leg pended for a card that had
   * been fought, decided and captured. "The fights have not happened" and "one of our two records
   * has not caught up" look identical from inside a settler that only reads one of them.
   *
   * loadOfficialUfcResults merges the two on the same date-qualified bout key and REFUSES any bout
   * where they name different winners rather than preferring either — a contradiction between two
   * official records is not something a settler may resolve, and a wrong winner written into an
   * append-only ledger cannot be taken back. Across all 1,574 overlapping bouts they currently
   * disagree on none.
   *
   * The date confinement below is unchanged and still load-bearing.
   */
  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
  const merged = loadOfficialUfcResults({
    corpus: readJson(path.join(APP, "public", "data", "ufc", "results-latest.json")),
    espn: readJson(path.join(APP, "public", "data", "ufc", "results", "latest.json")),
  });
  for (const c of merged.conflicts) {
    console.log(`  UFC CONFLICT ${c.boutId}: corpus ${c.corpus} vs ESPN ${c.espn} — bout refused, its legs pend`);
  }
  return fighterIndexForDate(merged.byBout, DATE);
}

const ufcResults = loadUfcResults();
if (ufcResults.size === 0) console.log(`no UFC results dated ${DATE} — every fight-winner leg pends`);

/**
 * EPL MATCH OUTCOMES, from the official full-time capture.
 *
 * A match-result leg settles on a score, not a stat line, so it needs its own path for exactly the
 * reason the UFC one above does. Without it an EPL leg would fall through to the box-score reader,
 * ask MLB StatsAPI for an undefined gamePk, and grade "pending" forever — a card publishable and
 * ungradeable, silently computing the published hit rate over only the cards that happened to be
 * settleable. That failure has already happened once here; it does not get to happen again on a
 * different sport.
 *
 * Joined on the CANONICAL eventId, which both the ladder and the results bridge derive from the same
 * builder, rather than on club names. Name matching is what makes a settler quietly read a real
 * result as "not played yet".
 */
function loadEplResults() {
  const byEvent = new Map();   // canonical eventId -> official shape for gradeEplLeg
  try {
    /*
     * THROUGH THE BRIDGE, NOT THE RAW CAPTURE.
     *
     * The first version of this read results/latest.json directly and keyed on r.canonicalEventId.
     * That field does not exist there — the raw capture carries only the PROVIDER's id. The map
     * came out empty, every EPL leg graded "pending", and a card would have sat unsettled forever
     * while the published hit rate quietly computed over only the cards that happened to be
     * settleable. Precisely the failure the UFC path above was written to end, reproduced on a new
     * sport twelve hours after the EPL grader made the identical mistake.
     *
     * loadCurrentEplResults is the identity bridge that already exists for this: it derives the
     * canonical id, refuses a duplicate, quarantines an unjoinable row, and exercises the settlement
     * contract at ingest. Using anything else here is writing a second, worse copy of it.
     */
    const out = loadCurrentEplResults({ nowIso: NOW });
    for (const r of out.results ?? []) {
      if (!r.canonicalEventId) continue;
      byEvent.set(r.canonicalEventId, {
        fixtureId: r.canonicalEventId,
        status: "FULL_TIME",                       // the bridge only emits cleanly-joined finals
        /* The bridge names these ftHome/ftAway; the contract wants homeGoalsFT/awayGoalsFT. Both
           spellings are read explicitly rather than relying on whichever happened to be present. */
        homeGoalsFT: r.ftHome ?? r.settlementResult?.homeGoalsFT ?? null,
        awayGoalsFT: r.ftAway ?? r.settlementResult?.awayGoalsFT ?? null,
      });
    }
  } catch { /* no capture yet — every EPL leg stays pending, which is the honest state */ }
  return byEvent;
}
const eplResults = loadEplResults();

/**
 * Grade one EPL leg through the SAME contract the results bridge exercises at ingest.
 *
 * VOID_PENDING_REVIEW maps to "pending", never to a loss: a postponed match reporting full time
 * without integer goals, or a market this contract does not know, is an open question rather than a
 * losing selection. Grading uncertainty as a loss is how a settled record acquires losses nobody
 * ever took.
 */
function gradeEplLegCard(leg) {
  const official = eplResults.get(leg.eventId);
  if (!official) return "pending";
  const out = gradeEplLeg({ market: leg.market, side: leg.side, line: leg.line ?? undefined }, official);
  if (out.outcome === "WIN") return "win";
  if (out.outcome === "LOSS") return "loss";
  return "pending";
}


/** Grade one fight-winner leg: did the named fighter win a decisive bout? */
function gradeUfcLeg(leg) {
  const r = ufcResults.get(norm(leg.player));
  if (!r) return "pending";                       // not fought yet, or a draw/no-contest — never a loss
  return r.won ? "win" : "loss";
}

/** The stat a market settles on, from one player's official box-score line. */
function actualFor(market, stats) {
  const b = stats?.batting ?? {}, p = stats?.pitching ?? {};
  const label = String(market ?? "").toLowerCase();
  if (label.includes("strikeout")) return p.strikeOuts ?? null;
  if (label.includes("out")) return p.outs ?? null;
  if (label.includes("earned")) return p.earnedRuns ?? null;
  if (label.includes("total base")) {
    if (b.hits == null) return null;
    const singles = (b.hits ?? 0) - (b.doubles ?? 0) - (b.triples ?? 0) - (b.homeRuns ?? 0);
    return singles + 2 * (b.doubles ?? 0) + 3 * (b.triples ?? 0) + 4 * (b.homeRuns ?? 0);
  }
  if (label.includes("runs") && label.includes("rbi")) {
    if (b.hits == null) return null;
    return (b.hits ?? 0) + (b.runs ?? 0) + (b.rbi ?? 0);
  }
  if (label.includes("hit")) return b.hits ?? null;
  return null;
}

const boxCache = new Map();
async function boxFor(gamePk) {
  if (!gamePk) return { final: false, byPlayer: new Map() };
  if (boxCache.has(gamePk)) return boxCache.get(gamePk);
  const out = { final: false, byPlayer: new Map() };
  try {
    const feed = await get(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
    out.final = feed?.gameData?.status?.abstractGameState === "Final";
    for (const side of ["away", "home"]) {
      for (const p of Object.values(feed?.liveData?.boxscore?.teams?.[side]?.players ?? {})) {
        if (p?.person?.fullName) out.byPlayer.set(norm(p.person.fullName), p.stats ?? {});
      }
    }
  } catch (e) { console.error(`  gamePk ${gamePk}: ${e.message}`); }
  boxCache.set(gamePk, out);
  return out;
}

/*
 * ── EVERY SPORT'S LADDER, NOT JUST BASEBALL'S ──────────────────────────────────────────────────
 *
 * This read one directory: public/data/parlays/risk-ladder, which is MLB's. UFC has been publishing
 * paper cards to risk-ladder-ufc since 2026-08-18 and EPL to risk-ladder-epl since tonight, and
 * NEITHER was ever opened. Three settlement receipts exist and all three are MLB-only; not one UFC
 * card has ever been graded.
 *
 * That is the precise failure the UFC grading path forty lines above was written to prevent —
 * "publishable and ungradeable, sitting pending forever and never entering the record, quietly
 * computing the published hit rate over only the cards that happened to be settleable". The path was
 * added; the file it needed to read was not. gradeUfcLeg has never once been called, because the
 * only ladder in scope contains nothing but MLB legs.
 *
 * Cards from every sport are now merged for the date. Legs already carry their own sport and the
 * router below keys on that, so nothing here needs to know which directory a card came from.
 */
const LADDER_DIRS = { mlb: "risk-ladder", ufc: "risk-ladder-ufc", epl: "risk-ladder-epl" };
const sources = [];
for (const [sport, dir] of Object.entries(LADDER_DIRS)) {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(APP, "public", "data", "parlays", dir, `${DATE}.json`), "utf8"));
    /*
     * CARDS ARE THE TEST, not a state field. MLB's ladder carries no `state` at all — it predates
     * the convention — while UFC's and EPL's say PUBLISHED. Requiring the field silently excluded
     * every MLB ladder ever written, which is the one sport that HAS been settling. A ladder with
     * cards is a ladder to settle; anything that declares a non-published state is skipped.
     */
    if (doc?.state && doc.state !== "PUBLISHED") continue;
    if (!Array.isArray(doc?.cards) || doc.cards.length === 0) continue;
    // Default each leg's sport from the ladder it came from: a single-sport ladder need not repeat
    // itself on every leg, and a leg with no sport would silently route to the box-score reader.
    const cards = doc.cards.map((c) => ({ ...c, legs: (c.legs ?? []).map((l) => ({ ...l, sport: l.sport ?? sport })) }));
    sources.push({ sport, count: cards.length, cards });
  } catch { /* no ladder for this sport on this date — a normal state, not a failure */ }
}
if (!sources.length) { console.log(`NOT_YET_OBSERVABLE: no published ladder for ${DATE} in any sport`); process.exit(0); }
console.log(`ladders for ${DATE}: ${sources.map((s) => `${s.sport} ${s.count}`).join(" · ")}`);
const ladder = { cards: sources.flatMap((s) => s.cards) };

const cards = [];
for (const card of ladder.cards ?? []) {
  const results = [];
  let combined = 1;
  for (const leg of card.legs ?? []) {
    if (leg.odds != null) combined *= dec(leg.odds);

    /* Route by the leg's OWN sport. A cross-sport card carries legs from more than one, so the
       grading path is a property of the leg, never of the card. */
    if ((leg.sport ?? "mlb") === "ufc") { results.push(gradeUfcLeg(leg)); continue; }
    if ((leg.sport ?? "mlb") === "epl") { results.push(gradeEplLegCard(leg)); continue; }

    const box = await boxFor(leg.gamePk);
    if (!box.final) { results.push("pending"); continue; }
    const stats = box.byPlayer.get(norm(leg.player));
    if (!stats) { results.push("pending"); continue; }         // scratch — never a loss
    const actual = actualFor(leg.marketLabel, stats);
    if (actual == null) { results.push("pending"); continue; }
    const over = String(leg.side ?? "").toLowerCase().startsWith("o");
    results.push(actual === leg.line ? "push" : (actual > leg.line) === over ? "win" : "loss");
  }
  const decisive = results.filter((r) => r !== "push");
  const result = results.includes("pending") && !results.includes("loss") ? "pending"
    : decisive.includes("loss") ? "loss"
    : decisive.length && decisive.every((r) => r === "win") ? "win"
    : "pending";
  /* Derived, never hardcoded: a card stamped "mlb" while holding a fight leg makes the receipt
     lie about what was graded, and the attribution is what the record is built from. */
  const sports = [...new Set((card.legs ?? []).map((l) => l.sport ?? "mlb"))].sort();
  cards.push({
    sport: sports.length === 1 ? sports[0] : "multi",
    sports,
    tier: card.tier, slipId: card.slipId, result,
    combinedDecimal: Number(combined.toFixed(6)), legs: results,
  });
  console.log(`  ${(card.tierLabel ?? card.tier ?? "?").padEnd(12)} ${result.toUpperCase()}`);
}

const receipt = {
  schemaVersion: 1, artifact: "parlay-lab-settlement", dataClass: "PUBLIC_DERIVED",
  date: DATE, settledAt: NOW.replace(/\.\d{3}Z$/, "Z"),
  source: "MLB Stats API official box score (feed/live), joined by gamePk; UFC official bout results (results-latest.json), joined by folded fighter name",
  policyVersion: 2,
  cards,
};

const decided = cards.filter((c) => c.result !== "pending").length;
console.log(`\n${decided}/${cards.length} cards decided for ${DATE}`);
if (!apply) { console.log("dry-run — nothing written. Re-run with --apply."); process.exit(0); }
if (decided === 0) { console.log("nothing decided yet — no receipt written"); process.exit(0); }

fs.mkdirSync(RECEIPTS, { recursive: true });
const out = path.join(RECEIPTS, `${DATE}.json`);
if (fs.existsSync(out)) {
  /*
   * A DAY WITH PENDING CARDS MUST STAY FINISHABLE.
   *
   * This compared the two receipts byte for byte and refused any difference. Refusing a REWRITE is
   * right and stays. But it also refused a COMPLETION — a card moving out of pending because its
   * result finally arrived — which closed the day to correction permanently, since no scheduled run
   * revisits anything but ET-yesterday. The 2026-08-22 UFC cards settled pending at 05:53 against a
   * results source that was days behind, and would have stayed pending forever.
   *
   * classifyReceiptChange draws the line: pending → decided ADDS information that did not exist
   * before; every other transition REPLACES information that did. A decided outcome never moves,
   * not even back to pending.
   */
  const prior = JSON.parse(fs.readFileSync(out, "utf8"));
  const change = classifyReceiptChange(prior.cards, receipt.cards);
  if (change.state === RECEIPT_CHANGE.NO_CHANGE) {
    console.log(`receipt ${DATE} already recorded and identical — left untouched`);
    process.exit(0);
  }
  if (change.state === RECEIPT_CHANGE.REWRITE) {
    console.log(`REFUSED: receipt ${DATE} exists and DIFFERS beyond completing a pending card. A settled day is not rewritten silently.`);
    for (const r of change.reasons) console.log(`  · ${r}`);
    process.exit(1);
  }
  for (const c of change.completed) console.log(`  COMPLETED ${c.slipId} · ${c.label}: pending -> ${c.to}`);
  // The receipt records that it was finished in a later pass, so the audit trail shows both stages
  // rather than presenting a late settlement as if it had happened on the night.
  receipt.completedAt = NOW;
  receipt.completedCards = change.completed;
  receipt.settledAt = prior.settledAt ?? receipt.settledAt;
  fs.writeFileSync(out, JSON.stringify(receipt, null, 1) + "\n");
  // Cards and legs are counted separately: "6 completed" reads as six cards when it was two cards
  // and four of their legs, and a settlement log that overstates its own scope is worth nothing.
  const cardsCompleted = new Set(change.completed.filter((c) => c.label === "the card").map((c) => c.slipId));
  const legsCompleted = change.completed.length - cardsCompleted.size;
  console.log(`receipt ${DATE} COMPLETED — ${cardsCompleted.size} card(s) and ${legsCompleted} leg(s) moved out of pending`);
  process.exit(0);
}
fs.writeFileSync(out, JSON.stringify(receipt, null, 1) + "\n");
console.log(`wrote parlays/lab-settled/${DATE}.json`);
