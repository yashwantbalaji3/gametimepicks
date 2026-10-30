/**
 * NBA OVER/UNDER comparison graphics (`gtp-graphics-export@2` NBA_LINE_COMPARISON + scripts/social renderer).
 * On the COMMITTED 2026-10-29 lane and official receipts, with a SYNTHETIC line artifact (fake prices, throwaway key in a
 * temp dir; never the real key, never data/odds-display/):
 *   contract gating (withheld by default; founder review only outside every repo, refuses cleanly without a key),
 *   exact-value equality (lane = export = card HTML = artifact), unqualified / started / stale exclusion, no em dash and
 *   no promotional words in captions, determinism, refusal on any mismatch, and that no public route can reach any of it.
 * Box-score template (founder design 2026-10-30, the default): model-only medians, exact cell strings, colour class =
 * direction, the shown side's price beneath its number, no difference column / book names / jargon, legend, refusals.
 * Run: cd app && npx tsx --test src/lib/social/nba-line-graphics.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildNbaLineGraphicsExport, lineGraphicsExportViolations, serializeLineGraphicsExport, PURPOSE, LINE_GRAPHICS_SCHEMA, EXCLUSION,
} from "./nba-line-graphics-export.mjs";
import { DISPLAY_AUTHORIZATION } from "../odds/display-authorization.mjs";
import { fmt1, lineText, signedDifference } from "../odds/prop-line-view.mjs";
import { nbaExportArgs } from "../../../scripts/social/export-graphics.mjs";
import { loadNbaLineGraphicsExport, assertPrivateOutDir, runLineExport, REPO } from "../../../scripts/social/nba-line-graphics-io.mjs";
import {
  SIZES, renderGameCardHtml, renderSummaryCardHtml, selectCardRows, verifyCardHtml, verifyAgainstSources, gameCaption, summaryCaption, captionViolations, rowCells, EM_DASH, TEST_WATERMARK, REVIEW_BANNER, FOOTER,
} from "../../../scripts/social/nba-line-cards.mjs";
import { prepareNbaLineGraphics, renderNbaLineGraphics } from "../../../scripts/social/render-nba-line-graphics.mjs";
import { syntheticSetup } from "../../../scripts/social/preview-nba-line-graphics.mjs";
import { FAKE_OVER } from "../../../scripts/social/synthetic-line-artifact.mjs";
import {
  BOX_TEMPLATE, BOX_FAMILIES, PER_TEAM, LEGEND, boxScorePlayers, boxScorePages, renderBoxScoreCardHtml, verifyBoxScoreCardHtml, boxVisibleText, boxScoreCaption, boxCell, boxTeam,
} from "../../../scripts/social/nba-boxscore-cards.mjs";

const APP = process.cwd();
const DATE = "2026-10-29";
const AS_OF = "2026-10-29T22:00:00Z"; // before every 10-29 tip (00:00Z and 02:00Z on 10-30)
const BETWEEN_TIPS = "2026-10-30T01:00:00Z"; // CLE@ATL and SAC@NO started; MEM@POR (02:00Z) not
const NO_KEY_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "GTP_ODDS_DISPLAY_KEY" && k !== "GTP_NBA_LINES_DIR"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nba-line-graphics-"));
const LANE = JSON.parse(fs.readFileSync(path.join(APP, "public", "data", "nba", "experimental-public", `${DATE}.json`), "utf8"));
const laneMedian = (eventId, playerId, family) => {
  const g = LANE.games.find((x) => String(x.providerEventId) === eventId);
  const p = [...g.players.away, ...g.players.home].find((x) => String(x.providerAthleteId) === playerId);
  return ["pra", "ptsReb", "ptsAst"].includes(family) ? p.comboMedians[family] : p.medians[family];
};

const syn = syntheticSetup({ date: DATE, asOf: AS_OF, dir: path.join(tmp, "lines") });
const review = loadNbaLineGraphicsExport({ date: DATE, asOf: AS_OF, purpose: PURPOSE.FOUNDER_REVIEW, env: syn.env });
const artRow = (r) => syn.artifact.events.flatMap((e) => e.rows).find((a) => a.eventId === r.identity.eventId && a.athleteId === r.identity.playerId && a.family === r.identity.market);

/* ───────────────────────────── contract gating ───────────────────────────── */

