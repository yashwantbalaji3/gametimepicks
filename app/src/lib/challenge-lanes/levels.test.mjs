/**
 * Recommendation classes (levels.mjs) on SYNTHETIC shortlist rows and SYNTHETIC prop quotes: no real line or price.
 *   npx tsx --test src/lib/challenge-lanes/levels.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonical, sha256 } from "./chain.mjs";
import { stepPosition } from "./rules-v2.mjs";
import { LEVEL, RANKING_LABEL, verifyShortlist, legFromShortlist, evaluateLevelSet, evaluateLevelCandidates, constructLevelPair, levelCardRecord, sealCardRecord, hitRateText, indexPropCapture } from "./levels.mjs";

const NOW = "2026-11-04T21:00:00Z";
const FETCHED = "2026-11-04T20:45:00Z";
const BOOKS = ["draftkings", "fanduel", "betmgm"];
const MS1 = stepPosition({ product: "moonshot", step: 1, bankrollCents: 2500 });
const BB1 = stepPosition({ product: "bank-builder", step: 1, bankrollCents: 10000 });

const row = (o = {}) => ({
  eventId: "1", eventLabel: "AAA @ BBB", startUtc: "2026-11-05T00:00Z", family: "pts", player: { playerId: "p1", name: "Player One", team: "BBB" }, side: "over", line: 20.5,
  hitRate: { windows: [{ window: "last5", hits: 4, n: 5 }, { window: "season-2026-27", hits: 6, n: 8 }, { window: "2025-26", hits: 45, n: 70 }], shrunk: { rate: 0.64, nEffective: 83, method: "test" }, lineBasis: "exact" },
  role: { minutesAvg: 34, minutesSd: 3, gamesPlayed: 8, starts: 8, stable: true }, injury: { status: "ACTIVE", source: "test", fetchedAt: FETCHED }, dataQuality: { ok: true, issues: [] },
  lineup: { keyTeammates: [{ playerId: "t1", name: "Teammate", statusNow: "ACTIVE" }], scenarios: [{ label: "all in", teammatesOut: [], games: 40, hits: 26, minutesAvg: 34 }], tonightScenario: "all in", baseRepresentative: true, sensitive: false },
  forecastVersion: "test-eval", evidenceSha256: sha256("e"), ...o,
});
/* quotes: [eventId, playerId, family, line, over, under, books?] */
const capture = (quotes, fetchedAt = FETCHED) => ({ records: quotes.flatMap(([eventId, pid, family, line, over, under, books = BOOKS]) => books.map((book) => ({ schema: "gtp.nba.prop-price@1", eventId, providerAthleteId: pid, family, line, book, overAmerican: over, underAmerican: under, capturedAt: fetchedAt, fetchedAt, recordId: `r-${eventId}-${pid}-${book}-${line}` }))) });
const ctx = (cap, position, extra = {}) => ({ position, now: NOW, propIx: indexPropCapture(cap), ...extra });

test("shortlist validation refuses a prop without an exact line or a window without a denominator", () => {
  assert.equal(verifyShortlist({ schema: "gtp.bbm.level-b-shortlist@1", candidates: [row()] }).ok, true);
  assert.equal(verifyShortlist({ schema: "gtp.bbm.level-b-shortlist@1", candidates: [row({ line: null })] }).ok, false);
  assert.equal(verifyShortlist({ schema: "gtp.bbm.level-b-shortlist@1", candidates: [row({ hitRate: { windows: [{ window: "last5", hits: 5 }] } })] }).ok, false);
});

test("a one-leg prop near 2× is LEVEL_B with no probability and no EV claim; denominators carried through", () => {
  const leg = legFromShortlist(row());
  const r = evaluateLevelSet([leg], ctx(capture([["1", "p1", "pts", 20.5, 100, -120]]), MS1));
  assert.equal(r.classification, LEVEL.B, r.reasons.join("; "));
  assert.deepEqual([r.probability, r.ev, r.evClaim, r.legs[0].probability, r.legs[0].ev], [null, null, false, null, null]);
  assert.deepEqual(r.legs[0].hitRate.windows.map((w) => [w.hits, w.n]), [[4, 5], [6, 8], [45, 70]]);
  assert.equal(r.legs[0].quote.line, 20.5);
  assert.equal(r.money.grossPayoutCents, 5000);
  assert.equal(r.rankingLabel, RANKING_LABEL);
});

