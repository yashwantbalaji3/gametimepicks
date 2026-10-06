#!/usr/bin/env node
/**
 * Writes data/internal/mlb/reference/provider-event-aliases.json: the only way Research's row-lineage
 * loader admits a settlement-join market row whose providerEventId is not the join file's own (MLB Department,
 * 2026-10-05). Rules: app/src/lib/mlb/provider-event-aliases.mjs.
 *
 * Reads only recorded inputs: settlement-join files, the provider's own event fields in the pregame-archive
 * market snapshots and snapshots, the StatsAPI boards, and the provider daily event listings. Reads no network, edits no archive file, re-joins nothing.
 * The output carries no wall-clock time, so a rerun on the same inputs is byte-identical.
 *
 *   node scripts/mlb/build-provider-event-aliases.mjs          # dry run: prints the summary
 *   node scripts/mlb/build-provider-event-aliases.mjs --write  # writes the receipt file
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

import { buildProviderEventAliases, indexProviderEvents, ALIAS_SCHEMA_VERSION, ALIAS_TOLERANCE_MINUTES } from "../../src/lib/mlb/provider-event-aliases.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const ARCHIVE = path.join(ROOT, "data/internal/mlb/pregame-archive");
const BOARDS = path.join(APP, "public/data/mlb/boards");
// Lives outside pregame-archive/: that folder caps committable files at 128 KB (commit-persistence guard),
// and this receipt is one reviewable document, not an archive snapshot.
const OUT = path.join(ROOT, "data/internal/mlb/reference/provider-event-aliases.json");
const WRITE = process.argv.includes("--write");

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const walkFiles = (dir, test, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, test, out);
    else if (test(e.name)) out.push(p);
  }
  return out;
};
/** Every object anywhere in a parsed document (snapshot files nest their market records). */
function* objects(o) {
  if (Array.isArray(o)) for (const v of o) yield* objects(v);
  else if (o && typeof o === "object") { yield o; for (const v of Object.values(o)) yield* objects(v); }
}

// 1. Provider events, from the provider's own fields (teams + commence time), never from a stamped gamePk.
const events = new Map();
let snapshotFiles = 0;
for (const f of walkFiles(path.join(ARCHIVE, "market-snapshots"), (n) => n.endsWith(".json.gz"))) {
  let doc;
  try { doc = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString("utf8")); } catch { continue; }
  indexProviderEvents(doc?.records ?? [], events);
  snapshotFiles++;
}
for (const f of walkFiles(path.join(ARCHIVE, "snapshots"), (n) => n.endsWith(".json"))) {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  indexProviderEvents(objects(doc), events);
  snapshotFiles++;
}

// 2. Join files and their foreign rows.
const joinFiles = [];
for (const f of walkFiles(path.join(ARCHIVE, "settlement-joins"), (n) => n.endsWith(".json"))) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  const foreignRows = {};
  for (const r of j.marketRows ?? []) {
    if (r.providerEventId && r.providerEventId !== j.providerEventId) foreignRows[r.providerEventId] = (foreignRows[r.providerEventId] ?? 0) + 1;
  }
  joinFiles.push({ file: rel(f), date: j.date, gamePk: j.gamePk, providerEventId: j.providerEventId, foreignRows });
}

// 3. StatsAPI boards: every scheduled game per ET date, with its clubs and scheduled start.
const boards = new Map();
for (const date of new Set(joinFiles.map((j) => j.date))) {
  const p = path.join(BOARDS, `${date}.json`);
  if (!fs.existsSync(p)) continue;
  const b = JSON.parse(fs.readFileSync(p, "utf8"));
  boards.set(date, (b.games ?? []).map((g) => ({ gamePk: g.gamePk, away: g.awayTeamName, home: g.homeTeamName, commenceTime: g.gameDate })));
}

// 4. The provider's own daily event listing (the Odds API /events snapshot): the independent second source.
const listings = new Map();
for (const date of boards.keys()) {
  const p = path.join(APP, "public/data/mlb/schedule", `${date}.json`);
  if (!fs.existsSync(p)) continue;
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  listings.set(date, (doc.games ?? []).filter((g) => g.gameId).map((g) => ({ id: g.gameId, away: g.away, home: g.home, commenceTime: g.commenceTime })));
}

const result = buildProviderEventAliases({ joinFiles, events, boards, listings });
const doc = {
  schemaVersion: ALIAS_SCHEMA_VERSION,
  public: false,
  producedBy: "app/scripts/mlb/build-provider-event-aliases.mjs",
  rule: `A foreign providerEventId in a settlement-join file for gamePk G is aliased to G only when the provider's own record (teams + commence time) is known and consistent, the id is not another game's own event, G is on that date's StatsAPI board with no other game between the same clubs and no second provider start for them that day (no doubleheader), the event matches exactly G with the same home and away clubs and a scheduled start within ${ALIAS_TOLERANCE_MINUTES} minutes, every join file holding the id agrees, and the provider's own daily event listing for that date independently lists the exact id with the same clubs and start. Everything else is refused. No archive row is edited or re-joined.`,
  inputs: { providerDailyListingDates: listings.size, settlementJoinFiles: joinFiles.length, providerSnapshotFiles: snapshotFiles, providerEvents: events.size, boardDates: boards.size },
  summary: result.summary,
  aliases: result.aliases,
  refused: result.refused,
  ownEventUnverified: result.ownEventUnverified,
};
const json = `${JSON.stringify(doc, null, 1)}\n`;
console.log(JSON.stringify({ inputs: doc.inputs, summary: doc.summary }, null, 2));
if (WRITE) {
  fs.writeFileSync(OUT, json);
  console.log(`wrote ${rel(OUT)} (${json.length} bytes)`);
}
