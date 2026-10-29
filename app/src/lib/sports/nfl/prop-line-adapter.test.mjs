/* NFL prop-line adapter through the sport-agnostic view, SYNTHETIC fixtures only (no real price, game or player).
   Run: npx tsx --test src/lib/sports/nfl/prop-line-adapter.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPropLineView as buildPropLineViewGated, buildPropLineViews, PROP_LINE_STATE, PRIVATE_DIRECTIONS } from "../../odds/prop-line-view.mjs";
import { encryptDisplayArtifact, ODDS_DISPLAY_KEY_ENV } from "../../odds/display-crypto.mjs";
import {
  NFL_PROP_LINE_ADAPTER, NFL_LINE_MAX_AGE_HOURS, NFL_FAMILIES, nflPropLineInputs, nflChooseOffer, nflCompareToLine, nflOffersFromCapture,
} from "./prop-line-adapter.mjs";
import { chooseOffer } from "../nba/line-comparison.mjs";
import { NFL_LINE_DISPLAY, nflLineDisplayFrom } from "./line-display.mjs";
import { DISPLAY_AUTHORIZATION, NOT_AUTHORIZED_REASON, publicDirectionGate } from "../../odds/display-authorization.mjs";
import { nflPublicLineRecords, validateNflLineArtifact, NFL_LINES_SCHEMA, nflLinesAad } from "./public-line-records.mjs";
import { FX_BOARD, FX_OFFERS, FX_AS_OF, FX_EVENT, FX_KICKOFF } from "./__fixtures__/nfl-prop-line-synthetic.mjs";

const built = nflPropLineInputs({ board: FX_BOARD, offers: FX_OFFERS, asOf: FX_AS_OF });
// The comparison rule itself is exercised with every direction computed (the private gate); the public gate is tested below.
const buildPropLineView = (i, a) => buildPropLineViewGated(i, a, { directions: PRIVATE_DIRECTIONS });
const view = buildPropLineViews(built.inputs, NFL_PROP_LINE_ADAPTER, { projections: built.projections, directions: PRIVATE_DIRECTIONS });
const row = (pid, fam) => view.rows.find((r) => r.key === `${FX_EVENT}|nfl-athlete-${pid}|${fam}`);

test("OVER / UNDER / NEUTRAL from the official board median (read verbatim), one decimal display, full-precision direction", () => {
  const o = row(1, "receptions"), u = row(1, "reception_yds"), n = row(2, "receptions");
  assert.deepEqual([o.state, o.side, o.projection.text, o.line.text, o.difference.text, o.book.label], ["COMPARED", "OVER", "5.6", "4.5", "+1.1", "DraftKings"]);
  assert.deepEqual([u.state, u.side, u.projection.text, u.line.text, u.difference.text, u.book.key], ["COMPARED", "UNDER", "61.2", "64.5", "−3.3", "fanduel"]);
  assert.deepEqual([n.state, n.side, n.difference.text], ["COMPARED", "NEUTRAL", "0.0"]);
  assert.equal(o.projection.value, 5.6, "the board's number, never recomputed");
  assert.deepEqual([o.overPrice.text, o.underPrice.text], ["−115", "−105"]);
});

test("withheld families (passing / rushing yards: ESTIMATE) → 'Official projection not published', never a direction, never the figure", () => {
  for (const [pid, fam] of [[3, "pass_yds"], [3, "rush_yds"], [4, "rush_yds"]]) {
    const r = row(pid, fam);
    assert.equal(r.state, PROP_LINE_STATE.NOT_PUBLISHED, `${pid} ${fam}`);
    assert.deepEqual([r.side, r.difference, r.line, r.book, r.projection.value, r.projection.text], [null, null, null, null, null, "—"]);
    assert.equal(r.statusText, "Official projection not published");
    assert.doesNotMatch(r.spoken, /250\.3|12\.1|70\.2|OVER|UNDER/);
  }
  // even a direct call with the unofficial median smuggled in refuses on the family state first
  assert.equal(nflCompareToLine({ ...built.inputs.find((i) => i.marketKey === "pass_yds"), projection: 250.3 }).reason, "NOT_PUBLISHED");
  // a team the board withholds for a published family is NOT_PUBLISHED too
  const b = { ...FX_BOARD, families: { ...FX_BOARD.families, player_receptions: { state: "PUBLISHED", withheldTeams: [{ team: "AAA", reason: "x" }] } } };
  const i = nflPropLineInputs({ board: b, offers: FX_OFFERS, asOf: FX_AS_OF }).inputs.find((x) => x.key.endsWith("athlete-1|receptions"));
  assert.equal(buildPropLineView(i, NFL_PROP_LINE_ADAPTER).state, "NOT_PUBLISHED");
});

test("anytime touchdown is a yes/no market: Yes price carried, never OVER/UNDER, no line, no difference, no implied-probability comparison", () => {
  const r = row(1, "anytime_td");
  assert.equal(r.state, PROP_LINE_STATE.YES_NO);
  assert.deepEqual([r.side, r.glyph, r.line, r.difference, r.overPrice, r.underPrice], [null, null, null, null, null, null]);
  assert.deepEqual([r.yesPrice.text, r.book.label, r.projection.text], ["+150", "DraftKings", "41.2%"]);
  assert.equal(r.statusText, "Not an over/under market");
  assert.doesNotMatch(JSON.stringify(r), /"OVER"|"UNDER"|implied/i);
  assert.equal(row(3, "anytime_td").state, "YES_NO");
  assert.equal(NFL_FAMILIES.anytime_td.kind, "YES_NO");
});

test("stale (> 12 h before the comparison instant) and captured-after-kickoff are never compared; the quote is shown muted", () => {
  assert.equal(NFL_LINE_MAX_AGE_HOURS, 12);
  const s = row(2, "reception_yds");
  assert.deepEqual([s.state, s.reason, s.side, s.line.text], ["STALE", "STALE", null, "29.5"]);
  assert.match(s.reasonText, /more than 12 hours old/);
  const a = row(4, "receptions");
  assert.deepEqual([a.state, a.reason, a.side], ["AFTER_CUTOFF", "CAPTURED_AFTER_KICKOFF", null]);
  // a started game keeps the pregame comparison as of kickoff (asOf after kickoff → instant = kickoff)
  const late = nflPropLineInputs({ board: FX_BOARD, offers: FX_OFFERS, asOf: "2099-01-11T05:00:00Z" });
  assert.equal(buildPropLineView(late.inputs.find((x) => x.key.endsWith("athlete-1|receptions")), NFL_PROP_LINE_ADAPTER).side, "OVER");
});

test("identity is exact: a mismatched event or player id is MISMATCH; a player not on the board and another event's rows never become rows", () => {
  const base = built.inputs.find((x) => x.key.endsWith("athlete-1|receptions"));
  assert.equal(nflCompareToLine({ ...base, offer: { ...base.offer, playerId: "nfl-athlete-2" } }).reason, "UNMATCHED");
  assert.equal(nflCompareToLine({ ...base, offer: { ...base.offer, canonicalEventId: "nfl-1" } }).reason, "UNMATCHED");
  assert.equal(buildPropLineView({ ...base, offer: { ...base.offer, playerId: "nfl-athlete-2" } }, NFL_PROP_LINE_ADAPTER).state, "MISMATCH");
  assert.equal(nflCompareToLine({ ...base, offer: { ...base.offer, market: "player_reception_yds" } }).reason, "MARKET_MISMATCH");
  assert.ok(!view.rows.some((r) => /athlete-9/.test(r.key)));
  assert.equal(new Set(built.inputs.map((i) => i.eventId)).size, 1);
});

test("eligible operators only: an ineligible book is never chosen (even when later) and alone is 'not eligible'", () => {
  assert.equal(row(1, "reception_yds").book.key, "fanduel", "bovada was later but is off the allowlist");
  const r = row(4, "reception_yds");
  assert.deepEqual([r.state, r.reason, r.side], ["SUSPENDED", "INELIGIBLE", null]);
});

test("reference-book selection is NBA's chooseOffer: latest pre-kickoff, ties by the reference-book order, never averaged; alternate lines are ambiguous", () => {
  const off = (book, line, h) => ({ canonicalEventId: `nfl-${FX_EVENT}`, playerId: "nfl-athlete-1", market: "player_receptions", book, line, capturedAt: new Date(Date.parse(FX_KICKOFF) - h * 3600_000).toISOString() });
  assert.equal(nflChooseOffer([off("fanduel", 4.5, 5), off("draftkings", 5.5, 2)], FX_KICKOFF).book, "draftkings", "latest");
  assert.equal(nflChooseOffer([off("fanduel", 4.5, 2), off("draftkings", 5.5, 2)], FX_KICKOFF).book, "draftkings", "tie → book name");
  assert.equal(nflChooseOffer([off("fanduel", 4.5, 2), off("draftkings", 5.5, 2)], FX_KICKOFF).line, 5.5, "a book's own line, never 5.0");
  // same rule as NBA on the same offers
  const xs = [off("fanduel", 4.5, 2), off("betmgm", 5.5, 2), off("draftkings", 3.5, 4)];
  assert.equal(nflChooseOffer(xs, FX_KICKOFF).book, chooseOffer(xs, FX_KICKOFF).book);
  // alternate lines: one book, one capture, two points → that capture's book is skipped; alone → AMBIGUOUS_LINE
  assert.equal(nflChooseOffer([off("draftkings", 4.5, 2), off("draftkings", 5.5, 2), off("fanduel", 4.5, 3)], FX_KICKOFF).book, "fanduel");
  const amb = nflChooseOffer([off("draftkings", 4.5, 2), off("draftkings", 5.5, 2)], FX_KICKOFF);
  assert.equal(amb.ambiguous, true);
  assert.equal(nflCompareToLine({ ...built.inputs.find((x) => x.key.endsWith("athlete-1|receptions")), offer: amb }).reason, "AMBIGUOUS_LINE");
  // only post-kickoff quotes → the latest of them travels so the row says "captured after cutoff"
  assert.equal(nflChooseOffer([off("draftkings", 4.5, -1)], FX_KICKOFF).line, 4.5);
});

test("true denominator: every PUBLISHED over/under projection on the board, with or without a line; anytime TD counted apart", () => {
  // published O/U pairs: athlete-1 rec+yds, athlete-2 rec+yds, athlete-4 rec+yds = 6; ATD published: athlete-1, athlete-3 = 2
  assert.deepEqual([built.projections, built.yesNoProjections], [6, 2]);
  assert.deepEqual(view.coverage, { qualified: 3, projections: 6, text: "3 of 6 projections have a qualified sportsbook line" });
  assert.deepEqual(view.counts, { compared: 3, stale: 1, afterCutoff: 1, mismatch: 0, unavailable: 0, unsupported: 0, suspended: 1, notPublished: 3, yesNo: 2, directionWithheld: 0 });
  assert.deepEqual(view.sides, { OVER: 1, UNDER: 1, NEUTRAL: 1 });
  const pageOnly = nflPropLineInputs({ board: FX_BOARD, offers: FX_OFFERS, asOf: FX_AS_OF, families: ["receptions", "reception_yds", "anytime_td"] });
  assert.ok(pageOnly.inputs.every((i) => i.familyState === "PUBLISHED"));
});

test("capture rows flatten field by field (the capture's own joined ids; book keys; anytime TD as one price)", () => {
  const cap = { propProbe: { lineProps: { rows: [{ canonicalEventId: "nfl-1", playerId: "nfl-athlete-1", market: "player_receptions", bookmaker: "draftkings", line: 4.5, overPrice: -110, underPrice: -110, capturedAt: "2099-01-01T00:00:00Z", sourceAsOf: "x", name: "n" }] }, anytimeTd: { rows: [{ canonicalEventId: "nfl-1", playerId: "nfl-athlete-1", bookmaker: "fanduel", price: 200, capturedAt: "2099-01-01T00:00:00Z", name: "n" }] } } };
  assert.deepEqual(nflOffersFromCapture(cap), [
    { canonicalEventId: "nfl-1", playerId: "nfl-athlete-1", market: "player_receptions", book: "draftkings", line: 4.5, overPrice: -110, underPrice: -110, capturedAt: "2099-01-01T00:00:00Z" },
    { canonicalEventId: "nfl-1", playerId: "nfl-athlete-1", market: "player_anytime_td", book: "fanduel", price: 200, capturedAt: "2099-01-01T00:00:00Z" },
  ]);
});

const FULL = { siteDisplay: true, socialDisplay: true, providerTermsRef: "docs/legal/FIXTURE_TERMS.md", attribution: null, approvedBy: "fixture-founder", approvedAt: "2099-01-01", socialFeedPrices: false, socialFeedPricesConfirmationRef: null };

test("NFL display authorization: all OFF in this commit, same fields as NBA; NFL_LINE_DISPLAY is derived from the record", () => {
  assert.deepEqual(Object.keys(DISPLAY_AUTHORIZATION.nfl).sort(), Object.keys(DISPLAY_AUTHORIZATION.nba).sort());
  const { directionQualified, ...switches } = DISPLAY_AUTHORIZATION.nfl;
  assert.ok(Object.values(switches).every((v) => v === false || v === null));
  assert.ok(Object.values(directionQualified).every((q) => q.qualified === false), "no NFL family is direction-qualified");
  assert.deepEqual({ ...NFL_LINE_DISPLAY }, { public: false, social: false, socialPrices: false, reason: NOT_AUTHORIZED_REASON.nfl });
  assert.deepEqual({ ...nflLineDisplayFrom({ nfl: FULL }) }, { public: true, social: true, socialPrices: false, reason: null });
  assert.equal(nflLineDisplayFrom({ nba: FULL }).public, false, "an NBA approval never carries over to NFL");
  const src = fs.readFileSync(new URL("./line-display.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /public:\s*(true|false)|social:\s*(true|false)/, "no literal switch");
});

test("build-time reader: null while unauthorized (reads nothing); authorized → validated rows from a private dir; invalid → throws", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nfl-lines-"));
  const key = crypto.randomBytes(32); // throwaway test key, generated here, never written
  const env = { GTP_NFL_LINES_DIR: dir, [ODDS_DISPLAY_KEY_ENV]: key.toString("hex") };
  const seal = (a) => fs.writeFileSync(path.join(dir, `${FX_EVENT}.json.enc`), encryptDisplayArtifact(JSON.stringify(a), key, nflLinesAad(FX_EVENT)));
  const good = { schema: NFL_LINES_SCHEMA, sport: "nfl", eventId: FX_EVENT, rows: FX_OFFERS.filter((o) => o.canonicalEventId === `nfl-${FX_EVENT}` && o.book !== "bovada") };
  seal(good);
  assert.equal(nflPublicLineRecords(FX_EVENT, { env }), null, "committed record: off");
  assert.equal(nflPublicLineRecords(FX_EVENT, { env: { GTP_NFL_LINES_DIR: dir }, authorization: { nfl: FULL } }), null, "no key → null");
  assert.equal(nflPublicLineRecords(FX_EVENT, { env: { ...env, [ODDS_DISPLAY_KEY_ENV]: crypto.randomBytes(32).toString("hex") }, authorization: { nfl: FULL } }), null, "another key → null");
  fs.writeFileSync(path.join(dir, `${FX_EVENT}.json`), JSON.stringify(good));
  fs.rmSync(path.join(dir, `${FX_EVENT}.json.enc`));
  assert.equal(nflPublicLineRecords(FX_EVENT, { env, authorization: { nfl: FULL } }), null, "a plaintext file is never read");
  fs.rmSync(path.join(dir, `${FX_EVENT}.json`));
  seal(good);
  assert.equal(nflPublicLineRecords(FX_EVENT, { env, authorization: { nfl: FULL } }).length, good.rows.length);
  assert.equal(nflPublicLineRecords("999000003", { env, authorization: { nfl: FULL } }), null, "no file → null");
  seal({ ...good, rows: FX_OFFERS });
  assert.throws(() => nflPublicLineRecords(FX_EVENT, { env, authorization: { nfl: FULL } }), /eligible-operator allowlist|another event/);
  assert.match(validateNflLineArtifact({ ...good, schema: "x" }, FX_EVENT).errors.join(), /schema/);
  assert.throws(() => nflPublicLineRecords(FX_EVENT, { env: { ...env, GTP_NFL_LINES_DIR: path.join(process.cwd(), "public", "x") }, authorization: { nfl: FULL } }), /may not point into app\/public/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("public gate: NFL families are unqualified, so even an authorized site shows 'Comparison not shown' — model and line, no direction", () => {
  const site = { nfl: { ...FULL, directionQualified: DISPLAY_AUTHORIZATION.nfl.directionQualified } };
  const pub = buildPropLineViews(built.inputs, NFL_PROP_LINE_ADAPTER, { projections: built.projections, directions: publicDirectionGate("nfl", "site", site) });
  assert.deepEqual([pub.counts.compared, pub.counts.directionWithheld, pub.counts.yesNo, pub.counts.notPublished], [0, 3, 2, 3]);
  assert.deepEqual(pub.sides, { OVER: 0, UNDER: 0, NEUTRAL: 0 });
  const yds = pub.rows.find((r) => r.key === `${FX_EVENT}|nfl-athlete-1|reception_yds`);
  assert.deepEqual([yds.state, yds.side, yds.difference, yds.projection.text, yds.line.text, yds.statusText], ["DIRECTION_WITHHELD", null, null, "61.2", "64.5", "Comparison not shown"]);
  assert.equal(pub.coverage.text, "3 of 6 projections have a qualified sportsbook line");
  // qualifying receptions (test record only) shows receptions' direction and nothing else
  const recQ = { nfl: { ...site.nfl, directionQualified: { ...site.nfl.directionQualified, receptions: { qualified: true, evidence: "fixture", approvedBy: "fixture-founder", approvedAt: "2099-01-02" } } } };
  const q = buildPropLineViews(built.inputs, NFL_PROP_LINE_ADAPTER, { projections: built.projections, directions: publicDirectionGate("nfl", "site", recQ) });
  assert.deepEqual(q.rows.filter((r) => r.state === "COMPARED").map((r) => [r.market.key, r.side]).sort(), [["receptions", "NEUTRAL"], ["receptions", "OVER"]]);
  assert.equal(q.rows.find((r) => r.key === `${FX_EVENT}|nfl-athlete-1|reception_yds`).state, "DIRECTION_WITHHELD");
});