test("the 5/5 ≠ 100% guard: a hit rate is only ever 'hits of n'; nothing displayed is a percentage from it", () => {
  assert.equal(hitRateText({ window: "last5", hits: 5, n: 5 }), "5 of 5 (last5)");
  const leg = legFromShortlist(row({ hitRate: { windows: [{ window: "last5", hits: 5, n: 5 }], shrunk: { rate: 0.7, nEffective: 5 } } }));
  const r = evaluateLevelSet([leg], ctx(capture([["1", "p1", "pts", 20.5, 100, -120]]), MS1));
  assert.ok(r.reasons.some((x) => x.startsWith("A_SMALL_SAMPLE")), "5 of 5 alone is not evidence");
  const card = levelCardRecord(r, { laneId: "ms-a", date: "2026-11-04" });
  assert.ok(!/100%|"probability":(?!null)/.test(JSON.stringify(card)));
});

test("two prop legs from different games and a prop + moneyline pair; exact line at one book", () => {
  const a = legFromShortlist(row());
  const b = legFromShortlist(row({ eventId: "2", eventLabel: "CCC @ DDD", player: { playerId: "p2", name: "Player Two", team: "DDD" }, family: "reb", line: 8.5 }));
  const cap = capture([["1", "p1", "pts", 20.5, -150, 120], ["2", "p2", "reb", 8.5, -350, 250]]);
  const r = evaluateLevelSet([a, b], ctx(cap, MS1));
  assert.equal(r.classification, LEVEL.B, r.reasons.join("; "));
  assert.equal(r.price.book, "draftkings");
  assert.equal(r.price.label, "calculated leg product");
  const offLine = capture([["1", "p1", "pts", 21.5, -150, 120], ["2", "p2", "reb", 8.5, -350, 250]]);
  assert.ok(evaluateLevelSet([a, b], ctx(offLine, MS1)).reasons.includes("E_NO_SINGLE_BOOK_AT_EXACT_LINE"), "a different line is never substituted");
  const ml = legFromShortlist(row({ eventId: "3", eventLabel: "EEE @ FFF", family: "winner", player: null, teamAbbr: "FFF", side: "home", line: null, role: null }));
  const doc = { schema: "gtp.bbm.price-snapshot@1", fetchedAt: FETCHED, games: { 3: { books: Object.fromEntries(BOOKS.map((k) => [k, { home: { price: -400 }, away: { price: 300 }, lastUpdate: FETCHED }])) } } };
  const h2h = { ...doc, snapshotSha256: sha256(canonical(doc)) };
  const mix = evaluateLevelSet([a, ml], ctx(cap, MS1, { h2h }));
  assert.equal(mix.classification, LEVEL.B, mix.reasons.join("; "));
});

test("correlation: same player or same game is refused", () => {
  const a = legFromShortlist(row());
  const b = legFromShortlist(row({ family: "reb", line: 8.5 }));
  const c = legFromShortlist(row({ player: { playerId: "p3", name: "Three", team: "AAA" }, family: "ast", line: 5.5 }));
  const cap = capture([["1", "p1", "pts", 20.5, -150, 120], ["1", "p1", "reb", 8.5, -130, 105], ["1", "p3", "ast", 5.5, -130, 105]]);
  assert.ok(evaluateLevelSet([a, b], ctx(cap, MS1)).reasons.some((x) => x.startsWith("CORRELATED_SAME_PLAYER")));
  assert.ok(evaluateLevelSet([a, c], ctx(cap, MS1)).reasons.some((x) => x.startsWith("CORRELATED_SAME_GAME")));
});

