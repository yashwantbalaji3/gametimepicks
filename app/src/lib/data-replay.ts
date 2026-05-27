/**
 * Loader for retrospective model replay JSONs written by
 * `pipeline.replay_one_shot`. Server-only.
 *
 * Honest contract:
 *   - The replay is generated AFTER the slate from pregame inputs
 *     with the same-game cap relaxed. It is **not official** and is
 *     never folded into the lifetime hit rate.
 *   - Callers must label every UI surface that renders a replay row
 *     with "Replay · not official". The loader exposes the
 *     provenance metadata so the UI can show the exact rule diff.
 *   - Missing or malformed JSON returns null. The /results page
 *     continues to render without the replay section.
 */
import fs from "node:fs";
import path from "node:path";

const REPLAY_GRADED_DIR = path.join(
  process.cwd(),
  "public",
  "data",
  "parlays",
  "replay-graded",
);

export interface ReplayRuleOverride {
  official: number;
  replay: number;
}

export interface ReplayProvenance {
  replayType: string;
  sourceDate: string;
  generatedAt: string;
  official: boolean;
  shownLive: boolean;
  includedInOfficialHitRate: boolean;
  pregameOnly: boolean;
  ruleset: string;
  ruleOverrides: Record<string, { max_legs_per_game: ReplayRuleOverride }>;
  rationale: string;
  label: string;
}

export interface ReplaySummary {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  decisive: number;
  hitRate: number;
  byProfile: Record<string, { wins: number; losses: number; pushes: number; pending: number }>;
  bySport: Record<string, { wins: number; losses: number; pushes: number; pending: number }>;
}

export interface ReplaySlipLeg {
  playerName: string | null;
  team: string | null;
  market: string | null;
  marketLabel: string | null;
  side: string | null;
  line: number | null;
  projection: number | null;
  edgePct: number | null;
  result: string | null;
  finalStat: number | null;
}

export interface ReplaySlip {
  slipId: string;
  profile: string;
  sport: string;
  status: "win" | "loss" | "push" | "pending" | string;
  sameGame: boolean;
  rationale: string | null;
  score: number | null;
  legs: ReplaySlipLeg[];
}

export interface ReplayPayload {
  date: string;
  replayMeta: ReplayProvenance;
  summary: ReplaySummary;
  /** All slips in the replay, deduplicated by `slipId`. */
  slips: ReplaySlip[];
}

export function listReplayDates(): string[] {
  try {
    if (!fs.existsSync(REPLAY_GRADED_DIR)) return [];
    return fs
      .readdirSync(REPLAY_GRADED_DIR)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

export function getReplay(date: string): ReplayPayload | null {
  const file = path.join(REPLAY_GRADED_DIR, `${date}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    const meta = raw.replayMeta as ReplayProvenance | undefined;
    const summary = raw.replaySummary as ReplaySummary | undefined;
    const date = raw.date as string | undefined;
    if (!meta || !summary || !date) return null;
    const rawSlips = Array.isArray(raw.uniqueSlips) ? raw.uniqueSlips : [];
    const slips: ReplaySlip[] = rawSlips
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map((s) => {
        const legs = Array.isArray(s.legs) ? s.legs : [];
        return {
          slipId: String(s.slipId ?? ""),
          profile: String(s.profile ?? "unknown"),
          sport: String(s.sport ?? "unknown"),
          status: String(s.status ?? "pending"),
          sameGame: Boolean(s.sameGame),
          rationale: typeof s.rationale === "string" ? s.rationale : null,
          score: typeof s.score === "number" ? s.score : null,
          legs: legs
            .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
            .map((l) => ({
              playerName: (l.playerName as string) ?? null,
              team: (l.team as string) ?? null,
              market: (l.market as string) ?? null,
              marketLabel: (l.marketLabel as string) ?? null,
              side: (l.side as string) ?? null,
              line: typeof l.line === "number" ? l.line : null,
              projection: typeof l.projection === "number" ? l.projection : null,
              edgePct: typeof l.edgePct === "number" ? l.edgePct : null,
              result: (l.result as string) ?? null,
              finalStat: typeof l.finalStat === "number" ? l.finalStat : null,
            })),
        };
      });
    return { date, replayMeta: meta, summary, slips };
  } catch {
    return null;
  }
}

export function getLatestReplay(): ReplayPayload | null {
  const dates = listReplayDates();
  if (dates.length === 0) return null;
  return getReplay(dates[dates.length - 1]);
}
