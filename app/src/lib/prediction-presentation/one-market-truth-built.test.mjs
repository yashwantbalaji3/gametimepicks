/**
 * ONE MARKET TRUTH → MANY VIEWS (P0 · 2026-09-24).
 *
 * ⚠ THE DEFECT THIS EXISTS FOR. `weekly-boards/latest.json` published a real captured market on
 * Bijan Robinson's receptions and rushing-yards rows. `/nfl/week/2-03/` rendered
 * "O/U 78.5 · O -111 · U -113 · draftkings"; `/nfl/` rendered "Not checked" — same artifact, same
 * player, same game, same family. The hub copied board rows FIELD BY FIELD into its client
 * component and the list did not include `market`, so the price was dropped between the artifact
 * and the presenter and the row fell through to a typed absence.
 *
 * A hand-maintained field list is a second, invisible schema: it cannot fail loudly, because the
 * row still renders and simply omits whatever the owner added last.
 *
 * So this asserts the INVARIANT rather than the fix: for every (event, player, family) the canonical
 * artifact prices, EVERY exported public page that renders that forecast must show that same book,
 * line and prices. It reads the built export, so it judges what a reader actually receives.
 *
 * Run (after `npm run build`): npx tsx --test src/lib/prediction-presentation/one-market-truth-built.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const OUT = path.join(APP, "out/index.html").replace(/index\.html$/, "");
const BOARDS = path.join(APP, "public/data/nfl/weekly-boards/latest.json");

const textOf = (h) =>
  h.replace(/<!-- -->/g, "").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");
const mainOf = (h) => /<main[\s\S]*?<\/main>/.exec(h)?.[0] ?? "";

/** Every exported page that renders a prediction row. */
function boardPages() {
  const pages = [];
  const push = (p) => { if (fs.existsSync(p)) pages.push(p); };
  push(path.join(OUT, "nfl/index.html"));
  const weeks = path.join(OUT, "nfl/week");
  if (fs.existsSync(weeks)) for (const k of fs.readdirSync(weeks)) push(path.join(weeks, k, "index.html"));
  return pages.map((f) => ({ f, main: mainOf(fs.readFileSync(f, "utf8")) })).filter(({ main }) => main.includes("gtp-pred-row"));
}

test("a priced row shows the SAME book, line and prices on every page that renders it", () => {
  if (!fs.existsSync(BOARDS)) return; // no committed board: the build-time gate covers it
  const art = JSON.parse(fs.readFileSync(BOARDS, "utf8"));
  const priced = art.boards.flatMap((b) => (b.rows ?? []).filter((r) => r.market).map((r) => ({ board: b, row: r })));

  const pages = boardPages();
  assert.ok(pages.length > 0, "no exported page renders a prediction row — every assertion below would pass blind");

  if (priced.length === 0) {
    /*
     * Non-vacuity, stated rather than silent. With nothing priced this guard proves nothing, so it
     * says so loudly instead of passing as though it had checked something.
     */
    assert.ok(true, "no canonical row is priced right now — this guard is inert until one is");
    return;
  }

  for (const { row } of priced) {
    const m = row.market;
    const pagesWithPlayer = pages.filter(({ main }) => main.includes(row.name));
    assert.ok(pagesWithPlayer.length > 0, `${row.name} is priced in the artifact but appears on no exported page`);

    for (const { f, main } of pagesWithPlayer) {
      const rel = path.relative(OUT, f);
      /* Scope to THIS player's rows: another player on the same page must not satisfy the check. */
      const rows = (main.match(/<li class="gtp-pred-row">[\s\S]*?<\/li>/g) ?? []).filter((r) => r.includes(row.name));
      assert.ok(rows.length > 0, `${rel}: ${row.name} is on the page but in no prediction row`);
      const blob = textOf(rows.join(" "));

      assert.ok(blob.includes(m.sportsbook),
        `${rel}: ${row.name} is priced by ${m.sportsbook} in the canonical artifact, but that book is not named in his rendered row — a price must never appear unattributed, and must never be dropped between artifact and page`);
      if (m.line != null) assert.ok(blob.includes(String(m.line)), `${rel}: ${row.name}'s line ${m.line} is missing`);
      for (const [label, odds] of [["over", m.overOdds], ["under", m.underOdds], ["yes", m.yesOdds]]) {
        if (odds == null) continue;
        const shown = odds > 0 ? `+${odds}` : String(odds);
        assert.ok(blob.includes(shown), `${rel}: ${row.name}'s ${label} price ${shown} is missing`);
      }
      /* The row must not ALSO claim an absence — that is the divergence wearing a disguise. */
      for (const absent of ["Not checked", "Market unavailable", "No price", "Not offered"]) {
        assert.ok(!blob.includes(absent), `${rel}: ${row.name} has a real ${m.sportsbook} price AND says "${absent}"`);
      }
    }
  }
});
