/**
 * Overnight 10-28 (W5) · "How accurate is GameTimePicks?" — every headline accuracy figure names its sport, its
 * market or record, its timeframe and its sample size; build metadata stays out of the reading path.
 *
 * Rendered from the committed data with the real components (no build needed):
 *   1. /results overview: opens on the season, and every card's record carries sport · record · window · n.
 *   2. /results Trust Center MLB tiles: "MLB player-prop leans", a timeframe, and "decided" beside each rate.
 *   3. /results explorer: the selected figure's eyebrow names record type, sports, tier and period.
 *   4. /results Model suggestions: deployment hashes appear only inside "Technical details".
 *   5. /methodology: the 50.31% / "Behind" panel names MLB player props, the markets, dates and n.
 *   6. /results/mlb and /results/parlays: the H1 is a name, never a rate; each rate carries its window and n.
 *
 * Run: cd app && npx tsx --test src/components/results/results-scope.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const text = (h) => h.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const TODAY = "2026-10-28";

/* ── 1. the overview ─────────────────────────────────────────────────────────────────────────────────────────── */
test("🔴 /results opens on the season window, and every overview record names sport, record, window and n", async () => {
  const page = read("src/app/results/page.tsx");
  const initial = /<ResultsOverview [^>]*initialWindow="(\w+)"/.exec(page)?.[1];
  assert.equal(initial, "season", "the page opens the overview on the season (7 days read 'far too few' on every card)");

  const { resultsV2Populations } = await import("../../lib/results/v2/overview.ts");
  const { default: ResultsOverview } = await import("./results-overview.tsx");
  const SPORT = { mlb: "MLB", nfl: "NFL", epl: "Premier League", ufc: "UFC" };
  const pops = resultsV2Populations(TODAY).map((p) => ({ ...p, sportLabel: SPORT[p.sport], href: "/x/" }));
  assert.ok(pops.length >= 5, "the real populations are read");
  const html = renderToStaticMarkup(React.createElement(ResultsOverview, { populations: pops, products: [], seedToday: TODAY, initialWindow: initial }));
  const raw = html.split("<li class=\"rounded-xl p-4").slice(1).map((c) => c.slice(0, c.indexOf("Every graded row")));
  assert.equal(raw.length, pops.length, "one card per population");
  const popOf = (c) => pops.find((p) => /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(c)?.[1] === p.label);
  const cardFor = (id) => text(raw.find((c) => popOf(c)?.id === id) ?? "");
  let withRate = 0;
  for (const r of raw) {
    const p = popOf(r);
    assert.ok(p, "each card is one known population");
    const c = text(r);
    if (!/\d+–\d+/.test(c)) continue; // a card with nothing graded says so and prints no number
    withRate += 1;
    assert.ok(c.includes(p.sportLabel), `${p.id}: names its sport`);
    assert.ok(c.includes(p.label), `${p.id}: names its record`);
    assert.ok(c.includes(p.seasonLabel), `${p.id}: names its window (${p.seasonLabel})`);
    assert.match(c, /\d[\d.]*% of [\d,]+ decided/, `${p.id}: the rate carries its denominator`);
  }
  assert.ok(withRate >= 5, `non-vacuous: ${withRate} cards carry a record`);
  const nfl = cardFor("nfl-games");
  assert.match(nfl, /historical model-favored accuracy, not published picks/, "the NFL card names both of its bases");
});

test("🔴 /results products: an open-ended record still states when it starts and how many settled", () => {
  const page = read("src/app/results/page.tsx");
  assert.match(page, /pendingLabel: r\.pendingLabel \?\? \(typeof r\.settled === "number" \? `\$\{r\.settled\.toLocaleString\("en-US"\)\} settled` : null\)/);
  assert.match(page, /window: windowOf\(r\.cell as never\) \?\? \(from \? `Since \$\{etDayLabel\(from\) \?\? from\}` : null\)/);
});