test("HOLD: availability, unstable role, stale quote, thin market, data quality, no evidence, out of band", () => {
  const cap = capture([["1", "p1", "pts", 20.5, 100, -120]]);
  const hold = (o, c = cap, p = MS1) => evaluateLevelSet([legFromShortlist(row(o))], ctx(c, p));
  const has = (r, code) => r.classification === LEVEL.HOLD && r.reasons.some((x) => x.startsWith(code));
  assert.ok(has(hold({ injury: { status: "QUESTIONABLE" } }), "C_AVAILABILITY"));
  assert.ok(has(hold({ role: { minutesAvg: 30, minutesSd: 12, gamesPlayed: 8, stable: true } }), "B_MINUTES_VOLATILE"));
  assert.ok(has(hold({ role: { minutesAvg: 30, minutesSd: 2, gamesPlayed: 8, stable: false, note: "new starter" } }), "B_ROLE_UNSTABLE"));
  assert.ok(has(hold({}, capture([["1", "p1", "pts", 20.5, 100, -120]], "2026-11-04T05:18:00Z")), "E_STALE_QUOTE"));
  assert.ok(has(hold({}, capture([["1", "p1", "pts", 20.5, 100, -120, ["draftkings"]]])), "E_THIN_MARKET"));
  assert.ok(has(hold({ dataQuality: { ok: false, issues: ["traded team"] } }), "D_DATA_QUALITY"));
  assert.ok(has(hold({ hitRate: null }), "A_NO_EVIDENCE"));
  assert.ok(has(hold({ hitRate: { windows: [{ window: "2025-26", hits: 30, n: 60 }], shrunk: { rate: 0.5, nEffective: 60 } } }), "A_WEAK_EVIDENCE"));
  assert.ok(has(hold({}, cap, BB1), "OUT_OF_BAND") === false, "+100 on $100 is $200: inside the Bank Builder band");
  assert.ok(has(hold({}, capture([["1", "p1", "pts", 20.5, 150, -180]])), "OUT_OF_BAND"));
});

test("Level B ranking is rules-based, deterministic, and never rewards payout; A/B diversified; nothing passes → HOLD", () => {
  const legs = [
    legFromShortlist(row()),
    legFromShortlist(row({ eventId: "2", eventLabel: "CCC @ DDD", player: { playerId: "p2", name: "Two", team: "DDD" }, hitRate: { windows: [{ window: "2025-26", hits: 50, n: 70 }], shrunk: { rate: 0.71, nEffective: 70 } } })),
  ];
  const cap = capture([["1", "p1", "pts", 20.5, 100, -120], ["2", "p2", "pts", 20.5, -105, -115]]);
  const ev = evaluateLevelCandidates({ legs, position: MS1, now: NOW, propCapture: cap });
  assert.equal(ev.ranked[0].legs[0].player.playerId, "p2", "stronger evidence first, though its payout is lower");
  const again = evaluateLevelCandidates({ legs: [...legs].reverse(), position: MS1, now: NOW, propCapture: cap });
  assert.deepEqual(again.ranked.map((r) => r.candidateId), ev.ranked.map((r) => r.candidateId));
  const pair = constructLevelPair({ legs, now: NOW, product: "moonshot", laneA: { step: 1, bankrollCents: 2500 }, laneB: { step: 1, bankrollCents: 2500 }, propCapture: cap });
  assert.deepEqual([pair.A.classification, pair.B.classification], [LEVEL.B, LEVEL.B]);
  assert.notEqual(pair.A.candidate.legs[0].gameId, pair.B.candidate.legs[0].gameId);
  const none = constructLevelPair({ legs: [legFromShortlist(row({ injury: { status: "OUT" } }))], now: NOW, product: "moonshot", laneA: { step: 1, bankrollCents: 2500 }, laneB: { step: 1, bankrollCents: 2500 }, propCapture: cap });
  assert.deepEqual([none.A.classification, none.A.code, none.B.classification], [LEVEL.HOLD, "NO_QUALIFIED_CARD", LEVEL.HOLD]);
});

test("card record: classification, pending approval and empty publication receipts; sealed deterministically", () => {
  const r = evaluateLevelSet([legFromShortlist(row())], ctx(capture([["1", "p1", "pts", 20.5, 100, -120]]), MS1));
  const c = sealCardRecord(levelCardRecord(r, { laneId: "ms-a", date: "2026-11-04" }));
  assert.deepEqual([c.classification, c.approvalStatus, c.priceEventSha256, c.graphicVersion, c.siteRecordVersion, c.xReceipt, c.evClaim], [LEVEL.B, "PENDING_FOUNDER", null, null, null, null, false]);
  assert.equal(sealCardRecord(levelCardRecord(r, { laneId: "ms-a", date: "2026-11-04" })).recordSha256, c.recordSha256);
});

