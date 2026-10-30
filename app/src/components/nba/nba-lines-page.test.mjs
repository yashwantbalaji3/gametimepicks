/**
 * /nba/lines/<eventId>/ — one game's FULL model-vs-sportsbook-line table on its own page (page weight 2026-10-30).
 * Through the real build-time readers (no injected display or direction gate), in the two build states:
 *   (a) no artifact (no display key — every CI build): the route's param list is the inert placeholder only (pruned by
 *       scripts/prune-internal-routes.mjs, whose literal is pinned here), no lines href is ever produced, and the game
 *       page section renders nothing;
 *   (b) a SYNTHETIC artifact encrypted under a throwaway test key for a committed lane: the route generates exactly the
 *       games with at least one COMPARED line; every link target (nbaLinesPageHrefFor, nbaPropLinesHref over the listed
 *       ids, the game page section's href) is one of the generated params — no link dangles; the game page section
 *       carries NO per-player row (the compact summary links the lines page); a game whose rows are all "Comparison not
 *       shown" gets no page and keeps its full table on the game page (no record hidden); the lines page itself prints
 *       every row, a back-link and a noindex robots tag.
 * Synthetic only: fake prices on a committed lane; files go to a temp dir; the key is generated here and never written.
 * Run: npx tsx --test src/components/nba/nba-lines-page.test.mjs
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

import { buildNbaLinePublication } from "../../lib/sports/nba/line-publication-build.mjs";
import { NBA_LINES_DIR_ENV } from "../../lib/sports/nba/line-publication.mjs";
import { nbaLinesAad } from "../../lib/sports/nba/public-line-records.mjs";
import { encryptDisplayArtifact, ODDS_DISPLAY_KEY_ENV } from "../../lib/odds/display-crypto.mjs";
import { FAMILY_BUDGET_KB, FLAG_GATED_FAMILIES } from "../../lib/uiux/page-weight-budgets.mjs";
import { nbaGamePageHrefIfExported, nbaLinesPageHref, nbaPropLinesHref } from "./game-page-link.mjs";

const APP = process.cwd();
const { default: NbaPropLines, nbaLinesPageIds, nbaLinesPageHrefFor, NBA_LINES_PLACEHOLDER } = await import("./nba-prop-lines.tsx");
const route = await import("../../app/nba/lines/[eventId]/page.tsx");
const unwrap = (k) => (typeof route[k] === "function" ? route[k] : route.default?.[k]);
const generateStaticParams = unwrap("generateStaticParams");
const generateMetadata = unwrap("generateMetadata");
const Page = typeof route.default === "function" ? route.default : route.default.default;
const { nbaLineSummaryGameLinks } = await import("./prop-line-game-links.ts");
const { currentEtDate } = await import("../../lib/freshness.ts");
const strip = (h) => h.replace(/<!-- -->/g, "");

function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(vars)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
    return fn();
  } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
async function withEnvAsync(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(vars)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

// ── a synthetic artifact for a committed lane ──────────────────────────────────────────────────────────────────────
const DATE = "2026-10-27";
const LANE_BYTES = fs.readFileSync(path.join(APP, `public/data/nba/experimental-public/${DATE}.json`));
const LANE = JSON.parse(LANE_BYTES.toString("utf8"));
const [g0, g1] = LANE.games;
const ID0 = String(g0.providerEventId), ID1 = String(g1.providerEventId);
const tipOf = (g) => Date.parse(g.tipUtc);
const AS_OF = new Date(tipOf(g0) - 1800_000).toISOString();
const RECEIPT = [
  "Scope: NBA player props only, `basketball_nba`. (TEST FIXTURE)",
  "Prop markets authorized: `player_points`, `player_rebounds`, `player_assists`, `player_threes`",
  "Effective cumulative ceiling: 40 credits",
  "| Expiry | the 40-credit ceiling |",
  "Do not retry blindly.",
  "Output: publication on the site once display is authorized.",
  "Approved by: fixture-founder 2099-01-01",
].join("\n");
const rec = (g, p, family, marketKey, line) => ({
  schema: "gtp.nba.prop-price@1", provider: "the-odds-api", eventId: String(g.providerEventId), providerAthleteId: String(p.providerAthleteId), family,
  providerMarketKey: marketKey, line, book: "draftkings", overAmerican: -111, underAmerican: -111,
  capturedAt: new Date(tipOf(g) - 3600_000).toISOString(), fetchedAt: new Date(tipOf(g) - 3600_000).toISOString(),
});
const med = (p, f) => p.medians?.[f];
// g0: two qualified families (compared) + one threePm (withheld). g1: threePm only (every row withheld → no compared line).
const RECORDS = [
  rec(g0, g0.players.home[0], "pts", "player_points", Math.max(0.5, Math.floor(med(g0.players.home[0], "pts")) - 5.5)),
  rec(g0, g0.players.away[0], "reb", "player_rebounds", Math.ceil(med(g0.players.away[0], "reb")) + 5.5),
  rec(g0, g0.players.home[1], "threePm", "player_threes", 0.5),
  rec(g1, g1.players.home[0], "threePm", "player_threes", 0.5),
];

function artifactDir(key) {
  const res = buildNbaLinePublication({ lane: LANE, laneSha256: crypto.createHash("sha256").update(LANE_BYTES).digest("hex"), priceRecords: RECORDS, asOf: AS_OF, receiptText: RECEIPT, receiptRel: "docs/receipts/FIXTURE.md" });
  assert.equal(res.ok, true, `the committed record authorizes the exporter: ${(res.reasons ?? []).join("; ")}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nba-lines-page-"));
  fs.writeFileSync(path.join(dir, `${DATE}.json.enc`), encryptDisplayArtifact(res.text, key, nbaLinesAad(DATE)));
  return dir;
}
const KEY = crypto.randomBytes(32);
const DIR = artifactDir(KEY);
const EMPTY = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-nba-lines-empty-"));
const KEYED = { [NBA_LINES_DIR_ENV]: DIR, [ODDS_DISPLAY_KEY_ENV]: KEY.toString("hex") };
const KEYLESS = { [NBA_LINES_DIR_ENV]: DIR, [ODDS_DISPLAY_KEY_ENV]: null };
test.after(() => { for (const d of [DIR, EMPTY]) fs.rmSync(d, { recursive: true, force: true }); });

test("(a) no key / another key / no file: the route lists only the inert placeholder, no lines href exists, the game page section is empty", () => {
  for (const [name, env] of [["no key", KEYLESS], ["another key", { ...KEYED, [ODDS_DISPLAY_KEY_ENV]: crypto.randomBytes(32).toString("hex") }], ["no file", { ...KEYED, [NBA_LINES_DIR_ENV]: EMPTY }]]) {
    withEnv(env, () => {
      assert.deepEqual(generateStaticParams(), [{ eventId: NBA_LINES_PLACEHOLDER }], name);
      assert.deepEqual(nbaLinesPageIds(), [], name);
      for (const g of LANE.games) assert.equal(nbaLinesPageHrefFor(String(g.providerEventId)), null, name);
      assert.equal(renderToStaticMarkup(React.createElement(NbaPropLines, { eventId: ID0, id: "nba-game-prop-lines", linesPage: true })), "", `${name}: game page section`);
    });
  }
  // the switch off reads nothing and lists nothing
  let read = 0;
  assert.deepEqual(nbaLinesPageIds({ display: { public: false }, lanes: [LANE], recordsOf: () => { read++; return RECORDS; } }), []);
  assert.equal(read, 0);
  assert.equal(nbaLinesPageHrefFor(ID0, AS_OF, { public: false }), null);
});

test("(a) the placeholder is never a real page: its render 404s, and the prune step deletes it (literal pinned to the constant)", async () => {
  await assert.rejects(Promise.resolve().then(() => Page({ params: { eventId: NBA_LINES_PLACEHOLDER } })), /NEXT_NOT_FOUND|not.?found/i);
  const prune = fs.readFileSync(path.join(APP, "scripts/prune-internal-routes.mjs"), "utf8");
  assert.match(prune, new RegExp(`const NBA_LINES_PLACEHOLDER_ROUTE = "nba/lines/${NBA_LINES_PLACEHOLDER}";`));
  assert.match(prune, /\.\.\.NBA_THEATER_ROUTES, NBA_LINES_PLACEHOLDER_ROUTE,/);
  assert.match(prune, /for \(const t of \[lines, path\.join\(chunkRoot, "nba", "lines"\)\]\)/, "an empty out/nba/lines/ goes with its chunks");
  assert.ok(FLAG_GATED_FAMILIES.includes("nba/lines") && FAMILY_BUDGET_KB["nba/lines"] > 0, "a family budget that is skipped when the route is pruned");
  assert.ok(FAMILY_BUDGET_KB["nba/lines"] <= 300, "sized by the rule in page-weight-budgets.mjs; shrink-only");
});

test("(b) authorized artifact: exactly the games with a compared line get a page; every link target is a generated param", () => {
  withEnv(KEYED, () => {
    const params = generateStaticParams().map((p) => p.eventId);
    assert.deepEqual(params, [ID0], "g0 has compared lines; g1 (threePm only, withheld) and the rest have none");
    assert.deepEqual(nbaLinesPageIds(), params, "the links' list is the route's list");
    // (Link drops the trailing slash outside a Next build with trailingSlash: compare paths without it)
    const norm = (h) => h.replace(/\/$/, "");
    const generated = new Set(params.map(nbaLinesPageHref).map(norm));
    const targets = [];
    for (const g of LANE.games) {
      const id = String(g.providerEventId);
      for (const h of [nbaLinesPageHrefFor(id), nbaPropLinesHref(id, nbaLinesPageIds())]) if (h) targets.push(h);
      const section = renderToStaticMarkup(React.createElement(NbaPropLines, { eventId: id, id: "nba-game-prop-lines", linesPage: true }));
      for (const m of section.matchAll(/href="([^"]+)"/g)) targets.push(m[1]);
    }
    assert.ok(targets.length >= 3, "the check saw links");
    for (const t of targets) assert.ok(generated.has(norm(t)), `${t} is a generated /nba/lines/ page`);
  });
});

test("(b) the game page section: a compact summary linking the lines page, NO per-player comparison row", () => {
  withEnv(KEYED, () => {
    const html = strip(renderToStaticMarkup(React.createElement(NbaPropLines, { eventId: ID0, id: "nba-game-prop-lines", linesPage: true })));
    assert.match(html, /<section id="nba-game-prop-lines"[^>]*data-prop-lines="nba"/);
    assert.match(html, /of \d+ projections have a qualified sportsbook line/, "the coverage line stays");
    assert.match(html, new RegExp(`<p data-prop-line-summary="nba"[\\s\\S]*href="/nba/lines/${ID0}/?"[^>]*>View lines →</a>`));
    assert.doesNotMatch(html, /role="row"|role="table"|data-prop-line="|<style|DraftKings/, "no per-player row, table CSS, book or price on the game page");
    assert.match(html, /data-prop-line-legend/, "the legend stays");
    // the settled page passes its own one-game lane: the same compact section
    const settled = strip(renderToStaticMarkup(React.createElement(NbaPropLines, { lane: { date: DATE, games: [g0] }, eventId: ID0, id: "nba-settled-prop-lines", linesPage: true })));
    assert.match(settled, new RegExp(`href="/nba/lines/${ID0}/?"`));
    assert.doesNotMatch(settled, /role="row"/);
    // a game with rows but no compared line has no lines page: its full table stays on the game page (no record hidden)
    const g1html = renderToStaticMarkup(React.createElement(NbaPropLines, { eventId: ID1, id: "nba-game-prop-lines", linesPage: true }));
    assert.equal((g1html.match(/data-prop-line="DIRECTION_WITHHELD"/g) ?? []).length, 1);
    assert.doesNotMatch(g1html, /href="\/nba\/lines\//);
    // without linesPage (the lines page itself) the table prints every row
    const full = renderToStaticMarkup(React.createElement(NbaPropLines, { eventId: ID0, id: "nba-game-prop-lines" }));
    assert.equal((full.match(/<div role="row" data-prop-line="/g) ?? []).length, 3);
  });
});

test("(b) the lines page: title + noindex, back-link, the full table for that one game", async () => {
  await withEnvAsync(KEYED, async () => {
    const meta = generateMetadata({ params: { eventId: ID0 } });
    assert.deepEqual(meta.robots, { index: false, follow: true });
    assert.equal(meta.alternates.canonical, `/nba/lines/${ID0}/`);
    assert.match(String(meta.title), new RegExp(`^${g0.away.abbr} @ ${g0.home.abbr} · ${DATE} · Model vs\\. sportsbook line`));
    const html = strip(renderToStaticMarkup(await Page({ params: { eventId: ID0 } })));
    assert.match(html, /<h1[^>]*>[^<]+: model vs\. sportsbook line<\/h1>/);
    const pages = (await nbaLineSummaryGameLinks(currentEtDate())).pages;
    const back = nbaGamePageHrefIfExported(ID0, pages) ?? `/nba/projections/${DATE}/`;
    assert.match(html, new RegExp(`<nav aria-label="This game"[^>]*><a class="gtp-backlink" href="${back.replace(/\/$/, "")}/?"`), "back to the game page when built, else that slate's projections page");
    assert.equal((html.match(/<div role="row" data-prop-line="/g) ?? []).length, 3, "every line row of this game");
    assert.match(html, /<div role="table" aria-label="Model vs\. sportsbook line · NBA player props"/, "the table keeps its accessible name");
    assert.equal((html.match(/data-prop-line-side="(OVER|UNDER)"/g) ?? []).length, 2);
    assert.match(html, /Comparison not shown/);
    for (const g of LANE.games.slice(1)) assert.doesNotMatch(html, new RegExp(`"${g.providerEventId}"`), "one game only");
  });
});
