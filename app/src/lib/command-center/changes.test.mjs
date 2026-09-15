/**
 * P311 — "what changed" is derived, never invented: model-state transitions come from the scorecard's own record of
 * the artifact it overwrote; MLB forecast moves come from today's first and latest frozen snapshots; a day without a
 * previous state has nothing to say.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { healthTransitions, CHANGE_WINDOW_DAYS } from "../ops/health-changes.mjs";
import { buildChangeLog } from "./changes.ts";

const NOW = "2026-09-15T12:00:00Z";
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gtp-chg-"));
const write = (root, rel, doc) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(doc)); };

test("the scorecard records only real transitions, carries them for the window, and never counts a first sighting", () => {
  const prev = { families: [{ id: "mlb_total", state: "WATCH" }, { id: "mlb_moneyline", state: "WATCH" }], changes: [{ id: "old", from: "HOLDING", to: "WATCH", at: "2026-08-01T00:00:00Z" }, { id: "recent", from: "WATCH", to: "HOLDING", at: "2026-09-10T00:00:00Z" }] };
  const out = healthTransitions(prev, [{ id: "mlb_total", state: "BREACHED", sport: "mlb", label: "MLB total picks" }, { id: "mlb_moneyline", state: "WATCH" }, { id: "brand_new", state: "HOLDING" }], NOW);
  assert.deepEqual(out.map((c) => [c.id, c.from, c.to]), [["mlb_total", "WATCH", "BREACHED"], ["recent", "WATCH", "HOLDING"]], "newest first; the August entry aged out; the new family is not a change");
  assert.equal(out[0].at, NOW);
  assert.ok(CHANGE_WINDOW_DAYS >= 7);
  assert.deepEqual(healthTransitions(null, [{ id: "x", state: "HOLDING" }], NOW), [], "no previous artifact ⇒ nothing to say");
});

test("model-state changes speak the public vocabulary and a BREACHED family reads PAUSED only where the gate acts", () => {
  const root = tmp();
  write(root, "public/data/admin/model-health.json", { generatedAt: "2026-09-15T02:00:00Z", families: [{ id: "mlb_total", sport: "mlb", label: "MLB total picks", state: "BREACHED" }, { id: "ufc_winner", sport: "ufc", state: "BREACHED" }],
    changes: [{ id: "mlb_total", sport: "mlb", label: "MLB total picks", from: "WATCH", to: "BREACHED", at: "2026-09-14T16:01:00Z" }, { id: "ufc_winner", sport: "ufc", label: "UFC fight winner", from: "HOLDING", to: "BREACHED", at: "2026-09-14T16:01:00Z" }, { id: "stale", from: "WATCH", to: "HOLDING", at: "2026-08-20T00:00:00Z" }] });
  const log = buildChangeLog({ dataRoot: path.join(root, "public/data"), repoRoot: root, today: "2026-09-15", nowIso: NOW });
  assert.equal(log.modelStates.length, 2, "the August change is outside the 7-day window");
  assert.equal(log.modelStates.find((c) => c.id === "mlb_total").line, "MLB total picks: Watch → Paused");
  assert.equal(log.modelStates.find((c) => c.id === "ufc_winner").to, "WATCH", "BREACHED without a gate is Watch, never Paused");
  assert.deepEqual(log.forecastMoves, []);
  assert.equal(log.snapshotWindow.first, null, "no snapshot ⇒ no comparison claimed");
});

test("MLB forecast moves: first vs latest snapshot, only real moves, withdrawals and pauses named", () => {
  const root = tmp();
  const pred = (over = {}) => ({ gamePk: 1, slug: "a-vs-b", awayTeam: "LAA", homeTeam: "SF", status: "ready", moneyline: { team: "SF", simulationProbability: 0.55 }, total: { pick: "OVER", line: 8.5 }, ...over });
  write(root, "data/internal/mlb/prediction-snapshots/2026-09-15/snapshot-202609151000.json", { generatedAt: "2026-09-15T14:00:00Z", predictions: [pred(), pred({ gamePk: 2, slug: "c-vs-d", moneyline: { team: "NYY", simulationProbability: 0.6 } }), pred({ gamePk: 3, slug: "e-vs-f" }), pred({ gamePk: 4, slug: "g-vs-h" })] });
  write(root, "data/internal/mlb/prediction-snapshots/2026-09-15/snapshot-202609151500.json", { generatedAt: "2026-09-15T19:00:00Z", predictions: [
    pred({ moneyline: { team: "SF", simulationProbability: 0.62 } }),
    pred({ gamePk: 2, slug: "c-vs-d", moneyline: null, pausedReasons: { moneyline: "paused" } }),
    pred({ gamePk: 3, slug: "e-vs-f", moneyline: { team: "SF", simulationProbability: 0.57 }, total: { pick: "UNDER", line: 8.5 } }),
    pred({ gamePk: 4, slug: "g-vs-h", status: "unavailable" }),
  ] });
  const log = buildChangeLog({ dataRoot: path.join(root, "public/data"), repoRoot: root, today: "2026-09-15", nowIso: NOW });
  assert.equal(log.snapshotWindow.games, 3, "a game unavailable in either snapshot is not compared");
  assert.deepEqual(log.forecastMoves.map((m) => m.kind), ["winner_moved", "winner_call_paused", "total_flipped"]);
  assert.match(log.forecastMoves[0].line, /SF 55% → 62% \(\+7 points\)/);
  assert.match(log.forecastMoves[1].line, /was paused \(was NYY 60%\)/);
  assert.match(log.forecastMoves[2].line, /flipped from OVER 8.5 to UNDER 8.5/);
});

test("SOURCE PIN · the scorecard builder writes `changes`; /today mounts the brief from the change log", () => {
  const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  assert.match(src("scripts/ops/build-model-health.mjs"), /healthTransitions\(previous, families, NOW\)/);
  assert.match(src("scripts/ops/build-model-health.mjs"), /\n  changes,\n/);
  assert.match(src("src/app/today/page.tsx"), /<GameTimeBrief changes=\{buildChangeLog\(/);
  assert.doesNotMatch(src("src/components/brief/gametime-brief.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""), /best bet|\block\b|\bedge\b/i);
});
