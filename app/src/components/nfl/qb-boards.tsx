/**
 * NFL hub · the EXPERIMENTAL QB market boards (row G, PD 2026-11-11): the five QB markets from the QB props projections
 * (lib/sports/nfl/qb-boards.mjs), per market the projected quarterbacks by their simulated median with the 80% range
 * and the market's status. Labelled "EXPERIMENTAL · MODEL PROJECTION"; never a price, a line, a pick, an edge or a
 * confidence word.
 *
 * BEHIND A BUILD FLAG THAT DEFAULTS OFF (GTP_NFL_QB_BOARDS_PUBLIC, next.config.mjs): OFF, the hub never imports this
 * module (qb-boards-export.test.mjs checks the built export).
 */
import React from "react";

type Row = { eventId: string; team: string; playerId: string; name: string; median: number; p10: number; p90: number };
type Market = { market: string; label: string; status: string; rows: Row[] };
export type QbBoardsModel = { label: string; size: number; quarterbacks: number; markets: Market[] };

const STATUS_WORDS: Record<string, string> = { IMPLEMENTED_EXPERIMENTAL: "Experimental", FORWARD_EVALUATION: "Under forward evaluation", VALIDATED_OFFICIAL: "Validated" };
const mute = { color: "var(--vault-text-mute)" } as const;

export default function QbBoards({ model }: { model: QbBoardsModel }) {
  if (!model.quarterbacks) return null;
  return (
    <section aria-labelledby="nfl-qb-boards-h" data-nfl-qb-boards="" style={{ marginTop: 22 }}>
      <p className="font-mono" style={{ fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0, ...mute }}>{model.label} · RESEARCH</p>
      <h3 id="nfl-qb-boards-h" style={{ margin: "4px 0 6px", fontSize: 15, fontWeight: 700, color: "var(--vault-text)" }}>Quarterback markets in the simulation</h3>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {model.markets.map((m) => (
          <table key={m.market} className="w-full text-[12.5px]" data-nfl-qb-board={m.market}>
            <caption style={{ textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--vault-text)" }}>{m.label} <span style={mute}>· {STATUS_WORDS[m.status] ?? m.status}</span></caption>
            <thead><tr><th scope="col" style={{ textAlign: "left" }}>Quarterback</th><th scope="col">Median</th><th scope="col">80% of runs</th></tr></thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.playerId}>
                  <th scope="row" style={{ textAlign: "left", fontWeight: 500 }}><a href={`/nfl/simulation/${r.eventId}/`}>{r.name}</a> <span style={mute}>{r.team}</span></th>
                  <td>{Math.round(r.median)}</td>
                  <td>{Math.round(r.p10)}–{Math.round(r.p90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <p style={{ fontSize: 12, margin: "6px 0 0", ...mute }}>
        Medians and ranges come from each game&apos;s simulated runs. They are not validated, not a sportsbook number and not a pick. Only quarterbacks cleared to play, in games whose official forecast accounts for the starting quarterback, are listed.
      </p>
    </section>
  );
}
