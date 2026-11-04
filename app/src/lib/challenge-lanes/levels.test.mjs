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

test("RESEARCH mode: role and lineup uncertainty are flags; a large lineup scenario against the side excludes; a guide window, not a band", () => {
  const R = { mode: "RESEARCH", minShrunkRateByFamily: { pts: 0.6 } };
  const cap = capture([["1", "p1", "pts", 20.5, 100, -120]]);
  const ev = (o, params = R) => evaluateLevelSet([legFromShortlist(row(o))], ctx(cap, MS1, { params }));
  const unstable = ev({ role: { minutesAvg: 30, minutesSd: 12, gamesPlayed: 8, stable: false } });
  assert.equal(unstable.classification, LEVEL.B, unstable.reasons.join("; "));
  assert.ok(unstable.flags.some((x) => x.startsWith("B_ROLE_UNSTABLE")) && unstable.flags.some((x) => x.startsWith("B_MINUTES_VOLATILE")));
  const against = ev({ lineup: { tonightScenario: "Star out", tonight: { games: 61, hits: 32 }, scenarios: [], sensitive: true, baseRepresentative: false } });
  assert.ok(against.reasons.some((x) => x.startsWith("C_LINEUP_EXCLUDED")), "61 games, 0.525: excluded");
  const thin = ev({ lineup: { tonightScenario: "X out", tonight: { games: 4, hits: 3 }, scenarios: [], sensitive: true, baseRepresentative: false } });
  assert.equal(thin.classification, LEVEL.B);
  assert.ok(thin.flags.some((x) => /C_LINEUP_UNCERTAIN .*wide uncertainty/.test(x)));
  assert.ok(ev({}).money.grossPayoutCents === 5000 && ev({}).classification === LEVEL.B, "+100 → $50.00: inside research-band@2");
  assert.ok(evaluateLevelSet([legFromShortlist(row())], ctx(capture([["1", "p1", "pts", 20.5, -150, 120]]), MS1)).reasons.some((x) => x.startsWith("OUT_OF_BAND")), "STRICT keeps its band");
  assert.ok(ev({ hitRate: { ...row().hitRate, shrunk: { rate: 0.58, nEffective: 84 } } }).reasons.some((x) => x.startsWith("A_WEAK_EVIDENCE")), "the family floor still applies");
});

test("RESEARCH with a contextual block: the contextual rate is the evidence; its exclude holds; MEDIUM/HIGH are flags", () => {
  const R = { mode: "RESEARCH" };
  const cap = capture([["1", "p1", "pts", 20.5, 100, -120]]);
  const lu = (cx) => ({ ...row().lineup, sensitive: true, baseRepresentative: false, contextual: cx });
  const ev = (cx) => evaluateLevelSet([legFromShortlist(row({ lineup: lu(cx) }))], ctx(cap, MS1, { params: R }));
  const low = ev({ primary: { rate: 0.52, interval95: [0.4, 0.6], nEff: 70, exact: { hits: 30, games: 50 } }, flagLevel: "LOW", exclude: false });
  assert.ok(low.reasons.some((x) => x.startsWith("A_WEAK_EVIDENCE")), "contextual 0.52 replaces the lineup-blind 0.64");
  const high = ev({ primary: { rate: 0.66, interval95: [0.55, 0.75], nEff: 70, exact: { hits: 2, games: 2 } }, flagLevel: "HIGH", exclude: false });
  assert.equal(high.classification, LEVEL.B);
  assert.equal(high.rankKeys.flagCount, 2, "HIGH counts twice");
  assert.ok(ev({ primary: { rate: 0.7 }, flagLevel: "LOW", exclude: true, excludeReason: "player himself DAY_TO_DAY" }).reasons.some((x) => x.startsWith("C_LINEUP_EXCLUDED")));
});

