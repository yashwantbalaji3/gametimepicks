/**
 * SHARED TRENDS · THE LINE-GATE HOOK and the hit count (trends-shared, 2026-11-11). SERVER ONLY (imports lib/odds).
 *
 * A sport's adapter hands in its captured line records, normalized to { athleteId, stat, family, line, capturedAt };
 * `gatedLines` keeps a record only when the sport's site display AND that family's direction are authorized
 * (lib/odds/display-authorization.mjs directionAuthorization(sport, family, "site")), keeps only the LINE and its CAPTURE
 * TIME (never a price, a book or odds), and resolves several records for one player and stat to the newest capture
 * (then the lower line). A stat with no family (e.g. NFL completions) never carries a line. Lines leave this module only
 * into page HTML (the shared board's hidden block), never into a drawer file.
 */
import { directionAuthorization, DISPLAY_AUTHORIZATION } from "@/lib/odds/display-authorization.mjs";

export type LineRecordIn = { athleteId?: unknown; stat?: string | null; family?: string | null; line?: unknown; capturedAt?: unknown };
/** Gated lines by `${athleteId}|${stat}`. */
export type GatedLineMap = ReadonlyMap<string, { line: number; capturedAt: string }>;

export function gatedLines(records: readonly LineRecordIn[] | null, { sport, stats, authorization = DISPLAY_AUTHORIZATION }: { sport: "nba" | "nfl"; stats: readonly string[]; authorization?: unknown }): GatedLineMap | null {
  if (!records) return null;
  const want = new Set(stats);
  const out = new Map<string, { line: number; capturedAt: string }>();
  for (const r of records) {
    const stat = String(r?.stat ?? ""), fam = String(r?.family ?? "");
    if (!want.has(stat) || !fam || !directionAuthorization(sport, fam, "site", authorization as never).ok) continue;
    const line = Number(r.line), at = typeof r.capturedAt === "string" ? r.capturedAt : null;
    if (!Number.isFinite(line) || !at || !Number.isFinite(Date.parse(at))) continue;
    const key = `${String(r.athleteId)}|${stat}`, prev = out.get(key);
    if (!prev || at > prev.capturedAt || (at === prev.capturedAt && line < prev.line)) out.set(key, { line, capturedAt: at });
  }
  return out;
}

/** PURE: games strictly above `line` in each window of games played (a whole-number line met exactly is not a hit). */
export function hitsAtLine(games: readonly Record<string, unknown>[], stat: string, line: number, windows: readonly number[]) {
  return windows.map((size) => { const w = games.slice(0, size); return { size, played: w.length, hit: w.filter((g) => (g[stat] as number) > line).length }; });
}
