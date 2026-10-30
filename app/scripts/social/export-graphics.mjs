#!/usr/bin/env node
/**
 * GRAPHICS EXPORT CLI — writes one `gtp-graphics-export@1` document (lib/social/graphics-export.mjs) from the COMMITTED
 * artifacts the website renders. Read-only over the repository; never fetches, never reads .env, never reads the clock.
 *
 *   cd app && npx tsx scripts/social/export-graphics.mjs --sport nfl --season-type 2 --week 8 --as-of 2026-10-30T13:00:00Z [--out <file>]
 *   cd app && npx tsx scripts/social/export-graphics.mjs --sport nba --date 2026-10-30 --as-of 2026-10-30T13:00:00Z [--out <file>]
 *
 * --as-of is REQUIRED (no clock): rows only from games that have not started at that instant. Same inputs + same --as-of
 * → byte-identical output. Default --out: app/.graphics-export/<sport>-<key>.json (git-ignored; never under public/ or
 * out/, so it is never served under /data). Run with `npx tsx` (the snapshot module imports TypeScript).
 *
 * NBA OVER/UNDER line-comparison edition (`gtp-graphics-export@2`, lib/social/nba-line-graphics-export.mjs):
 *   cd app && npx tsx scripts/social/export-graphics.mjs --sport nba --edition lines --date 2026-10-30 --as-of <ISO> [--purpose social|founder-review] [--out <file>]
 * Default purpose social: medians only, every line/price/direction WITHHELD (social not authorized 2026-10-29).
 * --purpose founder-review: values included (needs GTP_ODDS_DISPLAY_KEY in the environment), document marked
 * FOUNDER_REVIEW_ONLY / socialAuthorized:false, written only OUTSIDE every git repository (default ~/gtp-private/graphics/<date>/).
 *
 * Exit codes: 0 written (publication.status PUBLISHED); 3 written but nothing publishable (NOT_PUBLISHED / NO_GAMES /
 * NO_UPCOMING_GAMES); 1 refused (bad arguments, a contract violation, or a canonical-value mismatch — nothing written).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildNflGraphicsExport, buildNbaGraphicsExport, graphicsExportViolations, serializeGraphicsExport } from "../../src/lib/social/graphics-export.mjs";
import { loadForecastViews } from "../../src/lib/sports/nfl/forecast-view-load.mjs";
import { forwardEvidenceFor } from "../../src/lib/products/engine-v2/family-gate.mjs";
import { nbaOfficialSnapshot, SnapshotRefusal } from "../../src/lib/consistency/official-snapshot.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument ${a}`);
    out[a.slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

const readRel = (rel) => {
  try { const buf = fs.readFileSync(path.join(REPO, rel)); return { rel, buf, doc: JSON.parse(buf.toString("utf8")), sha256: sha(buf) }; } catch { return null; }
};

/** The builder's inputs for an NFL week, read from the committed files (exported for tests). */
export function nflExportArgs({ seasonType, week, asOf }) {
  const dir = "app/public/data/nfl/player-board";
  const boards = [];
  const boardSha256 = {};
  const inputs = [];
  for (const f of fs.readdirSync(path.join(REPO, dir)).filter((n) => /^\d+\.json$/.test(n)).sort()) {
    const r = readRel(`${dir}/${f}`);
    if (!r || r.doc.seasonType !== seasonType || r.doc.week !== week) continue;
    boards.push(r.doc);
    boardSha256[String(r.doc.providerEventId)] = r.sha256;
    inputs.push({ ref: r.rel, sha256: r.sha256 });
  }
  for (const rel of ["app/public/data/nfl/forecasts/latest.json", "app/public/data/nfl/forecasts/frozen-latest.json"]) {
    const r = readRel(rel);
    inputs.push({ ref: rel, sha256: r?.sha256 ?? null });
  }
  // readiness wording only (the forward-test count of a held family), exactly as the weekly-boards builder reads it
  const fwd = readRel("data/internal/research/nfl/replay/player-props-share-level-forward/receipt.json");
  inputs.push({ ref: "nfl-share-level-forward-receipt", sha256: fwd?.sha256 ?? null });
  const views = loadForecastViews(path.join(APP, "public")).filter((v) => v.seasonType === seasonType && v.week === week);
  return {
    seasonType, week, asOf, boards, views, boardSha256, inputs,
    forwardFor: (family, modelVersion) => forwardEvidenceFor({ family, modelVersion, forwardReceipt: fwd?.doc ?? null }),
  };
}

/** The same source paths the consistency audit hashes into the snapshot (lib/consistency/audit.mjs NBA_FORECASTS). */
const NBA_FORECASTS = (family, date) => `data/internal/research/nba/experimental-${family}/forecasts/${date}.json`;

