/**
 * Parlay Lab tier performance (checklist row H, 2026-11-11): the window math on fixtures, every count shown with its
 * denominator, no ROI / price / odds anywhere, the frozen-card immutability check, real-data agreement with the
 * Results record, and the flag-OFF wiring.
 * Run: npx tsx --test src/lib/parlays/tier-tracking.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
process.env.__NEXT_TRAILING_SLASH = "true";
const T = await import("./tier-tracking.mjs");
const { levelARecord, MIN_DECIDED_FOR_RATE } = await import("../results/level-a-record.mjs");
const { recordViolations } = await import("../products/level-a/record.mjs");
const { gradeViolations } = await import("../products/level-a/grade.mjs");
const { default: TierTracking } = await import("../../components/parlays/tier-tracking/tier-tracking.tsx");
const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/* ── fixture: cards on known days, by tier and sport ───────────────────────────────────────────────────────────── */
const TODAY = "2026-11-10";
const leg = (sport, day, id = `${sport}-${day}`) => ({ sport, eventId: id, eventLabel: "AAA @ BBB", startUtc: `${day}T23:00:00Z`, selection: "AAA to win", modelId: "m1", stampedAt: `${day}T12:00:00Z`, result: "PENDING", final: null });
const card = (id, productDay, tier, status, legs) => ({ id, productDay, tier, tierLabel: tier, label: "Parlay Center card", status, legs });
const ENTRIES = [
  card("a", "2026-11-10", "low", "PENDING", [leg("nba", "2026-11-10")]),             // today
  card("b", "2026-11-09", "low", "WON", [leg("nba", "2026-11-09")]),                 // 1 day
  card("c", "2026-11-08", "medium", "LOST", [leg("nfl", "2026-11-08")]),             // 2 days
  card("d", "2026-11-05", "medium", "VOID", [leg("nfl", "2026-11-05")]),             // 5 days
  card("e", "2026-10-20", "high", "WON", [leg("nba", "2026-10-21"), leg("nfl", "2026-10-20")]), // 21 days · mixed
  card("f", "2026-10-01", "high", "LOST", [leg("mlb", "2026-10-01")]),               // 40 days · MLB 2026 season
  card("g", "2026-07-20", "low", "WON", [leg("nba", "2026-05-20")]),                 // NBA 2025-26 season: not this season
  card("h", "2026-03-10", "longshot", "LOST", [leg("epl", "2026-03-10")]),           // EPL 2025-26: not this season
];
const win = (m, key) => m.windows.find((w) => w.key === key);
const ids = (m, key) => {
  const w = T.WINDOWS.find((x) => x.key === key);
  return ENTRIES.filter((c) => T.inWindow(c, w, TODAY)).map((c) => c.id);
};

