#!/usr/bin/env node
/**
 * Capture nflverse snap counts into compact research tables (participation v1 · research only). $0, no key.
 *
 *   node scripts/nfl/capture-nfl-snap-counts.mjs --now <ISO> [--seasons 2022,2023,2024,2025,2026]
 *
 * Sources (nflverse, CC BY 4.0, https://github.com/nflverse):
 *   releases/snap_counts/snap_counts_<season>.csv   per player-game snaps, sourced from Pro-Football-Reference
 *   releases/players/players.csv                    pfr_id / gsis_id / espn_id crosswalk (the id bridge)
 *
 * Writes (derived only; raw CSVs are never written, because the repository is public):
 *   data/internal/research/nfl/snap-counts/snap-counts-<season>.json   the SNAP_COLUMNS only, one row per line
 *   data/internal/research/nfl/snap-counts/id-bridge-v1.json           pfr → gsis/espn for every PFR id in the tables
 *   data/internal/research/nfl/snap-counts/manifest-v1.json            row counts, content hashes, id-join audit
 *
 * EVERY sheet row is kept, including special-teams-only rows (offense_snaps = 0). A sheet lists everyone who
 * took a snap in any phase, so the full sheet is what lets "absent from the sheet" mean "did not take a snap"
 * and keeps a special-teams-only game a real 0 instead of an absence.
 *
 * IDEMPOTENT: a file is rewritten only when its content changes (capturedAt and the raw-byte stamps are
 * ignored for that comparison), so an unchanged re-run writes nothing and a weekly commit step sees no diff.
 * A season at or after the --now year that is not published yet (HTTP 404) is recorded and skipped. Any other
 * failure exits non-zero: fail loud.
 *
 * Nothing here feeds a model, a board, a promotion or a public page. See
 * data/internal/research/nfl/preregistration-participation-v1.json.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../../src/lib/sports/nfl/nflverse.mjs";
import {
  SNAP_COLUMNS, SNAP_SHARE_ID, normalizeSnapCsvRow, compareSnapRows, snapRowsFromTable, buildIdBridge, auditIdJoin, canonicalJson,
} from "../../src/lib/sports/nfl/snap-share.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!Number.isFinite(Date.parse(NOW ?? ""))) { console.error("usage: --now <ISO> [--seasons 2022,2023,2024,2025,2026]"); process.exit(2); }
const nowYear = new Date(NOW).getUTCFullYear();
const seasons = (arg("--seasons") ?? `2022,2023,2024,2025,${nowYear}`).split(",").map(Number);
if (seasons.some((s) => !Number.isInteger(s) || s < 2012 || s > nowYear)) { console.error(`bad --seasons ${seasons}`); process.exit(2); }

const REL = "https://github.com/nflverse/nflverse-data/releases/download";
const OUT = path.join(ROOT, "data/internal/research/nfl/snap-counts");
const CORPUS = path.join(ROOT, "data/internal/research/nfl/player-events-v1");
const ATTRIBUTION = "nflverse (CC BY 4.0)";
const LICENSE = { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/", project: "https://github.com/nflverse/nflverse-data", upstream: "snap counts are sourced by nflverse from Pro-Football-Reference" };
const VOLATILE = ["capturedAt", "sha256AtCapture", "bytesAtCapture"];
fs.mkdirSync(OUT, { recursive: true });

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const stripVolatile = (v) => {
  if (Array.isArray(v)) return v.map(stripVolatile);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !VOLATILE.includes(k)).map(([k, x]) => [k, stripVolatile(x)]));
  return v;
};

/** Metadata pretty-printed, then `rows` one per line so a weekly update diffs by row, not by file. */
function serialize(doc) {
  const { rows, ...meta } = doc;
  const head = JSON.stringify(meta, null, 1);
  if (!rows) return head + "\n";
  return `${head.slice(0, -2)},\n "rows": [\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n ]\n}\n`;
}

