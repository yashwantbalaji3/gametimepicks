/**
 * ProjectionAccuracySummary — the lead block on /results.
 *
 * WHY: parlay (card) hit rate is naturally low — every leg must hit — so leading
 * with it understates the model. The cleaner read on model quality is the
 * LEG-LEVEL projection hit rate: how often the model's individual leaned pick
 * (Over/Under vs the line) is graded a win on a settled slate. This block leads
 * with that, by sport, sourced ONLY from settled `lifetime_summary.json`
 * (results/ = NBA, mlb/results/ = MLB) — never pregame, never fabricated.
 *
 * Honesty contract: pushes/voids are excluded from the denominator by the loader
 * (we render decisive wins/decisive only); a sport with too little settled data
 * shows "not enough settled data" rather than a fake number; the >50% positive
 * state is purely visual and only reflects the real number.
 */

export interface ProjAccuracyRecord {
  wins: number;
  losses: number;
  decisive: number;
  hitRate: number | null; // wins / decisive, pushes excluded
}

const MIN_DECISIVE = 30; // below this we say "not enough settled data"

function ratePct(r: ProjAccuracyRecord | null): number | null {
  if (!r || r.decisive < MIN_DECISIVE) return null;
  if (r.hitRate != null) return r.hitRate * 100;
  return r.decisive > 0 ? (r.wins / r.decisive) * 100 : null;
}

export interface ProjectionAccuracySummaryProps {
  overall: ProjAccuracyRecord | null;
  mlb: ProjAccuracyRecord | null;
  nba: ProjAccuracyRecord | null;
  /** Public-tracking era start, for the honesty footnote. */
  eraStart?: string;
}

export default function ProjectionAccuracySummary({
  overall,
  mlb,
  nba,
  eraStart,
}: ProjectionAccuracySummaryProps) {
  const mlbPct = ratePct(mlb);
  const nbaPct = ratePct(nba);
  const bothAbove50 = mlbPct != null && nbaPct != null && mlbPct > 50 && nbaPct > 50;

  return (
    <section aria-label="Model projection accuracy" className="flex flex-col gap-3 max-w-5xl">
      <div className="flex flex-col gap-1">
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
        >
          Model quality
        </span>
        <h2
          className="font-display tracking-tight m-0"
          style={{ color: "var(--vault-text)", fontSize: "clamp(20px, 3vw, 28px)", lineHeight: 1.1, fontWeight: 600 }}
        >
          Model Projection Accuracy
        </h2>
        <p className="text-[12px] leading-snug" style={{ color: "var(--vault-text-faint)", maxWidth: 620 }}>
          Individual picks are graded leg-by-leg against the line on settled
          slates. This is the cleaner read on the model — parlays are higher
          variance (see below).
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <AccuracyCard label="Overall projection hit rate" record={overall} emphasis />
        <AccuracyCard label="MLB projections" record={mlb} />
        <AccuracyCard label="NBA projections" record={nba} />
      </div>

      {bothAbove50 && (
        <p
          className="font-mono leading-snug m-0"
          style={{ color: "var(--vault-success, #4ade80)", fontSize: 12, maxWidth: 620 }}
        >
          ↑ Individual projections are clearing 50% on settled slates in both MLB
          and NBA.
        </p>
      )}
      <p
        className="font-mono leading-snug m-0"
        style={{ color: "var(--vault-text-faint)", fontSize: 11, maxWidth: 620 }}
      >
        Leg-level accuracy across settled slates{eraStart ? ` since ${eraStart}` : ""}.
        Pushes and voids are excluded from the denominator. Not a profit or
        guarantee claim.
      </p>
    </section>
  );
}

function AccuracyCard({
  label,
  record,
  emphasis = false,
}: {
  label: string;
  record: ProjAccuracyRecord | null;
  emphasis?: boolean;
}) {
  const pct = ratePct(record);
  const enough = pct != null;
  const positive = enough && pct > 50;
  return (
    <div
      aria-label={label}
      className="flex flex-col gap-1 rounded-[8px] px-3.5 py-3"
      style={{
        background: "var(--gtp-card)",
        border: positive
          ? "1px solid var(--vault-success, #4ade80)"
          : emphasis
            ? "1px solid var(--vault-gold-bright)"
            : "1px solid var(--vault-rule)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        {label}
      </span>
      {enough ? (
        <>
          <span
            className="font-display tabular"
            style={{
              color: positive ? "var(--vault-success, #4ade80)" : "var(--vault-text)",
              fontSize: 26,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {pct.toFixed(1)}%
          </span>
          <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
            {record!.wins.toLocaleString()} of {record!.decisive.toLocaleString()} picks hit
            {positive ? " · above 50%" : ""}
          </span>
        </>
      ) : (
        <>
          <span
            className="font-display"
            style={{ color: "var(--vault-text-faint)", fontSize: 16, fontWeight: 600, lineHeight: 1.1 }}
          >
            Not enough settled data
          </span>
          <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 12 }}>
            {record && record.decisive > 0 ? `${record.decisive} graded so far` : "—"}
          </span>
        </>
      )}
    </div>
  );
}