test("window math: today, 3/7/30 days by product day, the season by each leg's sport, all-time", () => {
  assert.deepEqual(ids(null, "day"), ["a"]);
  assert.deepEqual(ids(null, "3d"), ["a", "b", "c"]);
  assert.deepEqual(ids(null, "7d"), ["a", "b", "c", "d"]);
  assert.deepEqual(ids(null, "30d"), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(ids(null, "season"), ["a", "b", "c", "d", "e", "f"], "g (NBA May = 2025-26) and h (EPL March = 2025-26) are last season");
  assert.deepEqual(ids(null, "all"), ["a", "b", "c", "d", "e", "f", "g", "h"]);
  // season conventions
  assert.deepEqual([T.seasonOf("nba", "2026-07-31"), T.seasonOf("nba", "2026-08-01")], [2025, 2026]);
  assert.deepEqual([T.seasonOf("nfl", "2027-02-10"), T.seasonOf("nfl", "2027-03-01")], [2026, 2027]);
  assert.deepEqual([T.seasonOf("epl", "2026-06-30"), T.seasonOf("epl", "2026-07-01")], [2025, 2026]);
  assert.equal(T.seasonOf("mlb", "2026-10-01"), 2026);
  // a future product day is in no rolling window
  assert.equal(T.inWindow(card("z", "2026-11-11", "low", "PENDING", [leg("nba", "2026-11-11")]), T.WINDOWS[1], TODAY), false);
});

test("the tallies: frozen, settled, won/lost with decided, void and pending never a loss; per tier and per sport (mixed kept whole)", () => {
  const m = T.tierPerformance(ENTRIES, { today: TODAY });
  assert.deepEqual(win(m, "7d").total, { frozen: 4, settled: 3, won: 1, lost: 1, void: 1, pending: 1, decided: 2, hit: { won: 1, of: 2, rate: null } });
  const t30 = win(m, "30d");
  assert.deepEqual(t30.tiers.filter((t) => t.frozen > 0).map((t) => [t.tier, t.frozen, t.settled, t.decided]), [["low", 2, 1, 1], ["medium", 2, 2, 1], ["high", 1, 1, 1]]);
  assert.deepEqual(t30.tiers.find((t) => t.tier === "high").bySport.map((s) => s.sport), ["mixed"], "an NBA+NFL card is one mixed card, never split");
  assert.deepEqual(win(m, "all").tiers.map((t) => t.tier), ["low", "medium", "high", "longshot"], "tier order");
  assert.equal(m.returns, "returns not tracked: no verified prices");
});

test("denominators always shown; a percentage only from the site's sample minimum", () => {
  assert.equal(T.hitText({ won: 0, of: 0, rate: null }), "no decided card yet");
  assert.equal(T.hitText({ won: 4, of: 9, rate: null }), "4 won of 9 decided");
  const many = Array.from({ length: MIN_DECIDED_FOR_RATE }, (_, i) => card(`m${i}`, TODAY, "low", i % 4 ? "WON" : "LOST", [leg("nba", TODAY, `e${i}`)]));
  const m = T.tierPerformance(many, { today: TODAY });
  assert.equal(T.hitText(win(m, "day").total.hit), `${MIN_DECIDED_FOR_RATE * 3 / 4} won of ${MIN_DECIDED_FOR_RATE} decided · 75%`);
  const one = T.tierPerformance(many.slice(1), { today: TODAY });
  assert.doesNotMatch(T.hitText(win(one, "day").total.hit), /%/, `${MIN_DECIDED_FOR_RATE - 1} decided: counts only`);
  // rendered: every count carries its denominator
  const h = text(renderToStaticMarkup(React.createElement(TierTracking, { model: T.tierPerformance(ENTRIES, { today: TODAY }), recent: [] })));
  for (const m2 of h.matchAll(/Settled (\d+) (\S+ \d+)?/g)) assert.match(m2[2] ?? "", /^of \d+$/, `settled count without its denominator: ${m2[0]}`);
  for (const m2 of h.matchAll(/Won · lost (\d+) · (\d+) (\S+ \d+ \S+)?/g)) assert.match(m2[3] ?? "", /^of \d+ decided$/, m2[0]);
  assert.ok(!/\b\d+ won\b(?! of)/.test(h), "a won count is never shown without 'of N decided'");
});

test("no ROI, payout, price or odds anywhere — only the 'returns not tracked' statement", () => {
  const m = T.tierPerformance(ENTRIES, { today: TODAY });
  const recent = ENTRIES.slice(0, 3).map((c) => ({ id: c.id, productDay: c.productDay, tierLabel: c.tier, label: c.label, sport: T.cardSport(c), status: c.status, legs: c.legs.map((l) => l.selection).join(" · ") }));
  const h = renderToStaticMarkup(React.createElement(TierTracking, { model: m, recent }));
  const scrub = (s) => s.replaceAll(T.RETURNS_NOTE, "").replaceAll("Returns not tracked: no verified prices", "");
  for (const s of [scrub(text(h)), scrub(JSON.stringify(m)), JSON.stringify(ENTRIES.map(T.cardHistory))]) {
    assert.doesNotMatch(s, /\bROI\b|return on|payout|profit|\bunits?\b|\bstake\b|\bodds\b|\bprice|American|(?<![\w.:-])[+-]\d{3}(?!\d)|\$\d/i, s.slice(0, 160));
  }
  assert.match(text(h), /Returns not tracked: no verified prices\./);
});

test("frozen-card immutability: the history is the record as frozen; nothing is recomputed or mutated; the ledger guards hold", () => {
  const deepFreeze = (o) => { Object.freeze(o); for (const v of Object.values(o)) if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v); return o; };
  const frozen = deepFreeze(JSON.parse(JSON.stringify(ENTRIES)));
  assert.doesNotThrow(() => T.tierPerformance(frozen, { today: TODAY }), "the model never writes to a card");
  assert.doesNotThrow(() => frozen.map(T.cardHistory));
  // REAL ledger: every history leg is the recorded leg (selection, frozen forecast version), and the committed files pass
  // the record's own append-only guards; an edited earlier line is caught
  const dir = path.join(APP, "..", "data/internal/products/level-a");
  const sText = fs.readFileSync(path.join(dir, "suggestions.jsonl"), "utf8"), gText = fs.readFileSync(path.join(dir, "graded.jsonl"), "utf8");
  const rows = sText.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const grades = gText.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  assert.deepEqual(recordViolations({ afterText: sText }), []);
  assert.deepEqual(gradeViolations({ afterText: gText, recordIds: new Set(rows.map((r) => r.id)) }), []);
  const edited = sText.replace(/"probability":0\.501/, '"probability":0.601');
  assert.notEqual(edited, sText);
  assert.ok(recordViolations({ beforeText: sText, afterText: edited }).length > 0, "rewriting a frozen card is refused by the record's guard");
  const view = levelARecord(rows, grades);
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const e of view.entries) {
    const h = T.cardHistory(e), raw = byId.get(e.id);
    assert.equal(h.legs.length, raw.legs.length);
    h.legs.forEach((l, i) => {
      assert.equal(l.eventId, raw.legs[i].eventId);
      assert.equal(l.selection, raw.legs[i].selection?.label ?? null);
      assert.deepEqual(l.forecast, { modelId: raw.legs[i].forecast?.modelId ?? null, stampedAt: raw.legs[i].forecast?.stampedAt ?? null });
      assert.equal(l.eligibility?.state ?? null, raw.legs[i].eligibility?.state ?? null, "eligibility as recorded at freeze");
    });
  }
});

