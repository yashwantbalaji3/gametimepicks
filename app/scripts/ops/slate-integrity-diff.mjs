#!/usr/bin/env node
/**
 * BEFORE / AFTER over two slate-integrity records.
 *
 *   node app/scripts/ops/slate-integrity-diff.mjs --before <p> --after <p> [--json <p>]
 *
 * ⚠ UNCHANGED IS A RESULT, AND IT IS REPORTED AS ONE. A refresh that moves nothing is the normal
 * outcome when no model or input has changed, and an audit that goes looking for differences until
 * it finds some is worse than no audit: it manufactures the impression of progress. Every game gets
 * one of three states — UNCHANGED, CHANGED (with the fields that moved) or APPEARED/DISAPPEARED —
 * and the summary leads with how many did not move.
 *
 * ⚠ A TIMESTAMP IS NOT A CHANGE. Regenerating rewrites generatedAt on every artifact whether or not
 * a single number moved, so the stamps are recorded but never counted as material. What counts is
 * the forecast, the probabilities, the availability evidence and who was excluded.
 */
import fs from "node:fs";
import path from "node:path";
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const before = read(arg("before"));
const after = read(arg("after"));

/**
 * Fields whose movement means A READER'S ANSWER CHANGED. Nothing else belongs here.
 *
 * ⚠ inputHash WAS IN THIS LIST AND IT WAS WRONG (2026-09-25). The first NFL refresh reported "15
 * changed" while every expected score, win probability, total and hard exclusion was byte-identical
 * across all 15 games. The hash incorporates the capture stamps of its inputs, so re-running the
 * producer moves it whether or not a single number moves — a stamp in disguise, and exactly the
 * class this file already excluded generatedAt for. Counting it manufactured the appearance of a
 * refresh that changed something.
 */
const MATERIAL = [
  ["expected.score", (g) => g.expected?.score],
  ["expected.runs", (g) => g.expected?.runs],
  ["expected.medianSimScore", (g) => g.expected?.medianSimScore],
  ["expected.goals", (g) => g.expected?.goals],
  ["expected.winProbability", (g) => g.expected?.winProbability],
  ["expected.probabilities", (g) => g.expected?.probabilities],
  ["expected.total", (g) => g.expected?.total],
  ["expected.totalRuns", (g) => g.expected?.totalRuns],
  ["expected.prediction", (g) => g.expected],
  ["model", (g) => g.forecastSnapshot?.model],
  ["modelVersion", (g) => g.forecastSnapshot?.version ?? g.forecastSnapshot?.simulationVersion],
  ["availability.hardExclusions", (g) => (g.availability?.hardExclusions ?? []).map((e) => `${e.name}:${e.state}`).sort()],
  ["availability.lineupSource", (g) => g.availability?.lineupSource],
  ["availability.level", (g) => g.availability?.level],
  ["expectedStarters", (g) => g.expectedStarters],
];

/**
 * Fields that record WHICH EVIDENCE WAS READ, not what the answer is.
 *
 * They are reported because "the injury feed was re-read and the forecast did not move" is a
 * genuinely different fact from "nothing ran" — and hiding them would make a working refresh look
 * like a no-op. They are never counted as material.
 */
const PROVENANCE = [
  ["inputHash", (g) => g.forecastSnapshot?.inputHash ?? g.forecastSnapshot?.artifactHash],
  ["availability.snapshotAsOf", (g) => g.availability?.snapshotAsOf],
  ["sportsbook.capturedAt", (g) => g.sportsbook?.capturedAt],
  ["playerProjection.pricedSlots", (g) => g.playerProjectionSnapshot?.pricedSlots],
];

const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const out = { schemaVersion: 1, artifact: "slate-integrity-diff", dataClass: "INTERNAL_RESEARCH", before: before.generatedAt, after: after.generatedAt, sports: {} };
for (const sport of Object.keys(after.sports)) {
  const b = new Map((before.sports[sport]?.games ?? []).map((g) => [g.eventId, g]));
  const a = new Map((after.sports[sport]?.games ?? []).map((g) => [g.eventId, g]));
  const rows = [];
  for (const [id, ag] of a) {
    const bg = b.get(id);
    if (!bg) { rows.push({ eventId: id, matchup: ag.matchup, state: "APPEARED" }); continue; }
    const moved = [];
    for (const [label, pick] of MATERIAL) {
      const x = pick(bg), y = pick(ag);
      if (x === undefined && y === undefined) continue;
      if (!eq(x, y)) moved.push({ field: label, before: x ?? null, after: y ?? null });
    }
    const refreshed = [];
    for (const [label, pick] of PROVENANCE) {
      const x = pick(bg), y = pick(ag);
      if (x === undefined && y === undefined) continue;
      if (!eq(x, y)) refreshed.push({ field: label, before: x ?? null, after: y ?? null });
    }
    rows.push(moved.length
      ? { eventId: id, matchup: ag.matchup, state: "CHANGED", moved, evidenceRefreshed: refreshed }
      : { eventId: id, matchup: ag.matchup, state: "UNCHANGED", evidenceRefreshed: refreshed });
  }
  for (const [id, bg] of b) if (!a.has(id)) rows.push({ eventId: id, matchup: bg.matchup, state: "DISAPPEARED" });
  const counts = rows.reduce((m, r) => ({ ...m, [r.state]: (m[r.state] ?? 0) + 1 }), {});
  out.sports[sport] = {
    beforeState: before.sports[sport]?.state ?? null, afterState: after.sports[sport]?.state ?? null,
    counts, games: rows,
  };
}
out.summary = Object.fromEntries(Object.entries(out.sports).map(([s, v]) => [s, v.counts]));
for (const [s, v] of Object.entries(out.sports)) {
  const c = v.counts;
  const refreshedOnly = v.games.filter((x) => x.state === "UNCHANGED" && (x.evidenceRefreshed ?? []).length).length;
  console.log(`${s.padEnd(4)} unchanged=${String(c.UNCHANGED ?? 0).padStart(3)}  materially changed=${String(c.CHANGED ?? 0).padStart(3)}  (of the unchanged, ${refreshedOnly} re-read their evidence and did not move)`);
  for (const g of v.games.filter((x) => x.state === "CHANGED").slice(0, 8)) {
    console.log(`     ${g.matchup}: ${g.moved.map((m) => m.field).join(", ")}`);
  }
}
const j = arg("json");
if (j) { fs.mkdirSync(path.dirname(j), { recursive: true }); fs.writeFileSync(j, `${JSON.stringify(out, null, 2)}\n`); console.log(`wrote ${j}`); }