test("research card record: selection label and flag codes public; evidence line, flag text and lineup context private", async () => {
  const { publicLeg, privateLeg, SELECTION_LABEL } = await import("./card-fields.mjs");
  const cap = capture([["1", "p1", "pts", 20.5, -150, 120]]);
  const r = evaluateLevelSet([legFromShortlist(row({ role: { minutesAvg: 30, minutesSd: 12, gamesPlayed: 8, stable: false }, hitRate: { windows: [{ window: "last10", hits: 7, n: 10 }, { window: "last20", hits: 13, n: 20 }, { window: "2025-26", hits: 45, n: 70 }], shrunk: { rate: 0.64, nEffective: 84 } }, lineup: { ...row().lineup, sensitive: true, contextual: { primary: { rate: 0.66, interval95: [0.55, 0.75], nEff: 70, exact: { hits: 2, games: 2 } }, flagLevel: "HIGH", exclude: false, expectedLineup: "Star out", uncertainTeammates: [{ name: "Wing" }] } } }))], ctx(cap, MS1, { params: { mode: "RESEARCH" } }));
  const card = levelCardRecord(r, { laneId: "ms-a", date: "2026-11-04" });
  assert.deepEqual([card.selectionMode, card.selectionLabel], ["RESEARCH", SELECTION_LABEL.RESEARCH]);
  assert.deepEqual(card.flags.map((f) => [f.code, f.level]), [["B_ROLE_UNSTABLE", null], ["B_MINUTES_VOLATILE", null], ["C_LINEUP_HIGH", "HIGH"]]);
  const pub = JSON.stringify({ ...card, legs: card.legs.map(publicLeg) });
  assert.ok(!/flagText|lineupContext|7\/10|0\.66|20\.5/.test(pub.replace(/"money":\{[^}]*\}|"combined":\{[^}]*\}|"reasons":\[[^\]]*\]/g, "")), "public legs carry no flag text, counts, rates or line");
  const priv = privateLeg(card.legs[0]);
  assert.equal(priv.evidenceLine, "Hit 7/10 L10 · 13/20 L20");
  assert.equal(priv.flagText.length, 3);
  assert.deepEqual(priv.lineup, { expectedLineup: "Star out", exact: { hits: 2, games: 2 }, uncertainTeammates: ["Wing"] });
});

test("minutes drop ≥ 20% flags and caps evidence to minutes-comparable games; lane types split moneyline and props", async () => {
  const { assignFourLanes } = await import("./levels.mjs");
  const R = { mode: "RESEARCH" };
  const cap = capture([["1", "p1", "pts", 20.5, -150, 120], ["2", "p2", "pts", 20.5, 100, -120]]);
  const kj = row({ role: { minutesAvg: 23, minutesSd: 3, gamesPlayed: 7, stable: true, note: "lane projected 15.5 min; L5 mean 24.4" }, hitRate: { windows: [{ window: "last10", hits: 9, n: 10 }, { window: "2025-26", hits: 59, n: 82 }, { window: "last20-minutes-within-4", hits: 4, n: 9 }], shrunk: { rate: 0.656, nEffective: 70 } } });
  const r = evaluateLevelSet([legFromShortlist(kj)], ctx(cap, MS1, { params: R }));
  assert.ok(r.flags.some((x) => x.startsWith("B_MINUTES_DROP")));
  assert.ok(r.reasons.some((x) => /A_WEAK_EVIDENCE .*minutes-comparable rate 0\.455/.test(x)), r.reasons.join("; "));
  const legs = [legFromShortlist(row({ eventId: "2", eventLabel: "CCC @ DDD", player: { playerId: "p2", name: "Two", team: "DDD" } }))];
  const s = assignFourLanes({ legs, now: NOW, propCapture: cap, params: { laneTypes: { "bb-a": "moneyline", "ms-a": "moneyline", "bb-b": "props", "ms-b": "props" } } });
  assert.deepEqual(["bb-a", "bb-b", "ms-a", "ms-b"].map((id) => s.lanes[id].status), ["HELD", "READY_FOR_APPROVAL", "HELD", "READY_FOR_APPROVAL"]);
  assert.equal(s.lanes["bb-a"].code, "NO_CANDIDATES_FOR_LANE_TYPE");
  assert.ok(s.lanes["bb-b"].optionsABC.A && s.lanes["bb-b"].optionsABC.B === null);
});

