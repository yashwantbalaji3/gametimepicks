/**
 * P0 U2 · CURRENT PERFORMANCE FIRST, ONE RECORD PER PRODUCT. Run: npx tsx --test src/lib/results/product-record-scopes.test.mjs
 *
 * Production 10-28: /mr-dub led with "$14,065.40 · 139.65× on 99 settled bets · $100 on Jun 9" and /bank-builder with
 * "Peak paper bankroll $20,465.40" while the current era is 28–38 and down $5,000; Bank Builder read 47–52 or 28–38
 * and Moonshot 7–48 or 0–7, under the same words. Every number was true — they measure different populations.
 * This pins (1) what each scope measures, on committed data, by relation; (2) that the heroes lead with the current
 * era and the June figures sit under History; (3) that every page prints a product record through the shared reader.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { currentProductRecord, RECORD_SCOPE_LABEL, recordWindowText, scopedRecordText } from "./current-record.ts";
import { productHistoryRecords } from "./product-history.ts";
import { loadResultsProjection } from "./projection.ts";
import { corePaperSettledThrough } from "./settled-through.mjs";
import { currentEraMoney, loadCurrentEraMoney } from "../mr-dub/current-era-money.ts";
import { buildFlagship, moonshotInCore } from "../mr-dub/flagship.ts";
import { PROTECTED_BASE } from "../mr-dub/protected-fold.mjs";

const APP = process.cwd();
const DATA = path.join(APP, "public", "data");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));
const code = (rel) => fs.readFileSync(path.join(APP, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const between = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i + a.length); assert.ok(i >= 0 && j > i, `${a} … ${b}`); return s.slice(i, j); };

/* ── (1) what each scope measures, on committed data ────────────────────────────────────────────────────────── */

test("Bank Builder: current era = the Rule S fold; all-time = portfolio.record = July base + current era", () => {
  const portfolio = readJson("mr-dub/portfolio.json");
  const r = currentProductRecord("bank-builder");
  const fold = portfolio.protectedFold.days.reduce((a, d) => ({ won: a.won + (d.bankBuilder?.won ?? 0), lost: a.lost + (d.bankBuilder?.lost ?? 0) }), { won: 0, lost: 0 });
  assert.deepEqual({ won: r.currentEra.won, lost: r.currentEra.lost }, fold, "current era = Σ fold days");
  assert.equal(r.currentEra.from, portfolio.protectedFold.days[0].date, "the era starts at the first folded day");
  assert.equal(r.currentEra.to, corePaperSettledThrough(loadResultsProjection()), "and ends on the ledger's settled-through day (U1)");
  assert.deepEqual({ won: r.allTime.won, lost: r.allTime.lost }, { won: portfolio.record.wins, lost: portfolio.record.losses }, "all-time = portfolio.record");
  assert.equal(r.allTime.won, PROTECTED_BASE.record.wins + r.currentEra.won, "all-time = July base + current era (wins)");
  assert.equal(r.allTime.lost, PROTECTED_BASE.record.losses + r.currentEra.lost, "…(losses)");
  assert.equal(r.recordLabel, r.allTime.recordLabel, "the projection headline is the all-time figure…");
  assert.equal(r.scope, "all-time", "…and the reader says so, so no page can print it as current");
  assert.ok(r.currentEra.recordLabel !== r.allTime.recordLabel || r.allTime.won === r.currentEra.won, "two different numbers on committed data");
});

test("Moonshot: current era = portfolio.moonshot.record = the fold's Moonshot lanes; June lane only under History; no all-time", () => {
  const portfolio = readJson("mr-dub/portfolio.json");
  const r = currentProductRecord("moonshot");
  assert.deepEqual({ won: r.currentEra.won, lost: r.currentEra.lost }, { won: portfolio.moonshot.record.wins, lost: portfolio.moonshot.record.losses });
  const inCore = moonshotInCore(portfolio);
  assert.deepEqual({ won: r.currentEra.won, lost: r.currentEra.lost }, { won: inCore.won, lost: inCore.lost }, "the lanes the bankroll paid for");
  assert.equal(r.allTime, null, "Moonshot's eras are different products — never summed into an all-time figure");
  const history = productHistoryRecords("moonshot");
  const ledger = readJson("product-ledger/moonshot.json");
  const rows = Array.isArray(ledger) ? ledger : (ledger.results ?? ledger.rows ?? []);
  const june = history.find((h) => h.scopeLabel === "June single-card lane");
  assert.ok(june, "the June lane is kept, as history");
  assert.ok(rows.length > 0, "the June ledger has rows");
  assert.equal(june.lost, rows.filter((x) => /^los[ts]$/i.test(String(x.outcome ?? x.result ?? ""))).length, "0–7 counted from the June ledger");
  for (const h of history) assert.notEqual(h.scopeLabel, RECORD_SCOPE_LABEL["current-era"]);
});

