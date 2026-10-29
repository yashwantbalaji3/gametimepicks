/* NBA line coverage report: true denominators, one status per prediction, no price in any public or stdout output. */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildNbaLineCoverage, countRenderedComparisons, publicCoverageSummary, coverageMarkdown, STATUS } from "./line-coverage.mjs";

const DATE = "2099-01-15";
const AS_OF = "2099-01-15T23:30:00Z";
const FAMS = { pts: 22.4, reb: 6.1, ast: 4.2, threePm: 2.3 };
const COMBOS = { pra: 32.7, ptsReb: 28.5, ptsAst: 26.6 };
const player = (id, name, dropPra = false) => ({ providerAthleteId: id, name, medians: { ...FAMS }, comboMedians: dropPra ? { ptsReb: COMBOS.ptsReb, ptsAst: COMBOS.ptsAst } : { ...COMBOS } });
const LANE = {
  date: DATE,
  generatedAt: "2099-01-15T12:00:00Z",
  games: [
    { providerEventId: "9001", tipUtc: "2099-01-16T00:00:00Z", away: { abbr: "AAA" }, home: { abbr: "BBB" },
      players: { away: [player("101", "Alpha One"), player("102", "Bravo Two")], home: [player("103", "Charlie Three Jr.")] } },
    { providerEventId: "9002", tipUtc: "2099-01-16T02:00:00Z", away: { abbr: "CCC" }, home: { abbr: "DDD" },
      players: { away: [player("104", "Delta Four", true)], home: [] } },
  ],
};
const PRICES = [-137, 142, -151, 128, -163, 119];
let n = 0;
const rec = (eventId, athleteId, family, marketKey, book, line, capturedAt) => ({
  schema: "gtp.nba.prop-price@1", recordId: `npp_t${++n}`, eventId, providerAthleteId: athleteId, family, providerMarketKey: marketKey,
  line, book, overAmerican: PRICES[n % 6], underAmerican: PRICES[(n + 1) % 6], capturedAt, fetchedAt: capturedAt, playerName: "x",
});
const CAPTURE = {
  dataClass: "PRIVATE_RESEARCH", capturedFor: "2099-01-15T22:15:00Z", version: "nba-prop-capture@1",
  markets: ["player_points", "player_rebounds", "player_assists", "player_threes"],
  coverage: { state: "OK", events: { matchedEventIds: ["9001"] } },
  records: [
    rec("9001", "101", "pts", "player_points", "draftkings", 20.5, "2099-01-15T22:00:00Z"),
    rec("9001", "101", "pts", "player_points", "fanduel", 21.5, "2099-01-15T22:10:00Z"),
    rec("9001", "101", "reb", "player_rebounds", "draftkings", 11.5, "2099-01-15T12:00:00Z"), // > 6 h before the comparison instant
    rec("9001", "102", "pts", "player_points", "betmgm", 19.5, "2099-01-16T00:05:00Z"), // after tip
  ],
  refusals: [
    { level: "player", reason: "PLAYER_UNRESOLVED", eventId: "9001", book: "draftkings", marketKey: "player_points", providerName: "C. Three" },
    { level: "outcome", reason: "ONE_SIDED", eventId: "9001", book: "fanduel", marketKey: "player_rebounds", providerName: "Bravo Two" },
    { level: "player", reason: "PLAYER_UNRESOLVED", eventId: "9001", book: "fanduel", marketKey: "player_points", providerName: "Zulu Nobody" },
    { level: "event", reason: "EVENT_UNMATCHED", oddsEventId: "abc" },
  ],
};
const captures = () => [{ file: "2099-01-15T2215Z.json", doc: CAPTURE }, { file: "latest.json", doc: structuredClone(CAPTURE) }];
const SECRETS = ["-137", "142", "-151", "128", "-163", "119", "20.5", "21.5", "11.5", "19.5", "draftkings", "fanduel", "betmgm", "Alpha", "Bravo", "Charlie", "Delta", "Zulu"];
const AUTHORIZED = { nba: { siteDisplay: true, socialDisplay: false, socialFeedPrices: false, socialFeedPricesConfirmationRef: null, providerTermsRef: "test-terms", approvedBy: "test", approvedAt: "2099-01-01" } };

