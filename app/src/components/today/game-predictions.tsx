/**
 * TodayGamePredictions (Sprint 010) — the /today Game Predictions table: the model's answer for every game
 * at a glance (winner, projected score, total O/U, run line), sourced ENTIRELY from the canonical prediction
 * objects (never hardcoded). The first thing a user sees on the daily command center. Horizontally
 * scrollable on narrow screens so the dense terminal-style row never breaks the mobile layout.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import MatchupIdentity from "@/components/ui/matchup-identity";
import { formatEtTime } from "@/lib/mlb/public-provenance";
import type { GamePredictionRow } from "@/lib/mlb/prediction/slate";

const pct = (p: number): string => `${Math.round(p * 100)}%`;

function Cell({ children, muted, align = "left" }: { children: ReactNode; muted?: boolean; align?: "left" | "right" | "center" }) {
  return (
    <td className="px-2.5 py-2 align-middle whitespace-nowrap" style={{ textAlign: align, color: muted ? "var(--vault-text-mute)" : "var(--vault-text)", fontSize: 12 }}>
      {children}
    </td>
  );
}

export default function TodayGamePredictions({ rows }: { rows: GamePredictionRow[] }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="game-predictions-h" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="game-predictions-h" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>
          Game predictions
        </h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>from 10,000-game simulations · paper-only</span>
      </div>
      <div className="rounded-[12px] overflow-x-auto" style={{ border: "1px solid var(--vault-border)", background: "rgba(26,16,11,0.55)" }}>
        <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 620 }}>
          <thead>
            <tr style={{ color: "var(--vault-text-faint)" }}>
              {["Matchup", "Time", "Moneyline", "Score", "Total", "Run line", ""].map((h, i) => (
                <th key={h || i} className="px-2.5 py-1.5 font-mono uppercase tracking-[0.08em]" style={{ fontSize: 8.5, textAlign: i === 0 ? "left" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const time = formatEtTime(r.firstPitchIso);
              return (
                <tr key={r.gamePk} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                  <Cell>
                    <span className="inline-flex items-center gap-2">
                      <MatchupIdentity homeName={r.homeTeamName} awayName={r.awayTeamName} homeLogo={r.homeLogo} awayLogo={r.awayLogo} size="sm" />
                      <span className="font-semibold">{r.awayTeam} @ {r.homeTeam}</span>
                    </span>
                  </Cell>
                  <Cell muted><span className="font-mono" style={{ fontSize: 10.5 }}>{time ?? "—"}</span></Cell>
                  <Cell>
                    {r.moneyline ? (
                      <span><strong style={{ color: "var(--vault-gold)" }}>{r.moneyline.team}</strong> <span style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{pct(r.moneyline.probability)}</span></span>
                    ) : <span style={{ color: "var(--vault-text-faint)" }}>—</span>}
                  </Cell>
                  <Cell muted>{r.score ? <span className="font-mono">{r.awayTeam} {r.score.away}–{r.score.home} {r.homeTeam}</span> : "—"}</Cell>
                  <Cell>
                    {r.total ? <span><strong>{r.total.pick} {r.total.line}</strong> <span style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{pct(r.total.probability)}</span></span> : <span style={{ color: "var(--vault-text-faint)" }}>—</span>}
                  </Cell>
                  <Cell>
                    {r.runLine ? <span><strong>{r.runLine.pick}</strong> <span style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{pct(r.runLine.coverProbability)}</span></span> : <span style={{ color: "var(--vault-text-faint)" }}>—</span>}
                  </Cell>
                  <Cell align="right">
                    <Link href={r.href} className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>Open →</Link>
                  </Cell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="font-mono m-0" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
        Predictions are the simulation&rsquo;s directional read — not a bet, and not a claim to out-perform the book. Probabilities and distributions are in each game report.
      </p>
    </section>
  );
}
