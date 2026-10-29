/**
 * Site display AUTHORIZED (founder 2026-10-29) — the two build states, through the real build-time readers and the
 * committed record's gates (no injected display or direction gate):
 *   (a) no artifact (no display key — every CI build —, another key, or no file for the date / game) → the NBA and NFL
 *       sections render NOTHING and withNflPropLines hands the page its own node back: the page is byte-identical to the
 *       switch-off render (the per-surface parity checks live in prop-line-switch-off / prop-line-surfaces-switch-off /
 *       nfl-prop-lines-switch-off tests);
 *   (b) a SYNTHETIC artifact encrypted under a throwaway test key → the section renders: OVER / UNDER only for the
 *       direction-qualified NBA families (pts, reb, ast, pra, ptsReb, ptsAst), "Comparison not shown" for NBA threePm and
 *       every NFL over/under family, and anytime touchdown as a yes/no row.
 * Synthetic only: fake prices on a committed lane / the fake 2099 NFL fixture game; every file goes to a temp dir (never
 * app/public, never data/odds-display); the key is generated here and never written.
 * Run: npx tsx --test src/components/odds/prop-line-authorized-render.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

import { NBA_LINE_DISPLAY } from "../../lib/sports/nba/line-board.mjs";
import { NFL_LINE_DISPLAY } from "../../lib/sports/nfl/line-display.mjs";
import { buildNbaLinePublication } from "../../lib/sports/nba/line-publication-build.mjs";
import { NBA_LINES_DIR_ENV } from "../../lib/sports/nba/line-publication.mjs";
import { nbaLinesAad } from "../../lib/sports/nba/public-line-records.mjs";
import { buildNflLinePublication } from "../../lib/sports/nfl/line-publication-build.mjs";
import { nflLinesAad, NFL_LINES_DIR_ENV } from "../../lib/sports/nfl/public-line-records.mjs";
import { encryptDisplayArtifact, ODDS_DISPLAY_KEY_ENV } from "../../lib/odds/display-crypto.mjs";
import { FX_BOARD, FX_OFFERS, FX_AS_OF, FX_EVENT, FX_KICKOFF } from "../../lib/sports/nfl/__fixtures__/nfl-prop-line-synthetic.mjs";

const APP = process.cwd();
const { default: NbaPropLines } = await import("../nba/nba-prop-lines.tsx");
const { default: NflPropLines, withNflPropLines } = await import("../nfl/nfl-prop-lines.tsx");
const strip = (h) => h.replace(/<!-- -->/g, "");

/** Run `fn` with these environment variables set (restored afterwards, whatever happens). */
function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(vars)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
    return fn();
  } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

// ── NBA: a synthetic artifact for a committed lane ──────────────────────────────────────────────────────────────────
const DATE = "2026-10-27";
const LANE_BYTES = fs.readFileSync(path.join(APP, `public/data/nba/experimental-public/${DATE}.json`));
const LANE = JSON.parse(LANE_BYTES.toString("utf8"));
const g0 = LANE.games[0];
const tipMs = Date.parse(g0.tipUtc);
const AS_OF = new Date(tipMs - 1800_000).toISOString();
const [pA, pB, pC] = [g0.players.home[0], g0.players.away[0], g0.players.home[1]];
const median = (p, f) => p.medians?.[f];
const NBA_RECEIPT = [
  "Scope: NBA player props only, `basketball_nba`. (TEST FIXTURE)",
  "Prop markets authorized: `player_points`, `player_rebounds`, `player_assists`, `player_threes`",
  "Effective cumulative ceiling: 40 credits",
  "| Expiry | the 40-credit ceiling |",
  "Do not retry blindly.",
  "Output: publication on the site once display is authorized.",
  "Approved by: fixture-founder 2099-01-01",
].join("\n");
const nbaRec = (p, family, marketKey, line, over, under) => ({
  schema: "gtp.nba.prop-price@1", provider: "the-odds-api", eventId: String(g0.providerEventId), providerAthleteId: String(p.providerAthleteId), family,
  providerMarketKey: marketKey, line, book: "draftkings", overAmerican: over, underAmerican: under, capturedAt: new Date(tipMs - 3600_000).toISOString(), fetchedAt: new Date(tipMs - 3600_000).toISOString(),
});
// lines placed well away from each median so the comparison is unambiguous (pts OVER, reb UNDER, threePm would be OVER)
const NBA_RECORDS = [
  nbaRec(pA, "pts", "player_points", Math.max(0.5, Math.floor(median(pA, "pts")) - 5.5), -137, 117),
  nbaRec(pB, "reb", "player_rebounds", Math.ceil(median(pB, "reb")) + 5.5, -110, -110),
  nbaRec(pC, "threePm", "player_threes", 0.5, 140, -175),
];