test("denominator is published player × family rows with a median; every prediction gets exactly one status", () => {
  const r = buildNbaLineCoverage({ lane: LANE, captures: captures(), asOf: AS_OF });
  assert.equal(r.denominator.predictions, 27); // 4 players × 7 families − 1 missing median
  assert.equal(r.denominator.laneRowsWithoutMedian, 1);
  assert.equal(r.predictions.length, 27);
  const o = r.overall;
  assert.equal(o.compared.count, 1);
  assert.equal(o.withheld.STALE_OR_AFTER_TIP.count, 2);
  assert.equal(o.withheld.IDENTITY_OR_MARKET_MISMATCH.count, 1);
  assert.equal(o.withheld.INVALID_QUOTE.count, 1);
  assert.equal(o.withheld.UNSUPPORTED.count, 9); // combos never requested for the captured game
  assert.equal(o.withheld.MISSING_QUOTE.count, 13);
  const sum = o.compared.count + Object.values(o.withheld).reduce((a, p) => a + p.count, 0);
  assert.equal(sum, o.predictions);
  for (const p of Object.values(o.withheld)) assert.equal(p.of, 27);
  assert.equal(o.compatibleCaptured.count, 5);
  assert.equal(o.displayEligible.count, 1, "the committed record authorizes site display (2026-10-29): every compared prediction is eligible");
  assert.equal(buildNbaLineCoverage({ lane: LANE, captures: captures(), asOf: AS_OF, authorization: { nba: { ...AUTHORIZED.nba, siteDisplay: false } } }).overall.displayEligible.count, 0, "site display off → none eligible");
  assert.equal(r.withheldDetail["MISSING_QUOTE:GAME_NOT_CAPTURED"], 6);
  assert.equal(r.withheldDetail["STALE_OR_AFTER_TIP:CAPTURED_AFTER_TIP"], 1);
  assert.equal(r.withheldDetail["STALE_OR_AFTER_TIP:STALE"], 1);
  // per market: points has 4 predictions, 1 compared, 3 with a compatible market captured
  assert.deepEqual([r.byMarket.pts.predictions, r.byMarket.pts.compared.count, r.byMarket.pts.compatibleCaptured.count], [4, 1, 3]);
  assert.equal(r.byMarket.pra.predictions, 3);
  // the duplicated latest.json is read once
  assert.equal(r.captures.length, 1);
  assert.equal(r.records.onThisSlate, 4);
});

test("identity refusal attributed to the lane player (reporting only); an unknown name stays unattributed", () => {
  const r = buildNbaLineCoverage({ lane: LANE, captures: captures(), asOf: AS_OF });
  const p3 = r.predictions.find((p) => p.athleteId === "103" && p.family === "pts");
  assert.equal(p3.status, STATUS.IDENTITY_OR_MARKET_MISMATCH);
  assert.equal(p3.refusals[0].method, "REPORTING_SURNAME_INITIAL");
  assert.equal(r.unattributedRefusals.player.length, 1);
  assert.equal(r.unattributedRefusals.player[0].providerName, "Zulu Nobody");
  assert.equal(r.unattributedRefusals.event.EVENT_UNMATCHED, 1);
  const top = r.topMissingPlayers.find((p) => p.athleteId === "103");
  assert.ok(top.withheld >= 4);
});

test("multiple books: per-book quotes, qualified predictions and the one chosen line", () => {
  const r = buildNbaLineCoverage({ lane: LANE, captures: captures(), asOf: AS_OF });
  const dk = r.byBook.find((b) => b.book === "draftkings"), fd = r.byBook.find((b) => b.book === "fanduel");
  assert.equal(dk.quotes, 2);
  assert.equal(dk.predictionsQualified.count, 1);
  assert.equal(fd.predictionsQualified.count, 1);
  assert.equal(fd.chosenForComparison, 1, "the most recent pre-tip capture is chosen");
  assert.equal(dk.chosenForComparison, 0);
  const g = r.byGame.find((x) => x.eventId === "9001");
  assert.equal(g.predictions, 21);
  assert.equal(g.booksQuoting, 3);
  assert.equal(r.byGame.find((x) => x.eventId === "9002").captured, false);
});