test("public/private split: a card@2 or research file in plain JSON carries no line, book, price or hit rate; the encrypted views do", async () => {
  const { sampleOutputs } = await import("../../../scripts/challenge-lanes/v2-sample.mjs");
  const out = sampleOutputs();
  const bbb = out.find((o) => o.laneId === "bb-b"); const msb = out.find((o) => o.laneId === "ms-b");
  const plain = JSON.stringify(bbb.pub) + JSON.stringify(msb.research.public);
  assert.ok(!/"line"|"american"|synthetic-book|hitRate|"k":|18\.5|20\.5|9\.5/.test(plain), "no line-dependent field in a public file");
  const days = bbb.display.history.map((d) => [d.evidenceClass, d.evidenceLabel]);
  assert.deepEqual(days, [["LEVEL_A", "Model-validated value"], ["LEVEL_B", "Historical hit-rate research (experimental)"]]);
  const det = bbb.priced.history[1].price.legDetails;
  assert.deepEqual(det.map((l) => [l.line, l.hitRates[0]]), [[18.5, { window: "last10", k: 7, n: 10 }], [9.5, { window: "last10", k: 7, n: 10 }]]);
  assert.ok(det.every((l) => Date.parse(l.staleAfter) > Date.parse(l.fetchedAt)));
  assert.deepEqual([msb.researchView.official, msb.researchView.lanesHeld[0].heldCode, msb.researchView.candidates[0].status], [false, "NO_QUALIFIED_CARD", "RESEARCH"]);
  assert.ok(!/stakeCents|grossPayoutCents|profitCents/.test(JSON.stringify(msb.researchView)), "research never carries a stake or payout");
  assert.equal(msb.researchPublicView.candidates[0].legs[0].price, null, "without the companion, no price appears");
  const { researchDisplay } = await import("./research.mjs");
  assert.throws(() => researchDisplay(msb.research.public, { ...msb.research.prices, publicSha256: "0".repeat(64) }), /not made from/);
});

test("research files: written to the documented paths, read back verified; prices only with the key", async () => {
  const fs = await import("node:fs"); const os = await import("node:os"); const path = await import("node:path");
  const { sampleOutputs } = await import("../../../scripts/challenge-lanes/v2-sample.mjs");
  const io = await import("./research-io.mjs");
  const { research } = sampleOutputs().find((o) => o.laneId === "ms-b");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "research-")); const appDir = path.join(root, "app");
  const key = "ab".repeat(32);
  fs.mkdirSync(path.join(appDir, io.RESEARCH_PUBLIC_DIR, "moonshot"), { recursive: true });
  fs.mkdirSync(path.join(root, io.RESEARCH_PRICES_REPO_DIR, "moonshot"), { recursive: true });
  fs.writeFileSync(path.join(appDir, io.RESEARCH_PUBLIC_DIR, "moonshot", "2030-01-01.json"), io.serializeResearch(research.public));
  fs.writeFileSync(path.join(root, io.RESEARCH_PRICES_REPO_DIR, "moonshot", "2030-01-01.json.enc"), io.encryptResearchPrices("moonshot", research.prices, Buffer.from(key, "hex")));
  const priced = io.readResearchDisplay({ appDir, product: "moonshot", date: "2030-01-01", env: { GTP_ODDS_DISPLAY_KEY: key } });
  assert.equal(priced.priced, true);
  assert.equal(priced.candidates[0].legs[0].price.line, 20.5);
  const unpriced = io.readResearchDisplay({ appDir, product: "moonshot", date: "2030-01-01", env: {} });
  assert.deepEqual([unpriced.priced, unpriced.candidates[0].legs[0].price], [false, null]);
  assert.equal(io.readResearchDisplay({ appDir, product: "moonshot", date: "2030-01-02", env: {} }), null);
  assert.ok(!fs.readFileSync(path.join(appDir, io.RESEARCH_PUBLIC_DIR, "moonshot", "2030-01-01.json"), "utf8").includes("20.5"));
});


test("lineup sensitivity: no teammate-scenario evidence, a sensitive role or an unrepresentative base sample is HOLD", () => {
  const cap = capture([["1", "p1", "pts", 20.5, 100, -120]]);
  const r = (lineup) => evaluateLevelSet([legFromShortlist(row({ lineup }))], ctx(cap, MS1));
  assert.ok(r(null).reasons.some((x) => x.startsWith("C_LINEUP_UNKNOWN")));
  assert.ok(r({ scenarios: [], sensitive: true, baseRepresentative: true, note: "Tatum out: 3/9" }).reasons.some((x) => x.startsWith("C_LINEUP_SENSITIVE")));
  assert.ok(r({ scenarios: [], sensitive: false, baseRepresentative: false }).reasons.some((x) => x.startsWith("C_LINEUP_SENSITIVE")));
  assert.equal(r(row().lineup).classification, LEVEL.B);
});

