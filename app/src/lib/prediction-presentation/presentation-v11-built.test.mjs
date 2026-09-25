/**
 * PREDICTION PRESENTATION V1.1 — measured on the RENDERED export, not on the component source.
 *
 * The three changes this pins are all about what a reader actually sees, so a source scan would
 * prove the wrong thing: a constant can be renamed while the page still prints the old string from
 * somewhere else. These read the shipped HTML of every surface that renders a prediction board.
 *
 *   V1  `role uncertain` is gone from the primary public rows — while REAL availability survives
 *   V2  the market absence reads as a product sentence, not as "No price"
 *   V3  matchup and start live in the player's identity line, with their screen-reader keys intact
 *
 * ⚠ EVERY ASSERTION IS PAIRED WITH A POSITIVE CONTROL. "The phrase is absent" passes just as well on
 * a page that failed to render, on a selector that matches nothing, and on a board that published
 * zero rows. Each test therefore first proves the thing it is scanning exists and is populated, from
 * the COMMITTED artifact rather than from the page it is judging.
 *
 * Run (after `npm run build`): npx tsx --test src/lib/prediction-presentation/presentation-v11-built.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const OUT = path.join(APP, "out");
const BOARDS = path.join(APP, "public/data/nfl/weekly-boards/latest.json");

/** Every exported page that renders a PredictionBoard. */
function boardPages() {
  const pages = [];
  const nfl = path.join(OUT, "nfl");
  if (fs.existsSync(path.join(nfl, "index.html"))) pages.push(path.join(nfl, "index.html"));
  const weeks = path.join(nfl, "week");
  if (fs.existsSync(weeks)) {
    for (const k of fs.readdirSync(weeks)) {
      const f = path.join(weeks, k, "index.html");
      if (fs.existsSync(f)) pages.push(f);
    }
  }
  return pages;
}

/** <main> only. The footer, the nav and the RSC payload are not this page's prediction rows. */
const mainOf = (html) => /<main[\s\S]*?<\/main>/.exec(html)?.[0] ?? "";
const textOf = (f) =>
  f.replace(/<!-- -->/g, "").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&middot;|&#xB7;/g, "·").replace(/\s+/g, " ");

/** The committed artifact — the independent owner this guard checks the page against. */
function liveRows() {
  assert.ok(fs.existsSync(BOARDS), "no committed weekly board — this guard would scan nothing");
  const doc = JSON.parse(fs.readFileSync(BOARDS, "utf8"));
  const rows = doc.boards.filter((b) => b.rows?.length).flatMap((b) => b.rows);
  assert.ok(rows.length > 0, "the committed weekly board publishes no rows — this guard would be vacuous");
  return rows;
}

function renderedBoardPages() {
  const pages = boardPages().map((f) => ({ f, html: fs.readFileSync(f, "utf8") }))
    .map(({ f, html }) => ({ f, main: mainOf(html) }))
    .filter(({ main }) => main.includes("gtp-pred-row"));
  assert.ok(pages.length > 0, "no exported page rendered a prediction row — every assertion below would pass blind");
  return pages;
}

test("V1 · `role uncertain` is absent from the primary public rows", () => {
  const rows = liveRows();
  const uncertain = rows.filter((r) => r.participation === "AVAILABLE_ROLE_UNCERTAIN");
  // POSITIVE CONTROL: the state must still be in the artifact, or "absent from the page" means nothing.
  assert.ok(uncertain.length > 0,
    "no committed row carries AVAILABLE_ROLE_UNCERTAIN — the state has stopped being produced, so this test no longer proves the renderer hides it");
  for (const { f, main } of renderedBoardPages()) {
    const text = textOf(main).toLowerCase();
    assert.ok(!text.includes("role uncertain"),
      `${path.relative(OUT, f)} still prints "role uncertain" on a public prediction row`);
  }
});

test("V1 · a REAL availability state still reaches the reader — the hide is targeted, not a blanket", () => {
  const rows = liveRows();
  const real = rows.filter((r) => r.participation === "QUESTIONABLE");
  if (real.length === 0) return; // an honest slate with no questionable player owes this page nothing
  const names = new Set(real.map((r) => r.name));
  const pages = renderedBoardPages();
  const shown = pages.some(({ main }) => {
    const text = textOf(main);
    return [...names].some((n) => text.includes(n)) && text.toLowerCase().includes("questionable");
  });
  assert.ok(shown,
    `${real.length} committed row(s) are QUESTIONABLE and at least one is published, but no board page says "questionable" — hiding the model's role state must never hide an official availability state`);
});

