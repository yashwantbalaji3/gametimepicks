/**
 * P0 U1 · ONE "SETTLED THROUGH" TRUTH. Run: npx tsx --test src/lib/results/settled-through-one-truth.test.mjs
 *
 * Production 10-28: the header chip said "Settled · Oct 15" on every page (MLB optimizer index only), /mr-dub said
 * "Settled through Oct 15" (newest day a card settled), /results + /bank-builder "… – Mon, Oct 26" (the fold) — three
 * dates for one 99-bet ledger. (a) pins the owner on committed data by RELATION (the data moves nightly; no literal
 * dates), (b) fails when a listed surface computes its own settled date instead of reading the owner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  corePaperSettledThrough,
  lastCardSettledDate,
  ledgerSettledLine,
  ledgerSettledThrough,
  newestSettledDate,
  siteLatestResultsDate,
  slatesSinceLastCard,
  SETTLED_LABELS,
} from "./settled-through.mjs";
import { corePaperSettlement, siteLatestResults } from "./settled-through-server.ts";
import { loadResultsProjection } from "./projection.ts";
import { getOptimizerSettledDates } from "../parlay-results.ts";
import { buildFlagship } from "../mr-dub/flagship.ts";
import { buildMoneyMovementsView } from "../mr-dub/money-movements-view.ts";

const APP = process.cwd();
const DATA = path.join(APP, "public", "data");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));
const code = (rel) => fs.readFileSync(path.join(APP, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── (a) committed data ─────────────────────────────────────────────────────────────────────────────────────── */

test("(a) the core paper ledger has ONE settled-through date, and every reader of it agrees", () => {
  const projection = loadResultsProjection();
  const portfolio = readJson("mr-dub/portfolio.json");
  const core = corePaperSettlement();
  assert.ok(core.settledThrough, "the committed ledger is settled through some day");
  assert.equal(core.settledThrough, portfolio.protectedFold.foldedThrough, "== the money owner's fold");
  assert.equal(core.settledThrough, corePaperSettledThrough(projection));
  for (const product of ["bank-builder", "moonshot"]) {
    assert.equal(ledgerSettledThrough(projection, product), core.settledThrough, `${product}'s current-era window ends on the same day`);
  }
  const composite = projection.cells.find((c) => c.product === "bank-builder" && c.era === "COMPOSITE");
  assert.equal(composite.window.to, core.settledThrough, "/results + /bank-builder's all-time window ends on the same day");

  const f = buildFlagship(DATA, new Date().toISOString(), core.settledThrough);
  assert.equal(f.todayStatus.lastSettledDate, core.settledThrough, "/mr-dub's settlement status and freshness badge");
  assert.equal(f.kpis.currentDate, core.settledThrough, "/mr-dub's bankroll 'as of'");
  assert.equal(f.todayStatus.settlementStatus, core.line, "/mr-dub prints the owner's line verbatim");
  const mm = buildMoneyMovementsView(DATA, core.settledThrough);
  assert.equal(mm.settledThrough, core.settledThrough, "/mr-dub's money-movements tile");
  assert.equal(mm.foldedThrough, core.settledThrough, "…and the reconciliation it rests on");
});

test("(a) 'last card settled' is a different, named question — never later than settled-through", () => {
  const core = corePaperSettlement();
  const days = readJson("mr-dub/daily-summary.json").days;
  assert.equal(core.lastCardSettled, lastCardSettledDate(days));
  assert.ok(core.lastCardSettled <= core.settledThrough, `${core.lastCardSettled} ≤ ${core.settledThrough}`);
  if (core.lastCardSettled !== core.settledThrough) {
    assert.match(core.line, new RegExp(`^${SETTLED_LABELS.ledger} \\w+ \\d+ · ${SETTLED_LABELS.lastCard} \\w+ \\d+$`), "both dates, each by its name");
  }
});

