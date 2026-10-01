/**
 * WHAT THE NFL GAME REPORT MAY NOT SAY (P0 · 2026-09-24), measured on the BUILT EXPORT.
 *
 * ⚠ THE PHRASES THIS GUARDS WERE NEVER IN THE SOURCE. Two places on the game page rendered
 * `participation.toLowerCase().replaceAll("_", " ")`, which turns `AVAILABLE_ROLE_UNCERTAIN` into
 * "available role uncertain" — on most rows, on a page a beginner reads as an injury report. A
 * repo-wide grep for the banned wording returned the component's own comment and nothing else.
 *
 * That is the whole reason this file reads the EXPORT rather than the source. An assembled string
 * is invisible to a copy audit; a rendered page is not. The same is true of a phrase moved into a
 * template literal, split across two JSX children, or produced by a producer into an artifact the
 * page prints verbatim — none of which a source scan sees, and all of which land here.
 *
 * ⚠ AND "PRIMARY UI" IS THE LOAD-BEARING WORD. The founder's instruction removes this copy from the
 * PRIMARY prediction experience, not from the product: prior-club usage is real and a reader who
 * came for a player the stint rule cannot place yet should not find silence. So a `<details>` a
 * reader opens deliberately is permitted and the surrounding page is not — which means this file
 * must strip disclosures before it scans, and must PROVE it stripped the right thing, or the
 * exemption becomes a hole big enough to hide the original defect in.
 *
 * Run (after `npm run build`): npx tsx --test src/lib/sports/nfl/game-report-copy-built.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const OUT = path.join(APP, "out");

const textOf = (h) =>
  h.replace(/<!-- -->/g, "").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&rsquo;|&#8217;/g, "'").replace(/&mdash;|&#8212;/g, "—")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");
const mainOf = (h) => /<main[\s\S]*?<\/main>/.exec(h)?.[0] ?? "";
/** Everything a reader sees WITHOUT opening anything. A `<details>` is opt-in, so it is not primary. */
const primaryOf = (main) => textOf(main.replace(/<details[\s\S]*?<\/details>/g, " "));

function gamePages() {
  const dir = path.join(OUT, "nfl/game");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((k) => path.join(dir, k, "index.html"))
    .filter((f) => fs.existsSync(f))
    .map((f) => ({ f, rel: path.relative(OUT, f), main: mainOf(fs.readFileSync(f, "utf8")) }))
    .filter(({ main }) => main.length > 0);
}

/**
 * The founder's list, verbatim, case-insensitive. Each is banned from the PRIMARY prediction UI.
 *
 * "role uncertain" covers "available role uncertain" — the shorter string is the one that was
 * actually rendered by the player board's own map, and banning the longer alone would have left it.
 */
const BANNED = [
  "available role uncertain",
  "role uncertain",
  "new arrivals",
  "not in these numbers",
  "not in the simulated numbers",
  "per game at their previous club",
  "per game at their previous team",
  "history, not a projection",
];

test("no banned internal copy reaches the primary NFL game-report UI", () => {
  const pages = gamePages();
  assert.ok(pages.length > 0, "no exported NFL game page — every assertion below would pass blind");
  for (const { rel, main } of pages) {
    const primary = primaryOf(main).toLowerCase();
    for (const phrase of BANNED) {
      assert.ok(!primary.includes(phrase), `${rel}: the primary prediction UI prints "${phrase}"`);
    }
  }
});

/**
 * THE EXEMPTION, POSITIVE-CONTROLLED (Session 4 rewrite). `primaryOf` strips `<details>`, so the
 * second test below asserts the stripped model-detail block really exists wherever a board's
 * coverage receipt owes one — the exemption is narrow, and nothing was deleted to go green.
 */
test("SESSION 4 · no exported game page shows a former club's line as a current-game attribute", () => {
  /*
   * The old strip rendered "2.1 rec · 16.9 yds/g at CAR" under the current matchup. A prior club may
   * now appear only inside the model-detail disclosure, labelled as an unused historical prior.
   * Everything OUTSIDE that disclosure is current-game output and must carry no "…/g at XXX" line,
   * no "recent signings" heading and no "last season's usage".
   */
  const pages = gamePages();
  assert.ok(pages.length > 0, "no exported NFL game page to scan — a vacuous pass");
  for (const { rel, main } of pages) {
    const outside = main.replace(/<details[^>]*data-model-detail="not-in-these-numbers"[\s\S]*?<\/details>/g, " ");
    const text = textOf(outside);
    assert.ok(!/recent signings/i.test(text), `${rel}: the prior-club strip is back in the current-game page`);
    assert.ok(!/last season[’']s usage/i.test(text), `${rel}: last season's usage presented as a current-game attribute`);
    assert.ok(!/\/g at [A-Z]{2,3}\b/.test(text), `${rel}: a per-game line "at <club>" in current-game output`);
  }
});

test("SESSION 4 · a board with excluded or role-uncertain players offers the model-detail disclosure", () => {
  const dir = path.join(APP, "public/data/nfl/player-board");
  if (!fs.existsSync(dir)) return;
  const pages = new Map(gamePages().map((p) => [p.rel.match(/(\d{6,})/)?.[1], p]));
  let armed = 0;
  for (const file of fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f))) {
    const board = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const owed = Object.values(board.coverage ?? {}).some((c) => c.players.some((r) => r.state !== "PROJECTED" || r.notModeled?.length));
    const page = pages.get(String(board.providerEventId));
    if (!owed || !page) continue;
    armed += 1;
    const d = (page.main.match(/<details[^>]*data-model-detail="not-in-these-numbers"[\s\S]*?<\/details>/) ?? [""])[0];
    assert.ok(/who this forecast leaves out/i.test(textOf(d)), `${page.rel}: coverage owes a model-detail disclosure and the page has none`);
    if (/for [A-Z]{2,3},/.test(textOf(d))) assert.match(textOf(d), /Historical prior, not used in these numbers/, `${page.rel}: a former club's line must be labelled as an unused prior`);
  }
  console.log(`session-4 coverage disclosure: ${armed} exported page(s) armed`);
});

/**
 * A REAL AVAILABILITY STATE MUST STILL REACH THE READER. The hide is targeted, not a blanket — and
 * a rule that removed "questionable" along with "role uncertain" would have traded one harm for a
 * worse one, since that state is an official fact a reader may need to act on.
 */
test("official availability states still reach the game report", () => {
  const dir = path.join(APP, "public/data/nfl/player-board");
  if (!fs.existsSync(dir)) return;
  let owed = 0;
  let shown = 0;
  for (const file of fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f))) {
    const board = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const questionable = (board.players ?? []).filter((p) => p.participation === "QUESTIONABLE");
    if (!questionable.length) continue;
    const page = path.join(OUT, "nfl/game", board.providerEventId ?? "", "index.html");
    if (!fs.existsSync(page)) continue;
    owed += 1;
    const text = primaryOf(mainOf(fs.readFileSync(page, "utf8"))).toLowerCase();
    if (text.includes("questionable")) shown += 1;
  }
  if (owed === 0) return; // an honest slate with no questionable player owes this page nothing
  assert.ok(shown > 0,
    `${owed} exported game page(s) have QUESTIONABLE players committed and none says "questionable" — hiding the model's role state must never hide an official availability state`);
});