function nbaArtifactDir(key) {
  const res = buildNbaLinePublication({ lane: LANE, laneSha256: crypto.createHash("sha256").update(LANE_BYTES).digest("hex"), priceRecords: NBA_RECORDS, asOf: AS_OF, receiptText: NBA_RECEIPT, receiptRel: "docs/receipts/FIXTURE.md" });
  assert.equal(res.ok, true, `the committed record authorizes the exporter: ${(res.reasons ?? []).join("; ")}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nba-auth-render-"));
  fs.writeFileSync(path.join(dir, `${DATE}.json.enc`), encryptDisplayArtifact(res.text, key, nbaLinesAad(DATE)));
  return dir;
}

test("committed record: site display on for NBA and NFL, social off", () => {
  assert.deepEqual([NBA_LINE_DISPLAY.public, NBA_LINE_DISPLAY.social, NFL_LINE_DISPLAY.public, NFL_LINE_DISPLAY.social], [true, false, true, false]);
  for (const f of ["pts", "reb", "threePm"]) assert.ok(Number.isFinite(f === "pts" ? median(pA, f) : f === "reb" ? median(pB, f) : median(pC, f)), `the committed lane has a ${f} median`);
});

test("(a) NBA, authorized, no artifact: no key / another key / no file → the section renders nothing", () => {
  const key = crypto.randomBytes(32);
  const dir = nbaArtifactDir(key);
  try {
    const render = () => renderToStaticMarkup(React.createElement(NbaPropLines, { lane: LANE, asOf: AS_OF }));
    assert.equal(withEnv({ [NBA_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: null }, render), "", "no key");
    assert.equal(withEnv({ [NBA_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: crypto.randomBytes(32).toString("hex") }, render), "", "another key");
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nba-auth-empty-"));
    assert.equal(withEnv({ [NBA_LINES_DIR_ENV]: empty, [ODDS_DISPLAY_KEY_ENV]: key.toString("hex") }, render), "", "no file for the date");
    fs.rmSync(empty, { recursive: true, force: true });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("(b) NBA, authorized + encrypted artifact + test key: OVER / UNDER for qualified families only; threePm 'Comparison not shown'", () => {
  const key = crypto.randomBytes(32);
  const dir = nbaArtifactDir(key);
  try {
    const html = strip(withEnv({ [NBA_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: key.toString("hex") }, () => renderToStaticMarkup(React.createElement(NbaPropLines, { lane: LANE, asOf: AS_OF }))));
    assert.match(html, /<section id="nba-prop-lines"[^>]*data-prop-lines="nba"/);
    assert.match(html, /Model vs\. sportsbook line · NBA player props/);
    assert.match(html, /of \d+ projections have a qualified sportsbook line/);
    assert.equal((html.match(/data-prop-line-side="OVER"/g) ?? []).length, 1, "pts (qualified) → OVER");
    assert.equal((html.match(/data-prop-line-side="UNDER"/g) ?? []).length, 1, "reb (qualified) → UNDER");
    assert.equal((html.match(/data-prop-line="DIRECTION_WITHHELD"/g) ?? []).length, 1, "threePm (unqualified) → withheld");
    assert.match(html, /Comparison not shown/);
    assert.match(html, /DraftKings/);
    // the withheld row is the threePm row: no side, no difference
    const rows = html.split(/(?=<div role="row")/).filter((r) => /data-prop-line="/.test(r));
    const withheld = rows.find((r) => /data-prop-line="DIRECTION_WITHHELD"/.test(r)).split("<ul")[0];
    assert.match(withheld, /plc-market">3-pointers made</);
    assert.match(withheld, /data-prop-line-side="DIRECTION_WITHHELD">Comparison not shown</);
    assert.doesNotMatch(withheld, /data-prop-line-side="(OVER|UNDER|NEUTRAL)"|plc-diff/, "no side, no difference");
    for (const r of rows.filter((x) => /data-prop-line="COMPARED"/.test(x))) assert.match(r, /plc-market">(Points|Rebounds)</, "only qualified families are compared");
    assert.doesNotMatch(html, /Sportsbook lines: Unavailable/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── NFL: the synthetic fixture game ─────────────────────────────────────────────────────────────────────────────────
const NFL_RECEIPT = [
  "# Fixture receipt (TEST FIXTURE)",
  "NFL only (`americanfootball_nfl`).",
  "Markets added: `player_anytime_td`, `player_pass_yds`, `player_rush_yds`, `player_reception_yds`, `player_receptions`",
  "Effective cumulative ceiling: 100 credits",
  "| Remaining-balance floor | **NONE** for this allowance |",
  "| Failures | do not retry blindly |",
  "| Expiry | the 100-credit effective cumulative ceiling |",
  "| Output | PRIVATE_RESEARCH, productEligible false unless a separate display authorization says otherwise |",
].join("\n");
const PRE = FX_OFFERS.filter((o) => Date.parse(o.capturedAt) < Date.parse(FX_KICKOFF));

function nflArtifactDir(key) {
  const res = buildNflLinePublication({ boards: [{ board: FX_BOARD, path: `app/public/data/nfl/player-board/${FX_EVENT}.json`, sha256: "a".repeat(64) }], captureFiles: [{ name: "S1/capture-1.json", sha256: "b".repeat(64), offers: PRE }], asOf: FX_AS_OF, receiptText: NFL_RECEIPT, receiptRel: "docs/receipts/FIXTURE.md" });
  assert.equal(res.ok, true, `the committed record authorizes the NFL exporter: ${(res.reasons ?? []).join("; ")}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nfl-auth-render-"));
  fs.writeFileSync(path.join(dir, `${FX_EVENT}.json.enc`), encryptDisplayArtifact(res.artifacts[0].text, key, nflLinesAad(FX_EVENT)));
  return dir;
}

test("(a) NFL, authorized, no artifact: the section renders nothing and the page hook returns the very same node", () => {
  const key = crypto.randomBytes(32);
  const dir = nflArtifactDir(key);
  const node = React.createElement("section", { id: "players" });
  try {
    for (const [why, env] of [["no key", { [NFL_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: null }], ["another key", { [NFL_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: crypto.randomBytes(32).toString("hex") }]]) {
      withEnv(env, () => {
        assert.equal(renderToStaticMarkup(React.createElement(NflPropLines, { board: FX_BOARD, asOf: FX_AS_OF })), "", why);
        assert.equal(withNflPropLines(node, FX_BOARD), node, `${why}: the page's element tree is unchanged`);
        assert.equal(withNflPropLines(node, () => FX_BOARD), node, `${why}: lazy board`);
      });
    }
    withEnv({ [NFL_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: key.toString("hex") }, () => {
      assert.equal(withNflPropLines(node, { ...FX_BOARD, providerEventId: "999000003" }), node, "no file for this game");
      assert.equal(withNflPropLines(node, null), node, "no board");
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("(b) NFL, authorized + encrypted artifact + test key: every over/under family 'Comparison not shown'; anytime TD a yes/no row; the hook appends the section", () => {
  const key = crypto.randomBytes(32);
  const dir = nflArtifactDir(key);
  const node = React.createElement("section", { id: "players" });
  try {
    withEnv({ [NFL_LINES_DIR_ENV]: dir, [ODDS_DISPLAY_KEY_ENV]: key.toString("hex") }, () => {
      const html = strip(renderToStaticMarkup(React.createElement(NflPropLines, { board: FX_BOARD, asOf: FX_AS_OF })));
      assert.match(html, /<section id="nfl-prop-lines"[^>]*data-prop-lines="nfl"/);
      assert.match(html, /3 of 6 projections have a qualified sportsbook line\./);
      assert.equal((html.match(/data-prop-line="DIRECTION_WITHHELD"/g) ?? []).length, 3, "receptions + receiving yards: withheld");
      assert.doesNotMatch(html, /data-prop-line-side="(OVER|UNDER|NEUTRAL)"|data-prop-line-diff/, "no NFL family is direction-qualified");
      assert.match(html, /Comparison not shown/);
      assert.equal((html.match(/data-prop-line="YES_NO"/g) ?? []).length, 2, "anytime TD: yes/no rows");
      assert.match(html, /Not an over\/under market/);
      assert.doesNotMatch(html, /Passing yards|Rushing yards/);
      const wrapped = withNflPropLines(node, FX_BOARD);
      assert.notEqual(wrapped, node, "with an artifact the hook appends the section");
      assert.match(renderToStaticMarkup(wrapped), /^<section id="players"><\/section><section id="nfl-prop-lines"/);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
