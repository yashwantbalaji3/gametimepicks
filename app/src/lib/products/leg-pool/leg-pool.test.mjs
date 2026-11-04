/**
 * Leg pool + daily suggested cards, on the COMMITTED 2026-11-02 NBA lane (a fixed past slate, not latest).
 *   npx tsx --test src/lib/products/leg-pool/leg-pool.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLegPool, laneFreshness, favouredAvailability } from "./leg-pool.mjs";
import { dailySuggestedCards, CARD_STATE, TIER_THRESHOLD } from "./daily-cards.mjs";
import { GUARD, READINESS, guardReasons, playerGuard } from "./nba-guard.mjs";
import { nbaGameWinnerTiers } from "../level-a/nba-game-winner-tiers.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const DATE = "2026-11-02";
const NOW = "2026-11-02T12:00:00Z";
const LANE = JSON.parse(fs.readFileSync(path.join(REPO, `app/public/data/nba/experimental-public/${DATE}.json`), "utf8"));
const pool = (o = {}) => buildLegPool({ repoRoot: REPO, date: DATE, evaluatedAt: NOW, ...o });
const P = pool();
const D = dailySuggestedCards(P);

test("guard constants are the social pack's (p2-social-pack 948a8fde6a) — change both or neither", () => {
  assert.deepEqual({ ...GUARD }, { minGames: 3, hardMinutes: 42, band: 4 });
  assert.deepEqual({ ...READINESS }, { cap: 48, blockGap: 14.3, review: 41, reviewGap: 8.4, minGames: 3, statShare: 0.25, statFloor: 3 });
  assert.deepEqual(guardReasons({ n: 6, mu: 30, minLo: 28, minHi: 34 }, null), []);
  assert.deepEqual(guardReasons({ n: 6, mu: 30, minLo: 28, minHi: 34 }, "Day-To-Day"), ["R1"]);
  assert.deepEqual(guardReasons({ n: 2, mu: 30, minLo: 28, minHi: 34 }, null), ["R2"]);
  assert.deepEqual(guardReasons({ n: 6, mu: 43, minLo: 38, minHi: 40 }, null), ["R3"]);
  assert.deepEqual(guardReasons({ n: 6, mu: 16.3, minLo: 34, minHi: 38 }, null), ["R3"]);
});

test("Nov 2 audit cases: SGA at 48 min and Trae Young at 16 min are blocked by R3; Day-To-Day Jalen Johnson by R1", () => {
  const by = (n) => P.playerProjections.find((p) => p.name === n);
  assert.ok(by("Shai Gilgeous-Alexander").guard.rules.includes("R3"));
  assert.ok(by("Trae Young").guard.rules.includes("R3"));
  assert.ok(by("Jalen Johnson").guard.rules.includes("R1"));
  for (const p of P.playerProjections) assert.equal(p.usableInCards, false, "player medians are never card legs");
});

test("box scores from the slate day or later never feed the guard (time-lock)", () => {
  const lane = LANE.games[0];
  const p = lane.players.away[0];
  const g = playerGuard(p, undefined);
  assert.ok(g.rules.includes("R2"), "no history is a block, never a silent pass");
});

test("NBA parlay tiers and Moonshot equal the shared engine on the same legs (one computation)", () => {
  const legs = P.nbaLegs.map((l) => l.leg);
  const ref = nbaGameWinnerTiers({ legs, accessor: P.accessor, receiptOf: P.receiptOf, disclosure: P.display.disclosure, enabled: true });
  const ids = (c) => c?.legs.map((l) => String(l.eventId)).sort().join("|") ?? null;
  for (const t of ref.tiers) assert.equal(ids(D.parlays.nba.find((x) => x.tier === t.tier).card), ids(t.card), t.tier);
  assert.equal(ids(D.moonshot.nba.card), ids(ref.moonshot.card));
  // the 06:01Z production build recorded these for Nov 2 (data/internal/products/level-a/suggestions.jsonl)
  assert.equal(D.bankBuilder.nba.card.jointProbability, 0.6632);
  assert.equal(D.moonshot.nba.card.jointShown, "14.27%");
});

test("option (a) off by default: Bank Builder selects as the live page; on: it never uses a flagged leg", () => {
  const review = new Set(P.nbaLegs.filter((l) => l.guard.state === "review").map((l) => l.legId));
  assert.ok(review.size > 0, "Nov 2 has Day-To-Day rotation players on favoured teams");
  const ref = nbaGameWinnerTiers({ legs: P.nbaLegs.map((l) => l.leg), accessor: P.accessor, receiptOf: P.receiptOf, enabled: true });
  assert.equal(D.options.bankBuilderExcludesFlagged, false);
  assert.deepEqual(D.bankBuilder.nba.card.legs.map((l) => l.eventId), ref.bankBuilder.card.legs.map((l) => String(l.eventId)));
  const on = dailySuggestedCards(P, { bankBuilderExcludesFlagged: true });
  for (const l of on.bankBuilder.nba.card.legs) assert.ok(!review.has(l.legId));
  const flagged = [...D.parlays.nba.map((t) => t.card), D.moonshot.nba.card].filter(Boolean).flatMap((c) => c.legs).filter((l) => review.has(l.legId));
  for (const l of flagged) assert.ok(l.guard.flags.some((f) => f === "FAVOURED_ROTATION_OUT" || f === "FAVOURED_ROTATION_R1"));
});

test("option (b) off by default: nothing reads the frozen file", async () => {
  const { loadFrozenDailyCards, FROZEN_DAILY_CARDS_PUBLIC } = await import("./page-source.mjs");
  assert.equal(FROZEN_DAILY_CARDS_PUBLIC, false);
  assert.equal(loadFrozenDailyCards({ appDir: path.join(REPO, "app"), date: DATE, enabled: false }), null);
});

test("availability context: an Out season-rotation player and a Day-To-Day one flag the side; Out players are listed", () => {
  const g = { players: { home: [{ providerAthleteId: "1", name: "A", expectedMinutes: 34, injuryStatus: "Day-To-Day" }, { providerAthleteId: "2", name: "B", expectedMinutes: 10, injuryStatus: null }], unavailable: { home: [{ providerAthleteId: "3", name: "C", reason: "RULED_OUT", status: "Out" }] } } };
  const hist = { players: { 1: [{ minutes: 30 }], 2: [{ minutes: 12 }], 3: [{ minutes: 36 }] } };
  const a = favouredAvailability(g, "home", hist);
  assert.deepEqual(a.flags, ["FAVOURED_ROTATION_OUT", "FAVOURED_ROTATION_R1"]);
  assert.equal(a.outAtFreeze[0].name, "C");
  assert.equal(a.rotation[0].name, "C", "the Out star leads the season rotation");
});

test("stale, future-dated or missing lane: NBA blocked / no games, and no NBA card is ever forced", () => {
  assert.deepEqual(laneFreshness(LANE, { date: DATE, evaluatedAt: "2026-11-03T12:00:00Z" }), ["LANE_STALE"]);
  assert.deepEqual(laneFreshness(LANE, { date: DATE, evaluatedAt: "2026-11-02T05:00:00Z" }), ["LANE_FROM_FUTURE"]);
  assert.deepEqual(laneFreshness(null, { date: DATE, evaluatedAt: NOW }), ["LANE_MISSING"]);
  const missing = dailySuggestedCards(pool({ lane: null, sources: { selections: [], nbaProjections: [] } }));
  assert.equal(missing.sports.nba.state, "no-games");
  for (const s of [missing.bankBuilder.nba, missing.moonshot.nba, ...missing.parlays.nba]) { assert.equal(s.card, null); assert.equal(s.state, CARD_STATE.BLOCKED); }
});

test("after tips the started games leave the pool; too few legs reads insufficient with a reason", () => {
  const late = dailySuggestedCards(pool({ evaluatedAt: "2026-11-03T02:45:00Z" }));
  for (const l of late.legs) assert.ok(Date.parse(l.startUtc) - Date.parse("2026-11-03T02:45:00Z") >= 30 * 60 * 1000);
  assert.equal(late.sports.nba.state, "no-eligible-legs");
  assert.ok(late.refused.some((r) => r.sport === "nba" && r.reasons.includes("EVENT_STARTED")), "started games are refused with a reason");
  for (const s of [late.bankBuilder.nba, late.moonshot.nba, ...late.parlays.nba]) {
    assert.equal(s.card, null);
    assert.equal(s.state, CARD_STATE.INSUFFICIENT);
    assert.match(s.reason, /^Insufficient eligible legs/);
  }
});

test("no price, payout, line, book or link anywhere; nothing reads like a sportsbook price; no 'qualified' state", () => {
  const text = JSON.stringify(D);
  const walk = (o, at = "") => {
    if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${at}[${i}]`));
    if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
      if (/^(price|payout|odds|line|book|bookmaker|url|href|link|deepLink)$/i.test(k)) assert.ok(v == null, `${at}.${k} must be null`);
      walk(v, `${at}.${k}`);
    }
  };
  walk(D);
  assert.doesNotMatch(text, /[+−-]\d{3}\b(?!\d)(?=[^%]*")/, "no American-odds-looking number");
  assert.doesNotMatch(text, /https?:\/\//);
  assert.doesNotMatch(text, /"state":"qualified"/);
  assert.equal(D.pricing.state, "MODEL_ONLY");
  assert.match(TIER_THRESHOLD.low, /50\.0% to 66\.7%/);
});

test("deterministic: same inputs and instant → identical bytes", () => {
  assert.equal(JSON.stringify(dailySuggestedCards(pool())), JSON.stringify(D));
});

test("NFL and UFC are closed on the Level A axis and contribute nothing", () => {
  assert.equal(D.sports.nfl.state, "closed");
  assert.equal(D.sports.ufc.state, "closed");
  assert.ok(!D.legs.some((l) => l.sport === "nfl" || l.sport === "ufc"));
});


test("grading reads the same file: a missing final is PENDING (never a loss), one lost leg loses the card", async () => {
  const { gradeSuggestedCards } = await import("./grade-cards.mjs");
  const card = D.bankBuilder.nba.card;
  const [a, b] = card.legs;
  const row = (l, won) => ({ providerEventId: l.eventId, winnerSide: won ? l.selection.code : l.selection.code === "home" ? "away" : "home", ftHome: 1, ftAway: 0, home: { tricode: "H" }, away: { tricode: "A" } });
  const g0 = gradeSuggestedCards(D, { finals: [] }).cards.find((c) => c.product === "bank-builder");
  assert.equal(g0.state, "PENDING");
  assert.equal(gradeSuggestedCards(D, { finals: [row(a, true), row(b, true)] }).cards.find((c) => c.product === "bank-builder").state, "WIN");
  assert.equal(gradeSuggestedCards(D, { finals: [row(a, false)] }).cards.find((c) => c.product === "bank-builder").state, "LOSS");
  assert.equal(gradeSuggestedCards(D, { finals: [row(a, true)], conflicts: [{ providerEventId: b.eventId }] }).cards.find((c) => c.product === "bank-builder").state, "PENDING");
});

test("NBA legs are game winners only, said in the file; each side names its team", () => {
  assert.deepEqual(D.nbaLegKinds, ["game-winner"]);
  assert.equal(D.methodologyDependencies.find((m) => m.key === "nba-player-prop-probability").state, "NOT_APPROVED");
  for (const l of D.legs.filter((x) => x.sport === "nba")) { assert.equal(l.market, "winner"); assert.match(l.selection.teamAbbr, /^[A-Z]{2,4}$/); }
});

test("a leg's probability is the lane's stored value for its side, exactly", () => {
  for (const l of D.legs.filter((x) => x.sport === "nba")) {
    const g = LANE.games.find((x) => String(x.providerEventId) === l.eventId);
    assert.equal(l.probability, g.elo.winProbability[l.selection.code]);
  }
});

test("regression 2026-11-02: a favourite missing a season top-five player is flagged (ORL, MIN, GS)", () => {
  const leg = (abbr) => P.nbaLegs.find((l) => l.selection.teamAbbr === abbr);
  for (const [abbr, missing] of [["ORL", ["Paolo Banchero", "Jalen Suggs"]], ["MIN", ["Anthony Edwards"]], ["GS", ["Stephen Curry", "Draymond Green"]]]) {
    const l = leg(abbr);
    assert.equal(l.guard.state, "review", `${abbr} must not pass`);
    assert.ok(l.guard.flags.includes("FAVOURED_ROTATION_OUT"));
    assert.equal(l.guard.rotationSource, "season-box-scores");
    for (const n of missing) assert.ok(l.guard.rotationFlagged.some((r) => r.name === n && r.flag === "FAVOURED_ROTATION_OUT"), `${abbr}: ${n}`);
  }
  const on = dailySuggestedCards(P, { bankBuilderExcludesFlagged: true });
  const ids = (on.bankBuilder.nba.card?.legs ?? []).map((l) => l.selection.teamAbbr);
  assert.ok(!ids.includes("ORL") && !ids.includes("MIN"), "with (a) on, Bank Builder never builds on ORL or MIN");
});

test("rotation falls back to lane minutes only without season box scores, and says so", () => {
  const g = LANE.games.find((x) => x.home.abbr === "ORL");
  const a = favouredAvailability(g, "home", null);
  assert.equal(a.rotationSource, "lane-projected-minutes");
  assert.ok(a.flags.includes("ROTATION_FROM_LANE"));
});

test("our own card text uses MODEL PROJECTION wording, never estimate / est. / projected median", () => {
  for (const c of [D.bankBuilder.nba.card, D.moonshot.nba.card, ...D.parlays.nba.map((t) => t.card)].filter(Boolean)) {
    for (const t of [c.rationale, c.confidence]) { assert.doesNotMatch(t, /estimate|\best\.|projected median/i); assert.match(t, /MODEL PROJECTION/); }
  }
  for (const m of D.methodologyDependencies) assert.doesNotMatch(m.effect, /estimate|\best\.|projected median/i);
});
