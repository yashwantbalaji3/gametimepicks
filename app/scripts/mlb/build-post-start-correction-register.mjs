#!/usr/bin/env node
/**
 * POST-START SIMULATION CORRECTION REGISTER (P247 Release E) — append-only public disclosure.
 *
 * From 2026-08-22 (the day mlb-lineup-refresh began re-running the full-game simulation) to
 * 2026-09-07 (the boundary fix landing in P246/P247), late reruns REPLACED the served
 * full-game artifact with revisions generated AFTER first pitch while still presenting as
 * pregame. The GRADED record was never touched — the grader's forecast-of-record rule already
 * selects the newest revision strictly BEFORE first pitch from immutable snapshots — but the
 * PAGES served those late revisions until each next regeneration, and the committed archive
 * for those dates still carries them as its final revision.
 *
 * This register enumerates every affected (date, game) from the committed artifacts
 * themselves. It is DERIVED and idempotent; the archive is not rewritten (pregame revisions
 * cannot be reconstructed without post-event knowledge), the entries are not deletions — the
 * renderer discloses the provenance on every affected archived report.
 *
 * Usage: node scripts/mlb/build-post-start-correction-register.mjs --now <iso>
 * Writes: public/data/mlb/corrections/post-start-simulations.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(APP, "public/data/mlb/full-game-simulations");
const OUT_DIR = path.join(APP, "public/data/mlb/corrections");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const WINDOW_START = "2026-08-22";
const WINDOW_END = "2026-09-07";

const entries = [];
for (const f of fs.readdirSync(DIR).filter((x) => /^2026-\d{2}-\d{2}\.json$/.test(x)).sort()) {
  const date = f.slice(0, 10);
  if (date < WINDOW_START || date > WINDOW_END) continue;
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  for (const g of doc.games ?? []) {
    const fp = g.firstPitch;
    const lvl = g.completeness?.level;
    if (fp && doc.generatedAt && fp < doc.generatedAt && (lvl === "ready" || lvl === "degraded")) {
      entries.push({
        date,
        gamePk: g.gamePk,
        slug: g.slug,
        firstPitchUtc: fp,
        finalRevisionGeneratedAt: doc.generatedAt,
        reasonCode: "SIMULATED_AFTER_FIRST_PITCH_PRESENTED_AS_PREGAME",
      });
    }
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "post-start-simulations.json"), JSON.stringify({
  schemaVersion: 1,
  artifact: "mlb-post-start-simulation-corrections",
  dataClass: "PUBLIC",
  generatedAt: NOW,
  window: { start: WINDOW_START, end: WINDOW_END, cause: "mlb-lineup-refresh re-ran the full-game simulation against the board's pre-event stamp instead of its own clock; fixed 2026-09-08 (boundary re-derived per run, genuinely pregame priors carried forward byte-for-byte)" },
  gradingImpact: "NONE — the graded record's forecast-of-record rule selects the newest revision strictly BEFORE first pitch from immutable per-run snapshots; no post-start revision was ever graded. Verified empirically (P248): every graded row's forecastGeneratedAt precedes its firstPitchUtc.",
  alsoAffects: [
    "public/data/mlb/predictions/<date>.json — Engine C reruns in the same lineup-refresh step, so its final committed revisions in this window are post-start for the SAME (date, gamePk) set enumerated below; a prediction exists only where a simulation does.",
  ],
  notAffected: [
    "graded record / hit rates / model-audit aggregates (derive from pre-pitch snapshots — rule and data both verified)",
    "MLB boards, player-prop picks (Engine A runs only in the pregame daily-production window)",
    "parlay tier-grid, Bank Builder, Moonshot, portfolio (consume board/optimizer artifacts, never the full-game sim; predictions are never settled into money by contract)",
  ],
  servedImpact: `${entries.length} archived game reports carry, as their final committed revision, a simulation generated after first pitch. Each renders a provenance disclosure; the pregame forecast of record for these games lives in the immutable snapshots and git history and is what the record was graded from.`,
  entries,
}, null, 1) + "\n");
console.log(`post-start correction register: ${entries.length} entries across the ${WINDOW_START}..${WINDOW_END} window`);
