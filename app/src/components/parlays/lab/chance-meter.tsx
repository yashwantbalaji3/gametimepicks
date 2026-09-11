"use client";
/**
 * CHANCE METER (P260 · Parlay Lab 2.0) — the chance a card's price implies, beside how often cards at
 * the same risk level have actually landed.
 *
 * The first number is arithmetic on the price (1 / decimal odds) and includes the sportsbook's margin.
 * The second is a completed record: decided cards at this level and how many won. They share one
 * scale on purpose — whichever the eye lands on first, the other is already beside it.
 */
interface Props {
  readonly decimal: number | null;
  readonly record: { readonly wins: number; readonly losses: number } | null;
  /** First graded day of the record, so the sample is named rather than implied. */
  readonly since: string | null;
}

const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
const oneIn = (v: number) => (v > 0 ? `about 1 in ${(1 / v).toFixed(1).replace(/\.0$/, "")}` : "");
const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Bar({ label, value, sub, fill, order }: { label: string; value: number; sub: string; fill: string; order: number }) {
  return (
    <div className="flex flex-col gap-1">
      {/* WRAPS AS A BLOCK, NOT A COLUMN OF WORDS. In the builder's betslip the container is ~200px, and
          a nowrap value beside a flex label squeezed the label to one word per line. Wrapping lets the
          value drop to its own line and gives the label the full width. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span style={{ color: "var(--vault-text-mute)", fontSize: 12.5, flex: "1 1 auto", minWidth: 0 }}>{label}</span>
        <span className="font-mono tabular-nums whitespace-nowrap shrink-0" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>
          {pct(value)}{" "}
          <span style={{ color: "var(--vault-text-faint)", fontSize: 11, fontWeight: 400 }}>· {oneIn(value)}</span>
        </span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--vault-wash-faint)", border: "1px solid var(--vault-rule)" }}>
        <div
          className="gtp-meter-fill h-full rounded-full"
          style={{ width: `${Math.max(1.5, Math.min(100, value * 100))}%`, background: fill, animationDelay: `${order * 180}ms` }}
        />
      </div>
      <span style={{ color: "var(--vault-text-faint)", fontSize: 11, lineHeight: 1.5 }}>{sub}</span>
    </div>
  );
}

export default function ChanceMeter({ decimal, record, since }: Props) {
  const implied = decimal != null && decimal > 1 ? 1 / decimal : null;
  if (implied == null) return null;
  const decided = record ? record.wins + record.losses : 0;
  const actual = record && decided > 0 ? record.wins / decided : null;

  return (
    <div className="flex flex-col gap-3" role="group" aria-label="How often a card like this lands">
      <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
        Chance it lands
      </span>
      <Bar
        order={0}
        label="What the price implies"
        value={implied}
        fill="var(--vault-text-mute)"
        sub="Arithmetic on the odds, which include the sportsbook's margin."
      />
      {actual != null && record ? (
        <Bar
          order={1}
          label="What this risk level has actually done"
          value={actual}
          fill="var(--vault-gold-bright)"
          sub={`${record.wins} of ${decided} decided cards at this level landed${since ? ` since ${fmtDate(since)}` : ""}.`}
        />
      ) : (
        <span style={{ color: "var(--vault-text-faint)", fontSize: 12 }}>No decided cards at this level yet.</span>
      )}
      {actual != null ? (
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.55 }}>
          {actual < implied
            ? "Cards at this level have landed less often than their prices implied."
            : "Cards at this level have landed at least as often as their prices implied — on a sample this size, that can be luck."}
        </p>
      ) : null}
    </div>
  );
}