test("default (social) export: medians only, every line/price/direction WITHHELD, no artifact read, validator clean", () => {
  const { doc } = loadNbaLineGraphicsExport({ date: DATE, asOf: AS_OF, purpose: PURPOSE.SOCIAL, env: syn.env });
  assert.equal(doc.schemaVersion, LINE_GRAPHICS_SCHEMA);
  assert.equal(doc.purpose, PURPOSE.SOCIAL);
  assert.equal(doc.socialAuthorized, false);
  assert.equal(doc.publication.status, "LINES_WITHHELD");
  assert.equal(doc.artifact, null, "the artifact is not read when no value may be emitted");
  assert.equal(doc.authorization.valuesIncluded, false);
  assert.deepEqual(lineGraphicsExportViolations(doc), []);
  assert.ok(doc.rows.length > 0);
  for (const r of doc.rows) {
    for (const [k, f] of Object.entries(r.market)) assert.deepEqual(f, { state: "WITHHELD", reason: "NOT_AUTHORIZED_FOR_SOCIAL" }, `${r.rowId} market.${k}`);
    assert.notEqual(r.identity.market, "threePm");
  }
  const raw = serializeLineGraphicsExport(doc);
  assert.doesNotMatch(raw, /"(overPrice|underPrice|line|difference)":\s*\{\s*"state":\s*"SHOWN"/);
  assert.ok(!raw.includes(String(FAKE_OVER)), "no synthetic price leaks into the withheld export");
});

test("the withheld social mode refuses to render any graphic", () => {
  assert.throws(() => prepareNbaLineGraphics({ date: DATE, asOf: AS_OF, purpose: PURPOSE.SOCIAL, env: syn.env }), /not authorized for social display/);
});

test("founder review: values included, socialAuthorized false, purpose FOUNDER_REVIEW_ONLY, test data flagged", () => {
  const d = review.doc;
  assert.equal(d.purpose, "FOUNDER_REVIEW_ONLY");
  assert.equal(d.socialAuthorized, false);
  assert.equal(d.authorization.social.authorized, false);
  assert.equal(d.authorization.valuesIncluded, true);
  assert.equal(d.artifact.testData, true);
  assert.equal(d.artifact.dataClass, "SYNTHETIC_TEST_DATA");
  assert.match(d.artifact.encSha256, /^[0-9a-f]{64}$/);
  assert.equal(d.publication.status, "PUBLISHED");
  assert.deepEqual(lineGraphicsExportViolations(d), []);
  // A review document that claimed social authorization would be a violation.
  assert.ok(lineGraphicsExportViolations({ ...d, socialAuthorized: true }).some((x) => /socialAuthorized:false/.test(x)));
  // The same values under purpose SOCIAL (not authorized) are violations.
  assert.ok(lineGraphicsExportViolations({ ...d, purpose: PURPOSE.SOCIAL }).some((x) => /shown without authorization/.test(x)));
});

test("founder review on the REAL committed 10-29 artifact path without a key refuses cleanly and writes nothing", () => {
  assert.ok(fs.existsSync(path.join(REPO, "data", "odds-display", "nba", "lines", `${DATE}.json.enc`)), "the committed artifact exists");
  assert.throws(() => loadNbaLineGraphicsExport({ date: DATE, asOf: AS_OF, purpose: PURPOSE.FOUNDER_REVIEW, env: NO_KEY_ENV }), /GTP_ODDS_DISPLAY_KEY is not set/);
  const out = path.join(tmp, "real-no-key");
  for (const [script, extra] of [["scripts/social/render-nba-line-graphics.mjs", []], ["scripts/social/export-graphics.mjs", ["--sport", "nba", "--edition", "lines"]]]) {
    const r = spawnSync("npx", ["tsx", script, ...extra, "--date", DATE, "--as-of", AS_OF, "--purpose", "founder-review", "--out", script.includes("render") ? out : path.join(out, "x.json")], { cwd: APP, env: NO_KEY_ENV, encoding: "utf8" });
    assert.equal(r.status, 1, `${script}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /REFUSED: GTP_ODDS_DISPLAY_KEY is not set/);
    assert.ok(!fs.existsSync(out), `${script} wrote ${out}`);
  }
});

test("founder-review output only outside every git repository", () => {
  for (const bad of [REPO, path.join(APP, ".graphics-export"), path.join(APP, "public", "x"), path.join(REPO, "data", "odds-display", "previews")]) {
    assert.throws(() => assertPrivateOutDir(bad), /inside the repository/, bad);
  }
  const otherRepo = path.join(tmp, "other-repo");
  fs.mkdirSync(path.join(otherRepo, ".git"), { recursive: true });
  assert.throws(() => assertPrivateOutDir(path.join(otherRepo, "out", "deep")), /inside the git repository/);
  // a symlink from a private dir into the repo is resolved and refused
  const link = path.join(tmp, "link-to-repo");
  fs.symlinkSync(APP, link);
  assert.throws(() => assertPrivateOutDir(path.join(link, "graphics")), /inside the repository/);
  assert.equal(assertPrivateOutDir(path.join(tmp, "ok", "2026-10-30")), path.join(tmp, "ok", "2026-10-30"));
  // the export CLI refuses a repo path BEFORE reading anything (even with a valid key)
  assert.throws(() => runLineExport({ sport: "nba", edition: "lines", date: DATE, "as-of": AS_OF, purpose: "founder-review", out: path.join(APP, ".graphics-export", "x.json") }, syn.env), /inside the repository/);
  const { out, doc } = runLineExport({ sport: "nba", edition: "lines", date: DATE, "as-of": AS_OF, purpose: "founder-review", out: path.join(tmp, "review", "x.json") }, syn.env);
  assert.equal(doc.purpose, PURPOSE.FOUNDER_REVIEW);
  assert.ok(fs.existsSync(out));
});

/* ───────────────────────────── exact values + exclusions ───────────────────────────── */

test("every row: model = lane median, line = artifact line, difference = full-precision model − line, side from its sign", () => {
  assert.ok(review.doc.rows.length > 50);
  for (const r of review.doc.rows) {
    const lm = laneMedian(r.identity.eventId, r.identity.playerId, r.identity.market);
    const a = artRow(r);
    assert.equal(r.model.value, lm, r.rowId);
    assert.equal(r.model.display, fmt1(lm));
    assert.equal(a.projection, lm);
    assert.equal(r.market.line.value, a.line);
    assert.equal(r.market.line.text, lineText(a.line));
    assert.equal(r.market.difference.exact, lm - a.line);
    assert.equal(r.market.difference.text, signedDifference(lm - a.line).text);
    assert.equal(r.market.direction.side, lm > a.line ? "OVER" : lm < a.line ? "UNDER" : "NEUTRAL");
    assert.equal(r.market.direction.side, a.side);
    assert.equal(r.market.overPrice.text, "+999");
    assert.equal(r.market.underPrice.text, "−999");
    assert.equal(r.market.book.label, "DraftKings");
    assert.match(r.snapshot.id, /^[0-9a-f]{64}$/);
    assert.match(r.snapshot.receiptPayloadSha256, /^[0-9a-f]{64}$/);
    assert.match(r.provenance.laneSha256, /^[0-9a-f]{64}$/);
  }
  assert.ok(review.doc.rows.some((r) => r.market.direction.side === "NEUTRAL" && r.market.difference.text === "0.0"));
  assert.deepEqual(verifyAgainstSources(review), []);
});

test("unqualified families (threePm) never appear; a family the record unqualifies disappears", () => {
  assert.ok(!review.doc.rows.some((r) => r.identity.market === "threePm"));
  assert.ok(review.doc.scope.excludedByReason[EXCLUSION.FAMILY_NOT_QUALIFIED] > 0);
  assert.deepEqual(review.doc.authorization.directionGate.unqualifiedFamilies, ["threePm"]);
  const rec = { ...DISPLAY_AUTHORIZATION, nba: { ...DISPLAY_AUTHORIZATION.nba, directionQualified: { ...DISPLAY_AUTHORIZATION.nba.directionQualified, pts: { qualified: false, evidence: "test", approvedBy: null, approvedAt: null } } } };
  const d = buildNbaLineGraphicsExport({ ...nbaExportArgs({ date: DATE, asOf: AS_OF }), artifact: review.artifact, purpose: PURPOSE.FOUNDER_REVIEW, authorizationRecord: rec });
  assert.ok(d.rows.length > 0 && !d.rows.some((r) => r.identity.market === "pts" || r.identity.market === "threePm"));
});

test("stale lines (> 6 h before asOf) are excluded; started games are excluded", () => {
  assert.ok(review.doc.scope.excludedByReason.STALE > 0, "the synthetic stale quotes are excluded");
  for (const r of review.doc.rows) assert.ok(Date.parse(AS_OF) - Date.parse(r.market.quotedAt.iso) <= 6 * 3600_000);
  const s2 = syntheticSetup({ date: DATE, asOf: BETWEEN_TIPS, dir: path.join(tmp, "lines-between") });
  const { doc } = loadNbaLineGraphicsExport({ date: DATE, asOf: BETWEEN_TIPS, purpose: PURPOSE.FOUNDER_REVIEW, env: s2.env });
  assert.deepEqual(doc.scope.eventsExcludedStarted.map((e) => e.eventId).sort(), ["401909893", "401909894"]);
  assert.ok(doc.scope.excludedByReason[EXCLUSION.GAME_STARTED] > 0);
  assert.ok(doc.rows.length > 0);
  for (const r of doc.rows) assert.equal(r.identity.eventId, "401909895");
  // once every game has started: nothing to render
  assert.throws(() => prepareNbaLineGraphics({ date: DATE, asOf: "2026-10-30T02:30:00Z", purpose: PURPOSE.FOUNDER_REVIEW, env: syn.env }), /no comparison survives/);
});

/* ───────────────────────────── refusal on mismatch ───────────────────────────── */

test("refuses on any mismatch: artifact projection ≠ lane, lane ≠ export, export ≠ card", () => {
  const base = nbaExportArgs({ date: DATE, asOf: AS_OF });
  // artifact claims a different projection (difference kept consistent so the artifact validator alone would pass)
  const bad = structuredClone(review.artifact);
  const row = bad.events[0].rows.find((r) => r.family === "pts" && r.capturedAt !== bad.events[0].rows[0].capturedAt) ?? bad.events[0].rows.find((r) => r.family === "pts");
  row.projection = Math.round((row.projection + 1) * 10) / 10;
  row.difference = Math.round((row.projection - row.line) * 10) / 10;
  const dir = row.projection - row.line > 0 ? "ABOVE" : row.projection - row.line < 0 ? "BELOW" : "EQUAL";
  row.direction = dir; row.side = { ABOVE: "OVER", BELOW: "UNDER", EQUAL: "NEUTRAL" }[dir];
  assert.throws(() => buildNbaLineGraphicsExport({ ...base, artifact: bad, purpose: PURPOSE.FOUNDER_REVIEW }), /artifact projection/);
  // an artifact for another lane (sha differs) is refused
  assert.throws(() => buildNbaLineGraphicsExport({ ...base, artifact: { ...review.artifact, provenance: { ...review.artifact.provenance, lane: { ...review.artifact.provenance.lane, sha256: "0".repeat(64) } } }, purpose: PURPOSE.FOUNDER_REVIEW }), /lane sha256 differs/);
  // a lane value that disagrees with the export (source check reads the lane itself)
  const lane2 = structuredClone(LANE);
  const r0 = review.doc.rows[0];
  const p = [...lane2.games.find((g) => String(g.providerEventId) === r0.identity.eventId).players.away, ...lane2.games.find((g) => String(g.providerEventId) === r0.identity.eventId).players.home].find((x) => String(x.providerAthleteId) === r0.identity.playerId);
  p.medians[r0.identity.market] += 0.1;
  assert.ok(verifyAgainstSources({ ...review, lane: lane2 }).some((x) => x.includes(r0.rowId) && /lane value/.test(x)));
  // an export row edited after the build (line changed) fails both the contract and the source check
  const doc2 = structuredClone(review.doc);
  doc2.rows[0].market.line.value += 1;
  assert.ok(lineGraphicsExportViolations(doc2).length > 0);
  assert.ok(verifyAgainstSources({ ...review, doc: doc2 }).some((x) => /artifact line/.test(x)));
  // card HTML that does not carry the row's exact strings is refused
  const { rows } = selectCardRows(review.doc, r0.identity.eventId, SIZES.landscape.maxRows);
  const html = renderGameCardHtml({ doc: review.doc, eventId: r0.identity.eventId, size: SIZES.landscape });
  assert.deepEqual(verifyCardHtml(html, rows), []);
  const tampered = html.replace(`<div class="c-num c-model">${rows[0].model.display}</div>`, `<div class="c-num c-model">${fmt1(rows[0].model.value + 0.1)}</div>`);
  assert.ok(verifyCardHtml(tampered, rows).some((x) => x.includes(rows[0].rowId)));
  assert.ok(verifyCardHtml(html, rows.slice(1)).some((x) => /rows on the card/.test(x)));
});

/* ───────────────────────────── image data (HTML) ───────────────────────────── */

test("card HTML carries the exact strings of every row, computed independently from the lane and the artifact", () => {
  for (const ev of review.doc.events) {
    for (const size of Object.values(SIZES)) {
      const html = renderGameCardHtml({ doc: review.doc, eventId: ev.eventId, size });
      const { rows } = selectCardRows(review.doc, ev.eventId, size.maxRows);
      assert.ok(rows.length > 0 && rows.length <= size.maxRows);
      assert.deepEqual([...html.matchAll(/data-row-id="([^"]+)"/g)].map((m) => m[1]), rows.map((r) => r.rowId), "rows in export order");
      for (const r of rows) {
        const a = artRow(r);
        const lm = laneMedian(r.identity.eventId, r.identity.playerId, r.identity.market);
        const side = lm > a.line ? "OVER" : lm < a.line ? "UNDER" : "NEUTRAL";
        const seg = html.slice(html.indexOf(`data-row-id="${r.rowId}"`)).split("data-row-id=")[1];
        for (const s of [
          `<span class="pname">${r.identity.playerName.replace(/'/g, "'")}</span>`,
          `<div class="c-num c-model">${fmt1(lm)}</div>`,
          `<div class="c-num c-line">${lineText(a.line)}</div>`,
          `<span class="glyph">${{ OVER: "▲", UNDER: "▼", NEUTRAL: "=" }[side]}</span><span class="word">${side}</span>`,
          `<div class="c-num c-diff">${signedDifference(lm - a.line).text}</div>`,
          `<span class="bname">DraftKings</span>`,
          `<span class="odds">O +999 · U −999</span>`,
        ]) assert.ok(seg.includes(s), `${r.rowId} ${size.key}: ${s}`);
        assert.equal(rowCells(r).word, side);
      }
      assert.ok(html.includes(TEST_WATERMARK), "synthetic data is watermarked");
      assert.ok(html.includes(REVIEW_BANNER), "founder-review cards carry the banner");
      assert.match(html, /Not betting advice\./);
      assert.match(html, /1-800-GAMBLER/);
      assert.match(html, /Lines quoted Oct 29, 4:30 PM ET/);
      assert.doesNotMatch(html, /https?:\/\//, "nothing is fetched");
    }
  }
  const summary = renderSummaryCardHtml({ doc: review.doc, size: SIZES.landscape });
  for (const e of review.doc.events) assert.ok(summary.includes(`data-counts="${e.rows}|${e.over}|${e.under}|${e.neutral}"`));
  assert.deepEqual(verifyCardHtml(summary, [], { kind: "summary" }), []);
});

test("withheld prices never print a book or odds (social mode with lines but no socialPrices)", () => {
  const rec = { ...DISPLAY_AUTHORIZATION, nba: { ...DISPLAY_AUTHORIZATION.nba, socialDisplay: true } };
  const d = buildNbaLineGraphicsExport({ ...nbaExportArgs({ date: DATE, asOf: AS_OF }), artifact: review.artifact, purpose: PURPOSE.SOCIAL, authorizationRecord: rec });
  assert.equal(d.socialAuthorized, true);
  assert.deepEqual(lineGraphicsExportViolations(d, { authorizationRecord: rec }), []);
  for (const r of d.rows) for (const k of ["book", "overPrice", "underPrice"]) assert.deepEqual(r.market[k], { state: "WITHHELD", reason: "PRICES_NOT_AUTHORIZED_FOR_SOCIAL" });
  const ev = d.events.find((e) => e.rows > 0);
  const html = renderGameCardHtml({ doc: d, eventId: ev.eventId, size: SIZES.landscape });
  assert.doesNotMatch(html, /class="(bname|odds)"/);
  assert.ok(!html.includes("+999"));
  assert.ok(!html.includes(REVIEW_BANNER));
  assert.deepEqual(verifyCardHtml(html, selectCardRows(d, ev.eventId, SIZES.landscape.maxRows).rows), []);
});

/* ───────────────────────────── captions ───────────────────────────── */

test("captions: natural sentences, no em dash, no promotional or promissory words", () => {
  const all = [summaryCaption(review.doc), ...review.doc.events.flatMap((e) => [gameCaption(review.doc, e.eventId, SIZES.landscape), gameCaption(review.doc, e.eventId, SIZES.portrait)])];
  for (const c of all) {
    assert.ok(!c.includes(EM_DASH), c);
    assert.ok(!c.includes("–"), c);
    assert.deepEqual(captionViolations(c), [], c);
    assert.doesNotMatch(c, /\b(edge|lock|value|guarantee|best bet|profit)\b/i);
    assert.match(c, /Not betting advice\./);
  }
  const g = gameCaption(review.doc, review.doc.events[0].eventId);
  const r = selectCardRows(review.doc, review.doc.events[0].eventId, SIZES.landscape.maxRows).rows[0];
  assert.ok(g.includes(`model ${r.model.display}, line ${r.market.line.text} (${r.market.direction.word}, ${r.market.difference.text})`));
  assert.ok(captionViolations(`A ${EM_DASH} B. Not betting advice. 1-800-GAMBLER`).some((x) => /em dash/.test(x)));
  assert.ok(captionViolations("Our lock of the night. Not betting advice. 1-800-GAMBLER").some((x) => /banned/.test(x)));
  assert.ok(captionViolations("Plain text.").some((x) => /Not betting advice/.test(x)));
});

/* ───────────────────────────── determinism ───────────────────────────── */

test("determinism: same inputs give byte-identical export and card HTML", () => {
  const again = loadNbaLineGraphicsExport({ date: DATE, asOf: AS_OF, purpose: PURPOSE.FOUNDER_REVIEW, env: syn.env });
  assert.equal(serializeLineGraphicsExport(again.doc), serializeLineGraphicsExport(review.doc));
  const a = prepareNbaLineGraphics({ date: DATE, asOf: AS_OF, purpose: PURPOSE.FOUNDER_REVIEW, env: syn.env, template: "table" });
  const b = prepareNbaLineGraphics({ date: DATE, asOf: AS_OF, purpose: PURPOSE.FOUNDER_REVIEW, env: syn.env, template: "table" });
  assert.deepEqual(a.cards.map((c) => c.html), b.cards.map((c) => c.html));
  assert.deepEqual(a.captions, b.captions);
  assert.equal(a.cards.length, review.doc.events.filter((e) => e.rows > 0).length * 2 + 2);
  // the box-score template (default) is deterministic too
  const x = prepareNbaLineGraphics({ date: DATE, asOf: AS_OF, purpose: PURPOSE.FOUNDER_REVIEW, env: syn.env });
  const y = prepareNbaLineGraphics({ date: DATE, asOf: AS_OF, purpose: PURPOSE.FOUNDER_REVIEW, env: syn.env });
  assert.ok(x.cards.length > 0 && x.cards.every((c) => c.template === BOX_TEMPLATE && c.size.key === "1080x1350"));
  assert.deepEqual(x.cards.map((c) => c.html), y.cards.map((c) => c.html));
  assert.deepEqual(x.captions, y.captions);
  assert.throws(() => prepareNbaLineGraphics({ date: DATE, asOf: AS_OF, purpose: PURPOSE.FOUNDER_REVIEW, env: syn.env, template: "spreadsheet" }), /--template/);
});

/* ───────────────────────────── box-score template (founder design 2026-10-30) ───────────────────────────── */

const syn8 = syntheticSetup({ date: DATE, asOf: AS_OF, dir: path.join(tmp, "lines8"), perTeam: 8 });
const review8 = loadNbaLineGraphicsExport({ date: DATE, asOf: AS_OF, purpose: PURPOSE.FOUNDER_REVIEW, env: syn8.env });
const art8 = (eventId, playerId, family) => syn8.artifact.events.flatMap((e) => e.rows).find((a) => a.eventId === eventId && a.athleteId === playerId && a.family === family);
/** class + cell id of every cell on a card, in print order. */
const cellsOf = (html) => [...html.matchAll(/<div class="cell (\w+)" data-cell="([^"]+)" data-state="(\w+)">([\s\S]*?)<\/div><\/div>(?=<div class="cell|<\/div><\/div>)/g)].map((m) => ({ cls: m[1], id: m[2], state: m[3], inner: m[4] }));

