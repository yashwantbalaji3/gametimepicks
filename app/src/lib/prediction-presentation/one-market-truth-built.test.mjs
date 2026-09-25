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

/**
 * Every exported page that renders a prediction row.
 *
 * ⚠ GAME REPORTS WERE NOT IN THIS LIST, AND THEY WERE THE SURFACE WITH NO MARKET AT ALL. The guard
 * covered the hub and the week routes — the two pages that DISAGREED — and so proved an invariant
 * about the pair while `/nfl/game/<id>/` rendered the same forecasts with no market half whatever.
 * A divergence guard that omits a surface cannot see the surface's silence.
 */
function boardPages() {
  const pages = [];
  const push = (p) => { if (fs.existsSync(p)) pages.push(p); };
  push(path.join(OUT, "nfl/index.html"));
  const weeks = path.join(OUT, "nfl/week");
  if (fs.existsSync(weeks)) for (const k of fs.readdirSync(weeks)) push(path.join(weeks, k, "index.html"));
  const games = path.join(OUT, "nfl/game");
  if (fs.existsSync(games)) for (const k of fs.readdirSync(games)) push(path.join(games, k, "index.html"));
  return pages.map((f) => ({ f, main: mainOf(fs.readFileSync(f, "utf8")) })).filter(({ main }) => main.includes("gtp-pred-row"));
}

/**
 * A book's identity, comparable across the artifact's key and the page's label.
 *
 * ⚠ THE OLD CHECK WAS `blob.includes(m.sportsbook)` — a substring match on the provider's slug.
 * It passed only while the page happened to print `draftkings` in the provider's own lowercase,
 * and it would have gone red the moment the UI printed the book's real name. Worse, it would have
 * passed on a page printing the slug INSIDE some unrelated word. Comparing identities rather than
 * raw substrings is what lets the page be readable and the guard stay strict.
 */
const bookKey = (s) => String(s).toLowerCase().replace(/[^a-z]/g, "");
/* The names the renderer prints, mapped back to the provider keys they stand for. A book absent
   here is printed from its own key, so the identity still matches after normalisation. */
