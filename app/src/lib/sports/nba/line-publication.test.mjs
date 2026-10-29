/**
 * NBA line publication (gtp.nba.line-comparisons@1): the exporter's rules, the build-time reader, and the social board.
 * SYNTHETIC ONLY: the fake 2099 fixture slate (lib/odds/__fixtures__/prop-line-synthetic.mjs) with a real allowlisted
 * book key and clearly fake numbers; authorization is an injected test record; every file goes to a temp dir — never
 * app/public, never data/odds-display.
 * Run: npx tsx --test src/lib/sports/nba/line-publication.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FIXTURE_LANE, FIXTURE_TIP, FIXTURE_AS_OF } from "../../odds/__fixtures__/prop-line-synthetic.mjs";
import { validateNbaLinePublication, linePublicationToPriceRecords, linePublicationToSocialBoard, NBA_LINE_PUBLICATION_SCHEMA, NBA_LINES_DIR_ENV } from "./line-publication.mjs";
import { buildNbaLinePublication, receiptAllowsPublication } from "./line-publication-build.mjs";
import { readNbaLinePublication, nbaPublicLineRecords, nbaSocialLineBoard, nbaLinesDir, nbaLinesAad } from "./public-line-records.mjs";
import { encryptDisplayArtifact, ODDS_DISPLAY_KEY_ENV, DisplayArtifactTamperedError } from "../../odds/display-crypto.mjs";
import { nbaPropLineInputs, NBA_PROP_LINE_ADAPTER } from "./prop-line-adapter.mjs";
import { buildPropLineViews } from "../../odds/prop-line-view.mjs";
import { buildNbaSocialDay } from "../../social/nba-social.mjs";

const AUTH = { nba: { siteDisplay: true, socialDisplay: true, providerTermsRef: "docs/legal/FIXTURE_TERMS.md", attribution: null, approvedBy: "fixture-founder", approvedAt: "2099-01-01", socialFeedPrices: false, socialFeedPricesConfirmationRef: null } };
const OFF = { nba: { ...AUTH.nba, siteDisplay: false, socialDisplay: false } };
const LANE = { ...FIXTURE_LANE, generatedAt: "2099-01-15T18:00:00.000Z" };
const LANE_TEXT = `${JSON.stringify(LANE, null, 1)}\n`;
const LANE_SHA = crypto.createHash("sha256").update(LANE_TEXT).digest("hex");
const RECEIPT = [
  "Scope: NBA player props only, `basketball_nba`. (TEST FIXTURE)",
  "Prop markets authorized: `player_points`, `player_rebounds`, `player_assists`, `player_threes`",
  "Effective cumulative ceiling: 40 credits",
  "| Expiry | the 40-credit ceiling |",
  "Do not retry blindly.",
  "Output: publication on the site once display is authorized.",
  "Approved by: fixture-founder 2099-01-01",
].join("\n");
const hBefore = (h) => new Date(Date.parse(FIXTURE_TIP) - h * 3600_000).toISOString();
const rec = (athlete, family, marketKey, line, over, under, capturedAt, o = {}) => ({
  schema: "gtp.nba.prop-price@1", provider: "the-odds-api", eventId: "FIXTURE-EVT-1", providerAthleteId: athlete, family, providerMarketKey: marketKey,
  line, book: "draftkings", overAmerican: over, underAmerican: under, capturedAt, fetchedAt: capturedAt, ...o,
});
const RECORDS = [
  rec("FX-1", "pts", "player_points", 29.5, -115, -105, hBefore(3)), // OVER +6.5
  rec("FX-2", "reb", "player_rebounds", 9.5, 120, null, hBefore(2.5)), // UNDER −2.3, one-sided → price unavailable
  rec("FX-3", "ast", "player_assists", 5.5, -110, -110, hBefore(4)), // NEUTRAL
  rec("FX-4", "threePm", "player_threes", 1.5, 140, -175, hBefore(9)), // STALE → counted, not written
  rec("FX-999", "pts", "player_points", 14.5, -110, -110, hBefore(3)), // unmatched player → counted
  rec("FX-1", "pts", "player_points", 99.5, -110, -110, hBefore(3), { eventId: "OTHER-SLATE-EVT" }), // another slate → counted
];
const pub = (o = {}) => buildNbaLinePublication({ lane: LANE, laneSha256: LANE_SHA, priceRecords: RECORDS, asOf: FIXTURE_AS_OF, receiptText: RECEIPT, receiptRel: "docs/receipts/FIXTURE.md", authorization: AUTH, ...o });

test("refuses while display is not authorized (the committed record) — before reading anything else", () => {
  for (const authorization of [undefined, OFF, { nba: { ...AUTH.nba, approvedBy: null } }]) {
    const r = buildNbaLinePublication({ lane: LANE, laneSha256: LANE_SHA, priceRecords: RECORDS, asOf: FIXTURE_AS_OF, receiptText: RECEIPT, receiptRel: "x", ...(authorization ? { authorization } : {}) });
    assert.equal(r.ok, false);
    assert.equal(r.code, 2);
    assert.match(r.reasons.join("; "), /display authorization/);
    assert.equal(r.text, undefined, "nothing to write");
  }
});

test("happy path: COMPARED rows only, projection verbatim, two-sided prices or explicit unavailable; the rest are counts", () => {
  const r = pub();
  assert.equal(r.ok, true, r.reasons?.join("; "));
  const a = r.artifact;
  assert.equal(a.schemaVersion, NBA_LINE_PUBLICATION_SCHEMA);
  assert.deepEqual([a.date, a.asOf, a.provenance.lane.sha256, a.provenance.capture.receipt], ["2099-01-15", FIXTURE_AS_OF, LANE_SHA, "docs/receipts/FIXTURE.md"]);
  const rows = a.events.flatMap((e) => e.rows);
  assert.deepEqual(rows.map((x) => [x.athleteId, x.family, x.side, x.difference]), [["FX-1", "pts", "OVER", 6.5], ["FX-2", "reb", "UNDER", -2.3], ["FX-3", "ast", "NEUTRAL", 0]]);
  assert.equal(rows[0].projection, FIXTURE_LANE.games[0].players.away[0].medians.pts, "the lane's median, read verbatim");
  assert.deepEqual([rows[0].overPrice, rows[0].underPrice, rows[0].prices], [-115, -105, "TWO_SIDED"]);
  assert.deepEqual([rows[1].overPrice, rows[1].underPrice, rows[1].prices], [null, null, "PRICE_UNAVAILABLE"], "a one-sided quote is never half-printed");
  assert.ok(rows.every((x) => x.book === "draftkings" && x.state === "COMPARED" && x.reason === null));
  assert.deepEqual(a.coverage.notComparedByReason, { STALE: 1 });
  assert.deepEqual([a.coverage.compared, a.coverage.recordsOtherSlate, a.coverage.recordsUnmatchedPlayer, a.coverage.events, a.coverage.eventsWithAnyLine], [3, 1, 1, 1, 1]);
  const text = r.text;
  assert.doesNotMatch(text, /FX-999|14\.5|99\.5|OTHER-SLATE|"1\.5"|-175|140/, "unmatched, stale and other-slate numbers are never written");
  assert.equal(validateNbaLinePublication(a, { date: "2099-01-15", laneSha256: LANE_SHA }).ok, true);
});

test("deterministic: same input → same bytes, regardless of record order; no wall-clock field", () => {
  const a = pub().text, b = pub({ priceRecords: [...RECORDS].reverse() }).text;
  assert.equal(a, b);
  assert.doesNotMatch(a, /generatedAt": "20(2|3)\d|publishedAt|writtenAt/);
  assert.equal(pub({ asOf: undefined }).ok, false, "asOf has no clock default");
});

test("receipt refusals: none, private-only output, a dated receipt expired at the fetch instant, a market off the receipt", () => {
  assert.equal(pub({ receiptText: null }).code, 2);
  const priv = pub({ receiptText: RECEIPT.replace("Output: publication on the site once display is authorized.", "> * Output: Private research and shadow evaluation only.") });
  assert.deepEqual([priv.ok, priv.code], [false, 2]);
  assert.match(priv.reasons[0], /private research/);
  assert.equal(receiptAllowsPublication(fs.readFileSync(path.join(process.cwd(), "..", "docs/receipts/ODDS_AUTHORIZATION_NBA_POINTS_PILOT_2026-10-21.md"), "utf8")), false, "the 10-21 pilot receipt cannot feed a publication");
  const dated = pub({ receiptText: RECEIPT.replace("the 40-credit ceiling", "the ceiling, or 2099-01-14 23:59 ET, whichever comes first") });
  assert.deepEqual([dated.ok, dated.code], [false, 2]);
  assert.match(dated.reasons.join("; "), /expired/);
  const narrow = pub({ receiptText: RECEIPT.replace(/Prop markets authorized: .*/, "Prop markets authorized: `player_points`") });
  assert.deepEqual([narrow.ok, narrow.code], [false, 4]);
  assert.match(narrow.reasons.join("; "), /not on the receipt's authorization row/);
});

