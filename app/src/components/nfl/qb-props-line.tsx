/**
 * NFL QB props — the EXPERIMENTAL QB research section on /nfl/simulation/[eventId] (founder decisions 2026-11-10).
 *
 * BEHIND A BUILD FLAG THAT DEFAULTS OFF (GTP_NFL_QB_PROPS_PUBLIC, next.config.mjs): OFF, the page never imports this module.
 * When ON it shows, per team, the receipt's projected QB with all five markets from this page's ONE simulation — passing
 * TDs, yards, completions, attempts, interceptions: the run range and median, and "k or more" chances read exactly from the
 * run counts (simulation-receipt@2.2; the count PMF for TDs/INTs on @2.1) — plus the QB's actual previous games, labelled
 * HISTORY. Labelled "EXPERIMENTAL · MODEL PROJECTION" with each market's status; never a price, a line, a pick, an edge
 * or a confidence word.
 *
 * R5 (eligibility contract v1): a game whose official forecast is blind to its starting QB's absence
 * (teamInputs.state BLIND_TO_STARTING_QB_ABSENCE), or that has no team-input record, shows nothing — unknown is not
 * publishable.
 */
import React from "react";
import { qbMarketViews, r5Allows } from "@/lib/sports/nfl/qb-props-markets.mjs";

type Quant = { p10: number; p50: number; p90: number };
type PlayerRow = { playerId: string; name?: string | null; team: string; stats?: Record<string, Quant>; countPmf?: Record<string, number[]>; exactCounts?: Record<string, Record<string, number>> };
export type QbReceipt = { eventId: string; eventStart?: string; schemaVersion?: string; playerStatDistributions?: PlayerRow[] };

/* Founder language decision 2026-11-11: the site-wide MODEL PROJECTION label; plain status words (the markets' lifecycle
   codes stay in qb-props-markets.mjs and the receipts). */
export const QB_PROPS_LABEL = "MODEL PROJECTION";
const STATUS_WORDS: Record<string, string> = {
  IMPLEMENTED_EXPERIMENTAL: "Wider projection range",
  FORWARD_EVALUATION: "Wider projection range",
  VALIDATED_OFFICIAL: "Official",
};

/** R5: may this game carry a QB line at all? Only a forecast whose team inputs know the starting-QB situation. */
export function qbLineAllowed(teamInputs: { state?: string } | null | undefined): boolean {
  return r5Allows(teamInputs);
}

/** The projected QB per team: the largest pass-attempt median (the grader's rule). */
export function projectedQbRows(r: QbReceipt): PlayerRow[] {
  const best = new Map<string, PlayerRow>();
  for (const p of r.playerStatDistributions ?? []) {
    const att = p.stats?.passAtt?.p50 ?? 0;
    if (p.playerId === "OTHER" || !(att > 0)) continue;
    const cur = best.get(p.team);
    if (!cur || att > (cur.stats?.passAtt?.p50 ?? 0)) best.set(p.team, p);
  }
  return [...best.values()].sort((a, b) => a.team.localeCompare(b.team));
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const mute = { color: "var(--vault-text-mute)" } as const;

type HistoryRow = { season: number; week: number; date: string; opponent: string | null; passCmp: number; passAtt: number; passYds: number; passTd: number; passInt: number };

/** `history`: playerId → previous games played before this kickoff (qb-props-history-file.mjs). */
export default function QbPropsLine({ receipt, teamInputs, history = {} }: { receipt: QbReceipt; teamInputs: { state?: string } | null; history?: Record<string, HistoryRow[]> }) {
  if (!qbLineAllowed(teamInputs)) return null;
  const rows = projectedQbRows(receipt);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="qb-props-h" data-nfl-qb-props="" style={{ marginTop: 24 }}>
      <p className="font-mono" style={{ fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0, ...mute }}>{QB_PROPS_LABEL}</p>
      <h2 id="qb-props-h" className="font-display" style={{ fontSize: 18, margin: "4px 0 8px", color: "var(--vault-text)" }}>Quarterbacks in the simulation</h2>
      {rows.map((p) => {
        const views = qbMarketViews(p);
        const past = history[p.playerId.startsWith("nfl-athlete-") ? p.playerId : `nfl-athlete-${p.playerId}`] ?? [];
        return (
          <div key={p.playerId} style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, margin: "8px 0 4px" }}>{p.name ?? p.playerId} <span style={mute}>{p.team}</span></h3>
            <table className="w-full text-[12.5px]">
              <thead><tr><th scope="col" style={{ textAlign: "left" }}>Market</th><th scope="col">Median</th><th scope="col">80% of runs</th><th scope="col">Chances in the runs</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {views.map((v) => (
                  <tr key={v.market}>
                    <th scope="row" style={{ textAlign: "left" }}>{v.label}</th>
                    <td>{v.distribution ? Math.round(v.distribution.p50) : "—"}</td>
                    <td>{v.distribution ? `${Math.round(v.distribution.p10)}–${Math.round(v.distribution.p90)}` : "—"}</td>
                    <td>{v.chances ? v.chances.map((c) => `${c.atLeast}+: ${pct(c.p)}`).join(" · ") : "—"}</td>
                    <td>{STATUS_WORDS[v.status] ?? v.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {past.length ? (
              <table className="w-full text-[12px]" data-nfl-qb-history="" style={{ marginTop: 6 }}>
                <caption style={{ textAlign: "left", fontSize: 11, ...mute }}>History: actual results in his previous {past.length} games before this kickoff. Not a forecast.</caption>
                <thead><tr><th scope="col" style={{ textAlign: "left" }}>Game</th><th scope="col">Comp / Att</th><th scope="col">Yds</th><th scope="col">TD</th><th scope="col">INT</th></tr></thead>
                <tbody>
                  {past.map((h) => (
                    <tr key={`${h.season}-${h.week}-${h.date}`}>
                      <th scope="row" style={{ textAlign: "left" }}>{h.season} wk {h.week}{h.opponent ? ` vs ${h.opponent}` : ""}</th>
                      <td>{h.passCmp} / {h.passAtt}</td><td>{h.passYds}</td><td>{h.passTd}</td><td>{h.passInt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        );
      })}
      <p style={{ fontSize: 12, margin: "6px 0 0", ...mute }}>
        Medians, ranges and chances come from this page&apos;s simulated games. They are not validated, not a sportsbook number and not a pick. &ldquo;—&rdquo; means the simulation stored no chance for it.
      </p>
    </section>
  );
}