test("model-only medians: every qualified median without a compared row, lane-equal, no market block; contract enforces it", () => {
  const d = review8.doc;
  assert.ok(d.modelOnly.length > 0, "stale and unquoted players produce model-only entries");
  const compared = new Set(d.rows.map((r) => r.rowId));
  for (const m of d.modelOnly) {
    assert.ok(!compared.has(m.rowId));
    assert.equal(m.kind, "PLAYER_PROP_MODEL_ONLY");
    assert.equal(m.comparison.state, "NOT_COMPARED");
    assert.ok(!("market" in m));
    assert.equal(m.model.value, laneMedian(m.identity.eventId, m.identity.playerId, m.identity.market));
    assert.notEqual(m.identity.market, "threePm");
  }
  assert.deepEqual(lineGraphicsExportViolations(d), []);
  assert.deepEqual(verifyAgainstSources(review8), []);
  // the withheld social export carries no model-only block (its rows already hold every median)
  assert.ok(!("modelOnly" in loadNbaLineGraphicsExport({ date: DATE, asOf: AS_OF, purpose: PURPOSE.SOCIAL, env: syn8.env }).doc));
  const bad = structuredClone(d);
  bad.modelOnly[0].market = { line: { state: "SHOWN", value: 1 } };
  assert.ok(lineGraphicsExportViolations(bad).some((x) => /carries a market block/.test(x)));
  const dup = structuredClone(d);
  dup.modelOnly.push({ ...dup.modelOnly[0], rowId: d.rows[0].rowId });
  assert.ok(lineGraphicsExportViolations(dup).some((x) => /duplicates a row/.test(x)));
  const lane2 = structuredClone(LANE);
  const m0 = d.modelOnly.find((m) => !["pra", "ptsReb", "ptsAst"].includes(m.identity.market));
  [...lane2.games.find((g) => String(g.providerEventId) === m0.identity.eventId).players.away, ...lane2.games.find((g) => String(g.providerEventId) === m0.identity.eventId).players.home].find((x) => String(x.providerAthleteId) === m0.identity.playerId).medians[m0.identity.market] += 0.1;
  assert.ok(verifyAgainstSources({ ...review8, lane: lane2 }).some((x) => x.includes(m0.rowId)));
});

