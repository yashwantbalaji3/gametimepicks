#!/usr/bin/env node
/**
 * E-2 · NFL WINNER vs THE CUTOFF-ELO BASELINE, FORWARD (architecture audit II.D #4). PRIVATE. $0. Report only.
 *
 *   node app/scripts/nfl/build-nfl-win-baseline-forward.mjs --now <ISO> [--dry-run]
 *
 * Pairs every settled regular-season NFL forecast of record with the committed cutoff-Elo baseline reproduced at the
 * forecast's own strength cutoff (lib/sports/nfl/win-baseline-forward.mjs) and writes
 * data/internal/research/nfl/reports/win-head-vs-cutoff-elo-forward.json — rewritten only when its content changes.
 * Model health reads `summary.logLossVsBaseline` for the nfl_winner bar. Nothing public reads it; no label changes.
 *
 * Finals: the corpus (through the 2026-02-08 Super Bowl) + the captured 2026 box-score finals + the current results
 * window, deduplicated by provider event id. The baseline folds every final before the forecast's strength cutoff (see
 * makeBaselineFor for why it does not reuse the producer's own, stale, fold).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { forecastOfRecord } from "../../src/lib/forecast-ledger/adapters/nfl.mjs";
import { strengthStateAt, ELO_PARAMS } from "../../src/lib/sports/nfl/strength-state.mjs";
import { NFL_WIN_BASELINE_FORWARD, pairWinBaseline } from "../../src/lib/sports/nfl/win-baseline-forward.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT = "data/internal/research/nfl/reports/win-head-vs-cutoff-elo-forward.json";
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); } catch { return null; } };
const nflSeasonOf = (iso) => { const d = new Date(Date.parse(iso)); return d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };

function loadReceipts() {
  const root = path.join(ROOT, "data/internal/nfl/forecast-receipts");
  const out = [];
  for (const d of fs.readdirSync(root).sort()) {
    const dir = path.join(root, d);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      try { out.push({ file: `data/internal/nfl/forecast-receipts/${d}/${f}`, receipt: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }); } catch { /* unreadable: not a receipt */ }
    }
  }
  return out;
}

/** Name-keyed final rows (the corpus's row space) from every source, deduplicated by provider event id. */
export function finalsRowSpace({ corpusRows, results, playerEvents, abbrToName }) {
  const byId = new Map();
  for (const r of corpusRows ?? []) byId.set(String(r.providerEventId ?? `${r.dateUtc}:${r.home}`), r);
  const put = (id, row) => { if (id && !byId.has(id)) byId.set(id, row); };
  for (const r of results?.rows ?? []) {
    if (!/^STATUS_FINAL/.test(r.statusRaw ?? "") || !Number.isInteger(r.ftHome) || !Number.isInteger(r.ftAway)) continue;
    const home = typeof r.home === "string" ? r.home : r.home?.name;
    const away = typeof r.away === "string" ? r.away : r.away?.name;
    if (!home || !away || !r.dateUtc) continue;
    put(String(r.providerEventId ?? ""), { providerEventId: String(r.providerEventId), season: nflSeasonOf(r.dateUtc), seasonType: r.seasonType ?? null, dateUtc: r.dateUtc, home, away, ftHome: r.ftHome, ftAway: r.ftAway, statusRaw: r.statusRaw });
  }
  for (const doc of playerEvents ?? []) {
    for (const g of doc?.games ?? []) {
      const home = abbrToName.get(g.home);
      const away = abbrToName.get(g.away);
      if (!home || !away || !Number.isInteger(g.ftHome) || !Number.isInteger(g.ftAway) || !g.dateUtc) continue;
      put(String(g.providerEventId), { providerEventId: String(g.providerEventId), season: g.season ?? nflSeasonOf(g.dateUtc), seasonType: g.seasonType ?? null, dateUtc: g.dateUtc, home, away, ftHome: g.ftHome, ftAway: g.ftAway, statusRaw: "STATUS_FINAL" });
    }
  }
  return [...byId.values()];
}

