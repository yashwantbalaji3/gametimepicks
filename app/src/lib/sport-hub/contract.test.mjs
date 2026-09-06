import test from "node:test";
import assert from "node:assert/strict";
import { orderRows, hubCounts, HUB_SECTIONS, DEFAULT_LABELS } from "./contract.ts";

const row = (o) => ({
  id: o.id, startUtc: o.startUtc ?? null, startLabel: o.startLabel ?? "", matchup: o.matchup ?? o.id,
  status: o.status ?? "scheduled", started: o.started ?? false, read: o.read ?? null,
  reportState: o.reportState ?? "READY", reportHref: o.reportHref ?? "/x/", reportNote: o.reportNote,
});

test("the mandated section order is fixed and complete", () => {
  assert.deepEqual([...HUB_SECTIONS], ["games", "products", "simulations", "picks", "results"]);
  for (const s of HUB_SECTIONS) assert.ok(DEFAULT_LABELS[s], `${s} has no label`);
});

test("upcoming rows sort by start time; started rows come after, most recent first", () => {
  const rows = [
    row({ id: "late", startUtc: "2026-09-06T23:00:00Z" }),
    row({ id: "done-old", startUtc: "2026-09-01T18:00:00Z", started: true }),
    row({ id: "early", startUtc: "2026-09-06T17:00:00Z" }),
    row({ id: "done-new", startUtc: "2026-09-05T18:00:00Z", started: true }),
  ];
  assert.deepEqual(orderRows(rows).map((r) => r.id), ["early", "late", "done-new", "done-old"]);
});

test("a started row is never sorted in among pre-event rows", () => {
  // Mixing them is how a settled outcome ends up presented beside a forecast.
  const rows = [row({ id: "played", startUtc: "2026-09-06T10:00:00Z", started: true }),
                row({ id: "upcoming", startUtc: "2026-09-06T23:00:00Z" })];
  const ordered = orderRows(rows);
  assert.equal(ordered[0].id, "upcoming");
  assert.equal(ordered[1].id, "played");
});

test("a row with no start time sorts last rather than to 1970", () => {
  const rows = [row({ id: "tbd", startUtc: null }), row({ id: "known", startUtc: "2026-09-06T17:00:00Z" })];
  assert.deepEqual(orderRows(rows).map((r) => r.id), ["known", "tbd"]);
});

test("scheduled, reportable and read-bearing are counted SEPARATELY", () => {
  // One number standing for all three is how a page comes to claim every game is simulated.
  const rows = [
    row({ id: "a", read: { label: "x", kind: "MODEL_FORECAST" } }),
    row({ id: "b", reportState: "NONE", reportHref: null }),
    row({ id: "c", started: true }),
  ];
  assert.deepEqual(hubCounts(rows), { scheduled: 3, withReport: 2, withRead: 1, started: 1 });
});

test("an empty slate counts to zero without throwing", () => {
  assert.deepEqual(hubCounts([]), { scheduled: 0, withReport: 0, withRead: 0, started: 0 });
  assert.deepEqual(orderRows([]), []);
});

/* ── AGAINST THE BUILT EXPORT ─────────────────────────────────────────────────────────────────── */
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const HUBS = ["mlb", "nfl", "epl", "ufc"];

/**
 * Rendered TEXT, not markup.
 *
 * React splits adjacent expressions with `<!-- -->` separators, so the export contains
 * `15<!-- --> scheduled` and a plain /\d+ scheduled/ finds nothing. Asserting against raw HTML is
 * how a guard here comes to pass or fail for reasons that have nothing to do with the page.
 */
const renderedText = (html) => html
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
  .replace(/\s+/g, " ");

test("BUILT · the page heading is never underneath the sticky section strip", () => {
  /*
   * The strip is `position: sticky`. Rendered immediately BEFORE the heading it overlapped the h1 by
   * 29px at rest — measured in a browser at scrollY 0, before any scrolling. A sticky bar riding over
   * a page title is the "sticky elements that obscure content" failure exactly, and no DOM assertion
   * about either element on its own would have caught it. Document order is what fixes it, so
   * document order is what is pinned.
   */
  for (const sport of HUBS) {
    const f = path.join(OUT, sport, "index.html");
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, "utf8");
    const h1 = html.indexOf("<h1");
    const nav = html.search(/<nav[^>]*aria-label="[^"]*sections"/i);
    assert.ok(h1 !== -1, `${sport}: no h1 in the export`);
    assert.ok(nav !== -1, `${sport}: no section strip in the export`);
    assert.ok(h1 < nav, `${sport}: the sticky strip precedes the heading and will cover it`);
  }
});

test("BUILT · every hub opens with its events, and counts are printed separately", () => {
  for (const sport of HUBS) {
    const f = path.join(OUT, sport, "index.html");
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, "utf8");
    assert.ok(html.includes(`id="${sport}-games"`), `${sport}: no events section`);
    const text = renderedText(html);
    // "N scheduled · N with a report · N with a supported read" — three numbers, not one.
    assert.match(text, /\d+ scheduled/, `${sport}: no scheduled count`);
    assert.match(text, /\d+ with a supported read/, `${sport}: read count not printed separately`);
    // The three counts must be able to DIFFER; a page printing one number three times has collapsed
    // "scheduled" into "simulated", which is the claim this whole section exists to avoid.
    assert.match(text, /\d+ scheduled · \d+ with a report · \d+ with a supported read/, `${sport}: counts not printed as three`);
  }
});

test("BUILT · no hub row offers a report link for a sport that has no report route", () => {
  const f = path.join(OUT, "ufc", "index.html");
  if (!fs.existsSync(f)) return;
  const html = fs.readFileSync(f, "utf8");
  assert.match(renderedText(html), /card-level report/, "UFC must say its reports are card-level");
  assert.ok(!/href="\/ufc\/bout\//.test(html), "UFC must not link to a per-bout route that is not generated");
});

test("BUILT · a period with nothing scheduled still prints its zero", () => {
  // The counts line returned nothing at all on an empty period, so a reader could not tell "we
  // looked and there are none" from "this section failed to render". EPL hit it the moment its
  // matchweek rolled past.
  for (const sport of HUBS) {
    const f = path.join(OUT, sport, "index.html");
    if (!fs.existsSync(f)) continue;
    const text = renderedText(fs.readFileSync(f, "utf8"));
    assert.match(text, /\d+ scheduled · \d+ with a report · \d+ with a supported read/,
      `${sport}: no counts line — an empty period must still say zero`);
  }
});