test("V2 · an absent market reads as a product sentence, and never as a bare `No price`", () => {
  const rows = liveRows();
  /*
   * ⚠ THE ANTI-VACUITY PRECONDITION NAMED ONE STATE, AND THE STATE STOPPED BEING PRODUCED.
   *
   * It required a committed row with `pricingState === "NOT_AUTHORIZED"` — correct while the NFL
   * odds authorization excluded props and every row carried that stamp. On 2026-09-24 the founder
   * authorized the five families, rows became NOT_PROBED, NOT_OFFERED or genuinely priced, and this
   * guard went red for the reason it was written to make possible.
   *
   * The precondition is now about the SHAPE of the slate rather than one value in it: whichever
   * absences the committed rows actually carry, their wording must reach a reader. And a slate with
   * no absence left is not a free pass — it is measured from the other side, because a board where
   * every row is priced must actually name the books.
   */
  const absent = [...new Set(rows.map((r) => r.pricingState).filter(Boolean))];
  const priced = rows.filter((r) => r.market);
  assert.ok(absent.length > 0 || priced.length > 0,
    "the committed rows carry neither a price nor a typed absence — this guard would pass without exercising anything");
  const SHORT = { NOT_AUTHORIZED: "Market unavailable", NOT_OFFERED: "Not offered", NOT_PROBED: "Not checked", UNSUPPORTED: "n/a" };
  /* Identity, not a raw substring: a page may print "DraftKings" for the provider key `draftkings`. */
  const bookKey = (x) => String(x).toLowerCase().replace(/[^a-z]/g, "");
  let seen = 0;
  let seenBook = 0;
  for (const { f, main } of renderedBoardPages()) {
    const text = textOf(main);
    assert.ok(!/\bNo price\b/.test(text), `${path.relative(OUT, f)} still prints "No price"`);
    if (absent.some((s) => SHORT[s] && text.includes(SHORT[s]))) seen += 1;
    if (priced.some((r) => bookKey(text).includes(bookKey(r.market.sportsbook)))) seenBook += 1;
    // Whatever it says, it must never look like a quote: no American odds in an absent market cell.
    for (const cell of main.match(/<span class="gtp-pred-absent">[\s\S]*?<\/span>/g) ?? []) {
      assert.ok(!/[+-]\d{3}/.test(cell), `${path.relative(OUT, f)}: an absent market cell carries something shaped like odds`);
    }
  }
  if (absent.length) {
    assert.ok(seen > 0, `committed rows carry ${absent.join("/")} but no page rendered the wording — the state is produced and never reaches a reader`);
  }
  if (priced.length) {
    assert.ok(seenBook > 0, `${priced.length} committed row(s) carry a captured price but no page names the sportsbook it came from — an unattributed price is not a fact`);
  }
});

test("V3 · matchup and start are in the player's identity line, keys intact, columns gone", () => {
  const rows = liveRows();
  const withOpp = rows.filter((r) => r.opponent && r.team);
  assert.ok(withOpp.length > 0, "no committed row has both a team and an opponent — nothing to place");
  for (const { f, main } of renderedBoardPages()) {
    const rel = path.relative(OUT, f);
    // the header row no longer declares them as columns…
    const head = /<div class="gtp-pred-head"[\s\S]*?<\/div>/.exec(main)?.[0] ?? "";
    assert.ok(head, `${rel}: no board header found — the layout assertions below would not be measuring it`);
    const headText = textOf(head);
    assert.ok(!/\bMatchup\b/.test(headText) && !/\bStart\b/.test(headText),
      `${rel}: Matchup/Start are still desktop columns`);
    // …but the values, and their screen-reader keys, are still in the row.
    const ctx = main.match(/<span class="gtp-pred-context[^"]*"[\s\S]*?<\/span><\/span>/g) ?? [];
    assert.ok(ctx.length > 0, `${rel}: no identity line rendered — matchup and start have gone missing, not moved`);
    const joined = textOf(ctx.join(" "));
    assert.ok(/Matchup/.test(joined) && /Start/.test(joined),
      `${rel}: the identity line lost its screen-reader keys — a value with no label is worse than a column`);
    assert.ok(/\b[A-Z]{2,4} vs [A-Z]{2,4}\b/.test(joined), `${rel}: no matchup rendered in the identity line`);
    assert.ok(/\bET\b/.test(joined), `${rel}: no ET-labelled kickoff rendered in the identity line`);
    // the club is named once, not twice: "SEA · SEA vs WSH" was the thing being fixed
    assert.ok(!/\b([A-Z]{2,4}) · \1 vs /.test(joined), `${rel}: the team abbreviation is printed twice on one line`);
  }
});
