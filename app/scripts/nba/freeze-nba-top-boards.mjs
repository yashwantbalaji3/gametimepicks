#!/usr/bin/env node
/**
 * Freeze the NBA Top 10 player boards (points · rebounds · assists · 3PM) — PRIVATE, write-once, before tip.
 *
 * Reads the committed forecast artifact of one family for one ET date
 *   data/internal/research/nba/<family dir>/forecasts/<date>.json
 * and, at the instant --now, appends one EDITION to
 *   data/internal/research/nba/top-boards/<family>/<date>.json
 * covering only games whose forecast was written at or before --now, that have not tipped, and that are on no earlier
 * edition. An existing edition is never rewritten (top-boards.mjs `frozenEditionViolations`, checked after the write
 * against the bytes read before it). The sha256 of the exact forecast bytes is recorded on the edition and every row.
 * No network, no market data, no clock other than --now.
 *
 *   node scripts/nba/freeze-nba-top-boards.mjs [--family v0.1] [--date YYYY-MM-DD] [--now ISO] [--write] [--out-dir DIR]
 *
 *   --family   v0.1 (default, founder N1 champion) · v0 · v0.2 · v1 (nba-sim-v1-coherent, once its artifact exists)
 *   --date     ET date; default = the ET dates of every forecast file whose games have not all tipped at --now
 *   --now      freeze instant (default: the current time)
 *   --out-dir  write somewhere else (dry runs outside the repo); default data/internal/research/nba/top-boards/<family>
 * Exit 0 on any decision (nothing to freeze is a result); 1 on bad usage or a refused freeze.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { freezeBoards, frozenEditionViolations, DEFAULT_BOARD_FAMILY } from "../../src/lib/sports/nba/top-boards.mjs";
import { boardFamilySpec, parseArgs } from "./top-board-families.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const NBA = path.join(REPO, "data", "internal", "research", "nba");

function main() {
  const { opt, flag } = parseArgs(process.argv.slice(2));
  let spec;
  try { spec = boardFamilySpec(opt("--family") ?? DEFAULT_BOARD_FAMILY); } catch (e) { console.error(e.message); process.exit(1); }
  const NOW = opt("--now") ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now must be ISO"); process.exit(1); }
  const ONLY = opt("--date");
  if (ONLY && !/^\d{4}-\d{2}-\d{2}$/.test(ONLY)) { console.error("REFUSED: --date YYYY-MM-DD"); process.exit(1); }
  const WRITE = flag("--write");
  const FORECASTS = opt("--forecast-dir") ? path.resolve(opt("--forecast-dir")) : path.join(NBA, spec.dir, "forecasts");
  const OUT = opt("--out-dir") ? path.resolve(opt("--out-dir")) : path.join(NBA, "top-boards", spec.family);

  if (!fs.existsSync(FORECASTS)) {
    console.log(`[top-boards ${spec.family}] no forecast directory ${path.relative(REPO, FORECASTS)} — nothing to freeze${spec.family === "v1" ? " (v1 has not written an artifact yet)" : ""}`);
    return;
  }
  const nowMs = Date.parse(NOW);
  const dates = ONLY ? [ONLY] : fs.readdirSync(FORECASTS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort()
    .filter((d) => { try { return (JSON.parse(fs.readFileSync(path.join(FORECASTS, `${d}.json`), "utf8")).games ?? []).some((g) => Date.parse(g.dateUtc) > nowMs); } catch { return false; } });
  if (!dates.length) { console.log(`[top-boards ${spec.family}] no forecast date with an untipped game at ${NOW} — nothing to freeze`); return; }

  let refused = false;
  for (const date of dates) {
    const src = path.join(FORECASTS, `${date}.json`);
    if (!fs.existsSync(src)) { console.log(`${date}: no ${spec.family} forecast file — nothing to freeze`); continue; }
    const bytes = fs.readFileSync(src);
    const artifact = JSON.parse(bytes.toString("utf8"));
    const sourceSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const file = path.join(OUT, `${date}.json`);
    const beforeText = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    const existing = beforeText ? JSON.parse(beforeText) : null;
    const r = freezeBoards({ existing, artifact, sourceSha256, sourcePath: path.relative(REPO, src), frozenAt: NOW, family: spec.family, date });
    if (!r.ok) { console.error(`REFUSED ${date}: ${r.errors.join("; ")}`); refused = true; continue; }
    if (!r.edition) { console.log(`${date}: ${r.note}`); continue; }
    const e = r.edition;
    const summary = Object.values(e.boards).map((b) => `${b.category}=${b.shownCount}/${b.eligibleCount} (withheld ${b.withheld.count})`).join(" · ");
    console.log(`${date}: edition ${e.edition} at ${NOW} · games on board ${e.gamesOnBoard}/${e.games.length} · ${summary}`);
    for (const g of e.games.filter((x) => x.state !== "ON_BOARD")) console.log(`  off board: ${g.eventId} ${g.away?.abbr}@${g.home?.abbr} ${g.tipoffUtc} — ${g.state}`);
    if (!WRITE) { console.log("  dry run — pass --write to persist"); continue; }
    fs.mkdirSync(OUT, { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(r.doc, null, 1) + "\n");
    // The write-once guard, against the bytes read BEFORE this run (not against what this run believes it wrote).
    const v = frozenEditionViolations({ before: beforeText ? JSON.parse(beforeText) : null, after: JSON.parse(fs.readFileSync(tmp, "utf8")) });
    if (v.length) { fs.rmSync(tmp, { force: true }); console.error(`REFUSED ${date}: ${v.join("; ")}`); refused = true; continue; }
    if ((fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null) !== beforeText) { fs.rmSync(tmp, { force: true }); console.error(`REFUSED ${date}: ${path.relative(REPO, file)} changed during this run`); refused = true; continue; }
    fs.renameSync(tmp, file);
    console.log(`  wrote ${path.relative(REPO, file)} (editions ${r.doc.editions.length})`);
  }
  if (refused) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
