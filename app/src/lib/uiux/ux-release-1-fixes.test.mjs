/**
 * UX Release 1 — defects found by the consolidated browser sweep (2026-10-16, docs/ux/UX_RELEASE_1_TEST_REPORT.md).
 * Each test names its finding (UXR1-xx) and the audit rule it applies. Rendering was verified in Chromium at
 * 320 / 390 / 768 / 1440 px against the static export; these pin the source so the fix cannot quietly revert.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("UXR1-01 (GTP-21/32 follow-up, DS-001 §9): revealing the last row moves focus to the count, never to <body>", () => {
  for (const [p, ref, limit, step, total] of [
    ["src/components/results/results-explorer.tsx", "cardStatusRef", "cardLimit", "CARD_STEP", "selectedCards.length"],
    ["src/components/results/model-results-explorer.tsx", "detailStatusRef", "detailLimit", "DETAIL_STEP", "visibleDetail.length"],
  ]) {
    const s = src(p);
    assert.match(s, new RegExp(`<p ref=\\{${ref}\\} tabIndex=\\{-1\\} role="status" aria-live="polite"`), `${p}: the count is the focus target`);
    assert.match(s, new RegExp(`if \\(${limit} !== ${step} && ${limit} >= ${total.replace(".", "\\.")}\\) ${ref}\\.current\\?\\.focus\\(\\);`), `${p}: focus moves only once everything is shown`);
    // Keyed on the step alone — a filter change (which resets the step) must never pull focus off the filter.
    assert.match(s, new RegExp(`${ref}\\.current\\?\\.focus\\(\\);(?:\\n\\s*//[^\\n]*)*\\n\\s*\\}, \\[${limit}\\]\\);`), `${p}: effect depends on the step only`);
  }
});

test("UXR1-02 (DS-001 §9): every results-day table scrolls inside its own container (no page scroll at 320 px)", () => {
  for (const p of ["src/components/results/results-day.tsx", "src/components/results/suggested-receipts.tsx"]) {
    const s = src(p);
    const tables = (s.match(/<table className="gtp-day-table"/g) ?? []).length;
    const wrapped = (s.match(/<div className="overflow-x-auto">\s*<table className="gtp-day-table"/g) ?? []).length;
    assert.ok(tables > 0, `${p}: POSITIVE CONTROL — the day tables are still here`);
    assert.equal(wrapped, tables, `${p}: ${tables - wrapped} day table(s) without a scroll container`);
  }
});

test("UXR1-03 (DS-001 §9): the MLB line-vs-projection bar fills its row instead of a 9,999 px track clipped to a blank strip", () => {
  const row = src("src/components/mlb/mlb-lean-row.tsx");
  assert.doesNotMatch(row, /width=\{9999\}/, "a 9,999 px track puts the centre tick (the line) ~5,000 px off-screen");
  assert.match(row, /<MlbProjectionGap[\s\S]{0,160}width="100%"/, "the detailed card's bar fills the card");
  assert.match(src("src/components/mlb/mlb-projection-gap.tsx"), /width\?: number \| string;/);
});

test("UXR1-04 (DS-001 §9): the MLB lean card header wraps instead of running the anomaly chip over the identity", () => {
  const row = src("src/components/mlb/mlb-lean-row.tsx");
  assert.match(row, /<div className="flex flex-wrap items-center justify-between gap-3">\s*<div className="flex items-center gap-3 min-w-0" style=\{\{ flex: "1 1 12rem" \}\}>/);
  // The detailed card's confidence/anomaly chip may wrap inside the card; the compact row's chip is unchanged.
  assert.match(row, /padding: "4px 9px",\s*border: `1px solid \$\{meta\.rim\}`,\s*maxWidth: "100%",/);
});

test("UXR1-05 (DS-001 §9): EPL likeliest-scorer rows wrap instead of overlapping the figures at 320 px", () => {
  const s = src("src/app/epl/page.tsx");
  assert.match(s, /<li key=\{`\$\{p\.slug\}-\$\{p\.playerId\}`\} className="flex flex-wrap items-center justify-between/);
  assert.match(s, /<div className="min-w-0 flex items-center gap-2" style=\{\{ flex: "1 1 12rem" \}\}>\s*\{p\.teamName \? <TeamLogo/);
});

test("UXR1-06 (DS-001 §9): hub stat-tile labels are never clipped by the tile at 320 px", () => {
  const s = src("src/components/sport-overview-hero.tsx");
  assert.match(s, /className="gtp-stat-tile px-3 py-3 flex flex-col gap-0\.5 min-w-0"/);
  assert.match(s, /className="font-mono uppercase tracking-\[0\.06em\] sm:tracking-\[0\.16em\]"[\s\S]{0,240}overflowWrap: "anywhere"/);
});

test("UXR1-07 (GTP-27, DS-001 §1.7): source ids and the UFC model fingerprint are not printed as reading matter", async () => {
  const { sourceDisplayName, SOURCE_DISPLAY_NAME, SOURCES } = await import("../sports/source-registry.mjs");
  assert.equal(sourceDisplayName("espn_scoreboard"), "ESPN public scoreboard");
  assert.equal(sourceDisplayName("some_new_feed"), "some new feed", "an unmapped id never prints its underscores");
  assert.equal(sourceDisplayName(null, "ESPN"), "ESPN");
  for (const [id, name] of Object.entries(SOURCE_DISPLAY_NAME)) assert.doesNotMatch(name, /_/, `${id} → ${name}`);
  // Every registry source that may render publicly has a reader name.
  for (const [id, s] of Object.entries(SOURCES)) if (s.authorization === "PUBLIC_DISPLAY") assert.ok(sourceDisplayName(id) && !/_/.test(sourceDisplayName(id)), id);
  // One map: the component no longer keeps its own copy, and the pages read the shared helper.
  assert.doesNotMatch(src("src/components/sports/upcoming-sports.tsx"), /const SOURCE_DISPLAY\b/);
  assert.match(src("src/app/ufc/page.tsx"), /Schedule source: \{sourceDisplayName\(feed\?\.sourceVerdict\?\.sourceId, "ESPN"\)\}/);
  assert.match(src("src/app/epl/page.tsx"), /Source: \{sourceDisplayName\(feed\?\.sourceVerdict\?\.sourceId,/);
  const board = src("src/components/ufc/prediction-board.tsx");
  assert.doesNotMatch(board, /\{board\.modelId \? ` \(\$\{board\.modelId\}\)` : ""\}/, "no fingerprint inside the sentence");
  assert.match(board, /title=\{board\.modelId \? `Model: \$\{board\.modelId\}` : undefined\}/, "provenance kept, one hover away");
});

test("UXR1-08 (GTP-27, DS-001 §1.7): /results/model-audit tables show market and bucket names, keeping the key in a title", () => {
  const s = src("src/app/results/model-audit/page.tsx");
  for (const raw of ["<Td>{m.label}</Td>", "<Td>{r.market}</Td>", "<Td>{r.side}</Td>", "<Td>{r.label}</Td>", '<Td>{r.gameContext?.seasonPhase ?? "—"}</Td>']) {
    assert.ok(!s.includes(raw), `still printed raw: ${raw}`);
  }
  assert.equal((s.match(/<KeyCell k=\{/g) ?? []).length, 5);
  assert.match(s, /<span title=\{k\}>\{label\}<\/span>/, "the exact key stays one hover away");
  // The translation rule itself, re-implemented from the page so a change to it is a visible decision.
  const body = /function readableKey\(k: string\): string \{([\s\S]*?)\n\}/.exec(s)?.[1];
  assert.ok(body, "readableKey exists");
  assert.match(body, /\^\[a-z0-9\]\+\(\?:_\[a-z0-9\]\+\)\+\$/, "only snake_case keys are rewritten");
  assert.match(body, /mlbMarketLabel\(k\)/, "markets read the shared MLB market names");
});

test("UXR1-09 (GTP-12, DS-001 §6): every hub's section-strip link is a 44 px target", () => {
  const s = src("src/components/sports/sport-hub-nav.tsx");
  assert.match(s, /className: "shrink-0 inline-flex items-center rounded-full px-3 no-underline whitespace-nowrap",\s*style: \{\s*minHeight: 44,/);
  assert.doesNotMatch(s, /minHeight: 32/);
});

test("UXR1-10 (DS-001 §2): the three status maps merged in this release agree on every shared word", async () => {
  // #1102 hub chip (hubStatusDisplay), #1103 schedule statuses (EVENT_STATUS_LABEL), and the live lifecycle owner.
  // They translate different input vocabularies, so they stay three functions — but a reader must see one word set.
  const { hubStatusDisplay } = await import("../sport-hub/contract.ts");
  const { EVENT_STATUS_LABEL } = await import("../sports/schedule-contract.mjs");
  const { LIFECYCLE_LABEL } = await import("../live/lifecycle.mjs");
  assert.equal(hubStatusDisplay("scheduled"), EVENT_STATUS_LABEL.SCHEDULED, "pregame: Upcoming on hub cards and schedules");
  assert.equal(hubStatusDisplay("in progress"), EVENT_STATUS_LABEL.LIVE);
  assert.equal(EVENT_STATUS_LABEL.LIVE, LIFECYCLE_LABEL.LIVE, "Live");
  assert.equal(hubStatusDisplay("final"), EVENT_STATUS_LABEL.FINAL);
  assert.equal(EVENT_STATUS_LABEL.FINAL, LIFECYCLE_LABEL.SETTLED, "Final");
  assert.equal(hubStatusDisplay("postponed"), EVENT_STATUS_LABEL.POSTPONED);
  assert.equal(EVENT_STATUS_LABEL.POSTPONED, LIFECYCLE_LABEL.POSTPONED);
  assert.equal(EVENT_STATUS_LABEL.CANCELLED, LIFECYCLE_LABEL.CANCELLED);
  assert.equal(EVENT_STATUS_LABEL.UNKNOWN, LIFECYCLE_LABEL.UNKNOWN);
  // DS-001 §2 lets live surfaces say "Scheduled" + a start time for pregame; nothing else may differ.
  assert.ok(["Upcoming", "Scheduled"].includes(LIFECYCLE_LABEL.PRE));
});

test("UXR1-02 (cont.): /results/date section eyebrows may wrap — a shrink-0 label held the page 11 px wide at 320 px", () => {
  const s = src("src/app/results/date/[date]/page.tsx");
  assert.equal((s.match(/className="font-mono text-\[10px\] uppercase tracking-\[0\.18em\] min-w-0"/g) ?? []).length, 2, "NBA and MLB eyebrows");
  assert.doesNotMatch(s, /uppercase tracking-\[0\.18em\] shrink-0"/);
});
