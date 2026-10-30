#!/usr/bin/env node
/**
 * PREVIEW the NBA OVER/UNDER cards from SYNTHETIC test data (scripts/social/synthetic-line-artifact.mjs): the real
 * committed lane for --date (default 2026-10-29), invented lines, fake prices (+999 / −999), encrypted under a throwaway
 * key in a temp dir, read back through THE reader, rendered in founder-review mode with the "TEST DATA — NOT LIVE ODDS"
 * watermark. Output only outside every repository (default ~/gtp-private/graphics/previews-v2/ for the box-score
 * template, ~/gtp-private/graphics/previews/ for --template table).
 *
 *   cd app && npx tsx scripts/social/preview-nba-line-graphics.mjs [--date 2026-10-29] [--as-of 2026-10-29T22:00:00Z] [--out <dir>] [--template boxscore|table] [--per-team 8]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { APP, DEFAULT_PRIVATE_ROOT } from "./nba-line-graphics-io.mjs";
import { buildSyntheticLineArtifact, writeSyntheticArtifact } from "./synthetic-line-artifact.mjs";
import { renderNbaLineGraphics, parseArgs } from "./render-nba-line-graphics.mjs";
import { ODDS_DISPLAY_KEY_ENV } from "../../src/lib/odds/display-crypto.mjs";
import { NBA_LINES_DIR_ENV } from "../../src/lib/sports/nba/line-publication.mjs";

const HOUR = 3600_000;
const iso = (ms) => new Date(ms).toISOString().replace(/\.000Z$/, "Z");

/** Synthetic env + timing for `date` at `asOf` (artifact asOf 1 h earlier; fresh quotes 1.5 h earlier; stale 6.5 h). */
export function syntheticSetup({ date, asOf, dir, perTeam }) {
  const laneFile = path.join(APP, "public", "data", "nba", "experimental-public", `${date}.json`);
  const buf = fs.readFileSync(laneFile);
  const lane = JSON.parse(buf.toString("utf8"));
  const t = Date.parse(asOf);
  const artifact = buildSyntheticLineArtifact({ lane, laneSha256: crypto.createHash("sha256").update(buf).digest("hex"), asOf: iso(t - HOUR), freshAt: iso(t - 1.5 * HOUR), staleAt: iso(t - 6.5 * HOUR), ...(perTeam ? { perTeam } : {}) });
  const w = writeSyntheticArtifact(artifact, dir ? { dir } : undefined);
  const env = { ...process.env, ...w.env };
  return { lane, artifact, env, dir: w.dir };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2));
  const date = a.date ?? "2026-10-29";
  const asOf = a["as-of"] ?? "2026-10-29T22:00:00Z";
  // Never inherit a real key or a real artifact directory: the synthetic setup overrides both.
  delete process.env[ODDS_DISPLAY_KEY_ENV];
  delete process.env[NBA_LINES_DIR_ENV];
  // the box-score preview quotes 8 players a side so a full card (6 a side) and a second card are both exercised
  const { env, dir } = syntheticSetup({ date, asOf, perTeam: Number(a["per-team"] ?? (a.template === "table" ? 4 : 8)) });
  const template = a.template ?? "boxscore";
  renderNbaLineGraphics({ date, "as-of": asOf, purpose: "founder-review", template, out: a.out ?? path.join(DEFAULT_PRIVATE_ROOT, template === "table" ? "previews" : "previews-v2"), scales: a.scales ?? "1,2" }, env)
    .then(({ outDir, doc, pngs }) => {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`SYNTHETIC preview (${doc.artifact.dataClass}) ${doc.edition.date} as of ${doc.asOf}: ${doc.rows.length} rows, excluded ${JSON.stringify(doc.scope.excludedByReason)}, ${pngs.length} PNGs → ${outDir}`);
    }, (e) => { fs.rmSync(dir, { recursive: true, force: true }); console.error(`REFUSED: ${e.message}`); process.exit(1); });
}
