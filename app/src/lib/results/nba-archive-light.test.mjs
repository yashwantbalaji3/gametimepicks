/**
 * Release owner 2026-10-24 — a lighter /results/nba archive, nothing hidden.
 *   B: every archived game of the newest date is one summary row on /results/nba, linking to its card on the day page,
 *      built by the SAME builder (lib/results/nba-archive-games.ts) so the counts and the rows cannot disagree.
 *   A: the graded-row table's repeated utility classes live once in CSS, with Tailwind's exact values.
 * The built pages are checked across every archive date in results-trace-built.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { nbaArchiveGames, nbaArchiveGameAnchor } = await import("./nba-archive-games.ts");
const { getAvailableSettlementDates, getSettlementForDate } = await import("../settlement-data.ts");
const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("🔴 every archived row lands in exactly one game, for every archive date; counts are the cards' own", () => {
  const dates = getAvailableSettlementDates();
  assert.ok(dates.length >= 16, "the May–June archive");
  let rows = 0;
  for (const d of dates) {
    const { rows: rs } = getSettlementForDate(d);
    const games = nbaArchiveGames(rs, d);
    assert.equal(games.reduce((n, g) => n + g.rows.length, 0), rs.length, `${d}: no row dropped or duplicated`);
    assert.equal(new Set(games.map((g) => g.gameId)).size, games.length);
    for (const g of games) {
      assert.equal(g.decisive, g.wins + g.losses);
      assert.equal(g.rows.filter((r) => r.outcome === "Win").length, g.wins);
      assert.equal(g.rows.filter((r) => r.outcome === "Loss").length, g.losses);
    }
    rows += rs.length;
  }
  assert.ok(rows > 4000);
  assert.equal(nbaArchiveGameAnchor("0042500206"), "nba-game-0042500206");
  const labelled = nbaArchiveGames([{ gameId: "9", team: "SA", opponent: "NY", result: "win" }], "2026-06-13", { 9: "NY @ SA" });
  assert.equal(labelled[0].matchup, "NY @ SA", "the board's away @ home wins over the row's own team/opponent");
});

test("🔴 /results/nba renders summary rows linking to the day-page cards; both read one builder", () => {
  const nba = src("src/app/results/nba/page.tsx");
  assert.doesNotMatch(nba, /<SettledGameDetail|Full per-game audit table/, "no inline copy of every player row");
  assert.match(nba, /nbaArchiveGames\(latest\.rows, latest\.date, gameLabelMap\)/);
  assert.match(nba, /href=\{`\$\{dayHref\}#\$\{nbaArchiveGameAnchor\(g\.gameId\)\}`\}/);
  const day = src("src/app/results/date/[date]/page.tsx");
  assert.match(day, /const games = nbaArchiveGames\(rows, date, labelFor\)/);
  assert.match(day, /id=\{nbaArchiveGameAnchor\(g\.gameId\)\}/);
});

test("🔴 A: the graded-row cells carry no repeated utility classes; CSS holds Tailwind's exact values once", () => {
  const c = src("src/components/settled-game-detail.tsx");
  assert.doesNotMatch(c, /px-3 sm:px-4 py-2|ml-2 sgd-odds/);
  const css = src("src/app/globals.css");
  assert.match(css, /\.sgd-th \{[^}]*padding: 0\.5rem 0\.75rem; \}/, "th: py-2 / px-3");
  assert.match(css, /\.sgd-td \{[^}]*padding: 0\.5rem 0\.75rem; \}/, "td: py-2 / px-3");
  assert.match(css, /@media \(min-width: 640px\) \{ \.sgd-th, \.sgd-td \{ padding-left: 1rem; padding-right: 1rem; \} \}/, "sm:px-4 at Tailwind's default sm");
  assert.match(css, /\.sgd-odds \{[^}]*margin-left: 0\.5rem;/, "ml-2");
  const tw = src("tailwind.config.ts");
  assert.doesNotMatch(tw, /screens\s*:/, "the default 640px sm breakpoint is the one the CSS mirrors");
});
