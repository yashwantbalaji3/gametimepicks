/**
 * Session 5 · B3 — the risk-ladder record is the optimizer's CANDIDATE pool, and every surface must say so.
 *
 * parlays/risk-ladder record = every optimizer-graded slip in publicRiskSections: 383–1,608 over 94 days
 * (172–765 before the 2026-08-17 policy change). The cards the ladder actually published are a different
 * population — lab-ledger's MLB stream: 109 cards, 21–88, from 2026-08-17. Which population the public record
 * SHOULD count was a founder decision — D1 (Session 5): the public record is the PUBLISHED cards only; the candidate
 * pool is research / model detail.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = (p) => strip(fs.readFileSync(p, "utf8"));

test("D1 · every public band record is the PUBLISHED cards; the candidate pool is labelled model detail", () => {
  const meter = src("src/components/parlays/lab/chance-meter.tsx");
  assert.doesNotMatch(meter, /candidate/i, "the chance meter never shows the candidate pool");
  assert.match(meter, /decided published cards at this level landed/);

  const board = src("src/components/parlays/risk-ladder-board.tsx");
  assert.doesNotMatch(board, /All candidates in this band/, "no card carries the candidate pool");
  assert.match(board, /Our published cards in this band/);
  assert.equal((board.match(/<BandRecordRow record=\{publishedTierRecord\(/g) ?? []).length, 2, "both card layouts read through the published-only gate");
  assert.doesNotMatch(board, /card\.tierRecord\.wins|c\.tierRecord\.wins/, "no layout reads the raw tierRecord");
  const spot = src("src/components/parlays/lab/for-you-spotlight.tsx");
  assert.match(spot, /isPublishedRecord\(main\.tierRecord\) \? main\.tierRecord : null/);

  const stream = src("src/components/results/risk-ladder-stream.tsx");
  assert.match(stream, /Our published cards by risk level/);
  assert.match(stream, /One flat unit per published card/);
  assert.match(stream, /data-model-detail="candidate-pool"/, "the candidate pool sits in a model-detail disclosure");
  assert.match(stream, /research, not our record/);
  assert.ok(stream.indexOf("<details") > stream.indexOf('caption="Published cards by risk level"'), "the published table comes first; the pool only inside the disclosure");
  assert.doesNotMatch(stream.replace(/^.*import.*$/gm, ""), /optimizer/i, "internal pipeline vocabulary stays off /results (public-vocabulary guard)");

  for (const f of ["src/app/build/custom/page.tsx", "src/app/account/page.tsx"]) {
    const page = src(f);
    assert.match(page, /bandByTier = loadPublishedBandRecord\(dataRoot\)/, `${f}: the builder/slip band record is the published cards`);
    assert.doesNotMatch(page, /loadRiskLadderRecord/, `${f}: never the candidate pool`);
  }
  const producer = src("scripts/parlays/build-risk-ladder.mjs");
  assert.match(producer, /tierRecord: PUBLISHED\?\.byTier\?\.\[tier\] \?\? null/, "the card carries the published band record or nothing");

  const core = src("src/lib/results/projection-core.mjs");
  assert.match(core, /every optimizer CANDIDATE slip graded/);
});

test("LIVE: the two populations really are different, so the label matters", () => {
  const ladder = JSON.parse(fs.readFileSync("public/data/parlays/risk-ladder/latest.json", "utf8"));
  const ledger = JSON.parse(fs.readFileSync("public/data/parlays/lab-ledger.json", "utf8"));
  const pool = ladder.record?.overall;
  const published = (ledger.streams ?? []).find((s) => s.id === "mlb")?.record;
  if (!pool || !published) return;
  assert.ok(pool.wins + pool.losses > 5 * (published.wins + published.losses), `pool ${pool.wins}–${pool.losses} vs published ${published.wins}–${published.losses}`);
});

test("D1 · publishedBandRecord reads the ledger's stream, refuses an unsettled stream, and stamps its population", async () => {
  const { publishedBandRecord, isPublishedRecord, PUBLISHED_CARDS } = await import("../parlays/published-band-record.mjs");
  const ledger = {
    policy: { since: "2026-08-17" },
    streams: [
      { id: "mlb", settledDays: 3, record: { wins: 2, losses: 5, pushes: 0, hitRate: 0.2857, roi: -0.1 },
        byTier: { low: { wins: 0, losses: 0, pushes: 0, hitRate: null, roi: null }, medium: { wins: 2, losses: 1, pushes: 0, hitRate: 0.667, roi: 0.2 }, high: { wins: 0, losses: 4, pushes: 0, hitRate: 0, roi: -1 } } },
      { id: "nfl", settledDays: 0, record: { wins: 0, losses: 0, pushes: 0, hitRate: null, roi: null }, byTier: {} },
    ],
  };
  const r = publishedBandRecord(ledger, "mlb");
  assert.equal(r.population, PUBLISHED_CARDS);
  assert.deepEqual(Object.keys(r.byTier), ["medium", "high"], "an unsettled band carries no record (never a zero stand-in)");
  assert.equal(r.byTier.medium.since, "2026-08-17");
  assert.ok(isPublishedRecord(r.byTier.high));
  assert.equal(publishedBandRecord(ledger, "nfl"), null, "a stream with nothing settled is no record");
  assert.equal(publishedBandRecord(ledger, "epl"), null);
  assert.equal(publishedBandRecord(null), null);
  assert.equal(isPublishedRecord({ wins: 383, losses: 1608, hitRate: 0.19, roi: -0.1 }), false, "a pre-D1 candidate tierRecord (no population) is not shown");
});

test("D1 · LIVE: the board's band record on today's artifact is the published cards or nothing", () => {
  const ladder = JSON.parse(fs.readFileSync("public/data/parlays/risk-ladder/latest.json", "utf8"));
  const ledger = JSON.parse(fs.readFileSync("public/data/parlays/lab-ledger.json", "utf8"));
  const mlb = (ledger.streams ?? []).find((s) => s.id === "mlb");
  for (const c of ladder.cards ?? []) {
    if (c.tierRecord?.population !== "PUBLISHED_CARDS") continue; // pre-D1 artifact: the UI gate hides it
    const t = mlb?.byTier?.[c.tier];
    assert.ok(t, `${c.tier}: a published record exists for this band`);
    assert.equal(`${c.tierRecord.wins}-${c.tierRecord.losses}`, `${t.wins}-${t.losses}`, `${c.tier}: the card's band record IS the ledger's`);
  }
});

test("D1 · source pins: the Lab headline selector and the two candidate-pool cell kinds (behaviour: projection-core.test.mjs rule 6)", async () => {
  const core = await import("./projection-core.mjs");
  const ask = await import("../ask/tools/results.mjs");
  assert.deepEqual([...ask.MODEL_DETAIL_RECORD_TYPES], [...core.MODEL_DETAIL_RECORD_TYPES], "Ask mirrors the projection's model-detail types");
  const src = fs.readFileSync("src/lib/results/projection-core.mjs", "utf8");
  assert.match(src, /\[FAMILIES\.LAB\]: find\(\(c\) => c\.family === FAMILIES\.LAB && c\.recordType === RECORD_TYPES\.LAB_CARD_RECORD && c\.segment === "stream" && c\.sport === "mlb"\)/);
  assert.equal((src.match(/recordType: RECORD_TYPES\.CANDIDATE_POOL_RECORD/g) ?? []).length, 2, "overall + per-band candidate cells are model detail");
});
