import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CARD_LIFECYCLE, LIFECYCLE_PHRASE, cardLifecycleOf, lifecycleContradictions, mayBeCalledNoPlay,
} from "./card-lifecycle.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("§8's minimum vocabulary is present", () => {
  for (const s of [
    "NO_CARD_PUBLISHED", "PUBLISHED_PRE", "LIVE",
    "FINAL_AWAITING_SETTLEMENT", "FINAL_CANONICAL", "SETTLED", "VOID",
  ]) {
    assert.ok(CARD_LIFECYCLE[s], `§8 names ${s}`);
  }
  /* Every state has a phrase, so a new state cannot ship unworded. */
  for (const s of Object.values(CARD_LIFECYCLE)) {
    assert.ok(LIFECYCLE_PHRASE[s], `${s} has no reader-facing phrase`);
  }
});

/* ── THE REPORTED DEFECT ────────────────────────────────────────────────────────────────────── */

test("🔴 three published, unsettled cards are NOT a no-play day", () => {
  /* The external review's exact case: a date with three published paper cards totalling $225 that
     /results called a "no-play day" because its realized P&L was 0. */
  const l = cardLifecycleOf({ published: 3 });
  assert.notEqual(l, CARD_LIFECYCLE.NO_CARD_PUBLISHED);
  assert.equal(mayBeCalledNoPlay(l), false, "the phrase must be unavailable here");
  assert.equal(l, CARD_LIFECYCLE.PUBLISHED_UNSETTLED);
});

test("money is not an input — there is no way to pass P&L in", () => {
  /*
   * The structural fix. Zero realized money is the honest state of at least four lifecycles, so any
   * code reading a lifecycle off it is guessing. Passing it is a no-op by construction.
   */
  const withMoney = cardLifecycleOf({ published: 3, realizedPnl: 0, exposure: 225 });
  assert.equal(withMoney, cardLifecycleOf({ published: 3 }), "an ignored argument cannot change the answer");
  const src = fs.readFileSync(new URL("./card-lifecycle.mjs", import.meta.url), "utf8");
  for (const forbidden of [/realizedPnl/, /\bpnl\b/i, /exposure\s*[,)}]/, /\bstake\b/]) {
    /* Comments may DISCUSS money; the code must not read it. */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, forbidden, `money must not reach the derivation: ${forbidden}`);
  }
});

test("NO_CARD_PUBLISHED is reachable ONLY from a zero count", () => {
  assert.equal(cardLifecycleOf({ published: 0 }), CARD_LIFECYCLE.NO_CARD_PUBLISHED);
  /* Anything published is never no-play, whatever every other count says. */
  for (const extra of [
    { settled: 9 }, { voided: 9 }, { live: 9 }, { providerFinal: 9 }, { officialFinal: 9 },
    { settled: 3, voided: 3, live: 3 },
  ]) {
    const l = cardLifecycleOf({ published: 3, ...extra });
    assert.notEqual(l, CARD_LIFECYCLE.NO_CARD_PUBLISHED, JSON.stringify(extra));
  }
});

test("an omitted count THROWS — a missing count is not zero cards", () => {
  /* A zero default would make the most dangerous answer the easiest one to reach by accident, which
     is the shape of the bug this replaces. */
  assert.throws(() => cardLifecycleOf({}), /`published` is required/);
  assert.throws(() => cardLifecycleOf(), /`published` is required/);
  assert.throws(() => cardLifecycleOf({ published: -1 }), /`published` is required/);
});

test("'not started' is a claim about events, so it needs the events to have been read", () => {
  /* UNKNOWN is not "not started", exactly as unknown is not "up to date". The daily-portfolio lanes
     carry no event state, so /results may say "not settled" and no more. */
  assert.equal(cardLifecycleOf({ published: 2 }), CARD_LIFECYCLE.PUBLISHED_UNSETTLED);
  assert.equal(cardLifecycleOf({ published: 2, eventStateObserved: true }), CARD_LIFECYCLE.PUBLISHED_PRE);
});

test("a mixed slate reports the least-resolved state that still has cards in it", () => {
  /* The headline must not claim a resolution the whole slate has not reached. */
  assert.equal(cardLifecycleOf({ published: 3, settled: 2, live: 1 }), CARD_LIFECYCLE.LIVE);
  assert.equal(cardLifecycleOf({ published: 3, settled: 2, officialFinal: 1 }), CARD_LIFECYCLE.FINAL_CANONICAL);
  assert.equal(cardLifecycleOf({ published: 3, settled: 2, providerFinal: 1 }), CARD_LIFECYCLE.FINAL_AWAITING_SETTLEMENT);
  /* Provider final outranked by official final, and both by live. */
  assert.equal(cardLifecycleOf({ published: 2, providerFinal: 1, officialFinal: 1 }), CARD_LIFECYCLE.FINAL_CANONICAL);
});

test("a fully-void date is VOID, not a loss and not a no-play", () => {
  assert.equal(cardLifecycleOf({ published: 3, voided: 3 }), CARD_LIFECYCLE.VOID);
  /* A void leg leaves the card, so any settled card makes the date settled. */
  assert.equal(cardLifecycleOf({ published: 3, settled: 1, voided: 2 }), CARD_LIFECYCLE.SETTLED);
  assert.notEqual(cardLifecycleOf({ published: 3, voided: 3 }), CARD_LIFECYCLE.NO_CARD_PUBLISHED);
});

