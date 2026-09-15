/**
 * WHAT CHANGED (P311) — a deterministic change log from sources that actually hold a previous state.
 *
 *   model states   the scorecard's own `changes` (lib/ops/health-changes.mjs): a family that moved between
 *                  INSUFFICIENT_SAMPLE / HOLDING / WATCH / BREACHED, in public words, within the window
 *   MLB forecasts  today's frozen prediction snapshots (data/internal/mlb/prediction-snapshots/<today>/): the
 *                  first snapshot of the day against the latest one, per game — a winner probability that moved by
 *                  at least MOVE_POINTS, a call that became paused or withdrawn, a total pick that flipped
 * Nothing else is claimed: NFL, EPL and UFC keep no comparable intra-day snapshot today, so they have no line
 * here rather than an invented one.
 */
import fs from "node:fs";
import path from "node:path";
import { pausedFamiliesFrom } from "@/lib/ops/live-record-gate.mjs";
import type { PublicModelState } from "./contract";
import { PUBLIC_STATE_LABEL } from "./contract";

export const MOVE_POINTS = 5;

export interface ModelStateChange { id: string; sport: string; family: string; from: PublicModelState; to: PublicModelState; at: string; line: string }
export interface ForecastMove { gamePk: number; slug: string | null; matchup: string; kind: "winner_moved" | "winner_withdrawn" | "winner_call_paused" | "total_flipped" | "total_paused"; line: string; fromIso: string; toIso: string }
export interface ChangeLog { generatedAt: string; modelStates: ModelStateChange[]; forecastMoves: ForecastMove[]; snapshotWindow: { first: string | null; latest: string | null; games: number } }

const readJson = (p: string): unknown => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const publicState = (s: string, id: string, paused: Set<string>): PublicModelState =>
  s === "BREACHED" ? (paused.has(id) ? "PAUSED" : "WATCH") : s === "WATCH" ? "WATCH" : s === "HOLDING" ? "HOLDING" : "TOO_EARLY";
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function buildChangeLog({ dataRoot, repoRoot, today, nowIso, windowDays = 7 }: { dataRoot: string; repoRoot: string; today: string; nowIso: string; windowDays?: number }): ChangeLog {
  const health = readJson(path.join(dataRoot, "admin", "model-health.json")) as { generatedAt?: string; families?: Array<{ id: string; sport: string; label: string; state: string }>; changes?: Array<{ id: string; sport?: string; label?: string; from: string; to: string; at: string }> } | null;
  const paused = pausedFamiliesFrom(health, Date.parse(nowIso));
  const cutoff = Date.parse(nowIso) - windowDays * 86_400_000;
  const modelStates: ModelStateChange[] = (health?.changes ?? [])
    .filter((c) => Number.isFinite(Date.parse(c.at)) && Date.parse(c.at) >= cutoff)
    .map((c) => {
      const from = publicState(c.from, c.id, new Set());
      const to = publicState(c.to, c.id, paused);
      const family = c.label ?? c.id;
      return { id: c.id, sport: c.sport ?? "", family, from, to, at: c.at, line: `${family}: ${PUBLIC_STATE_LABEL[from]} → ${PUBLIC_STATE_LABEL[to]}` };
    })
    .filter((c) => c.from !== c.to);

  /* MLB: first vs latest frozen snapshot of the day. */
  const dir = path.join(repoRoot, "data", "internal", "mlb", "prediction-snapshots", today);
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => /^snapshot-\d{12}\.json$/.test(f)).sort(); } catch { files = []; }
  const forecastMoves: ForecastMove[] = [];
  let first: string | null = null, latest: string | null = null, games = 0;
  if (files.length >= 2) {
    type Pred = { gamePk: number; slug?: string; awayTeam: string; homeTeam: string; status: string; moneyline: { team: string; simulationProbability: number } | null; total: { pick: string; line: number | null; pausedReason?: string } | null; pausedReasons?: { moneyline?: string } };
    /* Per game: its FIRST available version against its LAST available one — a game that has started reads
       "unavailable" in later snapshots, so the day's last file would compare almost nothing by the evening. */
    const firstOf = new Map<string, Pred>(); const lastOf = new Map<string, Pred>(); const lastAt = new Map<string, string>();
    for (const f of files) {
      const doc = readJson(path.join(dir, f)) as { generatedAt?: string; predictions?: Pred[] } | null;
      if (!doc) continue;
      first ??= doc.generatedAt ?? null; latest = doc.generatedAt ?? latest;
      for (const p of doc.predictions ?? []) {
        if (p.status === "unavailable") continue;
        const k = String(p.gamePk);
        if (!firstOf.has(k)) firstOf.set(k, p); else { lastOf.set(k, p); lastAt.set(k, doc.generatedAt ?? ""); }
      }
    }
    for (const [k, p] of lastOf) {
      const was = firstOf.get(k)!;
      games += 1;
      const matchup = `${p.awayTeam} @ ${p.homeTeam}`;
      const base = { gamePk: p.gamePk, slug: p.slug ?? null, matchup, fromIso: first ?? "", toIso: lastAt.get(k) ?? latest ?? "" };
      if (was.moneyline && !p.moneyline) forecastMoves.push({ ...base, kind: p.pausedReasons?.moneyline ? "winner_call_paused" : "winner_withdrawn", line: `${matchup}: the winner call ${p.pausedReasons?.moneyline ? "was paused" : "was withdrawn"} (was ${was.moneyline.team} ${pct(was.moneyline.simulationProbability)})` });
      else if (was.moneyline && p.moneyline) {
        const d = Math.round((p.moneyline.simulationProbability - was.moneyline.simulationProbability) * 100);
        if (was.moneyline.team !== p.moneyline.team) forecastMoves.push({ ...base, kind: "winner_moved", line: `${matchup}: the lean moved from ${was.moneyline.team} ${pct(was.moneyline.simulationProbability)} to ${p.moneyline.team} ${pct(p.moneyline.simulationProbability)}` });
        else if (Math.abs(d) >= MOVE_POINTS) forecastMoves.push({ ...base, kind: "winner_moved", line: `${matchup}: ${p.moneyline.team} ${pct(was.moneyline.simulationProbability)} → ${pct(p.moneyline.simulationProbability)} (${d > 0 ? "+" : ""}${d} points)` });
      }
      if (was.total && p.total) {
        if (was.total.pick !== "UNAVAILABLE" && p.total.pausedReason) forecastMoves.push({ ...base, kind: "total_paused", line: `${matchup}: the over/under call was paused` });
        else if (was.total.pick !== "UNAVAILABLE" && p.total.pick !== "UNAVAILABLE" && was.total.pick !== p.total.pick) forecastMoves.push({ ...base, kind: "total_flipped", line: `${matchup}: the total flipped from ${was.total.pick} ${was.total.line} to ${p.total.pick} ${p.total.line}` });
      }
    }
  }
  return { generatedAt: nowIso, modelStates, forecastMoves, snapshotWindow: { first, latest, games } };
}