test("lane type: refused on mismatch; carried by a v2 run into the projection and the display", async () => {
  const { runStartedV2 } = await import("./rules-v2.mjs");
  const { laneProjection } = await import("./projection.mjs");
  const { laneDisplay } = await import("./display.mjs");
  const cap = capture([["1", "p1", "pts", 20.5, 100, -120]]);
  const r = evaluateLevelSet([legFromShortlist(row())], ctx(cap, MS1, { laneType: "NBA_MONEYLINE" }));
  assert.ok(r.reasons.some((x) => x.startsWith("LANE_TYPE_MISMATCH")));
  assert.ok(!evaluateLevelSet([legFromShortlist(row())], ctx(cap, MS1, { laneType: "NBA_PLAYER_PROPS" })).reasons.some((x) => x.startsWith("LANE_TYPE")));
  const ev = [runStartedV2({ laneId: "ms-b", runId: "run-2", startedAt: "2026-11-05T12:00:00Z", approvedBy: "TEST", laneType: "NBA_PLAYER_PROPS" })];
  const pub = laneProjection("ms-b", [ev]);
  assert.deepEqual([pub.laneType, pub.laneTypeLabel, pub.runs[0].laneType], ["NBA_PLAYER_PROPS", "NBA PLAYER PROPS", "NBA_PLAYER_PROPS"]);
  const d = laneDisplay(pub);
  assert.deepEqual([d.laneType, d.laneTypeLabel, d.runs[0].laneTypeLabel], ["NBA_PLAYER_PROPS", "NBA PLAYER PROPS", "NBA PLAYER PROPS"]);
  assert.throws(() => runStartedV2({ laneId: "ms-b", runId: "r", startedAt: "x", approvedBy: "T", laneType: "MIXED" }), /unknown laneType/);
});

test("moneyline evidence line: model side vs market favourite and W-L, no probability; null without the windows", async () => {
  const { moneylineEvidenceLine, evidenceLine } = await import("./card-fields.mjs");
  const leg = legFromShortlist(row({ eventId: "9", family: "winner", player: null, teamAbbr: "DET", side: "home", line: null, eloSide: "home", hitRate: { windows: [{ window: "last5", hits: 4, n: 5 }, { window: "last10", hits: 6, n: 7 }, { window: "season-2026-27", hits: 6, n: 7 }, { window: "home-2026-27", hits: 2, n: 2 }], shrunk: { rate: null, marketNoVig: 0.557 } }, injury: { status: "n/a (team)", keyPlayers: [{ name: "Star", status: "OUT" }] } }));
  assert.equal(evidenceLine(leg), "Model side DET · market favourite DET · W-L L5 4-1 · L10 6-1 · season 6-1 · home 2-0 · key players: Star out");
  assert.equal(moneylineEvidenceLine({ ...leg, eloSide: undefined }), null);
  assert.ok(!/%|0\\.557/.test(evidenceLine(leg)));
});

test("research-band@2 (founder 20:45Z): strict ±10% gross band, both products, dynamic per step", () => {
  const R = { mode: "RESEARCH" };
  const BB = stepPosition({ product: "bank-builder", step: 1, bankrollCents: 10000 });
  const at = (gross, position) => evaluateLevelSet([legFromShortlist(row())], ctx(capture([["1", "p1", "pts", 20.5, Math.round(gross - 100), -300]]), position, { params: R }));
  const refused = (r) => r.reasons.some((x) => x.startsWith("OUT_OF_GUIDE_WINDOW"));
  /* +100 on $100 = $200; American +A gives gross 100 + A on a $100 stake */
  assert.ok(refused(evaluateLevelSet([legFromShortlist(row())], ctx(capture([["1", "p1", "pts", 20.5, -278, 220]]), MS1, { params: R }))), "$33.99 on a $50 target is refused now");
  const g = (american, position) => evaluateLevelSet([legFromShortlist(row())], ctx(capture([["1", "p1", "pts", 20.5, american, american > 0 ? -american - 20 : 100]]), position, { params: R }));
  assert.ok(refused(g(-126, BB)), "$179.36 < $180");
  assert.ok(!refused(g(-125, BB)), "$180.00 passes");
  assert.ok(!refused(g(120, BB)), "$220.00 passes");
  assert.ok(refused(g(121, BB)), "$221.00 refused");
  assert.ok(!refused(g(-122, MS1)) && refused(g(130, MS1)), "Moonshot $45–$55");
  const step2 = stepPosition({ product: "moonshot", step: 2, bankrollCents: 5240 });
  assert.deepEqual([step2.targetCents, Math.ceil(step2.targetCents * 0.9), Math.floor(step2.targetCents * 1.1)], [10000, 9000, 11000]);
  assert.ok(!refused(g(-110, step2)), "$52.40 at −110 → $100.03: inside [$90, $110] for the settled bankroll");
  void at;
});