/* ── 2. the Trust Center's MLB tiles ─────────────────────────────────────────────────────────────────────────── */
test("🔴 /results Trust Center: every MLB rate names the market, its timeframe and its decided count", async () => {
  const { getTrustCenterModel } = await import("../../lib/results-trust-center.ts");
  const { default: TrustCenter } = await import("./trust-center.tsx");
  const model = getTrustCenterModel();
  assert.ok(model.mlb.daily && model.mlb.lifetime, "non-vacuous: the MLB artifacts exist");
  const html = renderToStaticMarkup(React.createElement(TrustCenter, { model }));
  const block = html.slice(html.indexOf('id="mlb-model-performance"'), html.indexOf("</section>", html.indexOf('id="mlb-model-performance"')));
  const tiles = block.split("data-scope=").slice(1).map(text);
  assert.equal(tiles.length, 2, "two scoped tiles: every settled slate, latest slate");
  for (const t of tiles) {
    assert.match(t, /MLB player-prop leans/, "names the market");
    assert.match(t, /every settled slate through \d{4}-\d{2}-\d{2}|latest slate only · \d{4}-\d{2}-\d{2}/, "names the timeframe");
    assert.match(t, /\d[\d.]*%/, "carries the rate");
    assert.match(t, /[\d,]+ decided/, "and its sample");
  }
  assert.ok(text(tiles[0]).includes(model.mlb.lifetime.decisive.toLocaleString("en-US")), "the every-slate tile leads");
  assert.doesNotMatch(text(block), /Day hit rate|Lifetime hit rate/, "no unscoped tile labels");
});

/* ── 3. the explorer headline ────────────────────────────────────────────────────────────────────────────────── */
test("🔴 /results explorer: the selected figure's eyebrow is the full scope, not just the period", () => {
  const src = read("src/components/results/results-explorer.tsx");
  const decl = src.slice(src.indexOf("const scopeLabel = ["), src.indexOf('].join(" · ");', src.indexOf("const scopeLabel = [")));
  for (const part of ["TYPE_LABEL[recordType]", 'sport === "all" ? "all sports together"', 'tier === "all" ? "all risk tiers"', "rangeLabel"]) assert.ok(decl.includes(part), `scope includes ${part}`);
  assert.match(src, /data-explorer-scope>\s*\{scopeLabel\}/, "the headline eyebrow renders the full scope");
});

