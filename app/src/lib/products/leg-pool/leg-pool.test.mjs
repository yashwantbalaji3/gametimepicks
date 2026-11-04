/**
 * Leg pool + daily suggested cards, on the COMMITTED 2026-11-02 NBA lane (a fixed past slate, not latest).
 *   npx tsx --test src/lib/products/leg-pool/leg-pool.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
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
  assert.equal(dailySuggestedCards(P, { bankBuilderExcludesFlagged: false }).bankBuilder.nba.card.jointProbability, 0.6632, "rule A off = the production pick");
  assert.equal(D.moonshot.nba.card.jointShown, "14.27%");
});

test("rule A ON (founder 2026-11-03): Bank Builder never uses a flagged leg and re-picks among the others; off: as the live page", () => {
  const review = new Set(P.nbaLegs.filter((l) => l.guard.state === "review").map((l) => l.legId));
  assert.ok(review.size > 0, "Nov 2 has favourites missing season rotation players");
  assert.equal(D.options.bankBuilderExcludesFlagged, true);
  for (const l of D.bankBuilder.nba.card.legs) assert.ok(!review.has(l.legId));
  assert.deepEqual(D.bankBuilder.nba.card.legs.map((l) => l.selection.teamAbbr).sort(), ["DEN", "NY"], "Nov 2: NY + DEN once ORL and MIN are excluded");
  const ref = nbaGameWinnerTiers({ legs: P.nbaLegs.map((l) => l.leg), accessor: P.accessor, receiptOf: P.receiptOf, enabled: true });
  const off = dailySuggestedCards(P, { bankBuilderExcludesFlagged: false });
  assert.deepEqual(off.bankBuilder.nba.card.legs.map((l) => l.eventId), ref.bankBuilder.card.legs.map((l) => String(l.eventId)));
  const flagged = [...D.parlays.nba.map((t) => t.card), D.moonshot.nba.card].filter(Boolean).flatMap((c) => c.legs).filter((l) => review.has(l.legId));
  for (const l of flagged) assert.ok(l.guard.flags.some((f) => f === "FAVOURED_ROTATION_OUT" || f === "FAVOURED_ROTATION_R1"));
});

test("rule B ON: pages, grader and social read only a sealed file whose content digest verifies", async () => {
  const { loadFrozenDailyCards, FROZEN_DAILY_CARDS_PUBLIC } = await import("./page-source.mjs");
  const { sealSuggestedCards, verifySuggestedCards } = await import("./daily-cards.mjs");
  assert.equal(FROZEN_DAILY_CARDS_PUBLIC, true);
  const sealed = sealSuggestedCards(D);
  assert.ok(verifySuggestedCards(sealed));
  assert.equal(sealSuggestedCards(sealed).contentSha256, sealed.contentSha256, "sealing is idempotent");
  assert.ok(!verifySuggestedCards({ ...sealed, bankBuilder: { ...sealed.bankBuilder, nba: { ...sealed.bankBuilder.nba, card: null } } }), "an altered file fails");
  assert.ok(!verifySuggestedCards(D), "an unsealed file fails");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cards-"));
  fs.mkdirSync(path.join(tmp, "public/data/suggested-cards"), { recursive: true });
  fs.writeFileSync(path.join(tmp, `public/data/suggested-cards/${DATE}.json`), JSON.stringify(sealed));
  assert.equal(loadFrozenDailyCards({ appDir: tmp, date: DATE })?.contentSha256, sealed.contentSha256);
  fs.writeFileSync(path.join(tmp, `public/data/suggested-cards/${DATE}.json`), JSON.stringify({ ...sealed, label: "edited" }));
  assert.equal(loadFrozenDailyCards({ appDir: tmp, date: DATE }), null, "a tampered file is refused");
  assert.equal(loadFrozenDailyCards({ appDir: tmp, date: "2026-11-05" }), null, "no file for the day: the page's fallback");
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
  const { sealSuggestedCards } = await import("./daily-cards.mjs");
  assert.throws(() => gradeSuggestedCards(D, { finals: [] }), /does not verify/, "an unsealed file is never graded");
  const S = sealSuggestedCards(D);
  const card = S.bankBuilder.nba.card;
  const [a, b] = card.legs;
  const row = (l, won) => ({ providerEventId: l.eventId, winnerSide: won ? l.selection.code : l.selection.code === "home" ? "away" : "home", ftHome: 1, ftAway: 0, home: { tricode: "H" }, away: { tricode: "A" } });
  const g0 = gradeSuggestedCards(S, { finals: [] }).cards.find((c) => c.product === "bank-builder");
  assert.equal(g0.state, "PENDING");
  assert.equal(gradeSuggestedCards(S, { finals: [row(a, true), row(b, true)] }).cards.find((c) => c.product === "bank-builder").state, "WIN");
  assert.equal(gradeSuggestedCards(S, { finals: [row(a, false)] }).cards.find((c) => c.product === "bank-builder").state, "LOSS");
  assert.equal(gradeSuggestedCards(S, { finals: [row(a, true)], conflicts: [{ providerEventId: b.eventId }] }).cards.find((c) => c.product === "bank-builder").state, "PENDING");
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

test("NFL reader: the official forecast as of the instant, one product day, held back while both founder rules are pending", async () => {
  const { nflPoolCandidates, gradeNflWinner, NFL_FORECAST_OF_RECORD, NFL_TIE_RULE } = await import("./nfl-reader.mjs");
  assert.equal(NFL_FORECAST_OF_RECORD, "PENDING"); assert.equal(NFL_TIE_RULE, "PENDING");
  const c = nflPoolCandidates({ repoRoot: REPO, date: "2026-11-08", evaluatedAt: "2026-11-03T18:00:00Z" });
  assert.equal(c.input.file, "app/public/data/nfl/forecasts/2026-11-03.json", "the newest file generated at or before the instant");
  assert.equal(c.legs.length, 0, "no NFL leg while the rules are pending (and the registry is CLOSED)");
  assert.ok(c.refused.length >= 10);
  for (const r of c.refused) {
    assert.ok(r.reasons.includes("RULE_PENDING:FORECAST_OF_RECORD") && r.reasons.includes("RULE_PENDING:TIE_RULE"));
    assert.equal(r.market, "winner"); assert.ok(r.probability > 0.5 && r.probability < 1); assert.ok(r.tieMass > 0);
    assert.ok(r.forecast.stampedAt < r.startUtc);
  }
  assert.equal(c.wouldQualify, c.refused.length, "every Nov 8 game fails only on the pending decisions");
  const pool = buildLegPool({ repoRoot: REPO, date: "2026-11-08", evaluatedAt: "2026-11-03T18:00:00Z", lane: null, sources: { selections: [], nbaProjections: [] } });
  assert.equal(pool.sports.nfl.state, "closed");
  assert.deepEqual(pool.sports.nfl.pendingRules, ["forecastOfRecord", "tieRule"]);
  assert.equal(pool.sports.nfl.wouldQualify, c.wouldQualify);
  const leg = { legId: "x", selection: { code: "home" } };
  assert.equal(gradeNflWinner(leg, { state: "FINAL", homeScore: 20, awayScore: 20 }).state, "PENDING_RULE");
  assert.equal(gradeNflWinner(leg, { state: "FINAL", homeScore: 20, awayScore: 20 }, "LOSS").state, "LOSS");
  assert.equal(gradeNflWinner(leg, { state: "FINAL", homeScore: 20, awayScore: 20 }, "VOID").state, "VOID");
  assert.equal(gradeNflWinner(leg, { state: "FINAL", homeScore: 24, awayScore: 20 }).state, "WIN");
  assert.equal(gradeNflWinner(leg, null).state, "PENDING");
});