test("diversity@1: identical combinations refused (order-insensitive), a leg in ≤ 2 lanes, no duplicate fallback; approval binds the exact record", async () => {
  const { diversityRefusal, approvalValid, assignFourLanes } = await import("./levels.mjs");
  const L1 = { legs: [{ legId: "a" }, { legId: "b" }] }; const L1r = { legs: [{ legId: "b" }, { legId: "a" }] };
  assert.equal(diversityRefusal([L1], L1r), "DIVERSITY_DUPLICATE_COMBINATION");
  assert.equal(diversityRefusal([L1], { legs: [{ legId: "a" }, { legId: "c" }] }), null, "a leg shared twice is fine");
  assert.match(diversityRefusal([L1, { legs: [{ legId: "a" }, { legId: "c" }] }], { legs: [{ legId: "a" }, { legId: "d" }] }), /DIVERSITY_LEG_LIMIT a/);
  assert.equal(diversityRefusal([], { legs: [{ legId: "a" }] }), null);
  assert.equal(diversityRefusal([{ legs: [{ legId: "a" }] }], { legs: [{ legId: "a" }] }), "DIVERSITY_DUPLICATE_COMBINATION", "duplicate single refused");
  const cap = capture([["1", "p1", "pts", 20.5, 100, -120]]);
  const one = assignFourLanes({ legs: [legFromShortlist(row())], now: NOW, propCapture: cap, params: { diversity: "diversity@1", laneTypes: { "bb-b": "NBA_PLAYER_PROPS", "ms-b": "NBA_PLAYER_PROPS", "bb-a": "NBA_MONEYLINE", "ms-a": "NBA_MONEYLINE" } } });
  assert.equal(one.lanes["bb-b"].status, "READY_FOR_APPROVAL");
  assert.deepEqual([one.lanes["ms-b"].status, one.lanes["ms-b"].code], ["HELD", "NO_QUALIFIED_CARD"], "one card only: the second props lane is HELD, never a duplicate");
  const rec = { candidateId: "c1", recordSha256: "s1" };
  assert.equal(approvalValid(rec, { candidateId: "c1", recordSha256: "s1" }), true);
  assert.equal(approvalValid({ ...rec, recordSha256: "s2" }, { candidateId: "c1", recordSha256: "s1" }), false, "a replaced leg or price invalidates the approval");
});

test("diversityViolations (shared checker): same-date scope, order-insensitive, leg ≤ 2 lanes, held lanes skipped", async () => {
  const { diversityViolations } = await import("./card-fields.mjs");
  const d = "2026-11-04";
  assert.deepEqual(diversityViolations([{ laneId: "bb-a", date: d, legIds: ["a", "b"] }, { laneId: "ms-a", date: d, legIds: ["b", "a"] }]).length, 1);
  assert.deepEqual(diversityViolations([{ laneId: "bb-a", date: d, legIds: ["a", "b"] }, { laneId: "ms-a", date: d, legIds: ["a", "c"] }, { laneId: "bb-b", date: d, legIds: [] }]), []);
  assert.match(diversityViolations([{ laneId: "bb-a", date: d, legIds: ["a"] }, { laneId: "ms-a", date: d, legIds: ["a", "c"] }, { laneId: "bb-b", date: d, legIds: ["a", "d"] }]).join(), /DIVERSITY_LEG_LIMIT .*a in 3 lanes/);
  assert.deepEqual(diversityViolations([{ laneId: "bb-a", date: d, legIds: ["a"] }, { laneId: "ms-a", date: "2026-11-05", legIds: ["a"] }]), [], "different days are independent");
});