test("REAL DATA: all-time totals equal the Results record's totals (one source, the same counts)", () => {
  const dir = path.join(APP, "..", "data/internal/products/level-a");
  const jl = (f) => fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const view = levelARecord(jl("suggestions.jsonl"), jl("graded.jsonl"));
  const all = win(T.tierPerformance(view.entries, { today: TODAY }), "all").total;
  assert.deepEqual([all.frozen, all.won, all.lost, all.void, all.pending], [view.totals.recorded, view.totals.won, view.totals.lost, view.totals.void, view.totals.pending]);
  assert.ok(all.frozen > 100);
});

test("flag OFF: /build creates the section only inside the literal check; the history route ships nothing", async () => {
  const page = read("src/app/build/page.tsx");
  assert.match(page, /\{process\.env\.GTP_PARLAY_TRACKING_PUBLIC === "1" \? <TierTrackingSlot \/> : null\}/);
  assert.match(page, /async function TierTrackingSlot\(\) \{\n  if \(process\.env\.GTP_PARLAY_TRACKING_PUBLIC === "1"\) \{[^]*?\n  \}\n  return null;\n\}/);
  assert.doesNotMatch(page, /^import [^\n]*tier-tracking/m);
  assert.match(read("next.config.mjs"), /GTP_PARLAY_TRACKING_PUBLIC: process\.env\.GTP_PARLAY_TRACKING_PUBLIC === "1" \? "1" : "0"/);
  const prev = process.env.GTP_PARLAY_TRACKING_PUBLIC; delete process.env.GTP_PARLAY_TRACKING_PUBLIC;
  try {
    const { GET } = await import("../../app/data/parlay-card-history.json/route.ts");
    assert.deepEqual(await (await GET()).json(), { disabled: true });
  } finally { if (prev !== undefined) process.env.GTP_PARLAY_TRACKING_PUBLIC = prev; }
  assert.match(read("src/components/parlays/tier-tracking/card-history-drawer.tsx"), /useDialogFocus\(panelRef/);
});
