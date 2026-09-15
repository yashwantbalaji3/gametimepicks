/**
 * ARCHIVED NFL FORECAST (P320) — the frozen pre-kickoff forecast of a game that has been played, found through the
 * graded record rather than rebuilt.
 *
 * After a week rolls, `forecasts/latest.json` and `frozen-latest.json` carry the NEXT week; a settled game's page
 * and its story would vanish, or — worse — be rebuilt from current inputs and called pregame. The reconciliation
 * artifact (`reconciliation/<week>.json`) names, per game, the exact forecast revision it graded (`published.
 * generatedAt`). Every revision is committed twice: the public dated file (`forecasts/<date>.json`, which a later run
 * the same day overwrites) and the per-revision receipt (`data/internal/nfl/forecast-receipts/<date>/<id>-rev-HHMMZ.json`,
 * written once per revision and never overwritten). This resolver returns the named revision, byte for byte as it
 * was published before kickoff, from whichever holds it — or nothing: a game whose named revision is on neither is
 * refused, never approximated from a neighbouring revision.
 *
 * Nothing here reads a final score into the forecast. The final lives on the reconciliation row and is returned
 * BESIDE the forecast, for the page to print as the graded record — the story adapter never sees it.
 */
import fs from "node:fs";
import path from "node:path";
import { readinessOf, type NflEligibleEvent } from "./simulate-eligibility";

export interface ArchivedForecast {
  providerEventId: string;
  matchup: string;
  kickoffUtc: string;
  home: { abbr: string; name: string };
  away: { abbr: string; name: string };
  venue?: string | null;
  generatedAt: string;
  model?: { id?: string; version?: number; simulations?: number } | null;
  teamSignal?: { state: string; note?: string } | null;
  forecastSummary: {
    projectedScore: { home: number; away: number };
    winProbability: { home: number; away: number };
    total: { median: number; p10: number; p90: number };
  };
  [k: string]: unknown;
}
export interface ReconciledGame {
  providerEventId: string;
  matchup: string;
  kickoffUtc: string;
  state: string;
  published: { generatedAt: string };
  final?: { away: number; home: number; total: number; margin: number } | null;
}
export interface ArchivedGame {
  forecast: ArchivedForecast;
  reconciliation: ReconciledGame;
  weekKey: string;
  weekLabel: string;
  /** The file the frozen revision was read from: a public dated forecast file or a per-revision receipt. */
  sourceFile: string;
}
/** Where the per-revision receipts live, relative to the app's working directory. */
export const DEFAULT_RECEIPTS_ROOT = path.join(process.cwd(), "..", "data", "internal", "nfl", "forecast-receipts");

const readJson = <T,>(root: string, rel: string): T | null => {
  try { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")) as T; } catch { return null; }
};

/** Every reconciled game across every graded week, newest week first. */
export function reconciledGames(root: string): Array<{ game: ReconciledGame; weekKey: string; weekLabel: string }> {
  const index = readJson<{ weeks?: Array<{ key: string; label: string }> }>(root, "nfl/reconciliation/index.json");
  const out: Array<{ game: ReconciledGame; weekKey: string; weekLabel: string }> = [];
  for (const w of [...(index?.weeks ?? [])].reverse()) {
    const doc = readJson<{ games?: ReconciledGame[] }>(root, `nfl/reconciliation/${w.key}.json`);
    for (const g of doc?.games ?? []) if (g?.providerEventId && g.published?.generatedAt) out.push({ game: g, weekKey: w.key, weekLabel: w.label });
  }
  return out;
}

/** The per-revision receipts for one event: every committed revision, by its generatedAt. Read once per event. */
const receiptCache = new Map<string, Map<string, { file: string; doc: ArchivedForecast }>>();
function receiptsFor(receiptsRoot: string, providerEventId: string): Map<string, { file: string; doc: ArchivedForecast }> {
  const key = `${receiptsRoot}|${providerEventId}`;
  const cached = receiptCache.get(key);
  if (cached) return cached;
  const out = new Map<string, { file: string; doc: ArchivedForecast }>();
  let dates: string[] = [];
  try { dates = fs.readdirSync(receiptsRoot).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)); } catch { dates = []; }
  for (const d of dates) {
    let files: string[] = [];
    try { files = fs.readdirSync(path.join(receiptsRoot, d)).filter((f) => f.startsWith(`${providerEventId}-rev-`) || f === `${providerEventId}.json`); } catch { files = []; }
    for (const f of files) {
      let doc: ArchivedForecast | null = null;
      try { doc = JSON.parse(fs.readFileSync(path.join(receiptsRoot, d, f), "utf8")) as ArchivedForecast; } catch { doc = null; }
      if (doc?.generatedAt && doc.providerEventId === providerEventId && doc.forecastSummary?.winProbability) out.set(doc.generatedAt, { file: `data/internal/nfl/forecast-receipts/${d}/${f}`, doc });
    }
  }
  receiptCache.set(key, out);
  return out;
}

