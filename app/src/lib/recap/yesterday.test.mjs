/**
 * P251 — THE DAILY LOOP CLOSES, AND THE RECAP DOES NOT FLATTER.
 *
 * The product's day ended at publication. Everything settles overnight from official box scores,
 * and that record — the most credible thing here — lived only on /results, a page a casual reader
 * never opens. So the loop was one-way: come for a forecast, never learn whether it landed.
 *
 * A recap introduces exactly one temptation, and it is the one guarded hardest here: showing the
 * day only when it went well, or folding two different records into one flattering number.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildYesterdayRecap } from "./yesterday.mjs";

const APP = process.cwd();
const DATA = path.join(APP, "public", "data");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("the recap reports the day whatever it says", () => {
  const src = read("src/lib/recap/yesterday.mjs");
  const view = read("src/components/recap/yesterday-card.tsx");
  /* No branch may depend on the result being good — not in the builder, not in the view. */
  assert.ok(!/hit\s*>\s*0|missed\s*===\s*0|wins\s*>\s*losses/.test(src), "the builder must not gate on a good day");
  assert.ok(!/hit\s*>\s*0|missed\s*===\s*0|wins\s*>\s*losses/.test(view), "and neither may the view");
  assert.match(view, /cards\.hit\} hit, \$\{cards\.missed\} missed/, "both halves of the card record are printed");
});

test("the two records are never combined", () => {
  /*
   * A CARD is a whole slip that wins only if every leg does; a model projection is one row graded
   * on its own. Adding them would manufacture a "record" that neither source publishes, which is
   * the arithmetic this site refuses everywhere else.
   */
  const src = read("src/lib/recap/yesterday.mjs");
  const view = read("src/components/recap/yesterday-card.tsx");
  assert.ok(!/cards\.\w+\s*\+\s*model\.|model\.\w+\s*\+\s*cards\./.test(src), "the builder must not add across the two records");
  assert.ok(!/cards\.\w+\s*\+\s*model\.|model\.\w+\s*\+\s*cards\./.test(view), "and neither may the view");
  assert.match(view, /every leg; projections grade alone|never combined/i, "the page says so, where the two numbers are");
});

test("a verdict is the producer's, never re-derived from legs", () => {
  const src = read("src/lib/recap/yesterday.mjs");
  assert.match(src, /c\.result === "win"/, "the card's own result decides");
  assert.ok(!/legs\.(every|filter|some)/.test(src), "re-deriving a slip's verdict from its legs is how two surfaces disagree");
});

test("a day with nothing settled renders nothing", () => {
  const src = read("src/lib/recap/yesterday.mjs");
  assert.match(src, /if \(cardRows\.length === 0\) return null/, "no settled card means no recap");
  const view = read("src/components/recap/yesterday-card.tsx");
  assert.match(view, /if \(!recap\) return null/, "an empty recap card reads as a broken widget, not as 'nothing yet'");
});

test("LIVE · the recap agrees with the artifacts it reads", () => {
  const recap = buildYesterdayRecap(DATA);
  if (!recap) return;
  const doc = JSON.parse(fs.readFileSync(path.join(DATA, "parlays", "lab-settled", `${recap.date}.json`), "utf8"));
  assert.equal(recap.cards.published, (doc.cards ?? []).length, "the published count is the file's own card count");
  assert.equal(
    recap.cards.hit + recap.cards.missed + recap.cards.other,
    recap.cards.published,
    "every card leaves by exactly one door",
  );
  if (recap.model) {
    const rows = JSON.parse(fs.readFileSync(path.join(DATA, "mlb", "results", "model-rows", `${recap.model.date}.json`), "utf8"));
    assert.equal(recap.model.wins, rows.wins);
    assert.equal(recap.model.losses, rows.losses);
    assert.equal(recap.model.decisive, rows.decisive);
    assert.equal(recap.model.wins + recap.model.losses, recap.model.decisive, "decisive is wins plus losses — pushes are outside it");
  }
});

/* Session 1B (2026-09-30): the recap's day is the newest day with SETTLED CARDS. "How Sunday, September 27
   went" sat beside "Settled · Sep 29" — Sep 28 and 29 published no card. Both true; together a contradiction. */
test("S1B · recapIsYesterday is the reader's ET yesterday, across the UTC midnight", async () => {
  const { recapIsYesterday } = await import("./yesterday.mjs");
  const at = (iso) => Date.parse(iso);
  assert.equal(recapIsYesterday("2026-09-29", at("2026-09-30T15:00:00Z")), true);
  assert.equal(recapIsYesterday("2026-09-27", at("2026-09-30T15:00:00Z")), false);
  assert.equal(recapIsYesterday("2026-09-28", at("2026-09-30T03:00:00Z")), true, "23:00 ET on the 29th: yesterday is the 28th");
  assert.equal(recapIsYesterday("2026-09-29", at("2026-09-30T03:00:00Z")), false);
  for (const bad of [null, undefined, "", "Sep 29", "2026-9-29"]) assert.equal(recapIsYesterday(bad, at("2026-09-30T15:00:00Z")), false);
});

test("S1B · the heading says 'How … went' only for yesterday; an older card day names the product and says nothing settled since", async () => {
  const React = (await import("react")).default; globalThis.React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: YesterdayCard } = await import("../../components/recap/yesterday-card.tsx");
  const et = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const yesterday = new Date(Date.parse(`${et}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const recap = (date) => ({ date, cards: { published: 3, hit: 0, missed: 3, other: 0 }, model: null, sameDay: true });
  const y = renderToStaticMarkup(React.createElement(YesterdayCard, { recap: recap(yesterday) }));
  assert.match(y, /How \w+day, \w+ \d+ went/);
  assert.doesNotMatch(y, /last settled|none since/);
  const old = renderToStaticMarkup(React.createElement(YesterdayCard, { recap: recap("2026-09-27") }));
  assert.match(old, /Suggested Parlays · last settled Sunday, September 27 · none since/);
  assert.doesNotMatch(old, /How Sunday, September 27 went/, "an older day is never presented as yesterday's");
  assert.match(old, /0 hit, 3 missed/, "the record itself is unchanged");
});
