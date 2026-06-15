/**
 * UfcEventResultsRecap — the settled-event recap for a finished UFC card. Renders the official
 * result of every fight, how each moneyline projection graded, the suggested-card outcomes, and
 * the model-only expanded-projection grades (learning only — never a betting P&L).
 *
 * Honesty: all winners/rounds are official (ESPN MMA). The specific finish method (KO vs sub) is
 * not in the connected feed, so method is graded at the finish-vs-decision level only; that limit
 * is shown, never papered over.
 */
type MlGrade = { modelPick: string; modelProbability: number; oddsPrice: number; result: "win" | "loss" };
type Fight = {
  fighters: string[]; officialWinner: string; endRound: number; time: string; scheduledRounds: number;
  wentDistance: boolean; result: string; moneyline: MlGrade; goesDistanceGrade?: string | null; expandedWithheld?: boolean;
};
type CardRes = { riskLabel: string; legCount: number; result: "won" | "lost"; legs: { fighter: string; result: string }[]; bustedBy: string[] };
export type UfcSettlement = {
  event: string; settledAt: string; source: string; sourceNote?: string;
  moneyline: { record: string; accuracyPct: number; calibration: Record<string, { wins: number; total: number }> };
  expandedModelOnly: { goesDistance: { correct: number; graded: number }; finishVsDecision: { correct: number; graded: number } };
  suggestedCards: { record: string; cards: CardRes[] };
  fights: Fight[];
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const am = (p: number) => (p > 0 ? `+${p}` : `${p}`);

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-[8px] px-3 py-2.5" style={{ background: "rgba(12,8,6,0.55)", border: "1px solid var(--vault-rule)" }}>
      <div className="font-display tabular" style={{ color: accent ?? "var(--vault-text)", fontSize: 17, fontWeight: 700 }}>{value}</div>
      <div className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{label}</div>
    </div>
  );
}

export default function UfcEventResultsRecap({ s }: { s: UfcSettlement }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--gtp-bank-heat)" }}>{s.event} · officially settled</span>
        <span className="rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold tracking-[0.1em]" style={{ color: "var(--vault-success)", background: "rgba(110,231,168,0.14)", border: "1px solid rgba(110,231,168,0.35)" }}>FINAL</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Moneyline record" value={s.moneyline.record} accent="var(--vault-success)" />
        <Stat label="Moneyline accuracy" value={`${s.moneyline.accuracyPct}%`} />
        <Stat label="Suggested cards" value={s.suggestedCards.record} accent="var(--vault-danger)" />
        <Stat label="Goes-distance (model)" value={`${s.expandedModelOnly.goesDistance.correct}/${s.expandedModelOnly.goesDistance.graded}`} />
      </div>

      {/* Per-fight: model pick vs official result */}
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)" }}>Pick vs official result</span>
        {s.fights.map((f, i) => (
          <div key={i} className="flex items-center gap-3 rounded-[8px] px-3 py-2.5" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
            <span aria-hidden style={{ color: f.moneyline.result === "win" ? "var(--vault-success)" : "var(--vault-danger)", fontSize: 13 }}>{f.moneyline.result === "win" ? "✓" : "✕"}</span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12.5px] font-semibold" style={{ color: "var(--vault-text)" }}>
                {f.fighters[0]} <span style={{ color: "var(--vault-text-faint)" }}>vs</span> {f.fighters[1]}
              </span>
              <span className="truncate font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
                Pick {f.moneyline.modelPick} {pct(f.moneyline.modelProbability)} ({am(f.moneyline.oddsPrice)}) · winner <span style={{ color: "var(--vault-text-mute)" }}>{f.officialWinner}</span> by {f.result === "decision" ? "decision" : `finish R${f.endRound} ${f.time}`}
              </span>
            </div>
            <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.08em]" style={{ color: f.moneyline.result === "win" ? "var(--vault-success)" : "var(--vault-danger)", background: f.moneyline.result === "win" ? "rgba(110,231,168,0.14)" : "rgba(240,138,138,0.14)" }}>
              {f.moneyline.result.toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      {/* Suggested cards */}
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)" }}>Suggested cards · {s.suggestedCards.record}</span>
        {s.suggestedCards.cards.map((c, i) => (
          <div key={i} className="rounded-[8px] px-3 py-2.5" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold" style={{ color: "var(--vault-text)" }}>{c.riskLabel} <span style={{ color: "var(--vault-text-faint)", fontWeight: 400 }}>· {c.legCount} legs</span></span>
              <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.08em]" style={{ color: c.result === "won" ? "var(--vault-success)" : "var(--vault-danger)", background: c.result === "won" ? "rgba(110,231,168,0.14)" : "rgba(240,138,138,0.14)" }}>{c.result.toUpperCase()}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {c.legs.map((l, j) => (
                <span key={j} className="font-mono text-[10px] rounded px-1.5 py-0.5" style={{ color: l.result === "win" ? "var(--vault-success)" : "var(--vault-danger)", border: "1px solid var(--vault-rule)", background: "rgba(12,8,6,0.5)" }}>
                  {l.fighter} {l.result === "win" ? "✓" : "✕"}
                </span>
              ))}
            </div>
            {c.bustedBy.length ? <span className="mt-1 block font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>Busted by: {c.bustedBy.join(", ")}</span> : null}
          </div>
        ))}
      </div>

      <p className="font-mono text-[9.5px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
        Settled from {s.source}. {s.sourceNote} Expanded model-only props graded for calibration only — no betting P&L. Paper-only educational tracking.
      </p>
    </div>
  );
}