test("box score: players with a compared PTS/REB/AST line, ordered by projected points, at most PER_TEAM a side, split evenly", () => {
  for (const ev of review8.doc.events) {
    const g = boxScorePlayers(review8.doc, ev.eventId);
    const pages = boxScorePages(review8.doc, ev.eventId);
    for (const side of ["awayPlayers", "homePlayers"]) {
      const ps = g[side];
      assert.ok(ps.length > 0);
      for (const p of ps) assert.ok(BOX_FAMILIES.some((f) => p.cells[f]?.kind === "PLAYER_PROP_LINE"), `${p.name} has a compared cell`);
      for (let i = 1; i < ps.length; i += 1) assert.ok((ps[i - 1].cells.pts?.model.value ?? -1) >= (ps[i].cells.pts?.model.value ?? -1), "points desc");
      assert.deepEqual(pages.flatMap((pg) => pg[side]).map((p) => p.playerId), ps.map((p) => p.playerId), "every player exactly once, in order");
      for (const pg of pages) assert.ok(pg[side].length <= PER_TEAM);
      assert.equal(pages[0][side].length, Math.ceil(ps.length / pages.length), "split evenly across the cards");
    }
    assert.ok(pages.length >= 2, "eight quoted players a side need a second card");
  }
});

test("box-score cells: exact number, colour class = direction, the shown side's price beneath, computed from the lane and the artifact", () => {
  let over = 0, under = 0, grey = 0;
  for (const ev of review8.doc.events) {
    for (const page of boxScorePages(review8.doc, ev.eventId)) {
      const html = renderBoxScoreCardHtml({ doc: review8.doc, page });
      assert.deepEqual(verifyBoxScoreCardHtml(html, review8.doc, page), []);
      const cells = cellsOf(html);
      const players = [...page.awayPlayers, ...page.homePlayers];
      assert.equal(cells.length, players.length * 3);
      cells.forEach((c, i) => {
        const p = players[Math.floor(i / 3)], family = BOX_FAMILIES[i % 3];
        assert.equal(c.id, `nba:${DATE}:${ev.eventId}:${p.playerId}:${family}`);
        assert.equal(c.cls, c.state);
        const lm = laneMedian(ev.eventId, p.playerId, family);
        const row = review8.doc.rows.find((r) => r.rowId === c.id);
        assert.ok(c.inner.includes(`<span class="v">${fmt1(lm)}</span>`), `${c.id} number`);
        if (!row) { // no qualified comparison: grey, no arrow, nothing beneath
          assert.equal(c.cls, "none"); grey += 1;
          assert.doesNotMatch(c.inner, /class="(gl|sl|px|sub)"/);
          return;
        }
        const a = art8(ev.eventId, p.playerId, family);
        const side = lm > a.line ? "OVER" : lm < a.line ? "UNDER" : "NEUTRAL";
        assert.equal(row.market.direction.side, side);
        if (side === "NEUTRAL") { assert.equal(c.cls, "neutral"); assert.doesNotMatch(c.inner, /class="(gl|px|sl)"/); grey += 1; return; }
        assert.equal(c.cls, side === "OVER" ? "over" : "under");
        assert.ok(c.inner.includes(`<span class="gl">${side === "OVER" ? "▲" : "▼"}</span>`), "arrow shape, not colour alone");
        assert.ok(c.inner.includes(`<span class="sl">${side === "OVER" ? "O" : "U"} ${lineText(a.line)}</span>`));
        // synthetic prices: OVER +999, UNDER −999, so the side under each number is unambiguous
        assert.deepEqual([...c.inner.matchAll(/<span class="px">([^<]*)<\/span>/g)].map((m) => m[1]), [side === "OVER" ? "+999" : "−999"]);
        if (side === "OVER") over += 1; else under += 1;
      });
      // no difference column, no book names, no internal jargon; legend + footer present
      const text = boxVisibleText(html);
      assert.doesNotMatch(html, /c-diff|Diff</);
      for (const b of ["DraftKings", "FanDuel", "BetMGM", "Caesars"]) assert.ok(!text.includes(b), b);
      for (const w of ["median", "lane", "snapshot", "receipt"]) assert.doesNotMatch(text, new RegExp(`\\b${w}\\b`, "i"));
      for (const l of LEGEND) assert.ok(html.includes(`<div class="${l.cls}"><i>${l.glyph}</i><span>${l.text}</span></div>`), l.text);
      assert.deepEqual(LEGEND.map((l) => [l.glyph, l.text]), [["▲", "Projection above line"], ["▼", "Projection below line"], ["●", "No qualified comparison"]]);
      assert.ok(text.includes("Model projections vs sportsbook lines quoted Oct 29, 4:30 PM ET. Lines from licensed US sportsbooks."));
      for (const s of ["Not betting advice.", FOOTER.responsible, "Not affiliated with the NBA or its teams.", TEST_WATERMARK, REVIEW_BANNER]) assert.ok(text.includes(s), s);
      assert.match(html, /data-template="gtp-nba-boxscore@1"/);
      assert.doesNotMatch(html.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, ""), /https?:\/\//, "nothing is fetched");
      const cap = boxScoreCaption(review8.doc, page);
      assert.deepEqual(captionViolations(cap), [], cap);
    }
  }
  assert.ok(over > 0 && under > 0 && grey > 0, `all three states exercised (${over}/${under}/${grey})`);
});

