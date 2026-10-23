/**
 * Homer Nukes public record vs publication status unknown (2026-10-23, provenance audit A-T07). A pick whose graded
 * probability no record shows was published before first pitch stays graded but counts in no public figure. Pins the
 * split on fixtures, proves that over all picks it reproduces the settlement owner's record.json (a split, not a
 * fork), pins the 15 audited picks, and checks both pages read the split.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { homerNukesRecordSplit, unknownPublicationKeys, homerNukesKey } from "./homer-nukes-publication.mjs";

const pick = (playerId, gamePk, probability, result) => ({ playerId, gamePk, player: `P${playerId}`, probability, result });

test("🔴 an unknown-publication pick is graded but counted only in its own population; ungraded picks count nowhere", () => {
  const days = [
    { date: "2031-07-02", picks: [pick(1, 10, 0.25, "hit"), pick(2, 10, 0.2, "miss"), pick(3, 11, 0.3, "pending")] },
    { date: "2031-07-01", picks: [pick(1, 9, 0.2, "hit"), pick(4, 9, 0.1, "miss")] },
  ];
  const s = homerNukesRecordSplit(days, new Set([homerNukesKey("2031-07-01", "9", "1")]));
  assert.deepEqual([s.public.gradedPicks, s.public.actual, s.public.predicted], [3, 1, 0.55]);
  assert.deepEqual([s.unknown.gradedPicks, s.unknown.actual, s.unknown.predicted], [1, 1, 0.2]);
  assert.deepEqual(s.public.days.map((d) => [d.date, d.graded, d.hits, d.unknownGraded, d.unknownHits]), [["2031-07-02", 2, 1, 0, 0], ["2031-07-01", 1, 0, 1, 1]]);
  assert.equal(s.public.slates, 2);
  assert.deepEqual(s.unknown.picks, [{ date: "2031-07-01", player: "P1", gamePk: 9, probability: 0.2, result: "hit" }]);
});

test("🔴 the verdict is the ledger's: only mlb_homer_nukes rows whose provenance is LEGACY_UNKNOWN", () => {
  const row = (o) => ({ family: "mlb_homer_nukes", receiptId: "mlb/homer-nukes/settled-2031-07-01.json", eventId: "9", subjectId: "mlb-player-1",
    modelId: "m", eventStart: "2031-07-01T17:00:00Z", publishedAt: null, provenance: { owner: "mlb-homer-nukes-settled" }, ...o });
  const keys = unknownPublicationKeys([
    row({}),
    row({ subjectId: "mlb-player-2", provenance: { owner: "mlb-homer-nukes-settled", recovered: { publishedAt: { value: "2031-07-01T15:00:00Z", state: "GIT_HISTORY", source: "git:abc" } } } }),
    row({ family: "mlb_total", subjectId: "mlb-player-3" }),
  ]);
  assert.deepEqual([...keys], ["2031-07-01|9|1"]);
});

/* ── Real data ─────────────────────────────────────────────────────────────────────────────────── */
const APP = process.cwd();
const DIR = path.join(APP, "public/data/mlb/homer-nukes");
const ROOT = path.resolve(APP, "..");
const days = fs.readdirSync(DIR).filter((f) => /^settled-\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));
const ledger = fs.readFileSync(path.join(ROOT, "data/internal/forecast-ledger/v1/mlb.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const record = JSON.parse(fs.readFileSync(path.join(DIR, "record.json"), "utf8"));

test("🔴 over every pick the split reproduces the owner's record.json and each day's own counts — a split, not a fork", () => {
  const all = homerNukesRecordSplit(days, new Set());
  assert.deepEqual([all.public.gradedPicks, all.public.actual, all.public.predicted, all.public.brier], [record.gradedPicks, record.actual, record.predicted, record.brier]);
  const byDate = new Map(days.map((d) => [d.date, d.day]));
  for (const d of all.public.days) {
    const own = byDate.get(d.date);
    if (typeof own?.graded === "number") assert.equal(d.graded, own.graded, `${d.date} graded`);
    if (typeof own?.actual === "number") assert.equal(d.hits, own.actual, `${d.date} homered`);
  }
});

test("🔴 the 15 audited picks: 14 graded (3 homered) move to publication status unknown; the public record excludes them", () => {
  /* Pinned through the audit's slates (the ledger is append-only, so these cannot move); later rows follow the rule. */
  const audited = (k) => k.split("|")[0] <= "2026-10-20";
  const keys = new Set([...unknownPublicationKeys(ledger)].filter(audited));
  assert.equal(keys.size, 15, "the provenance audit's 15 LEGACY_UNKNOWN Homer Nukes rows");
  const s = homerNukesRecordSplit(days.filter((d) => d.date <= "2026-10-20"), keys);
  assert.deepEqual([s.unknown.gradedPicks, s.unknown.actual], [14, 3], "Contreras 2026-09-07 has no measurement, so it is in no denominator");
  assert.deepEqual([s.public.gradedPicks, s.public.actual, s.public.predicted], [237, 35, 52.9078], "the public record: was 251 / 38 / 56.1995");
  const all = homerNukesRecordSplit(days, unknownPublicationKeys(ledger));
  assert.equal(all.public.gradedPicks + all.unknown.gradedPicks, record.gradedPicks, "no graded pick dropped");
  assert.equal(all.public.actual + all.unknown.actual, record.actual);
  assert.deepEqual(s.unknown.picks.map((p) => `${p.date} ${p.player}`).sort(), [
    "2026-08-27 Hunter Goodman", "2026-08-27 Jake Bauers", "2026-08-27 Matt Olson", "2026-08-27 Mickey Moniak", "2026-08-27 Yordan Alvarez",
    "2026-08-28 Hunter Goodman", "2026-08-28 Matt Olson", "2026-09-03 Kazuma Okamoto", "2026-09-03 Rafael Devers",
    "2026-09-06 Kyle Schwarber", "2026-09-06 Matt Olson", "2026-09-07 Kyle Schwarber", "2026-09-07 Pete Crow-Armstrong", "2026-09-10 Kyle Schwarber",
  ]);
});

test("🔴 /homer-nukes and the MLB hub's board read the split, never record.json's pooled figures", () => {
  const src = (p) => fs.readFileSync(path.join(APP, p), "utf8");
  for (const p of ["src/app/homer-nukes/page.tsx", "src/app/mlb/page.tsx"]) {
    assert.doesNotMatch(src(p), /homer-nukes", "record\.json"/, `${p} no longer reads the pooled record`);
    assert.match(src(p), /from "@\/lib\/results\/homer-nukes-record"/, `${p} reads the one split reader`);
  }
  assert.match(src("src/app/homer-nukes/page.tsx"), /record=\{split\.public\}/);
  assert.match(src("src/app/homer-nukes/page.tsx"), /Publication status unknown \(legacy\)/);
});
