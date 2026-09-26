#!/usr/bin/env node
/**
 * NFL PLAYER-PROP SETTLEMENT LEDGER (Phase D) — the durable record, downstream of the live loop.
 *
 *   node app/scripts/nfl/settle-nfl-live-props.mjs --now <ISO> [--date YYYY-MM-DD] [--write]
 *
 * Reads the committed live artifacts under `public/data/nfl/live-props/<eventId>.json` and folds
 * their TERMINAL rows into `data/internal/nfl/prop-settlement/<date>.json`, keyed by the canonical
 * `(event, player, family)`.
 *
 * ⚠ IT GRADES NOTHING. Every result is copied from the settlement the producer already wrote. A
 * ledger that re-derived an outcome would be a second opinion about a settled result, and settled
 * results have exactly one source.
 *
 * ⚠ IT RUNS OUTSIDE THE LIVE LOOP, and that is the point. The producer's reconciliation window is
 * short and closes on the clock — which is what stops a finished game being polled forever. An
 * official stat correction can arrive long after it shuts, by which time the producer is not running
 * for that game at all. Because this fold only ever re-reads committed evidence, it can apply such a
 * correction days later without reopening any polling, and without being able to damage the record:
 * the frozen block, the original answer and the original settlement instant are immutable, and a
 * changed answer appends to `corrections` rather than editing anything.
 *
 * FREE. No provider is contacted; every input is already in the repository.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildLedger } from "../../src/lib/sports/nfl/prop-settlement-ledger.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.resolve(APP, "..");
const LIVE_DIR = path.join(APP, "public/data/nfl/live-props");
const OUT_DIR = path.join(ROOT, "data/internal/nfl/prop-settlement");

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const WRITE = process.argv.includes("--write");
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const NOW = arg("now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required — a ledger entry must be stamped, never guessed"); process.exit(2); }

/*
 * A slate is keyed by the game's ET DATE, not its UTC date. A Sunday-night kickoff at 00:15Z belongs
 * to the previous ET day, and filing it under the UTC date would split one slate across two ledgers.
 */
const etDateOf = (iso) => {
  const t = Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
};

let files = [];
try { files = fs.readdirSync(LIVE_DIR).filter((f) => f.endsWith(".json")); } catch {
  console.log("no live-prop artifacts on disk — nothing to settle (honest no-op, not an empty ledger)");
  process.exit(0);
}

const artifacts = files.map((f) => read(path.join(LIVE_DIR, f))).filter((a) => a?.providerEventId);
if (!artifacts.length) { console.log("no readable live-prop artifacts — nothing to settle"); process.exit(0); }

// Group by the slate each game belongs to, so one ledger file holds one day's games.
const onlyDate = arg("date");
const byDate = new Map();
for (const a of artifacts) {
  const d = etDateOf(a.kickoffUtc);
  if (!d || (onlyDate && d !== onlyDate)) continue;
  if (!byDate.has(d)) byDate.set(d, []);
  byDate.get(d).push(a);
}
if (!byDate.size) { console.log(`no live-prop artifacts for ${onlyDate ?? "any slate"} — nothing to settle`); process.exit(0); }

let wrote = 0;
for (const date of [...byDate.keys()].sort()) {
  const outPath = path.join(OUT_DIR, `${date}.json`);
  const prior = read(outPath);
  const { rows, added, corrected, promoted, unchanged, skipped, counts } = buildLedger({ prior, artifacts: byDate.get(date), nowIso: NOW });

  const record = {
    schemaVersion: 1,
    artifact: "nfl-prop-settlement",
    dataClass: "INTERNAL_DERIVED",
    /* This is a MODEL record. It shares no row with any paper bankroll and must never be read as one. */
    moneyClass: "NON_MONEY",
    date,
    scope: "NFL player-prop settlement — the frozen pregame line and forecast beside the official final measurement.",
    whatIsGraded:
      "`lineResult` is a FACT about the final stat and the FROZEN line. `forecastResult` is OUR record: did the side our published projection implied land. A row with no measurement is graded as neither, and whether a sportsbook voids or settles such a row is its rule and is not asserted here.",
    rows,
    counts,
    generatedAt: NOW,
  };

  /*
   * IDEMPOTENT ON DISK TOO. `generatedAt` is a wall-clock field, so comparing whole files would
   * rewrite this every run and make "the ledger changed" meaningless in a diff. The comparison is
   * over the content that actually matters.
   */
  const contentOf = (r) => JSON.stringify({ rows: r?.rows ?? [], counts: r?.counts ?? null });
  const changed = contentOf(prior) !== contentOf(record);

  console.log(
    `${date}: ${counts.rows} row(s) · +${added} new · ${corrected} corrected · ${promoted} promoted to canonical · ${unchanged} unchanged · ${skipped} not terminal` +
    ` · ${counts.observed} observed / ${counts.noMeasurement} no-measurement · ${counts.decided} decided (${counts.forecastWins}W ${counts.forecastLosses}L)` +
    ` · ${counts.push} push · ${counts.notApplicable} n/a · ${counts.canonical} canonical` +
    (changed ? "" : " · UNCHANGED"),
  );

  /*
   * ⚠ AN EMPTY LEDGER IS NOT A LEDGER. A slate whose games have not finished has no terminal rows
   * yet, and writing a 0-row file for it would publish "nothing settled" as a settled fact and put a
   * placeholder in the commit history for every future Sunday the moment a board exists. A slate
   * enters the record when it has something to record.
   */
  if (!rows.length) { console.log(`  ${date}: nothing terminal yet — no ledger written (not an empty one)`); continue; }
  if (WRITE && changed) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(outPath, JSON.stringify(record, null, 1) + "\n"); wrote += 1; }
}
console.log(WRITE ? `wrote ${wrote} ledger file(s)` : "dry run — pass --write to persist");