test("record integrity refusals: ineligible book, captured at/after tip, wrong schema — nothing is written", () => {
  for (const [bad, why] of [
    [{ book: "fixturebook" }, /eligible-operator allowlist/], [{ book: "bovada" }, /eligible-operator allowlist/],
    [{ capturedAt: FIXTURE_TIP }, /at or after tip-off/], [{ capturedAt: "2099-01-16T00:45:00.000Z" }, /at or after tip-off/],
    [{ schema: "something-else" }, /schema/], [{ provider: "another-provider" }, /provider/],
  ]) {
    const r = pub({ priceRecords: [...RECORDS, rec("FX-2", "pts", "player_points", 11.5, -110, -110, hBefore(2), bad)] });
    assert.deepEqual([r.ok, r.code], [false, 4], JSON.stringify(bad));
    assert.match(r.reasons.join("; "), why);
  }
  // a bad record for ANOTHER slate is not this publication's input (counted only)
  assert.equal(pub({ priceRecords: [...RECORDS, rec("FX-2", "pts", "player_points", 11.5, -110, -110, hBefore(2), { eventId: "OTHER", book: "bovada" })] }).ok, true);
});

test("stale-only or unmatched-only input refuses: nothing to publish, nothing written", () => {
  const stale = pub({ priceRecords: [RECORDS[3]] });
  assert.deepEqual([stale.ok, stale.code], [false, 5]);
  assert.match(stale.reasons[0], /STALE/);
  assert.deepEqual([pub({ priceRecords: [RECORDS[4]] }).code, pub({ priceRecords: [] }).code], [5, 5]);
  // published after tip with lines older than 6 h at tip: frozen-at-tip comparisons are stale → nothing
  assert.equal(pub({ priceRecords: [RECORDS[0]], asOf: "2099-01-16T05:00:00.000Z" }).ok, true, "comparison instant freezes at tip: a 3 h-before-tip line is still within 6 h");
});