/**
 * The cutoff-Elo baseline at one forecast's own strength cutoff, folded from EVERY final played before that cutoff
 * (and before kickoff). Leakage-safe: nothing at or after the cutoff enters.
 *
 * It deliberately does NOT reuse the producer's own fold. Forecast receipts record strengthGamesFolded = 871 for every
 * Week 4 game (corpus 854 + 17), i.e. the producer's incumbent Elo state folded only the 2026 finals still inside the
 * results window, not every 2026 final. Pairing against that stale state would flatter the head; the gap is recorded
 * per game (`producerFoldGap`) as a finding, never silently absorbed.
 */
export function makeBaselineFor(rows) {
  return (r) => {
    const cutoffIso = r.evidence?.strengthCutoff ?? r.generatedAt;
    if (!cutoffIso || !r.home?.name || !r.away?.name) return { state: "REFUSED", reason: "receipt records no strength cutoff or team names" };
    const s = strengthStateAt({ rows: rows.filter((x) => x.dateUtc < r.kickoffUtc), cutoffIso, regressToSeason: nflSeasonOf(r.kickoffUtc) });
    const rated = (t) => Object.prototype.hasOwnProperty.call(s.ratings, t);
    if (!rated(r.home.name) || !rated(r.away.name)) return { state: "REFUSED", reason: "a team has no rating history" };
    const d = s.ratingFor(r.home.name) + ELO_PARAMS.HOME_ADVANTAGE - s.ratingFor(r.away.name);
    const recorded = r.evidence?.strengthGamesFolded;
    return { state: "READY", d, pHome: 1 / (1 + 10 ** (-d / 400)), gamesFolded: s.gamesFolded, producerFoldGap: Number.isInteger(recorded) ? s.gamesFolded - recorded : null };
  };
}

function main() {
  const now = arg("--now");
  if (!now || !Number.isFinite(Date.parse(now))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }
  const receipts = loadReceipts().filter((x) => Date.parse(x.receipt.generatedAt) <= Date.parse(now));
  const ofRecord = forecastOfRecord(receipts);
  const abbrToName = new Map();
  for (const { receipt: r } of receipts) for (const t of [r.home, r.away]) if (t?.abbr && t?.name) abbrToName.set(t.abbr, t.name);
  const peDir = path.join(ROOT, "data/internal/research/nfl/player-events-v1");
  const playerEvents = fs.readdirSync(peDir).filter((f) => /^\d{4}\.json$/.test(f)).sort().map((f) => readJson(`data/internal/research/nfl/player-events-v1/${f}`));
  const rows = finalsRowSpace({ corpusRows: readJson("data/internal/research/nfl/corpus-v1.json")?.rows, results: readJson("app/public/data/nfl/results/latest.json"), playerEvents, abbrToName });
  const finalsById = new Map(rows.filter((x) => /^STATUS_FINAL/.test(x.statusRaw ?? "") && Date.parse(x.dateUtc) <= Date.parse(now)).map((x) => [String(x.providerEventId), x]));
  const { games, summary } = pairWinBaseline({ receiptsOfRecord: ofRecord, finalsById, baselineFor: makeBaselineFor(rows) });
  const body = {
    schemaVersion: 1, artifact: NFL_WIN_BASELINE_FORWARD, dataClass: "INTERNAL_RESEARCH", public: false,
    contract: { file: "data/internal/research/nfl/regular-season-evaluation-contract.json", pointer: "/bars/winHead", baseline: "committed cutoff-Elo (P166-E): K, home edge and season regression from strength-state.mjs ELO_PARAMS" },
    summary, games,
  };
  const abs = path.join(ROOT, OUT);
  const prev = readJson(OUT);
  console.log(`paired ${summary.paired} · void ${summary.void} · weeks ${summary.weeks} · logLossVsBaseline ${summary.logLossVsBaseline} (model ${summary.meanLogLossModel} vs baseline ${summary.meanLogLossBaseline}) · ${summary.state}`);
  for (const g of games.filter((x) => x.state === "VOID")) console.log(`  VOID ${g.eventId} ${g.matchup}: ${g.reason}`);
  if (prev && JSON.stringify({ ...prev, generatedAt: undefined }) === JSON.stringify({ ...body, generatedAt: undefined })) { console.log("unchanged"); return; }
  if (argv.includes("--dry-run")) { console.log("DRY_RUN"); return; }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify({ ...body, generatedAt: now }, null, 1) + "\n");
  console.log(`→ ${OUT}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
