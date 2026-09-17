"use client";
/**
 * Player research view (v1.3): stat-group selector → Last 3 / 5 / 10 → a simple bar chart → the season game log.
 *
 * EVERY NUMBER HERE IS READ FROM THE PROJECTION. Window sums, averages and sample sizes were computed by the pure
 * read model at build time (lib/research-pages/player-read-model.mjs); this component filters and formats. A null cell is
 * "not recorded" (rendered as a dash with screen-reader text), never 0. There is no hit rate, trend word or grade.
 */
import Link from "next/link";
import { useMemo, useState } from "react";

import { formatGameDate, windowSentence } from "@/lib/research-pages/format.mjs";
import type { PlayerProjection } from "@/lib/research-pages/projection-store";
import { EntityLink, MONO, PANEL, ResultBadge } from "./research-primitives";

interface Props {
  player: Pick<PlayerProjection, "sport" | "name" | "columns" | "groups" | "windows" | "seasons" | "defaultSeason" | "gameLog">;
  labels: Record<string, { name: string; abbreviation: string | null }>;
  teamHrefs: Record<string, string>;
  gameHrefs: Record<string, string>;
}

const V = 11; // PLAYER_ROW.VALUES
const cell: React.CSSProperties = { padding: "7px 9px", fontSize: 13, borderTop: "1px solid var(--vault-rule)", whiteSpace: "nowrap" };
const head: React.CSSProperties = { padding: "6px 9px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--vault-text-faint)", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" };
const num: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums" };

function NotRecorded() {
  return <span style={{ color: "var(--vault-text-faint)" }}><span aria-hidden>—</span><span className="sr-only">not recorded</span></span>;
}

export default function PlayerResearchView({ player, labels, teamHrefs, gameHrefs }: Props) {
  const { columns, groups, windows, seasons, gameLog } = player;
  const [groupKey, setGroupKey] = useState(groups[0]?.key ?? "");
  const group = groups.find((g) => g.key === groupKey) ?? groups[0];
  const [chartKey, setChartKey] = useState<string | null>(null);
  const [season, setSeason] = useState(player.defaultSeason ?? seasons[0]?.id ?? "");

  const colIndex = useMemo(() => new Map(columns.map((c, i) => [c.key, i])), [columns]);
  const colDef = (k: string) => columns[colIndex.get(k)!];
  const groupCols = group ? group.columns : [];
  const chartCol = chartKey && groupCols.includes(chartKey) ? chartKey : groupCols.find((k) => ["receivingYards", "rushingYards", "passingYards", "hits", "pitcherStrikeouts", "shots", "saves", "fouls"].includes(k)) ?? groupCols[0];
  const rows = useMemo(() => gameLog.filter((r) => r[2] === season), [gameLog, season]);
  const selected = seasons.find((s) => s.id === season);
  const tenWindow = chartCol ? windows[chartCol]?.find((w) => w.size === 10) : null;
  const chartRows = chartCol ? gameLog.filter((r) => typeof r[V + colIndex.get(chartCol)!] === "number").slice(0, 10) : [];

  if (!group) return null;
  return (
    <div>
      {groups.length > 1 ? (
        <div role="group" aria-label="Stat category" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {groups.map((g) => (
            <button key={g.key} type="button" aria-pressed={g.key === group.key} onClick={() => setGroupKey(g.key)}
              style={{ minHeight: 44, padding: "0 14px", borderRadius: 999, fontSize: 13, cursor: "pointer", background: g.key === group.key ? "var(--vault-panel-elevated)" : "transparent", color: "var(--vault-text)", border: `1px solid ${g.key === group.key ? "var(--vault-gold)" : "var(--vault-border)"}` }}>
              {g.label}
            </button>
          ))}
        </div>
      ) : (
        <p style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-mute)", margin: "0 0 10px" }}>{group.label}</p>
      )}

      <section aria-labelledby="recent-windows" style={{ ...PANEL }}>
        <h3 id="recent-windows" style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700 }}>Last 3 / 5 / 10 recorded games</h3>
        <div data-scroll-x style={{ overflowX: "auto" }} role="region" aria-label="Recent windows" tabIndex={0}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 380 }}>
            <thead>
              <tr>
                <th scope="col" style={head}>Stat</th>
                {[3, 5, 10].map((n) => <th key={n} scope="col" style={{ ...head, ...num }}>Last {n} · avg (n)</th>)}
              </tr>
            </thead>
            <tbody>
              {groupCols.map((k) => (
                <tr key={k}>
                  <th scope="row" style={{ ...cell, textAlign: "left", fontWeight: 500 }}>{colDef(k).label}</th>
                  {(windows[k] ?? []).map((w) => (
                    <td key={w.size} style={{ ...cell, ...num }}>
                      {w.n ? <>{w.avg} <span style={{ color: "var(--vault-text-faint)", fontFamily: MONO, fontSize: 11 }}>(n={w.n})</span></> : <NotRecorded />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {chartCol && windows[chartCol]?.[0] ? (
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)" }}>{windowSentence(windows[chartCol][0], colDef(chartCol))}</p>
        ) : null}
        <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)" }}>Averages use only games where the stat was recorded; n is that number of games. A window with fewer games than its size says so.</p>
      </section>

      {chartCol && tenWindow && chartRows.length ? (
        <section aria-labelledby="stat-chart" style={{ ...PANEL, marginTop: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <h3 id="stat-chart" style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{colDef(chartCol).label}, game by game</h3>
            {groupCols.length > 1 ? (
              <label style={{ fontSize: 12, color: "var(--vault-text-mute)", display: "inline-flex", gap: 8, alignItems: "center" }}>
                Chart
                <select value={chartCol} onChange={(e) => setChartKey(e.target.value)} style={{ minHeight: 44, background: "var(--vault-panel)", color: "var(--vault-text)", border: "1px solid var(--vault-border)", borderRadius: 8, padding: "0 8px", fontSize: 13 }}>
                  {groupCols.map((k) => <option key={k} value={k}>{colDef(k).label}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          <BarChart
            unit={colDef(chartCol).label.toLowerCase()}
            points={[...chartRows].reverse().map((r) => ({ id: String(r[0]), date: formatGameDate(r[1] as string | null), value: r[V + colIndex.get(chartCol)!] as number }))}
          />
        </section>
      ) : null}

      <section aria-labelledby="game-log" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <h3 id="game-log" style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Game log</h3>
          <label htmlFor="player-season" style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>Season</label>
          <select id="player-season" value={season} onChange={(e) => setSeason(e.target.value)} style={{ minHeight: 44, minWidth: 110, background: "var(--vault-panel)", color: "var(--vault-text)", border: "1px solid var(--vault-border)", borderRadius: 8, padding: "0 10px", fontSize: 14 }}>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {selected ? (
            <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-mute)" }}>
              {selected.games} recorded game{selected.games === 1 ? "" : "s"}
              {groupCols.slice(0, 3).map((k) => (selected.totals[k] ? ` · ${selected.totals[k].sum} ${colDef(k).label.toLowerCase()}` : "")).join("")}
            </span>
          ) : null}
        </div>
        <div data-scroll-x style={{ overflowX: "auto" }} role="region" aria-label={`${player.name} game log`} tabIndex={0}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
            <caption className="sr-only">{player.name} game log, {selected?.label ?? ""}, newest first. A dash means the stat was not recorded for that game.</caption>
            <thead>
              <tr>
                <th scope="col" style={head}>Date</th>
                <th scope="col" style={head}>Team</th>
                <th scope="col" style={head}>Opponent</th>
                {player.sport !== "EPL" ? <th scope="col" style={head}>Team result</th> : <th scope="col" style={head}>Role</th>}
                {groupCols.map((k) => <th key={k} scope="col" style={{ ...head, ...num }} title={colDef(k).label}><abbr title={colDef(k).label} style={{ textDecoration: "none" }}>{colDef(k).short}</abbr></th>)}
                <th scope="col" style={head}><span className="sr-only">Game page</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const team = r[3] ? labels[r[3] as string] : null;
                const opp = r[4] ? labels[r[4] as string] : null;
                const href = gameHrefs[r[0] as string];
                return (
                  <tr key={String(r[0])}>
                    <td style={{ ...cell, fontFamily: MONO, fontSize: 12 }}>{formatGameDate(r[1] as string | null)}</td>
                    <td style={cell}><EntityLink href={r[3] ? teamHrefs[r[3] as string] : null}>{team?.abbreviation ?? team?.name ?? "—"}</EntityLink></td>
                    <td style={cell}>
                      <span style={{ color: "var(--vault-text-faint)", fontFamily: MONO, fontSize: 11 }}>{r[5] === "H" ? "vs" : r[5] === "A" ? "@" : r[5] === "N" ? "vs" : ""}</span>{" "}
                      <EntityLink href={r[4] ? teamHrefs[r[4] as string] : null}>{opp?.abbreviation ?? opp?.name ?? "—"}</EntityLink>
                    </td>
                    {player.sport !== "EPL" ? (
                      <td style={cell}>{r[6] ? <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontVariantNumeric: "tabular-nums" }}><ResultBadge code={r[6] as string} /> {r[7]}–{r[8]}</span> : <span style={{ fontSize: 12, color: "var(--vault-text-faint)" }}>Not recorded</span>}</td>
                    ) : (
                      <td style={{ ...cell, fontSize: 12, color: "var(--vault-text-mute)" }}>{r[10] === "S" ? "Started" : "Came on"}</td>
                    )}
                    {groupCols.map((k) => {
                      const v = r[V + colIndex.get(k)!];
                      return <td key={k} style={{ ...cell, ...num }}>{typeof v === "number" ? v : <NotRecorded />}</td>;
                    })}
                    <td style={{ ...cell, textAlign: "right" }}>{href ? <Link href={href} style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-gold-bright)" }}>Game →</Link> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Plain SVG bars, oldest → newest, zero baseline, no interpolation. The accessible alternative lists every value. */
function BarChart({ points, unit }: { points: Array<{ id: string; date: string; value: number }>; unit: string }) {
  const W = 600, H = 170, P = { l: 34, r: 8, t: 12, b: 26 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const min = Math.min(0, ...points.map((p) => p.value));
  const span = max - min || 1;
  const bw = (W - P.l - P.r) / points.length;
  const y = (v: number) => P.t + ((max - v) / span) * (H - P.t - P.b);
  const desc = `${unit} in the last ${points.length} recorded games, oldest to newest: ${points.map((p) => `${p.date} ${p.value}`).join("; ")}.`;
  return (
    <figure style={{ margin: "10px 0 0" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={desc} style={{ width: "100%", height: "auto", display: "block" }}>
        <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} stroke="var(--vault-border-strong)" strokeWidth={1} />
        <text x={P.l - 6} y={y(max) + 4} textAnchor="end" fontSize={10} fill="var(--vault-text-faint)">{max}</text>
        <text x={P.l - 6} y={y(0) + 4} textAnchor="end" fontSize={10} fill="var(--vault-text-faint)">0</text>
        {points.map((p, i) => {
          const x = P.l + i * bw + bw * 0.18;
          const top = Math.min(y(p.value), y(0));
          const h = Math.max(Math.abs(y(p.value) - y(0)), p.value === 0 ? 1 : 0);
          return (
            <g key={p.id}>
              <rect x={x} y={top} width={bw * 0.64} height={h} rx={2} fill="var(--vault-gold)" opacity={0.85} />
              <text x={x + bw * 0.32} y={top - 3} textAnchor="middle" fontSize={10} fill="var(--vault-text-mute)">{p.value}</text>
              <text x={x + bw * 0.32} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--vault-text-faint)">{p.date.replace(/,\s*\d{4}$/, "")}</text>
            </g>
          );
        })}
      </svg>
      <figcaption style={{ fontSize: 11.5, color: "var(--vault-text-faint)", marginTop: 4 }}>Each bar is one recorded game; games where this stat was not recorded are left out, not drawn as zero.</figcaption>
    </figure>
  );
}