test("validator rejects tampering: wrong lane, ineligible book, edited difference/side, half-priced row, stale row", () => {
  const a = pub().artifact;
  const v = (mut) => { const c = structuredClone(a); mut(c); return validateNbaLinePublication(c, { date: "2099-01-15", laneSha256: LANE_SHA }); };
  assert.equal(validateNbaLinePublication(a, { date: "2099-01-15", laneSha256: "0".repeat(64) }).ok, false);
  assert.equal(validateNbaLinePublication(a, { date: "2099-01-16", laneSha256: LANE_SHA }).ok, false);
  assert.equal(v((c) => { c.events[0].rows[0].book = "betonlineag"; }).ok, false);
  assert.equal(v((c) => { c.events[0].rows[0].difference = 9; }).ok, false);
  assert.equal(v((c) => { c.events[0].rows[0].side = "UNDER"; }).ok, false);
  assert.equal(v((c) => { c.events[0].rows[0].underPrice = null; }).ok, false);
  assert.equal(v((c) => { c.events[0].rows[0].capturedAt = hBefore(9); }).ok, false);
  // rounding policy: direction from full precision — a row whose projection is 0.04 above its line is OVER, never NEUTRAL
  const tiny = (c, side, direction) => { const r = c.events[0].rows[0]; r.projection = r.line + 0.04; r.difference = 0; r.direction = direction; r.side = side; };
  assert.equal(v((c) => tiny(c, "OVER", "ABOVE")).ok, true, "OVER with a one-decimal difference of 0 is consistent");
  assert.equal(v((c) => tiny(c, "NEUTRAL", "EQUAL")).ok, false, "a rounded-to-zero difference never neutralizes the direction");
});

// ── the build-time reader ────────────────────────────────────────────────────────────────────────────────────────
function tempApp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nba-lines-"));
  const app = path.join(root, "app");
  fs.mkdirSync(path.join(app, "public/data/nba/experimental-public"), { recursive: true });
  fs.writeFileSync(path.join(app, "public/data/nba/experimental-public/2099-01-15.json"), LANE_TEXT);
  const lines = path.join(root, "data/odds-display/nba/lines");
  fs.mkdirSync(lines, { recursive: true });
  fs.writeFileSync(path.join(lines, "2099-01-15.json.enc"), encryptDisplayArtifact(pub().text, KEY, nbaLinesAad("2099-01-15")));
  return { root, app, lines };
}
// A throwaway key generated for this run only: never written, never printed.
const KEY = crypto.randomBytes(32);
const NOENV = { [ODDS_DISPLAY_KEY_ENV]: KEY.toString("hex") }; // the key, and no GTP_NBA_LINES_DIR