test("full coverage: every prediction compared; authorized display makes them eligible", () => {
  const records = [];
  for (const g of LANE.games) for (const side of ["away", "home"]) for (const p of g.players[side]) {
    for (const [f, m] of Object.entries({ pts: "player_points", reb: "player_rebounds", ast: "player_assists", threePm: "player_threes", pra: "player_points_rebounds_assists", ptsReb: "player_points_rebounds", ptsAst: "player_points_assists" })) {
      records.push(rec(g.providerEventId, p.providerAthleteId, f, m, "draftkings", 10.5, "2099-01-15T23:00:00Z"));
      records.push(rec(g.providerEventId, p.providerAthleteId, f, m, "fanduel", 11.5, "2099-01-15T23:05:00Z"));
    }
  }
  const doc = { capturedFor: "2099-01-15T23:05:00Z", markets: [], coverage: { events: { matchedEventIds: ["9001", "9002"] } }, records, refusals: [] };
  const r = buildNbaLineCoverage({ lane: LANE, captures: [{ file: "a.json", doc }], asOf: AS_OF, authorization: AUTHORIZED });
  assert.equal(r.overall.compared.count, 27);
  assert.equal(r.overall.compared.pct, 100);
  assert.equal(r.overall.withheldTotal.count, 0);
  assert.equal(r.overall.displayEligible.count, 27);
  assert.equal(r.byBook.find((b) => b.book === "fanduel").chosenForComparison, 27);
});

test("market mismatch and an empty capture (refused run, zero responses)", () => {
  const bad = rec("9001", "101", "pts", "player_rebounds", "draftkings", 20.5, "2099-01-15T23:00:00Z");
  const r = buildNbaLineCoverage({ lane: LANE, captures: [{ file: "m.json", doc: { capturedFor: "x1", markets: ["player_points"], coverage: { events: { matchedEventIds: ["9001"] } }, records: [bad], refusals: [] } }], asOf: AS_OF });
  const p = r.predictions.find((x) => x.athleteId === "101" && x.family === "pts");
  assert.deepEqual([p.status, p.detail], [STATUS.IDENTITY_OR_MARKET_MISMATCH, "MARKET_MISMATCH"]);
  const empty = buildNbaLineCoverage({ lane: LANE, captures: [{ file: "e.json", doc: { capturedFor: "x2", state: "STOPPED", records: [], refusals: [], coverage: { state: "NO_RESPONSES", events: { matchedEventIds: [] } } } }], asOf: AS_OF });
  assert.equal(empty.overall.predictions, 27);
  assert.equal(empty.overall.compared.count, 0);
  assert.equal(empty.overall.withheld.MISSING_QUOTE.count, 27);
  assert.equal(empty.byBook.length, 0);
  assert.match(coverageMarkdown(empty), /No book quoted/);
});

test("rendered comparisons are counted by data attribute", () => {
  const c = countRenderedComparisons([
    { page: `/nba/projections/${DATE}/`, html: '<span data-line-cmp="ABOVE"></span><span data-line-cmp="EQUAL"></span><span data-line-cmp="projection-only"></span><li data-prop-line="COMPARED"><span data-prop-line-side="OVER"></span></li><li data-prop-line="STALE"></li>' },
    { page: "/nba/simulation/9001/", html: '<span data-line-cmp="BELOW"></span>' },
    { page: "/nba/simulation/9002/", html: null },
  ]);
  assert.equal(c.projectionsPage, 3);
  assert.equal(c.gamePages, 1);
  assert.deepEqual(c.pagesMissing, ["/nba/simulation/9002/"]);
  assert.equal(c.perPage[0].projectionOnly, 1);
});

