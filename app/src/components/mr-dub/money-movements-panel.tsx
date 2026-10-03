/**
 * Money movements (Session 8 · A) — the protected bankroll, its historical peak, the difference, open
 * exposure, and the most recent official movements, each attributed to its card. Every figure comes from
 * lib/mr-dub/money-movements.mjs, which reconciles card by card before anything renders; when it does not
 * reconcile, the panel says so and prints no numbers.
 *
 * Factual language only: "Historical peak" and "Difference" — never a target, a recovery, or an amount to win.
 */
import SectionHeader from "@/components/section-header";

export interface MoneyMovementRow {
  movementId: string; date: string; product: string; lane: string | null; step: number | null;
  stake: number; return: number; economicPnl: number | null; bankrollDelta: number; bankrollAfter: number; result: string;
  kind?: string; // "ladder_completed" = a completed run banked under C1 (final value − seed)
}
export interface MoneyMovementsView {
  ok: boolean;
  currentBankroll: number; peak: number; peakDate: string | null; deltaToPeak: number; openExposure: number;
  rows: MoneyMovementRow[]; totalRows: number; foldedThrough: string | null;
}

const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n: number) => (n > 0 ? `+${usd(n)}` : n === 0 ? "$0.00" : usd(n));
const PRODUCT: Record<string, string> = { "bank-builder": "Bank Builder", moonshot: "Moonshot" };
const RESULT: Record<string, string> = { WIN: "Won", LOSS: "Lost", PUSH: "Push", VOID: "Void" };

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ border: "1px solid var(--vault-border)", background: "var(--vault-wash-faint)" }}>
      <div className="font-mono uppercase tracking-[0.1em] text-[10px]" style={{ color: "var(--vault-text-mute)" }}>{label}</div>
      <div className="mt-0.5 font-mono tabular-nums text-[17px] font-semibold" style={{ color: "var(--vault-text)" }}>{value}</div>
      {sub ? <div className="text-[11px]" style={{ color: "var(--vault-text-faint)" }}>{sub}</div> : null}
    </div>
  );
}

export default function MoneyMovementsPanel({ view }: { view: MoneyMovementsView }) {
  return (
    <section aria-labelledby="money-movements">
      <SectionHeader
        eyebrow="Official money · card by card"
        title="Money movements"
        sub="Every change to the protected bankroll, with the card that caused it. Since July a lost step costs its seed ($100 Bank Builder, $25 Moonshot) and a won step rolls its whole payout into the next rung without moving the bankroll — so a ticket's own result and the bankroll's change are shown separately."
      />
      {!view.ok ? (
        <p className="mt-2 text-[13px]" role="status" style={{ color: "var(--vault-warn)" }}>
          The money movements do not reconcile with the protected record right now, so no figures are shown here. The record itself is unchanged.
        </p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" id="money-movements">
            <Tile label="Current bankroll" value={usd(view.currentBankroll)} sub={view.foldedThrough ? `settled through ${view.foldedThrough}` : undefined} />
            <Tile label="Historical peak" value={usd(view.peak)} sub={view.peakDate ? `on ${view.peakDate}` : undefined} />
            <Tile label="Difference" value={usd(view.deltaToPeak)} sub="current minus peak" />
            <Tile label="Open exposure" value={usd(view.openExposure)} sub="placed, not yet settled" />
          </div>
          <h3 className="mt-4 font-mono uppercase tracking-[0.1em] text-[11px]" style={{ color: "var(--vault-text-mute)" }}>
            Recent movements · {view.rows.length} of {view.totalRows}
          </h3>
          <ul className="mt-1.5 flex flex-col" style={{ borderTop: "1px solid var(--vault-rule)" }}>
            {view.rows.map((m) => (
              <li key={m.movementId} className="flex flex-col gap-0.5 py-2 text-[12.5px]" style={{ borderBottom: "1px solid var(--vault-rule)" }}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0" style={{ color: "var(--vault-text)" }}>
                    <span className="font-mono tabular-nums mr-2" style={{ color: "var(--vault-text-mute)" }}>{m.date}</span>
                    {PRODUCT[m.product] ?? m.product}{m.lane ? ` · ${m.lane === "crown" ? "Crown ladder" : `Lane ${m.lane}`}` : ""}{m.step != null ? ` · Step ${m.step}` : ""} · {m.kind === "ladder_completed" ? "Completed the ladder · banked final value − seed" : RESULT[m.result] ?? m.result}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums" style={{ color: "var(--vault-text)" }}>{usd(m.bankrollAfter)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 font-mono tabular-nums text-[11.5px]">
                  <span style={{ color: "var(--vault-text-faint)" }}>stake {usd(m.stake)} → {usd(m.return)}</span>
                  <span className="shrink-0" style={{ color: m.bankrollDelta < 0 ? "var(--vault-warn)" : m.bankrollDelta > 0 ? "var(--vault-success)" : "var(--vault-text-mute)" }}>
                    bankroll {signed(m.bankrollDelta)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
            Paper-only tracking; no wagers are placed. Shadow and research cards never appear here — only cards that were officially placed and settled.
          </p>
        </>
      )}
    </section>
  );
}