test("(a) the header chip's site-wide date covers every current record, and is not the optimizer index alone", () => {
  const site = siteLatestResults();
  const optimizer = getOptimizerSettledDates().slice().sort().at(-1) ?? null;
  const core = corePaperSettlement().settledThrough;
  assert.equal(site, siteLatestResultsDate({ projection: loadResultsProjection(), optimizerSettledDates: getOptimizerSettledDates() }));
  assert.ok(site >= core, `site ${site} ≥ paper ledger ${core}`);
  if (optimizer) assert.ok(site >= optimizer, `site ${site} ≥ optimizer ${optimizer}`);
  // The 10-28 defect, as a relation: when the products settle past the optimizer's last decided slate, the chip
  // must say so — "Settled · Oct 15" beside a ledger settled through Oct 26 is exactly what this forbids.
  if (optimizer && core > optimizer) assert.notEqual(site, optimizer, "the chip is not stuck on the optimizer's last card");
});

/* ── the 10-28 shape, as a fixture ──────────────────────────────────────────────────────────────────────────── */

const cell = (o) => ({
  family: "product", era: "RECEIPT_ERA", status: "LIVE", displayEligible: { eligible: true },
  counts: { won: 1, lost: 1 }, window: { from: "2026-08-15", to: "2026-10-26" }, ...o,
});
const SHAPE = { cells: [cell({ product: "bank-builder" }), cell({ product: "moonshot" }), cell({ family: "forecast", era: "LIVE_LEDGER", product: null, sport: "mlb", window: { from: "2026-05-16", to: "2026-10-25" } })] };

test("fixture · fold through Oct 26, last card Oct 15, optimizer index Oct 15 → each surface's date", () => {
  assert.equal(siteLatestResultsDate({ projection: SHAPE, optimizerSettledDates: ["2026-10-15"] }), "2026-10-26", "header chip + Home hero");
  assert.equal(siteLatestResultsDate, newestSettledDate, "one rule, one implementation");
  assert.equal(corePaperSettledThrough(SHAPE), "2026-10-26");
  const days = [{ date: "2026-10-15", events: [{ status: "settled" }] }, { date: "2026-10-12", events: [{ status: "settled" }] }, { date: "2026-10-20", events: [{ status: "open" }] }];
  assert.equal(lastCardSettledDate(days), "2026-10-15", "an open card is not a settled card");
  assert.equal(ledgerSettledLine({ settledThrough: "2026-10-26", lastCardSettled: "2026-10-15" }), "Results settled through Oct 26 · last card settled Oct 15");
  assert.equal(ledgerSettledLine({ settledThrough: "2026-10-26", lastCardSettled: "2026-10-26" }), "Results settled through Oct 26");
  assert.equal(ledgerSettledLine({ settledThrough: null, lastCardSettled: "2026-10-15" }), null, "no settled-through day → no line, never the card date in its place");
});

test("fixture · the core ledger is settled through the EARLIER product window; a missing product answers null", () => {
  const lag = { cells: [cell({ product: "bank-builder" }), cell({ product: "moonshot", window: { from: "2026-08-15", to: "2026-10-24" } })] };
  assert.equal(corePaperSettledThrough(lag), "2026-10-24");
  assert.equal(corePaperSettledThrough({ cells: [cell({ product: "bank-builder" })] }), null);
  const pending = { cells: [cell({ product: "bank-builder", era: "PENDING_SETTLEMENT" }), cell({ product: "moonshot" })] };
  assert.equal(corePaperSettledThrough(pending), null, "a pending cell is never settled-through evidence");
});

test("fixture · slates after the last card: no card generated vs awaiting grading are counted apart", () => {
  const slates = [{ date: "2026-10-15", cards: 50 }, { date: "2026-10-16", cards: 0 }, { date: "2026-10-17", cards: 0 }, { date: "2026-10-18", cards: 3 }];
  assert.deepEqual(slatesSinceLastCard({ lastCardSettled: "2026-10-15", slates }), { noCard: 2, awaiting: 1 });
  assert.deepEqual(slatesSinceLastCard({ lastCardSettled: "2026-10-18", slates }), { noCard: 0, awaiting: 0 });
});

/* ── (b) no surface computes its own settled-through date ───────────────────────────────────────────────────── */