function writeIfChanged(file, doc) {
  const p = path.join(OUT, file);
  if (fs.existsSync(p)) {
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(p, "utf8")); } catch { prev = null; }
    if (prev && canonicalJson(stripVolatile(prev)) === canonicalJson(stripVolatile(doc))) return "unchanged";
  }
  fs.writeFileSync(p, serialize(doc));
  return "written";
}

async function fetchCsv(url, { optional }) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (res.status === 404 && optional) return { status: 404 };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: 200, text: buf.toString("utf8"), bytes: buf.length, sha256: sha256(buf) };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error(`${url}: ${lastErr?.message ?? lastErr}`);
}

const manifestSeasons = {};
for (const season of seasons) {
  const file = `snap-counts-${season}.json`;
  const url = `${REL}/snap_counts/snap_counts_${season}.csv`;
  const got = await fetchCsv(url, { optional: season >= nowYear });
  if (got.status === 404) {
    manifestSeasons[season] = { file: fs.existsSync(path.join(OUT, file)) ? file : null, published: false, httpStatus: 404, note: "not published by nflverse yet — skipped, nothing overwritten" };
    console.log(`[snap-counts] ${season}: HTTP 404 — not published yet, skipped`);
    continue;
  }
  const csv = parseCsv(got.text);
  const header = Object.keys(csv[0] ?? {});
  const missingCols = SNAP_COLUMNS.filter((c) => !header.includes(c));
  if (missingCols.length) throw new Error(`${season}: nflverse columns changed — missing ${missingCols.join(", ")}`);
  const rows = [];
  let rejected = 0;
  for (const raw of csv) {
    const n = normalizeSnapCsvRow(raw);
    if (n.ok) rows.push(n.row); else rejected += 1;
  }
  rows.sort(compareSnapRows);
  const weeks = rows.map((r) => r[2]);
  const accounting = {
    csvRows: csv.length,
    kept: rows.length,
    rejected,
    reconciles: csv.length === rows.length + rejected,
    rowsWithoutPfrId: rows.filter((r) => !r[4]).length,
    offenseRows: rows.filter((r) => (r[8] ?? 0) > 0).length,
    specialTeamsOrDefenseOnlyRows: rows.filter((r) => r[8] === 0).length,
    blankOffenseSnaps: rows.filter((r) => r[8] == null).length,
    teamGames: new Set(rows.map((r) => `${r[0]}|${r[6]}`)).size,
    teams: new Set(rows.map((r) => r[6])).size,
    weekRange: rows.length ? [Math.min(...weeks), Math.max(...weeks)] : null,
  };
  if (!accounting.reconciles) throw new Error(`${season}: row accounting does not reconcile`);
  const doc = {
    schemaVersion: 1,
    artifact: "nfl-snap-counts",
    dataClass: "PRIVATE_RESEARCH",
    public: false,
    season,
    attribution: ATTRIBUTION,
    license: LICENSE,
    source: { url, sha256AtCapture: got.sha256, bytesAtCapture: got.bytes },
    capturedAt: NOW,
    featureModule: `app/src/lib/sports/nfl/snap-share.mjs (${SNAP_SHARE_ID})`,
    columns: [...SNAP_COLUMNS],
    rowCount: rows.length,
    contentSha256: sha256(canonicalJson(rows)),
    accounting,
    rows,
  };
  const status = writeIfChanged(file, doc);
  manifestSeasons[season] = { file, published: true, rowCount: rows.length, offenseRows: accounting.offenseRows, teamGames: accounting.teamGames, weekRange: accounting.weekRange, contentSha256: doc.contentSha256 };
  console.log(`[snap-counts] ${season}: ${rows.length} rows (${accounting.offenseRows} with offensive snaps, ${accounting.teamGames} team-games, weeks ${accounting.weekRange?.join("–")}) — ${status}`);
}

/* The id bridge covers every PFR id in every table on disk, not only this run's seasons, so a partial
   --seasons run cannot shrink it. */