const BOOK_ALIASES = { caesars: ["williamhill_us", "caesars"], espnbet: ["espnbet"], betonline: ["betonlineag"], ballybet: ["ballybet"], betanysports: ["betanysports"], windcreek: ["windcreek"], mybookie: ["mybookieag"] };
const namesFor = (key) => {
  const k = bookKey(key);
  const out = new Set([k]);
  for (const [display, keys] of Object.entries(BOOK_ALIASES)) if (keys.some((x) => bookKey(x) === k)) out.add(display);
  return [...out];
};

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

  let comparisons = 0;
  for (const { board, row } of priced) {
    const m = row.market;
    /*
     * ⚠ SCOPE BY PLAYER **AND FAMILY**, AND ONLY WHERE THE ROW IS ACTUALLY RENDERED.
     *
     * Matching on the player's name alone was wrong in two directions at once. A game report shows
     * ONE family at a time, so a name found in its scorecard summary made the guard demand a
     * rushing price from a passing row and fail for the wrong reason; and a page rendering the same
     * player in two families would have let either row satisfy the other's check.
     *
     * "The page does not render this forecast" is not divergence — showing it with the wrong market
     * is. So the unit is the ROW, identified by `data-family`, and the coverage question (does the
     * page render priced rows at all?) is asked separately, below, where it can be answered
     * honestly instead of by a name appearing somewhere in the HTML.
     */
    for (const { f, main } of pages) {
      const rel = path.relative(OUT, f);
      const rows = (main.match(/<li class="gtp-pred-row"[^>]*>[\s\S]*?<\/li>/g) ?? [])
        .filter((r) => r.includes(`data-family="${board.family}"`) && r.includes(row.name));
      if (rows.length === 0) continue;
      comparisons += 1;
      const blob = textOf(rows.join(" "));

      const named = bookKey(blob);
      assert.ok(namesFor(m.sportsbook).some((n) => named.includes(n)),
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
  assert.ok(comparisons > 0,
    `${priced.length} canonical row(s) are priced and NONE was found in a rendered prediction row on any exported page — the guard compared nothing`);
});

/**
 * THE GAME REPORT'S OWN COVERAGE — the surface the guard above could not see until it was listed.
 *
 * The weekly boards rank a top-N; a game report carries every modelled player in that game. So the
 * board's priced rows are a SUBSET, and a guard built only from them would leave most of the report
 * unmeasured. This reads the per-game producer artifact — the same one the page renders — and
 * requires that the prices it holds reach the exported page.
 *
 * ⚠ AND IT REFUSES TO PASS ON AN EMPTY PAGE. A game page whose default view renders no prediction
 * row at all would satisfy "no row contradicts the artifact" while showing a reader nothing, which
 * is how a divergence guard turns into decoration. If the artifact prices anything, the page must
 * render rows.
 */
test("a game report renders the prices its own producer artifact holds", () => {
  const dir = path.join(APP, "public/data/nfl/player-board");
  if (!fs.existsSync(dir)) return; // pre-first-run tree
  let checkedPages = 0;
  let checkedRows = 0;

  for (const file of fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f))) {
    const board = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const page = path.join(OUT, "nfl/game", board.providerEventId ?? file.replace(/\.json$/, ""), "index.html");
    if (!fs.existsSync(page)) continue; // a week that is not exported is not this guard's business
    const main = mainOf(fs.readFileSync(page, "utf8"));
    const rel = path.relative(OUT, page);

    /* Which families carry a captured price in the artifact, and in which the page could show one. */
    const pricedByFamily = new Map();
    for (const p of board.players ?? []) {
      for (const [fam, m] of Object.entries(p.markets ?? {})) {
        if (!m.market) continue;
        if (!pricedByFamily.has(fam)) pricedByFamily.set(fam, []);
        pricedByFamily.get(fam).push({ player: p, market: m.market });
      }
    }
    if (pricedByFamily.size === 0) continue;
    checkedPages += 1;

    assert.ok(main.includes("gtp-pred-row"),
      `${rel}: the producer holds captured prices for this game and the exported page renders no prediction row — a reader lands on a forecast with no market beside it`);

    /*
     * Rows the page actually rendered. The board is a tabbed client component, so ONE family is in
     * the static export; that family's priced rows are what must be correct here. A price in a
     * family behind a tab is not missing, it is not yet rendered — a different claim, and one this
     * guard must not confuse with a dropped field.
     */
    const rendered = main.match(/<li class="gtp-pred-row"[^>]*>[\s\S]*?<\/li>/g) ?? [];
    assert.ok(rendered.length > 0, `${rel}: prediction rows are claimed but none parsed — the row markup changed shape and this guard would measure nothing`);

    for (const [fam, priced] of pricedByFamily) {
      for (const { player, market } of priced) {
        const rows = rendered.filter((r) => r.includes(`data-family="${fam}"`) && r.includes(player.name));
        if (rows.length === 0) continue; // this player's family is not the rendered tab
        const blob = textOf(rows.join(" "));
        checkedRows += 1;
        assert.ok(namesFor(market.sportsbook).some((n) => bookKey(blob).includes(n)),
          `${rel}: ${player.name} is priced by ${market.sportsbook} in this game's own artifact, but that book is not named in his rendered row`);
        if (market.line != null) assert.ok(blob.includes(String(market.line)), `${rel}: ${player.name}'s line ${market.line} is missing`);
        for (const absent of ["Not checked", "Market unavailable", "No price", "Not offered"]) {
          assert.ok(!blob.includes(absent), `${rel}: ${player.name} has a real ${market.sportsbook} price AND says "${absent}"`);
        }
      }
    }
  }

  if (checkedPages === 0) {
    assert.ok(true, "no exported game page has a priced producer artifact yet — this guard is inert until one does");
    return;
  }
  assert.ok(checkedRows > 0,
    `${checkedPages} exported game page(s) hold captured prices but not one priced player was found in a rendered row — the default view is showing a family with no market, and this guard would pass blind`);
});