test("four-lane assignment: partners game-disjoint; no identical card across products unless every alternative is weaker", async () => {
  const { assignFourLanes } = await import("./levels.mjs");
  const strong = (id, pid, o = {}) => row({ eventId: id, eventLabel: `G${id}A @ G${id}H`, player: { playerId: pid, name: `P${pid}`, team: "X" }, ...o });
  const legs = [strong("1", "a"), strong("2", "b"), strong("3", "c"), strong("4", "d")].map(legFromShortlist);
  const cap = capture([["1", "a", "pts", 20.5, 100, -120], ["2", "b", "pts", 20.5, 100, -120], ["3", "c", "pts", 20.5, 100, -120], ["4", "d", "pts", 20.5, 100, -120]]);
  const r = assignFourLanes({ legs, now: NOW, propCapture: cap });
  const key = (id) => r.lanes[id].card.legs.map((l) => l.legId).join("+");
  assert.equal(new Set(["bb-a", "bb-b", "ms-a", "ms-b"].map(key)).size, 4, "four different cards when equal-tier alternatives exist");
  assert.notEqual(r.lanes["bb-a"].card.legs[0].gameId, r.lanes["bb-b"].card.legs[0].gameId);
  for (const id of ["bb-a", "bb-b", "ms-a", "ms-b"]) assert.ok(r.lanes[id].options.length <= 3);
  const two = assignFourLanes({ legs: legs.slice(0, 2), now: NOW, propCapture: cap });
  assert.deepEqual(["bb-a", "bb-b", "ms-a", "ms-b"].map((id) => two.lanes[id].status), ["READY_FOR_APPROVAL", "READY_FOR_APPROVAL", "READY_FOR_APPROVAL", "READY_FOR_APPROVAL"]);
  assert.ok(two.tradeOffs.some((t) => /IDENTICAL/.test(t.note)), "only two cards exist: the identical card stands, recorded as a trade-off");
  const weakAlt = [strong("1", "a"), strong("2", "b", { hitRate: { windows: [{ window: "2025-26", hits: 40, n: 60 }], shrunk: { rate: 0.6, nEffective: 60 } } })].map(legFromShortlist);
  const w = assignFourLanes({ legs: weakAlt, now: NOW, propCapture: cap });
  assert.equal(w.lanes["ms-a"].card.legs[0].legId, w.lanes["bb-a"].card.legs[0].legId, "a weaker card never replaces the identical stronger one");
});

test("rank buckets are exact at the boundary: 0.60 and 0.618 share the 0.60–0.65 tier", () => {
  const legs = [legFromShortlist(row({ hitRate: { ...row().hitRate, shrunk: { rate: 0.6, nEffective: 84 } } })), legFromShortlist(row({ eventId: "2", eventLabel: "CCC @ DDD", player: { playerId: "p2", name: "Two", team: "DDD" }, hitRate: { ...row().hitRate, shrunk: { rate: 0.618, nEffective: 84 } } }))];
  const cap = capture([["1", "p1", "pts", 20.5, 100, -120], ["2", "p2", "pts", 20.5, 100, -120]]);
  const ev = evaluateLevelCandidates({ legs, position: MS1, now: NOW, propCapture: cap });
  assert.equal(ev.ranked.length, 2);
  assert.ok(ev.ranked[0].candidateId < ev.ranked[1].candidateId, "same tier and equal later keys: the id tie-break decides, not the 0.018 difference");
});

test("evidenceLine: counts only, from either leg shape; null when a window is missing", async () => {
  const { evidenceLine } = await import("./card-fields.mjs");
  const leg = legFromShortlist(row({ hitRate: { windows: [{ window: "last10", hits: 8, n: 10 }, { window: "last20", hits: 14, n: 20 }], shrunk: { rate: 0.62, nEffective: 84 } } }));
  assert.equal(evidenceLine(leg), "Hit 8/10 L10 · 14/20 L20");
  assert.equal(evidenceLine({ hitRates: [{ window: "last10", k: 8, n: 10 }, { window: "last20", k: 14, n: 20 }] }), "Hit 8/10 L10 · 14/20 L20");
  assert.equal(evidenceLine({ hitRates: [{ window: "last10", k: 8, n: 10 }] }), null);
});
