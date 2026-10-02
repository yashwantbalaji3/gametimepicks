/**
 * Session 5 · B3 — the risk-ladder record is the optimizer's CANDIDATE pool, and every surface must say so.
 *
 * parlays/risk-ladder record = every optimizer-graded slip in publicRiskSections: 383–1,608 over 94 days
 * (172–765 before the 2026-08-17 policy change). The cards the ladder actually published are a different
 * population — lab-ledger's MLB stream: 109 cards, 21–88, from 2026-08-17. Which population the public record
 * SHOULD count is a founder decision; until then no surface may call the candidate pool "cards".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = (p) => strip(fs.readFileSync(p, "utf8"));

test("the four surfaces that render the candidate-pool record name it as candidates, never as cards", () => {
  const meter = src("src/components/parlays/lab/chance-meter.tsx");
  assert.doesNotMatch(meter, /decided cards at this level/);
  assert.match(meter, /decided candidate slips at this level landed/);

  const board = src("src/components/parlays/risk-ladder-board.tsx");
  assert.doesNotMatch(board, /"This tier"|>\s*This tier\s*</, "a published card's neighbour must not call the pool 'this tier'");
  assert.equal((board.match(/All candidates in this band/g) ?? []).length, 2, "both card layouts label the pool");

  const stream = src("src/components/results/risk-ladder-stream.tsx");
  assert.doesNotMatch(stream, /One flat unit per card,/);
  assert.match(stream, /One flat unit per graded candidate slip/);
  assert.doesNotMatch(stream.replace(/^.*import.*$/gm, ""), /optimizer/i, "internal pipeline vocabulary stays off /results (public-vocabulary guard)");
  assert.match(stream, /not only the cards the ladder\s+published/);
  assert.match(stream, /2026-08-17/, "the unsegmented policy change is stated");

  const core = src("src/lib/results/projection-core.mjs");
  assert.doesNotMatch(core, /whole paper cards W–L/);
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