test("one label, one number: scope words are distinct, and a history name never reuses a current scope word", () => {
  const words = Object.values(RECORD_SCOPE_LABEL);
  assert.equal(new Set(words).size, words.length);
  for (const product of ["bank-builder", "moonshot"]) {
    for (const h of productHistoryRecords(product)) {
      assert.ok(![RECORD_SCOPE_LABEL["current-era"], RECORD_SCOPE_LABEL["all-time"]].includes(h.scopeLabel), `${product} history "${h.scopeLabel}"`);
      assert.ok(h.from && h.to, "a legacy figure is shown only with its exact dates (C3)");
    }
  }
  const bb = currentProductRecord("bank-builder");
  assert.match(scopedRecordText(bb.currentEra), /^Current era \d+–\d+ · \w+ \d+ – \w+ \d+, \d{4}$/);
  assert.match(scopedRecordText(bb.allTime, { product: "Bank Builder" }), /^Bank Builder · all-time \d+–\d+ · /);
  assert.equal(recordWindowText({ from: "2026-06-09", to: "2026-10-26" }), "Jun 9 – Oct 26, 2026");
});

test("current-era money reconciles to the cent, or there is no figure", () => {
  const m = loadCurrentEraMoney();
  const p = readJson("mr-dub/portfolio.json");
  assert.ok(m, "committed data reconciles");
  assert.equal(m.bankroll, p.currentBankroll);
  assert.equal(Math.round((m.startBankroll + m.pl) * 100), Math.round(m.bankroll * 100));
  assert.equal(currentEraMoney({ currentBankroll: 100, protectedFold: { base: { currentBankroll: 200 }, bankrollDelta: -50 } }), null, "200 − 50 ≠ 100 → nothing shown");
  assert.equal(currentEraMoney({ currentBankroll: 100, protectedFold: null }), null);
  assert.deepEqual(currentEraMoney({ currentBankroll: 150, protectedFold: { base: { currentBankroll: 200 }, bankrollDelta: -50 } }), { startBankroll: 200, bankroll: 150, pl: -50 });
});

test("/mr-dub's KPI record equals the shared all-time definition (the History panel prints it)", () => {
  const f = buildFlagship(DATA, new Date().toISOString(), "2026-10-27");
  const all = currentProductRecord("bank-builder").allTime;
  assert.deepEqual(f.kpis.record, { wins: all.won, losses: all.lost });
});

/* ── (2) the heroes lead with the current era; June figures live under History ──────────────────────────────── */

test("/mr-dub hero: current era only; the June/all-time figures render in a History section, not deleted", () => {
  const dash = code("src/components/mr-dub/flagship/flagship-dashboard.tsx");
  const hero = between(dash, "export function ExecutiveDashboard", "export function HistoryPanel");
  assert.match(hero, /era\.bankBuilder\.currentEra/, "leads with the current-era record");
  assert.match(hero, /era\.money/, "and the current era's P/L");
  for (const june of [/kpis\.peak/, /kpis\.roiMultiple/, /kpis\.startingDate/, /kpis\.profit/, /kpis\.record/, /largestWinDay/, /kpis\.winRate/]) {
    assert.doesNotMatch(hero, june, `the hero must not lead with ${june}`);
  }
  const history = dash.slice(dash.indexOf("export function HistoryPanel"));
  for (const kept of [/kpis\.peak/, /kpis\.roiMultiple/, /kpis\.startingDate/, /kpis\.profit/, /largestWinDay/, /longestWinStreak/]) {
    assert.match(history, kept, `History keeps ${kept}`);
  }
  const page = code("src/app/mr-dub/page.tsx");
  const order = ["<ExecutiveDashboard", 'aria-label="History"', "<AchievementBanner", "<HistoryPanel", "The $100 → $10K ladders"].map((s) => page.indexOf(s));
  assert.ok(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), "hero → History (completed ladders + all-time panel) → ladder journey");
  assert.match(page, /eyebrow="History"/, "the section is labelled History");
});