/** The frozen forecast of one reconciled game, or null when the named revision is not committed anywhere. */
export function archivedForecastFor(root: string, providerEventId: string, opts: { receiptsRoot?: string } = {}): ArchivedGame | null {
  const hit = reconciledGames(root).find((x) => x.game.providerEventId === providerEventId);
  if (!hit) return null;
  const want = hit.game.published.generatedAt;
  let files: string[] = [];
  try { files = fs.readdirSync(path.join(root, "nfl", "forecasts")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse(); } catch { files = []; }
  for (const f of files) {
    const doc = readJson<{ generatedAt?: string; forecasts?: ArchivedForecast[] }>(root, `nfl/forecasts/${f}`);
    if (!doc || doc.generatedAt !== want) continue;
    const fc = (doc.forecasts ?? []).find((x) => x.providerEventId === providerEventId);
    if (fc?.forecastSummary?.winProbability) return { forecast: fc, reconciliation: hit.game, weekKey: hit.weekKey, weekLabel: hit.weekLabel, sourceFile: `nfl/forecasts/${f}` };
  }
  const receipt = receiptsFor(opts.receiptsRoot ?? DEFAULT_RECEIPTS_ROOT, providerEventId).get(want);
  if (receipt) return { forecast: receipt.doc, reconciliation: hit.game, weekKey: hit.weekKey, weekLabel: hit.weekLabel, sourceFile: receipt.file };
  return null;
}

/** Every reconciled game whose frozen revision is on disk — the pages a build keeps alive after the week rolls. */
export function archivedEventIds(root: string, opts: { receiptsRoot?: string } = {}): string[] {
  return reconciledGames(root).map((x) => x.game.providerEventId).filter((id) => archivedForecastFor(root, id, opts) !== null);
}

/**
 * The story adapter's event, built from the FROZEN forecast only: lifecycle STARTED and locked, so the adapter
 * tells it in the past tense and labels it archived. The reconciliation's final is deliberately not an input.
 */
export function archivedEventFrom(a: ArchivedGame): NflEligibleEvent {
  const f = a.forecast;
  return {
    providerEventId: f.providerEventId,
    canonicalEventId: `nfl-${f.providerEventId}`,
    matchup: f.matchup,
    kickoffUtc: f.kickoffUtc,
    home: f.home,
    away: f.away,
    lifecycle: "STARTED",
    locked: true,
    state: "ARCHIVED",
    projectedScore: f.forecastSummary.projectedScore,
    winProbability: { home: f.forecastSummary.winProbability.home, away: f.forecastSummary.winProbability.away },
    total: f.forecastSummary.total,
    hasMarket: false,
    venue: f.venue ?? null,
    playerCandidates: 0,
    reportHref: `/nfl/game/${f.providerEventId}`,
    ...readinessOf(f.teamSignal ?? null),
  };
}