test("box-score card refuses: wrong number, wrong colour, price under the wrong number, missing price, book name, jargon, difference", () => {
  const ev = review8.doc.events[0];
  const page = boxScorePages(review8.doc, ev.eventId)[0];
  const html = renderBoxScoreCardHtml({ doc: review8.doc, page });
  assert.deepEqual(verifyBoxScoreCardHtml(html, review8.doc, page), []);
  const overCell = cellsOf(html).find((c) => c.cls === "over");
  const underCell = cellsOf(html).find((c) => c.cls === "under");
  const at = (h, c) => h.indexOf(`data-cell="${c.id}"`);
  const editCell = (c, fn) => { const s = at(html, c) - `<div class="cell ${c.cls}" `.length; const e = s + `<div class="cell ${c.cls}" data-cell="${c.id}" data-state="${c.state}">${c.inner}`.length; return html.slice(0, s) + fn(html.slice(s, e)) + html.slice(e); };
  const fails = (h, re) => assert.ok(verifyBoxScoreCardHtml(h, review8.doc, page).some((x) => re.test(x)), `expected ${re}`);
  fails(editCell(overCell, (s) => s.replace(/<span class="v">([^<]*)<\/span>/, (_, v) => `<span class="v">${fmt1(Number(v) + 0.1)}</span>`)), /number is not/);
  fails(editCell(overCell, (s) => s.replace('class="cell over"', 'class="cell under"').replace('data-state="over"', 'data-state="under"')), /colour class/);
  fails(editCell(overCell, (s) => s.replace('<span class="px">+999</span>', '<span class="px">−999</span>')), /price/);
  fails(editCell(underCell, (s) => s.replace('<span class="px">−999</span>', "")), /price/);
  fails(editCell(overCell, (s) => s.replace('<span class="gl">▲</span>', "")), /arrow/);
  fails(html.replace("Lines from licensed US sportsbooks.", "Lines from DraftKings."), /book name|footer missing/);
  fails(html.replace("Projections vs sportsbook lines", "Official medians vs sportsbook lines"), /internal term/);
  fails(html.replace('<section class="lines"', '<div class="c-diff">−1.4</div><section class="lines"'), /difference column/);
  fails(html.replace('<span>No qualified comparison</span>', "<span></span>"), /legend missing/);
  fails(html.replace(FOOTER.responsible, ""), /footer missing/);
  fails(html.replace(/<div class="cell [^"]+" data-cell="[^"]+"/, (m) => m.replace(/data-cell="[^"]+"/, 'data-cell="nba:x"')), /cells on the card|missing/);
  // a cell with no export entry at all prints a grey en dash; a non-row / non-model-only entry is refused
  assert.deepEqual(boxCell(null), { state: "absent", number: "–", glyph: null, sideLetter: null, line: null, price: null });
  assert.throws(() => boxCell({ rowId: "x", kind: "PLAYER_PROP" }), /neither a compared row nor a model-only entry/);
  assert.throws(() => boxTeam("XYZ"), /no verified NBA colour record/);
});

test("box score with prices withheld (social lines authorized, prices not): colours and lines only, never a price", () => {
  const rec = { ...DISPLAY_AUTHORIZATION, nba: { ...DISPLAY_AUTHORIZATION.nba, socialDisplay: true } };
  const d = buildNbaLineGraphicsExport({ ...nbaExportArgs({ date: DATE, asOf: AS_OF }), artifact: review8.artifact, purpose: PURPOSE.SOCIAL, authorizationRecord: rec });
  const ev = d.events.find((e) => e.rows > 0);
  for (const page of boxScorePages(d, ev.eventId)) {
    const html = renderBoxScoreCardHtml({ doc: d, page });
    assert.deepEqual(verifyBoxScoreCardHtml(html, d, page), []);
    assert.doesNotMatch(html, /class="px"/);
    assert.ok(!html.includes("+999") && !html.includes("−999"));
    assert.ok(cellsOf(html).some((c) => c.cls === "over") && cellsOf(html).some((c) => c.cls === "under"));
    assert.ok(!html.includes(REVIEW_BANNER));
  }
});

/* The PNG step needs a Playwright browser binary. CI's unit phase installs none (browsers are installed only for the
   e2e/a11y phases), so this one raster test is skipped there with the reason printed; every exact-value, gating and
   refusal test above runs without a browser. Locally (or anywhere chromium is installed) it always runs. */
const { chromium } = await import("playwright");
const NO_BROWSER = (() => { try { return fs.existsSync(chromium.executablePath()) ? false : "playwright chromium is not installed in this environment"; } catch (e) { return `playwright chromium unavailable: ${e.message}`; } })();

test("end to end: validated files and PNGs (table 1600×900 + 1080×1350, box score 1080×1350; layout pass incl. min sizes) outside the repo", { skip: NO_BROWSER }, async () => {
  const dims = (f) => { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  for (const template of ["table", "boxscore"]) {
    const out = path.join(tmp, `render-${template}`);
    // box score: eight quoted players a side, so the layout pass sees full six-row panels and a second card
    const { pngs, manifest } = await renderNbaLineGraphics({ date: DATE, "as-of": AS_OF, purpose: "founder-review", out, scales: "1", template }, template === "table" ? syn.env : syn8.env);
    assert.equal(pngs.length, manifest.cards.length);
    for (const f of pngs) assert.deepEqual(dims(f), f.includes("1600x900") ? [1600, 900] : [1080, 1350], f);
    assert.equal(manifest.template, template);
    assert.equal(manifest.export.purpose, "FOUNDER_REVIEW_ONLY");
    assert.equal(manifest.export.testData, true);
    if (template === "boxscore") assert.ok(manifest.cards.every((c) => c.size === "1080x1350") && manifest.cards.some((c) => c.pages > 1));
  }
  await assert.rejects(renderNbaLineGraphics({ date: DATE, "as-of": AS_OF, purpose: "founder-review", out: path.join(APP, ".graphics-export", "r"), scales: "1" }, syn.env), /inside the repository/);
});

/* ───────────────────────────── not reachable from any public route ───────────────────────────── */

const SRC = path.join(APP, "src");
const exts = [".ts", ".tsx", ".mjs", ".js", ".jsx"];
const resolveSpec = (from, spec) => {
  const b = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!b) return null;
  for (const c of [b, ...exts.map((e) => b + e), ...exts.map((e) => path.join(b, "index" + e))]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (/\.(tsx?|mjs|jsx?)$/.test(p) && !/\.test\./.test(p)) out.push(p); } return out; };

test("client/route graph guard: no page, layout, route or client module reaches the line-graphics modules, scripts/ or playwright", () => {
  const all = walk(SRC);
  const roots = all.filter((f) => (f.startsWith(path.join(SRC, "app") + path.sep) && /(^|\/)(page|layout|route|not-found|template|default|error|loading)\.(tsx?|mjs|jsx?)$/.test(f)) || /^\s*["']use client["']/.test(fs.readFileSync(f, "utf8")));
  assert.ok(roots.length > 20);
  const seen = new Set();
  const stack = [...roots];
  const forbidden = [];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    if (/nba-line-graphics-export\.mjs$/.test(f) || f.startsWith(path.join(APP, "scripts") + path.sep)) forbidden.push(path.relative(APP, f));
    for (const m of strip(fs.readFileSync(f, "utf8")).matchAll(IMPORT_RE)) {
      if (m[1] === "playwright" || m[1].startsWith("playwright/") || m[1] === "@playwright/test") forbidden.push(`${path.relative(APP, f)} imports ${m[1]}`);
      const r = resolveSpec(f, m[1]);
      if (r) stack.push(r);
    }
  }
  assert.deepEqual(forbidden, []);
  // and no non-test source module imports the edition at all (only scripts/ and tests do)
  const importers = all.filter((f) => /nba-line-graphics-export|nba-line-cards|render-nba-line-graphics/.test(strip(fs.readFileSync(f, "utf8"))) && !f.endsWith("nba-line-graphics-export.mjs"));
  assert.deepEqual(importers.map((f) => path.relative(APP, f)), []);
});
