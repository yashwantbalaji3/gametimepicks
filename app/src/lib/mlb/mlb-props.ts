/**
 * Loader for the ingested MLB player-props board (`mlb/player-props/<date>.json`). Returns the rows the
 * Props Board renders, or an empty array when no board is posted. Read-only; never fabricates.
 */
import fs from "node:fs";
import path from "node:path";
import type { BoardProp } from "@/components/mlb/props-board";

/**
 * Latest MLB board date that actually has ingested props AND is on/before `today` (ET). Lets the MLB
 * flagship surface the freshest real slate (e.g. June 24) instead of a stale WC-biased slate date, while
 * never jumping to a pre-generated future slate. Returns null when no board exists.
 */
export function latestMlbBoardDate(root: string, today: string): string | null {
  try {
    const dir = path.join(root, "mlb", "home-run-props");
    const dates = fs.readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ""))
      .filter((d) => d <= today)
      .sort();
    return dates.length ? dates[dates.length - 1] : null;
  } catch { return null; }
}

export function loadMlbPropsBoard(root: string, date: string): BoardProp[] {
  let raw: { date?: string; props?: Array<Record<string, any>> } | null = null;
  for (const rel of [["mlb", "player-props", `${date}.json`], ["mlb", "player-props", "latest.json"]]) {
    try { raw = JSON.parse(fs.readFileSync(path.join(root, ...rel), "utf8")); break; } catch { /* next */ }
  }
  if (!raw || (raw.date && raw.date !== date)) return [];
  const all: BoardProp[] = (raw.props ?? []).map((p) => ({
    player: String(p.player ?? ""), market: String(p.market ?? ""), marketLabel: String(p.marketLabel ?? p.market ?? ""),
    group: String(p.group ?? ""), selection: String(p.selection ?? ""), point: typeof p.point === "number" ? p.point : null,
    americanOdds: Number(p.americanOdds ?? p.odds ?? 0), provider: p.provider ?? null,
    matchup: String(p.matchup ?? ""), gameId: String(p.gameId ?? ""),
    photoUrl: p.photoUrl ?? null, teamAbbr: p.teamAbbr ?? null,
    opponentAbbr: p.opponentAbbr ?? null, homeAway: p.homeAway ?? null,
  })).filter((p) => p.player && Number.isFinite(p.americanOdds) && p.americanOdds !== 0);

  // Cap the board payload: top N per market group by market-implied probability, so the page stays
  // light (the full artifact remains for server-side generation/settlement). Keeps group diversity.
  const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
  const PER_GROUP = 60;
  const byGroup = new Map<string, BoardProp[]>();
  for (const p of all) { const g = byGroup.get(p.group) ?? []; g.push(p); byGroup.set(p.group, g); }
  const out: BoardProp[] = [];
  for (const g of byGroup.values()) {
    g.sort((a, b) => 1 / dec(a.americanOdds) < 1 / dec(b.americanOdds) ? 1 : -1);
    out.push(...g.slice(0, PER_GROUP));
  }
  return out;
}