test("/bank-builder hero: current-era record and P/L; the peak and all-time record only in its History block", () => {
  const hero = code("src/components/bank-builder/climb-hero.tsx");
  const now = between(hero, "Where the ladder stands now", 'aria-label="History"');
  assert.doesNotMatch(now, /peakBankroll|Peak paper bankroll/, "no June peak in the current hero");
  assert.doesNotMatch(now, /Record \{dash\(recordLabel\)\}/, "no unlabelled all-time record in the current hero");
  assert.match(now, /currentEraText/, "the current-era record leads");
  assert.match(now, /currentEraPl/, "with its settled P/L");
  const history = hero.slice(hero.indexOf('aria-label="History"'));
  assert.match(history, /peakBankroll/, "the peak is kept, under History");
  assert.match(history, /allTimeText/, "with the all-time record");
  const page = code("src/app/bank-builder/page.tsx");
  assert.match(page, /currentEraText=\{scopedRecordText\(officialRecord\.currentEra\)\}/);
  assert.match(page, /allTimeText=\{scopedRecordText\(officialRecord\.allTime\)\}/);
  assert.match(page, /scopeLabel=\{officialRecord\.scope \? RECORD_SCOPE_LABEL\[officialRecord\.scope\]/, "the composition names its scope");
  assert.match(code("src/app/moonshot/page.tsx"), /<RecordComposition product="moonshot"[^>]*scopeLabel=\{RECORD_SCOPE_LABEL\["current-era"\]\}/, "…on /moonshot too");
});

/* ── (3) every page prints a product record through the shared reader ───────────────────────────────────────── */

const RECORD_SURFACES = [
  "src/app/page.tsx", "src/app/today/page.tsx", "src/app/bank-builder/page.tsx", "src/app/mr-dub/page.tsx",
  "src/app/moonshot/page.tsx", "src/app/results/page.tsx", "src/components/results/trust-center.tsx",
  "src/components/mr-dub/flagship/flagship-dashboard.tsx", "src/components/bank-builder/climb-hero.tsx",
  "src/components/home/recent-results-strip.tsx", "src/components/bank-builder/record-composition.tsx",
];
const OWN_RECORD = [
  [/displayRecord\.(wins|losses)|displayRecord\?\.label|legacyRecord\.label/, "formats Moonshot from the state module, not the shared reader"],
  [/money\.record\.(wins|losses)|kpis\.record\.(wins|losses)/, "formats a record from raw owner fields"],
  [/["`]Settled record \$\{|["`]Official record["`]|>Record \{|Record \{dash\(recordLabel\)\}/, "prints a record under an unscoped name"],
  [/products · each its own record, all time/i, "heads mixed scopes as 'all time'"],
];

test("no product-record surface formats a record itself or prints one under an unscoped name", () => {
  for (const rel of RECORD_SURFACES) {
    const src = code(rel);
    for (const [re, what] of OWN_RECORD) assert.doesNotMatch(src, re, `${rel} ${what}`);
  }
  for (const rel of ["src/app/page.tsx", "src/app/today/page.tsx", "src/app/bank-builder/page.tsx", "src/app/mr-dub/page.tsx", "src/app/moonshot/page.tsx", "src/app/results/page.tsx", "src/lib/results-trust-center.ts"]) {
    assert.match(code(rel), /currentProductRecord\(/, `${rel} asks the shared reader`);
  }
  const overview = code("src/components/results/results-overview.tsx");
  assert.match(overview, /Products · each its own record, current era first/);
  assert.match(overview, /x\.scopeLabel/, "each product figure carries its scope label");
});
