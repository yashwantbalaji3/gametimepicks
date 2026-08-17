/**
 * Loader for the ingested MLB player-props board (`mlb/player-props/<date>.json`). Returns the rows the
 * Props Board renders, or an empty array when no board is posted. Read-only; never fabricates.
 */
import fs from "node:fs";
import path from "node:path";
import type { BoardProp } from "@/components/mlb/props-board";
import { mlbHeadshotUrl } from "@/lib/player-headshots";

/**
 * IDENTITY ENRICHMENT — where the faces and crests come from.
 *
 * The ingested props artifact carries a player's NAME and nothing else: no playerId, no photo, no
 * team abbreviation, on all 1,064 rows. So every avatar on the batter and pitcher boards fell back
 * to two grey initials and every crest was absent, while the Homer Nukes board two sections above
 * showed real portraits — because that artifact happens to carry playerId.
 *
 * The model board already holds the missing fields for the same slate, keyed by the same gameId.
 * So identity is JOINED from it rather than invented: 158 of 168 players on today's board resolve.
 * A player the board cannot answer for keeps a null photo and renders initials — which is the
 * honest fallback, not a broken image.
 *
 * Joined on gameId + name, not name alone: a bare name join would silently cross games in a
 * doubleheader, and this repo has already paid for one identity collision.
 */
interface Identity { playerId: number | null; teamAbbr: string | null; opponentAbbr: string | null; homeAway: "home" | "away" | null }

function identityIndex(root: string, date: string): Map<string, Identity> {
  const out = new Map<string, Identity>();
  try {
    const board = JSON.parse(fs.readFileSync(path.join(root, "mlb", "boards", `${date}.json`), "utf8"));
    for (const r of board.leans ?? []) {
      const name = r.playerName;
      const gameId = String(r.gameId ?? "");
      if (!name || !gameId) continue;
      const abbr = r.playerTeamAbbr ?? null;
      const isHome = abbr != null && abbr === r.homeTeamAbbr;
      out.set(`${gameId}|${name}`, {
        playerId: typeof r.playerId === "number" ? r.playerId : null,
        teamAbbr: abbr,
        opponentAbbr: abbr == null ? null : isHome ? r.awayTeamAbbr ?? null : r.homeTeamAbbr ?? null,
        homeAway: abbr == null ? null : isHome ? "home" : "away",
      });
    }
  } catch { /* no board for this slate — every row keeps its initials fallback */ }
  return out;
}

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
  const identity = identityIndex(root, date);
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
    ...(() => {
      const id = identity.get(`${String(p.gameId ?? "")}|${String(p.player ?? "")}`);
      return {
        photoUrl: p.photoUrl ?? (id?.playerId ? mlbHeadshotUrl(id.playerId) : null),
        teamAbbr: p.teamAbbr ?? id?.teamAbbr ?? null,
        opponentAbbr: p.opponentAbbr ?? id?.opponentAbbr ?? null,
        homeAway: p.homeAway ?? id?.homeAway ?? null,
      };
    })(),
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
