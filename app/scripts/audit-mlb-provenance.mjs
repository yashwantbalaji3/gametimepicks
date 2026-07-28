/**
 * SPRINT 044 · Phase 4 — measure what MLB research inputs can actually answer "when did we know this?".
 *
 * Runs every committed pregame market snapshot through the canonical provenance model and reports the
 * real eligibility breakdown. Read-only: it changes no artifact and asserts nothing about the model's
 * accuracy — it answers only whether a row is usable as a pregame research input at all.
 *
 * The per-row comparison is what matters. A snapshot manifest carries one `capturedAt` for the whole
 * capture, but each event in it starts at a different time: a capture at 18:07Z is safely pregame for a
 * 23:10Z game and useless for one that started at 17:40Z. Judging the file as a unit would call that
 * whole capture clean, which is exactly the file-level-`generatedAt` mistake this model exists to end.
 *
 * Usage: npx tsx scripts/audit-mlb-provenance.mjs [--json]
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { evaluateProvenance, summarizeProvenance } from "../src/lib/identity/provenance.ts";

const ROOT = path.resolve(process.cwd(), "..");
const SNAPSHOTS = path.join(ROOT, "data/internal/mlb/pregame-archive/market-snapshots");

const readGz = (p) => {
  try {
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));
  } catch {
    return null;
  }
};

function collect() {
  if (!fs.existsSync(SNAPSHOTS)) return [];
  const records = [];

  for (const date of fs.readdirSync(SNAPSHOTS).sort()) {
    const dateDir = path.join(SNAPSHOTS, date);
    if (!fs.statSync(dateDir).isDirectory()) continue;

    for (const capture of fs.readdirSync(dateDir).sort()) {
      const dir = path.join(dateDir, capture);
      if (!fs.existsSync(path.join(dir, "manifest.json"))) continue;

      const payload = readGz(path.join(dir, "normalized.json.gz"));
      const rows = payload?.records ?? [];
      const marketType = capture.startsWith("props-") ? "player-props" : "team-markets";

      for (const row of rows) {
        const evaluated = evaluateProvenance({
          // The provider event id is the ALIAS; it is what the snapshot was keyed on, so it is what a
          // research join would use. Recorded as-is — the identity layer decides whether it resolves.
          eventId: String(row.providerEventId ?? ""),
          provider: "odds-api",
          marketType: `${marketType}:${row.market ?? "unknown"}`,
          capturedAt: row.capturedAt ?? null,
          availableAt: row.availableAt ?? null,
          sourceTimestamp: row.sourceLastUpdate ?? null,
          eventStart: row.eventStartTime ?? null,
        });
        records.push({
          ...evaluated,
          date,
          capture,
          gamePk: row.gamePk ?? null,
          // The flag the pipeline stored. Kept separate so the derivation stays independent of it.
          storedEligible: row.researchEligible === true,
        });
      }
    }
  }
  return records;
}

const records = collect();
const summary = summarizeProvenance(records);

// Independent cross-check: the pipeline stores its own `researchEligible` flag on every row. If our
// derivation disagrees with it, one of the two is wrong and the disagreement is the finding — a stored
// boolean that nothing re-derives is an assertion, not evidence.
const disagreements = records.filter((r) => r.storedEligible !== r.researchEligible);

if (process.argv.includes("--json")) {
  const byDate = {};
  for (const r of records) {
    byDate[r.date] ??= { total: 0, eligible: 0 };
    byDate[r.date].total += 1;
    if (r.researchEligible) byDate[r.date].eligible += 1;
  }
  console.log(JSON.stringify({
    kind: "mlb-provenance-audit", summary, byDate,
    storedFlagAgreement: {
      checked: records.length,
      disagreements: disagreements.length,
      examples: disagreements.slice(0, 5).map((d) => ({
        date: d.date, gamePk: d.gamePk, stored: d.storedEligible, derived: d.researchEligible, reason: d.reason,
      })),
    },
  }, null, 2));
} else {
  console.log("=== MLB research provenance ===");
  console.log(`  rows evaluated : ${summary.total}`);
  console.log(`  research eligible: ${summary.eligible} (${(summary.eligibleRate * 100).toFixed(1)}%)`);
  for (const [k, v] of Object.entries(summary.byEligibility)) {
    console.log(`    ${k.padEnd(20)} ${v}`);
  }
  console.log(`\n  stored researchEligible flag vs independent derivation:`);
  console.log(`    disagreements: ${disagreements.length} of ${records.length}`);
  for (const d of disagreements.slice(0, 5)) {
    console.log(`      ${d.date} gamePk ${d.gamePk}: stored=${d.storedEligible} derived=${d.researchEligible} — ${d.reason}`);
  }
  if (summary.total === 0) {
    console.log("\n  No snapshots on disk — nothing measured. This is not a pass.");
  }
}
