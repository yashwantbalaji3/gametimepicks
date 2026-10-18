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
  assert.match(s, /className="gtp-stat-tile px-2 sm:px-3 py-3 flex flex-col gap-0\.5 min-w-0"/);
  assert.match(s, /className="mt-6 grid grid-cols-1 min-\[375px\]:grid-cols-3 gap-2\.5/, "the tiles stack below 375 px");
  assert.match(s, /className="font-mono uppercase tracking-normal sm:tracking-\[0\.16em\]"[\s\S]{0,240}overflowWrap: "anywhere"/);
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

test("UXR1-11 (DS-001 §9): the board status banner's summary wraps below the eyebrow instead of being squeezed to one word a line", () => {
  const s = src("src/components/board-date-status-banner.tsx");
  assert.match(s, /className="min-w-0 text-\[12px\] leading-snug"\s*style=\{\{ color: "var\(--vault-text-mute\)", flex: "1 1 12rem" \}\}/);
  assert.match(s, /flex flex-wrap items-center gap-x-4 gap-y-2/, "the banner row still wraps");
});

test("UXR1-06 (cont.): the MLB lean card's LINE / PROJECTION / EDGE labels stay inside their tiles at 320 px", () => {
  const s = src("src/components/mlb/mlb-lean-row.tsx");
  assert.match(s, /<div className="grid grid-cols-1 min-\[375px\]:grid-cols-3 gap-2">/, "the trio stacks below 375 px");
  assert.match(s, /className="rounded-\[5px\] flex flex-row items-baseline justify-between[^"]*min-\[375px\]:flex-col[^"]*min-w-0"/);
  assert.match(s, /className="font-mono uppercase tracking-normal sm:tracking-\[0\.14em\]"\s*style=\{\{ color: labelColor, fontSize: 10, overflowWrap: "anywhere" \}\}/);
});

test("UXR1-13 (GTP-13, DS-001 §9): the /results Window tabs name the panel they control, via the shared roving-tabs model", () => {
  const s = src("src/components/results/results-overview.tsx");
  assert.match(s, /const windowTabs = useRovingTabs<WindowKey>\(/, "the shared hook drives the tablist");
  assert.match(s, /<button key=\{x\.key\} \{\.\.\.windowTabs\.tabProps\(x\.key\)\}\n/, "tab props are used as the hook returns them");
  assert.doesNotMatch(s, /aria-controls=\{undefined\}/, "no tab drops its aria-controls");
  // One panel, named by the selected tab (the MLB game report / live-sport-tabs shape); the windowed records sit in it.
  assert.equal((s.match(/\{\.\.\.windowTabs\.panelProps\(w\)\}/g) ?? []).length, 1);
  const panel = s.slice(s.indexOf("{...windowTabs.panelProps(w)}"));
  assert.ok(panel.indexOf("Public forecasts") > 0 && panel.indexOf("Public forecasts") < panel.indexOf("Day by day"), "the public window records are inside the panel");
  assert.ok(panel.indexOf("<PopulationCard key={p.id} p={p} w={w}") < panel.indexOf("Day by day"));
});

test("UXR1-14 (DS-001 §1.4, §5): an archived game page speaks in the past tense and shows registry crests, never guessed ones", async () => {
  const s = src("src/components/game/game-detail-page.tsx");
  assert.match(s, /const gameIsPast = !!detail\.date && detail\.date < currentEtDate\(\);/, "tense keys off the game's ET date");
  // Every "yet" empty state on the page has a past-tense twin chosen by the game date.
  const code = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // reader text only, not comments
  const yets = code.match(/"[^"\n]*\byet\b[^"\n]*"/g) ?? [];
  assert.ok(yets.length >= 4, "POSITIVE CONTROL — the upcoming-game wording is still here");
  for (const y of yets) {
    // "no independent model edge yet" is about the MODEL's coverage of a market, not about this game happening.
    if (/no independent model edge yet/.test(y)) continue;
    const at = code.indexOf(y);
    assert.match(code.slice(Math.max(0, at - 400), at), /gameIsPast\s*\?/, `${y} is chosen by gameIsPast`);
  }
  assert.match(s, /gameIsPast \? "No team projection was posted for this fixture\." : "No team projection posted for this fixture yet\."/);
  // Crests follow the "away @ home" title.
  assert.match(s, /detail\.title\.includes\(" @ "\) \? \(\s*<span[^>]*aria-label=\{`\$\{detail\.awayTeam\} at \$\{detail\.homeTeam\}`\}>\s*<TeamMark name=\{detail\.awayTeam\}/);

  // NBA crests come from the ESPN NBA team registry (the /nba hub's source) — 30 teams, nothing invented.
  const { espnNbaCrestUrl, ESPN_NBA_TEAMS } = await import("../sports/nba/roster-contract.mjs");
  assert.equal(espnNbaCrestUrl("NY"), "https://a.espncdn.com/i/teamlogos/nba/500/ny.png");
  assert.equal(espnNbaCrestUrl("sa"), "https://a.espncdn.com/i/teamlogos/nba/500/sa.png");
  assert.equal(espnNbaCrestUrl("NYK"), null, "a non-registry abbreviation gets no URL (the monogram fallback draws)");
  assert.equal(espnNbaCrestUrl(null), null);
  assert.equal(ESPN_NBA_TEAMS.filter((t) => espnNbaCrestUrl(t.espnAbbr)).length, 30);
  const gd = src("src/lib/game-detail.ts");
  assert.match(gd, /homeLogo: sport === "mlb" \? mlbTeamLogoUrl\(g\.homeTeamId\) : espnNbaCrestUrl\(g\.homeTeamAbbr\),/);
  assert.match(gd, /awayLogo: sport === "mlb" \? mlbTeamLogoUrl\(g\.awayTeamId\) : espnNbaCrestUrl\(g\.awayTeamAbbr\),/);
});

test("UXR1-15 (DS-001 §9): the hub strip clears its highlight at the top of the page instead of keeping the last-visited section", async () => {
  const { currentHubSection } = await import("../sports/hub-sections.ts");
  const band = [160, 280]; // 20%–35% of an 800 px viewport
  const at = (offset) => [
    { id: "slate", top: 600 - offset, bottom: 1400 - offset },
    { id: "model", top: 1400 - offset, bottom: 2200 - offset },
    { id: "results", top: 2600 - offset, bottom: 3300 - offset },
  ];
  assert.equal(currentHubSection(at(0), ...band), null, "page top: the hero is in the band, no section is current");
  assert.equal(currentHubSection(at(400), ...band), "slate");
  assert.equal(currentHubSection(at(1300), ...band), "model");
  assert.equal(currentHubSection(at(2300), ...band), "model", "in the gap between sections the previous one stays current");
  assert.equal(currentHubSection(at(2500), ...band), "results");
  assert.equal(currentHubSection(at(3800), ...band), "results", "past the last section");
  // The regression: back at the top after visiting Results — the old observer never cleared, so "results" stuck.
  assert.equal(currentHubSection(at(0), ...band), null);
  assert.equal(currentHubSection([], ...band), null);
  const nav = src("src/components/sports/sport-hub-nav.tsx");
  assert.match(nav, /setCurrent\(currentHubSection\(boxes, window\.innerHeight \* 0\.2, window\.innerHeight \* 0\.35\)\);/);
  // Recomputed on every scroll frame, so a jump that crosses no band edge (Home/End) still updates the strip.
  assert.match(nav, /window\.addEventListener\("scroll", schedule, \{ passive: true \}\);/);
  assert.match(nav, /window\.removeEventListener\("scroll", schedule\);/);
  assert.doesNotMatch(nav, /if \(visible\[0\]\) setCurrent/, "no set-only update");
});

test("UXR1-16 (GTP-12, DS-001 §6): in-body controls the sweep measured under 44 px are 44 px targets", () => {
  // The ONE 44×44 rule (globals.css .gtp-hit-44) and its flex-row link-list form.
  const css = src("src/app/globals.css");
  assert.match(css, /\.gtp-hit-44 \{ display: inline-flex; align-items: center; justify-content: center; min-height: 44px; min-width: 44px; \}/);
  assert.match(css, /\.gtp-hit-44-links a \{ display: inline-flex; align-items: center; min-height: 44px; \}/);

  // MLB: /mlb market chips (25 px) + the same console's search/selects/"Show all"; /mlb/board filter chips and Reset (27 px).
  const pb = src("src/components/mlb/props-board.tsx");
  assert.match(pb, /<button key=\{m\.key\} onClick=\{\(\) => setMarket\(m\.key\)\} className="gtp-hit-44 rounded-full/);
  assert.equal((pb.match(/className="min-h-\[44px\] rounded-\[8px\] px-2 py-1\.5 text-\[11\.5px\]"/g) ?? []).length, 4, "four filter selects");
  assert.match(pb, /className="flex-1 min-w-\[150px\] min-h-\[44px\]/, "search field");
  const fc = src("src/components/mlb/mlb-filter-console.tsx");
  assert.match(fc, /aria-pressed=\{active\}\s*className="gtp-hit-44 font-mono/, "every board filter chip");
  assert.match(fc, /className="gtp-hit-44 font-mono uppercase tracking-\[0\.14em\] rounded-\[3px\] px-2\.5 py-1"/, "Reset");

  // Results: window pills (36 px) on /results and /results/model-audit; model-audit "Open N picks" (18 px); "Show all N wins" (30 px).
  for (const p of ["src/components/results/results-explorer.tsx", "src/components/results/model-results-explorer.tsx"]) {
    const s = src(p);
    assert.doesNotMatch(s, /minHeight: 36/, `${p}: no 36 px pill`);
  }
  const mr = src("src/components/results/model-results-explorer.tsx");
  assert.match(mr, /onClick=\{\(\) => setOpenDate\(openDate === d\.date \? null : d\.date\)\}\s*className="gtp-hit-44"/);
  assert.match(src("src/components/parlay-results-date-section-v2.tsx"), /className="gtp-hit-44 self-start font-mono/);

  // Team pages: recent-games opponents and the player list (21–23 px), the season log's "Game →" (32 px).
  const team = src("src/app/teams/[sport]/[slug]/page.tsx");
  assert.match(team, /<span className="gtp-hit-44-links" style=\{\{ display: "inline-flex"[^}]*\}\}>\s*<ResultBadge/);
  assert.match(team, /<ul className="gtp-hit-44-links" style=\{\{[^}]*\}\}>\s*\{squad\.map/);
  assert.doesNotMatch(src("src/components/research-pages/team-season-log.tsx"), /minHeight: 32/);

  // "What the statuses mean →" (15 px) on every model-status panel (/epl, /models, hubs).
  assert.match(src("src/components/command-center/model-status-panel.tsx"), /<Link href="\/methodology\/#model-status" className="gtp-hit-44 font-mono"/);
});
