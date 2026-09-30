/**
 * RESULTS V2 · TRENDING ON OUR BOARDS (B-5). Server/build time only. DESCRIPTIVE — never a pick, never a record.
 *
 * Separate from the frozen Top-5 boards on purpose: those are published before kickoff and graded; this is a
 * look back at how finals compared with our median in the latest NFL week with final games. It answers
 * "who ran hotter or colder than we projected", with its denominator, and nothing else.
 *
 * Derived at BUILD time from the reconciliation owner (public/data/nfl/reconciliation/<seasonType>-<week>.json),
 * so it can never go stale the way the retired /trends snapshot did (a demo file automation never refreshed).
 * Only PUBLISHED families; a VOID row (did not play) is not a final and never enters.
 */
import fs from "node:fs";
import path from "node:path";

export interface TrendRow { name: string; team: string; opponent: string | null; median: number; actual: number; delta: number; providerEventId: string }
export interface TrendFamily { prop: string; label: string; graded: number; above: TrendRow[]; below: TrendRow[] }
export interface Trending { periodLabel: string; gamesFinal: number; gamesPending: number; families: TrendFamily[] }

const LABEL: Record<string, string> = { player_rush_yds: "Rushing yards", player_reception_yds: "Receiving yards", player_receptions: "Receptions" };
const SHOWN = 3;

/** The latest regular-season week with at least one final game, or null. */
export function latestTrending(): Trending | null {
  const dir = path.join(process.cwd(), "public/data/nfl/reconciliation");
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => /^2-\d+\.json$/.test(f)).sort(); } catch { return null; }
  for (const f of files.reverse()) {
    let doc: any = null;
    try { doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    const finals = (doc?.games ?? []).filter((g: any) => g.state === "FINAL");
    if (!finals.length) continue;
    const families: TrendFamily[] = Object.keys(LABEL).map((prop) => {
      const rows: TrendRow[] = [];
      for (const g of finals) {
        const [away, home] = String(g.matchup ?? "").split(" @ ");
        for (const p of g.players ?? []) {
          if (p.prop !== prop || p.status !== "PUBLISHED" || p.outcome === "VOID") continue;
          if (typeof p.actual !== "number" || typeof p.median !== "number") continue;
          rows.push({ name: String(p.name), team: String(p.team), opponent: p.team === home ? away ?? null : p.team === away ? home ?? null : null, median: p.median, actual: p.actual, delta: p.actual - p.median, providerEventId: String(g.providerEventId) });
        }
      }
      const by = (sign: 1 | -1) => rows.filter((r) => sign * r.delta > 0).sort((a, b) => sign * (b.delta - a.delta) || a.name.localeCompare(b.name)).slice(0, SHOWN);
      return { prop, label: LABEL[prop], graded: rows.length, above: by(1), below: by(-1) };
    }).filter((fam) => fam.graded > 0);
    return { periodLabel: String(doc.period?.label ?? f.replace(".json", "")), gamesFinal: finals.length, gamesPending: (doc.games ?? []).length - finals.length, families };
  }
  return null;
}
