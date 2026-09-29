/**
 * Results V2 · B-5 — the cross-sport social feed (internal drafts) and Trending (descriptive). Numbers are carried,
 * never recomputed; research is never posted; no partial scorecards; the shared forbidden vocabulary holds;
 * Trending leaves out players who did not play and prints its denominator.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildResultsSocialFeed, NOT_ADVICE } from "./social-feed.mjs";
import { FORBIDDEN_TERMS } from "../../../../scripts/build-mlb-social-content.mjs";

globalThis.React = React;
const REPO_APP = process.cwd();
const { resultsV2Populations } = await import("./overview.ts");
const { latestTrending } = await import("./trending.ts");
const { default: TrendingOnOurBoards } = await import("../../../components/results/trending.tsx");

const rec = (id, label, klass, won, lost, push = 0, v = 0) => ({ id, label, class: klass, won, lost, push, void: v });
const row = (rank, name, state) => ({ rank, name, team: "AAA", projectionLabel: "80", result: { state } });
const input = (boards) => ({
  date: "2031-10-05", dayLabel: "Sun, Oct 5", siteBase: "https://x.test", dayPath: "/results/date/2031-10-05/",
  records: [rec("mlb-games", "MLB game calls", "PUBLIC", 5, 3, 1), rec("nfl-games", "NFL game winners", "PUBLIC", 0, 0), rec("mlb-props", "MLB player-prop leans", "RESEARCH", 40, 38)],
  boards,
});
const settled = { publishedAtLabel: "8:00 AM ET", boards: [
  { propFamily: "player_rush_yds", label: "Rushing yards", rows: [row(1, "A", "INSIDE"), row(2, "B", "OUTSIDE"), row(3, "C", "VOID"), row(4, "D", "INSIDE")] },
  { propFamily: "anytime_td", label: "Anytime touchdown", rows: [row(1, "E", "SCORED"), row(2, "F", "PENDING")] },
] };
const feed = buildResultsSocialFeed(input(settled));
const text = feed.posts.map((p) => p.text).join("\n");

test("🔴 day recap: public records only, each its own, never summed; research never posted; empty records omitted", () => {
  const recap = feed.posts.find((p) => p.kind === "DAY_RECAP");
  assert.match(recap.text, /^Sun, Oct 5 · MLB game calls 5–3–1\. Each record/);
  assert.doesNotMatch(text, /prop leans|40–38/, "a research record is never posted");
  assert.doesNotMatch(recap.text, /NFL game winners/, "a record with nothing graded that day is omitted, not 0–0");
  assert.deepEqual(recap.numbers, { "mlb-games": { won: 5, lost: 3, push: 1, void: 0 } }, "the numbers the text states, carried");
  assert.doesNotMatch(text, /\d%.*overall|combined/i);
});

test("🔴 boards: frozen post always; settled post ONLY when no row is pending; voids stated, never misses", () => {
  assert.ok(feed.posts.some((p) => p.id === "2031-10-05:board:anytime_td"), "the frozen board is draftable before results");
  assert.ok(!feed.posts.some((p) => p.id === "2031-10-05:board-settled:anytime_td"), "one pending row ⇒ no partial scorecard");
  const s = feed.posts.find((p) => p.id === "2031-10-05:board-settled:player_rush_yds");
  assert.match(s.text, /Top 4 Rushing yards, frozen before kickoff: 2 of 3 finished inside the printed range · 1 void \(did not play\)/);
  assert.deepEqual(s.numbers, { good: 2, decided: 3, voids: 1, ungraded: 0 });
});

test("🔴 internal drafts under the pack's contract: not public, drafts only, not advice, shared forbidden vocabulary", () => {
  assert.equal(feed.public, false); assert.equal(feed.draftsOnly, true); assert.equal(feed.notBettingAdvice, true);
  for (const p of feed.posts) assert.ok(p.text.endsWith(NOT_ADVICE) && p.text.includes(p.url), `${p.id}: carries its canonical URL and the not-advice line`);
  for (const term of FORBIDDEN_TERMS) assert.doesNotMatch(text, new RegExp(`\\b${term}\\b`, "i"), `forbidden term "${term}"`);
  const cli = fs.readFileSync(path.join(REPO_APP, "scripts/results/build-results-social-feed.mjs"), "utf8");
  assert.match(cli, /data\/internal\/results\/social/, "written internally, never served");
});

test("deterministic: same inputs, byte-identical output; the builder reads no clock and no randomness", () => {
  assert.equal(JSON.stringify(buildResultsSocialFeed(input(settled))), JSON.stringify(feed));
  const src = fs.readFileSync(path.join(REPO_APP, "src/lib/results/v2/social-feed.mjs"), "utf8").replace(/^\s*(\*|\/\/).*$/gm, "");
  assert.doesNotMatch(src, /Date\.now|new Date\(|Math\.random/);
});

test("🔴 live: the recap for the newest graded day states exactly the overview's own day counts", () => {
  const pops = resultsV2Populations("2099-01-01");
  const newest = pops.filter((p) => p.class === "PUBLIC").flatMap((p) => p.days.map((d) => d.date)).sort().at(-1);
  if (!newest) { console.log("# no graded day on disk — announced vacuous"); return; }
  const records = pops.map((p) => { const d = p.days.find((x) => x.date === newest) ?? { won: 0, lost: 0, push: 0, void: 0 }; return { id: p.id, label: p.label, class: p.class, ...d }; });
  const f = buildResultsSocialFeed({ ...input(null), date: newest, records });
  for (const r of records.filter((x) => x.class === "PUBLIC" && x.won + x.lost + x.push + x.void > 0)) {
    assert.deepEqual(f.posts[0].numbers[r.id], { won: r.won, lost: r.lost, push: r.push, void: r.void });
  }
});

test("🔴 trending: published families only, a void is not a final, denominator printed, labelled descriptive", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-trending-"));
  const p = (name, prop, median, actual, outcome, status = "PUBLISHED") => ({ name, team: "AAA", prop, median, actual, outcome, status });
  fs.mkdirSync(path.join(tmp, "public/data/nfl/reconciliation"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "public/data/nfl/reconciliation/2-04.json"), JSON.stringify({ period: { label: "Week 4" }, games: [
    { providerEventId: "9", matchup: "AAA @ BBB", state: "FINAL", players: [
      p("Hot", "player_rush_yds", 50, 150, "MISS"), p("Cold", "player_rush_yds", 80, 20, "MISS"), p("Out", "player_rush_yds", 80, 0, "VOID"),
      p("Est", "player_rush_yds", 10, 300, "MISS", "ESTIMATE"), p("Mid", "player_rush_yds", 60, 70, "HIT"),
    ] },
    { providerEventId: "10", matchup: "CCC @ DDD", state: "SCHEDULED", players: [] },
  ] }));
  process.chdir(tmp);
  let t;
  try { t = latestTrending(); } finally { process.chdir(REPO_APP); fs.rmSync(tmp, { recursive: true, force: true }); }
  const rush = t.families.find((f) => f.prop === "player_rush_yds");
  assert.equal(rush.graded, 3, "Out (VOID) and Est (ESTIMATE) never enter");
  assert.deepEqual(rush.above.map((r) => [r.name, r.delta]), [["Hot", 100], ["Mid", 10]]);
  assert.deepEqual(rush.below.map((r) => r.name), ["Cold"]);
  assert.equal(rush.above[0].opponent, "BBB");
  const html = renderToStaticMarkup(React.createElement(TrendingOnOurBoards, { trending: t }));
  assert.match(html, /descriptive, not picks/);
  assert.match(html, /Week 4 · 1 of 2 games final/);
  assert.match(html, /of 3 graded/);
  assert.match(html, /Hot <span[^>]*>AAA v BBB · 150 yds vs our 50 \(\+100\)/);
  assert.match(renderToStaticMarkup(React.createElement(TrendingOnOurBoards, { trending: null })), /No NFL week has a final game yet/);
});