const SURFACES = {
  "src/components/slate-status-bar.tsx": [/siteLatestResults\(\)/, /SETTLED_LABELS\.site/],
  "src/app/page.tsx": [/siteLatestResults\(\)/, /corePaperSettlement\(\)/],
  "src/components/home/landing-hero.tsx": [/SETTLED_LABELS\.site/],
  "src/components/home/recent-results-strip.tsx": [/SETTLED_LABELS\.ledger/],
  "src/components/recap/yesterday-card.tsx": [/SETTLED_LABELS\.lastCard/],
  "src/lib/mr-dub/flagship.ts": [/corePaperSettlement\(root\)/],
  "src/app/mr-dub/page.tsx": [/slateDate=\{f\.todayStatus\.lastSettledDate\}/],
  "src/components/mr-dub/flagship/flagship-dashboard.tsx": [/todayStatus\.settlementStatus/],
  "src/components/mr-dub/money-movements-panel.tsx": [/view\.settledThrough/],
  "src/lib/mr-dub/money-movements-view.ts": [/corePaperSettledThrough\(/],
  "src/app/bank-builder/page.tsx": [/currentProductRecord\("bank-builder"\)/],
  "src/app/moonshot/page.tsx": [/currentProductRecord\("moonshot"\)/],
  "src/app/results/page.tsx": [/SETTLED_LABELS\.lastCard/, /slatesSinceLastCard\(/],
};
/* What "computing its own date" looked like on 10-28, and what it would look like next time. */
const OWN_DATE = [
  [/getOptimizerSettledDates/, "reads the optimizer index for a settled date"],
  [/foldedThrough/, "reads the fold's date directly"],
  [/newestSettledDate\(|siteLatestResultsDate\(/, "re-runs the site rule itself"],
  [/timeline\[0\]\??\.date/, "takes the newest timeline day as a settled date"],
  [/backlog\??\.after/, "takes the backlog's date as a settled date"],
  [/[Ss]ettled through \$?\{|Last settled|· last settled|last settled \$\{/, "spells a settled label by hand"],
];
/* Uses an owner date legitimately for something else — named, so the exception is visible. */
const ALLOWED = {
  "src/app/results/page.tsx": ["reads the optimizer index for a settled date"], // its slate sections ARE the optimizer ledger
  "src/lib/mr-dub/flagship.ts": ["reads the fold's date directly"], // kpis.currentDate; pinned equal to the owner in (a)
  "src/lib/mr-dub/money-movements-view.ts": ["reads the fold's date directly"], // the reconciliation's own input; pinned in (a)
  "src/components/mr-dub/money-movements-panel.tsx": ["reads the fold's date directly"], // carried in the view type only
};

test("(b) every listed surface reads the one owner and computes no settled date of its own", () => {
  for (const [rel, must] of Object.entries(SURFACES)) {
    const src = code(rel);
    for (const re of must) assert.match(src, re, `${rel} reads the owner (${re})`);
    for (const [re, what] of OWN_DATE) {
      if ((ALLOWED[rel] ?? []).includes(what)) continue;
      assert.doesNotMatch(src, re, `${rel} ${what}`);
    }
  }
  // The money-movements panel may carry `foldedThrough` in its type, but never prints it.
  assert.doesNotMatch(code("src/components/mr-dub/money-movements-panel.tsx"), /view\.foldedThrough/, "the panel prints the owner's date, not the fold field");
  // flagship.ts may expose the fold date as kpis.currentDate, but its settlement status is the owner's line.
  assert.doesNotMatch(code("src/lib/mr-dub/flagship.ts"), /Settled through|in progress`/, "no hand-made settlement line in the flagship model");
});

test("(b) the header chip never reads a single ledger's index", () => {
  const bar = code("src/components/slate-status-bar.tsx");
  assert.doesNotMatch(bar, /parlay-results/, "the optimizer module is not the chip's source");
  assert.match(bar, /title="The newest day through which a current official record is settled, across sports and products/, "the chip says what its date covers");
});