test("public summary and markdown carry no player, line, price or book", () => {
  const r = buildNbaLineCoverage({ lane: LANE, captures: captures(), asOf: AS_OF });
  const pub = JSON.stringify(publicCoverageSummary(r)) + coverageMarkdown(r, { publicOnly: true });
  for (const s of SECRETS) assert.ok(!pub.includes(s), `public output contains ${s}`);
  const md = coverageMarkdown(r);
  for (const s of SECRETS.filter((x) => !/^[a-z]+$/.test(x))) assert.ok(!md.includes(s), `private markdown contains ${s}`);
  // the private JSON names players but never a price or a line
  const priv = JSON.stringify(r);
  for (const s of ["-137", "142", "-151", "20.5", "11.5"]) assert.ok(!priv.includes(s), `private JSON contains ${s}`);
});

// ---- CLI (spawned through tsx: the module graph imports .ts, and CI runs Node 20) ----
const CLI = path.join(process.cwd(), "scripts/nba/nba-line-coverage.mjs");
const runCli = (args, env = {}) => spawnSync("npx", ["tsx", CLI, ...args], { encoding: "utf8", env: { ...process.env, GTP_PRIVATE_DATA_DIR: "", ...env } });

test("CLI: writes private JSON + markdown + public summary; stdout has no price, line, book or player", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nba-cov-"));
  const props = path.join(tmp, "odds", "nba", "props");
  fs.mkdirSync(props, { recursive: true });
  fs.writeFileSync(path.join(props, "2099-01-15T2215Z.json"), JSON.stringify(CAPTURE));
  const lanePath = path.join(tmp, "lane.json");
  fs.writeFileSync(lanePath, JSON.stringify(LANE));
  const site = path.join(tmp, "site-export");
  fs.mkdirSync(path.join(site, "nba", "projections", DATE), { recursive: true });
  fs.writeFileSync(path.join(site, "nba", "projections", DATE, "index.html"), '<span data-line-cmp="ABOVE"></span><span data-line-cmp="projection-only"></span>');
  const res = runCli(["--date", DATE, "--as-of", AS_OF, "--private-dir", tmp, "--lane", lanePath, "--export", site, "--public-summary"]);
  assert.equal(res.status, 0, res.stderr);
  for (const s of SECRETS) assert.ok(!res.stdout.includes(s), `stdout contains ${s}`);
  const out = JSON.parse(res.stdout);
  assert.equal(out.denominator.predictions, 27);
  assert.equal(out.overall.compared.count, 1);
  assert.deepEqual(out.renderedOnWebsite, { measured: true, projectionsPage: 1, gamePages: 0 });
  const dir = path.join(tmp, "odds", "nba", "coverage");
  for (const f of [`${DATE}.json`, `${DATE}.md`, `${DATE}.public-summary.json`, `${DATE}.public-summary.md`]) assert.ok(fs.existsSync(path.join(dir, f)), f);
  const pubFile = fs.readFileSync(path.join(dir, `${DATE}.public-summary.json`), "utf8") + fs.readFileSync(path.join(dir, `${DATE}.public-summary.md`), "utf8");
  for (const s of SECRETS) assert.ok(!pubFile.includes(s), `public summary file contains ${s}`);
  const noExport = runCli(["--date", DATE, "--as-of", AS_OF, "--private-dir", tmp, "--lane", lanePath]);
  assert.equal(noExport.status, 0, noExport.stderr);
  assert.deepEqual(JSON.parse(noExport.stdout).renderedOnWebsite, { measured: false });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("CLI: refuses an in-repository --out and writes nothing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nba-cov-"));
  const lanePath = path.join(tmp, "lane.json");
  fs.writeFileSync(lanePath, JSON.stringify(LANE));
  const inRepo = path.join(process.cwd(), "tmp-coverage");
  const res = runCli(["--date", DATE, "--as-of", AS_OF, "--private-dir", tmp, "--lane", lanePath, "--out", inRepo]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /inside the repository/);
  assert.ok(!fs.existsSync(inRepo));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("CLI makes no network call and names no provider endpoint", () => {
  for (const f of [CLI, path.join(process.cwd(), "src/lib/sports/nba/line-coverage.mjs")]) {
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), /fetch\(|https?:\/\/|ODDS_API_KEY/);
  }
});