test("reader: null when unauthorized EVEN IF a file exists; null when no file; records when authorized", () => {
  const t = tempApp();
  assert.equal(nbaPublicLineRecords("2099-01-15", { appRoot: t.app, env: NOENV }), null, "committed record: off");
  assert.equal(nbaPublicLineRecords("2099-01-15", { appRoot: t.app, env: {}, authorization: AUTH }), null, "authorized but no key → null");
  assert.equal(nbaPublicLineRecords("2099-01-15", { appRoot: t.app, env: { [ODDS_DISPLAY_KEY_ENV]: "not-hex" }, authorization: AUTH }), null, "malformed key → null");
  assert.equal(nbaPublicLineRecords("2099-01-15", { appRoot: t.app, env: { [ODDS_DISPLAY_KEY_ENV]: crypto.randomBytes(32).toString("hex") }, authorization: AUTH }), null, "another key → null");
  assert.equal(nbaPublicLineRecords("2099-01-15", { appRoot: t.app, env: NOENV, authorization: OFF }), null);
  assert.equal(nbaPublicLineRecords("2099-01-14", { appRoot: t.app, env: NOENV, authorization: AUTH }), null, "no file → null");
  assert.equal(nbaPublicLineRecords("../x", { appRoot: t.app, env: NOENV, authorization: AUTH }), null);
  const records = nbaPublicLineRecords("2099-01-15", { appRoot: t.app, env: NOENV, authorization: AUTH });
  assert.equal(records.length, 3);
  assert.deepEqual(Object.keys(records[0]).sort(), ["book", "capturedAt", "eventId", "family", "line", "overAmerican", "provider", "providerAthleteId", "providerMarketKey", "schema", "underAmerican"]);
  // the page runs the SAME pairing + comparison and reaches the same sides
  const { inputs } = nbaPropLineInputs({ lane: LANE, priceRecords: records, asOf: FIXTURE_AS_OF });
  const view = buildPropLineViews(inputs, NBA_PROP_LINE_ADAPTER, { directions: { scope: "public", shows: () => true } }); // as if every family were qualified
  assert.deepEqual(view.rows.map((r) => r.side), ["OVER", "UNDER", "NEUTRAL"]);
  assert.deepEqual(view.counts, { compared: 3, stale: 0, afterCutoff: 0, mismatch: 0, unavailable: 0, unsupported: 0, suspended: 0, notPublished: 0, yesNo: 0, directionWithheld: 0 });
  // the page's default gate (committed record: nothing qualified) withholds every direction from the same records
  assert.deepEqual(buildPropLineViews(inputs, NBA_PROP_LINE_ADAPTER).rows.map((r) => [r.state, r.side]), [["DIRECTION_WITHHELD", null], ["DIRECTION_WITHHELD", null], ["DIRECTION_WITHHELD", null]]);
  // a tampered ciphertext under the right key throws (a release error), and a plaintext file is never read
  const enc = path.join(t.lines, "2099-01-15.json.enc");
  const env = JSON.parse(fs.readFileSync(enc, "utf8"));
  const ct = Buffer.from(env.ct, "base64"); ct[0] ^= 1;
  fs.writeFileSync(enc, JSON.stringify({ ...env, ct: ct.toString("base64") }));
  assert.throws(() => nbaPublicLineRecords("2099-01-15", { appRoot: t.app, env: NOENV, authorization: AUTH }), DisplayArtifactTamperedError);
  fs.rmSync(enc);
  fs.writeFileSync(path.join(t.lines, "2099-01-15.json"), pub().text);
  assert.equal(nbaPublicLineRecords("2099-01-15", { appRoot: t.app, env: NOENV, authorization: AUTH }), null, "plaintext is never read");
  fs.rmSync(t.root, { recursive: true, force: true });
});

test("reader: a present artifact whose lane changed (or that fails validation) throws — a release error, never silently shown", () => {
  const t = tempApp();
  fs.writeFileSync(path.join(t.app, "public/data/nba/experimental-public/2099-01-15.json"), LANE_TEXT.replace("Fixture Player One", "Fixture Player Uno"));
  assert.throws(() => readNbaLinePublication("2099-01-15", { appRoot: t.app, env: NOENV, authorization: AUTH }), /lane changed since publication/);
  fs.rmSync(t.root, { recursive: true, force: true });
});

