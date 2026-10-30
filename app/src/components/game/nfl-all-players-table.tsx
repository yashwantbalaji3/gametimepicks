/**
 * Every official-board player in one table (gap 4, 2026-10-23) — the default read of an NFL game's player forecasts.
 *
 * Server component. Reads the SAME forecast view the stat tabs below read (lib/sports/nfl/forecast-view.mjs: the
 * official player board through the official forecast snapshot), so every number here is the number the tabs show,
 * rounded by the view's own formatValue: the headline (median for yards and receptions, chance for a
 * touchdown) and its 80% range. Position is the roster capture's, joined by the exact ESPN athlete id; none ⇒ "—".
 * Who the forecast leaves out, and why, stays in NotInTheseNumbers directly below this section's tabs.
 */
import fs from "node:fs";
import path from "node:path";

import { PLAYER_FAMILIES, formatValue } from "@/lib/sports/nfl/forecast-view.mjs";

type Entry = { value: number; p10?: number | null; p90?: number | null; familyState?: string; estimateLabel?: string };
type ViewPlayer = { playerId: string; name: string; team: string; availabilityLabel?: string | null; families: Record<string, Entry | undefined> };

const COLUMNS = PLAYER_FAMILIES.filter((f) => f.source);

let positionCache: Map<string, string> | null = null;
function positions(): Map<string, string> {
  if (!positionCache) {
    positionCache = new Map();
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "nfl", "rosters", "latest.json"), "utf8")) as { teams?: Array<{ players?: Array<{ id?: string; position?: { abbreviation?: string } }> }> };
      for (const t of doc.teams ?? []) for (const p of t.players ?? []) if (p.id && p.position?.abbreviation) positionCache.set(String(p.id), p.position.abbreviation);
    } catch { /* no roster capture ⇒ every position reads "—" */ }
  }
  return positionCache;
}

export default function NflAllPlayersTable({ players, away, home }: { players: ViewPlayer[]; away: string; home: string }) {
  if (!players.length) return null;
  const pos = positions();
  const cols = COLUMNS.filter((c) => players.some((p) => p.families[c.key]));
  /* Estimate columns (founder P0 2026-10-30): marked in the header and named once under the table with their one label. */
  const estLabel = (key: string) => players.map((p) => p.families[key]).find((e) => e?.familyState === "ESTIMATE")?.estimateLabel ?? null;
  const estCols = cols.filter((c) => estLabel(c.key));
  const order = (t: string) => (t === away ? 0 : t === home ? 1 : 2);
  const weight = (p: ViewPlayer) => Math.max(...cols.filter((c) => c.kind === "yards").map((c) => p.families[c.key]?.value ?? 0), 0);
  const rows = [...players].sort((a, b) => order(a.team) - order(b.team) || weight(b) - weight(a) || a.name.localeCompare(b.name));
  return (
    <div className="ap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <h3 className="ap-h3">All {rows.length} players on the official board</h3>
      <p className="ap-sub">The headline number is the median for yards and receptions and the chance for a touchdown; the range under it is the 80% range. &ldquo;—&rdquo; means no official projection for that statistic.</p>
      <div className="ap-scroll" role="region" aria-label="All players on the official board" tabIndex={0}>
        <table className="ap-table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Team</th>
              <th scope="col">Pos</th>
              {cols.map((c) => <th key={c.key} scope="col" title={estLabel(c.key) ? `${c.title} · ${estLabel(c.key)}` : c.title} data-estimate={estLabel(c.key) ? c.key : undefined}>{c.short}{estLabel(c.key) ? " (est.)" : ""}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.playerId}>
                <th scope="row">{p.name}{p.availabilityLabel ? <span className="ap-range">{p.availabilityLabel}</span> : null}</th>
                <td>{p.team}</td>
                <td>{pos.get(p.playerId.replace(/^nfl-athlete-/, "")) ?? "—"}</td>
                {cols.map((c) => {
                  const e = p.families[c.key];
                  return (
                    <td key={c.key}>
                      <span className="ap-val">{e ? formatValue(c.kind, e.value) : "—"}</span>
                      {e && e.p10 != null && e.p90 != null ? <span className="ap-range">{formatValue(c.kind, e.p10)}–{formatValue(c.kind, e.p90)}</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {estCols.length ? (
        <p className="ap-sub" data-estimate-columns>
          {[...new Set(estCols.map((c) => estLabel(c.key)))].map((l) => `${estCols.filter((c) => estLabel(c.key) === l).map((c) => c.title).join(" and ")}: ${l}.`).join(" ")}
        </p>
      ) : null}
    </div>
  );
}

const CSS = `
.ap{margin:14px 0 18px}
.ap-h3{margin:0;font-size:15px;font-weight:700;color:var(--vault-text)}
.ap-sub{margin:4px 0 0;font-size:12px;line-height:1.55;color:var(--vault-text-mute);max-width:720px}
.ap-scroll{overflow-x:auto;margin-top:8px;max-width:100%}
.ap-table{border-collapse:collapse;width:100%;font-size:12.5px;font-variant-numeric:tabular-nums}
.ap-table th,.ap-table td{padding:6px 8px;border-top:1px solid var(--vault-border);text-align:right;vertical-align:top;white-space:nowrap}
.ap-table th[scope=row],.ap-table thead th:first-child{text-align:left;white-space:normal;min-width:120px;font-weight:600;color:var(--vault-text)}
.ap-table td:nth-child(2),.ap-table td:nth-child(3),.ap-table thead th:nth-child(2),.ap-table thead th:nth-child(3){text-align:left}
.ap-table thead th{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--vault-text-faint);font-weight:500;border-top:0}
.ap-val{display:block;font-size:13.5px;font-weight:700;color:var(--vault-text);font-family:var(--font-mono,monospace)}
.ap-range{display:block;font-size:10.5px;font-weight:400;color:var(--vault-text-faint)}
`;