test("diversity@2: zero repeated selections; books, snapshots, order and alternate lines don't bypass; a changed leg invalidates approval", async () => {
  const { diversityViolations } = await import("./card-fields.mjs");
  const { diversityRefusal, approvalValid } = await import("./levels.mjs");
  const d = "2026-11-04";
  const a = legFromShortlist(row()); const aAlt = legFromShortlist(row({ line: 22.5 }));
  assert.equal(a.legId, aAlt.legId, "the same player-stat-side at an alternate line is the same selection");
  assert.equal(diversityRefusal([{ legs: [{ ...a, quote: { book: "draftkings" } }] }], { legs: [{ ...aAlt, quote: { book: "fanduel" } }, { legId: "z" }] }, { maxLegUse: 1 }), `DIVERSITY_LEG_LIMIT ${a.legId}: already in 1 lane(s)`, "another book, snapshot or line does not bypass");
  assert.equal(diversityViolations([{ laneId: "bb-a", date: d, legIds: ["x", "y"] }, { laneId: "ms-a", date: d, legIds: ["y", "q"] }], { maxLegUse: 1 }).length, 1, "a selection in two lanes is refused");
  assert.equal(diversityViolations([{ laneId: "bb-a", date: d, legIds: ["x", "y"] }, { laneId: "ms-a", date: d, legIds: ["y", "x"] }], { maxLegUse: 1 }).length, 3, "reversed order: duplicate combination plus both legs repeated");
  assert.deepEqual(diversityViolations([{ laneId: "bb-a", date: d, legIds: ["x", "y"] }, { laneId: "ms-a", date: d, legIds: ["p", "q"] }], { maxLegUse: 1 }), []);
  assert.equal(approvalValid({ candidateId: "c", recordSha256: "new" }, { candidateId: "c", recordSha256: "old" }), false);
});

test("selectionIdentity: books, snapshots, lines and order don't separate one selection", async () => {
  const { selectionIdentity, diversityViolations } = await import("./card-fields.mjs");
  const p1 = { sport: "nba", gameId: "1", family: "pts", player: { playerId: "p1" }, side: "over", line: 20.5, book: "draftkings", fetchedAt: "t1" };
  const p2 = { ...p1, line: 22.5, book: "fanduel", fetchedAt: "t2", recordId: "x" };
  assert.equal(selectionIdentity(p1), selectionIdentity(p2));
  const m1 = { gameId: "9", market: "h2h", side: "home", book: "draftkings" }; const m2 = { gameId: "9", family: "winner", side: "home", book: "betmgm" };
  assert.equal(selectionIdentity(m1), selectionIdentity(m2));
  assert.notEqual(selectionIdentity(m1), selectionIdentity({ ...m1, side: "away" }));
  const d = "2026-11-04";
  assert.equal(diversityViolations([{ laneId: "bb-a", date: d, legs: [p1, m1] }, { laneId: "ms-a", date: d, legs: [m2, { ...p2 }] }], { maxLegUse: 1 }).length, 3);
});

test("diversity@2 ruling: OVER and UNDER of one player-stat, or both teams' moneylines in one game, across lanes is refused", async () => {
  const { diversityViolations } = await import("./card-fields.mjs");
  const { diversityRefusal } = await import("./levels.mjs");
  const d = "2026-11-04";
  const over = { gameId: "1", family: "pts", player: { playerId: "p1" }, side: "over", line: 20.5 };
  const under = { ...over, side: "under", line: 22.5 };
  assert.match(diversityViolations([{ laneId: "bb-b", date: d, legs: [over] }, { laneId: "ms-b", date: d, legs: [under] }], { maxLegUse: 1 }).join(), /DIVERSITY_OPPOSING_SIDES/);
  const home = { gameId: "9", family: "winner", side: "home" }; const away = { gameId: "9", family: "winner", side: "away" };
  assert.match(diversityViolations([{ laneId: "bb-a", date: d, legs: [home] }, { laneId: "ms-a", date: d, legs: [away] }], { maxLegUse: 1 }).join(), /DIVERSITY_OPPOSING_SIDES/);
  assert.match(diversityRefusal([{ legs: [{ legId: "x", ...over }] }], { legs: [{ legId: "y", ...under }] }, { maxLegUse: 1 }), /^DIVERSITY_OPPOSING_SIDES/);
  assert.deepEqual(diversityViolations([{ laneId: "bb-b", date: d, legs: [over] }, { laneId: "ms-b", date: d, legs: [{ ...over, family: "reb", side: "under" }] }], { maxLegUse: 1 }), [], "another stat of the same player is a different proposition");
});