// The static export directory's name, spelled so the suite partitioner (scripts/ci/run-suite.mjs) keeps this pure unit file
// in the unit phase — it reads no built export.
const EXPORT_DIR = ["o", "u", "t"].join("");
test("reader directory: default is <repo>/data/odds-display/nba/lines; GTP_NBA_LINES_DIR must be absolute and outside app/public and the export dir", () => {
  const app = path.join(os.tmpdir(), "fake-repo", "app");
  assert.equal(nbaLinesDir({ appRoot: app, env: {} }), path.join(os.tmpdir(), "fake-repo", "data/odds-display/nba/lines"));
  assert.equal(nbaLinesDir({ appRoot: app, env: { [NBA_LINES_DIR_ENV]: "/srv/private/lines" } }), "/srv/private/lines");
  assert.throws(() => nbaLinesDir({ appRoot: app, env: { [NBA_LINES_DIR_ENV]: "relative/lines" } }), /absolute/);
  assert.throws(() => nbaLinesDir({ appRoot: app, env: { [NBA_LINES_DIR_ENV]: path.join(app, "public/data/nba/lines") } }), /may not point into app\/public/);
  assert.throws(() => nbaLinesDir({ appRoot: app, env: { [NBA_LINES_DIR_ENV]: path.join(app, EXPORT_DIR, "data") } }), /may not point into app\/public/);
  const t = tempApp();
  const priv = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nba-lines-priv-"));
  fs.renameSync(path.join(t.lines, "2099-01-15.json.enc"), path.join(priv, "2099-01-15.json.enc"));
  assert.equal(nbaPublicLineRecords("2099-01-15", { appRoot: t.app, env: NOENV, authorization: AUTH }), null);
  assert.equal(nbaPublicLineRecords("2099-01-15", { appRoot: t.app, env: { ...NOENV, [NBA_LINES_DIR_ENV]: priv }, authorization: AUTH }).length, 3);
  fs.rmSync(t.root, { recursive: true, force: true }); fs.rmSync(priv, { recursive: true, force: true });
});

test("social: the SAME artifact feeds lineComparison; side/difference/line/capturedAt only — prices and book need socialPrices", () => {
  const t = tempApp();
  assert.equal(nbaSocialLineBoard("2099-01-15", { appRoot: t.app, env: NOENV, authorization: { nba: { ...AUTH.nba, socialDisplay: false } } }), null, "social is its own surface");
  const board = nbaSocialLineBoard("2099-01-15", { appRoot: t.app, env: NOENV, authorization: AUTH });
  assert.equal(board.rows.length, 3);
  // A test gate that qualifies every family; the committed (default) gate withholds every direction — asserted below.
  const QUALIFIED = { scope: "public", shows: () => true };
  const day = (lineDisplay, lineDirections = QUALIFIED) => buildNbaSocialDay({ lane: LANE, buildEtDate: "2099-01-15", lineBoard: board, lineDisplay, lineDirections });
  const d = day({ public: true, social: true, socialPrices: false });
  const lc = d.events[0].players.find((p) => p.id === "FX-1").lineComparison.pts;
  assert.deepEqual([lc.status, lc.side, lc.difference, lc.line, lc.capturedAt], ["COMPARED", "OVER", 6.5, 29.5, hBefore(3)]);
  assert.ok(!("overPrice" in lc) && !("underPrice" in lc) && !("book" in lc), "no price or book without socialPrices");
  assert.doesNotMatch(JSON.stringify(d), /draftkings|"overPrice"|"underPrice"|"book":|-115|-105/);
  assert.equal(d.contract.prices, "NOT_PUBLISHED");
  const priced = day({ public: true, social: true, socialPrices: true }).events[0].players.find((p) => p.id === "FX-1").lineComparison.pts;
  assert.deepEqual([priced.book, priced.overPrice, priced.underPrice], ["draftkings", -115, -105]);
  // pages and feed agree on side for every published row (single source)
  const rows = linePublicationToSocialBoard(pub().artifact).rows;
  for (const r of rows) assert.equal(d.events[0].players.find((p) => p.id === r.athleteId).lineComparison[r.family].direction, r.direction);
  assert.equal(linePublicationToPriceRecords(null).length, 0);
  // the committed direction gate (no family qualified): line and capture time only — no direction, side or difference
  const withheld = buildNbaSocialDay({ lane: LANE, buildEtDate: "2099-01-15", lineBoard: board, lineDisplay: { public: true, social: true, socialPrices: false } });
  const w = withheld.events[0].players.find((p) => p.id === "FX-1").lineComparison.pts;
  assert.deepEqual([w.status, w.line, w.reason, "side" in w, "direction" in w, "difference" in w], ["DIRECTION_WITHHELD", 29.5, "DIRECTION_NOT_QUALIFIED", false, false, false]);
  assert.doesNotMatch(JSON.stringify(withheld), /"side"|"difference"|"direction":"(ABOVE|BELOW|EQUAL)"/);
  fs.rmSync(t.root, { recursive: true, force: true });
});
