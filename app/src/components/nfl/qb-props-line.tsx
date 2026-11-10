/**
 * NFL QB props v0 — the EXPERIMENTAL QB line on /nfl/simulation/[eventId] (engine parity plan §5, PD 2026-11-10).
 *
 * BEHIND A BUILD FLAG THAT DEFAULTS OFF (GTP_NFL_QB_PROPS_PUBLIC, next.config.mjs): OFF, the page never imports this module.
 * When ON it shows, per team, the receipt's projected QB with the simulation's own numbers, labelled
 * "EXPERIMENTAL · MODEL PROJECTION" (the founder's only projection label), and never a price, a line or a pick.
 *
 * R5 (eligibility contract v1): a game whose official forecast is blind to its starting QB's absence
 * (teamInputs.state BLIND_TO_STARTING_QB_ABSENCE), or that has no team-input record, shows nothing — unknown is not
 * publishable. The pass-TD / INT chances come only from the receipt's count PMF (simulation-receipt@2.1); a receipt
 * without one shows the medians only.
 */
import React from "react";

type Quant = { p10: number; p50: number; p90: number };
type PlayerRow = { playerId: string; name?: string | null; team: string; stats?: Record<string, Quant>; countPmf?: Record<string, number[]> };
export type QbReceipt = { eventId: string; schemaVersion?: string; playerStatDistributions?: PlayerRow[] };

export const QB_PROPS_LABEL = "EXPERIMENTAL · MODEL PROJECTION";

/** R5: may this game carry a QB line at all? Only a forecast whose team inputs know the starting-QB situation. */
export function qbLineAllowed(teamInputs: { state?: string } | null | undefined): boolean {
  return Boolean(teamInputs?.state) && teamInputs!.state !== "BLIND_TO_STARTING_QB_ABSENCE" && teamInputs!.state !== "UNKNOWN";
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

const atLeast = (pmf: number[] | undefined, k: number) => (pmf ? pmf.slice(k).reduce((a, b) => a + b, 0) : null);
const pct = (x: number | null) => (x == null ? null : `${Math.round(x * 100)}%`);

export default function QbPropsLine({ receipt, teamInputs }: { receipt: QbReceipt; teamInputs: { state?: string } | null }) {
  if (!qbLineAllowed(teamInputs)) return null;
  const rows = projectedQbRows(receipt);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="qb-props-h" data-nfl-qb-props="" style={{ marginTop: 24 }}>
      <p className="font-mono" style={{ fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--vault-text-mute)", margin: 0 }}>{QB_PROPS_LABEL}</p>
      <h2 id="qb-props-h" className="font-display" style={{ fontSize: 18, margin: "4px 0 8px", color: "var(--vault-text)" }}>Quarterbacks in the simulation</h2>
      <table className="w-full text-[12.5px]">
        <thead><tr><th scope="col" style={{ textAlign: "left" }}>QB</th><th scope="col">Pass yds</th><th scope="col">Comp / Att</th><th scope="col">1+ pass TD</th><th scope="col">2+ pass TD</th><th scope="col">1+ INT</th></tr></thead>
        <tbody>
          {rows.map((p) => {
            const s = p.stats ?? {};
            return (
              <tr key={p.playerId}>
                <th scope="row" style={{ textAlign: "left" }}>{p.name ?? p.playerId} <span style={{ color: "var(--vault-text-mute)" }}>{p.team}</span></th>
                <td>{s.passYds ? Math.round(s.passYds.p50) : "—"}</td>
                <td>{s.cmp && s.passAtt ? `${Math.round(s.cmp.p50)} / ${Math.round(s.passAtt.p50)}` : "—"}</td>
                <td>{pct(atLeast(p.countPmf?.passTd, 1)) ?? "—"}</td>
                <td>{pct(atLeast(p.countPmf?.passTd, 2)) ?? "—"}</td>
                <td>{pct(atLeast(p.countPmf?.int, 1)) ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: "var(--vault-text-mute)", margin: "6px 0 0" }}>
        Medians and chances from this page&apos;s simulated games. Not validated, not a sportsbook line, not a pick. &ldquo;—&rdquo; means the simulation stored no chance for it.
      </p>
    </section>
  );
}