const tableFiles = fs.readdirSync(OUT).filter((f) => /^snap-counts-\d{4}\.json$/.test(f)).sort();
const allRows = tableFiles.flatMap((f) => snapRowsFromTable(JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"))));
const pfrIds = new Set(allRows.map((r) => r.pfrId).filter(Boolean));
const playersUrl = `${REL}/players/players.csv`;
const playersGot = await fetchCsv(playersUrl, { optional: false });
const players = parseCsv(playersGot.text);
if (!players.length || !("pfr_id" in players[0]) || !("espn_id" in players[0]) || !("gsis_id" in players[0])) throw new Error("players.csv: crosswalk columns missing");
const bridge = buildIdBridge(players, { onlyPfrIds: pfrIds });
const bridgeRows = [...pfrIds].sort().map((pfr) => { const b = bridge.byPfr.get(pfr); return [pfr, b?.gsisId ?? null, b?.espnId ?? null]; });
const bridgeAccounting = {
  pfrIdsInTables: pfrIds.size,
  inPlayersFile: bridgeRows.filter((r) => bridge.byPfr.has(r[0])).length,
  withGsisId: bridgeRows.filter((r) => r[1]).length,
  withEspnId: bridgeRows.filter((r) => r[2]).length,
  espnCollisions: bridge.collisions.length,
};
const bridgeStatus = writeIfChanged("id-bridge-v1.json", {
  schemaVersion: 1,
  artifact: "nfl-snap-id-bridge",
  dataClass: "PRIVATE_RESEARCH",
  public: false,
  attribution: ATTRIBUTION,
  license: LICENSE,
  source: { url: playersUrl, sha256AtCapture: playersGot.sha256, bytesAtCapture: playersGot.bytes },
  capturedAt: NOW,
  method: "exact id crosswalk from nflverse players.csv; an ESPN id claimed by two PFR ids is listed in collisions and resolves to nobody; a name never joins",
  columns: ["pfr_id", "gsis_id", "espn_id"],
  accounting: bridgeAccounting,
  collisions: bridge.collisions,
  rows: bridgeRows,
});
console.log(`[snap-counts] id bridge: ${bridgeAccounting.withEspnId}/${bridgeAccounting.pfrIdsInTables} PFR ids carry an ESPN id (${bridgeAccounting.espnCollisions} collisions) — ${bridgeStatus}`);

/* Join audit against the ids the boards use (the ESPN player-event corpus, nfl-athlete-<espnId>). */
const joinAudit = {};
for (const f of tableFiles) {
  const season = Number(f.slice(12, 16));
  const corpusFile = path.join(CORPUS, `${season}.json`);
  if (!fs.existsSync(corpusFile)) { joinAudit[season] = { state: "NO_BOARD_ID_CORPUS", note: `no ${path.relative(ROOT, corpusFile)} — reverse join not measurable` }; continue; }
  const corpus = JSON.parse(fs.readFileSync(corpusFile, "utf8"));
  joinAudit[season] = auditIdJoin({ snapRows: allRows, bridge, corpusGames: corpus.games, season });
  const a = joinAudit[season];
  console.log(`[snap-counts] join ${season}: forward ${a.forward.withEspnId}/${a.forward.offenseRows} (${a.forward.rate}); reverse ${a.reverse.matched}/${a.reverse.playerGames} (${a.reverse.rate}), team agree ${a.reverse.teamAgreeRate}, name agree ${a.reverse.nameAgreeRate}`);
}

const manifestStatus = writeIfChanged("manifest-v1.json", {
  schemaVersion: 1,
  artifact: "nfl-snap-counts-manifest",
  dataClass: "PRIVATE_RESEARCH",
  public: false,
  attribution: ATTRIBUTION,
  license: LICENSE,
  capturedAt: NOW,
  script: "app/scripts/nfl/capture-nfl-snap-counts.mjs",
  consumers: "research only — no model, board, promotion or public page reads these files",
  seasons: manifestSeasons,
  tablesOnDisk: tableFiles,
  bridge: { file: "id-bridge-v1.json", ...bridgeAccounting },
  joinAudit,
});
console.log(`[snap-counts] manifest — ${manifestStatus}`);