/** The builder's inputs for an NBA date, read from the committed files (exported for tests). */
export function nbaExportArgs({ date, asOf }) {
  const laneRel = `app/public/data/nba/experimental-public/${date}.json`;
  const lane = readRel(laneRel);
  const off = readRel(NBA_FORECASTS("v0.1", date));
  const sup = readRel(NBA_FORECASTS("v1", date));
  const snapshots = new Map();
  for (const g of lane?.doc?.games ?? []) {
    const id = String(g.providerEventId);
    try {
      snapshots.set(id, { snapshot: nbaOfficialSnapshot(id, { official: off ? { doc: off.doc, path: off.rel, sha256: off.sha256 } : null, supporting: sup ? { doc: sup.doc, path: sup.rel, sha256: sup.sha256 } : null }), refusal: null });
    } catch (e) {
      if (!(e instanceof SnapshotRefusal)) throw e;
      snapshots.set(id, { snapshot: null, refusal: e.code });
    }
  }
  const inputs = [
    { ref: laneRel, sha256: lane?.sha256 ?? null },
    { ref: `nba-official-receipts:v0.1/${date}`, sha256: off?.sha256 ?? null },
    { ref: `nba-supporting-receipts:v1/${date}`, sha256: sup?.sha256 ?? null },
  ];
  const doc = lane?.doc?.date === date ? lane.doc : null;
  return { date, asOf, lane: doc, snapshots, laneSha256: lane?.sha256 ?? null, inputs };
}

export function runExport(args) {
  const sport = args.sport;
  const asOf = args["as-of"];
  if (!asOf || !Number.isFinite(Date.parse(asOf)) || !/T.*(Z|[+-]\d\d:\d\d)$/.test(asOf)) throw new Error("--as-of <ISO instant with zone> is required (no clock is read)");
  let doc;
  let key;
  if (sport === "nfl") {
    const seasonType = Number(args["season-type"] ?? 2);
    const week = Number(args.week);
    if (!Number.isInteger(week) || !Number.isInteger(seasonType)) throw new Error("--week <n> is required for nfl (--season-type defaults to 2)");
    doc = buildNflGraphicsExport(nflExportArgs({ seasonType, week, asOf }));
    key = `nfl-${doc.edition.key}`;
  } else if (sport === "nba") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.date ?? ""))) throw new Error("--date YYYY-MM-DD is required for nba");
    doc = buildNbaGraphicsExport(nbaExportArgs({ date: args.date, asOf }));
    key = `nba-${args.date}`;
  } else throw new Error("--sport nfl|nba is required");
  const violations = graphicsExportViolations(doc);
  if (violations.length) throw new Error(`contract violations:\n  - ${violations.slice(0, 20).join("\n  - ")}`);
  const out = path.resolve(args.out ?? path.join(APP, ".graphics-export", `${key}.json`));
  for (const served of [path.join(APP, "public"), path.join(APP, "out"), path.join(APP, ".next")]) {
    if (out === served || out.startsWith(served + path.sep)) throw new Error(`--out ${out} is inside ${served}: the export is never served`);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, serializeGraphicsExport(doc));
  return { out, doc };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.edition === "lines") {
    // gtp-graphics-export@2, NBA line-comparison edition (scripts/social/nba-line-graphics-io.mjs).
    if (args.sport !== "nba") throw new Error("--edition lines is NBA only (--sport nba)");
    const { runLineExport } = await import("./nba-line-graphics-io.mjs");
    const { out, doc } = runLineExport(args);
    console.log(`${doc.schemaVersion} ${doc.edition.kind} ${doc.edition.key} as of ${doc.asOf} purpose ${doc.purpose} (socialAuthorized ${doc.socialAuthorized}): ${doc.publication.status} · ${doc.rows.length} rows · excluded ${JSON.stringify(doc.scope.excludedByReason)} → ${out}`);
    return doc.publication.status === "PUBLISHED" || doc.publication.status === "LINES_WITHHELD" ? 0 : 3;
  }
  const { out, doc } = runExport(args);
  const eligible = doc.rows.filter((r) => r.graphicEligibility.eligible).length;
  console.log(`${doc.schemaVersion} ${doc.sport} ${doc.edition.key} as of ${doc.asOf}: ${doc.publication.status} · ${doc.scope.eventsIncluded.length} games · ${doc.rows.length} rows (${eligible} graphic-eligible) · ${doc.scope.eventsExcludedStarted.length} started games excluded → ${out}`);
  return doc.publication.status === "PUBLISHED" ? 0 : 3;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => {
    console.error(`REFUSED: ${e.message}`);
    process.exit(1);
  });
}
