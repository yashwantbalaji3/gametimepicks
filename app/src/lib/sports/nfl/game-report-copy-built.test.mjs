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
 * THE EXEMPTION, POSITIVE-CONTROLLED.
 *
 * `primaryOf` strips `<details>`, so a guard that never checks WHAT it stripped would pass just as
 * happily if the whole page were wrapped in one. This asserts the stripping is real and narrow: the
 * prior-club block must still EXIST on at least one page, inside a disclosure, carrying its own
 * frame — kept, demoted, and not quietly deleted to make a copy scan go green.
 */
test("the prior-club context survives — demoted into a disclosure, not deleted", () => {
  const pages = gamePages();
  const artifacts = (() => {
    const dir = path.join(APP, "public/data/nfl/player-board");
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
      .filter((b) => Object.values(b.newArrivals ?? {}).some((l) => l.length > 0)).length;
  })();
  if (artifacts === 0) return; // no mover on this slate: the page owes nothing and claims nothing

  const withDisclosure = pages.filter(({ main }) =>
    (main.match(/<details[\s\S]*?<\/details>/g) ?? []).some((d) => /recent signings/i.test(textOf(d))));
  assert.ok(withDisclosure.length > 0,
    `${artifacts} committed board(s) carry prior-club movers, but no exported game page offers them in a disclosure — the copy rule must demote this context, never delete it`);

  for (const { rel, main } of withDisclosure) {
    const disclosure = (main.match(/<details[\s\S]*?<\/details>/g) ?? [])
      .filter((d) => /recent signings/i.test(textOf(d))).join(" ");
    const text = textOf(disclosure).toLowerCase();
    assert.ok(text.includes("history"), `${rel}: the disclosure must still say these numbers are history`);
    /* "none of it is in ... projections" and "not part of the projections" are the same statement;
       the guard must accept the sentence the product actually writes, not one spelling of it. */
    assert.ok(/(not|none of it is|never) [^.]*projection/.test(text),
      `${rel}: the disclosure must still say the numbers are not in this game's projections`);
  }
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