test("Nov 4 snapshot override: past 90 min only inside its capture window, before expiry and tip; disclosed; off by default", async () => {
  const { NOV4_SNAPSHOT_OVERRIDE } = await import("./levels.mjs");
  const F = "2026-11-04T21:06:40Z";
  const capF = capture([["1", "p1", "pts", 20.5, 100, -120]], F);
  const at = (now, params) => evaluateLevelSet([legFromShortlist(row({ startUtc: "2026-11-05T03:30Z" }))], { position: MS1, now, propIx: indexPropCapture(capF), params });
  assert.ok(at("2026-11-04T22:50:00Z", null).reasons.some((x) => x.startsWith("E_STALE_QUOTE")), "off by default");
  const ok = at("2026-11-04T22:50:00Z", { freshnessOverride: NOV4_SNAPSHOT_OVERRIDE });
  assert.ok(!ok.reasons.some((x) => x.startsWith("E_STALE_QUOTE")) && ok.flags.some((x) => x.startsWith("E_SNAPSHOT_OVERRIDE")));
  assert.ok(at("2026-11-05T05:10:00Z", { freshnessOverride: NOV4_SNAPSHOT_OVERRIDE }).reasons.some((x) => x.startsWith("E_STALE_QUOTE") || x.startsWith("STARTED")), "expired / after tip");
  const capOther = capture([["1", "p1", "pts", 20.5, 100, -120]], "2026-11-04T19:05:00Z");
  assert.ok(evaluateLevelSet([legFromShortlist(row({ startUtc: "2026-11-05T03:30Z" }))], { position: MS1, now: "2026-11-04T22:50:00Z", propIx: indexPropCapture(capOther), params: { freshnessOverride: NOV4_SNAPSHOT_OVERRIDE } }).reasons.some((x) => x.startsWith("E_STALE_QUOTE")), "a 19:05Z quote is outside the window");
});

test("latestPostAt: earliest tip, and the exception's expiry instead of fetch + 90 min (never fetch + 90 under the Nov 4 exception)", async () => {
  const { latestPostAt, NOV4_SNAPSHOT_OVERRIDE } = await import("./levels.mjs");
  const legs = [{ startUtc: "2026-11-05T01:00Z", fetchedAt: "2026-11-04T21:05:12.990Z" }, { startUtc: "2026-11-05T01:30Z", fetchedAt: "2026-11-04T21:05:12.990Z" }];
  assert.equal(latestPostAt(legs), "2026-11-04T22:35:12.990Z", "without the exception: fetch + 90 min");
  assert.equal(latestPostAt(legs, { freshnessOverride: NOV4_SNAPSHOT_OVERRIDE }), "2026-11-05T01:00:00.000Z", "with it: the earliest tip");
  assert.equal(latestPostAt([{ startUtc: "2026-11-05T06:00Z", fetchedAt: "2026-11-04T21:06:40Z" }], { freshnessOverride: NOV4_SNAPSHOT_OVERRIDE }), "2026-11-05T04:59:59.000Z", "a late tip is capped by the exception's expiry");
  assert.equal(latestPostAt([{ startUtc: "2026-11-05T01:00Z", fetchedAt: "2026-11-04T19:05:00Z" }], { freshnessOverride: NOV4_SNAPSHOT_OVERRIDE }), "2026-11-04T20:35:00.000Z", "a quote outside the window keeps the 90-minute limit");
});

test("public projection of a final-candidate card@2: no priceCheck, display counts, ESPN snapshot, displayCard or money", async () => {
  const { runStartedV2 } = await import("./rules-v2.mjs");
  const { laneProjection } = await import("./projection.mjs");
  const { append } = await import("./lanes.mjs");
  let ev = [runStartedV2({ laneId: "bb-b", runId: "run-2", startedAt: "2026-11-04T22:00:00Z", approvedBy: "TEST", laneType: "NBA_PLAYER_PROPS" })];
  const leg = { ...legFromShortlist(row()), book: "draftkings", price: 107, line: 3.5, priceCheck: { book: "draftkings", line: 3.5, price: 107 }, display: { last5: "4/5", line: 3.5 }, espnNow: { status: "active" } };
  const card = { classification: "LEVEL_B", candidateId: "c", legs: [leg], money: { grossPayoutCents: 20700 }, displayCard: { grossPayoutCents: 20700 }, combined: { american: 107 }, priceCheckAll: "PASS", caption: { disclosure: "x" } };
  ev = append(ev, { type: "CARD_FROZEN", date: "2026-11-04", step: 1, at: "2026-11-04T22:01:00Z", source: "t", card });
  const txt = JSON.stringify(laneProjection("bb-b", [ev]));
  assert.ok(!/draftkings|"line":|priceCheck|displayCard|grossPayoutCents|"american"|espnNow|hitRate|"last5"/.test(txt), txt.slice(0, 300));
});
