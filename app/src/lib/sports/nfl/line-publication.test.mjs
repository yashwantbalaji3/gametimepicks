/**
 * NFL line publication (gtp.nfl.prop-lines@1): the exporter's rules, its refusals, the encrypted round trip into the
 * build-time reader, and the CLI's refusal without the display key (the committed record authorizes the site, 2026-10-29). SYNTHETIC ONLY: the fake 2099 fixture game
 * (__fixtures__/nfl-prop-line-synthetic.mjs), a fixture receipt, an injected authorization record and a throwaway key
 * generated here; every file goes to a temp dir — never app/public, never data/odds-display.
 * Run: npx tsx --test src/lib/sports/nfl/line-publication.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildNflLinePublication, nflReceiptAllowsDisplay } from "./line-publication-build.mjs";
import { nflPublicLineRecords, nflLinesAad, validateNflLineArtifact, NFL_LINES_SCHEMA } from "./public-line-records.mjs";
import { NFL_PROP_LINE_ADAPTER, nflPropLineInputs } from "./prop-line-adapter.mjs";
import { buildPropLineViews } from "../../odds/prop-line-view.mjs";
import { publicDirectionGate } from "../../odds/display-authorization.mjs";
import { encryptDisplayArtifact, ODDS_DISPLAY_KEY_ENV } from "../../odds/display-crypto.mjs";
import { FX_BOARD, FX_OFFERS, FX_AS_OF, FX_EVENT, FX_KICKOFF } from "./__fixtures__/nfl-prop-line-synthetic.mjs";

const AUTH = { nfl: { siteDisplay: true, socialDisplay: false, providerTermsRef: "docs/legal/FIXTURE_TERMS.md", attribution: null, approvedBy: "fixture-founder", approvedAt: "2099-01-01", socialFeedPrices: false, socialFeedPricesConfirmationRef: null } };
const RECEIPT = [
  "# Fixture receipt (TEST FIXTURE)",
  "NFL only (`americanfootball_nfl`).",
  "Markets added: `player_anytime_td`, `player_pass_yds`, `player_rush_yds`, `player_reception_yds`, `player_receptions`",
  "Effective cumulative ceiling: 100 credits",
  "| Remaining-balance floor | **NONE** for this allowance |",
  "| Failures | do not retry blindly |",
  "| Expiry | the 100-credit effective cumulative ceiling |",
  "| Output | PRIVATE_RESEARCH, productEligible false unless a separate display authorization says otherwise |",
].join("\n");
const H = (h) => new Date(Date.parse(FX_KICKOFF) - h * 3600_000).toISOString();
// The fixture's post-kickoff row is a receipt violation (integrity refusal, tested below): the happy path leaves it out.
const PRE = FX_OFFERS.filter((o) => Date.parse(o.capturedAt) < Date.parse(FX_KICKOFF));
const BOARD = { board: FX_BOARD, path: `app/public/data/nfl/player-board/${FX_EVENT}.json`, sha256: "a".repeat(64) };
const pub = (o = {}) => buildNflLinePublication({ boards: [BOARD], captureFiles: [{ name: "S1/capture-1.json", sha256: "b".repeat(64), offers: PRE }], asOf: FX_AS_OF, receiptText: RECEIPT, receiptRel: "docs/receipts/FIXTURE.md", authorization: AUTH, ...o });

test("refuses while NFL site display is not authorized (switch off, a partial record, an NBA-only record) — before anything else; the committed record passes", () => {
  for (const authorization of [{ nfl: { ...AUTH.nfl, siteDisplay: false } }, { nfl: { ...AUTH.nfl, approvedAt: null } }, { nba: AUTH.nfl }]) {
    const r = buildNflLinePublication({ boards: [BOARD], captureFiles: [], asOf: FX_AS_OF, receiptText: RECEIPT, receiptRel: "x", authorization });
    assert.deepEqual([r.ok, r.code], [false, 2]);
    assert.match(r.reasons.join("; "), /display authorization/);
  }
  const committed = pub({ authorization: undefined });
  assert.equal(committed.ok, true, (committed.reasons ?? []).join("; "));
});

test("happy path: one chosen offer per (player, market) the page would compare or show as Yes; everything else only counted", () => {
  const r = pub();
  assert.equal(r.ok, true, r.reasons?.join("; "));
  assert.equal(r.artifacts.length, 1);
  const a = r.artifacts[0].artifact;
  assert.deepEqual([a.schema, a.sport, a.eventId, a.kickoffUtc, a.asOf], [NFL_LINES_SCHEMA, "nfl", FX_EVENT, new Date(FX_KICKOFF).toISOString(), FX_AS_OF.replace("Z", ".000Z")]);
  assert.deepEqual(a.rows.map((x) => [x.playerId, x.market, x.book]), [
    ["nfl-athlete-1", "player_anytime_td", "draftkings"],
    ["nfl-athlete-1", "player_reception_yds", "fanduel"],
    ["nfl-athlete-1", "player_receptions", "draftkings"],
    ["nfl-athlete-2", "player_receptions", "betmgm"],
    ["nfl-athlete-3", "player_anytime_td", "fanduel"],
  ]);
  assert.deepEqual(Object.keys(a.rows[2]), ["canonicalEventId", "playerId", "market", "book", "line", "overPrice", "underPrice", "capturedAt"]);
  assert.deepEqual(Object.keys(a.rows[0]), ["canonicalEventId", "playerId", "market", "book", "price", "capturedAt"]);
  assert.deepEqual(a.coverage.notWrittenByReason, { INELIGIBLE: 1, NOT_PUBLISHED: 3, NO_LINE: 1, STALE: 1 });
  assert.deepEqual([r.summary.ineligibleBookOffers, r.summary.otherSlateOffers, r.summary.rowsWritten, r.summary.yesNoRows], [2, 1, 5, 2]);
  assert.deepEqual(a.provenance.capture, { provider: "the-odds-api", receipt: "docs/receipts/FIXTURE.md", files: [{ name: "S1/capture-1.json", sha256: "b".repeat(64) }] });
  // stale, ineligible, withheld-family, other-event and alternate numbers are never written
  assert.doesNotMatch(r.artifacts[0].text, /bovada|29\.5|50\.5|15\.5|240\.5|10\.5|66\.5|5\.5|999000002|nfl-athlete-9/);
  assert.equal(validateNflLineArtifact(a, FX_EVENT).ok, true);
  assert.doesNotMatch(r.artifacts[0].text, /"direction"|"side"|"difference"/, "offers only: the direction is the page's gated decision");
});

test("deterministic: same inputs → same bytes regardless of capture order; no wall-clock field", () => {
  const a = pub().artifacts[0].text;
  const b = pub({ captureFiles: [{ name: "S1/capture-1.json", sha256: "b".repeat(64), offers: [...PRE].reverse() }] }).artifacts[0].text;
  assert.equal(a, b);
  assert.doesNotMatch(a, /generatedAt|builtAt|"now"/);
});

test("receipt refusals: none, unparsable, private-only output; the week-8 wording that defers to a separate display authorization is accepted", () => {
  assert.equal(pub({ receiptText: null }).code, 2);
  assert.match(pub({ receiptText: "no terms here" }).reasons.join("; "), /receipt .*scope/);
  const privateOnly = RECEIPT.replace(/\| Output \|.*\|/, "| Output | PRIVATE_RESEARCH only; never displayed |");
  assert.match(pub({ receiptText: privateOnly }).reasons.join("; "), /restricts its output to private research/);
  assert.equal(nflReceiptAllowsDisplay("Output: Private research and shadow evaluation only."), false);
  assert.equal(nflReceiptAllowsDisplay("| Output | PRIVATE_RESEARCH, productEligible false unless a separate display authorization says otherwise; no recommendation |"), true);
  assert.equal(nflReceiptAllowsDisplay("| Output | publication on the site once display is authorized |"), true);
});

test("integrity refusals (exit 4): a market off the receipt, a capture at/after kickoff — nothing is written", () => {
  const offReceipt = pub({ receiptText: RECEIPT.replace("`player_receptions`", "") });
  assert.deepEqual([offReceipt.ok, offReceipt.code], [false, 4]);
  assert.match(offReceipt.reasons.join("; "), /player_receptions is not on the receipt/);
  const late = pub({ captureFiles: [{ name: "S1/capture-1.json", sha256: "b".repeat(64), offers: FX_OFFERS }] });
  assert.deepEqual([late.ok, late.code], [false, 4]);
  assert.match(late.reasons.join("; "), /captured at or after kickoff/);
  assert.equal(late.artifacts, undefined);
});

test("nothing survives (stale only / ineligible only / no board) → refuses, nothing to write", () => {
  const stale = PRE.map((o) => ({ ...o, capturedAt: H(30) }));
  const r = pub({ captureFiles: [{ name: "S1/capture-1.json", sha256: "b".repeat(64), offers: stale }] });
  assert.deepEqual([r.ok, r.code], [false, 5]);
  assert.match(r.reasons[0], /no offer survives the rules/);
  const inel = pub({ captureFiles: [{ name: "S1/capture-1.json", sha256: "b".repeat(64), offers: PRE.map((o) => ({ ...o, book: "bovada" })) }] });
  assert.equal(inel.code, 5);
  assert.equal(pub({ boards: [] }).code, 3);
  assert.equal(pub({ asOf: "not a time" }).code, 2);
});

test("encrypted round trip: exporter text → .json.enc → build-time reader (committed record) → page view (NFL directions withheld by the committed gate)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nfl-pub-"));
  const key = crypto.randomBytes(32);
  const { text } = pub().artifacts[0];
  fs.writeFileSync(path.join(dir, `${FX_EVENT}.json.enc`), encryptDisplayArtifact(text, key, nflLinesAad(FX_EVENT)));
  const env = { GTP_NFL_LINES_DIR: dir, [ODDS_DISPLAY_KEY_ENV]: key.toString("hex") };
  assert.equal(nflPublicLineRecords(FX_EVENT, { env, authorization: { nfl: { ...AUTH.nfl, siteDisplay: false } } }), null, "site off → null, nothing read");
  assert.equal(nflPublicLineRecords(FX_EVENT, { env: { GTP_NFL_LINES_DIR: dir } }), null, "committed record, no key → null");
  const rows = nflPublicLineRecords(FX_EVENT, { env });
  assert.equal(rows.length, 5, "committed record (site authorized 2026-10-29) + key → rows");
  const built = nflPropLineInputs({ board: FX_BOARD, offers: rows, asOf: FX_AS_OF, families: ["receptions", "reception_yds", "anytime_td"] });
  const view = buildPropLineViews(built.inputs, NFL_PROP_LINE_ADAPTER, { projections: built.projections, directions: publicDirectionGate("nfl") });
  assert.deepEqual([view.counts.compared, view.counts.directionWithheld, view.counts.yesNo], [0, 3, 2]);
  fs.rmSync(dir, { recursive: true, force: true });
});

const CLI = path.join(process.cwd(), "scripts/nfl/publish-nfl-line-board.mjs");
test("CLI: with the committed record (site authorized) but no display key, refuses (exit 2) — writes nothing, prints nothing on stdout", () => {
  const priv = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nfl-publish-cli-"));
  const out = path.join(priv, "lines");
  const r = spawnSync("npx", ["tsx", CLI, "--as-of", FX_AS_OF, "--receipt", "docs/receipts/FIXTURE.md", "--private-dir", priv, "--out", out], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, [ODDS_DISPLAY_KEY_ENV]: "" } });
  assert.equal(r.status, 2, r.stderr);
  assert.doesNotMatch(r.stderr, /not authorized for site display/, "the committed record authorizes the site surface");
  assert.match(r.stderr, /REFUSED: GTP_ODDS_DISPLAY_KEY is not set/);
  assert.equal(r.stdout.trim(), "");
  assert.ok(!fs.existsSync(out));
  fs.rmSync(priv, { recursive: true, force: true });
});

test("CLI source: authorization, then the key, before any read; no network or provider credential; no public/export target", () => {
  const src = fs.readFileSync(CLI, "utf8");
  const body = src.slice(src.indexOf("\nimport"));
  assert.ok(body.indexOf('displayAuthorization("nfl", "site")') < body.indexOf("readDisplayKey()"));
  assert.ok(body.indexOf("readDisplayKey()") < body.indexOf("readFileSync"), "authorization and key precede every read");
  assert.doesNotMatch(src, /fetch\(|https?:\/\/|ODDS_API_KEY|process\.env\.[A-Z_]*KEY/);
  assert.match(src, /path\.join\(APP, "public"\), path\.join\(APP, "out"\)/);
  assert.match(src, /gitTreeContaining\(o\)/);
  assert.match(src, /encryptDisplayArtifact\(text, KEY\.key, nflLinesAad\(eventId\)\)/);
  assert.doesNotMatch(src, /--authorize|--force|DISPLAY_AUTHORIZATION\s*=/);
  assert.match(src, /const receiptRel = `docs\/receipts\/\$\{path\.basename\(receiptAbs\)\}`/, "provenance never records a local absolute path");
});