/* ── 4. deployment hashes only in Technical details ──────────────────────────────────────────────────────────── */
test("🔴 /results Model suggestions: every deployment stamp is inside Technical details, none on a card", async () => {
  const { levelARecordView } = await import("../../lib/results/nba-level-a-readers.ts");
  const { default: ModelSuggestionsRecord } = await import("./model-suggestions-record.tsx");
  const view = levelARecordView();
  const html = renderToStaticMarkup(React.createElement(ModelSuggestionsRecord, { view }));
  const at = html.indexOf(">Technical details<");
  assert.ok(at > 0, "the section has one Technical details disclosure");
  assert.equal((html.match(/>Technical details</g) ?? []).length, 1, "exactly one");
  const before = html.slice(0, at);
  const after = html.slice(at);
  assert.doesNotMatch(before, /Production deployment|deployment [0-9a-f]{7,}|no deployment stamp/, "no deployment evidence in the reading path");
  const stamped = view.entries.filter((e) => e.source).length;
  assert.ok(stamped > 0, "non-vacuous: the record carries deployment stamps");
  assert.ok((after.match(/Production deployment [0-9a-f]{10}/g) ?? []).length > 0, "the stamps are kept, inside the disclosure");
  /* every listed entry keeps its evidence row */
  const listedIds = [...before.matchAll(/data-entry="([^"]+)"/g)].map((m) => m[1]);
  const evidenceIds = new Set([...after.matchAll(/data-evidence-entry="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(listedIds.length > 0 && listedIds.every((id) => evidenceIds.has(id)), "each listed suggestion has its evidence line");
  /* and nowhere else on /results prints a deployment stamp */
  for (const rel of ["src/app/results/page.tsx", ...fs.readdirSync(path.join(process.cwd(), "src/components/results")).filter((f) => f.endsWith(".tsx")).map((f) => `src/components/results/${f}`)]) {
    const code = read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    assert.doesNotMatch(code, /Production deployment/, `${rel} prints no deployment literal`);
  }
});

/* ── 5. /methodology's comparison panel ──────────────────────────────────────────────────────────────────────── */
test("🔴 /methodology: the 50.31% and 'Behind' figures name MLB player props, the markets, the dates and n", async () => {
  const { loadTerminal, formatRate } = await import("../../lib/research/public-contract-adapter.ts");
  const { default: Panel } = await import("../research/terminal-summary-panel.tsx");
  const t = loadTerminal();
  assert.ok(t.available && t.modelUniverse && t.calibration, "non-vacuous: the research contract exists");
  const h = text(renderToStaticMarkup(React.createElement(Panel, { terminal: t })));
  const rate = formatRate(t.modelUniverse.hitRate);
  const i = h.indexOf(rate);
  assert.ok(i > 0, `the rate ${rate} renders`);
  const around = h.slice(Math.max(0, i - 80), i + 260);
  assert.match(around, /MLB player props · hit rate/, "named MLB player props");
  assert.ok(around.includes(`${t.modelUniverse.decisiveRows.toLocaleString("en-US")} settled MLB player-prop leans`), "with n and market");
  assert.ok(around.includes(`${t.modelUniverse.dateRange[0]} → ${t.modelUniverse.dateRange[1]}`), "with its dates");
  for (const m of ["hits", "total bases", "strikeouts"]) assert.match(around, new RegExp(m, "i"), `names the ${m} market`);
  assert.match(h, /MLB player props · vs the sportsbook (Behind|Even or better)/, "the market comparison is scoped too");
  assert.ok(h.includes(`${t.calibration.heldOutWindow.rows.toLocaleString("en-US")} held-out MLB prop results`), "with its n");
  assert.match(h, /MLB prop markets approved/);
  assert.doesNotMatch(h, /Model history/, "no unscoped label");
});

/* ── 6. sub-page headlines ───────────────────────────────────────────────────────────────────────────────────── */
test("🔴 /results/mlb: the H1 is a name; the every-slate rate leads with its dates and n; the latest slate says it is one", async () => {
  const { latestMlbResultDate, getMlbComparisonReport, getMlbLifetimeSummary } = await import("../../lib/data-mlb-results.ts");
  const { default: Summary } = await import("../mlb/mlb-results-summary.tsx");
  const date = latestMlbResultDate();
  const report = date && getMlbComparisonReport(date);
  const life = getMlbLifetimeSummary();
  assert.ok(report && life, "non-vacuous: the MLB artifacts exist");
  const html = renderToStaticMarkup(React.createElement(Summary, { report }));
  const h1 = text(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "");
  assert.doesNotMatch(h1, /\d%/, `the H1 is not a rate: "${h1}"`);
  const all = text(html.slice(html.indexOf('data-mlb-scope="all-settled"'), html.indexOf('data-mlb-scope="latest-slate"')));
  assert.ok(all.includes(`${life.oldestDate} → ${life.newestDate}`) && all.includes(`${life.decisive.toLocaleString("en-US")} decided`), "every-slate figure: dates and n");
  const latest = text(html.slice(html.indexOf('data-mlb-scope="latest-slate"')));
  assert.match(latest, new RegExp(`Latest slate only · ${report.date}[\\s\\S]*on ${report.decisive} decided`), "one-slate figure: date and n");
  assert.ok(html.indexOf('data-mlb-scope="all-settled"') < html.indexOf('data-mlb-scope="latest-slate"'), "the larger sample leads");
});

test("🔴 /results/parlays: the H1 is a name; the saved-slip rate carries its sports, dates, slates and last graded slate", async () => {
  const { default: Page } = await import("../../app/results/parlays/page.tsx");
  const { getParlaySummary } = await import("../../lib/data-parlays.ts");
  const s = getParlaySummary();
  assert.ok(s?.lifetime?.decisive > 0, "non-vacuous: a graded history exists");
  const html = renderToStaticMarkup(React.createElement(Page));
  const h1 = text(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "");
  assert.doesNotMatch(h1, /\d%/, `the H1 is not a rate: "${h1}"`);
  const scope = text(html.slice(html.indexOf("data-parlays-scope"), html.indexOf("</div>", html.indexOf("data-parlays-last-graded"))));
  const dates = s.byDate.map((d) => d.date).sort();
  assert.match(scope, /MLB/, "names its sport(s)");
  assert.ok(scope.includes(`${dates[0]} → ${dates.at(-1)}`) && scope.includes(`${dates.length} slates`), "its date span and slate count");
  assert.ok(scope.includes(`of ${s.lifetime.decisive.toLocaleString("en-US")} graded slips`), "its n");
  assert.match(scope, /Last graded slate: \d{4}-\d{2}-\d{2}\./, "and when it was last graded");
});
