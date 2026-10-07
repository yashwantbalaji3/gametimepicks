#!/usr/bin/env node
/**
 * Stage 3E · optional Soccer slice — read-only readout of EPL match questions on Soccer's canonical identity.
 * Run from app/: node scripts/results/epl-matches-of-record.mjs   (exits 1 on an id conflict or a two-row match)
 */
import fs from "node:fs";
import path from "node:path";
import { eplMatchesOfRecord } from "../../src/lib/results/epl-matches-of-record.mjs";

const DIR = path.join(process.cwd(), "public/data/soccer/epl");
const copies = [];
for (const f of fs.readdirSync(path.join(DIR, "forecasts")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, "forecasts", f), "utf8"));
  for (const r of d.rows ?? []) copies.push({ ...r, publishedAt: r.forecastAt ?? d.generatedAt, probs: r.probs ?? r.forecast?.probs ?? null });
}
const graded = fs.readFileSync(path.join(DIR, "results/graded-forecasts.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const captures = fs.readdirSync(path.join(DIR, "fixtures")).filter((f) => f.startsWith("capture-"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, "fixtures", f), "utf8")));
const s = eplMatchesOfRecord({ copies, graded, captures });
console.log(`EPL 1X2: ${copies.length} forecast copies · ${s.providerIds} provider ids · ${s.matches} matches of record (${s.graded.length} graded from the grader log, ${s.pending.length} pending) · ${s.matchesWithSeveralIds} matches under several ids`);
console.log(`not forecast (every copy withheld, no probability published): ${s.notForecast.length}${s.notForecast.map((m) => `\n  · ${m.key} ${String(m.kickoffUtc).slice(0, 10)} (${m.reason})`).join("")}`);
console.log(`not of record: ${s.withheldCopies} withheld copies · ${s.supersededByGrader} copies of graded matches · ${s.superseded} earlier copies · ${s.late.length} late · ${s.conflicts.length} conflicts · ${s.idConflicts.length} id conflicts · ${s.ambiguous} ambiguous · ${s.unkeyed.length} unkeyed`);
process.exit(s.conflicts.length || s.idConflicts.length ? 1 : 0);