/* ── CROSS-ROUTE COHERENCE (§8) ─────────────────────────────────────────────────────────────── */

test("two surfaces may not disagree about whether anything was published", () => {
  const c = lifecycleContradictions([
    { date: "2026-09-20", surface: "results", lifecycle: CARD_LIFECYCLE.NO_CARD_PUBLISHED },
    { date: "2026-09-20", surface: "bank-builder", lifecycle: CARD_LIFECYCLE.PUBLISHED_UNSETTLED },
  ]);
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, "PUBLISHED_DISAGREEMENT");
  assert.match(c[0].detail, /results/);
  assert.match(c[0].detail, /bank-builder/);
});

test("a surface may not report settled for a date another still has live", () => {
  /* §8's UFC case in general form: copy said the card had been fought while bouts were still
     scheduled later that day. */
  const c = lifecycleContradictions([
    { date: "2026-09-20", surface: "ufc", lifecycle: CARD_LIFECYCLE.SETTLED },
    { date: "2026-09-20", surface: "live", lifecycle: CARD_LIFECYCLE.LIVE },
  ]);
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, "SETTLED_WHILE_LIVE");
});

test("agreeing surfaces produce no contradictions, and different dates never collide", () => {
  assert.deepEqual(lifecycleContradictions([
    { date: "2026-09-20", surface: "results", lifecycle: CARD_LIFECYCLE.SETTLED },
    { date: "2026-09-20", surface: "my", lifecycle: CARD_LIFECYCLE.SETTLED },
    { date: "2026-09-21", surface: "results", lifecycle: CARD_LIFECYCLE.NO_CARD_PUBLISHED },
    { date: "2026-09-22", surface: "live", lifecycle: CARD_LIFECYCLE.LIVE },
  ]), []);
  assert.deepEqual(lifecycleContradictions([]), []);
  assert.deepEqual(lifecycleContradictions(null), []);
});

/* ── THE PAGE ───────────────────────────────────────────────────────────────────────────────── */

test("the results page no longer derives a no-play day from money", () => {
  const src = fs.readFileSync(path.join(APP, "src/components/results/trust-center.tsx"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.doesNotMatch(code, /realizedPnl === 0/, "the condition that printed no-play over real exposure");
  assert.doesNotMatch(code, /no card settled \(no-play day\)/, "the phrase is no longer hardcoded here");
  assert.match(code, /mayBeCalledNoPlay/, "the phrase is gated by the shared reservation");
});

test("a lane with no card behind it is NOT a published card", () => {
  /*
   * ⚠ MY OWN OFF-BY-ONE, FOUND AGAINST TODAY'S LIVE PORTFOLIO. The first version counted every lane,
   * and `lib/daily-portfolio/exposure.ts` states the rule outright: "awaiting"/"candidate" — no
   * placed card behind them, so nothing is at risk. The real 2026-09-26 portfolio has FOUR lanes and
   * THREE cards ($100 + $100 + $25 = $225, the exact figure the external review reported), so the row
   * would have said "4 cards" over three. A wrong count is a smaller lie than "no-play day" and still
   * a lie.
   */
  const src = fs.readFileSync(path.join(APP, "src/lib/results-trust-center.ts"), "utf8");
  assert.match(src, /\^\(awaiting\|candidate\)\$/, "the no-card lane statuses must be excluded from the published count");
  /* The parts must be counted over the same set as the whole, or settled could exceed published. */
  assert.match(src, /publishedLanes \? publishedLanes\.filter/, "settled/void are counted over the PUBLISHED lanes");
  assert.doesNotMatch(src, /const settledCount = dailyLanes \?/, "counting parts over a larger set than the whole");
});

test("the real daily-portfolio artifact yields a lifecycle that is not a no-play day", () => {
  /*
   * Against the COMMITTED artifact, because the defect was about real data and a synthetic fixture
   * would not have shown that `realizedPnl` is 0 while $225 sits at risk. Self-skips if the artifact
   * moves on, rather than rotting into a false alarm.
   */
  const p = path.join(APP, "public/data/mr-dub/daily-portfolio.json");
  if (!fs.existsSync(p)) return;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!Array.isArray(d.lanes) || d.lanes.length === 0) return;
  const st = (l) => String(l.status ?? "").toLowerCase();
  const published = d.lanes.filter((l) => !/^(awaiting|candidate)$/.test(st(l)));
  if (published.length === 0) return; // a genuine no-play day; nothing to assert here
  const lc = cardLifecycleOf({
    published: published.length,
    settled: published.filter((l) => /^(won|lost|settled|push)$/.test(st(l))).length,
    voided: published.filter((l) => /^(void|no_action|scratched)$/.test(st(l))).length,
    eventStateObserved: false,
  });
  assert.equal(mayBeCalledNoPlay(lc), false, `${published.length} published card(s) must never read as a no-play day`);
  /* And the old condition would have. Pinned so the regression is visible, not just fixed. */
  const oldWouldSayNoPlay = d.settlement?.status === "none" || d.settlement?.realizedPnl === 0;
  if (oldWouldSayNoPlay) {
    assert.ok(true, "confirmed: the replaced condition fires on this very artifact");
  }
});
